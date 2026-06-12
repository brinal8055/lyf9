import { NextRequest, NextResponse } from "next/server";

import {
  getRequestUser,
  unauthorizedResponse
} from "@/lib/auth/request";
import { listUserReports } from "@/lib/reports/repository";

export async function GET(request: NextRequest) {
  const user = await getRequestUser(request);

  if (!user) {
    return unauthorizedResponse();
  }

  const reports = await listUserReports(user.id);
  return NextResponse.json({ reports });
}
