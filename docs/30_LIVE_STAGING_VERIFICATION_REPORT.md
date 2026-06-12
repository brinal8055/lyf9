# Live Staging Verification Report

## Run Summary

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
| Supabase migrations | Not run | Staging env absent | Configure staging env and run `npm run verify:staging:supabase`. |
| RLS/JWT | Not run | Live harness exists | Run `npm run verify:staging:rls` with staging users/env. |
| Workflow concurrency | Not run | Live harness exists | Seed queued job and run `npm run verify:staging:workflow`. |
| S3 private storage | Not run | S3 direct smoke harness exists | Configure bucket/IAM and run `npm run verify:staging:s3`. |
| Signed upload/download/delete | Not run | S3 harness validates signed PUT/GET/delete when env exists | Run full app E2E after S3 smoke to verify audit rows. |
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

No live synthetic data was created in this local run. Future live runs must delete synthetic S3 objects and clearly mark any retained database rows with staging-test identifiers.

## Risk Assessment

P0 risks remain:

- Supabase live RLS has not passed.
- Private S3 has not been smoke-tested with app audit rows.
- Real malware scanner is absent.
- Marker, Textract, and OpenAI providers are contract-only for live execution.
- Doctor-reviewed thresholds and legal review are incomplete.

## Go/No-Go

Current recommendation: **No-go**.

Lyf9 AI must not process real PHI until all P0 checks in `docs/28_PRIVATE_BETA_RELEASE_GATE.md` have passing evidence.
