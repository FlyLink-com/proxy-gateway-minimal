import assert from "node:assert/strict";
import Database from "better-sqlite3";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { createApp } from "../app.mjs";
import {
  createPartnerAttributionEventLedger
} from "../services/platform/partner-attribution-event-ledger.mjs";
import {
  createPartnerAttributionStore
} from "../services/platform/partner-attribution-store.mjs";
import {
  createPartnerSettlementCandidateEngine
} from "../services/platform/partner-settlement-candidate-engine.mjs";
import { listen } from "./helpers/listen.mjs";

const ROOT = resolve(fileURLToPath(new URL("../../", import.meta.url)));

function fakeState(platform = {}) {
  return {
    rootDir: ROOT,
    host: "127.0.0.1",
    ports: { console: 3456, socks: 1080, httpProxy: 18180 },
    consoleToken: "secret",
    proxyConfig: { servers: [], pingHosts: [], nginx: {} },
    platform,
    subscriptions: {},
    services: {
      ssLocal: { start: async () => ({ ok: true }), stop: async () => ({ ok: true }), status: () => ({ running: false }) },
      httpProxy: { start: async () => ({ ok: true }), stop: async () => ({ ok: true }), status: () => ({ running: false }) }
    },
    isPortListening: async () => false
  };
}

function authHeaders() {
  return { Authorization: "Bearer secret", "Content-Type": "application/json" };
}

async function withReportingServices(fn) {
  const tempDir = mkdtempSync(join(tmpdir(), "platform-partner-report-route-"));
  const db = new Database(join(tempDir, "control.sqlite"));
  const partnerAttributionStore = createPartnerAttributionStore({ database: db });
  const partnerAttributionEventLedger = createPartnerAttributionEventLedger({ database: db });
  const partnerSettlementCandidateEngine = createPartnerSettlementCandidateEngine({
    database: db,
    eventLedger: partnerAttributionEventLedger
  });
  try {
    seedFacts({
      partnerAttributionStore,
      partnerAttributionEventLedger,
      partnerSettlementCandidateEngine
    });
    return await fn({
      partnerAttributionStore,
      partnerAttributionEventLedger,
      partnerSettlementCandidateEngine
    });
  } finally {
    partnerSettlementCandidateEngine.close();
    partnerAttributionEventLedger.close();
    partnerAttributionStore.close();
    db.close();
    rmSync(tempDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 });
  }
}

function seedFacts({
  partnerAttributionStore,
  partnerAttributionEventLedger,
  partnerSettlementCandidateEngine
}) {
  partnerAttributionStore.upsertPartner({
    partnerRef: "partner_route",
    status: "active",
    riskTier: "standard",
    payoutPolicyRef: "policy_route_cpa",
    defaultAttributionWindowDays: 30,
    safeDisplayName: "Route Partner",
    createdAt: "2026-07-07T00:00:00.000Z",
    updatedAt: "2026-07-07T00:00:00.000Z"
  });
  partnerAttributionStore.upsertCampaign({
    campaignRef: "campaign_route",
    partnerRef: "partner_route",
    status: "active",
    provider: "appsflyer",
    providerCampaignId: "af_campaign_route",
    landingRoute: "/portal/register",
    allowedParams: ["pid", "c"],
    attributionWindowDays: 14,
    createdAt: "2026-07-07T00:00:00.000Z",
    updatedAt: "2026-07-07T00:00:00.000Z"
  });
  const touch = partnerAttributionStore.recordAttributionTouch({
    touchRef: "touch_route",
    provider: "appsflyer",
    partnerRef: "partner_route",
    campaignRef: "campaign_route",
    visitorRef: "visitor_route",
    sessionRef: "session_route",
    landingRoute: "/portal/register",
    idempotencyKey: "idem_touch_route",
    observedAt: "2026-07-07T01:00:00.000Z",
    params: {
      pid: "partner_route",
      c: "campaign_route"
    }
  });
  partnerAttributionEventLedger.recordEvent({
    eventType: "payment_success",
    source: "payment_backend",
    accountRef: "account_route",
    orderRef: "order_route",
    paymentRef: "payment_route",
    partnerRef: "partner_route",
    campaignRef: "campaign_route",
    touchRef: touch.touchRef,
    occurredAt: "2026-07-07T01:15:00.000Z",
    metadataSummary: {
      amountCents: 5000,
      currency: "USD"
    }
  });
  partnerAttributionEventLedger.recordEvent({
    eventType: "entitlement_delivered",
    source: "entitlement_service",
    accountRef: "account_route",
    orderRef: "order_route",
    paymentRef: "payment_route",
    entitlementRef: "entitlement_route",
    partnerRef: "partner_route",
    campaignRef: "campaign_route",
    touchRef: touch.touchRef,
    occurredAt: "2026-07-07T01:20:00.000Z"
  });
  partnerSettlementCandidateEngine.upsertSettlementPolicy({
    policyRef: "policy_route_cpa",
    status: "active",
    model: "first_payment_cpa",
    freezeDays: 7,
    currency: "USD",
    amountCents: 1500,
    createdAt: "2026-07-07T00:00:00.000Z",
    updatedAt: "2026-07-07T00:00:00.000Z"
  });
  partnerSettlementCandidateEngine.evaluateOrderSettlement({
    orderRef: "order_route",
    policyRef: "policy_route_cpa",
    evaluatedAt: "2026-07-07T01:30:00.000Z"
  });
}

test("admin partner attribution report route is protected and returns a safe report", async () => {
  await withReportingServices(async (services) => {
    const { server, baseUrl } = await listen(createApp(fakeState(services)));
    try {
      const unauthenticated = await fetch(`${baseUrl}/api/admin/platform/partner-attribution-report`);
      assert.equal(unauthenticated.status, 401);

      const response = await fetch(`${baseUrl}/api/admin/platform/partner-attribution-report`, {
        headers: authHeaders()
      });
      assert.equal(response.status, 200);
      assert.match(response.headers.get("content-type") || "", /application\/json/);
      const body = await response.json();
      assert.equal(body.report.type, "partner_attribution_admin_report");
      assert.equal(body.report.status, "ready");
      assert.equal(body.report.summary.partnerCount, 1);
      assert.equal(body.report.summary.settlementCandidateCount, 1);
      assert.equal(body.report.partners[0].partnerRef, "partner_route");
      assert.equal(body.report.campaigns[0].campaignRef, "campaign_route");
      assert.equal(body.report.candidates[0].orderRef, "order_route");
      assert.equal(body.report.safety.mutationAllowed, false);
      assert.doesNotMatch(JSON.stringify(body.report), /https?:\/\/|token=|secret-value|password=|rawConfig|edgecred_|\/sub\//i);
    } finally {
      server.close();
    }
  });
});
