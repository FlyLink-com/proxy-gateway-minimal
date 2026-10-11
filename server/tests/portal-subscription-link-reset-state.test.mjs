import assert from "node:assert/strict";
import test from "node:test";
import Database from "better-sqlite3";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createRuntimeState } from "../state.mjs";
import { buildSourceValidationTestEnvironment } from "../../scripts/source-validation-test-runner.mjs";
import { createSqliteSubscriptionControlStore } from "../services/platform/subscription-control-db.mjs";
import { ensurePortalSubscriptionLinkResetSchema } from "../services/platform/portal-subscription-link-reset-store.mjs";

const repositoryRoot = resolve(fileURLToPath(new URL("../../", import.meta.url)));
function fixture(t, env = {}, schema = false) {
  const dir = mkdtempSync(join(tmpdir(), "portal-reset-state-"));
  const lifetime = { state: null };
  t.after(() => { lifetime.state?.close(); rmSync(dir, { recursive: true, force: true }); });
  const controlDbPath = join(dir, "control.sqlite");
  if (schema) {
    const db = new Database(controlDbPath);
    createSqliteSubscriptionControlStore({ database: db });
    ensurePortalSubscriptionLinkResetSchema(db);
    db.close();
  }
  return { lifetime, controlDbPath, options: { rootDir: repositoryRoot,
    env: { ...buildSourceValidationTestEnvironment({}, { repositoryRoot }), CONSOLE_TOKEN: "synthetic",
      USER_PORTAL_ROUTES_ENABLED: "true", ...env },
    subscriptionDbPath: join(dir, "subscriptions.sqlite"), controlDbPath, autoStartHttpProxy: false } };
}

test("application startup does not create reset schema while feature is disabled", t => {
  const f = fixture(t);
  const state = createRuntimeState(f.options);
  f.lifetime.state = state;
  const db = new Database(f.controlDbPath, { readonly: true });
  try { assert.equal(db.prepare("select name from sqlite_master where name = 'platform_portal_subscription_link_resets'").get(), undefined); }
  finally { db.close(); }
});

test("enabling reset requires explicit schema before startup, never silently migrates", t => {
  const f = fixture(t, { USER_PORTAL_SUBSCRIPTION_LINK_RESET_ENABLED: "true" });
  let state;
  try { assert.throws(() => { state = createRuntimeState(f.options); }, { code: "subscription_link_reset_schema_unavailable" }); }
  finally { state?.close(); }
  const db = new Database(f.controlDbPath, { readonly: true });
  try { assert.equal(db.prepare("select name from sqlite_master where name = 'platform_portal_subscription_link_resets'").get(), undefined); }
  finally { db.close(); }
});

test("enabled reset starts with prepared schema and exposes domain method", t => {
  const f = fixture(t, { USER_PORTAL_SUBSCRIPTION_LINK_RESET_ENABLED: "true" }, true);
  const state = createRuntimeState(f.options);
  f.lifetime.state = state;
  assert.equal(typeof state.platform.portalAccessRequests.resetSubscriptionLink, "function");
});
