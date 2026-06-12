# Next Fix Prompts

## 0. Execute Live Staging Release Gate

Context:
Lyf9 AI now has a synthetic golden dataset and local release gate. The current recommendation remains no-go for real PHI because live staging checks are missing.

Files likely to touch:

- `docs/27_LIVE_STAGING_VERIFICATION_PLAN.md`
- `docs/28_PRIVATE_BETA_RELEASE_GATE.md`
- `docs/29_STAGING_ENVIRONMENT_CONTRACT.md`
- `docs/30_LIVE_STAGING_VERIFICATION_REPORT.md`
- `scripts/verify-staging.mjs`
- staging env/deployment configuration

Objective:
Run the full live staging verification plan using synthetic fixtures only.

Implementation steps:

1. Apply all migrations through `202606120001_schema_first_ai_layer.sql`.
2. Configure env exactly as `docs/29_STAGING_ENVIRONMENT_CONTRACT.md` specifies.
3. Run `npm run verify:staging`.
4. Fix each blocked section until all live checks pass.
5. Attach artifacts from `artifacts/staging-verification/` to `docs/30_LIVE_STAGING_VERIFICATION_REPORT.md`.
6. Run golden evaluation and update release gate evidence.

Acceptance criteria:

- Every P0 live check in `docs/28_PRIVATE_BETA_RELEASE_GATE.md` has passing evidence.
- Private beta remains no-go if any P0 check fails or is skipped.

Tests:

- `npm run eval:golden`
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
- `RUN_LIVE_SUPABASE_RLS=true npm run test:rls`
- `RUN_LIVE_SUPABASE_WORKFLOW=true LIVE_SUPABASE_WORKFLOW_JOB_ID=<job-id> npm run test:workflow-live`
- synthetic S3/malware/Marker/Textract/OpenAI smoke checks

## 0D. Wire Live Provider Runners Reported Blocked By Staging Verifier

Context:
The staging verifier now exists and fails closed, but malware scanner, Marker, Textract, OpenAI live execution, and full staging E2E remain blocked where providers are contract-only.

Files likely to touch:

- `apps/web/src/lib/malware/`
- `apps/web/src/lib/document-extraction/marker-provider.ts`
- `apps/web/src/lib/document-extraction/textract-ocr-provider.ts`
- `apps/web/src/lib/ai/openai-structured-provider.ts`
- `scripts/verify-staging.mjs`
- `docs/30_LIVE_STAGING_VERIFICATION_REPORT.md`

Objective:
Convert contract-only staging checks into real synthetic live provider checks without weakening fail-closed behavior.

Implementation steps:

1. Wire a real malware scanner provider or an approved fail-closed/manual staging process.
2. Wire Marker command/API execution for synthetic digital PDFs.
3. Wire Textract OCR execution for synthetic scanned fixtures.
4. Wire OpenAI Structured Outputs execution for synthetic extracted text only.
5. Extend `npm run verify:staging:e2e` to run supported and unsupported synthetic flows through the deployed app.
6. Update `docs/30_LIVE_STAGING_VERIFICATION_REPORT.md` with artifacts and no-go/go evidence.

Tests:

- `npm run verify:staging:malware`
- `npm run verify:staging:marker`
- `npm run verify:staging:textract`
- `npm run verify:staging:openai`
- `npm run verify:staging:e2e`
- `npm run eval:golden:live`

Acceptance criteria:

- Real scanner blocks unsafe files or approved fail-closed process is documented.
- Marker and Textract never silently fall back to mock in staging.
- OpenAI live calls produce schema-valid outputs, model runs, disclaimers, and safe language.
- Unsupported reports do not reach OpenAI.
- Private beta remains no-go unless every P0 command passes.

What not to change:

- Do not use real PHI.
- Do not relax safety filters or unsupported report blocking.

## 0B. Expand Golden Dataset And Doctor Threshold Review

Context:
The current golden dataset is synthetic and useful for regression, but too small for real PHI private beta.

Files likely to touch:

- `tests/golden/`
- `docs/26_GOLDEN_DATASET_EVALUATION_REPORT.md`
- `docs/15_MEDICAL_SAFETY_AND_CLINICAL_BOUNDARIES.md`

Objective:
Expand to at least 25 internally reviewed synthetic or properly consented internal samples and review critical thresholds with a qualified doctor.

Implementation steps:

1. Add more CBC/lipid/thyroid/glucose/liver/kidney/vitamin edge cases.
2. Add low-confidence and OCR-style synthetic cases.
3. Add critical-rule edge cases.
4. Add doctor-reviewed expected labels.
5. Re-run `npm run eval:golden`.
6. Update release gate.

Acceptance criteria:

- Golden metrics meet thresholds.
- Critical thresholds are signed off or explicitly disabled from final routing.
- No unsafe medical action wording passes the safety suite.

## 0C. Add CI Release Gate

Context:
The release gate is currently manual.

Objective:
Add CI that runs typecheck, lint, tests, build, copy scan, golden eval, safety eval, and mock E2E.

Acceptance criteria:

- CI fails on type/lint/test/build/copy-scan failures.
- CI uploads or preserves golden eval artifacts.
- Live-provider tests remain opt-in and are not faked.

## 1. Validate Supabase Auth, Postgres Persistence, And RLS In Staging

Context:
The app now has a production-shaped Supabase Auth/Postgres/RLS foundation in code, with local fallback retained for scaffold development. Real PHI remains blocked until this path is applied and validated in a staging Supabase project with real JWTs.

Files likely to touch:

- `apps/web/src/lib/auth/*`
- `apps/web/src/app/api/auth/*`
- `apps/web/src/lib/onboarding/*`
- `apps/web/src/lib/reports/repository.ts`
- `supabase/migrations/202606060001_private_beta_core.sql`
- `apps/web/.env.example`

Objective:
Apply and validate the Supabase foundation while keeping local fixtures for development tests only.

Implementation steps:

1. Create/configure the staging Supabase project.
2. Apply migrations `202606060001_private_beta_core.sql` and `202606060002_auth_persistence_rls_hardening.sql`.
3. Create real user, doctor, admin, and superadmin accounts.
4. Confirm signup/login resolves Supabase sessions and trusted `user_roles`.
5. Validate profile/questionnaire/consent writes in Postgres.
6. Validate report metadata, lab report, processing job, processing job step, feedback, analytics, and audit writes in Postgres.
7. Add live RLS tests for user, doctor, admin, and superadmin JWTs.
8. Confirm local JSON store is not used when Supabase env is configured.

Acceptance criteria:

- No staging path uses email-inferred role trust.
- User A cannot read User B data.
- Doctor sees only assigned reports.
- Admin/superadmin roles are server-verified.
- Required consent is server-persisted before upload.
- Existing tests pass and live RLS tests are added.

Tests:

- `npm run typecheck`
- `npm run lint`
- `npm test`
- RLS test suite
- Auth smoke test

What not to change:

- Do not add mobile, wearables, ABDM, genetics, pharmacy, supplements, lab booking, or public paid launch.

## 2. Fix Private S3 Storage And Malware Scanning

Context:
StorageProvider exists, but S3 provider does not generate presigned URLs and malware scanning is mock-only.

Files likely to touch:

- `apps/web/src/lib/reports/providers/storage.ts`
- `apps/web/src/lib/reports/providers/malware.ts`
- `apps/web/src/app/api/reports/upload-init/route.ts`
- `apps/web/src/app/api/reports/[reportFileId]/download/route.ts`
- `apps/api/app/*`

Objective:
Implement production private storage and real scan gate.

Implementation steps:

1. Move S3 presigning into server/API-only code.
2. Generate short-lived upload/download URLs.
3. Store object keys only.
4. Add scan pending/pass/fail persistence.
5. Wire ClamAV or S3 event-based scan provider.
6. Block extraction unless scan passed.
7. Audit signed URL generation and raw report access.

Acceptance criteria:

- No public file URLs.
- S3 upload/download works in staging.
- Malware scan failure blocks extraction.
- Raw report access is audited.

Tests:

- Upload validation tests.
- Signed URL expiry tests.
- Malware pass/fail tests.
- Private URL manual check.

What not to change:

- Do not implement unsupported report interpretation.

## 3. Fix Durable Workflow And Worker Processing

Context:
Processing runs synchronously in the local web repository. Worker is a smoke scaffold.

Files likely to touch:

- `apps/web/src/lib/reports/providers/workflow.ts`
- `apps/worker/app/worker.py`
- `apps/worker/app/providers/*`
- `apps/web/src/lib/reports/repository.ts`

Objective:
Move report processing to durable queue-backed worker execution.

Implementation steps:

1. Choose Redis/Celery or Inngest provider.
2. Enqueue processing after upload completion.
3. Persist every step in `processing_job_steps`.
4. Add retry and mark-failed operations.
5. Expose admin retry/failure visibility.
6. Keep idempotency by user, checksum, and processing version.

Acceptance criteria:

- Upload route does not run full extraction synchronously.
- Worker can process one queued job.
- Retries are visible and audited.
- Failed jobs appear in admin queue.

Tests:

- Job enqueue test.
- Worker process test.
- Retry/failure test.
- Admin queue test.

What not to change:

- Do not add autonomous medical behavior.

## 4. Fix Marker/OCR And Structured AI Providers

Context:
Marker/OCR and OpenAI providers are currently interfaces or local deterministic scaffolds.

Files likely to touch:

- `apps/worker/app/providers/document.py`
- `apps/worker/app/providers/ai.py`
- `apps/web/src/lib/reports/biomarkers.ts`
- `apps/web/src/lib/reports/safety.ts`
- `docs/13_AI_STRUCTURED_OUTPUTS_AND_MODEL_RUNS.md`

Objective:
Implement real extraction and schema-validated AI output behind provider interfaces.

Implementation steps:

1. Add Marker provider for digital PDFs.
2. Add OCR fallback provider.
3. Add Pydantic schemas for biomarker extraction, explanation, and doctor summary.
4. Add OpenAI Structured Outputs provider.
5. Log every model run.
6. Block invalid or unsafe output from publication.

Acceptance criteria:

- Fixture and real sample documents produce validated extracted documents.
- Invalid AI output fails closed.
- Model runs include prompt version, hashes, status, latency, and output JSON.
- Unsupported reports do not receive AI-only insights.

Tests:

- Parser fixture tests.
- OCR-required tests.
- Schema validation tests.
- Unsafe output tests.
- Model-run logging tests.

What not to change:

- Do not create autonomous diagnosis or prescription flows.

## 5. Fix Biomarker Catalog Coverage

Context:
The current catalog includes core markers but misses required v1 markers including MCV, MCH, MCHC, RDW, neutrophils, lymphocytes, VLDL, cholesterol ratio, free thyroid markers, postprandial/random glucose, insulin, ALP, GGT, albumin, globulin, BUN, iron, and TIBC.

Files likely to touch:

- `apps/web/src/lib/reports/catalog.ts`
- Supabase seed migration
- `apps/web/src/lib/reports/reports.test.ts`

Objective:
Complete v1 catalog and alias coverage while preserving original extracted values.

Implementation steps:

1. Add missing canonical markers and aliases.
2. Add SQL seed migration.
3. Add alias normalization tests.
4. Keep critical thresholds doctor-reviewed or clearly placeholder.

Acceptance criteria:

- Required v1 marker list is covered.
- Aliases resolve to canonical keys.
- Original raw names/values/ranges remain preserved.

Tests:

- Alias tests.
- Fixture extraction tests.

What not to change:

- Do not add unsupported report interpretation.

## 6. Fix Design DNA And UX Polish

Context:
The design foundation is good, but phase-language copy, missing motion/reduced-motion handling, basic loading/error states, and admin density reduce polish.

Files likely to touch:

- `apps/web/src/app/page.tsx`
- `apps/web/src/components/admin/admin-reports.tsx`
- `apps/web/src/components/reports/*`
- `apps/web/src/app/globals.css`

Objective:
Make the UI feel production-quality for a controlled beta without adding features.

Implementation steps:

1. Remove implementation-phase wording from public UI.
2. Add polished empty/loading/error states.
3. Add reduced-motion-aware subtle landing animation.
4. Add admin queue filters/tabs/search.
5. Run browser screenshots for landing, app, upload, result, admin, doctor.

Acceptance criteria:

- Public copy is user-facing, not implementation-facing.
- Screens fit mobile and desktop.
- Safety disclaimers remain visible.
- Browser screenshot QA passes.

Tests:

- `npm run build:web`
- Browser manual screenshot review
- Copy scan

What not to change:

- Do not add long-term excluded product areas.

## 7. Fix CI And Beta Test Coverage

Context:
Automated local tests pass, but there is no CI, no RLS tests, no E2E, no worker tests, and no golden report dataset.

Files likely to touch:

- `.github/workflows/*`
- `apps/web/src/lib/reports/*.test.ts`
- `apps/api/tests/*`
- `apps/worker/tests/*`
- `supabase/tests/*`

Objective:
Add release confidence for private beta.

Implementation steps:

1. Add CI for lint, typecheck, unit tests, build, copy scan.
2. Add worker tests.
3. Add RLS tests.
4. Add E2E smoke tests.
5. Add internal report fixture/golden dataset runner.

Acceptance criteria:

- CI runs on every PR.
- RLS and route access tests pass.
- Golden fixtures validate extraction and safety behavior.

Tests:

- CI run
- Local full suite

What not to change:

- Do not weaken safety filters to make tests pass.
