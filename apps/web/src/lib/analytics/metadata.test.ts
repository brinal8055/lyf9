import { describe, expect, it } from "vitest";

import { safeAnalyticsMetadata } from "./metadata";

describe("analytics metadata safety", () => {
  it("keeps only event-specific non-PHI fields", () => {
    expect(
      safeAnalyticsMetadata("marker_card_opened", {
        biomarkerResultId: "marker-1",
        canonicalBiomarkerKey: "hemoglobin",
        patientEmail: "patient@example.com",
        sourceText: "raw report text"
      })
    ).toEqual({ biomarkerResultId: "marker-1", canonicalBiomarkerKey: "hemoglobin" });
  });

  it("drops all client metadata for backend-owned events", () => {
    expect(safeAnalyticsMetadata("report_uploaded", { filename: "report.pdf" })).toEqual({});
  });
});

