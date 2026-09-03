import { NextRequest, NextResponse } from "next/server";

import { requireRequestRole } from "@/lib/auth/request";
import { createDoctorInvite, listDoctorInvites } from "@/lib/doctors/invites";
import { listDoctorProfiles } from "@/lib/doctors/profiles";
import type { DoctorStatus } from "@/lib/doctors/types";
import { logError } from "@/lib/observability/logger";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const KNOWN_STATUSES: DoctorStatus[] = [
  "invited",
  "details_submitted",
  "under_review",
  "approved",
  "rejected",
  "suspended"
];

export async function GET(request: NextRequest) {
  const auth = await requireRequestRole(request, ["admin"]);

  if (auth.response) {
    return auth.response;
  }

  const statusParam = request.nextUrl.searchParams.get("status");
  const status = KNOWN_STATUSES.find((entry) => entry === statusParam);

  try {
    const [doctors, invites] = await Promise.all([
      listDoctorProfiles(status ? { status } : {}),
      listDoctorInvites()
    ]);

    return NextResponse.json({ doctors, invites });
  } catch (caught) {
    logError("admin_doctor_list_failed", {
      error: caught instanceof Error ? caught.message : "unknown"
    });
    return NextResponse.json({ error: "Could not load doctors." }, { status: 500 });
  }
}

/**
 * Creates an invite. The raw token is returned exactly once so the caller can
 * build the application link; it is never persisted or retrievable later.
 */
export async function POST(request: NextRequest) {
  const auth = await requireRequestRole(request, ["admin"]);

  if (auth.response) {
    return auth.response;
  }

  const body = (await request.json().catch(() => null)) as {
    email?: string;
    note?: string;
  } | null;

  const email = body?.email?.trim().toLowerCase() ?? "";

  if (!EMAIL_PATTERN.test(email)) {
    return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
  }

  try {
    const { invite, token } = await createDoctorInvite({
      email,
      invitedBy: auth.user.id,
      note: body?.note ?? null
    });

    // /doctor-apply, not /doctor/apply: the applicant has no account yet, and
    // the /doctor tree is gated on an authenticated doctor role.
    const appUrl = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ?? "";
    const inviteUrl = `${appUrl}/doctor-apply?token=${encodeURIComponent(token)}`;

    return NextResponse.json({ invite, inviteUrl });
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : "unknown";

    if (message === "invite_already_pending") {
      return NextResponse.json(
        { error: "An invite is already pending for this email. Revoke it first to reissue." },
        { status: 409 }
      );
    }

    logError("admin_doctor_invite_failed", { error: message });
    return NextResponse.json({ error: "Could not create the invite." }, { status: 500 });
  }
}
