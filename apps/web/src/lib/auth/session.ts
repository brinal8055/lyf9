import { createHmac, timingSafeEqual } from "crypto";

import { inferUserRole } from "./roles";
import type { UserRole } from "@/lib/reports/types";

export { AUTH_COOKIE_NAME, REQUIRED_CONSENT_COOKIE_NAME } from "./constants";

export type SessionUser = {
  email: string;
  id: string;
  name: string;
  role: UserRole;
};

export type AuthInput = {
  email: string;
  password: string;
  name?: string;
};

export function validateAuthInput(input: AuthInput, requireName: boolean) {
  const errors: Record<string, string> = {};
  const email = input.email.trim().toLowerCase();
  const name = input.name?.trim() ?? "";

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    errors.email = "Enter a valid email address.";
  }

  if (input.password.length < 8) {
    errors.password = "Use at least 8 characters.";
  }

  if (requireName && name.length < 2) {
    errors.name = "Enter your name.";
  }

  return {
    errors,
    ok: Object.keys(errors).length === 0,
    value: { email, name }
  };
}

export function createSessionCookie(user: SessionUser, secret: string) {
  const payload = base64UrlEncode(JSON.stringify(user));
  const signature = sign(payload, secret);
  return `${payload}.${signature}`;
}

export function readSessionCookie(value: string | undefined, secret: string) {
  if (!value) {
    return null;
  }

  const [payload, signature] = value.split(".");

  if (!payload || !signature || !safeEqual(signature, sign(payload, secret))) {
    return null;
  }

  try {
    const user = JSON.parse(base64UrlDecode(payload)) as Partial<SessionUser>;
    if (!user.email || !user.name) {
      return null;
    }
    return {
      email: user.email,
      id: user.id ?? user.email,
      name: user.name,
      role: user.role ?? inferUserRole(user.email)
    };
  } catch {
    return null;
  }
}

export function getAuthSecret() {
  return process.env.LYF9_AUTH_SECRET ?? "lyf9-local-dev-secret";
}

function sign(payload: string, secret: string) {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

function safeEqual(a: string, b: string) {
  const aBuffer = Buffer.from(a);
  const bBuffer = Buffer.from(b);

  if (aBuffer.length !== bBuffer.length) {
    return false;
  }

  return timingSafeEqual(aBuffer, bBuffer);
}

function base64UrlEncode(value: string) {
  return Buffer.from(value, "utf8").toString("base64url");
}

function base64UrlDecode(value: string) {
  return Buffer.from(value, "base64url").toString("utf8");
}
