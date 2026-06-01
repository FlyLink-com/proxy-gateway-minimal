import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  buildGccgwConfigList,
  buildGccgwConfigShow,
  buildGccgwConfigValidation
} from "../services/cli/config.mjs";
import { runProxyGatewayCli } from "../services/cli/router.mjs";

function createConfigFile(config) {
  const dir = mkdtempSync(join(tmpdir(), "gccgw-config-test-"));
  const configPath = join(dir, "gccgw.config.json");
  writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`, "utf8");
  return {
    configPath,
    cleanup: () => rmSync(dir, { recursive: true, force: true })
  };
}

const rawRuntimeDbPath = "/opt/proxy-gateway-minimal/data/runtime.sqlite";
const rawControlDbPath = "/opt/proxy-gateway-minimal/data/control.sqlite";
const rawHandoffDir = "/home/operator/private-handoff";
const rawPublicBaseUrl = "https://sub.sensitive.example";
const rawEnvFile = "/opt/proxy-gateway-minimal/.env";

function buildSensitiveConfig() {
  return {
    type: "gccgw_config",
    profiles: {
      local: {
        environment: "local",
        riskTier: "B",
        publicBaseUrl: "http://127.0.0.1:45132",
        execution: {
          allowProductionMutation: false,
          approvalRequired: false
        },
        files: {
          envFile: ".env",
          runtimeDbPath: "data/runtime.local.sqlite",
          controlDbPath: "data/control.local.sqlite",
          handoffDir: "handoff/local"
        }
      },
      "aliyun-prod": {
        environment: "aliyun-prod",
        riskTier: "A",
        publicBaseUrl: rawPublicBaseUrl,
        execution: {
          allowProductionMutation: true,
          approvalRequired: true
        },
        files: {
          envFile: rawEnvFile,
          runtimeDbPath: rawRuntimeDbPath,
          controlDbPath: rawControlDbPath,
          handoffDir: rawHandoffDir
        }
      }
    }
  };
}

function assertNoRawConfigValues(value) {
  const text = JSON.stringify(value);
  for (const raw of [rawRuntimeDbPath, rawControlDbPath, rawHandoffDir, rawPublicBaseUrl, rawEnvFile]) {
    assert.doesNotMatch(text, new RegExp(raw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
}

test("gccgw config show redacts real file and URL values", () => {
  const { configPath, cleanup } = createConfigFile(buildSensitiveConfig());
  try {
    const show = buildGccgwConfigShow({ configPath, profile: "aliyun-prod", format: "json" });

    assert.equal(show.type, "gccgw_config_profile");
    assert.equal(show.profile, "aliyun-prod");
    assert.equal(show.riskTier, "A");
    assert.equal(show.publicBaseUrl.configured, true);
    assert.equal(show.publicBaseUrl.https, true);
    assert.equal(show.files.runtimeDbPath.configured, true);
    assert.equal(show.files.controlDbPath.configured, true);
    assert.equal(show.files.handoffDir.configured, true);
    assert.equal(show.valuesRedacted, true);
    assertNoRawConfigValues(show);
  } finally {
    cleanup();
  }
});

test("gccgw config list exposes profile capabilities without raw values", () => {
  const { configPath, cleanup } = createConfigFile(buildSensitiveConfig());
  try {
    const list = buildGccgwConfigList({ configPath, format: "json" });

    assert.equal(list.type, "gccgw_config_list");
    assert.equal(list.valuesRedacted, true);
    assert.deepEqual(list.profiles.map((profile) => profile.name), ["aliyun-prod", "local"]);
    assert.ok(list.profiles.some((profile) => (
      profile.name === "aliyun-prod"
      && profile.riskTier === "A"
      && profile.execution.allowProductionMutation === true
      && profile.execution.approvalRequired === true
    )));
    assertNoRawConfigValues(list);
  } finally {
    cleanup();
  }
});

test("gccgw config validate reports shape without leaking configured values", () => {
  const { configPath, cleanup } = createConfigFile(buildSensitiveConfig());
  try {
    const validation = buildGccgwConfigValidation({ configPath, profile: "aliyun-prod", format: "json" });

    assert.equal(validation.type, "gccgw_config_validation");
    assert.equal(validation.ok, true);
    assert.equal(validation.profile, "aliyun-prod");
    assert.deepEqual(validation.issues, []);
    assertNoRawConfigValues(validation);
  } finally {
    cleanup();
  }
});

test("gccgw config commands route through sanitized config views", async () => {
  const { configPath, cleanup } = createConfigFile(buildSensitiveConfig());
  try {
    let stdout = "";
    const exitCode = await runProxyGatewayCli([
      "config",
      "show",
      "aliyun-prod",
      "--config",
      configPath,
      "--json"
    ], {
      runNodeScript: async () => {
        throw new Error("node script must not run for config views");
      },
      runPackageScript: async () => {
        throw new Error("package script must not run for config views");
      },
      startServer: async () => {
        throw new Error("server must not start for config views");
      },
      writeStdout: (text) => {
        stdout += text;
      },
      writeStderr: () => {}
    });

    assert.equal(exitCode, 0);
    const parsed = JSON.parse(stdout);
    assert.equal(parsed.profile, "aliyun-prod");
    assertNoRawConfigValues(parsed);
  } finally {
    cleanup();
  }
});
