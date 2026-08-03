// preview-only CNY candidate adapter (no real outbound)
// Implements the PaymentRechargeCoordinator adapter surface but always
// rejects with provider_contract_unverified, mirroring the detached
// synthetic candidate contract documented in PR 575.
//
// This module is NOT a production provider integration. It exists solely
// to wire the CNY recharge flow end-to-end in the local preview worktree
// so the desktop CNY recharge cards render and the failure-closed design
// from PR 575 is visible.
//
// Restored at cleanup.

import { createHash } from "node:crypto";

function contractError(code, message) {
  const error = new Error(message || "provider_contract_unverified");
  error.code = code || "provider_contract_unverified";
  return error;
}

function unverified(method) {
  return contractError(
    "provider_contract_unverified",
    `cny preview adapter refuses ${method}: PR 575 synthetic candidate`,
  );
}

export function createCnyPreviewRechargeAdapter({ paymentMethod = "chaojipay", merchantBindingRef = "cny_preview_chaojipay" } = {}) {
  return Object.freeze({
    adapterKey: paymentMethod === "chaojipay" ? "chaojipay_v1" : "xsd_v1",
    contractVersion: "v1",
    credentialProfileRef: merchantBindingRef,
    declaredCapabilities: Object.freeze({
      createRechargeOrder: true,
      queryPayment: true,
      capturePayment: true,
      verifyCallback: true,
      refund: false,
      reconcile: false,
      repeatCreateIdempotent: true,
      repeatCaptureIdempotent: true,
    }),
    paymentMethod,
    merchantBindingRef,
    async createRechargeOrder() {
      throw unverified("createRechargeOrder");
    },
    async capturePayment() {
      throw unverified("capturePayment");
    },
    async queryPayment() {
      throw unverified("queryPayment");
    },
    async verifyAndNormalizeCallback() {
      throw unverified("verifyAndNormalizeCallback");
    },
    async webhookSuccessAck() {
      throw unverified("webhookSuccessAck");
    },
    async refund() {
      throw unverified("refund");
    },
    async reconcile() {
      throw unverified("reconcile");
    },
  });
}

export function createCnyPreviewSyntheticSecret(accountId) {
  return createHash("sha256")
    .update(`preview-cny-synthetic:${String(accountId || "")}`)
    .digest("hex");
}