import { randomUUID } from "crypto";

import { DeleteObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterEach, describe, expect, it } from "vitest";

import { TextractOcrProvider } from "./textract-ocr-provider";

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
  it("extracts a synthetic S3 PDF, persists provenance, and cleans up", async () => {
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
    const storageKey = `reports/textract-verification/${suffix}/synthetic-cbc.pdf`;
    const pdf = syntheticLabPdf();
    let userId: string | null = null;

    try {
      const createdUser = await service.auth.admin.createUser({
        email,
        email_confirm: true,
        password: `Textract-${suffix}!`,
        user_metadata: { full_name: "Synthetic Textract User" }
      });
      throwIfError(createdUser.error);
      userId = createdUser.data.user?.id ?? null;
      if (!userId) throw new Error("Synthetic staging Textract user was not created.");

      await s3.send(new PutObjectCommand({
        Body: pdf,
        Bucket: env.stagingBucket,
        ContentType: "application/pdf",
        Key: storageKey,
        Metadata: { synthetic_verification: "true" },
        ServerSideEncryption: "AES256"
      }));

      const reportFile = await insertRow(service, "report_files", {
        file_size_bytes: pdf.length,
        mime_type: "application/pdf",
        original_filename: "Synthetic CBC Verification.pdf",
        scan_status: "scan_passed",
        status: "scan_passed",
        storage_bucket: env.stagingBucket,
        storage_key: storageKey,
        storage_provider: "s3-private",
        user_id: userId
      });
      const labReport = await insertRow(service, "lab_reports", {
        report_file_id: reportFile.id,
        status: "processing",
        user_id: userId
      });

      const result = await new TextractOcrProvider().parseDocument({
        filename: "Synthetic CBC Verification.pdf",
        labReportId: labReport.id,
        mimeType: "application/pdf",
        reportFileId: reportFile.id,
        storageKey
      });
      expect(result.status, result.errorCode).toBe("success");
      expect(result.extractedText).toContain("Hemoglobin");
      expect(result.extractedText).toContain("13.4");
      expect(result.pageCount).toBe(1);
      expect(result.confidenceScore).toBeGreaterThan(0.8);

      const extractedDocument = await insertRow(service, "extracted_documents", {
        confidence_score: result.confidenceScore ?? null,
        error_code: result.errorCode ?? null,
        error_message: result.errorMessage ?? null,
        extracted_tables_json: result.extractedTablesJson ?? null,
        extracted_text: result.extractedText ?? null,
        extraction_version: 1,
        lab_report_id: labReport.id,
        ocr_provider: null,
        page_count: result.pageCount ?? null,
        page_metadata_json: result.pageMetadataJson ?? {},
        parser_name: "textract",
        parser_provider: "textract",
        parser_version: result.parserVersion,
        report_file_id: reportFile.id,
        status: result.status,
        user_id: userId
      });
      const persisted = await service
        .from("extracted_documents")
        .select("error_code, ocr_provider, parser_provider, parser_version, status, user_id")
        .eq("id", extractedDocument.id)
        .single();
      throwIfError(persisted.error);
      expect(persisted.data).toMatchObject({
        error_code: null,
        ocr_provider: null,
        parser_provider: "textract",
        parser_version: "aws_textract_document_text_detection_v1",
        status: "success",
        user_id: userId
      });
    } finally {
      await s3.send(new DeleteObjectCommand({ Bucket: env.stagingBucket, Key: storageKey })).catch(() => undefined);
      await cleanupSyntheticUser(service, email, userId);
      s3.destroy();
    }
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

function syntheticLabPdf() {
  const text = [
    "Lyf9 AI Synthetic CBC Report",
    "Hemoglobin 13.4 g/dL Reference 12.0 - 16.0",
    "WBC 7200 /cumm Reference 4000 - 11000",
    "Platelets 250000 /cumm Reference 150000 - 450000"
  ];
  const stream = `BT\n/F1 14 Tf\n50 760 Td\n${text.map((line, index) => `${index > 0 ? "0 -28 Td\n" : ""}(${escapePdfText(line)}) Tj`).join("\n")}\nET`;
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`
  ];
  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  for (const [index, object] of objects.entries()) {
    offsets.push(Buffer.byteLength(pdf));
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  }
  const xrefOffset = Buffer.byteLength(pdf);
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  pdf += offsets.slice(1).map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`).join("");
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  return Buffer.from(pdf);
}

function escapePdfText(value: string) {
  return value.replace(/([\\()])/g, "\\$1");
}

async function insertRow(service: SupabaseClient, table: string, values: Record<string, unknown>) {
  const result = await service.from(table).insert(values).select("id").single();
  throwIfError(result.error);
  return result.data as { id: string };
}

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
