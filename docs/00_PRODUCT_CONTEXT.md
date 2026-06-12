# lyf9.ai Product Context

## Product Identity

Public product name: **lyf9.ai**  
Public brand language: **lyf9.ai** and **Lyf9 AI**  

There is no separate hidden product name. Use only Lyf9 AI, lyf9.ai, or Lyf9 across product, code, docs, admin, doctor, and developer language.

## Vision

Lyf9 AI is a private, doctor-reviewed personal health graph for India. The first version helps users upload common lab reports, understand biomarkers in plain language, track changes over time, set retest reminders, and optionally request doctor review.

The product should not launch as a generic "AI report summarizer." The sharper wedge is:

> Upload your lab report, understand what changed, see source-linked biomarkers, and know what to discuss with a doctor.

Long term, Lyf9 AI can become a broader preventive-health operating system across reports, symptoms, goals, doctors, retests, labs, pharmacy, supplements, wearables, ABDM/ABHA, and genetics. The private beta must not attempt that full platform.

## Initial ICP

Primary ICP:

Urban Indian users aged 25-45 who already do annual or quarterly blood tests and want simple interpretation, trend tracking, and doctor-reviewed next steps.

High-intent early segments:

- Fatigue, low energy, Vitamin D, B12, ferritin, or thyroid concerns.
- Thyroid users tracking TSH, T3, and T4 over repeated tests.
- Cholesterol users tracking LDL, HDL, triglycerides, and total cholesterol.
- Diabetes-risk users tracking HbA1c and glucose.
- Hair fall users checking ferritin, Vitamin D, B12, and thyroid markers.
- Full-body checkup users who need a clear explanation of many supported panels.

## Private Beta Goal

Launch a production-ready private beta for 30-50 early users that safely validates this flow:

```txt
Landing page
-> Signup/login
-> Health profile
-> Consent
-> Questionnaire
-> Report upload
-> Private file storage
-> Processing job
-> Biomarker extraction
-> AI-assisted explanation
-> Result page
-> Health timeline
-> Retest reminder
-> Optional doctor review
-> Feedback
```

Success for the private beta means:

- Users can upload supported reports without public file exposure.
- Users understand AI-assisted explanations with source biomarker values visible.
- Unsupported reports are blocked or stored without automated interpretation.
- Admins can inspect failed/low-confidence extraction and correct values.
- Doctors can approve, edit, reject, or request more information.
- Consent, audit logs, and medical-safety disclaimers work end to end.
- Feedback is captured from early users.

## MVP Scope

Build only the following for the first private beta:

1. Landing page using the Lyf9 AI design DNA.
2. Signup/login.
3. User health profile.
4. Purpose-wise consent flow.
5. Medical history, symptoms, lifestyle, and goals questionnaire.
6. PDF/JPG/PNG lab report upload.
7. Private file storage.
8. Processing job state machine.
9. Biomarker extraction pipeline placeholder or integration, depending on feasibility in the phase.
10. AI-assisted report explanation using structured output.
11. Result page with marker cards, abnormal/normal grouping, source values, and disclaimer.
12. Health timeline/report history.
13. Retest reminder.
14. Admin panel for uploads, failed extraction, and manual correction.
15. Doctor review workflow v1: approve, edit, reject, request more info.
16. Audit logs.
17. Basic pricing/payment placeholder or sandbox integration.
18. Feedback collection.

## Supported MVP Report Types

Automated interpretation is allowed only for common structured lab reports:

- CBC.
- Lipid profile.
- Thyroid profile.
- Liver function test.
- Kidney function test.
- HbA1c/glucose.
- Vitamin D, B12, ferritin.
- Full-body checkups only where they contain supported panels.
- Basic urine routine as limited beta only.

Every result page must show:

- Detected report type or panel.
- Extracted biomarkers.
- Source values and units.
- Lab reference ranges when available.
- Unsupported sections ignored or pending review.
- Whether the output is AI-only or doctor-reviewed.

## MVP Exclusions

Do not build these in the first private beta:

- Mobile app.
- Wearable integrations.
- ABDM/ABHA.
- Genetics.
- Pharmacy integration.
- Supplement marketplace.
- Full doctor marketplace.
- Automated prescriptions.
- Lab booking API.
- Insurance/employer workflows.

Unsupported report types must not receive automated interpretation:

- Radiology scans.
- X-ray, CT, MRI, ultrasound.
- ECG/EEG.
- Biopsy/histopathology.
- Pregnancy/fetal reports.
- Pediatric reports.
- Cancer marker interpretation as standalone advice.
- Emergency diagnosis.
- Prescription change advice.

Fallback copy:

> This report type is not supported for automated interpretation yet. You can still store it in your Lyf9 AI health timeline, but Lyf9 AI will not generate AI-only medical insights for it. Please consult a qualified doctor for interpretation.

## Medical Safety Rules

Core principle:

> AI can explain and organize. Doctors diagnose and prescribe.

AI may:

- Explain biomarkers in simple language.
- Summarize abnormal and normal markers.
- Compare current and past reports.
- Suggest questions to discuss with a doctor.
- Suggest general lifestyle-level next steps.
- Recommend retest reminders with cautious language.
- Recommend doctor review.

AI must not:

- Diagnose disease as a final statement.
- Prescribe medicines.
- Start, stop, or change medicine doses.
- Create supplement protocols as treatment.
- Claim certainty from one biomarker.
- Say no doctor is needed.
- Interpret unsupported report types.
- Publish medical insights without source biomarkers where possible.

Use language like:

- "may indicate"
- "can be associated with"
- "please discuss with a doctor"
- "doctor review is recommended"

Avoid language like:

- direct disease assertions
- direct medication instructions
- supplement-as-treatment claims
- doctor-replacement claims

## GTM Goal

The private beta GTM goal is learning, not scale.

Target:

- 30-50 early users.
- 25-50 real reports processed first, then 100 reports before broader launch.
- At least 5 supported report categories tested end to end.
- Qualitative feedback from every reachable beta user.
- Early pricing validation with a placeholder or sandbox payment flow.

Early acquisition should focus on high-intent use cases:

- Thyroid report explanation.
- Lipid profile explanation.
- HbA1c/glucose explanation.
- Vitamin D/B12/ferritin deficiency explanation.
- Full-body checkup explanation.

Do not overclaim clinical outcomes. Position Lyf9 AI as a source-linked explanation and tracking product with optional doctor review.
