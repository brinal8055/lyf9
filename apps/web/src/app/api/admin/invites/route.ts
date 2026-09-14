import { NextRequest, NextResponse } from "next/server";

import { requireRequestRole } from "@/lib/auth/request";
import { createBetaInvite } from "@/lib/reports/repository";

export async function POST(request: NextRequest) {
  const auth = await requireRequestRole(request, ["admin"]);

  if (auth.response) {
    return auth.response;
  }

  const body = (await request.json()) as {
    email?: string;
  };
  const email = body.email?.trim().toLowerCase();

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: "Valid invite email is required." }, { status: 400 });
  }

  const invite = await createBetaInvite({
    actorUserId: auth.user.id,
    email,
    role: "user"
  });

  return NextResponse.json({ invite }, { status: 201 });
}
