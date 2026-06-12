# Security Privacy Safety Review

## Overall Safety Verdict

Medical safety: **partially safe for scaffold rehearsal, not safe for real PHI beta**.

Safety score: **7.0/10** for local scaffold behavior.  
Security/privacy score: **7.1/10** for real private beta readiness.

## Security Findings

| Priority | Finding | Evidence | Risk | Fix |
| --- | --- | --- | --- | --- |
| P1 | Supabase Auth path not yet validated in staging | `apps/web/src/lib/auth/supabase-auth.ts`, auth routes | Code path exists, but real project/JWT behavior is unverified. | Configure staging Supabase and test real auth flows. |
| P1 | RLS not yet tested with real JWTs | `supabase/migrations/202606060001_private_beta_core.sql`, `supabase/migrations/202606060002_auth_persistence_rls_hardening.sql` | Policies may behave differently under live claims. | Add live RLS test matrix. |
| P2 | Local scaffold fallback remains but is now fail-closed outside local/development | `apps/web/src/lib/auth/providers/supabase.ts`, `apps/web/src/lib/auth/request.ts` | Safe for local development only; staging/production now return setup/configuration errors instead of silently using local cookies when Supabase env is missing. | Keep `ENABLE_LOCAL_AUTH_FALLBACK` out of staging/production and verify deploy env. |
| P0 | Private S3 not verified in staging | `apps/web/src/lib/storage/s3-storage-provider.ts` | Presigning code exists, but real bucket/IAM/public-access-block behavior is unverified. | Configure private S3 bucket and run signed upload/download/delete smoke tests. |
| P0 | Mock/stub malware scanning | `apps/web/src/lib/malware/` | Unsafe files are not actually scanned. Production mock use fails closed, but real scanner is absent. | ClamAV/S3 event scanning. |
| P1 | Workflow locking not verified under live concurrency | `apps/web/src/lib/workflow/workflow-provider.ts` | Best-effort local/store locks are tested, but concurrent Postgres worker behavior is unverified. | Apply migration and move claim to transaction/RPC before PHI concurrency. |
| P1 | Live staging verification now exists but has not passed | `scripts/verify-staging.mjs`, `docs/29_STAGING_ENVIRONMENT_CONTRACT.md`, `docs/30_LIVE_STAGING_VERIFICATION_REPORT.md` | Commands refuse production and missing staging env, but current workspace lacks live provider config. | Configure staging env and run every `npm run verify:staging:*` command with synthetic data. |
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
- Processing jobs now have lease, retry, blocked, and audit state in code. OCR and schema-first AI steps run locally with mock providers while live provider configuration remains fail-closed.
- Atomic Supabase RPCs now use Postgres row locking for job claim and expired lock release; live staging concurrency verification remains required before PHI.
- Document extraction now uses provider contracts, persists extracted text/tables, and audits only provider/status/count metadata. Full extracted text is not written to audit logs.
- Unsupported/unknown report classification blocks automated interpretation and does not proceed to biomarker AI extraction.
- Schema-first AI workflow now logs model runs with hashes and safe metadata, validates output schemas before persistence, blocks missing OpenAI config in deployed env, and prevents unsupported reports from entering AI interpretation.

Gaps:

- Supabase consent and audit behavior still needs staging verification.
- S3 bucket policy, object metadata verification, and delete behavior still need staging verification.
- Real malware scanner is not configured.
- Workflow RPC lease/retry behavior needs staging Postgres concurrency verification.
- Marker and Textract provider execution need staging verification before PHI.
- Extracted document Supabase rows and RLS behavior need live staging verification.
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
- OpenAI Structured Outputs provider is contract-only and fails closed when unconfigured.
- No live prompt execution yet.
- Synthetic golden dataset validation exists locally; expanded human-reviewed sample coverage is still required.
- Live staging verification artifacts are generated under `artifacts/staging-verification/`; these artifacts must not contain secrets or full extracted report text.
- No public proof that every generated output was reviewed for unsafe copy across real reports.

## RLS Review

Migrations include RLS enablement and policies for user-owned data, backend-controlled writes, admin reads, and assigned doctor reviews. The hardening migration adds required-consent RPC and stricter report/job write boundaries. However:

- Policies are not applied in a live Supabase project.
- A live RLS harness now exists at `apps/web/src/lib/auth/supabase-live-rls.test.ts`, but it is skipped locally until `RUN_LIVE_SUPABASE_RLS=true` and staging Supabase env are configured.
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
