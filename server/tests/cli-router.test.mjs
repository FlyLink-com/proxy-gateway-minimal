import assert from "node:assert/strict";
import test from "node:test";
import {
  buildCliArchitectureMap,
  buildBackupPlan,
  buildBackupPreflightReport,
  buildCliDocsMap,
  buildGccgwSelfCheckReport,
  buildInstallPlan,
  buildInstallPreflightReport,
  buildPackageScriptSpawn,
  buildCliCommandMap,
  buildCliHelp,
  buildReleasePlan,
  buildReleaseStatusReport,
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
  assert.match(help, /gccgw self check/);
  assert.match(help, /gccgw install plan/);
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

test("gccgw CLI resolves env, self, and ops checks", () => {
  assert.deepEqual(resolveCliCommand(["env", "check"]), {
    kind: "env-check"
  });
  assert.deepEqual(resolveCliCommand(["self", "check"]), {
    kind: "self-check"
  });
  assert.deepEqual(resolveCliCommand(["ops", "network-status"]), {
    kind: "network-status"
  });
});

test("gccgw CLI resolves install and service commands without mutating by default", () => {
  assert.deepEqual(resolveCliCommand(["install", "plan"]), {
    kind: "install-plan",
    format: "text"
  });
  assert.deepEqual(resolveCliCommand(["install", "plan", "--json"]), {
    kind: "install-plan",
    format: "json"
  });
  assert.deepEqual(resolveCliCommand(["install", "preflight", "--json"]), {
    kind: "install-preflight",
    format: "json"
  });
  assert.deepEqual(resolveCliCommand(["service", "status", "--json"]), {
    kind: "service-status",
    format: "json"
  });
  assert.deepEqual(resolveCliCommand(["install", "bootstrap", "--execute-production-mutation", "--apply"]), {
    kind: "node-script",
    script: "scripts/gccgw-install-bootstrap.mjs",
    args: ["--execute-production-mutation", "--apply"]
  });
});

test("gccgw CLI exposes business facade commands for node, subscription, backup, and release", () => {
  const commands = listCliCommands();
  const commandNames = commands.map((entry) => entry.command);

  assert.ok(commandNames.includes("gccgw node plan"));
  assert.ok(commandNames.includes("gccgw node preflight"));
  assert.ok(commandNames.includes("gccgw node bootstrap"));
  assert.ok(commandNames.includes("gccgw node status"));
  assert.ok(commandNames.includes("gccgw subscription form"));
  assert.ok(commandNames.includes("gccgw subscription issue"));
  assert.ok(commandNames.includes("gccgw subscription portal-entry"));
  assert.ok(commandNames.includes("gccgw subscription revoke"));
  assert.ok(commandNames.includes("gccgw backup plan"));
  assert.ok(commandNames.includes("gccgw backup preflight"));
  assert.ok(commandNames.includes("gccgw backup restore-preflight"));
  assert.ok(commandNames.includes("gccgw release plan"));
  assert.ok(commandNames.includes("gccgw release status"));

  const riskA = commands.filter((entry) => entry.command === "gccgw node bootstrap" || entry.command === "gccgw subscription issue" || entry.command === "gccgw subscription portal-entry");
  assert.ok(riskA.every((entry) => entry.riskTier === "A" && entry.approvalPrompt));
});

test("gccgw CLI resolves node and subscription facade commands to existing safe handlers", () => {
  assert.deepEqual(resolveCliCommand(["node", "plan", "--json"]), {
    kind: "install-plan",
    format: "json"
  });
  assert.deepEqual(resolveCliCommand(["node", "preflight"]), {
    kind: "install-preflight",
    format: "text"
  });
  assert.deepEqual(resolveCliCommand(["node", "bootstrap", "--execute-production-mutation", "--apply"]), {
    kind: "node-script",
    script: "scripts/gccgw-install-bootstrap.mjs",
    commandName: "gccgw node bootstrap",
    args: ["--execute-production-mutation", "--apply"]
  });
  assert.deepEqual(resolveCliCommand(["node", "status", "--json"]), {
    kind: "service-status",
    format: "json"
  });
  assert.deepEqual(resolveCliCommand(["subscription", "form", "facts.json"]), {
    kind: "node-script",
    script: "scripts/platform-provisioning-form.mjs",
    commandName: "gccgw subscription form",
    args: ["facts.json"]
  });
  assert.deepEqual(resolveCliCommand(["subscription", "issue", "--dry-run", "input.json"]), {
    kind: "node-script",
    script: "scripts/platform-issue-subscription.mjs",
    commandName: "gccgw subscription issue",
    args: ["--dry-run", "input.json"]
  });
  assert.deepEqual(resolveCliCommand(["subscription", "portal-entry", "--dry-run", "input.json"]), {
    kind: "node-script",
    script: "scripts/platform-issue-portal-entry.mjs",
    commandName: "gccgw subscription portal-entry",
    args: ["--dry-run", "input.json"]
  });
  assert.deepEqual(resolveCliCommand(["subscription", "revoke", "tenant-ref", "--dry-run"]), {
    kind: "node-script",
    script: "scripts/platform-revoke-access.mjs",
    commandName: "gccgw subscription revoke",
    args: ["tenant-ref", "--dry-run"]
  });
});

test("gccgw CLI resolves backup and release facade commands as read-only internal checks", () => {
  assert.deepEqual(resolveCliCommand(["backup", "plan"]), {
    kind: "backup-plan",
    format: "text"
  });
  assert.deepEqual(resolveCliCommand(["backup", "preflight", "--json"]), {
    kind: "backup-preflight",
    mode: "backup",
    format: "json"
  });
  assert.deepEqual(resolveCliCommand(["backup", "restore-preflight", "--json"]), {
    kind: "backup-preflight",
    mode: "restore",
    format: "json"
  });
  assert.deepEqual(resolveCliCommand(["release", "plan", "--json"]), {
    kind: "release-plan",
    format: "json"
  });
  assert.deepEqual(resolveCliCommand(["release", "status"]), {
    kind: "release-status",
    format: "text"
  });
});

test("gccgw backup and release reports stay redacted and non-mutating", () => {
  const backupPlan = buildBackupPlan({ format: "json" });
  assert.equal(backupPlan.type, "gccgw_backup_plan");
  assert.equal(backupPlan.mutationAllowed, false);
  assert.ok(backupPlan.commands.some((entry) => entry.command === "scripts/backup-subscriptions.sh"));
  assert.ok(backupPlan.commands.some((entry) => entry.command.includes("restore-subscriptions.sh")));
  assert.doesNotMatch(JSON.stringify(backupPlan), /TOKEN|SECRET|PASSWORD|subscriptionUrl|C:\\\\/i);

  const backupPreflight = buildBackupPreflightReport({
    platform: "linux",
    files: {
      backupScript: true,
      restoreScript: true
    },
    commands: {
      bash: true,
      sqlite3: true,
      systemctl: false
    }
  });
  assert.equal(backupPreflight.type, "gccgw_backup_preflight");
  assert.equal(backupPreflight.ok, true);
  assert.equal(backupPreflight.redacted, true);

  const restorePreflight = buildBackupPreflightReport({
    mode: "restore",
    platform: "linux",
    files: {
      backupScript: true,
      restoreScript: true
    },
    commands: {
      bash: true,
      sqlite3: true,
      systemctl: true
    }
  });
  assert.equal(restorePreflight.mode, "restore");
  assert.equal(restorePreflight.ok, true);

  const releasePlan = buildReleasePlan({ format: "json" });
  assert.equal(releasePlan.type, "gccgw_release_plan");
  assert.equal(releasePlan.mutationAllowed, false);
  assert.ok(releasePlan.steps.some((step) => step.name === "package"));
  assert.doesNotMatch(JSON.stringify(releasePlan), /TOKEN|SECRET|PASSWORD|subscriptionUrl|C:\\\\/i);

  const releaseStatus = buildReleaseStatusReport({
    files: {
      packageJson: true,
      releaseJson: false
    },
    git: {
      head: "abc1234",
      branch: "feature/test"
    }
  });
  assert.equal(releaseStatus.type, "gccgw_release_status");
  assert.equal(releaseStatus.redacted, true);
  assert.equal(releaseStatus.git.head, "abc1234");
});

test("gccgw subscription and node aliases use their own Risk A approval labels", async () => {
  const approvals = [];
  const calls = [];
  const exitCode = await runProxyGatewayCli([
    "subscription",
    "issue",
    "--execute-production-mutation",
    "--dry-run",
    "input.json"
  ], {
    confirmRiskAExecution: async (approval) => {
      approvals.push(approval);
      return true;
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
  assert.equal(approvals[0].command, "gccgw subscription issue");
  assert.deepEqual(calls, [{
    script: "scripts/platform-issue-subscription.mjs",
    args: ["--execute-production-mutation", "--dry-run", "input.json"]
  }]);
});

test("gccgw backup and release commands run through read-only adapters", async () => {
  const calls = [];
  const backupExit = await runProxyGatewayCli(["backup", "preflight", "--json"], {
    runBackupPreflight: async (command) => {
      calls.push(["backup-preflight", command.mode, command.format]);
      return 0;
    },
    runNodeScript: async () => {
      throw new Error("node script must not run for backup preflight");
    },
    startServer: async () => 0,
    writeStdout: () => {},
    writeStderr: () => {}
  });
  const releaseExit = await runProxyGatewayCli(["release", "status", "--json"], {
    runReleaseStatus: async (command) => {
      calls.push(["release-status", command.format]);
      return 0;
    },
    runNodeScript: async () => {
      throw new Error("node script must not run for release status");
    },
    startServer: async () => 0,
    writeStdout: () => {},
    writeStderr: () => {}
  });

  assert.equal(backupExit, 0);
  assert.equal(releaseExit, 0);
  assert.deepEqual(calls, [
    ["backup-preflight", "backup", "json"],
    ["release-status", "json"]
  ]);
});

test("gccgw self check report keeps global PATH command optional and redacted", () => {
  const report = buildGccgwSelfCheckReport({
    nodeVersion: "v24.0.0",
    npmCliScriptConfigured: true,
    localBinExists: true,
    packageBinConfigured: true,
    globalCommandAvailable: false
  });

  assert.equal(report.type, "gccgw_self_check");
  assert.equal(report.ok, true);
  assert.equal(report.redacted, true);
  assert.deepEqual(report.checks.globalPathCommand, {
    ok: false,
    required: false,
    command: "gccgw"
  });
  assert.ok(report.guidance.some((item) => item.includes("npm run cli --")));
  assert.ok(report.guidance.some((item) => item.includes("npm link")));
  assert.doesNotMatch(JSON.stringify(report), /TOKEN|SECRET|PASSWORD|subscriptionUrl|C:\\\\/i);
});

test("gccgw install plan and preflight reports are redacted and explicit about mutation gates", () => {
  const plan = buildInstallPlan({ format: "json" });

  assert.equal(plan.type, "gccgw_install_plan");
  assert.equal(plan.riskTier, "A for bootstrap execution");
  assert.ok(plan.commands.some((command) => command.command === "gccgw install bootstrap --execute-production-mutation --apply"));
  assert.doesNotMatch(JSON.stringify(plan), /TOKEN|SECRET|PASSWORD|subscriptionUrl|C:\\\\/i);

  const preflight = buildInstallPreflightReport({
    platform: "linux",
    files: {
      packageJson: true,
      bootstrap: true,
      consoleUnit: true,
      ssUnit: true,
      nginxTemplate: true,
      envTemplate: true
    },
    commands: {
      node: true,
      npm: true,
      git: true,
      bash: true,
      systemctl: true,
      nginx: true
    },
    isRoot: false
  });

  assert.equal(preflight.type, "gccgw_install_preflight");
  assert.equal(preflight.ok, true);
  assert.equal(preflight.redacted, true);
  assert.equal(preflight.checks.rootForBootstrap.ok, false);
  assert.equal(preflight.checks.rootForBootstrap.required, false);
  assert.doesNotMatch(JSON.stringify(preflight), /TOKEN|SECRET|PASSWORD|subscriptionUrl|C:\\\\/i);
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

test("gccgw CLI resolves command-scoped help before dispatching scripts", async () => {
  assert.deepEqual(resolveCliCommand(["channel", "validate", "--help"]), {
    kind: "command-help",
    query: "channel validate"
  });
  assert.deepEqual(resolveCliCommand(["platform", "issue-subscription", "--help"]), {
    kind: "command-help",
    query: "platform issue-subscription"
  });
  assert.deepEqual(resolveCliCommand(["install", "plan", "--help"]), {
    kind: "command-help",
    query: "install plan"
  });

  let stdout = "";
  const exitCode = await runProxyGatewayCli(["channel", "validate", "--help"], {
    runNodeScript: async () => {
      throw new Error("node script must not run for command-scoped help");
    },
    runPackageScript: async () => {
      throw new Error("package script must not run for command-scoped help");
    },
    startServer: async () => {
      throw new Error("server must not start for command-scoped help");
    },
    writeStdout: (value) => {
      stdout += value;
    },
    writeStderr: () => {}
  });

  assert.equal(exitCode, 0);
  assert.match(stdout, /gccgw channel validate/);
  assert.match(stdout, /Risk: B/);
  assert.match(stdout, /Alias of: gccgw channel dry-run/);
  assert.match(stdout, /Docs:/);
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
  assert.ok(names.includes("gccgw self check"));
  assert.ok(names.includes("gccgw install plan"));
  assert.ok(names.includes("gccgw install preflight"));
  assert.ok(names.includes("gccgw install bootstrap"));
  assert.ok(names.includes("gccgw service status"));
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

  const selfCheck = commands.find((command) => command.command === "gccgw self check");
  assert.equal(selfCheck.domain, "env");
  assert.equal(selfCheck.riskTier, "C");
  assert.equal(selfCheck.mode, "read-only");
  assert.equal(selfCheck.surface, "operator");

  const installBootstrap = commands.find((command) => command.command === "gccgw install bootstrap");
  assert.equal(installBootstrap.domain, "install");
  assert.equal(installBootstrap.riskTier, "A");
  assert.equal(installBootstrap.mode, "execution-gated");
  assert.equal(installBootstrap.approvalPrompt, "required for --execute-production-mutation");
  assert.ok(installBootstrap.sourceDocs.includes("ops/edge-node/README.md"));

  const serviceStatus = commands.find((command) => command.command === "gccgw service status");
  assert.equal(serviceStatus.domain, "service");
  assert.equal(serviceStatus.riskTier, "C");
  assert.equal(serviceStatus.mode, "read-only");

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

test("gccgw env check, install checks, service status, self check, and ops network status use injected adapters", async () => {
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
  const selfExit = await runProxyGatewayCli(["self", "check"], {
    runSelfCheck: async () => {
      calls.push(["self-check"]);
      return 0;
    },
    runNodeScript: async () => {
      throw new Error("node script must not run for self check");
    },
    startServer: async () => 0,
    writeStdout: () => {},
    writeStderr: () => {}
  });
  const installPreflightExit = await runProxyGatewayCli(["install", "preflight"], {
    runInstallPreflight: async (command) => {
      calls.push(["install-preflight", command.format]);
      return 0;
    },
    runNodeScript: async () => {
      throw new Error("node script must not run for install preflight");
    },
    startServer: async () => 0,
    writeStdout: () => {},
    writeStderr: () => {}
  });
  const serviceStatusExit = await runProxyGatewayCli(["service", "status", "--json"], {
    runServiceStatus: async (command) => {
      calls.push(["service-status", command.format]);
      return 0;
    },
    runNodeScript: async () => {
      throw new Error("node script must not run for service status");
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
  assert.equal(selfExit, 0);
  assert.equal(installPreflightExit, 0);
  assert.equal(serviceStatusExit, 0);
  assert.equal(networkExit, 0);
  assert.deepEqual(calls, [
    ["env-check"],
    ["self-check"],
    ["install-preflight", "text"],
    ["service-status", "json"],
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
