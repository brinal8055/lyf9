import { describe, expect, it } from "vitest";

import {
  generateInviteToken,
  hashInviteToken,
  inviteExpiryDate,
  inviteTokenMatches,
  isInviteExpired,
  validateInviteState
} from "./invite-tokens";

describe("invite token generation", () => {
  it("produces unique tokens that never equal their stored hash", () => {
    const first = generateInviteToken();
    const second = generateInviteToken();

    expect(first.token).not.toBe(second.token);
    expect(first.tokenHash).not.toBe(second.tokenHash);
    expect(first.token).not.toBe(first.tokenHash);
    expect(first.tokenHash).toBe(hashInviteToken(first.token));
  });

  it("matches only the exact token", () => {
    const { token, tokenHash } = generateInviteToken();

    expect(inviteTokenMatches(token, tokenHash)).toBe(true);
    expect(inviteTokenMatches("not-the-token", tokenHash)).toBe(false);
    expect(inviteTokenMatches(`${token}x`, tokenHash)).toBe(false);
  });

  it("defaults expiry to seven days ahead", () => {
    const deltaDays = (inviteExpiryDate().getTime() - Date.now()) / (1000 * 60 * 60 * 24);

    expect(deltaDays).toBeGreaterThan(6.9);
    expect(deltaDays).toBeLessThan(7.1);
  });
});

describe("invite expiry", () => {
  const now = new Date("2026-08-16T00:00:00Z");

  it("handles past, future, and malformed dates", () => {
    expect(isInviteExpired("2026-08-15T23:59:00Z", now)).toBe(true);
    expect(isInviteExpired("2026-08-17T00:00:00Z", now)).toBe(false);
    expect(isInviteExpired("not-a-date", now)).toBe(true);
  });
});

describe("invite state validation", () => {
  const now = new Date("2026-08-16T00:00:00Z");
  const valid = { consumedAt: null, expiresAt: "2026-08-20T00:00:00Z", revokedAt: null };

  it("accepts a live invite", () => {
    expect(validateInviteState(valid, now)).toBeNull();
  });

  it("reports the blocking reason", () => {
    expect(validateInviteState({ ...valid, revokedAt: "2026-08-15T00:00:00Z" }, now)).toBe(
      "invite_revoked"
    );
    expect(validateInviteState({ ...valid, consumedAt: "2026-08-15T00:00:00Z" }, now)).toBe(
      "invite_already_used"
    );
    expect(validateInviteState({ ...valid, expiresAt: "2026-08-01T00:00:00Z" }, now)).toBe(
      "invite_expired"
    );
  });

  it("prioritises revocation over expiry", () => {
    expect(
      validateInviteState(
        { consumedAt: null, expiresAt: "2026-08-01T00:00:00Z", revokedAt: "2026-08-02T00:00:00Z" },
        now
      )
    ).toBe("invite_revoked");
  });
});
