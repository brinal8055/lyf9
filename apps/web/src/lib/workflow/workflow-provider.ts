import { randomUUID } from "crypto";

import { createSupabaseServiceClient } from "../auth/providers/supabase-server";
import { writeSupabaseAuditLog } from "../auth/supabase-auth";
import type {
  AuditLogRecord,
  ProcessingJobRecord,
  ProcessingJobState,
  ProcessingJobStepRecord,
  ProcessingStepName,
  ReportStore
} from "../reports/types";

type DbRow = Record<string, unknown>;

export const PIPELINE_STEPS: ProcessingStepName[] = [
  "malware_scan",
  "classify_report",
  "extract_document",
  "ocr_fallback",
  "extract_biomarkers",
  "normalize_biomarkers",
  "validate_biomarkers",
  "run_safety_rules",
  "generate_patient_explanation",
  "route_review",
  "publish_result"
];

export type WorkflowProvider = {
  enqueueReportProcessing(params: EnqueueReportProcessingParams): Promise<ProcessingJobRecord>;
  claimNextJob(params: ClaimNextJobParams): Promise<ProcessingJobRecord | null>;
  runJobStep(params: RunJobStepParams): Promise<ProcessingJobStepRecord>;
  markStepSucceeded(params: MarkStepSucceededParams): Promise<ProcessingJobStepRecord>;
  markStepFailed(params: MarkStepFailedParams): Promise<ProcessingJobStepRecord>;
  scheduleRetry(params: ScheduleRetryParams): Promise<ProcessingJobRecord>;
  markJobBlocked(params: MarkJobBlockedParams): Promise<ProcessingJobRecord>;
  markJobCompleted(params: MarkJobCompletedParams): Promise<ProcessingJobRecord>;
  releaseExpiredLocks(params: ReleaseExpiredLocksParams): Promise<number>;
  getJobStatus(jobId: string): Promise<ProcessingJobRecord | null>;
};

export type EnqueueReportProcessingParams = {
  idempotencyKey: string;
  jobType: "report_processing";
  labReportId: string;
  processingVersion: string;
  reportFileId: string;
  userId: string;
};

export type ClaimNextJobParams = {
  leaseSeconds: number;
  now: string;
  workerId: string;
};

export type RunJobStepParams = {
  jobId: string;
  stepName: ProcessingStepName;
  workerId: string;
  inputSnapshot?: Record<string, unknown>;
  now?: string;
};

export type MarkStepSucceededParams = {
  jobId: string;
  outputSnapshot?: Record<string, unknown>;
  stepName: ProcessingStepName;
  now?: string;
};

export type MarkStepFailedParams = {
  errorCode: string;
  errorMessage: string;
  jobId: string;
  retryable: boolean;
  stepName: ProcessingStepName;
  now?: string;
};

export type ScheduleRetryParams = {
  jobId: string;
  nextRunAt: string;
  reason: string;
  stepName: ProcessingStepName;
  now?: string;
};

export type MarkJobBlockedParams = {
  errorCode?: string;
  jobId: string;
  reason: string;
  stepName?: ProcessingStepName;
  now?: string;
};

export type MarkJobCompletedParams = {
  jobId: string;
  now?: string;
};

export type ReleaseExpiredLocksParams = {
  now: string;
};

export function createSupabaseAtomicWorkflowProvider(): WorkflowProvider {
  return {
    async enqueueReportProcessing() {
      throw new Error("supabase_workflow_enqueue_uses_upload_repository");
    },
    async claimNextJob(params) {
      return claimNextSupabaseJob(params);
    },
    async runJobStep() {
      throw new Error("supabase_workflow_step_runner_not_configured");
    },
    async markStepSucceeded() {
      throw new Error("supabase_workflow_step_runner_not_configured");
    },
    async markStepFailed() {
      throw new Error("supabase_workflow_step_runner_not_configured");
    },
    async scheduleRetry() {
      throw new Error("supabase_workflow_step_runner_not_configured");
    },
    async markJobBlocked() {
      throw new Error("supabase_workflow_step_runner_not_configured");
    },
    async markJobCompleted() {
      throw new Error("supabase_workflow_step_runner_not_configured");
    },
    async releaseExpiredLocks(params) {
      return releaseExpiredSupabaseLocks(params);
    },
    async getJobStatus(jobId) {
      const serviceClient = createSupabaseServiceClient();
      const { data, error } = await serviceClient.from("processing_jobs").select("*").eq("id", jobId).maybeSingle();
      if (error) {
        throw new Error(error.message);
      }
      return data ? toProcessingJob(data as DbRow) : null;
    }
  };
}

export function createDatabaseWorkflowProvider(store: ReportStore): WorkflowProvider {
  return {
    async enqueueReportProcessing(params) {
      return enqueueReportProcessing(store, params);
    },
    async claimNextJob(params) {
      return claimNextJob(store, params);
    },
    async runJobStep(params) {
      return runJobStep(store, params);
    },
    async markStepSucceeded(params) {
      return markStepSucceeded(store, params);
    },
    async markStepFailed(params) {
      return markStepFailed(store, params);
    },
    async scheduleRetry(params) {
      return scheduleRetry(store, params);
    },
    async markJobBlocked(params) {
      return markJobBlocked(store, params);
    },
    async markJobCompleted(params) {
      return markJobCompleted(store, params);
    },
    async releaseExpiredLocks(params) {
      return releaseExpiredLocks(store, params);
    },
    async getJobStatus(jobId) {
      return store.processingJobs.find((job) => job.id === jobId) ?? null;
    }
  };
}

export function getBackoffNextRunAt(attemptCount: number, now = new Date()) {
  const minutes = attemptCount <= 1 ? 0 : attemptCount === 2 ? 1 : 5;
  return new Date(now.getTime() + minutes * 60 * 1000).toISOString();
}

function enqueueReportProcessing(store: ReportStore, params: EnqueueReportProcessingParams) {
  const existing = store.processingJobs.find(
    (job) => job.idempotencyKey === params.idempotencyKey && job.status !== "cancelled"
  );

  if (existing) {
    return existing;
  }

  const now = new Date().toISOString();
  const job: ProcessingJobRecord = {
    attemptCount: 0,
    completedAt: null,
    createdAt: now,
    currentState: "scan_pending",
    currentStep: "malware_scan",
    errorCode: null,
    errorMessage: null,
    failedAt: null,
    id: randomUUID(),
    idempotencyKey: params.idempotencyKey,
    jobType: params.jobType,
    labReportId: params.labReportId,
    lockedBy: null,
    lockedUntil: null,
    maxAttempts: workerMaxAttempts(),
    metadata: { processingVersion: params.processingVersion },
    nextRunAt: null,
    priority: 0,
    processingVersion: params.processingVersion,
    queuedAt: now,
    reportFileId: params.reportFileId,
    startedAt: null,
    status: "queued",
    updatedAt: now,
    userId: params.userId,
    workerId: null
  };
  store.processingJobs.push(job);
  ensureStep(store, job, "malware_scan", now);
  addAudit(store, "processing_job_created", job, { firstStep: "malware_scan" });
  return job;
}

function claimNextJob(store: ReportStore, params: ClaimNextJobParams) {
  assertLocalBestEffortClaimAllowed();
  releaseExpiredLocks(store, { now: params.now });
  const nowMs = Date.parse(params.now);
  const job = store.processingJobs
    .filter((candidate) => ["queued", "retry_scheduled"].includes(candidate.status))
    .filter((candidate) => !candidate.lockedUntil || Date.parse(candidate.lockedUntil) < nowMs)
    .filter((candidate) => !candidate.nextRunAt || Date.parse(candidate.nextRunAt) <= nowMs)
    .sort((a, b) => b.priority - a.priority || a.createdAt.localeCompare(b.createdAt))[0];

  if (!job) {
    return null;
  }

  job.status = "running";
  job.lockedBy = params.workerId;
  job.lockedUntil = new Date(nowMs + params.leaseSeconds * 1000).toISOString();
  job.startedAt = job.startedAt ?? params.now;
  job.attemptCount += 1;
  job.updatedAt = params.now;
  job.workerId = params.workerId;
  addAudit(store, "processing_job_claimed", job, {
    lockedBy: params.workerId,
    lockedUntil: job.lockedUntil
  });
  return job;
}

function runJobStep(store: ReportStore, params: RunJobStepParams) {
  const now = params.now ?? new Date().toISOString();
  const job = mustFindJob(store, params.jobId);
  const step = ensureStep(store, job, params.stepName, now);

  if (step.status === "completed") {
    return step;
  }

  step.status = "running";
  step.startedAt = step.startedAt ?? now;
  step.updatedAt = now;
  step.lockedBy = params.workerId;
  step.lockedUntil = job.lockedUntil;
  step.attemptCount += 1;
  step.attemptNumber = step.attemptCount;
  step.inputSnapshot = params.inputSnapshot ?? step.inputSnapshot;
  step.safeInputSummary = params.inputSnapshot ?? step.safeInputSummary;
  job.currentStep = params.stepName;
  job.status = "running";
  job.updatedAt = now;
  addAudit(store, "processing_job_step_started", job, { attemptCount: step.attemptCount, stepName: params.stepName });
  return step;
}

function markStepSucceeded(store: ReportStore, params: MarkStepSucceededParams) {
  const now = params.now ?? new Date().toISOString();
  const job = mustFindJob(store, params.jobId);
  const step = ensureStep(store, job, params.stepName, now);
  step.status = "completed";
  step.completedAt = now;
  step.failedAt = null;
  step.errorCode = null;
  step.errorMessage = null;
  step.outputSnapshot = params.outputSnapshot ?? null;
  step.safeOutputSummary = params.outputSnapshot ?? {};
  step.lockedBy = null;
  step.lockedUntil = null;
  step.updatedAt = now;
  addAudit(store, "processing_job_step_completed", job, { stepName: params.stepName });
  return step;
}

function markStepFailed(store: ReportStore, params: MarkStepFailedParams) {
  const now = params.now ?? new Date().toISOString();
  const job = mustFindJob(store, params.jobId);
  const step = ensureStep(store, job, params.stepName, now);
  step.status = "failed";
  step.failedAt = now;
  step.errorCode = params.errorCode;
  step.errorMessage = params.errorMessage;
  step.lockedBy = null;
  step.lockedUntil = null;
  step.updatedAt = now;
  addAudit(store, "processing_job_step_failed", job, {
    errorCode: params.errorCode,
    retryable: params.retryable,
    stepName: params.stepName
  });
  return step;
}

function scheduleRetry(store: ReportStore, params: ScheduleRetryParams) {
  const now = params.now ?? new Date().toISOString();
  const job = mustFindJob(store, params.jobId);
  const step = ensureStep(store, job, params.stepName, now);
  step.status = "retry_scheduled";
  step.lockedBy = null;
  step.lockedUntil = null;
  step.updatedAt = now;
  job.status = "retry_scheduled";
  job.nextRunAt = params.nextRunAt;
  job.lockedBy = null;
  job.lockedUntil = null;
  job.errorCode = "retry_scheduled";
  job.errorMessage = params.reason;
  job.updatedAt = now;
  addAudit(store, "processing_job_retry_scheduled", job, {
    nextRunAt: params.nextRunAt,
    reason: params.reason,
    stepName: params.stepName
  });
  return job;
}

function markJobBlocked(store: ReportStore, params: MarkJobBlockedParams) {
  const now = params.now ?? new Date().toISOString();
  const job = mustFindJob(store, params.jobId);
  job.status = "blocked";
  job.errorCode = params.errorCode ?? "processing_blocked";
  job.errorMessage = params.reason;
  job.failedAt = now;
  job.lockedBy = null;
  job.lockedUntil = null;
  job.nextRunAt = null;
  job.updatedAt = now;
  if (params.stepName) {
    const step = ensureStep(store, job, params.stepName, now);
    step.status = "blocked";
    step.errorCode = job.errorCode;
    step.errorMessage = params.reason;
    step.lockedBy = null;
    step.lockedUntil = null;
    step.updatedAt = now;
  }
  addAudit(store, "processing_job_blocked", job, {
    errorCode: job.errorCode,
    reason: params.reason,
    stepName: params.stepName ?? job.currentStep
  });
  return job;
}

function markJobCompleted(store: ReportStore, params: MarkJobCompletedParams) {
  const now = params.now ?? new Date().toISOString();
  const job = mustFindJob(store, params.jobId);
  job.status = "completed";
  job.completedAt = now;
  job.failedAt = null;
  job.lockedBy = null;
  job.lockedUntil = null;
  job.updatedAt = now;
  addAudit(store, "processing_job_completed", job, { currentStep: job.currentStep });
  return job;
}

function releaseExpiredLocks(store: ReportStore, params: ReleaseExpiredLocksParams) {
  assertLocalBestEffortClaimAllowed();
  const nowMs = Date.parse(params.now);
  let released = 0;

  for (const job of store.processingJobs) {
    if (job.status !== "running" || !job.lockedUntil || Date.parse(job.lockedUntil) >= nowMs) {
      continue;
    }

    const attemptsExceeded = job.attemptCount >= job.maxAttempts;
    job.status = attemptsExceeded ? "failed" : "retry_scheduled";
    job.lockedBy = null;
    job.lockedUntil = null;
    job.nextRunAt = attemptsExceeded ? null : params.now;
    job.errorCode = attemptsExceeded ? "lock_expired_max_attempts" : "lock_expired";
    job.errorMessage = attemptsExceeded
      ? "Processing job lock expired and max attempts were reached."
      : "Processing job lock expired and was scheduled for retry.";
    job.failedAt = attemptsExceeded ? params.now : job.failedAt;
    job.workerId = null;
    job.updatedAt = params.now;
    released += 1;
    addAudit(store, "processing_job_lock_expired", job, {});
    addAudit(store, attemptsExceeded ? "processing_job_failed" : "processing_job_retry_scheduled", job, {
      nextRunAt: job.nextRunAt,
      reason: job.errorCode
    });
  }

  return released;
}

async function claimNextSupabaseJob(params: ClaimNextJobParams) {
  await releaseExpiredSupabaseLocks({ now: params.now });
  const serviceClient = createSupabaseServiceClient();
  const { data, error } = await serviceClient.rpc("claim_next_processing_job", {
    p_lease_seconds: params.leaseSeconds,
    p_now: params.now,
    p_worker_id: params.workerId
  });

  if (error) {
    throw new Error(error.message);
  }

  const row = firstRpcRow(data);
  if (!row) {
    return null;
  }

  const job = toProcessingJob(row);
  await writeWorkflowAudit(job, "processing_job_claimed", {
    lockedBy: params.workerId,
    lockedUntil: job.lockedUntil,
    rpc: "claim_next_processing_job"
  });
  return job;
}

async function releaseExpiredSupabaseLocks(params: ReleaseExpiredLocksParams) {
  const serviceClient = createSupabaseServiceClient();
  const { data, error } = await serviceClient.rpc("release_expired_processing_locks", {
    p_now: params.now
  });

  if (error) {
    throw new Error(error.message);
  }

  const rows = Array.isArray(data) ? (data as DbRow[]) : [];
  for (const row of rows) {
    const job = toProcessingJob(row);
    await writeWorkflowAudit(job, "processing_job_lock_expired", {
      rpc: "release_expired_processing_locks"
    });
    await writeWorkflowAudit(
      job,
      job.status === "failed" ? "processing_job_failed" : "processing_job_retry_scheduled",
      {
        nextRunAt: job.nextRunAt,
        reason: job.errorCode,
        rpc: "release_expired_processing_locks"
      }
    );
  }
  return rows.length;
}

async function writeWorkflowAudit(
  job: ProcessingJobRecord,
  action: AuditLogRecord["action"],
  metadata: Record<string, unknown>
) {
  await writeSupabaseAuditLog({
    action,
    actorRole: "admin",
    actorUserId: job.workerId ?? job.lockedBy ?? "workflow-provider",
    metadata,
    resourceId: job.id,
    resourceType: "processing_job"
  });
}

function firstRpcRow(data: unknown) {
  if (Array.isArray(data)) {
    return data.length > 0 && data[0] && typeof data[0] === "object" ? (data[0] as DbRow) : null;
  }
  return data && typeof data === "object" ? (data as DbRow) : null;
}

function ensureStep(
  store: ReportStore,
  job: ProcessingJobRecord,
  stepName: ProcessingStepName,
  now: string
) {
  const existing = store.processingJobSteps.find(
    (step) => step.processingJobId === job.id && step.stepName === stepName
  );

  if (existing) {
    return existing;
  }

  const step: ProcessingJobStepRecord = {
    attemptCount: 0,
    attemptNumber: 0,
    completedAt: null,
    createdAt: now,
    durationMs: null,
    errorCode: null,
    errorMessage: null,
    failedAt: null,
    id: randomUUID(),
    inputSnapshot: null,
    lockedBy: null,
    lockedUntil: null,
    maxAttempts: workerMaxAttempts(),
    outputSnapshot: null,
    processingJobId: job.id,
    safeInputSummary: {},
    safeOutputSummary: {},
    startedAt: null,
    state: stepNameToState(stepName),
    status: "queued",
    stepKey: stepName,
    stepName,
    updatedAt: now
  };
  store.processingJobSteps.push(step);
  return step;
}

function stepNameToState(stepName: ProcessingStepName): ProcessingJobState {
  if (stepName === "malware_scan") return "malware_scan";
  if (stepName === "classify_report") return "classified";
  if (stepName === "extract_document") return "text_extraction_pending";
  if (stepName === "ocr_fallback") return "ocr_required";
  if (stepName === "extract_biomarkers") return "biomarker_extraction_pending";
  if (stepName === "normalize_biomarkers") return "normalized";
  if (stepName === "validate_biomarkers") return "validated";
  if (stepName === "run_safety_rules") return "validation_failed";
  if (stepName === "generate_patient_explanation") return "insight_generation_pending";
  if (stepName === "route_review") return "doctor_review_required";
  return "published";
}

function mustFindJob(store: ReportStore, jobId: string) {
  const job = store.processingJobs.find((candidate) => candidate.id === jobId);
  if (!job) {
    throw new Error("job_not_found");
  }
  return job;
}

function addAudit(
  store: ReportStore,
  action: AuditLogRecord["action"],
  job: ProcessingJobRecord,
  safeMetadata: Record<string, unknown>
) {
  store.auditLogs.push({
    action,
    actorRole: "admin",
    actorUserId: job.workerId ?? "workflow-provider",
    createdAt: new Date().toISOString(),
    entityId: job.id,
    entityType: "processing_job",
    id: randomUUID(),
    ipAddress: null,
    requestId: null,
    safeMetadata,
    userAgent: job.workerId ?? "workflow-provider"
  });
}

function workerMaxAttempts() {
  const configured = Number(process.env.WORKER_MAX_ATTEMPTS);
  return Number.isFinite(configured) && configured > 0 ? configured : 3;
}

function assertLocalBestEffortClaimAllowed() {
  if (isLocalLikeWorkflowEnv() || process.env.ALLOW_BEST_EFFORT_WORKFLOW_CLAIM === "true") {
    return;
  }
  throw new Error("atomic_workflow_claim_required");
}

function isLocalLikeWorkflowEnv() {
  const appEnv = (process.env.APP_ENV ?? process.env.NODE_ENV ?? "development").toLowerCase();
  return appEnv === "local" || appEnv === "development" || appEnv === "test";
}

function toProcessingJob(row: DbRow): ProcessingJobRecord {
  return {
    attemptCount: numberField(row, "attempt_count"),
    completedAt: nullableString(row, "completed_at"),
    createdAt: stringField(row, "created_at"),
    currentState: stringField(row, "current_state") as ProcessingJobRecord["currentState"],
    currentStep: stepNameField(row),
    errorCode: nullableString(row, "error_code"),
    errorMessage: nullableString(row, "error_message"),
    failedAt: nullableString(row, "failed_at"),
    id: stringField(row, "id"),
    idempotencyKey: stringField(row, "idempotency_key"),
    jobType: "report_processing",
    labReportId: stringField(row, "lab_report_id"),
    lockedBy: nullableString(row, "locked_by"),
    lockedUntil: nullableString(row, "locked_until"),
    maxAttempts: numberField(row, "max_attempts"),
    metadata: objectField(row, "metadata"),
    nextRunAt: nullableString(row, "next_run_at"),
    priority: numberField(row, "priority"),
    processingVersion: stringField(row, "processing_version"),
    queuedAt: stringField(row, "queued_at"),
    reportFileId: stringField(row, "report_file_id"),
    startedAt: nullableString(row, "started_at"),
    status: stringField(row, "status") as ProcessingJobRecord["status"],
    updatedAt: stringField(row, "updated_at"),
    userId: stringField(row, "user_id"),
    workerId: nullableString(row, "worker_id")
  };
}

function stepNameField(row: DbRow): ProcessingStepName {
  const value = stringField(row, "current_step");
  return PIPELINE_STEPS.includes(value as ProcessingStepName) ? (value as ProcessingStepName) : "malware_scan";
}

function stringField(row: DbRow, primary: string) {
  const value = row[primary];
  return typeof value === "string" ? value : "";
}

function nullableString(row: DbRow, primary: string) {
  const value = row[primary];
  return typeof value === "string" ? value : null;
}

function numberField(row: DbRow, primary: string) {
  const value = row[primary];
  return typeof value === "number" ? value : Number(value ?? 0);
}

function objectField(row: DbRow, primary: string) {
  const value = row[primary];
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}
