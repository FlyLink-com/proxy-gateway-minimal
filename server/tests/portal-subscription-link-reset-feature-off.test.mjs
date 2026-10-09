import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import Database from "better-sqlite3";
import { createApp } from "../app.mjs";
import { createPortalAccessRequestService } from "../services/platform/portal-access-requests.mjs";
import { createSqliteSubscriptionControlStore } from "../services/platform/subscription-control-db.mjs";
import { ensurePortalSubscriptionLinkResetSchema } from "../services/platform/portal-subscription-link-reset-store.mjs";
import { createCoinCommerceProductionSubscriptionFulfillment } from "../services/platform/coin-commerce-production-subscription-fulfillment.mjs";
import { COIN_COMMERCE_PRODUCTION_OFFERS } from "../services/platform/coin-commerce-production-catalog.mjs";
import { createSubscriptionCore } from "../services/subscriptions/core.mjs";
import { createSubscriptionRepository } from "../services/subscriptions/repository.mjs";
import { listen } from "./helpers/listen.mjs";

const NOW = "2026-10-09T12:00:00.000Z";
const FROM = "2026-10-01T00:00:00.000Z";
const UNTIL = "2026-11-01T00:00:00.000Z";
const ACCOUNT = "acct_reset_feature_off";
const REQUEST = "pareq_reset_feature_off";
const TENANT = "tenant_reset_feature_off";
const ENTITLEMENT = "ent_reset_feature_off";
const ARTIFACT = "artifact_reset_feature_off";
const EDGE = "edgecred_reset_feature_off";
const SESSION = "synthetic_feature_off_session";
const MATERIAL = "synthetic_feature_off_original_artifact";
const ORIGINAL_URL = `https://subscription.example.test/sub/a/${MATERIAL}.yaml`;
const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const TEST_FILE = fileURLToPath(import.meta.url);
const OFFER = COIN_COMMERCE_PRODUCTION_OFFERS[0];
const RESET_INPUT = Object.freeze({ portalUserRef: ACCOUNT, requestRef: REQUEST, confirmed: true,
  idempotencyKey: "synthetic-feature-off-reset-01" });
const CONFIG = { servers: [{ id: "node_synthetic_feature_off", name: "synthetic-feature-off-node",
  host: "192.0.2.1", port: 443, method: "aes-256-gcm", password: "synthetic-no-protocol-network" }],
  pingHosts: [], nginx: {} };
const hash = value => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const ref = (prefix, value) => `${prefix}ref_${createHash("sha256").update(value).digest("hex").slice(0, 16)}`;

function assertOwnedDirectory(directory) {
  assert.equal(dirname(realpathSync(directory)), realpathSync(tmpdir()));
  assert.match(basename(directory), /^portal-reset-feature-off-/);
  assert.equal(resolve(directory), realpathSync(directory));
}

function featureOffChildEnvironment() {
  // Keep the environment allowlisted, but preserve the effective temporary
  // root so the child's unchanged exact-directory guard sees the same scope.
  const temporaryRoot = tmpdir();
  return { NODE_ENV: "test", TMPDIR: temporaryRoot, TMP: temporaryRoot, TEMP: temporaryRoot,
    ...(process.env.SystemRoot ? { SystemRoot: process.env.SystemRoot } : {}) };
}

function open(directory) {
  assertOwnedDirectory(directory);
  const controlDb = new Database(join(directory, "control.sqlite"));
  const control = createSqliteSubscriptionControlStore({ database: controlDb });
  const runtime = createSubscriptionRepository({ dbPath: join(directory, "runtime.sqlite") });
  const core = createSubscriptionCore({ repository: runtime, proxyConfig: CONFIG,
    publicSubscriptionBaseUrl: "https://subscription.example.test", nowFn: () => new Date(NOW) });
  const service = enabled => createPortalAccessRequestService({
    runtimeCore: core, controlStore: control, nowFn: () => new Date(NOW), subscriptionLinkResetEnabled: enabled
  });
  const fulfillment = (at = NOW) => createCoinCommerceProductionSubscriptionFulfillment({ controlStore: control,
    runtimeCore: core, accountActivationReader: () => true, nowFn: () => new Date(at) });
  return { controlDb, control, runtime, core, service, fulfillment,
    close() { runtime.close(); controlDb.close(); } };
}

function command(suffix) {
  return { accountId: ACCOUNT, commandRef: `coincmd_feature_off_${suffix}`, orderRef: `coinord_feature_off_${suffix}`,
    offerVersionRef: OFFER.offerVersionRef, delivery: { ...OFFER.delivery } };
}

function seed(f) {
  // Same owned legacy-delivery contract used by the ordinary E2E and existing
  // Commerce fulfillment fixtures, persisted here for an actual process exit.
  f.control.createAccount({ id: ACCOUNT, ownerRef: ACCOUNT, status: "active", createdAt: FROM, updatedAt: FROM });
  f.control.createEntitlement({ id: ENTITLEMENT, accountId: ACCOUNT, plan: "trial", status: "active",
    validFrom: FROM, validUntil: UNTIL, maxArtifacts: 1, maxDevices: 2,
    trafficLimitBytes: 5 * 1024 ** 3, createdAt: FROM, updatedAt: FROM });
  f.control.createIssuanceRequest({ id: REQUEST, accountId: ACCOUNT, entitlementId: ENTITLEMENT,
    approvalRef: "approval_feature_off", status: "issued", nodeId: "node_synthetic_feature_off",
    purpose: "portal_access_request", requestedByRef: ACCOUNT, createdAt: FROM, updatedAt: FROM });
  f.runtime.createTenant({ id: TENANT, displayName: "synthetic-feature-off", status: "active", expiresAt: UNTIL,
    nodeId: "node_synthetic_feature_off", credentialMode: "shared-node", tokenHash: "synthetic_feature_off_hash",
    tokenPrefix: "synthetic", note: "synthetic", now: FROM });
  const issuanceCore = createSubscriptionCore({ repository: f.runtime, proxyConfig: CONFIG,
    publicSubscriptionBaseUrl: "https://subscription.example.test", nowFn: () => new Date(NOW),
    artifactIdFactory: () => ARTIFACT, artifactSecretFactory: () => MATERIAL });
  assert.equal(issuanceCore.createSubscriptionArtifact(TENANT).subscriptionUrl, ORIGINAL_URL);
  f.control.linkIssuedSubscription({ id: "link_feature_off", requestId: REQUEST,
    tenantRef: ref("tenant", TENANT), artifactRef: ref("artifact", ARTIFACT), status: "active",
    createdAt: FROM, updatedAt: FROM });
  f.control.upsertPortalAccessRequest({ id: REQUEST, portalUserRef: ACCOUNT, plan: "trial", clientTarget: "clash",
    durationDays: 7, quantity: 1, status: "delivered", nextAction: "user_can_use_access", priorTrialState: "not_applicable",
    submittedAt: FROM, updatedAt: FROM, reviewedAt: FROM, reviewedByRef: "synthetic_operator", validUntil: UNTIL,
    expiresAt: UNTIL, entitlementRef: ENTITLEMENT, accessGrantRef: "grant_feature_off", tenantId: TENANT,
    artifactId: ARTIFACT, subscriptionUrl: ORIGINAL_URL, edgeChannelRef: "node_synthetic_feature_off",
    edgeCredentialRef: EDGE, edgeMaterialDigest: "sha256:synthetic_feature_off" });
  f.control.recordUsageSample({ id: "sample_feature_off", sourceRef: "source_feature_off",
    channelRef: "node_synthetic_feature_off", edgeCredentialRef: EDGE, accountId: ACCOUNT, entitlementId: ENTITLEMENT,
    requestId: REQUEST, observedAt: "2026-10-09T11:59:00.000Z", intervalStartedAt: "2026-10-09T11:58:00.000Z",
    intervalEndedAt: "2026-10-09T11:59:00.000Z", uploadBytes: 1024, downloadBytes: 3072, totalBytes: 4096,
    sampleDigest: "synthetic_feature_off_usage_digest", createdAt: NOW });
  ensurePortalSubscriptionLinkResetSchema(f.controlDb);
}

function stableState(f) {
  return {
    journal: f.controlDb.prepare("select * from platform_portal_subscription_link_resets order by operation_key_digest").all(),
    account: f.control.getAccount(ACCOUNT),
    samples: f.control.listUsageSamples({ requestId: REQUEST }),
    rollup: f.control.getUsageRollupByEdgeCredentialRef(EDGE)
  };
}

function artifactPaths(url) {
  const full = new URL(url).pathname;
  const bare = full.replace(/\.yaml$/i, "");
  return [full, bare, `${bare}/profile.yaml`, `${bare}/provider.yaml`, `${full}/profile.yaml`, `${full}/provider.yaml`];
}

async function runFeatureOffChild(directory, parentPid, expectedReceiptHash, expectedStateHash) {
  assert.notEqual(process.pid, parentPid);
  const f = open(directory);
  const accessRequests = f.service(false);
  const initialRequest = f.control.getPortalAccessRequest(REQUEST);
  const stable = stableState(f);
  assert.equal(hash(stable), expectedStateHash, "new process must read the exact committed pre-exit state");
  assert.equal(stable.journal.length, 1);
  assert.equal(stable.journal[0].state, "completed");
  const state = { rootDir: ROOT, consoleToken: "synthetic_feature_off_console", proxyConfig: CONFIG,
    subscriptions: { core: f.core, publicSubscriptionBaseUrl: "https://subscription.example.test" },
    services: { ssLocal: { status: () => ({ running: false }) }, httpProxy: { status: () => ({ running: false }) } },
    platform: { controlStore: f.control, portalAccessRequests: accessRequests, userPortalRoutesEnabled: true,
      usageNowFn: () => new Date(NOW), userPortalAuth: { requireSession({ sessionRef }) {
        assert.equal(sessionRef, SESSION);
        return { accountId: ACCOUNT, sessionRef };
      } } } };
  const { server, baseUrl } = await listen(createApp(state));
  async function post(path, body) {
    const response = await fetch(`${baseUrl}${path}`, { method: "POST",
      headers: { "Content-Type": "application/json", "X-Portal-Session": SESSION }, body: JSON.stringify(body) });
    return { status: response.status, headers: response.headers, body: await response.json() };
  }
  async function checkLinks(expectedUrl, expectedUntil) {
    for (const path of artifactPaths(ORIGINAL_URL)) {
      const response = await fetch(`${baseUrl}${path}`);
      assert.equal(response.status, 410);
      assert.deepEqual(await response.json(), { error: "Subscription artifact rotated" });
    }
    for (const path of artifactPaths(expectedUrl)) {
      const response = await fetch(`${baseUrl}${path}`);
      assert.equal(response.status, 200);
      assert.equal(response.headers.get("x-subscription-valid-until"), expectedUntil);
      assert.match(response.headers.get("subscription-userinfo"), /^upload=1024; download=3072;/);
      assert.match(await response.text(), /proxies:|proxy-providers:/);
    }
    const revealed = await post("/api/portal/access-requests/reveal", { requestRef: REQUEST });
    assert.equal(revealed.status, 200);
    assert.equal(revealed.body.request.subscriptionUrl, expectedUrl);
  }
  try {
    await checkLinks(initialRequest.subscriptionUrl, initialRequest.validUntil);
    for (const idempotencyKey of [RESET_INPUT.idempotencyKey, "synthetic-feature-off-new-reset"]) {
      const reset = await post("/api/portal/access-requests/reset-link", { requestRef: REQUEST, idempotencyKey, confirmed: true });
      assert.equal(reset.status, 503);
      assert.equal(reset.headers.get("cache-control"), "no-store");
      assert.deepEqual(reset.body, { error: "subscription_link_reset_unavailable" });
    }
    assert.deepEqual(stableState(f), stable);
    assert.deepEqual(f.control.getPortalAccessRequest(REQUEST), initialRequest);

    const service = f.fulfillment();
    const eligibility = { accountId: ACCOUNT, offerVersionRef: OFFER.offerVersionRef };
    assert.equal(service.purchaseEligibilityReader(eligibility), true);
    const recovered = service.fulfillmentHandler.execute(command("initial"));
    assert.equal(recovered.status, "delivered");
    assert.equal(hash(recovered), expectedReceiptHash);
    assert.deepEqual(f.control.getPortalAccessRequest(REQUEST), initialRequest, "recovery must not add another renewal");

    const renewed = service.fulfillmentHandler.execute(command("renewal"));
    assert.equal(renewed.status, "delivered");
    const after = f.control.getPortalAccessRequest(REQUEST);
    const expectedUntil = new Date(Date.parse(initialRequest.validUntil) + OFFER.delivery.durationDays * 86400_000).toISOString();
    assert.equal(after.validUntil, expectedUntil);
    assert.equal(after.subscriptionUrl, initialRequest.subscriptionUrl);
    assert.equal(after.artifactId, initialRequest.artifactId);
    assert.equal(after.tenantId, initialRequest.tenantId);
    assert.equal(after.edgeCredentialRef, initialRequest.edgeCredentialRef);
    assert.equal(after.edgeMaterialDigest, initialRequest.edgeMaterialDigest);
    assert.equal(f.core.getTenant(TENANT).expiresAt, expectedUntil);
    assert.equal(f.control.findUsageBindingByTenantRef(ref("tenant", TENANT)).artifactRef, ref("artifact", ARTIFACT));
    assert.deepEqual(service.fulfillmentHandler.execute(command("renewal")), renewed);
    assert.deepEqual(f.control.getPortalAccessRequest(REQUEST), after);
    assert.equal(service.purchaseEligibilityReader(eligibility), true);
    assert.deepEqual(stableState(f), stable, "feature-off recovery and renewal must not alter reset evidence or usage");
    const artifacts = f.core.listSubscriptionArtifacts(TENANT);
    assert.equal(artifacts.length, 2);
    assert.equal(artifacts.find(artifact => artifact.id === ARTIFACT).status, "rotated");
    assert.equal(artifacts.find(artifact => artifact.id === after.artifactId).status, "active");
    await checkLinks(after.subscriptionUrl, expectedUntil);
    return { status: "passed", distinctProcess: true, featureDisabled: true, oldFormsRejected: 6,
      newFormsRendered: 6, unchangedResetRows: 1, artifactCount: 2, usageBytes: 4096,
      priorFulfillmentRecovered: true, renewalAndReplayValidated: true };
  } finally {
    await new Promise((resolveClosed, reject) => server.close(error => error ? reject(error) : resolveClosed()));
    f.close();
  }
}

if (process.argv[2] === "--synthetic-feature-off-child") {
  const receipt = await runFeatureOffChild(process.argv[3], Number(process.argv[4]), process.argv[5], process.argv[6]);
  process.stdout.write(JSON.stringify(receipt));
} else {
  test("feature-off rollback in a new process preserves completed reset, render, delivery and renewal recovery", t => {
    const directory = mkdtempSync(join(tmpdir(), "portal-reset-feature-off-"));
    t.after(() => { assertOwnedDirectory(directory); rmSync(directory, { recursive: true, force: true }); });
    const f = open(directory);
    let receiptHash;
    let stateHash;
    try {
      seed(f);
      // Start the paid billing cycle before the nonzero usage sample. A sample
      // from the preceding trial must not count toward the new paid cycle.
      const delivered = f.fulfillment(FROM).fulfillmentHandler.execute(command("initial"));
      assert.equal(delivered.status, "delivered");
      receiptHash = hash(delivered);
      const reset = f.service(true).resetSubscriptionLink(RESET_INPUT);
      assert.notEqual(reset.subscriptionUrl, ORIGINAL_URL);
      assert.equal(reset.event.type, "subscription_link_reset");
      stateHash = hash(stableState(f));
    } finally { f.close(); }
    const child = spawnSync(process.execPath, [TEST_FILE, "--synthetic-feature-off-child", directory,
      String(process.pid), receiptHash, stateHash], {
      env: featureOffChildEnvironment(),
      encoding: "utf8", timeout: 20_000, maxBuffer: 1024 * 1024
    });
    assert.equal(child.error, undefined);
    assert.equal(child.status, 0, child.stderr);
    assert.deepEqual(JSON.parse(child.stdout), { status: "passed", distinctProcess: true, featureDisabled: true,
      oldFormsRejected: 6, newFormsRendered: 6, unchangedResetRows: 1, artifactCount: 2, usageBytes: 4096,
      priorFulfillmentRecovered: true, renewalAndReplayValidated: true });
  });

  test("feature-off recovery preserves an explicitly restricted temporary root across both processes", t => {
    const childEnv = featureOffChildEnvironment();
    for (const variable of ["TMPDIR", "TMP", "TEMP"]) assert.equal(childEnv[variable], tmpdir());
    const restrictedRoot = mkdtempSync(join(tmpdir(), "portal-reset-feature-off-tmp-"));
    t.after(() => { assertOwnedDirectory(restrictedRoot); rmSync(restrictedRoot, { recursive: true, force: true }); });
    const child = spawnSync(process.execPath, ["--test", "--test-name-pattern=^feature-off rollback in a new process", TEST_FILE], {
      env: { NODE_ENV: "test", TMPDIR: restrictedRoot, TMP: restrictedRoot, TEMP: restrictedRoot,
        ...(process.env.SystemRoot ? { SystemRoot: process.env.SystemRoot } : {}) },
      encoding: "utf8", timeout: 30_000, maxBuffer: 1024 * 1024
    });
    assert.equal(child.error, undefined);
    assert.equal(child.status, 0, child.stderr || child.stdout);
    assert.match(child.stdout, /\bpass 1\b/, "the selected recovery test must actually execute");
  });
}
