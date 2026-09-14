import { NextRequest, NextResponse } from "next/server";

import { requireRequestRole, requestMetadata } from "@/lib/auth/request";
import { writeSupabaseAuditLog } from "@/lib/auth/supabase-auth";
import {
  approveDoctor,
  getDoctorProfile,
  rejectDoctor,
  suspendDoctor
} from "@/lib/doctors/profiles";
import { logError } from "@/lib/observability/logger";

type DoctorDecisionAction = "approve" | "reject" | "suspend";

const DECISION_ACTIONS: DoctorDecisionAction[] = ["approve", "reject", "suspend"];

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ doctorUserId: string }> }
) {
  const auth = await requireRequestRole(request, ["admin"]);

  if (auth.response) {
    return auth.response;
  }

  const { doctorUserId } = await context.params;

  try {
    const doctor = await getDoctorProfile(doctorUserId);

    if (!doctor) {
      return NextResponse.json({ error: "Doctor not found." }, { status: 404 });
    }

    return NextResponse.json({ doctor });
  } catch (caught) {
    logError("admin_doctor_detail_failed", {
      doctorUserId,
      error: caught instanceof Error ? caught.message : "unknown"
    });
    return NextResponse.json({ error: "Could not load the doctor." }, { status: 500 });
  }
}

/**
 * The only path that grants the doctor role. Verification is a human decision;
 * this endpoint records it. Every decision is audit-logged with the acting
 * admin so a role grant can always be traced back to a person.
 */
export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ doctorUserId: string }> }
) {
  const auth = await requireRequestRole(request, ["admin"]);

  if (auth.response) {
    return auth.response;
  }

  const { doctorUserId } = await context.params;
  const body = (await request.json().catch(() => null)) as {
    action?: string;
    maxOpenReviews?: number;
    reason?: string;
  } | null;

  const action = DECISION_ACTIONS.find((entry) => entry === body?.action);

  if (!action) {
    return NextResponse.json(
      { error: "Action must be one of: approve, reject, suspend." },
      { status: 400 }
    );
  }

  const reason = body?.reason?.trim() ?? "";

  if ((action === "reject" || action === "suspend") && reason.length < 3) {
    return NextResponse.json(
      { error: "A reason is required when rejecting or suspending a doctor." },
      { status: 400 }
    );
  }

  const metadata = requestMetadata(request);

  try {
    const doctor =
      action === "approve"
        ? await approveDoctor({
            adminUserId: auth.user.id,
            doctorUserId,
            maxOpenReviews: body?.maxOpenReviews
          })
        : action === "reject"
          ? await rejectDoctor({ adminUserId: auth.user.id, doctorUserId, reason })
          : await suspendDoctor({ adminUserId: auth.user.id, doctorUserId, reason });

    await writeSupabaseAuditLog({
      action: `doctor_${action}`,
      actorRole: "admin",
      actorUserId: auth.user.id,
      metadata: { action, requestId: metadata.requestId, status: doctor.status },
      resourceId: doctorUserId,
      resourceType: "doctor_profile"
    });

    return NextResponse.json({ doctor });
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : "unknown";

    if (message === "doctor_profile_not_found") {
      return NextResponse.json({ error: "Doctor not found." }, { status: 404 });
    }

    logError("admin_doctor_decision_failed", { action, doctorUserId, error: message });
    return NextResponse.json({ error: "Could not update the doctor." }, { status: 500 });
  }
}
