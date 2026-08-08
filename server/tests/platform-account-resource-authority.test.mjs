import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import Database from "better-sqlite3";

import {
  createAccountResourceAuthorityStore
} from "../services/platform/account-resource-authority.mjs";
import {
  ACCOUNT_RESOURCE_AUTHORITY_MIGRATIONS,
  REQUIRED_ACCOUNT_RESOURCE_AUTHORITY_MIGRATION_ID,
  applyAccountResourceAuthorityMigrations
} from "../services/platform/account-resource-authority-migrations.mjs";
import {
  COIN_COMMERCE_MIGRATIONS,
  REQUIRED_COIN_COMMERCE_MIGRATION_ID,
  applyCoinCommerceMigrations
} from "../services/platform/coin-commerce-migrations.mjs";
import {
  COIN_WALLET_MIGRATIONS,
  REQUIRED_COIN_WALLET_MIGRATION_ID,
  applyCoinWalletMigrations
} from "../services/platform/coin-wallet-migrations.mjs";

const NOW = "2026-08-07T12:00:00.000Z";

function safeBindingRef(prefix, value) {
  return `${prefix}ref_${createHash("sha256")
    .update(value)
    .digest("hex")
    .slice(0, 16)}`;
}

function createFixture({ enforceActiveAuthorityUniqueness = true } = {}) {
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
  `);
  if (enforceActiveAuthorityUniqueness) {
    database.exec(`
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
  }
  return database;
}

function createMigrationBackedFixture(dbPath = ":memory:") {
  const database = new Database(dbPath);
  database.pragma("foreign_keys = ON");
  database.exec(`
    create table platform_accounts (
      id text primary key,
      owner_ref text not null,
      status text not null,
      created_at text not null,
      updated_at text not null,
      metadata_json text not null default '{}'
    );
    create table platform_entitlements (
      id text primary key,
      account_id text not null references platform_accounts(id)
        on delete cascade,
      plan text not null,
      status text not null,
      valid_from text not null,
      valid_until text not null,
      max_artifacts integer not null default 1,
      max_devices integer not null default 1,
      traffic_limit_bytes integer not null default 0,
      created_at text not null,
      updated_at text not null
    );
    create table platform_issuance_requests (
      id text primary key,
      account_id text not null references platform_accounts(id)
        on delete cascade,
      entitlement_id text not null references platform_entitlements(id)
        on delete cascade,
      approval_ref text not null,
      status text not null,
      quantity integer not null,
      node_id text not null,
      purpose text not null,
      requested_by_ref text not null,
      created_at text not null,
      updated_at text not null,
      metadata_json text not null default '{}'
    );
    create table platform_issued_subscription_links (
      id text primary key,
      request_id text not null references platform_issuance_requests(id)
        on delete cascade,
      tenant_ref text not null,
      artifact_ref text not null,
      status text not null,
      created_at text not null,
      updated_at text not null
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
  `);
  applyCoinWalletMigrations({
    database,
    expectedMigrationId: REQUIRED_COIN_WALLET_MIGRATION_ID,
    expectedDdlChecksum: COIN_WALLET_MIGRATIONS[0].ddlChecksum,
    nowFn: () => new Date(NOW)
  });
  applyCoinCommerceMigrations({
    database,
    expectedMigrationId: REQUIRED_COIN_COMMERCE_MIGRATION_ID,
    expectedDdlChecksum: COIN_COMMERCE_MIGRATIONS[0].ddlChecksum,
    nowFn: () => new Date(NOW)
  });
  applyAccountResourceAuthorityMigrations({
    database,
    expectedMigrationId: REQUIRED_ACCOUNT_RESOURCE_AUTHORITY_MIGRATION_ID,
    expectedDdlChecksum: ACCOUNT_RESOURCE_AUTHORITY_MIGRATIONS[0].ddlChecksum,
    nowFn: () => new Date(NOW)
  });
  return database;
}

function withTempDirectory(action) {
  const directory = mkdtempSync(join(tmpdir(), "authority-model-test-"));
  try {
    return action(directory);
  } finally {
    rmSync(directory, { recursive: true, force: true, maxRetries: 3 });
  }
}

function seedMigrationBackedAccount(database, accountId) {
  database.prepare(`
    insert into platform_accounts (
      id, owner_ref, status, created_at, updated_at, metadata_json
    ) values (?, ?, 'active', ?, ?, '{}')
  `).run(accountId, `owner_${accountId}`, NOW, NOW);
}

function seedMigrationBackedResource(database, { accountId, suffix }) {
  const entitlementId = `entitlement_${suffix}`;
  const resourceRequestId = `request_${suffix}`;
  const issuedLinkId = `link_${suffix}`;
  const tenantId = `tenant_${suffix}`;
  const artifactId = `artifact_${suffix}`;
  const validUntil = "2027-01-01T00:00:00.000Z";
  database.prepare(`
    insert into platform_entitlements (
      id, account_id, plan, status, valid_from, valid_until,
      max_artifacts, max_devices, traffic_limit_bytes, created_at, updated_at
    ) values (?, ?, 'monthly', 'active', ?, ?, 1, 1, 0, ?, ?)
  `).run(entitlementId, accountId, NOW, validUntil, NOW, NOW);
  database.prepare(`
    insert into platform_issuance_requests (
      id, account_id, entitlement_id, approval_ref, status, quantity,
      node_id, purpose, requested_by_ref, created_at, updated_at, metadata_json
    ) values (?, ?, ?, ?, 'issued', 1, ?, 'commerce', ?, ?, ?, '{}')
  `).run(
    resourceRequestId,
    accountId,
    entitlementId,
    `approval_${suffix}`,
    `node_${suffix}`,
    `operator_${suffix}`,
    NOW,
    NOW
  );
  database.prepare(`
    insert into platform_issued_subscription_links (
      id, request_id, tenant_ref, artifact_ref, status, created_at, updated_at
    ) values (?, ?, ?, ?, 'active', ?, ?)
  `).run(
    issuedLinkId,
    resourceRequestId,
    safeBindingRef("tenant", tenantId),
    safeBindingRef("artifact", artifactId),
    NOW,
    NOW
  );
  database.prepare(`
    insert into platform_portal_access_requests (
      id, portal_user_ref, entitlement_ref, status, tenant_id, artifact_id,
      expires_at, valid_until
    ) values (?, ?, ?, 'delivered', ?, ?, ?, ?)
  `).run(
    resourceRequestId,
    accountId,
    entitlementId,
    tenantId,
    artifactId,
    validUntil,
    validUntil
  );
  return { accountId, resourceRequestId, entitlementId, issuedLinkId };
}

function seedAccount(database, accountId, status = "active") {
  database.prepare(`
    insert into platform_accounts (id, status) values (?, ?)
  `).run(accountId, status);
}

function seedResource(database, {
  accountId,
  suffix,
  entitlementStatus = "active",
  requestStatus = "issued",
  linkStatus = "active",
  validFrom = "2026-01-01T00:00:00.000Z",
  validUntil = "2027-01-01T00:00:00.000Z",
  portal = true,
  portalStatus = "delivered",
  portalUserRef = accountId,
  portalEntitlementRef,
  portalTenantId,
  portalArtifactId,
  portalExpiresAt,
  portalValidUntil
}) {
  const entitlementId = `entitlement_${suffix}`;
  const resourceRequestId = `request_${suffix}`;
  const issuedLinkId = `link_${suffix}`;
  const tenantId = portalTenantId ?? `tenant_${suffix}`;
  const artifactId = portalArtifactId ?? `artifact_${suffix}`;
  database.prepare(`
    insert into platform_entitlements (
      id, account_id, status, valid_from, valid_until
    ) values (?, ?, ?, ?, ?)
  `).run(entitlementId, accountId, entitlementStatus, validFrom, validUntil);
  database.prepare(`
    insert into platform_issuance_requests (
      id, account_id, entitlement_id, status
    ) values (?, ?, ?, ?)
  `).run(resourceRequestId, accountId, entitlementId, requestStatus);
  database.prepare(`
    insert into platform_issued_subscription_links (
      id, request_id, tenant_ref, artifact_ref, status
    ) values (?, ?, ?, ?, ?)
  `).run(
    issuedLinkId,
    resourceRequestId,
    safeBindingRef("tenant", tenantId),
    safeBindingRef("artifact", artifactId),
    linkStatus
  );
  if (portal) {
    database.prepare(`
      insert into platform_portal_access_requests (
        id, portal_user_ref, entitlement_ref, status, tenant_id, artifact_id,
        expires_at, valid_until
      ) values (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      resourceRequestId,
      portalUserRef,
      portalEntitlementRef ?? entitlementId,
      portalStatus,
      tenantId,
      artifactId,
      portalExpiresAt ?? validUntil,
      portalValidUntil ?? validUntil
    );
  }
  return {
    accountId,
    resourceRequestId,
    entitlementId,
    issuedLinkId
  };
}

function insertAuthority(database, {
  authorityRef,
  target,
  status = "active",
  version = 1,
  previousAuthorityRef = null
}) {
  const revoked = status === "revoked";
  database.prepare(`
    insert into platform_account_resource_authorities (
      authority_ref, account_id, resource_request_id, entitlement_id,
      issued_link_id, status, version, previous_authority_ref,
      created_at, updated_at, created_by, reason,
      revoked_at, revoked_by, revocation_reason
    ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    authorityRef,
    target.accountId,
    target.resourceRequestId,
    target.entitlementId,
    target.issuedLinkId,
    status,
    version,
    previousAuthorityRef,
    NOW,
    NOW,
    "test_operator",
    "test_assignment",
    revoked ? NOW : null,
    revoked ? "test_operator" : null,
    revoked ? "test_reassignment" : null
  );
}

function createStore(database) {
  let nextId = 0;
  return createAccountResourceAuthorityStore({
    database,
    nowFn: () => new Date(NOW),
    idFactory: () => `authority_generated_${++nextId}`
  });
}

function assignment(target, overrides = {}) {
  return {
    accountId: target.accountId,
    resourceRequestId: target.resourceRequestId,
    entitlementId: target.entitlementId,
    issuedLinkId: target.issuedLinkId,
    expectedVersion: 0,
    createdBy: "operator_ref",
    reason: "explicit_authority_assignment",
    ...overrides
  };
}

test("assigns and resolves one exact authority, including a lapsed entitlement", () => {
  const database = createFixture();
  try {
    seedAccount(database, "account_lapsed");
    const target = seedResource(database, {
      accountId: "account_lapsed",
      suffix: "lapsed",
      validUntil: "2026-07-01T00:00:00.000Z"
    });
    const store = createStore(database);

    const assigned = store.assignAuthority(assignment(target));
    assert.deepEqual(assigned, {
      ok: true,
      authorityRef: "authority_generated_1",
      accountId: "account_lapsed",
      resourceRequestId: "request_lapsed",
      entitlementId: "entitlement_lapsed",
      issuedLinkId: "link_lapsed",
      authorityVersion: 1,
      isLapsed: true
    });
    assert.deepEqual(store.resolveCommerceAuthority({
      accountId: "account_lapsed",
      expectedAuthorityVersion: 1
    }), assigned);
  } finally {
    database.close();
  }
});

test("service assign resolve and reassign conform to the real migration schema", () => {
  const database = createMigrationBackedFixture();
  try {
    seedMigrationBackedAccount(database, "account_migration_contract");
    const first = seedMigrationBackedResource(database, {
      accountId: "account_migration_contract",
      suffix: "migration_a"
    });
    const second = seedMigrationBackedResource(database, {
      accountId: "account_migration_contract",
      suffix: "migration_b"
    });
    const store = createStore(database);
    const assigned = store.assignAuthority(assignment(first));
    assert.equal(assigned.authorityVersion, 1);
    assert.deepEqual(store.resolveCommerceAuthority({
      accountId: first.accountId,
      expectedAuthorityVersion: 1
    }), assigned);

    const reassigned = store.reassignAuthority({
      ...assignment(second),
      expectedVersion: 1,
      revokedBy: "operator_ref",
      revocationReason: "explicit_commerce_authority_change"
    });
    assert.equal(reassigned.authorityVersion, 2);
    assert.equal(reassigned.resourceRequestId, second.resourceRequestId);
    assert.equal(database.prepare(`
      select count(*) from platform_account_resource_authorities
      where status = 'active'
    `).pluck().get(), 1);
  } finally {
    database.close();
  }
});

test("fails closed without authority and never selects the latest active resource", () => {
  const database = createFixture();
  try {
    seedAccount(database, "account_ambiguous");
    seedResource(database, { accountId: "account_ambiguous", suffix: "older" });
    seedResource(database, { accountId: "account_ambiguous", suffix: "newer" });

    assert.deepEqual(createStore(database).resolveCommerceAuthority({
      accountId: "account_ambiguous"
    }), {
      ok: false,
      reason: "no_authority"
    });
  } finally {
    database.close();
  }
});

test("fails closed when corrupted storage contains multiple active authorities", () => {
  const database = createFixture({ enforceActiveAuthorityUniqueness: false });
  try {
    seedAccount(database, "account_conflict");
    const first = seedResource(database, {
      accountId: "account_conflict",
      suffix: "conflict_a"
    });
    const second = seedResource(database, {
      accountId: "account_conflict",
      suffix: "conflict_b"
    });
    insertAuthority(database, {
      authorityRef: "authority_conflict_a",
      target: first,
      version: 1
    });
    insertAuthority(database, {
      authorityRef: "authority_conflict_b",
      target: second,
      version: 2
    });

    assert.deepEqual(createStore(database).resolveCommerceAuthority({
      accountId: "account_conflict"
    }), {
      ok: false,
      reason: "authority_conflict"
    });
  } finally {
    database.close();
  }
});

test("fails closed for resource, triad, or required Portal association drift", async (t) => {
  const scenarios = [
    {
      name: "request does not belong to the authority account",
      mutate(database, target) {
        seedAccount(database, "other_account");
        database.pragma("foreign_keys = OFF");
        database.prepare(`
          update platform_issuance_requests set account_id = ? where id = ?
        `).run("other_account", target.resourceRequestId);
      }
    },
    {
      name: "entitlement triad is not active",
      mutate(database, target) {
        database.prepare(`
          update platform_entitlements set status = 'expired' where id = ?
        `).run(target.entitlementId);
      }
    },
    {
      name: "issued link triad is not active",
      mutate(database, target) {
        database.prepare(`
          update platform_issued_subscription_links set status = 'rotated' where id = ?
        `).run(target.issuedLinkId);
      }
    },
    {
      name: "Portal association is missing",
      mutate(database, target) {
        database.prepare(`
          delete from platform_portal_access_requests where id = ?
        `).run(target.resourceRequestId);
      }
    },
    {
      name: "Portal entitlement association is partial",
      mutate(database, target) {
        database.prepare(`
          update platform_portal_access_requests set entitlement_ref = null where id = ?
        `).run(target.resourceRequestId);
      }
    },
    {
      name: "Portal tenant mapping differs from the issued link",
      mutate(database, target) {
        database.prepare(`
          update platform_portal_access_requests set tenant_id = 'tenant_drift' where id = ?
        `).run(target.resourceRequestId);
      }
    },
    {
      name: "Portal validity differs from the entitlement",
      mutate(database, target) {
        database.prepare(`
          update platform_portal_access_requests
          set valid_until = '2027-02-01T00:00:00.000Z'
          where id = ?
        `).run(target.resourceRequestId);
      }
    }
  ];

  for (const scenario of scenarios) {
    await t.test(scenario.name, () => {
      const database = createFixture();
      try {
        seedAccount(database, "account_drift");
        const target = seedResource(database, {
          accountId: "account_drift",
          suffix: scenario.name.replaceAll(" ", "_")
        });
        insertAuthority(database, {
          authorityRef: "authority_drift",
          target
        });
        scenario.mutate(database, target);

        assert.deepEqual(createStore(database).resolveCommerceAuthority({
          accountId: "account_drift"
        }), {
          ok: false,
          reason: "authority_drift"
        });
      } finally {
        database.close();
      }
    });
  }
});

test("reassigns with CAS, revokes only the old authority, and leaves both resources unchanged", () => {
  const database = createFixture();
  try {
    seedAccount(database, "account_reassign");
    const first = seedResource(database, {
      accountId: "account_reassign",
      suffix: "reassign_a"
    });
    const second = seedResource(database, {
      accountId: "account_reassign",
      suffix: "reassign_b"
    });
    const store = createStore(database);
    const assigned = store.assignAuthority(assignment(first));

    const reassigned = store.reassignAuthority({
      accountId: "account_reassign",
      resourceRequestId: second.resourceRequestId,
      entitlementId: second.entitlementId,
      issuedLinkId: second.issuedLinkId,
      expectedVersion: assigned.authorityVersion,
      createdBy: "operator_ref",
      reason: "explicit_authority_reassignment",
      revokedBy: "operator_ref",
      revocationReason: "superseded_for_commerce_only"
    });

    assert.equal(reassigned.ok, true);
    assert.equal(reassigned.authorityVersion, 2);
    assert.equal(reassigned.resourceRequestId, second.resourceRequestId);
    assert.deepEqual(database.prepare(`
      select authority_ref, status, version, previous_authority_ref,
             revoked_at, revoked_by, revocation_reason
      from platform_account_resource_authorities
      order by version
    `).all(), [
      {
        authority_ref: assigned.authorityRef,
        status: "revoked",
        version: 1,
        previous_authority_ref: null,
        revoked_at: NOW,
        revoked_by: "operator_ref",
        revocation_reason: "superseded_for_commerce_only"
      },
      {
        authority_ref: reassigned.authorityRef,
        status: "active",
        version: 2,
        previous_authority_ref: assigned.authorityRef,
        revoked_at: null,
        revoked_by: null,
        revocation_reason: null
      }
    ]);
    assert.deepEqual(database.prepare(`
      select status from platform_entitlements order by id
    `).all(), [{ status: "active" }, { status: "active" }]);
    assert.deepEqual(database.prepare(`
      select status from platform_issuance_requests order by id
    `).all(), [{ status: "issued" }, { status: "issued" }]);
    assert.deepEqual(database.prepare(`
      select status from platform_issued_subscription_links order by id
    `).all(), [{ status: "active" }, { status: "active" }]);
  } finally {
    database.close();
  }
});

test("reassign rolls back the old revocation when the new authority insert fails", () => {
  const database = createMigrationBackedFixture();
  try {
    seedMigrationBackedAccount(database, "account_reassign_rollback");
    const first = seedMigrationBackedResource(database, {
      accountId: "account_reassign_rollback",
      suffix: "rollback_a"
    });
    const second = seedMigrationBackedResource(database, {
      accountId: "account_reassign_rollback",
      suffix: "rollback_b"
    });
    const store = createAccountResourceAuthorityStore({
      database,
      nowFn: () => new Date(NOW),
      idFactory: () => "authority_collision"
    });
    store.assignAuthority(assignment(first));

    assert.throws(() => store.reassignAuthority({
      ...assignment(second),
      expectedVersion: 1,
      revokedBy: "operator_ref",
      revocationReason: "collision_rollback_proof"
    }), (error) => (
      error?.code === "account_resource_authority_assignment_conflict"
    ));
    assert.deepEqual(database.prepare(`
      select authority_ref, status, version, revoked_at
        from platform_account_resource_authorities
       order by version
    `).all(), [{
      authority_ref: "authority_collision",
      status: "active",
      version: 1,
      revoked_at: null
    }]);
  } finally {
    database.close();
  }
});

test("SQLite write contention maps to a dedicated unavailable safe code", () => {
  withTempDirectory((directory) => {
    const dbPath = join(directory, "authority-contention.sqlite");
    const database = createMigrationBackedFixture(dbPath);
    const blocker = new Database(dbPath);
    try {
      seedMigrationBackedAccount(database, "account_contention");
      const target = seedMigrationBackedResource(database, {
        accountId: "account_contention",
        suffix: "contention"
      });
      database.pragma("busy_timeout = 0");
      blocker.pragma("busy_timeout = 0");
      blocker.exec("begin immediate");

      assert.throws(() => createStore(database).assignAuthority(
        assignment(target)
      ), (error) => (
        error?.code === "account_resource_authority_unavailable"
      ));
      assert.equal(database.prepare(`
        select count(*) from platform_account_resource_authorities
      `).pluck().get(), 0);
    } finally {
      if (blocker.inTransaction) blocker.exec("rollback");
      blocker.close();
      database.close();
    }
  });
});

test("rejects stale authority versions without changing lineage", () => {
  const database = createFixture();
  try {
    seedAccount(database, "account_cas");
    const first = seedResource(database, { accountId: "account_cas", suffix: "cas_a" });
    const second = seedResource(database, { accountId: "account_cas", suffix: "cas_b" });
    const third = seedResource(database, { accountId: "account_cas", suffix: "cas_c" });
    const store = createStore(database);
    store.assignAuthority(assignment(first));
    store.reassignAuthority({
      ...assignment(second),
      expectedVersion: 1,
      revokedBy: "operator_ref",
      revocationReason: "first_reassignment"
    });

    assert.throws(() => store.reassignAuthority({
      ...assignment(third),
      expectedVersion: 1,
      revokedBy: "operator_ref",
      revocationReason: "stale_reassignment"
    }), (error) => error?.code === "account_resource_authority_version_conflict");
    assert.equal(database.prepare(`
      select count(*) as count from platform_account_resource_authorities
    `).get().count, 2);
    assert.deepEqual(store.resolveCommerceAuthority({
      accountId: "account_cas",
      expectedAuthorityVersion: 1
    }), {
      ok: false,
      reason: "authority_version_changed"
    });
    assert.equal(store.resolveCommerceAuthority({
      accountId: "account_cas",
      expectedAuthorityVersion: 2
    }).ok, true);
  } finally {
    database.close();
  }
});

test("refuses invalid assignment and a second initial assignment", () => {
  const database = createFixture();
  try {
    seedAccount(database, "account_assign_guard");
    const target = seedResource(database, {
      accountId: "account_assign_guard",
      suffix: "assign_guard"
    });
    const store = createStore(database);

    assert.throws(() => store.assignAuthority(assignment({
      ...target,
      issuedLinkId: "link_missing"
    })), (error) => error?.code === "account_resource_authority_target_invalid");
    store.assignAuthority(assignment(target));
    assert.throws(() => store.assignAuthority(assignment(target)), (error) => (
      error?.code === "account_resource_authority_assignment_conflict"
    ));
  } finally {
    database.close();
  }
});

test("assignment rejects unsafe control refs and non-exact validity intervals", () => {
  const database = createFixture();
  try {
    seedAccount(database, "account_input_guard");
    const safe = seedResource(database, {
      accountId: "account_input_guard",
      suffix: "input_guard_safe"
    });
    const store = createStore(database);
    assert.throws(() => store.assignAuthority(assignment(safe, {
      createdBy: "operator@example.com"
    })), (error) => (
      error?.code === "account_resource_authority_invalid_contract"
    ));

    const invalidInterval = seedResource(database, {
      accountId: "account_input_guard",
      suffix: "input_guard_interval",
      validFrom: "2027-01-01T00:00:00.000Z",
      validUntil: "2027-01-01T00:00:00.000Z"
    });
    assert.throws(() => store.assignAuthority(assignment(invalidInterval)),
      (error) => (
        error?.code === "account_resource_authority_target_invalid"
      ));
  } finally {
    database.close();
  }
});

test("dry-run returns aggregate-only resolution and ambiguity counts", () => {
  const database = createFixture();
  try {
    for (const accountId of [
      "account_resolved",
      "account_single",
      "account_ambiguous",
      "account_empty",
      "account_invalid"
    ]) {
      seedAccount(database, accountId);
    }
    const resolved = seedResource(database, {
      accountId: "account_resolved",
      suffix: "resolved"
    });
    seedResource(database, { accountId: "account_single", suffix: "single" });
    seedResource(database, { accountId: "account_ambiguous", suffix: "ambiguous_a" });
    seedResource(database, { accountId: "account_ambiguous", suffix: "ambiguous_b" });
    const invalid = seedResource(database, {
      accountId: "account_invalid",
      suffix: "invalid"
    });
    insertAuthority(database, { authorityRef: "authority_resolved", target: resolved });
    insertAuthority(database, { authorityRef: "authority_invalid", target: invalid });
    database.prepare(`
      update platform_portal_access_requests set status = 'disabled' where id = ?
    `).run(invalid.resourceRequestId);

    const summary = createStore(database).dryRunAuthorities();
    assert.deepEqual(summary, {
      ok: true,
      ready: false,
      aggregateOnly: true,
      counts: {
        accounts: 5,
        activeAuthorityRows: 2,
        resolved: 1,
        missingAuthority: 3,
        invalidAuthority: 1,
        authorityConflicts: 0,
        ambiguousBindingsWithoutAuthority: 1,
        singleBindingWithoutAuthority: 1,
        noBindingWithoutAuthority: 1
      },
      reasonCodes: {
        no_authority: 3,
        authority_conflict: 0,
        authority_drift: 1
      }
    });
    assert.equal(JSON.stringify(summary).includes("account_"), false);
    assert.equal(JSON.stringify(summary).includes("request_"), false);
    assert.equal(JSON.stringify(summary).includes("entitlement_"), false);
    assert.equal(JSON.stringify(summary).includes("link_"), false);
  } finally {
    database.close();
  }
});

test("dry-run counts corrupted multiple authorities without returning identifiers", () => {
  const database = createFixture({ enforceActiveAuthorityUniqueness: false });
  try {
    seedAccount(database, "account_conflicted_dry_run");
    const first = seedResource(database, {
      accountId: "account_conflicted_dry_run",
      suffix: "dry_conflict_a"
    });
    const second = seedResource(database, {
      accountId: "account_conflicted_dry_run",
      suffix: "dry_conflict_b"
    });
    insertAuthority(database, {
      authorityRef: "authority_dry_conflict_a",
      target: first,
      version: 1
    });
    insertAuthority(database, {
      authorityRef: "authority_dry_conflict_b",
      target: second,
      version: 2
    });

    assert.deepEqual(createStore(database).dryRunAuthorities(), {
      ok: true,
      ready: false,
      aggregateOnly: true,
      counts: {
        accounts: 1,
        activeAuthorityRows: 2,
        resolved: 0,
        missingAuthority: 0,
        invalidAuthority: 0,
        authorityConflicts: 1,
        ambiguousBindingsWithoutAuthority: 0,
        singleBindingWithoutAuthority: 0,
        noBindingWithoutAuthority: 0
      },
      reasonCodes: {
        no_authority: 0,
        authority_conflict: 1,
        authority_drift: 0
      }
    });
  } finally {
    database.close();
  }
});

test("dry-run includes an active authority whose account later became inactive", () => {
  const database = createFixture();
  try {
    seedAccount(database, "account_inactive_authority");
    const target = seedResource(database, {
      accountId: "account_inactive_authority",
      suffix: "inactive_authority"
    });
    insertAuthority(database, {
      authorityRef: "authority_inactive_account",
      target
    });
    database.prepare(`
      update platform_accounts set status = 'suspended' where id = ?
    `).run("account_inactive_authority");

    assert.deepEqual(createStore(database).dryRunAuthorities(), {
      ok: true,
      ready: false,
      aggregateOnly: true,
      counts: {
        accounts: 1,
        activeAuthorityRows: 1,
        resolved: 0,
        missingAuthority: 0,
        invalidAuthority: 1,
        authorityConflicts: 0,
        ambiguousBindingsWithoutAuthority: 0,
        singleBindingWithoutAuthority: 0,
        noBindingWithoutAuthority: 0
      },
      reasonCodes: {
        no_authority: 0,
        authority_conflict: 0,
        authority_drift: 1
      }
    });
  } finally {
    database.close();
  }
});
