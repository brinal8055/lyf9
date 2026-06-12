import { NextRequest, NextResponse } from "next/server";

import {
  consentRequiredResponse,
  getRequestUser,
  getRequiredConsentComplete,
  requestMetadata,
  unauthorizedResponse
} from "@/lib/auth/request";
import { hasRequiredReportUploadConsent } from "@/lib/onboarding/server";
import { completeUpload } from "@/lib/reports/repository";
import {
  getReportSigningSecret,
  verifySignedToken
} from "@/lib/reports/signed-url";

export async function PUT(
  request: NextRequest,
  context: { params: Promise<{ reportFileId: string }> }
) {
  const user = await getRequestUser(request);

  if (!user) {
    return unauthorizedResponse();
  }

  const persistedConsent = await hasRequiredReportUploadConsent(user.id);

  if (persistedConsent === false || (persistedConsent === null && !getRequiredConsentComplete(request))) {
    return consentRequiredResponse();
  }

  const params = await context.params;
  const payload = verifySignedToken(
    request.nextUrl.searchParams.get("token"),
    "upload",
    getReportSigningSecret()
  );

  if (
    !payload ||
    payload.reportFileId !== params.reportFileId ||
    payload.userId !== user.id
  ) {
    return NextResponse.json({ error: "Invalid or expired upload URL." }, { status: 403 });
  }

  const bytes = Buffer.from(await request.arrayBuffer());
  const result = await completeUpload({
    ...requestMetadata(request),
    bytes,
    reportFileId: params.reportFileId,
    userId: user.id
  });

  return NextResponse.json(result);
}
