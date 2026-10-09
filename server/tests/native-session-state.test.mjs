import assert from "node:assert/strict";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { createRuntimeState } from "../state.mjs";
import { buildSourceValidationTestEnvironment } from "../../scripts/source-validation-test-runner.mjs";

for (const [label, value, enabled] of [["absent", undefined, false], ["false", "false", false], ["true", "true", true]]) {
  test(`runtime native renewal flag ${label} leaves schema untouched and provider/VPN I/O disabled`, () => {
    const repositoryRoot = fileURLToPath(new URL("../../", import.meta.url));
    const env = { ...buildSourceValidationTestEnvironment({}, { repositoryRoot }),
      CONSOLE_TOKEN: "synthetic-console", USER_PORTAL_ROUTES_ENABLED: "true", USER_PORTAL_ALLOW_PASSWORD_ONLY_SETUP_SESSION: "true" };
    if (value !== undefined) env.PLATFORM_PORTAL_NATIVE_SESSION_ENABLED = value;
    const state = createRuntimeState({ rootDir: repositoryRoot, env, subscriptionDbPath: ":memory:", controlDbPath: ":memory:", autoStartHttpProxy: false });
    try {
      assert.equal(state.platform.userPortalAuth.nativeSessionsEnabled, enabled);
      assert.throws(() => state.platform.controlStore.nativeSessions.requireReady(), { code: "native_session_unavailable" });
      assert.throws(() => state.platform.userPortalAuth.exchangeNativeSession({ sessionRef: "synthetic_unused" }),
        { code: enabled ? "native_session_unavailable" : "not_found" });
    } finally { state.close(); }
  });
}
