import { NextRequest, NextResponse } from "next/server";

import { requireRequestRole, requestMetadata } from "@/lib/auth/request";
import { correctBiomarker } from "@/lib/reports/repository";
import type { BiomarkerFlag, ReviewRouting } from "@/lib/reports/types";

export async function POST(request: NextRequest) {
  const auth = await requireRequestRole(request, ["admin"]);

  if (auth.response) {
    return auth.response;
  }

  const body = (await request.json()) as Record<string, unknown>;
  const metadata = requestMetadata(request);

  try {
    const marker = await correctBiomarker({
      actorUserId: auth.user.id,
      biomarkerResultId: String(body.biomarkerResultId ?? ""),
      canonicalName: nullableString(body.canonicalName),
      confidenceScore: nullableNumber(body.confidenceScore),
      ipAddress: metadata.ipAddress,
      rawName: nullableString(body.rawName),
      reason: nullableString(body.reason),
      referenceHigh: nullableNumber(body.referenceHigh),
      referenceLow: nullableNumber(body.referenceLow),
      referenceRangeText: nullableString(body.referenceRangeText),
      requestId: metadata.requestId,
      reviewRouting: nullableString(body.reviewRouting) as ReviewRouting | null,
      sourceText: nullableString(body.sourceText),
      systemFlag: nullableString(body.systemFlag) as BiomarkerFlag | null,
      unit: nullableString(body.unit),
      userAgent: metadata.userAgent,
      valueNumeric: nullableNumber(body.valueNumeric),
      valueText: nullableString(body.valueText)
    });
    return NextResponse.json({ marker });
  } catch {
    return NextResponse.json({ error: "Biomarker correction could not be saved." }, { status: 400 });
  }
}

function nullableString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function nullableNumber(value: unknown) {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}
