import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import type { PortalRechargeOrder } from "../features/user-portal/recharge/portal-recharge-client";
import {
  canContinuePortalRechargeOrder,
  handoffPortalRechargeOrderToPayment,
} from "../features/user-portal/recharge/portal-recharge-payment-handoff";
import { readPortalRechargeReturn } from "../features/user-portal/recharge/portal-recharge-return";

const NOW = Date.parse("2026-09-05T12:00:00.000Z");

function readyOrder(orderOffset = 60_000, actionOffset = 60_000): PortalRechargeOrder {
  return {
    orderRef: "synthetic_recharge_1",
    offerRef: "synthetic_offer_30",
    quoteVersion: 1,
    expectedPaidCoinUnits: 30,
    amountMinor: 100,
    currency: "USD",
    currencyExponent: 2,
    adapterKey: "paypal_v1",
    paymentMethod: "paypal",
    status: "entry_ready",
    providerOrderRef: "synthetic_provider_1",
    nextAction: {
      type: "redirect",
      url: "https://www.sandbox.paypal.com/synthetic-no-network",
      expiresAt: new Date(NOW + actionOffset).toISOString(),
    },
    walletOperationRef: null,
    walletLotRef: null,
    expiresAt: new Date(NOW + orderOffset).toISOString(),
    createdAt: new Date(NOW - 60_000).toISOString(),
    updatedAt: new Date(NOW - 60_000).toISOString(),
  };
}

beforeEach(() => {
  vi.spyOn(Date, "now").mockReturnValue(NOW);
  window.sessionStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
  window.sessionStorage.clear();
});

describe("Portal recharge payment handoff", () => {
  test("hands off only a ready order with two future deadlines", () => {
    const order = readyOrder(1, 1);
    const redirect = vi.fn();

    expect(canContinuePortalRechargeOrder(order)).toBe(true);
    expect(handoffPortalRechargeOrderToPayment(order, redirect)).toBe("redirected");
    expect(redirect).toHaveBeenCalledExactlyOnceWith(order.nextAction?.url);
    expect(readPortalRechargeReturn()).toMatchObject({ orderRef: order.orderRef });
  });

  test.each([
    [-1, 1], [0, 1], [1, -1], [1, 0], [-1, -1], [0, 0],
  ])("rejects expired deadlines order=%i action=%i before staging", (orderOffset, actionOffset) => {
    const order = readyOrder(orderOffset, actionOffset);
    const redirect = vi.fn();
    const stage = vi.spyOn(Storage.prototype, "setItem");

    expect(canContinuePortalRechargeOrder(order)).toBe(false);
    expect(handoffPortalRechargeOrderToPayment(order, redirect)).toBe("expired");
    expect(stage).not.toHaveBeenCalled();
    expect(redirect).not.toHaveBeenCalled();
  });

  test("rechecks time at handoff after the order was previously eligible", () => {
    const order = readyOrder(1, 1);
    expect(canContinuePortalRechargeOrder(order)).toBe(true);
    vi.mocked(Date.now).mockReturnValue(NOW + 1);
    const redirect = vi.fn();

    expect(handoffPortalRechargeOrderToPayment(order, redirect)).toBe("expired");
    expect(redirect).not.toHaveBeenCalled();
    expect(readPortalRechargeReturn()).toBeNull();
  });

  test.each([
    "created", "pending", "payment_verified", "credited", "failed_no_charge",
    "reconciliation_required", "expired",
  ] as const)("never resumes a %s order even with future timestamps", (status) => {
    const order = { ...readyOrder(), status };
    const redirect = vi.fn();

    expect(canContinuePortalRechargeOrder(order)).toBe(false);
    expect(handoffPortalRechargeOrderToPayment(order, redirect)).toBe("not_applicable");
    expect(redirect).not.toHaveBeenCalled();
    expect(readPortalRechargeReturn()).toBeNull();
  });

  test("does not invent an action for a ready order without one", () => {
    const order = { ...readyOrder(), nextAction: null };
    const redirect = vi.fn();

    expect(canContinuePortalRechargeOrder(order)).toBe(false);
    expect(handoffPortalRechargeOrderToPayment(order, redirect)).toBe("not_applicable");
    expect(redirect).not.toHaveBeenCalled();
  });

  test.each(["order", "action"] as const)("fails closed for an invalid %s timestamp", (field) => {
    const order = readyOrder();
    if (field === "order") order.expiresAt = "invalid";
    else order.nextAction!.expiresAt = "invalid";
    const redirect = vi.fn();

    expect(canContinuePortalRechargeOrder(order)).toBe(false);
    expect(handoffPortalRechargeOrderToPayment(order, redirect)).toBe("blocked");
    expect(redirect).not.toHaveBeenCalled();
    expect(readPortalRechargeReturn()).toBeNull();
  });

  test("retains the storage failure boundary before navigation", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("synthetic storage unavailable");
    });
    const redirect = vi.fn();

    expect(handoffPortalRechargeOrderToPayment(readyOrder(), redirect)).toBe("blocked");
    expect(redirect).not.toHaveBeenCalled();
  });

  test("reports a synchronous navigation failure as a controlled blocked result", () => {
    const redirect = vi.fn(() => { throw new DOMException("Synthetic navigation rejection", "SecurityError"); });

    expect(handoffPortalRechargeOrderToPayment(readyOrder(), redirect)).toBe("blocked");
    expect(redirect).toHaveBeenCalledTimes(1);
  });
});
