import type { NormalizedBiomarker } from "./biomarker-normalizer";

export function validateNormalizedBiomarkers(biomarkers: NormalizedBiomarker[]) {
  const errors: string[] = [];
  const lowConfidence = biomarkers.filter((marker) => marker.reviewRouting === "manual_review_required");
  const unmapped = biomarkers.filter((marker) => marker.normalizationStatus === "unmapped");

  biomarkers.forEach((marker, index) => {
    const prefix = `biomarkers[${index}]`;
    if (!marker.rawName) errors.push(`${prefix}.rawName is required`);
    if (!marker.sourceText) errors.push(`${prefix}.sourceText is required`);
    if (marker.valueNumeric === null && marker.valueText === null) errors.push(`${prefix} must include a value`);
    if (marker.confidenceScore < 0 || marker.confidenceScore > 1) errors.push(`${prefix}.confidenceScore is invalid`);
    if (
      marker.valueNumeric !== null &&
      marker.referenceLow !== null &&
      marker.referenceHigh !== null &&
      marker.referenceLow > marker.referenceHigh
    ) {
      errors.push(`${prefix}.reference range is invalid`);
    }
  });

  return {
    errors,
    lowConfidence,
    ok: errors.length === 0,
    reviewRequired: lowConfidence.length > 0 || unmapped.length > 0,
    unmapped
  };
}
