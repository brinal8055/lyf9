import { NextRequest, NextResponse } from "next/server";

import { getRequestUser, unauthorizedResponse } from "@/lib/auth/request";
import { loadQuestionnaireResponse, saveQuestionnaireResponse } from "@/lib/onboarding/server";
import type { QuestionnaireResponse } from "@/lib/onboarding/types";
import { validateQuestionnaire } from "@/lib/onboarding/validation";

export async function GET(request: NextRequest) {
  const user = await getRequestUser(request);

  if (!user) {
    return unauthorizedResponse();
  }

  const response = await loadQuestionnaireResponse(user.id);
  return NextResponse.json({ response });
}

export async function POST(request: NextRequest) {
  const user = await getRequestUser(request);

  if (!user) {
    return unauthorizedResponse();
  }

  const response = (await request.json()) as QuestionnaireResponse;
  const validation = validateQuestionnaire(response);

  if (!validation.ok) {
    return NextResponse.json({ errors: validation.errors }, { status: 400 });
  }

  const result = await saveQuestionnaireResponse({ response, user });
  return NextResponse.json({ ok: true, persisted: result.persisted });
}
