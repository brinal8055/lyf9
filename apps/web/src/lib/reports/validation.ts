import {
  ALLOWED_REPORT_MIME_TYPES,
  getMaxReportFileSizeBytes,
  validateReportFileSize,
  validateReportMimeType
} from "../storage";

export { ALLOWED_REPORT_MIME_TYPES, getMaxReportFileSizeBytes };

export const PROCESSING_VERSION = "phase2_processing_v1";

export type UploadInitInput = {
  checksumSha256?: string;
  fileSizeBytes?: number;
  mimeType?: string;
  originalFilename?: string;
};

export function validateUploadInit(input: UploadInitInput) {
  const errors: Record<string, string> = {};
  const filename = input.originalFilename?.trim() ?? "";
  const mimeType = input.mimeType?.trim().toLowerCase() ?? "";
  const fileSizeBytes = Number(input.fileSizeBytes);
  const checksumSha256 = input.checksumSha256?.trim().toLowerCase() ?? "";

  if (filename.length < 1) {
    errors.originalFilename = "Filename is required.";
  }

  if (!validateReportMimeType(mimeType)) {
    errors.mimeType = "Upload a PDF, JPG, JPEG, or PNG lab report.";
  }

  if (!validateReportFileSize(fileSizeBytes)) {
    errors.fileSizeBytes = `File must be between 1 byte and ${Math.floor(
      getMaxReportFileSizeBytes() / (1024 * 1024)
    )} MB.`;
  }

  if (!/^[a-f0-9]{64}$/.test(checksumSha256)) {
    errors.checksumSha256 = "A SHA-256 checksum is required.";
  }

  return {
    errors,
    ok: Object.keys(errors).length === 0,
    value: {
      checksumSha256,
      fileSizeBytes,
      mimeType,
      originalFilename: filename
    }
  };
}

export function makeIdempotencyKey(userId: string, checksumSha256: string) {
  return `${userId}:${checksumSha256}:${PROCESSING_VERSION}`;
}
