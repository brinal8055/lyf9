import { NextResponse } from "next/server";

import {
  AUTH_COOKIE_NAME,
  REQUIRED_CONSENT_COOKIE_NAME
} from "@/lib/auth/session";
import {
  SUPABASE_ACCESS_TOKEN_COOKIE_NAME,
  SUPABASE_REFRESH_TOKEN_COOKIE_NAME
} from "@/lib/auth/supabase-auth";

export function POST() {
  const response = NextResponse.json({ ok: true });
  response.cookies.delete(AUTH_COOKIE_NAME);
  response.cookies.delete(REQUIRED_CONSENT_COOKIE_NAME);
  response.cookies.delete(SUPABASE_ACCESS_TOKEN_COOKIE_NAME);
  response.cookies.delete(SUPABASE_REFRESH_TOKEN_COOKIE_NAME);
  return response;
}
