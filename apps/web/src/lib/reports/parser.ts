import type { ExtractedDocumentStatus } from "./types";

export type DocumentParserInput = {
  bytes: Buffer;
  filename: string;
  mimeType: string;
};

export type DocumentParserResult = {
  error: string | null;
  extractedTablesJson: string[][][];
  extractedText: string | null;
  pageCount: number | null;
  parserName: string;
  parserVersion: string;
  status: ExtractedDocumentStatus;
};

export type DocumentParser = {
  parserName: string;
  parserVersion: string;
  parse(input: DocumentParserInput): Promise<DocumentParserResult>;
};

export const localDocumentParser: DocumentParser = {
  parserName: "local_text_parser",
  parserVersion: "phase3a_local_v1",
  async parse(input) {
    if (input.mimeType.startsWith("image/")) {
      return ocrRequired(
        "Image report uploaded. Real OCR is not configured in this scaffold.",
        estimatePageCount(input.bytes)
      );
    }

    const extractedText = normalizeText(input.bytes.toString("utf8"));
    const alphaCount = (extractedText.match(/[a-z]/gi) ?? []).length;

    if (extractedText.length < 80 || alphaCount < 30) {
      return ocrRequired(
        "Readable text was not found. Marker or OCR should process this file in production.",
        estimatePageCount(input.bytes)
      );
    }

    return {
      error: null,
      extractedTablesJson: extractTables(extractedText),
      extractedText,
      pageCount: estimatePageCount(input.bytes),
      parserName: this.parserName,
      parserVersion: this.parserVersion,
      status: "text_extracted"
    };
  }
};

function ocrRequired(error: string, pageCount: number | null): DocumentParserResult {
  return {
    error,
    extractedTablesJson: [],
    extractedText: null,
    pageCount,
    parserName: localDocumentParser.parserName,
    parserVersion: localDocumentParser.parserVersion,
    status: "ocr_required"
  };
}

function normalizeText(text: string) {
  return text
    .replace(/\0/g, " ")
    .replace(/[^\t\n\r -~]/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\r\n/g, "\n")
    .trim();
}

function extractTables(text: string) {
  const rows = text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => splitTableLine(line))
    .filter((cells) => cells.length >= 2);

  return rows.length ? [rows] : [];
}

function splitTableLine(line: string) {
  if (line.includes("|")) {
    return line
      .split("|")
      .map((cell) => cell.trim())
      .filter(Boolean);
  }

  const wideSplit = line.split(/\s{2,}/).map((cell) => cell.trim()).filter(Boolean);
  if (wideSplit.length >= 2) {
    return wideSplit;
  }

  const biomarkerLike = line.match(/^([A-Za-z][A-Za-z0-9 /().%-]+?)\s+([-+]?\d+(\.\d+)?)\s+([A-Za-z/%]+)?\s*(.*)$/);
  if (!biomarkerLike) {
    return [line];
  }

  return [
    biomarkerLike[1].trim(),
    biomarkerLike[2].trim(),
    biomarkerLike[4]?.trim() ?? "",
    biomarkerLike[5]?.trim() ?? ""
  ].filter(Boolean);
}

function estimatePageCount(bytes: Buffer) {
  const raw = bytes.toString("latin1");
  const pdfPageMatches = raw.match(/\/Type\s*\/Page\b/g);
  if (pdfPageMatches?.length) {
    return pdfPageMatches.length;
  }

  const text = bytes.toString("utf8");
  const formFeedPages = text.split("\f").filter((page) => page.trim().length > 0).length;
  return Math.max(1, formFeedPages);
}
