import { createElement } from "react";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, test, vi } from "vitest";

import {
  PortalRechargeDialog,
  createPortalRechargeClient,
  usePortalRecharge,
  type PortalRechargeClient,
  type PortalRechargeOffer,
  type PortalRechargeOrder,
} from "../features/user-portal/recharge";

const OFFER: PortalRechargeOffer = {
  offerRef: "coins_30",
  quoteVersion: 1,
  paidCoinUnits: 30,
  amountMinor: 100,
  currency: "USD",
  currencyExponent: 2,
};

function rechargeOrder(status: PortalRechargeOrder["status"]): PortalRechargeOrder {
  return {
    orderRef: "payment_order_1",
    offerRef: OFFER.offerRef,
    quoteVersion: 1,
    expectedPaidCoinUnits: 30,
    amountMinor: 100,
    currency: "USD",
    currencyExponent: 2,
    adapterKey: "paypal_v1",
    paymentMethod: "paypal",
    status,
    providerOrderRef: "paypal_order_1",
    nextAction: status === "entry_ready" ? {
      type: "redirect",
      url: "https://www.sandbox.paypal.com/checkoutnow?token=safe",
      expiresAt: "2026-08-01T00:10:00.000Z",
    } : null,
    walletOperationRef: status === "credited" ? "wallet_operation_1" : null,
    walletLotRef: status === "credited" ? "wallet_lot_1" : null,
    expiresAt: "2026-08-01T00:10:00.000Z",
    createdAt: "2026-08-01T00:00:00.000Z",
    updatedAt: "2026-08-01T00:00:00.000Z",
  };
}

afterEach(() => {
  cleanup();
  window.sessionStorage.clear();
});

describe("Portal recharge client", () => {
  test("submits only the server offer identity and client idempotency key", async () => {
    const fetchFn = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => new Response(
      JSON.stringify({ recharge: { order: rechargeOrder("entry_ready") } }),
      { status: 201, headers: { "Content-Type": "application/json" } },
    ));
    const client = createPortalRechargeClient({ fetchFn });
    await client.createOrder({
      sessionRef: "session_recharge_1",
      offerRef: "coins_30",
      idempotencyKey: "create_1",
    });
    expect(JSON.parse(String(fetchFn.mock.calls[0][1]?.body))).toEqual({
      offerRef: "coins_30",
      idempotencyKey: "create_1",
    });
    expect(fetchFn.mock.calls[0][1]?.headers).toEqual(expect.objectContaining({
      "X-Portal-Session": "session_recharge_1",
    }));
  });
});

function RechargeHarness({
  client,
  paymentRedirect,
  refreshWallet,
}: {
  client: PortalRechargeClient;
  paymentRedirect: (url: string) => void;
  refreshWallet: () => void;
}) {
  const model = usePortalRecharge({
    client,
    enabled: true,
    sessionRef: "session_recharge_1",
    sessionGeneration: 1,
    onSessionInvalid: () => undefined,
    onWalletMutation: refreshWallet,
    paymentRedirect,
  });
  return (
    <>
      <button type="button" disabled={!model.available} onClick={model.openDialog}>
        Recharge Coins
      </button>
      {model.dialogOpen ? <PortalRechargeDialog locale="en" model={model} /> : null}
    </>
  );
}

describe("Portal recharge interaction", () => {
  test("opens PayPal from a server offer and refreshes Wallet only after credit", async () => {
    const paymentRedirect = vi.fn();
    const refreshWallet = vi.fn();
    const client: PortalRechargeClient = {
      listOffers: vi.fn(async () => [OFFER]),
      listOrders: vi.fn(async () => []),
      createOrder: vi.fn(async () => rechargeOrder("entry_ready")),
      getOrder: vi.fn(async () => rechargeOrder("entry_ready")),
      captureOrder: vi.fn(async () => rechargeOrder("credited")),
    };
    render(createElement(RechargeHarness, { client, paymentRedirect, refreshWallet }));

    const open = await screen.findByRole("button", { name: "Recharge Coins" });
    await waitFor(() => expect(open).toBeEnabled());
    fireEvent.click(open);
    expect(await screen.findByRole("dialog", { name: "Recharge Coins" })).toBeInTheDocument();
    expect(screen.getByText("30 Coins")).toBeInTheDocument();
    expect(screen.getByText("USD 1.00")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Use PayPal Sandbox" }));
    await waitFor(() => expect(client.createOrder).toHaveBeenCalledWith({
      sessionRef: "session_recharge_1",
      offerRef: "coins_30",
      idempotencyKey: expect.any(String),
    }));
    expect(paymentRedirect).toHaveBeenCalledWith(
      "https://www.sandbox.paypal.com/checkoutnow?token=safe",
    );
    expect(JSON.parse(String(window.sessionStorage.getItem(
      "gccwebos-portal-recharge-return-v1",
    )))).toEqual({
      version: 1,
      orderRef: "payment_order_1",
      captureIdempotencyKey: expect.stringMatching(/^portal_capture_/),
    });
    expect(refreshWallet).not.toHaveBeenCalled();

    fireEvent.click(await screen.findByRole("button", { name: "Confirm PayPal payment" }));
    await waitFor(() => expect(client.captureOrder).toHaveBeenCalledWith({
      sessionRef: "session_recharge_1",
      orderRef: "payment_order_1",
      idempotencyKey: expect.any(String),
    }));
    expect(await screen.findByText("30 paid Coins are available.")).toBeInTheDocument();
    expect(refreshWallet).toHaveBeenCalledTimes(1);
  });

  test("resumes the exact returned order and captures it once with the staged idempotency key", async () => {
    window.sessionStorage.setItem(
      "gccwebos-portal-recharge-return-v1",
      JSON.stringify({
        version: 1,
        orderRef: "payment_order_1",
        captureIdempotencyKey: "portal_capture_return_1",
      }),
    );
    const client: PortalRechargeClient = {
      listOffers: vi.fn(async () => [OFFER]),
      listOrders: vi.fn(async () => [rechargeOrder("entry_ready")]),
      createOrder: vi.fn(async () => rechargeOrder("entry_ready")),
      getOrder: vi.fn(async () => rechargeOrder("entry_ready")),
      captureOrder: vi.fn(async () => rechargeOrder("pending")),
    };
    const refreshWallet = vi.fn();

    render(createElement(RechargeHarness, {
      client,
      paymentRedirect: vi.fn(),
      refreshWallet,
    }));

    expect(await screen.findByRole("dialog", { name: "Recharge Coins" }))
      .toBeInTheDocument();
    await waitFor(() => expect(client.captureOrder).toHaveBeenCalledWith({
      sessionRef: "session_recharge_1",
      orderRef: "payment_order_1",
      idempotencyKey: "portal_capture_return_1",
    }));
    expect(client.captureOrder).toHaveBeenCalledTimes(1);
    expect(await screen.findByText("Payment confirmation pending")).toBeInTheDocument();
    expect(refreshWallet).not.toHaveBeenCalled();
  });

  test("polls a returned pending order until the durable credited receipt is visible", async () => {
    vi.useFakeTimers();
    try {
      window.sessionStorage.setItem(
        "gccwebos-portal-recharge-return-v1",
        JSON.stringify({
          version: 1,
          orderRef: "payment_order_1",
          captureIdempotencyKey: "portal_capture_return_1",
        }),
      );
      const client: PortalRechargeClient = {
        listOffers: vi.fn(async () => [OFFER]),
        listOrders: vi.fn(async () => [rechargeOrder("pending")]),
        createOrder: vi.fn(async () => rechargeOrder("entry_ready")),
        getOrder: vi.fn(async () => rechargeOrder("credited")),
        captureOrder: vi.fn(async () => rechargeOrder("pending")),
      };
      const refreshWallet = vi.fn();

      render(createElement(RechargeHarness, {
        client,
        paymentRedirect: vi.fn(),
        refreshWallet,
      }));

      await act(async () => { await Promise.resolve(); });
      expect(screen.getByRole("dialog", { name: "Recharge Coins" }))
        .toBeInTheDocument();
      expect(screen.getByText("Payment confirmation pending")).toBeInTheDocument();

      await act(async () => { await vi.advanceTimersByTimeAsync(2_000); });

      expect(client.getOrder).toHaveBeenCalledWith({
        sessionRef: "session_recharge_1",
        orderRef: "payment_order_1",
      });
      expect(client.captureOrder).not.toHaveBeenCalled();
      expect(screen.getByText("30 paid Coins are available.")).toBeInTheDocument();
      expect(refreshWallet).toHaveBeenCalledTimes(1);
      expect(window.sessionStorage.getItem(
        "gccwebos-portal-recharge-return-v1",
      )).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });
});
