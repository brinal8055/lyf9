import { NextRequest, NextResponse } from "next/server";

import { getRequestUser, unauthorizedResponse } from "@/lib/auth/request";
import { createFeedbackEvent } from "@/lib/reports/repository";
import type { FeedbackEventRecord } from "@/lib/reports/types";

const allowedChoices = ["yes", "no", "unsure"] as const;

export async function POST(request: NextRequest) {
  const user = await getRequestUser(request);

  if (!user) {
    return unauthorizedResponse();
  }

  const body = (await request.json()) as {
    confusingText?: string | null;
    doctorReviewId?: string | null;
    feedbackSurface?: FeedbackEventRecord["feedbackSurface"];
    freeText?: string | null;
    helpful?: FeedbackEventRecord["helpful"];
    reportFileId?: string | null;
    wouldTrustDoctorReview?: FeedbackEventRecord["wouldTrustDoctorReview"];
  };

  if (!isAllowedChoice(body.helpful) || !isAllowedChoice(body.wouldTrustDoctorReview)) {
    return NextResponse.json({ error: "Feedback choices are required." }, { status: 400 });
  }

  const feedback = await createFeedbackEvent({
    confusingText: body.confusingText?.trim() || null,
    doctorReviewId: body.doctorReviewId ?? null,
    feedbackSurface: body.feedbackSurface ?? "report_result",
    freeText: body.freeText?.trim() || null,
    helpful: body.helpful,
    reportFileId: body.reportFileId ?? null,
    userId: user.id,
    wouldTrustDoctorReview: body.wouldTrustDoctorReview
  });

  return NextResponse.json({ feedback }, { status: 201 });
}

function isAllowedChoice(
  value: unknown
): value is FeedbackEventRecord["helpful"] {
  return allowedChoices.includes(value as typeof allowedChoices[number]);
}
