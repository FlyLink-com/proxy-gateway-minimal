import { describe, expect, test, vi } from "vitest";

import {
  MonitorReadError,
  createAdminMonitorReadClient
} from "../app/admin-monitor-read-client";

const SIGNAL = new AbortController().signal;
const MESSAGES = {
  session: "Admin session required.",
  permission: "Admin permission denied.",
  unavailable: "Admin monitor is unavailable.",
  invalid: "Admin monitor response is invalid.",
  network: "Admin monitor request failed."
} as const;
const LEAK = /secret|token=|password|visible-once|Failed to fetch|internal_error|admin_authentication|must-not-leak|ops@example|local-user@|https?:\/\/|edgecred_|subscriptionUrl|materialRef|credentialRef|rawConfig|errorType/i;

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}

function clientWith(fetcher: typeof fetch) {
  return createAdminMonitorReadClient({ fetcher });
}

function emptyUsage() {
  return {
    monitor: {
      type: "subscription_usage_monitor",
      generatedAt: "2026-06-08T00:06:00.000Z",
      filters: {
        accountId: "",
        plan: "",
        nodeId: "",
        status: "",
        warning: "",
        from: "",
        to: "",
        bucket: "hour"
      },
      aggregates: { total: 0, usage: { totalUsedBytes: 0 } },
      items: [],
      series: {
        type: "subscription_usage_timeseries",
        range: { from: null, to: null, bucket: "hour" },
        points: [],
        aggregates: { pointCount: 0, byChannel: {} },
        safety: { summaryOnly: true, mutationAllowed: false, rawEdgeCredentialReturned: false }
      },
      safety: {
        summaryOnly: true,
        mutationAllowed: false,
        rawSubscriptionUrlReturned: false,
        rawSecretReturned: false
      }
    }
  };
}

function emptyCollectors() {
  return {
    collectorStatus: {
      type: "traffic_collector_admin_projection",
      schemaVersion: "1",
      availability: "not_configured",
      observedAt: null,
      run: null,
      accounting: null,
      collectors: [],
      producers: [],
      omittedCollectorCount: 0,
      omittedProducerCount: 0,
      safety: { redacted: true, summaryOnly: true }
    }
  };
}

function okBody(method: "accounts" | "entitlements" | "usage" | "collectors"): unknown {
  if (method === "accounts" || method === "entitlements") return { items: [] };
  return method === "usage" ? emptyUsage() : emptyCollectors();
}

function usageItem(overrides: Record<string, unknown> = {}) {
  return {
    accountId: "acct_usage_monitor_2",
    portalUserRef: "portal_user_usage_monitor_2",
    issuanceRequestId: "pareq_usage_monitor_2",
    entitlementId: "ent_usage_monitor_2",
    plan: "trial",
    quantity: 1,
    nodeId: "channel-vultr-a-hy2",
    issuedChannels: ["channel-vultr-a-hy2", "channel-sgp-a-hy2"],
    tenantRef: "tenant_usage_monitor_2",
    artifactRef: "artifact_usage_monitor_2",
    linkStatus: "active",
    usedBytes: 600,
    uploadBytes: 150,
    downloadBytes: 450,
    usageStatus: "measured",
    collectionStatus: "measured",
    usageMeasured: true,
    lastUsageObservedAt: "2026-06-08T01:05:00.000Z",
    lastRefreshAt: "2026-06-08T02:00:00.000Z",
    edgeCredentialBindings: [{
      channelRef: "channel-vultr-a-hy2",
      credentialRefPresent: true,
      materialDigestPresent: true,
      usageMeasured: true
    }],
    channelUsages: [{
      channelRef: "channel-vultr-a-hy2",
      usedBytes: 600,
      uploadBytes: 150,
      downloadBytes: 450,
      lastObservedAt: "2026-06-08T01:05:00.000Z"
    }],
    activityLevel: "seen",
    warnings: ["high_refresh_count"],
    email: "ops@example.com",
    subscriptionUrl: "https://sub.example.test/sub/a/visible-once.yaml",
    ...overrides
  };
}

function usagePoint(overrides: Record<string, unknown> = {}) {
  return {
    bucketStart: "2026-06-08T00:00:00.000Z",
    accountId: "acct_usage_monitor_2",
    portalUserRef: "portal_user_usage_monitor_2",
    issuanceRequestId: "pareq_usage_monitor_2",
    plan: "trial",
    channelRef: "channel-vultr-a-hy2",
    uploadBytes: 100,
    downloadBytes: 200,
    usedBytes: 300,
    ...overrides
  };
}

function collectorRecord(overrides: Record<string, unknown> = {}) {
  return {
    type: "traffic_collector_state",
    health: "failed",
    condition: "auth_error",
    sourceRef: "mihomo_usage_primary",
    channelRef: "channel-vultr-a-tuic",
    lastCollectorSuccessAt: null,
    observationCount: 0,
    unresolvedCount: 0,
    errorType: "auth_error",
    reasonCodes: ["controller_unauthorized"],
    observability: { statsApiReachable: true, userTrafficCountersObserved: false },
    safety: { redacted: true },
    rawConfig: "must-not-leak-config",
    ...overrides
  };
}

async function expectSafeError(
  promise: Promise<unknown>,
  code: keyof typeof MESSAGES
) {
  const error = await promise.then(
    () => {
      throw new Error("expected MonitorReadError");
    },
    (value) => value
  );
  expect(error).toBeInstanceOf(MonitorReadError);
  expect(error).toMatchObject({
    name: "MonitorReadError",
    code,
    message: MESSAGES[code]
  });
  expect((error as Error).cause).toBeUndefined();
  expect(String(error)).not.toMatch(LEAK);
}

describe("admin monitor read client", () => {
  test.each([
    ["accounts", "/api/admin/platform/accounts"],
    ["entitlements", "/api/admin/platform/entitlements"],
    ["usage", "/api/admin/platform/subscription-usage-monitor"],
    ["collectors", "/api/admin/platform/traffic-collector-status"]
  ] as const)("%s uses the exact same-origin GET transport", async (method, path) => {
    const fetcher = vi.fn<typeof fetch>(async () => jsonResponse(okBody(method)));
    const client = clientWith(fetcher);
    await client[method](SIGNAL);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher.mock.calls[0]?.[0]).toBe(path);
    expect(fetcher.mock.calls[0]?.[1]).toEqual({
      method: "GET",
      credentials: "same-origin",
      cache: "no-store",
      redirect: "error",
      signal: SIGNAL
    });
    expect(String(path)).not.toContain("/collect");
  });

  test("forwards only supported usage query keys and keeps node scope as returned", async () => {
    const fetcher = vi.fn<typeof fetch>(async () => jsonResponse({
      monitor: {
        ...emptyUsage().monitor,
        items: [
          usageItem({ lastUsageObservedAt: "2026-05-01T00:00:00.000Z" }),
          usageItem({
            accountId: "acct_usage_monitor_1",
            issuanceRequestId: "pareq_usage_monitor_1",
            entitlementId: "ent_usage_monitor_1",
            plan: "monthly",
            usedBytes: 0,
            usageStatus: "not_collected",
            collectionStatus: "not_collected",
            lastUsageObservedAt: null,
            nodeId: "channel-sgp-a-hy2"
          })
        ],
        series: {
          ...emptyUsage().monitor.series,
          range: {
            from: "2026-06-08T00:00:00.000Z",
            to: "2026-06-09T00:00:00.000Z",
            bucket: "hour"
          },
          points: [
            usagePoint(),
            usagePoint({
              channelRef: "channel-sgp-a-hy2",
              uploadBytes: 50,
              downloadBytes: 50,
              usedBytes: 100
            }),
            usagePoint({
              bucketStart: "2026-06-08T01:00:00.000Z",
              uploadBytes: 50,
              downloadBytes: 250,
              usedBytes: 300
            })
          ]
        }
      }
    }));
    const usage = await clientWith(fetcher).usage(SIGNAL, {
      from: "2026-06-08T00:00:00.000Z",
      to: "2026-06-09T00:00:00.000Z",
      nodeId: "channel-vultr-a-hy2",
      bucket: "hour",
      accountId: "acct_should_not_forward",
      plan: "trial"
    } as { from: string; to: string; nodeId: string; bucket: "hour"; accountId: string; plan: string });

    const url = new URL(String(fetcher.mock.calls[0]?.[0]), "http://admin.local");
    expect(url.pathname).toBe("/api/admin/platform/subscription-usage-monitor");
    expect([...url.searchParams.keys()]).toEqual(["from", "to", "nodeId", "bucket"]);
    expect(url.searchParams.get("from")).toBe("2026-06-08T00:00:00.000Z");
    expect(url.searchParams.get("to")).toBe("2026-06-09T00:00:00.000Z");
    expect(url.searchParams.get("nodeId")).toBe("channel-vultr-a-hy2");
    expect(url.searchParams.get("bucket")).toBe("hour");
    expect(usage.items).toHaveLength(2);
    expect(usage.items.map((item) => item.accountId)).toEqual([
      "acct_usage_monitor_2",
      "acct_usage_monitor_1"
    ]);
    expect(usage.from).toBe("2026-06-08T00:00:00.000Z");
    expect(usage.to).toBe("2026-06-09T00:00:00.000Z");
    expect(usage.points).toEqual([
      {
        at: "2026-06-08T00:00:00.000Z",
        uploadBytes: 150,
        downloadBytes: 250,
        totalBytes: 400
      },
      {
        at: "2026-06-08T01:00:00.000Z",
        uploadBytes: 50,
        downloadBytes: 250,
        totalBytes: 300
      }
    ]);
  });

  test.each([
    [{ from: "not-a-date" }],
    [{ from: "2026-02-30T00:00:00.000Z", to: "2026-03-01T00:00:00.000Z" }],
    [{ from: "2026-06-09T00:00:00.000Z", to: "2026-06-08T00:00:00.000Z" }],
    [{ from: "2026-06-08T00:00:00.000Z", to: "2026-06-08T00:00:00.000Z" }],
    [{ from: "2026-06-01T00:00:00.000Z", to: "2026-07-02T00:00:00.001Z" }],
    [{ nodeId: "bad node" }],
    [{ nodeId: "ops@example.com" }],
    [{ nodeId: "https://evil.example/token=secret" }],
    [{ nodeId: "edgecred_channel-vultr-a-hy2" }],
    [{ bucket: "week" }],
    [{ bucket: "Hour" }],
    [{ from: 1780876800000 }]
  ])("rejects invalid usage query %j before fetch", async (query) => {
    const fetcher = vi.fn<typeof fetch>();
    await expectSafeError(
      clientWith(fetcher).usage(SIGNAL, query as never),
      "invalid"
    );
    expect(fetcher).not.toHaveBeenCalled();
  });

  test("accepts a bounded 31-day from<to window", async () => {
    const fetcher = vi.fn<typeof fetch>(async () => jsonResponse(emptyUsage()));
    await clientWith(fetcher).usage(SIGNAL, {
      from: "2026-06-01T00:00:00.000Z",
      to: "2026-07-02T00:00:00.000Z"
    });
    const url = new URL(String(fetcher.mock.calls[0]?.[0]), "http://admin.local");
    expect([...url.searchParams.keys()]).toEqual(["from", "to"]);
  });

  test("maps actual account and entitlement envelopes and strips sensitive fields", async () => {
    const accountsFetcher = vi.fn<typeof fetch>(async () => jsonResponse({
      items: [{
        id: "acct_registration_1",
        type: "platform_account_summary",
        leadId: null,
        status: "active",
        organization: "Acme Research",
        email: "local-user@example.test",
        displayName: "local-user@example.test",
        entitlementCount: 1,
        usableEntitlementCount: 1,
        createdAt: "2026-07-08T10:00:00.000Z",
        updatedAt: "2026-07-08T10:00:00.000Z"
      }]
    }));
    const entitlementsFetcher = vi.fn<typeof fetch>(async () => jsonResponse({
      items: [{
        id: "ent_registration_trial_1",
        type: "platform_entitlement_summary",
        accountId: "acct_registration_1",
        status: "active",
        plan: "trial",
        usable: true,
        validUntil: "2027-07-08T10:00:00.000Z",
        quota: { artifacts: 1, devices: 1, trafficGb: 10, trafficLimitBytes: 10737418240 },
        trafficLimitBytes: 10737418240,
        maxArtifacts: 1,
        maxDevices: 1,
        createdAt: "2026-07-08T10:00:00.000Z",
        updatedAt: "2026-07-08T10:00:00.000Z",
        email: "ops@example.com"
      }]
    }));

    const accounts = await clientWith(accountsFetcher).accounts(SIGNAL);
    const entitlements = await clientWith(entitlementsFetcher).entitlements(SIGNAL);

    expect(accounts).toEqual([{
      id: "acct_registration_1",
      status: "active",
      entitlementCount: 1,
      usableEntitlementCount: 1
    }]);
    expect(entitlements).toEqual([{
      id: "ent_registration_trial_1",
      accountId: "acct_registration_1",
      plan: "trial",
      status: "active",
      usable: true,
      validUntil: "2027-07-08T10:00:00.000Z"
    }]);
    expect(JSON.stringify({ accounts, entitlements })).not.toMatch(LEAK);
  });

  test("maps actual usage rows, zeros, timestamps, and series sums without using generatedAt as sample time", async () => {
    const generatedAt = "2026-06-08T03:00:00.000Z";
    const fetcher = vi.fn<typeof fetch>(async () => jsonResponse({
      monitor: {
        ...emptyUsage().monitor,
        generatedAt,
        items: [
          usageItem(),
          usageItem({
            accountId: "acct_usage_monitor_1",
            issuanceRequestId: "pareq_usage_monitor_1",
            entitlementId: undefined,
            plan: "monthly",
            usedBytes: 0,
            usageStatus: "not_collected",
            collectionStatus: "not_collected",
            lastUsageObservedAt: null
          }),
          usageItem({
            accountId: "acct_zero",
            issuanceRequestId: "pareq_zero",
            entitlementId: "ent_zero",
            usedBytes: 0,
            usageStatus: "measured_zero",
            collectionStatus: "measured_zero",
            lastUsageObservedAt: Date.parse("2026-06-08T01:05:00.000Z")
          }),
          usageItem({
            accountId: "acct_false_zero",
            issuanceRequestId: "pareq_false_zero",
            entitlementId: "ent_false_zero",
            usedBytes: 100,
            usageStatus: "measured_zero",
            collectionStatus: "measured_zero"
          }),
          usageItem({
            accountId: "acct_measured_zero_flag",
            issuanceRequestId: "pareq_measured_zero_flag",
            entitlementId: "ent_measured_zero_flag",
            usedBytes: 0,
            usageStatus: "measured",
            collectionStatus: "measured"
          })
        ],
        series: {
          ...emptyUsage().monitor.series,
          range: { from: "2026-06-08T00:00:00.000Z", to: null, bucket: "hour" },
          points: [
            usagePoint(),
            usagePoint({
              channelRef: "channel-sgp-a-hy2",
              uploadBytes: 10,
              downloadBytes: -1,
              usedBytes: Number.POSITIVE_INFINITY
            }),
            usagePoint({
              bucketStart: Date.parse("2026-06-08T01:00:00.000Z"),
              uploadBytes: 50,
              downloadBytes: 250,
              usedBytes: 300
            }),
            usagePoint({
              bucketStart: "",
              uploadBytes: 9,
              downloadBytes: 9,
              usedBytes: 18
            })
          ]
        }
      }
    }));

    const usage = await clientWith(fetcher).usage(SIGNAL);
    expect(usage.generatedAt).toBe(generatedAt);
    expect(usage.items).toEqual([
      {
        accountId: "acct_usage_monitor_2",
        entitlementId: "ent_usage_monitor_2",
        plan: "trial",
        status: "measured",
        usedBytes: 600,
        observedAt: "2026-06-08T01:05:00.000Z",
        rawUsedBytes: null,
        chargedUsedBytes: null,
        ratingState: "legacy"
      },
      {
        accountId: "acct_usage_monitor_1",
        entitlementId: "",
        plan: "monthly",
        status: "not_collected",
        usedBytes: null,
        observedAt: null,
        rawUsedBytes: null,
        chargedUsedBytes: null,
        ratingState: "legacy"
      },
      {
        accountId: "acct_zero",
        entitlementId: "ent_zero",
        plan: "trial",
        status: "measured_zero",
        usedBytes: 0,
        observedAt: "2026-06-08T01:05:00.000Z",
        rawUsedBytes: null,
        chargedUsedBytes: null,
        ratingState: "legacy"
      },
      {
        accountId: "acct_false_zero",
        entitlementId: "ent_false_zero",
        plan: "trial",
        status: "measured_zero",
        usedBytes: null,
        observedAt: "2026-06-08T01:05:00.000Z",
        rawUsedBytes: null,
        chargedUsedBytes: null,
        ratingState: "legacy"
      },
      {
        accountId: "acct_measured_zero_flag",
        entitlementId: "ent_measured_zero_flag",
        plan: "trial",
        status: "measured",
        usedBytes: null,
        observedAt: "2026-06-08T01:05:00.000Z",
        rawUsedBytes: null,
        chargedUsedBytes: null,
        ratingState: "legacy"
      }
    ]);
    expect(usage.ratingBoundary).toBeNull();
    expect(usage.items[1]?.entitlementId).toBe("");
    expect(JSON.stringify(usage)).not.toContain("pareq_usage_monitor_1");
    expect(usage.points).toEqual([
      {
        at: "2026-06-08T00:00:00.000Z",
        uploadBytes: 110,
        downloadBytes: null,
        totalBytes: null
      },
      {
        at: "2026-06-08T01:00:00.000Z",
        uploadBytes: 50,
        downloadBytes: 250,
        totalBytes: 300
      }
    ]);
    expect(usage.points.some((point) => point.at === generatedAt)).toBe(false);
    expect(usage.items.some((item) => item.observedAt === generatedAt)).toBe(false);
    expect(JSON.stringify(usage)).not.toMatch(LEAK);
  });

  test.each([
    ["healthy", "idle_no_user_traffic", "healthy"],
    ["degraded", "mapping_unresolved", "degraded"],
    ["failed", "auth_error", "failed"],
    ["weird", "auth_error", "unknown"]
  ] as const)("maps collector health %s distinctly", async (health, condition, state) => {
    const fetcher = vi.fn<typeof fetch>(async () => jsonResponse({
      collectorStatus: {
        type: "traffic_collector_admin_projection",
        schemaVersion: "1",
        availability: "available",
        observedAt: "2026-07-10T13:00:00.000Z",
        run: { runOk: false, rawReportOk: false, collectorCount: 2, idleCollectorCount: 0 },
        accounting: { recordingOk: false, unresolvedCount: 1 },
        collectors: [
          collectorRecord({
            health,
            condition,
            lastCollectorSuccessAt: "2026-07-10T12:58:00.000Z",
            reasonCodes: ["controller_unauthorized", "https://controller.example.test/secret?token=must-not-leak", "TypeError: boom"]
          })
        ],
        producers: [{ producerRef: "japan_tuic_usage_credential_map", availability: "available" }],
        safety: { redacted: true }
      }
    }));
    const result = await clientWith(fetcher).collectors(SIGNAL);
    const reasons = ["controller_unauthorized", "unknown_reason", condition].sort();
    expect(result).toEqual({
      state: "available",
      observedAt: "2026-07-10T13:00:00.000Z",
      collectors: [{
        name: "channel-vultr-a-tuic",
        state,
        observedAt: "2026-07-10T13:00:00.000Z",
        reasons
      }],
      reasons
    });
    expect(JSON.stringify(result)).not.toMatch(LEAK);
    expect(JSON.stringify(result)).not.toContain("japan_tuic");
  });

  test("maps unavailable collectorStatus without inventing nested sample times", async () => {
    const result = await clientWith(
      vi.fn<typeof fetch>(async () => jsonResponse(emptyCollectors()))
    ).collectors(SIGNAL);
    expect(result).toEqual({
      state: "not_configured",
      observedAt: null,
      collectors: [],
      reasons: []
    });
  });

  test.each([
    [401, "session", { error: "admin_authentication_required", message: "secret token=leak" }],
    [403, "permission", { error: "admin_capability_required", capability: "operations.read" }],
    [404, "unavailable", { error: "not_found", message: "https://private.example/token=secret" }],
    [503, "unavailable", { error: "internal_error", message: "must-not-leak" }],
    [400, "network", { error: "validation_error", message: "ops@example.com" }],
    [500, "network", { error: "internal_error" }],
    [429, "network", { error: "Too Many Requests" }]
  ] as const)("maps HTTP %i to %s without leaking the body", async (status, code, body) => {
    const fetcher = vi.fn<typeof fetch>(async () => jsonResponse(body, status));
    await expectSafeError(clientWith(fetcher).accounts(SIGNAL), code);
  });

  test.each([
    ["accounts", { error: "internal_error", items: [{ id: "acct_1", status: "active" }] }],
    ["accounts", { items: null }],
    ["accounts", { items: [{ status: "active", email: "ops@example.com" }] }],
    ["accounts", { items: [{ id: "ops@example.com", status: "active" }] }],
    ["entitlements", { items: [{ id: "ent_1", accountId: "https://x", status: "active" }] }],
    ["usage", { monitor: { items: [], series: { points: {} } } }],
    ["usage", { monitor: { items: [null], series: { points: [] } } }],
    ["usage", {
      monitor: {
        items: [usageItem({ entitlementId: "https://sub.example.test/visible-once.yaml" })],
        series: { points: [] }
      }
    }],
    ["collectors", { collectorStatus: null }],
    ["collectors", { collectorStatus: { availability: "available", collectors: [null] } }]
  ] as const)("rejects malformed %s success objects", async (method, body) => {
    const fetcher = vi.fn<typeof fetch>(async () => jsonResponse(body));
    await expectSafeError(clientWith(fetcher)[method](SIGNAL), "invalid");
  });

  test("maps non-abort fetch failures to a fixed network error", async () => {
    const fetcher = vi.fn<typeof fetch>(async () => {
      throw new TypeError("Failed to fetch https://secret.example/token=leak");
    });
    await expectSafeError(clientWith(fetcher).accounts(SIGNAL), "network");
  });

  test("does not fetch when the signal is already aborted", async () => {
    const fetcher = vi.fn<typeof fetch>();
    const controller = new AbortController();
    controller.abort();
    await expect(clientWith(fetcher).accounts(controller.signal)).rejects.toMatchObject({
      name: "AbortError"
    });
    expect(fetcher).not.toHaveBeenCalled();
  });

  test("keeps abort as AbortError during fetch and body parse", async () => {
    const controller = new AbortController();
    const fetchAbort = vi.fn<typeof fetch>(async (_url, init) => {
      init?.signal?.throwIfAborted();
      throw new DOMException("The operation was aborted.", "AbortError");
    });
    await expect(clientWith(fetchAbort).usage(controller.signal)).rejects.toMatchObject({
      name: "AbortError"
    });

    const parseController = new AbortController();
    const parseAbort = vi.fn<typeof fetch>(async () => {
      const response = jsonResponse({ items: [] });
      vi.spyOn(response, "text").mockImplementation(async () => {
        parseController.abort();
        throw new DOMException("The operation was aborted.", "AbortError");
      });
      return response;
    });
    await expect(clientWith(parseAbort).accounts(parseController.signal)).rejects.toMatchObject({
      name: "AbortError"
    });
  });

  test("treats optional invalid counters as null and does not pad missing buckets", async () => {
    const fetcher = vi.fn<typeof fetch>(async () => jsonResponse({
      items: [{
        id: "acct_1",
        type: "platform_account_summary",
        status: "pending_review",
        entitlementCount: -1,
        usableEntitlementCount: 1.5
      }]
    }));
    await expect(clientWith(fetcher).accounts(SIGNAL)).resolves.toEqual([{
      id: "acct_1",
      status: "pending_review",
      entitlementCount: null,
      usableEntitlementCount: null
    }]);
  });
});
