import { describe, expect, test, vi } from "vitest";
import {
  AdminUsageLedgerClient,
  USAGE_LEDGER_SCHEMA_VERSION,
  UsageLedgerReadError,
  createAdminUsageLedgerClient,
  type AdminUsageLedgerSummary,
  type UsageLedgerCategory,
  type UsageLedgerMetrics,
  type UsageLedgerWindowId
} from "../app/admin-usage-ledger-client";

const SIGNAL = new AbortController().signal;
const PATH = "/api/admin/platform/user-monitor/usage-ledger-summary";
const CUTOFF = "2026-10-16T12:00:00.000Z";
const LARGE = "9007199254740993";
const SIGNED64_MAX = "9223372036854775807";
const MAX_RESPONSE_BYTES = 262_144;
const CATEGORIES = ["local_vless", "local_hy2", "local_tuic", "sgp_vless", "sgp_hy2", "other_sources"] as const;
const WINDOW_IDS = ["all_time", "last_24h", "last_7d", "month_to_date"] as const;
const MESSAGES = {
  session: "Admin session required.",
  permission: "Admin permission denied.",
  unavailable: "Admin usage ledger is unavailable.",
  invalid: "Admin usage ledger response is invalid.",
  network: "Admin usage ledger request failed."
} as const;
const LEAK = /secret|token=|password|must-not-leak|Failed to fetch|internal_error|ops@example|https?:\/\/|SQL|SELECT |credentialRef|account_id/i;

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}

function streamedResponse(chunks: Uint8Array[], options: {
  cancel?: UnderlyingSource<Uint8Array>["cancel"];
  headers?: HeadersInit;
} = {}) {
  let next = 0;
  const pull = vi.fn((controller: ReadableStreamDefaultController<Uint8Array>) => {
    if (next === chunks.length) controller.close();
    else controller.enqueue(chunks[next++]!);
  });
  const cancel = vi.fn(options.cancel ?? (() => undefined));
  const stream = new ReadableStream<Uint8Array>({ pull, cancel }, { highWaterMark: 0 });
  return { response: new Response(stream, { headers: options.headers }), pull, cancel };
}

function clientWith(fetcher: typeof fetch) {
  return createAdminUsageLedgerClient({ fetcher });
}

function coverage(over: Record<string, unknown> = {}) {
  return {
    customerClassification: "not_available",
    population: "all_recorded_accounts",
    sourceClassification: "stored_pairs_not_current_activation",
    thirdPartyUsage: "not_metered_here",
    missingIntervals: "unknown",
    collectorHealth: "not_assessed",
    timestamps: "observation_time_not_commit_time",
    emptySamples: "not_proven_zero_consumption",
    reconciliation: "aggregate_totals_only",
    ...over
  };
}

function emptyMetrics(): UsageLedgerMetrics {
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

function emptySources() {
  return CATEGORIES.map((category) => ({ category, ...emptyMetrics() }));
}

function windowBounds(cutoff = CUTOFF) {
  const timestamp = Date.parse(cutoff);
  return [
    { id: "all_time" as const, from: null, to: cutoff },
    { id: "last_24h" as const, from: new Date(timestamp - 86_400_000).toISOString(), to: cutoff },
    { id: "last_7d" as const, from: new Date(timestamp - 7 * 86_400_000).toISOString(), to: cutoff },
    { id: "month_to_date" as const, from: `${cutoff.slice(0, 7)}-01T00:00:00.000Z`, to: cutoff }
  ];
}

function emptyWindows(cutoff = CUTOFF) {
  return windowBounds(cutoff).map((bound) => ({ ...bound, ...emptyMetrics(), sources: emptySources() }));
}

function recon(over: Record<string, unknown> = {}) {
  return {
    scope: "entire_database_snapshot",
    aggregateOnly: true,
    state: "totals_match",
    samples: { sampleCount: 0, uploadBytes: "0", downloadBytes: "0", totalBytes: "0" },
    rollups: { rollupCount: 0, uploadBytes: "0", downloadBytes: "0", totalBytes: "0" },
    differenceBytes: { uploadBytes: "0", downloadBytes: "0", totalBytes: "0" },
    futureSampleCount: 0,
    atCutoffSampleCount: 0,
    orphanSampleAccountCount: 0,
    orphanRollupAccountCount: 0,
    accountIds: ["must-not-leak"],
    ...over
  };
}

function body(over: Record<string, unknown> = {}) {
  return {
    schemaVersion: USAGE_LEDGER_SCHEMA_VERSION,
    cutoff: CUTOFF,
    timezone: "UTC",
    unit: "bytes",
    windows: emptyWindows(),
    reconciliation: recon(),
    coverage: coverage(),
    email: "ops@example.com",
    token: "secret",
    ...over
  };
}

function setSource(
  sources: ReturnType<typeof emptySources>,
  category: UsageLedgerCategory,
  metrics: Partial<ReturnType<typeof emptyMetrics>>
) {
  return sources.map((source) => source.category === category ? { ...source, ...metrics, category } : source);
}

function conservedWindow(
  id: UsageLedgerWindowId,
  cutoff: string,
  sources: ReturnType<typeof emptySources>,
  positiveAccountCount: number
) {
  const bound = windowBounds(cutoff).find((item) => item.id === id)!;
  const upload = sources.reduce((sum, source) => sum + BigInt(source.uploadBytes), 0n);
  const download = sources.reduce((sum, source) => sum + BigInt(source.downloadBytes), 0n);
  const total = upload + download;
  const sampleCount = sources.reduce((sum, source) => sum + source.sampleCount, 0);
  const latest = sources
    .map((source) => source.latestObservedAt)
    .filter((value): value is string => value !== null)
    .sort()
    .at(-1) ?? null;
  const state = sampleCount === 0 ? "not_collected" : total === 0n ? "measured_zero" : "measured";
  return {
    ...bound,
    state,
    sampleCount,
    positiveAccountCount,
    uploadBytes: upload.toString(),
    downloadBytes: download.toString(),
    totalBytes: total.toString(),
    latestObservedAt: latest,
    sources
  };
}

function measuredSources() {
  return setSource(
    setSource(emptySources(), "local_vless", {
      state: "measured",
      sampleCount: 1,
      positiveAccountCount: 1,
      uploadBytes: "1",
      downloadBytes: "2",
      totalBytes: "3",
      latestObservedAt: "2026-10-16T10:00:00.000Z"
    }),
    "local_hy2",
    {
      state: "measured",
      sampleCount: 1,
      positiveAccountCount: 1,
      uploadBytes: "4",
      downloadBytes: "5",
      totalBytes: "9",
      latestObservedAt: "2026-10-16T11:00:00.000Z"
    }
  );
}

function measuredWindows(cutoff = CUTOFF) {
  return WINDOW_IDS.map((id) => conservedWindow(id, cutoff, measuredSources(), 1));
}

function measuredBody(over: Record<string, unknown> = {}) {
  return body({
    windows: measuredWindows(),
    reconciliation: recon({
      samples: { sampleCount: 2, uploadBytes: "5", downloadBytes: "7", totalBytes: "12" },
      rollups: { rollupCount: 1, uploadBytes: "5", downloadBytes: "7", totalBytes: "12" }
    }),
    ...over
  });
}

async function expectSafeError(promise: Promise<unknown>, code: keyof typeof MESSAGES) {
  const error = await promise.then(
    () => {
      throw new Error("expected UsageLedgerReadError");
    },
    (value) => value
  );
  expect(error).toBeInstanceOf(UsageLedgerReadError);
  expect(error).toMatchObject({ name: "UsageLedgerReadError", code, message: MESSAGES[code] });
  expect((error as Error).cause).toBeUndefined();
  expect(String(error)).not.toMatch(LEAK);
}

describe("admin usage ledger client", () => {
  test("factory returns the client class and GET uses exact same-origin transport with no query", async () => {
    const fetcher = vi.fn<typeof fetch>(async () => jsonResponse(measuredBody()));
    const client = clientWith(fetcher);
    expect(client).toBeInstanceOf(AdminUsageLedgerClient);
    const result = await client.summary(SIGNAL);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(String(fetcher.mock.calls[0]?.[0])).toBe(PATH);
    expect(fetcher.mock.calls[0]?.[1]).toEqual({
      method: "GET",
      credentials: "same-origin",
      cache: "no-store",
      redirect: "error",
      signal: SIGNAL
    });
    expect(String(fetcher.mock.calls[0]?.[0])).not.toContain("?");
    expect(result.schemaVersion).toBe(USAGE_LEDGER_SCHEMA_VERSION);
    expect(result.windows.map((window) => window.id)).toEqual([...WINDOW_IDS]);
    expect(result.windows[0]?.sources.map((source) => source.category)).toEqual([...CATEGORIES]);
    expect(result.windows[0]?.positiveAccountCount).toBe(1);
    expect(result.windows[0]?.sampleCount).toBe(2);
    expect(result.windows[0]?.totalBytes).toBe("12");
    expect(JSON.stringify(result)).not.toMatch(LEAK);
    expect(result).not.toHaveProperty("email");
    expect(result.reconciliation).not.toHaveProperty("accountIds");
  });

  test("omitting AbortSignal still uses GET same-origin and does not write localStorage", async () => {
    const fetcher = vi.fn<typeof fetch>(async () => jsonResponse(body()));
    const setItem = vi.spyOn(Storage.prototype, "setItem");
    await clientWith(fetcher).summary();
    expect(fetcher.mock.calls[0]?.[1]).toEqual({
      method: "GET",
      credentials: "same-origin",
      cache: "no-store",
      redirect: "error"
    });
    expect(setItem).not.toHaveBeenCalled();
    setItem.mockRestore();
  });

  test("keeps large byte strings exact and does not coerce them to Number", async () => {
    const sources = setSource(emptySources(), "local_vless", {
      state: "measured",
      sampleCount: 1,
      positiveAccountCount: 1,
      uploadBytes: LARGE,
      downloadBytes: "6",
      totalBytes: "9007199254740999",
      latestObservedAt: "2026-10-16T11:00:00.000Z"
    });
    const windows = WINDOW_IDS.map((id) => conservedWindow(id, CUTOFF, sources, 1));
    const result = await clientWith(vi.fn<typeof fetch>(async () => jsonResponse(body({
      windows,
      reconciliation: recon({
        samples: { sampleCount: 1, uploadBytes: LARGE, downloadBytes: "6", totalBytes: "9007199254740999" },
        rollups: { rollupCount: 1, uploadBytes: LARGE, downloadBytes: "6", totalBytes: "9007199254740999" }
      })
    })))).summary();
    expect(result.windows[0]?.uploadBytes).toBe(LARGE);
    expect(result.windows[0]?.totalBytes).toBe("9007199254740999");
    expect(typeof result.windows[0]?.uploadBytes).toBe("string");
    expect(Number(result.windows[0]?.uploadBytes)).not.toBe(result.windows[0]?.uploadBytes);
    expect(result.reconciliation.samples.uploadBytes).toBe(LARGE);
  });

  test("accepts signed64-max bytes and empty windows as not_collected", async () => {
    const sources = setSource(emptySources(), "other_sources", {
      state: "measured",
      sampleCount: 1,
      positiveAccountCount: 1,
      uploadBytes: SIGNED64_MAX,
      downloadBytes: "0",
      totalBytes: SIGNED64_MAX,
      latestObservedAt: "2026-10-16T11:00:00.000Z"
    });
    const windows = WINDOW_IDS.map((id) => conservedWindow(id, CUTOFF, sources, 1));
    const result = await clientWith(vi.fn<typeof fetch>(async () => jsonResponse(body({
      windows,
      reconciliation: recon({
        samples: { sampleCount: 1, uploadBytes: SIGNED64_MAX, downloadBytes: "0", totalBytes: SIGNED64_MAX },
        rollups: { rollupCount: 1, uploadBytes: SIGNED64_MAX, downloadBytes: "0", totalBytes: SIGNED64_MAX }
      })
    })))).summary();
    expect(result.windows[0]?.totalBytes).toBe(SIGNED64_MAX);
    const empty = await clientWith(vi.fn<typeof fetch>(async () => jsonResponse(body()))).summary();
    for (const window of empty.windows) {
      expect(window.state).toBe("not_collected");
      expect(window.totalBytes).toBe("0");
      expect(window.latestObservedAt).toBeNull();
    }
  });

  test("same-window source bytes and samples conserve while positive counts stay non-additive", async () => {
    const result = await clientWith(vi.fn<typeof fetch>(async () => jsonResponse(measuredBody()))).summary();
    const window = result.windows[0]!;
    const sourceUpload = window.sources.reduce((sum, source) => sum + BigInt(source.uploadBytes), 0n);
    const sourceSamples = window.sources.reduce((sum, source) => sum + source.sampleCount, 0);
    const sourcePositive = window.sources.reduce((sum, source) => sum + source.positiveAccountCount, 0);
    expect(sourceUpload.toString()).toBe(window.uploadBytes);
    expect(sourceSamples).toBe(window.sampleCount);
    expect(sourcePositive).toBe(2);
    expect(window.positiveAccountCount).toBe(1);
  });

  test("UTC month rollover keeps exact half-open month_to_date boundaries", async () => {
    const cutoff = "2024-03-01T00:00:00.000Z";
    const result = await clientWith(vi.fn<typeof fetch>(async () => jsonResponse(body({
      cutoff,
      windows: emptyWindows(cutoff)
    })))).summary();
    expect(result.windows.find((window) => window.id === "last_24h")?.from).toBe("2024-02-29T00:00:00.000Z");
    const month = result.windows.find((window) => window.id === "month_to_date");
    expect(month?.from).toBe("2024-03-01T00:00:00.000Z");
    expect(month?.to).toBe(cutoff);
    expect(month?.state).toBe("not_collected");
  });

  test("measured_zero stays distinct from empty and mismatch reports signed differences and orphans", async () => {
    const zeroSources = setSource(emptySources(), "local_tuic", {
      state: "measured_zero",
      sampleCount: 2,
      positiveAccountCount: 0,
      uploadBytes: "0",
      downloadBytes: "0",
      totalBytes: "0",
      latestObservedAt: "2026-10-16T11:00:00.000Z"
    });
    const zero = await clientWith(vi.fn<typeof fetch>(async () => jsonResponse(body({
      windows: WINDOW_IDS.map((id) => conservedWindow(id, CUTOFF, zeroSources, 0)),
      reconciliation: recon({
        samples: { sampleCount: 2, uploadBytes: "0", downloadBytes: "0", totalBytes: "0" },
        rollups: { rollupCount: 2, uploadBytes: "0", downloadBytes: "0", totalBytes: "0" }
      })
    })))).summary();
    expect(zero.windows[0]?.state).toBe("measured_zero");
    expect(zero.windows[0]?.sampleCount).toBe(2);
    expect(zero.windows[0]?.positiveAccountCount).toBe(0);

    const mismatch = await clientWith(vi.fn<typeof fetch>(async () => jsonResponse(measuredBody({
      reconciliation: recon({
        state: "totals_mismatch",
        samples: { sampleCount: 2, uploadBytes: "5", downloadBytes: "7", totalBytes: "12" },
        rollups: { rollupCount: 1, uploadBytes: "9", downloadBytes: "5", totalBytes: "14" },
        differenceBytes: { uploadBytes: "-4", downloadBytes: "2", totalBytes: "-2" },
        futureSampleCount: 1,
        atCutoffSampleCount: 1,
        orphanSampleAccountCount: 2,
        orphanRollupAccountCount: 1
      })
    })))).summary();
    expect(mismatch.reconciliation.state).toBe("totals_mismatch");
    expect(mismatch.reconciliation.differenceBytes).toEqual({
      uploadBytes: "-4",
      downloadBytes: "2",
      totalBytes: "-2"
    });
    expect(mismatch.reconciliation.orphanSampleAccountCount).toBe(2);
    expect(mismatch.reconciliation.futureSampleCount).toBe(1);
    expect(mismatch.reconciliation.atCutoffSampleCount).toBe(1);
    expect(JSON.stringify(mismatch)).not.toMatch(LEAK);
  });

  test.each([
    ["missing schema", { schemaVersion: "admin-usage-ledger/v0" }],
    ["wrong timezone", { timezone: "CST" }],
    ["wrong unit", { unit: "gib" }],
    ["non-canonical cutoff", { cutoff: "2026-10-16T12:00:00Z" }],
    ["invalid cutoff calendar", { cutoff: "2026-02-30T00:00:00.000Z" }],
    ["missing windows", { windows: [] }],
    ["duplicate window", { windows: [...emptyWindows().slice(0, 3), emptyWindows()[0]] }],
    ["missing category", {
      windows: emptyWindows().map((window) => ({ ...window, sources: window.sources.slice(0, 5) }))
    }],
    ["duplicate category", {
      windows: emptyWindows().map((window) => ({
        ...window,
        sources: [...window.sources.slice(0, 5), { ...window.sources[0], category: "local_vless" }]
      }))
    }],
    ["numeric bytes", {
      windows: emptyWindows().map((window) => ({ ...window, uploadBytes: 0, totalBytes: 0 }))
    }],
    ["leading zero bytes", {
      windows: emptyWindows().map((window) => ({ ...window, uploadBytes: "00" }))
    }],
    ["bytes over signed64", {
      windows: emptyWindows().map((window, index) => {
        if (index !== 0) return window;
        const sources = setSource(emptySources(), "local_vless", {
          state: "measured",
          sampleCount: 1,
          positiveAccountCount: 1,
          uploadBytes: "9223372036854775808",
          downloadBytes: "0",
          totalBytes: "9223372036854775808",
          latestObservedAt: "2026-10-16T11:00:00.000Z"
        });
        return conservedWindow("all_time", CUTOFF, sources, 1);
      })
    }],
    ["up+down mismatch", {
      windows: emptyWindows().map((window, index) => index === 0
        ? { ...window, uploadBytes: "1", downloadBytes: "1", totalBytes: "3", state: "measured", sampleCount: 1, positiveAccountCount: 1, latestObservedAt: "2026-10-16T11:00:00.000Z" }
        : window)
    }],
    ["source sum mismatch", {
      windows: emptyWindows().map((window, index) => {
        if (index !== 0) return window;
        const sources = setSource(emptySources(), "local_vless", {
          state: "measured",
          sampleCount: 1,
          positiveAccountCount: 1,
          uploadBytes: "1",
          downloadBytes: "2",
          totalBytes: "3",
          latestObservedAt: "2026-10-16T11:00:00.000Z"
        });
        return { ...conservedWindow("all_time", CUTOFF, sources, 1), totalBytes: "99" };
      })
    }],
    ["wrong window from", {
      windows: emptyWindows().map((window) => window.id === "last_24h"
        ? { ...window, from: "2026-10-15T11:00:00.000Z" }
        : window)
    }],
    ["not_collected with latest", {
      windows: emptyWindows().map((window, index) => index === 0
        ? { ...window, latestObservedAt: "2026-10-16T11:00:00.000Z" }
        : window)
    }],
    ["measured_zero without samples", {
      windows: emptyWindows().map((window, index) => index === 0
        ? { ...window, state: "measured_zero" }
        : window)
    }],
    ["coverage drift", { coverage: coverage({ collectorHealth: "healthy" }) }],
    ["recon state mismatch", {
      windows: measuredWindows(),
      reconciliation: recon({
        state: "totals_match",
        samples: { sampleCount: 2, uploadBytes: "5", downloadBytes: "7", totalBytes: "12" },
        rollups: { rollupCount: 1, uploadBytes: "1", downloadBytes: "1", totalBytes: "2" },
        differenceBytes: { uploadBytes: "4", downloadBytes: "6", totalBytes: "10" }
      })
    }],
    ["error envelope", { error: "internal_error", message: "secret token=must-not-leak" }]
  ])("rejects wrong or missing schema: %s", async (_label, over) => {
    await expectSafeError(
      clientWith(vi.fn<typeof fetch>(async () => jsonResponse(body(over)))).summary(),
      "invalid"
    );
  });

  test("rejects HTML and non-JSON success bodies without leaking raw text", async () => {
    await expectSafeError(
      clientWith(vi.fn<typeof fetch>(async () => new Response(
        "<html>secret token=must-not-leak SELECT password</html>",
        { status: 200, headers: { "Content-Type": "text/html" } }
      ))).summary(),
      "invalid"
    );
    await expectSafeError(
      clientWith(vi.fn<typeof fetch>(async () => new Response(
        "{not-json secret token=must-not-leak",
        { status: 200, headers: { "Content-Type": "application/json" } }
      ))).summary(),
      "invalid"
    );
    await expectSafeError(
      clientWith(vi.fn<typeof fetch>(async () => jsonResponse(["secret"]))).summary(),
      "invalid"
    );
  });

  test("rejects oversized response text without parsing it as success", async () => {
    await expectSafeError(
      clientWith(vi.fn<typeof fetch>(async () => new Response(
        `${"[".repeat(262_145)}secret token=must-not-leak`,
        { status: 200, headers: { "Content-Type": "application/json" } }
      ))).summary(),
      "invalid"
    );
  });

  test("accepts exactly the byte limit through the reader without calling response.text", async () => {
    const json = JSON.stringify(body());
    const bytes = new TextEncoder().encode(json.padEnd(MAX_RESPONSE_BYTES, " "));
    const { response, cancel } = streamedResponse([
      bytes.subarray(0, 1024), bytes.subarray(1024)
    ]);
    const text = vi.spyOn(response, "text");
    const result = await clientWith(vi.fn<typeof fetch>(async () => response)).summary();
    expect(result.schemaVersion).toBe(USAGE_LEDGER_SCHEMA_VERSION);
    expect(text).not.toHaveBeenCalled();
    expect(cancel).not.toHaveBeenCalled();
    expect(response.body?.locked).toBe(false);
  });

  test.each([undefined, { "Content-Length": "1" }])(
    "cancels an oversized stream at the first extra byte even with missing or misleading length: %j",
    async (headers) => {
      const { response, pull, cancel } = streamedResponse([
        new TextEncoder().encode(JSON.stringify(body()).padEnd(MAX_RESPONSE_BYTES, " ")),
        new Uint8Array([32]),
        new TextEncoder().encode("secret token=must-not-leak")
      ], { headers });
      await expectSafeError(clientWith(vi.fn<typeof fetch>(async () => response)).summary(), "invalid");
      expect(pull).toHaveBeenCalledTimes(2);
      expect(cancel).toHaveBeenCalledTimes(1);
      expect(cancel).toHaveBeenCalledWith(undefined);
      expect(response.body?.locked).toBe(false);
    }
  );

  test("counts UTF-8 bytes and cancels a single over-limit chunk before reading more", async () => {
    const bytes = new TextEncoder().encode(JSON.stringify(body({ extra: "界".repeat(90_000) })));
    expect(bytes.byteLength).toBeGreaterThan(MAX_RESPONSE_BYTES);
    const { response, pull, cancel } = streamedResponse([bytes, new Uint8Array([32])]);
    await expectSafeError(clientWith(vi.fn<typeof fetch>(async () => response)).summary(), "invalid");
    expect(pull).toHaveBeenCalledTimes(1);
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(response.body?.locked).toBe(false);
  });

  test("decodes valid UTF-8 across chunk boundaries and strips unlisted values", async () => {
    const bytes = new TextEncoder().encode(JSON.stringify(body({ extra: "界🙂" })));
    const splitAt = bytes.findIndex((byte) => byte === 0xe7) + 1;
    const { response } = streamedResponse([
      bytes.subarray(0, splitAt), bytes.subarray(splitAt, splitAt + 3), bytes.subarray(splitAt + 3)
    ]);
    const result = await clientWith(vi.fn<typeof fetch>(async () => response)).summary();
    expect(result.schemaVersion).toBe(USAGE_LEDGER_SCHEMA_VERSION);
    expect(result).not.toHaveProperty("extra");
  });

  test.each([
    ["malformed", new Uint8Array([0xc3, 0x28])],
    ["truncated", new Uint8Array([0xe7, 0x95])]
  ])("rejects %s UTF-8 without allowing replacement text in unlisted fields", async (_label, invalid) => {
    const { response } = streamedResponse([
      new TextEncoder().encode(JSON.stringify(body()).slice(0, -1) + ',"extra":"'),
      invalid,
      new TextEncoder().encode('"}')
    ]);
    await expectSafeError(clientWith(vi.fn<typeof fetch>(async () => response)).summary(), "invalid");
    expect(response.body?.locked).toBe(false);
  });

  test.each(["rejects", "stalls"])("oversize rejection does not depend on cancellation that %s", async (mode) => {
    const { response, cancel } = streamedResponse([new Uint8Array(MAX_RESPONSE_BYTES + 1)], {
      cancel: () => mode === "rejects"
        ? Promise.reject(new Error("secret token=must-not-leak"))
        : new Promise<void>(() => undefined)
    });
    await expectSafeError(clientWith(vi.fn<typeof fetch>(async () => response)).summary(), "invalid");
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(response.body?.locked).toBe(false);
  });

  test("maps body reader failures to a fixed invalid error and releases the reader", async () => {
    const response = new Response(new ReadableStream<Uint8Array>({
      pull: () => { throw new Error("secret token=must-not-leak"); }
    }, { highWaterMark: 0 }));
    await expectSafeError(clientWith(vi.fn<typeof fetch>(async () => response)).summary(), "invalid");
    expect(response.body?.locked).toBe(false);
    await expectSafeError(
      clientWith(vi.fn<typeof fetch>(async () => new Response(null))).summary(),
      "invalid"
    );
  });

  test("aborting a pending body read cancels the stream and preserves a sanitized AbortError", async () => {
    const controller = new AbortController();
    const cancel = vi.fn();
    const response = new Response(new ReadableStream<Uint8Array>({
      pull: () => { controller.abort(new Error("secret token=must-not-leak")); },
      cancel
    }, { highWaterMark: 0 }));
    const promise = clientWith(vi.fn<typeof fetch>(async () => response)).summary(controller.signal);
    await expect(promise).rejects.toMatchObject({ name: "AbortError", message: "The operation was aborted." });
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(response.body?.locked).toBe(false);
  });

  test.each([
    [401, "session", { error: "admin_authentication_required", message: "secret token=leak" }],
    [403, "permission", { error: "admin_capability_required", message: "ops@example.com" }],
    [404, "unavailable", { error: "not_found", message: "https://private.example/token=secret" }],
    [503, "unavailable", { error: "source_unavailable", message: "must-not-leak" }],
    [429, "unavailable", { error: "Too Many Requests", message: "SQL SELECT account_id" }],
    [500, "network", { error: "internal_error" }]
  ] as const)("maps HTTP %i to %s without leaking the body", async (status, code, payload) => {
    await expectSafeError(
      clientWith(vi.fn<typeof fetch>(async () => jsonResponse(payload, status))).summary(),
      code
    );
  });

  test("maps non-abort fetch failures to a fixed network error and preserves AbortError", async () => {
    await expectSafeError(
      clientWith(vi.fn<typeof fetch>(async () => {
        throw new TypeError("Failed to fetch https://secret.example/token=leak");
      })).summary(),
      "network"
    );
    const fetcher = vi.fn<typeof fetch>();
    const controller = new AbortController();
    controller.abort();
    await expect(clientWith(fetcher).summary(controller.signal)).rejects.toMatchObject({ name: "AbortError" });
    expect(fetcher).not.toHaveBeenCalled();
    const live = new AbortController();
    const aborting = vi.fn<typeof fetch>(async (_url, init) => {
      init?.signal?.throwIfAborted();
      throw new DOMException("The operation was aborted.", "AbortError");
    });
    await expect(clientWith(aborting).summary(live.signal)).rejects.toMatchObject({ name: "AbortError" });
  });

  test("whitelisted summary is assignable to the public contract", async () => {
    const result: AdminUsageLedgerSummary = await clientWith(
      vi.fn<typeof fetch>(async () => jsonResponse(measuredBody()))
    ).summary();
    expect(result.coverage.population).toBe("all_recorded_accounts");
    expect(result.reconciliation.scope).toBe("entire_database_snapshot");
  });
});
