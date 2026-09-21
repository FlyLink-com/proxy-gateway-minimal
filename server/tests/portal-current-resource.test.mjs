import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { createPortalCurrentResourceService } from "../services/platform/portal-current-resource.mjs";

const now = "2026-09-20T12:00:00.000Z";
const resource = {
  state: "available", resourceRef: `resource_${"a".repeat(64)}`,
  plan: { id: "monthly", durationDays: 30, monthlyTrafficGb: 100 },
  validUntil: "2026-10-01T00:00:00.000Z", setupAvailable: true,
  usage: { totalBytes: 100 * 1024 ** 3, usedBytes: null, remainingBytes: null,
    collectionStatus: "pending", updatedAt: null,
    cycleStartedAt: "2026-09-01T00:00:00.000Z", cycleEndsAt: "2026-10-01T00:00:00.000Z" }
};
function fixture() {
  const calls = [];
  let result = { model: "legacy", resource, requestRef: "request_owned" };
  const service = createPortalCurrentResourceService({
    controlStore: { readLegacyPortalCurrentResource(input) { calls.push(input); return result; } },
    accessRequests: { revealSubscription(input) {
      calls.push(input);
      return { id: "request_owned", portalUserRef: "acct_owned", status: "issued",
        validUntil: resource.validUntil, subscriptionUrl: "https://example.test/sub/synthetic" };
    } }, nowFn: () => now
  });
  return { service, calls, setResult(value) { result = value; } };
}
test("legacy overview works without the dormant wallet-first projection and exposes no internal request reference", () => {
  const { service, calls } = fixture();
  assert.deepEqual(service.getCurrentOverview({ accountId: "acct_owned" }), resource);
  assert.deepEqual(calls, [{ accountId: "acct_owned", now }]);
  assert.deepEqual(service.getCurrentResource({ accountId: "acct_owned" }), {
    state: "available", plan: resource.plan, validUntil: resource.validUntil, setupAvailable: true
  });
});
test("existing subscription reveal and acknowledgement are repeatable, session bound, and do not issue resources", () => {
  const { service, calls, setResult } = fixture();
  const input = { accountId: "acct_owned", sessionRef: "session_synthetic_owned", idempotencyKey: "synthetic-key-0001" };
  const first = service.deliverSetup(input);
  assert.deepEqual(service.deliverSetup(input), first);
  assert.equal(first.delivery.kind, "subscription_url");
  assert.deepEqual(calls[1], { portalUserRef: "acct_owned", requestRef: "request_owned" });
  const ack = { accountId: input.accountId, sessionRef: input.sessionRef, handoffRef: first.delivery.handoffRef };
  assert.doesNotThrow(() => service.acknowledgeSetup(ack));
  assert.doesNotThrow(() => service.acknowledgeSetup(ack));
  assert.throws(() => service.acknowledgeSetup({ ...ack, sessionRef: "session_other" }), { code: "portal_current_resource_reconciliation_required" });
  setResult({ model: "legacy", resource: { state: "none" }, requestRef: null });
  assert.throws(() => service.acknowledgeSetup(ack), { code: "portal_current_resource_reconciliation_required" });
  assert.throws(() => service.deliverSetup(input), { code: "portal_current_resource_reconciliation_required" });
});
test("replacing the resource identity invalidates the prior setup acknowledgement", () => {
  const { service, setResult } = fixture();
  const input = { accountId: "acct_owned", sessionRef: "session_synthetic_owned", idempotencyKey: "synthetic-key-0001" };
  const first = service.deliverSetup(input);
  setResult({ model: "legacy", requestRef: "request_owned", resource: { ...resource, resourceRef: `resource_${"b".repeat(64)}` } });
  assert.throws(() => service.acknowledgeSetup({ ...input, handoffRef: first.delivery.handoffRef }),
    { code: "portal_current_resource_reconciliation_required" });
  const replacement = service.deliverSetup(input);
  assert.notEqual(replacement.delivery.handoffRef, first.delivery.handoffRef);
  assert.doesNotThrow(() => service.acknowledgeSetup({ ...input, handoffRef: replacement.delivery.handoffRef }));
});
test("wallet-first or malformed model never falls back to legacy reveal", () => {
  const { service, setResult, calls } = fixture();
  setResult({ model: "wallet_first" });
  assert.throws(() => service.getCurrentOverview({ accountId: "acct_owned" }), { code: "wallet_first_current_resource_unavailable" });
  setResult({ model: "unknown", resource });
  assert.throws(() => service.getCurrentOverview({ accountId: "acct_owned" }), { code: "portal_current_resource_unavailable" });
  assert.equal(calls.some((call) => call.portalUserRef), false);
});
test("legacy account reference grammar remains compatible with the control store", () => {
  const { service, calls } = fixture();
  assert.deepEqual(service.getCurrentOverview({ accountId: "Account-legacy:1" }), resource);
  assert.equal(calls[0].accountId, "Account-legacy:1");
  assert.throws(() => service.getCurrentOverview({ accountId: "https://example.test/private" }), { code: "validation_error" });
});

function artifactRef(id) {
  return `artifactref_${createHash("sha256").update(id).digest("hex").slice(0, 16)}`;
}

function lineageFixture() {
  const calls = [];
  const tenant = { id: "tenant_lineage", status: "active", expiresAt: resource.validUntil };
  const artifacts = [
    { id: "artifact_original", tenantId: tenant.id, status: "rotated" },
    { id: "artifact_current", tenantId: tenant.id, status: "active" }
  ];
  const forbidden = () => {
    calls.push({ operation: "mutation" });
    assert.fail("current resource reads must not mutate runtime or reissue subscriptions");
  };
  const runtimeCore = {
    getTenant(id) { calls.push({ operation: "tenant", id }); return tenant; },
    listSubscriptionArtifacts(id) { calls.push({ operation: "artifacts", id }); return artifacts; },
    createTenant: forbidden,
    createSubscriptionArtifact: forbidden,
    rotateSubscriptionArtifact: forbidden,
    revokeSubscriptionArtifact: forbidden,
    resolveSubscriptionArtifact: forbidden,
    renewTenant: forbidden,
    enableTenant: forbidden,
    disableTenant: forbidden
  };
  const service = createPortalCurrentResourceService({
    controlStore: { readLegacyPortalCurrentResource() {
      return { model: "legacy", resource, requestRef: "request_owned", artifactLineageNeeded: {
        tenantId: "tenant_lineage", currentArtifactId: "artifact_current",
        issuedArtifactRef: artifactRef("artifact_original")
      } };
    } },
    runtimeCore,
    accessRequests: {
      revealSubscription(input) {
        calls.push({ operation: "reveal", ...input });
        return { id: "request_owned", portalUserRef: "acct_owned", status: "delivered",
          validUntil: resource.validUntil, subscriptionUrl: "https://example.test/sub/synthetic" };
      },
      refreshSubscription: forbidden,
      markDelivered: forbidden
    },
    nowFn: () => now
  });
  return { service, tenant, artifacts, runtimeCore, calls };
}

for (const status of ["active", "expiring"]) {
  test(`historically rotated legacy artifact is available after exact readonly ${status} tenant proof`, () => {
    const { service, tenant, calls } = lineageFixture();
    tenant.status = status;
    const input = { accountId: "acct_owned", sessionRef: "session_synthetic_owned", idempotencyKey: "synthetic-key-0001" };
    assert.deepEqual(service.getCurrentOverview(input), resource);
    assert.deepEqual(calls, [
      { operation: "tenant", id: "tenant_lineage" },
      { operation: "artifacts", id: "tenant_lineage" }
    ]);
    assert.deepEqual(service.getCurrentResource(input), {
      state: "available", plan: resource.plan, validUntil: resource.validUntil, setupAvailable: true
    });
    const setup = service.deliverSetup(input);
    assert.equal(setup.delivery.subscriptionUrl, "https://example.test/sub/synthetic");
    assert.doesNotThrow(() => service.acknowledgeSetup({ ...input, handoffRef: setup.delivery.handoffRef }));
    assert.equal(calls.filter((call) => call.operation === "reveal").length, 1);
    assert.equal(calls.filter((call) => call.operation === "tenant").length, 4);
    assert.equal(calls.filter((call) => call.operation === "artifacts").length, 4);
    assert.equal(calls.some((call) => call.operation === "mutation"), false);
    assert.equal(JSON.stringify([service.getCurrentOverview(input), service.getCurrentResource(input), setup])
      .includes("artifactLineageNeeded"), false);
  });
}

const rejectedLineages = [
  ["wrong runtime tenant", ({ tenant }) => { tenant.id = "tenant_other"; }],
  ["different runtime expiry", ({ tenant }) => { tenant.expiresAt = "2026-10-02T00:00:00.000Z"; }],
  ["disabled runtime tenant", ({ tenant }) => { tenant.status = "disabled"; }],
  ["expired runtime tenant", ({ tenant }) => { tenant.status = "expired"; }],
  ["missing runtime tenant", ({ runtimeCore }) => { runtimeCore.getTenant = () => null; }],
  ["missing current artifact", ({ artifacts }) => { artifacts[1].id = "artifact_other"; }],
  ["current artifact belongs to another tenant", ({ artifacts }) => { artifacts[1].tenantId = "tenant_other"; }],
  ["revoked current artifact", ({ artifacts }) => { artifacts[1].status = "revoked"; }],
  ["rotated current artifact", ({ artifacts }) => { artifacts[1].status = "rotated"; }],
  ["wrong original artifact hash", ({ artifacts }) => { artifacts[0].id = "artifact_unrelated"; }],
  ["original artifact belongs to another tenant", ({ artifacts }) => { artifacts[0].tenantId = "tenant_other"; }],
  ["missing original artifact", ({ artifacts }) => { artifacts.shift(); }],
  ["revoked original artifact", ({ artifacts }) => { artifacts[0].status = "revoked"; }],
  ["original artifact is still active", ({ artifacts }) => { artifacts[0].status = "active"; }],
  ["ambiguous active artifacts", ({ artifacts }) => { artifacts.push({ id: "artifact_extra", tenantId: "tenant_lineage", status: "active" }); }],
  ["ambiguous original artifact", ({ artifacts }) => { artifacts.push({ ...artifacts[0] }); }],
  ["missing tenant reader", ({ runtimeCore }) => { runtimeCore.getTenant = undefined; }],
  ["missing artifact reader", ({ runtimeCore }) => { runtimeCore.listSubscriptionArtifacts = undefined; }],
  ["tenant reader unavailable", ({ runtimeCore }) => { runtimeCore.getTenant = () => { throw new Error("synthetic unavailable"); }; }],
  ["artifact reader unavailable", ({ runtimeCore }) => { runtimeCore.listSubscriptionArtifacts = () => { throw new Error("synthetic unavailable"); }; }]
];

for (const [name, change] of rejectedLineages) {
  test(`historical artifact proof fails closed without reveal or mutation: ${name}`, () => {
    const context = lineageFixture();
    change(context);
    const input = { accountId: "acct_owned", sessionRef: "session_synthetic_owned", idempotencyKey: "synthetic-key-0001" };
    assert.deepEqual(context.service.getCurrentOverview(input), { state: "reconciliation_required" });
    assert.deepEqual(context.service.getCurrentResource(input), { state: "reconciliation_required" });
    assert.throws(() => context.service.deliverSetup(input), { code: "portal_current_resource_reconciliation_required" });
    assert.throws(() => context.service.acknowledgeSetup({ ...input, handoffRef: `legacy_setup_${"b".repeat(64)}` }),
      { code: "portal_current_resource_reconciliation_required" });
    assert.equal(context.calls.some((call) => ["reveal", "mutation"].includes(call.operation)), false);
  });
}

test("acknowledgement rechecks historical artifact proof after runtime changes", () => {
  const { service, artifacts, calls } = lineageFixture();
  const input = { accountId: "acct_owned", sessionRef: "session_synthetic_owned", idempotencyKey: "synthetic-key-0001" };
  const { delivery } = service.deliverSetup(input);
  artifacts[1].status = "revoked";
  assert.throws(() => service.acknowledgeSetup({ ...input, handoffRef: delivery.handoffRef }),
    { code: "portal_current_resource_reconciliation_required" });
  assert.equal(calls.filter((call) => call.operation === "reveal").length, 1);
  assert.equal(calls.some((call) => call.operation === "mutation"), false);
});
