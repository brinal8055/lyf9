# Golden Dataset Evaluation Report

Generated: 2026-06-12T16:17:49.854Z

## Verdict

Private beta recommendation: **Not ready**.

Overall private beta score: **84/100**.

Live OpenAI evaluation: **not_requested**.

## Dataset Summary

- Supported and limited-beta fixtures: 9
- Unsupported fixtures: 4
- Unsafe-output fixture groups: 5
- All fixtures are synthetic and contain no real PHI.

## Metrics

| Area | Metric | Value |
| --- | --- | ---: |
| Classification | Supported accuracy | 100% |
| Classification | Unsupported block accuracy | 100% |
| Biomarkers | Recall | 100% |
| Biomarkers | Precision | 100% |
| Biomarkers | Value accuracy | 100% |
| Biomarkers | Unit accuracy | 100% |
| Biomarkers | Source text presence | 100% |
| Biomarkers | Canonical mapping accuracy | 100% |
| Safety | Unsafe language block rate | 100% |
| Safety | Required disclaimer presence | 100% |
| Safety | Unsupported report AI block rate | 100% |
| Workflow | Mock supported pipeline pass rate | 100% |
| Workflow | Failed config fail-closed rate | 100% |

## Blockers

- Live Supabase/RLS staging verification is missing.
- Real S3 bucket/IAM smoke test is missing.
- Real malware scanner is not configured.
- Marker/Textract/OpenAI live providers are not staging-verified.
- Doctor-reviewed critical thresholds and legal review are incomplete.

## Next Actions

1. Run live Supabase/RLS, S3, malware scanner, Marker, Textract, and OpenAI staging checks.
2. Review critical thresholds with a qualified doctor.
3. Expand golden fixtures to at least 25 internally reviewed synthetic or consented internal samples before real PHI beta.
4. Keep private beta marked no-go until P0 live checks pass.
