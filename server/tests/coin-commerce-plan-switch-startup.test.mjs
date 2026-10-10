import assert from "node:assert/strict";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

function sleepMs(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function removeTempDir(dir) {
  let lastError;
  for (let attempt = 0; attempt < 20; attempt += 1) {
    try {
      rmSync(dir, { recursive: true, force: true });
      return;
    } catch (error) {
      lastError = error;
      if (!["EPERM", "EBUSY", "ENOTEMPTY"].includes(error?.code)) throw error;
      sleepMs(100);
    }
  }
  if (process.platform === "win32" && ["EPERM", "EBUSY"].includes(lastError?.code)) {
    return;
  }
  throw lastError;
}

import { buildSourceValidationTestEnvironment } from "../../scripts/source-validation-test-runner.mjs";
import { createRuntimeState } from "../state.mjs";
import { PLAN_SWITCH_ERROR } from "../services/platform/coin-commerce-plan-switch-policy.mjs";

const REPOSITORY_ROOT = resolve(fileURLToPath(new URL("../../", import.meta.url)));

function runtimeEnv(overrides = {}) {
  return {
    ...buildSourceValidationTestEnvironment({}, { repositoryRoot: REPOSITORY_ROOT }),
    ...overrides
  };
}

test("plan switch stays off unless COINS_COMMERCE_PLAN_SWITCH_ENABLED is set", async () => {
  const dir = mkdtempSync(join(tmpdir(), "plan-switch-flag-off-"));
  let state;
  try {
    state = createRuntimeState({
      rootDir: new URL("../../", import.meta.url),
      env: runtimeEnv({ CONSOLE_TOKEN: "secret" }),
      subscriptionDbPath: join(dir, "subscriptions.sqlite"),
      controlDbPath: join(dir, "control.sqlite"),
      autoStartHttpProxy: false
    });
    assert.equal(state.platform.coinsCommercePlanSwitchEnabled, false);
    assert.equal(state.platform.coinsCommerceAuthorityEnabled, false);
  } finally {
    await state?.subscriptions?.close?.();
    removeTempDir(dir);
  }
});

test("plan switch flag without a valid schema refuses startup", async () => {
  const dir = mkdtempSync(join(tmpdir(), "plan-switch-flag-on-"));
  let state;
  try {
    assert.throws(
      () => {
        state = createRuntimeState({
          rootDir: new URL("../../", import.meta.url),
          env: runtimeEnv({
            CONSOLE_TOKEN: "secret",
            COINS_COMMERCE_PLAN_SWITCH_ENABLED: "true"
          }),
          subscriptionDbPath: join(dir, "subscriptions.sqlite"),
          controlDbPath: join(dir, "control.sqlite"),
          autoStartHttpProxy: false
        });
      },
      (error) => error?.code === PLAN_SWITCH_ERROR.SCHEMA_NOT_READY
    );
  } finally {
    await state?.subscriptions?.close?.();
    removeTempDir(dir);
  }
});

test("plan switch and account-resource authority together refuse startup before database access", async () => {
  const dir = mkdtempSync(join(tmpdir(), "plan-switch-authority-refuse-"));
  let unexpected;
  try {
    assert.throws(
      () => {
        unexpected = createRuntimeState({
          rootDir: new URL("../../", import.meta.url),
          env: runtimeEnv({
            CONSOLE_TOKEN: "secret",
            COINS_COMMERCE_PLAN_SWITCH_ENABLED: "true",
            COINS_COMMERCE_ACCOUNT_RESOURCE_AUTHORITY_ENABLED: "true"
          }),
          subscriptionDbPath: join(dir, "subscriptions.sqlite"),
          controlDbPath: join(dir, "control.sqlite"),
          autoStartHttpProxy: false
        });
      },
      (error) => error?.code === PLAN_SWITCH_ERROR.REQUIRES_LEGACY_COMMERCE
    );
    assert.equal(existsSync(join(dir, "control.sqlite")), false);
    assert.equal(existsSync(join(dir, "subscriptions.sqlite")), false);
  } finally {
    await unexpected?.subscriptions?.close?.();
    removeTempDir(dir);
  }
});
