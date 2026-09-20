import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import Database from "better-sqlite3";
import { createApp } from "../app.mjs";
import { createRuntimeState } from "../state.mjs";
import { createSqliteSubscriptionControlStore } from "../services/platform/subscription-control-db.mjs";
import { buildSourceValidationTestEnvironment } from "../../scripts/source-validation-test-runner.mjs";
import { listen } from "./helpers/listen.mjs";

const ROOT = resolve(fileURLToPath(new URL("../../", import.meta.url)));
const NOW = "2026-09-20T12:00:00.000Z";
const FROM = "2026-09-01T12:00:00.000Z";
const UNTIL = "2026-10-01T12:00:00.000Z";
const GB = 1024 ** 3;

function seedControlDb(path, { withEntitlement = true, withUsage = true, subscriptionUrl = null } = {}) {
  const store = createSqliteSubscriptionControlStore({ dbPath: path });
  store.createAccount({ id: "acct_legacy", ownerRef: "owner_legacy", createdAt: FROM, updatedAt: FROM });
  if (withEntitlement) {
    store.createEntitlement({ id: "ent_legacy", accountId: "acct_legacy", plan: "monthly", validFrom: FROM, validUntil: UNTIL, trafficLimitBytes: 50 * GB, createdAt: FROM, updatedAt: FROM });
    store.createIssuanceRequest({ id: "req_legacy", accountId: "acct_legacy", entitlementId: "ent_legacy", approvalRef: "approval_legacy", status: "issued", nodeId: "node_legacy", purpose: "subscription", requestedByRef: "owner_legacy", createdAt: FROM, updatedAt: FROM });
    const digest = (value) => createHash("sha256").update(value).digest("hex").slice(0, 16);
    store.linkIssuedSubscription({ id: "link_legacy", requestId: "req_legacy", tenantRef: `tenantref_${digest("tenant_legacy")}`, artifactRef: `artifactref_${digest("artifact_legacy")}`, createdAt: FROM, updatedAt: FROM });
    store.upsertPortalAccessRequest({ id: "req_legacy", portalUserRef: "acct_legacy", plan: "monthly", durationDays: 30, status: "issued", nextAction: "none", priorTrialState: "not_applicable", submittedAt: FROM, updatedAt: FROM, validUntil: UNTIL, entitlementRef: "ent_legacy", tenantId: "tenant_legacy", artifactId: "artifact_legacy", subscriptionUrl });
    if (withUsage) store.recordUsageSample({ id: "sample_legacy", sourceRef: "source_legacy", channelRef: "channel_legacy", edgeCredentialRef: "edgecred_req_legacy", accountId: "acct_legacy", entitlementId: "ent_legacy", requestId: "req_legacy", observedAt: "2026-09-20T11:59:00.000Z", intervalStartedAt: "2026-09-20T11:58:00.000Z", intervalEndedAt: "2026-09-20T11:59:00.000Z", uploadBytes: 100, downloadBytes: 900, totalBytes: 1000, sampleDigest: "digest_legacy", createdAt: "2026-09-20T11:59:00.000Z" });
  }
  store.close();
}

function runtimeEnv(proxyConfigPath) {
  return {
    ...buildSourceValidationTestEnvironment({}, { repositoryRoot: ROOT }),
    CONSOLE_TOKEN: "synthetic-console-token",
    USER_PORTAL_ROUTES_ENABLED: "true",
    SUBSCRIPTION_PROXY_CONFIG_PATH: proxyConfigPath
  };
}

function writeIsolatedProxyConfig(dir) {
  const path = join(dir, "proxy-servers.json");
  mkdirSync(dir, { recursive: true });
  writeFileSync(path, JSON.stringify({ servers: [{ id: "synthetic_node", name: "synthetic-node", physicalNodeRef: "synthetic-node", protocol: "tuic", type: "tuic", host: "edge.example.test", port: 443, uuid: "${SYNTHETIC_UUID}", password: "${SYNTHETIC_PASSWORD}", channelPool: "stable", channelRole: "stable", status: "online", subscriptionEligible: true, stableProtocolApproved: true, stableProtocolApprovalRef: "synthetic-approval", credentialMode: "per-order", credentialLifecycle: { addCredential: true, disableCredential: true, rotateCredential: true, restart: true } }] }), { mode: 0o600 });
  return path;
}

function createState(dir, options = {}) {
  const controlDbPath = join(dir, "control.sqlite");
  seedControlDb(controlDbPath, options);
  const proxyConfigPath = writeIsolatedProxyConfig(join(dir, "isolated-runtime"));
  return createRuntimeState({
    rootDir: new URL("../../", import.meta.url),
    env: { ...runtimeEnv(proxyConfigPath), SYNTHETIC_UUID: "11111111-1111-4111-8111-111111111111", SYNTHETIC_PASSWORD: "synthetic-password" },
    controlDbPath,
    subscriptionDbPath: join(dir, "subscriptions.sqlite"),
    platformUserPortalAuth: {
      createPasswordSetupSession: () => ({ session: { sessionRef: "session_legacy" } }),
      requireSession: ({ sessionRef }) => ({ sessionRef, accountId: sessionRef === "session_legacy" ? "acct_legacy" : "acct_other" })
    },
    userPortalNowFn: () => new Date(NOW),
    autoStartHttpProxy: false
  });
}

function controlCounts(path) {
  const database = new Database(path, { readonly: true });
  try {
    return {
      links: database.prepare("select count(*) as count from platform_issued_subscription_links").get().count,
      requests: database.prepare("select count(*) as count from platform_portal_access_requests").get().count,
      samples: database.prepare("select count(*) as count from platform_usage_samples").get().count
    };
  } finally {
    database.close();
  }
}

async function closeState(state) {
  if (typeof state?.close === "function") await state.close();
  try { state?.platform?.controlStore?.close?.(); } catch { /* already closed */ }
  try { state?.subscriptions?.close?.(); } catch { /* already closed */ }
}

async function closeServer(server) {
  if (!server) return;
  server.closeAllConnections?.();
  await new Promise((resolveClose) => server.close(resolveClose));
}

function removeIsolatedDir(dir) {
  try {
    rmSync(dir, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 });
  } catch (error) {
    if (process.platform !== "win32" || !["EPERM", "EBUSY"].includes(error?.code)) throw error;
  }
}

test("real createState composes the dormant-runtime portal current-resource service", async () => {
  const dir = mkdtempSync(join(tmpdir(), "portal-current-resource-composition-"));
  let state;
  try {
    state = createState(dir, { subscriptionUrl: "https://subscription.example.invalid/synthetic" });
    assert.equal(state.platform.walletFirstDeferredRuntimeEnabled, false);
    assert.equal(typeof state.platform.portalCurrentResourceService?.getCurrentOverview, "function");
    const overview = state.platform.portalCurrentResourceService.getCurrentOverview({ accountId: "acct_legacy" });
    assert.equal(overview.state, "available");
    assert.equal(overview.usage.usedBytes, 1000);
  } finally {
    await closeState(state);
    removeIsolatedDir(dir);
  }
});

test("HTTP overview is session-owned, queryless, non-cacheable, and legacy setup reads the existing link", async () => {
  const dir = mkdtempSync(join(tmpdir(), "portal-current-resource-http-"));
  let state;
  let server;
  try {
    state = createState(dir, { subscriptionUrl: "https://subscription.example.invalid/synthetic" });
    const beforeCounts = controlCounts(join(dir, "control.sqlite"));
    ({ server } = await listen(createApp(state)));
    const baseUrl = `http://127.0.0.1:${server.address().port}`;
    const headers = { "x-portal-session": "session_legacy" };
    const response = await fetch(`${baseUrl}/api/portal/resources/current/overview`, { headers });
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.resource.usage.usedBytes, 1000);
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.equal(response.headers.get("referrer-policy"), "no-referrer");
    assert.equal((await fetch(`${baseUrl}/api/portal/resources/current/overview?unexpected=1`, { headers })).status, 400);
    const other = await fetch(`${baseUrl}/api/portal/resources/current/overview`, { headers: { "x-portal-session": "session_other" } });
    assert.equal(other.status, 200);
    assert.deepEqual(await other.json(), { resource: { state: "none" } });
    assert.equal((await fetch(`${baseUrl}/api/portal/resources/current/setup`, { method: "POST", headers: { "x-portal-session": "session_other", "content-type": "application/json" }, body: JSON.stringify({ idempotencyKey: "synthetic-idempotency-0001" }) })).status, 409);
    const setup = await fetch(`${baseUrl}/api/portal/resources/current/setup`, { method: "POST", headers: { ...headers, "content-type": "application/json" }, body: JSON.stringify({ idempotencyKey: "synthetic-idempotency-0001" }) });
    assert.equal(setup.status, 200);
    const setupBody = await setup.json();
    assert.match(setupBody.delivery.subscriptionUrl, /^https:\/\//);
    const ack = await fetch(`${baseUrl}/api/portal/resources/current/setup/ack`, { method: "POST", headers: { ...headers, "content-type": "application/json" }, body: JSON.stringify({ handoffRef: setupBody.delivery.handoffRef }) });
    assert.equal(ack.status, 204);
    assert.deepEqual(controlCounts(join(dir, "control.sqlite")), beforeCounts);
  } finally {
    await closeServer(server);
    await closeState(state);
    removeIsolatedDir(dir);
  }
});

test("HTTP overview returns none without an active entitlement", async () => {
  const dir = mkdtempSync(join(tmpdir(), "portal-current-resource-none-"));
  let state;
  let server;
  try {
    state = createState(dir, { withEntitlement: false });
    ({ server } = await listen(createApp(state)));
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/portal/resources/current/overview`, { headers: { "x-portal-session": "session_legacy" } });
    assert.equal(response.status, 200);
    assert.deepEqual((await response.json()).resource, { state: "none" });
  } finally {
    await closeServer(server);
    await closeState(state);
    removeIsolatedDir(dir);
  }
});
