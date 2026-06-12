# Test Execution Report

Date: 2026-06-12

## Commands Run

| Command | Status | Summary |
| --- | --- | --- |
| `npm run typecheck` | Pass | Web TypeScript check passed. |
| `npm run lint` | Pass | ESLint passed with zero warnings. |
| `npm test` | Pass | Shared package typecheck plus web Vitest passed. Current run includes golden/safety/mock E2E tests. |
| `npm run eval:golden` | Pass | Synthetic golden dataset evaluation generated JSON and Markdown reports. |
| `npm run test:safety` | Pass | Unsafe-output fixture suite passed. |
| `npm run test:e2e:mock` | Pass | Mock report pipeline smoke tests passed. |
| `APP_ENV=staging npm run verify:staging` | Expected blocked | Staging verifier wrote artifacts and exited nonzero because live env is missing. |
| `npm run copy:scan` | Pass | Brand and unsafe public-copy scan passed. |
| `npm run build:web` | Pass | Next.js production build passed; 40 routes generated. |
| `npm run api:test` | Pass | FastAPI pytest passed. 8 tests. |
| `npm run api:health` | Pass | API health CLI returned ok. |
| `npm run worker:health` | Pass | Worker health returned ok with all production dependencies not configured locally. |
| `npm run worker:process-once` | Pass | Worker smoke returned expected scaffold states. |
| Bundle secret scan | Pass | No AWS, Supabase service-role, or OpenAI secret variable names found in `.next/static` JavaScript. |
| `test ! -e docs/07_CODEX_PHASE_PROMPTS.md` | Pass | Forbidden prompt file was not recreated. |

## Warnings

- `npm run build:web` still shows the known Next.js warning: the Next.js plugin is not detected in the custom flat ESLint config. Build, lint, and typecheck pass.

## Manual/E2E Status

Not run in this audit:

- Browser screenshot review.
- Signup/login through browser.
- Profile/questionnaire/consent through browser.
- Upload supported/unsupported report through browser.
- Doctor/admin route browser checks.
- Supabase migration apply.
- RLS policy tests.
- S3 storage test.
- Real OCR/Marker test.
- Real OpenAI Structured Outputs test.

## Coverage Gaps

- No Playwright/Cypress E2E.
- No RLS test harness.
- No migration validation command.
- Worker command checks are smoke tests, not full worker integration tests.
- Live provider contract tests for S3, malware scanning, Marker, Textract, and OpenAI remain pending.
- No visual regression tests.
- Golden report dataset exists and runs locally; live provider/golden QA remains required.

## Golden QA Artifacts

- `tests/golden/golden-eval-results.json`
- `docs/26_GOLDEN_DATASET_EVALUATION_REPORT.md`
- `docs/27_LIVE_STAGING_VERIFICATION_PLAN.md`
- `docs/28_PRIVATE_BETA_RELEASE_GATE.md`
- `docs/29_STAGING_ENVIRONMENT_CONTRACT.md`
- `docs/30_LIVE_STAGING_VERIFICATION_REPORT.md`
- `artifacts/staging-verification/latest.json`
- `artifacts/staging-verification/latest.md`

## Test Verdict

Automated scaffold and local golden-gate tests are healthy. Production private-beta test coverage is incomplete until live staging checks pass.
