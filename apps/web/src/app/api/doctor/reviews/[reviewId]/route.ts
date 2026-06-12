import { NextRequest, NextResponse } from "next/server";

import { requireRequestRole } from "@/lib/auth/request";
import { getDoctorReviewDetail } from "@/lib/reports/repository";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ reviewId: string }> }
) {
  const auth = await requireRequestRole(request, ["doctor"]);

  if (auth.response) {
    return auth.response;
  }

  const { reviewId } = await params;
  const review = await getDoctorReviewDetail(auth.user.id, reviewId);

  if (!review) {
    return NextResponse.json({ error: "Review not found." }, { status: 404 });
  }

  return NextResponse.json({ review });
}
