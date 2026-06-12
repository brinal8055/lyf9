import { NextRequest, NextResponse } from "next/server";

import { requireRequestRole } from "@/lib/auth/request";
import { listAdminReports } from "@/lib/reports/repository";

export async function GET(request: NextRequest) {
  const auth = await requireRequestRole(request, ["admin"]);

  if (auth.response) {
    return auth.response;
  }

  const data = await listAdminReports();
  return NextResponse.json(data);
}
