import { NextRequest, NextResponse } from "next/server";

import {
  AUTH_COOKIE_NAME,
  REQUIRED_CONSENT_COOKIE_NAME
} from "./constants";
import { roleCanAccess } from "./roles";
import { getAuthSecret, readSessionCookie } from "./session";
import {
  getAuthConfigurationErrorMessage,
  getSupabaseUserFromAccessToken,
  hasAuthConfigurationError,
  shouldUseLocalAuthFallback,
  shouldUseSupabaseAuth,
  SUPABASE_ACCESS_TOKEN_COOKIE_NAME
} from "./supabase-auth";
import type { UserRole } from "@/lib/reports/types";

export async function getRequestUser(request: NextRequest) {
  if (shouldUseSupabaseAuth()) {
    const bearerToken = request.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1] ?? null;
    return getSupabaseUserFromAccessToken(
      bearerToken ?? request.cookies.get(SUPABASE_ACCESS_TOKEN_COOKIE_NAME)?.value ?? null
    );
  }

  if (!shouldUseLocalAuthFallback()) {
    return null;
  }

  return readSessionCookie(
    request.cookies.get(AUTH_COOKIE_NAME)?.value,
    getAuthSecret()
  );
}

export function getRequiredConsentComplete(request: NextRequest) {
  return request.cookies.get(REQUIRED_CONSENT_COOKIE_NAME)?.value === "true";
}

export function unauthorizedResponse() {
  if (hasAuthConfigurationError()) {
    return authConfigurationErrorResponse();
  }

  return NextResponse.json({ error: "Authentication required." }, { status: 401 });
}

export function authConfigurationErrorResponse() {
  return NextResponse.json(
    { error: getAuthConfigurationErrorMessage() },
    { status: 503 }
  );
}

export function forbiddenResponse() {
  return NextResponse.json({ error: "You do not have access to this workspace." }, { status: 403 });
}

export async function requireRequestRole(request: NextRequest, allowed: UserRole[]) {
  const user = await getRequestUser(request);

  if (!user) {
    return { response: unauthorizedResponse(), user: null };
  }

  if (!roleCanAccess(user.role, allowed)) {
    return { response: forbiddenResponse(), user };
  }

  return { response: null, user };
}

export function consentRequiredResponse() {
  return NextResponse.json(
    { error: "Required lab report processing and AI analysis consent is missing." },
    { status: 403 }
  );
}

export function requestMetadata(request: NextRequest) {
  return {
    ipAddress:
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      request.headers.get("x-real-ip"),
    requestId: request.headers.get("x-request-id"),
    userAgent: request.headers.get("user-agent")
  };
}
