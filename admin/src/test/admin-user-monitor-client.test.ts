import { describe, expect, test, vi } from "vitest";
import {
  AdminUserMonitorClient,
  USER_MONITOR_SCHEMA_VERSION,
  UserMonitorReadError,
  createAdminUserMonitorClient,
  isUserMonitorAccountId,
  parseUserMonitorRange,
  parseUserMonitorUtcInput
} from "../app/admin-user-monitor-client";

const SIGNAL = new AbortController().signal;
const MESSAGES = {
  session: "Admin session required.",
  permission: "Admin permission denied.",
  unavailable: "Admin user monitor is unavailable.",
  invalid: "Admin user monitor response is invalid.",
  network: "Admin user monitor request failed."
} as const;
const LEAK = /secret|token=|password|visible-once|Failed to fetch|internal_error|must-not-leak|ops@example|https?:\/\/|edgecred_|subscriptionUrl|materialRef|credentialRef|displayName|ownerRef/i;
const FROM = "2026-09-11T16:00:00.000Z";
const TO = "2026-09-12T16:00:00.000Z";
const GEN = "2026-09-12T16:00:00.000Z";
const RANGE = { from: FROM, to: TO };

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}

function clientWith(fetcher: typeof fetch) {
  return createAdminUserMonitorClient({ fetcher });
}

function zeroDayPoints(fromIso: string, toIso: string): Array<{ at: string; registeredCount: number; otherCreatedCount: number }> {
  const toMs = Date.parse(toIso);
  const fromDate = new Date(Date.parse(fromIso));
  const points: Array<{ at: string; registeredCount: number; otherCreatedCount: number }> = [];
  for (
    let time = Date.UTC(fromDate.getUTCFullYear(), fromDate.getUTCMonth(), fromDate.getUTCDate());
    time < toMs;
    time += 86_400_000
  ) {
    points.push({ at: new Date(time).toISOString(), registeredCount: 0, otherCreatedCount: 0 });
  }
  return points;
}

function growthBody(over: Record<string, unknown> = {}) {
  const from = typeof over.from === "string" ? over.from : FROM;
  const to = typeof over.to === "string" ? over.to : TO;
  return {
    schemaVersion: USER_MONITOR_SCHEMA_VERSION,
    generatedAt: GEN,
    from,
    to,
    timezone: "UTC",
    registeredCount: 0,
    otherCreatedCount: 0,
    points: zeroDayPoints(from, to),
    email: "ops@example.com",
    ...over
  };
}

function accountsBody(over: Record<string, unknown> = {}) {
  return {
    schemaVersion: USER_MONITOR_SCHEMA_VERSION,
    generatedAt: GEN,
    items: [],
    nextCursor: null,
    displayName: "must-not-leak",
    ...over
  };
}

function coinsBody(over: Record<string, unknown> = {}) {
  return {
    schemaVersion: USER_MONITOR_SCHEMA_VERSION,
    generatedAt: GEN,
    accountId: "acct_local",
    wallet: {
      status: "active",
      version: 1,
      balances: { paidCoins: 0, bonusCoins: 0, rewardCoins: 0 },
      spendableUnits: 0,
      heldUnits: 0,
      pendingUnits: 0
    },
    entries: [],
    nextCursor: null,
    ownerRef: "must-not-leak",
    ...over
  };
}

function trafficBody(over: Record<string, unknown> = {}) {
  return {
    schemaVersion: USER_MONITOR_SCHEMA_VERSION,
    generatedAt: GEN,
    accountId: "acct_local",
    from: FROM,
    to: TO,
    bucket: "day",
    state: "not_collected",
    sampleCount: 0,
    lastObservedAt: null,
    totalBytes: null,
    uploadBytes: null,
    downloadBytes: null,
    points: [],
    credentialRef: "must-not-leak",
    ...over
  };
}

async function expectSafeError(promise: Promise<unknown>, code: keyof typeof MESSAGES) {
  const error = await promise.then(
    () => {
      throw new Error("expected UserMonitorReadError");
    },
    (value) => value
  );
  expect(error).toBeInstanceOf(UserMonitorReadError);
  expect(error).toMatchObject({ name: "UserMonitorReadError", code, message: MESSAGES[code] });
  expect((error as Error).cause).toBeUndefined();
  expect(String(error)).not.toMatch(LEAK);
}

describe("admin user monitor client", () => {
  test("factory returns the client class and four GETs use exact same-origin transport", async () => {
    const fetcher = vi.fn<typeof fetch>(async (path) => {
      const url = new URL(String(path), "http://admin.local");
      if (url.pathname.endsWith("/growth")) return jsonResponse(growthBody());
      if (url.pathname.endsWith("/accounts")) return jsonResponse(accountsBody());
      if (url.pathname.endsWith("/coins")) return jsonResponse(coinsBody());
      return jsonResponse(trafficBody());
    });
    const client = clientWith(fetcher);
    expect(client).toBeInstanceOf(AdminUserMonitorClient);
    await client.growth(RANGE, SIGNAL);
    await client.accounts(undefined, SIGNAL);
    await client.coins("acct_local", { limit: 20 }, SIGNAL);
    await client.traffic("acct_local", { ...RANGE, bucket: "day" }, SIGNAL);
    const paths = fetcher.mock.calls.map((call) => String(call[0]));
    expect(paths).toEqual([
      `/api/admin/platform/user-monitor/growth?from=${encodeURIComponent(FROM)}&to=${encodeURIComponent(TO)}`,
      "/api/admin/platform/user-monitor/accounts?limit=20",
      "/api/admin/platform/user-monitor/accounts/acct_local/coins?limit=20",
      `/api/admin/platform/user-monitor/accounts/acct_local/traffic?from=${encodeURIComponent(FROM)}&to=${encodeURIComponent(TO)}&bucket=day`
    ]);
    for (const call of fetcher.mock.calls) {
      expect(call[1]).toEqual({
        method: "GET",
        credentials: "same-origin",
        cache: "no-store",
        redirect: "error",
        signal: SIGNAL
      });
    }
    expect(paths.join("\n")).not.toContain("/collect");
  });

  test("omitting AbortSignal still uses GET same-origin and does not store credentials", async () => {
    const fetcher = vi.fn<typeof fetch>(async () => jsonResponse(growthBody()));
    await clientWith(fetcher).growth(RANGE);
    expect(fetcher.mock.calls[0]?.[1]).toEqual({
      method: "GET",
      credentials: "same-origin",
      cache: "no-store",
      redirect: "error"
    });
  });

  test("forwards only allowed query keys, normalizes timezone-qualified range, and keeps opaque cursors", async () => {
    const fetcher = vi.fn<typeof fetch>(async (path) => {
      const url = new URL(String(path), "http://admin.local");
      if (url.pathname.endsWith("/growth")) return jsonResponse(growthBody());
      if (url.pathname.endsWith("/accounts")) {
        return jsonResponse(accountsBody({
          items: [{
            id: "acct_local",
            status: "active",
            createdAt: "2026-09-12T00:00:00.000Z",
            registrationSource: "self_service_portal",
            email: "ops@example.com",
            displayName: "Ada",
            ownerRef: "owner_1",
            metadata: { token: "secret" }
          }],
          nextCursor: "c2_opaque"
        }));
      }
      if (url.pathname.endsWith("/coins")) {
        return jsonResponse(coinsBody({
          nextCursor: "c2_opaque",
          entries: [{
            entryRef: "ent_credit",
            occurredAt: "2026-09-12T15:00:00.000Z",
            category: "credit",
            coinType: "paid_coins",
            amountUnits: 10,
            availableDeltaUnits: null,
            pendingDeltaUnits: null,
            heldDeltaUnits: null,
            totalDeltaUnits: 10
          }]
        }));
      }
      return jsonResponse(trafficBody());
    });
    const client = clientWith(fetcher);
    const growth = await client.growth({ from: "2026-09-11T18:00:00+02:00", to: "2026-09-12T18:00:00+02:00" });
    expect(growth).toMatchObject({
      from: FROM,
      to: TO,
      timezone: "UTC",
      registeredCount: 0,
      otherCreatedCount: 0,
      points: zeroDayPoints(FROM, TO)
    });
    expect(growth).not.toHaveProperty("schemaVersion");
    expect(JSON.stringify(growth)).not.toMatch(LEAK);
    const growthUrl = new URL(String(fetcher.mock.calls[0]?.[0]), "http://admin.local");
    expect([...growthUrl.searchParams.keys()]).toEqual(["from", "to"]);

    const page = await client.accounts({
      accountId: "acct_local",
      status: "active",
      cursor: "c1_opaque",
      limit: 20,
      extra: "drop"
    } as { accountId: string; status: "active"; cursor: string; limit: number; extra: string });
    expect(page.items).toEqual([{
      id: "acct_local",
      status: "active",
      createdAt: "2026-09-12T00:00:00.000Z",
      registrationSource: "self_service_portal"
    }]);
    expect(page.nextCursor).toBe("c2_opaque");
    expect(JSON.stringify(page)).not.toMatch(LEAK);
    const accountsUrl = new URL(String(fetcher.mock.calls[1]?.[0]), "http://admin.local");
    expect([...accountsUrl.searchParams.keys()]).toEqual(["accountId", "status", "cursor", "limit"]);
    expect(accountsUrl.searchParams.get("cursor")).toBe("c1_opaque");

    await client.coins("acct_local", { cursor: "c2_opaque", limit: 20 });
    const coinsUrl = new URL(String(fetcher.mock.calls[2]?.[0]), "http://admin.local");
    expect(coinsUrl.pathname).toBe("/api/admin/platform/user-monitor/accounts/acct_local/coins");
    expect([...coinsUrl.searchParams.keys()]).toEqual(["cursor", "limit"]);
    expect(coinsUrl.searchParams.get("from")).toBeNull();
  });

  test.each([
    [{ from: "not-a-date", to: TO }],
    [{ from: "2026-02-30T00:00:00.000Z", to: "2026-03-01T00:00:00.000Z" }],
    [{ from: TO, to: FROM }],
    [{ from: FROM, to: FROM }],
    [{ from: "2026-09-01T00:00:00.000Z", to: "2026-10-02T00:00:00.001Z" }],
    [{ from: "2026-09-12", to: TO }],
    [{ from: 1, to: TO }]
  ])("rejects invalid growth range %j before fetch", async (range) => {
    const fetcher = vi.fn<typeof fetch>();
    await expectSafeError(clientWith(fetcher).growth(range as never), "invalid");
    expect(fetcher).not.toHaveBeenCalled();
  });

  test("accepts a bounded 31-day from<to window and UTC input helpers", async () => {
    const fetcher = vi.fn<typeof fetch>(async () => jsonResponse(growthBody({
      from: "2026-09-01T00:00:00.000Z",
      to: "2026-10-02T00:00:00.000Z"
    })));
    await clientWith(fetcher).growth({ from: "2026-09-01T00:00:00.000Z", to: "2026-10-02T00:00:00.000Z" });
    expect(parseUserMonitorUtcInput("2026-09-01T00:00")).toBe("2026-09-01T00:00:00.000Z");
    expect(parseUserMonitorRange("2026-09-01T00:00:00.000Z", "2026-10-02T00:00:00.000Z")).toEqual({
      from: "2026-09-01T00:00:00.000Z",
      to: "2026-10-02T00:00:00.000Z"
    });
    expect(parseUserMonitorRange("2026-09-01T00:00:00.000Z", "2026-10-02T00:00:00.001Z")).toBeNull();
    expect(isUserMonitorAccountId("acct_local")).toBe(true);
    expect(isUserMonitorAccountId("ops@example.com")).toBe(false);
  });

  test.each([
    [{ accountId: "bad id" }],
    [{ accountId: "ops@example.com" }],
    [{ status: "pending" }],
    [{ cursor: "abc=" }],
    [{ cursor: "a/b" }],
    [{ limit: 0 }],
    [{ limit: 101 }]
  ])("rejects invalid directory query %j before fetch", async (query) => {
    const fetcher = vi.fn<typeof fetch>();
    await expectSafeError(clientWith(fetcher).accounts(query as never), "invalid");
    expect(fetcher).not.toHaveBeenCalled();
  });

  test("maps real zero, not_created wallet, not_collected traffic, measured_zero, and gap points", async () => {
    const growthFetcher = vi.fn<typeof fetch>(async () => jsonResponse(growthBody({
      registeredCount: 2,
      otherCreatedCount: 1,
      points: [
        { at: "2026-09-11T00:00:00.000Z", registeredCount: 2, otherCreatedCount: 0, token: "secret" },
        { at: "2026-09-12T00:00:00.000Z", registeredCount: 0, otherCreatedCount: 1 }
      ]
    })));
    const growth = await clientWith(growthFetcher).growth(RANGE);
    expect(growth.registeredCount).toBe(2);
    expect(growth.points).toEqual([
      { at: "2026-09-11T00:00:00.000Z", registeredCount: 2, otherCreatedCount: 0 },
      { at: "2026-09-12T00:00:00.000Z", registeredCount: 0, otherCreatedCount: 1 }
    ]);
    expect(JSON.stringify(growth)).not.toMatch(LEAK);

    const zeroGrowth = await clientWith(vi.fn<typeof fetch>(async () => jsonResponse(growthBody()))).growth(RANGE);
    expect(zeroGrowth.registeredCount).toBe(0);
    expect(zeroGrowth.otherCreatedCount).toBe(0);

    const missingWallet = await clientWith(vi.fn<typeof fetch>(async () => jsonResponse(coinsBody({
      wallet: {
        status: "not_created",
        version: 0,
        balances: { paidCoins: 0, bonusCoins: 0, rewardCoins: 0 },
        spendableUnits: 0,
        heldUnits: 0,
        pendingUnits: 0
      },
      relatedOrderRef: "ord_secret"
    })))).coins("acct_local");
    expect(missingWallet.wallet.status).toBe("not_created");
    expect(missingWallet.wallet.balances).toEqual({ paidCoins: 0, bonusCoins: 0, rewardCoins: 0 });
    expect(JSON.stringify(missingWallet)).not.toContain("ord_secret");

    const notCollected = await clientWith(vi.fn<typeof fetch>(async () => jsonResponse(trafficBody()))).traffic("acct_local", RANGE);
    expect(notCollected).toMatchObject({
      state: "not_collected",
      totalBytes: null,
      uploadBytes: null,
      downloadBytes: null,
      points: []
    });

    const measuredZero = await clientWith(vi.fn<typeof fetch>(async () => jsonResponse(trafficBody({
      state: "measured_zero",
      sampleCount: 2,
      lastObservedAt: "2026-09-12T15:00:00.000Z",
      totalBytes: 0,
      uploadBytes: 0,
      downloadBytes: 0,
      points: [{ at: "2026-09-12T00:00:00.000Z", sampleCount: 2, uploadBytes: 0, downloadBytes: 0, totalBytes: 0 }]
    })))).traffic("acct_local", RANGE);
    expect(measuredZero.totalBytes).toBe(0);
    expect(measuredZero.points).toHaveLength(1);

    const gapped = await clientWith(vi.fn<typeof fetch>(async () => jsonResponse(trafficBody({
      state: "measured",
      bucket: "hour",
      sampleCount: 2,
      lastObservedAt: "2026-09-12T12:00:00.000Z",
      totalBytes: 30,
      uploadBytes: 10,
      downloadBytes: 20,
      points: [
        { at: "2026-09-11T16:00:00.000Z", sampleCount: 1, uploadBytes: 4, downloadBytes: 6, totalBytes: 10 },
        { at: "2026-09-12T12:00:00.000Z", sampleCount: 1, uploadBytes: 6, downloadBytes: 14, totalBytes: 20 }
      ]
    })))).traffic("acct_local", { ...RANGE, bucket: "hour" });
    expect(gapped.points.map((point) => point.at)).toEqual([
      "2026-09-11T16:00:00.000Z",
      "2026-09-12T12:00:00.000Z"
    ]);
    expect(gapped.points).toHaveLength(2);
  });

  test("rejects mismatched growth sums, unknown enums, unsafe ids, and padded not_collected totals", async () => {
    await expectSafeError(
      clientWith(vi.fn<typeof fetch>(async () => jsonResponse(growthBody({ registeredCount: 3 })))).growth(RANGE),
      "invalid"
    );
    await expectSafeError(
      clientWith(vi.fn<typeof fetch>(async () => jsonResponse(accountsBody({
        items: [{ id: "acct_local", status: "locked", createdAt: GEN, registrationSource: "other" }]
      })))).accounts(),
      "invalid"
    );
    await expectSafeError(clientWith(vi.fn<typeof fetch>()).coins("ops@example.com"), "invalid");
    await expectSafeError(
      clientWith(vi.fn<typeof fetch>(async () => jsonResponse(trafficBody({ totalBytes: 0 })))).traffic("acct_local", RANGE),
      "invalid"
    );
    await expectSafeError(
      clientWith(vi.fn<typeof fetch>(async () => jsonResponse({
        ...coinsBody(),
        schemaVersion: "admin-user-monitor/v0"
      }))).coins("acct_local"),
      "invalid"
    );
  });

  test.each([
    [401, "session", { error: "admin_authentication_required", message: "secret token=leak" }],
    [403, "permission", { error: "admin_capability_required", message: "ops@example.com" }],
    [404, "unavailable", { error: "account_not_found", message: "https://private.example/token=secret" }],
    [503, "unavailable", { error: "source_unavailable", message: "must-not-leak" }],
    [400, "invalid", { error: "invalid_query", message: "SQL" }],
    [500, "network", { error: "internal_error" }]
  ] as const)("maps HTTP %i to %s without leaking the body", async (status, code, body) => {
    await expectSafeError(
      clientWith(vi.fn<typeof fetch>(async () => jsonResponse(body, status))).accounts(),
      code
    );
  });

  test("maps non-abort fetch failures to a fixed network error and preserves AbortError", async () => {
    await expectSafeError(
      clientWith(vi.fn<typeof fetch>(async () => {
        throw new TypeError("Failed to fetch https://secret.example/token=leak");
      })).growth(RANGE),
      "network"
    );
    const fetcher = vi.fn<typeof fetch>();
    const controller = new AbortController();
    controller.abort();
    await expect(clientWith(fetcher).accounts(undefined, controller.signal)).rejects.toMatchObject({ name: "AbortError" });
    expect(fetcher).not.toHaveBeenCalled();
    const live = new AbortController();
    const aborting = vi.fn<typeof fetch>(async (_url, init) => {
      init?.signal?.throwIfAborted();
      throw new DOMException("The operation was aborted.", "AbortError");
    });
    await expect(clientWith(aborting).growth(RANGE, live.signal)).rejects.toMatchObject({ name: "AbortError" });
  });

  test("rejects incomplete growth days, bad ledger tuples, wallet spendable mismatch, and empty measured_zero", async () => {
    await expectSafeError(
      clientWith(vi.fn<typeof fetch>(async () => jsonResponse(growthBody({ points: [] })))).growth(RANGE),
      "invalid"
    );
    await expectSafeError(
      clientWith(vi.fn<typeof fetch>(async () => jsonResponse(coinsBody({
        entries: [{
          entryRef: "ent_held",
          occurredAt: "2026-09-12T15:00:00.000Z",
          category: "available_to_held",
          coinType: "paid_coins",
          amountUnits: 10,
          availableDeltaUnits: -10,
          pendingDeltaUnits: 0,
          heldDeltaUnits: 10,
          totalDeltaUnits: -10
        }]
      })))).coins("acct_local"),
      "invalid"
    );
    await expectSafeError(
      clientWith(vi.fn<typeof fetch>(async () => jsonResponse(coinsBody({
        wallet: {
          status: "active",
          version: 1,
          balances: { paidCoins: 4, bonusCoins: 1, rewardCoins: 0 },
          spendableUnits: 3,
          heldUnits: 0,
          pendingUnits: 0
        }
      })))).coins("acct_local"),
      "invalid"
    );
    await expectSafeError(
      clientWith(vi.fn<typeof fetch>(async () => jsonResponse(coinsBody({
        wallet: {
          status: "active",
          version: 1,
          balances: { bonusCoins: 0, rewardCoins: 0 },
          spendableUnits: 0,
          heldUnits: 0,
          pendingUnits: 0
        }
      })))).coins("acct_local"),
      "invalid"
    );
    await expectSafeError(
      clientWith(vi.fn<typeof fetch>(async () => jsonResponse(coinsBody({
        wallet: {
          status: "not_created",
          version: 1,
          balances: { paidCoins: 0, bonusCoins: 0, rewardCoins: 0 },
          spendableUnits: 0,
          heldUnits: 0,
          pendingUnits: 0
        }
      })))).coins("acct_local"),
      "invalid"
    );
    await expectSafeError(
      clientWith(vi.fn<typeof fetch>(async () => jsonResponse(coinsBody({
        wallet: {
          status: "not_created",
          version: 0,
          balances: { paidCoins: 0, bonusCoins: 0, rewardCoins: 0 },
          spendableUnits: 0,
          heldUnits: 0,
          pendingUnits: 0
        },
        entries: [{
          entryRef: "ent_credit",
          occurredAt: "2026-09-12T15:00:00.000Z",
          category: "credit",
          coinType: "paid_coins",
          amountUnits: 1,
          availableDeltaUnits: null,
          pendingDeltaUnits: null,
          heldDeltaUnits: null,
          totalDeltaUnits: 1
        }]
      })))).coins("acct_local"),
      "invalid"
    );
    await expectSafeError(
      clientWith(vi.fn<typeof fetch>(async () => jsonResponse(trafficBody({
        state: "measured_zero",
        sampleCount: 0,
        lastObservedAt: null,
        totalBytes: 0,
        uploadBytes: 0,
        downloadBytes: 0,
        points: []
      })))).traffic("acct_local", RANGE),
      "invalid"
    );
  });

  test("accepts portal ledger tuples, directory order, and default traffic bucket day", async () => {
    const tuples = [
      ["credit", null, null, null, 10],
      ["pending_to_reversed", 0, -10, 0, -10],
      ["available_to_reversed", -10, 0, 0, -10],
      ["pending_to_available", 10, -10, 0, 0],
      ["available_to_held", -10, 0, 10, 0],
      ["held_to_available", 10, 0, -10, 0],
      ["held_to_consumed", 0, 0, -10, -10],
      ["held_to_expired", 0, 0, -10, -10],
      ["available_to_expired", -10, 0, 0, -10]
    ] as const;
    for (const [category, availableDeltaUnits, pendingDeltaUnits, heldDeltaUnits, totalDeltaUnits] of tuples) {
      const coins = await clientWith(vi.fn<typeof fetch>(async () => jsonResponse(coinsBody({
        wallet: {
          status: "active",
          version: 1,
          balances: { paidCoins: 4, bonusCoins: 1, rewardCoins: 2 },
          spendableUnits: 7,
          heldUnits: 0,
          pendingUnits: 0
        },
        entries: [{
          entryRef: `ent_${category}`,
          occurredAt: "2026-09-12T15:00:00.000Z",
          category,
          coinType: "paid_coins",
          amountUnits: 10,
          availableDeltaUnits,
          pendingDeltaUnits,
          heldDeltaUnits,
          totalDeltaUnits
        }]
      })))).coins("acct_local", { limit: 20 });
      expect(coins.entries[0]?.category).toBe(category);
      expect(coins.wallet.spendableUnits).toBe(7);
    }

    const page = await clientWith(vi.fn<typeof fetch>(async () => jsonResponse(accountsBody({
      items: [
        { id: "acct_b", status: "active", createdAt: "2026-09-12T02:00:00.000Z", registrationSource: "other" },
        { id: "acct_a", status: "active", createdAt: "2026-09-12T01:00:00.000Z", registrationSource: "self_service_portal" }
      ]
    })))).accounts({ status: "active", limit: 20 });
    expect(page.items.map((item) => item.id)).toEqual(["acct_b", "acct_a"]);

    await expectSafeError(
      clientWith(vi.fn<typeof fetch>(async () => jsonResponse(accountsBody({
        items: [
          { id: "acct_a", status: "active", createdAt: "2026-09-12T01:00:00.000Z", registrationSource: "other" },
          { id: "acct_b", status: "active", createdAt: "2026-09-12T02:00:00.000Z", registrationSource: "other" }
        ]
      })))).accounts({ status: "active", limit: 20 }),
      "invalid"
    );
    await expectSafeError(
      clientWith(vi.fn<typeof fetch>(async () => jsonResponse(accountsBody({
        items: [{ id: "acct_other", status: "active", createdAt: GEN, registrationSource: "other" }]
      })))).accounts({ accountId: "acct_local", limit: 20 }),
      "invalid"
    );
    await expectSafeError(
      clientWith(vi.fn<typeof fetch>(async () => jsonResponse(coinsBody({
        entries: [],
        nextCursor: "c2_opaque"
      })))).coins("acct_local"),
      "invalid"
    );

    const fetcher = vi.fn<typeof fetch>(async () => jsonResponse(trafficBody()));
    await clientWith(fetcher).traffic("acct_local", RANGE);
    const url = new URL(String(fetcher.mock.calls[0]?.[0]), "http://admin.local");
    expect(url.searchParams.get("bucket")).toBe("day");
  });

  test("rejects a growth envelope whose from/to do not match the request", async () => {
    await expectSafeError(
      clientWith(vi.fn<typeof fetch>(async () => jsonResponse(growthBody({
        from: "2026-09-01T00:00:00.000Z",
        to: "2026-09-02T00:00:00.000Z"
      })))).growth(RANGE),
      "invalid"
    );
  });

  test("rejects a traffic envelope whose from/to or bucket do not match the request", async () => {
    await expectSafeError(
      clientWith(vi.fn<typeof fetch>(async () => jsonResponse(trafficBody({
        from: "2026-09-01T00:00:00.000Z",
        to: "2026-09-02T00:00:00.000Z"
      })))).traffic("acct_local", RANGE),
      "invalid"
    );
    await expectSafeError(
      clientWith(vi.fn<typeof fetch>(async () => jsonResponse(trafficBody({ bucket: "hour" })))).traffic("acct_local", RANGE),
      "invalid"
    );
  });

  test("rejects traffic headline totals that do not match point sums", async () => {
    await expectSafeError(
      clientWith(vi.fn<typeof fetch>(async () => jsonResponse(trafficBody({
        state: "measured",
        sampleCount: 2,
        lastObservedAt: "2026-09-12T12:00:00.000Z",
        totalBytes: 99,
        uploadBytes: 10,
        downloadBytes: 20,
        points: [{
          at: "2026-09-12T00:00:00.000Z",
          sampleCount: 2,
          uploadBytes: 10,
          downloadBytes: 20,
          totalBytes: 30
        }]
      })))).traffic("acct_local", RANGE),
      "invalid"
    );
  });

  test("rejects ledger category deltas that do not match portal tuples", async () => {
    await expectSafeError(
      clientWith(vi.fn<typeof fetch>(async () => jsonResponse(coinsBody({
        entries: [{
          entryRef: "ent_held",
          occurredAt: "2026-09-12T15:00:00.000Z",
          category: "available_to_held",
          coinType: "paid_coins",
          amountUnits: 10,
          availableDeltaUnits: -10,
          pendingDeltaUnits: 0,
          heldDeltaUnits: 10,
          totalDeltaUnits: -10
        }]
      })))).coins("acct_local"),
      "invalid"
    );
  });
});
