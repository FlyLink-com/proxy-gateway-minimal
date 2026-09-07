import { afterEach, expect, test, vi } from "vitest";
import { broadcastPortalSessionChange, subscribePortalSessionChange, createPortalBrowserFetch, readPortalLocation, writePortalLocation, withPortalAuthLock, readCookieSession } from "../features/user-portal/portal-browser-session";
import { createHttpUserPortalClient } from "../features/user-portal/user-portal-client";

const context = `portalctx_${"a".repeat(64)}`;
const session = { sessionRef: context, transport: "cookie", expiresAt: "2026-09-07T00:30:00.000Z", userRef: "account_test", displayName: "Test", authMethod: "password", issuedAt: "2026-09-07T00:00:00.000Z" };
afterEach(() => { window.history.replaceState(null, "", "/"); vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers(); });

test("same-page channel objects deliver messages but own session broadcasts must not invalidate their sender page", async () => {
  const channels = new Set<Channel>();
  class Channel {
    onmessage: ((event: MessageEvent) => void) | null = null;
    constructor(readonly name: string) { channels.add(this); }
    close() { channels.delete(this); }
    postMessage(data: unknown) {
      for (const recipient of channels) {
        if (recipient === this || recipient.name !== this.name) continue;
        queueMicrotask(() => { if (channels.has(recipient)) recipient.onmessage?.(new MessageEvent("message", { data })); });
      }
    }
  }
  vi.stubGlobal("BroadcastChannel", Channel);
  const invalidate = vi.fn();
  const unsubscribe = subscribePortalSessionChange(invalidate);
  const otherPage = new Channel("gccwebos-portal-session-changed-v1");
  const received = vi.fn(); otherPage.onmessage = received;
  try {
    broadcastPortalSessionChange();
    await Promise.resolve();
    expect(invalidate).not.toHaveBeenCalled();
    expect(received).toHaveBeenCalledTimes(1);
    expect(received.mock.calls[0][0].data).toEqual({ type: "session-changed" });
    otherPage.postMessage({ type: "session-changed" });
    await Promise.resolve();
    expect(invalidate).toHaveBeenCalledTimes(1);
  } finally { unsubscribe(); otherPage.close(); }
  expect(channels.size).toBe(0);
});

test("auth writes use a browser lock when supported and keep the operation result", async () => {
  const operation = vi.fn(async () => "completed");
  const request = vi.fn(async (_name: string, _options: LockOptions, task: () => Promise<string>) => task());
  const original = Object.getOwnPropertyDescriptor(navigator, "locks");
  Object.defineProperty(navigator, "locks", { configurable: true, value: { request } });
  try {
    await expect(withPortalAuthLock(operation)).resolves.toBe("completed");
    expect(request).toHaveBeenCalledWith("gccwebos-portal-auth-write-v1", { signal: expect.any(AbortSignal) }, expect.any(Function));
    expect(operation).toHaveBeenCalledTimes(1);
  } finally { if (original) Object.defineProperty(navigator, "locks", original); else Reflect.deleteProperty(navigator, "locks"); }
});

test("waiting for an occupied auth lock is abortable and never starts an auth write", async () => {
  vi.useFakeTimers();
  const operation = vi.fn(async () => "must not run");
  const request = vi.fn((_name: string, options: LockOptions) => new Promise((_resolve, reject) => {
    options.signal?.addEventListener("abort", () => reject(options.signal?.reason), { once: true });
  }));
  const original = Object.getOwnPropertyDescriptor(navigator, "locks");
  Object.defineProperty(navigator, "locks", { configurable: true, value: { request } });
  try {
    const rejected = expect(withPortalAuthLock(operation)).rejects.toThrow(/timed out/);
    await vi.advanceTimersByTimeAsync(30_001);
    await rejected;
    expect(operation).not.toHaveBeenCalled();
    expect(request.mock.calls[0][1].signal?.aborted).toBe(true);
  } finally { if (original) Object.defineProperty(navigator, "locks", original); else Reflect.deleteProperty(navigator, "locks"); }
});

test.each(["headers", "body"] as const)("a lost logout %s response aborts once and releases the acquired auth lock", async (phase) => {
  vi.useFakeTimers();
  let held = false;
  const request = vi.fn(async (_name: string, _options: LockOptions, task: () => Promise<unknown>) => {
    expect(held).toBe(false); held = true;
    try { return await task(); } finally { held = false; }
  });
  const original = Object.getOwnPropertyDescriptor(navigator, "locks");
  Object.defineProperty(navigator, "locks", { configurable: true, value: { request } });
  try {
    const raw = vi.fn<typeof fetch>(async () => phase === "headers"
      ? new Promise<Response>(() => {})
      : { ok: true, json: () => new Promise(() => {}) } as unknown as Response);
    const client = createHttpUserPortalClient({ fetchFn: raw });
    const rejected = expect(client.logout!({ sessionRef: context })).rejects.toThrow(/timed out/);
    await vi.advanceTimersByTimeAsync(30_001);
    await rejected;
    expect(held).toBe(false);
    expect(raw).toHaveBeenCalledTimes(1);
    expect(raw.mock.calls[0][1]?.signal?.aborted).toBe(true);
    await expect(withPortalAuthLock(async () => "next explicit action")).resolves.toBe("next explicit action");
  } finally { if (original) Object.defineProperty(navigator, "locks", original); else Reflect.deleteProperty(navigator, "locks"); }
});

test("public projection rejects embedded credential fields and malformed contexts", () => {
  expect(() => readCookieSession({ ...session, cookieValue: "must_not_return" })).toThrow();
  expect(() => readCookieSession({ ...session, internalId: "must_not_return" })).toThrow();
});

test("cookie transport binds each request context without leaking credential headers", async () => {
  const raw = vi.fn<typeof fetch>(async () => new Response("{}"));
  const wrapped = createPortalBrowserFetch(raw);
  const controller = new AbortController();
  const body = JSON.stringify({ offerRef: "offer_test", idempotencyKey: "once_test" });
  await wrapped("/api/portal/coins/recharge/orders", { method: "POST", signal: controller.signal, headers: { "x-portal-session": context, "Content-Type": "application/json", "Idempotency-Key": "once_test" }, body });
  const init = raw.mock.calls[0][1] as RequestInit;
  const headers = new Headers(init.headers);
  expect(headers.has("X-Portal-Session")).toBe(false);
  expect(headers.get("X-Portal-Session-Context")).toBe(context);
  expect(headers.get("X-Portal-Request")).toBe("browser-v1");
  expect(init).toMatchObject({ credentials: "same-origin", cache: "no-store", body, signal: controller.signal });
  expect(headers.get("Idempotency-Key")).toBe("once_test");
  expect(init.redirect).toBe("error");
});

test.each(["headers", "body"] as const)("bootstrap aborts stalled %s within a bounded deadline without an automatic retry", async (phase) => {
  vi.useFakeTimers();
  const raw = vi.fn<typeof fetch>(async () => phase === "headers"
    ? new Promise<Response>(() => {})
    : {ok:true,json:()=>new Promise(()=>{})} as unknown as Response);
  const client = createHttpUserPortalClient({fetchFn:raw});
  const result = client.restoreSession!();
  const rejected = expect(result).rejects.toThrow(/timed out/);
  await vi.advanceTimersByTimeAsync(15_001);
  await rejected;
  expect(raw).toHaveBeenCalledTimes(1);
  expect(raw.mock.calls[0][1]?.signal?.aborted).toBe(true);
});

test("legacy explicit transport omits cookies and never silently accepts conflicting context", async () => {
  const raw = vi.fn<typeof fetch>(async () => new Response("{}"));
  const wrapped = createPortalBrowserFetch(raw);
  await wrapped("/api/portal/security/current", { headers: { "X-Portal-Session": "session_legacy" } });
  expect(raw.mock.calls[0][1]).toMatchObject({ credentials: "omit" });
  expect(new Headers(raw.mock.calls[0][1]?.headers).get("X-Portal-Request")).toBeNull();
  await expect(wrapped("/api/portal/security/current", { headers: { "X-Portal-Session": context, "X-Portal-Session-Context": `portalctx_${"b".repeat(64)}` } })).rejects.toThrow();
  expect(raw).toHaveBeenCalledTimes(1);
});

test.each(["https://other.example/api/portal/browser-session", "/api/admin/session", "//other.example/api/portal/browser-session", "/api/portal/../admin/session"])("transport rejects an out-of-scope endpoint %s", async (url) => {
  const raw = vi.fn<typeof fetch>(async () => new Response("{}"));
  await expect(createPortalBrowserFetch(raw)(url)).rejects.toThrow();
  expect(raw).not.toHaveBeenCalled();
});

test("bootstrap accepts only public cookie metadata, never stores or reissues it", async () => {
  const raw = vi.fn<typeof fetch>(async () => new Response(JSON.stringify({ session })));
  const client = createHttpUserPortalClient({ fetchFn: raw as typeof fetch });
  const restored = await client.restoreSession!();
  expect(restored).toMatchObject({ sessionRef: context, transport: "cookie", expiresAt: session.expiresAt });
  expect(raw.mock.calls[0][0]).toBe("/api/portal/browser-session");
  expect(raw.mock.calls[0][1]).toMatchObject({ credentials: "same-origin", cache: "no-store" });
  expect(window.sessionStorage.length).toBe(0);
});

test("bootstrap null differs from network failure and malformed/raw session", async () => {
  const raw = vi.fn()
    .mockResolvedValueOnce(new Response(JSON.stringify({ session: null })))
    .mockRejectedValueOnce(new Error("offline"))
    .mockResolvedValueOnce(new Response(JSON.stringify({ session: { ...session, sessionRef: "session_secret" } })));
  const client = createHttpUserPortalClient({ fetchFn: raw as typeof fetch });
  await expect(client.restoreSession!()).resolves.toBeNull();
  await expect(client.restoreSession!()).rejects.toThrow();
  await expect(client.restoreSession!()).rejects.toThrow();
});

test("password login sends remember preference only in initial auth and binds logout context", async () => {
  const raw = vi.fn<typeof fetch>(async () => new Response(JSON.stringify({ session })));
  const client = createHttpUserPortalClient({ fetchFn: raw as typeof fetch });
  const result = await client.authenticate({ mode: "password", accountId: "account_test", password: "test-password", humanVerification: { challengeId: "challenge_test", challengeAnswer: "3" }, rememberMe: true });
  expect(result).toMatchObject({ sessionRef: context, transport: "cookie" });
  expect(JSON.parse(String(raw.mock.calls[0][1]?.body)).rememberMe).toBe(true);
  expect(new Headers(raw.mock.calls[0][1]?.headers).get("X-Portal-Request")).toBe("browser-v1");
  raw.mockImplementationOnce(async () => new Response(JSON.stringify({ loggedOut: true })));
  await client.logout!({ sessionRef: context });
  expect(raw.mock.calls[1][0]).toBe("/api/portal/browser-session/logout");
  expect(new Headers(raw.mock.calls[1][1]?.headers).get("X-Portal-Session-Context")).toBe(context);
});

test("every HTTP commercial and resource consumer receives request-bound cookie context", async () => {
  const raw = vi.fn<typeof fetch>(async () => new Response("{}"));
  const client = createHttpUserPortalClient({ fetchFn: raw });
  const other = `portalctx_${"b".repeat(64)}`;
  const requests = [
    client.wallet.getSummary({sessionRef:context}), client.commerce.listOffers({sessionRef:other}),
    client.commerceModel.getCommerceModel({sessionRef:context}), client.walletFirstCommerce.listOffers({sessionRef:other}),
    client.recharge.listOffers({sessionRef:context}), client.fetchCurrentResource({sessionRef:other}),
  ];
  await Promise.allSettled(requests);
  expect(raw).toHaveBeenCalledTimes(6);
  expect(raw.mock.calls.map(([,init])=>new Headers(init?.headers).get("X-Portal-Session-Context"))).toEqual([context,other,context,other,context,other]);
  for (const [,init] of raw.mock.calls) {
    expect(init).toMatchObject({credentials:"same-origin",cache:"no-store"});
    expect(new Headers(init?.headers).has("X-Portal-Session")).toBe(false);
  }
});

test("browser authentication never falls back to a returned legacy credential", async () => {
  const client = createHttpUserPortalClient({fetchFn:vi.fn<typeof fetch>(async()=>new Response(JSON.stringify({session:{...session,transport:undefined,sessionRef:"session_credential"}})))});
  await expect(client.authenticate({mode:"password",accountId:"test",password:"synthetic-password",humanVerification:{challengeId:"test",challengeAnswer:"3"}})).rejects.toThrow();
});

test("location persists only allowlisted non-sensitive navigation", () => {
  writePortalLocation({ view: "orders", orderFilter: "coin_recharge", profileSubview: "profile" });
  expect(readPortalLocation()).toMatchObject({ view: "orders", orderFilter: "coin_recharge" });
  window.location.hash = "#portal=wallet&orderRef=private&sessionRef=secret";
  expect(readPortalLocation()).toEqual({ view: "start", orderFilter: "all", profileSubview: "profile" });
});
