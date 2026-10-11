import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import test from "node:test";
import Database from "better-sqlite3";
import { createApp } from "../app.mjs";
import { createPortalAccessRequestService } from "../services/platform/portal-access-requests.mjs";
import { createSqliteSubscriptionControlStore } from "../services/platform/subscription-control-db.mjs";
import { ensurePortalSubscriptionLinkResetSchema } from "../services/platform/portal-subscription-link-reset-store.mjs";
import { createSubscriptionCore } from "../services/subscriptions/core.mjs";
import { createSubscriptionRepository } from "../services/subscriptions/repository.mjs";
import { listen } from "./helpers/listen.mjs";

const NOW = "2026-10-09T12:00:00.000Z";
const FROM = "2026-10-01T00:00:00.000Z";
const UNTIL = "2026-11-01T00:00:00.000Z";
const ACCOUNT = "account_reset_e2e";
const SESSION = "synthetic_reset_e2e_session";
const GB = 1024 ** 3;
const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const ref = (kind, value) => `${kind}ref_${createHash("sha256").update(value).digest("hex").slice(0, 16)}`;

function artifactPaths(subscriptionUrl) {
  const full = new URL(subscriptionUrl).pathname;
  const bare = full.replace(/\.yaml$/i, "");
  return [full, bare, `${bare}/profile.yaml`, `${bare}/provider.yaml`, `${full}/profile.yaml`, `${full}/provider.yaml`];
}

async function fixture(t) {
  const controlDb = new Database(":memory:");
  const runtimeDb = new Database(":memory:");
  const control = createSqliteSubscriptionControlStore({ database: controlDb });
  const repository = createSubscriptionRepository({ database: runtimeDb });
  const nowFn = () => new Date(NOW);
  const proxyConfig = { servers: [{
    id: "node_synthetic_e2e", name: "synthetic-reset-node", protocol: "ss",
    host: "192.0.2.1", port: 443, method: "aes-256-gcm", password: "synthetic-only-not-used-for-network"
  }], pingHosts: [], nginx: {} };
  const core = createSubscriptionCore({
    repository, nowFn, proxyConfig, publicSubscriptionBaseUrl: "https://subscription.example.test"
  });
  control.createAccount({ id: ACCOUNT, ownerRef: ACCOUNT, status: "active", createdAt: FROM, updatedAt: FROM });

  function seedOrder(suffix, bytes) {
    const requestRef = `request_reset_e2e_${suffix}`;
    const tenantId = `tenant_reset_e2e_${suffix}`;
    const entitlementId = `entitlement_reset_e2e_${suffix}`;
    const edgeCredentialRef = `edgecred_reset_e2e_${suffix}`;
    repository.createTenant({ id: tenantId, displayName: `synthetic-${suffix}`, status: "active",
      expiresAt: UNTIL, nodeId: "node_synthetic_e2e", credentialMode: "shared-node", note: "synthetic e2e",
      tokenHash: `synthetic_hash_${suffix}`, tokenPrefix: `synthetic_${suffix}`, now: FROM });
    const artifact = core.createSubscriptionArtifact(tenantId);
    control.createEntitlement({ id: entitlementId, accountId: ACCOUNT, plan: "monthly", status: "active",
      validFrom: FROM, validUntil: UNTIL, trafficLimitBytes: 100 * GB, createdAt: FROM, updatedAt: FROM });
    control.createIssuanceRequest({ id: requestRef, accountId: ACCOUNT, entitlementId,
      approvalRef: `approval_e2e_${suffix}`, status: "issued", nodeId: "node_synthetic_e2e",
      purpose: "subscription", requestedByRef: ACCOUNT, createdAt: FROM, updatedAt: FROM });
    control.linkIssuedSubscription({ id: `link_reset_e2e_${suffix}`, requestId: requestRef,
      tenantRef: ref("tenant", tenantId), artifactRef: ref("artifact", artifact.artifact.id),
      status: "active", createdAt: FROM, updatedAt: FROM });
    control.upsertPortalAccessRequest({ id: requestRef, portalUserRef: ACCOUNT, plan: "monthly",
      clientTarget: "clash", durationDays: 30, quantity: 1, status: "delivered",
      nextAction: "subscription_ready", priorTrialState: "not_applicable", submittedAt: FROM, updatedAt: FROM,
      validUntil: UNTIL, expiresAt: UNTIL, entitlementRef: entitlementId, accessGrantRef: `grant_e2e_${suffix}`,
      tenantId, artifactId: artifact.artifact.id, subscriptionUrl: artifact.subscriptionUrl,
      edgeChannelRef: "node_synthetic_e2e", edgeCredentialRef, edgeMaterialDigest: "1".repeat(64) });
    control.recordUsageSample({ id: `sample_reset_e2e_${suffix}`, sourceRef: `source_e2e_${suffix}`,
      channelRef: "node_synthetic_e2e", edgeCredentialRef, accountId: ACCOUNT, entitlementId, requestId: requestRef,
      observedAt: "2026-10-09T11:59:00.000Z", intervalStartedAt: "2026-10-09T11:58:00.000Z",
      intervalEndedAt: "2026-10-09T11:59:00.000Z", uploadBytes: bytes, downloadBytes: bytes * 3,
      totalBytes: bytes * 4, sampleDigest: `synthetic_e2e_sample_digest_${suffix}`, createdAt: NOW });
    return { requestRef, tenantId, entitlementId, edgeCredentialRef, artifact };
  }
  const primary = seedOrder("primary", 1024);
  const other = seedOrder("other", 2048);
  ensurePortalSubscriptionLinkResetSchema(controlDb);
  const accessRequests = createPortalAccessRequestService({
    runtimeCore: core, controlStore: control, nowFn, subscriptionLinkResetEnabled: true
  });
  const state = {
    rootDir: ROOT, consoleToken: "synthetic_e2e_console", proxyConfig,
    subscriptions: { core, publicSubscriptionBaseUrl: "https://subscription.example.test" },
    services: { ssLocal: { status: () => ({ running: false }) }, httpProxy: { status: () => ({ running: false }) } },
    platform: {
      controlStore: control, portalAccessRequests: accessRequests, userPortalRoutesEnabled: true, usageNowFn: nowFn,
      userPortalAuth: { requireSession({ sessionRef }) {
        if (![SESSION, "synthetic_other_e2e_session"].includes(sessionRef)) {
          throw Object.assign(new Error("Synthetic session invalid"), { code: "invalid_session" });
        }
        return { accountId: sessionRef === SESSION ? ACCOUNT : "account_reset_e2e_other", sessionRef };
      } }
    }
  };
  const { server, baseUrl } = await listen(createApp(state));
  t.after(async () => {
    await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    controlDb.close(); runtimeDb.close();
  });
  async function post(path, body, session = SESSION) {
    const response = await fetch(`${baseUrl}${path}`, {
      method: "POST", headers: { "Content-Type": "application/json", "X-Portal-Session": session },
      body: JSON.stringify(body)
    });
    return { status: response.status, headers: response.headers, body: await response.json() };
  }
  // Only the generated path is sent to the local server. No request goes to
  // the synthetic configured origin or any protocol endpoint in rendered YAML.
  async function download(path) {
    const response = await fetch(`${baseUrl}${path}`);
    return { status: response.status, headers: response.headers, text: await response.text() };
  }
  function snapshot(order) {
    return {
      request: control.getPortalAccessRequest(order.requestRef), tenant: repository.getTenant(order.tenantId),
      entitlement: control.getEntitlement(order.entitlementId), binding: control.findUsageBindingByTenantRef(ref("tenant", order.tenantId)),
      samples: control.listUsageSamples({ requestId: order.requestRef }),
      rollup: control.getUsageRollupByEdgeCredentialRef(order.edgeCredentialRef)
    };
  }
  return { control, controlDb, repository, core, primary, other, post, download, snapshot };
}

test("real Portal reset HTTP rotates only its artifact, rejects every old download form and re-reveals the same new URL", async t => {
  const f = await fixture(t);
  const originalPaths = artifactPaths(f.primary.artifact.subscriptionUrl);
  const originalDownload = await f.download(originalPaths[0]);
  assert.equal(originalDownload.status, 200);
  assert.match(originalDownload.text, /proxies:/);
  assert.match(originalDownload.text, /synthetic-reset-node/);
  assert.equal(originalDownload.headers.get("subscription-userinfo"),
    `upload=1024; download=3072; total=${100 * GB}; expire=${Date.parse(UNTIL) / 1000}`);
  const otherDownload = await f.download(artifactPaths(f.other.artifact.subscriptionUrl)[0]);
  assert.equal(otherDownload.status, 200);
  const before = f.snapshot(f.primary);
  const untouched = f.snapshot(f.other);
  const sameAccountBefore = f.control.getAccount(ACCOUNT);
  const resetBody = { requestRef: f.primary.requestRef, idempotencyKey: "synthetic-e2e-reset-operation-01", confirmed: true };

  const reset = await f.post("/api/portal/access-requests/reset-link", resetBody);
  assert.equal(reset.status, 200, JSON.stringify(reset.body));
  assert.equal(reset.headers.get("cache-control"), "no-store");
  assert.equal(reset.headers.get("referrer-policy"), "no-referrer");
  assert.equal(reset.body.request.event.type, "subscription_link_reset");
  const replacementUrl = reset.body.request.subscriptionUrl;
  assert.notEqual(replacementUrl, f.primary.artifact.subscriptionUrl);
  const replacementPaths = artifactPaths(replacementUrl);
  const replacement = await f.download(replacementPaths[0]);
  assert.equal(replacement.status, 200);
  assert.match(replacement.headers.get("content-type"), /application\/x-yaml/);
  assert.equal(replacement.text, originalDownload.text, "rendered node material, resources and usage must remain identical");
  assert.equal(replacement.headers.get("subscription-userinfo"), originalDownload.headers.get("subscription-userinfo"));
  assert.equal(replacement.headers.get("x-subscription-valid-until"), UNTIL);

  for (const path of originalPaths) {
    const denied = await f.download(path);
    assert.equal(denied.status, 410);
    assert.deepEqual(JSON.parse(denied.text), { error: "Subscription artifact rotated" });
    assert.doesNotMatch(denied.text, /synthetic-only-not-used-for-network|proxies:/);
  }
  for (const path of replacementPaths) {
    const delivered = await f.download(path);
    assert.equal(delivered.status, 200);
    assert.equal(delivered.headers.get("subscription-userinfo"), originalDownload.headers.get("subscription-userinfo"));
    if (path.endsWith("/profile.yaml")) {
      assert.match(delivered.text, /proxy-providers:/);
      assert.equal(delivered.text.includes(originalPaths[1]), false);
      assert.equal(delivered.text.includes(replacementPaths[1]), true);
    }
  }

  const revealed = await f.post("/api/portal/access-requests/reveal", { requestRef: f.primary.requestRef });
  assert.equal(revealed.status, 200);
  assert.equal(revealed.body.request.subscriptionUrl, replacementUrl);
  const replayed = await f.post("/api/portal/access-requests/reset-link", resetBody);
  assert.equal(replayed.status, 200);
  assert.equal(replayed.body.request.subscriptionUrl, replacementUrl);
  assert.equal(f.core.listSubscriptionArtifacts(f.primary.tenantId).length, 2);

  const after = f.snapshot(f.primary);
  for (const field of Object.keys(before.request)) {
    if (!["artifactId", "subscriptionUrl", "event", "updatedAt"].includes(field)) {
      assert.deepEqual(after.request[field], before.request[field], `request resource field ${field}`);
    }
  }
  // Existing read telemetry can update runtime last-used metadata; commercial
  // resources and runtime credential identity remain untouched.
  for (const field of Object.keys(before.tenant)) {
    if (field !== "lastUsedAt") assert.deepEqual(after.tenant[field], before.tenant[field], `tenant field ${field}`);
  }
  for (const field of ["entitlement", "binding", "samples", "rollup"]) assert.deepEqual(after[field], before[field], field);
  assert.deepEqual(f.control.getAccount(ACCOUNT), sameAccountBefore);
  assert.deepEqual(f.snapshot(f.other), untouched);
  assert.equal((await f.download(artifactPaths(f.other.artifact.subscriptionUrl)[0])).text, otherDownload.text);
  assert.equal(f.core.listSubscriptionArtifacts(f.other.tenantId).length, 1);
});

test("real Portal reset rejects another owner and missing confirmation before either database changes", async t => {
  const f = await fixture(t);
  const before = f.snapshot(f.primary);
  const artifacts = f.core.listSubscriptionArtifacts(f.primary.tenantId);
  const body = { requestRef: f.primary.requestRef, idempotencyKey: "synthetic-e2e-reset-operation-02", confirmed: true };
  const denied = await f.post("/api/portal/access-requests/reset-link", body, "synthetic_other_e2e_session");
  assert.equal(denied.status, 404);
  assert.deepEqual(denied.body, { error: "not_found" });
  assert.equal(denied.headers.get("cache-control"), "no-store");
  const unconfirmed = await f.post("/api/portal/access-requests/reset-link", { ...body, confirmed: false });
  assert.equal(unconfirmed.status, 400);
  assert.deepEqual(unconfirmed.body, { error: "validation_error" });
  assert.deepEqual(f.snapshot(f.primary), before);
  assert.deepEqual(f.core.listSubscriptionArtifacts(f.primary.tenantId), artifacts);
  assert.equal(f.controlDb.prepare("select count(*) n from platform_portal_subscription_link_resets").get().n, 0);
});
