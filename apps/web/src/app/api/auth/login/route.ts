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
  shouldUseSupabaseAuth,
  shouldUseLocalAuthFallback,
  signInWithSupabase,
  SUPABASE_ACCESS_TOKEN_COOKIE_NAME,
  SUPABASE_REFRESH_TOKEN_COOKIE_NAME
} from "@/lib/auth/supabase-auth";

export async function POST(request: NextRequest) {
  const body = (await request.json()) as {
    email?: string;
    password?: string;
  };
  const result = validateAuthInput(
    {
      email: body.email ?? "",
      password: body.password ?? ""
    },
    false
  );

  if (!result.ok) {
    return NextResponse.json({ errors: result.errors }, { status: 400 });
  }

  if (shouldUseSupabaseAuth()) {
    try {
      const signin = await signInWithSupabase({
        email: result.value.email,
        password: body.password ?? ""
      });
      const response = NextResponse.json({ user: signin.user });
      setSupabaseAuthCookies(response, signin.accessToken, signin.refreshToken);
      return response;
    } catch (caught) {
      return NextResponse.json(
        { errors: { email: caught instanceof Error ? caught.message : "Invalid email or password." } },
        { status: 401 }
      );
    }
  }

  if (!shouldUseLocalAuthFallback()) {
    return authConfigurationErrorResponse();
  }

  const role = inferUserRole(result.value.email);
  const response = NextResponse.json({
    user: {
      email: result.value.email,
      id: result.value.email,
      name: result.value.email.split("@")[0],
      role
    }
  });

  response.cookies.set(
    AUTH_COOKIE_NAME,
    createSessionCookie(
      {
        email: result.value.email,
        id: result.value.email,
        name: result.value.email.split("@")[0],
        role
      },
      getAuthSecret()
    ),
    {
      httpOnly: true,
      path: "/",
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production"
    }
  );

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
