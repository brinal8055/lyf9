import { NextRequest, NextResponse } from "next/server";

import { getRequestUser, unauthorizedResponse } from "@/lib/auth/request";
import { listHealthTimeline } from "@/lib/reports/repository";

export async function GET(request: NextRequest) {
  const user = await getRequestUser(request);

  if (!user) {
    return unauthorizedResponse();
  }

  return NextResponse.json(await listHealthTimeline(user.id));
}
