import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, test, vi } from "vitest";

import {
  createPortalRechargeClient,
  PortalRechargeDialog,
  usePortalRecharge,
  type PortalRechargeClient,
  type PortalRechargeModel,
  type PortalRechargeOffer,
  type PortalRechargeOrder,
} from "../features/user-portal/recharge";

const OFFER: PortalRechargeOffer = {
  offerRef: "recovery_coins_50",
  quoteVersion: 1,
  paidCoinUnits: 50,
  amountMinor: 5000,
  currency: "CNY",
  currencyExponent: 2,
  paymentMethods: ["alipay"],
};
const OTHER_OFFER: PortalRechargeOffer = {
  ...OFFER,
  offerRef: "recovery_coins_30",
  paidCoinUnits: 30,
  amountMinor: 3000,
};
const CHECKOUT_ORIGIN = "https://checkout.example.test";

function orderFor(ordinal: number, offerRef = OFFER.offerRef): PortalRechargeOrder {
  return {
    orderRef: `recovery_order_${ordinal}`,
    offerRef,
    quoteVersion: 1,
    expectedPaidCoinUnits: 50,
    amountMinor: 5000,
    currency: "CNY",
    currencyExponent: 2,
    adapterKey: "xsd_v1",
    paymentMethod: "alipay",
    status: "entry_ready",
    providerOrderRef: `synthetic_provider_${ordinal}`,
    nextAction: {
      type: "redirect",
      url: `${CHECKOUT_ORIGIN}/pay/synthetic_${ordinal}`,
      expiresAt: "2030-01-01T00:00:00.000Z",
    },
    walletOperationRef: null,
    walletLotRef: null,
    expiresAt: "2030-01-01T00:00:00.000Z",
    createdAt: "2026-09-05T00:00:00.000Z",
    updatedAt: "2026-09-05T00:00:00.000Z",
  };
}

function json(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((accept, fail) => { resolve = accept; reject = fail; });
  return { promise, resolve, reject };
}

type CreateAttempt = {
  sessionRef: string;
  offerRef: string;
  idempotencyKey: string;
};

// A synthetic durable server boundary behind the real HTTP client. It records
// a committed order before optionally losing/corrupting its HTTP response.
// No provider, browser navigation, live account or real payment is involved.
function fixture(
  createResponse?: (order: PortalRechargeOrder, attempt: number) => Promise<Response>,
) {
  const attempts: CreateAttempt[] = [];
  const signals: (AbortSignal | null | undefined)[] = [];
  const durable = new Map<string, PortalRechargeOrder>();
  const fetchFn = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const pathname = new URL(String(input), "https://portal.example.test").pathname;
    if (pathname.endsWith("/offers") && init?.method === "GET") {
      return json({ offers: [OFFER, OTHER_OFFER] });
    }
    if (pathname.endsWith("/orders") && init?.method === "GET") {
      return json({ recharges: [...durable.values()] });
    }
    if (pathname.endsWith("/orders") && init?.method === "POST") {
      const body = JSON.parse(String(init.body)) as Pick<CreateAttempt, "offerRef" | "idempotencyKey">;
      const sessionRef = new Headers(init.headers).get("X-Portal-Session") ?? "";
      const attempt = { ...body, sessionRef };
      attempts.push(attempt);
      signals.push(init.signal);
      const key = `${sessionRef}:${body.idempotencyKey}`;
      let order = durable.get(key);
      if (!order) {
        order = orderFor(durable.size + 1, body.offerRef);
        durable.set(key, order);
      }
      return createResponse
        ? createResponse(order, attempts.length)
        : json({ recharge: { order } }, 201);
    }
    throw new Error(`Unexpected synthetic route: ${init?.method} ${pathname}`);
  });
  const client = createPortalRechargeClient({
    fetchFn,
    trustedActionOriginsByAdapter: { xsd_v1: [CHECKOUT_ORIGIN] },
  });
  return { client, fetchFn, attempts, durable, signals };
}

function Harness({
  client,
  paymentRedirect,
  publishModel,
  enabled = true,
  sessionRef = "synthetic_recovery_session",
  sessionGeneration = 1,
}: {
  client: PortalRechargeClient;
  paymentRedirect: (url: string) => void;
  publishModel: (model: PortalRechargeModel) => void;
  enabled?: boolean;
  sessionRef?: string;
  sessionGeneration?: number;
}) {
  const model = usePortalRecharge({
    client,
    enabled,
    sessionRef,
    sessionGeneration,
    onSessionInvalid: () => undefined,
    onWalletMutation: () => undefined,
    paymentRedirect,
  });
  publishModel(model);
  return (
    <>
      <button type="button" onClick={model.openDialog}>Open recharge</button>
      {model.dialogOpen ? <PortalRechargeDialog locale="en" model={model} /> : null}
    </>
  );
}

async function mount(client: PortalRechargeClient) {
  const paymentRedirect = vi.fn();
  let current!: PortalRechargeModel;
  let props = {
    client,
    paymentRedirect,
    publishModel: (model: PortalRechargeModel) => { current = model; },
    enabled: true,
    sessionRef: "synthetic_recovery_session",
    sessionGeneration: 1,
  };
  const view = render(<Harness {...props} />);
  await act(async () => undefined);
  expect(current.offersState.status).toBe("ready");
  fireEvent.click(screen.getByRole("button", { name: "Open recharge" }));
  expect(screen.getByRole("dialog", { name: "Recharge Coins" })).toBeInTheDocument();
  return {
    model: () => current,
    paymentRedirect,
    async rerender(changes: Partial<Pick<typeof props, "client" | "enabled" | "sessionRef" | "sessionGeneration">>) {
      props = { ...props, ...changes };
      view.rerender(<Harness {...props} />);
      await act(async () => undefined);
    },
  };
}

afterEach(() => {
  cleanup();
  window.sessionStorage.clear();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("Portal recharge interaction recovery through the real HTTP client", () => {
  test.each(["session", "client", "generation"] as const)(
    "an old identity create callback cannot send a request after a %s change",
    async (change) => {
      const server = fixture();
      const ui = await mount(server.client);
      const oldCreate = ui.model().createOrder;
      const replacementClient = createPortalRechargeClient({
        fetchFn: server.fetchFn,
        trustedActionOriginsByAdapter: { xsd_v1: [CHECKOUT_ORIGIN] },
      });
      await ui.rerender(change === "session"
        ? { sessionRef: "synthetic_recovery_session_b" }
        : change === "client" ? { client: replacementClient } : { sessionGeneration: 2 });
      await act(async () => { await oldCreate(OFFER.offerRef); });
      expect(server.attempts).toHaveLength(0);
      expect(ui.model().activeOrder).toBeNull();
      expect(ui.model().error).toBeNull();
      expect(ui.paymentRedirect).not.toHaveBeenCalled();
    },
  );

  test("an explicit continue can reopen the same order after its automatic first handoff", async () => {
    const server = fixture();
    const ui = await mount(server.client);
    await act(async () => { await ui.model().createOrder(OFFER.offerRef); });
    const order = ui.model().activeOrder;
    expect(order).not.toBeNull();
    expect(ui.paymentRedirect).toHaveBeenCalledTimes(1);
    act(() => { ui.model().continueOrderPayment(order!); });
    expect(ui.paymentRedirect).toHaveBeenCalledTimes(2);
    expect(ui.paymentRedirect.mock.calls.map(([url]) => url)).toEqual([
      order!.nextAction!.url,
      order!.nextAction!.url,
    ]);
    expect(server.attempts).toHaveLength(1);
    expect(server.durable.size).toBe(1);
    expect(server.fetchFn.mock.calls.some(([url]) => String(url).endsWith("/capture"))).toBe(false);
  });

  test.each(["transport_reject", "invalid_projection"] as const)(
    "retries the same unresolved create intent with its original key after %s",
    async (failure) => {
      const server = fixture(async (order, attempt) => {
        if (attempt === 1) {
          if (failure === "transport_reject") throw new TypeError("Synthetic lost response");
          return json({ recharge: { order: { invalid: true } } }, 201);
        }
        return json({ recharge: { order } }, 201);
      });
      const ui = await mount(server.client);
      await act(async () => { await ui.model().createOrder(OFFER.offerRef); });
      expect(server.durable.size).toBe(1);
      expect(ui.paymentRedirect).not.toHaveBeenCalled();
      expect(ui.model().busy).toBe(false);
      await act(async () => { await ui.model().createOrder(OFFER.offerRef); });
      expect(server.attempts).toHaveLength(2);
      expect(server.attempts[1]).toEqual(server.attempts[0]);
      expect(server.durable.size).toBe(1);
      expect(ui.model().activeOrder?.orderRef).toBe("recovery_order_1");
      expect(ui.paymentRedirect).toHaveBeenCalledTimes(1);
    },
  );

  test("a hanging create unlocks at 30 seconds and a response arriving after close cannot navigate", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-05T00:00:00.000Z"));
    const pending = deferred<Response>();
    const server = fixture(() => pending.promise);
    const ui = await mount(server.client);
    act(() => { void ui.model().createOrder(OFFER.offerRef); });
    expect(ui.model().busy).toBe(true);
    expect(server.signals[0]).toBeInstanceOf(AbortSignal);
    expect(server.signals[0]?.aborted).toBe(false);
    expect(screen.getByRole("button", { name: "Close" })).toBeDisabled();
    await act(async () => { await vi.advanceTimersByTimeAsync(30_000); });
    expect(ui.model().busy).toBe(false);
    expect(ui.model().error).toBe("create_unknown");
    expect(server.signals[0]?.aborted).toBe(true);
    expect(screen.getByRole("button", { name: "Close" })).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(screen.queryByRole("dialog", { name: "Recharge Coins" })).toBeNull();
    await act(async () => {
      pending.resolve(json({ recharge: { order: orderFor(1) } }, 201));
    });
    expect(ui.paymentRedirect).not.toHaveBeenCalled();
    expect(ui.model().activeOrder).toBeNull();
    expect(server.attempts).toHaveLength(1);
  });

  test("two synchronous create requests for one intent issue only one POST", async () => {
    const server = fixture();
    const ui = await mount(server.client);
    await act(async () => {
      const current = ui.model();
      await Promise.all([
        current.createOrder(OFFER.offerRef),
        current.createOrder(OFFER.offerRef),
      ]);
    });
    expect(server.attempts).toHaveLength(1);
    expect(server.durable.size).toBe(1);
    expect(ui.paymentRedirect).toHaveBeenCalledTimes(1);
  });

  test("closing and reopening an unknown attempt keeps its original key and offers explicit recovery", async () => {
    const server = fixture(async (order, attempt) => {
      if (attempt === 1) throw new TypeError("Synthetic lost response");
      return json({ recharge: { order } }, 201);
    });
    const ui = await mount(server.client);
    await act(async () => { await ui.model().createOrder(OFFER.offerRef); });
    expect(ui.model().error).toBe("create_unknown");
    expect(screen.getByRole("alert")).toHaveTextContent("do not create another order or pay again");
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(screen.queryByRole("dialog", { name: "Recharge Coins" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Open recharge" }));
    expect(ui.model().unresolvedCreateOfferRef).toBe(OFFER.offerRef);
    expect(ui.model().error).toBe("create_unknown");
    expect(screen.queryByRole("list", { name: "Coins recharge denominations" })).toBeNull();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Check this recharge attempt" }));
    });
    expect(server.attempts).toHaveLength(2);
    expect(server.attempts[1]).toEqual(server.attempts[0]);
    expect(server.durable.size).toBe(1);
    expect(ui.paymentRedirect).toHaveBeenCalledTimes(1);
  });

  test.each(["view_toggle", "offers_refresh"] as const)(
    "an unresolved intent survives %s without associating an arbitrary recent order",
    async (change) => {
      const server = fixture(async (order, attempt) => {
        if (attempt === 1) throw new TypeError("Synthetic lost response");
        return json({ recharge: { order } }, 201);
      });
      const ui = await mount(server.client);
      await act(async () => { await ui.model().createOrder(OFFER.offerRef); });
      // The list now includes this committed order, but no exact create result
      // reached the browser. Recovery must retain its key, not pick the latest.
      expect(server.durable.size).toBe(1);
      if (change === "view_toggle") {
        await ui.rerender({ enabled: false });
        expect(ui.model().available).toBe(false);
        await ui.rerender({ enabled: true });
        fireEvent.click(screen.getByRole("button", { name: "Open recharge" }));
      } else {
        await act(async () => { ui.model().retryOffers(); });
      }
      expect(ui.model().error).toBe("create_unknown");
      expect(ui.model().activeOrder).toBeNull();
      expect(ui.model().unresolvedCreateOfferRef).toBe(OFFER.offerRef);
      expect(ui.paymentRedirect).not.toHaveBeenCalled();
      expect(server.attempts).toHaveLength(1);
      await act(async () => { await ui.model().retryCreateOrder?.(); });
      expect(server.attempts).toHaveLength(2);
      expect(server.attempts[1]).toEqual(server.attempts[0]);
      expect(server.durable.size).toBe(1);
    },
  );

  test("an unknown result prevents another offer in both the dialog and direct hook calls", async () => {
    const server = fixture(async () => { throw new TypeError("Synthetic lost response"); });
    const ui = await mount(server.client);
    expect(ui.model().offers).toHaveLength(2);
    await act(async () => { await ui.model().createOrder(OFFER.offerRef); });
    expect(screen.getByRole("button", { name: "Check this recharge attempt" })).toBeEnabled();
    expect(screen.queryAllByRole("button", { name: /^Create order and pay for/ })).toHaveLength(0);
    await act(async () => { await ui.model().createOrder(OTHER_OFFER.offerRef); });
    expect(server.attempts).toHaveLength(1);
    expect(ui.model().unresolvedCreateOfferRef).toBe(OFFER.offerRef);
    expect(ui.model().error).toBe("create_unknown");
    expect(ui.paymentRedirect).not.toHaveBeenCalled();
  });

  test("refreshing offers during a pending create retains its recovery card after abort", async () => {
    const pending = deferred<Response>();
    const server = fixture((_order, attempt) => attempt === 1
      ? pending.promise : Promise.resolve(json({ recharge: { order: orderFor(1) } }, 201)));
    const ui = await mount(server.client);
    act(() => { void ui.model().createOrder(OFFER.offerRef); });
    expect(ui.model().busy).toBe(true);
    await act(async () => { ui.model().retryOffers(); });
    expect(server.signals[0]?.aborted).toBe(true);
    expect(ui.model().busy).toBe(false);
    expect(ui.model().unresolvedCreateOfferRef).toBe(OFFER.offerRef);
    expect(ui.model().error).toBe("create_unknown");
    expect(screen.getByRole("button", { name: "Check this recharge attempt" })).toBeEnabled();
    expect(screen.queryByRole("list", { name: "Coins recharge denominations" })).toBeNull();
    await act(async () => { await ui.model().retryCreateOrder?.(); });
    expect(server.attempts).toHaveLength(2);
    expect(server.attempts[1]).toEqual(server.attempts[0]);
    expect(server.durable.size).toBe(1);
    expect(ui.paymentRedirect).toHaveBeenCalledTimes(1);
  });

  test.each(["session", "client", "generation"] as const)(
    "a %s change aborts and isolates an unresolved intent and ignores its late response",
    async (change) => {
      const pending = deferred<Response>();
      const server = fixture(async (order, attempt) => (
        attempt === 1 ? pending.promise : json({ recharge: { order } }, 201)
      ));
      const ui = await mount(server.client);
      act(() => { void ui.model().createOrder(OFFER.offerRef); });
      expect(server.attempts).toHaveLength(1);
      const replacementClient = createPortalRechargeClient({
        fetchFn: server.fetchFn,
        trustedActionOriginsByAdapter: { xsd_v1: [CHECKOUT_ORIGIN] },
      });
      await ui.rerender(change === "session"
        ? { sessionRef: "synthetic_recovery_session_b" }
        : change === "client" ? { client: replacementClient } : { sessionGeneration: 2 });
      expect(server.signals[0]?.aborted).toBe(true);
      expect(ui.model().busy).toBe(false);
      expect(ui.model().unresolvedCreateOfferRef).toBeNull();
      expect(ui.model().error).toBeNull();
      expect(ui.model().activeOrder).toBeNull();
      await act(async () => { await ui.model().createOrder(OFFER.offerRef); });
      expect(server.attempts).toHaveLength(2);
      expect(server.attempts[1].idempotencyKey).not.toBe(server.attempts[0].idempotencyKey);
      const newOrderRef = ui.model().activeOrder?.orderRef;
      expect(newOrderRef).toBe("recovery_order_2");
      await act(async () => { pending.resolve(json({ recharge: { order: orderFor(1) } }, 201)); });
      expect(ui.model().activeOrder?.orderRef).toBe(newOrderRef);
      expect(ui.model().busy).toBe(false);
      expect(ui.model().error).toBeNull();
      expect(ui.paymentRedirect).toHaveBeenCalledTimes(1);
    },
  );

  test.each(["session", "client", "generation"] as const)(
    "an old manual continue callback cannot act after a %s change",
    async (change) => {
      const server = fixture();
      const ui = await mount(server.client);
      const oldContinue = ui.model().continueOrderPayment;
      const replacementClient = createPortalRechargeClient({
        fetchFn: server.fetchFn,
        trustedActionOriginsByAdapter: { xsd_v1: [CHECKOUT_ORIGIN] },
      });
      await ui.rerender(change === "session"
        ? { sessionRef: "synthetic_recovery_session_b" }
        : change === "client" ? { client: replacementClient } : { sessionGeneration: 2 });
      let result: unknown;
      act(() => { result = oldContinue(orderFor(1)); });
      expect(result).toBe("blocked");
      expect(ui.paymentRedirect).not.toHaveBeenCalled();
      expect(server.attempts).toHaveLength(0);
      expect(window.sessionStorage.getItem("gccwebos-portal-recharge-return-v1")).toBeNull();
      expect(ui.model().error).toBeNull();
    },
  );

  test.each(["resolve", "reject"] as const)(
    "after A times out, its late %s cannot release the lock held by retry B",
    async (lateResult) => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-09-05T00:00:00.000Z"));
      const first = deferred<Response>();
      const second = deferred<Response>();
      const server = fixture((_order, attempt) => attempt === 1 ? first.promise : second.promise);
      const ui = await mount(server.client);
      act(() => { void ui.model().createOrder(OFFER.offerRef); });
      await act(async () => { await vi.advanceTimersByTimeAsync(30_000); });
      expect(ui.model().error).toBe("create_unknown");
      expect(server.signals[0]?.aborted).toBe(true);
      act(() => { void ui.model().retryCreateOrder?.(); });
      expect(server.attempts).toHaveLength(2);
      expect(server.attempts[1]).toEqual(server.attempts[0]);
      expect(ui.model().busy).toBe(true);
      await act(async () => {
        if (lateResult === "resolve") first.resolve(json({ recharge: { order: orderFor(1) } }, 201));
        else first.reject(new TypeError("Synthetic late response failure"));
      });
      expect(ui.model().busy).toBe(true);
      expect(ui.model().error).toBeNull();
      expect(ui.model().activeOrder).toBeNull();
      expect(server.signals[1]?.aborted).toBe(false);
      expect(ui.paymentRedirect).not.toHaveBeenCalled();
      await act(async () => { await ui.model().createOrder(OFFER.offerRef); });
      expect(server.attempts).toHaveLength(2);
      await act(async () => { second.resolve(json({ recharge: { order: orderFor(1) } }, 201)); });
      expect(ui.model().busy).toBe(false);
      expect(ui.model().error).toBeNull();
      expect(ui.model().unresolvedCreateOfferRef).toBeNull();
      expect(ui.paymentRedirect).toHaveBeenCalledTimes(1);
      expect(server.durable.size).toBe(1);
    },
  );
});
