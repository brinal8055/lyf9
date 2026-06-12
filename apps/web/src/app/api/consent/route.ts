import { NextRequest, NextResponse } from "next/server";

import { REQUIRED_CONSENT_COOKIE_NAME } from "@/lib/auth/session";
import { getRequestUser, requestMetadata, unauthorizedResponse } from "@/lib/auth/request";
import { saveConsentChoices } from "@/lib/onboarding/server";
import type { ConsentChoices } from "@/lib/onboarding/types";

export async function POST(request: NextRequest) {
  const user = await getRequestUser(request);

  if (!user) {
    return unauthorizedResponse();
  }

  const choices = (await request.json()) as ConsentChoices;
  const metadata = requestMetadata(request);
  const result = await saveConsentChoices({
    choices,
    ipAddress: metadata.ipAddress,
    user,
    userAgent: metadata.userAgent
  });
  const response = NextResponse.json({
    persisted: result.persisted,
    records: result.records,
    requiredGranted: result.requiredGranted
  });

  response.cookies.set(REQUIRED_CONSENT_COOKIE_NAME, String(result.requiredGranted), {
    httpOnly: true,
    path: "/",
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production"
  });

  return response;
}
