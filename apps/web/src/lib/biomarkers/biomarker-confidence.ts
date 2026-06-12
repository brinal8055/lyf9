import type { BiomarkerFlag, ReviewRouting } from "../reports/types";

export const CONFIDENCE_THRESHOLDS = {
  autoAccept: 0.95,
  manualReview: 0.8
};

export function reviewStatusForConfidence(input: {
  confidenceScore: number;
  isCritical: boolean;
  systemFlag: BiomarkerFlag;
}): ReviewRouting {
  if (input.isCritical) return "critical_review_required";
  if (input.confidenceScore < CONFIDENCE_THRESHOLDS.manualReview) return "manual_review_required";
  if (input.confidenceScore < CONFIDENCE_THRESHOLDS.autoAccept || input.systemFlag === "borderline") return "soft_review";
  return "auto_accept";
}

export function needsReview(reviewStatus: ReviewRouting) {
  return reviewStatus !== "auto_accept";
}
