export type SafetyRuleResult = {
  criticalCount: number;
  lowConfidenceCount: number;
  unsafeLanguageBlocked: boolean;
  doctorReviewRequired: boolean;
  adminReviewRequired: boolean;
  reasons: string[];
};
