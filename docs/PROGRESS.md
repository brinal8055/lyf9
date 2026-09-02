# lyf9.ai Progress

## Current Phase

Staging foundation reconciliation is in progress for a **production-shaped private beta MVP**.

Supabase staging now has the current schema, live JWT-backed RLS verification, deployed Auth/session persistence checks, a backend-enforced consent gate, live-verified private S3 report storage, live GuardDuty clean/threat enforcement, live-verified atomic workflow claims, AWS Textract extraction, and a live-verified deployed Inngest saga. The product is not approved for real 30-50 user PHI until structured AI outputs, scanned-image OCR coverage, observability/privacy review, retention governance, clinical threshold review, and legal review are completed in staging.

Current private beta readiness score: **9.0/10**.

No public launch, autonomous diagnosis, prescriptions, medicine-change advice, supplement protocols, pharmacy commerce, lab booking, full doctor marketplace, mobile app, wearables, ABDM/ABHA, genetics, employer, or insurance workflows have been added.

## Completed In This Pass

### 2026-09-02 Live Inngest Staging Saga Pass

- Created an isolated Inngest custom `Staging` environment. Inngest Production was not changed.
- Stored the generated event and signing keys as encrypted Vercel secrets scoped only to Preview branch `dev`; no key was committed, printed in an artifact, exposed to the frontend, or added to Vercel Production.
- Redeployed `dev` and verified `https://lyf9-dev.vercel.app/api/health` reports `status: ok` with `inngestConfigured: true`.
- Confirmed unsigned public access to `/api/inngest` returns `401 Unauthorized`; signed Inngest synchronization succeeds.
- The first sync failed safely because `process-report` declared concurrency `10` while the account permits `5`. Commit `052815e` lowers the deployment contract to `5` and adds a regression test.
- Registered app ID `lyf9`, function ID `process-report`, event `report/confirmed`, and the exact staging endpoint in Inngest Staging.
- `npm run verify:staging:inngest` passed four tests in 52.92 seconds. The live synthetic report completed GuardDuty, Textract, and deterministic unsupported classification through the deployed saga.
- Verified the unsupported radiology fixture created no model runs, biomarker results, health insights, or AI interpretation. The harness cleaned up its S3 object and synthetic Supabase Auth user.
- Passing PHI-free evidence is stored in `artifacts/staging-verification/inngest.json`.

Verification:

```txt
npm test  # 154 passed, 7 credential-gated live tests skipped
npm run typecheck
npm run lint
npm run copy:scan
npm run build:web
npm run verify:staging:inngest  # 4 passed, including the live deployed saga and cleanup
```

Current remaining blockers: reliable signup email delivery, scanned-image OCR coverage, live structured AI outputs and golden evaluation, PHI-safe observability, retention governance, clinician-reviewed thresholds, and legal review. Production remains unchanged.

Next recommended prompt:

> Implement and verify the selected structured AI provider in staging using synthetic supported reports only. Validate extraction and explanation schemas, unsafe-language blocking, confidence and critical routing, model-run audit metadata, and golden thresholds. Keep unsupported reports fail-closed, keep real PHI and Production untouched, and stop if provider safety or schema validation fails.

### 2026-09-02 Inngest Staging Gate And Verifier Foundation

- Reconciled the manual cleanup commit `fe2fc51`; local `dev` and `origin/dev` matched and the worktree was clean before this pass.
- At the start of the pass, confirmed `/api/inngest` returned HTTP 500 and health reported `inngestConfigured: false`, establishing the fail-closed baseline before the live configuration pass above.
- Added `isInngestConfigured()` with a strict deployed rule: staging/production require both event and signing keys, and `INNGEST_DEV=1` is accepted only for local development.
- Upload initialization and completion now return HTTP 503 before accepting a new report or changing completion state when Supabase mode is active but the deployed saga is unavailable.
- Deployed health now reports `degraded` when staging/production lacks Inngest, rather than presenting the report-processing service as fully healthy.
- Added a guarded synthetic Inngest saga harness and `npm run verify:staging:inngest`. It uses the deployed authenticated upload flow, waits for GuardDuty, verifies Textract and deterministic unsupported classification, proves no AI/model/biomarker/insight rows were created, and guarantees fixture cleanup.
- Added `docs/36_INNGEST_STAGING_SETUP.md` with Preview `dev` scoping, endpoint registration, verification, and failure handling.

Verification passed so far:

```txt
npm --workspace apps/web run test -- --run src/inngest/client.test.ts src/inngest/staging-inngest-live.test.ts  # 6 passed, 1 live skipped
npm test  # 153 passed, 7 credential-gated live tests skipped
npm run typecheck
npm run lint
npm run copy:scan
npm run build:web
npm run api:test  # 8 passed
npm run api:health
npm run worker:health
git diff --check
APP_ENV=staging npm run verify:staging:inngest  # originally failed closed while staging keys were absent
```

Resolved in the live pass above: the staging-only keys, deployment, endpoint sync, concurrency compatibility fix, and guarded synthetic saga verification now pass. Production remains unchanged.

### 2026-09-02 Live Textract Document Extraction Pass

- Implemented AWS Textract asynchronous document text detection using `StartDocumentTextDetection` and bounded `GetDocumentTextDetection` polling against the existing private staging S3 bucket.
- Added explicit `DOCUMENT_PARSER_PROVIDER=textract` support so staging can use Textract as its primary beta parser while Marker remains an optional future parser.
- Added pagination, deterministic line ordering, page count, confidence, provider/version provenance, timeout handling, storage-key validation, and PHI-safe failure codes.
- Persisted `user_id`, parser provider, OCR provider, and error provenance to `extracted_documents`; no extracted report text is written to verification artifacts or audit metadata.
- Fixed the saga OCR step so a failed OCR result cannot be recorded as succeeded.
- Added deterministic provider tests and a guarded live harness that creates a synthetic CBC PDF, uploads it to staging S3, runs Textract, verifies expected text/page/confidence and the persisted extraction row, then deletes the object and synthetic Auth user in `finally`.
- The first live call failed closed with `textract_access_denied`. The staging IAM policy was then updated only with `textract:StartDocumentTextDetection` and `textract:GetDocumentTextDetection`, restricted to `ap-south-1`; no broad Textract or production access was added.
- `npm run verify:staging:textract` then passed all three checks in about 20 seconds. Production was not changed and no real PHI was used.
- Added `docs/35_TEXTRACT_STAGING_SETUP.md` with the least-privilege IAM policy, environment contract, verification procedure, cleanup behavior, and failure runbook.

Verification passed so far:

```txt
npm --workspace apps/web run test -- --run src/lib/document-extraction/textract-ocr-provider.test.ts src/lib/document-extraction/staging-textract-live.test.ts src/lib/reports/reports.test.ts  # 77 passed, 1 live skipped
npm run verify:staging:textract  # 3 passed, including live synthetic PDF extraction and cleanup
npm test  # 147 passed, 6 credential-gated live tests skipped
npm run typecheck
npm run lint
npm run copy:scan
npm run build:web
npm run api:test  # 8 passed
npm run api:health
npm run worker:health
git diff --check
```

The Python worker remains a health/status compatibility stub; the production-shaped execution path is the live-verified Inngest saga in `apps/web`. Marker is optional for the beta while Textract is selected. Scanned-image OCR coverage, live structured AI, and the other release gates remain blocked.

Known dependency risk: `npm audit` currently reports 17 findings (1 low, 4 moderate, 11 high, 1 critical). This scoped pass did not apply a broad or breaking audit fix; run a dedicated dependency review before real PHI.

Next recommended prompt:

> Implement and verify the selected structured AI provider in staging using synthetic supported reports only. Require schema-valid biomarker extraction and explanation, source traceability, confidence and critical routing, unsafe-language blocking, model-run logs, golden evaluation, and guaranteed cleanup. Leave Production and real PHI untouched.

### 2026-09-02 Live Durable Workflow Concurrency And Recovery Pass

- Applied `202609020001_workflow_rpc_hardening.sql` to staging project `wjjwdakfyigwwohbntyv`; Production was not changed.
- Restricted `claim_next_processing_job` and `release_expired_processing_locks` to `service_role`; authenticated app users are denied direct execution.
- Made expired-job recovery update the matching running step, clear stale locks, schedule retry when attempts remain, and fail closed at max attempts.
- Replaced the persistent seeded-job dependency with a self-seeding synthetic harness and exact staging project/runtime guards.
- Verified two eligible jobs were claimed exactly once across three concurrent workers using `FOR UPDATE SKIP LOCKED`; the third claim returned no job.
- Verified future retries were not claimable early, expired leases recovered, max-attempt jobs failed, step locks cleared, due retries were reclaimed, and audit events were PHI-minimal.
- Corrected worker audit attribution: background workers now use null user/role actors and record the worker identifier only in safe metadata.
- Handled PostgREST's all-null composite RPC result as an empty queue without accepting partially malformed rows.
- The harness removed its synthetic Auth user and dependent report/job fixture in `finally`.

Verification passed:

```txt
npm --workspace apps/web run test -- --run src/lib/workflow/supabase-live-workflow.test.ts src/lib/auth/supabase-foundation.test.ts  # 15 passed, 1 live skipped
npm run verify:staging:workflow  # 3 passed, including live concurrency/recovery and cleanup
npm test  # 140 passed, 5 credential-gated live tests skipped
npm run typecheck
npm run lint
npm run copy:scan
npm run build:web
npm run api:test  # 8 passed
npm run api:health
npm run worker:health
git diff --check
```

Current remaining blocker: wire and live-verify document parsing/OCR execution against synthetic reports. The database concurrency primitive is verified, but the Python worker remains a command/status stub and real PHI remains no-go until the full release gate passes.

Next recommended prompt:

> Wire Lyf9 AI staging document extraction using the existing provider contracts: run a synthetic digital PDF through the configured parser, run a synthetic scanned report through Textract fallback, persist and inspect `extracted_documents`, verify unsupported reports stop before AI, and keep Production and real PHI unchanged.

### 2026-09-02 GuardDuty S3 Malware Gate Implementation

- Selected Amazon GuardDuty Malware Protection for S3 for the existing private S3/Vercel architecture; no custom public scanner endpoint or raw-file proxy was introduced.
- Added `guardduty-s3` provider support that reads the managed `GuardDutyMalwareScanStatus` object tag.
- Mapped `NO_THREATS_FOUND` to pass, `THREATS_FOUND` to fail, `UNSUPPORTED`/`ACCESS_DENIED` to fail-closed configuration handling, and missing/`FAILED` results to retryable errors.
- Restricted scanning to opaque `reports/` keys and kept scanner metadata PHI-minimal.
- Updated Inngest behavior so asynchronous pending/unavailable GuardDuty results remain `scan_pending` and retry instead of prematurely marking a report failed.
- Added unit tests for all GuardDuty outcomes, invalid keys, and explicit provider selection.
- Added a staging-only clean/EICAR live harness with exact staging bucket/region guards and guaranteed object cleanup.
- Wired `npm run test:malware-live` and `npm run verify:staging:malware` to the new harness.
- Updated web/API/worker env examples and added `docs/34_GUARDDUTY_S3_MALWARE_SETUP.md` with the exact IAM, AWS, Vercel, verification, and failure-response procedure.
- Added `s3:GetObjectTagging` only for the staging `reports/*` prefix and kept GuardDuty administration permissions out of the app IAM principal.
- Activated GuardDuty Malware Protection for the staging `reports/` prefix in `ap-south-1`, with managed object tagging and a dedicated service role.
- Updated Vercel Preview branch `dev` only; Production was not changed.
- Passed `npm run verify:staging:malware`: clean PDF mapped to `NO_THREATS_FOUND`, EICAR mapped to `THREATS_FOUND`, and both synthetic objects were cleaned up.
- Pushed commit `fbf1c0f` to `origin/dev`; its Vercel Preview deployment reached `Ready`.
- Confirmed `https://lyf9-dev.vercel.app/api/health` returns `status: ok`, `storageProvider: s3`, `storageConfigured: true`, `storeMode: supabase-postgres`, and `store.ok: true` after deployment.

Verification passed so far:

```txt
npm --workspace apps/web run test -- src/lib/malware/guardduty-s3-malware-scanner.test.ts src/lib/malware/staging-guardduty-s3-live.test.ts  # 11 passed, 1 live skipped
npm test  # 137 passed, 5 credential-gated live tests skipped
npm run typecheck
npm run lint
npm run build:web
npm run copy:scan
npm run api:test  # 8 passed
npm run worker:health
npm run verify:staging:malware  # 4 passed, including live clean/EICAR; synthetic objects deleted
```

Current remaining blocker at that checkpoint was durable workflow concurrency; the live workflow evidence is now recorded above. Real PHI remains no-go until the full release gate passes.

Next recommended prompt:

> Run concurrent processing-job claim, lease, retry, and recovery checks against Lyf9 AI staging Postgres using synthetic records only. Confirm the GuardDuty-gated `dev` deployment never proceeds to extraction unless malware scan status is `scan_passed`; keep production unchanged. (Completed on 2026-09-02.)

### 2026-09-02 Live Private S3 Verification

- Configured the dedicated `lyf9-reports-storage-staging` bucket in `ap-south-1` with a staging-only least-privilege IAM principal and Vercel Preview `dev` configuration; Production was not changed.
- Diagnosed the first live PUT failure as unsigned metadata headers, not an IAM or bucket-policy denial.
- Updated the presigner so content type, checksum metadata, report metadata, and `AES256` encryption are all bound to the signed request.
- Added regression coverage that asserts every required upload header appears in `X-Amz-SignedHeaders`.
- Deployed commit `7307f63` to Vercel Preview `dev`; the matching deployment reached Ready.
- `npm run verify:staging:s3` passed all three live tests against staging using a synthetic PDF only.
- Verified consent, app-signed PUT, private URL denial, encryption/metadata, app-signed GET, Postgres metadata, audit events, app deletion, and cleanup.
- Independent cleanup check found zero `reports/` objects and zero `lyf9-staging-s3-*` Auth users remaining.

Current remaining P0 blocker at that checkpoint was replacing the mock/fail-closed scanner; the GuardDuty implementation and live staging evidence are now recorded above.

### 2026-09-01 Private S3 Verification Hardening

- Treated the supplied AWS/Supabase values as variable-name references only; no provided value was written to source, local env files, Vercel, Supabase, or AWS.
- Added an app-level synthetic S3 harness at `apps/web/src/lib/storage/staging-s3-api-live.test.ts` and `npm run test:s3-live`.
- The harness covers service-provisioned synthetic login, required consent, app-signed upload, S3 metadata/encryption, public URL denial, app-signed download, app delete, Postgres metadata, audit events, and guaranteed Auth/Postgres/S3 cleanup.
- Added exact staging guards: `S3_REPORT_BUCKET` must equal `STAGING_S3_BUCKET`, `PRODUCTION_S3_BUCKET` is required and must differ, and the target must be staging-specific. Production-mode verification is already refused globally.
- Removed uploaded filenames from S3/mock object keys; keys now contain only internal UUID paths and a MIME-derived extension.
- Persisted the actual S3 bucket name instead of the generic `s3-private` provider label.
- Returned every required signed PUT header, including checksum/report metadata and explicit `AES256` encryption.
- Hardened provider selection so Textract cannot be silently treated as the document parser; valid configuration is `DOCUMENT_PARSER_PROVIDER=marker` and `OCR_PROVIDER=textract`.
- Production now ignores the mock-malware override and fails closed. A localhost ClamAV endpoint is documented as local-only and cannot satisfy deployed verification.
- Wired `npm run verify:staging:s3` to the app-level harness. The live check remains unrun because the supplied values are intentionally invalid and identify a production bucket/project.
- Committed and pushed `5f3347e` to `origin/dev`; Vercel Preview deployment `DG4YmJsy7cgo1gQvX2xFTahh8A4m` reached Ready and serves `lyf9-dev.vercel.app`.
- Deployed `/api/health` remains healthy on Supabase Postgres and reports `storageProvider: s3` with `storageConfigured: false`, which correctly keeps real S3 upload verification blocked until staging-only AWS configuration exists.

Verification passed:

```txt
npm --workspace apps/web run test -- src/lib/storage/storage.test.ts src/lib/reports/reports.test.ts src/lib/storage/staging-s3-api-live.test.ts  # 74 passed, 1 live test skipped
npm run lint
npm run typecheck
npm test                 # 126 passed, 4 live tests skipped
npm run build:web
npm run api:test         # 8 passed
npm run api:health
npm run worker:health
npm run copy:scan
git diff --check
```

The production build completed successfully and its static client bundles contained no matches for server-only AWS, Supabase service-role, or Gemini secret variable names. No live AWS call was made.

### 2026-09-01 Live Staging Auth, RLS, And Consent Verification

- Applied `202609010002_consent_rpc_rls_guard.sql` to staging only. The required-consent function is now caller-scoped (`SECURITY INVOKER`), unavailable to `anon`, and executable by `authenticated` and `service_role`.
- Expanded the live RLS harness to six real Supabase Auth JWT identities: two users, two doctors, one admin, and one superadmin.
- Passed cross-user profile/report/job isolation, assigned-doctor access, role-grant boundaries, service-role writes, consent RPC behavior, audit restrictions, feedback, and analytics checks.
- Added and passed a deployed `lyf9-dev.vercel.app` Auth/API smoke test covering login/session cookies, `/api/auth/me`, user denial from admin/doctor routes, profile and questionnaire persistence, consent grant/revoke persistence, backend upload consent denial, and post-consent MIME validation.
- Verified Supabase Auth/Postgres persistence for profiles, health profiles, questionnaire responses, consents, audit events, and analytics events using synthetic data only.
- Verified cleanup independently in staging SQL: synthetic Auth users and profiles both returned zero after the run.
- Added staging project-reference guards to every Supabase/Auth verifier so a production URL or mismatched project is refused.
- Added a frontend bundle scan; no server secret or beta invite variable names appeared in `.next/static`.
- Staging's default Supabase email sender reached its rate limit during repeated diagnostics. The harness safely falls back to service-role fixture provisioning only for that exact error; custom SMTP or an approved email-limit configuration is still required before dependable beta invitations.

Changed files in this pass:

- `supabase/migrations/202609010002_consent_rpc_rls_guard.sql`
- `apps/web/src/lib/auth/supabase-live-rls.test.ts`
- `apps/web/src/lib/auth/staging-auth-api-live.test.ts`
- `apps/web/src/lib/auth/supabase-foundation.test.ts`
- `scripts/verify-staging.mjs`
- `apps/web/.env.example`
- `apps/web/package.json`
- `package.json`
- readiness and staging verification docs

### 2026-09-01 Staging Supabase Connectivity

- Applied the additive Supabase schema through `202609010001_biomarker_catalog_rls.sql` to `lyf9-staging` only.
- Verified 28 public tables, 45 biomarker catalog rows, 19 aliases, RLS on all 15 checked sensitive tables, and 39 policies.
- Scoped Supabase URL, publishable key, server secret, and beta access configuration to Vercel Preview branch `dev`; Production was not changed.
- Corrected an incomplete Vercel server credential, converted it to a protected Secret, and redeployed commit `1b1d7c2` to Preview `dev` only.
- Verified `https://lyf9-dev.vercel.app/api/health` returns `status: ok`, `store.ok: true`, `storeMode: supabase-postgres`, and `reportFileCount: 0`.
- Added safe deployed health diagnostics that report key type and stable failure codes without exposing credential values or database details.
- Kept uploads and processing fail-closed because S3, malware scanning, workflow, OCR/parser, and AI provider credentials are intentionally incomplete.

Follow-up commits:

- `9873d71` - reconcile staging Supabase and Vercel configuration.
- `1b1d7c2` - improve staging Supabase health diagnostics.

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

Normal local runs intentionally skip the three opt-in live tests. Current local result: **121 passing, 3 live tests skipped**. Current API result: **8 passing**. Separately, `npm run test:rls` and `npm run test:auth-live` both passed against staging with synthetic fixtures.

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

- Supabase Auth/Postgres/RLS foundation is implemented, applied, and live-tested in staging with user/doctor/admin/superadmin JWTs.
- Deployed login/session, onboarding persistence, route denial, consent persistence, and backend upload consent gating pass. Dependable signup email delivery remains pending custom SMTP or an approved Supabase email-rate-limit configuration.
- Local cookie auth and local JSON persistence remain as explicit local scaffold fallback when Supabase env is absent.
- S3 provider contract exists, but AWS SDK presigned URL implementation is not wired.
- Malware scanner gate exists, but production scanner is not wired.
- Workflow provider exists, but Redis/Celery or Inngest is not wired.
- Parser/OCR provider interfaces exist, but Marker/Textract are not wired.
- AI provider contract exists, but OpenAI Structured Outputs/Pydantic worker path is not wired.
- Health checks report configuration, not live database/storage/queue connectivity.

Blocked for real PHI/private beta users:

- Reliable staging signup email delivery/custom SMTP for invitation onboarding.
- S3 private bucket policy, presigned URLs, lifecycle, deletion, and KMS decisions.
- Real malware scan before extraction.
- Durable worker queue.
- Marker/OCR production path.
- OpenAI Structured Outputs production path.
- Sentry/PostHog with PHI scrubbing and privacy review.
- Legal review for DPDP, consent, disclaimers, doctor review, payments, refunds, and contracts.
- 25 internal reports across at least 5 supported categories.

## Known Risks

- Supabase Auth, database-backed roles, cross-user RLS, doctor assignment, superadmin role control, and deployed consent gating now pass with synthetic staging users.
- Supabase's default staging email sender is rate-limited; this does not weaken login/RLS evidence, but beta signup delivery is not reliable until custom SMTP or an approved quota configuration is in place.
- Next.js route handlers currently act as the backend-for-frontend for Supabase service-role operations; ensure the service-role key is server-only in deployment and never exposed as `NEXT_PUBLIC_*`.
- Local cookie auth and local JSON store remain for explicit local/development scaffold mode only and must not be used for real PHI.
- Private S3 presigning, privacy, encryption/metadata, download, audit, deletion, and cleanup pass live in synthetic staging; retention/versioning policy still needs approval before PHI.
- Mock malware scanning is not real security.
- Critical thresholds are placeholder/config-driven and need medical review.
- Model run logging exists locally but must cover every production AI call.

## Next Prompt To Run

> Implement and verify a real Lyf9 AI malware scanner in staging: replace the mock/stub with a network-reachable ClamAV service or S3 event scanner, preserve scan-pending quarantine, prove clean/infected/timeout/unavailable behavior, and keep extraction blocked unless `scan_passed`. Use synthetic files only and do not change production.

Completed staging evidence commands:

```bash
npm run test:rls
npm run test:auth-live
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

## 2026-06-22 Git Repository Sync

Completed:

- Confirmed the workspace is initialized as a Git repository on `main`.
- Confirmed `origin` points to `git@github.com:brinal8055/lyf9.git`.
- Fetched `origin` and verified local `main` is synchronized with `origin/main`.
- Confirmed the platform foundation, golden QA, and staging-verification changes are included in the existing repository history.

Verification:

```txt
git remote -v
git fetch origin
git status -sb
```

Current release verdict remains **No-go for real PHI private beta** until the live staging checks, doctor-reviewed thresholds, and legal review pass.

## 2026-09-01 Staging Environment Reconciliation

Completed:

- Fetched and normalized local tracking branches for `main`, `dev`, and `feat/frontend-overhaul`; continued work on `dev` only.
- Removed committed Supabase CLI `.temp` link metadata and ignored it so a branch checkout cannot silently retarget migrations.
- Added tracked, sanitized `.env.example` files for web, API, and worker; no real credentials are committed.
- Added `202609010001_biomarker_catalog_rls.sql` to enable authenticated read-only RLS on `biomarker_catalog` and `biomarker_aliases`.
- Added a Supabase-backed store health check and provider-aware AI/Inngest health fields.
- Applied all additive migrations through `202609010001_biomarker_catalog_rls.sql` to Supabase staging only.
- Verified staging has 28 public tables, 45 seeded biomarkers, 19 aliases, RLS on all 15 checked sensitive tables, and 39 policies.
- Added non-secret configuration plus encrypted Supabase keys and a beta invite code to Vercel Preview branch `dev` only.
- Left Vercel Production and Supabase production unchanged.

Verification:

- `npm run lint`: passed.
- `npm test`: passed, 119 tests; 2 live-environment tests skipped.
- `npm run copy:scan`: passed.
- `npm run build:web`: passed.
- `npm run typecheck`: passed after rebuilding branch-correct Next.js generated types.

Known risks:

- Migrations were applied through the staging SQL editor; Supabase CLI migration history still needs reconciliation.
- Dev deployment verification awaits a new deployment from this `dev` commit.
- Live cross-user RLS tests have not run yet.
- Staging S3 credentials, Inngest keys, real malware scanner, and live provider smoke tests remain missing.
- npm audit still reports production dependency advisories, including high-severity Next.js/transitive findings.
- Production still reports RLS advisor findings for biomarker catalog tables until this migration is separately reviewed and promoted.

Next recommended prompt:

> Deploy the verified `dev` reconciliation commit, confirm `lyf9-dev.vercel.app/api/health` uses staging Supabase, run synthetic auth/consent/RLS smoke tests, and keep upload processing fail-closed until S3, Inngest, and a real malware scanner are configured. Do not change production.

## 2026-09-02 Provider-Neutral Clinical AI Gateway

Current phase: **structured AI adapter foundation complete locally; Gemini staging integration pending**.

Completed:

- Added `ClinicalAiGateway` as the production-facing AI boundary for extraction, patient explanation, and doctor summary tasks.
- Kept Gemini, OpenAI, and mock implementations behind one explicit `AiProvider` contract with capability-level configuration status.
- Removed automatic key-based provider selection; missing/unknown deployed providers now fail closed and there is no automatic provider fallback.
- Renamed prompts and JSON schemas to provider-neutral Lyf9 clinical contracts.
- Moved Gemini credentials from the request URL to the `x-goog-api-key` header and sanitized upstream errors.
- Made health readiness depend on configured extraction and explanation capabilities instead of API-key presence alone.
- Wired Inngest and local durable workflows through the gateway; provider-specific model env lookup no longer exists in orchestration.
- Added authoritative disclaimer handling, exact persisted biomarker source tracing, deterministic marker facts, and conservative human-review routing for soft-review/unmapped results.
- Logged latency and sanitized failure metadata for extraction and explanation attempts; token/cost fields remain nullable pending normalized adapter usage metadata.
- Added provider-neutral synthetic live commands: `npm run verify:staging:ai` and `npm run eval:golden:live`.

Verification:

- `npm run typecheck`: passed.
- `npm run lint`: passed.
- `npm test`: passed, **159 tests passed and 8 explicitly gated live tests skipped**.
- `npm run build:web`: passed; existing Next.js ESLint-plugin warning remains.
- `npm run copy:scan`: passed.
- `npm run api:test`: passed, **9 tests**.
- `npm run api:health` and `npm run worker:health`: passed; health output now reports selected AI provider rather than OpenAI-specific state.
- No live Gemini request was made and no staging/production environment was changed.

Known risks:

- Gemini structured output has not yet been exercised with the staging account/key/quota.
- The live golden runner is implemented but has not produced staging evidence.
- Provider token usage, request IDs, finish reasons, and cost estimates are not normalized into model runs yet.
- The golden dataset still needs at least 25 human-reviewed samples, clinician-approved critical thresholds, scanned-image OCR coverage, PHI-safe observability, retention governance, and legal review.

Next recommended prompt:

> Configure Gemini server-only variables in Vercel Preview branch `dev` only, redeploy staging, confirm `/api/health` reports Gemini extraction and explanation capabilities ready, run `npm run verify:staging:ai` with synthetic CBC data, then run `npm run eval:golden:live`. Do not change Production, do not use real PHI, and stop if schema, source trace, safety, or accuracy thresholds fail.
