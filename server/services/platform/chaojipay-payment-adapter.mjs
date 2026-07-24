import { createUnverifiedPaymentAdapter } from "./unverified-payment-adapter.mjs";

export function createChaoJiPayPaymentAdapter(options = {}) {
  return createUnverifiedPaymentAdapter(
    { adapterKey: "chaojipay_v1", providerId: "chaojipay" },
    options,
  );
}
