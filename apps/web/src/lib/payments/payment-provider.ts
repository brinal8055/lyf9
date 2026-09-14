import type { PaymentProductType, PaymentProviderName } from "../reports/types";

export type CreateOrderParams = {
  amountMinorUnits: number;
  currency: "INR";
  productType: PaymentProductType;
  receiptId: string;
  userId: string;
};

export type CreateOrderResult = {
  providerOrderId: string;
};

export type CapturePaymentParams = {
  paymentId: string;
  providerOrderId: string | null;
  providerPaymentId: string | null;
  providerSignature?: string | null;
};

export type CapturePaymentResult = {
  providerPaymentId: string;
};

export type PaymentProvider = {
  name: PaymentProviderName;
  publicLaunchEnabled: boolean;
  createOrder(params: CreateOrderParams): Promise<CreateOrderResult>;
  capturePayment(params: CapturePaymentParams): Promise<CapturePaymentResult>;
};

export function isPublicPaidLaunchEnabled() {
  return process.env.PAYMENTS_PUBLIC_LAUNCH_ENABLED === "true";
}

export function isLocalLikePaymentEnv() {
  const appEnv = (process.env.APP_ENV ?? process.env.NODE_ENV ?? "development").toLowerCase();
  return appEnv === "local" || appEnv === "development" || appEnv === "test";
}
