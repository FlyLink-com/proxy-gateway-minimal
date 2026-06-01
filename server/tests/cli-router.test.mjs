import assert from "node:assert/strict";
import test from "node:test";
import {
  buildCliArchitectureMap,
  buildCliDocsMap,
  buildPackageScriptSpawn,
  buildCliCommandMap,
  buildCliHelp,
  listCliCommands,
  resolveCliCommand,
  redactNetworkStatus,
  runProxyGatewayCli
} from "../services/cli/router.mjs";

test("gccgw CLI help exposes normalized command groups", () => {
  const help = buildCliHelp();

  assert.match(help, /gccgw project check/);
  assert.match(help, /gccgw architecture/);
  assert.match(help, /gccgw docs command/);
  assert.match(help, /gccgw platform issue-subscription/);
  assert.match(help, /gccgw channel validate/);
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

test("gccgw CLI resolves architecture map as a read-only project command", () => {
  assert.deepEqual(resolveCliCommand(["architecture"]), {
    kind: "architecture-map",
    format: "text"
  });
  assert.deepEqual(resolveCliCommand(["architecture", "--json"]), {
    kind: "architecture-map",
    format: "json"
  });
});

test("gccgw CLI resolves docs navigation commands as read-only project commands", () => {
  assert.deepEqual(resolveCliCommand(["docs", "list"]), {
    kind: "docs-map",
    mode: "list",
    format: "text"
  });
  assert.deepEqual(resolveCliCommand(["docs", "domain", "platform", "--json"]), {
    kind: "docs-map",
    mode: "domain",
    query: "platform",
    format: "json"
  });
  assert.deepEqual(resolveCliCommand(["docs", "command", "platform", "issue-subscription", "--json"]), {
    kind: "docs-map",
    mode: "command",
    query: "platform issue-subscription",
    format: "json"
  });
});

test("gccgw CLI resolves stable channel facade commands to existing pipeline scripts", () => {
  assert.deepEqual(resolveCliCommand(["channel", "validate", "config.json"]), {
    kind: "node-script",
    script: "scripts/channel-config-dry-run.mjs",
    args: ["config.json"]
  });
  assert.deepEqual(resolveCliCommand(["channel", "measure", "manifest.json"]), {
    kind: "node-script",
    script: "scripts/channel-measurement-bundle.mjs",
    args: ["manifest.json"]
  });
  assert.deepEqual(resolveCliCommand(["channel", "decide", "packet.json"]), {
    kind: "node-script",
    script: "scripts/channel-system-decision-flow.mjs",
    args: ["packet.json"]
  });
  assert.deepEqual(resolveCliCommand(["channel", "package", "fixture.json", "config.json"]), {
    kind: "node-script",
    script: "scripts/channel-subscription-activation-package.mjs",
    args: ["fixture.json", "config.json"]
  });
  assert.deepEqual(resolveCliCommand(["channel", "record", "fixture.json"]), {
    kind: "node-script",
    script: "scripts/channel-subscription-activation-record-template.mjs",
    args: ["fixture.json"]
  });
});

test("gccgw CLI resolves local project, admin, site, and package scripts", () => {
  assert.deepEqual(resolveCliCommand(["project", "test"]), {
    kind: "package-script",
    script: "test"
  });
  assert.deepEqual(resolveCliCommand(["admin", "test"]), {
    kind: "package-script",
    script: "admin:test"
  });
  assert.deepEqual(resolveCliCommand(["admin", "build"]), {
    kind: "package-script",
    script: "admin:build"
  });
  assert.deepEqual(resolveCliCommand(["site", "build"]), {
    kind: "package-script",
    script: "admin:site:build"
  });
  assert.deepEqual(resolveCliCommand(["site", "verify"]), {
    kind: "package-script",
    script: "admin:site:verify"
  });
  assert.deepEqual(resolveCliCommand(["package", "dry-run"]), {
    kind: "package-script",
    script: "pack:dry-run"
  });
});

test("gccgw CLI exposes a structured command map for editor surfaces", async () => {
  const commands = listCliCommands();
  const names = commands.map((command) => command.command);

  assert.ok(names.includes("gccgw architecture"));
  assert.ok(names.includes("gccgw docs list"));
  assert.ok(names.includes("gccgw commands"));
  assert.ok(names.includes("gccgw project verify"));
  assert.ok(names.includes("gccgw platform issue-subscription"));
  assert.ok(names.includes("gccgw channel validate"));
  assert.ok(names.includes("gccgw channel subscription-render-proof"));

  const issueSubscription = commands.find((command) => command.command === "gccgw platform issue-subscription");
  assert.equal(issueSubscription.domain, "platform");
  assert.equal(issueSubscription.riskTier, "A");
  assert.equal(issueSubscription.mode, "execution-gated");
  assert.equal(issueSubscription.approvalPrompt, "required for --execute-production-mutation");
  assert.ok(issueSubscription.sourceDocs.includes("docs/CLI_PRODUCTION_PROVISIONING_SOP.md"));
  assert.ok(issueSubscription.sourceDocs.includes("docs/SUBSCRIPTION_CONTROL_DATABASE.md"));

  const revokeAccess = commands.find((command) => command.command === "gccgw platform revoke-access");
  assert.equal(revokeAccess.riskTier, "A");
  assert.equal(revokeAccess.mode, "dry-run-only");
  assert.equal(revokeAccess.approvalPrompt, undefined);

  const renderProof = commands.find((command) => command.command === "gccgw channel subscription-render-proof");
  assert.equal(renderProof.surface, "advanced");
  assert.ok(renderProof.sourceDocs.includes("docs/CHANNEL_RUNTIME_CANARY_RUNBOOK.md"));

  const channelValidate = commands.find((command) => command.command === "gccgw channel validate");
  assert.equal(channelValidate.surface, "operator");
  assert.equal(channelValidate.mode, "dry-run");
  assert.equal(channelValidate.aliasOf, "gccgw channel dry-run");

  const commandMap = buildCliCommandMap({ format: "json" });
  assert.equal(commandMap.type, "gccgw_command_map");
  assert.equal(commandMap.commands.length, commands.length);
  assert.doesNotMatch(JSON.stringify(commandMap), /subscriptionUrl|token|secret|password/i);

  let stdout = "";
  const exitCode = await runProxyGatewayCli(["commands", "--json"], {
    runNodeScript: async () => {
      throw new Error("node script must not run for command map");
    },
    runPackageScript: async () => {
      throw new Error("package script must not run for command map");
    },
    startServer: async () => {
      throw new Error("server must not start for command map");
    },
    writeStdout: (text) => {
      stdout += text;
    },
    writeStderr: () => {}
  });

  assert.equal(exitCode, 0);
  const parsed = JSON.parse(stdout);
  assert.equal(parsed.type, "gccgw_command_map");
  assert.ok(parsed.commands.some((command) => command.command === "gccgw site verify"));
});

test("gccgw CLI exposes source docs by command and domain for project navigation", async () => {
  const commandDocs = buildCliDocsMap({
    mode: "command",
    query: "platform issue-subscription",
    format: "json"
  });
  assert.equal(commandDocs.type, "gccgw_docs_map");
  assert.equal(commandDocs.mode, "command");
  assert.equal(commandDocs.commands.length, 1);
  assert.equal(commandDocs.commands[0].command, "gccgw platform issue-subscription");
  assert.ok(commandDocs.documents.some((doc) => doc.path === "docs/CLI_PRODUCTION_PROVISIONING_SOP.md"));
  assert.ok(commandDocs.documents.some((doc) => doc.path === "docs/SUBSCRIPTION_CONTROL_DATABASE.md"));
  assert.doesNotMatch(JSON.stringify(commandDocs), /subscriptionUrl|token|secret|password/i);

  const platformDocs = buildCliDocsMap({
    mode: "domain",
    query: "platform",
    format: "json"
  });
  assert.equal(platformDocs.mode, "domain");
  assert.ok(platformDocs.commands.length > 1);
  assert.ok(platformDocs.documents.some((doc) => doc.path === "docs/OPERATOR_CLI_PLATFORM_BOUNDARY.md"));

  const text = buildCliDocsMap({ mode: "list" });
  assert.match(text, /gccgw docs map/);
  assert.match(text, /docs\/PROJECT_CONTEXT\.md/);
  assert.match(text, /gccgw platform issue-subscription/);

  let stdout = "";
  const exitCode = await runProxyGatewayCli(["docs", "command", "platform", "issue-subscription", "--json"], {
    runNodeScript: async () => {
      throw new Error("node script must not run for docs map");
    },
    runPackageScript: async () => {
      throw new Error("package script must not run for docs map");
    },
    startServer: async () => {
      throw new Error("server must not start for docs map");
    },
    writeStdout: (value) => {
      stdout += value;
    },
    writeStderr: () => {}
  });

  assert.equal(exitCode, 0);
  const parsed = JSON.parse(stdout);
  assert.equal(parsed.type, "gccgw_docs_map");
  assert.equal(parsed.commands[0].command, "gccgw platform issue-subscription");
});

test("gccgw CLI exposes a flattened architecture map for project editor surfaces", async () => {
  const architecture = buildCliArchitectureMap({ format: "json" });

  assert.equal(architecture.type, "gccgw_architecture_map");
  assert.equal(architecture.generatedBy, "gccgw architecture");
  assert.ok(architecture.layers.some((layer) => layer.layer === "adapter"));
  assert.ok(architecture.layers.some((layer) => layer.layer === "service"));
  assert.ok(architecture.layers.some((layer) => layer.layer === "storage"));
  assert.ok(architecture.layers.some((layer) => layer.layer === "output"));
  assert.ok(architecture.layers.some((layer) => layer.layer === "gate"));
  assert.ok(architecture.flows.some((flow) => flow.name === "Controlled subscription issuance"));
  assert.doesNotMatch(JSON.stringify(architecture), /subscriptionUrl|token|secret|password/i);

  const text = buildCliArchitectureMap();
  assert.match(text, /gccgw architecture map/);
  assert.match(text, /adapter/);
  assert.match(text, /executeSubscriptionIssuance/);

  let stdout = "";
  const exitCode = await runProxyGatewayCli(["architecture", "--json"], {
    runNodeScript: async () => {
      throw new Error("node script must not run for architecture map");
    },
    runPackageScript: async () => {
      throw new Error("package script must not run for architecture map");
    },
    startServer: async () => {
      throw new Error("server must not start for architecture map");
    },
    writeStdout: (value) => {
      stdout += value;
    },
    writeStderr: () => {}
  });

  assert.equal(exitCode, 0);
  const parsed = JSON.parse(stdout);
  assert.equal(parsed.type, "gccgw_architecture_map");
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

test("gccgw CLI blocks A-tier execution when approval prompt is rejected", async () => {
  let nodeScriptCalled = false;
  let stderr = "";
  const exitCode = await runProxyGatewayCli([
    "platform",
    "issue-subscription",
    "--execute-production-mutation",
    "input.json"
  ], {
    confirmRiskAExecution: async (approval) => {
      assert.equal(approval.command, "gccgw platform issue-subscription");
      assert.equal(approval.riskTier, "A");
      assert.equal(approval.mode, "execution-gated");
      return false;
    },
    runNodeScript: async () => {
      nodeScriptCalled = true;
      return 0;
    },
    startServer: async () => 0,
    writeStdout: () => {},
    writeStderr: (value) => {
      stderr += value;
    }
  });

  assert.equal(exitCode, 1);
  assert.equal(nodeScriptCalled, false);
  assert.match(stderr, /Risk A approval prompt rejected/);
});

test("gccgw CLI runs A-tier execution only after approval prompt accepts", async () => {
  const calls = [];
  const exitCode = await runProxyGatewayCli([
    "platform",
    "issue-portal-entry",
    "--execute-production-mutation",
    "input.json"
  ], {
    confirmRiskAExecution: async (approval) => {
      calls.push(["prompt", approval.command, approval.riskTier, approval.mode]);
      return true;
    },
    runNodeScript: async (script, args) => {
      calls.push(["node-script", script, args]);
      return 0;
    },
    startServer: async () => 0,
    writeStdout: () => {},
    writeStderr: () => {}
  });

  assert.equal(exitCode, 0);
  assert.deepEqual(calls, [
    ["prompt", "gccgw platform issue-portal-entry", "A", "execution-gated"],
    ["node-script", "scripts/platform-issue-portal-entry.mjs", ["--execute-production-mutation", "input.json"]]
  ]);
});

test("gccgw CLI does not prompt for A-tier dry-run paths", async () => {
  const calls = [];
  const exitCode = await runProxyGatewayCli([
    "platform",
    "issue-subscription",
    "--dry-run",
    "input.json"
  ], {
    confirmRiskAExecution: async () => {
      throw new Error("approval prompt must not run for dry-run");
    },
    runNodeScript: async (script, args) => {
      calls.push({ script, args });
      return 0;
    },
    startServer: async () => 0,
    writeStdout: () => {},
    writeStderr: () => {}
  });

  assert.equal(exitCode, 0);
  assert.deepEqual(calls, [{
    script: "scripts/platform-issue-subscription.mjs",
    args: ["--dry-run", "input.json"]
  }]);
});

test("gccgw CLI does not prompt for dry-run-only A-tier commands", async () => {
  const calls = [];
  const exitCode = await runProxyGatewayCli([
    "platform",
    "revoke-access",
    "tenant-a",
    "--execute-production-mutation"
  ], {
    confirmRiskAExecution: async () => {
      throw new Error("approval prompt must not run for dry-run-only commands");
    },
    runNodeScript: async (script, args) => {
      calls.push({ script, args });
      return 1;
    },
    startServer: async () => 0,
    writeStdout: () => {},
    writeStderr: () => {}
  });

  assert.equal(exitCode, 1);
  assert.deepEqual(calls, [{
    script: "scripts/platform-revoke-access.mjs",
    args: ["tenant-a", "--execute-production-mutation"]
  }]);
});

test("gccgw CLI runs package-script commands through the package adapter", async () => {
  const calls = [];
  const exitCode = await runProxyGatewayCli(["site", "verify"], {
    runPackageScript: async (script) => {
      calls.push(script);
      return 0;
    },
    runNodeScript: async () => {
      throw new Error("node script must not run for package script aliases");
    },
    startServer: async () => {
      throw new Error("server must not start for package script aliases");
    },
    writeStdout: () => {},
    writeStderr: () => {}
  });

  assert.equal(exitCode, 0);
  assert.deepEqual(calls, ["admin:site:verify"]);
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
