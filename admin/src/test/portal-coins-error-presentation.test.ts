import { describe, expect, test } from "vitest";
import type {
  PortalCoinCommerceClientErrorCode,
  PortalCoinFulfillmentSafeCode
} from "../features/user-portal/commerce/api-contract";
import type { PortalCoinOrderUiState } from "../features/user-portal/commerce/use-coins-purchase-flow";
import {
  portalCoinCommerceErrorText,
  portalCoinFulfillmentFailureText,
  portalCoinOrderStatusText
} from "../features/user-portal/commerce/commerce-error-presentation";

const knownErrors: Record<PortalCoinCommerceClientErrorCode, boolean> = {
  cancel_window_closed: false,
  capture_in_progress: true,
  commerce_not_found: false,
  commerce_rate_limited: true,
  commerce_request_failed: true,
  commerce_request_invalid: false,
  commerce_session_invalid: false,
  commerce_unavailable: true,
  deferred_transition_conflict: false,
  idempotency_key_required: false,
  idempotency_key_reused: false,
  insufficient_coins: false,
  offer_unavailable: false,
  quote_expired: false,
  quote_stale: false,
  reconciliation_required: false,
  wallet_first_deferred_required: false,
  wallet_not_active: false
};

describe("Coins consumer presentation whitelist", () => {
  test.each(Object.entries(knownErrors))("maps %s in both languages without raw codes or a false retry guarantee", (value, retryable) => {
    const code = value as PortalCoinCommerceClientErrorCode;
    for (const locale of ["zh", "en"] as const) {
      const message = portalCoinCommerceErrorText(code, locale);
      expect(message).toBeTruthy();
      expect(message).not.toContain(code);
      expect(message).not.toMatch(/安全重试|Retry safely|未扣款|not charged|no charge|后端|幂等|idempotency/i);
      if (!retryable) expect(message).not.toMatch(/重试|try again|retry/i);
    }
  });

  test.each(["untrusted-message", "__proto__", "constructor", "toString"])(
    "unknown or prototype code %s uses only fixed safe fallback copy",
    (value) => {
      for (const locale of ["zh", "en"] as const) {
        const message = portalCoinCommerceErrorText(value as PortalCoinCommerceClientErrorCode, locale);
        expect(message).toBe(portalCoinCommerceErrorText("commerce_request_failed", locale));
        expect(message).not.toContain(value);
        expect(portalCoinFulfillmentFailureText(value as PortalCoinFulfillmentSafeCode, locale))
          .toBe(portalCoinFulfillmentFailureText("fulfillment_result_invalid", locale));
        expect(portalCoinOrderStatusText(value as PortalCoinOrderUiState, locale, "subscription_plan"))
          .toBe(portalCoinOrderStatusText("reconciliation_required", locale, "subscription_plan"));
      }
    }
  );

  test.each([
    ["zh", "subscription_plan", "正在开通服务", "购买完成，服务已开通", "本次服务开通结果尚未确认，请联系支持"],
    ["en", "subscription_plan", "Activating your service", "Purchase complete. Your service is active.", "This service activation has not been confirmed. Contact support."],
    ["zh", "data_pack", "正在发放流量", "购买完成，流量已到账", "本次流量到账结果尚未确认，请联系支持"],
    ["en", "data_pack", "Adding your data allowance", "Purchase complete. Your data allowance has been added.", "This data allowance has not been confirmed. Contact support."]
  ] as const)("distinguishes pending, complete, and failed %s %s", (locale, kind, pending, complete, failed) => {
    expect(portalCoinOrderStatusText("delivering", locale, kind)).toBe(pending);
    expect(portalCoinOrderStatusText("succeeded", locale, kind)).toBe(complete);
    expect(portalCoinOrderStatusText("delivery_failed", locale, kind)).toBe(failed);
    for (const state of ["reserved", "settling", "cancelled", "capture_failed", "reconciliation_required"] as const) {
      expect(portalCoinOrderStatusText(state, locale, kind)).not.toMatch(/购买完成|购买成功|Purchase complete/);
    }
  });

  test.each([
    "fulfillment_attempt_limit",
    "fulfillment_handler_failed",
    "fulfillment_handler_unavailable",
    "fulfillment_result_invalid"
  ] as const)("does not infer absent side effects from %s", (code) => {
    for (const locale of ["zh", "en"] as const) {
      expect(portalCoinFulfillmentFailureText(code, locale))
        .not.toMatch(/尚未发放|无法发放|未到账|未开通|has not been fulfilled|cannot be fulfilled|has not been activated|has not been added/);
    }
  });
});
