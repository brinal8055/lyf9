import { afterEach, describe, expect, it } from "vitest";

import { mockStorageProvider } from "./mock-storage-provider";
import { s3StorageProvider } from "./s3-storage-provider";

const originalEnv = {
  AWS_ACCESS_KEY_ID: process.env.AWS_ACCESS_KEY_ID,
  AWS_REGION: process.env.AWS_REGION,
  AWS_SECRET_ACCESS_KEY: process.env.AWS_SECRET_ACCESS_KEY,
  S3_REPORT_BUCKET: process.env.S3_REPORT_BUCKET
};

afterEach(() => {
  for (const [name, value] of Object.entries(originalEnv)) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
});

describe("private report storage", () => {
  it("uses opaque S3 keys and returns every signed upload header", async () => {
    process.env.AWS_ACCESS_KEY_ID = "test-access-key";
    process.env.AWS_SECRET_ACCESS_KEY = "test-secret-key";
    process.env.AWS_REGION = "ap-south-1";
    process.env.S3_REPORT_BUCKET = "lyf9-staging-reports";

    const result = await s3StorageProvider.createUploadUrl({
      checksum: "a".repeat(64),
      filename: "Patient Name CBC Report.pdf",
      mimeType: "application/pdf",
      reportFileId: "report-id",
      sizeBytes: 128,
      userId: "user-id"
    });

    expect(result.storageBucket).toBe("lyf9-staging-reports");
    expect(result.storageKey).toMatch(/^reports\/user-id\/report-id\/[a-f0-9-]+\.pdf$/);
    expect(result.storageKey).not.toContain("Patient");
    expect(result.requiredHeaders).toEqual({
      "content-type": "application/pdf",
      "x-amz-meta-checksum_sha256": "a".repeat(64),
      "x-amz-meta-report_file_id": "report-id",
      "x-amz-server-side-encryption": "AES256"
    });
    const signedHeaders = new URL(result.uploadUrl).searchParams.get("X-Amz-SignedHeaders")?.split(";") ?? [];
    expect(signedHeaders).toEqual(expect.arrayContaining([
      "content-type",
      "host",
      "x-amz-meta-checksum_sha256",
      "x-amz-meta-report_file_id",
      "x-amz-server-side-encryption"
    ]));
  });

  it("keeps mock object keys opaque too", async () => {
    const result = await mockStorageProvider.createUploadUrl({
      filename: "Patient Name.png",
      mimeType: "image/png",
      reportFileId: "report-id",
      sizeBytes: 128,
      userId: "user-id"
    });

    expect(result.storageBucket).toBe("mock-private");
    expect(result.storageKey).toMatch(/^reports\/user-id\/report-id\/[a-f0-9-]+\.png$/);
    expect(result.storageKey).not.toContain("Patient");
  });
});
