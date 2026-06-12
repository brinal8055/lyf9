import { REQUIRED_DISCLAIMER } from "@lyf9/shared";

import type { BiomarkerFlag } from "../reports/types";

export const BIOMARKER_EXTRACTION_SCHEMA_VERSION = "biomarker_extraction_schema_v1";
export const PATIENT_EXPLANATION_SCHEMA_VERSION = "patient_explanation_schema_v1";
export const DOCTOR_SUMMARY_SCHEMA_VERSION = "doctor_summary_schema_v1";

export type BiomarkerExtractionItem = {
  raw_name: string;
  canonical_name?: string | null;
  value_numeric?: number | null;
  value_text?: string | null;
  unit?: string | null;
  original_unit?: string | null;
  reference_range_text?: string | null;
  reference_low?: number | null;
  reference_high?: number | null;
  lab_flag?: BiomarkerFlag;
  system_flag?: BiomarkerFlag;
  page_number?: number | null;
  source_text: string;
  confidence: number;
  notes?: string;
};

export type BiomarkerExtractionOutput = {
  report_metadata: {
    lab_name?: string;
    report_date?: string;
    sample_date?: string;
    patient_name_present?: boolean;
  };
  biomarkers: BiomarkerExtractionItem[];
  extraction_notes?: string[];
};

export type PatientMarkerExplanation = {
  biomarker_result_id: string;
  display_name: string;
  value_display: string;
  status: "low" | "high" | "normal" | "critical" | "monitor" | "unknown";
  explanation: string;
  safe_next_step?: string;
};

export type PatientExplanationOutput = {
  summary: string;
  markers_needing_attention: PatientMarkerExplanation[];
  normal_markers: PatientMarkerExplanation[];
  possible_relevance: string[];
  questions_to_ask_doctor: string[];
  retest_suggestion?: string | null;
  doctor_review_recommended: boolean;
  doctor_review_reason?: string | null;
  disclaimer: string;
  source_biomarker_ids: string[];
};

export type DoctorSummaryOutput = {
  concise_summary: string;
  abnormal_markers: string[];
  critical_flags: string[];
  patient_context_summary?: string;
  suggested_review_focus: string[];
  ai_limitations: string[];
  source_biomarker_ids: string[];
};

export type SafetyCheckResult = {
  status: "passed" | "failed" | "review_required";
  blocked_terms: string[];
  reasons: string[];
  doctor_review_required: boolean;
};

export function validateBiomarkerExtractionSchema(output: BiomarkerExtractionOutput) {
  const errors: string[] = [];

  if (!output || typeof output !== "object") {
    return { errors: ["output must be an object"], ok: false };
  }

  if (!output.report_metadata || typeof output.report_metadata !== "object") {
    errors.push("report_metadata is required");
  }

  if (!Array.isArray(output.biomarkers)) {
    errors.push("biomarkers must be an array");
    return { errors, ok: false };
  }

  output.biomarkers.forEach((marker, index) => {
    const prefix = `biomarkers[${index}]`;
    if (!marker.raw_name?.trim()) errors.push(`${prefix}.raw_name is required`);
    if (!marker.source_text?.trim()) errors.push(`${prefix}.source_text is required`);
    if (typeof marker.confidence !== "number") errors.push(`${prefix}.confidence is required`);
    if (typeof marker.confidence === "number" && (marker.confidence < 0 || marker.confidence > 1)) {
      errors.push(`${prefix}.confidence must be between 0 and 1`);
    }
    if (marker.value_numeric == null && !marker.value_text?.trim()) {
      errors.push(`${prefix} must include value_numeric or value_text`);
    }
    if (marker.lab_flag && !isBiomarkerFlag(marker.lab_flag)) errors.push(`${prefix}.lab_flag is invalid`);
    if (marker.system_flag && !isBiomarkerFlag(marker.system_flag)) errors.push(`${prefix}.system_flag is invalid`);
  });

  return { errors, ok: errors.length === 0 };
}

export function validatePatientExplanationSchema(output: PatientExplanationOutput) {
  const errors: string[] = [];

  if (!output.summary?.trim()) errors.push("summary is required");
  if (!Array.isArray(output.markers_needing_attention)) errors.push("markers_needing_attention must be an array");
  if (!Array.isArray(output.normal_markers)) errors.push("normal_markers must be an array");
  if (!Array.isArray(output.possible_relevance)) errors.push("possible_relevance must be an array");
  if (!Array.isArray(output.questions_to_ask_doctor)) errors.push("questions_to_ask_doctor must be an array");
  if (!Array.isArray(output.source_biomarker_ids) || output.source_biomarker_ids.length === 0) {
    errors.push("source_biomarker_ids is required");
  }
  if (!/not\s+(a\s+)?diagnosis or prescription/i.test(output.disclaimer ?? "")) {
    errors.push("required disclaimer is missing");
  }

  for (const marker of [...(output.markers_needing_attention ?? []), ...(output.normal_markers ?? [])]) {
    if (!marker.biomarker_result_id) errors.push("marker biomarker_result_id is required");
    if (!marker.display_name) errors.push("marker display_name is required");
    if (!marker.value_display) errors.push("marker value_display is required");
  }

  return { errors, ok: errors.length === 0 };
}

export function validateDoctorSummarySchema(output: DoctorSummaryOutput) {
  const errors: string[] = [];
  if (!output.concise_summary?.trim()) errors.push("concise_summary is required");
  if (!Array.isArray(output.suggested_review_focus)) errors.push("suggested_review_focus must be an array");
  if (!Array.isArray(output.ai_limitations)) errors.push("ai_limitations must be an array");
  if (!Array.isArray(output.source_biomarker_ids)) errors.push("source_biomarker_ids must be an array");
  return { errors, ok: errors.length === 0 };
}

export function requiredDisclaimer() {
  return REQUIRED_DISCLAIMER;
}

function isBiomarkerFlag(value: string): value is BiomarkerFlag {
  return ["low", "high", "normal", "borderline", "critical", "unknown"].includes(value);
}
