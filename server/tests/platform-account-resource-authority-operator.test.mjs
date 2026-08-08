import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import {
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import Database from "better-sqlite3";

import {
  applyAuthorityOperatorRequest,
  digestAuthorityOperatorRequest,
  normalizeAuthorityOperatorRequest,
  planAuthorityOperatorRequest
} from "../services/platform/account-resource-authority-operator.mjs";
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

const NOW = "2026-08-08T12:00:00.000Z";
const LATER = "2026-08-08T12:05:00.000Z";
const RESULT_KEYS = [
  "automaticRetry",
  "classification",
  "databaseChanged",
  "operation",
  "receiptState",
  "requestDigest"
];
const OPERATOR_CONTRACT_ERROR =
  "account_resource_authority_operator_invalid_contract";
const WINDOWS_PATH_CASES = [
  ["drive-backslash", "C:\\data\\authority.sqlite", ["accepted", "unknown"]],
  ["drive-forward", "d:/data/authority.sqlite", ["accepted", "unknown"]],
  ["drive-space", "C:\\data folder\\authority.sqlite", ["accepted", "unknown"]],
  ["unc-backslash", "\\\\server\\share\\authority.sqlite", ["accepted", "unknown"]],
  ["unc-forward", "//server/share/authority.sqlite", ["accepted", "unknown"]],
  ["unc-admin-file-share", "\\\\server\\C$\\authority.sqlite", ["accepted", "unknown"]],
  ["unc-pchar-share", "\\\\server\\bad#share\\authority.sqlite", ["accepted", "unknown"]],
  ["unc-latin-share", "\\\\server\\café\\authority.sqlite", ["accepted", "unknown"]],
  ["unc-80-character-share", `\\\\server\\${"s".repeat(80)}\\authority.sqlite`, ["accepted", "unknown"]],
  ["root-backslash", "\\authority.sqlite", ["rejected", OPERATOR_CONTRACT_ERROR]],
  ["root-forward", "/authority.sqlite", ["rejected", OPERATOR_CONTRACT_ERROR]],
  ["drive-relative", "C:authority.sqlite", ["rejected", OPERATOR_CONTRACT_ERROR]],
  ["relative", "data/authority.sqlite", ["rejected", OPERATOR_CONTRACT_ERROR]],
  ["drive-root-only", "C:\\", ["rejected", OPERATOR_CONTRACT_ERROR]],
  ["drive-empty-middle", "C:\\data\\\\authority.sqlite", ["rejected", OPERATOR_CONTRACT_ERROR]],
  ["drive-trailing-separator", "C:\\data\\", ["rejected", OPERATOR_CONTRACT_ERROR]],
  ["drive-dot-component", "C:\\data\\.\\authority.sqlite", ["rejected", OPERATOR_CONTRACT_ERROR]],
  ["drive-parent-component", "C:\\data\\..\\authority.sqlite", ["rejected", OPERATOR_CONTRACT_ERROR]],
  ["drive-control", "C:\\data\\bad\u001fname.sqlite", ["rejected", OPERATOR_CONTRACT_ERROR]],
  ["drive-nul", "C:\\data\\bad\u0000name.sqlite", ["rejected", OPERATOR_CONTRACT_ERROR]],
  ["drive-less-than", "C:\\data\\bad<name.sqlite", ["rejected", OPERATOR_CONTRACT_ERROR]],
  ["drive-greater-than", "C:\\data\\bad>name.sqlite", ["rejected", OPERATOR_CONTRACT_ERROR]],
  ["drive-quote", "C:\\data\\bad\"name.sqlite", ["rejected", OPERATOR_CONTRACT_ERROR]],
  ["drive-pipe", "C:\\data\\bad|name.sqlite", ["rejected", OPERATOR_CONTRACT_ERROR]],
  ["drive-question", "C:\\data\\bad?name.sqlite", ["rejected", OPERATOR_CONTRACT_ERROR]],
  ["drive-star", "C:\\data\\bad*name.sqlite", ["rejected", OPERATOR_CONTRACT_ERROR]],
  ["drive-ads", "C:\\data\\authority.sqlite:stream", ["rejected", OPERATOR_CONTRACT_ERROR]],
  ["drive-trailing-dot", "C:\\data\\authority.sqlite.", ["rejected", OPERATOR_CONTRACT_ERROR]],
  ["drive-trailing-space", "C:\\data\\authority.sqlite ", ["rejected", OPERATOR_CONTRACT_ERROR]],
  ["reserved-con", "C:\\data\\CON.sqlite", ["rejected", OPERATOR_CONTRACT_ERROR]],
  ["reserved-prn", "C:\\data\\prn.txt", ["rejected", OPERATOR_CONTRACT_ERROR]],
  ["reserved-aux", "C:\\data\\AUX", ["rejected", OPERATOR_CONTRACT_ERROR]],
  ["reserved-nul", "C:\\NUL", ["rejected", OPERATOR_CONTRACT_ERROR]],
  ["reserved-clock", "C:\\data\\CLOCK$", ["rejected", OPERATOR_CONTRACT_ERROR]],
  ["reserved-conin", "C:\\data\\CONIN$.log", ["rejected", OPERATOR_CONTRACT_ERROR]],
  ["reserved-conout", "C:\\data\\CONOUT$", ["rejected", OPERATOR_CONTRACT_ERROR]],
  ["reserved-com1", "C:\\data\\COM1", ["rejected", OPERATOR_CONTRACT_ERROR]],
  ["reserved-com9-extension", "C:\\data\\com9.sqlite", ["rejected", OPERATOR_CONTRACT_ERROR]],
  ["reserved-lpt1", "C:\\data\\LPT1", ["rejected", OPERATOR_CONTRACT_ERROR]],
  ["reserved-lpt9-extension", "C:\\data\\lpt9.sqlite", ["rejected", OPERATOR_CONTRACT_ERROR]],
  ["reserved-com-superscript", "C:\\data\\COM¹.sqlite", ["rejected", OPERATOR_CONTRACT_ERROR]],
  ["reserved-lpt-superscript", "C:\\data\\LPT⁹", ["rejected", OPERATOR_CONTRACT_ERROR]],
  ["incomplete-unc", "\\\\server", ["rejected", OPERATOR_CONTRACT_ERROR]],
  ["incomplete-unc-share", "\\\\server\\", ["rejected", OPERATOR_CONTRACT_ERROR]],
  ["unc-no-file", "\\\\server\\share", ["rejected", OPERATOR_CONTRACT_ERROR]],
  ["unc-empty-middle", "\\\\server\\share\\\\authority.sqlite", ["rejected", OPERATOR_CONTRACT_ERROR]],
  ["unc-trailing-separator", "\\\\server\\share\\", ["rejected", OPERATOR_CONTRACT_ERROR]],
  ["unc-parent-server", "\\\\..\\share\\authority.sqlite", ["rejected", OPERATOR_CONTRACT_ERROR]],
  ["unc-parent-share", "\\\\server\\..\\authority.sqlite", ["rejected", OPERATOR_CONTRACT_ERROR]],
  ["unc-dot-share", "\\\\server\\.\\authority.sqlite", ["rejected", OPERATOR_CONTRACT_ERROR]],
  ["unc-question-share", "\\\\server\\?\\authority.sqlite", ["rejected", OPERATOR_CONTRACT_ERROR]],
  ["unc-pipe-share", "\\\\server\\PIPE\\authority.sqlite", ["rejected", OPERATOR_CONTRACT_ERROR]],
  ["unc-ipc-share", "\\\\server\\ipc$\\authority.sqlite", ["rejected", OPERATOR_CONTRACT_ERROR]],
  ["unc-plus-share", "\\\\server\\bad+share\\authority.sqlite", ["rejected", OPERATOR_CONTRACT_ERROR]],
  ["unc-bracket-share", "\\\\server\\bad[share]\\authority.sqlite", ["rejected", OPERATOR_CONTRACT_ERROR]],
  ["unc-comma-share", "\\\\server\\bad,share\\authority.sqlite", ["rejected", OPERATOR_CONTRACT_ERROR]],
  ["unc-semicolon-share", "\\\\server\\bad;share\\authority.sqlite", ["rejected", OPERATOR_CONTRACT_ERROR]],
  ["unc-equals-share", "\\\\server\\bad=share\\authority.sqlite", ["rejected", OPERATOR_CONTRACT_ERROR]],
  ["unc-non-pchar-share", "\\\\server\\share雪\\authority.sqlite", ["rejected", OPERATOR_CONTRACT_ERROR]],
  ["unc-81-character-share", `\\\\server\\${"s".repeat(81)}\\authority.sqlite`, ["rejected", OPERATOR_CONTRACT_ERROR]],
  ["unc-trailing-dot-share", "\\\\server\\share.\\authority.sqlite", ["rejected", OPERATOR_CONTRACT_ERROR]],
  ["unc-trailing-space-share", "\\\\server\\share \\authority.sqlite", ["rejected", OPERATOR_CONTRACT_ERROR]],
  ["device-question", "\\\\?\\C:\\authority.sqlite", ["rejected", OPERATOR_CONTRACT_ERROR]],
  ["device-dot", "\\\\.\\C:\\authority.sqlite", ["rejected", OPERATOR_CONTRACT_ERROR]],
  ["device-context", "\\??\\C:\\authority.sqlite", ["rejected", OPERATOR_CONTRACT_ERROR]]
];

function safeBindingRef(prefix, value) {
  return `${prefix}ref_${createHash("sha256")
    .update(value)
    .digest("hex")
    .slice(0, 16)}`;
}

function withTempDirectory(action) {
  const directory = mkdtempSync(join(tmpdir(), "authority-operator-test-"));
  try {
    return action(directory);
  } finally {
    rmSync(directory, { recursive: true, force: true, maxRetries: 3 });
  }
}

function createFoundation(dbPath) {
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

function seedAccount(database, accountId) {
  database.prepare(`
    insert into platform_accounts (
      id, owner_ref, status, created_at, updated_at, metadata_json
    ) values (?, ?, 'active', ?, ?, '{}')
  `).run(accountId, `owner_${accountId}`, NOW, NOW);
}

function seedResource(database, { accountId, suffix }) {
  const entitlementId = `entitlement_${suffix}`;
  const resourceRequestId = `request_${suffix}`;
  const issuedLinkId = `link_${suffix}`;
  const tenantId = `tenant_${suffix}`;
  const artifactId = `artifact_${suffix}`;
  const validUntil = "2027-08-08T00:00:00.000Z";
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

function assignRequest(target, overrides = {}) {
  return {
    schemaVersion: "1",
    operation: "assign",
    newAuthorityRef: `authority_${target.resourceRequestId}`,
    accountId: target.accountId,
    resourceRequestId: target.resourceRequestId,
    entitlementId: target.entitlementId,
    issuedLinkId: target.issuedLinkId,
    createdBy: "operator_ref",
    reason: "explicit_assignment",
    ...overrides
  };
}

function reassignRequest(previousRequest, target, overrides = {}) {
  return {
    schemaVersion: "1",
    operation: "reassign",
    newAuthorityRef: `authority_${target.resourceRequestId}`,
    expectedPreviousAuthorityRef: previousRequest.newAuthorityRef,
    expectedVersion: 1,
    accountId: target.accountId,
    resourceRequestId: target.resourceRequestId,
    entitlementId: target.entitlementId,
    issuedLinkId: target.issuedLinkId,
    createdBy: "operator_ref",
    reason: "explicit_reassignment",
    revokedBy: "operator_ref",
    revocationReason: "superseded_for_commerce",
    ...overrides
  };
}

function nowFn() {
  return new Date(NOW);
}

function authorityRows(dbPath) {
  const database = new Database(dbPath, { readonly: true, fileMustExist: true });
  try {
    return database.prepare(`
      select * from main.platform_account_resource_authorities
      order by version, authority_ref
    `).all();
  } finally {
    database.close();
  }
}

function insertTwoVersionHistory(database, {
  firstTarget,
  secondTarget,
  firstCreatedBy = "operator_ref",
  firstRevokedAt = LATER,
  secondCreatedAt = LATER
}) {
  database.prepare(`
    insert into main.platform_account_resource_authorities (
      authority_ref, account_id, resource_request_id, entitlement_id,
      issued_link_id, status, version, previous_authority_ref,
      created_at, updated_at, created_by, reason,
      revoked_at, revoked_by, revocation_reason
    ) values (
      'authority_history_v1', ?, ?, ?, ?, 'active', 1, null,
      ?, ?, ?, 'history_v1', null, null, null
    )
  `).run(
    firstTarget.accountId,
    firstTarget.resourceRequestId,
    firstTarget.entitlementId,
    firstTarget.issuedLinkId,
    NOW,
    NOW,
    firstCreatedBy
  );
  database.prepare(`
    update main.platform_account_resource_authorities
    set status = 'revoked', updated_at = ?, revoked_at = ?,
        revoked_by = 'operator_ref', revocation_reason = 'history_to_v2'
    where authority_ref = 'authority_history_v1'
  `).run(firstRevokedAt, firstRevokedAt);
  database.prepare(`
    insert into main.platform_account_resource_authorities (
      authority_ref, account_id, resource_request_id, entitlement_id,
      issued_link_id, status, version, previous_authority_ref,
      created_at, updated_at, created_by, reason,
      revoked_at, revoked_by, revocation_reason
    ) values (
      'authority_history_v2', ?, ?, ?, ?, 'active', 2,
      'authority_history_v1', ?, ?, 'operator_ref', 'history_v2',
      null, null, null
    )
  `).run(
    secondTarget.accountId,
    secondTarget.resourceRequestId,
    secondTarget.entitlementId,
    secondTarget.issuedLinkId,
    secondCreatedAt,
    secondCreatedAt
  );
}

function quoteIdentifier(value) {
  return `"${String(value).replaceAll('"', '""')}"`;
}

function nonAuthorityRows(database) {
  const tables = database.prepare(`
    select name from main.sqlite_master
    where type = 'table'
      and name not like 'sqlite_%'
      and name <> 'platform_account_resource_authorities'
    order by name
  `).all();
  return tables.map(({ name }) => ({
    name,
    rows: database.prepare(`select * from main.${quoteIdentifier(name)}`).all()
  }));
}

function assertSafeResult(result) {
  assert.deepEqual(Object.keys(result).sort(), RESULT_KEYS);
  assert.match(result.requestDigest, /^sha256:[a-f0-9]{64}$/);
  assert.equal(result.automaticRetry, false);
  assert.ok([
    "applied_exact",
    "not_applied",
    "drift",
    "unknown"
  ].includes(result.classification));
}

test("normalization enforces exact keys and digest includes derived assign version zero", () => {
  const input = {
    reason: "explicit_assignment",
    issuedLinkId: "link_digest",
    operation: "assign",
    schemaVersion: "1",
    accountId: "account_digest",
    newAuthorityRef: "authority_digest",
    entitlementId: "entitlement_digest",
    createdBy: "operator_ref",
    resourceRequestId: "request_digest"
  };
  const normalized = normalizeAuthorityOperatorRequest(input);
  assert.deepEqual(Object.keys(normalized), [
    "schemaVersion",
    "operation",
    "newAuthorityRef",
    "accountId",
    "resourceRequestId",
    "entitlementId",
    "issuedLinkId",
    "createdBy",
    "reason"
  ]);
  assert.notEqual(normalized, input);
  assert.equal(Object.isFrozen(normalized), true);
  assert.equal(
    digestAuthorityOperatorRequest(input),
    "sha256:a877b0ab22a8b870369a298b0cc78575c9cd66319274885f86a8ccd4235afb8d"
  );
  assert.equal(
    digestAuthorityOperatorRequest(normalized),
    digestAuthorityOperatorRequest(input)
  );
});

test("normalization rejects missing extra accessor proxy secret and invalid CAS values generically", async (t) => {
  const target = {
    accountId: "account_contract",
    resourceRequestId: "request_contract",
    entitlementId: "entitlement_contract",
    issuedLinkId: "link_contract"
  };
  const validAssign = assignRequest(target);
  const cases = [
    ["missing key", (() => {
      const { reason: _reason, ...missing } = validAssign;
      return missing;
    })()],
    ["extra timestamp", { ...validAssign, createdAt: NOW }],
    ["secret-like actor", { ...validAssign, createdBy: "Bearer secret_value" }],
    ["getter", Object.defineProperty({ ...validAssign }, "reason", {
      enumerable: true,
      get() {
        throw new Error("private getter detail");
      }
    })],
    ["proxy", new Proxy(validAssign, {
      ownKeys() {
        throw new Error("private proxy detail");
      }
    })],
    ["same new and previous ref", reassignRequest(validAssign, target, {
      newAuthorityRef: validAssign.newAuthorityRef
    })],
    ["zero reassign version", reassignRequest(validAssign, target, {
      expectedVersion: 0,
      newAuthorityRef: "authority_contract_v2"
    })],
    ["too-large reassign version", reassignRequest(validAssign, target, {
      expectedVersion: Number.MAX_SAFE_INTEGER,
      newAuthorityRef: "authority_contract_v2"
    })]
  ];

  for (const [name, value] of cases) {
    await t.test(name, () => {
      assert.throws(() => normalizeAuthorityOperatorRequest(value), (error) => {
        assert.equal(error?.code, "account_resource_authority_operator_invalid_contract");
        assert.equal(error?.message, "Account resource authority operator rejected");
        assert.equal(JSON.stringify(error).includes("private"), false);
        assert.equal(String(error).includes("secret_value"), false);
        return true;
      });
    });
  }
});

test("commit-before interruption rolls back and a fresh plan reports not_applied", () => {
  withTempDirectory((directory) => {
    const dbPath = join(directory, "crash-before-commit.sqlite");
    const database = createFoundation(dbPath);
    seedAccount(database, "account_crash_before");
    const target = seedResource(database, {
      accountId: "account_crash_before",
      suffix: "crash_before"
    });
    database.close();
    const request = assignRequest(target, {
      newAuthorityRef: "authority_crash_before"
    });
    const child = spawnSync(process.execPath, [
      "--input-type=module",
      "-e",
      `
        import Database from "better-sqlite3";
        import { pathToFileURL } from "node:url";
        const [servicePath, dbPath, requestJson] = process.argv.slice(1);
        const { createAccountResourceAuthorityStore } = await import(
          pathToFileURL(servicePath).href
        );
        const request = JSON.parse(requestJson);
        const database = new Database(dbPath, { fileMustExist: true });
        database.pragma("foreign_keys = ON");
        const store = createAccountResourceAuthorityStore({
          database,
          nowFn: () => new Date("${NOW}"),
          idFactory: () => request.newAuthorityRef
        });
        database.exec("begin immediate");
        store.assignAuthority({
          accountId: request.accountId,
          resourceRequestId: request.resourceRequestId,
          entitlementId: request.entitlementId,
          issuedLinkId: request.issuedLinkId,
          expectedVersion: 0,
          createdBy: request.createdBy,
          reason: request.reason
        });
        process.exit(73);
      `,
      resolve("server/services/platform/account-resource-authority.mjs"),
      dbPath,
      JSON.stringify(request)
    ], { cwd: resolve("."), encoding: "utf8" });
    assert.equal(child.status, 73, child.stderr);
    assert.deepEqual(authorityRows(dbPath), []);

    const planned = planAuthorityOperatorRequest({ dbPath, request, nowFn });
    assertSafeResult(planned);
    assert.equal(planned.classification, "not_applied");
    assert.equal(planned.databaseChanged, false);
  });
});

test("commit-after interruption is recovered only by a fresh plan", () => {
  withTempDirectory((directory) => {
    const dbPath = join(directory, "crash-after-commit.sqlite");
    const database = createFoundation(dbPath);
    seedAccount(database, "account_crash_after");
    const target = seedResource(database, {
      accountId: "account_crash_after",
      suffix: "crash_after"
    });
    database.close();
    const request = assignRequest(target);

    applyAuthorityOperatorRequest({ dbPath, request, nowFn });
    const recovered = planAuthorityOperatorRequest({ dbPath, request, nowFn });
    assertSafeResult(recovered);
    assert.equal(recovered.classification, "applied_exact");
    assert.equal(recovered.receiptState, "recovered_after_unknown");
    assert.equal(recovered.databaseChanged, false);
  });
});

test("same triad with a different new ref is drift and never eligible for assign", () => {
  withTempDirectory((directory) => {
    const dbPath = join(directory, "same-triad-new-ref.sqlite");
    const database = createFoundation(dbPath);
    seedAccount(database, "account_same_triad");
    const target = seedResource(database, {
      accountId: "account_same_triad",
      suffix: "same_triad"
    });
    database.close();
    const first = assignRequest(target, { newAuthorityRef: "authority_first" });
    const applied = applyAuthorityOperatorRequest({ dbPath, request: first, nowFn });
    assert.equal(applied.classification, "applied_exact");
    const before = authorityRows(dbPath);

    const planned = planAuthorityOperatorRequest({
      dbPath,
      request: assignRequest(target, { newAuthorityRef: "authority_second" }),
      nowFn
    });
    assert.equal(planned.classification, "drift");
    assert.deepEqual(authorityRows(dbPath), before);
  });
});

test("schema-exact same-triad reassign rows are drift and apply writes nothing", () => {
  withTempDirectory((directory) => {
    const dbPath = join(directory, "same-triad-reassign.sqlite");
    const database = createFoundation(dbPath);
    seedAccount(database, "account_same_triad_reassign");
    const target = seedResource(database, {
      accountId: "account_same_triad_reassign",
      suffix: "same_triad_reassign"
    });
    database.close();
    const first = assignRequest(target, {
      newAuthorityRef: "authority_same_triad_v1"
    });
    const impossible = reassignRequest(first, target, {
      newAuthorityRef: "authority_same_triad_v2"
    });
    applyAuthorityOperatorRequest({ dbPath, request: first, nowFn });

    const mutator = new Database(dbPath);
    mutator.pragma("foreign_keys = ON");
    mutator.prepare(`
      update main.platform_account_resource_authorities
      set status = 'revoked', updated_at = ?, revoked_at = ?,
          revoked_by = ?, revocation_reason = ?
      where authority_ref = ?
    `).run(
      NOW,
      NOW,
      impossible.revokedBy,
      impossible.revocationReason,
      first.newAuthorityRef
    );
    mutator.prepare(`
      insert into main.platform_account_resource_authorities (
        authority_ref, account_id, resource_request_id, entitlement_id,
        issued_link_id, status, version, previous_authority_ref,
        created_at, updated_at, created_by, reason,
        revoked_at, revoked_by, revocation_reason
      ) values (?, ?, ?, ?, ?, 'active', 2, ?, ?, ?, ?, ?, null, null, null)
    `).run(
      impossible.newAuthorityRef,
      impossible.accountId,
      impossible.resourceRequestId,
      impossible.entitlementId,
      impossible.issuedLinkId,
      impossible.expectedPreviousAuthorityRef,
      NOW,
      NOW,
      impossible.createdBy,
      impossible.reason
    );
    mutator.close();
    const before = authorityRows(dbPath);

    const planned = planAuthorityOperatorRequest({
      dbPath,
      request: impossible,
      nowFn
    });
    assert.equal(planned.classification, "drift");
    assert.equal(planned.databaseChanged, false);
    const applied = applyAuthorityOperatorRequest({
      dbPath,
      request: impossible,
      nowFn
    });
    assert.equal(applied.classification, "drift");
    assert.equal(applied.databaseChanged, false);
    assert.deepEqual(authorityRows(dbPath), before);
  });
});

test("full lineage rejects store-impossible historical transitions", async (t) => {
  const scenarios = [
    {
      name: "adjacent revoke and create timestamps differ",
      history({ firstTarget, secondTarget }) {
        return {
          firstTarget,
          secondTarget,
          firstRevokedAt: LATER,
          secondCreatedAt: "2026-08-08T12:06:00.000Z"
        };
      }
    },
    {
      name: "adjacent historical triads are identical",
      history({ firstTarget }) {
        return { firstTarget, secondTarget: firstTarget };
      }
    },
    {
      name: "historical store-controlled metadata is unsafe",
      history({ firstTarget, secondTarget }) {
        return {
          firstTarget,
          secondTarget,
          firstCreatedBy: "Bearer unsafe_history_value"
        };
      }
    }
  ];

  for (const scenario of scenarios) {
    await t.test(scenario.name, () => withTempDirectory((directory) => {
      const dbPath = join(
        directory,
        `${scenario.name.replaceAll(" ", "-")}.sqlite`
      );
      const database = createFoundation(dbPath);
      seedAccount(database, "account_history_guard");
      const firstTarget = seedResource(database, {
        accountId: "account_history_guard",
        suffix: `${scenario.name.replaceAll(" ", "_")}_v1`
      });
      const secondTarget = seedResource(database, {
        accountId: "account_history_guard",
        suffix: `${scenario.name.replaceAll(" ", "_")}_v2`
      });
      const nextTarget = seedResource(database, {
        accountId: "account_history_guard",
        suffix: `${scenario.name.replaceAll(" ", "_")}_v3`
      });
      insertTwoVersionHistory(database, scenario.history({
        firstTarget,
        secondTarget
      }));
      database.close();
      const request = reassignRequest(
        { newAuthorityRef: "authority_history_v2" },
        nextTarget,
        {
          expectedVersion: 2,
          newAuthorityRef: "authority_history_v3"
        }
      );
      const before = authorityRows(dbPath);

      const planned = planAuthorityOperatorRequest({ dbPath, request, nowFn });
      assert.equal(planned.classification, "drift");
      assert.equal(planned.databaseChanged, false);
      const applied = applyAuthorityOperatorRequest({ dbPath, request, nowFn });
      assert.equal(applied.classification, "drift");
      assert.equal(applied.databaseChanged, false);
      assert.deepEqual(authorityRows(dbPath), before);
    }));
  }
});

test("reassign is exact, preserves every non-Authority table, and replay writes nothing", () => {
  withTempDirectory((directory) => {
    const dbPath = join(directory, "reassign-exact.sqlite");
    const database = createFoundation(dbPath);
    seedAccount(database, "account_reassign_exact");
    const firstTarget = seedResource(database, {
      accountId: "account_reassign_exact",
      suffix: "reassign_exact_a"
    });
    const secondTarget = seedResource(database, {
      accountId: "account_reassign_exact",
      suffix: "reassign_exact_b"
    });
    const firstRequest = assignRequest(firstTarget, {
      newAuthorityRef: "authority_reassign_exact_v1"
    });
    const secondRequest = reassignRequest(firstRequest, secondTarget, {
      newAuthorityRef: "authority_reassign_exact_v2"
    });
    const beforeNonAuthority = nonAuthorityRows(database);
    const schemaVersion = database.pragma("schema_version", { simple: true });
    const userVersion = database.pragma("user_version", { simple: true });
    database.close();

    const first = applyAuthorityOperatorRequest({
      dbPath,
      request: firstRequest,
      nowFn
    });
    assert.equal(first.classification, "applied_exact");
    assert.equal(first.receiptState, "applied");
    assert.equal(first.databaseChanged, true);
    const second = applyAuthorityOperatorRequest({
      dbPath,
      request: secondRequest,
      nowFn
    });
    assert.equal(second.classification, "applied_exact");
    assert.equal(second.receiptState, "applied");
    assert.equal(second.databaseChanged, true);
    assert.deepEqual(authorityRows(dbPath).map((row) => ({
      authority_ref: row.authority_ref,
      status: row.status,
      version: row.version,
      previous_authority_ref: row.previous_authority_ref,
      updated_at: row.updated_at,
      revoked_at: row.revoked_at,
      revoked_by: row.revoked_by,
      revocation_reason: row.revocation_reason
    })), [
      {
        authority_ref: "authority_reassign_exact_v1",
        status: "revoked",
        version: 1,
        previous_authority_ref: null,
        updated_at: NOW,
        revoked_at: NOW,
        revoked_by: "operator_ref",
        revocation_reason: "superseded_for_commerce"
      },
      {
        authority_ref: "authority_reassign_exact_v2",
        status: "active",
        version: 2,
        previous_authority_ref: "authority_reassign_exact_v1",
        updated_at: NOW,
        revoked_at: null,
        revoked_by: null,
        revocation_reason: null
      }
    ]);

    const observer = new Database(dbPath, { readonly: true, fileMustExist: true });
    const beforeReplayVersion = observer.pragma("data_version", { simple: true });
    const beforeReplayRows = authorityRows(dbPath);
    const replay = applyAuthorityOperatorRequest({
      dbPath,
      request: secondRequest,
      nowFn
    });
    assert.equal(replay.classification, "applied_exact");
    assert.equal(replay.receiptState, "apply_refused_already_applied");
    assert.equal(replay.databaseChanged, false);
    assert.equal(
      observer.pragma("data_version", { simple: true }),
      beforeReplayVersion
    );
    observer.close();
    assert.deepEqual(authorityRows(dbPath), beforeReplayRows);

    const readback = new Database(dbPath, { readonly: true, fileMustExist: true });
    try {
      assert.deepEqual(nonAuthorityRows(readback), beforeNonAuthority);
      assert.equal(readback.pragma("schema_version", { simple: true }), schemaVersion);
      assert.equal(readback.pragma("user_version", { simple: true }), userVersion);
    } finally {
      readback.close();
    }
  });
});

test("applied reassign does not require the immutable old target to remain current", () => {
  withTempDirectory((directory) => {
    const dbPath = join(directory, "old-target-later-drift.sqlite");
    const database = createFoundation(dbPath);
    seedAccount(database, "account_old_target");
    const firstTarget = seedResource(database, {
      accountId: "account_old_target",
      suffix: "old_target_a"
    });
    const secondTarget = seedResource(database, {
      accountId: "account_old_target",
      suffix: "old_target_b"
    });
    database.close();
    const first = assignRequest(firstTarget);
    const second = reassignRequest(first, secondTarget);
    applyAuthorityOperatorRequest({ dbPath, request: first, nowFn });
    applyAuthorityOperatorRequest({ dbPath, request: second, nowFn });
    const mutator = new Database(dbPath);
    mutator.prepare(`
      update main.platform_portal_access_requests set status = 'disabled'
      where id = ?
    `).run(firstTarget.resourceRequestId);
    mutator.close();

    assert.equal(planAuthorityOperatorRequest({
      dbPath,
      request: second,
      nowFn
    }).classification, "applied_exact");
  });
});

test("a concurrent version change turns stale request A into deterministic drift", () => {
  withTempDirectory((directory) => {
    const dbPath = join(directory, "concurrent-version.sqlite");
    const database = createFoundation(dbPath);
    seedAccount(database, "account_concurrent");
    const firstTarget = seedResource(database, {
      accountId: "account_concurrent",
      suffix: "concurrent_v1"
    });
    const targetA = seedResource(database, {
      accountId: "account_concurrent",
      suffix: "concurrent_a"
    });
    const targetB = seedResource(database, {
      accountId: "account_concurrent",
      suffix: "concurrent_b"
    });
    database.close();
    const first = assignRequest(firstTarget);
    applyAuthorityOperatorRequest({ dbPath, request: first, nowFn });
    const requestA = reassignRequest(first, targetA, {
      newAuthorityRef: "authority_concurrent_a"
    });
    const requestB = reassignRequest(first, targetB, {
      newAuthorityRef: "authority_concurrent_b"
    });
    assert.equal(planAuthorityOperatorRequest({
      dbPath,
      request: requestA,
      nowFn
    }).classification, "not_applied");
    assert.equal(applyAuthorityOperatorRequest({
      dbPath,
      request: requestB,
      nowFn
    }).classification, "applied_exact");
    const beforeA = authorityRows(dbPath);

    const stale = applyAuthorityOperatorRequest({
      dbPath,
      request: requestA,
      nowFn
    });
    assert.equal(stale.classification, "drift");
    assert.equal(stale.databaseChanged, false);
    assert.deepEqual(authorityRows(dbPath), beforeA);
  });
});

test("readable metadata previous partial extra target and global collision states are drift", async (t) => {
  const scenarios = [
    {
      name: "metadata mismatch",
      prepare(database, target) {
        createAccountResourceAuthorityStore({
          database,
          nowFn,
          idFactory: () => "authority_metadata"
        }).assignAuthority({
          ...target,
          expectedVersion: 0,
          createdBy: "operator_ref",
          reason: "different_reason"
        });
        return assignRequest(target, { newAuthorityRef: "authority_metadata" });
      }
    },
    {
      name: "wrong previous ref",
      prepare(database, target) {
        const first = assignRequest(target, { newAuthorityRef: "authority_actual" });
        database.close();
        applyAuthorityOperatorRequest({
          dbPath: database.name,
          request: first,
          nowFn
        });
        const reopened = new Database(database.name);
        const next = seedResource(reopened, {
          accountId: target.accountId,
          suffix: "wrong_previous_next"
        });
        reopened.close();
        return reassignRequest(first, next, {
          expectedPreviousAuthorityRef: "authority_wrong_previous",
          newAuthorityRef: "authority_wrong_previous_new"
        });
      }
    },
    {
      name: "partial revoke without insert",
      prepare(database, target) {
        const request = assignRequest(target, { newAuthorityRef: "authority_partial" });
        database.close();
        applyAuthorityOperatorRequest({ dbPath: database.name, request, nowFn });
        const reopened = new Database(database.name);
        reopened.prepare(`
          update main.platform_account_resource_authorities
          set status = 'revoked', updated_at = ?, revoked_at = ?,
              revoked_by = 'operator_ref', revocation_reason = 'partial_revoke'
          where authority_ref = ?
        `).run(LATER, LATER, request.newAuthorityRef);
        reopened.close();
        return request;
      }
    },
    {
      name: "extra version",
      prepare(database, target) {
        const first = assignRequest(target, { newAuthorityRef: "authority_extra_v1" });
        const secondTarget = seedResource(database, {
          accountId: target.accountId,
          suffix: "extra_v2"
        });
        const thirdTarget = seedResource(database, {
          accountId: target.accountId,
          suffix: "extra_v3"
        });
        database.close();
        applyAuthorityOperatorRequest({ dbPath: database.name, request: first, nowFn });
        const second = reassignRequest(first, secondTarget, {
          newAuthorityRef: "authority_extra_v2"
        });
        applyAuthorityOperatorRequest({ dbPath: database.name, request: second, nowFn });
        applyAuthorityOperatorRequest({
          dbPath: database.name,
          request: reassignRequest(second, thirdTarget, {
            expectedVersion: 2,
            newAuthorityRef: "authority_extra_v3"
          }),
          nowFn
        });
        return second;
      }
    },
    {
      name: "target drift",
      prepare(database, target) {
        database.prepare(`
          update main.platform_portal_access_requests
          set status = 'disabled' where id = ?
        `).run(target.resourceRequestId);
        return assignRequest(target);
      }
    },
    {
      name: "global ref collision",
      prepare(database, target) {
        seedAccount(database, "account_collision_other");
        const other = seedResource(database, {
          accountId: "account_collision_other",
          suffix: "collision_other"
        });
        createAccountResourceAuthorityStore({
          database,
          nowFn,
          idFactory: () => "authority_global_collision"
        }).assignAuthority({
          ...other,
          expectedVersion: 0,
          createdBy: "operator_ref",
          reason: "other_assignment"
        });
        return assignRequest(target, {
          newAuthorityRef: "authority_global_collision"
        });
      }
    }
  ];

  for (const scenario of scenarios) {
    await t.test(scenario.name, () => withTempDirectory((directory) => {
      const dbPath = join(directory, `${scenario.name.replaceAll(" ", "-")}.sqlite`);
      const database = createFoundation(dbPath);
      seedAccount(database, "account_drift_scenario");
      const target = seedResource(database, {
        accountId: "account_drift_scenario",
        suffix: scenario.name.replaceAll(" ", "_")
      });
      const request = scenario.prepare(database, target);
      if (database.open) database.close();
      const before = authorityRows(dbPath);

      const planned = planAuthorityOperatorRequest({ dbPath, request, nowFn });
      assert.equal(planned.classification, "drift");
      assert.equal(planned.databaseChanged, false);
      assert.deepEqual(authorityRows(dbPath), before);
    }));
  }
});

test("schema drift is deterministic drift while missing malformed and unreadable databases are unknown", () => {
  withTempDirectory((directory) => {
    const target = {
      accountId: "account_database_state",
      resourceRequestId: "request_database_state",
      entitlementId: "entitlement_database_state",
      issuedLinkId: "link_database_state"
    };
    const request = assignRequest(target);
    const missingPath = join(directory, "missing.sqlite");
    const missing = planAuthorityOperatorRequest({ dbPath: missingPath, request, nowFn });
    assertSafeResult(missing);
    assert.equal(missing.classification, "unknown");
    assert.equal(missing.databaseChanged, false);

    const malformedPath = join(directory, "malformed.sqlite");
    writeFileSync(malformedPath, "this is not sqlite");
    const malformed = planAuthorityOperatorRequest({
      dbPath: malformedPath,
      request,
      nowFn
    });
    assert.equal(malformed.classification, "unknown");
    assert.equal(JSON.stringify(malformed).includes(directory), false);

    const unreadable = planAuthorityOperatorRequest({
      dbPath: directory,
      request,
      nowFn
    });
    assert.equal(unreadable.classification, "unknown");

    const driftPath = join(directory, "schema-drift.sqlite");
    const database = createFoundation(driftPath);
    seedAccount(database, target.accountId);
    seedResource(database, {
      accountId: target.accountId,
      suffix: "database_state"
    });
    database.exec("drop trigger account_resource_authorities_delete_deny");
    database.close();
    assert.equal(planAuthorityOperatorRequest({
      dbPath: driftPath,
      request,
      nowFn
    }).classification, "drift");

    assert.throws(() => planAuthorityOperatorRequest({
      dbPath: "relative.sqlite",
      request,
      nowFn
    }), (error) => (
      error?.code === "account_resource_authority_operator_invalid_contract"
    ));
  });
});

test("database paths are fully qualified for POSIX and Windows semantics", () => {
  withTempDirectory((directory) => {
    const request = assignRequest({
      accountId: "account_path_contract",
      resourceRequestId: "request_path_contract",
      entitlementId: "entitlement_path_contract",
      issuedLinkId: "link_path_contract"
    });
    assert.equal(planAuthorityOperatorRequest({
      dbPath: join(directory, "missing-posix.sqlite"),
      request,
      nowFn
    }).classification, "unknown");
    assert.throws(() => planAuthorityOperatorRequest({
      dbPath: "relative-posix.sqlite",
      request,
      nowFn
    }), (error) => (
      error?.code === "account_resource_authority_operator_invalid_contract"
    ));

    const child = spawnSync(process.execPath, [
      "--input-type=module",
      "-e",
      `
        import { pathToFileURL } from "node:url";
        const [servicePath, requestJson, pathsJson] = process.argv.slice(1);
        const service = await import(pathToFileURL(servicePath).href);
        Object.defineProperty(process, "platform", {
          configurable: true,
          value: "win32"
        });
        const request = JSON.parse(requestJson);
        const paths = JSON.parse(pathsJson);
        const outcomes = [];
        for (const [name, dbPath] of paths) {
          try {
            const result = service.planAuthorityOperatorRequest({
              dbPath,
              request,
              nowFn: () => new Date("${NOW}")
            });
            outcomes.push([name, "accepted", result.classification]);
          } catch (error) {
            outcomes.push([name, "rejected", error?.code ?? null]);
          }
        }
        process.stdout.write(JSON.stringify(outcomes));
      `,
      resolve("server/services/platform/account-resource-authority-operator.mjs"),
      JSON.stringify(request),
      JSON.stringify(WINDOWS_PATH_CASES.map(([name, dbPath]) => [name, dbPath]))
    ], { cwd: resolve("."), encoding: "utf8" });
    assert.equal(child.status, 0, child.stderr);
    assert.deepEqual(
      JSON.parse(child.stdout),
      WINDOWS_PATH_CASES.map(([name, _dbPath, expected]) => [name, ...expected])
    );
  });
});

test("two plans are stable and leave bytes rows versions and observer state unchanged", () => {
  withTempDirectory((directory) => {
    const dbPath = join(directory, "repeated-plan.sqlite");
    const database = createFoundation(dbPath);
    seedAccount(database, "account_repeated_plan");
    const target = seedResource(database, {
      accountId: "account_repeated_plan",
      suffix: "repeated_plan"
    });
    database.close();
    const request = assignRequest(target);
    const bytesBefore = readFileSync(dbPath);
    const rowsBefore = authorityRows(dbPath);
    const observer = new Database(dbPath, { readonly: true, fileMustExist: true });
    const dataVersion = observer.pragma("data_version", { simple: true });
    const schemaVersion = observer.pragma("schema_version", { simple: true });
    const userVersion = observer.pragma("user_version", { simple: true });

    const first = planAuthorityOperatorRequest({ dbPath, request, nowFn });
    const second = planAuthorityOperatorRequest({ dbPath, request, nowFn });
    assert.deepEqual(second, first);
    assert.equal(first.classification, "not_applied");
    assert.deepEqual(readFileSync(dbPath), bytesBefore);
    assert.deepEqual(authorityRows(dbPath), rowsBefore);
    assert.equal(observer.pragma("data_version", { simple: true }), dataVersion);
    assert.equal(observer.pragma("schema_version", { simple: true }), schemaVersion);
    assert.equal(observer.pragma("user_version", { simple: true }), userVersion);
    observer.close();
  });
});

test("top-level BEGIN IMMEDIATE contention is unknown and changes nothing", () => {
  withTempDirectory((directory) => {
    const dbPath = join(directory, "apply-contention.sqlite");
    const database = createFoundation(dbPath);
    seedAccount(database, "account_apply_contention");
    const target = seedResource(database, {
      accountId: "account_apply_contention",
      suffix: "apply_contention"
    });
    database.close();
    const blocker = new Database(dbPath, { fileMustExist: true });
    blocker.pragma("busy_timeout = 0");
    blocker.exec("begin immediate");
    try {
      const result = applyAuthorityOperatorRequest({
        dbPath,
        request: assignRequest(target),
        nowFn
      });
      assertSafeResult(result);
      assert.equal(result.classification, "unknown");
      assert.equal(result.databaseChanged, null);
      assert.equal(blocker.prepare(`
        select count(*) from main.platform_account_resource_authorities
      `).pluck().get(), 0);
    } finally {
      blocker.exec("rollback");
      blocker.close();
    }
    assert.deepEqual(authorityRows(dbPath), []);
  });
});
