import { createHmac, timingSafeEqual } from "crypto";

import {
  isPublicPaidLaunchEnabled,
  type CapturePaymentParams,
  type CapturePaymentResult,
  type CreateOrderParams,
  type CreateOrderResult,
  type PaymentProvider
} from "./payment-provider";

const RAZORPAY_ORDERS_URL = "https://api.razorpay.com/v1/orders";
const REQUEST_TIMEOUT_MS = 30_000;

/**
 * Real Razorpay provider. Deliberately fail-closed: it refuses to run unless
 * credentials are configured AND public paid launch has been explicitly enabled.
 * Legal review is a prerequisite for enabling PAYMENTS_PUBLIC_LAUNCH_ENABLED.
 */
export class RazorpayPaymentProvider implements PaymentProvider {
  name = "razorpay" as const;
  publicLaunchEnabled = true;

  async createOrder(params: CreateOrderParams): Promise<CreateOrderResult> {
    const { keyId, keySecret } = this.assertConfigured();
    const response = await fetchWithTimeout(RAZORPAY_ORDERS_URL, {
      body: JSON.stringify({
        amount: params.amountMinorUnits,
        currency: params.currency,
        notes: { productType: params.productType },
        receipt: params.receiptId
      }),
      headers: {
        Authorization: `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString("base64")}`,
        "Content-Type": "application/json"
      },
      method: "POST"
    });

    if (!response.ok) {
      const errorBody = await response.text().catch(() => "");
      throw new Error(`razorpay_order_failed_${response.status}: ${errorBody.slice(0, 300)}`);
    }

    const body = (await response.json()) as { id?: string };
    if (!body.id) {
      throw new Error("razorpay_order_missing_id");
    }

    return { providerOrderId: body.id };
  }

  async capturePayment(params: CapturePaymentParams): Promise<CapturePaymentResult> {
    const { keySecret } = this.assertConfigured();

    if (!params.providerPaymentId || !params.providerOrderId || !params.providerSignature) {
      throw new Error("razorpay_signature_verification_requires_order_payment_and_signature");
    }

    const expected = createHmac("sha256", keySecret)
      .update(`${params.providerOrderId}|${params.providerPaymentId}`)
      .digest("hex");

    if (!safeEqualHex(expected, params.providerSignature)) {
      throw new Error("razorpay_signature_mismatch");
    }

    return { providerPaymentId: params.providerPaymentId };
  }

  private assertConfigured() {
    if (!isPublicPaidLaunchEnabled()) {
      throw new Error("payments_public_launch_disabled");
    }

    const keyId = process.env.RAZORPAY_KEY_ID?.trim();
    const keySecret = process.env.RAZORPAY_KEY_SECRET?.trim();

    if (!keyId || !keySecret) {
      throw new Error("razorpay_configuration_required");
    }

    return { keyId, keySecret };
  }
}

async function fetchWithTimeout(url: string, init: RequestInit) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (caught) {
    if (caught instanceof Error && caught.name === "AbortError") {
      throw new Error("razorpay_request_timeout");
    }
    throw caught;
  } finally {
    clearTimeout(timeout);
  }
}

function safeEqualHex(expected: string, provided: string) {
  const expectedBuffer = Buffer.from(expected, "hex");
  const providedBuffer = Buffer.from(provided, "hex");

  if (expectedBuffer.length !== providedBuffer.length || expectedBuffer.length === 0) {
    return false;
  }

  return timingSafeEqual(expectedBuffer, providedBuffer);
}
