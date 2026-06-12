export type ExtractedDocumentProviderStatus =
  | "success"
  | "low_text_confidence"
  | "ocr_required"
  | "unsupported"
  | "failed";

export type ExtractedDocumentResult = {
  confidenceScore?: number;
  errorCode?: string;
  errorMessage?: string;
  extractedTablesJson?: unknown;
  extractedText?: string;
  pageCount?: number;
  pageMetadataJson?: unknown;
  parserVersion: string;
  provider: string;
  status: ExtractedDocumentProviderStatus;
};

export type ParseDocumentParams = {
  filename?: string;
  labReportId?: string;
  mimeType: string;
  reportFileId: string;
  storageKey: string;
};

export type DocumentParserProvider = {
  name: string;
  parseDocument(params: ParseDocumentParams): Promise<ExtractedDocumentResult>;
};

export function isLocalLikeExtractionEnv() {
  const appEnv = (process.env.APP_ENV ?? process.env.NODE_ENV ?? "development").toLowerCase();
  return appEnv === "local" || appEnv === "development" || appEnv === "test";
}

export function minExtractedTextChars() {
  const configured = Number(process.env.MIN_EXTRACTED_TEXT_CHARS);
  return Number.isFinite(configured) && configured > 0 ? configured : 500;
}
