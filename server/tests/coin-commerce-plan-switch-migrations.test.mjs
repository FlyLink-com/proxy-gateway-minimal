import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs, { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { syncBuiltinESMExports } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import Database from "better-sqlite3";

import {
  COIN_COMMERCE_MIGRATIONS,
  REQUIRED_COIN_COMMERCE_MIGRATION_ID,
  applyCoinCommerceMigrations,
  inspectCoinCommerceSchema
} from "../services/platform/coin-commerce-migrations.mjs";
import {
  COIN_WALLET_MIGRATIONS,
  REQUIRED_COIN_WALLET_MIGRATION_ID,
  applyCoinWalletMigrations
} from "../services/platform/coin-wallet-migrations.mjs";
import {
  PLAN_SWITCH_MIGRATIONS,
  PLAN_SWITCH_SCHEMA_ROLLBACK_STATEMENTS,
  REQUIRED_PLAN_SWITCH_MIGRATION_ID,
  applyPlanSwitchMigrations,
  dryRunPlanSwitchMigrations,
  rollbackPlanSwitchMigrations,
  validatePlanSwitchSchema
} from "../services/platform/coin-commerce-plan-switch-migrations.mjs";
import { runPlanSwitchSchemaCli } from "../../scripts/platform-coin-commerce-plan-switch-schema.mjs";

const APPLIED_AT = "2026-10-10T00:00:00.000Z";
const LATER = "2026-10-11T00:00:00.000Z";

function withTempDirectory(action) {
  const directory = mkdtempSync(join(tmpdir(), "plan-switch-schema-"));
  try {
    return action(directory);
  } finally {
    rmSync(directory, { recursive: true, force: true, maxRetries: 3 });
  }
}

async function withTempDirectoryAsync(action) {
  const directory = mkdtempSync(join(tmpdir(), "plan-switch-schema-"));
  try {
    return await action(directory);
  } finally {
    rmSync(directory, { recursive: true, force: true, maxRetries: 3 });
  }
}

function createCommerceDatabase(dbPath) {
  const database = new Database(dbPath);
  database.exec(`
    create table platform_accounts (
      id text primary key,
      owner_ref text not null,
      status text not null,
      created_at text not null,
      updated_at text not null,
      metadata_json text not null default '{}'
    );
  `);
  database.close();
  applyCoinWalletMigrations({
    dbPath,
    expectedMigrationId: REQUIRED_COIN_WALLET_MIGRATION_ID,
    expectedDdlChecksum: COIN_WALLET_MIGRATIONS[0].ddlChecksum,
    nowFn: () => new Date(APPLIED_AT)
  });
  applyCoinCommerceMigrations({
    dbPath,
    expectedMigrationId: REQUIRED_COIN_COMMERCE_MIGRATION_ID,
    expectedDdlChecksum: COIN_COMMERCE_MIGRATIONS[0].ddlChecksum,
    nowFn: () => new Date(APPLIED_AT)
  });
}

// Observe the public dry-run path without exporting its private hash helper.
// These tests are sequential; builtin bindings are restored before returning.
async function withObservedFileHash(dbPath, options, action) {
  const original = {
    openSync: fs.openSync, readSync: fs.readSync, closeSync: fs.closeSync,
    readFileSync: fs.readFileSync, createHash: crypto.createHash
  };
  const observed = { descriptors: [], closed: [], requests: [], bytes: 0, digests: [] };
  let readCalls = 0;
  try {
    fs.openSync = (path, ...args) => {
      const descriptor = original.openSync(path, ...args);
      if (path === dbPath) observed.descriptors.push(descriptor);
      return descriptor;
    };
    fs.readSync = (descriptor, buffer, offset, length, position) => {
      if (observed.descriptors.includes(descriptor)) {
        readCalls += 1;
        observed.requests.push(length);
        if (readCalls === options.failReadAt) throw options.error;
        const count = original.readSync(descriptor, buffer, offset,
          Math.min(length, options.shortReadBytes ?? length), position);
        observed.bytes += count;
        return count;
      }
      return original.readSync(descriptor, buffer, offset, length, position);
    };
    fs.closeSync = (descriptor) => {
      const result = original.closeSync(descriptor);
      if (observed.descriptors.includes(descriptor)) observed.closed.push(descriptor);
      return result;
    };
    fs.readFileSync = (path, ...args) => {
      assert.notEqual(path, dbPath, "source digest must not buffer the whole database");
      return original.readFileSync(path, ...args);
    };
    crypto.createHash = (...args) => {
      const hash = original.createHash(...args);
      const digest = hash.digest.bind(hash);
      hash.digest = (...digestArgs) => {
        if (options.failDigest) throw options.error;
        const result = digest(...digestArgs);
        observed.digests.push(result);
        return result;
      };
      return hash;
    };
    syncBuiltinESMExports();
    return await action(observed);
  } finally {
    fs.openSync = original.openSync;
    fs.readSync = original.readSync;
    fs.closeSync = original.closeSync;
    fs.readFileSync = original.readFileSync;
    crypto.createHash = original.createHash;
    syncBuiltinESMExports();
  }
}

test("dry-run source digest matches SHA-256 at empty, short, exact-block and tail boundaries", async () => {
  await withTempDirectoryAsync(async (directory) => {
    for (const size of [0, 1, 65535, 65536, 65537, 2 * 65536 + 17]) {
      const dbPath = join(directory, `synthetic-bytes-${size}.sqlite`);
      const bytes = Buffer.alloc(size);
      for (let index = 0; index < bytes.length; index += 1) bytes[index] = index % 251;
      fs.writeFileSync(dbPath, bytes);
      const expected = crypto.createHash("sha256").update(bytes).digest("hex");
      const { default: Database } = await import("better-sqlite3");
      const originalPragma = Database.prototype.pragma;
      Database.prototype.pragma = function pragma(source, ...args) {
        if (typeof source === "string" && source.trim().toLowerCase() === "data_version") {
          return [{ data_version: 1 }];
        }
        return originalPragma.call(this, source, ...args);
      };
      try {
        await withObservedFileHash(dbPath, {}, async (observed) => {
          // Arbitrary boundary bytes are intentionally not a commerce SQLite DB.
          // The first source hash must complete before the schema admission fails.
          await assert.rejects(dryRunPlanSwitchMigrations({ dbPath, tempRoot: directory }));
          assert.deepEqual(observed.digests, [expected]);
          assert.equal(observed.bytes, size);
          assert.ok(observed.requests.length >= 1);
          assert.ok(observed.requests.every((length) => length > 0 && length <= 65536));
          assert.deepEqual(observed.closed, observed.descriptors);
          assert.equal(observed.descriptors.length, 1);
        });
      } finally {
        Database.prototype.pragma = originalPragma;
      }
    }
  });
});

test("dry-run hashes an unchanged real SQLite source twice and handles short reads", async () => {
  await withTempDirectoryAsync(async (directory) => {
    const dbPath = join(directory, "control.sqlite");
    createCommerceDatabase(dbPath);
    const source = new Database(dbPath);
    source.exec("create table synthetic_hash_tail (payload blob)");
    source.prepare("insert into synthetic_hash_tail values (?)").run(Buffer.alloc(2 * 65536 + 17, 0x73));
    source.close();
    const before = readFileSync(dbPath);
    const expected = crypto.createHash("sha256").update(before).digest("hex");
    await withObservedFileHash(dbPath, { shortReadBytes: 997 }, async (observed) => {
      const result = await dryRunPlanSwitchMigrations({ dbPath, tempRoot: directory });
      assert.equal(result.ok, true);
      assert.equal(result.sourceChanged, false);
      assert.deepEqual(observed.digests, [expected, expected]);
      assert.equal(observed.bytes, 2 * before.length);
      assert.ok(observed.requests.every((length) => length <= 65536));
      assert.deepEqual(observed.closed, observed.descriptors);
      assert.equal(observed.descriptors.length, 2);
    });
    assert.deepEqual(readFileSync(dbPath), before);
    assert.equal(validatePlanSwitchSchema({ dbPath }).schemaState, "pending");
  });
});

test("dry-run closes the digest file descriptor after read or digest failure", async () => {
  await withTempDirectoryAsync(async (directory) => {
    const dbPath = join(directory, "control.sqlite");
    createCommerceDatabase(dbPath);
    const expected = readFileSync(dbPath);
    for (const fault of [{ failReadAt: 2 }, { failDigest: true }]) {
      const error = Object.assign(new Error("synthetic file hash failure"), { code: "EIO" });
      await withObservedFileHash(dbPath, { ...fault, error }, async (observed) => {
        await assert.rejects(dryRunPlanSwitchMigrations({ dbPath, tempRoot: directory }),
          (caught) => caught === error);
        assert.equal(observed.descriptors.length, 1);
        assert.deepEqual(observed.closed, observed.descriptors);
        assert.throws(() => fs.fstatSync(observed.descriptors[0]),
          (caught) => caught?.code === "EBADF");
      });
      assert.deepEqual(fs.readdirSync(directory), ["control.sqlite"]);
      assert.deepEqual(readFileSync(dbPath), expected);
    }
  });
});

function applyInput(dbPath, database) {
  return {
    dbPath,
    database,
    expectedMigrationId: REQUIRED_PLAN_SWITCH_MIGRATION_ID,
    expectedDdlChecksum: PLAN_SWITCH_MIGRATIONS[0].ddlChecksum,
    nowFn: () => new Date(APPLIED_AT)
  };
}

function insertOrder(database, suffix, paymentStatus = "captured") {
  const orderRef = `order_${suffix}`;
  const accountId = `account_${suffix}`;
  const quoteRef = `quote_${suffix}`;
  database.transaction(() => {
    database.prepare(`
      insert into platform_accounts (
        id, owner_ref, status, created_at, updated_at, metadata_json
      ) values (?, ?, 'active', ?, ?, '{}')
    `).run(accountId, `owner_${suffix}`, APPLIED_AT, APPLIED_AT);
    database.prepare(`
      insert into platform_coin_wallets (
        wallet_ref, account_id, status, version, created_at, updated_at
      ) values (?, ?, 'active', 0, ?, ?)
    `).run(`wallet_${suffix}`, accountId, APPLIED_AT, APPLIED_AT);
    database.prepare(`
      insert into platform_coin_commerce_offer_versions (
        offer_version_ref, offer_ref, version, status, category,
        title_zh, title_en, summary_zh, summary_en,
        important_notices_zh_json, important_notices_en_json,
        base_coin_units, reference_currency, reference_amount_minor,
        accepted_coin_types_json, delivery_kind, duration_days,
        monthly_traffic_gb, traffic_gb, never_expires,
        discount_basis_points, created_at, published_at, retired_at
      ) values (
        ?, ?, 1, 'published', 'plan',
        '合成方案', 'Synthetic plan', '合成测试', 'Synthetic test',
        '["合成测试"]', '["Synthetic test"]',
        20, 'CNY', 2000, '["paid_coins"]',
        'subscription_plan', 30, 50, null, 0, 0, ?, ?, null
      )
    `).run(`offerv_${suffix}`, `offer_${suffix}`, APPLIED_AT, APPLIED_AT);
    database.prepare(`
      insert into platform_coin_commerce_quotes (
        quote_ref, account_id, offer_version_ref, wallet_version,
        amount_units, applied_discount_basis_points,
        purchase_availability, shortfall_units, allocation_json,
        before_balance_json, after_balance_json, status,
        created_at, expires_at, consumed_at
      ) values (
        ?, ?, ?, 0, 20, 0, 'available', 0, '[]',
        '{}', '{}', 'consumed', ?, ?, ?
      )
    `).run(
      quoteRef,
      accountId,
      `offerv_${suffix}`,
      APPLIED_AT,
      LATER,
      APPLIED_AT
    );
    database.prepare(`
      insert into platform_coin_holds (
        hold_ref, wallet_ref, purpose, purpose_ref, amount_units,
        status, expires_at, created_at, updated_at
      ) values (?, ?, 'product_purchase', ?, 20, 'captured', ?, ?, ?)
    `).run(
      `hold_${suffix}`,
      `wallet_${suffix}`,
      orderRef,
      LATER,
      APPLIED_AT,
      APPLIED_AT
    );
    database.prepare(`
      insert into platform_coin_commerce_orders (
        order_ref, account_id, quote_ref, offer_version_ref, hold_ref,
        amount_units, offer_snapshot_json, allocation_snapshot_json,
        payment_status, cancel_until, created_at, updated_at
      ) values (?, ?, ?, ?, ?, 20, '{}', '[]', ?, ?, ?, ?)
    `).run(
      orderRef,
      accountId,
      quoteRef,
      `offerv_${suffix}`,
      `hold_${suffix}`,
      paymentStatus,
      LATER,
      APPLIED_AT,
      APPLIED_AT
    );
  })();
  return { orderRef, accountId, quoteRef };
}

function insertSwitchQuote(database, {
  quoteRef,
  accountId,
  kind = "renewal",
  fromRef = "offerv_plan_30d_100gb_monthly_v1",
  toRef = "offerv_plan_30d_100gb_monthly_v1",
  cancels = null,
  effectiveAt = null,
  charge = 30
}) {
  database.prepare(`
    insert into platform_coin_commerce_plan_switch_quotes (
      quote_ref, account_id, entitlement_id, kind,
      from_offer_version_ref, to_offer_version_ref,
      snapshot_valid_from, snapshot_valid_until,
      list_price_units, credit_units, pending_credit_units, charge_units,
      cancels_switch_ref, effective_at, created_at
    ) values (?, ?, 'ent_switch', ?, ?, ?, ?, ?, ?, 0, 0, ?, ?, ?, ?)
  `).run(
    quoteRef,
    accountId,
    kind,
    fromRef,
    toRef,
    APPLIED_AT,
    LATER,
    charge,
    charge,
    cancels,
    effectiveAt,
    APPLIED_AT
  );
}

function insertScheduled(database, {
  switchRef,
  accountId,
  fromRef = "offerv_plan_30d_100gb_monthly_v1",
  toRef = "offerv_plan_30d_50gb_monthly_v1"
}) {
  database.prepare(`
    insert into platform_scheduled_plan_switches (
      switch_ref, account_id, entitlement_id,
      from_offer_version_ref, to_offer_version_ref,
      effective_at, paid_units, status, created_at, resolved_at,
      superseded_by_order_ref
    ) values (?, ?, 'ent_switch', ?, ?, ?, 20, 'scheduled', ?, null, null)
  `).run(switchRef, accountId, fromRef, toRef, LATER, APPLIED_AT);
}

test("plan switch schema applies, validates, and re-applies without change", () => {
  withTempDirectory((directory) => {
    const dbPath = join(directory, "control.sqlite");
    createCommerceDatabase(dbPath);
    const pending = validatePlanSwitchSchema({ dbPath });
    assert.equal(pending.ok, false);
    assert.equal(pending.schemaState, "pending");
    assert.deepEqual(pending.pendingMigrationIds, [
      REQUIRED_PLAN_SWITCH_MIGRATION_ID
    ]);
    const applied = applyPlanSwitchMigrations(applyInput(dbPath));
    assert.equal(applied.ok, true);
    assert.equal(applied.sourceChanged, true);
    const commerce = new Database(dbPath, { readonly: true });
    try {
      assert.equal(inspectCoinCommerceSchema({ database: commerce }).ok, true);
    } finally {
      commerce.close();
    }
    assert.deepEqual(applied.appliedMigrationIds, [
      REQUIRED_PLAN_SWITCH_MIGRATION_ID
    ]);
    const ready = validatePlanSwitchSchema({ dbPath });
    assert.equal(ready.ok, true);
    assert.equal(ready.schemaState, "ready");
    assert.equal(ready.checks.commerceDependency, true);
    assert.equal(ready.checks.schemaExact, true);
    assert.equal(ready.checks.rollbackSafe, true);
    const again = applyPlanSwitchMigrations(applyInput(dbPath));
    assert.equal(again.ok, true);
    assert.equal(again.sourceChanged, false);
    assert.deepEqual(again.appliedMigrationIds, []);
  });
});

test("quote rows are immutable and a second scheduled switch is rejected", () => {
  withTempDirectory((directory) => {
    const dbPath = join(directory, "control.sqlite");
    createCommerceDatabase(dbPath);
    applyPlanSwitchMigrations(applyInput(dbPath));
    const database = new Database(dbPath);
    database.pragma("foreign_keys = ON");
    try {
      const first = insertOrder(database, "alpha");
      assert.throws(
        () => insertSwitchQuote(database, {
          quoteRef: first.quoteRef,
          accountId: first.accountId,
          cancels: "switch_missing"
        }),
        (error) => String(error?.message).includes(
          "plan_switch_quote_cancel_ref_invalid"
        )
      );
      insertSwitchQuote(database, {
        quoteRef: first.quoteRef,
        accountId: first.accountId
      });
      assert.throws(
        () => database.prepare(`
          update platform_coin_commerce_plan_switch_quotes
             set charge_units = 1
           where quote_ref = ?
        `).run(first.quoteRef),
        (error) => String(error?.message).includes("plan_switch_quote_update_denied")
      );
      assert.throws(
        () => database.prepare(`
          delete from platform_coin_commerce_plan_switch_quotes
           where quote_ref = ?
        `).run(first.quoteRef),
        (error) => String(error?.message).includes("plan_switch_quote_delete_denied")
      );
      insertScheduled(database, {
        switchRef: first.orderRef,
        accountId: first.accountId
      });
      const second = insertOrder(database, "beta");
      assert.throws(
        () => insertScheduled(database, {
          switchRef: second.orderRef,
          accountId: first.accountId
        }),
        (error) => /unique|constraint/i.test(String(error?.message))
      );
      insertScheduled(database, {
        switchRef: second.orderRef,
        accountId: second.accountId
      });
      assert.throws(
        () => database.prepare(`
          update platform_scheduled_plan_switches
             set paid_units = 1, status = 'applied', resolved_at = ?
           where switch_ref = ?
        `).run(LATER, first.orderRef),
        (error) => String(error?.message).includes("plan_switch_status_transition_denied")
      );
      database.prepare(`
        update platform_scheduled_plan_switches set status = 'applying' where switch_ref = ?
      `).run(first.orderRef);
      assert.throws(() => insertScheduled(database, {
        switchRef: second.orderRef, accountId: first.accountId
      }), /unique|constraint/i);
      database.prepare(`
        update platform_scheduled_plan_switches
           set status = 'applied', resolved_at = ?
         where switch_ref = ?
      `).run(LATER, first.orderRef);
      assert.equal(database.prepare(`
        select status from platform_scheduled_plan_switches where switch_ref = ?
      `).pluck().get(first.orderRef), "applied");
      assert.throws(
        () => database.prepare(`
          delete from platform_scheduled_plan_switches where switch_ref = ?
        `).run(second.orderRef),
        (error) => String(error?.message).includes("plan_switch_delete_denied")
      );
      assert.throws(
        () => database.prepare(`
          insert into platform_scheduled_plan_switches (
            switch_ref, account_id, entitlement_id,
            from_offer_version_ref, to_offer_version_ref,
            effective_at, paid_units, status, created_at, resolved_at,
            superseded_by_order_ref
          ) values (?, ?, 'ent_switch', ?, ?, ?, 20, 'applied', ?, ?, null)
        `).run(
          second.orderRef,
          second.accountId,
          "offerv_plan_30d_100gb_monthly_v1",
          "offerv_plan_30d_50gb_monthly_v1",
          LATER,
          APPLIED_AT,
          LATER
        ),
        (error) => String(error?.message).includes("plan_switch_insert_state_invalid")
          || /unique|constraint/i.test(String(error?.message))
      );
    } finally {
      database.close();
    }
  });
});

test("rollback text matches the design doc and refuses an open scheduled row", async () => {
  const doc = readFileSync(
    new URL("../../docs/MONTHLY_CARD_PLAN_SWITCH.md", import.meta.url),
    "utf8"
  );
  for (const statement of PLAN_SWITCH_SCHEMA_ROLLBACK_STATEMENTS) {
    assert.equal(doc.includes(statement), true, statement);
  }
  await withTempDirectoryAsync(async (directory) => {
    const dbPath = join(directory, "control.sqlite");
    createCommerceDatabase(dbPath);
    const dry = await dryRunPlanSwitchMigrations({ dbPath });
    assert.equal(dry.ok, true);
    assert.equal(dry.sourceChanged, false);
    assert.equal(validatePlanSwitchSchema({ dbPath }).schemaState, "pending");
    applyPlanSwitchMigrations(applyInput(dbPath));
    const database = new Database(dbPath);
    database.pragma("foreign_keys = ON");
    const order = insertOrder(database, "gamma");
    insertScheduled(database, {
      switchRef: order.orderRef,
      accountId: order.accountId
    });
    database.close();
    assert.throws(
      () => rollbackPlanSwitchMigrations(applyInput(dbPath)),
      (error) => error?.code === "plan_switch_rollback_rows_present"
    );
    const open = new Database(dbPath);
    open.pragma("foreign_keys = ON");
    open.prepare("update platform_scheduled_plan_switches set status = 'applying' where switch_ref = ?").run(order.orderRef);
    assert.equal(validatePlanSwitchSchema({ dbPath }).counts.scheduledRows, 1);
    assert.throws(() => rollbackPlanSwitchMigrations(applyInput(dbPath)),
      (error) => error?.code === "plan_switch_rollback_rows_present");
    open.prepare(`
      update platform_scheduled_plan_switches
         set status = 'applied', resolved_at = ?
       where switch_ref = ?
    `).run(LATER, order.orderRef);
    open.close();
    const removed = rollbackPlanSwitchMigrations(applyInput(dbPath));
    assert.equal(removed.schemaState, "pending");
    assert.deepEqual(removed.removedMigrationIds, [
      REQUIRED_PLAN_SWITCH_MIGRATION_ID
    ]);
    assert.equal(validatePlanSwitchSchema({ dbPath }).ok, false);
    const restored = applyPlanSwitchMigrations(applyInput(dbPath));
    assert.equal(restored.ok, true);
    assert.equal(restored.sourceChanged, true);
  });
});

test("schema CLI validates a temp database and rejects a missing confirmation", async () => {
  await withTempDirectoryAsync(async (directory) => {
    const dbPath = join(directory, "control.sqlite");
    createCommerceDatabase(dbPath);
    applyPlanSwitchMigrations(applyInput(dbPath));
    const validated = await runPlanSwitchSchemaCli({
      argv: ["--mode", "validate", "--db-path", dbPath]
    });
    assert.equal(validated.exitCode, 0);
    assert.equal(validated.output.ok, true);
    assert.equal(validated.output.schemaState, "ready");
    const missing = await runPlanSwitchSchemaCli({
      argv: ["--mode", "apply", "--db-path", dbPath]
    });
    assert.equal(missing.exitCode, 2);
    assert.equal(missing.output.reasonCodes[0], "apply_confirmation_required");
  });
});
