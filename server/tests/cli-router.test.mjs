import assert from "node:assert/strict";
import test from "node:test";
import {
  buildCliArchitectureMap,
  buildBackupPlan,
  buildBackupPreflightReport,
  buildCliCapabilityRegistry,
  buildCliDocsMap,
  buildGccgwSelfCheckReport,
  buildInstallConfigurePlan,
  buildInstallPlan,
  buildInstallPreflightReport,
  buildPackageApplyPlan,
  validateInstallConfigurePlanEnvelope,
  validatePackageApplyPlanEnvelope,
  buildPackageImportDryRunReport,
  buildPackageInspectReport,
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

function cliAdapters(overrides = {}) {
  return {
    runNodeScript: async () => {
      throw new Error("node script must not run for this CLI test");
    },
    runPackageScript: async () => {
      throw new Error("npm package script must not run for this CLI test");
    },
    runGitDiffCheck: async () => 0,
    runEnvCheck: async () => 0,
    runSelfCheck: async () => 0,
    runInstallPreflight: async () => 0,
    runBackupPreflight: async () => 0,
    runReleaseStatus: async () => 0,
    runServiceStatus: async () => 0,
    runNetworkStatus: async () => 0,
    runPackageImportDryRun: async () => 0,
    runPackageApply: async () => 0,
    runPackageInspect: async () => 0,
    runInstallConfigure: async () => 0,
    startServer: async () => 0,
    confirmRiskAExecution: async () => false,
    readJsonFile: () => {
      throw new Error("JSON file reads are not expected for this CLI test");
    },
    writeStdout: () => {},
    writeStderr: () => {},
    ...overrides
  };
}

test("gccgw CLI help exposes normalized command groups", () => {
  const help = buildCliHelp();

  assert.match(help, /gccgw project check/);
  assert.match(help, /gccgw project export --json/);
  assert.match(help, /gccgw project drift --input <project-export\.json> --json/);
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

test("gccgw CLI resolves read-only Project export and drift commands", () => {
  assert.deepEqual(resolveCliCommand(["project", "export", "--json"]), {
    kind: "node-script",
    script: "scripts/project-export.mjs",
    args: ["--json"]
  });
  assert.deepEqual(resolveCliCommand([
    "project",
    "drift",
    "--input",
    "project-export.json",
    "--json"
  ]), {
    kind: "node-script",
    script: "scripts/project-drift.mjs",
    args: ["--input", "project-export.json", "--json"]
  });
});

test("gccgw CLI resolves node image readiness summaries to the safe gate preview script", () => {
  assert.deepEqual(resolveCliCommand(["node", "image-readiness-summary", "safe-input.json"]), {
    kind: "node-script",
    script: "scripts/node-image-provisioning-readiness-summary.mjs",
    commandName: "gccgw node image-readiness-summary",
    args: ["safe-input.json"]
  });
});

test("gccgw CLI resolves node image first-boot packets to the safe gate preview script", () => {
  assert.deepEqual(resolveCliCommand(["node", "image-first-boot-packet", "safe-input.json"]), {
    kind: "node-script",
    script: "scripts/node-image-first-boot-packet.mjs",
    commandName: "gccgw node image-first-boot-packet",
    args: ["safe-input.json"]
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
  assert.deepEqual(resolveCliCommand([
    "install",
    "configure",
    "--dry-run",
    "--domain",
    "https://sub.example.invalid",
    "--install-dir",
    "/opt/gccgw",
    "--management-source",
    "203.0.113.10/32",
    "--json"
  ]), {
    kind: "install-configure",
    format: "json",
    dryRun: true,
    domain: "https://sub.example.invalid",
    installDir: "/opt/gccgw",
    managementSource: "203.0.113.10/32",
    consolePort: undefined,
    targetRole: undefined
  });
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

  assert.ok(commandNames.includes("gccgw edge tuic-credentials plan"));
  assert.ok(commandNames.includes("gccgw edge tuic-credentials apply"));
  assert.ok(commandNames.includes("gccgw edge credentials reconcile-plan"));
  assert.ok(commandNames.includes("gccgw edge credentials apply"));
  assert.ok(commandNames.includes("gccgw node inspect"));
  assert.ok(commandNames.includes("gccgw node validate"));
  assert.ok(commandNames.includes("gccgw node policy-check"));
  assert.ok(commandNames.includes("gccgw node data-plane-lifecycle-policy"));
  assert.ok(commandNames.includes("gccgw node register"));
  assert.ok(commandNames.includes("gccgw node disable"));
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

test("gccgw edge tuic-credentials commands stay redacted and gated", async () => {
  assert.deepEqual(resolveCliCommand([
    "edge",
    "tuic-credentials",
    "plan",
    "--input",
    "desired-state.json",
    "--json"
  ]), {
    kind: "edge-tuic-credentials-plan",
    inputPath: "desired-state.json",
    format: "json"
  });
  assert.deepEqual(resolveCliCommand([
    "edge",
    "tuic-credentials",
    "apply",
    "--input",
    "desired-state.json",
    "--execute-production-mutation",
    "--json"
  ]), {
    kind: "edge-tuic-credentials-apply",
    commandName: "gccgw edge tuic-credentials apply",
    inputPath: "desired-state.json",
    executeProductionMutation: true,
    format: "json"
  });

  const stdout = [];
  const exitCode = await runProxyGatewayCli([
    "edge",
    "tuic-credentials",
    "plan",
    "--input",
    "desired-state.json",
    "--json"
  ], {
    runNodeScript: async () => {
      throw new Error("node script must not run for TUIC credential plan");
    },
    runPackageScript: async () => {
      throw new Error("npm package script must not run for TUIC credential plan");
    },
    startServer: async () => {
      throw new Error("server must not start for TUIC credential plan");
    },
    readJsonFile: (path) => {
      assert.equal(path, "desired-state.json");
      return {
        node: "channel-lab-b-tuic",
        runtime: "mihomo-tuic",
        actions: [
          {
            action: "add",
            credentialRef: "order_ref_add",
            expiresAt: "2026-07-05T00:00:00.000Z"
          }
        ]
      };
    },
    writeStdout: (text) => stdout.push(text),
    writeStderr: () => {}
  });

  assert.equal(exitCode, 0);
  const report = JSON.parse(stdout.join(""));
  assert.equal(report.type, "gccgw_edge_tuic_credential_lifecycle_plan");
  assert.equal(report.ok, true);
  assert.equal(report.redacted, true);
  assert.doesNotMatch(JSON.stringify(report), /password|token|subscriptionUrl|rawConfig|sqliteRow/i);

  const applyStdout = [];
  const blockedApplyCode = await runProxyGatewayCli([
    "edge",
    "tuic-credentials",
    "apply",
    "--input",
    "desired-state.json",
    "--json"
  ], {
    runNodeScript: async () => {
      throw new Error("node script must not run for TUIC credential apply");
    },
    runPackageScript: async () => {
      throw new Error("npm package script must not run for TUIC credential apply");
    },
    startServer: async () => {
      throw new Error("server must not start for TUIC credential apply");
    },
    confirmRiskAExecution: async () => {
      throw new Error("approval prompt must not run when execution flag is absent");
    },
    readJsonFile: () => ({
      node: "channel-lab-b-tuic",
      runtime: "mihomo-tuic",
      actions: [
        {
          action: "disable",
          credentialRef: "order_ref_expired",
          reason: "order_expired"
        }
      ]
    }),
    writeStdout: (text) => applyStdout.push(text),
    writeStderr: () => {}
  });

  assert.equal(blockedApplyCode, 1);
  const blockedApply = JSON.parse(applyStdout.join(""));
  assert.equal(blockedApply.type, "gccgw_edge_tuic_credential_lifecycle_apply_plan");
  assert.equal(blockedApply.ok, false);
  assert.ok(blockedApply.blockers.some((blocker) => blocker.code === "execute_production_mutation_required"));
  assert.equal(blockedApply.redacted, true);

  const approvedApplyStdout = [];
  const approvals = [];
  const approvedApplyCode = await runProxyGatewayCli([
    "edge",
    "tuic-credentials",
    "apply",
    "--input",
    "desired-state.json",
    "--execute-production-mutation",
    "--json"
  ], {
    runNodeScript: async () => {
      throw new Error("node script must not run for TUIC credential apply");
    },
    runPackageScript: async () => {
      throw new Error("npm package script must not run for TUIC credential apply");
    },
    startServer: async () => {
      throw new Error("server must not start for TUIC credential apply");
    },
    confirmRiskAExecution: async (approval) => {
      approvals.push(approval);
      return true;
    },
    readJsonFile: () => ({
      node: "channel-lab-b-tuic",
      runtime: "mihomo-tuic",
      actions: [
        {
          action: "rotate",
          credentialRef: "order_ref_rotate",
          nextCredentialRef: "order_ref_rotate_next"
        }
      ]
    }),
    writeStdout: (text) => approvedApplyStdout.push(text),
    writeStderr: () => {}
  });

  assert.equal(approvedApplyCode, 1);
  assert.equal(approvals.length, 1);
  assert.equal(approvals[0].command, "gccgw edge tuic-credentials apply");
  const approvedApply = JSON.parse(approvedApplyStdout.join(""));
  assert.equal(approvedApply.type, "gccgw_edge_tuic_credential_lifecycle_apply_plan");
  assert.equal(approvedApply.ok, false);
  assert.ok(approvedApply.blockers.some((blocker) => blocker.code === "runtime_apply_adapter_not_implemented"));
  assert.equal(approvedApply.redacted, true);
});

test("gccgw edge credentials reconciliation commands stay redacted and gated", async () => {
  assert.deepEqual(resolveCliCommand([
    "edge",
    "credentials",
    "reconcile-plan",
    "--input",
    "desired-state.json",
    "--json"
  ]), {
    kind: "edge-credentials-reconcile-plan",
    inputPath: "desired-state.json",
    format: "json"
  });
  assert.deepEqual(resolveCliCommand([
    "edge",
    "credentials",
    "apply",
    "--input",
    "desired-state.json",
    "--execute-production-mutation",
    "--json"
  ]), {
    kind: "edge-credentials-apply",
    commandName: "gccgw edge credentials apply",
    inputPath: "desired-state.json",
    executeProductionMutation: true,
    format: "json"
  });

  const desiredState = {
    channelRef: "channel-aliyun-a-tuic",
    runtime: "mihomo-tuic",
    activationSurface: "explicit-restart",
    desiredStateRef: "desired_state_aliyun_001",
    desiredCredentials: [
      {
        credentialRef: "order_ref_new",
        orderRef: "order_new",
        userRef: "portal_user_001",
        expiresAt: "2026-07-05T00:00:00.000Z",
        materialDigest: "sha256:new_digest"
      }
    ],
    currentCredentials: []
  };

  const stdout = [];
  const exitCode = await runProxyGatewayCli([
    "edge",
    "credentials",
    "reconcile-plan",
    "--input",
    "desired-state.json",
    "--json"
  ], {
    runNodeScript: async () => {
      throw new Error("node script must not run for edge credential reconciliation plan");
    },
    runPackageScript: async () => {
      throw new Error("npm package script must not run for edge credential reconciliation plan");
    },
    startServer: async () => {
      throw new Error("server must not start for edge credential reconciliation plan");
    },
    readJsonFile: (path) => {
      assert.equal(path, "desired-state.json");
      return desiredState;
    },
    writeStdout: (text) => stdout.push(text),
    writeStderr: () => {}
  });

  assert.equal(exitCode, 0);
  const report = JSON.parse(stdout.join(""));
  assert.equal(report.type, "gccgw_edge_credential_reconciliation_plan");
  assert.equal(report.ok, true);
  assert.equal(report.redacted, true);
  assert.doesNotMatch(JSON.stringify(report), /new_digest|password|token|subscriptionUrl|rawConfig|sqliteRow/i);

  const applyStdout = [];
  const blockedApplyCode = await runProxyGatewayCli([
    "edge",
    "credentials",
    "apply",
    "--input",
    "desired-state.json",
    "--json"
  ], {
    confirmRiskAExecution: async () => {
      throw new Error("approval prompt must not run when execution flag is absent");
    },
    readJsonFile: () => desiredState,
    writeStdout: (text) => applyStdout.push(text),
    writeStderr: () => {}
  });

  assert.equal(blockedApplyCode, 1);
  const blockedApply = JSON.parse(applyStdout.join(""));
  assert.equal(blockedApply.type, "gccgw_edge_credential_reconciliation_apply_plan");
  assert.equal(blockedApply.ok, false);
  assert.ok(blockedApply.blockers.some((blocker) => blocker.code === "execute_production_mutation_required"));
  assert.equal(blockedApply.redacted, true);

  const approvedApplyStdout = [];
  const approvals = [];
  const approvedApplyCode = await runProxyGatewayCli([
    "edge",
    "credentials",
    "apply",
    "--input",
    "desired-state.json",
    "--execute-production-mutation",
    "--json"
  ], {
    confirmRiskAExecution: async (approval) => {
      approvals.push(approval);
      return true;
    },
    readJsonFile: () => desiredState,
    writeStdout: (text) => approvedApplyStdout.push(text),
    writeStderr: () => {}
  });

  assert.equal(approvedApplyCode, 1);
  assert.equal(approvals.length, 1);
  assert.equal(approvals[0].command, "gccgw edge credentials apply");
  const approvedApply = JSON.parse(approvedApplyStdout.join(""));
  assert.equal(approvedApply.type, "gccgw_edge_credential_reconciliation_apply_plan");
  assert.equal(approvedApply.ok, false);
  assert.ok(approvedApply.blockers.some((blocker) => blocker.code === "production_runtime_adapter_required"));
  assert.equal(approvedApply.redacted, true);
});

test("gccgw CLI resolves node and subscription facade commands to existing safe handlers", () => {
  assert.deepEqual(resolveCliCommand(["node", "inspect", "--config", "config/proxy-servers.json", "--json"]), {
    kind: "node-inspect",
    configPath: "config/proxy-servers.json",
    format: "json"
  });
  assert.deepEqual(resolveCliCommand([
    "node",
    "validate",
    "--package",
    "deployments/production-template",
    "--config",
    "config/proxy-servers.json",
    "--json"
  ]), {
    kind: "node-validate",
    packageDir: "deployments/production-template",
    configPath: "config/proxy-servers.json",
    format: "json"
  });
  assert.deepEqual(resolveCliCommand(["node", "register", "--dry-run", "node-facts.json", "--json"]), {
    kind: "node-register-dry-run",
    inputPath: "node-facts.json",
    format: "json"
  });
  assert.deepEqual(resolveCliCommand([
    "node",
    "disable",
    "--dry-run",
    "prod-edge-a",
    "--reason",
    "maintenance",
    "--json"
  ]), {
    kind: "node-disable-dry-run",
    nodeId: "prod-edge-a",
    reason: "maintenance",
    format: "json"
  });
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
  assert.deepEqual(backupPlan.sourceDocs, ["ops/README.md", "docs/RUNTIME_LANE_AUTHORITY.md"]);
  assert.ok(!backupPlan.sourceDocs.includes("docs/PRODUCTION_DR.md"));
  assert.ok(!backupPlan.sourceDocs.includes("docs/DEPLOYMENT_FLOW.md"));
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

test("gccgw install configure derives paths and keeps secrets out of the plan", () => {
  const report = buildInstallConfigurePlan({
    domain: "https://sub.example.invalid",
    installDir: "/opt/gccgw",
    managementSource: "203.0.113.10/32",
    consolePort: "3456",
    targetRole: "aliyun-subscription-control"
  });

  assert.equal(report.type, "gccgw_install_configure_plan");
  assert.equal(report.ok, true);
  assert.equal(report.riskTier, "B");
  assert.equal(report.mutation, false);
  assert.equal(report.productionAuthority, false);
  assert.equal(report.install.installDir, "/opt/gccgw");
  assert.equal(report.install.consolePort, 3456);
  assert.equal(report.publicBaseUrl.https, true);
  assert.equal(report.management.adminAllowedCidrs[0], "203.0.113.10/32");
  assert.equal(report.derivedPaths.runtimeDbPath, "/opt/gccgw/.proxy-gateway/subscriptions.sqlite");
  assert.equal(report.derivedPaths.controlDbPath, "/opt/gccgw/.proxy-gateway/subscription-control.sqlite");
  assert.equal(report.derivedPaths.handoffDir, "/opt/gccgw/handoff");
  assert.equal(report.derivedPaths.envSkeletonPath, "/opt/gccgw/.env");
  assert.equal(report.envSkeleton.some((entry) => entry.name === "SUBSCRIPTION_CONTROL_DB_PATH"), true);
  assert.doesNotMatch(JSON.stringify(report), /replace_with|CONSOLE_TOKEN=.*|SS_PASSWORD=.*|tokenValue|passwordValue/i);
});

test("gccgw install configure fails closed for unsafe install facts", () => {
  const report = buildInstallConfigurePlan({
    domain: "http://sub.example.invalid",
    installDir: "../outside",
    managementSource: "",
    consolePort: "not-a-port"
  });

  assert.equal(report.ok, false);
  assert.equal(report.blockers.some((blocker) => blocker.code === "public_base_url_must_be_https_or_loopback"), true);
  assert.equal(report.blockers.some((blocker) => blocker.code === "install_dir_must_be_absolute"), true);
  assert.equal(report.blockers.some((blocker) => blocker.code === "management_source_required"), true);
  assert.equal(report.blockers.some((blocker) => blocker.code === "console_port_invalid"), true);
});

function productionPackageFiles(overrides = {}) {
  return {
    "package-manifest.json": {
      schema: "gccgw.productionInputPackage.v1",
      metadata: {
        name: "production-template",
        packageKind: "full-project-package",
        environment: "production",
        secretsInGit: false,
        customerDataInGit: false,
        runtimeDataInGit: false
      },
      components: [
        { id: "topology", path: "topology.json", schema: "gccgw.productionTopology.v1", required: true },
        { id: "publicBoundary", path: "public-boundary.json", schema: "gccgw.publicBoundary.v1", required: true },
        { id: "plans", path: "plans.json", schema: "gccgw.subscriptionPlans.v1", required: true },
        { id: "nodes", path: "nodes.json", schema: "gccgw.productionNodes.v1", required: true },
        { id: "requiredEnvironment", path: "env.required.json", schema: "gccgw.requiredEnvironment.v1", required: true },
        { id: "runbook", path: "runbook.md", schema: "markdown.runbook", required: true }
      ],
      registrationPolicy: {
        model: "operator-approved-package-subscription",
        availablePlanRefs: ["monthly", "annual"],
        initialRequestStatus: "pending",
        customerFieldsInPackage: false
      },
      importPhases: [
        { name: "inspect", riskTier: "C", mutation: false },
        { name: "dry-run", riskTier: "B", mutation: false },
        { name: "apply", riskTier: "A", mutation: true }
      ],
      hardStops: ["no raw subscription URLs"]
    },
    "topology.json": {
      schema: "gccgw.productionTopology.v1",
      metadata: { name: "production-template", secretsInGit: false },
      controlPlane: {
        publicBaseUrl: "https://control.example.invalid",
        publicRoutes: ["/api/health", "/sub/a/*"],
        protectedRoutes: ["/api/admin/*"],
        databaseRefs: {
          runtime: "env:SUBSCRIPTION_DB_PATH",
          control: "env:SUBSCRIPTION_CONTROL_DB_PATH"
        }
      },
      dataPlane: { defaultPool: "stable", nodeConfigSource: "config/proxy-servers.json" },
      operatorAccess: { publicAdmin: false }
    },
    "public-boundary.json": {
      schema: "gccgw.publicBoundary.v1",
      metadata: { name: "production-public-boundary", secretsInGit: false },
      expectedRoutes: []
    },
    "plans.json": {
      schema: "gccgw.subscriptionPlans.v1",
      metadata: { name: "simple-package-plans", secretsInGit: false },
      plans: [
        { id: "monthly", durationDays: 30 },
        { id: "annual", durationDays: 365 }
      ]
    },
    "nodes.json": {
      schema: "gccgw.productionNodes.v1",
      metadata: { name: "production-node-slots", secretsInGit: false },
      slots: [
        {
          id: "prod-edge-a",
          pool: "stable",
          hostRef: "runtime:PROD_EDGE_A_HOST",
          credentialRefs: ["env:SS_PASSWORD"],
          subscriptionEligible: true
        }
      ]
    },
    "env.required.json": {
      schema: "gccgw.requiredEnvironment.v1",
      metadata: { name: "production-required-env", secretsInGit: false },
      runtime: [
        { name: "CONSOLE_TOKEN", required: true, secret: true, storage: "protected-host-env" },
        { name: "PUBLIC_SUBSCRIPTION_BASE_URL", required: true, secret: false }
      ]
    },
    "runbook.md": "# Runbook\n",
    ...overrides
  };
}

test("gccgw package inspect validates a non-secret production input package", () => {
  const report = buildPackageInspectReport({
    packageName: "production-template",
    files: productionPackageFiles()
  });

  assert.equal(report.type, "gccgw_package_inspect");
  assert.equal(report.ok, true);
  assert.equal(report.packageName, "production-template");
  assert.equal(report.components.every((component) => component.present && component.schemaOk), true);
  assert.equal(report.checks.noForbiddenFields.ok, true);
  assert.equal(report.checks.registrationPolicyNoCustomerFields.ok, true);
  assert.doesNotMatch(JSON.stringify(report), /subscriptionUrl|token|secret|password|owner@example/i);
});

test("gccgw package inspect fails closed for customer fields and raw env values", () => {
  const report = buildPackageInspectReport({
    packageName: "unsafe-template",
    files: productionPackageFiles({
      "package-manifest.json": {
        ...productionPackageFiles()["package-manifest.json"],
        registrationPolicy: {
          customerFieldsInPackage: true,
          customerEmail: "owner@example.com"
        }
      },
      "env.required.json": {
        ...productionPackageFiles()["env.required.json"],
        runtime: [
          { name: "CONSOLE_TOKEN", value: "do-not-store-this", secret: true }
        ]
      }
    })
  });

  assert.equal(report.ok, false);
  assert.equal(report.checks.registrationPolicyNoCustomerFields.ok, false);
  assert.ok(report.forbiddenFindings.some((finding) => finding.code === "customer_data_field"));
  assert.ok(report.forbiddenFindings.some((finding) => finding.code === "raw_env_value"));
  assert.doesNotMatch(JSON.stringify(report), /owner@example|do-not-store-this/i);
});

test("gccgw package inspect fails closed for production artifact boundary residue", () => {
  const report = buildPackageInspectReport({
    packageName: "dirty-runtime-export",
    files: productionPackageFiles({
      ".codex-runtime/portal-cloudlike-preview.cjs": "local preview",
      ".worktrees/multi-channel-node-guard/server/app.mjs": "nested source",
      ".proxy-gateway/console-token": "must-not-echo"
    })
  });

  assert.equal(report.ok, false);
  assert.equal(report.checks.productionArtifactBoundary.ok, false);
  assert.deepEqual(
    report.forbiddenFindings
      .filter((finding) => finding.code === "production_artifact_boundary")
      .map((finding) => finding.path),
    [
      ".codex-runtime/portal-cloudlike-preview.cjs",
      ".worktrees/multi-channel-node-guard/server/app.mjs",
      ".proxy-gateway/console-token"
    ]
  );
  assert.doesNotMatch(JSON.stringify(report), /must-not-echo|nested source/i);
});

test("gccgw CLI resolves package inspect as a read-only package command", async () => {
  assert.deepEqual(resolveCliCommand(["package", "inspect", "deployments/production-template", "--json"]), {
    kind: "package-inspect",
    packageDir: "deployments/production-template",
    format: "json"
  });

  const commands = listCliCommands();
  const inspectCommand = commands.find((command) => command.command === "gccgw package inspect");
  assert.equal(inspectCommand.riskTier, "C");
  assert.equal(inspectCommand.mode, "read-only");
  assert.ok(inspectCommand.sourceDocs.includes("docs/PRODUCTION_INPUT_PACKAGE_FORMAT.md"));

  let called = null;
  const exitCode = await runProxyGatewayCli(["package", "inspect", "deployments/production-template", "--json"], {
    runPackageInspect: async (command) => {
      called = command;
      return 0;
    },
    runNodeScript: async () => {
      throw new Error("node script must not run for package inspect");
    },
    runPackageScript: async () => {
      throw new Error("npm package script must not run for package inspect");
    },
    startServer: async () => {
      throw new Error("server must not start for package inspect");
    },
    writeStdout: () => {},
    writeStderr: () => {}
  });

  assert.equal(exitCode, 0);
  assert.deepEqual(called, {
    kind: "package-inspect",
    packageDir: "deployments/production-template",
    format: "json"
  });
});

test("gccgw package import dry-run builds a redacted B-tier import plan", () => {
  const report = buildPackageImportDryRunReport({
    packageName: "production-template",
    files: productionPackageFiles()
  });

  assert.equal(report.type, "gccgw_package_import_dry_run");
  assert.equal(report.ok, true);
  assert.equal(report.riskTier, "B");
  assert.equal(report.mutation, false);
  assert.equal(report.productionAuthority, false);
  assert.equal(report.nextGate.riskTier, "A");
  assert.equal(report.plannedOperations.every((operation) => operation.mutation === false), true);
  assert.deepEqual(report.subscriptionPlans.map((plan) => plan.id), ["monthly", "annual"]);
  assert.deepEqual(report.nodeSlots.map((slot) => slot.id), ["prod-edge-a"]);
  assert.doesNotMatch(JSON.stringify(report), /subscriptionUrl|artifactSecret|CONSOLE_TOKEN|SS_PASSWORD|owner@example|do-not-store-this/i);
});

test("gccgw package import dry-run fails closed when inspect checks fail", () => {
  const report = buildPackageImportDryRunReport({
    packageName: "unsafe-template",
    files: productionPackageFiles({
      "package-manifest.json": {
        ...productionPackageFiles()["package-manifest.json"],
        registrationPolicy: {
          customerFieldsInPackage: true,
          customerEmail: "owner@example.com"
        }
      }
    })
  });

  assert.equal(report.ok, false);
  assert.equal(report.blockers.some((blocker) => blocker.code === "package_inspection_failed"), true);
  assert.doesNotMatch(JSON.stringify(report), /owner@example/i);
});

test("gccgw package import dry-run blocks public admin exposure plans", () => {
  const safeFiles = productionPackageFiles();
  const report = buildPackageImportDryRunReport({
    packageName: "public-admin-template",
    files: productionPackageFiles({
      "topology.json": {
        ...safeFiles["topology.json"],
        operatorAccess: { publicAdmin: true }
      }
    })
  });

  assert.equal(report.ok, false);
  assert.equal(report.blockers.some((blocker) => blocker.code === "public_admin_exposure_requested"), true);
});

test("gccgw node inspect returns safe node summaries without endpoints or credentials", async () => {
  const stdout = [];
  const exitCode = await runProxyGatewayCli(["node", "inspect", "--config", "config/proxy-servers.json", "--json"], {
    runNodeScript: async () => {
      throw new Error("node script must not run for node inspect");
    },
    runPackageScript: async () => {
      throw new Error("npm package script must not run for node inspect");
    },
    runGitDiffCheck: async () => 0,
    runEnvCheck: async () => 0,
    runSelfCheck: async () => 0,
    runInstallPreflight: async () => 0,
    runBackupPreflight: async () => 0,
    runReleaseStatus: async () => 0,
    runServiceStatus: async () => 0,
    runNetworkStatus: async () => 0,
    runPackageImportDryRun: async () => 0,
    runPackageApply: async () => 0,
    runPackageInspect: async () => 0,
    runInstallConfigure: async () => 0,
    startServer: async () => 0,
    confirmRiskAExecution: async () => false,
    readJsonFile: (path) => {
      assert.equal(path, "config/proxy-servers.json");
      return {
        servers: [
          {
            id: "prod-edge-a",
            name: "prod-edge-a",
            role: "primary",
            region: "Tokyo",
            host: "198.51.100.20",
            port: 18388,
            method: "aes-256-gcm",
            password: "do-not-print"
          }
        ]
      };
    },
    writeStdout: (text) => stdout.push(text),
    writeStderr: () => {}
  });

  assert.equal(exitCode, 0);
  const report = JSON.parse(stdout.join(""));
  assert.equal(report.type, "gccgw_node_inspect");
  assert.equal(report.ok, true);
  assert.deepEqual(report.nodes[0], {
    id: "prod-edge-a",
    name: "prod-edge-a",
    role: "primary",
    region: "Tokyo",
    channelPool: "stable",
    channelRole: "primary",
    lifecycle: "active",
    physicalNodeRef: "",
    generation: "",
    strategyPriority: 0,
    canaryWeight: 0,
    credentialMode: "shared-node",
    status: "online",
    maintenance: false,
    subscriptionEligible: true,
    reason: ""
  });
  assert.doesNotMatch(JSON.stringify(report), /198\.51\.100|18388|aes-256-gcm|do-not-print/);
});

test("gccgw node validate compares package slots to runtime config without leaking endpoints", async () => {
  const stdout = [];
  const exitCode = await runProxyGatewayCli([
    "node",
    "validate",
    "--package",
    "deployments/production-template",
    "--config",
    "config/proxy-servers.json",
    "--json"
  ], {
    runNodeScript: async () => {
      throw new Error("node script must not run for node validate");
    },
    runPackageScript: async () => {
      throw new Error("npm package script must not run for node validate");
    },
    runGitDiffCheck: async () => 0,
    runEnvCheck: async () => 0,
    runSelfCheck: async () => 0,
    runInstallPreflight: async () => 0,
    runBackupPreflight: async () => 0,
    runReleaseStatus: async () => 0,
    runServiceStatus: async () => 0,
    runNetworkStatus: async () => 0,
    runPackageImportDryRun: async () => 0,
    runPackageApply: async () => 0,
    runPackageInspect: async () => 0,
    runInstallConfigure: async () => 0,
    startServer: async () => 0,
    confirmRiskAExecution: async () => false,
    readJsonFile: (path) => {
      if (path === "config/proxy-servers.json") {
        return {
          servers: [
            { id: "prod-edge-a", name: "prod-edge-a", host: "198.51.100.20", port: 18388, password: "secret-a" },
            { id: "prod-edge-b", name: "prod-edge-b", host: "198.51.100.21", port: 18388, password: "secret-b" }
          ]
        };
      }
      if (path === "deployments/production-template/nodes.json") {
        return {
          slots: [
            { id: "prod-edge-a", pool: "stable", subscriptionEligible: true, hostRef: "runtime:PROD_EDGE_A_HOST", credentialRefs: ["env:SS_PASSWORD"] },
            { id: "prod-edge-b", pool: "stable", subscriptionEligible: true, hostRef: "runtime:PROD_EDGE_B_HOST", credentialRefs: ["env:SS_PASSWORD"] },
            { id: "prod-edge-c", pool: "recovery", subscriptionEligible: false, hostRef: "runtime:PROD_EDGE_C_HOST", credentialRefs: ["env:SS_PASSWORD"] }
          ]
        };
      }
      throw new Error(`unexpected read: ${path}`);
    },
    writeStdout: (text) => stdout.push(text),
    writeStderr: () => {}
  });

  assert.equal(exitCode, 0);
  const report = JSON.parse(stdout.join(""));
  assert.equal(report.type, "gccgw_node_validate");
  assert.equal(report.ok, true);
  assert.deepEqual(report.summary, {
    packageSlotCount: 3,
    runtimeNodeCount: 2,
    eligiblePackageSlotCount: 2,
    missingEligibleRuntimeNodeCount: 0
  });
  assert.deepEqual(report.missingEligibleRuntimeNodes, []);
  assert.doesNotMatch(JSON.stringify(report), /198\.51\.100|18388|secret/);
});

test("gccgw node policy-check reports stable protocol blockers without leaking endpoints", async () => {
  assert.deepEqual(resolveCliCommand(["node", "policy-check", "--config", "config/proxy-servers.json", "--json"]), {
    kind: "node-policy-check",
    configPath: "config/proxy-servers.json",
    format: "json"
  });

  const stdout = [];
  const exitCode = await runProxyGatewayCli(["node", "policy-check", "--config", "config/proxy-servers.json", "--json"], {
    runNodeScript: async () => {
      throw new Error("node script must not run for node policy-check");
    },
    runPackageScript: async () => {
      throw new Error("npm package script must not run for node policy-check");
    },
    runGitDiffCheck: async () => 0,
    runEnvCheck: async () => 0,
    runSelfCheck: async () => 0,
    runInstallPreflight: async () => 0,
    runBackupPreflight: async () => 0,
    runReleaseStatus: async () => 0,
    runServiceStatus: async () => 0,
    runNetworkStatus: async () => 0,
    runPackageImportDryRun: async () => 0,
    runPackageApply: async () => 0,
    runPackageInspect: async () => 0,
    runInstallConfigure: async () => 0,
    startServer: async () => 0,
    confirmRiskAExecution: async () => false,
    readJsonFile: (path) => {
      assert.equal(path, "config/proxy-servers.json");
      return {
        servers: [
          { id: "stable-a", name: "stable-a", protocol: "ss", channelPool: "stable", host: "198.51.100.10", port: 18388, password: "ss-secret" },
          { id: "tuic-a", name: "tuic-a", protocol: "tuic", channelPool: "stable", host: "198.51.100.11", port: 443, password: "tuic-secret" }
        ]
      };
    },
    writeStdout: (text) => stdout.push(text),
    writeStderr: () => {}
  });

  assert.equal(exitCode, 1);
  const report = JSON.parse(stdout.join(""));
  assert.equal(report.type, "gccgw_stable_pool_protocol_policy");
  assert.equal(report.ok, false);
  assert.deepEqual(report.blockers.map((blocker) => blocker.code), [
    "legacy_shadowsocks_not_default_stable",
    "udp_quic_protocol_in_stable_pool"
  ]);
  assert.equal(report.mutation, false);
  assert.equal(report.productionAuthority, false);
  assert.doesNotMatch(JSON.stringify(report), /198\.51\.100|18388|ss-secret|tuic-secret/);
});

test("gccgw edge material-handoff preflight is dry-run only", () => {
  assert.deepEqual(resolveCliCommand([
    "edge",
    "material-handoff",
    "preflight",
    "--dry-run",
    "--node-ref",
    "edge-node-sgp-a",
    "--control-db",
    "/opt/gccgw/control.sqlite",
    "--material-file",
    "/opt/gccgw/protected-material.json",
    "--json"
  ]), {
    kind: "edge-material-handoff-preflight",
    nodeRef: "edge-node-sgp-a",
    controlDbPath: "/opt/gccgw/control.sqlite",
    materialFilePath: "/opt/gccgw/protected-material.json",
    format: "json"
  });

  assert.throws(
    () => resolveCliCommand([
      "edge",
      "material-handoff",
      "preflight",
      "--node-ref",
      "edge-node-sgp-a"
    ]),
    /gccgw edge material-handoff preflight supports --dry-run only/
  );
});

test("gccgw edge material-handoff preflight prints only redacted readiness", async () => {
  const stdout = [];
  const exitCode = await runProxyGatewayCli([
    "edge",
    "material-handoff",
    "preflight",
    "--dry-run",
    "--node-ref",
    "edge-node-sgp-a",
    "--control-db",
    "/opt/gccgw/control.sqlite",
    "--material-file",
    "/opt/gccgw/protected-material.json",
    "--json"
  ], cliAdapters({
    runEdgeMaterialHandoffPreflight: async (command) => {
      assert.equal(command.nodeRef, "edge-node-sgp-a");
      assert.equal(command.controlDbPath, "/opt/gccgw/control.sqlite");
      assert.equal(command.materialFilePath, "/opt/gccgw/protected-material.json");
      return {
        type: "gccgw_protected_material_handoff_preflight",
        nodeRef: "edge-node-sgp-a",
        status: "ready",
        ready: true,
        redacted: true,
        channelRefs: ["channel-sgp-a-hy2"],
        desiredStates: [
          {
            channelRef: "channel-sgp-a-hy2",
            desiredStateRef: "desired_state_channel_sgp_a_hy2",
            generation: "gen_safe",
            edgeCredentialCount: 1,
            materialDigestCount: 1,
            materialReadyCount: 1,
            missingMaterialCount: 0,
            digestMismatchCount: 0
          }
        ],
        totals: {
          desiredStateCount: 1,
          edgeCredentialCount: 1,
          materialReadyCount: 1,
          missingMaterialCount: 0,
          digestMismatchCount: 0
        },
        blockers: []
      };
    },
    writeStdout: (text) => stdout.push(text)
  }));

  assert.equal(exitCode, 0);
  const report = JSON.parse(stdout.join(""));
  assert.equal(report.type, "gccgw_protected_material_handoff_preflight");
  assert.equal(report.ready, true);
  assert.equal(report.redacted, true);
  assert.equal(report.totals.materialReadyCount, 1);
  assert.doesNotMatch(JSON.stringify(report), /password|private|secret|uuid|subscriptionUrl/i);
});

test("gccgw node data-plane-lifecycle-policy blocks shared credentials without leaking endpoints", async () => {
  assert.deepEqual(resolveCliCommand([
    "node",
    "data-plane-lifecycle-policy",
    "--config",
    "config/proxy-servers.json",
    "--json"
  ]), {
    kind: "node-data-plane-lifecycle-policy",
    configPath: "config/proxy-servers.json",
    format: "json"
  });

  const stdout = [];
  const exitCode = await runProxyGatewayCli([
    "node",
    "data-plane-lifecycle-policy",
    "--config",
    "config/proxy-servers.json",
    "--json"
  ], {
    runNodeScript: async () => {
      throw new Error("node script must not run for node data-plane-lifecycle-policy");
    },
    runPackageScript: async () => {
      throw new Error("npm package script must not run for node data-plane-lifecycle-policy");
    },
    runGitDiffCheck: async () => 0,
    runEnvCheck: async () => 0,
    runSelfCheck: async () => 0,
    runInstallPreflight: async () => 0,
    runBackupPreflight: async () => 0,
    runReleaseStatus: async () => 0,
    runServiceStatus: async () => 0,
    runNetworkStatus: async () => 0,
    runPackageImportDryRun: async () => 0,
    runPackageApply: async () => 0,
    runPackageInspect: async () => 0,
    runInstallConfigure: async () => 0,
    startServer: async () => 0,
    confirmRiskAExecution: async () => false,
    readJsonFile: (path) => {
      assert.equal(path, "config/proxy-servers.json");
      return {
        servers: [
          {
            id: "stable-a",
            name: "stable-a",
            protocol: "ss",
            channelPool: "stable",
            host: "198.51.100.10",
            port: 18388,
            password: "ss-secret"
          }
        ]
      };
    },
    writeStdout: (text) => stdout.push(text),
    writeStderr: () => {}
  });

  assert.equal(exitCode, 1);
  const report = JSON.parse(stdout.join(""));
  assert.equal(report.type, "gccgw_data_plane_credential_lifecycle_policy");
  assert.equal(report.ok, false);
  assert.equal(report.blockers[0].code, "shared_node_credentials_cannot_force_order_expiry");
  assert.equal(report.mutation, false);
  assert.equal(report.productionAuthority, false);
  assert.doesNotMatch(JSON.stringify(report), /198\.51\.100|18388|ss-secret/);
});

test("gccgw node register and disable remain dry-run only and reject unsafe node facts", async () => {
  const registerStdout = [];
  const unsafeRegisterCode = await runProxyGatewayCli(["node", "register", "--dry-run", "node-facts.json", "--json"], {
    runNodeScript: async () => {
      throw new Error("node script must not run for node register");
    },
    runPackageScript: async () => {
      throw new Error("npm package script must not run for node register");
    },
    runGitDiffCheck: async () => 0,
    runEnvCheck: async () => 0,
    runSelfCheck: async () => 0,
    runInstallPreflight: async () => 0,
    runBackupPreflight: async () => 0,
    runReleaseStatus: async () => 0,
    runServiceStatus: async () => 0,
    runNetworkStatus: async () => 0,
    runPackageImportDryRun: async () => 0,
    runPackageApply: async () => 0,
    runPackageInspect: async () => 0,
    runInstallConfigure: async () => 0,
    startServer: async () => 0,
    confirmRiskAExecution: async () => false,
    readJsonFile: () => ({
      id: "prod-edge-jp",
      pool: "stable",
      host: "198.51.100.30",
      credentialRefs: ["env:SS_PASSWORD"]
    }),
    writeStdout: (text) => registerStdout.push(text),
    writeStderr: () => {}
  });

  assert.equal(unsafeRegisterCode, 1);
  const unsafeReport = JSON.parse(registerStdout.join(""));
  assert.equal(unsafeReport.ok, false);
  assert.equal(unsafeReport.blockers[0].code, "raw_runtime_field_present");
  assert.doesNotMatch(JSON.stringify(unsafeReport), /198\.51\.100|SS_PASSWORD/);

  const disableStdout = [];
  const disableCode = await runProxyGatewayCli(["node", "disable", "--dry-run", "prod-edge-a", "--reason", "maintenance", "--json"], {
    runNodeScript: async () => {
      throw new Error("node script must not run for node disable");
    },
    runPackageScript: async () => {
      throw new Error("npm package script must not run for node disable");
    },
    runGitDiffCheck: async () => 0,
    runEnvCheck: async () => 0,
    runSelfCheck: async () => 0,
    runInstallPreflight: async () => 0,
    runBackupPreflight: async () => 0,
    runReleaseStatus: async () => 0,
    runServiceStatus: async () => 0,
    runNetworkStatus: async () => 0,
    runPackageImportDryRun: async () => 0,
    runPackageApply: async () => 0,
    runPackageInspect: async () => 0,
    runInstallConfigure: async () => 0,
    startServer: async () => 0,
    confirmRiskAExecution: async () => false,
    readJsonFile: () => {
      throw new Error("disable dry-run must not read config by default");
    },
    writeStdout: (text) => disableStdout.push(text),
    writeStderr: () => {}
  });

  assert.equal(disableCode, 0);
  const disableReport = JSON.parse(disableStdout.join(""));
  assert.equal(disableReport.type, "gccgw_node_disable_dry_run");
  assert.equal(disableReport.ok, true);
  assert.equal(disableReport.mutation, false);
  assert.deepEqual(disableReport.plannedOperations.map((operation) => operation.id), [
    "mark-node-disabled",
    "validate-subscription-output",
    "record-operator-evidence"
  ]);
});

test("gccgw package apply plan validates reviewed import and configure plans before mutation", () => {
  const importPlan = buildPackageImportDryRunReport({
    packageName: "production-template",
    files: productionPackageFiles()
  });
  const configurePlan = buildInstallConfigurePlan({
    domain: "https://sub.example.invalid",
    installDir: "/opt/proxy-gateway-minimal",
    managementSource: "203.0.113.10/32"
  });

  const plan = buildPackageApplyPlan({
    packageName: "production-template",
    importPlan,
    configurePlan
  });

  assert.equal(plan.type, "gccgw_package_apply_plan");
  assert.equal(plan.ok, true);
  assert.equal(plan.riskTier, "A");
  assert.equal(plan.mutation, true);
  assert.equal(plan.productionAuthority, false);
  assert.deepEqual(plan.materialTargets, {
    envSkeletonPath: "/opt/proxy-gateway-minimal/.env",
    runtimeDbPath: "/opt/proxy-gateway-minimal/.proxy-gateway/subscriptions.sqlite",
    controlDbPath: "/opt/proxy-gateway-minimal/.proxy-gateway/subscription-control.sqlite",
    handoffDir: "/opt/proxy-gateway-minimal/handoff"
  });
  assert.ok(plan.plannedOperations.some((operation) => operation.id === "initialize-runtime-sqlite"));
  assert.ok(plan.plannedOperations.some((operation) => operation.id === "initialize-control-sqlite"));
  assert.ok(plan.plannedOperations.every((operation) => operation.requiresReviewedPlan === true));
  assert.doesNotMatch(JSON.stringify(plan), /subscriptionUrl|artifactSecret|CONSOLE_TOKEN|SS_PASSWORD|owner@example|do-not-store-this/i);

  const validation = validatePackageApplyPlanEnvelope(plan);
  assert.equal(validation.ok, true);

  const unsafe = validatePackageApplyPlanEnvelope({
    ...plan,
    redacted: false
  });
  assert.equal(unsafe.ok, false);
  assert.equal(unsafe.blockers.some((blocker) => blocker.code === "package_apply_plan_must_be_redacted"), true);
});

test("gccgw CLI runs install configure through a non-mutating adapter", async () => {
  let called = null;
  const exitCode = await runProxyGatewayCli([
    "install",
    "configure",
    "--dry-run",
    "--domain",
    "https://sub.example.invalid",
    "--install-dir",
    "/opt/gccgw",
    "--management-source",
    "203.0.113.10/32",
    "--json"
  ], {
    runInstallConfigure: async (command) => {
      called = command;
      return 0;
    },
    runNodeScript: async () => {
      throw new Error("node script must not run for install configure");
    },
    runPackageScript: async () => {
      throw new Error("npm package script must not run for install configure");
    },
    startServer: async () => {
      throw new Error("server must not start for install configure");
    },
    writeStdout: () => {},
    writeStderr: () => {}
  });

  assert.equal(exitCode, 0);
  assert.deepEqual(called, {
    kind: "install-configure",
    format: "json",
    dryRun: true,
    domain: "https://sub.example.invalid",
    installDir: "/opt/gccgw",
    managementSource: "203.0.113.10/32",
    consolePort: undefined,
    targetRole: undefined
  });
});

test("gccgw CLI resolves package import dry-run without execution authority", async () => {
  assert.deepEqual(resolveCliCommand(["package", "import", "deployments/production-template", "--dry-run", "--json"]), {
    kind: "package-import-dry-run",
    packageDir: "deployments/production-template",
    format: "json"
  });

  const commands = listCliCommands();
  const importCommand = commands.find((command) => command.command === "gccgw package import");
  assert.equal(importCommand.riskTier, "B");
  assert.equal(importCommand.mode, "dry-run");
  assert.ok(importCommand.sourceDocs.includes("docs/PRODUCTION_INPUT_PACKAGE_FORMAT.md"));

  let called = null;
  const exitCode = await runProxyGatewayCli(["package", "import", "deployments/production-template", "--dry-run", "--json"], {
    runPackageImportDryRun: async (command) => {
      called = command;
      return 0;
    },
    runPackageInspect: async () => {
      throw new Error("inspect adapter must not run for import dry-run");
    },
    runNodeScript: async () => {
      throw new Error("node script must not run for package import dry-run");
    },
    runPackageScript: async () => {
      throw new Error("npm package script must not run for package import dry-run");
    },
    startServer: async () => {
      throw new Error("server must not start for package import dry-run");
    },
    writeStdout: () => {},
    writeStderr: () => {}
  });

  assert.equal(exitCode, 0);
  assert.deepEqual(called, {
    kind: "package-import-dry-run",
    packageDir: "deployments/production-template",
    format: "json"
  });
});

test("gccgw CLI resolves package apply behind Risk A gate", async () => {
  assert.deepEqual(resolveCliCommand([
    "package",
    "apply",
    "deployments/production-template",
    "--import-plan",
    "reviewed-import-plan.json",
    "--config-plan",
    "reviewed-install-configure-plan.json",
    "--execute-production-mutation",
    "--apply"
  ]), {
    kind: "package-apply",
    commandName: "gccgw package apply",
    packageDir: "deployments/production-template",
    importPlanPath: "reviewed-import-plan.json",
    configPlanPath: "reviewed-install-configure-plan.json",
    executeProductionMutation: true,
    apply: true,
    format: "text"
  });

  const commands = listCliCommands();
  const applyCommand = commands.find((command) => command.command === "gccgw package apply");
  assert.equal(applyCommand.riskTier, "A");
  assert.equal(applyCommand.mode, "execution-gated");
  assert.ok(applyCommand.approvalPrompt);

  let called = null;
  const exitCode = await runProxyGatewayCli([
    "package",
    "apply",
    "deployments/production-template",
    "--import-plan",
    "reviewed-import-plan.json",
    "--config-plan",
    "reviewed-install-configure-plan.json",
    "--execute-production-mutation",
    "--apply",
    "--json"
  ], {
    confirmRiskAExecution: async () => true,
    runPackageApply: async (command) => {
      called = command;
      return 0;
    },
    runPackageImportDryRun: async () => {
      throw new Error("dry-run adapter must not run for package apply");
    },
    runNodeScript: async () => {
      throw new Error("node script must not run for package apply");
    },
    runPackageScript: async () => {
      throw new Error("npm package script must not run for package apply");
    },
    startServer: async () => {
      throw new Error("server must not start for package apply");
    },
    writeStdout: () => {},
    writeStderr: () => {}
  });

  assert.equal(exitCode, 0);
  assert.deepEqual(called, {
    kind: "package-apply",
    commandName: "gccgw package apply",
    packageDir: "deployments/production-template",
    importPlanPath: "reviewed-import-plan.json",
    configPlanPath: "reviewed-install-configure-plan.json",
    executeProductionMutation: true,
    apply: true,
    format: "json"
  });
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
  assert.ok(plan.commands.some((command) => command.command === "gccgw install bootstrap --config-plan <reviewed-install-configure-plan.json> --execute-production-mutation --apply"));
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

test("gccgw install configure plan validates before bootstrap gates", () => {
  const validPlan = buildInstallConfigurePlan({
    domain: "https://sub.example.invalid",
    installDir: "/opt/gccgw",
    managementSource: "203.0.113.10/32"
  });
  const valid = validateInstallConfigurePlanEnvelope(validPlan);

  assert.equal(valid.ok, true);
  assert.deepEqual(valid.blockers, []);

  const unsafe = validateInstallConfigurePlanEnvelope({
    ...validPlan,
    ok: false,
    redacted: false,
    mutation: true,
    blockers: [{ code: "unsafe", severity: "blocker" }]
  });

  assert.equal(unsafe.ok, false);
  assert.equal(unsafe.blockers.some((blocker) => blocker.code === "configure_plan_not_ok"), true);
  assert.equal(unsafe.blockers.some((blocker) => blocker.code === "configure_plan_must_be_redacted"), true);
  assert.equal(unsafe.blockers.some((blocker) => blocker.code === "configure_plan_must_be_non_mutating"), true);
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
  assert.ok(names.includes("gccgw node image-readiness-summary"));
  assert.ok(names.includes("gccgw node image-first-boot-packet"));
  assert.ok(names.includes("gccgw service status"));
  assert.ok(names.includes("gccgw project verify"));
  assert.ok(names.includes("gccgw project export"));
  assert.ok(names.includes("gccgw project drift"));
  assert.ok(names.includes("gccgw platform issue-subscription"));
  assert.ok(names.includes("gccgw platform issue-portal-initial-account"));
  assert.ok(names.includes("gccgw channel validate"));
  assert.ok(names.includes("gccgw channel subscription-render-proof"));

  const projectExport = commands.find((command) => command.command === "gccgw project export");
  assert.equal(projectExport.domain, "project");
  assert.equal(projectExport.riskTier, "C");
  assert.equal(projectExport.mode, "read-only");
  assert.equal(projectExport.approvalPrompt, undefined);

  const projectDrift = commands.find((command) => command.command === "gccgw project drift");
  assert.equal(projectDrift.domain, "project");
  assert.equal(projectDrift.riskTier, "C");
  assert.equal(projectDrift.mode, "report");
  assert.equal(projectDrift.approvalPrompt, undefined);

  const issueSubscription = commands.find((command) => command.command === "gccgw platform issue-subscription");
  assert.equal(issueSubscription.domain, "platform");
  assert.equal(issueSubscription.riskTier, "A");
  assert.equal(issueSubscription.mode, "execution-gated");
  assert.equal(issueSubscription.approvalPrompt, "required for --execute-production-mutation");
  assert.ok(issueSubscription.sourceDocs.includes("docs/CLI_PRODUCTION_PROVISIONING_SOP.md"));
  assert.ok(issueSubscription.sourceDocs.includes("docs/SUBSCRIPTION_CONTROL_DATABASE.md"));

  const issueInitialAccount = commands.find((command) => command.command === "gccgw platform issue-portal-initial-account");
  assert.equal(issueInitialAccount.domain, "platform");
  assert.equal(issueInitialAccount.riskTier, "A");
  assert.equal(issueInitialAccount.mode, "execution-gated");
  assert.equal(issueInitialAccount.approvalPrompt, "required for --execute-production-mutation");
  assert.ok(issueInitialAccount.sourceDocs.includes("docs/USER_PORTAL_PRODUCTION_AUTH_PLAN.md"));
  assert.ok(issueInitialAccount.sourceDocs.includes("docs/SUBSCRIPTION_CONTROL_DATABASE.md"));

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

  const nodeImageReadiness = commands.find((command) => command.command === "gccgw node image-readiness-summary");
  assert.equal(nodeImageReadiness.domain, "node");
  assert.equal(nodeImageReadiness.riskTier, "C");
  assert.equal(nodeImageReadiness.mode, "gate-preview");
  assert.ok(nodeImageReadiness.sourceDocs.includes("docs/NODE_IMAGE_PROVISIONING_RUNBOOK.md"));

  const nodeImageFirstBoot = commands.find((command) => command.command === "gccgw node image-first-boot-packet");
  assert.equal(nodeImageFirstBoot.domain, "node");
  assert.equal(nodeImageFirstBoot.riskTier, "C");
  assert.equal(nodeImageFirstBoot.mode, "gate-preview");
  assert.ok(nodeImageFirstBoot.sourceDocs.includes("docs/NODE_IMAGE_PROVISIONING_RUNBOOK.md"));

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

test("gccgw CLI exposes a capability registry grouped by operator workflow", async () => {
  const registry = buildCliCapabilityRegistry({ format: "json" });
  const capabilityIds = registry.capabilities.map((capability) => capability.id);

  assert.equal(registry.type, "gccgw_capability_registry");
  assert.equal(registry.generatedBy, "gccgw capabilities");
  assert.equal(registry.redacted, true);
  assert.ok(capabilityIds.includes("install"));
  assert.ok(capabilityIds.includes("node"));
  assert.ok(capabilityIds.includes("subscription"));

  const subscription = registry.capabilities.find((capability) => capability.id === "subscription");
  assert.equal(subscription.highestRiskTier, "A");
  assert.ok(subscription.modes.includes("execution-gated"));
  assert.ok(subscription.sourceDocs.includes("docs/CLI_PRODUCTION_PROVISIONING_SOP.md"));
  assert.ok(subscription.commands.some((command) => command.command === "gccgw subscription issue"));
  assert.ok(subscription.commands.some((command) => command.command === "gccgw platform issue-subscription"));
  assert.doesNotMatch(JSON.stringify(registry), /subscriptionUrl|token|secret|password/i);

  assert.deepEqual(resolveCliCommand(["capabilities"]), {
    kind: "capability-registry",
    format: "text"
  });
  assert.deepEqual(resolveCliCommand(["capabilities", "--json"]), {
    kind: "capability-registry",
    format: "json"
  });

  let stdout = "";
  const exitCode = await runProxyGatewayCli(["capabilities", "--json"], {
    runNodeScript: async () => {
      throw new Error("node script must not run for capability registry");
    },
    runPackageScript: async () => {
      throw new Error("package script must not run for capability registry");
    },
    startServer: async () => {
      throw new Error("server must not start for capability registry");
    },
    writeStdout: (value) => {
      stdout += value;
    },
    writeStderr: () => {}
  });

  assert.equal(exitCode, 0);
  assert.equal(JSON.parse(stdout).type, "gccgw_capability_registry");
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
  const gateLayer = architecture.layers.find((layer) => layer.layer === "gate");
  assert.match(gateLayer.rule, /Fresh native Issue\/PR reads own current work/);
  assert.deepEqual(
    gateLayer.modules.filter((module) => module.startsWith("project-state/")),
    ["project-state/current.json", "project-state/tasks.json", "project-state/lanes.json"]
  );
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
  assert.deepEqual(resolveCliCommand([
    "platform",
    "issue-portal-initial-account",
    "--dry-run",
    "input.json"
  ]), {
    kind: "node-script",
    script: "scripts/platform-issue-portal-initial-account.mjs",
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
