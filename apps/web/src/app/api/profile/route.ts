import { NextRequest, NextResponse } from "next/server";

import { getRequestUser, unauthorizedResponse } from "@/lib/auth/request";
import { saveUserHealthProfile } from "@/lib/onboarding/server";
import type { HealthProfile } from "@/lib/onboarding/types";
import { validateHealthProfile } from "@/lib/onboarding/validation";

export async function POST(request: NextRequest) {
  const user = await getRequestUser(request);

  if (!user) {
    return unauthorizedResponse();
  }

  const profile = (await request.json()) as HealthProfile;
  const validation = validateHealthProfile(profile);

  if (!validation.ok) {
    return NextResponse.json({ errors: validation.errors }, { status: 400 });
  }

  const result = await saveUserHealthProfile({ profile, user });
  return NextResponse.json({ ok: true, persisted: result.persisted });
}
