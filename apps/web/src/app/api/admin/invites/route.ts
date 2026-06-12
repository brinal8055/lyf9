import { NextRequest, NextResponse } from "next/server";

import { requireRequestRole } from "@/lib/auth/request";
import { createBetaInvite } from "@/lib/reports/repository";
import type { UserRole } from "@/lib/reports/types";

const inviteRoles: UserRole[] = ["user", "doctor", "admin", "superadmin"];

export async function POST(request: NextRequest) {
  const auth = await requireRequestRole(request, ["admin"]);

  if (auth.response) {
    return auth.response;
  }

  const body = (await request.json()) as {
    email?: string;
    role?: UserRole;
  };
  const email = body.email?.trim().toLowerCase();
  const role = body.role && inviteRoles.includes(body.role) ? body.role : "user";

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: "Valid invite email is required." }, { status: 400 });
  }

  const invite = await createBetaInvite({
    actorUserId: auth.user.id,
    email,
    role
  });

  return NextResponse.json({ invite }, { status: 201 });
}
