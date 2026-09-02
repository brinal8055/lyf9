import { randomUUID } from "crypto";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterEach, describe, expect, it } from "vitest";

import { createSupabaseAtomicWorkflowProvider } from ".";

const liveEnabled = process.env.RUN_LIVE_SUPABASE_WORKFLOW === "true";
const describeLive = liveEnabled ? describe : describe.skip;
const guardEnvNames = [
  "APP_ENV",
  "NEXT_PUBLIC_SUPABASE_URL",
  "STAGING_SUPABASE_PROJECT_REF",
  "SUPABASE_SERVICE_ROLE_KEY"
] as const;
const originalGuardEnv = Object.fromEntries(guardEnvNames.map((name) => [name, process.env[name]]));

afterEach(() => {
  for (const name of guardEnvNames) {
    const value = originalGuardEnv[name];
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
});

describe("staging workflow target guard", () => {
  it("refuses a production runtime", () => {
    setValidGuardEnv();
    process.env.APP_ENV = "production";
    expect(getLiveEnv).toThrow("APP_ENV=staging");
  });

  it("refuses a Supabase URL that does not match the staging project", () => {
    setValidGuardEnv();
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://production-ref.supabase.co";
    expect(getLiveEnv).toThrow("does not match STAGING_SUPABASE_PROJECT_REF");
  });
});

describeLive("live Supabase workflow concurrency and recovery", () => {
  it("claims atomically, respects retry timing, recovers leases, and audits safely", async () => {
    const env = getLiveEnv();
    const service = createClient(env.supabaseUrl, env.serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    });
    const authenticatedGateway = createClient(env.supabaseUrl, env.serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    });
    const workflow = createSupabaseAtomicWorkflowProvider();
    const suffix = `${Date.now()}-${randomUUID().slice(0, 8)}`;
    const email = `lyf9-staging-workflow-${suffix}@lyf9.ai`;
    const jobIds: string[] = [];
    let userId: string | null = null;

    try {
      const createdUser = await service.auth.admin.createUser({
        email,
        email_confirm: true,
        password: `Workflow-${suffix}!`,
        user_metadata: { full_name: "Synthetic Workflow User" }
      });
      throwIfError(createdUser.error);
      userId = createdUser.data.user?.id ?? null;
      if (!userId) throw new Error("Synthetic staging workflow user was not created.");

      const signedIn = await authenticatedGateway.auth.signInWithPassword({
        email,
        password: `Workflow-${suffix}!`
      });
      throwIfError(signedIn.error);
      const authenticatedRelease = await authenticatedGateway.rpc("release_expired_processing_locks", {
        p_now: new Date().toISOString()
      });
      expect(authenticatedRelease.error).toBeTruthy();

      const reportFile = await insertRow(service, "report_files", {
        file_size_bytes: 64,
        mime_type: "application/pdf",
        original_filename: "synthetic-workflow-verification.pdf",
        scan_status: "scan_passed",
        status: "scan_passed",
        storage_bucket: "synthetic-workflow-verification",
        storage_key: `synthetic/workflow/${suffix}.pdf`,
        storage_provider: "synthetic",
        user_id: userId
      });
      const labReport = await insertRow(service, "lab_reports", {
        report_file_id: reportFile.id,
        status: "processing",
        user_id: userId
      });

      const baseNow = new Date();
      const initialNow = baseNow.toISOString();
      const firstQueued = await createJob(service, jobIds, {
        labReportId: labReport.id,
        name: "queued-a",
        now: initialNow,
        reportFileId: reportFile.id,
        suffix,
        userId
      });
      const secondQueued = await createJob(service, jobIds, {
        labReportId: labReport.id,
        name: "queued-b",
        now: initialNow,
        reportFileId: reportFile.id,
        suffix,
        userId
      });
      const futureRetry = await createJob(service, jobIds, {
        labReportId: labReport.id,
        name: "future-retry",
        nextRunAt: addSeconds(baseNow, 3_600),
        now: initialNow,
        reportFileId: reportFile.id,
        status: "retry_scheduled",
        suffix,
        userId
      });

      const initialClaims = await Promise.all([
        workflow.claimNextJob({ leaseSeconds: 300, now: initialNow, workerId: "staging-worker-a" }),
        workflow.claimNextJob({ leaseSeconds: 300, now: initialNow, workerId: "staging-worker-b" }),
        workflow.claimNextJob({ leaseSeconds: 300, now: initialNow, workerId: "staging-worker-c" })
      ]);
      const claimed = initialClaims.filter((job) => job !== null);
      expect(claimed).toHaveLength(2);
      expect(new Set(claimed.map((job) => job.id))).toEqual(
        new Set([firstQueued.id, secondQueued.id])
      );
      expect(initialClaims.filter((job) => job === null)).toHaveLength(1);
      expect(claimed.every((job) => job.status === "running" && job.attemptCount === 1)).toBe(true);

      const noFutureClaim = await workflow.claimNextJob({
        leaseSeconds: 300,
        now: addSeconds(baseNow, 1),
        workerId: "staging-worker-future-guard"
      });
      expect(noFutureClaim).toBeNull();

      const expiredRetry = await createJob(service, jobIds, {
        attemptCount: 1,
        labReportId: labReport.id,
        lockedBy: "stale-worker-retry",
        lockedUntil: addSeconds(baseNow, -60),
        name: "expired-retry",
        now: initialNow,
        reportFileId: reportFile.id,
        status: "running",
        suffix,
        userId
      });
      const expiredFailed = await createJob(service, jobIds, {
        attemptCount: 3,
        labReportId: labReport.id,
        lockedBy: "stale-worker-failed",
        lockedUntil: addSeconds(baseNow, -60),
        maxAttempts: 3,
        name: "expired-failed",
        now: initialNow,
        reportFileId: reportFile.id,
        status: "running",
        suffix,
        userId
      });
      await Promise.all([
        createRunningStep(service, expiredRetry.id, "stale-worker-retry", addSeconds(baseNow, -60)),
        createRunningStep(service, expiredFailed.id, "stale-worker-failed", addSeconds(baseNow, -60))
      ]);

      expect(await workflow.releaseExpiredLocks({ now: addSeconds(baseNow, 2) })).toBe(2);

      const recoveredRows = await fetchJobs(service, [expiredRetry.id, expiredFailed.id]);
      expect(recoveredRows.get(expiredRetry.id)).toMatchObject({
        error_code: "lock_expired",
        locked_by: null,
        locked_until: null,
        status: "retry_scheduled",
        worker_id: null
      });
      expect(recoveredRows.get(expiredFailed.id)).toMatchObject({
        error_code: "lock_expired_max_attempts",
        locked_by: null,
        locked_until: null,
        status: "failed",
        worker_id: null
      });

      const recoveredSteps = await fetchSteps(service, [expiredRetry.id, expiredFailed.id]);
      expect(recoveredSteps.get(expiredRetry.id)).toMatchObject({
        error_code: "lock_expired",
        locked_by: null,
        locked_until: null,
        status: "retry_scheduled"
      });
      expect(recoveredSteps.get(expiredFailed.id)).toMatchObject({
        error_code: "lock_expired_max_attempts",
        locked_by: null,
        locked_until: null,
        status: "failed"
      });

      const recoveredClaim = await workflow.claimNextJob({
        leaseSeconds: 300,
        now: addSeconds(baseNow, 3),
        workerId: "staging-worker-recovery"
      });
      expect(recoveredClaim).toMatchObject({
        attemptCount: 2,
        id: expiredRetry.id,
        lockedBy: "staging-worker-recovery",
        status: "running"
      });

      const runningStep = await workflow.runJobStep({
        jobId: expiredRetry.id,
        now: addSeconds(baseNow, 4),
        stepName: "malware_scan",
        workerId: "staging-worker-recovery"
      });
      expect(runningStep).toMatchObject({ attemptCount: 2, status: "running" });
      await workflow.markStepFailed({
        errorCode: "synthetic_retry",
        errorMessage: "Synthetic retry verification.",
        jobId: expiredRetry.id,
        now: addSeconds(baseNow, 5),
        retryable: true,
        stepName: "malware_scan"
      });
      const retryAt = addSeconds(baseNow, 65);
      await workflow.scheduleRetry({
        jobId: expiredRetry.id,
        nextRunAt: retryAt,
        now: addSeconds(baseNow, 6),
        reason: "synthetic_retry",
        stepName: "malware_scan"
      });

      expect(await workflow.claimNextJob({
        leaseSeconds: 300,
        now: addSeconds(baseNow, 64),
        workerId: "staging-worker-too-early"
      })).toBeNull();
      expect(await workflow.claimNextJob({
        leaseSeconds: 300,
        now: retryAt,
        workerId: "staging-worker-after-backoff"
      })).toMatchObject({
        attemptCount: 3,
        id: expiredRetry.id,
        lockedBy: "staging-worker-after-backoff"
      });

      const futureRow = await fetchJobs(service, [futureRetry.id]);
      expect(futureRow.get(futureRetry.id)).toMatchObject({
        attempt_count: 0,
        status: "retry_scheduled"
      });

      const audit = await service
        .from("audit_logs")
        .select("action, actor_role, actor_user_id, metadata, resource_id")
        .in("resource_id", jobIds);
      throwIfError(audit.error);
      const auditRows = audit.data ?? [];
      expect(auditRows.filter((row) => row.action === "processing_job_claimed").length).toBe(4);
      expect(auditRows.some((row) => row.action === "processing_job_lock_expired")).toBe(true);
      expect(auditRows.some((row) => row.action === "processing_job_failed")).toBe(true);
      expect(auditRows.some((row) => row.action === "processing_job_retry_scheduled")).toBe(true);
      expect(auditRows.every((row) => row.actor_user_id === null && row.actor_role === null)).toBe(true);
      expect(auditRows.every((row) => !JSON.stringify(row.metadata).includes(email))).toBe(true);
    } finally {
      await cleanupFixture(service, userId, jobIds);
    }
  }, 120_000);
});

type CreateJobInput = {
  attemptCount?: number;
  labReportId: string;
  lockedBy?: string;
  lockedUntil?: string;
  maxAttempts?: number;
  name: string;
  nextRunAt?: string;
  now: string;
  reportFileId: string;
  status?: "queued" | "retry_scheduled" | "running";
  suffix: string;
  userId: string;
};

async function createJob(service: SupabaseClient, jobIds: string[], input: CreateJobInput) {
  const row = await insertRow(service, "processing_jobs", {
    attempt_count: input.attemptCount ?? 0,
    current_state: "scan_passed",
    current_step: "malware_scan",
    idempotency_key: `workflow-${input.suffix}-${input.name}`,
    job_type: "report_processing",
    lab_report_id: input.labReportId,
    locked_by: input.lockedBy ?? null,
    locked_until: input.lockedUntil ?? null,
    max_attempts: input.maxAttempts ?? 3,
    metadata: { syntheticVerification: true },
    next_run_at: input.nextRunAt ?? null,
    processing_version: "staging_workflow_verification_v1",
    queued_at: input.now,
    report_file_id: input.reportFileId,
    status: input.status ?? "queued",
    user_id: input.userId,
    worker_id: input.lockedBy ?? null
  });
  jobIds.push(row.id);
  return row;
}

function createRunningStep(
  service: SupabaseClient,
  jobId: string,
  lockedBy: string,
  lockedUntil: string
) {
  return insertRow(service, "processing_job_steps", {
    attempt_count: 1,
    attempt_number: 1,
    job_id: jobId,
    locked_by: lockedBy,
    locked_until: lockedUntil,
    processing_job_id: jobId,
    state: "malware_scan",
    status: "running",
    step_key: "malware_scan",
    step_name: "malware_scan"
  });
}

async function fetchJobs(service: SupabaseClient, jobIds: string[]) {
  const result = await service.from("processing_jobs").select("*").in("id", jobIds);
  throwIfError(result.error);
  return new Map((result.data ?? []).map((row) => [row.id, row]));
}

async function fetchSteps(service: SupabaseClient, jobIds: string[]) {
  const result = await service
    .from("processing_job_steps")
    .select("*")
    .in("processing_job_id", jobIds);
  throwIfError(result.error);
  return new Map((result.data ?? []).map((row) => [row.processing_job_id, row]));
}

async function insertRow(service: SupabaseClient, table: string, values: Record<string, unknown>) {
  const result = await service.from(table).insert(values).select("*").single();
  throwIfError(result.error);
  return result.data as Record<string, unknown> & { id: string };
}

async function cleanupFixture(
  service: SupabaseClient,
  userId: string | null,
  jobIds: string[]
) {
  if (jobIds.length > 0) {
    const auditDelete = await service.from("audit_logs").delete().in("resource_id", jobIds);
    throwIfError(auditDelete.error);
  }
  if (userId) {
    const deletedUser = await service.auth.admin.deleteUser(userId);
    throwIfError(deletedUser.error);
  }
}

function getLiveEnv() {
  if (process.env.APP_ENV !== "staging") {
    throw new Error("Live workflow verification requires APP_ENV=staging.");
  }
  const projectRef = requiredEnv("STAGING_SUPABASE_PROJECT_REF");
  const supabaseUrl = requiredEnv("NEXT_PUBLIC_SUPABASE_URL");
  const serviceRoleKey = requiredEnv("SUPABASE_SERVICE_ROLE_KEY");
  if (new URL(supabaseUrl).origin !== `https://${projectRef}.supabase.co`) {
    throw new Error("Refusing live workflow verification because Supabase URL does not match STAGING_SUPABASE_PROJECT_REF.");
  }
  return { serviceRoleKey, supabaseUrl };
}

function requiredEnv(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required live workflow env: ${name}`);
  return value;
}

function addSeconds(date: Date, seconds: number) {
  return new Date(date.getTime() + seconds * 1_000).toISOString();
}

function throwIfError(error: { message: string } | null) {
  if (error) throw new Error(error.message);
}

function setValidGuardEnv() {
  process.env.APP_ENV = "staging";
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://staging-ref.supabase.co";
  process.env.STAGING_SUPABASE_PROJECT_REF = "staging-ref";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "synthetic-service-role";
}
