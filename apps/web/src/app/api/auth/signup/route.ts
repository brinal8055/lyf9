import { NextRequest, NextResponse } from "next/server";

import {
  AUTH_COOKIE_NAME,
  createSessionCookie,
  getAuthSecret,
  validateAuthInput
} from "@/lib/auth/session";
import { authConfigurationErrorResponse } from "@/lib/auth/request";
import { inferUserRole } from "@/lib/auth/roles";
import {
  shouldUseLocalAuthFallback,
  shouldUseSupabaseAuth,
  signUpWithSupabase,
  SUPABASE_ACCESS_TOKEN_COOKIE_NAME,
  SUPABASE_REFRESH_TOKEN_COOKIE_NAME
} from "@/lib/auth/supabase-auth";
import { trackAnalyticsEvent, validateAndRedeemBetaInvite } from "@/lib/reports/repository";

export async function POST(request: NextRequest) {
  const body = (await request.json()) as {
    email?: string;
    inviteCode?: string;
    name?: string;
    password?: string;
  };
  const result = validateAuthInput(
    {
      email: body.email ?? "",
      name: body.name ?? "",
      password: body.password ?? ""
    },
    true
  );

  if (!result.ok) {
    return NextResponse.json({ errors: result.errors }, { status: 400 });
  }

  if (!shouldUseSupabaseAuth() && !shouldUseLocalAuthFallback()) {
    return authConfigurationErrorResponse();
  }

  const betaAccess = await validateAndRedeemBetaInvite({
    email: result.value.email,
    inviteCode: body.inviteCode?.trim() || null
  });

  if (!betaAccess.ok) {
    return NextResponse.json(
      { errors: { inviteCode: betaAccess.reason ?? "Private beta invite required." } },
      { status: 403 }
    );
  }

  if (shouldUseSupabaseAuth()) {
    try {
      const signup = await signUpWithSupabase({
        email: result.value.email,
        name: result.value.name,
        password: body.password ?? ""
      });
      const response = NextResponse.json({ user: signup.user });

      if (signup.accessToken) {
        setSupabaseAuthCookies(response, signup.accessToken, signup.refreshToken);
      }

      await trackAnalyticsEvent({
        eventName: "signup_completed",
        metadata: { role: signup.user.role },
        userId: signup.user.id
      });

      return response;
    } catch (caught) {
      return NextResponse.json(
        { errors: { email: caught instanceof Error ? caught.message : "Unable to sign up." } },
        { status: 400 }
      );
    }
  }

  const role = inferUserRole(result.value.email);
  const response = NextResponse.json({
    user: {
      email: result.value.email,
      id: result.value.email,
      name: result.value.name,
      role
    }
  });

  response.cookies.set(
    AUTH_COOKIE_NAME,
    createSessionCookie(
      { email: result.value.email, id: result.value.email, name: result.value.name, role },
      getAuthSecret()
    ),
    {
      httpOnly: true,
      path: "/",
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production"
    }
  );

  await trackAnalyticsEvent({
    eventName: "signup_completed",
    metadata: { role },
    userId: result.value.email
  });

  return response;
}

function setSupabaseAuthCookies(
  response: NextResponse,
  accessToken: string,
  refreshToken: string | null
) {
  response.cookies.set(SUPABASE_ACCESS_TOKEN_COOKIE_NAME, accessToken, {
    httpOnly: true,
    path: "/",
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production"
  });

  if (refreshToken) {
    response.cookies.set(SUPABASE_REFRESH_TOKEN_COOKIE_NAME, refreshToken, {
      httpOnly: true,
      path: "/",
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production"
    });
  }
}
