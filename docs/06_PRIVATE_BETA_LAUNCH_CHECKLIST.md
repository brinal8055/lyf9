# lyf9.ai Private Beta Launch Checklist

Use this checklist for the first 30-50 early users. This is a private beta gate, not a public launch gate.

## Audit Verdict

Current decision: **No-go for real PHI private beta**.

Private beta readiness score including current live staging evidence: **88/100**.

This repo is ready for scaffold/operator rehearsal and now has live-tested staging Supabase Auth/Postgres/RLS, private S3, GuardDuty malware enforcement, atomic workflow concurrency/recovery, and Textract document extraction. Real 30-50 user testing remains blocked by reliable signup email delivery, a configured Inngest staging runner, live structured AI verification, expanded human-reviewed golden QA, observability, retention governance, doctor threshold review, and legal review.

## Current Readiness Matrix

| Area | Status | Owner | Next step |
| --- | --- | --- | --- |
| Auth/RBAC | Partially ready | Engineering/DevOps | Login/session and user/doctor/admin/superadmin JWT boundaries pass in staging; configure custom SMTP or an approved email quota before onboarding beta users. |
| Database/RLS | Ready for synthetic staging | Backend/DevOps | Migrations through `202609020001_workflow_rpc_hardening.sql` are applied and live cross-user/doctor/admin RLS tests pass; reconcile Supabase CLI migration history before automated promotion. |
| Storage security | Ready for synthetic staging | Backend/DevOps | Guarded app-level upload/download/privacy/encryption/DB/audit/delete verification passed; approve retention/versioning and key-management policy before real PHI. |
| Malware scanning | Ready for synthetic staging | Backend/Security/DevOps | GuardDuty is Active for staging `reports/`; least-privilege tag read and clean/EICAR verification pass. Re-run after scanner, IAM, bucket, or prefix changes. |
| Upload flow | Ready for synthetic staging | Engineering | Deployed consent gate, private S3 upload/download/delete, and real GuardDuty clean/threat behavior pass with synthetic fixtures. |
| Processing pipeline | Partially ready | Backend/Platform | Atomic claims/recovery and Textract pass independently; configure Inngest staging keys, register `/api/inngest`, and rehearse the event-driven saga. |
| Document extraction/OCR | Ready for synthetic staging | AI/Backend | Textract primary parsing passed against a synthetic PDF with persistence and cleanup. Marker remains optional while Textract is selected; image/scanned OCR coverage should be added before broadening report intake. |
| AI structured outputs | Blocked | AI/Backend | Schema-first local path exists; wire OpenAI Structured Outputs and Pydantic validation in worker. |
| Safety rules | Partially ready | AI/Safety/Medical | Unsafe-language filter and routing exist; doctor-review critical thresholds with real report set. |
| Unsupported report handling | Partially ready | AI/Safety | Unsupported reports are blocked from AI-only interpretation; expand internal fixture coverage. |
| Admin correction | Partially ready | Ops/Engineering | Correction flow preserves originals and audits locally; migrate to Postgres. |
| Doctor review | Partially ready | Medical/Ops/Engineering | Assigned versus unassigned doctor RLS passes with real staging JWTs; validate full approve/edit/reject UI and contracts. |
| Audit logs | Partially ready | Engineering/Ops | Live staging writes and user insert/read restrictions pass for onboarding, consent, and blocked upload paths; append-only governance and admin review operations remain. |
| Model runs | Partially ready | AI/Backend | Local model run logs exist; ensure all OpenAI calls log status/cost/latency/hash. |
| Data export/delete | Partially ready | Engineering/Legal | Internal flow exists; DPDP retention/deletion process needs legal review. |
| Feedback capture | Ready for scaffold beta | Product/Ops | Feedback capture and admin view exist; triage daily. |
| Analytics | Ready for scaffold beta | Product/Engineering | Local analytics events exist; pick PostHog or internal-only path after privacy review. |
| Error monitoring | Partially ready | Engineering | Logging helper and env contract exist; wire Sentry with PHI scrubbing. |
| Payments sandbox | Ready for scaffold beta | Product/Legal | Razorpay placeholder/sandbox only; do not enable real public charges. |
| Legal review | Blocked | Founders/Legal | Complete DPDP, doctor, disclaimer, payment/refund, and public claims review before public paid launch. |
| Deployment | Partially ready | DevOps | Vercel Preview `dev` reports healthy Supabase Postgres and live-verified S3; configure the Inngest runner, structured AI, and observability probes. |
| Runbook | Ready for scaffold beta | Ops/Product | Runbook exists; rehearse failed report, unsafe output, pause upload, export/delete paths. |

## Supabase Foundation Gate

| Item | Status | Next step |
| --- | --- | --- |
| Supabase Auth | Partially ready | Deployed login/session and `/api/auth/me` pass; public signup reached the default Supabase email quota, so custom SMTP or an approved quota is required for dependable invitations. |
| Postgres persistence | Ready for verified core paths | Synthetic profile, health profile, questionnaire, consent, audit, analytics, report metadata, and job metadata checks pass in staging. |
| RLS policies | Ready for verified core paths | Live user/user, doctor assignment, admin, superadmin, audit, consent, feedback, analytics, report, job, and service-role boundaries pass. |
| RLS tests | Ready | `npm run test:rls` passed against staging with six synthetic JWT identities and cleanup. |
| Role model | Ready for verified boundaries | `user`, `doctor`, `admin`, `superadmin` checks pass; only superadmin can grant/revoke roles through client RLS. |
| Consent gate | Ready for upload-entry boundary | Deployed upload-init rejects missing, partial, and revoked required consent and reaches MIME validation only after both required consents are granted. |
| Audit logs | Partially ready | Live writes and user access restrictions pass; append-only governance and operator review queries still require an operational procedure. |
| Backend service-role isolation | Ready | The staging server credential is a protected Vercel Secret scoped only to Preview branch `dev`; Production was not changed. |
| Frontend secret safety | Ready | Public client uses anon config; static tests and the production bundle scan found no service-role key, secret-key prefix, or beta invite variable. |
| Local fallback hardening | Ready | Local cookie fallback now requires `APP_ENV=local/development` and `ENABLE_LOCAL_AUTH_FALLBACK=true`; staging/production fail closed when Supabase is missing. |

## Private Storage Gate

| Item | Status | Next step |
| --- | --- | --- |
| StorageProvider abstraction | Ready | Keep route handlers behind provider interface. |
| S3 provider | Ready for synthetic staging | Encrypted signed upload/download, least-privilege staging IAM, real bucket persistence, and live deletion pass; complete retention/versioning and key-management review before PHI. |
| Mock/local provider | Ready | Allowed only for local/development/test unless explicitly overridden. |
| Backend file validation | Ready | PDF/JPG/PNG only; empty, unknown, SVG, ZIP, DOC/DOCX, executable, and oversized files rejected server-side. |
| Signed upload URLs | Ready for synthetic staging | Live PUT passed with signed content type, metadata, and `AES256` encryption headers. |
| Signed download URLs | Ready for synthetic staging | Owner path, private public-URL denial, and app-signed download passed live; assigned doctor/admin paths remain part of broader role E2E. |
| Malware scan gate | Ready for synthetic staging | Processing is blocked unless GuardDuty returns `NO_THREATS_FOUND`; clean/threat live verification passes. |
| Raw report access audit | Ready for synthetic staging | Upload, signed URL, raw access, signed download, and delete audit actions passed live. |
| Delete flow | Ready for synthetic staging | App deletion removed the S3 object and retained soft-deleted metadata; formal retention/versioning policy remains. |

## Durable Workflow Gate

| Item | Status | Next step |
| --- | --- | --- |
| WorkflowProvider abstraction | Ready | Keep workflow logic behind provider methods. |
| DatabaseWorkflowProvider | Ready for synthetic staging | Supabase atomic claim/recovery provider passes the guarded live staging harness; keep the local/store provider limited to local tests. |
| Durable job records | Ready for synthetic staging | Workflow migrations through `202609020001_workflow_rpc_hardening.sql` are applied in staging; reconcile CLI migration history before promotion. |
| Job locking/leases | Ready for synthetic staging | `FOR UPDATE SKIP LOCKED` uniquely claimed two jobs across three concurrent workers and recovered expired job/step leases. |
| Retry/backoff | Ready for synthetic staging | Future retries remain unavailable until due; recovered retry jobs can be reclaimed, while max-attempt jobs fail terminally. |
| Failed/blocked visibility | Partially ready | Admin helper exposes blocked/failed jobs; dedicated UI retry/cancel controls remain a gap. |
| Scan-gated processing | Ready for synthetic staging | `malware_scan` is the durable first step; live GuardDuty clean/threat mapping and cleanup pass. |
| Textract extraction | Ready for synthetic staging | Primary parser uses async Textract against private S3; live synthetic PDF text/page/confidence/persistence and cleanup pass. |
| Marker extraction | Optional | Marker contract remains available but is not a beta release blocker while `DOCUMENT_PARSER_PROVIDER=textract`. |
| OCR fallback | Partially ready | The Textract OCR interface is executable and verified on a digital synthetic PDF; add a scanned-image fixture before relying on the fallback for broad intake. |
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
| Staging environment contract | Ready | `docs/29_STAGING_ENVIRONMENT_CONTRACT.md` | Keep secrets scoped to Vercel Preview branch `dev` and out of source control. |
| Deployed Supabase connectivity | Ready | `lyf9-dev.vercel.app/api/health` returns `status: ok` and `store.ok: true` | Monitor while running synthetic Auth/RLS tests. |
| Live verification orchestrator | Ready | `npm run verify:staging` | Run only with `APP_ENV=staging`; it refuses production and missing env. |
| Supabase migration check | Partially ready | Staging SQL verification | Schema smoke passed; reconcile Supabase CLI migration history and run `npm run verify:staging:supabase`. |
| RLS/JWT live check | Ready | `npm run test:rls` passed with six isolated JWT identities | Re-run after any RLS migration. |
| Deployed Auth/API check | Partially ready | `npm run test:auth-live` passed login, sessions, persistence, route denial, and consent gating | Configure custom SMTP or approved email limits, then require public signup to pass without fixture fallback. |
| Workflow concurrency check | Ready | `npm run verify:staging:workflow` | Self-seeding staging harness passed concurrent claims, retries, lease recovery, RPC denial, audit safety, and cleanup. Re-run after workflow migration/provider changes. |
| S3 private smoke check | Ready for synthetic staging | `npm run verify:staging:s3` passed app routes, S3 privacy/metadata/encryption/delete, DB metadata, audit events, and cleanup | Re-run after storage/IAM/signing changes; approve retention/versioning policy before PHI. |
| Malware scanner live check | Ready | `npm run verify:staging:malware` | GuardDuty is Active on staging `reports/`; tag-read IAM and clean/EICAR outcomes pass with synthetic cleanup. |
| Marker live check | Optional | `npm run verify:staging:marker` | Run before selecting Marker; Textract is the current verified parser. |
| Textract live check | Ready for synthetic staging | `npm run verify:staging:textract` | Live synthetic PDF extraction/persistence/cleanup pass; add scanned-image coverage. |
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
- [x] Doctor can see assigned reports only in live staging RLS/JWT tests.
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
