import { createSupabaseServiceClient } from "@/lib/auth/providers/supabase-server";

import { parseSpecialties } from "./specialties";
import type {
  DoctorApplicationInput,
  DoctorCapacityRecord,
  DoctorProfileRecord,
  DoctorPublicProfile,
  DoctorStatus
} from "./types";

type DbRow = Record<string, unknown>;

function str(row: DbRow, key: string): string {
  const value = row[key];
  return typeof value === "string" ? value : "";
}

function nullableStr(row: DbRow, key: string): string | null {
  const value = row[key];
  return typeof value === "string" && value.length > 0 ? value : null;
}

function nullableInt(row: DbRow, key: string): number | null {
  const value = row[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function strArray(row: DbRow, key: string): string[] {
  const value = row[key];
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string") : [];
}

function toProfile(row: DbRow): DoctorProfileRecord {
  return {
    additionalQualifications: strArray(row, "additional_qualifications"),
    bio: nullableStr(row, "bio"),
    createdAt: str(row, "created_at"),
    fullName: str(row, "full_name"),
    languages: strArray(row, "languages"),
    primaryDegree: str(row, "primary_degree"),
    profilePhotoPath: nullableStr(row, "profile_photo_path"),
    registrationCouncil: str(row, "registration_council"),
    registrationNumber: str(row, "registration_number"),
    registrationYear: nullableInt(row, "registration_year"),
    rejectionReason: nullableStr(row, "rejection_reason"),
    specialties: parseSpecialties(row.specialties),
    status: str(row, "status") as DoctorStatus,
    updatedAt: str(row, "updated_at"),
    userId: str(row, "user_id"),
    verifiedAt: nullableStr(row, "verified_at"),
    verifiedBy: nullableStr(row, "verified_by"),
    yearsExperience: nullableInt(row, "years_experience")
  };
}

function toPublicProfile(row: DbRow): DoctorPublicProfile {
  return {
    additionalQualifications: strArray(row, "additional_qualifications"),
    bio: nullableStr(row, "bio"),
    fullName: str(row, "full_name"),
    languages: strArray(row, "languages"),
    primaryDegree: str(row, "primary_degree"),
    profilePhotoPath: nullableStr(row, "profile_photo_path"),
    specialties: parseSpecialties(row.specialties),
    userId: str(row, "user_id"),
    yearsExperience: nullableInt(row, "years_experience")
  };
}

function toCapacity(row: DbRow): DoctorCapacityRecord {
  return {
    avgTurnaroundSeconds: nullableInt(row, "avg_turnaround_seconds"),
    doctorUserId: str(row, "doctor_user_id"),
    isAccepting: row.is_accepting === true,
    lastAssignedAt: nullableStr(row, "last_assigned_at"),
    lifetimeReviewCount: nullableInt(row, "lifetime_review_count") ?? 0,
    maxOpenReviews: nullableInt(row, "max_open_reviews") ?? 0,
    openReviewCount: nullableInt(row, "open_review_count") ?? 0,
    updatedAt: str(row, "updated_at")
  };
}

export async function createDoctorApplication(input: {
  application: DoctorApplicationInput;
  userId: string;
}): Promise<DoctorProfileRecord> {
  const serviceClient = createSupabaseServiceClient();
  const now = new Date().toISOString();

  const result = await serviceClient
    .from("doctor_profiles")
    .insert({
      additional_qualifications: input.application.additionalQualifications,
      bio: input.application.bio,
      created_at: now,
      full_name: input.application.fullName,
      languages: input.application.languages,
      primary_degree: input.application.primaryDegree,
      registration_council: input.application.registrationCouncil,
      registration_number: input.application.registrationNumber,
      registration_year: input.application.registrationYear,
      specialties: input.application.specialties,
      status: "details_submitted",
      updated_at: now,
      user_id: input.userId,
      years_experience: input.application.yearsExperience
    })
    .select()
    .single();

  if (result.error) {
    // Surfaced to the applicant as "this registration is already on file"
    // rather than a raw constraint name.
    if (result.error.code === "23505") {
      throw new Error("duplicate_registration");
    }
    throw new Error(result.error.message);
  }

  return toProfile(result.data as DbRow);
}

export async function getDoctorProfile(userId: string): Promise<DoctorProfileRecord | null> {
  const serviceClient = createSupabaseServiceClient();
  const result = await serviceClient
    .from("doctor_profiles")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();

  if (result.error) {
    throw new Error(result.error.message);
  }

  return result.data ? toProfile(result.data as DbRow) : null;
}

export async function listDoctorProfiles(input: {
  limit?: number;
  status?: DoctorStatus;
} = {}): Promise<DoctorProfileRecord[]> {
  const serviceClient = createSupabaseServiceClient();
  let query = serviceClient
    .from("doctor_profiles")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(input.limit ?? 100);

  if (input.status) {
    query = query.eq("status", input.status);
  }

  const result = await query;

  if (result.error) {
    throw new Error(result.error.message);
  }

  return ((result.data ?? []) as DbRow[]).map(toProfile);
}

/**
 * Reviewer details safe to show a patient. Reads the restricted view, not
 * the base table, so registration numbers cannot leak through this path.
 */
export async function getDoctorPublicProfile(
  userId: string
): Promise<DoctorPublicProfile | null> {
  const serviceClient = createSupabaseServiceClient();
  const result = await serviceClient
    .from("doctor_public_profiles")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();

  if (result.error) {
    throw new Error(result.error.message);
  }

  return result.data ? toPublicProfile(result.data as DbRow) : null;
}

/**
 * Approval is the only path that grants the doctor role. Order matters:
 * profile first, then capacity, then role. If the role grant fails, the
 * doctor cannot reach the panel -- safe. The reverse order would briefly
 * leave a role granted to an unapproved profile.
 */
export async function approveDoctor(input: {
  adminUserId: string;
  doctorUserId: string;
  maxOpenReviews?: number;
}): Promise<DoctorProfileRecord> {
  const serviceClient = createSupabaseServiceClient();
  const now = new Date().toISOString();

  const profileResult = await serviceClient
    .from("doctor_profiles")
    .update({
      rejection_reason: null,
      status: "approved",
      updated_at: now,
      verified_at: now,
      verified_by: input.adminUserId
    })
    .eq("user_id", input.doctorUserId)
    .select()
    .maybeSingle();

  if (profileResult.error) {
    throw new Error(profileResult.error.message);
  }

  if (!profileResult.data) {
    throw new Error("doctor_profile_not_found");
  }

  const capacityResult = await serviceClient.from("doctor_capacity").upsert(
    {
      doctor_user_id: input.doctorUserId,
      is_accepting: true,
      max_open_reviews: input.maxOpenReviews ?? 15,
      updated_at: now
    },
    { onConflict: "doctor_user_id" }
  );

  if (capacityResult.error) {
    throw new Error(capacityResult.error.message);
  }

  const roleResult = await serviceClient.from("user_roles").insert({
    granted_by: input.adminUserId,
    role: "doctor",
    user_id: input.doctorUserId
  });

  // A pre-existing role row (re-approval after suspension) is not an error.
  if (roleResult.error && roleResult.error.code !== "23505") {
    throw new Error(roleResult.error.message);
  }

  return toProfile(profileResult.data as DbRow);
}

export async function rejectDoctor(input: {
  adminUserId: string;
  doctorUserId: string;
  reason: string;
}): Promise<DoctorProfileRecord> {
  const serviceClient = createSupabaseServiceClient();
  const now = new Date().toISOString();

  const result = await serviceClient
    .from("doctor_profiles")
    .update({
      rejection_reason: input.reason,
      status: "rejected",
      updated_at: now,
      verified_at: now,
      verified_by: input.adminUserId
    })
    .eq("user_id", input.doctorUserId)
    .select()
    .maybeSingle();

  if (result.error) {
    throw new Error(result.error.message);
  }

  if (!result.data) {
    throw new Error("doctor_profile_not_found");
  }

  return toProfile(result.data as DbRow);
}

/**
 * Suspension stops new assignments but leaves open reviews in place --
 * dropping them would strand patients mid-review. Clearing is_accepting is
 * what actually removes the doctor from the assignment pool.
 */
export async function suspendDoctor(input: {
  adminUserId: string;
  doctorUserId: string;
  reason: string;
}): Promise<DoctorProfileRecord> {
  const serviceClient = createSupabaseServiceClient();
  const now = new Date().toISOString();

  const result = await serviceClient
    .from("doctor_profiles")
    .update({
      rejection_reason: input.reason,
      status: "suspended",
      updated_at: now,
      verified_by: input.adminUserId
    })
    .eq("user_id", input.doctorUserId)
    .select()
    .maybeSingle();

  if (result.error) {
    throw new Error(result.error.message);
  }

  if (!result.data) {
    throw new Error("doctor_profile_not_found");
  }

  await serviceClient
    .from("doctor_capacity")
    .update({ is_accepting: false, updated_at: now })
    .eq("doctor_user_id", input.doctorUserId);

  return toProfile(result.data as DbRow);
}

export async function getDoctorCapacity(
  doctorUserId: string
): Promise<DoctorCapacityRecord | null> {
  const serviceClient = createSupabaseServiceClient();
  const result = await serviceClient
    .from("doctor_capacity")
    .select("*")
    .eq("doctor_user_id", doctorUserId)
    .maybeSingle();

  if (result.error) {
    throw new Error(result.error.message);
  }

  return result.data ? toCapacity(result.data as DbRow) : null;
}

export async function updateDoctorCapacity(input: {
  doctorUserId: string;
  isAccepting?: boolean;
  maxOpenReviews?: number;
}): Promise<DoctorCapacityRecord> {
  const serviceClient = createSupabaseServiceClient();
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };

  if (typeof input.isAccepting === "boolean") {
    patch.is_accepting = input.isAccepting;
  }

  if (typeof input.maxOpenReviews === "number") {
    patch.max_open_reviews = input.maxOpenReviews;
  }

  const result = await serviceClient
    .from("doctor_capacity")
    .update(patch)
    .eq("doctor_user_id", input.doctorUserId)
    .select()
    .maybeSingle();

  if (result.error) {
    throw new Error(result.error.message);
  }

  if (!result.data) {
    throw new Error("doctor_capacity_not_found");
  }

  return toCapacity(result.data as DbRow);
}
