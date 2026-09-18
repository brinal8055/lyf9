import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

const TOKEN_BYTES = 32;
const DEFAULT_EXPIRY_DAYS = 7;

/**
 * Invite tokens are stored only as sha256(token). The raw token exists in the
 * emailed URL and nowhere else, so read access to doctor_invites cannot be
 * used to forge an application.
 */
export function generateInviteToken(): { token: string; tokenHash: string } {
  const token = randomBytes(TOKEN_BYTES).toString("base64url");
  return { token, tokenHash: hashInviteToken(token) };
}

export function hashInviteToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export function inviteExpiryDate(days: number = DEFAULT_EXPIRY_DAYS): Date {
  const expiry = new Date();
  expiry.setUTCDate(expiry.getUTCDate() + days);
  return expiry;
}

/** Constant-time compare so token validation cannot be timing-probed. */
export function inviteTokenMatches(candidateToken: string, storedHash: string): boolean {
  const candidateHash = hashInviteToken(candidateToken);

  if (candidateHash.length !== storedHash.length) {
    return false;
  }

  return timingSafeEqual(Buffer.from(candidateHash, "utf8"), Buffer.from(storedHash, "utf8"));
}

export function isInviteExpired(expiresAt: string | Date, now: Date = new Date()): boolean {
  const expiry = typeof expiresAt === "string" ? new Date(expiresAt) : expiresAt;
  return Number.isNaN(expiry.getTime()) || expiry.getTime() <= now.getTime();
}

export type InviteValidationFailure =
  | "invite_not_found"
  | "invite_expired"
  | "invite_revoked"
  | "invite_already_used";

export function validateInviteState(invite: {
  consumedAt: string | null;
  expiresAt: string;
  revokedAt: string | null;
}, now: Date = new Date()): InviteValidationFailure | null {
  if (invite.revokedAt) {
    return "invite_revoked";
  }

  if (invite.consumedAt) {
    return "invite_already_used";
  }

  if (isInviteExpired(invite.expiresAt, now)) {
    return "invite_expired";
  }

  return null;
}
