import assert from "node:assert/strict";
import test from "node:test";
import Database from "better-sqlite3";
import { createSubscriptionCore } from "../services/subscriptions/core.mjs";
import { createSubscriptionRepository } from "../services/subscriptions/repository.mjs";

const NOW = "2026-10-09T00:00:00.000Z";
function fixture(t) {
  const db = new Database(":memory:");
  t.after(() => db.close());
  const repository = createSubscriptionRepository({ database: db });
  let index = 0;
  let now = NOW;
  const core = createSubscriptionCore({
    repository, nowFn: () => new Date(now),
    publicSubscriptionBaseUrl: "https://subscription.example.test",
    proxyConfig: { servers: [{ name: "synthetic", host: "192.0.2.1", port: 443,
      protocol: "ss", method: "aes-256-gcm", password: "synthetic-only" }] },
    artifactIdFactory: () => `artifact_${++index}`,
    artifactSecretFactory: () => `synthetic_rotation_material_${index + 1}`
  });
  repository.createTenant({ id: "tenant_reset", displayName: "synthetic", status: "active",
    expiresAt: "2026-11-09T00:00:00.000Z", note: "", nodeId: "synthetic",
    credentialMode: "shared-node", tokenHash: "synthetic_hash", tokenPrefix: "synthetic", now: NOW });
  const original = core.createSubscriptionArtifact("tenant_reset");
  return { db, repository, core, original, clock(value) { now = value; } };
}

test("prepared link rotation is nonmutating and exact commit replays without a second artifact", t => {
  const f = fixture(t);
  const tenant = f.repository.getTenant("tenant_reset");
  const plan = f.core.prepareSubscriptionArtifactRotation(f.original.artifact.id, { tenantId: tenant.id });
  assert.equal(f.core.listSubscriptionArtifacts(tenant.id).length, 1);
  const result = f.core.commitPreparedSubscriptionArtifactRotation(plan);
  assert.equal(result.previous.status, "rotated");
  assert.equal(result.replacement.id, plan.replacementArtifactId);
  assert.equal(result.subscriptionUrl, plan.subscriptionUrl);
  assert.deepEqual(f.core.commitPreparedSubscriptionArtifactRotation(plan), result);
  assert.equal(f.core.listSubscriptionArtifacts(tenant.id).length, 2);
  assert.deepEqual(f.repository.getTenant(tenant.id), tenant);
});

test("prepared link rotation rejects mismatched owner, remote URLs, duplicate source and changed plan", t => {
  const f = fixture(t);
  assert.throws(() => f.core.prepareSubscriptionArtifactRotation(f.original.artifact.id, { tenantId: "tenant_other" }));
  const plan = f.core.prepareSubscriptionArtifactRotation(f.original.artifact.id, { tenantId: "tenant_reset" });
  for (const subscriptionUrl of [
    plan.subscriptionUrl.replace("subscription.example.test", "attacker.example"),
    `${plan.subscriptionUrl}?token=extra`, `${plan.subscriptionUrl}#fragment`
  ]) assert.throws(() => f.core.commitPreparedSubscriptionArtifactRotation({ ...plan, subscriptionUrl }));
  const second = f.core.prepareSubscriptionArtifactRotation(f.original.artifact.id, { tenantId: "tenant_reset" });
  f.core.commitPreparedSubscriptionArtifactRotation(plan);
  assert.throws(() => f.core.commitPreparedSubscriptionArtifactRotation(second));
  assert.throws(() => f.core.commitPreparedSubscriptionArtifactRotation({ ...plan,
    subscriptionUrl: plan.subscriptionUrl.replace("material_2", "material_wrong") }));
});

for (const invalid of ["revoked", "disabled", "expired"]) {
  test(`prepared link rotation cannot resurrect ${invalid} state`, t => {
    const f = fixture(t);
    const plan = f.core.prepareSubscriptionArtifactRotation(f.original.artifact.id, { tenantId: "tenant_reset" });
    if (invalid === "revoked") f.core.revokeSubscriptionArtifact(f.original.artifact.id);
    if (invalid === "disabled") f.core.disableTenant("tenant_reset");
    if (invalid === "expired") f.clock("2026-11-10T00:00:00.000Z");
    assert.throws(() => f.core.commitPreparedSubscriptionArtifactRotation(plan));
    assert.equal(f.core.listSubscriptionArtifacts("tenant_reset").length, 1);
  });
}

test("revoked replacement is not revived by a completed-plan retry", t => {
  const f = fixture(t);
  const plan = f.core.prepareSubscriptionArtifactRotation(f.original.artifact.id, { tenantId: "tenant_reset" });
  f.core.commitPreparedSubscriptionArtifactRotation(plan);
  f.core.revokeSubscriptionArtifact(plan.replacementArtifactId);
  assert.throws(() => f.core.commitPreparedSubscriptionArtifactRotation(plan));
});
