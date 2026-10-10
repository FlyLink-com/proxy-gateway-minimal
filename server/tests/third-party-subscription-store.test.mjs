import assert from "node:assert/strict";
import test from "node:test";
import Database from "better-sqlite3";

import { createPortalTotpSecretProtector } from "../services/platform/portal-totp-verifier.mjs";
import {
  REQUIRED_THIRD_PARTY_SUBSCRIPTION_DDL_CHECKSUM,
  REQUIRED_THIRD_PARTY_SUBSCRIPTION_MIGRATION_ID,
  applyThirdPartySubscriptionMigrations
} from "../services/platform/third-party-subscription-migrations.mjs";
import {
  THIRD_PARTY_PROTECTED_PREFIX,
  createSqliteThirdPartySubscriptionStore
} from "../services/platform/third-party-subscription-store.mjs";

const SECRET_KEY = "ffeeddccbbaa99887766554433221100ffeeddccbbaa99887766554433221100";
const SOURCE_URL = "https://example.invalid/third-party-source-secret-path";
const SS_HK = "ss://YWVzLTI1Ni1nY206c3ludGhldGljLXBhc3N3b3Jk@203.0.113.10:8388#HK";
const SS_JP = "ss://YWVzLTI1Ni1nY206c3ludGhldGljLXBhc3N3b3Jk@203.0.113.11:8388#JP";

function appliedDatabase() {
  const database = new Database(":memory:");
  applyThirdPartySubscriptionMigrations({
    database,
    expectedMigrationId: REQUIRED_THIRD_PARTY_SUBSCRIPTION_MIGRATION_ID,
    expectedDdlChecksum: REQUIRED_THIRD_PARTY_SUBSCRIPTION_DDL_CHECKSUM,
    nowFn: () => new Date("2026-10-10T00:00:00.000Z")
  });
  return database;
}

function textResponse(body) {
  const payload = Buffer.from(body);
  return {
    status: 200,
    headers: new Headers(),
    body: new ReadableStream({
      start(controller) {
        controller.enqueue(payload);
        controller.close();
      }
    })
  };
}

function createStore({ fetchFn, resolveFn } = {}) {
  const database = appliedDatabase();
  const secretProtector = createPortalTotpSecretProtector({ key: SECRET_KEY });
  const store = createSqliteThirdPartySubscriptionStore({
    database,
    secretProtector,
    fetchFn,
    resolveFn: resolveFn || (async () => ["203.0.113.8"]),
    nowFn: () => new Date("2026-10-10T00:00:00.000Z")
  });
  return { database, store, secretProtector };
}

function assertNoSecret(value) {
  const serialized = JSON.stringify(value);
  assert.equal(serialized.includes("example.invalid"), false);
  assert.equal(serialized.includes("third-party-source-secret-path"), false);
  assert.equal(serialized.includes(SOURCE_URL), false);
}

test("encryption round trip stores prefixed envelopes and refuses unprefixed values", async () => {
  const { store, secretProtector, database } = createStore({
    fetchFn: async () => textResponse(SS_HK)
  });
  const created = store.createSource({
    name: "synthetic-source",
    subscriptionUrl: SOURCE_URL,
    tiers: ["monthly_basic"]
  });
  assertNoSecret(created);
  const row = database.prepare("select protected_url from platform_third_party_sources where id = ?")
    .get(created.id);
  assert.equal(row.protected_url.startsWith(THIRD_PARTY_PROTECTED_PREFIX), true);
  assert.equal(secretProtector.unprotect(row.protected_url), SOURCE_URL);
  assert.equal(secretProtector.unprotect("plaintext-url"), "plaintext-url");

  const wrapped = secretProtector.protect("synthetic-node-json");
  assert.equal(wrapped.startsWith(THIRD_PARTY_PROTECTED_PREFIX), true);
  assert.equal(secretProtector.unprotect(wrapped.slice(0, -3) + "zzz"), null);

  database.prepare("update platform_third_party_sources set protected_url = ? where id = ?")
    .run("plaintext-url", created.id);
  const failed = await store.refreshSource(created.id);
  assert.equal(failed.ok, false);
  assert.equal(failed.lastErrorCode, "protected_value_invalid");
  assertNoSecret(failed);
});

test("keep-last-good retains nodes on fetch failure and on empty parse", async () => {
  let body = [SS_HK, SS_JP].join("\n");
  const { store } = createStore({
    fetchFn: async () => {
      if (body === "FAIL") throw new Error("network");
      return textResponse(body);
    }
  });
  const created = store.createSource({
    name: "synthetic-source",
    subscriptionUrl: SOURCE_URL,
    tiers: ["monthly_plus", "yearly"]
  });
  const first = await store.refreshSource(created.id);
  assert.equal(first.ok, true);
  assert.equal(first.counts.valid, 2);
  assert.equal(store.listSources()[0].nodes.active, 2);

  body = "FAIL";
  const failed = await store.refreshSource(created.id);
  assert.equal(failed.ok, false);
  assert.equal(failed.lastErrorCode, "fetch_failed");
  assert.equal(store.listSources()[0].nodes.active, 2);

  body = "vmess://only-unsupported";
  const empty = await store.refreshSource(created.id);
  assert.equal(empty.ok, false);
  assert.equal(empty.lastErrorCode, "parse_no_valid_nodes");
  assert.equal(store.listSources()[0].nodes.active, 2);
  assertNoSecret(store.getSummary());
});

test("successful refresh marks unseen nodes inactive instead of deleting them", async () => {
  let body = [SS_HK, SS_JP].join("\n");
  const { store, database } = createStore({
    fetchFn: async () => textResponse(body)
  });
  const created = store.createSource({
    name: "synthetic-source",
    subscriptionUrl: SOURCE_URL,
    tiers: ["yearly"]
  });
  await store.refreshSource(created.id);
  body = SS_HK;
  const second = await store.refreshSource(created.id);
  assert.equal(second.ok, true);
  const listed = store.listSources()[0];
  assert.equal(listed.nodes.total, 2);
  assert.equal(listed.nodes.active, 1);
  const inactive = database.prepare(
    "select count(*) as n from platform_third_party_nodes where source_id = ? and active = 0"
  ).get(created.id);
  assert.equal(inactive.n, 1);
  const delivered = store.listActiveServersForPlan("yearly");
  assert.equal(delivered.length, 1);
  assert.equal(delivered[0].thirdParty, true);
  assert.equal(delivered[0].autoEligible, false);
  assertNoSecret(delivered.map((node) => ({
    id: node.id,
    countryCode: node.countryCode,
    protocol: node.protocol
  })));
});
