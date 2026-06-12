import { MarkerProvider } from "./marker-provider";
import { MockFixtureDocumentParser } from "./mock-fixture-document-parser";
import { MockOcrProvider } from "./mock-ocr-provider";
import { TextractOcrProvider } from "./textract-ocr-provider";
import { isLocalLikeExtractionEnv, type DocumentParserProvider } from "./document-parser-provider";
import type { OcrProvider } from "./ocr-provider";

export type {
  DocumentParserProvider,
  ExtractedDocumentProviderStatus,
  ExtractedDocumentResult,
  ParseDocumentParams
} from "./document-parser-provider";
export type { OcrProvider } from "./ocr-provider";
export { MarkerProvider } from "./marker-provider";
export { MockFixtureDocumentParser } from "./mock-fixture-document-parser";
export { MockOcrProvider } from "./mock-ocr-provider";
export { TextractOcrProvider } from "./textract-ocr-provider";
export { classifyExtractedReport, type ReportClassificationResult } from "./report-classifier";

export function getDocumentParserProvider(): DocumentParserProvider {
  const provider = (process.env.DOCUMENT_PARSER_PROVIDER ?? "mock").toLowerCase();

  if (provider === "mock") {
    if (!isLocalLikeExtractionEnv() && process.env.ALLOW_MOCK_DOCUMENT_PARSER_IN_DEPLOYED_ENV !== "true") {
      throw new Error("Mock document parser is disabled outside local/development/test environments.");
    }
    return new MockFixtureDocumentParser();
  }

  return new MarkerProvider();
}

export function getOcrProvider(): OcrProvider {
  const provider = (process.env.OCR_PROVIDER ?? "mock").toLowerCase();

  if (provider === "mock") {
    if (!isLocalLikeExtractionEnv() && process.env.ALLOW_MOCK_OCR_IN_DEPLOYED_ENV !== "true") {
      throw new Error("Mock OCR provider is disabled outside local/development/test environments.");
    }
    return new MockOcrProvider();
  }

  return new TextractOcrProvider();
}
