import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { usePortalWalletReadModel } from "../features/user-portal/wallet/use-portal-wallet-read-model";
import type { UsePortalWalletReadModelInput } from "../features/user-portal/wallet/use-portal-wallet-read-model";
import type { PortalWalletClient, PortalWalletLedgerEntry, PortalWalletSummary } from "../features/user-portal/wallet/api-contract";
import { PortalWalletClientError } from "../features/user-portal/wallet/wallet-client";

const SUMMARY: PortalWalletSummary = {
  status: "active", version: 1, balances: { paidCoins: 100, bonusCoins: 0, rewardCoins: 0 },
  spendableUnits: 100, heldUnits: 0, pendingUnits: 0,
};
const ENTRY: PortalWalletLedgerEntry = {
  entryRef: "entry_recent", category: "credit", coinType: "paid_coins", amountUnits: 100,
  availableDeltaUnits: null, pendingDeltaUnits: null, heldDeltaUnits: null, totalDeltaUnits: 100,
  relatedOrderRef: null, occurredAt: "2026-09-06T10:00:00.000Z",
};
const PAGE = { entries: [ENTRY], nextCursor: null };
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
function client() {
  return { getSummary: vi.fn(async () => SUMMARY), listLedger: vi.fn(async () => PAGE) };
}
function input(readClient: PortalWalletClient): UsePortalWalletReadModelInput {
  return { client: readClient, sessionRef: "session_local", sessionGeneration: 1, loadLedger: true, onSessionInvalid: vi.fn() };
}
async function flush() { await act(async () => { await Promise.resolve(); }); }
async function advance(ms: number) { await act(async () => { await vi.advanceTimersByTimeAsync(ms); }); }
let visibility = "visible";
let online = true;
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-09-06T12:00:00.000Z"));
  visibility = "visible";
  online = true;
  vi.spyOn(document, "visibilityState", "get").mockImplementation(() => visibility as DocumentVisibilityState);
  vi.spyOn(navigator, "onLine", "get").mockImplementation(() => online);
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); });

test("visible Wallet refreshes every thirty seconds without blanking ready values", async () => {
  const reads = client();
  const nextSummary = deferred<PortalWalletSummary>();
  const nextLedger = deferred<typeof PAGE>();
  reads.getSummary.mockImplementationOnce(async () => SUMMARY).mockImplementationOnce(() => nextSummary.promise);
  reads.listLedger.mockImplementationOnce(async () => PAGE).mockImplementationOnce(() => nextLedger.promise);
  const { result } = renderHook(() => usePortalWalletReadModel(input(reads)));
  await flush();
  await advance(29_999);
  expect(reads.getSummary).toHaveBeenCalledTimes(1);
  await advance(1);
  expect(reads.getSummary).toHaveBeenCalledTimes(2);
  expect(reads.listLedger).toHaveBeenCalledTimes(2);
  expect(result.current.summary).toEqual({ phase: "ready", value: SUMMARY });
  expect(result.current.ledger).toEqual({ phase: "ready", value: PAGE.entries });
  await act(async () => { nextSummary.resolve({ ...SUMMARY, version: 2 }); nextLedger.resolve(PAGE); });
  expect(result.current.summary.phase).toBe("ready");
});

test("focus visibility and online events share a five-second throttle", async () => {
  const reads = client();
  renderHook(() => usePortalWalletReadModel(input(reads)));
  await flush();
  await advance(5000);
  act(() => {
    window.dispatchEvent(new Event("focus"));
    window.dispatchEvent(new Event("online"));
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await flush();
  expect(reads.getSummary).toHaveBeenCalledTimes(2);
  expect(reads.listLedger).toHaveBeenCalledTimes(2);
  await advance(4999);
  act(() => window.dispatchEvent(new Event("focus")));
  expect(reads.getSummary).toHaveBeenCalledTimes(2);
  await advance(1);
  act(() => window.dispatchEvent(new Event("focus")));
  await flush();
  expect(reads.getSummary).toHaveBeenCalledTimes(3);
});

test("hidden or offline Wallet stops polling and refreshes when eligible again", async () => {
  const reads = client();
  renderHook(() => usePortalWalletReadModel(input(reads)));
  await flush();
  visibility = "hidden";
  act(() => document.dispatchEvent(new Event("visibilitychange")));
  await advance(90_000);
  expect(reads.getSummary).toHaveBeenCalledTimes(1);
  visibility = "visible";
  online = false;
  act(() => document.dispatchEvent(new Event("visibilitychange")));
  await advance(90_000);
  expect(reads.getSummary).toHaveBeenCalledTimes(1);
  online = true;
  act(() => window.dispatchEvent(new Event("online")));
  await flush();
  expect(reads.getSummary).toHaveBeenCalledTimes(2);
});

test("leaving Wallet logged-out and unmounted states do not schedule reads", async () => {
  const reads = client();
  const { rerender, unmount } = renderHook((props: UsePortalWalletReadModelInput) => usePortalWalletReadModel(props), { initialProps: input(reads) });
  await flush();
  rerender({ ...input(reads), loadLedger: false });
  await advance(90_000);
  act(() => window.dispatchEvent(new Event("focus")));
  expect(reads.getSummary).toHaveBeenCalledTimes(1);
  rerender({ ...input(reads), sessionRef: null });
  await advance(90_000);
  expect(reads.getSummary).toHaveBeenCalledTimes(1);
  unmount();
  act(() => { window.dispatchEvent(new Event("focus")); window.dispatchEvent(new Event("online")); });
  await advance(90_000);
  expect(reads.getSummary).toHaveBeenCalledTimes(1);
});

test("pending reads never overlap polling and mutation invalidation queues one immediate successor", async () => {
  const pending = deferred<PortalWalletSummary>();
  const reads = client();
  reads.getSummary.mockImplementationOnce(() => pending.promise);
  const { result } = renderHook(() => usePortalWalletReadModel(input(reads)));
  await flush();
  await advance(60_000);
  act(() => { window.dispatchEvent(new Event("focus")); result.current.refreshWallet(); result.current.refreshWallet(); });
  await flush();
  expect(reads.getSummary).toHaveBeenCalledTimes(1);
  await act(async () => pending.resolve(SUMMARY));
  await flush();
  expect(reads.getSummary).toHaveBeenCalledTimes(2);
  expect(result.current.summary.phase).toBe("ready");
});

test("mutation invalidation discards the older read result while its single-flight successor is pending", async () => {
  const reads = client();
  const { result } = renderHook(() => usePortalWalletReadModel(input(reads)));
  await flush();
  const oldSummary = deferred<PortalWalletSummary>();
  const nextSummary = deferred<PortalWalletSummary>();
  const oldLedger = deferred<typeof PAGE>();
  const nextLedger = deferred<typeof PAGE>();
  reads.getSummary.mockImplementationOnce(() => oldSummary.promise).mockImplementationOnce(() => nextSummary.promise);
  reads.listLedger.mockImplementationOnce(() => oldLedger.promise).mockImplementationOnce(() => nextLedger.promise);
  await advance(30_000);
  act(() => result.current.refreshWallet());
  await act(async () => {
    oldSummary.resolve({ ...SUMMARY, version: 2, spendableUnits: 110 });
    oldLedger.resolve({ entries: [{ ...ENTRY, entryRef: "entry_pre_mutation" }], nextCursor: null });
  });
  await flush();
  expect(reads.getSummary).toHaveBeenCalledTimes(3);
  expect(reads.listLedger).toHaveBeenCalledTimes(3);
  expect(result.current.summary).toEqual({ phase: "ready", value: SUMMARY });
  expect(result.current.ledger).toEqual({ phase: "ready", value: PAGE.entries });
  await act(async () => {
    nextSummary.resolve({ ...SUMMARY, version: 3, spendableUnits: 80 });
    nextLedger.resolve(PAGE);
  });
  expect(result.current.summary).toEqual({ phase: "ready", value: { ...SUMMARY, version: 3, spendableUnits: 80 } });
});

test("refresh failure preserves previous values with explicit stale errors cleared only by success", async () => {
  const reads = client();
  const { result } = renderHook(() => usePortalWalletReadModel(input(reads)));
  await flush();
  reads.getSummary.mockRejectedValueOnce(new PortalWalletClientError("wallet_request_failed", true));
  reads.listLedger.mockRejectedValueOnce(new PortalWalletClientError("wallet_unavailable", true));
  await advance(30_000);
  expect(result.current.summary).toEqual({ phase: "ready", value: SUMMARY });
  expect(result.current.ledger).toEqual({ phase: "ready", value: PAGE.entries });
  expect(result.current.summaryRefreshError).toEqual({ phase: "error", retryable: true });
  expect(result.current.ledgerRefreshError).toEqual({ phase: "unavailable", retryable: true });
  act(() => result.current.refreshWallet());
  await flush();
  expect(result.current.summaryRefreshError).toBeNull();
  expect(result.current.ledgerRefreshError).toBeNull();
});

test("load-more pauses ledger polling without freezing summary; explicit refresh resets the page", async () => {
  const cursor = { afterOccurredAt: ENTRY.occurredAt, afterEntryRef: ENTRY.entryRef };
  const older = { ...ENTRY, entryRef: "entry_older", occurredAt: "2026-09-05T10:00:00.000Z" };
  const reads: PortalWalletClient = {
    getSummary: vi.fn(async () => SUMMARY),
    listLedger: vi.fn(async (request) => "afterOccurredAt" in request
      ? { entries: [older], nextCursor: null } : { entries: [ENTRY], nextCursor: cursor }),
  };
  const { result } = renderHook(() => usePortalWalletReadModel(input(reads)));
  await flush();
  act(() => result.current.loadMoreLedger());
  await flush();
  expect(result.current.ledgerAutoRefreshPaused).toBe(true);
  await advance(30_000);
  expect(reads.getSummary).toHaveBeenCalledTimes(2);
  expect(reads.listLedger).toHaveBeenCalledTimes(2);
  expect(result.current.ledger).toEqual({ phase: "ready", value: [ENTRY, older] });
  act(() => result.current.refreshWallet());
  await flush();
  expect(result.current.ledger).toEqual({ phase: "ready", value: [ENTRY] });
  expect(result.current.ledgerAutoRefreshPaused).toBe(false);
});

test("identity generation change never renders previously loaded account data", async () => {
  const reads = client();
  const values: unknown[] = [];
  const { result, rerender } = renderHook((props: UsePortalWalletReadModelInput) => {
    const model = usePortalWalletReadModel(props);
    if (props.sessionGeneration === 2) values.push(model.summary);
    return model;
  }, { initialProps: input(reads) });
  await flush();
  const pending = deferred<PortalWalletSummary>();
  reads.getSummary.mockImplementationOnce(() => pending.promise);
  rerender({ ...input(reads), sessionGeneration: 2 });
  expect(values.every((value) => (value as { phase: string }).phase !== "ready")).toBe(true);
  expect(result.current.summary.phase).toBe("loading");
});

test("current automatic session-invalid uses the existing invalidation callback", async () => {
  const reads = client();
  const props = input(reads);
  renderHook(() => usePortalWalletReadModel(props));
  await flush();
  reads.getSummary.mockRejectedValueOnce(new PortalWalletClientError("wallet_session_invalid", false));
  await advance(30_000);
  expect(props.onSessionInvalid).toHaveBeenCalledTimes(1);
});

test("StrictMode shares each unresolved initial request instead of starting overlapping reads", async () => {
  const reads = client();
  const pendingSummary = deferred<PortalWalletSummary>();
  const pendingLedger = deferred<typeof PAGE>();
  reads.getSummary.mockImplementationOnce(() => pendingSummary.promise);
  reads.listLedger.mockImplementationOnce(() => pendingLedger.promise);
  const { result } = renderHook(() => usePortalWalletReadModel(input(reads)), { reactStrictMode: true });
  await flush();
  expect(reads.getSummary).toHaveBeenCalledTimes(1);
  expect(reads.listLedger).toHaveBeenCalledTimes(1);
  await act(async () => { pendingSummary.resolve(SUMMARY); pendingLedger.resolve(PAGE); });
  expect(result.current.summary.phase).toBe("ready");
  expect(result.current.ledger.phase).toBe("ready");
});

test("a queued ledger invalidation waits for load-more and then replaces history exactly once", async () => {
  const cursor = { afterOccurredAt: ENTRY.occurredAt, afterEntryRef: ENTRY.entryRef };
  const pendingPage = deferred<Awaited<ReturnType<PortalWalletClient["listLedger"]>>>();
  const reads: PortalWalletClient = {
    getSummary: vi.fn(async () => SUMMARY),
    listLedger: vi.fn((request) => "afterOccurredAt" in request
      ? pendingPage.promise : Promise.resolve({ entries: [ENTRY], nextCursor: cursor })),
  };
  const { result } = renderHook(() => usePortalWalletReadModel(input(reads)));
  await flush();
  act(() => result.current.loadMoreLedger());
  await advance(30_000);
  expect(reads.listLedger).toHaveBeenCalledTimes(2);
  act(() => { result.current.refreshWallet(); result.current.refreshWallet(); });
  await flush();
  expect(reads.listLedger).toHaveBeenCalledTimes(2);
  await act(async () => pendingPage.resolve({ entries: [{ ...ENTRY, entryRef: "entry_older" }], nextCursor: null }));
  await flush();
  expect(reads.listLedger).toHaveBeenCalledTimes(3);
  expect(result.current.ledger).toEqual({ phase: "ready", value: [ENTRY] });
  expect(result.current.ledgerAutoRefreshPaused).toBe(false);
});

test("load-more cannot overlap a refreshing first page and a failed page keeps automatic ledger reads paused", async () => {
  const cursor = { afterOccurredAt: ENTRY.occurredAt, afterEntryRef: ENTRY.entryRef };
  const nextFirstPage = deferred<Awaited<ReturnType<PortalWalletClient["listLedger"]>>>();
  let firstPages = 0;
  const reads: PortalWalletClient = {
    getSummary: vi.fn(async () => SUMMARY),
    listLedger: vi.fn((request) => {
      if ("afterOccurredAt" in request) return Promise.reject(new Error("local request failed"));
      firstPages += 1;
      return firstPages === 2 ? nextFirstPage.promise : Promise.resolve({ entries: [ENTRY], nextCursor: cursor });
    }),
  };
  const { result } = renderHook(() => usePortalWalletReadModel(input(reads)));
  await flush();
  await advance(30_000);
  act(() => result.current.loadMoreLedger());
  expect(reads.listLedger).toHaveBeenCalledTimes(2);
  await act(async () => nextFirstPage.resolve({ entries: [ENTRY], nextCursor: cursor }));
  act(() => result.current.loadMoreLedger());
  await flush();
  expect(result.current.loadMoreLedgerError).toEqual({ phase: "error", retryable: true });
  expect(result.current.ledgerAutoRefreshPaused).toBe(true);
  await advance(30_000);
  expect(reads.listLedger).toHaveBeenCalledTimes(3);
  expect(result.current.ledger).toEqual({ phase: "ready", value: [ENTRY] });
});

test("late automatic session-invalid from an older generation cannot invalidate the new session", async () => {
  const reads = client();
  const props = input(reads);
  const { result, rerender } = renderHook((value: UsePortalWalletReadModelInput) => usePortalWalletReadModel(value), { initialProps: props });
  await flush();
  const stale = deferred<PortalWalletSummary>();
  reads.getSummary.mockImplementationOnce(() => stale.promise);
  await advance(30_000);
  rerender({ ...props, sessionGeneration: 2, sessionRef: "session_next" });
  await flush();
  await act(async () => stale.reject(new PortalWalletClientError("wallet_session_invalid", false)));
  expect(props.onSessionInvalid).not.toHaveBeenCalled();
  expect(result.current.summary).toEqual({ phase: "ready", value: SUMMARY });
});

test("unmount discards queued invalidations and late request completions", async () => {
  const reads = client();
  const pending = deferred<PortalWalletSummary>();
  reads.getSummary.mockImplementationOnce(() => pending.promise);
  const { result, unmount } = renderHook(() => usePortalWalletReadModel(input(reads)));
  await flush();
  act(() => result.current.refreshWallet());
  unmount();
  await act(async () => pending.resolve(SUMMARY));
  await advance(90_000);
  expect(reads.getSummary).toHaveBeenCalledTimes(1);
});

test("leaving and reopening Wallet preserves the successor for an invalidated unresolved ledger", async () => {
  const pendingLedger = deferred<typeof PAGE>();
  const reads = client();
  reads.listLedger.mockImplementationOnce(() => pendingLedger.promise);
  const { result, rerender } = renderHook((value: UsePortalWalletReadModelInput) => usePortalWalletReadModel(value), { initialProps: input(reads) });
  await flush();
  act(() => result.current.refreshWallet());
  rerender({ ...input(reads), loadLedger: false });
  rerender(input(reads));
  await act(async () => pendingLedger.resolve(PAGE));
  await flush();
  expect(reads.listLedger).toHaveBeenCalledTimes(2);
  expect(result.current.ledger).toEqual({ phase: "ready", value: PAGE.entries });
});

test("purchase invalidation outside Wallet cannot revive its unresolved pre-purchase ledger", async () => {
  const pendingLedger = deferred<typeof PAGE>();
  const successor = deferred<typeof PAGE>();
  const reads = client();
  reads.listLedger.mockImplementationOnce(() => pendingLedger.promise).mockImplementationOnce(() => successor.promise);
  const { result, rerender } = renderHook((value: UsePortalWalletReadModelInput) => usePortalWalletReadModel(value), { initialProps: input(reads) });
  await flush();
  rerender({ ...input(reads), loadLedger: false });
  act(() => result.current.refreshWallet());
  rerender(input(reads));
  await act(async () => pendingLedger.resolve(PAGE));
  await flush();
  expect(reads.listLedger).toHaveBeenCalledTimes(2);
  expect(result.current.ledger).toEqual({ phase: "loading" });
  await act(async () => successor.resolve({ entries: [{ ...ENTRY, entryRef: "entry_post_purchase" }], nextCursor: null }));
  expect(result.current.ledger).toEqual({ phase: "ready", value: [{ ...ENTRY, entryRef: "entry_post_purchase" }] });
});
