import { NextRequest, NextResponse } from "next/server";

import { requireRequestRole } from "@/lib/auth/request";
import { listDoctorReviews } from "@/lib/reports/repository";

export async function GET(request: NextRequest) {
  const auth = await requireRequestRole(request, ["doctor"]);

  if (auth.response) {
    return auth.response;
  }

  return NextResponse.json({ reviews: await listDoctorReviews(auth.user.id) });
}
