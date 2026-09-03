import { randomUUID } from "crypto";

import type {
  CapturePaymentParams,
  CapturePaymentResult,
  CreateOrderParams,
  CreateOrderResult,
  PaymentProvider
} from "./payment-provider";

/**
 * Placeholder provider for the private beta. Creates deterministic-looking
 * identifiers without contacting any payment network. No real money moves.
 */
export const sandboxPaymentProvider: PaymentProvider = {
  name: "razorpay_sandbox_placeholder",
  publicLaunchEnabled: false,

  async createOrder(params: CreateOrderParams): Promise<CreateOrderResult> {
    void params;
    return { providerOrderId: `order_${randomUUID()}` };
  },

  async capturePayment(params: CapturePaymentParams): Promise<CapturePaymentResult> {
    return { providerPaymentId: params.providerPaymentId ?? `pay_${randomUUID()}` };
  }
};
