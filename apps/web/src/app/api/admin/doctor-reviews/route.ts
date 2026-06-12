import { NextRequest, NextResponse } from "next/server";

import { requireRequestRole, requestMetadata } from "@/lib/auth/request";
import { assignDoctorReview } from "@/lib/reports/repository";

export async function POST(request: NextRequest) {
  const auth = await requireRequestRole(request, ["admin"]);

  if (auth.response) {
    return auth.response;
  }

  const body = (await request.json()) as {
    assignedDoctorEmail?: string;
    healthInsightId?: string;
    priority?: "standard" | "urgent";
  };

  if (!body.healthInsightId || !body.assignedDoctorEmail) {
    return NextResponse.json({ error: "Health insight and doctor email are required." }, { status: 400 });
  }

  const metadata = requestMetadata(request);
  const review = await assignDoctorReview({
    actorUserId: auth.user.id,
    assignedDoctorEmail: body.assignedDoctorEmail,
    healthInsightId: body.healthInsightId,
    ipAddress: metadata.ipAddress,
    priority: body.priority,
    requestId: metadata.requestId,
    userAgent: metadata.userAgent
  });

  return NextResponse.json({ review });
}
