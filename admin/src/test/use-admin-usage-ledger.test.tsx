import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  UsageLedgerReadError,
  type AdminUsageLedgerSummary,
  type UsageLedgerClient
} from "../app/admin-usage-ledger-client";
import { useAdminUsageLedger } from "../app/use-admin-usage-ledger";

const CUTOFF = "2026-10-16T12:00:00.000Z";
const CATEGORIES = ["local_vless", "local_hy2", "local_tuic", "sgp_vless", "sgp_hy2", "other_sources"] as const;

function def<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function emptyMetrics() {
  return {
    state: "not_collected" as const,
    sampleCount: 0,
    positiveAccountCount: 0,
    uploadBytes: "0",
    downloadBytes: "0",
    totalBytes: "0",
    latestObservedAt: null
  };
}

function summary(over: Partial<AdminUsageLedgerSummary> = {}): AdminUsageLedgerSummary {
  const timestamp = Date.parse(CUTOFF);
  const windows = [
    { id: "all_time" as const, from: null, to: CUTOFF },
    { id: "last_24h" as const, from: new Date(timestamp - 86_400_000).toISOString(), to: CUTOFF },
    { id: "last_7d" as const, from: new Date(timestamp - 7 * 86_400_000).toISOString(), to: CUTOFF },
    { id: "month_to_date" as const, from: "2026-10-01T00:00:00.000Z", to: CUTOFF }
  ].map((bound) => ({
    ...bound,
    ...emptyMetrics(),
    sources: CATEGORIES.map((category) => ({ category, ...emptyMetrics() }))
  }));
  return {
    schemaVersion: "admin-usage-ledger/v1",
    cutoff: CUTOFF,
    timezone: "UTC",
    unit: "bytes",
    windows,
    reconciliation: {
      scope: "entire_database_snapshot",
      aggregateOnly: true,
      state: "totals_match",
      samples: { sampleCount: 0, uploadBytes: "0", downloadBytes: "0", totalBytes: "0" },
      rollups: { rollupCount: 0, uploadBytes: "0", downloadBytes: "0", totalBytes: "0" },
      differenceBytes: { uploadBytes: "0", downloadBytes: "0", totalBytes: "0" },
      futureSampleCount: 0,
      atCutoffSampleCount: 0,
      orphanSampleAccountCount: 0,
      orphanRollupAccountCount: 0
    },
    coverage: {
      customerClassification: "not_available",
      population: "all_recorded_accounts",
      sourceClassification: "stored_pairs_not_current_activation",
      thirdPartyUsage: "not_metered_here",
      missingIntervals: "unknown",
      collectorHealth: "not_assessed",
      timestamps: "observation_time_not_commit_time",
      emptySamples: "not_proven_zero_consumption",
      reconciliation: "aggregate_totals_only"
    },
    ...over
  };
}

const emptyFix = summary();
const measuredFix = summary({
  windows: summary().windows.map((window) => ({
    ...window,
    state: "measured",
    sampleCount: 1,
    positiveAccountCount: 1,
    uploadBytes: "9007199254740993",
    downloadBytes: "0",
    totalBytes: "9007199254740993",
    latestObservedAt: "2026-10-16T11:00:00.000Z",
    sources: window.sources.map((source) => source.category === "local_vless"
      ? {
        ...source,
        state: "measured" as const,
        sampleCount: 1,
        positiveAccountCount: 1,
        uploadBytes: "9007199254740993",
        downloadBytes: "0",
        totalBytes: "9007199254740993",
        latestObservedAt: "2026-10-16T11:00:00.000Z"
      }
      : source)
  }))
});

function client(partial: Partial<UsageLedgerClient> = {}): UsageLedgerClient {
  return {
    summary: vi.fn(async () => emptyFix),
    ...partial
  };
}

async function flush() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

const calls = (fn: unknown) => (fn as ReturnType<typeof vi.fn>).mock.calls;

describe("useAdminUsageLedger", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-16T12:00:00.000Z"));
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("idles until explicit load and does not poll", async () => {
    const c = client();
    const factory = () => c;
    const { result } = renderHook(() => useAdminUsageLedger(factory));
    expect(result.current.phase).toBe("idle");
    expect(result.current.data).toBeNull();
    expect(c.summary).not.toHaveBeenCalled();
    await act(async () => {
      vi.advanceTimersByTime(60_000);
    });
    expect(c.summary).not.toHaveBeenCalled();
    act(() => {
      result.current.load();
    });
    expect(result.current.phase).toBe("loading");
    expect(result.current.data).toBeNull();
    expect(calls(c.summary)).toHaveLength(1);
    expect(calls(c.summary)[0]?.[0]).toBeInstanceOf(AbortSignal);
    await flush();
    expect(result.current.phase).toBe("ready");
    expect(result.current.data?.cutoff).toBe(CUTOFF);
    await act(async () => {
      vi.advanceTimersByTime(60_000);
    });
    expect(calls(c.summary)).toHaveLength(1);
  });

  it("refresh clears old data immediately and same-tick double refresh keeps latest ownership", async () => {
    const second = def<AdminUsageLedgerSummary>();
    let n = 0;
    const c = client({
      summary: vi.fn(() => {
        n += 1;
        if (n === 1) return Promise.resolve(measuredFix);
        return second.promise;
      }) as UsageLedgerClient["summary"]
    });
    const factory = () => c;
    const { result } = renderHook(() => useAdminUsageLedger(factory));
    act(() => result.current.refresh());
    await flush();
    expect(result.current.data?.windows[0]?.totalBytes).toBe("9007199254740993");
    act(() => {
      result.current.refresh();
      result.current.refresh();
    });
    expect(result.current.phase).toBe("loading");
    expect(result.current.data).toBeNull();
    expect(calls(c.summary)).toHaveLength(3);
    expect((calls(c.summary)[1]?.[0] as AbortSignal).aborted).toBe(true);
    await act(async () => second.resolve(emptyFix));
    await flush();
    expect(result.current.phase).toBe("ready");
    expect(result.current.data?.windows[0]?.state).toBe("not_collected");
  });

  it("ignores delayed out-of-order success and aborted predecessors", async () => {
    const first = def<AdminUsageLedgerSummary>();
    const second = def<AdminUsageLedgerSummary>();
    let n = 0;
    const c = client({
      summary: vi.fn(() => {
        n += 1;
        return n === 1 ? first.promise : second.promise;
      }) as UsageLedgerClient["summary"]
    });
    const factory = () => c;
    const { result } = renderHook(() => useAdminUsageLedger(factory));
    act(() => result.current.load());
    act(() => result.current.load());
    await act(async () => second.resolve(emptyFix));
    await flush();
    expect(result.current.data?.windows[0]?.state).toBe("not_collected");
    await act(async () => first.resolve(measuredFix));
    await flush();
    expect(result.current.data?.windows[0]?.state).toBe("not_collected");
    expect(result.current.data?.windows[0]?.totalBytes).not.toBe("9007199254740993");
    await act(async () => first.reject(new DOMException("The operation was aborted.", "AbortError")));
    await flush();
    expect(result.current.phase).toBe("ready");
    expect(result.current.data).toBeTruthy();
  });

  it("times out in-flight work, clears data, and ignores a late success", async () => {
    const pending = def<AdminUsageLedgerSummary>();
    const c = client({ summary: vi.fn(() => pending.promise) as UsageLedgerClient["summary"] });
    const factory = () => c;
    const { result } = renderHook(() => useAdminUsageLedger(factory));
    act(() => result.current.load());
    await act(async () => {
      vi.advanceTimersByTime(14_999);
    });
    expect(result.current.phase).toBe("loading");
    await act(async () => {
      vi.advanceTimersByTime(1);
    });
    expect(result.current).toMatchObject({ phase: "error", error: "timeout", data: null });
    await act(async () => pending.resolve(measuredFix));
    await flush();
    expect(result.current.data).toBeNull();
    expect(result.current.error).toBe("timeout");
  });

  it("clears data on every failure including session loss and does not leak raw messages", async () => {
    const c = client({
      summary: vi.fn(async () => {
        throw Object.assign(new UsageLedgerReadError("session"), { message: "secret token=must-not-leak" });
      }) as UsageLedgerClient["summary"]
    });
    const factory = () => c;
    const { result } = renderHook(() => useAdminUsageLedger(factory));
    act(() => result.current.load());
    await flush();
    expect(result.current).toMatchObject({ phase: "error", error: "session", data: null });
    expect(JSON.stringify(result.current)).not.toContain("must-not-leak");
    (c.summary as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error("ECONNRESET dump"));
    act(() => result.current.refresh());
    expect(result.current.data).toBeNull();
    await flush();
    expect(result.current.error).toBe("network");
    expect(JSON.stringify(result.current)).not.toContain("ECONNRESET");
  });

  it("aborts on unmount and drops the late result", async () => {
    const pending = def<AdminUsageLedgerSummary>();
    const c = client({ summary: vi.fn(() => pending.promise) as UsageLedgerClient["summary"] });
    const factory = () => c;
    const { result, unmount } = renderHook(() => useAdminUsageLedger(factory));
    act(() => result.current.load());
    const signal = calls(c.summary)[0]?.[0] as AbortSignal;
    unmount();
    expect(signal.aborted).toBe(true);
    await act(async () => pending.resolve(measuredFix));
    await flush();
  });

  it("clears data and aborts when the client factory identity changes", async () => {
    const pending = def<AdminUsageLedgerSummary>();
    const c1 = client({ summary: vi.fn(() => pending.promise) as UsageLedgerClient["summary"] });
    const c2 = client();
    const { result, rerender } = renderHook(
      ({ factory }) => useAdminUsageLedger(factory),
      { initialProps: { factory: () => c1 } }
    );
    act(() => result.current.load());
    expect(result.current.phase).toBe("loading");
    rerender({ factory: () => c2 });
    expect(result.current.phase).toBe("idle");
    expect(result.current.data).toBeNull();
    expect((calls(c1.summary)[0]?.[0] as AbortSignal).aborted).toBe(true);
    expect(c2.summary).not.toHaveBeenCalled();
    await act(async () => pending.resolve(measuredFix));
    await flush();
    expect(result.current.data).toBeNull();
    expect(result.current.phase).toBe("idle");
  });

  it("never renders a previous session's summary after the factory changes", async () => {
    const c1 = client({ summary: vi.fn(async () => measuredFix) });
    const c2 = client();
    const firstFactory = () => c1;
    const nextFactory = () => c2;
    const observed: Array<AdminUsageLedgerSummary | null> = [];
    const { result, rerender } = renderHook(({ factory }) => {
      const current = useAdminUsageLedger(factory);
      if (factory === nextFactory) observed.push(current.data);
      return current;
    }, { initialProps: { factory: firstFactory } });
    act(() => result.current.load());
    await flush();
    expect(result.current.data).toBe(measuredFix);
    rerender({ factory: nextFactory });
    expect(observed.length).toBeGreaterThan(0);
    expect(observed.every((data) => data === null)).toBe(true);
  });
});
