import type { AnalyticsEventName } from "@/lib/reports/types";

const allowedMetadata: Partial<Record<AnalyticsEventName, readonly string[]>> = {
  marker_card_opened: ["biomarkerResultId", "canonicalBiomarkerKey"],
  signup_started: ["surface"]
};

export function safeAnalyticsMetadata(
  eventName: AnalyticsEventName,
  metadata: Record<string, unknown>
) {
  const allowed = new Set(allowedMetadata[eventName] ?? []);
  return Object.fromEntries(
    Object.entries(metadata).filter(
      ([key, value]) =>
        allowed.has(key) &&
        (typeof value === "string" ||
          typeof value === "number" ||
          typeof value === "boolean" ||
          value === null)
    )
  );
}

