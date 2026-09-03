# Live Staging Verification Report

## Run Summary

### 2026-09-04 Supabase Migration Ledger And RLS Recheck

Environment: Supabase `lyf9-staging` (`wjjwdakfyigwwohbntyv`) only. Production was not accessed or changed, and no real PHI was used.

- Confirmed the staging schema already contained all 11 repository migrations while `supabase_migrations.schema_migrations` was absent.
- Ran read-only schema sentinels for every migration through `202609020001_workflow_rpc_hardening.sql`; all 11 passed before any ledger write.
- Used one guarded transaction to initialize the internal Supabase migration ledger and record the exact verified versions, names, and statement payloads without rerunning application DDL.
- The final independent query returned `remote_count=11`, `expected_count=11`, `no_missing=true`, `no_unexpected=true`, and `statements_present=true`.
- Added SHA-256 migration locking and local/remote drift tools. The remote command refuses non-staging mode, a project mismatch, and the known Production project reference.
- Re-ran `npm run verify:staging:rls`; the six-identity synthetic harness passed user, doctor, admin, consent, service-role, and audit boundaries in 27.4 seconds and cleaned up its fixtures.

Verdict: the staging migration-history blocker is **resolved**. Automatic remote drift verification still needs `DATABASE_URL` supplied as a secure CI/runtime secret; this is operational wiring, not unresolved staging history. The overall real-PHI release decision remains no-go because the other release gates remain open.

### 2026-09-03 Scanned-Image Textract OCR And Deployed Saga Pass

Environment: Supabase `lyf9-staging` (`wjjwdakfyigwwohbntyv`), `lyf9-reports-storage-staging` in `ap-south-1`, and Vercel Preview branch `dev`. Production was not changed and no real PHI was used.

- Added immutable synthetic PNG fixtures for a readable CBC scan, a blank scan, and an unsupported radiology scan.
- Raster uploads now route directly through Textract OCR. The extractor persists page/line provenance, source offsets, normalized bounding boxes, page confidence, and low-confidence line ratios without duplicating extracted report text in metadata.
- Minimum text and confidence gates fail closed. Blank and low-confidence scans cannot proceed to AI, and only transient request/throttle/timeout failures are retried automatically.
- `npm run verify:staging:textract` passed three tests in 16.54 seconds. It verified readable CBC OCR, deterministic supported classification, `ocr_provider=textract`, page/line provenance, a blank-scan `textract_no_text` failure, zero AI output, and independent S3/Postgres cleanup.
- Commit `76b13b0` was pushed to `dev`, and Vercel marked the exact matching Preview deployment Ready.
- The stable staging health endpoint returned HTTP 200 with healthy Supabase Postgres/private S3 state, Inngest configured, and Gemini capabilities enabled.
- `npm run verify:staging:inngest` then passed four tests in 72.50 seconds against the deployed workflow. A synthetic unsupported radiology PNG passed GuardDuty and Textract OCR, persisted `ocr_provider=textract`, completed deterministic unsupported classification, produced zero model runs/biomarkers/insights, and was cleaned up.
- Section-only artifacts now report `section_passed` with `selected_sections` scope and no longer imply a full release verdict.

Verdict: the scanned-image OCR blocker is **resolved for synthetic staging with 9.7/10 confidence**. This is not a real-PHI release approval; provider-backed golden QA, signup delivery, clinician thresholds, PHI-safe operations, and legal review remain open. Migration governance was subsequently reconciled in the 2026-09-04 pass above.

### 2026-09-02 Live Gemini Smoke Pass And Golden Quota Block

Environment: local guarded verifier using staging-only Gemini configuration and synthetic CBC text. Production was not changed and no real PHI was used.

- Selected `gemini-3.5-flash` explicitly after `gemini-3.6-flash` repeatedly returned high-demand 503 responses or reached the 120-second request timeout.
- Added provider-neutral bounded retry for transient 429/5xx responses only. Quota, authentication, model, timeout, schema, source-trace, refusal, and safety failures remain fail-closed; no provider fallback occurs automatically.
- `npm run verify:staging:ai` passed in 72.84 seconds with schema-valid extraction and patient explanation, exact persisted biomarker source tracing, authoritative disclaimer, and deterministic unsafe-language checks.
- `npm run eval:golden:live` then exercised multiple synthetic requests for 109 seconds and stopped fail-closed on `ai_provider_quota_exhausted` during patient explanation. AI Studio confirmed the free-tier `gemini-3.5-flash` daily counter at 21/20 RPD while RPM and TPM remained below their limits. Because 13 fixtures require at least one extraction and one explanation request each, the full run cannot fit within a 20-RPD daily allowance. The golden gate is not marked passed and requires higher quota; a post-reset subset may be used only as non-gating evidence.
- PHI-free evidence is stored in `artifacts/staging-verification/ai.json` and `artifacts/staging-verification/golden-live.json`.
- A subsequent read-only check exposed Preview environment drift to `aiProvider: openai`. The Preview variables were corrected and non-runtime commit `dc54703` triggered deployment `7x7exrAQ1cdSxRJHAQasabkV7Vdb`. Both the unique deployment and stable `lyf9-dev.vercel.app` health endpoints now report `aiProvider: gemini`, `aiConfigured: true`, all three AI capabilities enabled, and healthy Supabase Postgres, S3, and Inngest checks. Production remains untouched.
- After the daily quota reset on 2026-09-03, the guarded `npm run verify:staging:ai` synthetic CBC smoke passed again in 20.36 seconds. The live adapter assertion completed in 19.47 seconds with schema-valid extraction and explanation, exact source tracing, the required disclaimer, and safety checks. This is fresh smoke evidence, not a substitute for the quota-blocked full golden gate.

Verdict: the selected Gemini adapter and deployed Preview provider configuration are **ready for synthetic smoke testing**. Real PHI remains no-go until provider-backed golden QA passes with adequate quota and the other release gates are resolved.

### 2026-09-02 Live Inngest Staging Saga Pass

Environment: Vercel Preview `dev` and the local guarded verifier. Production was not changed and no real PHI was used.

- Created an isolated Inngest custom Staging environment and stored its event/signing keys as encrypted Vercel secrets scoped only to Preview branch `dev`.
- Staging health reports `status: ok` and `inngestConfigured: true`; unsigned `/api/inngest` access returns `401 Unauthorized` while signed synchronization succeeds.
- The initial sync exposed a plan mismatch: function concurrency `10` exceeded the account limit `5`. Commit `052815e` lowered the deployment contract to `5` and added regression coverage.
- Inngest Staging now registers app `lyf9`, function `process-report`, trigger `report/confirmed`, and the exact staging endpoint.
- `npm run verify:staging:inngest` passed four tests in 52.92 seconds. The synthetic unsupported radiology PDF completed authenticated upload, GuardDuty, Textract, Postgres step transitions, and deterministic unsupported classification through the deployed saga.
- The verifier proved zero model runs, biomarker results, health insights, or AI interpretation, then removed the S3 object and synthetic Auth user.
- Artifact `artifacts/staging-verification/inngest.json` contains PHI-free pass metadata only.

Verdict: this historical deployed Inngest PDF saga was **ready for synthetic staging**. The newer 2026-09-03 PNG saga supersedes its OCR evidence. Production was not changed, and the remaining release gates still block real PHI.

### 2026-09-02 Live Textract Document Extraction Pass

Environment: Supabase `lyf9-staging` (`wjjwdakfyigwwohbntyv`) and `lyf9-reports-storage-staging` in `ap-south-1` only. Production was not changed and no real PHI was used.

Passed evidence:

- Implemented asynchronous Textract document text detection against the private staging S3 object, including bounded polling, pagination, deterministic line ordering, page count, confidence, and PHI-safe failure codes.
- Added explicit `DOCUMENT_PARSER_PROVIDER=textract`; Marker remains optional while Textract is selected.
- The initial live run failed closed with `textract_access_denied` and cleaned up its synthetic fixtures.
- Added only `textract:StartDocumentTextDetection` and `textract:GetDocumentTextDetection` to the staging application IAM policy, restricted by `aws:RequestedRegion=ap-south-1`. No broad Textract administration or production access was granted.
- `npm run verify:staging:textract` passed all three checks using a one-page synthetic CBC PDF.
- The live result contained expected synthetic text, one page, and confidence above 0.8; the corresponding `extracted_documents` row preserved parser/version/user provenance.
- The harness deleted its staging S3 object and synthetic Supabase Auth user in `finally`.
- Artifact `artifacts/staging-verification/textract.json` records pass/fail metadata only and contains no extracted report text.

Verdict: this historical digital-PDF extraction pass established Textract connectivity. The newer 2026-09-03 PNG run supplies scanned-image OCR, quality-gate, provenance, and cleanup evidence. The remaining release gates still block real PHI.

### 2026-09-02 Live Durable Workflow Pass

Environment: Supabase `lyf9-staging` (`wjjwdakfyigwwohbntyv`) only. Production was not changed and no real PHI was used.

Passed evidence:

- Applied `202609020001_workflow_rpc_hardening.sql` to staging.
- `claim_next_processing_job` and `release_expired_processing_locks` are executable only by `service_role`; an ordinary authenticated session was denied.
- `npm run verify:staging:workflow` passed all three tests, including the live self-seeding concurrency/recovery scenario.
- Two queued jobs were claimed exactly once across three concurrent workers; the empty third claim was handled correctly.
- Future retries were excluded until due, expired jobs and running steps had stale locks cleared, attempts-remaining jobs were rescheduled, and max-attempt jobs failed terminally.
- A recovered job was reclaimed, failed at a step, scheduled with backoff, denied before due, and reclaimed when due.
- Claim, lock-expiry, retry, and failure audit events used null user/role actors and PHI-minimal worker metadata.
- Synthetic Auth/report/job/audit fixtures were cleaned up by the harness.

Artifact: `artifacts/staging-verification/workflow.json`.

Verdict: atomic workflow concurrency, lease recovery, retry timing, and RPC access are **ready for synthetic staging**. A deployable worker runner and live extraction/AI providers remain blockers before real PHI.

### 2026-09-02 Live GuardDuty Malware Pass

Environment: `lyf9-reports-storage-staging` in `ap-south-1` and Vercel Preview branch `dev`. Production was not changed and no real PHI was used.

Completed evidence:

- Added a real GuardDuty Malware Protection for S3 provider that reads `GuardDutyMalwareScanStatus` from private report-object tags.
- Only `NO_THREATS_FOUND` advances; threats fail closed, unsupported/access-denied outcomes require intervention, and pending/failed scans remain retryable.
- Updated the Inngest path so an asynchronous pending tag does not mark the report failed before retry.
- Added deterministic unit coverage for clean, threat, unsupported, access denied, failed, pending, invalid key, and provider selection outcomes.
- Added `npm run verify:staging:malware`, which now runs a guarded clean/EICAR live harness and always deletes synthetic objects.
- Added exact AWS/IAM/Vercel activation steps in `docs/34_GUARDDUTY_S3_MALWARE_SETUP.md`.
- Added staging-prefix `s3:GetObjectTagging` to `Lyf9StagingReportStoragePolicy`; the app principal received no GuardDuty administration permissions.
- Activated GuardDuty Malware Protection for S3 on `reports/`, with managed object tagging and a dedicated GuardDuty service role.
- Scoped Vercel Preview branch `dev` to `MALWARE_SCANNER_PROVIDER=guardduty-s3`, a 20-second app poll window, and 2-second polling.
- `npm run verify:staging:malware` passed four tests: guardrails plus a live clean PDF `NO_THREATS_FOUND` result and EICAR `THREATS_FOUND` result in 3.5 seconds in the final evidence run.
- The verifier deleted both synthetic objects in `finally`; no production setting or bucket was changed.
- Commit `fbf1c0f` was pushed to `dev`, and the matching Vercel Preview deployment reached `Ready`.
- The stable staging health endpoint returned `status: ok` with Supabase Postgres and private S3 connected after deployment.

Verdict: the real malware-scanning blocker is **resolved for synthetic staging**. The overall real-PHI decision remains **No-go** until the other release gates pass.

### 2026-09-02 Live Private S3 Pass

Environment: Supabase `lyf9-staging` (`wjjwdakfyigwwohbntyv`), `https://lyf9-dev.vercel.app`, and `lyf9-reports-storage-staging` in `ap-south-1`. Production was not changed and no real PHI was used.

Passed evidence:

- Deployed health reports `storageProvider: s3`, `storageConfigured: true`, `store.ok: true`, and `storeMode: supabase-postgres`.
- Initial live PUT correctly exposed that checksum/report metadata headers were sent but not signed.
- Commit `7307f63` binds content type, both metadata headers, and `AES256` encryption to the presigned request and adds regression coverage for signed headers.
- The Vercel Preview deployment for `7307f63` reached Ready.
- `npm run verify:staging:s3` passed three of three live tests.
- The harness passed required consent, app-signed upload, S3 encryption/metadata, public URL denial, app-signed download, Postgres metadata, required audit actions, app deletion, and guaranteed cleanup.
- An independent count-only check found zero remaining `reports/` objects and zero `lyf9-staging-s3-*` Auth users.

Verdict: private S3 is **ready for synthetic staging**. Real PHI remains **no-go** until real malware scanning and the remaining release gates pass; retention/versioning and key-management policy also require approval.

### 2026-09-01 Private S3 Harness Readiness

Environment: local workspace only. The supplied configuration values were treated as intentionally invalid references, no AWS or production request was made, and no secret was persisted.

Passed local evidence:

- Opaque report object keys no longer include uploaded filenames.
- Signed PUT responses include the content type, checksum/report metadata, and `AES256` server-side encryption requirements.
- `report_files.storage_bucket` records the real configured bucket rather than a provider label.
- The app-level live harness covers consent, upload-init, signed PUT, private-access denial, signed GET, app deletion, Postgres metadata, audit events, and guaranteed synthetic fixture cleanup.
- Destructive verification requires `APP_ENV=staging`, exact staging app and Supabase targets, `S3_REPORT_BUCKET=STAGING_S3_BUCKET`, a required distinct `PRODUCTION_S3_BUCKET`, and a staging-specific bucket name.
- Local storage/report tests passed with 74 tests and one credential-gated live test skipped; the full suite passed with 126 tests and four live suites skipped.
- Lint, typecheck, production web build, copy scan, eight FastAPI tests, API health, worker health, diff checks, and client-bundle secret-name scan passed.
- Commit `5f3347e` deployed successfully to Vercel Preview deployment `DG4YmJsy7cgo1gQvX2xFTahh8A4m` for the `dev` branch.
- `https://lyf9-dev.vercel.app/api/health` returned `status: ok`, `store.ok: true`, `storeMode: supabase-postgres`, `storageProvider: s3`, and `storageConfigured: false`.

Blocked evidence:

- `npm run verify:staging:s3` was not run because no valid staging-only bucket and least-privilege staging IAM credentials were available.
- The production bucket/project references supplied by the operator were not used. Real PHI remains no-go.

### 2026-09-01 Live Auth, RLS, And Consent Gate

Environment: Supabase `lyf9-staging` (`wjjwdakfyigwwohbntyv`) and `https://lyf9-dev.vercel.app` only. Production was not changed.

Passed evidence:

- Applied `202609010002_consent_rpc_rls_guard.sql`; consent RPC is `SECURITY INVOKER`, `anon` cannot execute it, and authenticated/service-role callers retain scoped access.
- `npm run test:rls` passed with six synthetic Supabase Auth identities covering user/user isolation, assigned doctor access, admin boundaries, superadmin role grant/revoke, consent scoping, report/job metadata, audit restrictions, feedback, analytics, and service-role bypass.
- `npm run test:auth-live` passed deployed login/session, `/api/auth/me`, user denial from admin/doctor routes, profile and questionnaire persistence, consent grant/revoke persistence, backend upload consent denial, and post-consent MIME validation.
- Normal local suite passed with 121 tests; three opt-in live suites were skipped as designed.
- Lint, typecheck, production web build, copy scan, eight FastAPI tests, API health, and frontend bundle secret scan passed.
- Independent SQL cleanup check returned zero synthetic Auth users and zero synthetic profiles.

Known limitation:

- Supabase's default staging email sender reached its rate limit during repeated signup diagnostics. The deployed test permits service-role fixture provisioning only for that exact error so authorization testing can continue. Configure custom SMTP or an approved email quota, then require public signup to pass without fallback before onboarding beta users.

### 2026-09-01 Staging Foundation Reconciliation

Environment: Supabase `lyf9-staging` (`wjjwdakfyigwwohbntyv`) and the Vercel `dev` preview branch only.

Completed evidence:

- Applied all additive schema files through `202609010002_consent_rpc_rls_guard.sql` to staging only.
- Verified 28 public tables, 45 biomarker catalog rows, and 19 biomarker aliases.
- Verified RLS enabled on all 15 security-sensitive tables included in the staging check.
- Verified 39 public-schema policies.
- Added Vercel configuration and encrypted Supabase credentials scoped to Preview branch `dev`; no Production variables were changed.
- Corrected the Vercel server credential to the complete staging key and stored it as a protected Secret.
- Redeployed commit `1b1d7c2` to Preview branch `dev` only; deployment `9yyipUgFoz2cPQW6TZFt7GaskX8q` reached Ready.
- Verified the deployed health endpoint returns `status: ok`, `store.ok: true`, `storeMode: supabase-postgres`, and `reportFileCount: 0`.
- Kept real uploads fail-closed: S3 credentials, Inngest keys, real malware scanning, and live provider verification remain incomplete.
- Added a Supabase-backed web health check so deployed health no longer attempts local JSON persistence when Supabase is configured.

Local verification:

```txt
npm run lint       PASS
npm test           PASS (119 passed, 2 live tests skipped)
npm run copy:scan  PASS
npm run build:web  PASS
npm run typecheck  PASS after the production build regenerated branch-correct Next.js types
```

Known reconciliation item: these migrations were applied through the staging SQL editor, not the Supabase CLI, so migration-history repair/verification is still required before automated migration deployment is considered ready.

Current verdict remains **No-go for real PHI private beta** until private storage, malware scanning, reliable signup email delivery, and full synthetic pipeline checks pass. Deployed Supabase health, Auth/RLS boundaries, persistence, and consent gating now pass.

Date: 2026-06-12

Environment used: local workspace with `APP_ENV=staging` for verifier refusal test; live staging secrets were not configured.

Verdict: **No-go for real PHI private beta**.

Reason for this historical refusal artifact: required staging env was not present in that local shell, including the selected AI provider configuration. No real PHI was used.

## Commands

Local baseline commands:

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
```

Live staging commands now available:

```txt
npm run verify:staging
npm run verify:staging:supabase
npm run verify:staging:rls
npm run verify:staging:auth
npm run verify:staging:workflow
npm run verify:staging:s3
npm run verify:staging:malware
npm run verify:staging:inngest
npm run verify:staging:marker
npm run verify:staging:textract
npm run verify:staging:ai
npm run verify:staging:e2e
npm run eval:golden:live
```

## Status Matrix

| Area | Status | Evidence | Next step |
| --- | --- | --- | --- |
| Deployed Supabase connectivity | Ready | `lyf9-dev.vercel.app/api/health` reports `store.ok: true` against Supabase Postgres | Keep the server key in Vercel Preview `dev` only and monitor health. |
| Supabase migrations | Ready for staging | Exact history is 11/11 through `202609020001_workflow_rpc_hardening.sql`, statement payloads are present, and all repository checksums match | Wire secure staging `DATABASE_URL` into CI and run `npm run verify:staging:migrations` on migration changes. |
| RLS/JWT | Ready for core boundaries | Six-identity live JWT harness passed again after ledger reconciliation with synthetic cleanup | Re-run after every RLS migration. |
| Deployed Auth/API | Partially ready | Login/session, persistence, route denial, consent transitions, and backend upload gate passed | Configure custom SMTP/approved email quota and rerun public signup without fixture fallback. |
| Workflow concurrency | Ready for synthetic staging | Self-seeding claims/recovery and the deployed Inngest saga both pass with safe audits and cleanup | Re-run after workflow, scanner, parser, or deployment changes. |
| S3 private storage | Ready for synthetic staging | Guarded app-level harness passed against the staging-only bucket | Re-run after IAM, bucket-policy, or signing changes; approve retention policy before PHI. |
| Signed upload/download/delete | Ready for synthetic staging | App routes, S3 privacy/encryption, DB metadata, audit rows, delete, and cleanup passed | Keep production unchanged until remaining release gates pass. |
| Malware scanner | Ready for synthetic staging | GuardDuty clean/EICAR harness passes with cleanup | Re-run after IAM, bucket, scanner, or prefix changes. |
| Marker | Optional | Provider contract remains available but unselected | Verify before selecting Marker as the parser. |
| Textract/OCR | Ready for synthetic staging | Readable/blank synthetic PNG OCR, page/line provenance, confidence gates, persistence, zero blocked-input AI output, and independent cleanup pass | Re-run after OCR provider, quality threshold, or extraction schema changes. |
| Structured AI adapter | Ready for synthetic smoke | `gemini-3.5-flash` passed extraction, explanation, schema, source trace, disclaimer, and unsafe-language checks | Re-run after provider/model/prompt/schema changes. |
| Golden live subset | Blocked by provider quota | The 13-fixture runner reached Gemini but stopped fail-closed on `ai_provider_quota_exhausted` | Replenish/upgrade quota and rerun without weakening thresholds. |
| E2E synthetic staging pipeline | Partial | The deployed unsupported PNG path passes Auth, consent, S3, GuardDuty, Textract OCR, classification, Postgres state, no-AI enforcement, and cleanup | Add a supported-report provider-backed golden E2E after sufficient Gemini quota is available. |

## Latest Artifact Summary

The local refusal test ran:

```txt
APP_ENV=staging npm run verify:staging
```

Expected result: nonzero exit with blocked artifacts because live env is missing.

Actual artifact summary:

| Section | Status | Reason |
| --- | --- | --- |
| supabase | Blocked | Supabase URL/service/database env missing. |
| rls | Blocked | Supabase URL/anon/service env missing. |
| workflow | Ready for synthetic staging | `npm run verify:staging:workflow` passed against staging with self-seeded fixtures and cleanup. |
| s3 | Blocked | AWS/S3 env missing. |
| malware | Blocked | Scanner provider env missing. |
| marker | Blocked | Document parser provider env missing. |
| textract | Ready for synthetic staging | `npm run verify:staging:textract` passed with guarded synthetic extraction and cleanup. |
| ai | Blocked | Selected provider/key/model env missing in the historical refusal run. |
| e2e | Blocked | App base URL env missing. |
| golden-live | Blocked | Live selected-provider eval configuration was missing. |

## Artifact Paths

The staging verifier writes:

```txt
artifacts/staging-verification/latest.json
artifacts/staging-verification/latest.md
artifacts/staging-verification/<section>.json
```

Artifacts must not contain secrets or full extracted report text.

## Cleanup

The 2026-09-02 live run created one synthetic user and report object and deleted both through guaranteed cleanup. An independent check found zero remaining report objects and zero matching synthetic users.

## Risk Assessment

P0 risks remain:

- Supabase live RLS and deployed core Auth/API consent checks have passed; public signup email delivery remains quota-limited.
- Private S3 app and audit verification passes against the staging-only bucket; retention/versioning policy remains open.
- GuardDuty malware scanning and scanned-image Textract OCR pass with synthetic staging evidence, including quality gates and no-AI blocking.
- Marker remains optional; Gemini smoke verification passes, while provider-backed golden QA remains quota-blocked.
- Doctor-reviewed thresholds and legal review are incomplete.

## Go/No-Go

Current recommendation: **No-go**.

Lyf9 AI must not process real PHI until all P0 checks in `docs/28_PRIVATE_BETA_RELEASE_GATE.md` have passing evidence.
