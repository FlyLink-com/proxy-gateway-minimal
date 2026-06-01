const DOMAIN_SOURCE_DOCS = {
  admin: ["docs/OPERATOR_CLI_PLATFORM_BOUNDARY.md"],
  channel: ["docs/CHANNEL_RUNTIME_CANARY_RUNBOOK.md", "docs/LOCAL_EDGE_CHANNEL_TECHNICAL_MVP.md"],
  env: ["docs/LIGHTWEIGHT_OPERATING_DEV_ENVIRONMENT.md"],
  ops: ["docs/LIGHTWEIGHT_OPERATING_DEV_ENVIRONMENT.md"],
  package: ["docs/RESOURCE_PACKAGE_CLI.md"],
  platform: ["docs/OPERATOR_CLI_PLATFORM_BOUNDARY.md", "docs/CLI_PRODUCTION_PROVISIONING_SOP.md"],
  project: ["docs/PROJECT_CONTEXT.md"],
  server: ["docs/LIGHTWEIGHT_OPERATING_DEV_ENVIRONMENT.md"],
  site: ["docs/PROJECT_CONTEXT.md"]
};

const NODE_SCRIPT_COMMAND_ENTRIES = [
  ["project check", "scripts/check-project-state.mjs", "project", "C", "read-only", "Validate project-state and repository safety markers"],
  ["channel dry-run", "scripts/channel-config-dry-run.mjs", "channel", "B", "dry-run", "Validate channel configuration candidates"],
  ["channel benchmark-run", "scripts/channel-benchmark-runner.mjs", "channel", "B", "local-runner", "Run an explicit local benchmark runner"],
  ["channel benchmark-fixture", "scripts/channel-benchmark-fixture.mjs", "channel", "C", "fixture", "Create editable benchmark sample placeholders"],
  ["channel benchmark-summary", "scripts/channel-benchmark-summary.mjs", "channel", "C", "summary", "Summarize benchmark samples"],
  ["channel benchmark-score", "scripts/channel-benchmark-score.mjs", "channel", "C", "summary", "Score benchmark readiness"],
  ["channel candidate-report", "scripts/channel-candidate-report.mjs", "channel", "C", "report", "Build candidate recommendation evidence"],
  ["channel candidate-comparison", "scripts/channel-candidate-comparison.mjs", "channel", "C", "report", "Plan protocol comparison candidates"],
  ["channel decision-pack", "scripts/channel-decision-pack.mjs", "channel", "C", "report", "Build operator decision evidence"],
  ["channel extended-assessment", "scripts/channel-extended-assessment.mjs", "channel", "C", "report", "Assess extended measurement readiness"],
  ["channel extended-report", "scripts/channel-extended-report.mjs", "channel", "C", "report", "Aggregate extended measurement windows"],
  ["channel measurement-bundle", "scripts/channel-measurement-bundle.mjs", "channel", "C", "report", "Build measurement bundle evidence"],
  ["channel measurement-investigation", "scripts/channel-measurement-investigation.mjs", "channel", "C", "report", "Summarize measurement investigation evidence"],
  ["channel runtime-gate-packet", "scripts/channel-runtime-gate-packet.mjs", "channel", "C", "gate-preview", "Build runtime gate packet"],
  ["channel runtime-evidence-bridge", "scripts/channel-runtime-evidence-bridge.mjs", "channel", "C", "gate-preview", "Bridge runtime evidence into readiness state"],
  ["channel runtime-inventory-summary", "scripts/channel-runtime-inventory-summary.mjs", "channel", "C", "summary", "Summarize runtime inventory"],
  ["channel runtime-registry", "scripts/channel-runtime-registry.mjs", "channel", "C", "summary", "Build channel runtime registry state"],
  ["channel system-decision-flow", "scripts/channel-system-decision-flow.mjs", "channel", "C", "report", "Build end-to-end channel decision flow"],
  ["channel subscription-activation-fixture", "scripts/channel-subscription-activation-flow-fixture.mjs", "channel", "C", "fixture", "Create activation flow fixture"],
  ["channel subscription-activation-replay", "scripts/channel-subscription-activation-flow-replay.mjs", "channel", "C", "replay", "Replay activation flow fixture"],
  ["channel subscription-activation-package", "scripts/channel-subscription-activation-package.mjs", "channel", "C", "gate-preview", "Build activation package preview"],
  ["channel production-module", "scripts/channel-production-module.mjs", "channel", "C", "gate-preview", "Prepare production module evidence"],
  ["channel subscription-activation-record-template", "scripts/channel-subscription-activation-record-template.mjs", "channel", "C", "template", "Create activation record template"],
  ["channel subscription-render-proof", "scripts/channel-subscription-render-proof.mjs", "channel", "C", "render-proof", "Produce subscription render proof"],
  ["platform controlled-open", "scripts/platform-controlled-open.mjs", "platform", "B", "dry-run", "Build controlled-open delivery plan"],
  ["platform provisioning-form", "scripts/platform-provisioning-form.mjs", "platform", "B", "preview", "Convert operator facts into issuance input"],
  ["platform issue-subscription", "scripts/platform-issue-subscription.mjs", "platform", "A", "execution-gated", "Issue a controlled subscription after approval", ["docs/CLI_PRODUCTION_PROVISIONING_SOP.md", "docs/SUBSCRIPTION_CONTROL_DATABASE.md", "docs/OPERATOR_CLI_PLATFORM_BOUNDARY.md"]],
  ["platform issue-portal-entry", "scripts/platform-issue-portal-entry.mjs", "platform", "A", "execution-gated", "Issue a dynamic portal entry after approval", ["docs/USER_PORTAL_AUTH_BOUNDARY.md", "docs/CLI_PRODUCTION_PROVISIONING_SOP.md", "docs/SUBSCRIPTION_CONTROL_DATABASE.md"]],
  ["platform resource-package", "scripts/platform-resource-package.mjs", "platform", "B", "package", "Build operator delivery package", ["docs/RESOURCE_PACKAGE_CLI.md", "docs/OPERATOR_CLI_PLATFORM_BOUNDARY.md"]],
  ["platform revoke-access", "scripts/platform-revoke-access.mjs", "platform", "A", "dry-run-only", "Plan access revocation"],
  ["platform access-inventory-summary", "scripts/access-model-inventory-summary.mjs", "platform", "C", "summary", "Summarize access model inventory"],
  ["platform clean-edge-readiness-summary", "scripts/clean-edge-readiness-summary.mjs", "platform", "C", "gate-preview", "Summarize clean edge readiness"]
];

const PACKAGE_SCRIPT_COMMAND_ENTRIES = [
  ["project test", "test", "project", "B", "test", "Run server test suite"],
  ["admin test", "admin:test", "admin", "B", "test", "Run admin UI tests"],
  ["admin build", "admin:build", "admin", "B", "build", "Build admin UI"],
  ["site build", "admin:site:build", "site", "B", "build", "Build public site"],
  ["site verify", "admin:site:verify", "site", "B", "verify", "Verify public site build"],
  ["package dry-run", "pack:dry-run", "package", "C", "dry-run", "Preview npm package contents"]
];

const SPECIAL_COMMAND_ENTRIES = [
  ["commands", null, "project", "C", "read-only", "List registered gccgw commands"],
  ["server start", null, "server", "B", "local-runtime", "Start local gateway server"],
  ["project verify", null, "project", "B", "verify", "Run repository verification"],
  ["env check", null, "env", "C", "read-only", "Check local environment shape"],
  ["ops network-status", null, "ops", "C", "read-only", "Print redacted local network status"]
];

const NODE_SCRIPT_COMMANDS = new Map(
  NODE_SCRIPT_COMMAND_ENTRIES.map(([command, script]) => [command, script])
);

const PACKAGE_SCRIPT_COMMANDS = new Map(
  PACKAGE_SCRIPT_COMMAND_ENTRIES.map(([command, script]) => [command, script])
);

function unique(values = []) {
  return [...new Set(values)];
}

function commandEntry([command, target, domain, riskTier, mode, description, sourceDocs], handler) {
  return {
    command: `gccgw ${command}`,
    domain,
    riskTier,
    mode,
    handler,
    ...(target ? { target } : {}),
    sourceDocs: unique(sourceDocs || DOMAIN_SOURCE_DOCS[domain] || []),
    description
  };
}

export function listCliCommands() {
  return [
    ...SPECIAL_COMMAND_ENTRIES.map((entry) => commandEntry(entry, "internal")),
    ...NODE_SCRIPT_COMMAND_ENTRIES.map((entry) => commandEntry(entry, "node-script")),
    ...PACKAGE_SCRIPT_COMMAND_ENTRIES.map((entry) => commandEntry(entry, "package-script"))
  ].sort((a, b) => a.domain.localeCompare(b.domain) || a.command.localeCompare(b.command));
}

export function buildCliCommandMap({ format = "text" } = {}) {
  const commands = listCliCommands();
  if (format === "json") {
    return {
      type: "gccgw_command_map",
      generatedBy: "gccgw commands",
      commands
    };
  }
  const rows = commands.map((command) => [
    command.command,
    command.domain,
    command.riskTier,
    command.mode,
    command.sourceDocs.join(", "),
    command.description
  ]);
  const lines = [
    "gccgw command map",
    "",
    "Command | Domain | Risk | Mode | Docs | Description",
    "--- | --- | --- | --- | --- | ---",
    ...rows.map((row) => row.join(" | "))
  ];
  return `${lines.join("\n")}\n`;
}

function isHelpArg(value) {
  return value === "help" || value === "--help" || value === "-h";
}

export function buildPackageScriptSpawn(script, platform = process.platform) {
  if (!/^[A-Za-z0-9:_-]+$/.test(script)) {
    throw new Error("Unsupported npm script name");
  }
  if (platform === "win32") {
    return {
      command: "cmd.exe",
      args: ["/d", "/s", "/c", `npm.cmd run ${script}`]
    };
  }
  return {
    command: "npm",
    args: ["run", script]
  };
}

export function buildCliHelp() {
  return `gccgw CLI

Usage:
  gccgw commands [--json]
  gccgw server start
  gccgw project check
  gccgw project verify [--with-admin]
  gccgw env check
  gccgw ops network-status
  gccgw project test
  gccgw admin test
  gccgw admin build
  gccgw site build
  gccgw site verify
  gccgw package dry-run
  gccgw platform <command> [...args]
  gccgw channel <command> [...args]

Common commands:
  gccgw commands
  gccgw commands --json
  gccgw project check
  gccgw project verify --with-admin
  gccgw env check
  gccgw ops network-status
  gccgw site verify
  gccgw package dry-run
  gccgw platform provisioning-form <input.json>
  gccgw platform issue-subscription [--dry-run] <input.json>
  gccgw platform issue-portal-entry [--dry-run] <input.json>
  gccgw platform revoke-access <tenant-ref> --dry-run
  gccgw channel dry-run <config.json>

No-arg compatibility:
  gccgw
    Starts the local proxy gateway server.
`;
}

export function resolveCliCommand(argv = []) {
  const args = [...argv];
  if (args.length === 0) {
    return { kind: "start-server" };
  }
  if (isHelpArg(args[0])) {
    return { kind: "help" };
  }
  if (args[0] === "commands") {
    return {
      kind: "command-map",
      format: args.includes("--json") ? "json" : "text"
    };
  }
  if (args[0] === "server" && (args[1] === undefined || args[1] === "start")) {
    return { kind: "start-server" };
  }
  if (args[0] === "project" && args[1] === "verify") {
    return {
      kind: "project-verify",
      withAdmin: args.includes("--with-admin")
    };
  }
  if (args[0] === "env" && args[1] === "check") {
    return { kind: "env-check" };
  }
  if (args[0] === "ops" && args[1] === "network-status") {
    return { kind: "network-status" };
  }

  const key = `${args[0] || ""} ${args[1] || ""}`.trim();
  const script = NODE_SCRIPT_COMMANDS.get(key);
  if (script) {
    return {
      kind: "node-script",
      script,
      args: args.slice(2)
    };
  }

  const packageScript = PACKAGE_SCRIPT_COMMANDS.get(key);
  if (packageScript) {
    return {
      kind: "package-script",
      script: packageScript
    };
  }

  throw new Error(`Unknown gccgw command: ${args.join(" ")}`);
}

function safeIssue(issue) {
  return {
    code: String(issue?.code || "unknown"),
    severity: String(issue?.severity || "unknown")
  };
}

function safePort(port) {
  return {
    port: Number(port?.port) || 0,
    listening: port?.listening === true,
    process: port?.process ? String(port.process) : null
  };
}

export function redactNetworkStatus(status) {
  const ports = {};
  for (const [name, value] of Object.entries(status?.ports || {})) {
    ports[name] = safePort(value);
  }

  return {
    ok: status?.ok === true,
    action: String(status?.action || "status"),
    generatedAt: String(status?.generatedAt || ""),
    summary: {
      consoleListening: status?.summary?.consoleListening === true,
      socksListening: status?.summary?.socksListening === true,
      httpProxyListening: status?.summary?.httpProxyListening === true,
      systemProxyTargetOk: status?.summary?.systemProxyTargetOk === true,
      envProxyTargetOk: status?.summary?.envProxyTargetOk === true,
      winHttpTargetOk: status?.summary?.winHttpTargetOk === true,
      clashPotentialConflict: status?.summary?.clashPotentialConflict === true,
      autostartEnabled: status?.summary?.autostartEnabled === true
    },
    ports,
    issues: (status?.issues || []).map(safeIssue),
    actions: (status?.actions || []).map((action) => String(action)),
    redacted: true
  };
}

async function runStep(step) {
  const code = await step();
  return code === 0 ? 0 : code || 1;
}

async function runProjectVerify({ withAdmin }, {
  runGitDiffCheck,
  runNodeScript,
  runPackageScript
}) {
  const steps = [
    () => runGitDiffCheck(),
    () => runNodeScript("scripts/check-project-state.mjs", []),
    () => runPackageScript("test")
  ];
  if (withAdmin) {
    steps.push(
      () => runPackageScript("admin:test"),
      () => runPackageScript("admin:build")
    );
  }

  for (const step of steps) {
    const code = await runStep(step);
    if (code !== 0) return code;
  }
  return 0;
}

export async function runProxyGatewayCli(argv, {
  runNodeScript,
  runPackageScript,
  runGitDiffCheck,
  runEnvCheck,
  runNetworkStatus,
  startServer,
  writeStdout = (text) => process.stdout.write(text),
  writeStderr = (text) => process.stderr.write(text)
}) {
  try {
    const command = resolveCliCommand(argv);
    if (command.kind === "help") {
      writeStdout(buildCliHelp());
      return 0;
    }
    if (command.kind === "command-map") {
      const commandMap = buildCliCommandMap({ format: command.format });
      writeStdout(command.format === "json" ? `${JSON.stringify(commandMap, null, 2)}\n` : commandMap);
      return 0;
    }
    if (command.kind === "start-server") {
      return await startServer();
    }
    if (command.kind === "node-script") {
      return await runNodeScript(command.script, command.args);
    }
    if (command.kind === "package-script") {
      return await runPackageScript(command.script);
    }
    if (command.kind === "project-verify") {
      return await runProjectVerify(command, { runGitDiffCheck, runNodeScript, runPackageScript });
    }
    if (command.kind === "env-check") {
      return await runEnvCheck();
    }
    if (command.kind === "network-status") {
      return await runNetworkStatus();
    }
    throw new Error(`Unsupported gccgw command kind: ${command.kind}`);
  } catch (error) {
    writeStderr(`${error.message}\n`);
    return 1;
  }
}
