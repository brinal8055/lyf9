import { createSupabaseServiceClient } from "@/lib/auth/providers/supabase-server";

import {
  generateInviteToken,
  hashInviteToken,
  inviteExpiryDate,
  validateInviteState
} from "./invite-tokens";
import type { DoctorInviteRecord } from "./types";
import type { InviteValidationFailure } from "./invite-tokens";

type DbRow = Record<string, unknown>;

function str(row: DbRow, key: string): string {
  const value = row[key];
  return typeof value === "string" ? value : "";
}

function nullableStr(row: DbRow, key: string): string | null {
  const value = row[key];
  return typeof value === "string" && value.length > 0 ? value : null;
}

function toInvite(row: DbRow): DoctorInviteRecord {
  return {
    consumedAt: nullableStr(row, "consumed_at"),
    consumedBy: nullableStr(row, "consumed_by"),
    createdAt: str(row, "created_at"),
    email: str(row, "email"),
    expiresAt: str(row, "expires_at"),
    id: str(row, "id"),
    invitedBy: str(row, "invited_by"),
    note: nullableStr(row, "note"),
    revokedAt: nullableStr(row, "revoked_at")
  };
}

/**
 * Returns the raw token exactly once, for the invite email. It is never
 * persisted -- only sha256(token) reaches the database.
 */
export async function createDoctorInvite(input: {
  email: string;
  expiryDays?: number;
  invitedBy: string;
  note?: string | null;
}): Promise<{ invite: DoctorInviteRecord; token: string }> {
  const serviceClient = createSupabaseServiceClient();
  const { token, tokenHash } = generateInviteToken();
  const email = input.email.trim().toLowerCase();

  const result = await serviceClient
    .from("doctor_invites")
    .insert({
      email,
      expires_at: inviteExpiryDate(input.expiryDays).toISOString(),
      invited_by: input.invitedBy,
      note: input.note ?? null,
      token_hash: tokenHash
    })
    .select()
    .single();

  if (result.error) {
    // Partial unique index on (email) where not consumed and not revoked.
    if (result.error.code === "23505") {
      throw new Error("invite_already_pending");
    }
    throw new Error(result.error.message);
  }

  return { invite: toInvite(result.data as DbRow), token };
}

export type InviteLookupResult =
  | { invite: DoctorInviteRecord; ok: true }
  | { ok: false; reason: InviteValidationFailure };

/**
 * Looks an invite up by its raw token. Queries by hash so the raw token is
 * never compared in SQL, then re-checks expiry/revocation/consumption in
 * application code.
 */
export async function findUsableInvite(token: string): Promise<InviteLookupResult> {
  const serviceClient = createSupabaseServiceClient();
  const result = await serviceClient
    .from("doctor_invites")
    .select("*")
    .eq("token_hash", hashInviteToken(token))
    .maybeSingle();

  if (result.error) {
    throw new Error(result.error.message);
  }

  if (!result.data) {
    return { ok: false, reason: "invite_not_found" };
  }

  const invite = toInvite(result.data as DbRow);
  const failure = validateInviteState(invite);

  return failure ? { ok: false, reason: failure } : { invite, ok: true };
}

/**
 * Claims the invite before the account exists.
 *
 * Conditional on consumed_at still being null, so two concurrent submissions
 * cannot both proceed -- the second matches zero rows and is rejected. This
 * runs before user creation, so `consumed_by` is filled in afterwards by
 * `attachInviteConsumer` once the doctor's user id is known.
 */
export async function claimInvite(inviteId: string): Promise<DoctorInviteRecord> {
  const serviceClient = createSupabaseServiceClient();
  const result = await serviceClient
    .from("doctor_invites")
    .update({ consumed_at: new Date().toISOString() })
    .eq("id", inviteId)
    .is("consumed_at", null)
    .is("revoked_at", null)
    .select()
    .maybeSingle();

  if (result.error) {
    throw new Error(result.error.message);
  }

  if (!result.data) {
    throw new Error("invite_already_used");
  }

  return toInvite(result.data as DbRow);
}

/** Records which account consumed the invite, once that account exists. */
export async function attachInviteConsumer(input: {
  consumedBy: string;
  inviteId: string;
}): Promise<void> {
  const serviceClient = createSupabaseServiceClient();
  const result = await serviceClient
    .from("doctor_invites")
    .update({ consumed_by: input.consumedBy })
    .eq("id", input.inviteId);

  if (result.error) {
    throw new Error(result.error.message);
  }
}

/**
 * Releases a claimed invite when account creation fails afterwards, so a
 * transient error does not permanently burn the doctor's only invite.
 */
export async function releaseInvite(inviteId: string): Promise<void> {
  const serviceClient = createSupabaseServiceClient();
  await serviceClient
    .from("doctor_invites")
    .update({ consumed_at: null, consumed_by: null })
    .eq("id", inviteId)
    .is("consumed_by", null);
}

export async function revokeInvite(inviteId: string): Promise<DoctorInviteRecord> {
  const serviceClient = createSupabaseServiceClient();
  const result = await serviceClient
    .from("doctor_invites")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", inviteId)
    .is("consumed_at", null)
    .select()
    .maybeSingle();

  if (result.error) {
    throw new Error(result.error.message);
  }

  if (!result.data) {
    throw new Error("invite_not_revocable");
  }

  return toInvite(result.data as DbRow);
}

export async function listDoctorInvites(limit = 100): Promise<DoctorInviteRecord[]> {
  const serviceClient = createSupabaseServiceClient();
  const result = await serviceClient
    .from("doctor_invites")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (result.error) {
    throw new Error(result.error.message);
  }

  return ((result.data ?? []) as DbRow[]).map(toInvite);
}
