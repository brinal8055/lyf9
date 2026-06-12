export type {
  DownloadUrlResult,
  StorageObjectMetadata,
  StorageProvider,
  StorageProviderName,
  UploadUrlResult
} from "./storage-provider";
export {
  ALLOWED_REPORT_MIME_TYPES,
  getMaxReportFileSizeBytes,
  isLocalLikeAppEnv,
  validateReportFileSize,
  validateReportMimeType
} from "./storage-provider";
export { mockStorageProvider } from "./mock-storage-provider";
export { s3StorageProvider } from "./s3-storage-provider";

import { mockStorageProvider } from "./mock-storage-provider";
import { s3StorageProvider } from "./s3-storage-provider";
import { isLocalLikeAppEnv, type StorageProvider } from "./storage-provider";

export function getStorageProvider(): StorageProvider {
  const provider = process.env.STORAGE_PROVIDER ?? "mock";

  if (provider === "s3") {
    return s3StorageProvider;
  }

  if (provider === "mock" || provider === "local") {
    if (!isLocalLikeAppEnv() && process.env.ALLOW_MOCK_STORAGE_IN_DEPLOYED_ENV !== "true") {
      throw new Error("Mock storage provider is disabled outside local/development/test environments.");
    }

    return mockStorageProvider;
  }

  throw new Error(`Unsupported storage provider: ${provider}`);
}
