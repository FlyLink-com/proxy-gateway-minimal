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

test("repository creates and finds temporary subscription links by token hash", async () => {
  await withRepository((repository) => {
    repository.createTenant({
      id: "tenant_1",
      displayName: "customer-a",
      status: "active",
      expiresAt: "2026-06-21T00:00:00.000Z",
      note: "",
      nodeId: "aws-singapore",
      credentialMode: "shared-node",
      tokenHash: "primary_hash",
      tokenPrefix: "pgsub_primary",
      now: "2026-05-22T00:00:00.000Z"
    });

    const link = repository.createTempLink({
      id: "temp_1",
      tenantId: "tenant_1",
      tokenHash: "temp_hash",
      tokenPrefix: "pgtmp_temp_1",
      expiresAt: "2026-05-23T00:00:00.000Z",
      now: "2026-05-22T00:00:00.000Z"
    });

    assert.equal(link.id, "temp_1");
    assert.equal(link.tenantId, "tenant_1");
    assert.equal(link.tokenPrefix, "pgtmp_temp_1");
    assert.equal(link.expiresAt, "2026-05-23T00:00:00.000Z");
    assert.equal(link.usedAt, null);
    assert.equal(link.createdAt, "2026-05-22T00:00:00.000Z");

    const found = repository.findTempLinkByTokenHash("temp_hash");
    assert.equal(found.id, "temp_1");
    assert.equal(found.tokenHash, "temp_hash");
    assert.equal(found.tokenPrefix, "pgtmp_temp_1");
    assert.equal(found.expiresAt, "2026-05-23T00:00:00.000Z");
    assert.equal(found.createdAt, "2026-05-22T00:00:00.000Z");
    assert.equal(found.tenant.id, "tenant_1");
    assert.equal(found.tenant.tokenHash, "primary_hash");
  });
});

test("repository marks temporary links as used", async () => {
  await withRepository((repository) => {
    repository.createTenant({
      id: "tenant_1",
      displayName: "customer-a",
      status: "active",
      expiresAt: "2026-06-21T00:00:00.000Z",
      note: "",
      nodeId: "aws-singapore",
      credentialMode: "shared-node",
      tokenHash: "primary_hash",
      tokenPrefix: "pgsub_primary",
      now: "2026-05-22T00:00:00.000Z"
    });
    repository.createTempLink({
      id: "temp_1",
      tenantId: "tenant_1",
      tokenHash: "temp_hash",
      tokenPrefix: "pgtmp_temp_1",
      expiresAt: "2026-05-23T00:00:00.000Z",
      now: "2026-05-22T00:00:00.000Z"
    });

    const marked = repository.markTempLinkUsed("temp_1", {
      now: "2026-05-22T01:00:00.000Z"
    });

    assert.equal(marked.usedAt, "2026-05-22T01:00:00.000Z");
    assert.equal(repository.findTempLinkByTokenHash("missing"), null);
  });
});
