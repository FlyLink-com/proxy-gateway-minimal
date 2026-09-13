import { StrictMode } from "react";
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { UserMonitorReadError, type UserMonitorAccountsPage, type UserMonitorCoins, type UserMonitorGrowth, type UserMonitorRange } from "../app/admin-user-monitor-client";
import { useAdminUserMonitor, type UserMonitorClient } from "../app/use-admin-user-monitor";

function def<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const FROM = "2026-09-11T16:00:00.000Z";
const TO = "2026-09-12T16:00:00.000Z";
const GEN = "2026-09-12T16:00:00.000Z";
const q7: UserMonitorRange = {
  from: "2026-09-01T00:00:00.000Z",
  to: "2026-09-08T00:00:00.000Z"
};

const growthFix: UserMonitorGrowth = {
  generatedAt: GEN,
  from: FROM,
  to: TO,
  timezone: "UTC",
  registeredCount: 0,
  otherCreatedCount: 0,
  points: []
};
const accountsFix: UserMonitorAccountsPage = { generatedAt: GEN, items: [], nextCursor: null };
const coinsFix: UserMonitorCoins = {
  generatedAt: GEN,
  accountId: "acct_local",
  wallet: {
    status: "not_created",
    version: 0,
    balances: { paidCoins: 0, bonusCoins: 0, rewardCoins: 0 },
    spendableUnits: 0,
    heldUnits: 0,
    pendingUnits: 0
  },
  entries: [],
  nextCursor: null
};
const trafficFix = {
  generatedAt: GEN,
  accountId: "acct_local",
  from: FROM,
  to: TO,
  bucket: "day" as const,
  state: "not_collected" as const,
  sampleCount: 0,
  lastObservedAt: null,
  totalBytes: null,
  uploadBytes: null,
  downloadBytes: null,
  points: []
};

function client(partial: Partial<UserMonitorClient> = {}): UserMonitorClient {
  return {
    growth: vi.fn(async () => growthFix),
    accounts: vi.fn(async () => accountsFix),
    coins: vi.fn(async () => coinsFix),
    traffic: vi.fn(async () => trafficFix),
    ...partial
  } as UserMonitorClient;
}

async function flush() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

function vis(hidden: boolean) {
  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    get: () => (hidden ? "hidden" : "visible")
  });
  document.dispatchEvent(new Event("visibilitychange"));
}

const rh = (c: UserMonitorClient, wrapper?: typeof StrictMode) =>
  renderHook(() => useAdminUserMonitor(() => c), wrapper ? { wrapper } : undefined);
const calls = (fn: unknown) => (fn as ReturnType<typeof vi.fn>).mock.calls;

describe("useAdminUserMonitor", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vis(false);
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vis(false);
  });

  it("idles until start; only growth and directory; same-tick double start guarded", async () => {
    const c = client();
    const { result } = rh(c, StrictMode);
    expect(result.current.connected).toBe(false);
    expect(result.current.intervalSeconds).toBe(30);
    expect(result.current.bucket).toBe("day");
    expect(result.current.sources.growth.phase).toBe("idle");
    expect(c.growth).not.toHaveBeenCalled();
    act(() => {
      result.current.start();
      result.current.start();
    });
    expect(calls(c.growth)).toHaveLength(1);
    expect(calls(c.accounts)).toHaveLength(1);
    expect(c.coins).not.toHaveBeenCalled();
    expect(c.traffic).not.toHaveBeenCalled();
    await flush();
    expect(result.current.connected).toBe(true);
    expect(result.current.sources.growth.phase).toBe("ready");
    expect(Date.parse(result.current.query.to) - Date.parse(result.current.query.from)).toBe(86_400_000);
    const pending = def<typeof accountsFix>();
    const c2 = client({ accounts: vi.fn(() => pending.promise) as UserMonitorClient["accounts"] });
    const h = rh(c2);
    act(() => {
      h.result.current.start();
      h.result.current.refresh();
      h.result.current.refresh();
      h.result.current.retry("accounts");
    });
    expect(calls(c2.accounts)).toHaveLength(1);
  });

  it("401/403 block only that source until retry; unknown becomes network", async () => {
    const growth = def<UserMonitorGrowth>();
    const c = client({ growth: vi.fn(() => growth.promise) as UserMonitorClient["growth"] });
    const { result } = rh(c);
    act(() => result.current.start());
    await flush();
    expect(result.current.sources.accounts.phase).toBe("ready");
    await act(async () => growth.reject(new UserMonitorReadError("session")));
    await flush();
    expect(result.current.sources.growth).toMatchObject({ phase: "error", error: "session", data: null });
    const n = calls(c.growth).length;
    await act(async () => {
      vi.advanceTimersByTime(30_000);
    });
    await flush();
    expect(calls(c.growth)).toHaveLength(n);
    expect(calls(c.accounts).length).toBeGreaterThan(1);
    (c.growth as ReturnType<typeof vi.fn>).mockImplementation(async () => growthFix);
    await act(async () => result.current.retry("growth"));
    await flush();
    expect(calls(c.growth)).toHaveLength(n + 1);
    expect(result.current.sources.growth.phase).toBe("ready");
    (c.accounts as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error("x"));
    await act(async () => result.current.retry("accounts"));
    await flush();
    expect(result.current.sources.accounts.error).toBe("network");
    expect(JSON.stringify(result.current.sources.accounts)).not.toContain("x");
  });

  it("poll does not overlap; 0 pauses; 10 is rejected; 60 is accepted", async () => {
    const d = { g: def<UserMonitorGrowth>(), a: def<typeof accountsFix>() };
    const c = client({
      growth: vi.fn(() => d.g.promise) as UserMonitorClient["growth"],
      accounts: vi.fn(() => d.a.promise) as UserMonitorClient["accounts"]
    });
    const { result } = rh(c);
    act(() => result.current.start());
    expect(calls(c.growth)).toHaveLength(1);
    await act(async () => {
      vi.advanceTimersByTime(14_999);
    });
    expect(calls(c.growth)).toHaveLength(1);
    await act(async () => {
      result.current.refresh();
      result.current.retry("growth");
    });
    expect(calls(c.growth)).toHaveLength(1);
    await act(async () => {
      d.g.resolve(growthFix);
      d.a.resolve(accountsFix);
    });
    await flush();
    await act(async () => {
      vi.advanceTimersByTime(15_001);
    });
    expect(calls(c.growth)).toHaveLength(2);
    act(() => result.current.setIntervalSeconds(10));
    expect(result.current.intervalSeconds).toBe(30);
    act(() => result.current.setIntervalSeconds(0));
    expect(result.current.intervalSeconds).toBe(0);
    await act(async () => {
      vi.advanceTimersByTime(60_000);
    });
    expect(calls(c.growth)).toHaveLength(2);
    await act(async () => result.current.refresh());
    expect(calls(c.growth)).toHaveLength(3);
    act(() => result.current.setIntervalSeconds(60));
    expect(result.current.intervalSeconds).toBe(60);
  });

  it("15s timeout ignores a late result even if abort is ignored", async () => {
    const d = def<UserMonitorGrowth>();
    const c = client({ growth: vi.fn(() => d.promise) as UserMonitorClient["growth"] });
    const { result } = rh(c);
    act(() => result.current.start());
    await act(async () => {
      vi.advanceTimersByTime(15_000);
    });
    expect(result.current.sources.growth).toMatchObject({ phase: "error", error: "timeout", data: null });
    await act(async () => d.resolve(growthFix));
    await flush();
    expect(result.current.sources.growth.error).toBe("timeout");
    expect(result.current.sources.growth.data).toBeNull();
  });

  it("hidden page pauses, aborts, and ignores late; hidden start waits for visible", async () => {
    const d = def<UserMonitorGrowth>();
    const c = client({ growth: vi.fn(() => d.promise) as UserMonitorClient["growth"] });
    const { result } = rh(c);
    act(() => result.current.start());
    expect(result.current.sources.growth.phase).toBe("loading");
    act(() => vis(true));
    expect(result.current.sources.growth.phase).toBe("idle");
    await act(async () => d.resolve(growthFix));
    await flush();
    expect(result.current.sources.growth.phase).toBe("idle");
    act(() => vis(false));
    expect(calls(c.growth).length).toBeGreaterThan(1);
    const c2 = client();
    const h = rh(c2);
    act(() => vis(true));
    act(() => {
      h.result.current.start();
      h.result.current.refresh();
    });
    expect(c2.growth).not.toHaveBeenCalled();
    act(() => vis(false));
    expect(c2.growth).toHaveBeenCalled();
  });

  it("applyRange cancels growth and traffic only; applyDirectory cancels accounts; setBucket is traffic-only", async () => {
    const g1 = def<UserMonitorGrowth>();
    const g2 = def<UserMonitorGrowth>();
    const growth = vi.fn()
      .mockReturnValueOnce(g1.promise)
      .mockReturnValueOnce(g2.promise)
      .mockResolvedValue(growthFix);
    const c = client({ growth: growth as UserMonitorClient["growth"] });
    const { result } = rh(c);
    act(() => result.current.start());
    act(() => result.current.selectAccount("acct_local"));
    await flush();
    const coinsN = calls(c.coins).length;
    const accountsN = calls(c.accounts).length;
    const trafficN = calls(c.traffic).length;
    act(() => result.current.applyRange(q7, true));
    expect(result.current.fixedRange).toBe(true);
    expect(result.current.query).toEqual(q7);
    const before = result.current.query;
    act(() => result.current.applyRange({ from: TO, to: FROM }, false));
    expect(result.current.query).toEqual(before);
    await act(async () => g1.resolve({ ...growthFix, registeredCount: 9 }));
    await flush();
    expect(result.current.sources.growth.data?.registeredCount).not.toBe(9);
    await act(async () => g2.resolve(growthFix));
    await flush();
    expect(result.current.sources.growth.phase).toBe("ready");
    expect(calls(c.coins)).toHaveLength(coinsN);
    expect(calls(c.accounts)).toHaveLength(accountsN);
    expect(calls(c.traffic).length).toBeGreaterThan(trafficN);
    expect(calls(c.traffic).at(-1)?.[1]).toMatchObject({ ...q7, bucket: "day" });
    const growthN = growth.mock.calls.length;
    act(() => result.current.setBucket("hour"));
    expect(growth.mock.calls).toHaveLength(growthN);
    expect(calls(c.traffic).at(-1)?.[1]).toMatchObject({ bucket: "hour" });
    const a1 = def<typeof accountsFix>();
    const a2 = def<typeof accountsFix>();
    (c.accounts as ReturnType<typeof vi.fn>)
      .mockReturnValueOnce(a1.promise)
      .mockReturnValueOnce(a2.promise);
    act(() => result.current.applyDirectory({ status: "active", limit: 20 }));
    act(() => result.current.applyDirectory({ status: "suspended", limit: 20 }));
    await act(async () => a1.resolve({ ...accountsFix, items: [{ id: "acct_old", status: "active", createdAt: GEN, registrationSource: "other" }] }));
    await flush();
    expect(result.current.sources.accounts.data?.items[0]?.id).not.toBe("acct_old");
    await act(async () => a2.resolve(accountsFix));
    await flush();
    expect(result.current.directory).toMatchObject({ status: "suspended", limit: 20 });
  });

  it("account swap ignores late coins and resets ledger cursor", async () => {
    const first = def<UserMonitorCoins>();
    const second = def<UserMonitorCoins>();
    const coins = vi.fn()
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise)
      .mockResolvedValue({ ...coinsFix, accountId: "acct_b", nextCursor: null });
    const c = client({ coins: coins as UserMonitorClient["coins"] });
    const { result } = rh(c);
    act(() => result.current.start());
    act(() => result.current.selectAccount("acct_a"));
    expect(calls(c.coins)[0]?.[0]).toBe("acct_a");
    expect(calls(c.coins)[0]?.[1]).toEqual({ limit: 20 });
    expect(calls(c.traffic)[0]?.[0]).toBe("acct_a");
    act(() => result.current.selectAccount("acct_b"));
    await act(async () => first.resolve({ ...coinsFix, accountId: "acct_a", nextCursor: "stale_cursor" }));
    await flush();
    expect(result.current.selectedAccountId).toBe("acct_b");
    expect(result.current.sources.coins.data?.accountId).not.toBe("acct_a");
    await act(async () => second.resolve({ ...coinsFix, accountId: "acct_b", nextCursor: "c2" }));
    await flush();
    expect(result.current.sources.coins.data?.accountId).toBe("acct_b");
    act(() => result.current.pageCoins("next"));
    expect(calls(c.coins).at(-1)?.[1]).toEqual({ limit: 20, cursor: "c2" });
    act(() => result.current.selectAccount("acct_c"));
    expect(calls(c.coins).at(-1)?.[0]).toBe("acct_c");
    expect(calls(c.coins).at(-1)?.[1]).toEqual({ limit: 20 });
    expect(result.current.coinsHasPrev).toBe(false);
  });

  it("stop and unmount abort, clear data, and ignore late results", async () => {
    const pendingSig: AbortSignal[] = [];
    const d = def<UserMonitorGrowth>();
    const c = client({
      growth: vi.fn((_range, signal) => {
        pendingSig.push(signal as AbortSignal);
        return d.promise;
      }) as UserMonitorClient["growth"]
    });
    const { result } = rh(c);
    act(() => result.current.start());
    act(() => result.current.stop());
    expect(result.current.connected).toBe(false);
    expect(result.current.sources.growth.phase).toBe("idle");
    expect(pendingSig[0]?.aborted).toBe(true);
    await act(async () => d.resolve(growthFix));
    await flush();
    expect(result.current.sources.growth.phase).toBe("idle");
    const d2 = def<UserMonitorGrowth>();
    const c2 = client({ growth: vi.fn(() => d2.promise) as UserMonitorClient["growth"] });
    const h = rh(c2);
    act(() => h.result.current.start());
    h.unmount();
    await act(async () => d2.resolve(growthFix));
    await flush();
  });

  it("sync throw on one source is network and does not block the other", async () => {
    const c = client({
      growth: vi.fn(() => {
        throw new Error("boom");
      }) as UserMonitorClient["growth"]
    });
    const { result } = rh(c);
    act(() => result.current.start());
    await flush();
    expect(result.current.sources.growth).toMatchObject({ phase: "error", error: "network", data: null });
    expect(result.current.sources.accounts.phase).toBe("ready");
  });

  it("hidden applyRange resumes growth once; 403 traffic does not auto retry", async () => {
    const c = client();
    const { result } = rh(c);
    act(() => result.current.start());
    act(() => result.current.selectAccount("acct_local"));
    await flush();
    act(() => vis(true));
    act(() => result.current.applyRange(q7, true));
    expect(result.current.sources.growth.phase).toBe("idle");
    const n = calls(c.growth).length;
    act(() => vis(false));
    expect(calls(c.growth).length).toBeGreaterThan(n);
    expect(calls(c.growth).at(-1)?.[0]).toEqual(q7);
    const denied = vi.fn(async () => {
      throw new UserMonitorReadError("permission");
    });
    const c2 = client({ traffic: denied as UserMonitorClient["traffic"] });
    const h = rh(c2);
    act(() => {
      h.result.current.start();
      h.result.current.selectAccount("acct_local");
    });
    await flush();
    const dn = denied.mock.calls.length;
    await act(async () => {
      vi.advanceTimersByTime(30_000);
    });
    await flush();
    expect(denied.mock.calls).toHaveLength(dn);
    await act(async () => h.result.current.retry("traffic"));
    await flush();
    expect(denied.mock.calls).toHaveLength(dn + 1);
  });

  it("clears stale source data on hidden explicit query changes and fetches once when visible even if paused", async () => {
    const c = client({
      accounts: vi.fn(async (query) => {
        if (query?.accountId === "acct_new") return accountsFix;
        return {
          ...accountsFix,
          items: [{ id: "acct_old", status: "active" as const, createdAt: GEN, registrationSource: "other" as const }]
        };
      }) as UserMonitorClient["accounts"]
    });
    const { result } = rh(c);
    act(() => result.current.start());
    await flush();
    act(() => result.current.setIntervalSeconds(0));
    expect(result.current.sources.accounts.data?.items[0]?.id).toBe("acct_old");
    const accountsN = calls(c.accounts).length;
    act(() => vis(true));
    act(() => result.current.applyDirectory({ accountId: "acct_new", limit: 20 }));
    expect(result.current.sources.accounts.phase).toBe("idle");
    expect(result.current.sources.accounts.data).toBeNull();
    expect(calls(c.accounts)).toHaveLength(accountsN);
    act(() => vis(false));
    expect(calls(c.accounts).length).toBeGreaterThan(accountsN);
    expect(calls(c.accounts).at(-1)?.[0]).toMatchObject({ accountId: "acct_new", limit: 20 });

    act(() => result.current.selectAccount("acct_local"));
    act(() => result.current.applyRange(q7, true));
    await flush();
    const trafficN = calls(c.traffic).length;
    expect(calls(c.traffic).at(-1)?.[1]).toMatchObject({ bucket: "day" });
    act(() => vis(true));
    act(() => result.current.setBucket("hour"));
    expect(result.current.sources.traffic.phase).toBe("idle");
    expect(result.current.sources.traffic.data).toBeNull();
    expect(calls(c.traffic)).toHaveLength(trafficN);
    act(() => vis(false));
    expect(calls(c.traffic).length).toBeGreaterThan(trafficN);
    expect(calls(c.traffic).at(-1)?.[1]).toMatchObject({ ...q7, bucket: "hour" });

    const coinsN = calls(c.coins).length;
    act(() => vis(true));
    act(() => result.current.selectAccount("acct_new"));
    expect(result.current.sources.coins.phase).toBe("idle");
    expect(result.current.sources.coins.data).toBeNull();
    expect(calls(c.coins)).toHaveLength(coinsN);
    act(() => vis(false));
    expect(calls(c.coins).at(-1)?.[0]).toBe("acct_new");
  });

  it("does not slide the applied range on non-range retries", async () => {
    const c = client();
    const { result } = rh(c);
    act(() => result.current.start());
    await flush();
    const started = result.current.query;
    const growthN = calls(c.growth).length;
    await act(async () => {
      vi.advanceTimersByTime(5_000);
    });
    await act(async () => result.current.retry("accounts"));
    await flush();
    expect(result.current.query).toEqual(started);
    expect(calls(c.growth)).toHaveLength(growthN);
    act(() => result.current.selectAccount("acct_local"));
    await flush();
    const afterSelect = result.current.query;
    const growthAfter = calls(c.growth).length;
    await act(async () => {
      vi.advanceTimersByTime(5_000);
    });
    await act(async () => result.current.retry("coins"));
    await flush();
    expect(result.current.query).toEqual(afterSelect);
    expect(calls(c.growth)).toHaveLength(growthAfter);
  });

  it("ignores overlapping ledger page turns and only commits cursor history on success", async () => {
    const page2 = def<UserMonitorCoins>();
    const coins = vi.fn()
      .mockResolvedValueOnce({ ...coinsFix, accountId: "acct_local", nextCursor: "c2" })
      .mockReturnValueOnce(page2.promise)
      .mockResolvedValue({ ...coinsFix, accountId: "acct_local", nextCursor: null });
    const c = client({ coins: coins as UserMonitorClient["coins"] });
    const { result } = rh(c);
    act(() => result.current.start());
    act(() => result.current.selectAccount("acct_local"));
    await flush();
    act(() => {
      result.current.pageCoins("next");
      result.current.pageCoins("next");
    });
    expect(calls(c.coins)).toHaveLength(2);
    expect(calls(c.coins).at(-1)?.[1]).toEqual({ limit: 20, cursor: "c2" });
    await act(async () => page2.resolve({ ...coinsFix, accountId: "acct_local", nextCursor: "c3" }));
    await flush();
    act(() => result.current.pageCoins("prev"));
    expect(calls(c.coins).at(-1)?.[1]).toEqual({ limit: 20 });

    const hidden = client({
      coins: vi.fn()
        .mockResolvedValueOnce({ ...coinsFix, accountId: "acct_local", nextCursor: "c2" })
        .mockResolvedValue({ ...coinsFix, accountId: "acct_local", nextCursor: "c3" }) as UserMonitorClient["coins"]
    });
    const h = rh(hidden);
    act(() => h.result.current.start());
    act(() => h.result.current.setIntervalSeconds(0));
    act(() => h.result.current.selectAccount("acct_local"));
    await flush();
    const hiddenN = calls(hidden.coins).length;
    act(() => vis(true));
    act(() => h.result.current.pageCoins("next"));
    expect(h.result.current.sources.coins.phase).toBe("idle");
    expect(h.result.current.sources.coins.data).toBeNull();
    expect(calls(hidden.coins)).toHaveLength(hiddenN);
    act(() => vis(false));
    expect(calls(hidden.coins).at(-1)?.[1]).toEqual({ limit: 20, cursor: "c2" });
  });

  it("retries a failed ledger page without corrupting previous-page history", async () => {
    const coins = vi.fn()
      .mockResolvedValueOnce({ ...coinsFix, accountId: "acct_local", nextCursor: "c2" })
      .mockRejectedValueOnce(new UserMonitorReadError("unavailable"))
      .mockResolvedValueOnce({ ...coinsFix, accountId: "acct_local", nextCursor: "c3" })
      .mockResolvedValueOnce({ ...coinsFix, accountId: "acct_local", nextCursor: "c2" });
    const c = client({ coins: coins as UserMonitorClient["coins"] });
    const { result } = rh(c);
    act(() => result.current.start());
    act(() => result.current.selectAccount("acct_local"));
    await flush();
    await act(async () => result.current.pageCoins("next"));
    await flush();
    expect(calls(c.coins).at(-1)?.[1]).toEqual({ limit: 20, cursor: "c2" });
    expect(result.current.coinsHasPrev).toBe(false);
    await act(async () => result.current.retry("coins"));
    await flush();
    expect(calls(c.coins).at(-1)?.[1]).toEqual({ limit: 20, cursor: "c2" });
    expect(result.current.coinsHasPrev).toBe(true);
    act(() => result.current.pageCoins("prev"));
    expect(calls(c.coins).at(-1)?.[1]).toEqual({ limit: 20 });
  });
});
