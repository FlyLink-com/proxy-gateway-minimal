import assert from "node:assert/strict";
import test from "node:test";
import {
  buildPackageScriptSpawn,
  buildCliHelp,
  resolveCliCommand,
  redactNetworkStatus,
  runProxyGatewayCli
} from "../services/cli/router.mjs";

test("gccgw CLI help exposes normalized command groups", () => {
  const help = buildCliHelp();

  assert.match(help, /gccgw project check/);
  assert.match(help, /gccgw platform issue-subscription/);
  assert.match(help, /gccgw channel dry-run/);
  assert.match(help, /gccgw server start/);
  assert.doesNotMatch(help, /proxy-gateway/);
});

test("gccgw CLI resolves project checks to the project-state checker", () => {
  assert.deepEqual(resolveCliCommand(["project", "check"]), {
    kind: "node-script",
    script: "scripts/check-project-state.mjs",
    args: []
  });
});

test("gccgw CLI builds Windows-safe npm script spawn commands", () => {
  assert.deepEqual(buildPackageScriptSpawn("test", "win32"), {
    command: "cmd.exe",
    args: ["/d", "/s", "/c", "npm.cmd run test"]
  });
  assert.deepEqual(buildPackageScriptSpawn("admin:test", "linux"), {
    command: "npm",
    args: ["run", "admin:test"]
  });
  assert.throws(
    () => buildPackageScriptSpawn("test && unsafe", "win32"),
    /Unsupported npm script name/
  );
});

test("gccgw CLI resolves project verify as an aggregate check", () => {
  assert.deepEqual(resolveCliCommand(["project", "verify"]), {
    kind: "project-verify",
    withAdmin: false
  });
  assert.deepEqual(resolveCliCommand(["project", "verify", "--with-admin"]), {
    kind: "project-verify",
    withAdmin: true
  });
});

test("gccgw CLI resolves env and ops checks", () => {
  assert.deepEqual(resolveCliCommand(["env", "check"]), {
    kind: "env-check"
  });
  assert.deepEqual(resolveCliCommand(["ops", "network-status"]), {
    kind: "network-status"
  });
});

test("gccgw CLI reports unknown commands with the current CLI name", async () => {
  let stderr = "";
  const exitCode = await runProxyGatewayCli(["--helpnpm", "run", "cli", "--", "--help"], {
    runNodeScript: async () => 0,
    startServer: async () => 0,
    writeStdout: () => {},
    writeStderr: (text) => {
      stderr += text;
    }
  });

  assert.equal(exitCode, 1);
  assert.match(stderr, /Unknown gccgw command: --helpnpm run cli -- --help/);
  assert.doesNotMatch(stderr, /proxy-gateway/);
});

test("gccgw network status redacts raw proxy targets", () => {
  const redacted = redactNetworkStatus({
    ok: true,
    action: "status",
    generatedAt: "2026-06-01T00:00:00.000Z",
    expected: {
      httpProxy: "http://127.0.0.1:18180",
      socks: "socks5://127.0.0.1:1080"
    },
    summary: {
      consoleListening: true,
      socksListening: true,
      httpProxyListening: true,
      systemProxyTargetOk: false,
      envProxyTargetOk: false,
      winHttpTargetOk: false,
      clashPotentialConflict: true,
      autostartEnabled: false
    },
    systemProxy: {
      ProxyServer: "sensitive.proxy.example:8080",
      AutoConfigURL: "https://secret.example/proxy.pac"
    },
    environment: {
      user: {
        HTTP_PROXY: "http://user:pass@sensitive.proxy.example:8080"
      },
      process: {
        HTTPS_PROXY: "http://process-secret.example:8080"
      }
    },
    winHttp: {
      output: "Proxy Server(s) : http://winhttp-secret.example:8080"
    },
    ports: {
      console: { port: 3456, listening: true, process: "node" }
    },
    issues: [
      { code: "env-proxy-conflict", severity: "warning", message: "raw target here" }
    ],
    actions: ["status-only"]
  });

  assert.deepEqual(redacted, {
    ok: true,
    action: "status",
    generatedAt: "2026-06-01T00:00:00.000Z",
    summary: {
      consoleListening: true,
      socksListening: true,
      httpProxyListening: true,
      systemProxyTargetOk: false,
      envProxyTargetOk: false,
      winHttpTargetOk: false,
      clashPotentialConflict: true,
      autostartEnabled: false
    },
    ports: {
      console: { port: 3456, listening: true, process: "node" }
    },
    issues: [
      { code: "env-proxy-conflict", severity: "warning" }
    ],
    actions: ["status-only"],
    redacted: true
  });
  assert.doesNotMatch(JSON.stringify(redacted), /sensitive|secret|user:pass|proxy\.pac|raw target/i);
});

test("gccgw CLI keeps execution-gated platform commands behind the existing scripts", () => {
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

test("gccgw CLI runs through injected adapters without mutating runtime state", async () => {
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

test("gccgw project verify runs repository checks in order and keeps admin optional", async () => {
  const calls = [];
  const exitCode = await runProxyGatewayCli(["project", "verify", "--with-admin"], {
    runGitDiffCheck: async () => {
      calls.push(["git-diff-check"]);
      return 0;
    },
    runNodeScript: async (script, args) => {
      calls.push(["node-script", script, args]);
      return 0;
    },
    runPackageScript: async (script) => {
      calls.push(["package-script", script]);
      return 0;
    },
    runPowershellScript: async () => {
      throw new Error("network script must not run during project verify");
    },
    runEnvCheck: async () => {
      throw new Error("env check must not run during project verify");
    },
    startServer: async () => {
      throw new Error("server must not start during project verify");
    },
    writeStdout: () => {},
    writeStderr: () => {}
  });

  assert.equal(exitCode, 0);
  assert.deepEqual(calls, [
    ["git-diff-check"],
    ["node-script", "scripts/check-project-state.mjs", []],
    ["package-script", "test"],
    ["package-script", "admin:test"],
    ["package-script", "admin:build"]
  ]);
});

test("gccgw project verify short-circuits on first failed check", async () => {
  const calls = [];
  const exitCode = await runProxyGatewayCli(["project", "verify"], {
    runGitDiffCheck: async () => {
      calls.push(["git-diff-check"]);
      return 1;
    },
    runNodeScript: async () => {
      calls.push(["node-script"]);
      return 0;
    },
    runPackageScript: async () => {
      calls.push(["package-script"]);
      return 0;
    },
    startServer: async () => 0,
    writeStdout: () => {},
    writeStderr: () => {}
  });

  assert.equal(exitCode, 1);
  assert.deepEqual(calls, [["git-diff-check"]]);
});

test("gccgw env check and ops network status use injected check adapters", async () => {
  const calls = [];
  const envExit = await runProxyGatewayCli(["env", "check"], {
    runEnvCheck: async () => {
      calls.push(["env-check"]);
      return 0;
    },
    runNodeScript: async () => {
      throw new Error("node script must not run for env check");
    },
    startServer: async () => 0,
    writeStdout: () => {},
    writeStderr: () => {}
  });
  const networkExit = await runProxyGatewayCli(["ops", "network-status"], {
    runNetworkStatus: async () => {
      calls.push(["network-status"]);
      return 0;
    },
    runNodeScript: async () => {
      throw new Error("node script must not run for network status");
    },
    startServer: async () => 0,
    writeStdout: () => {},
    writeStderr: () => {}
  });

  assert.equal(envExit, 0);
  assert.equal(networkExit, 0);
  assert.deepEqual(calls, [
    ["env-check"],
    ["network-status"]
  ]);
});

test("gccgw CLI preserves no-arg server start compatibility", async () => {
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
