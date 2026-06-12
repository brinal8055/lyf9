import { NextRequest, NextResponse } from "next/server";

import { getRequestUser, requestMetadata, unauthorizedResponse } from "@/lib/auth/request";
import { createSignedDownloadUrl } from "@/lib/reports/repository";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ reportFileId: string }> }
) {
  const user = await getRequestUser(request);

  if (!user) {
    return unauthorizedResponse();
  }

  const params = await context.params;

  try {
    const result = await createSignedDownloadUrl({
      ...requestMetadata(request),
      actorRole: user.role,
      purpose: "user_download",
      reportFileId: params.reportFileId,
      userId: user.id
    });
    return NextResponse.json({
      downloadUrl: result.downloadUrl,
      expiresAt: result.expiresAt,
      reportFileId: result.reportFile.id
    });
  } catch {
    return NextResponse.json({ error: "Report not found." }, { status: 404 });
  }
}
