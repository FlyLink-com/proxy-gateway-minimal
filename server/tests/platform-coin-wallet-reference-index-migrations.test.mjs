import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";

import * as walletFoundation from "../services/platform/coin-wallet-migrations.mjs";
import {
  COIN_WALLET_REFERENCE_INDEX_MIGRATIONS,
  REQUIRED_COIN_WALLET_REFERENCE_INDEX_MIGRATION_ID
} from "../services/platform/coin-wallet-reference-index-migrations.mjs";

const FOUNDATION_CHECKSUM =
  "03422fd22ae8047aea8374ed0e34ebaaf8663c90c24d7bbefef11d66498b02e7";
const SUCCESSOR_CHECKSUM =
  "2d8a0122a5a9078e9d6422f5230b03ae54789d50d0252485a29766dd3ab71d2b";

test("exports one frozen successor identity without changing the foundation namespace", () => {
  assert.deepEqual(Object.keys(walletFoundation).sort(), [
    "COIN_WALLET_MIGRATIONS",
    "REQUIRED_COIN_WALLET_MIGRATION_ID",
    "applyCoinWalletMigrations",
    "dryRunCoinWalletMigrations",
    "inspectCoinWalletSchema",
    "validateCoinWalletSchema"
  ]);
  assert.equal(walletFoundation.REQUIRED_COIN_WALLET_MIGRATION_ID,
    "20260723_001_coin_wallet_foundation");
  assert.equal(walletFoundation.COIN_WALLET_MIGRATIONS[0].ddlChecksum,
    FOUNDATION_CHECKSUM);
  assert.equal(REQUIRED_COIN_WALLET_REFERENCE_INDEX_MIGRATION_ID,
    "20260730_001_coin_wallet_reference_indexes");
  assert.deepEqual(COIN_WALLET_REFERENCE_INDEX_MIGRATIONS, [{
    id: REQUIRED_COIN_WALLET_REFERENCE_INDEX_MIGRATION_ID,
    ddlChecksum: SUCCESSOR_CHECKSUM
  }]);
  assert.equal(Object.isFrozen(COIN_WALLET_REFERENCE_INDEX_MIGRATIONS), true);
  assert.equal(Object.isFrozen(COIN_WALLET_REFERENCE_INDEX_MIGRATIONS[0]), true);
});

test("importing the successor module has no database or filesystem side effect", () => {
  const directory = mkdtempSync(join(tmpdir(), "wallet-reference-import-"));
  try {
    const moduleUrl = pathToFileURL(
      join(process.cwd(), "server", "services", "platform",
        "coin-wallet-reference-index-migrations.mjs")
    ).href;
    const result = spawnSync(process.execPath, [
      "--input-type=module",
      "--eval",
      `await import(${JSON.stringify(moduleUrl)})`
    ], {
      cwd: directory,
      encoding: "utf8",
      env: {},
      windowsHide: true
    });
    assert.equal(result.status, 0);
    assert.equal(result.stdout, "");
    assert.equal(result.stderr, "");
    assert.deepEqual(readdirSync(directory), []);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
