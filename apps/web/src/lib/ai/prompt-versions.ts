export function biomarkerExtractionPromptVersion() {
  return process.env.BIOMARKER_EXTRACTION_PROMPT_VERSION || "v1";
}

export function patientExplanationPromptVersion() {
  return process.env.PATIENT_EXPLANATION_PROMPT_VERSION || "v1";
}

export function doctorSummaryPromptVersion() {
  return process.env.DOCTOR_SUMMARY_PROMPT_VERSION || "v1";
}

export function safetyRulesVersion() {
  return process.env.SAFETY_RULES_VERSION || "v1";
}
