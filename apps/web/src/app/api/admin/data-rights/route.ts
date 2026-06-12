import { NextRequest, NextResponse } from "next/server";

import { requireRequestRole } from "@/lib/auth/request";
import { createDataDeletion, createDataExport } from "@/lib/reports/repository";

export async function POST(request: NextRequest) {
  const auth = await requireRequestRole(request, ["admin"]);

  if (auth.response) {
    return auth.response;
  }

  const body = (await request.json()) as {
    action?: "export" | "delete";
    targetUserId?: string;
  };

  if (!body.action || !body.targetUserId) {
    return NextResponse.json({ error: "Action and target user are required." }, { status: 400 });
  }

  if (body.action === "export") {
    const requestRecord = await createDataExport({
      actorRole: auth.user.role === "superadmin" ? "superadmin" : "admin",
      actorUserId: auth.user.id,
      targetUserId: body.targetUserId
    });
    return NextResponse.json({ request: requestRecord });
  }

  const requestRecord = await createDataDeletion({
    actorRole: auth.user.role === "superadmin" ? "superadmin" : "admin",
    actorUserId: auth.user.id,
    targetUserId: body.targetUserId
  });
  return NextResponse.json({ request: requestRecord });
}
