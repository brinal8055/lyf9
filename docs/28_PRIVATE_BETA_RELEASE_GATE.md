# Private Beta Release Gate

## Current Decision

Decision: **No-go for real PHI private beta**.

Current local golden readiness score: **84/100**.

Reason: synthetic golden QA passes locally, and live staging verification commands now exist, but live Supabase/RLS, S3, malware scanner, Marker, Textract, OpenAI, doctor threshold review, and legal review are still incomplete.

Live staging evidence:

- Environment contract: `docs/29_STAGING_ENVIRONMENT_CONTRACT.md`
- Live verification report: `docs/30_LIVE_STAGING_VERIFICATION_REPORT.md`
- Artifact directory: `artifacts/staging-verification/`

## Golden Metrics

Source:

- `tests/golden/golden-eval-results.json`
- `docs/26_GOLDEN_DATASET_EVALUATION_REPORT.md`

Current local synthetic metrics:

| Area | Metric | Current |
| --- | --- | ---: |
| Classification | Supported classification accuracy | 100% |
| Classification | Unsupported classification accuracy | 100% |
| Biomarker extraction | Recall | 100% |
| Biomarker extraction | Precision | 100% |
| Biomarker extraction | Value accuracy | 100% |
| Biomarker extraction | Unit accuracy | 100% |
| Biomarker extraction | Source text presence | 100% |
| Safety | Unsafe output block rate | 100% |
| Safety | Required disclaimer presence | 100% |
| Safety | Unsupported report AI block rate | 100% |
| Workflow | Mock supported pipeline pass rate | 100% |
| Workflow | Failed config fail-closed rate | 100% |

Interpretation: local deterministic QA is healthy, but it does not replace live provider verification or human medical/legal review.

## P0 Blockers

| Blocker | Status | Required evidence |
| --- | --- | --- |
| Supabase/RLS live verification | Blocked | `npm run verify:staging:rls` passes with staging users. |
| Private S3 smoke test | Blocked | `npm run verify:staging:s3` passes and full app E2E confirms audit rows. |
| Real malware scanner | Blocked | `npm run verify:staging:malware` passes with real scanner or approved fail-closed/manual process. |
| Live Marker extraction | Blocked | `npm run verify:staging:marker` parses synthetic digital PDF with expected text/tables. |
| Live Textract/OCR fallback | Blocked | `npm run verify:staging:textract` succeeds or reviewed manual fallback is accepted. |
| Live OpenAI Structured Outputs | Blocked | `npm run verify:staging:openai` and `npm run eval:golden:live` pass on synthetic fixtures. |
| Doctor-reviewed critical thresholds | Blocked | Critical rules reviewed and signed off by qualified clinician. |
| Legal review | Blocked | Consent, privacy, disclaimer, doctor review, payment/refund, and beta terms approved. |

## P1 Blockers

| Blocker | Status | Required evidence |
| --- | --- | --- |
| Workflow concurrency | Partially ready | `npm run verify:staging:workflow` passes against a seeded staging job. |
| Observability | Partial | Sentry or equivalent with PHI scrubbing and alert routing. |
| Admin QA UI | Partial | Operators can see golden failures, low confidence, unmapped markers, unsafe blocks, model failures. |
| Broader E2E | Partial | Deployed staging E2E covers auth, consent, upload, admin, doctor assignment, audit. |
| CI | Missing | CI runs typecheck, lint, tests, build, copy scan, and golden eval. |

## Go Criteria

Private beta can be marked ready only when:

- Supabase live RLS tests pass.
- S3 smoke test passes.
- Malware scanner is live configured or a medically/security-reviewed alternative is approved.
- Marker live extraction passes.
- Textract or OCR fallback plan passes.
- OpenAI live structured output passes on synthetic data.
- Golden dataset meets thresholds.
- Unsafe output suite passes 100%.
- Critical thresholds are doctor-reviewed or explicitly disabled from final medical routing.
- Legal review is completed or beta is strictly internal/research with no public paid launch.
- No PHI is used before all PHI blockers are resolved.

## No-Go Triggers

Any of these keep the release blocked:

- Any unsupported report reaches AI-only interpretation.
- Any unsafe medical action wording passes the safety suite.
- Any critical output publishes AI-only.
- Any live RLS cross-user access succeeds.
- Any public report file URL exists.
- Any missing scanner/OpenAI/Marker/Textract config silently succeeds in staging/production.

## Exact Next Actions

1. Configure env from `docs/29_STAGING_ENVIRONMENT_CONTRACT.md`.
2. Run `npm run verify:staging` with synthetic data only and attach artifacts to `docs/30_LIVE_STAGING_VERIFICATION_REPORT.md`.
3. Wire real scanner, Marker, Textract, and OpenAI runners where current commands report contract-only blocking.
4. Expand golden dataset from 13 synthetic fixtures to at least 25 internally reviewed synthetic or consented internal samples.
5. Get doctor review of critical thresholds.
6. Complete legal review.
7. Add CI for the full release-gate command set.

Current release owner recommendation: **do not invite 30-50 real PHI users yet**.
