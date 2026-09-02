# Private Beta Gap Analysis

## Verdict

**Not ready for a 30-50 user private beta with real PHI.**

The product can be used for internal scaffold rehearsal. The end-to-end user journey exists, but core PHI safety infrastructure is not production-ready.

Private beta readiness score including current live staging evidence: **88/100**

## P0 Blockers Before Any Real PHI

The GuardDuty malware blocker is resolved for synthetic staging. The remaining no-go items are tracked below because the complete upload-to-reviewed-result path is not yet live-verified.

## P1 Blockers Before 30-50 Users

| Blocker | Evidence | Required Fix |
| --- | --- | --- |
| Signup email delivery is rate-limited | Live `npm run test:auth-live` staging run | Configure custom SMTP or an approved Supabase Auth email quota, then require public invite signup to pass without service-role fixture provisioning. |
| Inngest staging runner not rehearsed | `apps/web/src/inngest/process-report.ts`, `apps/web/src/inngest/staging-inngest-live.test.ts` | Fail-closed gates and a live verifier exist. Configure staging-only event/signing keys, register the deployed route, and pass `npm run verify:staging:inngest`. The Python worker is a health/status compatibility stub, not the selected runner. |
| Scanned-image OCR coverage incomplete | `apps/web/src/lib/document-extraction/staging-textract-live.test.ts` | Textract primary extraction is live-verified on a synthetic PDF; add a synthetic scanned/image report before broadening intake. Marker is optional while Textract is selected. |
| Live OpenAI structured path not verified | `apps/web/src/lib/ai/openai-structured-provider.ts` | Configure OpenAI models in staging, execute live structured-output calls, and run golden dataset QA. |
| Golden dataset too small for PHI beta | `tests/golden/`, `docs/26_GOLDEN_DATASET_EVALUATION_REPORT.md` | Expand beyond synthetic smoke coverage to at least 25 internally reviewed samples and retain 100% safety gate pass. |
| Observability not production-ready | `apps/web/src/lib/observability/logger.ts` | Sentry + PHI scrubbing + alert routing. |
| Health checks shallow | `apps/web/src/app/api/health/route.ts`, `apps/api/app/main.py`, `apps/worker/app/worker.py` | Real database/storage/queue connectivity probes. |
| Full processing workflow E2E is missing | current test setup | Auth/onboarding/consent and private S3 pass live; add scanner, processing, admin correction, and doctor action E2E. |
| No CI | no `.github` workflow | Add CI for lint/typecheck/test/build/copy scan. |

## Fixed Or Improved In The Staging Verification Pass

- Live private S3 verification passed upload, encryption/metadata, public denial, download, DB/audit evidence, deletion, and cleanup against the staging-only bucket.
- The presigned PUT binds every required content, metadata, and encryption header; regression tests inspect `X-Amz-SignedHeaders`.
- Independent cleanup confirmed zero synthetic report objects and zero synthetic S3 verifier users.
- Added a destructive app-level S3 harness with exact staging project/app/bucket guards and guaranteed cleanup.
- S3 object keys are opaque, persisted bucket metadata is accurate, and signed PUT requirements include encryption and metadata headers.
- Production cannot opt into the mock malware scanner; staging mock remains synthetic-only and does not satisfy the release gate.
- Added a real GuardDuty S3 tag provider, retryable pending/failure behavior, deterministic status mapping, and a staging-only clean/EICAR live harness with guaranteed cleanup.
- Activated GuardDuty Malware Protection for the staging `reports/` prefix, enabled managed object tags, granted only staging-prefix `s3:GetObjectTagging`, and passed the clean/EICAR live verifier with cleanup.
- Provider names now fail closed instead of treating `textract` as a Marker parser alias.
- Staging Supabase and the Vercel `dev` deployment are configured without changing Production.
- Migrations through `202609010002_consent_rpc_rls_guard.sql` are applied in staging.
- Live RLS passed with two users, two doctors, one admin, and one superadmin using real Supabase JWTs.
- Deployed login/session, profile, health profile, questionnaire, consent, audit, analytics, route denial, and backend upload consent-gate checks passed.
- The required-consent RPC is caller-scoped and no longer exposes cross-user consent state to `anon` or unrelated authenticated callers.
- Synthetic Auth users and profiles were independently confirmed at zero after cleanup.
- `docs/29_STAGING_ENVIRONMENT_CONTRACT.md` lists every required staging env var and fail-closed rule.
- `scripts/verify-staging.mjs` adds synthetic-only staging verification commands and writes artifacts under `artifacts/staging-verification/`.
- Root scripts now include `npm run verify:staging:*` for Supabase, RLS, workflow, S3, malware, Marker, Textract, OpenAI, E2E, and live golden subset checks.
- Existing live RLS and workflow harnesses are routed through the staging verifier.
- S3 direct signed PUT/GET/delete smoke harness exists, but full app audit-row verification still requires deployed app E2E.
- GuardDuty verification now passes with live AWS staging evidence; Marker, structured AI, live golden subset, and full E2E still lack live evidence.
- Textract asynchronous document extraction now passes against a synthetic staging PDF, including private S3 input, expected text, page count, confidence, `extracted_documents` provenance, and guaranteed cleanup. Marker remains optional while Textract is the selected parser.
- `docs/30_LIVE_STAGING_VERIFICATION_REPORT.md` records the current no-go live status.

## Fixed Or Improved In The Foundation Hardening Pass

- Local cookie auth can no longer silently run in staging/production; fallback requires `APP_ENV=local/development` and `ENABLE_LOCAL_AUTH_FALLBACK=true`.
- FastAPI auth tests now cover fail-closed missing Supabase env, trusted DB role resolution, user ownership checks, and safe audit metadata writes.
- Hardening migration policy creation is safer to rerun because new policy names are dropped before creation.
- Opt-in live Supabase RLS and deployed Auth/API harnesses exist and pass against the dedicated staging project.
- Env examples now document local scaffold fallback versus staging/production Supabase behavior.

## Fixed Or Improved In The Private Storage Pass

- StorageProvider abstraction exists in `apps/web/src/lib/storage/`.
- S3StorageProvider generates presigned PUT/GET URLs with private object keys and short expiries.
- Mock storage provider is limited to local/development/test unless explicitly overridden.
- Upload-init validates MIME, size, filename, checksum, and consent server-side before metadata creation.
- Upload-complete creates processing jobs with malware scan as the first gate.
- Signed download URL endpoint authorizes owner, assigned doctor, admin, or superadmin and audits denied/generated access.
- Delete endpoint marks report files deleted, calls the provider delete path, audits `report_deleted`, and blocks future signed URLs.
- MalwareScannerProvider includes a GuardDuty S3 implementation; mock remains local/test only and production mock use returns `configuration_required`.
- Tests cover upload validation, signed access, scan gating, audit logging, ownership denial, and delete behavior.

## Fixed Or Improved In The Durable Workflow Pass

- WorkflowProvider abstraction exists in `apps/web/src/lib/workflow/`.
- Database workflow provider supports enqueue, claim, lease, step start/completion/failure, retry scheduling, blocked state, completed state, expired lock release, and status lookup.
- Atomic Supabase RPC functions now exist for `claim_next_processing_job` and `release_expired_processing_locks`.
- Staging migration `202609020001_workflow_rpc_hardening.sql` restricts both RPCs to `service_role` and recovers matching running step locks with their jobs.
- The self-seeding live harness passed unique concurrent claims, empty-queue behavior, future retry exclusion, expired lease recovery, max-attempt failure, due retry reclaim, authenticated RPC denial, safe audits, and cleanup.
- Local best-effort claiming is blocked in staging/production unless explicitly overridden for a targeted test.
- Upload-complete idempotently creates one active processing job per user/checksum/processing version.
- Durable `processWorkflowOnce` claims a job and runs `malware_scan` as the only real step.
- `scan_pending`, `scan_failed`, `scan_configuration_required`, deleted reports, and rejected reports cannot advance to extraction.
- Later AI steps now run locally through the schema-first mock workflow; live provider execution remains blocked until staging verification.
- Admin helper exposes blocked and failed jobs.
- Tests cover claim eligibility, locked job exclusion, future retry timing, duplicate prevention, distinct multi-job claims, expired lease reclaim, retry scheduling, no-job process-once, malware pass/fail/configuration-required/dev-skip paths, deleted report blocking, admin visibility, user-safe status, and manual retry.

## Fixed Or Improved In The Document Extraction Pass

- `DocumentParserProvider` abstraction exists in `apps/web/src/lib/document-extraction/`.
- Marker-ready provider contract exists and fails closed when unconfigured.
- Mock fixture document parser is local/test only.
- `OcrProvider` abstraction exists with mock OCR and Textract-ready contract.
- Durable workflow supports `extract_document`, `ocr_fallback`, and `classify_report`.
- Extracted document rows persist parser/OCR provider metadata, extracted text/tables, status, confidence, and safe error fields locally.
- Deterministic report classifier covers supported panels, limited urine routine, unsupported reports, and unknown/manual-review routing.
- Unsupported reports stop safely and do not generate AI interpretation.
- Supported reports advance into the schema-first AI workflow locally; live OpenAI execution remains blocked until staging verification.
- Tests cover providers, scan gating, OCR routing, classification, unsupported blocking, and PHI-minimal audit events.

## Fixed Or Improved In The Schema-First AI Pass

- `AiProvider`, `OpenAiStructuredOutputsProvider`, and `MockAiProvider` exist in `apps/web/src/lib/ai/`.
- Strict biomarker extraction, patient explanation, doctor summary, and safety schemas are implemented.
- Durable workflow now supports `extract_biomarkers`, `normalize_biomarkers`, `validate_biomarkers`, `run_safety_rules`, `generate_patient_explanation`, and `route_review`.
- Model runs are logged with input/output hashes, provider, prompt version, schema version, status, and safe error metadata.
- Biomarker catalog v1 was expanded for CBC, lipid, thyroid, sugar, liver, kidney, and vitamin/mineral panels.
- Deterministic normalization preserves raw values, units, reference ranges, and source text.
- Unsafe language and critical-rule safety gates route low-confidence/critical cases to review and block AI-only critical publishing.
- Unsupported/unknown reports still stop before AI.
- Tests cover provider fail-closed behavior, schema validation, normalization, safety, model runs, workflow routing, and audit events.

## Fixed Or Improved In The Golden QA Pass

- Synthetic golden dataset exists under `tests/golden/`.
- Expected labels exist for supported, limited-beta, and unsupported fixtures.
- Unsafe-output fixtures exist and are loaded by tests instead of being embedded in product code.
- `npm run eval:golden` writes:
  - `tests/golden/golden-eval-results.json`
  - `docs/26_GOLDEN_DATASET_EVALUATION_REPORT.md`
- `npm run test:safety` validates unsafe-output blocking and safe alternatives.
- `npm run test:e2e:mock` runs mock pipeline smoke tests for supported and unsupported reports.
- `docs/27_LIVE_STAGING_VERIFICATION_PLAN.md` and `docs/28_PRIVATE_BETA_RELEASE_GATE.md` define the no-go release gate.

## What Is Ready For Rehearsal

- Landing page.
- Signup/login scaffold.
- Profile/questionnaire/consent UI.
- Upload validation, signed upload URL flow, and local/mock private upload route.
- Signed download URL flow with raw report access audit.
- Delete report file flow.
- Processing job and step records in local store.
- Durable workflow job leases, retry scheduling, blocked states, admin visibility, atomic Supabase claim RPC, document extraction contracts, OCR fallback contract, and classifier ready for staging rehearsal.
- Unsupported classification guard.
- Schema-first biomarker extraction fixture path.
- AI-safe deterministic explanation.
- Result page and timeline.
- Retest reminders.
- Admin correction.
- Doctor review actions.
- Feedback, analytics, payment placeholders.
- Data export/delete scaffold.
- Beta invites.
- Health endpoints.
- Supabase Auth/Postgres/RLS foundation in code.
- Server-side persisted consent gate when Supabase is configured.

## Beta Go/No-Go

No-go for real users until:

- Production auth and Postgres are live.
- RLS is tested.
- S3 is re-verified after any storage, IAM, signing, or bucket-policy change.
- Real malware scanning is live.
- The deployed Inngest saga is rehearsed using the verified staging claim/lease/retry primitives.
- The selected parser/OCR path and live structured AI provider are production-wired and staging-verified.
- At least 25 internal reports across 5 supported categories pass human review.
- Legal accepts consent/disclaimer/doctor/payment language.

## First Fix

Follow `docs/36_INNGEST_STAGING_SETUP.md`: add staging-only keys to Vercel Preview `dev`, sync the exact `/api/inngest` URL in a non-Production Inngest environment, and pass the guarded unsupported-report saga verifier. Leave Production unchanged.
