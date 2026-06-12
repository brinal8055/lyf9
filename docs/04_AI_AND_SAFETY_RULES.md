# lyf9.ai AI And Safety Rules

## Core Principle

AI can explain and organize. Doctors diagnose and prescribe.

Lyf9 AI may provide source-linked, plain-language explanations of supported lab biomarkers. It must not behave as an autonomous doctor, prescription engine, emergency service, or supplement-treatment protocol generator.

## Allowed AI Output

AI may:

- Explain supported biomarkers in simple language.
- Summarize normal, borderline, abnormal, and critical markers.
- Compare current values with previous reports.
- Suggest cautious questions to ask a doctor.
- Suggest general lifestyle-level topics to discuss.
- Suggest retest reminder timing using cautious, non-diagnostic language.
- Recommend doctor review.
- Explain unsupported handling without interpretation.

## Disallowed AI Output

AI must not:

- Diagnose conditions as facts.
- Prescribe medicines.
- Recommend starting, stopping, or changing medicines.
- Recommend supplement protocols as treatment.
- Claim that a user does or does not need a doctor.
- Interpret unsupported report types.
- Provide emergency diagnosis.
- Hide source biomarkers for user-facing medical insights where source values exist.
- Create certainty from one marker.

## Required Disclaimer

Show this disclaimer on upload, result, timeline insight detail, and AI-only report explanation surfaces:

> This is an AI-assisted explanation, not a diagnosis or prescription. Please discuss important findings with a qualified doctor.

For critical or potentially urgent values, add:

> This value may need urgent medical attention, especially if you have symptoms. Please contact a qualified doctor or seek urgent care.

## Required User-Facing Language

Use:

- "may indicate"
- "can be associated with"
- "may need attention"
- "please discuss with a doctor"
- "doctor review is recommended"
- "seek urgent medical care if you have concerning symptoms"
- "this is an AI-assisted explanation, not a diagnosis or prescription"

Avoid:

- direct disease assertions
- direct medication instructions
- dose-change instructions
- supplement-as-treatment claims
- doctor-replacement claims
- cure claims

## Supported Report Boundary

AI interpretation is allowed only for:

- CBC.
- Lipid profile.
- Thyroid profile.
- Liver function test.
- Kidney function test.
- HbA1c/glucose.
- Vitamin D/B12/ferritin.
- Full-body checkups where sections map to supported panels.
- Basic urine routine as limited beta only.

Unsupported reports should be classified and blocked from automated interpretation:

- Radiology scans.
- X-ray, CT, MRI, ultrasound.
- ECG/EEG.
- Biopsy/histopathology.
- Pregnancy/fetal reports.
- Pediatric reports.
- Cancer marker interpretation as standalone advice.
- Emergency diagnosis.
- Prescription change advice.

Unsupported report fallback copy:

> This report type is not supported for automated interpretation yet. You can still store it in your Lyf9 AI health timeline, but Lyf9 AI will not generate AI-only medical insights for it. Please consult a qualified doctor for interpretation.

## Structured Extraction Schema

Use OpenAI Structured Outputs or equivalent strict JSON validation.

```json
{
  "report_id": "uuid",
  "report_type": "cbc|lipid|thyroid|lft|kft|hba1c_glucose|vitamin|full_body_supported|urine_limited|unsupported|unknown",
  "lab_report": {
    "lab_name": "string|null",
    "report_date": "YYYY-MM-DD|null",
    "sample_date": "YYYY-MM-DD|null",
    "patient_name_present": true
  },
  "supported_panels": ["string"],
  "unsupported_sections": ["string"],
  "biomarkers": [
    {
      "raw_name": "Vitamin D Total",
      "canonical_name": "25-hydroxy Vitamin D",
      "value_numeric": 13.2,
      "value_text": null,
      "unit": "ng/mL",
      "reference_range_text": "30-100",
      "reference_low": 30,
      "reference_high": 100,
      "lab_flag": "low",
      "system_flag": "low",
      "page_number": 2,
      "source_text": "Vitamin D Total 13.2 ng/mL 30-100",
      "confidence": 0.97
    }
  ],
  "extraction_warnings": ["string"]
}
```

Validation requirements:

- `source_text` is required for every extracted biomarker.
- `confidence` is required for every biomarker.
- Numeric values must not be guessed.
- Units must preserve original report units.
- If reference range is unclear, preserve text and leave parsed numeric range null.
- If report type is unsupported, biomarkers must not be interpreted for the user.

## Explanation Schema

AI explanations must be structured and source-linked.

```json
{
  "report_id": "uuid",
  "safety_level": "ai_only|doctor_review_recommended|doctor_review_required|unsupported",
  "plain_language_summary": "string",
  "marker_groups": {
    "critical": [
      {
        "biomarker_result_id": "uuid",
        "title": "string",
        "value_label": "string",
        "explanation": "string",
        "source_required": true,
        "doctor_review_required": true
      }
    ],
    "needs_attention": [],
    "monitor": [],
    "normal": []
  },
  "possible_relevance": [
    {
      "biomarker_result_ids": ["uuid"],
      "text": "string"
    }
  ],
  "questions_for_doctor": ["string"],
  "general_next_steps": ["string"],
  "retest_suggestions": [
    {
      "reason": "string",
      "suggested_window": "string",
      "biomarker_result_ids": ["uuid"]
    }
  ],
  "disclaimer": "This is an AI-assisted explanation, not a diagnosis or prescription. Please discuss important findings with a qualified doctor."
}
```

Output requirements:

- Every marker explanation must include source biomarker IDs.
- Abnormal/normal grouping must come from extracted values and deterministic flags, not freeform model judgment.
- Lifestyle suggestions must stay general and non-prescriptive.
- Doctor questions should be phrased as discussion prompts.
- If AI cannot safely explain, return `doctor_review_required` or `unsupported`.

## Unsafe Language Filter

Run generated text through a safety filter before publishing.

Block or route to review if output includes:

- Diagnosis certainty: "you have", "diagnosed with", "confirmed", "definitely".
- Prescription language such as direct medicine start, stop, or dose-change instructions.
- Replacement language that tells users to avoid clinicians or self-treat.
- Cure claims: "cure", "fix", "reverse guaranteed".
- Unsupported report interpretation.

Suggested implementation:

1. Deterministic phrase/blocklist check.
2. Structured safety classifier for nuanced outputs.
3. Doctor/admin review route for blocked outputs.
4. Store filter status in `model_runs.safety_filter_status`.

Do not silently rewrite unsafe clinical output and publish it. Regenerate with stricter prompt or route to review.

## Critical Value Handling

Critical values must be detected by deterministic rules before AI explanation. Do not rely on an LLM for critical flags.

Initial categories:

- Very high glucose or HbA1c.
- Severe anemia indicators.
- Very high creatinine or low eGFR.
- Very high liver enzymes or bilirubin.
- Severe thyroid abnormalities.
- Dangerous sodium or potassium values, if included.

Rules:

- Thresholds must be configured in code/data and reviewed by a doctor.
- Critical values require doctor/admin review regardless of extraction confidence.
- User-facing copy must avoid diagnosis and direct treatment.
- If symptoms suggest emergency risk, use cautious escalation language:

> This value may need urgent medical attention, especially if you have symptoms. Please contact a qualified doctor or seek urgent care.

## Confidence Thresholds

```txt
confidence >= 0.95
  Auto-accept unless critical value or unsupported context.

0.80 <= confidence < 0.95
  Accept with soft warning or route to admin review depending marker importance.

confidence < 0.80
  Manual review required before publishing.

Any critical value
  Doctor/admin review required regardless of confidence.
```

## Doctor Review Requirements

Doctor review is mandatory for:

- Diagnosis.
- Prescription.
- Medication changes.
- Treatment plans.
- Supplement protocols as treatment.
- Critical or high-risk marker interpretation.
- Pregnancy, pediatric, elderly high-risk, kidney/liver disease, cancer, autoimmune, cardiac, and complex comorbidity contexts.
- Any AI output blocked by the unsafe language filter.

Doctor review v1 actions:

- Approve.
- Edit and approve.
- Reject.
- Request more information.

## Prompt Versioning

Every AI task must store:

- Task type.
- Model name.
- Prompt version.
- Schema version.
- Input hash.
- Output hash.
- Latency.
- Token count or estimate.
- Safety filter status.

Prompt versions to create:

```txt
extract_biomarkers_v1
classify_report_v1
explain_report_ai_only_v1
explain_report_doctor_draft_v1
safety_filter_v1
```

## Evaluation Gates

Before private beta:

- Upload works for PDF/JPG/PNG.
- Unsupported report fallback is tested.
- AI-only output has 0 known diagnosis/prescription violations in reviewed samples.
- Source biomarker traceability is 100% for published insights.
- Low-confidence and critical values route to review.

Before broader public launch:

- 100 reports tested minimum.
- 100-300 report golden dataset started.
- Common biomarker extraction accuracy above 95%.
- Value and unit accuracy above 97% for common supported biomarkers.
- Critical flag false negative target is 0.
