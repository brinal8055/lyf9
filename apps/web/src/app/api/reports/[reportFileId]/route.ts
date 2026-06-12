import { NextRequest, NextResponse } from "next/server";

import { getRequestUser, requestMetadata, unauthorizedResponse } from "@/lib/auth/request";
import { deleteReportFile, getReportDetails, trackAnalyticsEvent } from "@/lib/reports/repository";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ reportFileId: string }> }
) {
  const user = await getRequestUser(request);

  if (!user) {
    return unauthorizedResponse();
  }

  const params = await context.params;
  const report = await getReportDetails(user.id, params.reportFileId);

  if (!report) {
    return NextResponse.json({ error: "Report not found." }, { status: 404 });
  }

  await trackAnalyticsEvent({
    eventName: "explanation_viewed",
    labReportId: report.labReport?.id ?? null,
    metadata: { insightStatus: report.healthInsight?.status ?? "missing" },
    reportFileId: report.reportFile.id,
    userId: user.id
  });

  return NextResponse.json({ report });
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ reportFileId: string }> }
) {
  const user = await getRequestUser(request);

  if (!user) {
    return unauthorizedResponse();
  }

  const params = await context.params;

  try {
    const result = await deleteReportFile({
      ...requestMetadata(request),
      actorRole: user.role,
      reportFileId: params.reportFileId,
      userId: user.id
    });
    return NextResponse.json({ reportFile: result.reportFile });
  } catch {
    return NextResponse.json({ error: "Report not found." }, { status: 404 });
  }
}
