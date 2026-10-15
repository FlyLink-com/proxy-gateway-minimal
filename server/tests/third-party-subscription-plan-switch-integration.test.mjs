import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import test from "node:test";
import Database from "better-sqlite3";
import { createApp } from "../app.mjs";
import { COIN_COMMERCE_PRODUCTION_OFFERS } from "../services/platform/coin-commerce-production-catalog.mjs";
import { createCoinCommerceCoordinator } from "../services/platform/coin-commerce-coordinator.mjs";
import { applyCoinCommerceMigrations, COIN_COMMERCE_MIGRATIONS, REQUIRED_COIN_COMMERCE_MIGRATION_ID } from "../services/platform/coin-commerce-migrations.mjs";
import { createSqliteCoinCommerceStore } from "../services/platform/coin-commerce-store.mjs";
import { createCoinCommerceProductionSubscriptionFulfillment } from "../services/platform/coin-commerce-production-subscription-fulfillment.mjs";
import { applyPlanSwitchMigrations, PLAN_SWITCH_MIGRATIONS, REQUIRED_PLAN_SWITCH_MIGRATION_ID } from "../services/platform/coin-commerce-plan-switch-migrations.mjs";
import { applyDueScheduledPlanSwitches, createPlanSwitchReader } from "../services/platform/coin-commerce-plan-switch-runtime.mjs";
import { applyCoinWalletMigrations, COIN_WALLET_MIGRATIONS, REQUIRED_COIN_WALLET_MIGRATION_ID } from "../services/platform/coin-wallet-migrations.mjs";
import { createSqliteSubscriptionControlStore } from "../services/platform/subscription-control-db.mjs";
import { createPortalTotpSecretProtector } from "../services/platform/portal-totp-verifier.mjs";
import { applyThirdPartySubscriptionMigrations, REQUIRED_THIRD_PARTY_SUBSCRIPTION_DDL_CHECKSUM, REQUIRED_THIRD_PARTY_SUBSCRIPTION_MIGRATION_ID } from "../services/platform/third-party-subscription-migrations.mjs";
import { createSqliteThirdPartySubscriptionStore } from "../services/platform/third-party-subscription-store.mjs";
import { createSubscriptionCore } from "../services/subscriptions/core.mjs";
import { createSubscriptionRepository } from "../services/subscriptions/repository.mjs";
import { hashSubscriptionToken } from "../services/subscriptions/tokens.mjs";
import { generateSubscriptionExpiryNotice } from "../services/subscription-expiry-notice.mjs";
import { listen } from "./helpers/listen.mjs";

const BASIC = COIN_COMMERCE_PRODUCTION_OFFERS[0];
const PLUS = COIN_COMMERCE_PRODUCTION_OFFERS[1];
const NOW = "2026-10-13T00:00:00.000Z";
const FROM = "2026-09-28T00:00:00.000Z";
const UNTIL = "2026-10-28T00:00:00.000Z";
const ACCOUNT = "account_synthetic_third_party_switch";
const ENTITLEMENT = "entitlement_synthetic_third_party_switch";
const REQUEST = "request_synthetic_third_party_switch";
const TENANT = "tenant_synthetic_third_party_switch";
const ARTIFACT = "artifact_synthetic_third_party_switch";
const EDGE = "edgecred_synthetic_third_party_switch";
const TOKEN = "pgsub_synthetic_third_party_switch";
const SESSION = "session_synthetic_third_party_switch";
const GIB = 1024 ** 3;
const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const ref = (kind, value) => `${kind}ref_${createHash("sha256").update(value).digest("hex").slice(0, 16)}`;

// Same clock seam as the existing commerce integration suite: only SQL's
// current timestamp is fixed; quotes, capture, fulfillment and plan rows are real.
function clockDatabase(database, clock) {
  return new Proxy(database, { get(target, property) {
    if (property === "prepare") return sql => /select\s+strftime\('%Y-%m-%dT%H:%M:%fZ',\s*'now'\)/i.test(sql)
      ? { pluck: () => ({ get: () => clock.value }) } : target.prepare(sql);
    const value = Reflect.get(target, property, target);
    return typeof value === "function" ? value.bind(target) : value;
  } });
}

// All three databases and accounts are synthetic/in-memory. Requests can only
// reach this ephemeral loopback listener, never the documentation proxy hosts.
async function fixture(t, initialOffer) {
  const controlDb = new Database(":memory:");
  const runtimeDb = new Database(":memory:");
  const thirdPartyDb = new Database(":memory:");
  let server;
  t.after(async () => {
    if (server) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
    thirdPartyDb.close(); runtimeDb.close(); controlDb.close();
  });
  const clock = { value: NOW };
  const nowFn = () => new Date(clock.value);
  const control = createSqliteSubscriptionControlStore({ database: controlDb });
  for (const [apply, migrationId, migrations] of [
    [applyCoinWalletMigrations, REQUIRED_COIN_WALLET_MIGRATION_ID, COIN_WALLET_MIGRATIONS],
    [applyCoinCommerceMigrations, REQUIRED_COIN_COMMERCE_MIGRATION_ID, COIN_COMMERCE_MIGRATIONS],
    [applyPlanSwitchMigrations, REQUIRED_PLAN_SWITCH_MIGRATION_ID, PLAN_SWITCH_MIGRATIONS],
  ]) apply({ database: controlDb, expectedMigrationId: migrationId, expectedDdlChecksum: migrations[0].ddlChecksum, nowFn });
  const timestamps = { createdAt: NOW, updatedAt: NOW };
  control.createAccount({ id: ACCOUNT, ownerRef: ACCOUNT, status: "active", ...timestamps });
  control.createEntitlement({ id: ENTITLEMENT, accountId: ACCOUNT, plan: initialOffer.offerVersionRef,
    status: "active", validFrom: FROM, validUntil: UNTIL, maxArtifacts: 1, maxDevices: 2,
    trafficLimitBytes: initialOffer.delivery.monthlyTrafficGb * GIB, ...timestamps });
  control.createIssuanceRequest({ id: REQUEST, accountId: ACCOUNT, entitlementId: ENTITLEMENT,
    approvalRef: "approval_synthetic_switch", status: "issued", quantity: 1, nodeId: "synthetic-owned",
    purpose: "portal_access_request", requestedByRef: ACCOUNT, ...timestamps });
  const proxyConfig = { servers: [{ id: "synthetic-owned", name: "synthetic-owned", protocol: "ss",
    host: "192.0.2.1", port: 8388, method: "aes-256-gcm", password: "synthetic-owned-switch-material" }], pingHosts: [], nginx: {} };
  const core = createSubscriptionCore({ repository: createSubscriptionRepository({ database: runtimeDb }), proxyConfig, nowFn,
    publicSubscriptionBaseUrl: "https://subscription.example.test", idFactory: () => TENANT,
    tokenFactory: () => ({ rawToken: TOKEN, tokenHash: hashSubscriptionToken(TOKEN), tokenPrefix: "synthetic" }),
    artifactIdFactory: () => ARTIFACT, artifactSecretFactory: () => "synthetic_third_party_switch_artifact_secret" });
  core.createTenant({ displayName: "Synthetic switch", expiresAt: UNTIL });
  const artifact = core.createSubscriptionArtifact(TENANT);
  control.linkIssuedSubscription({ id: "link_synthetic_switch", requestId: REQUEST,
    tenantRef: ref("tenant", TENANT), artifactRef: ref("artifact", ARTIFACT), status: "active", ...timestamps });
  control.upsertPortalAccessRequest({ id: REQUEST, portalUserRef: ACCOUNT, plan: "monthly", clientTarget: "clash",
    durationDays: 30, quantity: 1, status: "delivered", nextAction: "user_can_use_access", priorTrialState: "not_applicable",
    submittedAt: FROM, updatedAt: NOW, expiresAt: UNTIL, validUntil: UNTIL, entitlementRef: ENTITLEMENT,
    accessGrantRef: "grant_synthetic_switch", tenantId: TENANT, artifactId: ARTIFACT,
    subscriptionUrl: artifact.subscriptionUrl, edgeChannelRef: "synthetic-owned", edgeCredentialRef: EDGE,
    edgeMaterialDigest: "sha256:synthetic_switch_material" });
  control.recordUsageSample({ id: "sample_synthetic_switch", sourceRef: "source_synthetic_switch", channelRef: "synthetic-owned",
    edgeCredentialRef: EDGE, accountId: ACCOUNT, entitlementId: ENTITLEMENT, requestId: REQUEST,
    observedAt: "2026-10-12T23:59:00.000Z", intervalStartedAt: "2026-10-12T23:58:00.000Z",
    intervalEndedAt: "2026-10-12T23:59:00.000Z", uploadBytes: 1024, downloadBytes: 2048, totalBytes: 3072,
    sampleDigest: "synthetic_third_party_switch_sample", createdAt: NOW });
  const fulfillment = createCoinCommerceProductionSubscriptionFulfillment({ controlStore: control, runtimeCore: core,
    accountActivationReader: () => true, nowFn, planSwitchEnabled: true });
  const counts = new Map();
  const commerce = createSqliteCoinCommerceStore({ database: clockDatabase(controlDb, clock),
    commerceRefFactory: kind => { const next = (counts.get(kind) ?? 0) + 1; counts.set(kind, next); return `${kind}_synthetic_switch_${next}`; },
    discountReader: () => 0, purchaseEligibilityReader: fulfillment.purchaseEligibilityReader,
    storefrontEligibilityReader: fulfillment.storefrontEligibilityReader, planSwitchEnabled: true,
    planSwitchReader: createPlanSwitchReader({ controlStore: control, authorityEnabled: false }),
    planSwitchApplyDue: nowIso => applyDueScheduledPlanSwitches({ controlStore: control, execute: fulfillment.fulfillmentHandler.execute, nowIso }) });
  commerce.bootstrapPublishedOffers(COIN_COMMERCE_PRODUCTION_OFFERS);
  commerce.walletStore.creditCoins({ accountId: ACCOUNT, coinType: "paid_coins", amountUnits: 500,
    availability: "available", sourceType: "synthetic_seed", sourceRef: "source_synthetic_switch", sourceDigest: "a".repeat(64),
    policyRef: null, policyVersion: null, expiresAt: null,
    operation: { actorScope: "system:synthetic-switch", idempotencyKey: "credit_synthetic_switch", actorType: "system", actorRef: "synthetic_switch" } });
  const coordinator = createCoinCommerceCoordinator({ store: commerce, fulfillmentHandler: fulfillment.fulfillmentHandler,
    nowFn, scheduleFn: () => 0, clearScheduleFn: () => {} });
  applyThirdPartySubscriptionMigrations({ database: thirdPartyDb, expectedMigrationId: REQUIRED_THIRD_PARTY_SUBSCRIPTION_MIGRATION_ID,
    expectedDdlChecksum: REQUIRED_THIRD_PARTY_SUBSCRIPTION_DDL_CHECKSUM, nowFn });
  const network = { calls: 0 };
  const forbidRemote = async () => { network.calls += 1; throw new Error("Synthetic remote access forbidden"); };
  const thirdParty = createSqliteThirdPartySubscriptionStore({ database: thirdPartyDb,
    secretProtector: createPortalTotpSecretProtector({ key: "34".repeat(32) }), nowFn, fetchFn: forbidRemote, resolveFn: forbidRemote });
  for (const [tier, country, host, material] of [
    ["monthly_basic", "HK", "203.0.113.10", "synthetic-basic-switch-material"],
    ["monthly_plus", "JP", "203.0.113.11", "synthetic-plus-switch-material"],
  ]) thirdParty.createInlineSource({ name: `synthetic-${tier}`, tiers: [tier], enabled: true,
    yamlContent: ["proxies:", `  - name: ${country}`, "    type: ss", `    server: ${host}`, "    port: 8388", "    cipher: aes-256-gcm", `    password: ${material}`].join("\n") });
  const selectedTiers = [];
  const listActive = thirdParty.listActiveServersForPlan;
  thirdParty.listActiveServersForPlan = tier => { selectedTiers.push(tier); return listActive(tier); };
  const app = createApp({ rootDir: ROOT, consoleToken: "synthetic_switch_console", proxyConfig,
    subscriptions: { core, publicSubscriptionBaseUrl: "https://subscription.example.test" },
    thirdPartySubscriptions: { enabled: true, available: true, store: thirdParty },
    services: { ssLocal: { status: () => ({ running: false }) }, httpProxy: { status: () => ({ running: false }) } },
    platform: { controlStore: control, usageNowFn: nowFn, coinsCommerceEnabled: true, userPortalRoutesEnabled: true,
      coinsCommercePlanSwitchEnabled: true, coinsCommerceAuthorityEnabled: false,
      coinCommerceStore: commerce, coinCommerceCoordinator: coordinator,
      userPortalAuth: { requireSession({ sessionRef }) {
        if (sessionRef !== SESSION) throw Object.assign(new Error("Synthetic session invalid"), { code: "invalid_session" });
        return { accountId: ACCOUNT, sessionRef };
      } } }
  }, { rateLimitNowFn: () => Date.parse(clock.value) });
  const listening = await listen(app); server = listening.server;
  async function request(path, body, key) {
    const response = await fetch(`${listening.baseUrl}${path}`, { method: body === undefined ? "GET" : "POST",
      headers: { "X-Portal-Session": SESSION, ...(body === undefined ? {} : { "Content-Type": "application/json" }),
        ...(key ? { "Idempotency-Key": key } : {}) }, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(5000) });
    return { status: response.status, body: await response.json() };
  }
  const artifactPath = new URL(artifact.subscriptionUrl).pathname.replace(/\.yaml$/i, "");
  const paths = [`/sub/clash.yaml?token=${TOKEN}`, artifactPath, `${artifactPath}/profile.yaml`, `${artifactPath}/provider.yaml`];
  return { clock, network, selectedTiers, request,
    entitlement: () => control.getEntitlement(ENTITLEMENT),
    scheduled: () => controlDb.prepare("select status,effective_at from platform_scheduled_plan_switches order by switch_ref").all(),
    usage: () => control.listUsageSamples({ requestId: REQUEST }),
    holds: () => controlDb.prepare("select count(*) from platform_coin_holds").pluck().get(),
    tick: () => coordinator.runOnce(),
    async purchase(offer, key) {
      const preview = await request("/api/portal/commerce/checkout-preview", { offerRef: offer.offerRef });
      assert.equal(preview.status, 200);
      const confirmed = await request("/api/portal/commerce/orders", { quoteRef: preview.body.quote.quoteRef }, key);
      assert.equal(confirmed.status, 201);
      return { quote: preview.body.quote, order: confirmed.body.order };
    },
    async assertDelivery(tier) {
      for (const path of paths) {
        const response = await fetch(`${listening.baseUrl}${path}`, { signal: AbortSignal.timeout(5000) });
        assert.equal(response.status, 200);
        assert.match(response.headers.get("cache-control"), /no-store/);
        const text = await response.text();
        if (tier === null) {
          assert.equal(response.headers.get("x-subscription-status"), "expired");
          assert.equal(text === generateSubscriptionExpiryNotice({ providerOnly: path.endsWith("/provider.yaml") }), true,
            "expired delivery must equal the credential-free notice");
          assert.equal(/synthetic-(?:basic|plus)-switch-material/.test(text), false,
            "expired delivery must not contain connection material");
        } else {
          assert.equal(response.headers.get("x-subscription-status"), null);
          assert.ok(text.includes(`synthetic-${tier === "monthly_basic" ? "basic" : "plus"}-switch-material`));
          assert.ok(!text.includes(`synthetic-${tier === "monthly_basic" ? "plus" : "basic"}-switch-material`));
          assert.equal(selectedTiers.at(-1), tier);
        }
      }
    },
  };
}

test("real HTTP paid basic-to-plus upgrade changes third-party delivery only after fulfillment and stops at expiry", async t => {
  const f = await fixture(t, BASIC);
  const history = f.usage();
  await f.assertDelivery("monthly_basic");
  const { quote, order } = await f.purchase(PLUS, "synthetic_upgrade_third_party");
  assert.equal(quote.planSwitch.kind, "upgrade_inplace");
  await f.assertDelivery("monthly_basic");
  f.clock.value = new Date(Date.parse(NOW) + 4000).toISOString();
  assert.equal((await f.tick()).commandsDelivered, 1);
  assert.equal((await f.request(`/api/portal/commerce/orders/${order.orderRef}`)).body.order.paymentStatus, "captured");
  assert.equal(f.entitlement().plan, PLUS.offerVersionRef);
  assert.equal(f.entitlement().trafficLimitBytes, 100 * GIB);
  assert.equal(f.entitlement().validUntil, UNTIL);
  await f.assertDelivery("monthly_plus");
  await f.tick();
  assert.equal(f.holds(), 1);
  assert.deepEqual(f.usage(), history);
  f.clock.value = new Date(Date.parse(UNTIL) - 1).toISOString();
  await f.assertDelivery("monthly_plus");
  const reads = f.selectedTiers.length;
  f.clock.value = UNTIL;
  await f.assertDelivery(null);
  assert.equal(f.selectedTiers.length, reads);
  assert.equal(f.network.calls, 0);
});

test("real HTTP paid downgrade retains plus until due, then distributes only basic through the renewed term", async t => {
  const f = await fixture(t, PLUS);
  const history = f.usage();
  const { quote, order } = await f.purchase(BASIC, "synthetic_downgrade_third_party");
  assert.equal(quote.planSwitch.kind, "downgrade_scheduled");
  f.clock.value = new Date(Date.parse(NOW) + 4000).toISOString();
  assert.equal((await f.tick()).commandsDelivered, 1);
  assert.equal((await f.request(`/api/portal/commerce/orders/${order.orderRef}`)).body.order.paymentStatus, "captured");
  assert.deepEqual(f.scheduled(), [{ status: "scheduled", effective_at: UNTIL }]);
  assert.equal(f.entitlement().plan, PLUS.offerVersionRef);
  await f.assertDelivery("monthly_plus");
  f.clock.value = new Date(Date.parse(UNTIL) - 1).toISOString();
  await f.tick();
  await f.assertDelivery("monthly_plus");
  f.clock.value = UNTIL;
  const reads = f.selectedTiers.length;
  await f.assertDelivery(null);
  assert.equal(f.selectedTiers.length, reads, "expiry cannot leak old tier while due fulfillment has not run");
  await f.tick();
  assert.equal(f.scheduled()[0].status, "applied");
  assert.equal(f.entitlement().plan, BASIC.offerVersionRef);
  assert.equal(f.entitlement().trafficLimitBytes, 50 * GIB);
  const newExpiry = new Date(Date.parse(UNTIL) + 30 * 86400000).toISOString();
  assert.equal(f.entitlement().validUntil, newExpiry);
  await f.assertDelivery("monthly_basic");
  await f.tick();
  assert.equal(f.entitlement().validUntil, newExpiry);
  assert.equal(f.holds(), 1);
  assert.deepEqual(f.usage(), history);
  f.clock.value = newExpiry;
  const finalReads = f.selectedTiers.length;
  await f.assertDelivery(null);
  assert.equal(f.selectedTiers.length, finalReads);
  assert.equal(f.network.calls, 0);
});
