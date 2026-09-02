# Private Beta Release Gate

## Current Decision

Decision: **No-go for real PHI private beta**.

Current readiness score including live staging evidence: **88/100**.

Reason: synthetic golden QA, live staging Supabase/RLS, private S3, GuardDuty clean/threat verification, atomic workflow concurrency/recovery, and Textract document extraction pass. The Inngest staging runner, structured AI provider, doctor threshold review, retention governance, observability, and legal review are still incomplete.

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
| Supabase/RLS live verification | Ready for synthetic staging | `npm run verify:staging:rls` passed isolated user/user, assigned-doctor, admin, superadmin, consent, report/job, audit, feedback, analytics, and service-role boundaries. |
| Private S3 smoke test | Ready for synthetic staging | `npm run verify:staging:s3` passed upload/download/privacy/encryption/DB/audit/delete/cleanup; approve retention/versioning policy before PHI. |
| Real malware scanner | Ready for synthetic staging | GuardDuty is Active for staging `reports/`; `npm run verify:staging:malware` passes clean/EICAR checks and cleanup. |
| Live Textract document extraction | Ready for synthetic staging | `npm run verify:staging:textract` passes private S3 input, expected text, page/confidence/provenance persistence, and cleanup. |
| Live Marker extraction | Optional | Marker is not required while staging explicitly selects Textract; verify Marker before making it the configured parser. |
| Live OpenAI Structured Outputs | Blocked | `npm run verify:staging:openai` and `npm run eval:golden:live` pass on synthetic fixtures. |
| Doctor-reviewed critical thresholds | Blocked | Critical rules reviewed and signed off by qualified clinician. |
| Legal review | Blocked | Consent, privacy, disclaimer, doctor review, payment/refund, and beta terms approved. |

## P1 Blockers

| Blocker | Status | Required evidence |
| --- | --- | --- |
| Workflow concurrency | Ready for synthetic staging | `202609020001_workflow_rpc_hardening.sql` is applied and the self-seeding `npm run verify:staging:workflow` concurrency/recovery harness passes with cleanup. The deployable worker runner remains separate work. |
| Observability | Partial | Sentry or equivalent with PHI scrubbing and alert routing. |
| Admin QA UI | Partial | Operators can see golden failures, low confidence, unmapped markers, unsafe blocks, model failures. |
| Broader E2E | Partial | Deployed staging E2E covers auth, consent, upload, admin, doctor assignment, audit. |
| CI | Missing | CI runs typecheck, lint, tests, build, copy scan, and golden eval. |

## Go Criteria

Private beta can be marked ready only when:

- Supabase live RLS tests pass.
- S3 smoke test passes.
- Malware scanner is live configured or a medically/security-reviewed alternative is approved.
- The configured document parser passes live synthetic extraction.
- A scanned-image OCR fallback fixture passes before broad report intake.
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

1. Configure and verify the deployed Inngest staging runner and `/api/inngest` registration with a synthetic `report/confirmed` event.
2. Reconcile Supabase CLI migration history with the migrations applied to staging through the SQL editor.
3. Verify the configured structured AI provider and add scanned-image Textract coverage; Marker remains optional while unselected.
4. Expand golden dataset from 13 synthetic fixtures to at least 25 internally reviewed synthetic or consented internal samples.
5. Get doctor review of critical thresholds.
6. Complete legal review.
7. Add CI for the full release-gate command set.

Current release owner recommendation: **do not invite 30-50 real PHI users yet**.
