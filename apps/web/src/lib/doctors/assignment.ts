import { createSupabaseServiceClient } from "@/lib/auth/providers/supabase-server";
import type { ReportType } from "@/lib/reports/types";

import { specialtyForReportType } from "./specialties";
import type { DoctorAssignmentResult } from "./types";

/**
 * Picks a doctor for a review.
 *
 * All selection logic lives in the `claim_doctor_for_review` SQL function so
 * the read, the capacity check, and the claim happen in one atomic statement.
 * Doing this in TypeScript would race: two concurrent saga runs would both
 * read the same open_review_count and assign the same doctor past capacity.
 *
 * Fail-soft by contract. A null result is a normal outcome, not an error:
 * the report still publishes with its AI explanation and the review surfaces
 * in the admin unassigned queue. This function never throws for "nobody
 * available" -- only for genuine infrastructure failure.
 */
export async function claimDoctorForReview(input: {
  priority: "standard" | "urgent";
  reportType: ReportType | null;
  userId: string;
}): Promise<DoctorAssignmentResult> {
  const requiredSpecialty = input.reportType ? specialtyForReportType(input.reportType) : null;
  const serviceClient = createSupabaseServiceClient();

  // Tier 1 input: the doctor who last completed a review for this user.
  // Continuity matters clinically -- a reviewer who has seen the prior
  // report reads the trend, not just the snapshot.
  const previousDoctor = await serviceClient.rpc("previous_doctor_for_user", {
    p_user_id: input.userId
  });

  if (previousDoctor.error) {
    throw new Error(`previous_doctor_lookup_failed: ${previousDoctor.error.message}`);
  }

  const claim = await serviceClient.rpc("claim_doctor_for_review", {
    p_preferred_doctor: (previousDoctor.data as string | null) ?? null,
    p_priority: input.priority,
    p_required_specialty: requiredSpecialty
  });

  if (claim.error) {
    throw new Error(`doctor_claim_failed: ${claim.error.message}`);
  }

  const assignedDoctorId = (claim.data as string | null) ?? null;

  return {
    assignedDoctorId,
    reason: assignedDoctorId ? "assigned" : "no_doctor_available",
    requiredSpecialty
  };
}

/**
 * Reviews with no doctor attached. Drives the admin unassigned queue --
 * without this surface a null assignment would silently strand a review.
 */
export async function listUnassignedReviews(limit = 50) {
  const serviceClient = createSupabaseServiceClient();
  const result = await serviceClient
    .from("doctor_reviews")
    .select("id, user_id, report_file_id, priority, status, created_at")
    .is("assigned_doctor_id", null)
    .order("priority", { ascending: false })
    .order("created_at", { ascending: true })
    .limit(limit);

  if (result.error) {
    throw new Error(result.error.message);
  }

  return result.data ?? [];
}

/**
 * Moves an existing review to a different doctor. The capacity trigger
 * adjusts both doctors' counters from the UPDATE, so no manual bookkeeping.
 */
export async function reassignReview(input: {
  actorUserId: string;
  doctorUserId: string;
  reviewId: string;
}) {
  const serviceClient = createSupabaseServiceClient();
  const result = await serviceClient
    .from("doctor_reviews")
    .update({
      assigned_by: input.actorUserId,
      assigned_doctor_id: input.doctorUserId,
      assigned_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    })
    .eq("id", input.reviewId)
    .select()
    .maybeSingle();

  if (result.error) {
    throw new Error(result.error.message);
  }

  return result.data;
}

/** Nightly drift correction for the denormalized open_review_count. */
export async function reconcileDoctorOpenCounts() {
  const serviceClient = createSupabaseServiceClient();
  const result = await serviceClient.rpc("reconcile_doctor_open_counts");

  if (result.error) {
    throw new Error(`reconcile_failed: ${result.error.message}`);
  }

  return (result.data ?? []) as Array<{
    corrected_count: number;
    doctor_user_id: string;
    previous_count: number;
  }>;
}
