# Live Staging Verification Report

## Run Summary

### 2026-09-02 Live Inngest Staging Saga Pass

Environment: Vercel Preview `dev` and the local guarded verifier. Production was not changed and no real PHI was used.

- Created an isolated Inngest custom Staging environment and stored its event/signing keys as encrypted Vercel secrets scoped only to Preview branch `dev`.
- Staging health reports `status: ok` and `inngestConfigured: true`; unsigned `/api/inngest` access returns `401 Unauthorized` while signed synchronization succeeds.
- The initial sync exposed a plan mismatch: function concurrency `10` exceeded the account limit `5`. Commit `052815e` lowered the deployment contract to `5` and added regression coverage.
- Inngest Staging now registers app `lyf9`, function `process-report`, trigger `report/confirmed`, and the exact staging endpoint.
- `npm run verify:staging:inngest` passed four tests in 52.92 seconds. The synthetic unsupported radiology PDF completed authenticated upload, GuardDuty, Textract, Postgres step transitions, and deterministic unsupported classification through the deployed saga.
- The verifier proved zero model runs, biomarker results, health insights, or AI interpretation, then removed the S3 object and synthetic Auth user.
- Artifact `artifacts/staging-verification/inngest.json` contains PHI-free pass metadata only.

Verdict: the deployed Inngest saga is **ready for synthetic staging**. Production was not changed. Live structured AI, scanned-image OCR coverage, and the remaining governance gates still block real PHI.

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

Verdict: Textract document extraction is **ready for synthetic staging**. The deployed Inngest saga now also passes; scanned-image OCR coverage, live structured AI, and the remaining release gates still block real PHI.

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
| Supabase migrations | Partially ready | Schema through `202609010002_consent_rpc_rls_guard.sql` applied in staging SQL editor | Reconcile CLI migration history and run `npm run verify:staging:supabase`. |
| RLS/JWT | Ready for core boundaries | Six-identity live JWT harness passed with synthetic cleanup | Re-run after every RLS migration. |
| Deployed Auth/API | Partially ready | Login/session, persistence, route denial, consent transitions, and backend upload gate passed | Configure custom SMTP/approved email quota and rerun public signup without fixture fallback. |
| Workflow concurrency | Ready for synthetic staging | Self-seeding claims/recovery and the deployed Inngest saga both pass with safe audits and cleanup | Re-run after workflow, scanner, parser, or deployment changes. |
| S3 private storage | Ready for synthetic staging | Guarded app-level harness passed against the staging-only bucket | Re-run after IAM, bucket-policy, or signing changes; approve retention policy before PHI. |
| Signed upload/download/delete | Ready for synthetic staging | App routes, S3 privacy/encryption, DB metadata, audit rows, delete, and cleanup passed | Keep production unchanged until remaining release gates pass. |
| Malware scanner | Ready for synthetic staging | GuardDuty clean/EICAR harness passes with cleanup | Re-run after IAM, bucket, scanner, or prefix changes. |
| Marker | Optional | Provider contract remains available but unselected | Verify before selecting Marker as the parser. |
| Textract/OCR | Ready for synthetic staging | Live synthetic PDF text/page/confidence/persistence and cleanup pass | Add scanned-image coverage before broad report intake. |
| Structured AI adapter | Blocked | Provider-neutral gateway and Gemini live harness exist locally; no live Gemini evidence yet | Configure Gemini in Preview `dev` and run `npm run verify:staging:ai`. |
| Golden live subset | Blocked | Provider-neutral live runner exists; Gemini has not been exercised | Run `npm run eval:golden:live` after the adapter harness passes. |
| E2E synthetic staging pipeline | Blocked | Depends on live AI evidence above | Run only after Supabase, S3, scanner, OCR, and selected-provider checks pass. |

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
- GuardDuty malware scanning and Textract document extraction pass with synthetic staging evidence.
- Marker remains optional and Gemini/live structured AI remains unverified.
- Doctor-reviewed thresholds and legal review are incomplete.

## Go/No-Go

Current recommendation: **No-go**.

Lyf9 AI must not process real PHI until all P0 checks in `docs/28_PRIVATE_BETA_RELEASE_GATE.md` have passing evidence.
