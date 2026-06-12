import { NextRequest, NextResponse } from "next/server";

import {
  consentRequiredResponse,
  getRequestUser,
  getRequiredConsentComplete,
  requestMetadata,
  unauthorizedResponse
} from "@/lib/auth/request";
import { hasRequiredReportUploadConsent } from "@/lib/onboarding/server";
import { auditReportUploadBlocked, auditReportUploadRejected, createUploadInit } from "@/lib/reports/repository";
import {
  createSignedToken,
  getReportSigningSecret
} from "@/lib/reports/signed-url";
import { validateUploadInit } from "@/lib/reports/validation";

export async function POST(request: NextRequest) {
  const user = await getRequestUser(request);

  if (!user) {
    return unauthorizedResponse();
  }

  const persistedConsent = await hasRequiredReportUploadConsent(user.id);

  if (persistedConsent === false || (persistedConsent === null && !getRequiredConsentComplete(request))) {
    const metadata = requestMetadata(request);
    await auditReportUploadBlocked({
      ...metadata,
      actorRole: user.role,
      reason: "missing_required_consent",
      userId: user.id
    });
    return consentRequiredResponse();
  }

  const body = await request.json();
  const validation = validateUploadInit(body);
  const metadata = requestMetadata(request);

  if (!validation.ok) {
    if (validation.errors.mimeType || validation.errors.fileSizeBytes) {
      await auditReportUploadRejected({
        ...metadata,
        actorRole: user.role,
        mimeType: typeof body.mimeType === "string" ? body.mimeType : null,
        reason: validation.errors.mimeType ? "rejected_file_type" : "rejected_file_size",
        sizeBytes: typeof body.fileSizeBytes === "number" ? body.fileSizeBytes : null,
        userId: user.id
      });
    }
    return NextResponse.json({ errors: validation.errors }, { status: 400 });
  }

  const result = await createUploadInit({
    ...validation.value,
    ...metadata,
    userId: user.id
  });
  const token = createSignedToken(
    {
      action: "upload",
      expiresAt: Date.now() + 10 * 60 * 1000,
      reportFileId: result.reportFile.id,
      storageKey: result.reportFile.storageKey,
      userId: user.id
    },
    getReportSigningSecret()
  );

  const localUploadUrl = `/api/reports/${result.reportFile.id}/upload?token=${token}`;
  const useLocalUploadUrl = result.storageProvider === "mock-private";
  const uploadUrl = useLocalUploadUrl ? localUploadUrl : result.uploadTarget.uploadUrl;

  return NextResponse.json({
    expiresAt: result.uploadTarget.expiresAt,
    job: result.job,
    labReport: result.labReport,
    report_file_id: result.reportFile.id,
    reportFile: result.reportFile,
    requiredHeaders: result.uploadTarget.requiredHeaders ?? {},
    reused: result.reused,
    requiresUploadComplete: !useLocalUploadUrl,
    storageProvider: result.storageProvider,
    upload_url: uploadUrl,
    uploadCompleteUrl: `/api/reports/${result.reportFile.id}/upload-complete`,
    uploadUrl,
    uploadUrlExpiresAt: result.uploadTarget.expiresAt
  });
}
