import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import {
  AUTH_COOKIE_NAME,
  getAuthSecret,
  readSessionCookie
} from "@/lib/auth/session";
import {
  getSupabaseUserFromAccessToken,
  shouldUseSupabaseAuth,
  SUPABASE_ACCESS_TOKEN_COOKIE_NAME
} from "@/lib/auth/supabase-auth";

export async function GET() {
  const cookieStore = await cookies();
  if (shouldUseSupabaseAuth()) {
    const user = await getSupabaseUserFromAccessToken(
      cookieStore.get(SUPABASE_ACCESS_TOKEN_COOKIE_NAME)?.value ?? null
    );

    if (!user) {
      return NextResponse.json({ user: null }, { status: 401 });
    }

    return NextResponse.json({ user });
  }

  const user = readSessionCookie(
    cookieStore.get(AUTH_COOKIE_NAME)?.value,
    getAuthSecret()
  );

  if (!user) {
    return NextResponse.json({ user: null }, { status: 401 });
  }

  return NextResponse.json({ user });
}
