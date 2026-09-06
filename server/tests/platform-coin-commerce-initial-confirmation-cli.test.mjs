import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";
import Database from "better-sqlite3";
import { createSqliteSubscriptionControlStore } from "../services/platform/subscription-control-db.mjs";
import * as wallet from "../services/platform/coin-wallet-migrations.mjs";
import * as commerce from "../services/platform/coin-commerce-migrations.mjs";

const cli = fileURLToPath(new URL("../../scripts/platform-coin-commerce-initial-confirmation-schema.mjs", import.meta.url));
function run(args) {
  const result = spawnSync(process.execPath, [cli, ...args], { encoding: "utf8", timeout: 30_000 });
  assert.equal(result.error, undefined);
  assert.equal(result.stderr, "");
  return { exit: result.status, output: JSON.parse(result.stdout) };
}
function fixture() {
  const root = mkdtempSync(join(tmpdir(), "initial-confirmation-cli-"));
  const dbPath = join(root, "synthetic.sqlite");
  createSqliteSubscriptionControlStore({ dbPath }).close();
  const database = new Database(dbPath);
  wallet.applyCoinWalletMigrations({ database, expectedMigrationId: wallet.REQUIRED_COIN_WALLET_MIGRATION_ID,
    expectedDdlChecksum: wallet.COIN_WALLET_MIGRATIONS[0].ddlChecksum });
  commerce.applyCoinCommerceMigrations({ database, expectedMigrationId: commerce.REQUIRED_COIN_COMMERCE_MIGRATION_ID,
    expectedDdlChecksum: commerce.COIN_COMMERCE_MIGRATIONS[0].ddlChecksum });
  database.close();
  return { dbPath, root, close() { rmSync(root, { recursive: true, force: true }); } };
}
const digest = (path) => createHash("sha256").update(readFileSync(path)).digest("hex");
const confirmation = () => ["--confirm-migration-id", commerce.REQUIRED_COIN_COMMERCE_INITIAL_CONFIRMATION_MIGRATION_ID,
  "--confirm-ddl-checksum", commerce.COIN_COMMERCE_INITIAL_CONFIRMATION_MIGRATIONS[0].ddlChecksum];

test("initial-confirmation schema CLI rejects malformed invocations without opening a database", () => {
  for (const args of [[], ["--mode", "execute-order"], ["--mode", "apply", "--db-path", "relative.sqlite"],
    ["--mode", "validate", "--mode", "apply"], ["--unsafe", "secret-not-to-output"]]) {
    const result = run(args);
    assert.equal(result.exit, 2);
    assert.equal(result.output.ok, false);
    assert.equal(JSON.stringify(result.output).includes("secret-not-to-output"), false);
  }
});

test("initial-confirmation schema CLI validates, rehearses, explicitly applies and removes unused extension", () => {
  const state = fixture();
  try {
    const before = digest(state.dbPath);
    const baseArgs = ["--db-path", state.dbPath];
    assert.equal(run(["--mode", "validate", ...baseArgs]).exit, 3);
    assert.equal(run(["--mode", "apply", ...baseArgs]).exit, 2);
    assert.equal(digest(state.dbPath), before);
    const dry = run(["--mode", "dry-run", ...baseArgs, "--temp-root", state.root]);
    assert.equal(dry.exit, 0);
    assert.equal(dry.output.sourceChanged, false);
    assert.equal(digest(state.dbPath), before);
    const applied = run(["--mode", "apply", ...baseArgs, ...confirmation()]);
    assert.equal(applied.exit, 0);
    assert.equal(applied.output.sourceChanged, true);
    assert.equal(run(["--mode", "validate", ...baseArgs]).exit, 0);
    const replay = run(["--mode", "apply", ...baseArgs, ...confirmation()]);
    assert.equal(replay.exit, 0);
    assert.equal(replay.output.sourceChanged, false);
    const removed = run(["--mode", "remove-unused", ...baseArgs, ...confirmation()]);
    assert.equal(removed.exit, 0);
    assert.equal(removed.output.sourceChanged, true);
    const db = new Database(state.dbPath, { readonly: true });
    try { assert.equal(commerce.inspectCoinCommerceSchema({ database: db }).ok, true); } finally { db.close(); }
    for (const result of [dry, applied, removed]) {
      assert.equal(JSON.stringify(result.output).includes(state.dbPath), false);
      assert.equal(result.output.redacted, true);
    }
  } finally { state.close(); }
});

test("initial-confirmation schema CLI rejects mismatched migration proof without source mutation", () => {
  const state = fixture();
  try {
    const before = digest(state.dbPath);
    const args = ["--mode", "apply", "--db-path", state.dbPath, ...confirmation()];
    args[args.length - 1] = "a".repeat(64);
    assert.equal(run(args).exit, 2);
    assert.equal(digest(state.dbPath), before);
  } finally { state.close(); }
});
