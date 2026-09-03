# Private Beta Release Gate

## Current Decision

Decision: **No-go for real PHI private beta**.

Current readiness score including live staging evidence: **93/100**.

Reason: synthetic golden QA, live staging Supabase/RLS, an exact checksum-locked migration ledger, private S3, GuardDuty clean/threat verification, atomic workflow concurrency/recovery, scanned-image Textract OCR, the deployed Inngest saga, and a live Gemini structured-output smoke pass. Provider-backed golden QA, doctor threshold review, retention governance, observability, signup email reliability, and legal review are still incomplete.

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
| Live Textract document extraction | Ready for synthetic staging | `npm run verify:staging:textract` passes readable and blank synthetic PNG scans, page/line provenance, confidence quality gates, fail-closed blank handling, zero AI output, and independent S3/Postgres cleanup. |
| Live Marker extraction | Optional | Marker is not required while staging explicitly selects Textract; verify Marker before making it the configured parser. |
| Live structured AI provider | Ready for synthetic smoke | `npm run verify:staging:ai` passed with `gemini-3.5-flash`; the 13-fixture live golden run stopped fail-closed on exhausted provider quota. |
| Doctor-reviewed critical thresholds | Blocked | Critical rules reviewed and signed off by qualified clinician. |
| Legal review | Blocked | Consent, privacy, disclaimer, doctor review, payment/refund, and beta terms approved. |

## P1 Blockers

| Blocker | Status | Required evidence |
| --- | --- | --- |
| Workflow concurrency | Ready for synthetic staging | Database claims/recovery and the deployed event-driven Inngest saga pass with synthetic cleanup; re-run after workflow, scanner, parser, or deployment changes. |
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
- A scanned-image OCR fallback fixture passes before broad report intake. **Passed in synthetic staging.**
- The selected AI adapter passes structured-output checks on synthetic data.
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
- Any missing scanner/AI/Marker/Textract config silently succeeds in staging/production.

## Exact Next Actions

1. Configure custom SMTP or an approved Supabase Auth email quota and rerun public invite signup without fixture provisioning.
2. Replenish Gemini quota, rerun the 13-fixture live golden gate, then expand to at least 25 internally reviewed synthetic or consented internal samples.
3. Add PHI-safe observability and approve retention/versioning governance.
4. Get doctor review of critical thresholds.
5. Complete legal review.
6. Add CI for the full release-gate command set, including `npm run verify:migrations` and the credentialed staging drift check.

Current release owner recommendation: **do not invite 30-50 real PHI users yet**.
