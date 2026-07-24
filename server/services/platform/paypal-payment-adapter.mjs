import { createUnverifiedPaymentAdapter } from "./unverified-payment-adapter.mjs";

export function createPayPalPaymentAdapter(options = {}) {
  return createUnverifiedPaymentAdapter(
    { adapterKey: "paypal_v1", providerId: "paypal_commerce" },
    options,
  );
}
