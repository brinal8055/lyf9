import type { ExtractedDocumentResult, ParseDocumentParams } from "./document-parser-provider";

export type OcrProvider = {
  name: string;
  extractText(params: ParseDocumentParams): Promise<ExtractedDocumentResult>;
};
