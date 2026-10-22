import assert from "node:assert/strict";
import test from "node:test";
import Database from "better-sqlite3";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createRuntimeState } from "../state.mjs";
import { buildSourceValidationTestEnvironment } from "../../scripts/source-validation-test-runner.mjs";

const ROOT = resolve(fileURLToPath(new URL("../../", import.meta.url)));

function fixture(t, env = {}) {
  const directory = mkdtempSync(join(tmpdir(), "admin-user-commerce-state-"));
  const state = createRuntimeState({
    rootDir: ROOT,
    env: {
      ...buildSourceValidationTestEnvironment({}, { repositoryRoot: ROOT }),
      CONSOLE_TOKEN: "synthetic-user-commerce-state",
      ...env
    },
    controlDbPath: join(directory, "control.sqlite"),
    subscriptionDbPath: join(directory, "subscriptions.sqlite"),
    autoStartHttpProxy: false,
    nowFn: () => new Date("2026-10-22T00:00:00.000Z")
  });
  t.after(async () => {
    await state.close();
    rmSync(directory, { recursive: true, force: true });
  });
  return { state, directory };
}

test("user commerce stays unwired when its flag is unset", async (t) => {
  const { state } = fixture(t);
  assert.equal(state.platform.adminUserCommerce, null);
});

test("enabled user commerce does not migrate or scan until a request", async (t) => {
  const { state, directory } = fixture(t, { ADMIN_USER_COMMERCE_ENABLED: "true" });
  assert.equal(typeof state.platform.adminUserCommerce.readSettlement, "function");
  assert.throws(() => state.platform.adminUserCommerce.readSettlement(), { code: "source_unavailable" });
  const db = new Database(join(directory, "control.sqlite"), { fileMustExist: true, readonly: true });
  try {
    assert.equal(db.prepare(
      "select 1 from sqlite_master where type = 'table' and name = 'platform_referral_policies'"
    ).get(), undefined);
  } finally {
    db.close();
  }
});
