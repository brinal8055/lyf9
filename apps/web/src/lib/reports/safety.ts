import { REQUIRED_DISCLAIMER } from "@lyf9/shared";

import type { BiomarkerResultRecord } from "./types";

export type SafetyFilterResult = {
  blocked: boolean;
  matchedPhrases: string[];
};

const unsafePatterns = [
  /\byou have diabetes\b/i,
  /\byou have hypothyroidism\b/i,
  /\byou have hyperthyroidism\b/i,
  /\byou have kidney disease\b/i,
  /\byou have liver disease\b/i,
  /\byou have\s+(?!symptoms\b|concerning symptoms\b)[a-z]/i,
  /\bdiagnosed with\b/i,
  /\bconfirms?\s+[a-z\s]*(diabetes|hypothyroidism|hyperthyroidism|kidney disease|liver disease|disease)\b/i,
  /\bdefinitive diagnosis\b/i,
  new RegExp(`\\b${["AI", "diagnosis"].join("\\s+")}\\b`, "i"),
  new RegExp(`\\b${["AI", "prescription"].join("\\s+")}\\b`, "i"),
  new RegExp(`\\b${["AI", "doctor"].join("\\s+")}\\b`, "i"),
  /\bconfirmed\b/i,
  /\bdefinitely\b/i,
  /\btake this medicine\b/i,
  /\btake\s+[\d,]+\s*[a-zA-Z]+\b/i,
  /\bstart this medicine\b/i,
  /\bstop this medicine\b/i,
  /\btake\s+[a-z][a-z0-9-]+\b/i,
  /\bstart\s+[a-z][a-z0-9-]+\b/i,
  /\bstop\s+[a-z][a-z0-9-]+\b/i,
  /\byou need\s+[a-z0-9,\s-]+(tablet|tablets|capsule|capsules|medicine|supplement|supplements)\b/i,
  /\bincrease\s+dose\b/i,
  /\bincrease your dose\b/i,
  /\bdecrease\s+dose\b/i,
  /\bdecrease your dose\b/i,
  /\bchange your dose\b/i,
  /\bsupplement protocol\b/i,
  /\bthis supplement will fix\b/i,
  new RegExp(`\\b${["no", "doctor", "needed"].join("\\s+")}\\b`, "i"),
  /\bno need to consult a doctor\b/i,
  /\bavoid doctors\b/i,
  /\bwithout medical advice\b/i,
  /\bself-treat\b/i,
  /\bcure\b/i,
  /\bguaranteed cure\b/i,
  /\breverse guaranteed\b/i
];

export function runUnsafeLanguageFilter(text: string): SafetyFilterResult {
  const matchedPhrases = unsafePatterns
    .filter((pattern) => pattern.test(text))
    .map((pattern) => pattern.source);

  return { blocked: matchedPhrases.length > 0, matchedPhrases };
}

export type ExplanationOutput = {
  summary: string;
  markers_needing_attention: Array<{
    biomarker_result_id: string;
    title: string;
    value_label: string;
    explanation: string;
  }>;
  normal_markers: Array<{
    biomarker_result_id: string;
    title: string;
    value_label: string;
  }>;
  possible_relevance: string[];
  questions_to_ask_doctor: string[];
  retest_suggestion: string | null;
  disclaimer: string;
  source_biomarker_ids: string[];
};

export function generateSafeExplanation(input: {
  biomarkers: BiomarkerResultRecord[];
  requiresDoctorReview: boolean;
}): ExplanationOutput {
  const attention = input.biomarkers.filter(
    (marker) => marker.systemFlag !== "normal" && marker.systemFlag !== "unknown"
  );
  const normal = input.biomarkers.filter((marker) => marker.systemFlag === "normal");
  const sourceIds = input.biomarkers.map((marker) => marker.id);

  return {
    disclaimer: REQUIRED_DISCLAIMER,
    markers_needing_attention: attention.map((marker) => ({
      biomarker_result_id: marker.id,
      explanation:
        marker.isCritical
          ? "This value may need urgent medical attention, especially if you have symptoms. Please contact a qualified doctor or seek urgent care."
          : "This marker may need attention. Please discuss it with a qualified doctor, especially with your symptoms and history.",
      title: marker.canonicalName ?? marker.rawName,
      value_label: valueLabel(marker)
    })),
    normal_markers: normal.map((marker) => ({
      biomarker_result_id: marker.id,
      title: marker.canonicalName ?? marker.rawName,
      value_label: valueLabel(marker)
    })),
    possible_relevance: attention.length
      ? ["Some markers may be associated with nutrition, inflammation, metabolic health, organ function, medicines, or recent illness. A doctor can interpret them with your clinical context."]
      : ["The extracted supported markers are within the available reference ranges in this report."],
    questions_to_ask_doctor: attention.length
      ? [
          "Which of these report changes may need attention in my context?",
          "Should any marker be repeated, and what timing would you recommend?",
          "Are there symptoms or history details that change how this report should be interpreted?"
        ]
      : ["Is routine follow-up enough for these results based on my age, symptoms, and medical history?"],
    retest_suggestion: input.requiresDoctorReview
      ? "Please ask a qualified doctor whether and when retesting is appropriate."
      : "Consider discussing routine retesting timing with a qualified doctor.",
    source_biomarker_ids: sourceIds,
    summary: input.requiresDoctorReview
      ? "Lyf9 AI organized the supported biomarkers and found items that should be reviewed before relying on an AI-only explanation. This is not a diagnosis or prescription."
      : "Lyf9 AI organized the supported biomarkers from this report. This is an AI-assisted explanation, not a diagnosis or prescription."
  };
}

export function validateExplanationOutput(output: ExplanationOutput) {
  const errors: string[] = [];

  if (!output.summary) errors.push("summary is required");
  if (!output.disclaimer.includes("not a diagnosis or prescription")) {
    errors.push("required disclaimer is missing");
  }
  if (output.source_biomarker_ids.length === 0) {
    errors.push("source_biomarker_ids is required");
  }
  for (const marker of output.markers_needing_attention) {
    if (!marker.biomarker_result_id) errors.push("attention marker source id is required");
    if (!marker.explanation) errors.push("attention marker explanation is required");
  }

  return { errors, ok: errors.length === 0 };
}

function valueLabel(marker: BiomarkerResultRecord) {
  const value = marker.valueNumeric ?? marker.valueText ?? "unknown";
  return `${value}${marker.unit ? ` ${marker.unit}` : ""}`;
}
