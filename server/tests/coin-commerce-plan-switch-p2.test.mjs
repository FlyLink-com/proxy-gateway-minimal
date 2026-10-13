import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';
import {
  applyCoinWalletMigrations,
  COIN_WALLET_MIGRATIONS,
  REQUIRED_COIN_WALLET_MIGRATION_ID,
} from '../services/platform/coin-wallet-migrations.mjs';
import {
  applyCoinCommerceMigrations,
  COIN_COMMERCE_MIGRATIONS,
  REQUIRED_COIN_COMMERCE_MIGRATION_ID,
} from '../services/platform/coin-commerce-migrations.mjs';
import {
  applyPlanSwitchMigrations,
  dryRunPlanSwitchMigrations,
  PLAN_SWITCH_MIGRATIONS,
  REQUIRED_PLAN_SWITCH_MIGRATION_ID,
} from '../services/platform/coin-commerce-plan-switch-migrations.mjs';

const PLAN_SWITCH_DDL_CHECKSUM = 'c704e39b50d0acfba16076f8636f156e1fc749f26d8134550ac67a62167e0384';
const SCHEMA_CLI = fileURLToPath(new URL('../../scripts/platform-coin-commerce-schema.mjs', import.meta.url));

function childEnv() {
  const env = {};
  for (const key of ['PATH', 'SystemRoot', 'WINDIR', 'TEMP', 'TMP', 'LANG', 'TZ']) {
    if (process.env[key] != null && process.env[key] !== '') env[key] = process.env[key];
  }
  return env;
}

function makeTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'plan-p2-'));
}

function removeTempDir(dir) {
  fs.rmSync(dir, { recursive: true, force: true });
}

function createSyntheticCommerceDb(dir) {
  const dbPath = path.join(dir, 'commerce.sqlite');
  const db = new Database(dbPath);
  try {
    db.exec(`CREATE TABLE platform_accounts (
    id text primary key,
    owner_ref text not null,
    status text not null,
    created_at text not null,
    updated_at text not null,
    metadata_json text not null default '{}'
  )`);
  } finally {
    db.close();
  }
  applyCoinWalletMigrations({
    dbPath,
    expectedMigrationId: REQUIRED_COIN_WALLET_MIGRATION_ID,
    expectedDdlChecksum: COIN_WALLET_MIGRATIONS[0].ddlChecksum,
  });
  applyCoinCommerceMigrations({
    dbPath,
    expectedMigrationId: REQUIRED_COIN_COMMERCE_MIGRATION_ID,
    expectedDdlChecksum: COIN_COMMERCE_MIGRATIONS[0].ddlChecksum,
  });
  return dbPath;
}

function applyValidPlan(dbPath) {
  return applyPlanSwitchMigrations({
    dbPath,
    expectedMigrationId: REQUIRED_PLAN_SWITCH_MIGRATION_ID,
    expectedDdlChecksum: PLAN_SWITCH_MIGRATIONS[0].ddlChecksum,
  });
}

function runSchemaValidate(dbPath) {
  const result = spawnSync(process.execPath, [
    SCHEMA_CLI,
    '--mode',
    'validate',
    '--db-path',
    dbPath,
  ], {
    env: childEnv(),
    shell: false,
    timeout: 10_000,
    maxBuffer: 64 * 1024,
    encoding: 'utf8',
  });
  assert.equal(result.error ?? undefined, undefined);
  assert.equal(result.stderr, '');
  const payload = JSON.parse(result.stdout);
  return { result, payload };
}

function assertValidateExact(dbPath) {
  const { result, payload } = runSchemaValidate(dbPath);
  assert.equal(result.status, 0);
  assert.equal(payload.ok, true);
  assert.equal(payload.checks.schemaExact, true);
  return payload;
}

function assertCommerceOwnedRejected(dbPath) {
  const { result, payload } = runSchemaValidate(dbPath);
  assert.equal(result.status, 3);
  assert.equal(payload.ok, false);
  assert.equal(payload.checks.schemaExact, false);
  assert.equal(result.stdout.includes('commerce_owned_object_incompatible'), true);
}

function sha256File(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function walPath(dbPath) {
  return `${dbPath}-wal`;
}

function walByteLength(dbPath) {
  const sidecar = walPath(dbPath);
  if (!fs.existsSync(sidecar)) return 0;
  return fs.statSync(sidecar).size;
}

function counterValue(db) {
  return db.prepare('select value from synthetic_p2_counter').get().value;
}

function openWalWriter(dbPath) {
  const writer = new Database(dbPath);
  writer.pragma('journal_mode = WAL');
  writer.pragma('wal_autocheckpoint = 0');
  writer.exec(`create table synthetic_p2_counter(value integer not null);
insert into synthetic_p2_counter values(0)`);
  writer.pragma('wal_checkpoint(TRUNCATE)');
  return writer;
}

async function runWalMode(mode) {
  const dir = makeTempDir();
  const originalBackup = Database.prototype.backup;
  let writer = null;
  let hookCalls = 0;
  let dbPath;
  const mutate = mode !== 'unchanged';
  const checkpoint = mode === 'checkpoint';
  try {
    dbPath = createSyntheticCommerceDb(dir);
    writer = openWalWriter(dbPath);
    if (mode === 'absent-wal') {
      writer.close();
      writer = null;
      assert.equal(fs.existsSync(walPath(dbPath)), false);
    }
    const mainBefore = sha256File(dbPath);
    Database.prototype.backup = async function patchedBackup(...args) {
      const backupResult = await originalBackup.apply(this, args);
      hookCalls += 1;
      if (mutate) {
        if (!writer) {
          writer = new Database(dbPath);
          writer.pragma('wal_autocheckpoint = 0');
        }
        writer.prepare('update synthetic_p2_counter set value = value + 1').run();
        if (checkpoint) writer.pragma('wal_checkpoint(TRUNCATE)');
      }
      return backupResult;
    };
    let outcome;
    let thrown;
    try {
      outcome = await dryRunPlanSwitchMigrations({
        dbPath,
        tempRoot: dir,
      });
    } catch (error) {
      thrown = error;
    }
    assert.equal(hookCalls, 1);
    assert.equal(counterValue(writer), mutate ? 1 : 0);
    if (mode === 'unchanged') {
      assert.equal(thrown ?? undefined, undefined);
      assert.equal(outcome.ok, true);
      assert.equal(outcome.sourceChanged, false);
      assert.equal(sha256File(dbPath), mainBefore);
    } else if (mode === 'wal-commit' || mode === 'absent-wal') {
      assert.equal(sha256File(dbPath), mainBefore);
      assert.equal(walByteLength(dbPath) > 0, true);
      assert.ok(thrown);
      assert.equal(thrown.code, 'plan_switch_source_changed_during_dry_run');
    } else {
      assert.equal(walByteLength(dbPath), 0);
      assert.ok(thrown);
      assert.equal(thrown.code, 'plan_switch_source_changed_during_dry_run');
    }
  } finally {
    Database.prototype.backup = originalBackup;
    if (writer) writer.close();
    removeTempDir(dir);
  }
}

test('plan checksum and fresh schema CLI stay exact before and after plan apply', () => {
  assert.equal(PLAN_SWITCH_MIGRATIONS[0].ddlChecksum, PLAN_SWITCH_DDL_CHECKSUM);
  const dir = makeTempDir();
  try {
    const dbPath = createSyntheticCommerceDb(dir);
    assertValidateExact(dbPath);
    applyValidPlan(dbPath);
    assertValidateExact(dbPath);
  } finally {
    removeTempDir(dir);
  }
});

test('replaced plan-switch quote update trigger is commerce-owned incompatible', () => {
  const dir = makeTempDir();
  let db;
  try {
    const dbPath = createSyntheticCommerceDb(dir);
    applyValidPlan(dbPath);
    db = new Database(dbPath);
    db.exec('drop trigger platform_coin_commerce_plan_switch_quotes_update_deny');
    db.exec(`create trigger platform_coin_commerce_plan_switch_quotes_update_deny
      before update on platform_coin_commerce_plan_switch_quotes
      begin select 1; end`);
    db.close();
    db = null;
    assertCommerceOwnedRejected(dbPath);
  } finally {
    if (db) db.close();
    removeTempDir(dir);
  }
});

test('unexpected commerce table is commerce-owned incompatible', () => {
  const dir = makeTempDir();
  let db;
  try {
    const dbPath = createSyntheticCommerceDb(dir);
    applyValidPlan(dbPath);
    db = new Database(dbPath);
    db.exec('create table platform_coin_commerce_unexpected (id integer)');
    db.close();
    db = null;
    assertCommerceOwnedRejected(dbPath);
  } finally {
    if (db) db.close();
    removeTempDir(dir);
  }
});

test('narrowed plan-switch quote table is commerce-owned incompatible', () => {
  const dir = makeTempDir();
  let db;
  try {
    const dbPath = createSyntheticCommerceDb(dir);
    applyValidPlan(dbPath);
    db = new Database(dbPath);
    db.pragma('foreign_keys = OFF');
    db.exec('drop table platform_scheduled_plan_switches');
    db.exec('drop table platform_coin_commerce_plan_switch_quotes');
    db.exec('create table platform_coin_commerce_plan_switch_quotes (id integer)');
    db.close();
    db = null;
    assertCommerceOwnedRejected(dbPath);
  } finally {
    if (db) db.close();
    removeTempDir(dir);
  }
});

test('dry run reports source unchanged with an idle WAL writer', async () => {
  await runWalMode('unchanged');
});

test('dry run rejects a real WAL commit injected after source backup', async () => {
  await runWalMode('wal-commit');
});

test('dry run rejects a checkpointed WAL commit injected after source backup', async () => {
  await runWalMode('checkpoint');
});

test('dry run rejects a commit that recreates an absent WAL after source backup', async () => {
  await runWalMode('absent-wal');
});
