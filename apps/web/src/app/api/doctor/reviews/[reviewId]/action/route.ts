import { NextRequest, NextResponse } from "next/server";

import { requireRequestRole, requestMetadata } from "@/lib/auth/request";
import { applyDoctorReviewAction } from "@/lib/reports/repository";
import type { DoctorReviewAction } from "@/lib/reports/types";

const actions: DoctorReviewAction[] = [
  "approve",
  "edit_and_approve",
  "reject",
  "request_more_info",
  "mark_urgent"
];

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ reviewId: string }> }
) {
  const auth = await requireRequestRole(request, ["doctor"]);

  if (auth.response) {
    return auth.response;
  }

  const { reviewId } = await params;
  const body = (await request.json()) as Record<string, unknown>;
  const action = body.action;

  if (typeof action !== "string" || !actions.includes(action as DoctorReviewAction)) {
    return NextResponse.json({ error: "Unsupported review action." }, { status: 400 });
  }

  try {
    const metadata = requestMetadata(request);
    const review = await applyDoctorReviewAction({
      action: action as DoctorReviewAction,
      doctorEmail: auth.user.id,
      editedSummary: stringOrNull(body.editedSummary),
      ipAddress: metadata.ipAddress,
      notes: stringOrNull(body.notes),
      reason: stringOrNull(body.reason),
      requestId: metadata.requestId,
      reviewId,
      userAgent: metadata.userAgent
    });
    return NextResponse.json({ review });
  } catch {
    return NextResponse.json({ error: "Review action could not be saved." }, { status: 404 });
  }
}

function stringOrNull(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}
