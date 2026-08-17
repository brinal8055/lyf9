import { NextRequest, NextResponse } from "next/server";

import { createSupabaseServiceClient } from "@/lib/auth/providers/supabase-server";
import { writeSupabaseAuditLog } from "@/lib/auth/supabase-auth";
import {
  attachInviteConsumer,
  claimInvite,
  findUsableInvite,
  releaseInvite
} from "@/lib/doctors/invites";
import { createDoctorApplication } from "@/lib/doctors/profiles";
import { parseDoctorApplication } from "@/lib/doctors/validation";
import { logError } from "@/lib/observability/logger";

const INVITE_FAILURE_MESSAGES: Record<string, string> = {
  invite_already_used: "This invite has already been used.",
  invite_expired: "This invite has expired. Ask the Lyf9 team for a new one.",
  invite_not_found: "This invite link is not valid.",
  invite_revoked: "This invite has been revoked."
};

/**
 * Validates an invite token without consuming it, so the application form can
 * render (or refuse) before the doctor fills anything in.
 */
export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token") ?? "";

  if (!token) {
    return NextResponse.json({ error: "Missing invite token." }, { status: 400 });
  }

  try {
    const lookup = await findUsableInvite(token);

    if (!lookup.ok) {
      return NextResponse.json(
        { error: INVITE_FAILURE_MESSAGES[lookup.reason] ?? "This invite is not usable." },
        { status: 410 }
      );
    }

    return NextResponse.json({ email: lookup.invite.email, valid: true });
  } catch (caught) {
    logError("doctor_invite_lookup_failed", {
      error: caught instanceof Error ? caught.message : "unknown"
    });
    return NextResponse.json({ error: "Could not verify the invite." }, { status: 500 });
  }
}

/**
 * Public, token-gated. Creates the doctor's auth user and a profile in
 * `details_submitted`.
 *
 * Deliberately does NOT grant the doctor role -- that happens only in the
 * admin approval endpoint after a human verifies the registration details.
 * A self-service form that granted its own role would be an open privilege
 * escalation, so the account created here has no elevated access and no
 * password until approval.
 */
export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as {
    application?: unknown;
    token?: string;
  } | null;

  const token = body?.token ?? "";

  if (!token) {
    return NextResponse.json({ error: "Missing invite token." }, { status: 400 });
  }

  const parsed = parseDoctorApplication(body?.application);

  if (!parsed.ok) {
    return NextResponse.json({ errors: parsed.errors }, { status: 400 });
  }

  try {
    const lookup = await findUsableInvite(token);

    if (!lookup.ok) {
      return NextResponse.json(
        { error: INVITE_FAILURE_MESSAGES[lookup.reason] ?? "This invite is not usable." },
        { status: 410 }
      );
    }

    const invite = lookup.invite;
    const serviceClient = createSupabaseServiceClient();

    // Claim first. The update is conditional on consumed_at still being null,
    // so two concurrent submissions cannot both proceed -- the loser fails
    // here rather than creating a duplicate account.
    await claimInvite(invite.id);

    let doctor;
    let doctorUserId: string;

    try {
      const created = await serviceClient.auth.admin.createUser({
        email: invite.email,
        email_confirm: true,
        user_metadata: { full_name: parsed.data.fullName }
      });

      if (created.error || !created.data.user) {
        throw new Error(created.error?.message ?? "doctor_user_creation_failed");
      }

      doctorUserId = created.data.user.id;

      const profileResult = await serviceClient.from("user_profiles").upsert(
        {
          email: invite.email,
          full_name: parsed.data.fullName,
          updated_at: new Date().toISOString(),
          user_id: doctorUserId
        },
        { onConflict: "user_id" }
      );

      if (profileResult.error) {
        throw new Error(profileResult.error.message);
      }

      doctor = await createDoctorApplication({
        application: parsed.data,
        userId: doctorUserId
      });
    } catch (setupError) {
      // Give the invite back rather than burning it on a transient failure.
      await releaseInvite(invite.id);
      throw setupError;
    }

    await attachInviteConsumer({ consumedBy: doctorUserId, inviteId: invite.id });

    await writeSupabaseAuditLog({
      action: "doctor_application_submitted",
      actorRole: null,
      actorUserId: doctorUserId,
      metadata: { inviteId: invite.id, status: doctor.status },
      resourceId: doctorUserId,
      resourceType: "doctor_profile"
    });

    return NextResponse.json({ status: doctor.status, submitted: true });
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : "unknown";

    if (message === "invite_already_used") {
      return NextResponse.json({ error: INVITE_FAILURE_MESSAGES.invite_already_used }, { status: 410 });
    }

    if (message === "duplicate_registration") {
      return NextResponse.json(
        { error: "This medical registration number is already on file." },
        { status: 409 }
      );
    }

    logError("doctor_application_failed", { error: message });
    return NextResponse.json({ error: "Could not submit your application." }, { status: 500 });
  }
}
