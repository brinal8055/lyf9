import { NextRequest, NextResponse } from "next/server";

import { getRequestUser, requestMetadata, unauthorizedResponse } from "@/lib/auth/request";
import { claimDoctorForReview } from "@/lib/doctors/assignment";
import { logError } from "@/lib/observability/logger";
import { assignDoctorReview, getReportDetails } from "@/lib/reports/repository";
import type { ReportType } from "@/lib/reports/types";

export async function POST(
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

  if (!report.healthInsight) {
    return NextResponse.json(
      { error: "This report is still processing. Doctor review can be requested once it is ready." },
      { status: 409 }
    );
  }

  const metadata = requestMetadata(request);

  try {
    const claim = await claimDoctorForReview({
      priority: "standard",
      reportType: (report.labReport?.reportType ?? null) as ReportType | null,
      userId: user.id
    });

    if (!claim.assignedDoctorId) {
      logError("doctor_review_request_unassigned", {
        reportFileId: params.reportFileId,
        userId: user.id
      });
      return NextResponse.json(
        {
          error:
            "All our doctors are at capacity right now. Your request has not been placed — please try again shortly."
        },
        { status: 503 }
      );
    }

    const review = await assignDoctorReview({
      actorUserId: user.id,
      assignedDoctorId: claim.assignedDoctorId,
      healthInsightId: report.healthInsight.id,
      ipAddress: metadata.ipAddress,
      priority: "standard",
      requestId: metadata.requestId,
      userAgent: metadata.userAgent
    });

    return NextResponse.json({ requested: true, reviewId: review.id });
  } catch (caught) {
    logError("doctor_review_request_failed", {
      error: caught instanceof Error ? caught.message : "unknown",
      reportFileId: params.reportFileId,
      userId: user.id
    });
    return NextResponse.json({ error: "Doctor review could not be requested." }, { status: 400 });
  }
}
