import { createSupabaseServiceClient } from "../auth/providers/supabase-server";
import { writeSupabaseAuditLog } from "../auth/supabase-auth";
import type {
  AuditLogRecord,
  ProcessingJobRecord,
  ProcessingJobState,
  ProcessingJobStepRecord,
  ProcessingStepName
} from "../reports/types";
import type {
  MarkJobBlockedParams,
  MarkJobCompletedParams,
  MarkStepFailedParams,
  MarkStepSucceededParams,
  RunJobStepParams,
  ScheduleRetryParams
} from "./workflow-provider";

type DbRow = Record<string, unknown>;

export async function runSupabaseJobStep(params: RunJobStepParams): Promise<ProcessingJobStepRecord> {
  const now = params.now ?? new Date().toISOString();
  const serviceClient = createSupabaseServiceClient();
  const job = await mustFindSupabaseJob(params.jobId);
  const existing = await findStep(params.jobId, params.stepName);

  if (existing && stringField(existing, "status") === "completed") {
    return toProcessingJobStep(existing);
  }

  const attemptCount = existing ? numberField(existing, "attempt_count") + 1 : 1;
  const stepValues = {
    attempt_count: attemptCount,
    attempt_number: attemptCount,
    input_snapshot: params.inputSnapshot ?? (existing ? existing.input_snapshot : null),
    locked_by: params.workerId,
    locked_until: job.lockedUntil,
    safe_input_summary: params.inputSnapshot ?? {},
    started_at: existing ? nullableString(existing, "started_at") ?? now : now,
    status: "running",
    updated_at: now
  };

  const stepRow = existing
    ? await updateStepRow(stringField(existing, "id"), stepValues)
    : await insertStepRow({
        ...stepValues,
        job_id: params.jobId,
        processing_job_id: params.jobId,
        state: stepNameToState(params.stepName),
        step_key: params.stepName,
        step_name: params.stepName,
        created_at: now
      });

  const jobUpdate = await serviceClient
    .from("processing_jobs")
    .update({ current_step: params.stepName, status: "running", updated_at: now })
    .eq("id", params.jobId);
  throwIfError(jobUpdate.error);

  await writeStepAudit(job, "processing_job_step_started", {
    attemptCount,
    stepName: params.stepName
  });
  return toProcessingJobStep(stepRow);
}

export async function markSupabaseStepSucceeded(
  params: MarkStepSucceededParams
): Promise<ProcessingJobStepRecord> {
  const now = params.now ?? new Date().toISOString();
  const job = await mustFindSupabaseJob(params.jobId);
  const existing = await mustFindStep(params.jobId, params.stepName);

  const stepRow = await updateStepRow(stringField(existing, "id"), {
    completed_at: now,
    error_code: null,
    error_message: null,
    failed_at: null,
    locked_by: null,
    locked_until: null,
    output_snapshot: params.outputSnapshot ?? null,
    safe_output_summary: params.outputSnapshot ?? {},
    status: "completed",
    updated_at: now
  });

  await writeStepAudit(job, "processing_job_step_completed", { stepName: params.stepName });
  return toProcessingJobStep(stepRow);
}

export async function markSupabaseStepFailed(
  params: MarkStepFailedParams
): Promise<ProcessingJobStepRecord> {
  const now = params.now ?? new Date().toISOString();
  const job = await mustFindSupabaseJob(params.jobId);
  const existing = await mustFindStep(params.jobId, params.stepName);

  const stepRow = await updateStepRow(stringField(existing, "id"), {
    error_code: params.errorCode,
    error_message: params.errorMessage,
    failed_at: now,
    locked_by: null,
    locked_until: null,
    status: "failed",
    updated_at: now
  });

  await writeStepAudit(job, "processing_job_step_failed", {
    errorCode: params.errorCode,
    retryable: params.retryable,
    stepName: params.stepName
  });
  return toProcessingJobStep(stepRow);
}

export async function scheduleSupabaseRetry(params: ScheduleRetryParams): Promise<ProcessingJobRecord> {
  const now = params.now ?? new Date().toISOString();
  const serviceClient = createSupabaseServiceClient();
  const existing = await findStep(params.jobId, params.stepName);

  if (existing) {
    await updateStepRow(stringField(existing, "id"), {
      locked_by: null,
      locked_until: null,
      status: "retry_scheduled",
      updated_at: now
    });
  }

  const jobResult = await serviceClient
    .from("processing_jobs")
    .update({
      error_code: "retry_scheduled",
      error_message: params.reason,
      locked_by: null,
      locked_until: null,
      next_run_at: params.nextRunAt,
      status: "retry_scheduled",
      updated_at: now
    })
    .eq("id", params.jobId)
    .select("*")
    .single();
  throwIfError(jobResult.error);

  const job = toProcessingJob(jobResult.data as DbRow);
  await writeStepAudit(job, "processing_job_retry_scheduled", {
    nextRunAt: params.nextRunAt,
    reason: params.reason,
    stepName: params.stepName
  });
  return job;
}

export async function markSupabaseJobBlocked(params: MarkJobBlockedParams): Promise<ProcessingJobRecord> {
  const now = params.now ?? new Date().toISOString();
  const serviceClient = createSupabaseServiceClient();
  const errorCode = params.errorCode ?? "processing_blocked";

  if (params.stepName) {
    const existing = await findStep(params.jobId, params.stepName);
    if (existing) {
      await updateStepRow(stringField(existing, "id"), {
        error_code: errorCode,
        error_message: params.reason,
        locked_by: null,
        locked_until: null,
        status: "blocked",
        updated_at: now
      });
    }
  }

  const jobResult = await serviceClient
    .from("processing_jobs")
    .update({
      error_code: errorCode,
      error_message: params.reason,
      failed_at: now,
      locked_by: null,
      locked_until: null,
      next_run_at: null,
      status: "blocked",
      updated_at: now
    })
    .eq("id", params.jobId)
    .select("*")
    .single();
  throwIfError(jobResult.error);

  const job = toProcessingJob(jobResult.data as DbRow);
  await writeStepAudit(job, "processing_job_blocked", {
    errorCode,
    reason: params.reason,
    stepName: params.stepName ?? job.currentStep
  });
  return job;
}

export async function markSupabaseJobCompleted(params: MarkJobCompletedParams): Promise<ProcessingJobRecord> {
  const now = params.now ?? new Date().toISOString();
  const serviceClient = createSupabaseServiceClient();

  const jobResult = await serviceClient
    .from("processing_jobs")
    .update({
      completed_at: now,
      failed_at: null,
      locked_by: null,
      locked_until: null,
      status: "completed",
      updated_at: now
    })
    .eq("id", params.jobId)
    .select("*")
    .single();
  throwIfError(jobResult.error);

  const job = toProcessingJob(jobResult.data as DbRow);
  await writeStepAudit(job, "processing_job_completed", { currentStep: job.currentStep });
  return job;
}

// ── Row helpers ───────────────────────────────────────────────────────────────

async function findStep(jobId: string, stepName: ProcessingStepName): Promise<DbRow | null> {
  const serviceClient = createSupabaseServiceClient();
  const { data, error } = await serviceClient
    .from("processing_job_steps")
    .select("*")
    .or(`job_id.eq.${jobId},processing_job_id.eq.${jobId}`)
    .or(`step_name.eq.${stepName},step_key.eq.${stepName}`)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  throwIfError(error);
  return (data as DbRow | null) ?? null;
}

async function mustFindStep(jobId: string, stepName: ProcessingStepName): Promise<DbRow> {
  const row = await findStep(jobId, stepName);
  if (!row) {
    throw new Error("processing_job_step_not_found");
  }
  return row;
}

async function insertStepRow(values: DbRow): Promise<DbRow> {
  const serviceClient = createSupabaseServiceClient();
  const { data, error } = await serviceClient
    .from("processing_job_steps")
    .insert(values)
    .select("*")
    .single();
  throwIfError(error);
  return data as DbRow;
}

async function updateStepRow(stepId: string, values: DbRow): Promise<DbRow> {
  const serviceClient = createSupabaseServiceClient();
  const { data, error } = await serviceClient
    .from("processing_job_steps")
    .update(values)
    .eq("id", stepId)
    .select("*")
    .single();
  throwIfError(error);
  return data as DbRow;
}

async function mustFindSupabaseJob(jobId: string): Promise<ProcessingJobRecord> {
  const serviceClient = createSupabaseServiceClient();
  const { data, error } = await serviceClient
    .from("processing_jobs")
    .select("*")
    .eq("id", jobId)
    .maybeSingle();
  throwIfError(error);
  if (!data) {
    throw new Error("job_not_found");
  }
  return toProcessingJob(data as DbRow);
}

async function writeStepAudit(
  job: ProcessingJobRecord,
  action: AuditLogRecord["action"],
  metadata: Record<string, unknown>
) {
  await writeSupabaseAuditLog({
    action,
    actorRole: null,
    actorUserId: null,
    metadata: {
      ...metadata,
      workerId: job.workerId ?? job.lockedBy
    },
    resourceId: job.id,
    resourceType: "processing_job"
  });
}

function throwIfError(error: { message: string } | null) {
  if (error) {
    throw new Error(error.message);
  }
}

// ── Converters (DB row → record) ──────────────────────────────────────────────

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

function toProcessingJobStep(row: DbRow): ProcessingJobStepRecord {
  const stepName = (stringField(row, "step_name") || stringField(row, "step_key")) as ProcessingStepName;
  return {
    attemptCount: numberField(row, "attempt_count"),
    attemptNumber: numberField(row, "attempt_number"),
    completedAt: nullableString(row, "completed_at"),
    createdAt: stringField(row, "created_at"),
    durationMs: null,
    errorCode: nullableString(row, "error_code"),
    errorMessage: nullableString(row, "error_message"),
    failedAt: nullableString(row, "failed_at"),
    id: stringField(row, "id"),
    inputSnapshot: objectOrNull(row, "input_snapshot"),
    lockedBy: nullableString(row, "locked_by"),
    lockedUntil: nullableString(row, "locked_until"),
    maxAttempts: numberField(row, "max_attempts"),
    outputSnapshot: objectOrNull(row, "output_snapshot"),
    processingJobId: stringField(row, "processing_job_id") || stringField(row, "job_id"),
    safeInputSummary: objectField(row, "safe_input_summary"),
    safeOutputSummary: objectField(row, "safe_output_summary"),
    startedAt: nullableString(row, "started_at"),
    state: (stringField(row, "state") || stepNameToState(stepName)) as ProcessingJobState,
    status: stringField(row, "status") as ProcessingJobStepRecord["status"],
    stepKey: stringField(row, "step_key") || stepName,
    stepName,
    updatedAt: stringField(row, "updated_at")
  };
}

function toProcessingJob(row: DbRow): ProcessingJobRecord {
  return {
    attemptCount: numberField(row, "attempt_count"),
    completedAt: nullableString(row, "completed_at"),
    createdAt: stringField(row, "created_at"),
    currentState: stringField(row, "current_state") as ProcessingJobRecord["currentState"],
    currentStep: (stringField(row, "current_step") || "malware_scan") as ProcessingStepName,
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

function stringField(row: DbRow, key: string) {
  const value = row[key];
  return typeof value === "string" ? value : "";
}

function nullableString(row: DbRow, key: string) {
  const value = row[key];
  return typeof value === "string" ? value : null;
}

function numberField(row: DbRow, key: string) {
  const value = row[key];
  return typeof value === "number" ? value : Number(value ?? 0);
}

function objectField(row: DbRow, key: string) {
  const value = row[key];
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function objectOrNull(row: DbRow, key: string) {
  const value = row[key];
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}
