import type { NormalizedBiomarker } from "../biomarkers";

export type CriticalRulesEngineResult = {
  criticalMarkers: NormalizedBiomarker[];
  lowConfidenceMarkers: NormalizedBiomarker[];
  reasons: string[];
};

export function runCriticalRulesEngine(biomarkers: NormalizedBiomarker[]): CriticalRulesEngineResult {
  const criticalMarkers = biomarkers.filter((marker) => marker.reviewRouting === "critical_review_required");
  const lowConfidenceMarkers = biomarkers.filter((marker) => marker.reviewRouting === "manual_review_required");
  return {
    criticalMarkers,
    lowConfidenceMarkers,
    reasons: [
      ...criticalMarkers.map((marker) => `${marker.canonicalName ?? marker.rawName} requires critical review.`),
      ...lowConfidenceMarkers.map((marker) => `${marker.canonicalName ?? marker.rawName} requires confidence review.`)
    ]
  };
}
