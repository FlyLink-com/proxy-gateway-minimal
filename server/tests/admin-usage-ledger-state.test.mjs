import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createRuntimeState } from "../state.mjs";
import { createSqliteSubscriptionControlStore } from "../services/platform/subscription-control-db.mjs";
import { buildSourceValidationTestEnvironment } from "../../scripts/source-validation-test-runner.mjs";

const ROOT = resolve(fileURLToPath(new URL("../../", import.meta.url)));
const CUTOFF = "2026-10-18T12:00:00.000Z";

function fixture(t, options = {}) {
  const directory = mkdtempSync(join(tmpdir(), "admin-ledger-state-"));
  const state = createRuntimeState({
    rootDir: ROOT,
    env: { ...buildSourceValidationTestEnvironment({}, { repositoryRoot: ROOT }), CONSOLE_TOKEN: "synthetic-ledger-state" },
    controlDbPath: join(directory, "control.sqlite"),
    subscriptionDbPath: join(directory, "subscriptions.sqlite"),
    autoStartHttpProxy: false,
    nowFn: () => new Date(CUTOFF),
    ...options
  });
  t.after(async () => {
    await state.close();
    rmSync(directory, { recursive: true, force: true });
  });
  return state;
}

test("owned control store binds a lazy read capability and closes it", async (t) => {
  const state = fixture(t);
  assert.equal(typeof state.platform.adminUsageLedger?.read, "function");
  const result = await state.platform.adminUsageLedger.read();
  assert.equal(result.cutoff, CUTOFF);
  assert.equal(result.windows[0].state, "not_collected");
  assert.equal(result.reconciliation.samples.sampleCount, 0);
  await state.close();
  await assert.rejects(state.platform.adminUsageLedger.read(), { code: "source_unavailable" });
});

test("injected control store never reads a default or separately supplied file", async (t) => {
  const store = createSqliteSubscriptionControlStore({ dbPath: ":memory:" });
  t.after(() => store.close());
  const state = fixture(t, { platformControlStore: store });
  assert.equal(typeof state.platform.adminUsageLedger?.read, "function");
  await assert.rejects(state.platform.adminUsageLedger.read(), { code: "source_unavailable" });
  await state.close();
  // An injected resource remains owned by its caller.
  assert.deepEqual(store.listAccounts(), []);
});

test("owned memory-only control store cannot silently fall back to a file", async (t) => {
  const state = fixture(t, { controlDbPath: ":memory:" });
  assert.equal(typeof state.platform.adminUsageLedger?.read, "function");
  await assert.rejects(state.platform.adminUsageLedger.read(), { code: "source_unavailable" });
});
