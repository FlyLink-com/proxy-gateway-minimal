import { createHash, randomBytes } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { request as httpRequest } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";

import { createApp } from "../app.mjs";
import { createSqliteSubscriptionControlStore } from "../services/platform/subscription-control-db.mjs";
import { createSqliteSubscriptionStore } from "../services/subscriptions/repository.mjs";
import { createSubscriptionCore } from "../services/subscriptions/core.mjs";
import { createUserPortalAuthService } from "../services/platform/user-portal-auth.mjs";
import { createSqliteCoinCommerceStore } from "../services/platform/coin-commerce-store.mjs";
import { createCoinCommerceCoordinator } from "../services/platform/coin-commerce-coordinator.mjs";
import { applyCoinWalletMigrations, COIN_WALLET_MIGRATIONS,
  REQUIRED_COIN_WALLET_MIGRATION_ID } from "../services/platform/coin-wallet-migrations.mjs";
import { applyCoinCommerceMigrations, COIN_COMMERCE_MIGRATIONS,
  REQUIRED_COIN_COMMERCE_MIGRATION_ID } from "../services/platform/coin-commerce-migrations.mjs";
import { COIN_COMMERCE_DATA_PACK_CANDIDATES } from "../services/platform/coin-commerce-production-catalog.mjs";
import { createCoinCommerceDataPackMaterialEscrow } from "../services/platform/coin-commerce-data-pack-material-escrow.mjs";
import { createCoinCommerceDataPackOrderDelivery } from "../services/platform/coin-commerce-data-pack-order-delivery.mjs";
import { createCoinCommerceDataPackArtifactRotation } from "../services/platform/coin-commerce-data-pack-artifact-rotation.mjs";
import { createCoinCommerceDataPackCredentialReset } from "../services/platform/coin-commerce-data-pack-credential-reset.mjs";
import { createCoinCommerceDataPackProductionFulfillment } from "../services/platform/coin-commerce-data-pack-production-binding.mjs";
import { createFileBackedEdgeCredentialMaterialStore } from "../services/edge/credential-material-store.mjs";
import { createOrderEdgeCredentialIssuer } from "../services/edge/order-credential-issuer.mjs";
import { createDataPlaneDesiredStateNotifier } from "../services/edge/data-plane-desired-state-notifier.mjs";
import { listen } from "./helpers/listen.mjs";

const ACCOUNT = "acct_pack_http_owner";
const OTHER = "acct_pack_http_other";
const CHANNEL = "channel_pack_http";
const NODE = "node_pack_http";
const INITIAL_COINS = 500;

// Reuse the cross-DB fixture's clock interception. Business writes still run
// through the real stores; advancing this clock only skips lease/cancel waits.
function clockedDatabase(database, clock) {
  return new Proxy(database, {
    get(target, property) {
      if (property === "inTransaction") return target.inTransaction;
      if (property === "prepare") return (sql) => {
        if (/select\s+strftime\('%Y-%m-%dT%H:%M:%fZ',\s*'now'\)/i.test(sql)) {
          return { pluck: () => ({ get: () => clock.value }) };
        }
        return target.prepare(sql);
      };
      const value = Reflect.get(target, property, target);
      return typeof value === "function" ? value.bind(target) : value;
    }
  });
}

export const materialDigest = (value) => createHash("sha256").update(value).digest("hex");

export async function createPackHttpFixture() {
  const directory = mkdtempSync(join(tmpdir(), "pack-http-acceptance-"));
  const controlPath = join(directory, "control.sqlite");
  const runtimePath = join(directory, "runtime.sqlite");
  const key = randomBytes(32);
  const clock = { value: "2026-09-30T00:00:00.000Z" };
  const sessions = {};
  let control;
  let database;
  let commerce;
  let runtimeStore;
  let runtimeCore;
  let escrow;
  let edgeMaterialStore;
  let coordinator;
  let server;
  let baseUrl;
  let simulateApply = true;

  async function closeHandles() {
    if (server) {
      const closing = server;
      server = null;
      await new Promise((resolve, reject) => closing.close((error) => error ? reject(error) : resolve()));
    }
    await coordinator?.stop();
    coordinator = null;
    commerce?.close();
    commerce = null;
    database?.close();
    database = null;
    escrow?.close();
    escrow = null;
    runtimeStore?.close();
    runtimeStore = null;
    control?.close();
    control = null;
  }

  async function open(seed) {
    control = createSqliteSubscriptionControlStore({ dbPath: controlPath });
    if (seed) {
      for (const accountId of [ACCOUNT, OTHER]) {
        control.createAccount({ id: accountId, ownerRef: `owner_${accountId}`,
          status: "active", createdAt: clock.value, updatedAt: clock.value });
      }
      applyCoinWalletMigrations({ dbPath: controlPath,
        expectedMigrationId: REQUIRED_COIN_WALLET_MIGRATION_ID,
        expectedDdlChecksum: COIN_WALLET_MIGRATIONS[0].ddlChecksum });
      applyCoinCommerceMigrations({ dbPath: controlPath,
        expectedMigrationId: REQUIRED_COIN_COMMERCE_MIGRATION_ID,
        expectedDdlChecksum: COIN_COMMERCE_MIGRATIONS[0].ddlChecksum });
    }
    database = new Database(controlPath);
    database.pragma("foreign_keys = ON");
    commerce = createSqliteCoinCommerceStore({ database: clockedDatabase(database, clock), cancelWindowMs: 0 });
    runtimeStore = createSqliteSubscriptionStore({ dbPath: runtimePath });
    const proxyConfig = { servers: [{ id: CHANNEL, name: CHANNEL,
      region: "Synthetic", host: "192.0.2.10", port: 18388,
      method: "aes-256-gcm", password: "synthetic-config-only" }], pingHosts: [], nginx: {} };
    runtimeCore = createSubscriptionCore({ store: runtimeStore, proxyConfig,
      publicSubscriptionBaseUrl: "https://pack-http.example.invalid",
      nowFn: () => new Date(clock.value) });
    escrow = createCoinCommerceDataPackMaterialEscrow({ key, filePath: join(directory, "escrow.json") });
    edgeMaterialStore = createFileBackedEdgeCredentialMaterialStore({ filePath: join(directory, "edge-material.json") });
    const notifier = createDataPlaneDesiredStateNotifier({ controlStore: control,
      servers: [{ name: CHANNEL, physicalNodeRef: NODE, runtimeAdapter: "remote-data-plane-handoff" }],
      nowFn: () => clock.value });
    const binding = createCoinCommerceDataPackProductionFulfillment({
      commerceStore: commerce, controlStore: control, runtimeCore, materialEscrow: escrow,
      nodeId: CHANNEL, edgeMaterialStore,
      edgeCredentialIssuer: createOrderEdgeCredentialIssuer({ channelRef: CHANNEL, materialStore: edgeMaterialStore }),
      nowFn: () => new Date(clock.value),
      desiredStateNotifier: {
        notifyOrderLifecycle(input) {
          const result = notifier.notifyOrderLifecycle(input);
          if (!simulateApply) return result;
          const notification = result.notifications[0];
          // ONLY SIMULATED BOUNDARY: no Agent, protocol process or collector runs.
          // The handler still checks the exact desired state and stored receipt.
          if (!control.listEdgeApplyReceipts({ channelRef: CHANNEL }).some((receipt) => (
            receipt.desiredStateRef === notification.desiredStateRef && receipt.status === "applied"
          ))) {
            control.recordEdgeApplyReceipt({ id: `receipt_http_${notification.generation}`,
              channelRef: CHANNEL, desiredStateRef: notification.desiredStateRef,
              status: "applied", configTestOk: true, serviceActive: true,
              listenerUdp443: true, appliedAt: clock.value, createdAt: clock.value });
          }
          return { notificationCount: 1, notifications: [{ ...notification, status: "applied" }] };
        }
      }
    });
    coordinator = createCoinCommerceCoordinator({ store: commerce, fulfillmentHandler: binding,
      nowFn: () => new Date(clock.value), commandLeaseMs: 1000 });
    const delivery = createCoinCommerceDataPackOrderDelivery({ commerceStore: commerce,
      controlStore: control, runtimeCore, materialEscrow: escrow, nowFn: () => new Date(clock.value) });
    const artifactRotation = createCoinCommerceDataPackArtifactRotation({ commerceStore: commerce,
      controlStore: control, runtimeCore, materialEscrow: escrow, nowFn: () => new Date(clock.value) });
    const credentialReset = createCoinCommerceDataPackCredentialReset({ commerceStore: commerce,
      controlStore: control, materialStore: edgeMaterialStore, desiredStateNotifier: notifier,
      artifactRotation, nowFn: () => new Date(clock.value) });
    const auth = createUserPortalAuthService({ controlStore: control,
      nowFn: () => clock.value, totpVerifier: () => false });
    if (seed) {
      // Synthetic authenticated sessions use the real persistent auth checker.
      // Password/MFA login UI is deliberately outside this business acceptance.
      sessions.owner = auth.createPasswordSetupSession({ accountId: ACCOUNT }).session.sessionRef;
      sessions.other = auth.createPasswordSetupSession({ accountId: OTHER }).session.sessionRef;
      commerce.walletStore.creditCoins({ accountId: ACCOUNT, coinType: "paid_coins",
        amountUnits: INITIAL_COINS, availability: "available", sourceType: "synthetic_seed",
        sourceRef: "source_pack_http", sourceDigest: "e".repeat(64),
        policyRef: null, policyVersion: null, expiresAt: null,
        operation: { actorScope: "system:pack_http", idempotencyKey: "credit_pack_http",
          actorType: "system", actorRef: "pack_http" } });
      for (const offer of COIN_COMMERCE_DATA_PACK_CANDIDATES) commerce.publishOfferVersion(offer);
    }
    const state = {
      rootDir: fileURLToPath(new URL("../../", import.meta.url)),
      host: "127.0.0.1", ports: { console: 0, socks: 0, httpProxy: 0 },
      consoleToken: randomBytes(32).toString("hex"), proxyConfig, subscriptions: {},
      security: { adminAllowedCidrs: ["127.0.0.1/32"] },
      platform: { coinsCommerceEnabled: true, userPortalRoutesEnabled: true,
        coinCommerceStore: commerce, coinCommerceCoordinator: coordinator,
        userPortalAuth: auth, coinCommerceDataPackOrderDelivery: delivery,
        coinCommerceDataPackCredentialReset: credentialReset },
    };
    ({ server, baseUrl } = await listen(createApp(state)));
  }

  function request(path, { method = "GET", account = "owner", body, idempotencyKey } = {}) {
    const target = new URL(baseUrl);
    return new Promise((resolve, reject) => {
      const req = httpRequest({ hostname: target.hostname, port: target.port, path,
        method, agent: false, headers: { Connection: "close",
          ...(account ? { "X-Portal-Session": sessions[account] } : {}),
          ...(body === undefined ? {} : { "Content-Type": "application/json" }),
          ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}) }
      }, (res) => {
        const chunks = [];
        res.on("data", (chunk) => chunks.push(chunk));
        res.once("error", reject);
        res.on("end", () => {
          try { resolve({ status: res.statusCode, headers: res.headers,
            json: JSON.parse(Buffer.concat(chunks).toString("utf8")) }); }
          catch { reject(new Error("Synthetic HTTP response was not JSON")); }
        });
      });
      req.setTimeout(5000, () => req.destroy(new Error("Synthetic HTTP request timed out")));
      req.once("error", reject);
      req.end(body === undefined ? undefined : JSON.stringify(body));
    });
  }

  try { await open(true); }
  catch (error) { await closeHandles(); rmSync(directory, { recursive: true, force: true }); throw error; }
  return {
    request,
    runOnce: () => coordinator.runOnce(),
    advanceTo: (value) => { clock.value = value; },
    allowSimulatedApply: (value) => { simulateApply = value; },
    inspectResets() {
      return {
        total: database.prepare("select count(*) from platform_data_pack_credential_resets").pluck().get(),
        complete: database.prepare("select count(*) from platform_data_pack_credential_resets where status = 'complete'").pluck().get()
      };
    },
    advancePastLease() {
      clock.value = database.prepare("select max(lease_until) from platform_coin_commerce_fulfillment_commands").pluck().get();
    },
    inspect() {
      const funds = commerce.walletStore.getWalletProjection({ accountId: ACCOUNT });
      const count = (table) => database.prepare(`select count(*) from ${table}`).pluck().get();
      return {
        spendableUnits: funds.spendableUnits, heldUnits: funds.heldUnits,
        debits: database.prepare("select count(*) from platform_coin_ledger_entries where operation = 'held_to_consumed'").pluck().get(),
        debitUnits: database.prepare("select coalesce(sum(amount_units), 0) from platform_coin_ledger_entries where operation = 'held_to_consumed'").pluck().get(),
        orders: count("platform_coin_commerce_orders"), receipts: count("platform_coin_commerce_fulfillment_receipts"),
        resources: count("platform_data_pack_resources"),
        tenants: runtimeCore.listTenants().length,
        artifacts: runtimeCore.listTenants().reduce((sum, tenant) => sum + runtimeCore.listSubscriptionArtifacts(tenant.id).length, 0),
        edgeCredentials: edgeMaterialStore.listCredentialMaterialSummaries().length
      };
    },
    async reopen() { await closeHandles(); await open(false); },
    async close() {
      await closeHandles();
      key.fill(0);
      rmSync(directory, { recursive: true, force: true, maxRetries: 3 });
    }
  };
}
