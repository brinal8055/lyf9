import {
  isLocalLikePaymentEnv,
  isPublicPaidLaunchEnabled,
  type PaymentProvider
} from "./payment-provider";
import { RazorpayPaymentProvider } from "./razorpay-payment-provider";
import { sandboxPaymentProvider } from "./sandbox-payment-provider";

export type {
  CapturePaymentParams,
  CapturePaymentResult,
  CreateOrderParams,
  CreateOrderResult,
  PaymentProvider
} from "./payment-provider";
export { isLocalLikePaymentEnv, isPublicPaidLaunchEnabled } from "./payment-provider";
export { RazorpayPaymentProvider } from "./razorpay-payment-provider";
export { sandboxPaymentProvider } from "./sandbox-payment-provider";

/**
 * Payment provider selection is fail-closed in both directions:
 * - Real Razorpay only runs when explicitly selected AND public launch is enabled.
 * - The sandbox placeholder is refused outside local-like environments unless an
 *   explicit override is set, so a deployed environment cannot silently take
 *   fake payments.
 */
export function getPaymentProvider(): PaymentProvider {
  const provider = (process.env.PAYMENT_PROVIDER ?? "sandbox").toLowerCase();

  if (provider === "razorpay") {
    if (!isPublicPaidLaunchEnabled()) {
      throw new Error("payments_public_launch_disabled");
    }
    return new RazorpayPaymentProvider();
  }

  if (provider !== "sandbox") {
    throw new Error(`Unsupported payment provider: ${provider}`);
  }

  if (!isLocalLikePaymentEnv() && process.env.ALLOW_SANDBOX_PAYMENTS_IN_DEPLOYED_ENV !== "true") {
    throw new Error("sandbox_payments_disabled_outside_local_env");
  }

  return sandboxPaymentProvider;
}
