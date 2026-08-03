// Detached documentation evidence only. It must not activate a provider path.
export const CHAOJIPAY_DOCUMENTED_PAYMENT_CANDIDATE = Object.freeze({
  adapterKey: "chaojipay_v1",
  contractVersion: "unverified",
  documentedPaymentMethods: Object.freeze(["wechat_pay"]),
  documentedProductCode: "726",
  requestEncoding: "application/json; charset=utf-8",
  createOrigin: "https://payment.chaojipay.me",
  createPath: "/api/order/create",
  createFields: Object.freeze(["outTradeId", "amount", "productCode", "merchantId", "ip", "notifyUrl", "sign"]),
  callbackFields: Object.freeze(["orderId", "orderStatus", "outTradeId", "amount", "sign"]),
  callbackVerification: "unverified",
  acknowledgement: "unverified",
});
