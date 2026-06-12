# Workflow And Processing Pipeline

## Status

Lyf9 AI now has a durable workflow foundation in code. `processing_jobs` and `processing_job_steps` are the source of truth for report processing, with idempotency, leases, retry scheduling, blocked states, and PHI-safe job audit events.

Real PHI remains blocked until this is verified against staging Supabase/Postgres and connected to a real malware scanner plus live Marker/Textract/OpenAI providers.

## WorkflowProvider Architecture

Primary implementation:

- `apps/web/src/lib/workflow/workflow-provider.ts`

Compatibility export:

- `apps/web/src/lib/reports/providers/workflow.ts`

Worker protocol:

- `apps/worker/app/providers/workflow.py`

Provider methods:

- `enqueueReportProcessing`
- `claimNextJob`
- `runJobStep`
- `markStepSucceeded`
- `markStepFailed`
- `scheduleRetry`
- `markJobBlocked`
- `markJobCompleted`
- `releaseExpiredLocks`
- `getJobStatus`

The current implementation is a database/store workflow provider. It is production-shaped but still needs Supabase/Postgres staging verification.

## Job Statuses

Operational job statuses:

- `queued`
- `running`
- `waiting`
- `blocked`
- `failed`
- `retry_scheduled`
- `completed`
- `cancelled`

Domain/report states remain separate, for example:

- `scan_pending`
- `scan_passed`
- `classified`
- `unsupported`
- `text_extraction_pending`
- `ocr_required`
- `biomarker_extraction_pending`
- `insight_generated`
- `doctor_review_required`
- `published`

## Step Names

Step names are centralized in `PIPELINE_STEPS`:

1. `malware_scan`
2. `classify_report`
3. `extract_document`
4. `ocr_fallback`
5. `extract_biomarkers`
6. `normalize_biomarkers`
7. `validate_biomarkers`
8. `run_safety_rules`
9. `generate_patient_explanation`
10. `route_review`
11. `publish_result`

Executable in the local/test workflow:

- `malware_scan`
- `extract_document`
- `ocr_fallback`
- `classify_report`
- `extract_biomarkers`
- `normalize_biomarkers`
- `validate_biomarkers`
- `run_safety_rules`
- `generate_patient_explanation`
- `route_review`

`publish_result` remains controlled by review routing and must not fake success for critical, unsupported, or unsafe outputs.

## Locking And Leases

Workers claim one eligible job at a time:

- status must be `queued` or `retry_scheduled`
- `next_run_at` must be null or due
- no active unexpired lock
- completed, failed, blocked, and cancelled jobs are not claimed

Claiming sets:

- `status=running`
- `locked_by`
- `locked_until`
- `started_at` if null
- `attempt_count=attempt_count+1`

Expired locks are released and audited with `processing_job_lock_expired`.

### Atomic Supabase Claim RPC

Migration:

- `supabase/migrations/202606060005_atomic_processing_job_claim.sql`

RPC functions:

- `claim_next_processing_job(p_worker_id text, p_lease_seconds integer, p_now timestamptz)`
- `release_expired_processing_locks(p_now timestamptz)`

`claim_next_processing_job` uses `FOR UPDATE SKIP LOCKED` inside Postgres and updates exactly one eligible row in the same statement. It only claims jobs where:

- `status in ('queued', 'retry_scheduled')`
- `next_run_at` is null or due
- `locked_until` is null or expired

It excludes blocked, failed, completed, cancelled, and future-scheduled jobs.

`release_expired_processing_locks` safely transitions expired running jobs:

- attempts remaining: `retry_scheduled`, `next_run_at=p_now`
- attempts exhausted: `failed`, `error_code=lock_expired_max_attempts`

The TypeScript Supabase workflow provider calls these RPCs and writes PHI-minimal audit rows for claim, lock expiry, retry scheduling, and max-attempt failure. The local store provider remains a deterministic best-effort fallback for local/development/test only; staging/production local claiming throws `atomic_workflow_claim_required` unless explicitly overridden for a targeted test.

Live verification command:

```bash
RUN_LIVE_SUPABASE_WORKFLOW=true \
LIVE_SUPABASE_WORKFLOW_JOB_ID=<seeded queued processing job id> \
npm run test:workflow-live
```

Current limitation: the RPC exists in code and has a skipped live test harness, but it has not yet been run against a real Lyf9 AI staging Supabase project.

## Idempotency

Idempotency key:

```txt
user_id + report_file_checksum + processing_version
```

If checksum is unavailable in a future path, use:

```txt
user_id + report_file_id + processing_version
```

Rules:

- Duplicate upload-complete calls return the existing active job.
- Completed `malware_scan` is not rerun unless an explicit retry/reprocess action requeues the job.
- New extraction versions must use a new processing version.

## Retry Policy

Defaults:

- `WORKER_MAX_ATTEMPTS=3`
- attempt 1: immediate
- attempt 2: +1 minute
- attempt 3: +5 minutes

Retryable examples:

- transient scanner outage
- storage metadata timeout
- provider rate limit
- temporary network failure

Non-retryable examples:

- deleted report
- rejected file
- invalid MIME
- malware scan failed
- scanner configuration required
- unsupported report type

Configuration-required states are blocked and do not retry automatically.

## Malware Scan First Step

`malware_scan`:

1. Loads the job and report file.
2. Confirms upload is complete and report is not deleted/rejected.
3. Calls `MalwareScannerProvider`.
4. Persists scan status.
5. Writes malware scan and processing step audit logs.
6. Marks step completed only when scan passes or is an allowed local dev-only skip.
7. Advances to `extract_document`.

Blocked scan states:

- `scan_failed`
- `scan_configuration_required`
- `scan_skipped_dev_only` outside local/development/test

## Document Extraction Steps

`extract_document`:

1. Requires upload completion.
2. Requires `scan_status=scan_passed`.
3. Calls the configured `DocumentParserProvider`.
4. Persists `extracted_documents` with parser provider/version, text/table status, page count, confidence, and safe error metadata.
5. Advances to `classify_report` when text extraction succeeds.
6. Advances to `ocr_fallback` when OCR is required or text confidence is low.
7. Blocks the job if the parser fails or is not configured.

`ocr_fallback`:

1. Calls the configured `OcrProvider`.
2. Persists OCR output with `ocr_provider`.
3. Advances to `classify_report` when OCR succeeds.
4. Blocks the job if OCR fails or Textract is not configured.

`classify_report`:

1. Loads the latest successful extracted text.
2. Uses deterministic keyword/panel classification only.
3. Updates `lab_reports` classification fields.
4. Blocks unsupported and unknown reports safely.
5. Advances supported/limited-beta reports to `extract_biomarkers`.

## Schema-First AI Steps

`extract_biomarkers`:

- Requires supported or limited-beta classification.
- Loads the latest extracted document.
- Calls `AiProvider.extractBiomarkers`.
- Validates strict schema before persistence.
- Logs a model run with input/output hashes.
- Blocks with `ai_configuration_required` or `ai_schema_validation_failed` when needed.

`normalize_biomarkers`:

- Maps aliases through the deterministic catalog.
- Preserves raw name, value, unit, source text, and lab reference range.
- Stores `biomarker_results`.
- Marks unmapped/low-confidence items for review.

`validate_biomarkers`:

- Checks required source/value/confidence fields.
- Routes low-confidence items to admin/manual review.

`run_safety_rules`:

- Applies deterministic critical and unsafe-language rules.
- Creates risk flags without storing PHI in audit metadata.
- Blocks AI-only critical publishing.

`generate_patient_explanation`:

- Calls `AiProvider.generatePatientExplanation`.
- Validates schema and required disclaimer.
- Runs unsafe-language checks.
- Persists `health_insights`.

`route_review`:

- Completes safe AI-only output when non-critical and high-confidence.
- Routes low-confidence/unmapped cases to admin/manual review.
- Routes critical or safety-blocked cases to doctor/admin review.

Live OpenAI execution is still a staging integration step. Missing config blocks safely.

## Admin Visibility

The admin data helper exposes:

- queued jobs
- running jobs
- retry-scheduled jobs
- blocked jobs
- failed jobs
- current step
- attempt count
- error code/message
- lock owner/time
- next run time
- step records

The UI has minimal visibility through the existing admin reports view. Dedicated retry/cancel buttons remain a UI gap; backend retry helper exists for operator workflows.

## User-Facing Status

Users see safe labels, not internal stack traces:

- Upload pending
- Upload complete
- Security scan pending
- Security scan passed
- Security scan failed
- Processing queued
- Processing paused
- Processing failed
- Processing not configured yet
- Unsupported report
- Deleted

Do not show “result ready” unless an insight actually exists.

## Audit Events

Workflow events:

- `processing_job_created`
- `processing_job_claimed`
- `processing_job_step_started`
- `processing_job_step_completed`
- `processing_job_step_failed`
- `processing_job_retry_scheduled`
- `processing_job_blocked`
- `processing_job_completed`
- `processing_job_cancelled`
- `processing_job_lock_expired`

Malware events:

- `malware_scan_started`
- `malware_scan_passed`
- `malware_scan_failed`
- `malware_scan_configuration_required`

Audit metadata must stay PHI-minimal.

## Current Limitations

- Supabase/Postgres atomic claim RPC is implemented but not yet verified with live concurrent staging workers.
- Python worker command remains a status/process-once stub; TypeScript provider is the tested implementation.
- Real malware scanner is not wired.
- Marker and Textract contracts are implemented but not live-verified.
- OpenAI production execution is not live-wired; schema-first local/test AI path is implemented and production config gaps block safely.
