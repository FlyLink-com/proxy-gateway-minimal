export const XSD_DOCUMENTED_FIELD_ROLES = Object.freeze({
  create: Object.freeze([
    "merchant_order_ref",
    "amount",
    "notify_target",
    "return_target",
    "merchant_scope",
    "channel",
    "signature",
    "response_format",
    "attachment",
  ]),
  query: Object.freeze([
    "merchant_order_ref",
    "merchant_scope",
    "signature",
  ]),
  callback: Object.freeze([
    "merchant_order_ref",
    "provider_order_ref",
    "merchant_scope",
    "amount",
    "status",
    "signature",
    "attachment",
  ]),
});

const QUERY_STATUS = Object.freeze({
  succeeded: Object.freeze({
    status: "succeeded",
    chargeCertainty: "confirmed_charged",
  }),
  pending: Object.freeze({
    status: "pending",
    chargeCertainty: "possibly_charged",
  }),
  unknown: Object.freeze({
    status: "reconciliation_required",
    chargeCertainty: "unknown",
  }),
});

const CALLBACK_STATUS = Object.freeze({
  succeeded: Object.freeze({
    eventType: "payment_succeeded",
    verificationResult: "unverified",
  }),
  pending: Object.freeze({
    eventType: "payment_pending",
    verificationResult: "unverified",
  }),
  unknown: Object.freeze({
    eventType: "reconciliation_required",
    verificationResult: "unverified",
  }),
});

const SUCCESS_ACK = Object.freeze({
  statusCode: 200,
  contentType: "text/plain",
  body: "SUCCESS",
});

function unverified() {
  throw new Error("provider_contract_unverified");
}

export function classifyXsdQueryStatus(value) {
  if (value === "3") return QUERY_STATUS.succeeded;
  if (value === "00") return QUERY_STATUS.pending;
  return QUERY_STATUS.unknown;
}

export function classifyXsdCallbackStatus(value) {
  if (value === "1") return CALLBACK_STATUS.succeeded;
  if (value === "-1") return CALLBACK_STATUS.pending;
  return CALLBACK_STATUS.unknown;
}

export function encodeXsdSuccessAck() {
  return SUCCESS_ACK;
}

export function encodeXsdSignedCreateRequest() {
  return unverified();
}

export function verifyXsdCallbackSignature() {
  return unverified();
}
