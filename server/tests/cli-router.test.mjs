import assert from "node:assert/strict";
import test from "node:test";
import {
  buildCliHelp,
  resolveCliCommand,
  runProxyGatewayCli
} from "../services/cli/router.mjs";

test("proxy-gateway CLI help exposes normalized command groups", () => {
  const help = buildCliHelp();

  assert.match(help, /proxy-gateway project check/);
  assert.match(help, /proxy-gateway platform issue-subscription/);
  assert.match(help, /proxy-gateway channel dry-run/);
  assert.match(help, /proxy-gateway server start/);
});

test("proxy-gateway CLI resolves project checks to the project-state checker", () => {
  assert.deepEqual(resolveCliCommand(["project", "check"]), {
    kind: "node-script",
    script: "scripts/check-project-state.mjs",
    args: []
  });
});

test("proxy-gateway CLI keeps execution-gated platform commands behind the existing scripts", () => {
  assert.deepEqual(resolveCliCommand([
    "platform",
    "issue-subscription",
    "--dry-run",
    "input.json"
  ]), {
    kind: "node-script",
    script: "scripts/platform-issue-subscription.mjs",
    args: ["--dry-run", "input.json"]
  });
});

test("proxy-gateway CLI runs through injected adapters without mutating runtime state", async () => {
  const calls = [];
  const exitCode = await runProxyGatewayCli(["platform", "revoke-access", "tenant_ref", "--dry-run"], {
    runNodeScript: async (script, args) => {
      calls.push({ script, args });
      return 0;
    },
    startServer: async () => {
      throw new Error("server must not start for routed commands");
    },
    writeStdout: () => {},
    writeStderr: () => {}
  });

  assert.equal(exitCode, 0);
  assert.deepEqual(calls, [{
    script: "scripts/platform-revoke-access.mjs",
    args: ["tenant_ref", "--dry-run"]
  }]);
});

test("proxy-gateway CLI preserves no-arg server start compatibility", async () => {
  const calls = [];
  const exitCode = await runProxyGatewayCli([], {
    runNodeScript: async () => {
      throw new Error("script runner must not execute for server start");
    },
    startServer: async () => {
      calls.push("start");
      return 0;
    },
    writeStdout: () => {},
    writeStderr: () => {}
  });

  assert.equal(exitCode, 0);
  assert.deepEqual(calls, ["start"]);
});
