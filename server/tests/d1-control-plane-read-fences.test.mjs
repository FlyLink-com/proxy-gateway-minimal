// D1 control-plane read — phase-fence behavior tests (Task 4).
//
// Every writer fenced in this task must refuse while the writer authority
// is FROZEN (or missing) and must keep working while it is BWH_ACTIVE;
// reads stay available while frozen. The one deliberate exception is the
// credential-version tracking installer (see the last two tests): it
// installs DDL and triggers, is not a serving write, and installs no
// writer-authority state of its own.
//
// All fixtures are synthetic in-memory SQLite databases built by the tests
// themselves; nothing here touches D1, BWH, or any real control plane, and
// no secret ever enters a test artifact.

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import Database from "better-sqlite3";

import {
  WRITER_PHASES,
  ensureWriterAuthority,
  readWriterAuthority,
  transitionWriterAuthority
} from "../services/platform/single-writer-authority.mjs";
import { createSqliteSubscriptionControlStore } from "../services/platform/subscription-control-db.mjs";
import {
  COIN_WALLET_MIGRATIONS,
  REQUIRED_COIN_WALLET_MIGRATION_ID,
  applyCoinWalletMigrations
} from "../services/platform/coin-wallet-migrations.mjs";
import { createSqliteCoinWalletStore } from "../services/platform/coin-wallet-store.mjs";
import {
  COIN_COMMERCE_MIGRATIONS,
  REQUIRED_COIN_COMMERCE_MIGRATION_ID,
  applyCoinCommerceMigrations
} from "../services/platform/coin-commerce-migrations.mjs";
import {
  createCoinCommerceInitialConfirmationParticipant,
  createSqliteCoinCommerceStore
} from "../services/platform/coin-commerce-store.mjs";
import { createAccountResourceAuthorityStore } from "../services/platform/account-resource-authority.mjs";
import { ensureCredentialVersionTracking } from "../services/platform/d1-stage2-credential-reconciliation.mjs";

const NOW = "2026-07-23T12:34:56.000Z";
const NOW_DATE = new Date(NOW);
const COMMERCE_CLOCK = "2026-07-26T12:34:56.000Z";

function freezeWriter(database) {
  ensureWriterAuthority(database);
  transitionWriterAuthority(database, { to: WRITER_PHASES.FROZEN });
}

function activateWriter(database) {
  ensureWriterAuthority(database);
}

function assertWriterRefused(fn) {
  assert.throws(fn, (error) => error.code === "writer_authority_not_bwh");
}

// ---------------------------------------------------------------------------
// Control store: usage samples, link status, passkeys, devices, nodes
// ---------------------------------------------------------------------------

function controlFixture(t) {
  const database = new Database(":memory:");
  database.pragma("foreign_keys = ON");
  const store = createSqliteSubscriptionControlStore({ database });
  t.after(() => {
    try {
      store.close();
    } catch {
      // Already closed.
    }
  });
  database.prepare(`
    insert into platform_accounts (id, owner_ref, status, created_at, updated_at, metadata_json)
    values ('acct_1', 'acct_1', 'active', ?, ?, '{}')
  `).run(NOW, NOW);
  database.prepare(`
    insert into platform_entitlements (
      id, account_id, plan, status, valid_from, valid_until,
      traffic_limit_bytes, created_at, updated_at
    ) values ('ent_1', 'acct_1', 'monthly', 'active', ?, ?, 1000, ?, ?)
  `).run(NOW, "2027-07-23T00:00:00.000Z", NOW, NOW);
  database.prepare(`
    insert into platform_issuance_requests (
      id, account_id, entitlement_id, approval_ref, status, quantity,
      node_id, purpose, requested_by_ref, created_at, updated_at
    ) values ('req_1', 'acct_1', 'ent_1', 'approval_1', 'issued', 1, 'node_1', 'subscription', 'operator_1', ?, ?)
  `).run(NOW, NOW);
  database.prepare(`
    insert into platform_issued_subscription_links
      (id, request_id, tenant_ref, artifact_ref, status, created_at, updated_at)
    values ('link_1', 'req_1', 'tenant_1', 'artifact_1', 'active', ?, ?)
  `).run(NOW, NOW);
  return { database, store };
}

function usageSampleInput() {
  return {
    id: "sample_1",
    sourceRef: "source_1",
    channelRef: "chan_1",
    edgeCredentialRef: "edgecred_1",
    accountId: "acct_1",
    entitlementId: "ent_1",
    requestId: "req_1",
    observedAt: NOW,
    intervalStartedAt: NOW,
    intervalEndedAt: NOW,
    uploadBytes: 100,
    downloadBytes: 200,
    sampleDigest: "d".repeat(64),
    createdAt: NOW
  };
}

function cumulativeSampleInput() {
  return {
    sourceRef: "source_1",
    channelRef: "chan_1",
    edgeCredentialRef: "edgecred_1",
    accountId: "acct_1",
    entitlementId: "ent_1",
    requestId: "req_1",
    observedAt: NOW,
    intervalEndedAt: NOW,
    uploadBytes: 100,
    downloadBytes: 200,
    createdAt: NOW
  };
}

test("recordUsageSample refuses writes while FROZEN and reads still work", (t) => {
  const { database, store } = controlFixture(t);
  freezeWriter(database);
  assertWriterRefused(() => store.recordUsageSample(usageSampleInput()));
  // Reads are not fenced: the binding list still reads while frozen.
  assert.equal(store.listIssuedSubscriptionBindings().length, 1);
});

test("recordUsageSample records while BWH_ACTIVE", (t) => {
  const { database, store } = controlFixture(t);
  activateWriter(database);
  const result = store.recordUsageSample(usageSampleInput());
  assert.equal(result.inserted, true);
  assert.equal(result.sample.sampleDigest, "d".repeat(64));
  assert.equal(result.rollup.edgeCredentialRef, "edgecred_1");
});

test("recordCumulativeUsageSample refuses writes while FROZEN", (t) => {
  const { database, store } = controlFixture(t);
  freezeWriter(database);
  assertWriterRefused(() => store.recordCumulativeUsageSample(cumulativeSampleInput()));
});

test("recordCumulativeUsageSample initializes its cursor while BWH_ACTIVE", (t) => {
  const { database, store } = controlFixture(t);
  activateWriter(database);
  const result = store.recordCumulativeUsageSample(cumulativeSampleInput());
  assert.equal(result.status, "cursor_initialized");
  assert.equal(result.inserted, false);
});

test("setIssuedLinkStatus refuses writes while FROZEN and updates while BWH_ACTIVE", (t) => {
  const { database, store } = controlFixture(t);
  freezeWriter(database);
  // The fence fires before the missing-link check, so even a bogus id is
  // refused as a writer error, not reported as not_found.
  assertWriterRefused(() => store.setIssuedLinkStatus("link_missing", {
    status: "revoked", updatedAt: NOW
  }));
  assertWriterRefused(() => store.setIssuedLinkStatus("link_1", {
    status: "revoked", updatedAt: NOW
  }));
  assert.equal(
    database.prepare("select status from platform_issued_subscription_links where id = 'link_1'").get().status,
    "active"
  );

  const active = controlFixture(t);
  activateWriter(active.database);
  const updated = active.store.setIssuedLinkStatus("link_1", {
    status: "revoked", updatedAt: NOW
  });
  assert.equal(updated.status, "revoked");
  assert.throws(() => active.store.setIssuedLinkStatus("link_missing", {
    status: "revoked", updatedAt: NOW
  }), (error) => error.code === "not_found");
});

test("passkey, device, and node writers refuse while FROZEN and pass the fence while BWH_ACTIVE", (t) => {
  const { database, store } = controlFixture(t);
  freezeWriter(database);
  assertWriterRefused(() => store.createPortalPasskeyCredential({}));
  assertWriterRefused(() => store.markPortalPasskeyVerified("cred_missing", {}));
  assertWriterRefused(() => store.bindDevice({}));
  assertWriterRefused(() => store.upsertEdgeRegisteredNode({}));

  const active = controlFixture(t);
  activateWriter(active.database);
  // Empty input is invalid, but the failure must come from business
  // validation, not from the fence — the fence passed.
  for (const call of [
    () => active.store.createPortalPasskeyCredential({}),
    () => active.store.markPortalPasskeyVerified("cred_missing", {}),
    () => active.store.bindDevice({}),
    () => active.store.upsertEdgeRegisteredNode({})
  ]) {
    assert.throws(call, (error) => error.code !== "writer_authority_not_bwh");
  }
});

// ---------------------------------------------------------------------------
// Wallet: welcome-bonus lot expiry
// ---------------------------------------------------------------------------

function walletFixture(t) {
  const database = new Database(":memory:");
  database.pragma("foreign_keys = ON");
  database.exec(`
    create table platform_accounts (
      id text primary key,
      owner_ref text not null,
      status text not null check (status in ('active', 'suspended', 'disabled')),
      created_at text not null,
      updated_at text not null,
      metadata_json text not null default '{}'
    )
  `);
  applyCoinWalletMigrations({
    database,
    expectedMigrationId: REQUIRED_COIN_WALLET_MIGRATION_ID,
    expectedDdlChecksum: COIN_WALLET_MIGRATIONS[0].ddlChecksum,
    nowFn: () => new Date(NOW_DATE)
  });
  let refCount = 0;
  const store = createSqliteCoinWalletStore({
    database,
    nowFn: () => new Date(NOW_DATE),
    refFactory: () => `ref_${++refCount}`
  });
  t.after(() => {
    try {
      store.close();
    } catch {
      // Already closed.
    }
  });
  return { database, store };
}

test("expireDuePortalRegistrationWelcomeBonusCoinLots refuses while FROZEN, runs while BWH_ACTIVE", (t) => {
  const { database, store } = walletFixture(t);
  freezeWriter(database);
  assertWriterRefused(() => store.expireDuePortalRegistrationWelcomeBonusCoinLots({ limit: 10 }));

  const active = walletFixture(t);
  activateWriter(active.database);
  assert.equal(active.store.expireDuePortalRegistrationWelcomeBonusCoinLots({ limit: 10 }), 0);
});

// ---------------------------------------------------------------------------
// Authority store: assign / reassign
// ---------------------------------------------------------------------------

function safeBindingRef(prefix, value) {
  return `${prefix}ref_${createHash("sha256").update(value).digest("hex").slice(0, 16)}`;
}

function authorityFixture(t) {
  const database = new Database(":memory:");
  database.pragma("foreign_keys = ON");
  database.exec(`
    create table platform_accounts (
      id text primary key,
      status text not null
    );
    create table platform_entitlements (
      id text primary key,
      account_id text not null references platform_accounts(id),
      status text not null,
      valid_from text not null,
      valid_until text not null
    );
    create table platform_issuance_requests (
      id text primary key,
      account_id text not null references platform_accounts(id),
      entitlement_id text not null references platform_entitlements(id),
      status text not null
    );
    create table platform_issued_subscription_links (
      id text primary key,
      request_id text not null references platform_issuance_requests(id),
      tenant_ref text not null,
      artifact_ref text not null,
      status text not null
    );
    create table platform_portal_access_requests (
      id text primary key,
      portal_user_ref text not null,
      entitlement_ref text,
      status text not null,
      tenant_id text,
      artifact_id text,
      expires_at text,
      valid_until text
    );
    create table platform_account_resource_authorities (
      authority_ref text primary key,
      account_id text not null references platform_accounts(id),
      resource_request_id text not null references platform_issuance_requests(id),
      entitlement_id text not null references platform_entitlements(id),
      issued_link_id text not null references platform_issued_subscription_links(id),
      status text not null check (status in ('active', 'revoked')),
      version integer not null check (version > 0),
      previous_authority_ref text references platform_account_resource_authorities(authority_ref),
      created_at text not null,
      updated_at text not null,
      created_by text not null,
      reason text not null,
      revoked_at text,
      revoked_by text,
      revocation_reason text,
      unique (account_id, version)
    );
    create unique index platform_account_resource_authorities_active_account_uq
      on platform_account_resource_authorities(account_id)
      where status = 'active';
    create unique index platform_account_resource_authorities_active_request_uq
      on platform_account_resource_authorities(resource_request_id)
      where status = 'active';
    create unique index platform_account_resource_authorities_active_entitlement_uq
      on platform_account_resource_authorities(entitlement_id)
      where status = 'active';
    create unique index platform_account_resource_authorities_active_link_uq
      on platform_account_resource_authorities(issued_link_id)
      where status = 'active';
  `);
  database.prepare(`
    insert into platform_accounts (id, status) values ('account_1', 'active')
  `).run();
  database.prepare(`
    insert into platform_entitlements (id, account_id, status, valid_from, valid_until)
    values ('entitlement_1', 'account_1', 'active', '2026-01-01T00:00:00.000Z', '2027-01-01T00:00:00.000Z')
  `).run();
  database.prepare(`
    insert into platform_issuance_requests (id, account_id, entitlement_id, status)
    values ('request_1', 'account_1', 'entitlement_1', 'issued')
  `).run();
  database.prepare(`
    insert into platform_issued_subscription_links (id, request_id, tenant_ref, artifact_ref, status)
    values ('link_1', 'request_1', ?, ?, 'active')
  `).run(safeBindingRef("tenant", "tenant_1"), safeBindingRef("artifact", "artifact_1"));
  database.prepare(`
    insert into platform_portal_access_requests
      (id, portal_user_ref, entitlement_ref, status, tenant_id, artifact_id, expires_at, valid_until)
    values ('request_1', 'account_1', 'entitlement_1', 'delivered', 'tenant_1', 'artifact_1', '2027-01-01T00:00:00.000Z', '2027-01-01T00:00:00.000Z')
  `).run();
  let nextId = 0;
  const store = createAccountResourceAuthorityStore({
    database,
    nowFn: () => new Date(NOW_DATE),
    idFactory: () => `authority_generated_${++nextId}`
  });
  t.after(() => {
    try {
      store.close();
    } catch {
      // Already closed.
    }
  });
  return { database, store };
}

function authorityAssignment() {
  return {
    accountId: "account_1",
    resourceRequestId: "request_1",
    entitlementId: "entitlement_1",
    issuedLinkId: "link_1",
    expectedVersion: 0,
    createdBy: "operator_ref",
    reason: "explicit_authority_assignment"
  };
}

test("assignAuthority and reassignAuthority refuse while FROZEN", (t) => {
  const { database, store } = authorityFixture(t);
  freezeWriter(database);
  assertWriterRefused(() => store.assignAuthority(authorityAssignment()));
  assertWriterRefused(() => store.reassignAuthority({
    ...authorityAssignment(),
    expectedVersion: 1,
    revokedBy: "operator_ref",
    revocationReason: "explicit_commerce_authority_change"
  }));
  assert.equal(
    database.prepare("select count(*) from platform_account_resource_authorities").pluck().get(),
    0
  );
});

test("assignAuthority succeeds while BWH_ACTIVE", (t) => {
  const { database, store } = authorityFixture(t);
  activateWriter(database);
  const assigned = store.assignAuthority(authorityAssignment());
  assert.equal(assigned.authorityVersion, 1);
  assert.equal(
    database.prepare("select count(*) from platform_account_resource_authorities where status = 'active'").pluck().get(),
    1
  );
});

// ---------------------------------------------------------------------------
// W-063: initial-confirmation complete()
// ---------------------------------------------------------------------------

function commerceFenceFixture(t) {
  const directory = mkdtempSync(join(tmpdir(), "d1-fences-commerce-"));
  const dbPath = join(directory, "synthetic.sqlite");
  const database = new Database(dbPath);
  database.pragma("foreign_keys = ON");
  database.exec(`
    create table platform_accounts (
      id text primary key,
      owner_ref text not null,
      status text not null check (status in ('active', 'suspended', 'disabled')),
      created_at text not null,
      updated_at text not null,
      metadata_json text not null default '{}'
    )
  `);
  applyCoinWalletMigrations({
    database,
    expectedMigrationId: REQUIRED_COIN_WALLET_MIGRATION_ID,
    expectedDdlChecksum: COIN_WALLET_MIGRATIONS[0].ddlChecksum,
    nowFn: () => new Date(COMMERCE_CLOCK)
  });
  applyCoinCommerceMigrations({
    database,
    expectedMigrationId: REQUIRED_COIN_COMMERCE_MIGRATION_ID,
    expectedDdlChecksum: COIN_COMMERCE_MIGRATIONS[0].ddlChecksum,
    nowFn: () => new Date(COMMERCE_CLOCK)
  });
  let refCount = 0;
  const refFactory = () => `ref_${++refCount}`;
  const store = createSqliteCoinCommerceStore({
    database,
    commerceRefFactory: refFactory,
    walletRefFactory: refFactory
  });
  const participant = createCoinCommerceInitialConfirmationParticipant({ store, database });
  t.after(() => {
    try {
      store.close();
    } catch {
      // Already closed.
    }
    try {
      database.close();
    } catch {
      // Already closed.
    }
    rmSync(directory, { recursive: true, force: true });
  });
  return { database, store, participant };
}

test("initial-confirmation complete() refuses while FROZEN, inside a transaction", (t) => {
  const { database, participant } = commerceFenceFixture(t);
  freezeWriter(database);
  assert.throws(
    () => database.transaction(() => participant.complete({ confirmationRef: "confirmation_1" }))(),
    (error) => error.code === "writer_authority_not_bwh"
  );
});

test("initial-confirmation complete() proceeds past the fence while BWH_ACTIVE", (t) => {
  const { database, participant } = commerceFenceFixture(t);
  activateWriter(database);
  // No such confirmation exists: the fence passed and the business logic
  // reports the missing confirmation instead of a writer refusal.
  assert.throws(
    () => database.transaction(() => participant.complete({ confirmationRef: "confirmation_1" }))(),
    (error) => error.code === "reconciliation_required"
  );
});

// ---------------------------------------------------------------------------
// platform_credential_versions: deliberately unfenced installer
// ---------------------------------------------------------------------------

test("ensureCredentialVersionTracking installs tracking without installing writer authority", (t) => {
  const database = new Database(":memory:");
  database.pragma("foreign_keys = ON");
  database.exec(`
    create table platform_portal_edge_credentials (
      request_id text not null,
      edge_channel_ref text not null,
      edge_credential_ref text not null,
      edge_material_digest text not null,
      ordinal integer not null default 0 check (ordinal >= 0),
      primary key (request_id, edge_channel_ref)
    )
  `);
  t.after(() => {
    try {
      database.close();
    } catch {
      // Already closed.
    }
  });
  assert.equal(readWriterAuthority(database), null);
  ensureCredentialVersionTracking(database);
  // The installer wrote DDL and triggers only: still no authority state.
  assert.equal(readWriterAuthority(database), null);
  assert.equal(
    database.prepare(`
      select count(*) from sqlite_master where type = 'table' and name = 'platform_credential_versions'
    `).pluck().get(),
    1
  );
  // The triggers work: inserting a credential derives a version row.
  database.prepare(`
    insert into platform_portal_edge_credentials
      (request_id, edge_channel_ref, edge_credential_ref, edge_material_digest, ordinal)
    values ('pareq_1', 'chan_1', 'edgecred_1', ?, 1)
  `).run(`sha256:${"a".repeat(64)}`);
  assert.equal(
    database.prepare("select count(*) from platform_credential_versions").pluck().get(),
    1
  );
});

test("the credential-version installer documents why it carries no fence", () => {
  const source = readFileSync(
    new URL("../services/platform/d1-stage2-credential-reconciliation.mjs", import.meta.url),
    "utf8"
  );
  assert.match(source, /assertWritable fence is added here, deliberately/);
  assert.match(source, /If a serving writer for the/);
});
