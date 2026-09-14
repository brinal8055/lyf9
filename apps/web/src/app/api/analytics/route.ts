import { NextRequest, NextResponse } from "next/server";

import { safeAnalyticsMetadata } from "@/lib/analytics/metadata";
import { getRequestUser, unauthorizedResponse } from "@/lib/auth/request";
import { trackAnalyticsEvent } from "@/lib/reports/repository";
import type { AnalyticsEventName } from "@/lib/reports/types";

const allowedEvents: AnalyticsEventName[] = [
  "signup_started",
  "signup_completed",
  "consent_completed",
  "questionnaire_completed",
  "report_uploaded",
  "explanation_viewed",
  "marker_card_opened",
  "reminder_set",
  "doctor_review_requested",
  "payment_started",
  "payment_completed",
  "feedback_submitted"
];

export async function POST(request: NextRequest) {
  const user = await getRequestUser(request);
  const body = (await request.json()) as {
    eventName?: AnalyticsEventName;
    labReportId?: string | null;
    metadata?: Record<string, unknown>;
    reportFileId?: string | null;
  };

  if (!body.eventName || !allowedEvents.includes(body.eventName)) {
    return NextResponse.json({ error: "Unsupported analytics event." }, { status: 400 });
  }

  if (!user && body.eventName !== "signup_started") {
    return unauthorizedResponse();
  }

  const event = await trackAnalyticsEvent({
    eventName: body.eventName,
    labReportId: body.labReportId ?? null,
    metadata: safeAnalyticsMetadata(body.eventName, body.metadata ?? {}),
    reportFileId: body.reportFileId ?? null,
    userId: user?.id ?? null
  });

  return NextResponse.json({ event }, { status: 201 });
}
