import { describe, expect, it } from "vitest";

import { normalizeBiomarkerItems } from "../biomarkers";
import { runUnsafeLanguageFilter } from "../reports/safety";
import { getAiRuntimeStatus, getClinicalAiGateway } from "./index";

const liveEnabled = process.env.RUN_LIVE_STAGING_AI === "true";

describe.skipIf(!liveEnabled)("live staging clinical AI adapter", () => {
  it("returns schema-valid, source-traceable output for synthetic CBC text", async () => {
    expect(process.env.APP_ENV).toBe("staging");
    const runtime = getAiRuntimeStatus();
    expect(runtime.providerId).not.toBe("mock");
    expect(runtime.readyForReportPipeline).toBe(true);

    const ai = getClinicalAiGateway();
    const extraction = await ai.extractBiomarkers({
      extractedDocumentId: "synthetic-document",
      extractedText: [
        "Test | Result | Unit | Reference Range",
        "Hemoglobin | 13.5 | g/dL | 12.0-16.0",
        "WBC | 7200 | /cumm | 4000-11000",
        "Platelets | 250000 | /cumm | 150000-450000"
      ].join("\n"),
      labReportId: "synthetic-report",
      reportFileId: "synthetic-file",
      userId: "synthetic-user"
    });
    expect(extraction.output.biomarkers.length).toBeGreaterThanOrEqual(3);

    const biomarkers = normalizeBiomarkerItems({
      aiModelRunId: "synthetic-model-run",
      extractedDocumentId: "synthetic-document",
      items: extraction.output.biomarkers,
      labName: null,
      labReportId: "synthetic-report",
      now: "2026-09-02T00:00:00.000Z",
      reportDate: null,
      reportFileId: "synthetic-file",
      reportType: "cbc",
      userId: "synthetic-user"
    });
    const explanation = await ai.generatePatientExplanation({
      biomarkers,
      labReportId: "synthetic-report",
      userId: "synthetic-user"
    });

    expect(explanation.output.source_biomarker_ids.sort()).toEqual(biomarkers.map((marker) => marker.id).sort());
    expect(explanation.output.disclaimer).toContain("not a diagnosis or prescription");
    expect(runUnsafeLanguageFilter(JSON.stringify(explanation.output)).blocked).toBe(false);
  }, 180_000);
});
