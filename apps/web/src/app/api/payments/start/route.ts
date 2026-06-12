import { NextRequest, NextResponse } from "next/server";

import { getRequestUser, unauthorizedResponse } from "@/lib/auth/request";
import { logError } from "@/lib/observability/logger";
import { startPayment } from "@/lib/reports/repository";
import type { PaymentProductType } from "@/lib/reports/types";

const productTypes: PaymentProductType[] = [
  "ai_report_explanation",
  "doctor_reviewed_report"
];

export async function POST(request: NextRequest) {
  const user = await getRequestUser(request);

  if (!user) {
    return unauthorizedResponse();
  }

  const body = (await request.json()) as {
    productType?: PaymentProductType;
    reportFileId?: string | null;
  };

  if (!body.productType || !productTypes.includes(body.productType)) {
    return NextResponse.json({ error: "Unsupported private-beta payment product." }, { status: 400 });
  }

  try {
    const payment = await startPayment({
      productType: body.productType,
      reportFileId: body.reportFileId ?? null,
      userId: user.id
    });
    return NextResponse.json({
      payment,
      sandbox: true,
      message: "Razorpay sandbox placeholder created. No real public paid launch is enabled."
    }, { status: 201 });
  } catch (caught) {
    logError("payment_start_failed", {
      error: caught instanceof Error ? caught.message : "unknown",
      productType: body.productType,
      userId: user.id
    });
    return NextResponse.json({ error: "Payment could not be started." }, { status: 400 });
  }
}
