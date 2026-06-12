import { minExtractedTextChars, type DocumentParserProvider } from "./document-parser-provider";

const cbcText = [
  "Complete Blood Count",
  "Hemoglobin 13.4 g/dL",
  "WBC 7200 cells/uL",
  "Platelet Count 250000 /uL",
  "RBC 4.8 million/uL"
].join("\n");

const lipidText = [
  "Lipid Profile",
  "Total Cholesterol 180 mg/dL",
  "Triglycerides 120 mg/dL",
  "HDL 52 mg/dL",
  "LDL 102 mg/dL"
].join("\n");

export class MockFixtureDocumentParser implements DocumentParserProvider {
  name = "mock_fixture_document_parser";

  async parseDocument(params: Parameters<DocumentParserProvider["parseDocument"]>[0]) {
    const filename = params.filename?.toLowerCase() ?? "";

    if (params.mimeType.startsWith("image/") || filename.includes("scan") || filename.includes("ocr")) {
      return {
        confidenceScore: 0.2,
        errorCode: "ocr_required",
        errorMessage: "Readable digital text was not found.",
        pageCount: 1,
        parserVersion: "mock_fixture_v1",
        provider: this.name,
        status: "ocr_required" as const
      };
    }

    if (filename.includes("low-text")) {
      return {
        confidenceScore: 0.35,
        errorCode: "low_text_confidence",
        errorMessage: "Extracted text is below confidence threshold.",
        extractedText: "CBC",
        pageCount: 1,
        parserVersion: "mock_fixture_v1",
        provider: this.name,
        status: "low_text_confidence" as const
      };
    }

    if (filename.includes("radiology") || filename.includes("mri") || filename.includes("ecg")) {
      return success("Radiology MRI report findings section", filename);
    }

    if (filename.includes("lipid")) {
      return success(lipidText, filename);
    }

    if (filename.includes("empty")) {
      return {
        confidenceScore: 0,
        errorCode: "no_text",
        errorMessage: "No text was extracted.",
        pageCount: 1,
        parserVersion: "mock_fixture_v1",
        provider: this.name,
        status: "failed" as const
      };
    }

    return success(cbcText, filename);
  }
}

function success(text: string, filename: string) {
  return {
    confidenceScore: text.length >= minExtractedTextChars() ? 0.9 : 0.78,
    extractedTablesJson: [[text.split("\n").map((line) => [line])]],
    extractedText: text,
    pageCount: filename.includes("full-body") ? 3 : 1,
    pageMetadataJson: { source: "fixture" },
    parserVersion: "mock_fixture_v1",
    provider: "mock_fixture_document_parser",
    status: "success" as const
  };
}
