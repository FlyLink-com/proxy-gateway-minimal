const NODE_SCRIPT_COMMANDS = new Map([
  ["project check", "scripts/check-project-state.mjs"],
  ["channel dry-run", "scripts/channel-config-dry-run.mjs"],
  ["channel benchmark-run", "scripts/channel-benchmark-runner.mjs"],
  ["channel benchmark-fixture", "scripts/channel-benchmark-fixture.mjs"],
  ["channel benchmark-summary", "scripts/channel-benchmark-summary.mjs"],
  ["channel benchmark-score", "scripts/channel-benchmark-score.mjs"],
  ["channel candidate-report", "scripts/channel-candidate-report.mjs"],
  ["channel candidate-comparison", "scripts/channel-candidate-comparison.mjs"],
  ["channel decision-pack", "scripts/channel-decision-pack.mjs"],
  ["channel extended-assessment", "scripts/channel-extended-assessment.mjs"],
  ["channel extended-report", "scripts/channel-extended-report.mjs"],
  ["channel measurement-bundle", "scripts/channel-measurement-bundle.mjs"],
  ["channel measurement-investigation", "scripts/channel-measurement-investigation.mjs"],
  ["channel runtime-gate-packet", "scripts/channel-runtime-gate-packet.mjs"],
  ["channel runtime-evidence-bridge", "scripts/channel-runtime-evidence-bridge.mjs"],
  ["channel runtime-inventory-summary", "scripts/channel-runtime-inventory-summary.mjs"],
  ["channel runtime-registry", "scripts/channel-runtime-registry.mjs"],
  ["channel system-decision-flow", "scripts/channel-system-decision-flow.mjs"],
  ["channel subscription-activation-fixture", "scripts/channel-subscription-activation-flow-fixture.mjs"],
  ["channel subscription-activation-replay", "scripts/channel-subscription-activation-flow-replay.mjs"],
  ["channel subscription-activation-package", "scripts/channel-subscription-activation-package.mjs"],
  ["channel production-module", "scripts/channel-production-module.mjs"],
  ["channel subscription-activation-record-template", "scripts/channel-subscription-activation-record-template.mjs"],
  ["channel subscription-render-proof", "scripts/channel-subscription-render-proof.mjs"],
  ["platform controlled-open", "scripts/platform-controlled-open.mjs"],
  ["platform provisioning-form", "scripts/platform-provisioning-form.mjs"],
  ["platform issue-subscription", "scripts/platform-issue-subscription.mjs"],
  ["platform issue-portal-entry", "scripts/platform-issue-portal-entry.mjs"],
  ["platform resource-package", "scripts/platform-resource-package.mjs"],
  ["platform revoke-access", "scripts/platform-revoke-access.mjs"],
  ["platform access-inventory-summary", "scripts/access-model-inventory-summary.mjs"],
  ["platform clean-edge-readiness-summary", "scripts/clean-edge-readiness-summary.mjs"]
]);

const PACKAGE_SCRIPT_COMMANDS = new Map([
  ["project test", "test"],
  ["admin test", "admin:test"],
  ["admin build", "admin:build"],
  ["site build", "admin:site:build"],
  ["site verify", "admin:site:verify"],
  ["package dry-run", "pack:dry-run"]
]);

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
