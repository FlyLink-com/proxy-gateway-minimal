#!/usr/bin/env node

import http from "node:http";

const HOST = "127.0.0.1";
const PORT = Number.parseInt(
  process.env.ADMIN_USER_MANAGEMENT_FIXTURE_PORT
    ?? process.env.ADMIN_PANEL_FIXTURE_PORT
    ?? "3456",
  10
);

const now = new Date("2026-07-05T12:00:00.000Z");
const dayMs = 24 * 60 * 60 * 1000;

const plans = {
  monthly_basic: {
    label: "Basic Monthly",
    priceCny: 20,
    subscriptionSlots: 1,
    trafficGb: 50,
    validDays: 30
  },
  monthly_plus: {
    label: "Standard Monthly",
    priceCny: 30,
    subscriptionSlots: 3,
    trafficGb: 100,
    validDays: 30
  },
  yearly: {
    label: "Yearly Plan",
    priceCny: 200,
    subscriptionSlots: 5,
    trafficGb: 200,
    validDays: 365
  }
};

const accounts = [
  accountFixture({
    createdDaysAgo: 12,
    email: "basic_user@example.test",
    entitlementCount: 1,
    id: "acct_fixture_basic",
    status: "active",
    usableEntitlementCount: 1
  }),
  accountFixture({
    createdDaysAgo: 21,
    email: "standard_user@example.test",
    entitlementCount: 1,
    id: "acct_fixture_standard",
    status: "active",
    usableEntitlementCount: 1
  }),
  accountFixture({
    createdDaysAgo: 60,
    email: "yearly_user@example.test",
    entitlementCount: 1,
    id: "acct_fixture_yearly",
    status: "active",
    usableEntitlementCount: 1
  }),
  accountFixture({
    createdDaysAgo: 2,
    email: "review_user@example.test",
    entitlementCount: 0,
    id: "acct_fixture_review",
    status: "pending",
    usableEntitlementCount: 0
  })
];

const entitlements = [
  entitlementFixture({
    accountId: "acct_fixture_basic",
    createdDaysAgo: 12,
    id: "ent_fixture_basic",
    plan: "monthly_basic",
    validDays: plans.monthly_basic.validDays
  }),
  entitlementFixture({
    accountId: "acct_fixture_standard",
    createdDaysAgo: 21,
    id: "ent_fixture_standard",
    plan: "monthly_plus",
    validDays: plans.monthly_plus.validDays
  }),
  entitlementFixture({
    accountId: "acct_fixture_yearly",
    createdDaysAgo: 60,
    id: "ent_fixture_yearly",
    plan: "yearly",
    validDays: plans.yearly.validDays
  })
];

const usageItems = [
  usageRowFixture({
    accountId: "acct_fixture_basic",
    entitlementId: "ent_fixture_basic",
    issuedChannels: ["jp-vless"],
    plan: "monthly_basic",
    usedGb: 12,
    validDays: plans.monthly_basic.validDays
  }),
  usageRowFixture({
    accountId: "acct_fixture_standard",
    entitlementId: "ent_fixture_standard",
    issuedChannels: ["jp-vless", "sg-hysteria2", "sg-tuic"],
    plan: "monthly_plus",
    usedGb: 48,
    validDays: plans.monthly_plus.validDays
  }),
  usageRowFixture({
    accountId: "acct_fixture_yearly",
    entitlementId: "ent_fixture_yearly",
    issuedChannels: ["jp-vless", "jp-hysteria2", "sg-vless", "sg-hysteria2", "sg-tuic"],
    plan: "yearly",
    usedGb: 66,
    validDays: plans.yearly.validDays
  })
];

const server = http.createServer((request, response) => {
  const url = new URL(request.url ?? "/", `http://${HOST}:${PORT}`);

  if (request.method === "OPTIONS") {
    sendEmpty(response, 204);
    return;
  }

  if (request.method !== "GET") {
    sendJson(response, 405, { error: "method_not_allowed" });
    return;
  }

  if (url.pathname === "/api/health") {
    sendJson(response, 200, {
      mode: "admin-user-management-fixture-api",
      ok: true,
      syntheticDataOnly: true
    });
    return;
  }

  if (url.pathname === "/api/admin/overview") {
    sendJson(response, 200, {
      generatedAt: now.toISOString(),
      metrics: {
        activeAccounts: accounts.filter((account) => account.status === "active").length,
        pendingAccounts: accounts.filter((account) => account.status === "pending").length,
        totalAccounts: accounts.length
      },
      type: "admin_overview_fixture"
    });
    return;
  }

  if (url.pathname === "/api/admin/platform/accounts") {
    const status = url.searchParams.get("status")?.trim().toLowerCase();
    sendJson(response, 200, {
      items: status
        ? accounts.filter((account) => account.status.toLowerCase() === status)
        : accounts
    });
    return;
  }

  if (url.pathname === "/api/admin/platform/entitlements") {
    const accountId = url.searchParams.get("accountId")?.trim();
    sendJson(response, 200, {
      items: accountId
        ? entitlements.filter((entitlement) => entitlement.accountId === accountId)
        : entitlements
    });
    return;
  }

  if (url.pathname === "/api/admin/platform/subscription-usage-monitor") {
    sendJson(response, 200, { monitor: usageMonitorFixture() });
    return;
  }

  if (url.pathname === "/api/admin/platform/portal-access-requests") {
    sendJson(response, 200, {
      items: [],
      pagination: { limit: 20, offset: 0, total: 0 },
      safety: fixtureSafety()
    });
    return;
  }

  if (url.pathname === "/api/admin/platform/payments") {
    sendJson(response, 200, {
      items: [],
      pagination: { limit: 20, offset: 0, total: 0 },
      safety: fixtureSafety()
    });
    return;
  }

  sendJson(response, 404, { error: "not_found" });
});

server.listen(PORT, HOST, () => {
  console.log(`Admin user-management fixture API listening at http://${HOST}:${PORT}`);
  console.log("Synthetic data only. Use with Vite dev proxy for local UI data-state validation.");
});

server.on("error", (error) => {
  console.error(`Fixture API failed to start: ${error.message}`);
  process.exitCode = 1;
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    server.close(() => process.exit(0));
  });
}

function accountFixture({
  createdDaysAgo,
  email,
  entitlementCount,
  id,
  status,
  usableEntitlementCount
}) {
  const createdAt = new Date(now.getTime() - createdDaysAgo * dayMs).toISOString();
  const updatedAt = new Date(now.getTime() - Math.max(1, createdDaysAgo - 1) * dayMs).toISOString();
  return {
    createdAt,
    displayName: email,
    email,
    entitlementCount,
    id,
    leadId: null,
    organization: null,
    status,
    type: "platform_account_summary",
    updatedAt,
    usableEntitlementCount
  };
}

function entitlementFixture({ accountId, createdDaysAgo, id, plan, validDays }) {
  const createdAt = new Date(now.getTime() - createdDaysAgo * dayMs).toISOString();
  const planSpec = plans[plan];
  return {
    accountId,
    createdAt,
    id,
    plan,
    quota: {
      currency: "CNY",
      priceCny: planSpec.priceCny,
      subscriptionSlots: planSpec.subscriptionSlots,
      trafficGb: planSpec.trafficGb,
      validDays: planSpec.validDays
    },
    status: "active",
    type: "platform_entitlement_summary",
    updatedAt: createdAt,
    usable: true,
    validUntil: new Date(new Date(createdAt).getTime() + validDays * dayMs).toISOString()
  };
}

function usageRowFixture({
  accountId,
  entitlementId,
  issuedChannels,
  plan,
  usedGb,
  validDays
}) {
  const planSpec = plans[plan];
  const trafficLimitBytes = gbToBytes(planSpec.trafficGb);
  const usedBytes = gbToBytes(usedGb);
  const uploadBytes = Math.floor(usedBytes * 0.38);
  const downloadBytes = usedBytes - uploadBytes;
  const validUntil = new Date(now.getTime() + validDays * dayMs).toISOString();
  const channelUsages = issuedChannels.map((channelRef, index) => {
    const channelUsed = Math.floor(usedBytes / issuedChannels.length);
    const channelUpload = Math.floor(channelUsed * 0.38);
    return {
      channelRef,
      downloadBytes: channelUsed - channelUpload,
      lastObservedAt: new Date(now.getTime() - (index + 1) * 60 * 60 * 1000).toISOString(),
      uploadBytes: channelUpload,
      usedBytes: channelUsed
    };
  });

  return {
    accountId,
    activityLevel: usedBytes > 0 ? "active" : "idle",
    artifactFirstSeenAt: new Date(now.getTime() - 2 * dayMs).toISOString(),
    artifactLastSeenAt: now.toISOString(),
    artifactRef: `artifact_${accountId}`,
    artifactStatus: "active",
    channelUsages,
    collectionStatus: "measured",
    downloadBytes,
    edgeCredentialBindings: issuedChannels.map((channelRef) => ({
      channelRef,
      credentialRefPresent: true,
      materialDigestPresent: true,
      usageMeasured: true
    })),
    entitlementId,
    issuanceRequestId: `ord_fixture_${accountId.replace(/^acct_fixture_/, "")}`,
    issuedChannels,
    lastRefreshAt: now.toISOString(),
    lastUsageObservedAt: now.toISOString(),
    linkStatus: "active",
    nodeId: "fixture-node",
    plan,
    portalUserRef: accountId,
    quantity: 1,
    refreshCount: 3,
    tenantExpiresAt: validUntil,
    tenantRef: `tenant_${accountId}`,
    tenantStatus: "active",
    trafficLimitBytes,
    uploadBytes,
    usageMeasured: true,
    usageStatus: usedBytes > 0 ? "measured" : "measured_zero",
    usedBytes,
    validUntil,
    warnings: []
  };
}

function usageMonitorFixture() {
  const userAggregates = usageItems.map((item) => ({
    accountId: item.accountId,
    channelUsages: item.channelUsages,
    collectionStatus: item.collectionStatus,
    downloadBytes: item.downloadBytes,
    issuedChannels: item.issuedChannels,
    lastUsageObservedAt: item.lastUsageObservedAt,
    measuredOrders: item.usageMeasured ? 1 : 0,
    orderCount: 1,
    plans: [item.plan],
    portalUserRef: item.portalUserRef,
    trafficLimitBytes: item.trafficLimitBytes,
    unmeasuredOrders: item.usageMeasured ? 0 : 1,
    uploadBytes: item.uploadBytes,
    usageMeasured: item.usageMeasured,
    usedBytes: item.usedBytes,
    warnings: [],
    zeroUsageOrders: item.usedBytes > 0 ? 0 : 1
  }));

  return {
    aggregates: {
      activeRecently: usageItems.length,
      blocked: 0,
      byNode: { "fixture-node": usageItems.length },
      byPlan: countBy(usageItems, "plan"),
      highRefresh: 0,
      inactive: 0,
      neverSeen: 0,
      seen: usageItems.length,
      total: usageItems.length,
      usage: {
        byUsageChannel: Object.fromEntries(
          usageItems.flatMap((item) => item.channelUsages)
            .map((channel) => [channel.channelRef, channel.usedBytes])
        ),
        measuredOrders: usageItems.length,
        nearLimitOrders: 0,
        overLimitOrders: 0,
        totalDownloadBytes: sumBy(usageItems, "downloadBytes"),
        totalUploadBytes: sumBy(usageItems, "uploadBytes"),
        totalUsedBytes: sumBy(usageItems, "usedBytes"),
        unmeasuredOrders: 0,
        zeroUsageOrders: 0
      },
      warnings: {},
      withWarnings: 0
    },
    filters: {
      accountId: "",
      bucket: "hour",
      from: "",
      plan: "",
      q: "",
      status: "",
      to: ""
    },
    generatedAt: now.toISOString(),
    items: usageItems,
    safety: {
      channelUsageBreakdownIncluded: true,
      mutationAllowed: false,
      orderLevelRows: true,
      rawSecretReturned: false,
      rawSubscriptionUrlReturned: false,
      realByteUsageMeasured: true,
      summaryOnly: true,
      userAggregatedRows: true
    },
    series: {
      aggregates: {
        byAccount: Object.fromEntries(userAggregates.map((item) => [item.accountId, item.usedBytes])),
        byChannel: Object.fromEntries(
          usageItems.flatMap((item) => item.channelUsages)
            .map((channel) => [channel.channelRef, channel.usedBytes])
        ),
        byOrder: Object.fromEntries(usageItems.map((item) => [item.issuanceRequestId, item.usedBytes])),
        pointCount: 0,
        seriesCount: 0,
        totalDownloadBytes: sumBy(usageItems, "downloadBytes"),
        totalUploadBytes: sumBy(usageItems, "uploadBytes"),
        totalUsedBytes: sumBy(usageItems, "usedBytes")
      },
      points: [],
      range: { bucket: "hour", from: null, to: null },
      safety: {
        channelBreakdownIncluded: true,
        mutationAllowed: false,
        orderScoped: true,
        rawEdgeCredentialReturned: false,
        rawSecretReturned: false,
        rawSubscriptionUrlReturned: false,
        summaryOnly: true
      },
      type: "subscription_usage_timeseries"
    },
    type: "subscription_usage_monitor",
    userAggregates
  };
}

function fixtureSafety() {
  return {
    mutationAllowed: false,
    rawSecretReturned: false,
    rawSubscriptionUrlReturned: false,
    syntheticDataOnly: true
  };
}

function sendEmpty(response, statusCode) {
  response.writeHead(statusCode, headers());
  response.end();
}

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, headers());
  response.end(JSON.stringify(payload));
}

function headers() {
  return {
    "Access-Control-Allow-Headers": "authorization, content-type",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Origin": "http://127.0.0.1:4181",
    "Cache-Control": "no-store",
    "Content-Type": "application/json; charset=utf-8"
  };
}

function countBy(items, key) {
  return items.reduce((counts, item) => ({
    ...counts,
    [item[key]]: (counts[item[key]] ?? 0) + 1
  }), {});
}

function gbToBytes(value) {
  return value * 1024 * 1024 * 1024;
}

function sumBy(items, key) {
  return items.reduce((sum, item) => sum + Number(item[key] ?? 0), 0);
}
