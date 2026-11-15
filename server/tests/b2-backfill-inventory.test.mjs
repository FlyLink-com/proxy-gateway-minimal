import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";
import {
  B2_BACKFILL_INVENTORY_DIGEST_FIELDS,
  buildB2BackfillInventory
} from "../services/platform/b2-backfill-inventory.mjs";
import { createSqliteSubscriptionControlStore } from "../services/platform/subscription-control-db.mjs";

// B2-a backfill inventory: pure builder over synthetic account rows, plus the
// read-only CLI over a synthetic control database. All emails and digests
// below are synthetic fixtures; nothing here touches production data.

const DIGESTS = {
  contactDigest: "11".repeat(32),
  loginDigest: "22".repeat(32),
  displayDigest: "33".repeat(32),
  useCaseDigest: "44".repeat(32),
  legalAgreementSourceIpDigest: "55".repeat(32),
  legalAgreementRequestKeyDigest: "66".repeat(32),
  registrationSourceIpDigest: "77".repeat(32),
  registrationRequestKeyDigest: "88".repeat(32)
};

function account(id, status, metadata) {
  return { id, status, metadata };
}

test("builder counts totals, bindings, duplicates, mismatches, and digest gaps", () => {
  const accounts = [
    account("a1", "active", {
      ...DIGESTS,
      loginRef: "alice@example.test",
      displayRef: "alice@example.test",
      displayEmailMasked: "al***@example.test"
    }),
    account("a2", "active", {
      ...DIGESTS,
      contactDigest: null,
      loginDigest: "d1",
      loginRef: "bob@example.test",
      displayRef: "bob@example.test"
    }),
    account("a3", "suspended", {
      ...DIGESTS,
      loginDigest: "d1",
      displayDigest: null,
      loginRef: "carol@example.test",
      displayRef: "different@example.test"
    }),
    account("a4", "active", {
      contactDigest: null,
      loginDigest: null,
      displayDigest: null,
      useCaseDigest: null,
      legalAgreementSourceIpDigest: null,
      legalAgreementRequestKeyDigest: null,
      registrationSourceIpDigest: null,
      registrationRequestKeyDigest: null,
      loginRef: "not-an-email",
      displayRef: "not-an-email",
      displayEmailMasked: "user_account"
    }),
    account("a5", "active", {
      ...DIGESTS,
      loginDigest: "d5",
      useCaseDigest: null,
      displayRef: "eve@example.test",
      displayEmailMasked: "ev***@example.test"
    })
  ];
  // a1 carries its own loginDigest (unique); a2/a3 share "d1". Only the
  // shared group is a login-ambiguity candidate.

  const inventory = buildB2BackfillInventory({ accounts, boundAccountIds: ["a1", "a3"] });

  assert.equal(inventory.totalAccounts, 5);
  assert.deepEqual(inventory.statusDistribution, { active: 4, suspended: 1 });
  assert.equal(inventory.accountsWithBindings, 2);
  assert.equal(inventory.accountsWithoutBindings, 3);
  assert.equal(inventory.accountsWithDisplayEmailMasked, 3);
  assert.equal(inventory.accountsWithoutDisplayEmailMasked, 2);
  assert.deepEqual(inventory.duplicateLoginDigestGroups, [
    { loginDigest: "d1", accountIds: ["a2", "a3"], accountCount: 2 }
  ]);
  assert.deepEqual(inventory.loginRefDisplayRefMismatch, { count: 1, accountIds: ["a3"] });
  assert.deepEqual(inventory.nonEmailLoginRefs, { count: 1, accountIds: ["a4"] });
  assert.deepEqual(inventory.accountsMissingLoginRef, { count: 1, accountIds: ["a5"] });
  assert.equal(inventory.digestMissingRates.contactDigest.missing, 2);
  assert.equal(inventory.digestMissingRates.loginDigest.missing, 1);
  assert.equal(inventory.digestMissingRates.displayDigest.missing, 2);
  assert.equal(inventory.digestMissingRates.useCaseDigest.missing, 2);
  assert.equal(inventory.digestMissingRates.legalAgreementSourceIpDigest.missing, 1);
  assert.equal(inventory.digestMissingRates.registrationRequestKeyDigest.missing, 1);
  assert.equal(inventory.digestMissingRates.contactDigest.missingRate, 2 / 5);
  assert.equal(Object.keys(inventory.digestMissingRates).length, 8);
  assert.deepEqual(
    Object.keys(inventory.digestMissingRates).sort(),
    [...B2_BACKFILL_INVENTORY_DIGEST_FIELDS].sort()
  );
  // No raw email leaks into the output: only account ids and digests.
  assert.equal(JSON.stringify(inventory).includes("alice@example.test"), false);
  assert.equal(JSON.stringify(inventory).includes("bob@example.test"), false);
});

test("builder handles an empty account list", () => {
  const inventory = buildB2BackfillInventory({ accounts: [], boundAccountIds: [] });
  assert.equal(inventory.totalAccounts, 0);
  assert.deepEqual(inventory.statusDistribution, {});
  assert.equal(inventory.accountsWithoutBindings, 0);
  assert.deepEqual(inventory.duplicateLoginDigestGroups, []);
  assert.equal(inventory.digestMissingRates.contactDigest.missingRate, 0);
});

const REPOSITORY_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const CLI_PATH = join(REPOSITORY_ROOT, "scripts", "b2-backfill-inventory.mjs");

function sha256File(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

test("CLI reads a synthetic control database read-only and prints the inventory", () => {
  const tempDir = mkdtempSync(join(tmpdir(), "b2-backfill-inventory-"));
  const dbPath = join(tempDir, "control.sqlite");
  try {
    const database = new Database(dbPath);
    const store = createSqliteSubscriptionControlStore({ database });
    try {
      store.createAccount({
        id: "cli_a1",
        ownerRef: "cli_a1",
        status: "active",
        createdAt: "2026-06-03T00:00:00.000Z",
        updatedAt: "2026-06-03T00:00:00.000Z",
        metadata: {
          ...DIGESTS,
          loginDigest: "cd".repeat(32),
          loginRef: "cli-one@example.test",
          displayRef: "cli-one@example.test",
          displayEmailMasked: "cl***@example.test"
        }
      });
      store.createAccount({
        id: "cli_a2",
        ownerRef: "cli_a2",
        status: "active",
        createdAt: "2026-06-03T00:00:00.000Z",
        updatedAt: "2026-06-03T00:00:00.000Z",
        metadata: {
          ...DIGESTS,
          useCaseDigest: null,
          loginDigest: "cd".repeat(32),
          loginRef: "cli-two@example.test",
          displayRef: "cli-two@example.test"
        }
      });
      store.createAccount({
        id: "cli_a3",
        ownerRef: "cli_a3",
        status: "active",
        createdAt: "2026-06-03T00:00:00.000Z",
        updatedAt: "2026-06-03T00:00:00.000Z",
        metadata: {
          ...DIGESTS,
          loginDigest: "ab".repeat(32),
          loginRef: "cli-three@example.test",
          displayRef: "other@example.test"
        }
      });
      // The write boundary requires an email-shaped loginRef, so a
      // non-email loginRef can only exist as a malformed historical row:
      // inject it with raw SQL (the write-path audit's own precedent).
      {
        const row = database.prepare(
          "SELECT metadata_json FROM platform_accounts WHERE id = ?"
        ).get("cli_a3");
        const metadata = JSON.parse(row.metadata_json);
        metadata.loginRef = "not-email";
        database.prepare(
          "UPDATE platform_accounts SET metadata_json = ? WHERE id = ?"
        ).run(JSON.stringify(metadata), "cli_a3");
      }
      store.identityBindingRepository().createActive({
        accountRef: "cli_a1",
        issuerRef: "portal",
        subjectRef: "subject-cli-a1",
        status: "active",
        createdAtMs: 1000,
        updatedAtMs: 1000,
        revokedAtMs: null
      });
    } finally {
      store.close();
      database.close();
    }

    const beforeHash = sha256File(dbPath);
    const result = spawnSync(process.execPath, [CLI_PATH, dbPath], { encoding: "utf8" });
    assert.equal(result.status, 0, result.stderr);
    const inventory = JSON.parse(result.stdout);
    assert.equal(typeof inventory.generatedAt, "string");
    assert.equal(inventory.source.dbPath, dbPath);
    assert.equal(inventory.source.bindingsTablePresent, true);
    assert.equal(inventory.totalAccounts, 3);
    assert.equal(inventory.accountsWithBindings, 1);
    assert.equal(inventory.accountsWithoutBindings, 2);
    assert.equal(inventory.accountsWithDisplayEmailMasked, 1);
    assert.deepEqual(inventory.duplicateLoginDigestGroups, [
      { loginDigest: "cd".repeat(32), accountIds: ["cli_a1", "cli_a2"], accountCount: 2 }
    ]);
    assert.deepEqual(inventory.loginRefDisplayRefMismatch, { count: 1, accountIds: ["cli_a3"] });
    assert.deepEqual(inventory.nonEmailLoginRefs, { count: 1, accountIds: ["cli_a3"] });
    assert.equal(inventory.digestMissingRates.useCaseDigest.missing, 1);
    // The database file is byte-identical after the run: the CLI is read-only.
    assert.equal(sha256File(dbPath), beforeHash);
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});

test("CLI fails closed on a missing database and on wrong arguments", () => {
  const missing = spawnSync(process.execPath, [CLI_PATH, join(tmpdir(), "b2-backfill-does-not-exist.sqlite")], { encoding: "utf8" });
  assert.equal(missing.status, 1);
  assert.match(missing.stderr, /b2 backfill inventory failed/);
  const noArgs = spawnSync(process.execPath, [CLI_PATH], { encoding: "utf8" });
  assert.equal(noArgs.status, 1);
  assert.match(noArgs.stderr, /requires one control database path/);
});
