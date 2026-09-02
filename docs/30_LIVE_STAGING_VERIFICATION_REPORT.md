# Live Staging Verification Report

## Run Summary

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
- `npm run verify:staging:malware` passed four tests: guardrails plus a live clean PDF `NO_THREATS_FOUND` result and EICAR `THREATS_FOUND` result in 6.7 seconds.
- The verifier deleted both synthetic objects in `finally`; no production setting or bucket was changed.

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

Reason: the live staging verification harness now exists and produced blocked artifacts, but this workspace does not have staging Supabase, S3, malware scanner, Marker, Textract, or OpenAI env configured. No real PHI was used.

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
npm run verify:staging:marker
npm run verify:staging:textract
npm run verify:staging:openai
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
| Workflow concurrency | Not run | Live harness exists | Seed queued job and run `npm run verify:staging:workflow`. |
| S3 private storage | Ready for synthetic staging | Guarded app-level harness passed against the staging-only bucket | Re-run after IAM, bucket-policy, or signing changes; approve retention policy before PHI. |
| Signed upload/download/delete | Ready for synthetic staging | App routes, S3 privacy/encryption, DB metadata, audit rows, delete, and cleanup passed | Keep production unchanged until remaining release gates pass. |
| Malware scanner | Blocked | Current scanner code has mock and fail-closed stub only | Wire real scanner or document approved manual fail-closed process. |
| Marker | Blocked | Provider contract exists; live runner not wired | Wire Marker command/API execution and run synthetic PDF smoke. |
| Textract/OCR | Blocked | Provider contract exists; live runner not wired | Wire Textract OCR execution or approved manual fallback. |
| OpenAI Structured Outputs | Blocked | Provider contract exists; live requests not wired | Wire live structured-output calls and run synthetic subset. |
| Golden live subset | Blocked | Local golden eval passes; live provider eval not wired | Run `npm run eval:golden:live` after OpenAI runner is wired. |
| E2E synthetic staging pipeline | Blocked | Depends on live providers above | Run only after Supabase, S3, scanner, Marker/OCR, and OpenAI checks pass. |

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
| workflow | Blocked | Supabase/database env and seeded workflow job id missing. |
| s3 | Blocked | AWS/S3 env missing. |
| malware | Blocked | Scanner provider env missing. |
| marker | Blocked | Document parser provider env missing. |
| textract | Blocked | OCR provider/Textract region env missing. |
| openai | Blocked | OpenAI provider/key/model env missing. |
| e2e | Blocked | App base URL env missing. |
| golden-live | Blocked | Live OpenAI eval flag/provider/key/model env missing. |

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
- Real malware scanner is absent.
- Marker, Textract, and OpenAI providers are contract-only for live execution.
- Doctor-reviewed thresholds and legal review are incomplete.

## Go/No-Go

Current recommendation: **No-go**.

Lyf9 AI must not process real PHI until all P0 checks in `docs/28_PRIVATE_BETA_RELEASE_GATE.md` have passing evidence.
