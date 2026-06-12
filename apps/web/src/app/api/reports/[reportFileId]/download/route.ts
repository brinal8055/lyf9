import { NextRequest, NextResponse } from "next/server";

import { getRequestUser, requestMetadata, unauthorizedResponse } from "@/lib/auth/request";
import { readPrivateReport } from "@/lib/reports/repository";
import {
  getReportSigningSecret,
  verifySignedToken
} from "@/lib/reports/signed-url";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ reportFileId: string }> }
) {
  const user = await getRequestUser(request);

  if (!user) {
    return unauthorizedResponse();
  }

  const params = await context.params;
  const payload = verifySignedToken(
    request.nextUrl.searchParams.get("token"),
    "download",
    getReportSigningSecret()
  );

  if (
    !payload ||
    payload.reportFileId !== params.reportFileId ||
    payload.userId !== user.id
  ) {
    return NextResponse.json({ error: "Invalid or expired download URL." }, { status: 403 });
  }

  const result = await readPrivateReport({
    ...requestMetadata(request),
    reportFileId: params.reportFileId,
    userId: user.id
  });

  return new NextResponse(result.bytes, {
    headers: {
      "Content-Disposition": `attachment; filename="${result.reportFile.originalFilename}"`,
      "Content-Type": result.reportFile.mimeType
    }
  });
}
