import type { PatientExplanationOutput } from "../ai";
import type { LabReportRecord } from "../reports/types";
import type { NormalizedBiomarker } from "../biomarkers";
import { runCriticalRulesEngine } from "./critical-rules-engine";
import { runUnsafeLanguageFilter } from "./unsafe-language-filter";
import type { SafetyRuleResult } from "./safety-schemas";

export function runMedicalSafetyRules(input: {
  biomarkers: NormalizedBiomarker[];
  explanation?: PatientExplanationOutput | null;
  labReport: LabReportRecord;
}): SafetyRuleResult {
  const critical = runCriticalRulesEngine(input.biomarkers);
  const unsafe = input.explanation ? runUnsafeLanguageFilter(JSON.stringify(input.explanation)) : { blocked: false, matchedPhrases: [] };
  const unsupported = input.labReport.status === "unsupported" || input.labReport.reportType === "unsupported" || input.labReport.reportType === "unknown";

  return {
    adminReviewRequired: critical.lowConfidenceMarkers.length > 0 || unsafe.blocked,
    criticalCount: critical.criticalMarkers.length,
    doctorReviewRequired: critical.criticalMarkers.length > 0 || unsafe.blocked,
    lowConfidenceCount: critical.lowConfidenceMarkers.length,
    reasons: [
      ...critical.reasons,
      ...unsafe.matchedPhrases.map((phrase) => `Unsafe phrase matched: ${phrase}`),
      ...(unsupported ? ["Unsupported reports cannot receive AI-only interpretation."] : [])
    ],
    unsafeLanguageBlocked: unsafe.blocked || unsupported
  };
}
