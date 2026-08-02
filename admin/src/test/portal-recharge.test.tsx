import { createElement } from "react";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, test, vi } from "vitest";

import {
  PortalRechargeDialog,
  createPortalRechargeClient,
  usePortalRecharge,
  type PortalRechargeClient,
  type PortalRechargeModel,
  type PortalRechargeOffer,
  type PortalRechargeOrder,
} from "../features/user-portal/recharge";
import { createHttpUserPortalClient } from "../features/user-portal/user-portal-client";

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
  test("projects a server-selected currency and payment adapter without PayPal coupling", async () => {
    const alternativeOrder = {
      ...rechargeOrder("entry_ready"),
      currency: "CNY",
      adapterKey: "chaojipay_v1",
      paymentMethod: "alipay",
      providerOrderRef: "chaojipay_order_1",
      nextAction: {
        type: "redirect",
        url: "https://pay.example.com/checkout?token=safe",
        expiresAt: "2026-08-01T00:10:00.000Z",
      },
    };
    const fetchFn = vi.fn(async () => new Response(
      JSON.stringify({ recharge: { order: alternativeOrder } }),
      { status: 201, headers: { "Content-Type": "application/json" } },
    ));
    const client = createPortalRechargeClient({
      fetchFn,
      trustedActionOriginsByAdapter: {
        chaojipay_v1: ["https://pay.example.com"],
      },
    });

    await expect(client.createOrder({
      sessionRef: "session_recharge_1",
      offerRef: "coins_30",
      idempotencyKey: "create_alipay_1",
    })).resolves.toEqual(alternativeOrder);
  });

  test("passes additional provider trust through the real Portal HTTP client assembly", async () => {
    const alternativeOrder = {
      ...rechargeOrder("entry_ready"),
      currency: "CNY",
      adapterKey: "chaojipay_v1",
      paymentMethod: "alipay",
      providerOrderRef: "chaojipay_order_assembly_1",
      nextAction: {
        type: "redirect",
        url: "https://pay.example.com/checkout?token=assembly_safe",
        expiresAt: "2026-08-01T00:10:00.000Z",
      },
    };
    const fetchFn = vi.fn(async () => new Response(
      JSON.stringify({ recharge: { order: alternativeOrder } }),
      { status: 201, headers: { "Content-Type": "application/json" } },
    ));
    const client = createHttpUserPortalClient({
      fetchFn,
      rechargeTrustedActionOriginsByAdapter: {
        chaojipay_v1: ["https://pay.example.com"],
      },
    });

    await expect(client.recharge.createOrder({
      sessionRef: "session_recharge_1",
      offerRef: "coins_30",
      idempotencyKey: "create_assembly_1",
    })).resolves.toEqual(alternativeOrder);
  });

  test("projects server-authoritative CNY offers without assuming the sandbox currency", async () => {
    const cnyOffer = {
      ...OFFER,
      amountMinor: 950,
      currency: "CNY",
    };
    const fetchFn = vi.fn(async () => new Response(
      JSON.stringify({ offers: [cnyOffer] }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    ));
    const client = createPortalRechargeClient({ fetchFn });

    await expect(client.listOffers({
      sessionRef: "session_recharge_1",
    })).resolves.toEqual([cnyOffer]);
  });

  test("keeps historical orders readable when an unknown adapter has no payment handoff", async () => {
    const historicalOrder = {
      ...rechargeOrder("credited"),
      adapterKey: "future_provider_v1",
      paymentMethod: "wechat_pay",
      providerOrderRef: "future_provider_order_1",
      nextAction: null,
    };
    const fetchFn = vi.fn(async () => new Response(
      JSON.stringify({ recharges: [historicalOrder] }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    ));

    await expect(createPortalRechargeClient({ fetchFn }).listOrders({
      sessionRef: "session_recharge_1",
    })).resolves.toEqual([historicalOrder]);
  });

  test("rejects QR handoffs until the Portal has an actionable QR presentation", async () => {
    const order = {
      ...rechargeOrder("entry_ready"),
      adapterKey: "chaojipay_v1",
      paymentMethod: "alipay",
      nextAction: {
        type: "qr_code",
        url: "https://pay.example.com/qr?token=safe",
        expiresAt: "2026-08-01T00:10:00.000Z",
      },
    };
    const fetchFn = vi.fn(async () => new Response(
      JSON.stringify({ recharge: { order } }),
      { status: 201, headers: { "Content-Type": "application/json" } },
    ));
    const client = createPortalRechargeClient({
      fetchFn,
      trustedActionOriginsByAdapter: {
        chaojipay_v1: ["https://pay.example.com"],
      },
    });

    await expect(client.createOrder({
      sessionRef: "session_recharge_1",
      offerRef: "coins_30",
      idempotencyKey: "create_qr_1",
    })).rejects.toMatchObject({ code: "payment_recharge_request_failed" });
  });

  test("does not let additional trust roots replace a compiled provider trust root", () => {
    expect(() => createPortalRechargeClient({
      trustedActionOriginsByAdapter: {
        paypal_v1: ["https://pay.example.com"],
      },
    })).toThrow(expect.objectContaining({
      code: "payment_recharge_request_failed",
    }));
  });

  test.each([
    "https://[::1]",
    "https://[::ffff:7f00:1]",
    "https://pay.example.com.",
  ])("rejects unsafe configured action origin %s", (origin) => {
    expect(() => createPortalRechargeClient({
      trustedActionOriginsByAdapter: {
        chaojipay_v1: [origin],
      },
    })).toThrow(expect.objectContaining({
      code: "payment_recharge_request_failed",
    }));
  });

  test.each([
    ["untrusted origin", "paypal_v1", "https://pay.example.com/checkout"],
    ["HTTP", "paypal_v1", "http://www.sandbox.paypal.com/checkout"],
    ["userinfo", "paypal_v1", "https://user:pass@www.sandbox.paypal.com/checkout"],
    ["fragment", "paypal_v1", "https://www.sandbox.paypal.com/checkout#token"],
    ["loopback", "paypal_v1", "https://localhost/checkout"],
    ["unknown adapter", "future_provider_v1", "https://www.sandbox.paypal.com/checkout"],
  ])("rejects a %s payment handoff", async (_case, adapterKey, url) => {
    const order = {
      ...rechargeOrder("entry_ready"),
      adapterKey,
      nextAction: {
        type: "redirect",
        url,
        expiresAt: "2026-08-01T00:10:00.000Z",
      },
    };
    const fetchFn = vi.fn(async () => new Response(
      JSON.stringify({ recharge: { order } }),
      { status: 201, headers: { "Content-Type": "application/json" } },
    ));

    await expect(createPortalRechargeClient({ fetchFn }).createOrder({
      sessionRef: "session_recharge_1",
      offerRef: "coins_30",
      idempotencyKey: `create_${_case.replace(/\s+/gu, "_")}`,
    })).rejects.toMatchObject({ code: "payment_recharge_request_failed" });
  });

  test("rejects non-printable characters before URL normalization", async () => {
    const order = {
      ...rechargeOrder("entry_ready"),
      adapterKey: "chaojipay_v1",
      paymentMethod: "alipay",
      nextAction: {
        type: "redirect",
        url: "https://pay.example.com/check\nout",
        expiresAt: "2026-08-01T00:10:00.000Z",
      },
    };
    const fetchFn = vi.fn(async () => new Response(
      JSON.stringify({ recharge: { order } }),
      { status: 201, headers: { "Content-Type": "application/json" } },
    ));
    const client = createPortalRechargeClient({
      fetchFn,
      trustedActionOriginsByAdapter: {
        chaojipay_v1: ["https://pay.example.com"],
      },
    });

    await expect(client.createOrder({
      sessionRef: "session_recharge_1",
      offerRef: "coins_30",
      idempotencyKey: "create_control_character_1",
    })).rejects.toMatchObject({ code: "payment_recharge_request_failed" });
  });

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

function rechargeDialogModel(order: PortalRechargeOrder): PortalRechargeModel {
  return {
    available: true,
    dialogOpen: true,
    offers: [OFFER],
    activeOrder: order,
    busy: false,
    error: null,
    openDialog: vi.fn(),
    closeDialog: vi.fn(),
    createOrder: vi.fn(async () => undefined),
    captureOrder: vi.fn(async () => undefined),
    refreshOrder: vi.fn(async () => undefined),
  };
}

function rechargeOfferDialogModel(
  offer: PortalRechargeOffer,
): PortalRechargeModel {
  return {
    ...rechargeDialogModel(rechargeOrder("created")),
    offers: [offer],
    activeOrder: null,
  };
}

describe("Portal recharge interaction", () => {
  test("presents server pricing and payment entry without provider-specific copy", () => {
    const model = rechargeOfferDialogModel({
      ...OFFER,
      amountMinor: 950,
      currency: "CNY",
    });
    render(createElement(PortalRechargeDialog, { locale: "en", model }));

    const dialog = screen.getByRole("dialog", { name: "Recharge Coins" });
    expect(within(dialog).getByText("CNY 9.50")).toBeInTheDocument();
    expect(dialog).not.toHaveTextContent(/PayPal|Sandbox|USD/i);
    fireEvent.click(within(dialog).getByRole("button", {
      name: "Continue to payment",
    }));
    expect(model.createOrder).toHaveBeenCalledWith("coins_30");
  });

  test("uses provider-neutral lifecycle copy for an entry-ready order", () => {
    render(createElement(PortalRechargeDialog, {
      locale: "en",
      model: rechargeDialogModel({
        ...rechargeOrder("entry_ready"),
        amountMinor: 950,
        currency: "CNY",
        adapterKey: "chaojipay_v1",
        paymentMethod: "alipay",
      }),
    }));

    const dialog = screen.getByRole("dialog", { name: "Recharge Coins" });
    expect(within(dialog).getByRole("status", {
      name: "Waiting for payment",
    })).toBeInTheDocument();
    expect(within(dialog).getByText("CNY 9.50")).toBeInTheDocument();
    expect(dialog).not.toHaveTextContent(/PayPal|Sandbox|USD|chaojipay_v1/i);
  });

  test("pending recharge is automatic and does not expose confirm or refresh actions", () => {
    render(createElement(PortalRechargeDialog, {
      locale: "en",
      model: rechargeDialogModel(rechargeOrder("pending")),
    }));

    const dialog = screen.getByRole("dialog", { name: "Recharge Coins" });
    const status = within(dialog).getByRole("status", {
      name: "Payment confirmation pending",
    });
    expect(status).toHaveAttribute("aria-live", "polite");
    expect(status).toHaveAttribute("aria-busy", "true");
    expect(within(status).getByText(
      "The payment provider is processing this payment. Do not pay again.",
    )).toBeInTheDocument();
    expect(within(status).getByText(
      "We are confirming automatically. Usually about 10 seconds, at most 2 minutes.",
    )).toBeInTheDocument();
    expect(within(dialog).queryByRole("button", {
      name: "Confirm PayPal payment",
    })).toBeNull();
    expect(within(dialog).queryByRole("button", {
      name: "Refresh order",
    })).toBeNull();
    expect(dialog).not.toHaveTextContent("PayPal Sandbox");
  });

  test("pending recharge keeps the Chinese status copy aligned with the payment state", () => {
    render(createElement(PortalRechargeDialog, {
      locale: "zh",
      model: rechargeDialogModel(rechargeOrder("pending")),
    }));

    const dialog = screen.getByRole("dialog", { name: "充值 Coins" });
    const status = within(dialog).getByRole("status", { name: "支付确认中" });
    expect(within(status).getByText("支付方正在处理，请勿重复支付")).toBeInTheDocument();
    expect(within(status).getByText("系统正在自动确认，通常约 10 秒完成，最长约 2 分钟")).toBeInTheDocument();
    expect(within(dialog).queryByRole("button", { name: "确认 PayPal 支付" })).toBeNull();
    expect(within(dialog).queryByRole("button", { name: "刷新订单" })).toBeNull();
  });

  test("opens the provider handoff from a server offer without manual settlement actions", async () => {
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

    fireEvent.click(screen.getByRole("button", { name: "Continue to payment" }));
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

    expect(screen.queryByRole("button", { name: "Confirm PayPal payment" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Refresh order" })).toBeNull();
    expect(refreshWallet).not.toHaveBeenCalled();
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
