# lyf9.ai Progress

## Current Phase

End-to-end audit completed for a **production-shaped private beta MVP**.

The repo remains suitable for local scaffold testing and operator rehearsal. It is not approved for real 30-50 user PHI until Supabase Auth/Postgres, S3 presigned storage, real malware scanning, durable workflow, Marker/OCR, OpenAI Structured Outputs, Sentry/analytics privacy review, and legal review are completed in staging.

Current private beta readiness score: **7.3/10**.

No public launch, autonomous diagnosis, prescriptions, medicine-change advice, supplement protocols, pharmacy commerce, lab booking, full doctor marketplace, mobile app, wearables, ABDM/ABHA, genetics, employer, or insurance workflows have been added.

## Completed In This Pass

- Hardened the Supabase foundation verification layer:
  - Added `docs/25_SUPABASE_STAGING_VERIFICATION.md` with staging setup, migration, seed, RLS test, manual SQL, rollback, limitation, and status steps.
  - Changed web auth mode detection so local cookie fallback runs only with `APP_ENV=local/development` and `ENABLE_LOCAL_AUTH_FALLBACK=true`.
  - Added fail-closed web auth behavior for staging/production-style misconfiguration.
  - Added focused tests for production/staging fallback blocking and local explicit fallback.
  - Added an opt-in live Supabase RLS harness at `apps/web/src/lib/auth/supabase-live-rls.test.ts`.
  - Added `npm run test:rls`.
  - Added FastAPI ownership and safe audit helper coverage.
  - Improved hardening migration policy idempotency by dropping recreated policies before creation.
  - Updated env examples to document local scaffold fallback versus staging/production Supabase behavior.
  - Updated readiness/security/gap docs to keep live RLS verification marked blocked until staging env is configured.
  - Tightened the public Supabase client helper so it reads only `NEXT_PUBLIC_*` public config.
  - Added `report_upload_blocked` audit logging for upload-init attempts blocked by missing required consent.

Changed files in this pass:

- `apps/web/src/lib/auth/providers/supabase.ts`
- `apps/web/src/lib/auth/providers/supabase-server.ts`
- `apps/web/src/lib/auth/supabase-auth.ts`
- `apps/web/src/lib/auth/request.ts`
- `apps/web/src/lib/auth/supabase-foundation.test.ts`
- `apps/web/src/lib/auth/supabase-live-rls.test.ts`
- `apps/web/src/lib/onboarding/server.ts`
- `apps/web/src/lib/reports/supabase-repository.ts`
- `apps/web/src/lib/reports/repository.ts`
- `apps/web/src/lib/reports/types.ts`
- `apps/web/src/app/api/auth/login/route.ts`
- `apps/web/src/app/api/auth/signup/route.ts`
- `apps/web/src/app/api/health/route.ts`
- `apps/web/src/app/api/reports/upload-init/route.ts`
- `apps/web/.env.example`
- `apps/api/app/auth.py`
- `apps/api/tests/test_auth.py`
- `apps/api/.env.example`
- `apps/worker/.env.example`
- `package.json`
- `apps/web/package.json`
- `supabase/migrations/202606060002_auth_persistence_rls_hardening.sql`
- `docs/25_SUPABASE_STAGING_VERIFICATION.md`
- `docs/06_PRIVATE_BETA_LAUNCH_CHECKLIST.md`
- `docs/19_PRIVATE_BETA_GAP_ANALYSIS.md`
- `docs/21_SECURITY_PRIVACY_SAFETY_REVIEW.md`
- `docs/PROGRESS.md`
- Implemented the first blocking Supabase foundation fix:
  - Added Supabase JS dependency to `apps/web`.
  - Added Supabase auth helpers that verify access tokens server-side and resolve trusted roles from `user_roles`.
  - Switched signup/login to Supabase Auth when Supabase env is configured, with local cookie auth retained only as scaffold fallback.
  - Added server-side profile, questionnaire, and purpose-wise consent persistence.
  - Added backend consent gate helper `has_required_report_upload_consent` and wired upload-init/upload-complete to server-side consent checks.
  - Added Supabase-backed report metadata, lab report, processing job, processing step, feedback, analytics, and audit persistence behind the existing repository facade.
  - Added a hardening migration: `supabase/migrations/202606060002_auth_persistence_rls_hardening.sql`.
  - Added FastAPI auth helper scaffolding for Supabase JWT verification, trusted role checks, admin checks, and doctor assignment checks.
  - Updated web/API/worker env examples for Supabase Auth/Postgres/RLS deployment shape.
  - Added auth/RBAC/RLS boundary tests.
- Completed the requested end-to-end audit and created:
  - `docs/18_END_TO_END_CODEBASE_AUDIT.md`
  - `docs/19_PRIVATE_BETA_GAP_ANALYSIS.md`
  - `docs/20_DESIGN_DNA_IMPLEMENTATION_REVIEW.md`
  - `docs/21_SECURITY_PRIVACY_SAFETY_REVIEW.md`
  - `docs/22_TEST_EXECUTION_REPORT.md`
  - `docs/23_NEXT_FIX_PROMPTS.md`
  - `docs/24_BRAND_CLEANUP_AUDIT.md`
- Performed brand cleanup so old product naming no longer appears in repo source/docs outside generated dependencies.
- Updated `npm run copy:scan` to scan the broader repo without embedding blocked terms literally.
- Audited the existing monorepo and documented the current local scaffold versus production target.
- Added long-term architecture and migration docs:
  - `docs/08_LONG_TERM_ARCHITECTURE_OPTIMIZATION.md`
  - `docs/09_SUPABASE_IMPLEMENTATION_PLAN.md`
  - `docs/10_STORAGE_AND_FILE_SECURITY.md`
  - `docs/11_WORKFLOW_AND_PROCESSING_PIPELINE.md`
  - `docs/12_DOCUMENT_EXTRACTION_PROVIDERS.md`
  - `docs/13_AI_STRUCTURED_OUTPUTS_AND_MODEL_RUNS.md`
  - `docs/14_BIOMARKER_CATALOG_AND_NORMALIZATION.md`
  - `docs/15_MEDICAL_SAFETY_AND_CLINICAL_BOUNDARIES.md`
  - `docs/16_INTERNAL_AGENT_ARCHITECTURE.md`
  - `docs/17_COMPLIANCE_AND_LEGAL_REVIEW_GATE.md`
- Added Supabase Postgres migration and RLS strategy:
  - `supabase/migrations/202606060001_private_beta_core.sql`
- Added Supabase config helper for frontend/server mode detection.
- Added provider abstractions:
  - StorageProvider with local and S3 contract.
  - MalwareScannerProvider with mock scanner gate.
  - WorkflowProvider with local scaffold implementation.
  - AiProvider contract.
  - Worker-side AI/document/workflow provider protocols.
- Wired upload-init to create a storage-provider target.
- Updated report lifecycle so upload-init creates `upload_pending`; completed upload moves through scan states before extraction.
- Added malware scan gate before parser/extraction.
- Accepted `image/jpg` as a JPG MIME alias.
- Expanded processing states to include OCR completed, validation failed, doctor reviewed, published, archived, and deleted.
- Normalized env examples for Supabase, AWS S3, OpenAI model split, workflow, OCR, Sentry, PostHog, Razorpay, and email.
- Updated web/API/worker health checks with Supabase, storage, workflow, OCR, and observability configuration status.
- Updated deployment docs with Supabase migration and normalized env names.
- Updated private beta checklist with the requested readiness matrix.
- Expanded private beta runbook with limitations, unsupported reports, manual correction, export/delete, and go/no-go procedures.
- Added tests for:
  - `image/jpg` upload validation.
  - malware scan blocking before extraction.

## Verification

Passed during this pass:

```txt
npm run typecheck
npm run lint
npm test
npm run build:web
npm run api:test
npm run api:health
npm run worker:health
npm run copy:scan
npm run test:rls
npm --workspace apps/web run test -- src/lib/auth/supabase-foundation.test.ts
npm --workspace apps/web run test -- src/lib/auth/supabase-foundation.test.ts src/lib/reports/reports.test.ts
npm --workspace apps/web run typecheck
cd apps/api && python3 -m pytest tests/test_auth.py
rg "SUPABASE_SERVICE_ROLE_KEY|service-role|SERVICE_ROLE" apps/web/.next/static -g '*.js'
```

`npm run test:rls` currently skips the live RLS test because `RUN_LIVE_SUPABASE_RLS=true` and staging Supabase env are not configured in this workspace. Current web/shared tests: **45 passing, 1 live RLS test skipped**. Current API tests: **8 passing**.

The browser-only bundle scan found no `SUPABASE_SERVICE_ROLE_KEY`, `service-role`, or `SERVICE_ROLE` matches in `.next/static`.

`npm run build:web` passes with the existing Next.js warning that the Next.js plugin is not detected in the custom flat ESLint config.

Passed during the previous Supabase foundation pass:

```txt
npm run typecheck
npm run lint
npm test
npm run copy:scan
npm run build:web
npm run api:test
npm run api:health
npm run worker:health
```

Brand scan status: clean.

## Private Beta Readiness

Ready for scaffold/operator rehearsal:

- Landing/auth/onboarding scaffold.
- Consent gate.
- Invite-code beta access.
- Upload validation.
- Provider-shaped upload target.
- Local private storage.
- Mock malware scan gate.
- Supported/unsupported fixture handling.
- AI-safe fixture explanation.
- Admin correction.
- Assigned doctor review.
- Feedback capture.
- Payment placeholder records.
- Local analytics events.
- Internal export/delete scaffold.
- Health endpoints.
- Deployment docs and runbook.

Partially ready for production-shaped private beta:

- Supabase Auth/Postgres/RLS foundation is implemented in code and migrations, but is not applied/tested against a live staging Supabase project.
- Local cookie auth and local JSON persistence remain as explicit local scaffold fallback when Supabase env is absent.
- S3 provider contract exists, but AWS SDK presigned URL implementation is not wired.
- Malware scanner gate exists, but production scanner is not wired.
- Workflow provider exists, but Redis/Celery or Inngest is not wired.
- Parser/OCR provider interfaces exist, but Marker/Textract are not wired.
- AI provider contract exists, but OpenAI Structured Outputs/Pydantic worker path is not wired.
- Health checks report configuration, not live database/storage/queue connectivity.

Blocked for real PHI/private beta users:

- Live staging Supabase project with migrations applied.
- Staging RLS test matrix with real user/doctor/admin/superadmin JWTs.
- S3 private bucket policy, presigned URLs, lifecycle, deletion, and KMS decisions.
- Real malware scan before extraction.
- Durable worker queue.
- Marker/OCR production path.
- OpenAI Structured Outputs production path.
- Sentry/PostHog with PHI scrubbing and privacy review.
- Legal review for DPDP, consent, disclaimers, doctor review, payments, refunds, and contracts.
- 25 internal reports across at least 5 supported categories.

## Known Risks

- Supabase Auth and database-backed roles are implemented and hardened, but the staging project has not been configured or exercised with real JWTs.
- The live RLS harness is available but not run against staging from this workspace.
- Next.js route handlers currently act as the backend-for-frontend for Supabase service-role operations; ensure the service-role key is server-only in deployment and never exposed as `NEXT_PUBLIC_*`.
- Local cookie auth and local JSON store remain for explicit local/development scaffold mode only and must not be used for real PHI.
- S3 provider is a contract/stub until presigning is implemented in the backend.
- Mock malware scanning is not real security.
- Critical thresholds are placeholder/config-driven and need medical review.
- Model run logging exists locally but must cover every production AI call.

## Next Prompt To Run

> Apply and validate the Supabase foundation in staging for Lyf9 AI: create the Supabase project, apply migrations `202606060001` and `202606060002`, create real user/doctor/admin/superadmin accounts, run JWT-backed RLS tests, and confirm profile, consent, report metadata, processing job, audit, feedback, and analytics records persist with correct access boundaries. Do not add OCR, AI, S3, payments, or unrelated features.

Run the staging RLS harness with:

```bash
RUN_LIVE_SUPABASE_RLS=true \
NEXT_PUBLIC_SUPABASE_URL=<staging-url> \
NEXT_PUBLIC_SUPABASE_ANON_KEY=<staging-anon-key> \
SUPABASE_SERVICE_ROLE_KEY=<staging-service-role-key> \
npm run test:rls
```

## 2026-06-06 Private Storage And Malware Gate Pass

Completed:

- Added `StorageProvider`, `S3StorageProvider`, and mock storage provider under `apps/web/src/lib/storage/`.
- Added `MalwareScannerProvider`, local mock scanner, and deployed scanner stub under `apps/web/src/lib/malware/`.
- Wired upload-init to create report metadata, validate MIME/size/checksum, enforce consent before upload, and return signed upload targets.
- Added upload-complete route for S3-style finalize after direct upload.
- Added signed download URL endpoint with owner, assigned doctor, admin, and superadmin authorization.
- Added report delete endpoint with soft delete, provider delete call, audit log, and future download blocking.
- Added malware scan gating before extraction; `scan_pending`, `scan_failed`, and `scan_configuration_required` do not advance.
- Updated worker stub health/state output to include `malware_scan` and scanner configuration status.
- Added migration `202606060003_private_storage_scan_status.sql`.
- Updated web/API/worker env examples with S3, max file size, storage mock, and malware scanner controls.
- Updated storage/security, checklist, gap analysis, and security review docs.

Changed files include:

- `apps/web/src/lib/storage/*`
- `apps/web/src/lib/malware/*`
- `apps/web/src/lib/reports/repository.ts`
- `apps/web/src/lib/reports/supabase-repository.ts`
- `apps/web/src/app/api/reports/upload-init/route.ts`
- `apps/web/src/app/api/reports/[reportFileId]/upload-complete/route.ts`
- `apps/web/src/app/api/reports/[reportFileId]/download-url/route.ts`
- `apps/web/src/app/api/reports/[reportFileId]/route.ts`
- `apps/web/src/components/reports/report-upload-form.tsx`
- `apps/web/src/components/reports/report-list.tsx`
- `apps/worker/app/worker.py`
- `supabase/migrations/202606060003_private_storage_scan_status.sql`

Verification:

```txt
npm run typecheck
npm run lint
npm test
npm run build:web
npm run api:test
npm run api:health
npm run worker:health
npm run worker:process-once
npm run copy:scan
rg "AWS_SECRET_ACCESS_KEY|AWS_ACCESS_KEY_ID|S3_REPORT_BUCKET|SUPABASE_SERVICE_ROLE_KEY|SERVICE_ROLE|service-role" apps/web/.next/static -g '*.js'
test ! -e docs/07_CODEX_PHASE_PROMPTS.md
```

Current test result: **50 passing, 1 live RLS test skipped**.

`npm run build:web` passes with the existing Next.js warning that the Next.js plugin is not detected in the custom flat ESLint config.

Browser bundle secret scan found no AWS/Supabase service secret strings in `.next/static`.

Known risks:

- S3 presigning is implemented but not verified against a real private staging bucket.
- Real malware scanning remains blocked; mock/stub scanner is not acceptable for real PHI.
- Worker remains a stub and does not provide durable queue/retry semantics.
- Supabase staging and live RLS verification remain separate blockers.
- `npm install` added AWS SDK packages and reported 7 npm audit findings; no audit fix was run.

Next recommended prompt:

> Configure and verify Lyf9 AI private S3 storage and malware scanning in staging: create the private bucket/IAM policy, set `STORAGE_PROVIDER=s3`, verify signed upload/download/delete against real S3 objects, wire a real ClamAV or S3 event scanner, and prove processing remains blocked until `scan_passed`. Do not implement OCR, OpenAI production paths, durable queue migration, or unrelated product features.

## 2026-06-06 Durable Workflow Reliability Pass

Completed:

- Added database workflow provider in `apps/web/src/lib/workflow/workflow-provider.ts`.
- Added centralized pipeline step names, including `malware_scan` plus future blocked steps.
- Extended processing job/step records with `currentStep`, `processingVersion`, `priority`, lease fields, retry scheduling, max attempts, and step snapshots.
- Added durable process-once flow in the report repository:
  - releases expired locks
  - claims one queued/retry job
  - runs `malware_scan`
  - persists scan result
  - blocks at `classify_report` with `future_step_not_implemented`
- Added manual retry helper and admin blocked/failed job visibility.
- Updated user-facing report status labels to avoid internal state/error leakage.
- Added migration `202606060004_durable_processing_workflow.sql`.
- Updated worker protocol, worker health/process-once output, and env examples for `WORKFLOW_PROVIDER=database`, worker leases, and max attempts.
- Added tests for idempotency, locking, expired lock reclaim, retry scheduling, process-once no-job behavior, malware scan outcomes, future-step blocking, deleted report blocking, admin visibility, user-safe status, and manual retry.

Changed files include:

- `apps/web/src/lib/workflow/*`
- `apps/web/src/lib/reports/providers/workflow.ts`
- `apps/web/src/lib/reports/repository.ts`
- `apps/web/src/lib/reports/supabase-repository.ts`
- `apps/web/src/lib/reports/types.ts`
- `apps/web/src/lib/reports/reports.test.ts`
- `apps/web/src/lib/malware/mock-malware-scanner.ts`
- `apps/web/src/components/reports/report-list.tsx`
- `apps/web/src/components/reports/report-detail.tsx`
- `apps/web/src/components/admin/admin-reports.tsx`
- `apps/worker/app/worker.py`
- `apps/worker/app/providers/workflow.py`
- `apps/worker/app/providers/ai.py`
- `apps/worker/app/providers/document.py`
- `supabase/migrations/202606060004_durable_processing_workflow.sql`
- `apps/web/.env.example`
- `apps/api/.env.example`
- `apps/worker/.env.example`
- `docs/11_WORKFLOW_AND_PROCESSING_PIPELINE.md`
- `docs/06_PRIVATE_BETA_LAUNCH_CHECKLIST.md`
- `docs/19_PRIVATE_BETA_GAP_ANALYSIS.md`
- `docs/21_SECURITY_PRIVACY_SAFETY_REVIEW.md`

Verification so far:

```txt
npm run typecheck
npm run lint
npm test
npm run build:web
npm run api:test
npm run api:health
npm run worker:health
npm run worker:process-once
npm run copy:scan
env PYTHONPYCACHEPREFIX=/private/tmp/lyf9-pycache python3 -m compileall apps/worker/app apps/api/app
rg "AWS_SECRET_ACCESS_KEY|AWS_ACCESS_KEY_ID|S3_REPORT_BUCKET|SUPABASE_SERVICE_ROLE_KEY|SERVICE_ROLE|service-role" apps/web/.next/static -g '*.js'
test ! -e docs/07_CODEX_PHASE_PROMPTS.md
```

Current test result: **63 passing, 1 live RLS test skipped**.

`npm run build:web` passes with the existing Next.js warning that the Next.js plugin is not detected in the custom flat ESLint config.

Browser bundle secret scan found no AWS/Supabase service secret strings in `.next/static`.

An initial `python3 -m compileall` attempted to write bytecode to the macOS user cache and failed under the workspace sandbox; rerunning with `PYTHONPYCACHEPREFIX=/private/tmp/lyf9-pycache` passed.

Known risks:

- Workflow provider is tested against the local durable store, not live concurrent Supabase/Postgres workers.
- Claiming is best-effort optimistic in code; real PHI concurrency should use a SQL transaction/RPC claim function.
- Python worker remains a command/status stub. The tested workflow implementation is in the TypeScript backend-for-frontend layer.
- Real malware scanner, S3 staging verification, Supabase live RLS tests, OCR/Marker, and OpenAI structured outputs remain blocked.

Next recommended prompt:

> Validate Lyf9 AI durable workflow in staging Postgres: apply `202606060004_durable_processing_workflow.sql`, implement a transactional claim RPC if needed, run two concurrent workers against seeded jobs, verify leases/retries/blocked jobs/audit rows, and confirm `malware_scan` cannot advance unless the scanner returns `scan_passed`. Do not implement OCR, Marker, OpenAI production paths, or unrelated product features.

## 2026-06-06 Atomic Workflow Claim Hardening Pass

Completed:

- Added migration `202606060005_atomic_processing_job_claim.sql`.
- Added Postgres RPC `claim_next_processing_job(...)` using `FOR UPDATE SKIP LOCKED`.
- Added Postgres RPC `release_expired_processing_locks(...)`.
- Added Supabase atomic workflow provider path in `apps/web/src/lib/workflow/workflow-provider.ts`.
- Local best-effort claim now throws `atomic_workflow_claim_required` outside local/development/test unless explicitly overridden for a targeted test.
- Claim now increments job `attempt_count`; step attempts remain step-local.
- Expired locks now move to `retry_scheduled` when attempts remain and `failed` when max attempts are reached.
- Added audit action support for `processing_job_failed`.
- Added skipped live workflow concurrency harness at `apps/web/src/lib/workflow/supabase-live-workflow.test.ts`.
- Added `npm run test:workflow-live`.
- Expanded workflow tests for terminal-status exclusion, future `next_run_at`, lock expiry, max-attempt failure, no jobs, duplicate concurrent claims, distinct multi-job claims, and staging claim enforcement.

Changed files include:

- `apps/web/src/lib/workflow/workflow-provider.ts`
- `apps/web/src/lib/workflow/index.ts`
- `apps/web/src/lib/workflow/supabase-live-workflow.test.ts`
- `apps/web/src/lib/reports/types.ts`
- `apps/web/src/lib/reports/reports.test.ts`
- `apps/web/package.json`
- `package.json`
- `supabase/migrations/202606060005_atomic_processing_job_claim.sql`
- `docs/11_WORKFLOW_AND_PROCESSING_PIPELINE.md`
- `docs/06_PRIVATE_BETA_LAUNCH_CHECKLIST.md`
- `docs/19_PRIVATE_BETA_GAP_ANALYSIS.md`
- `docs/21_SECURITY_PRIVACY_SAFETY_REVIEW.md`
- `docs/PROGRESS.md`

Verification:

```txt
npm run typecheck
npm run lint
npm test
npm run test:workflow-live
npm run build:web
npm run copy:scan
rg "AWS_SECRET_ACCESS_KEY|AWS_ACCESS_KEY_ID|S3_REPORT_BUCKET|SUPABASE_SERVICE_ROLE_KEY|SERVICE_ROLE|service-role" apps/web/.next/static -g '*.js'
test ! -e docs/07_CODEX_PHASE_PROMPTS.md
```

Current test result: **70 passing, 2 live tests skipped**.

`npm run test:workflow-live` is intentionally skipped unless `RUN_LIVE_SUPABASE_WORKFLOW=true` and `LIVE_SUPABASE_WORKFLOW_JOB_ID` are provided.

`npm run build:web` passes with the existing Next.js warning that the Next.js plugin is not detected in the custom flat ESLint config.

Browser bundle secret scan found no AWS/Supabase service secret strings in `.next/static`.

Known risks:

- Atomic claim SQL/RPC has not been applied to or verified against live Lyf9 AI staging Supabase.
- The live workflow harness requires a seeded queued processing job id.
- Python worker command remains a status/process-once stub. The tested workflow implementation is still in the TypeScript backend-for-frontend layer.
- Real malware scanner, S3 staging verification, Supabase live RLS tests, OCR/Marker, and OpenAI structured outputs remain blocked.

Next recommended prompt:

> Apply Lyf9 AI workflow migrations through `202606060005_atomic_processing_job_claim.sql` in staging, seed queued processing jobs, run `RUN_LIVE_SUPABASE_WORKFLOW=true LIVE_SUPABASE_WORKFLOW_JOB_ID=<job-id> npm run test:workflow-live`, then run two real worker processes against staging to verify no duplicate claim, lock expiry retry, max-attempt failure, and audit rows. Do not implement OCR, Marker, OpenAI production paths, or unrelated product features.

## 2026-06-06 Document Extraction Foundation Pass

Completed:

- Added `DocumentParserProvider` and `OcrProvider` contracts in `apps/web/src/lib/document-extraction/`.
- Added `MarkerProvider` contract that fails closed when Marker command/API is not configured.
- Added `MockFixtureDocumentParser` for local/test fixtures only.
- Added `TextractOcrProvider` contract that fails closed when Textract is not configured.
- Added `MockOcrProvider` for local/test OCR fixtures only.
- Added deterministic `classifyExtractedReport` wrapper for supported, limited-beta, unsupported, and unknown reports.
- Added migration `202606060006_document_extraction_foundation.sql`.
- Wired durable workflow steps:
  - `extract_document`
  - `ocr_fallback`
  - `classify_report`
- Changed durable post-scan behavior so `malware_scan` advances to `extract_document` instead of immediately blocking at `classify_report`.
- Supported reports now stop at `extract_biomarkers` with `future_step_not_implemented`.
- Unsupported/unknown reports block safely and do not generate AI interpretation.
- Added PHI-minimal audit events for document extraction, OCR, and classification.
- Added user-safe status labels for extraction/OCR/classification states.
- Added admin queue counts for OCR-required and unknown-classification reports.
- Added Marker/OCR env examples for web and worker.
- Updated worker health/process-once output with document parser/OCR readiness.

Changed files include:

- `apps/web/src/lib/document-extraction/*`
- `apps/web/src/lib/reports/repository.ts`
- `apps/web/src/lib/reports/types.ts`
- `apps/web/src/lib/reports/reports.test.ts`
- `apps/web/src/components/reports/report-list.tsx`
- `apps/web/src/components/reports/report-detail.tsx`
- `apps/web/src/components/admin/admin-reports.tsx`
- `apps/web/.env.example`
- `apps/worker/.env.example`
- `apps/worker/app/worker.py`
- `supabase/migrations/202606060006_document_extraction_foundation.sql`
- `docs/12_DOCUMENT_EXTRACTION_PROVIDERS.md`
- `docs/11_WORKFLOW_AND_PROCESSING_PIPELINE.md`
- `docs/06_PRIVATE_BETA_LAUNCH_CHECKLIST.md`
- `docs/19_PRIVATE_BETA_GAP_ANALYSIS.md`
- `docs/21_SECURITY_PRIVACY_SAFETY_REVIEW.md`
- `docs/PROGRESS.md`

Verification so far:

```txt
npm run typecheck
npm run lint
npm test
npm run build:web
npm run api:test
npm run api:health
npm run worker:health
npm run worker:process-once
npm run copy:scan
rg "AWS_SECRET_ACCESS_KEY|AWS_ACCESS_KEY_ID|S3_REPORT_BUCKET|SUPABASE_SERVICE_ROLE_KEY|SERVICE_ROLE|service-role|OPENAI_API_KEY" apps/web/.next/static -g '*.js'
test ! -e docs/07_CODEX_PHASE_PROMPTS.md
```

Current test result: **79 passing, 2 live tests skipped**.

`npm run build:web` passes with the existing Next.js warning that the Next.js plugin is not detected in the custom flat ESLint config.

Browser bundle secret scan found no AWS/Supabase/OpenAI service secret strings in `.next/static`.

Known risks:

- Marker execution is contract-only and has not been verified in staging.
- Textract OCR execution is contract-only and has not been verified in staging.
- Extracted document Supabase persistence and RLS behavior still need live staging verification.
- The legacy bytes-based local fixture path still exists for older repository tests; the durable no-bytes workflow stops before biomarker/AI generation as intended.
- Real malware scanner, S3 staging verification, Supabase live RLS tests, OpenAI structured outputs, golden dataset QA, and legal review remain blocked.

Next recommended prompt:

> Configure Lyf9 AI document extraction in staging: apply `202606060006_document_extraction_foundation.sql`, set `DOCUMENT_PARSER_PROVIDER=marker` with Marker command/API, set `OCR_PROVIDER=textract`, run digital PDF/scanned image/unsupported/unknown fixtures through the durable workflow, verify extracted_documents rows and PHI-minimal audit logs, and confirm supported reports stop at `extract_biomarkers` until OpenAI structured outputs are implemented.

## 2026-06-12 Schema-First AI Layer Pass

Completed:

- Added `AiProvider`, `OpenAiStructuredOutputsProvider`, and `MockAiProvider` in `apps/web/src/lib/ai/`.
- Added strict biomarker extraction, patient explanation, doctor summary, and safety schemas.
- Added model run record creation with input/output hashes, provider, prompt version, schema version, status, and safe error fields.
- Added `apps/web/src/lib/biomarkers/` for catalog exports, confidence thresholds, normalization, validation, and seed exports.
- Expanded biomarker catalog/aliases for CBC, lipid, thyroid, glucose, liver, kidney, and vitamin/mineral v1 coverage.
- Added `apps/web/src/lib/safety/` for unsafe-language, critical-rules, and medical-safety facades.
- Wired durable workflow steps:
  - `extract_biomarkers`
  - `normalize_biomarkers`
  - `validate_biomarkers`
  - `run_safety_rules`
  - `generate_patient_explanation`
  - `route_review`
- Unsupported/unknown reports remain blocked before AI interpretation.
- Missing AI config blocks deployed workflows with `ai_configuration_required`.
- Low-confidence/unmapped biomarkers route to admin/manual review.
- Critical/safety-blocked cases route to doctor/admin review.
- Added migration `202606120001_schema_first_ai_layer.sql`.
- Added AI env examples for web, worker, and API.
- Updated AI, biomarker, safety, workflow, readiness, gap, and security docs.

Changed files include:

- `apps/web/src/lib/ai/*`
- `apps/web/src/lib/biomarkers/*`
- `apps/web/src/lib/safety/*`
- `apps/web/src/lib/reports/catalog.ts`
- `apps/web/src/lib/reports/repository.ts`
- `apps/web/src/lib/reports/safety.ts`
- `apps/web/src/lib/reports/types.ts`
- `apps/web/src/lib/reports/reports.test.ts`
- `apps/web/.env.example`
- `apps/worker/.env.example`
- `apps/api/.env.example`
- `supabase/migrations/202606120001_schema_first_ai_layer.sql`
- `docs/13_AI_STRUCTURED_OUTPUTS_AND_MODEL_RUNS.md`
- `docs/14_BIOMARKER_CATALOG_AND_NORMALIZATION.md`
- `docs/15_MEDICAL_SAFETY_AND_CLINICAL_BOUNDARIES.md`
- `docs/11_WORKFLOW_AND_PROCESSING_PIPELINE.md`
- `docs/06_PRIVATE_BETA_LAUNCH_CHECKLIST.md`
- `docs/19_PRIVATE_BETA_GAP_ANALYSIS.md`
- `docs/21_SECURITY_PRIVACY_SAFETY_REVIEW.md`
- `docs/PROGRESS.md`

Verification so far:

```txt
npm run typecheck
npm test
```

Current test result: **85 passing, 2 live tests skipped**.

Known risks:

- OpenAI Structured Outputs execution is contract-only in this pass and fails closed when unconfigured.
- Golden dataset QA has not been run.
- Critical thresholds remain private-beta placeholders and need doctor review.
- Live Supabase/RLS, S3/IAM, malware scanner, Marker, Textract, and OpenAI staging verification remain blockers before real PHI.
- Dedicated admin UI for AI/model-run failure review remains partial; backend/admin report helpers expose queues and status.

Next recommended prompt:

> Configure Lyf9 AI live AI staging verification: apply migrations through `202606120001_schema_first_ai_layer.sql`, set `AI_PROVIDER=openai` with staging OpenAI models, run a golden fixture set across CBC/lipid/thyroid/glucose/liver/kidney/vitamin reports, verify schema-valid model_runs, biomarker_results, health_insights, safety blocks, and human-reviewed accuracy. Do not implement unrelated product features.

## 2026-06-12 Golden Dataset QA And Release Gate Pass

Completed:

- Added synthetic golden dataset structure under `tests/golden/`.
- Added report fixtures for CBC, lipid, thyroid, glucose, liver, kidney, vitamins, full-body supported, urine limited beta, radiology, ECG, histopathology, and prescription-like unsupported documents.
- Added expected labels under `tests/golden/expected/`.
- Added unsafe-output fixtures under `tests/golden/unsafe_outputs/`.
- Added golden evaluation runner in `apps/web/src/lib/evaluation/golden-eval.ts`.
- Added commands:
  - `npm run eval:golden`
  - `npm run test:golden`
  - `npm run test:safety`
  - `npm run test:e2e:mock`
- Generated:
  - `tests/golden/golden-eval-results.json`
  - `docs/26_GOLDEN_DATASET_EVALUATION_REPORT.md`
- Added `docs/27_LIVE_STAGING_VERIFICATION_PLAN.md`.
- Added `docs/28_PRIVATE_BETA_RELEASE_GATE.md`.
- Tightened unsafe-language filtering with generic patterns for diagnosis-like certainty, treatment action wording, and doctor-bypass wording.
- Expanded `MockAiProvider` fixture aliases to cover v1 golden panels.
- Updated launch checklist, gap analysis, security review, test report, next fix prompts, and stale workflow/document-extraction docs.

Current generated local golden metrics:

```txt
supported classification accuracy: 100%
unsupported classification accuracy: 100%
biomarker recall: 100%
biomarker precision: 100%
value accuracy: 100%
unit accuracy: 100%
source text presence: 100%
unsafe language block rate: 100%
required disclaimer presence: 100%
unsupported report AI block rate: 100%
overall local private beta score: 84/100
private beta recommendation: Not ready
```

Verification:

```txt
npm run typecheck
npm run lint
npm test
npm run build:web
npm run api:test
npm run api:health
npm run worker:health
npm run worker:process-once
npm run copy:scan
npm run eval:golden
npm run test:golden
npm run test:safety
npm run test:e2e:mock
rg "AWS_SECRET_ACCESS_KEY|AWS_ACCESS_KEY_ID|S3_REPORT_BUCKET|SUPABASE_SERVICE_ROLE_KEY|SERVICE_ROLE|service-role|OPENAI_API_KEY" apps/web/.next/static -g "*.js"
test ! -e docs/07_CODEX_PHASE_PROMPTS.md
```

Current test result: **89 passing, 2 live tests skipped** in the web/shared suite, plus **8 passing** API tests.

`npm run build:web` passes with the existing Next.js warning that the Next.js plugin is not detected in the custom flat ESLint config.

Browser bundle secret scan found no AWS/Supabase/OpenAI service secret strings in `.next/static`.

Brand/copy scan status: clean.

Changed files include:

- `tests/golden/**`
- `apps/web/src/lib/evaluation/*`
- `apps/web/src/lib/ai/mock-ai-provider.ts`
- `apps/web/src/lib/reports/safety.ts`
- `package.json`
- `apps/web/package.json`
- `docs/26_GOLDEN_DATASET_EVALUATION_REPORT.md`
- `docs/27_LIVE_STAGING_VERIFICATION_PLAN.md`
- `docs/28_PRIVATE_BETA_RELEASE_GATE.md`
- `docs/06_PRIVATE_BETA_LAUNCH_CHECKLIST.md`
- `docs/11_WORKFLOW_AND_PROCESSING_PIPELINE.md`
- `docs/12_DOCUMENT_EXTRACTION_PROVIDERS.md`
- `docs/19_PRIVATE_BETA_GAP_ANALYSIS.md`
- `docs/21_SECURITY_PRIVACY_SAFETY_REVIEW.md`
- `docs/22_TEST_EXECUTION_REPORT.md`
- `docs/23_NEXT_FIX_PROMPTS.md`
- `docs/PROGRESS.md`

Known risks:

- Golden QA is synthetic and local/mock by default.
- Live OpenAI execution is still contract-only and not verified.
- Live Supabase/RLS, S3, malware scanner, Marker, Textract, workflow concurrency, doctor threshold review, legal review, and CI remain blockers.
- Dataset must expand to at least 25 internally reviewed samples before real PHI beta.

Next recommended prompt:

> Execute Lyf9 AI live staging verification using synthetic fixtures only: apply all migrations, run live Supabase/RLS and workflow concurrency tests, perform private S3 signed upload/download/delete smoke tests, verify real malware scan gating, run Marker/Textract on synthetic reports, configure live OpenAI Structured Outputs for synthetic golden evaluation, and update `docs/28_PRIVATE_BETA_RELEASE_GATE.md` with evidence. Keep private beta no-go if any P0 check is skipped or fails.

## 2026-06-12 Live Staging Verification Harness Pass

Completed:

- Added `docs/29_STAGING_ENVIRONMENT_CONTRACT.md` with required staging env for Supabase, app security, S3, malware scanner, workflow, Marker, Textract, OpenAI, observability, and sandbox payments.
- Added `scripts/verify-staging.mjs`, a synthetic-only staging verifier that refuses production, requires `APP_ENV=staging`, writes JSON/Markdown artifacts, and redacts secret values from command output.
- Added root commands:
  - `npm run verify:staging`
  - `npm run verify:staging:supabase`
  - `npm run verify:staging:rls`
  - `npm run verify:staging:workflow`
  - `npm run verify:staging:s3`
  - `npm run verify:staging:malware`
  - `npm run verify:staging:marker`
  - `npm run verify:staging:textract`
  - `npm run verify:staging:openai`
  - `npm run verify:staging:e2e`
  - `npm run eval:golden:live`
- Routed existing live RLS and live workflow harnesses through the staging verifier.
- Added direct S3 signed PUT/GET/delete smoke harness for synthetic files only.
- Kept malware, Marker, Textract, OpenAI, live golden subset, and full E2E verification blocked where live runners are not wired.
- Added `docs/30_LIVE_STAGING_VERIFICATION_REPORT.md`.
- Updated release gate, checklist, gap analysis, security review, test execution report, and next fix prompts.
- Generated blocked staging artifacts under `artifacts/staging-verification/` from a local missing-env run.

Changed files include:

- `scripts/verify-staging.mjs`
- `package.json`
- `docs/29_STAGING_ENVIRONMENT_CONTRACT.md`
- `docs/30_LIVE_STAGING_VERIFICATION_REPORT.md`
- `docs/27_LIVE_STAGING_VERIFICATION_PLAN.md`
- `docs/28_PRIVATE_BETA_RELEASE_GATE.md`
- `docs/06_PRIVATE_BETA_LAUNCH_CHECKLIST.md`
- `docs/19_PRIVATE_BETA_GAP_ANALYSIS.md`
- `docs/21_SECURITY_PRIVACY_SAFETY_REVIEW.md`
- `docs/22_TEST_EXECUTION_REPORT.md`
- `docs/23_NEXT_FIX_PROMPTS.md`
- `docs/PROGRESS.md`
- `artifacts/staging-verification/*`

Verification:

```txt
npm run typecheck
npm run lint
npm test
npm run build:web
npm run api:test
npm run api:health
npm run worker:health
npm run worker:process-once
npm run copy:scan
npm run eval:golden
npm run test:golden
npm run test:safety
npm run test:e2e:mock
APP_ENV=staging npm run verify:staging
rg "AWS_SECRET_ACCESS_KEY|AWS_ACCESS_KEY_ID|S3_REPORT_BUCKET|SUPABASE_SERVICE_ROLE_KEY|SERVICE_ROLE|service-role|OPENAI_API_KEY" apps/web/.next/static -g "*.js"
test ! -e docs/07_CODEX_PHASE_PROMPTS.md
```

Current test result: **89 passing, 2 live tests skipped** in the web/shared suite, plus **8 passing** API tests.

`APP_ENV=staging npm run verify:staging` intentionally exited nonzero and wrote blocked artifacts because live staging env is missing in this workspace.

Known risks:

- No live Supabase/RLS, workflow, S3, scanner, Marker, Textract, OpenAI, golden-live, or E2E staging check has passed yet.
- S3 direct smoke checks signed URLs and object access when env exists, but full app audit-row verification still needs deployed staging E2E.
- Malware scanner, Marker, Textract, and OpenAI live runners remain contract-only/fail-closed.
- Doctor-reviewed thresholds and legal review remain blockers.

Next recommended prompt:

> Configure Lyf9 AI staging env from `docs/29_STAGING_ENVIRONMENT_CONTRACT.md`, apply all migrations, then run `npm run verify:staging` with synthetic data only. Fix each blocked artifact in `artifacts/staging-verification/`, wire real scanner/Marker/Textract/OpenAI runners where contract-only checks block, and update `docs/30_LIVE_STAGING_VERIFICATION_REPORT.md` plus `docs/28_PRIVATE_BETA_RELEASE_GATE.md` with evidence. Keep real PHI private beta no-go until every P0 check passes.
