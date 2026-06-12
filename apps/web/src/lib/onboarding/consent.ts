import { CONSENT_VERSION } from "@lyf9/shared";

import type { ConsentChoices, ConsentMetadata, ConsentRecord } from "./types";

export const CONSENT_PURPOSES: Record<keyof ConsentChoices, string> = {
  lab_report_processing: "Store and process uploaded lab reports.",
  ai_analysis: "Generate AI-assisted report explanations for supported reports.",
  doctor_review: "Share report context with assigned doctors for optional review.",
  reminders_notifications: "Send retest and follow-up reminders.",
  marketing_communication: "Send private beta updates and product news."
};

export const REQUIRED_CONSENT_KEYS: Array<keyof ConsentChoices> = [
  "lab_report_processing",
  "ai_analysis"
];

export function hasRequiredConsent(choices: Pick<ConsentChoices, keyof ConsentChoices>) {
  return REQUIRED_CONSENT_KEYS.every((key) => choices[key]);
}

export function buildConsentRecords(
  choices: ConsentChoices,
  metadata: ConsentMetadata
): ConsentRecord[] {
  return (Object.keys(CONSENT_PURPOSES) as Array<keyof ConsentChoices>).map((key) => ({
    consentType: key,
    granted: choices[key],
    version: CONSENT_VERSION,
    purpose: CONSENT_PURPOSES[key],
    legalTextHash: "private_beta_v1_static_copy",
    grantedAt: choices[key] ? metadata.timestamp : null,
    revokedAt: choices[key] ? null : metadata.timestamp,
    ipAddress: metadata.ipAddress,
    userAgent: metadata.userAgent,
    createdAt: metadata.timestamp
  }));
}
