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

      return toExtractedDocument(blocks, firstPage.DocumentMetadata?.Pages);
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
      region,
      timeoutMs: this.options.timeoutMs ?? positiveIntegerEnv("OCR_TIMEOUT_SECONDS", 180) * 1_000
    };
  }
}

function toExtractedDocument(blocks: Block[], declaredPageCount?: number) {
  const lines = blocks
    .filter((block) => block.BlockType === "LINE" && block.Text?.trim())
    .sort((left, right) =>
      (left.Page ?? 0) - (right.Page ?? 0) ||
      (left.Geometry?.BoundingBox?.Top ?? 0) - (right.Geometry?.BoundingBox?.Top ?? 0) ||
      (left.Geometry?.BoundingBox?.Left ?? 0) - (right.Geometry?.BoundingBox?.Left ?? 0)
    );
  const extractedText = lines.map((line) => line.Text?.trim()).filter(Boolean).join("\n");
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
    return { lineCount: pageLines.length, pageNumber: index + 1 };
  });

  return {
    confidenceScore,
    extractedTablesJson: [],
    extractedText,
    pageCount,
    pageMetadataJson: { lineCount: lines.length, pages },
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

function textractErrorCode(caught: unknown) {
  const name = caught instanceof Error ? caught.name : "";
  if (name === "AccessDeniedException") return "textract_access_denied";
  if (name === "UnsupportedDocumentException" || name === "BadDocumentException") {
    return "textract_unsupported_document";
  }
  if (caught instanceof Error && caught.message === "textract_missing_job_id") {
    return "textract_missing_job_id";
  }
  return "textract_request_failed";
}
