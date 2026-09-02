import { afterEach, describe, expect, it } from "vitest";

import { TextractOcrProvider } from "./textract-ocr-provider";

const originalAccessKey = process.env.AWS_ACCESS_KEY_ID;
const originalSecret = process.env.AWS_SECRET_ACCESS_KEY;

afterEach(() => {
  restoreEnv("AWS_ACCESS_KEY_ID", originalAccessKey);
  restoreEnv("AWS_SECRET_ACCESS_KEY", originalSecret);
});

describe("TextractOcrProvider", () => {
  it("fails closed when configuration is missing", async () => {
    delete process.env.AWS_ACCESS_KEY_ID;
    delete process.env.AWS_SECRET_ACCESS_KEY;

    await expect(new TextractOcrProvider().extractText(params())).resolves.toMatchObject({
      errorCode: "ocr_configuration_required",
      status: "failed"
    });
  });

  it("starts an S3 job, waits, paginates, and returns ordered line text", async () => {
    let currentTime = 0;
    const calls: Array<{ jobId: string; nextToken?: string }> = [];
    const provider = new TextractOcrProvider({
      bucket: "lyf9-reports-storage-staging",
      getResult: async (jobId, nextToken) => {
        calls.push({ jobId, nextToken });
        if (calls.length === 1) return { JobStatus: "IN_PROGRESS" };
        if (!nextToken) {
          return {
            Blocks: [line("TSH 4.20 uIU/mL", 2, 0.2, 98), line("CBC", 1, 0.1, 96)],
            DocumentMetadata: { Pages: 2 },
            JobStatus: "SUCCEEDED",
            NextToken: "page-2"
          };
        }
        return { Blocks: [line("Hemoglobin 13.4 g/dL", 1, 0.2, 100)], JobStatus: "SUCCEEDED" };
      },
      now: () => currentTime,
      pollIntervalMs: 10,
      region: "ap-south-1",
      sleep: async (milliseconds) => { currentTime += milliseconds; },
      start: async (bucket, storageKey) => {
        expect(bucket).toBe("lyf9-reports-storage-staging");
        expect(storageKey).toBe("reports/user/report/report.pdf");
        return "textract-job-id";
      },
      timeoutMs: 100
    });

    await expect(provider.parseDocument(params())).resolves.toMatchObject({
      confidenceScore: 0.98,
      extractedText: "CBC\nHemoglobin 13.4 g/dL\nTSH 4.20 uIU/mL",
      pageCount: 2,
      pageMetadataJson: {
        lineCount: 3,
        pages: [{ lineCount: 2, pageNumber: 1 }, { lineCount: 1, pageNumber: 2 }]
      },
      provider: "textract",
      status: "success"
    });
    expect(calls).toEqual([
      { jobId: "textract-job-id", nextToken: undefined },
      { jobId: "textract-job-id", nextToken: undefined },
      { jobId: "textract-job-id", nextToken: "page-2" }
    ]);
  });

  it("times out without returning document text", async () => {
    let currentTime = 0;
    const provider = new TextractOcrProvider({
      bucket: "lyf9-reports-storage-staging",
      getResult: async () => ({ JobStatus: "IN_PROGRESS" }),
      now: () => currentTime,
      pollIntervalMs: 10,
      region: "ap-south-1",
      sleep: async (milliseconds) => { currentTime += milliseconds; },
      start: async () => "textract-job-id",
      timeoutMs: 15
    });

    await expect(provider.extractText(params())).resolves.toMatchObject({
      errorCode: "textract_timeout",
      status: "failed"
    });
  });

  it("fails closed when Textract reports only partial success", async () => {
    const provider = new TextractOcrProvider({
      bucket: "lyf9-reports-storage-staging",
      getResult: async () => ({ JobStatus: "PARTIAL_SUCCESS", StatusMessage: "One page failed." }),
      region: "ap-south-1",
      start: async () => "textract-job-id"
    });

    await expect(provider.extractText(params())).resolves.toMatchObject({
      errorCode: "textract_partial_success",
      status: "failed"
    });
  });

  it("rejects storage keys outside the private reports prefix", async () => {
    const provider = new TextractOcrProvider({
      bucket: "lyf9-reports-storage-staging",
      region: "ap-south-1",
      start: async () => "unused"
    });

    await expect(provider.extractText({ ...params(), storageKey: "public/report.pdf" })).resolves.toMatchObject({
      errorCode: "textract_invalid_storage_key",
      status: "failed"
    });
  });
});

function params() {
  return {
    filename: "synthetic-lab-report.pdf",
    mimeType: "application/pdf",
    reportFileId: "report-file-id",
    storageKey: "reports/user/report/report.pdf"
  };
}

function line(text: string, page: number, top: number, confidence: number) {
  return {
    BlockType: "LINE" as const,
    Confidence: confidence,
    Geometry: { BoundingBox: { Left: 0.1, Top: top } },
    Page: page,
    Text: text
  };
}

function restoreEnv(name: string, value: string | undefined) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}
