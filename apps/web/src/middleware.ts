import { NextRequest, NextResponse } from "next/server";

import {
  AUTH_COOKIE_NAME,
  REQUIRED_CONSENT_COOKIE_NAME,
  SUPABASE_ACCESS_TOKEN_COOKIE_NAME
} from "@/lib/auth/constants";

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isAuthenticated = Boolean(
    request.cookies.get(SUPABASE_ACCESS_TOKEN_COOKIE_NAME)?.value ??
      request.cookies.get(AUTH_COOKIE_NAME)?.value
  );

  if (!isAuthenticated) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  if (
    pathname.startsWith("/app/reports/new") &&
    request.cookies.get(REQUIRED_CONSENT_COOKIE_NAME)?.value !== "true"
  ) {
    const consentUrl = new URL("/app/consent", request.url);
    consentUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(consentUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/app/:path*", "/admin/:path*", "/doctor/:path*"]
};
