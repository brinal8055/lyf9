import { randomUUID } from "crypto";

import {
  expiresAt,
  safeFilename,
  secondsFromEnv,
  validateReportFileSize,
  validateReportMimeType,
  type StorageProvider
} from "./storage-provider";

export const mockStorageProvider: StorageProvider = {
  name: "mock-private",
  async createUploadUrl(params) {
    const storageKey = `reports/${params.userId}/${params.reportFileId}/${randomUUID()}-${safeFilename(params.filename)}`;

    return {
      expiresAt: expiresAt(secondsFromEnv("S3_UPLOAD_URL_EXPIRY_SECONDS", 900)),
      requiredHeaders: {
        "content-type": params.mimeType
      },
      storageKey,
      uploadUrl: `mock://upload/${storageKey}`
    };
  },
  async createDownloadUrl(params) {
    return {
      downloadUrl: `mock://download/${params.storageKey}?purpose=${encodeURIComponent(params.purpose)}`,
      expiresAt: expiresAt(secondsFromEnv("S3_DOWNLOAD_URL_EXPIRY_SECONDS", 300))
    };
  },
  async deleteFile() {
    return;
  },
  async getMetadata() {
    return {};
  },
  validateFileSize: validateReportFileSize,
  validateFileType: validateReportMimeType
};
