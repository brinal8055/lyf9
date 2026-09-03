import {
  GetDocumentTextDetectionCommand,
  StartDocumentTextDetectionCommand,
  TextractClient,
  type Block,
  type GetDocumentTextDetectionCommandOutput
} from "@aws-sdk/client-textract";

import {
  isLocalLikeExtractionEnv,
  type ExtractedDocumentResult,
  type ParseDocumentParams
} from "./document-parser-provider";
import type { OcrProvider } from "./ocr-provider";

type TextractPollResult = Pick<
  GetDocumentTextDetectionCommandOutput,
  "Blocks" | "DocumentMetadata" | "JobStatus" | "NextToken" | "StatusMessage"
>;

export type TextractOcrProviderOptions = {
  bucket?: string;
  getResult?: (jobId: string, nextToken?: string) => Promise<TextractPollResult>;
  maxLowConfidenceLineRatio?: number;
  minLineConfidence?: number;
  minMeanConfidence?: number;
  minTextChars?: number;
  now?: () => number;
  pollIntervalMs?: number;
  region?: string;
  sleep?: (milliseconds: number) => Promise<void>;
  start?: (bucket: string, storageKey: string) => Promise<string>;
  timeoutMs?: number;
};

export class TextractOcrProvider implements OcrProvider {
  name = "textract";

  constructor(private readonly options: TextractOcrProviderOptions = {}) {}

  parseDocument(params: ParseDocumentParams): Promise<ExtractedDocumentResult> {
    return this.extractText(params);
  }

  async extractText(params: ParseDocumentParams): Promise<ExtractedDocumentResult> {
    const config = this.getConfig();
    if (!config) {
      return {
        errorCode: "ocr_configuration_required",
        errorMessage: isLocalLikeExtractionEnv()
          ? "Textract is not configured. Use OCR_PROVIDER=mock for local fixtures."
          : "Textract document extraction is not configured.",
        parserVersion: "textract_unconfigured",
        provider: this.name,
        status: "failed" as const
      };
    }

    if (!isValidReportStorageKey(params.storageKey)) {
      return failedResult("textract_invalid_storage_key", "Textract received an invalid report storage key.");
    }

    const client = new TextractClient({
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID ?? "",
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY ?? ""
      },
      region: config.region
    });
    const start = this.options.start ?? (async (bucket, storageKey) => {
      const output = await client.send(new StartDocumentTextDetectionCommand({
        DocumentLocation: { S3Object: { Bucket: bucket, Name: storageKey } }
      }));
      if (!output.JobId) throw new Error("textract_missing_job_id");
      return output.JobId;
    });
    const getResult = this.options.getResult ?? (async (jobId, nextToken) => client.send(
      new GetDocumentTextDetectionCommand({ JobId: jobId, MaxResults: 1_000, NextToken: nextToken })
    ));
    const now = this.options.now ?? Date.now;
    const sleep = this.options.sleep ?? ((milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)));
    const deadline = now() + config.timeoutMs;

    try {
      const jobId = await start(config.bucket, params.storageKey);
      let firstPage: TextractPollResult;

      for (;;) {
        firstPage = await getResult(jobId);
        if (firstPage.JobStatus === "SUCCEEDED") break;
        if (firstPage.JobStatus === "PARTIAL_SUCCESS") {
          return failedResult(
            "textract_partial_success",
            "Textract returned an incomplete document extraction."
          );
        }
        if (firstPage.JobStatus === "FAILED") {
          return failedResult("textract_job_failed", "Textract could not process the document.");
        }
        if (now() >= deadline) {
          return failedResult("textract_timeout", "Textract document extraction timed out.");
        }
        await sleep(Math.min(config.pollIntervalMs, Math.max(1, deadline - now())));
      }

      const blocks = [...(firstPage.Blocks ?? [])];
      const seenTokens = new Set<string>();
      let nextToken = firstPage.NextToken;
      while (nextToken) {
        if (seenTokens.has(nextToken)) {
          return failedResult("textract_invalid_pagination", "Textract returned invalid pagination data.");
        }
        seenTokens.add(nextToken);
        const page = await getResult(jobId, nextToken);
        blocks.push(...(page.Blocks ?? []));
        nextToken = page.NextToken;
      }

      return toExtractedDocument(blocks, firstPage.DocumentMetadata?.Pages, config.quality);
    } catch (caught) {
      return failedResult(textractErrorCode(caught), "Textract document extraction failed.");
    } finally {
      client.destroy();
    }
  }

  private getConfig() {
    const bucket = this.options.bucket ?? process.env.S3_REPORT_BUCKET?.trim();
    const region = this.options.region ?? process.env.AWS_TEXTRACT_REGION?.trim() ?? process.env.AWS_REGION?.trim();
    const credentialsConfigured = Boolean(
      this.options.start || (process.env.AWS_ACCESS_KEY_ID?.trim() && process.env.AWS_SECRET_ACCESS_KEY?.trim())
    );
    if (!bucket || !region || !credentialsConfigured) return null;

    return {
      bucket,
      pollIntervalMs: this.options.pollIntervalMs ?? positiveIntegerEnv("OCR_POLL_INTERVAL_MS", 2_000),
      quality: {
        maxLowConfidenceLineRatio: this.options.maxLowConfidenceLineRatio
          ?? unitIntervalEnv("OCR_MAX_LOW_CONFIDENCE_LINE_RATIO", 0.2),
        minLineConfidence: this.options.minLineConfidence
          ?? unitIntervalEnv("OCR_MIN_LINE_CONFIDENCE", 0.8),
        minMeanConfidence: this.options.minMeanConfidence
          ?? unitIntervalEnv("OCR_MIN_MEAN_CONFIDENCE", 0.85),
        minTextChars: this.options.minTextChars ?? positiveIntegerEnv("OCR_MIN_TEXT_CHARS", 40)
      },
      region,
      timeoutMs: this.options.timeoutMs ?? positiveIntegerEnv("OCR_TIMEOUT_SECONDS", 180) * 1_000
    };
  }
}

type OcrQualityPolicy = {
  maxLowConfidenceLineRatio: number;
  minLineConfidence: number;
  minMeanConfidence: number;
  minTextChars: number;
};

function toExtractedDocument(blocks: Block[], declaredPageCount: number | undefined, quality: OcrQualityPolicy) {
  const lines = blocks
    .filter((block) => block.BlockType === "LINE" && block.Text?.trim())
    .sort((left, right) =>
      (left.Page ?? 0) - (right.Page ?? 0) ||
      (left.Geometry?.BoundingBox?.Top ?? 0) - (right.Geometry?.BoundingBox?.Top ?? 0) ||
      (left.Geometry?.BoundingBox?.Left ?? 0) - (right.Geometry?.BoundingBox?.Left ?? 0)
    );
  const lineMetadata: Array<Record<string, unknown>> = [];
  let textOffset = 0;
  const extractedText = lines.map((line) => {
    const text = line.Text?.trim() ?? "";
    const startOffset = textOffset;
    const endOffset = startOffset + text.length;
    textOffset = endOffset + 1;
    const boundingBox = normalizedBoundingBox(line);
    lineMetadata.push({
      ...(boundingBox ? { boundingBox } : {}),
      confidenceScore: typeof line.Confidence === "number" ? line.Confidence / 100 : null,
      endOffset,
      pageNumber: line.Page ?? 1,
      startOffset
    });
    return text;
  }).join("\n");
  if (!extractedText) {
    return failedResult("textract_no_text", "Textract did not find readable text in the document.");
  }

  const pageCount = declaredPageCount ?? Math.max(1, ...lines.map((line) => line.Page ?? 1));
  const confidenceValues = lines
    .map((line) => line.Confidence)
    .filter((value): value is number => typeof value === "number");
  const confidenceScore = confidenceValues.length > 0
    ? confidenceValues.reduce((sum, value) => sum + value, 0) / confidenceValues.length / 100
    : undefined;
  const pages = Array.from({ length: pageCount }, (_, index) => {
    const pageLines = lines.filter((line) => (line.Page ?? 1) === index + 1);
    const pageConfidences = pageLines
      .map((line) => line.Confidence)
      .filter((value): value is number => typeof value === "number")
      .map((value) => value / 100);
    return {
      averageConfidence: average(pageConfidences),
      lineCount: pageLines.length,
      minimumConfidence: pageConfidences.length > 0 ? Math.min(...pageConfidences) : null,
      pageNumber: index + 1
    };
  });
  const normalizedConfidences = confidenceValues.map((value) => value / 100);
  const lowConfidenceLineCount = normalizedConfidences.filter(
    (confidence) => confidence < quality.minLineConfidence
  ).length;
  const lowConfidenceLineRatio = lines.length > 0 ? lowConfidenceLineCount / lines.length : 1;
  const qualityFailed = extractedText.replace(/\s/g, "").length < quality.minTextChars
    || confidenceValues.length !== lines.length
    || confidenceScore === undefined
    || confidenceScore < quality.minMeanConfidence
    || lowConfidenceLineRatio > quality.maxLowConfidenceLineRatio;

  const pageMetadataJson = {
    lineCount: lines.length,
    lines: lineMetadata,
    lowConfidenceLineCount,
    lowConfidenceLineRatio,
    pages,
    schemaVersion: 1
  };

  if (qualityFailed) {
    return {
      confidenceScore,
      errorCode: "textract_low_text_confidence",
      errorMessage: "Textract output requires manual review because text quality is below the configured threshold.",
      extractedTablesJson: [],
      extractedText,
      pageCount,
      pageMetadataJson,
      parserVersion: "aws_textract_document_text_detection_v1",
      provider: "textract",
      status: "low_text_confidence" as const
    };
  }

  return {
    confidenceScore,
    extractedTablesJson: [],
    extractedText,
    pageCount,
    pageMetadataJson,
    parserVersion: "aws_textract_document_text_detection_v1",
    provider: "textract",
    status: "success" as const
  };
}

function failedResult(errorCode: string, errorMessage: string) {
  return {
    errorCode,
    errorMessage,
    parserVersion: "aws_textract_document_text_detection_v1",
    provider: "textract",
    status: "failed" as const
  };
}

function isValidReportStorageKey(storageKey: string) {
  return storageKey.startsWith("reports/") && !storageKey.includes("..") && !storageKey.includes("//");
}

function positiveIntegerEnv(name: string, fallback: number) {
  const raw = process.env[name];
  if (!raw) return fallback;
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value <= 0) throw new Error(`${name} must be a positive integer.`);
  return value;
}

function unitIntervalEnv(name: string, fallback: number) {
  const raw = process.env[name];
  if (!raw) return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw new Error(`${name} must be between 0 and 1.`);
  }
  return value;
}

function average(values: number[]) {
  if (values.length === 0) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function normalizedBoundingBox(line: Block) {
  const box = line.Geometry?.BoundingBox;
  if (
    typeof box?.Height !== "number" ||
    typeof box.Left !== "number" ||
    typeof box.Top !== "number" ||
    typeof box.Width !== "number"
  ) {
    return null;
  }
  return { height: box.Height, left: box.Left, top: box.Top, width: box.Width };
}

function textractErrorCode(caught: unknown) {
  const name = caught instanceof Error ? caught.name : "";
  if (name === "AccessDeniedException") return "textract_access_denied";
  if (
    name === "LimitExceededException" ||
    name === "ProvisionedThroughputExceededException" ||
    name === "ThrottlingException"
  ) {
    return "textract_throttled";
  }
  if (name === "UnsupportedDocumentException" || name === "BadDocumentException") {
    return "textract_unsupported_document";
  }
  if (caught instanceof Error && caught.message === "textract_missing_job_id") {
    return "textract_missing_job_id";
  }
  return "textract_request_failed";
}
