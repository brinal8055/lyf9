export const ALLOWED_REPORT_MIME_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/jpg",
  "image/png"
] as const;

export type ReportMimeType = typeof ALLOWED_REPORT_MIME_TYPES[number];

export type StorageProviderName = "mock-private" | "s3-private";

export type UploadUrlResult = {
  expiresAt: string;
  requiredHeaders?: Record<string, string>;
  storageKey: string;
  uploadUrl: string;
};

export type DownloadUrlResult = {
  downloadUrl: string;
  expiresAt: string;
};

export type StorageObjectMetadata = {
  checksum?: string;
  mimeType?: string;
  sizeBytes?: number;
};

export type StorageProvider = {
  name: StorageProviderName;
  createUploadUrl(params: {
    checksum?: string;
    filename: string;
    mimeType: string;
    reportFileId: string;
    sizeBytes: number;
    userId: string;
  }): Promise<UploadUrlResult>;
  createDownloadUrl(params: {
    purpose: string;
    requesterUserId: string;
    reportFileId: string;
    storageKey: string;
  }): Promise<DownloadUrlResult>;
  deleteFile(params: { storageKey: string }): Promise<void>;
  getMetadata(params: { storageKey: string }): Promise<StorageObjectMetadata>;
  validateFileSize(sizeBytes: number): boolean;
  validateFileType(mimeType: string): boolean;
};

export function validateReportMimeType(mimeType: string) {
  return ALLOWED_REPORT_MIME_TYPES.includes(mimeType as ReportMimeType);
}

export function getMaxReportFileSizeBytes() {
  const configured = Number(process.env.MAX_REPORT_FILE_SIZE_BYTES);
  return Number.isFinite(configured) && configured > 0 ? configured : 20 * 1024 * 1024;
}

export function validateReportFileSize(sizeBytes: number) {
  return Number.isFinite(sizeBytes) && sizeBytes > 0 && sizeBytes <= getMaxReportFileSizeBytes();
}

export function secondsFromEnv(name: string, fallback: number) {
  const configured = Number(process.env[name]);
  return Number.isFinite(configured) && configured > 0 ? configured : fallback;
}

export function expiresAt(seconds: number) {
  return new Date(Date.now() + seconds * 1000).toISOString();
}

export function safeFilename(value: string) {
  return value.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 120) || "report";
}

export function isLocalLikeAppEnv() {
  const appEnv = (process.env.APP_ENV ?? process.env.NODE_ENV ?? "development").toLowerCase();
  return appEnv === "local" || appEnv === "development" || appEnv === "test";
}
