import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import Database from "better-sqlite3";
import { createSubscriptionRepository } from "../services/subscriptions/repository.mjs";

function tenantInput(overrides = {}) {
  return {
    id: "tenant_1",
    displayName: "customer-a",
    status: "active",
    expiresAt: "2026-06-21T00:00:00.000Z",
    note: "manual",
    nodeId: "aws-singapore",
    credentialMode: "shared-node",
    tokenHash: "hash_1",
    tokenPrefix: "pgsub_hash1",
    now: "2026-05-21T00:00:00.000Z",
    ...overrides
  };
}

function withRepository(fn) {
  const dir = mkdtempSync(join(tmpdir(), "subscription-repo-"));
  const repository = createSubscriptionRepository({ dbPath: join(dir, "subscriptions.sqlite") });
  return Promise.resolve()
    .then(() => fn(repository))
    .finally(() => {
      repository.close();
      rmSync(dir, { recursive: true, force: true });
    });
}

test("repository creates and lists tenants without raw tokens", async () => {
  await withRepository((repository) => {
    repository.createTenant(tenantInput());

    const items = repository.listTenants();
    assert.equal(items.length, 1);
    assert.equal(items[0].id, "tenant_1");
    assert.equal(items[0].displayName, "customer-a");
    assert.equal(Object.hasOwn(items[0], "tokenHash"), false);
    assert.equal(items[0].tokenPrefix, "pgsub_hash1");
    assert.equal(Object.hasOwn(items[0], "rawToken"), false);
    assert.equal(repository.findTenantByTokenHash("hash_1").tokenHash, "hash_1");
  });
});

test("repository renews, disables, enables, resets token, and marks last use", async () => {
  await withRepository((repository) => {
    repository.createTenant(tenantInput({ note: "" }));

    repository.renewTenant("tenant_1", {
      expiresAt: "2026-08-01T00:00:00.000Z",
      now: "2026-05-22T00:00:00.000Z"
    });
    assert.equal(repository.getTenant("tenant_1").expiresAt, "2026-08-01T00:00:00.000Z");

    repository.setTenantStatus("tenant_1", { status: "disabled", now: "2026-05-23T00:00:00.000Z" });
    assert.equal(repository.getTenant("tenant_1").status, "disabled");

    repository.setTenantStatus("tenant_1", { status: "active", now: "2026-05-24T00:00:00.000Z" });
    assert.equal(repository.getTenant("tenant_1").status, "active");

    repository.resetTenantToken("tenant_1", {
      tokenHash: "hash_2",
      tokenPrefix: "pgsub_hash2",
      now: "2026-05-25T00:00:00.000Z"
    });
    assert.equal(repository.findTenantByTokenHash("hash_1"), null);
    assert.equal(repository.findTenantByTokenHash("hash_2").id, "tenant_1");

    repository.markLastUsed("tenant_1", { now: "2026-05-26T00:00:00.000Z" });
    assert.equal(repository.getTenant("tenant_1").lastUsedAt, "2026-05-26T00:00:00.000Z");
  });
});

test("repository does not close injected database handles", () => {
  const database = new Database(":memory:");
  const repository = createSubscriptionRepository({ database });

  repository.close();
  assert.deepEqual(database.prepare("select 1 as ok").get(), { ok: 1 });

  database.close();
});

test("repository rejects invalid tenant enum fields", async () => {
  await withRepository((repository) => {
    assert.throws(() => {
      repository.createTenant(tenantInput({ status: "expired" }));
    });

    assert.throws(() => {
      repository.createTenant(tenantInput({
        id: "tenant_2",
        credentialMode: "isolated-node",
        tokenHash: "hash_2",
        tokenPrefix: "pgsub_hash2"
      }));
    });
  });
});
