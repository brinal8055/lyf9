# Golden Dataset Evaluation Report

Generated: 2026-09-02T14:46:36.141Z

## Verdict

Private beta recommendation: **Not ready**.

Overall private beta score: **84/100**.

Live AI evaluation: **not_requested** (mock).

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

- The selected AI provider has not passed live staging golden evaluation.
- Scanned-image OCR coverage is incomplete.
- The golden dataset requires broader human-reviewed coverage.
- Doctor-reviewed critical thresholds and legal review are incomplete.

## Next Actions

1. Run the selected-provider AI adapter and live golden checks with synthetic data.
2. Add scanned-image OCR coverage.
3. Review critical thresholds with a qualified doctor.
4. Expand golden fixtures to at least 25 internally reviewed synthetic or consented internal samples before real PHI beta.
5. Keep private beta marked no-go until P0 live checks pass.
