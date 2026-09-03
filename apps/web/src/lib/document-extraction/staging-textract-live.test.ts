import { createHash, randomUUID } from "crypto";
import { readFile } from "fs/promises";

import { DeleteObjectCommand, ListObjectsV2Command, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterEach, describe, expect, it } from "vitest";

import { TextractOcrProvider } from "./textract-ocr-provider";
import { classifyExtractedReport } from "./report-classifier";

const liveEnabled = process.env.RUN_LIVE_STAGING_TEXTRACT === "true";
const describeLive = liveEnabled ? describe : describe.skip;
const guardEnvNames = [
  "APP_ENV",
  "AWS_ACCESS_KEY_ID",
  "AWS_REGION",
  "AWS_SECRET_ACCESS_KEY",
  "AWS_TEXTRACT_REGION",
  "DOCUMENT_PARSER_PROVIDER",
  "NEXT_PUBLIC_SUPABASE_URL",
  "OCR_PROVIDER",
  "PRODUCTION_S3_BUCKET",
  "S3_REPORT_BUCKET",
  "STAGING_S3_BUCKET",
  "STAGING_SUPABASE_PROJECT_REF",
  "SUPABASE_SERVICE_ROLE_KEY"
] as const;
const originalGuardEnv = Object.fromEntries(guardEnvNames.map((name) => [name, process.env[name]]));

afterEach(() => {
  for (const name of guardEnvNames) {
    const value = originalGuardEnv[name];
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
});

describe("staging Textract target guard", () => {
  it("refuses production runtime and buckets", () => {
    setValidGuardEnv();
    process.env.APP_ENV = "production";
    expect(getLiveEnv).toThrow("APP_ENV=staging");

    setValidGuardEnv();
    process.env.PRODUCTION_S3_BUCKET = process.env.STAGING_S3_BUCKET;
    expect(getLiveEnv).toThrow("staging and production buckets match");
  });

  it("requires explicit Textract parser and OCR selection", () => {
    setValidGuardEnv();
    process.env.DOCUMENT_PARSER_PROVIDER = "marker";
    expect(getLiveEnv).toThrow("DOCUMENT_PARSER_PROVIDER=textract");

    setValidGuardEnv();
    process.env.OCR_PROVIDER = "mock";
    expect(getLiveEnv).toThrow("OCR_PROVIDER=textract");
  });
});

describeLive("live staging Textract document extraction", () => {
  it("extracts a synthetic CBC scan, blocks a blank scan, persists provenance, and cleans up", async () => {
    const env = getLiveEnv();
    const service = createClient(env.supabaseUrl, env.serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    });
    const s3 = new S3Client({
      credentials: {
        accessKeyId: env.awsAccessKeyId,
        secretAccessKey: env.awsSecretAccessKey
      },
      region: env.awsRegion
    });
    const suffix = `${Date.now()}-${randomUUID().slice(0, 8)}`;
    const email = `lyf9-staging-textract-${suffix}@lyf9.ai`;
    const storagePrefix = `reports/textract-verification/${suffix}/`;
    const readableStorageKey = `${storagePrefix}synthetic-cbc-scan.png`;
    const blankStorageKey = `${storagePrefix}synthetic-blank-scan.png`;
    const readableImage = await readFixture("synthetic-cbc-scan.png");
    const blankImage = await readFixture("synthetic-blank-scan.png");
    let userId: string | null = null;
    let caughtFailure: unknown;

    try {
      expect(createHash("sha256").update(readableImage).digest("hex"))
        .toBe("6ddafb199b5567c5b5812997e9cdc6efa62fe854b3b3c0fdd97051de217cf115");
      expect(createHash("sha256").update(blankImage).digest("hex"))
        .toBe("301051ebb765f55b11b770934c6cb48595561612bc47e8728f3a4983711c69a3");

      const createdUser = await service.auth.admin.createUser({
        email,
        email_confirm: true,
        password: `Textract-${suffix}!`,
        user_metadata: { full_name: "Synthetic Textract User" }
      });
      throwIfError(createdUser.error);
      userId = createdUser.data.user?.id ?? null;
      if (!userId) throw new Error("Synthetic staging Textract user was not created.");

      await Promise.all([
        putSyntheticImage(s3, env.stagingBucket, readableStorageKey, readableImage),
        putSyntheticImage(s3, env.stagingBucket, blankStorageKey, blankImage)
      ]);

      const reportFile = await insertRow(service, "report_files", {
        file_size_bytes: readableImage.length,
        mime_type: "image/png",
        original_filename: "Synthetic CBC Scan Verification.png",
        scan_status: "scan_passed",
        status: "scan_passed",
        storage_bucket: env.stagingBucket,
        storage_key: readableStorageKey,
        storage_provider: "s3-private",
        user_id: userId
      });
      const labReport = await insertRow(service, "lab_reports", {
        report_file_id: reportFile.id,
        status: "processing",
        user_id: userId
      });
      const blankReportFile = await insertRow(service, "report_files", {
        file_size_bytes: blankImage.length,
        mime_type: "image/png",
        original_filename: "Synthetic Blank Scan Verification.png",
        scan_status: "scan_passed",
        status: "scan_passed",
        storage_bucket: env.stagingBucket,
        storage_key: blankStorageKey,
        storage_provider: "s3-private",
        user_id: userId
      });
      const blankLabReport = await insertRow(service, "lab_reports", {
        report_file_id: blankReportFile.id,
        status: "processing",
        user_id: userId
      });

      const result = await new TextractOcrProvider().parseDocument({
        filename: "Synthetic CBC Scan Verification.png",
        labReportId: labReport.id,
        mimeType: "image/png",
        reportFileId: reportFile.id,
        storageKey: readableStorageKey
      });
      expect(result.status, result.errorCode).toBe("success");
      expect(result.extractedText).toContain("Hemoglobin");
      expect(result.extractedText).toContain("13.4");
      expect(result.pageCount).toBe(1);
      expect(result.confidenceScore).toBeGreaterThanOrEqual(0.85);
      const pageMetadata = result.pageMetadataJson as PageMetadata;
      expect(pageMetadata.schemaVersion).toBe(1);
      expect(pageMetadata.pages).toEqual([
        expect.objectContaining({ lineCount: expect.any(Number), pageNumber: 1 })
      ]);
      expect(pageMetadata.lines.length).toBeGreaterThanOrEqual(6);
      expect(pageMetadata.lines.every((line) =>
        line.pageNumber === 1 &&
        typeof line.confidenceScore === "number" &&
        typeof line.startOffset === "number" &&
        typeof line.endOffset === "number" &&
        !Object.hasOwn(line, "text")
      )).toBe(true);

      const classification = await classifyExtractedReport({
        extractedText: result.extractedText ?? "",
        filename: "Synthetic CBC Scan Verification.png"
      });
      expect(classification).toMatchObject({ reportType: "cbc", status: "supported" });

      const extractedDocument = await persistExtraction(service, {
        labReportId: labReport.id,
        reportFileId: reportFile.id,
        result,
        userId
      });
      const persisted = await service
        .from("extracted_documents")
        .select("error_code, ocr_provider, page_metadata_json, parser_provider, parser_version, status, user_id")
        .eq("id", extractedDocument.id)
        .single();
      throwIfError(persisted.error);
      expect(persisted.data).toMatchObject({
        error_code: null,
        ocr_provider: "textract",
        parser_provider: "textract",
        parser_version: "aws_textract_document_text_detection_v1",
        status: "success",
        user_id: userId
      });
      expect((persisted.data?.page_metadata_json as PageMetadata).schemaVersion).toBe(1);

      const blankResult = await new TextractOcrProvider().parseDocument({
        filename: "Synthetic Blank Scan Verification.png",
        labReportId: blankLabReport.id,
        mimeType: "image/png",
        reportFileId: blankReportFile.id,
        storageKey: blankStorageKey
      });
      expect(blankResult).toMatchObject({ errorCode: "textract_no_text", status: "failed" });
      await persistExtraction(service, {
        labReportId: blankLabReport.id,
        reportFileId: blankReportFile.id,
        result: blankResult,
        userId
      });

      const [modelRuns, biomarkers, insights] = await Promise.all([
        countRows(service, "model_runs", userId),
        countRows(service, "biomarker_results", userId),
        countRows(service, "health_insights", userId)
      ]);
      expect({ biomarkers, insights, modelRuns }).toEqual({ biomarkers: 0, insights: 0, modelRuns: 0 });
    } catch (caught) {
      caughtFailure = caught;
    } finally {
      await Promise.all([
        s3.send(new DeleteObjectCommand({ Bucket: env.stagingBucket, Key: readableStorageKey })).catch(() => undefined),
        s3.send(new DeleteObjectCommand({ Bucket: env.stagingBucket, Key: blankStorageKey })).catch(() => undefined)
      ]);
      await cleanupSyntheticUser(service, email, userId);
      const remainingObjects = await s3.send(new ListObjectsV2Command({
        Bucket: env.stagingBucket,
        Prefix: storagePrefix
      }));
      expect(remainingObjects.Contents ?? []).toHaveLength(0);
      if (userId) {
        const remainingRows = await Promise.all([
          countRows(service, "report_files", userId),
          countRows(service, "lab_reports", userId),
          countRows(service, "extracted_documents", userId)
        ]);
        expect(remainingRows).toEqual([0, 0, 0]);
      }
      s3.destroy();
    }

    if (caughtFailure) throw caughtFailure;
  }, 240_000);
});

function getLiveEnv() {
  if (process.env.APP_ENV !== "staging") {
    throw new Error("Live Textract verification requires APP_ENV=staging.");
  }
  if (process.env.DOCUMENT_PARSER_PROVIDER !== "textract") {
    throw new Error("Live Textract verification requires DOCUMENT_PARSER_PROVIDER=textract.");
  }
  if (process.env.OCR_PROVIDER !== "textract") {
    throw new Error("Live Textract verification requires OCR_PROVIDER=textract.");
  }

  const awsAccessKeyId = requiredEnv("AWS_ACCESS_KEY_ID");
  const awsRegion = requiredEnv("AWS_REGION");
  const awsSecretAccessKey = requiredEnv("AWS_SECRET_ACCESS_KEY");
  const textractRegion = requiredEnv("AWS_TEXTRACT_REGION");
  const reportBucket = requiredEnv("S3_REPORT_BUCKET");
  const stagingBucket = requiredEnv("STAGING_S3_BUCKET");
  const productionBucket = requiredEnv("PRODUCTION_S3_BUCKET");
  const projectRef = requiredEnv("STAGING_SUPABASE_PROJECT_REF");
  const supabaseUrl = requiredEnv("NEXT_PUBLIC_SUPABASE_URL");
  const serviceRoleKey = requiredEnv("SUPABASE_SERVICE_ROLE_KEY");

  if (reportBucket !== stagingBucket) {
    throw new Error("Live Textract verification requires S3_REPORT_BUCKET=STAGING_S3_BUCKET.");
  }
  if (stagingBucket === productionBucket) {
    throw new Error("Refusing live Textract verification: staging and production buckets match.");
  }
  if (!/staging|stage|dev|test/i.test(stagingBucket)) {
    throw new Error("Refusing live Textract verification: bucket name is not staging-specific.");
  }
  if (awsRegion !== "ap-south-1" || textractRegion !== awsRegion) {
    throw new Error("Live Textract verification requires S3 and Textract in staging ap-south-1.");
  }
  if (new URL(supabaseUrl).origin !== `https://${projectRef}.supabase.co`) {
    throw new Error("Refusing live Textract verification: Supabase URL does not match the staging project.");
  }

  return {
    awsAccessKeyId,
    awsRegion,
    awsSecretAccessKey,
    serviceRoleKey,
    stagingBucket,
    supabaseUrl
  };
}

async function insertRow(service: SupabaseClient, table: string, values: Record<string, unknown>) {
  const result = await service.from(table).insert(values).select("id").single();
  throwIfError(result.error);
  return result.data as { id: string };
}

async function persistExtraction(service: SupabaseClient, input: {
  labReportId: string;
  reportFileId: string;
  result: Awaited<ReturnType<TextractOcrProvider["parseDocument"]>>;
  userId: string;
}) {
  return insertRow(service, "extracted_documents", {
    confidence_score: input.result.confidenceScore ?? null,
    error_code: input.result.errorCode ?? null,
    error_message: input.result.errorMessage ?? null,
    extracted_tables_json: input.result.extractedTablesJson ?? null,
    extracted_text: input.result.extractedText ?? null,
    extraction_version: 1,
    lab_report_id: input.labReportId,
    ocr_provider: "textract",
    page_count: input.result.pageCount ?? null,
    page_metadata_json: input.result.pageMetadataJson ?? {},
    parser_name: "textract",
    parser_provider: "textract",
    parser_version: input.result.parserVersion,
    report_file_id: input.reportFileId,
    status: input.result.status,
    user_id: input.userId
  });
}

async function putSyntheticImage(
  s3: S3Client,
  bucket: string,
  storageKey: string,
  body: Buffer
) {
  await s3.send(new PutObjectCommand({
    Body: body,
    Bucket: bucket,
    ContentType: "image/png",
    Key: storageKey,
    Metadata: { synthetic_verification: "true" },
    ServerSideEncryption: "AES256"
  }));
}

async function countRows(service: SupabaseClient, table: string, userId: string) {
  const result = await service.from(table).select("id", { count: "exact", head: true }).eq("user_id", userId);
  throwIfError(result.error);
  return result.count ?? 0;
}

async function readFixture(filename: string) {
  return readFile(new URL(`../../../../../tests/fixtures/ocr/${filename}`, import.meta.url));
}

type PageMetadata = {
  lines: Array<{
    confidenceScore: number | null;
    endOffset: number;
    pageNumber: number;
    startOffset: number;
  }>;
  pages: Array<{ lineCount: number; pageNumber: number }>;
  schemaVersion: number;
};

async function cleanupSyntheticUser(service: SupabaseClient, email: string, knownUserId: string | null) {
  let userId = knownUserId;
  if (!userId) {
    const listed = await service.auth.admin.listUsers({ page: 1, perPage: 1_000 });
    throwIfError(listed.error);
    userId = listed.data.users.find((user) => user.email === email)?.id ?? null;
  }
  if (!userId) return;
  const deleted = await service.auth.admin.deleteUser(userId);
  throwIfError(deleted.error);
}

function requiredEnv(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required live Textract env: ${name}`);
  return value;
}

function throwIfError(error: { message: string } | null) {
  if (error) throw new Error(error.message);
}

function setValidGuardEnv() {
  process.env.APP_ENV = "staging";
  process.env.AWS_ACCESS_KEY_ID = "synthetic-access-key";
  process.env.AWS_REGION = "ap-south-1";
  process.env.AWS_SECRET_ACCESS_KEY = "synthetic-secret";
  process.env.AWS_TEXTRACT_REGION = "ap-south-1";
  process.env.DOCUMENT_PARSER_PROVIDER = "textract";
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://staging-ref.supabase.co";
  process.env.OCR_PROVIDER = "textract";
  process.env.PRODUCTION_S3_BUCKET = "lyf9-reports-storage-prod";
  process.env.S3_REPORT_BUCKET = "lyf9-reports-storage-staging";
  process.env.STAGING_S3_BUCKET = "lyf9-reports-storage-staging";
  process.env.STAGING_SUPABASE_PROJECT_REF = "staging-ref";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "synthetic-service-role";
}
