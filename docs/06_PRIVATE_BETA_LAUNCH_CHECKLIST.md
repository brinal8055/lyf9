# lyf9.ai Private Beta Launch Checklist

Use this checklist for the first 30-50 early users. This is a private beta gate, not a public launch gate.

## Audit Verdict

Current decision: **No-go for real PHI private beta**.

Private beta readiness score from latest local golden gate: **84/100**.

This repo is ready for scaffold/operator rehearsal and now has a production-shaped Supabase Auth/Postgres/RLS foundation, private report storage provider layer, durable workflow foundation, document extraction/classification foundation, schema-first AI workflow, synthetic golden QA gate, and live staging verification command layer in code. Real 30-50 user testing remains blocked by applying/testing Supabase in staging, configuring/verifying a private S3 bucket, real malware scanning, staging worker concurrency verification, live Marker/Textract/OpenAI verification, expanded human-reviewed golden QA, observability, doctor threshold review, and legal review.

## Current Readiness Matrix

| Area | Status | Owner | Next step |
| --- | --- | --- | --- |
| Auth/RBAC | Partially ready | Engineering/DevOps | Supabase Auth and database-backed roles are implemented; configure staging Supabase and validate real JWT role checks. |
| Database/RLS | Partially ready | Backend/DevOps | Apply and test migrations `202606060001_private_beta_core.sql` and `202606060002_auth_persistence_rls_hardening.sql` in staging with user/doctor/admin/superadmin JWTs. |
| Storage security | Partially ready | Backend/DevOps | StorageProvider, S3 presigning, mock provider, signed download, and delete flow exist; configure private S3 bucket and verify staging upload/download/delete before real PHI. |
| Malware scanning | Blocked | Backend/Security | Provider abstraction and scan gate exist; replace mock/stub with ClamAV or S3 event scanner before real PHI. |
| Upload flow | Partially ready | Engineering | Upload starts as `upload_pending`, validates MIME/size, checks persisted required consent when Supabase is configured, audits signed URLs, and finalizes via upload-complete; staging S3 verification remains. |
| Processing pipeline | Partially ready | Backend/Platform | Database workflow provider, idempotency, leases, retry scheduling, blocked state, and scan-gated process-once exist; verify against staging Postgres and real worker concurrency. |
| Marker/OCR | Partially ready | AI/Backend | Provider contracts and durable steps exist; configure and verify Marker and Textract fallback in staging. |
| AI structured outputs | Blocked | AI/Backend | Schema-first local path exists; wire OpenAI Structured Outputs and Pydantic validation in worker. |
| Safety rules | Partially ready | AI/Safety/Medical | Unsafe-language filter and routing exist; doctor-review critical thresholds with real report set. |
| Unsupported report handling | Partially ready | AI/Safety | Unsupported reports are blocked from AI-only interpretation; expand internal fixture coverage. |
| Admin correction | Partially ready | Ops/Engineering | Correction flow preserves originals and audits locally; migrate to Postgres. |
| Doctor review | Partially ready | Medical/Ops/Engineering | Assigned review flow exists; validate with Supabase-backed doctor accounts and contracts. |
| Audit logs | Partially ready | Engineering/Ops | Supabase audit writes exist for auth/profile/consent/upload/report access/feedback/analytics metadata; validate append-only behavior and admin review access in staging. |
| Model runs | Partially ready | AI/Backend | Local model run logs exist; ensure all OpenAI calls log status/cost/latency/hash. |
| Data export/delete | Partially ready | Engineering/Legal | Internal flow exists; DPDP retention/deletion process needs legal review. |
| Feedback capture | Ready for scaffold beta | Product/Ops | Feedback capture and admin view exist; triage daily. |
| Analytics | Ready for scaffold beta | Product/Engineering | Local analytics events exist; pick PostHog or internal-only path after privacy review. |
| Error monitoring | Partially ready | Engineering | Logging helper and env contract exist; wire Sentry with PHI scrubbing. |
| Payments sandbox | Ready for scaffold beta | Product/Legal | Razorpay placeholder/sandbox only; do not enable real public charges. |
| Legal review | Blocked | Founders/Legal | Complete DPDP, doctor, disclaimer, payment/refund, and public claims review before public paid launch. |
| Deployment | Partially ready | DevOps | Deployment docs and health checks exist; configure real Supabase/S3/Redis/Sentry probes. |
| Runbook | Ready for scaffold beta | Ops/Product | Runbook exists; rehearse failed report, unsafe output, pause upload, export/delete paths. |

## Supabase Foundation Gate

| Item | Status | Next step |
| --- | --- | --- |
| Supabase Auth | Partially ready | Code path exists; configure staging Supabase and validate real signup/login/JWT sessions. |
| Postgres persistence | Partially ready | Migrations and service-role repository paths exist; apply migrations and verify persisted profile/consent/report/job/audit rows in staging. |
| RLS policies | Partially ready | Policies reviewed and hardening migration improved; run live JWT-backed RLS harness before real PHI. |
| RLS tests | Blocked | Opt-in harness exists at `npm run test:rls`; run with `RUN_LIVE_SUPABASE_RLS=true` and staging Supabase env. |
| Role model | Partially ready | `user`, `doctor`, `admin`, `superadmin` model exists; verify superadmin-only role changes in staging. |
| Consent gate | Partially ready | Backend upload-init checks persisted consent when Supabase is configured; run deployed staging upload-init tests for missing/partial/full consent. |
| Audit logs | Partially ready | Consent, blocked/successful upload-init, upload metadata, signed URL, report access, feedback, analytics, and API audit helper writes exist; verify live staging rows and PHI-safe metadata. |
| Backend service-role isolation | Partially ready | Service role is server-only in code/env examples; verify deployment secrets and runtime bundle scoping. |
| Frontend secret safety | Partially ready | Public client uses anon config and static test blocks `NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY`; inspect built bundle in staging. |
| Local fallback hardening | Ready | Local cookie fallback now requires `APP_ENV=local/development` and `ENABLE_LOCAL_AUTH_FALLBACK=true`; staging/production fail closed when Supabase is missing. |

## Private Storage Gate

| Item | Status | Next step |
| --- | --- | --- |
| StorageProvider abstraction | Ready | Keep route handlers behind provider interface. |
| S3 provider | Partially ready | Code signs S3 upload/download URLs; configure private staging bucket, IAM least privilege, lifecycle, and KMS decision. |
| Mock/local provider | Ready | Allowed only for local/development/test unless explicitly overridden. |
| Backend file validation | Ready | PDF/JPG/PNG only; empty, unknown, SVG, ZIP, DOC/DOCX, executable, and oversized files rejected server-side. |
| Signed upload URLs | Partially ready | Flow implemented; verify with staging S3 object metadata and bucket policy. |
| Signed download URLs | Partially ready | Owner/assigned doctor/admin/superadmin authorization implemented; verify against staging Supabase roles. |
| Malware scan gate | Partially ready | Processing is blocked unless scan passes; real scanner not configured. |
| Raw report access audit | Partially ready | Download request/generated/denied events are written; validate live audit rows in staging. |
| Delete flow | Partially ready | Soft delete plus provider delete exists; verify S3 delete and retention policy in staging. |

## Durable Workflow Gate

| Item | Status | Next step |
| --- | --- | --- |
| WorkflowProvider abstraction | Ready | Keep workflow logic behind provider methods. |
| DatabaseWorkflowProvider | Partially ready | Local/store-backed provider and Supabase atomic claim provider exist; verify Supabase/Postgres implementation in staging. |
| Durable job records | Partially ready | Migrations `202606060004_durable_processing_workflow.sql` and `202606060005_atomic_processing_job_claim.sql` add workflow fields and RPC claim functions; apply in staging. |
| Job locking/leases | Partially ready | Atomic `FOR UPDATE SKIP LOCKED` claim RPC exists; run live concurrent staging worker test before PHI. |
| Retry/backoff | Ready in code | Default 3 attempts with immediate/+1 minute/+5 minute schedule. |
| Failed/blocked visibility | Partially ready | Admin helper exposes blocked/failed jobs; dedicated UI retry/cancel controls remain a gap. |
| Scan-gated processing | Partially ready | `malware_scan` is durable first step; real scanner still missing. |
| Marker extraction | Partially ready | Provider contract and mock parser exist; configure and verify Marker in staging. |
| OCR fallback | Partially ready | OCR provider contract and Textract stub exist; configure and verify Textract in staging. |
| Report classification | Ready in code | Deterministic supported/limited/unsupported classifier is tested locally. |
| Unsupported report handling | Ready in code | Unsupported/unknown reports block safely and do not proceed to AI. |
| Admin extraction visibility | Partially ready | Admin parser output and OCR/unknown queue counts exist; dedicated retry controls remain a UI gap. |
| Schema-first AI workflow | Partially ready | Biomarker extraction, normalization, validation, safety, explanation, and review routing run locally with mock AI; live OpenAI staging verification remains blocked. |

## Product Go/No-Go

- [ ] Landing page uses lyf9.ai / Lyf9 AI branding only.
- [x] Signup/login works in local scaffold mode and has Supabase Auth path implemented.
- [x] User health profile has server-side Supabase persistence when configured.
- [x] Questionnaire captures medical history, symptoms, lifestyle, and goals with server-side Supabase persistence when configured.
- [x] Required consents are collected before upload and checked server-side when Supabase is configured.
- [ ] User can revoke optional consents.
- [x] PDF/JPG/PNG upload works in local/mock flow.
- [x] Unsupported file types are blocked server-side.
- [ ] Uploaded files are stored privately in verified staging S3.
- [x] User can view report processing status.
- [ ] User can view AI-assisted explanation for supported reports.
- [ ] User can see source biomarker values for insights.
- [ ] User can see report history/health timeline.
- [ ] User can create or accept a retest reminder.
- [x] User can submit feedback.

## Report Scope Go/No-Go

- [ ] Supported report types are listed in UI.
- [x] CBC classified as supported.
- [x] Lipid profile classified as supported.
- [x] Thyroid profile classified as supported.
- [x] Liver function test classified as supported.
- [x] Kidney function test classified as supported.
- [x] HbA1c/glucose classified as supported.
- [x] Vitamin D/B12/ferritin classified as supported.
- [x] Full-body reports are classified only through supported panels.
- [ ] Basic urine routine is clearly marked limited beta if enabled.
- [ ] Radiology, ECG/EEG, biopsy, pregnancy/fetal, pediatric, cancer-marker standalone, emergency diagnosis, and prescription-change advice are blocked from AI-only interpretation.

## AI And Safety Go/No-Go

- [x] Structured extraction schema validates output in automated tests.
- [x] Explanation schema validates output in automated tests.
- [x] Invalid structured output does not publish.
- [x] Low-confidence biomarkers route to admin/manual review.
- [x] Critical values route to doctor/admin review.
- [x] Unsafe language filter blocks diagnosis/prescription language.
- [x] AI-only output does not diagnose in tested deterministic paths.
- [x] AI-only output does not prescribe in tested deterministic paths.
- [x] AI-only output does not recommend medicine changes in tested deterministic paths.
- [x] AI-only output does not create supplement treatment protocols in tested deterministic paths.
- [x] Every generated insight stores source biomarker IDs where possible.
- [x] Disclaimer is persisted on generated insights.
- [ ] Live OpenAI Structured Outputs provider is configured and tested in staging.
- [x] Synthetic golden dataset review passes locally.
- [ ] Golden dataset is expanded to at least 25 internally reviewed samples before real PHI beta.
- [ ] Live OpenAI golden evaluation passes on synthetic staging data.

## Golden Dataset Gate

| Item | Status | Evidence | Next step |
| --- | --- | --- | --- |
| Golden dataset folder | Ready | `tests/golden/` | Expand beyond 13 synthetic report fixtures before PHI beta. |
| Expected labels | Ready | `tests/golden/expected/` | Add doctor-reviewed labels for more edge cases. |
| Unsafe output suite | Ready | `tests/golden/unsafe_outputs/` | Keep this at 100% pass. |
| Golden eval command | Ready | `npm run eval:golden` | Add to CI. |
| Machine report | Ready | `tests/golden/golden-eval-results.json` | Regenerate on every QA pass. |
| Human report | Ready | `docs/26_GOLDEN_DATASET_EVALUATION_REPORT.md` | Review before release decision. |
| Release gate | Ready | `docs/28_PRIVATE_BETA_RELEASE_GATE.md` | Keep decision no-go until P0 live checks pass. |

## Live Staging Verification Gate

| Item | Status | Evidence | Next step |
| --- | --- | --- | --- |
| Staging environment contract | Ready | `docs/29_STAGING_ENVIRONMENT_CONTRACT.md` | Populate staging secrets in deployment secret manager only. |
| Live verification orchestrator | Ready | `npm run verify:staging` | Run only with `APP_ENV=staging`; it refuses production and missing env. |
| Supabase migration check | Blocked | `npm run verify:staging:supabase` | Configure staging Supabase and run table/schema smoke. |
| RLS/JWT live check | Blocked | `npm run verify:staging:rls` | Seed staging users and run the live RLS harness. |
| Workflow concurrency check | Blocked | `npm run verify:staging:workflow` | Seed a queued job and verify atomic claim behavior. |
| S3 private smoke check | Blocked | `npm run verify:staging:s3` | Configure private bucket/IAM; then verify app audit rows through E2E. |
| Malware scanner live check | Blocked | `npm run verify:staging:malware` | Wire a real scanner; current staging-safe behavior is fail-closed. |
| Marker live check | Blocked | `npm run verify:staging:marker` | Wire Marker command/API execution. |
| Textract live check | Blocked | `npm run verify:staging:textract` | Wire Textract OCR execution or approved manual fallback. |
| OpenAI live check | Blocked | `npm run verify:staging:openai` | Wire live Structured Outputs execution with synthetic text only. |
| Live golden subset | Blocked | `npm run eval:golden:live` | Enable only after live OpenAI execution is wired. |
| Live report | Ready as template | `docs/30_LIVE_STAGING_VERIFICATION_REPORT.md` | Replace blocked statuses with evidence only after commands pass. |

## Admin Go/No-Go

- [ ] Admin can view uploaded reports.
- [ ] Admin can view processing jobs.
- [ ] Admin can inspect failed extraction.
- [ ] Admin can inspect low-confidence extraction.
- [ ] Admin can manually correct biomarker data.
- [ ] Manual corrections are audited.
- [ ] Admin can view unsupported report queue.
- [x] Admin can view feedback.

## Doctor Review Go/No-Go

- [x] Doctor role exists in the Supabase role model and route guards.
- [ ] Doctor can see assigned reports only in live staging RLS/JWT tests.
- [ ] Doctor can view report, user context, biomarkers, and AI draft.
- [ ] Doctor can approve.
- [ ] Doctor can edit and approve.
- [ ] Doctor can reject.
- [ ] Doctor can request more information.
- [ ] Doctor-reviewed badge appears only after completed review.
- [ ] Doctor actions are audited.

## Privacy And Audit Go/No-Go

- [x] Purpose-wise consent records are stored in Supabase when configured.
- [x] Consent version and legal text hash are stored.
- [x] Audit logs exist for upload metadata and signed URL generation.
- [x] Audit logs exist for report access metadata.
- [x] Audit logs exist for AI/model runs in the local/test workflow.
- [ ] Audit logs exist for admin corrections.
- [ ] Audit logs exist for doctor review actions.
- [x] Private file URLs are short-lived in code; staging S3 verification pending.
- [ ] Application logs do not include raw PHI.
- [x] Data deletion/export workflow exists at least internally.

## Payment/Pricing Go/No-Go

- [x] Pricing placeholder or sandbox payment is implemented.
- [x] Payment records persist correctly.
- [x] AI-only and doctor-review purchase intent can be represented.
- [x] Paid doctor-reviewed flow is not publicly launched before legal review.

## Feedback And Learning Go/No-Go

- [x] Feedback form exists on report result page.
- [x] Feedback form exists in dashboard.
- [ ] Admin can triage feedback.
- [x] Feedback captures explanation helpfulness.
- [ ] Feedback captures extraction errors.
- [ ] Feedback captures unsafe-language concerns.
- [x] Feedback captures doctor review experience.

## Private Beta Minimum Metrics

Before inviting 30-50 users:

- [ ] 25 internal reports processed.
- [ ] At least 5 supported report categories tested.
- [ ] Upload to result page works end to end.
- [ ] 0 known AI-only diagnosis/prescription outputs in reviewed samples.
- [ ] 100% source traceability for published insights in tested reports.
- [ ] Admin correction works.
- [ ] Doctor approve/edit/reject/request-more-info works.

Before expanding beyond private beta:

- [ ] 100 reports tested.
- [ ] Common biomarker extraction accuracy above 95%.
- [ ] Value/unit accuracy above 97% for common supported biomarkers.
- [ ] Critical flag false negative target remains 0.
- [ ] Legal review completed for public launch, DPDP, telemedicine, disclaimers, doctor contracts, pricing/refunds, and any partner flows.

## Decision

```txt
Private beta decision:
[ ] Go
[ ] No-go

Date:
Owner:
Notes:
```
