import { randomUUID } from "crypto";

import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

import {
  expiresAt,
  safeFilename,
  secondsFromEnv,
  validateReportFileSize,
  validateReportMimeType,
  type StorageProvider
} from "./storage-provider";

export const s3StorageProvider: StorageProvider = {
  name: "s3-private",
  async createUploadUrl(params) {
    const bucket = getBucket();
    const expiresIn = secondsFromEnv("S3_UPLOAD_URL_EXPIRY_SECONDS", 900);
    const storageKey = `reports/${params.userId}/${params.reportFileId}/${randomUUID()}-${safeFilename(params.filename)}`;
    const command = new PutObjectCommand({
      Bucket: bucket,
      ContentLength: params.sizeBytes,
      ContentType: params.mimeType,
      Key: storageKey,
      Metadata: {
        checksum_sha256: params.checksum ?? "",
        report_file_id: params.reportFileId,
        user_id: params.userId
      }
    });

    return {
      expiresAt: expiresAt(expiresIn),
      requiredHeaders: {
        "content-type": params.mimeType
      },
      storageKey,
      uploadUrl: await getSignedUrl(getS3Client(), command, { expiresIn })
    };
  },
  async createDownloadUrl(params) {
    const expiresIn = secondsFromEnv("S3_DOWNLOAD_URL_EXPIRY_SECONDS", 300);
    const command = new GetObjectCommand({
      Bucket: getBucket(),
      Key: params.storageKey,
      ResponseContentDisposition: "attachment"
    });

    return {
      downloadUrl: await getSignedUrl(getS3Client(), command, { expiresIn }),
      expiresAt: expiresAt(expiresIn)
    };
  },
  async deleteFile(params) {
    await getS3Client().send(new DeleteObjectCommand({
      Bucket: getBucket(),
      Key: params.storageKey
    }));
  },
  async getMetadata(params) {
    const result = await getS3Client().send(new HeadObjectCommand({
      Bucket: getBucket(),
      Key: params.storageKey
    }));

    return {
      checksum: result.Metadata?.checksum_sha256,
      mimeType: result.ContentType,
      sizeBytes: result.ContentLength
    };
  },
  validateFileSize: validateReportFileSize,
  validateFileType: validateReportMimeType
};

function getS3Client() {
  assertS3Configured();
  return new S3Client({
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID ?? "",
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY ?? ""
    },
    region: process.env.AWS_REGION ?? "ap-south-1"
  });
}

function getBucket() {
  assertS3Configured();
  return process.env.S3_REPORT_BUCKET ?? "";
}

function assertS3Configured() {
  const required = ["AWS_REGION", "AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY", "S3_REPORT_BUCKET"];
  const missing = required.filter((key) => !process.env[key]);

  if (missing.length > 0) {
    throw new Error(`S3 storage provider is missing env: ${missing.join(", ")}`);
  }
}
