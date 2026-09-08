import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createRuntimeState } from "../state.mjs";
import { buildSourceValidationTestEnvironment } from "../../scripts/source-validation-test-runner.mjs";
import { runTrafficUsageCollectOnce } from "../../scripts/traffic-usage-collect-once.mjs";

const ROOT = new URL("../../", import.meta.url);

function syntheticEnvironment(directory, overrides = {}) {
  return Object.freeze({
    ...buildSourceValidationTestEnvironment({}),
    CONSOLE_TOKEN: "synthetic-collector-console",
    SUBSCRIPTION_DB_PATH: join(directory, "subscriptions.sqlite"),
    SUBSCRIPTION_CONTROL_DB_PATH: join(directory, "control.sqlite"),
    USER_PORTAL_ROUTES_ENABLED: "true",
    COINS_WALLET_ENABLED: "true",
    COINS_COMMERCE_ENABLED: "true",
    EDGE_USAGE_COLLECTOR_ENABLED: "true",
    EDGE_HYSTERIA2_TRAFFIC_STATS_LISTEN: "127.0.0.1:19999",
    EDGE_HYSTERIA2_TRAFFIC_STATS_SECRET: "synthetic-stats-secret",
    ...overrides
  });
}

test("unadapted runtime reproduces the collector commerce prerequisite failure", () => {
  const directory = mkdtempSync(join(tmpdir(), "traffic-startup-red-"));
  try {
    assert.throws(() => createRuntimeState({
      rootDir: ROOT,
      env: syntheticEnvironment(directory),
      autoStartHttpProxy: false
    }), { code: "coin_commerce_prerequisite_missing" });
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

for (const [label, flags] of [
  ["commerce", {}],
  ["commerce authority and registration bonus", {
    COINS_COMMERCE_ACCOUNT_RESOURCE_AUTHORITY_ENABLED: "true",
    USER_PORTAL_REGISTRATION_WELCOME_COINS_ENABLED: "true",
    USER_PORTAL_REGISTRATION_WELCOME_COINS_AUDIENCE: "all_active"
  }],
  ["payment providers", {
    PLATFORM_COIN_RECHARGE_ENABLED: "true",
    PLATFORM_PAYPAL_SANDBOX_ENABLED: "true",
    PLATFORM_XSD_PAYMENT_ENABLED: "true",
    PLATFORM_CHAOJIPAY_PAYMENT_ENABLED: "true"
  }]
]) {
  test(`collector initializes real accounting without ${label} dependencies`, async () => {
    const directory = mkdtempSync(join(tmpdir(), "traffic-runtime-isolated-"));
    const env = syntheticEnvironment(directory, flags);
    const original = { ...env };
    let state;
    let runtimeEnv;
    let readerCalls = 0;
    let output = "";
    let errors = "";
    try {
      const code = await runTrafficUsageCollectOnce({
        argv: ["--check"],
        cwd: ROOT,
        env,
        stdout: { write(value) { output += value; } },
        stderr: { write(value) { errors += value; } },
        runtimeStateFactory(options) {
          runtimeEnv = options.env;
          state = createRuntimeState({
            ...options,
            autoStartHttpProxy: false,
            hysteria2TrafficReader() {
              readerCalls += 1;
              throw new Error("check must not read or clear counters");
            }
          });
          return state;
        }
      });
      assert.equal(code, 0, errors);
      assert.equal(JSON.parse(output).collectorCount, 2);
      assert.notEqual(runtimeEnv, env);
      assert.deepEqual(env, original);
      assert.equal(readerCalls, 0);
      assert.equal(state.platform.userPortalRoutesEnabled, true);
      assert.equal(typeof state.platform.trafficAccounting.recordUsageObservation, "function");
      assert.equal(typeof state.platform.edgeUsageAccounting.collectAndRecord, "function");
      assert.equal(typeof state.platform.orderUsageQuotaLifecycleGate.handleUsageDecision, "function");
      assert.equal(typeof state.platform.orderUsageQuotaLifecycleGate.sweepQuotaCycleRollovers, "function");
      for (const key of [
        "coinsWalletEnabled", "coinsCommerceEnabled", "coinsCommerceAuthorityEnabled",
        "registrationWelcomeCoinsEnabled", "coinRechargeEnabled"
      ]) assert.equal(state.platform[key], false, key);
      for (const key of [
        "coinsWalletStore", "coinCommerceStore", "coinCommerceCoordinator",
        "portalRegistrationWelcomeBonusCoordinator", "paymentStore", "paymentRechargeCoordinator"
      ]) assert.equal(state.platform[key], null, key);
      assert.doesNotMatch(output + errors, /synthetic-stats-secret|synthetic-collector-console/);
    } finally {
      await state?.close();
      rmSync(directory, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 });
    }
  });
}

test("collector preserves lifecycle and protected accounting configuration in its environment copy", async () => {
  const env = Object.freeze({
    COINS_COMMERCE_ENABLED: "true",
    USER_PORTAL_EDGE_LIFECYCLE_ENABLED: "true",
    EDGE_CREDENTIAL_LIFECYCLE_ENABLED: "true",
    EDGE_USAGE_COLLECTOR_ENABLED: "true",
    SUBSCRIPTION_CONTROL_DB_PATH: "synthetic-control.sqlite",
    EDGE_USAGE_COLLECTOR_STATUS_PATH: "synthetic-status.json",
    EDGE_MIHOMO_USAGE_CREDENTIAL_MAP_PATH: "synthetic-map.json"
  });
  let captured;
  const code = await runTrafficUsageCollectOnce({
    argv: ["--check"], env,
    stdout: { write() {} }, stderr: { write() {} },
    runtimeStateFactory({ env: isolated }) {
      captured = isolated;
      return { platform: { edgeUsageAccounting: { collectAndRecord() {} }, edgeUsageCollectors: [] } };
    }
  });
  assert.equal(code, 0);
  assert.equal(captured.COINS_COMMERCE_ENABLED, "false");
  for (const [key, value] of Object.entries(env)) {
    if (key !== "COINS_COMMERCE_ENABLED") assert.equal(captured[key], value, key);
  }
  assert.equal(env.COINS_COMMERCE_ENABLED, "true");
});
