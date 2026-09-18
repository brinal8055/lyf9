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

  if (auth.user.role !== "superadmin") {
    return NextResponse.json(
      { error: "Only a superadmin can complete a data deletion." },
      { status: 403 }
    );
  }

  const requestRecord = await createDataDeletion({
    actorRole: "superadmin",
    actorUserId: auth.user.id,
    targetUserId: body.targetUserId
  });
  return NextResponse.json({ request: requestRecord });
}
