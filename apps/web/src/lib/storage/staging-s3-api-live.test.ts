import { createHash, randomUUID } from "crypto";

import {
  DeleteObjectCommand,
  HeadObjectCommand,
  S3Client
} from "@aws-sdk/client-s3";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterEach, describe, expect, it } from "vitest";

const liveEnabled = process.env.RUN_LIVE_STAGING_S3_API === "true";
const describeLive = liveEnabled ? describe : describe.skip;
const guardEnvNames = [
  "APP_ENV",
  "APP_BASE_URL",
  "AWS_ACCESS_KEY_ID",
  "AWS_REGION",
  "AWS_SECRET_ACCESS_KEY",
  "NEXT_PUBLIC_SUPABASE_URL",
  "PRODUCTION_S3_BUCKET",
  "S3_REPORT_BUCKET",
  "STAGING_APP_ORIGIN",
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

describe("staging S3 target guard", () => {
  it("refuses production-named buckets", () => {
    setValidGuardEnv();
    process.env.S3_REPORT_BUCKET = "lyf9-reports-prod";
    process.env.STAGING_S3_BUCKET = "lyf9-reports-prod";
    expect(getLiveEnv).toThrow("bucket name is not staging-specific");
  });

  it("refuses a bucket that matches the declared production bucket", () => {
    setValidGuardEnv();
    process.env.PRODUCTION_S3_BUCKET = process.env.STAGING_S3_BUCKET;
    expect(getLiveEnv).toThrow("staging and production buckets match");
  });
});

describeLive("live staging private S3 API verification", () => {
  it("uploads, downloads, audits, and deletes one synthetic report", async () => {
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
    const email = `lyf9-staging-s3-${suffix}@lyf9.ai`;
    const password = `Lyf9-S3-${suffix}!`;
    const pdf = Buffer.from("%PDF-1.4\n% Lyf9 AI synthetic staging storage verification\n%%EOF\n");
    let storageKey: string | null = null;
    let userId: string | null = null;

    try {
      const created = await service.auth.admin.createUser({
        email,
        email_confirm: true,
        password,
        user_metadata: { full_name: "Synthetic Storage User" }
      });
      throwIfError(created.error);
      userId = created.data.user?.id ?? null;
      if (!userId) throw new Error("Synthetic staging S3 user was not created.");

      const login = await postJson(`${env.appOrigin}/api/auth/login`, { email, password });
      expect(login.response.status, responseFailure(login)).toBe(200);
      const cookie = responseCookieHeader(login.response);
      const authenticatedHeaders = { cookie };

      const consent = await postJson(
        `${env.appOrigin}/api/consent`,
        {
          ai_analysis: true,
          doctor_review: false,
          lab_report_processing: true,
          marketing_communication: false,
          reminders_notifications: false
        },
        authenticatedHeaders
      );
      expect(consent.response.status, responseFailure(consent)).toBe(200);

      const init = await postJson(
        `${env.appOrigin}/api/reports/upload-init`,
        {
          checksumSha256: createHash("sha256").update(pdf).digest("hex"),
          fileSizeBytes: pdf.length,
          mimeType: "application/pdf",
          originalFilename: "Synthetic Storage Verification.pdf"
        },
        authenticatedHeaders
      );
      expect(init.response.status, responseFailure(init)).toBe(200);
      expect(init.body).toMatchObject({
        requiresUploadComplete: true,
        storageProvider: "s3-private"
      });

      const reportFile = objectField(init.body, "reportFile");
      const reportFileId = stringField(reportFile, "id");
      storageKey = stringField(reportFile, "storageKey");
      expect(stringField(reportFile, "storageBucket")).toBe(env.stagingBucket);
      expect(storageKey).toMatch(new RegExp(`^reports/${userId}/${reportFileId}/[a-f0-9-]+\\.pdf$`));
      expect(storageKey).not.toContain("Synthetic");

      const requiredHeaders = stringRecord(init.body.requiredHeaders);
      const upload = await fetch(stringField(init.body, "uploadUrl"), {
        body: pdf,
        headers: requiredHeaders,
        method: "PUT"
      });
      expect(upload.status).toBe(200);

      const head = await s3.send(new HeadObjectCommand({
        Bucket: env.stagingBucket,
        Key: storageKey
      }));
      expect(head.ContentLength).toBe(pdf.length);
      expect(head.ContentType).toBe("application/pdf");
      expect(head.ServerSideEncryption).toBe("AES256");
      expect(head.Metadata?.report_file_id).toBe(reportFileId);

      const publicUrl = `https://${env.stagingBucket}.s3.${env.awsRegion}.amazonaws.com/${encodeKey(storageKey)}`;
      expect((await fetch(publicUrl)).ok).toBe(false);

      const signedDownload = await postJson(
        `${env.appOrigin}/api/reports/${reportFileId}/download-url`,
        {},
        authenticatedHeaders
      );
      expect(signedDownload.response.status, responseFailure(signedDownload)).toBe(200);
      const download = await fetch(stringField(signedDownload.body, "downloadUrl"));
      expect(download.status).toBe(200);
      expect(Buffer.from(await download.arrayBuffer())).toEqual(pdf);

      const deleted = await fetch(`${env.appOrigin}/api/reports/${reportFileId}`, {
        headers: authenticatedHeaders,
        method: "DELETE"
      });
      expect(deleted.status).toBe(200);
      expect(await objectExists(s3, env.stagingBucket, storageKey)).toBe(false);

      const persisted = await service
        .from("report_files")
        .select("storage_bucket, storage_key, status")
        .eq("id", reportFileId)
        .single();
      throwIfError(persisted.error);
      expect(persisted.data).toMatchObject({
        status: "deleted",
        storage_bucket: env.stagingBucket,
        storage_key: storageKey
      });

      const audit = await service
        .from("audit_logs")
        .select("action")
        .eq("actor_user_id", userId)
        .eq("resource_id", reportFileId);
      throwIfError(audit.error);
      const actions = new Set((audit.data ?? []).map((row) => row.action));
      for (const action of [
        "report_upload_initialized",
        "signed_url_generation",
        "raw_report_access_requested",
        "signed_download_url_generated",
        "report_deleted"
      ]) {
        expect(actions.has(action), `Missing audit action: ${action}`).toBe(true);
      }
    } finally {
      if (storageKey) {
        await s3.send(new DeleteObjectCommand({
          Bucket: env.stagingBucket,
          Key: storageKey
        })).catch(() => undefined);
      }
      await cleanupSyntheticUser(service, email, userId);
    }
  }, 120_000);
});

async function postJson(
  url: string,
  body: Record<string, unknown>,
  headers: Record<string, string> = {}
) {
  const response = await fetch(url, {
    body: JSON.stringify(body),
    headers: { "content-type": "application/json", ...headers },
    method: "POST"
  });
  const responseBody = await response.json().catch(() => ({}));
  return { body: responseBody as Record<string, unknown>, response };
}

function responseCookieHeader(response: Response) {
  const headers = response.headers as Headers & { getSetCookie?: () => string[] };
  const values = headers.getSetCookie?.() ?? [response.headers.get("set-cookie") ?? ""];
  return values
    .flatMap((value) => value.split(/,(?=\s*lyf9_)/))
    .map((value) => value.split(";", 1)[0]?.trim())
    .filter(Boolean)
    .join("; ");
}

function responseFailure(result: Awaited<ReturnType<typeof postJson>>) {
  return `HTTP ${result.response.status}: ${JSON.stringify(result.body)}`;
}

async function objectExists(client: S3Client, bucket: string, key: string) {
  try {
    await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
    return true;
  } catch (caught) {
    const status = objectFieldOrNull(caught)?.$metadata;
    if (objectFieldOrNull(status)?.httpStatusCode === 404) return false;
    throw caught;
  }
}

async function cleanupSyntheticUser(
  service: SupabaseClient,
  email: string,
  knownUserId: string | null
) {
  let userId = knownUserId;
  if (!userId) {
    const listed = await service.auth.admin.listUsers({ page: 1, perPage: 1000 });
    throwIfError(listed.error);
    userId = listed.data.users.find((user) => user.email === email)?.id ?? null;
  }
  if (!userId) return;

  for (const [table, column] of [
    ["audit_logs", "actor_user_id"],
    ["analytics_events", "user_id"]
  ] as const) {
    const deleted = await service.from(table).delete().eq(column, userId);
    throwIfError(deleted.error);
  }

  const deletedUser = await service.auth.admin.deleteUser(userId);
  throwIfError(deletedUser.error);
}

function objectField(value: unknown, field: string) {
  const object = objectFieldOrNull(value);
  const result = object?.[field];
  if (!result || typeof result !== "object") throw new Error(`Missing ${field}.`);
  return result as Record<string, unknown>;
}

function objectFieldOrNull(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" ? value as Record<string, unknown> : null;
}

function stringField(value: unknown, field: string) {
  const object = objectFieldOrNull(value);
  const result = object?.[field];
  if (typeof result !== "string" || !result) throw new Error(`Missing ${field}.`);
  return result;
}

function stringRecord(value: unknown) {
  const object = objectFieldOrNull(value);
  if (!object) return {};
  return Object.fromEntries(
    Object.entries(object).filter((entry): entry is [string, string] => typeof entry[1] === "string")
  );
}

function encodeKey(key: string) {
  return key.split("/").map(encodeURIComponent).join("/");
}

function getLiveEnv() {
  if (process.env.APP_ENV !== "staging") {
    throw new Error("Live S3 API verification requires APP_ENV=staging.");
  }

  const values = {
    appOrigin: process.env.APP_BASE_URL,
    awsAccessKeyId: process.env.AWS_ACCESS_KEY_ID,
    awsRegion: process.env.AWS_REGION,
    awsSecretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    expectedAppOrigin: process.env.STAGING_APP_ORIGIN,
    productionBucket: process.env.PRODUCTION_S3_BUCKET,
    projectRef: process.env.STAGING_SUPABASE_PROJECT_REF,
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
    stagingBucket: process.env.STAGING_S3_BUCKET,
    storageBucket: process.env.S3_REPORT_BUCKET,
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL
  };

  const missing = Object.entries(values)
    .filter(([, value]) => !value)
    .map(([name]) => name);
  if (missing.length > 0) {
    throw new Error(`Live S3 API verification environment is incomplete: ${missing.join(", ")}.`);
  }

  if (new URL(values.appOrigin!).origin !== new URL(values.expectedAppOrigin!).origin) {
    throw new Error("Refusing live S3 API verification because APP_BASE_URL does not match STAGING_APP_ORIGIN.");
  }
  if (new URL(values.supabaseUrl!).origin !== `https://${values.projectRef}.supabase.co`) {
    throw new Error("Refusing live S3 API verification because Supabase URL does not match STAGING_SUPABASE_PROJECT_REF.");
  }
  if (values.storageBucket !== values.stagingBucket) {
    throw new Error("Refusing live S3 API verification because S3_REPORT_BUCKET does not match STAGING_S3_BUCKET.");
  }
  if (!/stag/i.test(values.stagingBucket!) || /prod/i.test(values.stagingBucket!)) {
    throw new Error("Refusing live S3 API verification because the bucket name is not staging-specific.");
  }
  if (values.productionBucket && values.stagingBucket === values.productionBucket) {
    throw new Error("Refusing live S3 API verification because staging and production buckets match.");
  }

  return values as {
    appOrigin: string;
    awsAccessKeyId: string;
    awsRegion: string;
    awsSecretAccessKey: string;
    expectedAppOrigin: string;
    productionBucket: string;
    projectRef: string;
    serviceRoleKey: string;
    stagingBucket: string;
    storageBucket: string;
    supabaseUrl: string;
  };
}

function setValidGuardEnv() {
  process.env.APP_ENV = "staging";
  process.env.APP_BASE_URL = "https://lyf9-dev.vercel.app";
  process.env.AWS_ACCESS_KEY_ID = "test-access";
  process.env.AWS_REGION = "ap-south-1";
  process.env.AWS_SECRET_ACCESS_KEY = "test-secret";
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://stagingref.supabase.co";
  process.env.S3_REPORT_BUCKET = "lyf9-reports-staging";
  process.env.STAGING_APP_ORIGIN = "https://lyf9-dev.vercel.app";
  process.env.STAGING_S3_BUCKET = "lyf9-reports-staging";
  process.env.STAGING_SUPABASE_PROJECT_REF = "stagingref";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role";
  process.env.PRODUCTION_S3_BUCKET = "lyf9-reports-production";
}

function throwIfError(error: { message: string } | null) {
  if (error) throw new Error(error.message);
}
