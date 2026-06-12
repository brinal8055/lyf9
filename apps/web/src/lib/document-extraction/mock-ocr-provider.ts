import type { OcrProvider } from "./ocr-provider";

export class MockOcrProvider implements OcrProvider {
  name = "mock_ocr";

  async extractText(params: Parameters<OcrProvider["extractText"]>[0]) {
    const filename = params.filename?.toLowerCase() ?? "";
    const extractedText = filename.includes("lipid")
      ? "Lipid Profile\nTotal Cholesterol 180 mg/dL\nHDL 52 mg/dL\nLDL 102 mg/dL"
      : "Complete Blood Count\nHemoglobin 13.4 g/dL\nWBC 7200 cells/uL\nPlatelet Count 250000 /uL";

    return {
      confidenceScore: 0.84,
      extractedTablesJson: [[extractedText.split("\n").map((line) => [line])]],
      extractedText,
      pageCount: 1,
      pageMetadataJson: { source: "mock_ocr" },
      parserVersion: "mock_ocr_v1",
      provider: this.name,
      status: "success" as const
    };
  }
}
