# Security Privacy Safety Review

## Overall Safety Verdict

Medical safety: **partially safe for scaffold rehearsal, not safe for real PHI beta**.

Safety score: **7.0/10** for local scaffold behavior.  
Security/privacy score: **8.0/10** for real private beta readiness.

## Security Findings

| Priority | Finding | Evidence | Risk | Fix |
| --- | --- | --- | --- | --- |
| P1 | Signup email delivery is rate-limited in staging | Live `npm run test:auth-live` evidence | Login/session and authorization pass, but repeated invite signup cannot rely on Supabase's default sender quota. | Configure custom SMTP or an approved Auth email quota and rerun public signup without fixture fallback. |
| P2 | Local scaffold fallback remains but is now fail-closed outside local/development | `apps/web/src/lib/auth/providers/supabase.ts`, `apps/web/src/lib/auth/request.ts` | Safe for local development only; staging/production now return setup/configuration errors instead of silently using local cookies when Supabase env is missing. | Keep `ENABLE_LOCAL_AUTH_FALLBACK` out of staging/production and verify deploy env. |
| P1 | Provider-backed golden verification is incomplete | `artifacts/staging-verification/ai.json`, `artifacts/staging-verification/golden-live.json` | Auth/RLS, consent, private S3, GuardDuty, workflow concurrency, scanned-image Textract OCR, and a live Gemini smoke pass; the complete golden run remains quota-blocked. | Obtain sufficient provider quota and rerun the complete synthetic golden gate without weakening thresholds. |
| P1 | Analytics endpoint accepts unauthenticated events | `apps/web/src/app/api/analytics/route.ts` | Event spam and possible metadata misuse. | Require auth for app events or constrain anonymous public events. |
| P1 | Health checks are config-only | `apps/api/app/main.py`, `apps/worker/app/worker.py` | False confidence in deployment. | Real connectivity probes. |

## Privacy And Compliance

Partially implemented:

- Purpose-wise consent UI exists.
- Consent records include version, timestamp, IP/user-agent in the scaffold object.
- Consent records persist to Supabase when Supabase is configured.
- Upload-init and upload-complete check persisted required consent when Supabase is configured.
- Export/delete internal flow exists.
- Audit logs exist locally for upload, signed upload/download URL generation, denied raw report access, malware scan outcomes, delete, corrections, doctor actions, model runs, payments, data rights.
- Supabase audit writes exist for profile creation, profile save, consent grants/revokes, upload-init, signed URLs, raw report access, feedback, and analytics metadata.
- Upload-init attempts blocked by missing required consent now write `report_upload_blocked` with minimal safe metadata.
- Raw report access now requires an explicit signed download URL request; deleted files and unauthorized users cannot mint fresh URLs.
- Upload-complete creates the processing job with malware scan as the first gate; scan pending/failed/configuration-required states do not advance to extraction.
- Processing jobs have lease, retry, blocked, and audit state. Selected Textract and Gemini adapters run in synthetic staging; local mock providers remain limited to local/test use and deployed misconfiguration fails closed.
- Atomic Supabase RPCs use Postgres row locking for job claim and expired lock release; concurrent claims, retry timing, job/step recovery, RPC denial, and PHI-minimal audits pass in staging.
- Document extraction now uses provider contracts, persists extracted text/tables, and audits only provider/status/count metadata. Full extracted text is not written to audit logs.
- Unsupported/unknown report classification blocks automated interpretation and does not proceed to biomarker AI extraction.
- Schema-first AI now runs through a provider-neutral gateway, logs attempts with hashes/sanitized metadata, validates output/source traces before persistence, blocks incomplete selected-provider config in deployed environments, and prevents unsupported reports from entering AI interpretation.

Gaps:

- Supabase consent/audit core paths are verified, but append-only audit governance and operator review procedures still need definition.
- Private S3 upload/download/privacy/encryption/metadata/delete behavior passes synthetic staging verification; retention/versioning approval remains.
- GuardDuty is Active for the staging `reports/` prefix; staging-only tag-read IAM and live clean/EICAR outcomes pass with synthetic cleanup.
- Workflow RPC lease/retry behavior and the deployed Inngest saga are verified against staging with synthetic cleanup; re-run after workflow or runner changes.
- Textract execution and `extracted_documents` persistence pass on readable and blank synthetic staging PNG scans with page/line provenance, confidence gates, zero blocked-input AI output, and independent cleanup. Broader extracted-document RLS boundary verification remains.
- Marker remains optional while Textract is the explicitly selected beta parser.
- Data export/delete is local scaffold only.
- No grievance/contact support workflow.
- No retention policy implementation.
- Legal review remains a public and paid-flow blocker.

## Medical Safety

Implemented:

- Required disclaimer constants.
- Unsafe language filter.
- Critical value routing placeholder.
- Low-confidence routing.
- Unsupported report classification guard.
- Result page shows AI-only versus doctor-reviewed state.
- Source biomarker IDs and source traces exist where extracted.

Gaps:

- Critical thresholds are placeholders and not doctor-reviewed.
- Gemini, OpenAI, and mock adapters share one explicit provider contract; unknown providers and incomplete deployed configuration fail closed.
- A synthetic live Gemini extraction/explanation passed schema, source-trace, disclaimer, and deterministic unsafe-language checks. The broader live golden run remains fail-closed because provider quota was exhausted mid-run.
- Synthetic golden dataset validation exists locally; expanded human-reviewed sample coverage is still required.
- Live staging verification artifacts are generated under `artifacts/staging-verification/`; these artifacts must not contain secrets or full extracted report text.
- No public proof that every generated output was reviewed for unsafe copy across real reports.

## RLS Review

Migrations include RLS enablement and policies for user-owned data, backend-controlled writes, admin reads, and assigned doctor reviews. The hardening migrations add a caller-scoped required-consent RPC and stricter report/job write boundaries.

- Policies are applied in the dedicated staging Supabase project.
- The live RLS harness passed with two users, two doctors, one admin, and one superadmin using real Supabase Auth JWTs.
- Cross-user profile/report/job access, doctor assignment, superadmin-only role changes, direct audit insertion denial, consent scoping, and service-role bypass were verified.
- The deployed Auth/API harness passed login/session, onboarding persistence, route denial, consent grant/revoke, and backend upload consent checks.
- Normal local tests skip live harnesses unless their explicit staging flags and project reference are present.
- Some non-core scaffold areas still need stricter insert/update/delete separation in later passes.
- Doctor review linked context should be served through backend-controlled views/functions, not broad client table access.

Migration validation notes:

- `202606060002_auth_persistence_rls_hardening.sql` now drops/recreates hardening policies before creating them, reducing rerun collisions.
- The base migration remains a first-time migration and is not fully idempotent because it creates enum types and tables.
- Report/job direct user writes are denied after hardening; service-role server paths must audit sensitive operations.
- Audit log direct user inserts are denied; admin-like users can read audit logs, and service role can write controlled safe metadata.
- `202606060003_private_storage_scan_status.sql` adds report statuses for file-size rejection, scanner configuration blocks, dev-only scan skips, `malware_scan` job state, `deleted_at`, `scan_completed_at`, and indexes for storage/audit lookup.
- `202606060004_durable_processing_workflow.sql` adds `current_step`, `priority`, lease fields, `next_run_at`, step lock fields, step max attempts, input/output snapshots, and claim-oriented indexes.

## PHI Logging

Good:

- Logger filters keys containing `secret`.
- Audit metadata is named `safeMetadata`.

Gaps:

- No central PHI scrubber.
- No Sentry scrubbing.
- Analytics metadata accepts arbitrary object payloads.

## Public Launch Blockers

- Legal review.
- Terms/privacy/refund/grievance docs.
- Doctor contract and credential workflow.
- Production infra.
- Golden dataset accuracy.
- Security review and penetration testing.
- Paid flow approval.
