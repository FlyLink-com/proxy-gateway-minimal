import { createUnverifiedPaymentAdapter } from "./unverified-payment-adapter.mjs";

export function createXsdPaymentAdapter(options = {}) {
  return createUnverifiedPaymentAdapter(
    { adapterKey: "xsd_v1", providerId: "xsd" },
    options,
  );
}
