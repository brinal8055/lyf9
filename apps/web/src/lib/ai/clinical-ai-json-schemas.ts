const BIOMARKER_FLAG_ENUM = ["low", "high", "normal", "borderline", "critical", "unknown"];

const BIOMARKER_ITEM_SCHEMA = {
  additionalProperties: false,
  properties: {
    canonical_name: { type: ["string", "null"] },
    confidence: { maximum: 1, minimum: 0, type: "number" },
    lab_flag: { enum: [...BIOMARKER_FLAG_ENUM, null], type: ["string", "null"] },
    notes: { type: ["string", "null"] },
    original_unit: { type: ["string", "null"] },
    page_number: { type: ["integer", "null"] },
    raw_name: { type: "string" },
    reference_high: { type: ["number", "null"] },
    reference_low: { type: ["number", "null"] },
    reference_range_text: { type: ["string", "null"] },
    source_text: { type: "string" },
    system_flag: { enum: [...BIOMARKER_FLAG_ENUM, null], type: ["string", "null"] },
    unit: { type: ["string", "null"] },
    value_numeric: { type: ["number", "null"] },
    value_text: { type: ["string", "null"] }
  },
  required: [
    "canonical_name",
    "confidence",
    "lab_flag",
    "notes",
    "original_unit",
    "page_number",
    "raw_name",
    "reference_high",
    "reference_low",
    "reference_range_text",
    "source_text",
    "system_flag",
    "unit",
    "value_numeric",
    "value_text"
  ],
  type: "object"
};

export const BIOMARKER_EXTRACTION_JSON_SCHEMA: Record<string, unknown> = {
  additionalProperties: false,
  properties: {
    biomarkers: { items: BIOMARKER_ITEM_SCHEMA, type: "array" },
    extraction_notes: { items: { type: "string" }, type: "array" },
    report_metadata: {
      additionalProperties: false,
      properties: {
        lab_name: { type: ["string", "null"] },
        patient_name_present: { type: ["boolean", "null"] },
        report_date: { type: ["string", "null"] },
        sample_date: { type: ["string", "null"] }
      },
      required: ["lab_name", "patient_name_present", "report_date", "sample_date"],
      type: "object"
    }
  },
  required: ["biomarkers", "extraction_notes", "report_metadata"],
  type: "object"
};

const MARKER_EXPLANATION_SCHEMA = {
  additionalProperties: false,
  properties: {
    biomarker_result_id: { type: "string" },
    display_name: { type: "string" },
    explanation: { type: "string" },
    safe_next_step: { type: ["string", "null"] },
    status: { enum: ["low", "high", "normal", "critical", "monitor", "unknown"], type: "string" },
    value_display: { type: "string" }
  },
  required: ["biomarker_result_id", "display_name", "explanation", "safe_next_step", "status", "value_display"],
  type: "object"
};

export const PATIENT_EXPLANATION_JSON_SCHEMA: Record<string, unknown> = {
  additionalProperties: false,
  properties: {
    disclaimer: { type: "string" },
    doctor_review_reason: { type: ["string", "null"] },
    doctor_review_recommended: { type: "boolean" },
    markers_needing_attention: { items: MARKER_EXPLANATION_SCHEMA, type: "array" },
    normal_markers: { items: MARKER_EXPLANATION_SCHEMA, type: "array" },
    possible_relevance: { items: { type: "string" }, type: "array" },
    questions_to_ask_doctor: { items: { type: "string" }, type: "array" },
    retest_suggestion: { type: ["string", "null"] },
    source_biomarker_ids: { items: { type: "string" }, type: "array" },
    summary: { type: "string" }
  },
  required: [
    "disclaimer",
    "doctor_review_reason",
    "doctor_review_recommended",
    "markers_needing_attention",
    "normal_markers",
    "possible_relevance",
    "questions_to_ask_doctor",
    "retest_suggestion",
    "source_biomarker_ids",
    "summary"
  ],
  type: "object"
};

export const DOCTOR_SUMMARY_JSON_SCHEMA: Record<string, unknown> = {
  additionalProperties: false,
  properties: {
    abnormal_markers: { items: { type: "string" }, type: "array" },
    ai_limitations: { items: { type: "string" }, type: "array" },
    concise_summary: { type: "string" },
    critical_flags: { items: { type: "string" }, type: "array" },
    patient_context_summary: { type: ["string", "null"] },
    source_biomarker_ids: { items: { type: "string" }, type: "array" },
    suggested_review_focus: { items: { type: "string" }, type: "array" }
  },
  required: [
    "abnormal_markers",
    "ai_limitations",
    "concise_summary",
    "critical_flags",
    "patient_context_summary",
    "source_biomarker_ids",
    "suggested_review_focus"
  ],
  type: "object"
};
