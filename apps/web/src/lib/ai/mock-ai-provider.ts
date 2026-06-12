import {
  requiredDisclaimer,
  type BiomarkerExtractionItem,
  type BiomarkerExtractionOutput,
  type DoctorSummaryOutput,
  type PatientExplanationOutput,
  type SafetyCheckResult
} from "./ai-schemas";
import type { AiProvider } from "./ai-provider";
import { normalizeAlias } from "../reports/catalog";
import type { BiomarkerFlag } from "../reports/types";
import type { NormalizedBiomarker } from "../biomarkers";
import { runUnsafeLanguageFilter } from "../safety";

const fixtureAliases = new Map([
  ["hemoglobin", "Hemoglobin"],
  ["hb", "Hemoglobin"],
  ["wbc", "WBC"],
  ["wbc count", "WBC"],
  ["platelet count", "Platelets"],
  ["platelets", "Platelets"],
  ["rbc", "RBC"],
  ["rbc count", "RBC"],
  ["mcv", "MCV"],
  ["mch", "MCH"],
  ["mchc", "MCHC"],
  ["rdw", "RDW"],
  ["neutrophils", "Neutrophils"],
  ["lymphocytes", "Lymphocytes"],
  ["fasting glucose", "Fasting glucose"],
  ["glucose", "Fasting glucose"],
  ["postprandial glucose", "Postprandial glucose"],
  ["random glucose", "Random glucose"],
  ["fasting insulin", "Fasting insulin"],
  ["hba1c", "HbA1c"],
  ["ldl", "LDL"],
  ["hdl", "HDL"],
  ["vldl", "VLDL"],
  ["triglycerides", "Triglycerides"],
  ["total cholesterol", "Total Cholesterol"],
  ["cholesterol hdl ratio", "Cholesterol/HDL ratio"],
  ["tc hdl ratio", "Cholesterol/HDL ratio"],
  ["tsh", "TSH"],
  ["t3", "T3"],
  ["t4", "T4"],
  ["free t3", "Free T3"],
  ["free t4", "Free T4"],
  ["ft3", "Free T3"],
  ["ft4", "Free T4"],
  ["sgpt", "SGPT/ALT"],
  ["alt", "SGPT/ALT"],
  ["sgot", "SGOT/AST"],
  ["ast", "SGOT/AST"],
  ["bilirubin total", "Bilirubin Total"],
  ["total bilirubin", "Bilirubin Total"],
  ["bilirubin direct", "Bilirubin Direct"],
  ["direct bilirubin", "Bilirubin Direct"],
  ["bilirubin indirect", "Bilirubin Indirect"],
  ["indirect bilirubin", "Bilirubin Indirect"],
  ["alp", "ALP"],
  ["alkaline phosphatase", "ALP"],
  ["ggt", "GGT"],
  ["albumin", "Albumin"],
  ["globulin", "Globulin"],
  ["creatinine", "Creatinine"],
  ["urea", "Urea"],
  ["bun", "BUN"],
  ["uric acid", "Uric acid"],
  ["egfr", "eGFR"],
  ["vitamin d", "Vitamin D"],
  ["25 oh vitamin d", "Vitamin D"],
  ["25 hydroxy vitamin d", "Vitamin D"],
  ["vitamin b12", "Vitamin B12"],
  ["ferritin", "Ferritin"],
  ["iron", "Iron"],
  ["serum iron", "Iron"],
  ["tibc", "TIBC"]
]);

export class MockAiProvider implements AiProvider {
  name = "mock_ai_provider";

  async extractBiomarkers(params: Parameters<AiProvider["extractBiomarkers"]>[0]): Promise<BiomarkerExtractionOutput> {
    const biomarkers = extractFixtureBiomarkers(params.extractedText);
    return {
      biomarkers,
      extraction_notes: biomarkers.length === 0 ? ["No supported biomarkers were found in the fixture text."] : [],
      report_metadata: {
        patient_name_present: false
      }
    };
  }

  async generatePatientExplanation(params: Parameters<AiProvider["generatePatientExplanation"]>[0]): Promise<PatientExplanationOutput> {
    const critical = params.biomarkers.filter((marker) => marker.reviewStatus === "critical_review_required");
    const review = params.biomarkers.filter(
      (marker) => marker.reviewStatus === "manual_review_required" || marker.reviewStatus === "soft_review"
    );
    const attention = params.biomarkers.filter((marker) => marker.systemFlag !== "normal" && marker.systemFlag !== "unknown");
    const normal = params.biomarkers.filter((marker) => marker.systemFlag === "normal");

    return {
      disclaimer: requiredDisclaimer(),
      doctor_review_reason: critical.length
        ? "Critical-value routing requires doctor review before relying on this explanation."
        : review.length
          ? "Some extracted biomarkers need confidence review."
          : null,
      doctor_review_recommended: critical.length > 0 || review.length > 0,
      markers_needing_attention: attention.map((marker) => markerExplanation(marker)),
      normal_markers: normal.map((marker) => markerExplanation(marker)),
      possible_relevance: attention.length
        ? ["These markers can be associated with metabolic health, organ function, nutrition, medicines, recent illness, or other clinical context."]
        : ["The supported extracted markers appear within the reference ranges available in this report."],
      questions_to_ask_doctor: [
        "Which of these markers matter most for my symptoms and health history?",
        "Should any marker be repeated, and when?"
      ],
      retest_suggestion: "Please discuss follow-up timing with a qualified doctor.",
      source_biomarker_ids: params.biomarkers.map((marker) => marker.id),
      summary: critical.length
        ? "Lyf9 AI organized supported biomarkers and found values that need doctor review. This is not diagnosis or prescription."
        : "Lyf9 AI organized supported biomarkers from this report. This is AI-assisted information, not diagnosis or prescription."
    };
  }

  async generateDoctorSummary(params: Parameters<AiProvider["generateDoctorSummary"]>[0]): Promise<DoctorSummaryOutput> {
    return {
      abnormal_markers: params.biomarkers
        .filter((marker) => marker.systemFlag !== "normal" && marker.systemFlag !== "unknown")
        .map((marker) => marker.canonicalName ?? marker.rawName),
      ai_limitations: ["AI output is schema constrained and must not be used as diagnosis or prescription."],
      concise_summary: "Supported biomarkers were extracted and routed for review where needed.",
      critical_flags: params.biomarkers
        .filter((marker) => marker.reviewStatus === "critical_review_required")
        .map((marker) => marker.canonicalName ?? marker.rawName),
      source_biomarker_ids: params.biomarkers.map((marker) => marker.id),
      suggested_review_focus: ["Confirm extracted values against the source report before clinical use."]
    };
  }

  async runSafetyCheck(params: Parameters<AiProvider["runSafetyCheck"]>[0]): Promise<SafetyCheckResult> {
    const result = runUnsafeLanguageFilter(JSON.stringify(params.output));
    return {
      blocked_terms: result.matchedPhrases,
      doctor_review_required: result.blocked,
      reasons: result.blocked ? ["Unsafe medical language detected."] : [],
      status: result.blocked ? "failed" : "passed"
    };
  }
}

function extractFixtureBiomarkers(text: string) {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => parseBiomarkerLine(line))
    .filter((marker): marker is BiomarkerExtractionItem => marker !== null);
}

function parseBiomarkerLine(line: string): BiomarkerExtractionItem | null {
  const cells = line.includes("|") ? line.split("|").map((cell) => cell.trim()) : line.split(/\s{2,}|\t/).map((cell) => cell.trim());
  const compact = cells.length >= 2
    ? { name: cells[0] ?? "", reference: cells[3] ?? null, unit: cells[2] ?? null, value: cells[1] ?? null }
    : splitFreeTextLine(line);
  const rawName = compact.name;
  const canonical = fixtureAliases.get(normalizeAlias(rawName));

  if (!canonical || compact.value === null) {
    return null;
  }

  const range = parseRange(compact.reference);
  const valueNumeric = parseNumber(compact.value);
  const systemFlag = flagFromRange(valueNumeric, range.low, range.high);

  return {
    canonical_name: canonical,
    confidence: compact.reference ? 0.97 : 0.72,
    lab_flag: "unknown",
    original_unit: compact.unit,
    page_number: 1,
    raw_name: rawName,
    reference_high: range.high,
    reference_low: range.low,
    reference_range_text: compact.reference,
    source_text: line,
    system_flag: systemFlag,
    unit: compact.unit,
    value_numeric: valueNumeric,
    value_text: valueNumeric === null ? compact.value : null
  };
}

function splitFreeTextLine(line: string) {
  const match = line.match(/^(.+?)\s+([-+]?\d+(?:\.\d+)?)\s*([a-zA-Z/%0-9.]+)?(?:\s+([<>]?\s*\d+(?:\.\d+)?\s*[-–]\s*\d+(?:\.\d+)?))?$/);
  return {
    name: match?.[1]?.trim() ?? "",
    reference: match?.[4]?.trim() ?? null,
    unit: match?.[3]?.trim() ?? null,
    value: match?.[2]?.trim() ?? null
  };
}

function parseRange(value: string | null) {
  const match = value?.match(/([-+]?\d+(?:\.\d+)?)\s*[-–]\s*([-+]?\d+(?:\.\d+)?)/);
  return {
    high: match ? Number(match[2]) : null,
    low: match ? Number(match[1]) : null
  };
}

function parseNumber(value: string) {
  const match = value.replace(/,/g, "").match(/[-+]?\d+(\.\d+)?/);
  return match ? Number(match[0]) : null;
}

function flagFromRange(value: number | null, low: number | null, high: number | null): BiomarkerFlag {
  if (value === null || low === null || high === null) return "unknown";
  if (value < low) return "low";
  if (value > high) return "high";
  return "normal";
}

function markerExplanation(marker: NormalizedBiomarker) {
  return {
    biomarker_result_id: marker.id,
    display_name: marker.canonicalName ?? marker.rawName,
    explanation:
      marker.systemFlag === "critical"
        ? "This marker needs doctor review before medical decisions."
        : "This marker can be discussed with a qualified doctor in the context of symptoms and history.",
    safe_next_step: "Please discuss this with a qualified doctor.",
    status: marker.systemFlag === "borderline" ? "monitor" as const : marker.systemFlag,
    value_display: `${marker.valueNumeric ?? marker.valueText ?? "unknown"}${marker.unit ? ` ${marker.unit}` : ""}`
  };
}
