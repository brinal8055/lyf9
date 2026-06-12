# Medical Safety And Clinical Boundaries

## Hard Rule

AI can explain and organize. Doctors diagnose and prescribe.

## AI Allowed

- Explain supported biomarkers in simple language.
- Summarize abnormal/normal markers.
- Compare current and previous reports.
- Suggest general lifestyle questions to discuss.
- Suggest questions to ask a doctor.
- Recommend doctor review.
- Suggest follow-up/retest discussion.
- Show urgent-care language only through deterministic critical rules.

## AI Must Not

- Diagnose disease as a final statement.
- Prescribe medicines.
- Recommend starting, stopping, or changing medicine.
- Create supplement treatment protocols.
- Claim certainty from a biomarker.
- Say a doctor is not needed.
- Interpret unsupported report types.
- Provide emergency diagnosis.

## Required Disclaimer

“Lyf9 AI provides AI-assisted report explanations, not diagnosis or prescription. Doctor review is required for medical decisions.”

## Safety Implementation

- Unsafe language filter: `apps/web/src/lib/reports/safety.ts`
- Critical value routing: `apps/web/src/lib/reports/biomarkers.ts`
- Unsupported report guard: `apps/web/src/lib/reports/classification.ts`
- Review routing stored on biomarker results and jobs.

## Critical Rule Categories

- Extremely high glucose.
- Severe anemia indicators.
- Kidney risk markers.
- Liver risk markers.
- Thyroid extremes.
- Dangerous electrolytes if supported later.
- Other doctor-configured rules.

Critical thresholds must become doctor-reviewed config before real beta.

## 2026-06-12 Implementation Update

Implemented:

- `apps/web/src/lib/safety/unsafe-language-filter.ts` blocks diagnosis, prescription, medicine-change, supplement-treatment, doctor-avoidance, and AI-as-clinician language.
- `apps/web/src/lib/safety/critical-rules-engine.ts` routes deterministic critical and low-confidence markers.
- `apps/web/src/lib/safety/medical-safety-rules.ts` prevents unsupported reports from receiving AI-only interpretation.
- The durable workflow blocks publication when schema validation or safety checks fail.

Current behavior:

- Supported reports can generate schema-valid patient explanations through the local/test mock AI provider.
- Low-confidence cases route to admin/manual review.
- Critical cases route to doctor/admin review.
- AI-only critical publishing is blocked.

Remaining limitation:

- Critical thresholds and clinical copy still require medical/legal review before real PHI beta.
