import { NextRequest, NextResponse } from "next/server";

import { getRequestUser, requestMetadata, unauthorizedResponse } from "@/lib/auth/request";
import { completeUpload } from "@/lib/reports/repository";

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
    const result = await completeUpload({
      ...requestMetadata(request),
      reportFileId: params.reportFileId,
      userId: user.id
    });
    return NextResponse.json(result);
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : "upload_complete_failed";
    const status = message === "report_not_found" ? 404 : 400;
    return NextResponse.json({ error: "Upload could not be completed." }, { status });
  }
}
