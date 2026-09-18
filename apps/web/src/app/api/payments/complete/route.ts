import { NextRequest, NextResponse } from "next/server";

import { getRequestUser, unauthorizedResponse } from "@/lib/auth/request";
import { logError } from "@/lib/observability/logger";
import { completePayment } from "@/lib/reports/repository";

export async function POST(request: NextRequest) {
  const user = await getRequestUser(request);

  if (!user) {
    return unauthorizedResponse();
  }

  const body = (await request.json()) as {
    paymentId?: string;
    providerPaymentId?: string | null;
    providerSignature?: string | null;
  };

  if (!body.paymentId) {
    return NextResponse.json({ error: "Payment id is required." }, { status: 400 });
  }

  try {
    const payment = await completePayment({
      paymentId: body.paymentId,
      providerPaymentId: body.providerPaymentId ?? null,
      providerSignature: body.providerSignature ?? null,
      userId: user.id
    });
    const sandbox = !payment.publicLaunchEnabled;
    return NextResponse.json({
      payment,
      sandbox,
      message: sandbox
        ? "Sandbox placeholder marked complete. Legal review is still required before public paid launch."
        : "Payment captured."
    });
  } catch (caught) {
    logError("payment_complete_failed", {
      error: caught instanceof Error ? caught.message : "unknown",
      paymentId: body.paymentId,
      userId: user.id
    });
    return NextResponse.json({ error: "Payment could not be completed." }, { status: 404 });
  }
}
