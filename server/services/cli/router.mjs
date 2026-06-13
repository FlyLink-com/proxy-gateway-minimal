import {
  buildGccgwConfigList,
  buildGccgwConfigShow,
  buildGccgwConfigValidation
} from "./config.mjs";
import {
  buildDataPlaneCredentialLifecyclePolicy,
  buildStablePoolProtocolPolicy
} from "../subscriptions/channel-policy.mjs";
import { createNodeRegistry } from "../subscriptions/node-registry.mjs";
import {
  buildCredentialReconciliationApplyPlan,
  buildCredentialReconciliationPlan
} from "../edge/credential-reconciliation-gateway.mjs";
import {
  buildTuicCredentialLifecycleApplyPlan,
  buildTuicCredentialLifecyclePlan
} from "../edge/tuic-credential-lifecycle.mjs";
import { inspectProductionArtifactBoundary } from "../platform/production-artifact-boundary.mjs";

const DOMAIN_SOURCE_DOCS = {
  admin: ["docs/OPERATOR_CLI_PLATFORM_BOUNDARY.md"],
  backup: ["docs/PRODUCTION_DR.md", "docs/DEPLOYMENT_FLOW.md"],
  channel: ["docs/CHANNEL_RUNTIME_CANARY_RUNBOOK.md", "docs/LOCAL_EDGE_CHANNEL_TECHNICAL_MVP.md"],
  config: ["config/gccgw.config.example.json", "docs/OPERATOR_CLI_PLATFORM_BOUNDARY.md"],
  edge: ["docs/EDGE_CREDENTIAL_RECONCILIATION_GATEWAY_DESIGN.md", "docs/JAPAN_TUIC_PER_ORDER_CREDENTIAL_UPGRADE_RUNBOOK.md", "docs/CHANNEL_MULTI_CHANNEL_NODE_DESIGN.md", "ops/edge-node/README.md"],
  env: ["docs/LIGHTWEIGHT_OPERATING_DEV_ENVIRONMENT.md"],
  install: ["ops/README.md", "ops/edge-node/README.md"],
  node: ["ops/README.md", "ops/edge-node/README.md", "docs/PRODUCTION_EDGE_FLEET.md"],
  ops: ["docs/LIGHTWEIGHT_OPERATING_DEV_ENVIRONMENT.md"],
  package: ["docs/RESOURCE_PACKAGE_CLI.md", "docs/PACKAGE_BOUNDARY.md", "docs/PRODUCTION_INPUT_PACKAGE_FORMAT.md"],
  platform: ["docs/OPERATOR_CLI_PLATFORM_BOUNDARY.md", "docs/CLI_PRODUCTION_PROVISIONING_SOP.md"],
  project: ["docs/PROJECT_CONTEXT.md"],
  release: ["docs/LIGHTWEIGHT_OPERATING_DEV_ENVIRONMENT.md", "docs/MASTER_ARCHIVE_BOUNDARY.md", "docs/MULTI_ENV_ADAPTER_RUNTIME_MODEL.md"],
  server: ["docs/LIGHTWEIGHT_OPERATING_DEV_ENVIRONMENT.md"],
  service: ["ops/README.md", "ops/edge-node/README.md"],
  site: ["docs/PROJECT_CONTEXT.md"],
  subscription: ["docs/CLI_PRODUCTION_PROVISIONING_SOP.md", "docs/SUBSCRIPTION_CONTROL_DATABASE.md", "docs/USER_PORTAL_AUTH_BOUNDARY.md"]
};

const NODE_SCRIPT_COMMAND_ENTRIES = [
  ["project check", "scripts/check-project-state.mjs", "project", "C", "read-only", "Validate project-state and repository safety markers"],
  ["project handoff-brief", "scripts/project-handoff-brief.mjs", "project", "C", "report", "Generate a structured Claude handoff brief from cached project context", ["docs/PROJECT_CONTEXT.md"]],
  ["channel validate", "scripts/channel-config-dry-run.mjs", "channel", "B", "dry-run", "Validate channel configuration candidates", undefined, { surface: "operator", aliasOf: "gccgw channel dry-run" }],
  ["channel measure", "scripts/channel-measurement-bundle.mjs", "channel", "C", "report", "Build channel measurement bundle evidence", undefined, { surface: "operator", aliasOf: "gccgw channel measurement-bundle" }],
  ["channel decide", "scripts/channel-system-decision-flow.mjs", "channel", "C", "report", "Build end-to-end channel decision evidence", undefined, { surface: "operator", aliasOf: "gccgw channel system-decision-flow" }],
  ["channel package", "scripts/channel-subscription-activation-package.mjs", "channel", "C", "gate-preview", "Build subscription activation package preview", undefined, { surface: "operator", aliasOf: "gccgw channel subscription-activation-package" }],
  ["channel record", "scripts/channel-subscription-activation-record-template.mjs", "channel", "C", "template", "Create subscription activation execution record template", undefined, { surface: "operator", aliasOf: "gccgw channel subscription-activation-record-template" }],
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
  ["platform issue-portal-initial-account", "scripts/platform-issue-portal-initial-account.mjs", "platform", "A", "execution-gated", "Issue an initial portal account after approval", ["docs/USER_PORTAL_PRODUCTION_AUTH_PLAN.md", "docs/USER_PORTAL_AUTH_BOUNDARY.md", "docs/SUBSCRIPTION_CONTROL_DATABASE.md"]],
  ["platform resource-package", "scripts/platform-resource-package.mjs", "platform", "B", "package", "Build operator delivery package", ["docs/RESOURCE_PACKAGE_CLI.md", "docs/OPERATOR_CLI_PLATFORM_BOUNDARY.md"]],
  ["platform revoke-access", "scripts/platform-revoke-access.mjs", "platform", "A", "dry-run-only", "Plan access revocation"],
  ["platform access-inventory-summary", "scripts/access-model-inventory-summary.mjs", "platform", "C", "summary", "Summarize access model inventory"],
  ["platform clean-edge-readiness-summary", "scripts/clean-edge-readiness-summary.mjs", "platform", "C", "gate-preview", "Summarize clean edge readiness"],
  ["subscription form", "scripts/platform-provisioning-form.mjs", "subscription", "B", "preview", "Convert operator facts into issuance input", undefined, { surface: "operator", aliasOf: "gccgw platform provisioning-form" }],
  ["subscription issue", "scripts/platform-issue-subscription.mjs", "subscription", "A", "execution-gated", "Issue a controlled subscription after approval", undefined, { surface: "operator", aliasOf: "gccgw platform issue-subscription" }],
  ["subscription portal-entry", "scripts/platform-issue-portal-entry.mjs", "subscription", "A", "execution-gated", "Issue a dynamic portal entry after approval", undefined, { surface: "operator", aliasOf: "gccgw platform issue-portal-entry" }],
  ["subscription portal-initial-account", "scripts/platform-issue-portal-initial-account.mjs", "subscription", "A", "execution-gated", "Issue an initial portal account after approval", undefined, { surface: "operator", aliasOf: "gccgw platform issue-portal-initial-account" }],
  ["subscription revoke", "scripts/platform-revoke-access.mjs", "subscription", "A", "dry-run-only", "Plan access revocation", undefined, { surface: "operator", aliasOf: "gccgw platform revoke-access" }],
  ["install bootstrap", "scripts/gccgw-install-bootstrap.mjs", "install", "A", "execution-gated", "Apply reviewed edge-node bootstrap materials on a server", ["ops/README.md", "ops/edge-node/README.md"]],
  ["node bootstrap", "scripts/gccgw-install-bootstrap.mjs", "node", "A", "execution-gated", "Apply reviewed edge-node bootstrap materials on a server", undefined, { surface: "operator", aliasOf: "gccgw install bootstrap" }]
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
  ["architecture", null, "project", "C", "read-only", "Print the flattened project architecture map", ["docs/PROJECT_CONTEXT.md", "docs/ROUTES_ARCHITECTURE.md", "docs/SUBSCRIPTION_CONTROL_EDGE_ARCHITECTURE.md", "docs/OPERATOR_CLI_PLATFORM_BOUNDARY.md"]],
  ["capabilities", null, "project", "C", "read-only", "List project capabilities grouped by operator workflow", ["docs/PROJECT_CONTEXT.md", "docs/OPERATOR_CLI_PLATFORM_BOUNDARY.md"]],
  ["commands", null, "project", "C", "read-only", "List registered gccgw commands"],
  ["config list", null, "config", "C", "read-only", "List configured gccgw profiles without printing raw values"],
  ["config show", null, "config", "C", "read-only", "Show one redacted gccgw profile"],
  ["config validate", null, "config", "C", "read-only", "Validate gccgw profile shape without printing raw values"],
  ["docs command", null, "project", "C", "read-only", "List source docs for one gccgw command"],
  ["docs domain", null, "project", "C", "read-only", "List source docs for one command domain"],
  ["docs list", null, "project", "C", "read-only", "List docs referenced by the gccgw command map"],
  ["package apply", null, "package", "A", "execution-gated", "Apply a reviewed production input package to the local host"],
  ["package import", null, "package", "B", "dry-run", "Build a redacted production input package import plan without mutating the host"],
  ["package inspect", null, "package", "C", "read-only", "Inspect a redacted production input package without importing it"],
  ["install configure", null, "install", "B", "dry-run", "Build a redacted install configuration plan without writing host files"],
  ["install plan", null, "install", "C", "read-only", "Show the server installation sequence without touching the host"],
  ["install preflight", null, "install", "C", "read-only", "Check server bootstrap prerequisites without mutating the host"],
  ["edge credentials reconcile-plan", null, "edge", "B", "dry-run", "Build a redacted edge credential desired-state reconciliation plan", ["docs/EDGE_CREDENTIAL_RECONCILIATION_GATEWAY_DESIGN.md", "docs/ALIYUN_LOCAL_EDGE_LIFECYCLE_IMPLEMENTATION_PLAN.md"]],
  ["edge credentials apply", null, "edge", "A", "execution-gated", "Apply a reviewed edge credential desired-state reconciliation plan on a node", ["docs/EDGE_CREDENTIAL_RECONCILIATION_GATEWAY_DESIGN.md", "docs/PRODUCTION_EDGE_FLEET.md"]],
  ["edge tuic-credentials plan", null, "edge", "B", "dry-run", "Build a redacted TUIC per-order credential lifecycle plan", ["docs/JAPAN_TUIC_PER_ORDER_CREDENTIAL_UPGRADE_RUNBOOK.md", "docs/CHANNEL_MULTI_CHANNEL_NODE_DESIGN.md"]],
  ["edge tuic-credentials apply", null, "edge", "A", "execution-gated", "Apply a reviewed TUIC per-order credential lifecycle plan on a node", ["docs/JAPAN_TUIC_PER_ORDER_CREDENTIAL_UPGRADE_RUNBOOK.md", "docs/PRODUCTION_EDGE_FLEET.md"]],
  ["node inspect", null, "node", "C", "read-only", "Inspect safe node registry facts without printing endpoints or credentials"],
  ["node validate", null, "node", "C", "read-only", "Validate runtime node registry facts against the production input package"],
  ["node policy-check", null, "node", "C", "read-only", "Check stable-pool protocol posture without printing endpoints or credentials", ["docs/CHANNEL_STRATEGY_ENGINE.md", "docs/NODE_REGISTRATION_AND_POOL_CONTRACT.md", "docs/PRODUCTION_EDGE_FLEET.md"]],
  ["node data-plane-lifecycle-policy", null, "node", "C", "read-only", "Check per-order credential lifecycle posture without printing endpoints or credentials", ["docs/CHANNEL_STRATEGY_ENGINE.md", "docs/NODE_REGISTRATION_AND_POOL_CONTRACT.md", "docs/PRODUCTION_EDGE_FLEET.md"]],
  ["node register", null, "node", "B", "dry-run", "Plan safe node registration without mutating runtime or subscription output"],
  ["node disable", null, "node", "B", "dry-run", "Plan node disablement without mutating runtime or subscription output"],
  ["node plan", null, "node", "C", "read-only", "Show the node installation sequence without touching the host", undefined, { aliasOf: "gccgw install plan" }],
  ["node preflight", null, "node", "C", "read-only", "Check node bootstrap prerequisites without mutating the host", undefined, { aliasOf: "gccgw install preflight" }],
  ["node status", null, "node", "C", "read-only", "Read local node service status without changing runtime state", undefined, { aliasOf: "gccgw service status" }],
  ["backup plan", null, "backup", "C", "read-only", "Show backup and restore boundaries without touching SQLite"],
  ["backup preflight", null, "backup", "C", "read-only", "Check backup prerequisites without touching SQLite"],
  ["backup restore-preflight", null, "backup", "C", "read-only", "Check restore prerequisites without touching SQLite or services"],
  ["release plan", null, "release", "C", "read-only", "Show release package boundaries without deploying"],
  ["release status", null, "release", "C", "read-only", "Read local release metadata without deploying"],
  ["self check", null, "env", "C", "read-only", "Check gccgw bootstrap, local binary, npm script, and PATH availability"],
  ["service status", null, "service", "C", "read-only", "Read local service, Nginx, and health status without changing runtime state"],
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

function commandEntry([command, target, domain, riskTier, mode, description, sourceDocs, metadata = {}], handler) {
  const surface = metadata.surface || (domain === "channel" ? "advanced" : "operator");
  return {
    command: `gccgw ${command}`,
    domain,
    riskTier,
    mode,
    handler,
    surface,
    ...(metadata.aliasOf ? { aliasOf: metadata.aliasOf } : {}),
    ...(target ? { target } : {}),
    ...(riskTier === "A" && mode === "execution-gated" ? { approvalPrompt: "required for --execute-production-mutation" } : {}),
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

const RISK_TIER_RANK = {
  C: 1,
  B: 2,
  A: 3
};

const CAPABILITY_GROUPS = [
  {
    id: "project",
    title: "Project Verification And Navigation",
    purpose: "Inspect the repository, command map, architecture map, docs map, and local bootstrap shape.",
    domains: ["project", "env"],
    commands: ["gccgw architecture", "gccgw capabilities", "gccgw commands", "gccgw docs list", "gccgw docs domain", "gccgw docs command"]
  },
  {
    id: "install",
    title: "Install And Host Bootstrap",
    purpose: "Plan, preflight, configure, and execute reviewed host bootstrap materials.",
    domains: ["install", "server", "service"]
  },
  {
    id: "node",
    title: "Production Node Fleet",
    purpose: "Inspect, validate, register, disable, and bootstrap edge node slots without exposing runtime endpoints.",
    domains: ["node", "edge"]
  },
  {
    id: "package",
    title: "Production Input Package",
    purpose: "Inspect, import, and apply reviewed deployment packages through dry-run and A-tier gates.",
    domains: ["package"]
  },
  {
    id: "subscription",
    title: "Subscription Factory",
    purpose: "Prepare, issue, hand off, and revoke controlled subscription and portal-entry materials.",
    domains: ["subscription"],
    commands: [
      "gccgw platform controlled-open",
      "gccgw platform provisioning-form",
      "gccgw platform issue-subscription",
      "gccgw platform issue-portal-entry",
      "gccgw platform issue-portal-initial-account",
      "gccgw platform resource-package",
      "gccgw platform revoke-access"
    ]
  },
  {
    id: "channel",
    title: "Channel Technical MVP",
    purpose: "Validate, measure, decide, package, and record channel runtime evidence.",
    domains: ["channel"]
  },
  {
    id: "config",
    title: "Local Configuration Profiles",
    purpose: "List, show, and validate redacted local gccgw configuration profiles.",
    domains: ["config"]
  },
  {
    id: "site-admin",
    title: "Site And Admin Build",
    purpose: "Build and test the public site and private admin surfaces from the same repository.",
    domains: ["site", "admin"]
  },
  {
    id: "operations",
    title: "Operations, Backup, And Release",
    purpose: "Inspect operational status, backup boundaries, release metadata, and redacted network status.",
    domains: ["ops", "backup", "release"]
  }
];

function uniqueSorted(values = []) {
  return unique(values).sort((a, b) => a.localeCompare(b));
}

function highestRiskTier(commands) {
  return commands.reduce((highest, command) => {
    const currentRank = RISK_TIER_RANK[command.riskTier] || 0;
    const highestRank = RISK_TIER_RANK[highest] || 0;
    return currentRank > highestRank ? command.riskTier : highest;
  }, "C");
}

function commandSummary(command) {
  return {
    command: command.command,
    domain: command.domain,
    riskTier: command.riskTier,
    mode: command.mode,
    handler: command.handler,
    surface: command.surface,
    ...(command.aliasOf ? { aliasOf: command.aliasOf } : {}),
    ...(command.approvalPrompt ? { approvalPrompt: command.approvalPrompt } : {}),
    description: command.description
  };
}

function commandsForCapability(group, commands) {
  const explicitCommands = new Set(group.commands || []);
  const domains = new Set(group.domains || []);
  return commands.filter((command) => domains.has(command.domain) || explicitCommands.has(command.command));
}

export function buildCliCapabilityRegistry({ format = "text" } = {}) {
  const commands = listCliCommands();
  const capabilities = CAPABILITY_GROUPS
    .map((group) => {
      const matchedCommands = commandsForCapability(group, commands);
      return {
        id: group.id,
        title: group.title,
        purpose: group.purpose,
        highestRiskTier: highestRiskTier(matchedCommands),
        modes: uniqueSorted(matchedCommands.map((command) => command.mode)),
        sourceDocs: uniqueSorted(matchedCommands.flatMap((command) => command.sourceDocs || [])),
        commands: matchedCommands.map(commandSummary)
      };
    })
    .filter((capability) => capability.commands.length > 0);

  const registry = {
    type: "gccgw_capability_registry",
    generatedBy: "gccgw capabilities",
    principle: "Group the flat command map into operator workflows while keeping command risk, mode, and docs visible.",
    redacted: true,
    capabilities
  };

  if (format === "json") {
    return registry;
  }

  const lines = [
    "gccgw capability registry",
    "",
    "Capability | Highest Risk | Modes | Commands | Docs",
    "--- | --- | --- | --- | ---",
    ...capabilities.map((capability) => [
      `${capability.id}: ${capability.title}`,
      capability.highestRiskTier,
      capability.modes.join(", "),
      capability.commands.map((command) => command.command).join(", "),
      capability.sourceDocs.join(", ")
    ].join(" | "))
  ];
  return `${lines.join("\n")}\n`;
}

export function buildGccgwSelfCheckReport({
  nodeVersion = process.version,
  npmCliScriptConfigured = false,
  localBinExists = false,
  packageBinConfigured = false,
  globalCommandAvailable = false
} = {}) {
  const requiredChecks = {
    node: {
      ok: String(nodeVersion || "").trim() !== "",
      required: true,
      version: String(nodeVersion || "unknown")
    },
    npmScript: {
      ok: npmCliScriptConfigured === true,
      required: true,
      command: "npm run cli --"
    },
    localBin: {
      ok: localBinExists === true,
      required: true,
      command: "node bin/gccgw.mjs"
    },
    packageBin: {
      ok: packageBinConfigured === true,
      required: true,
      command: "gccgw"
    }
  };
  const optionalChecks = {
    globalPathCommand: {
      ok: globalCommandAvailable === true,
      required: false,
      command: "gccgw"
    }
  };
  const checks = {
    ...requiredChecks,
    ...optionalChecks
  };

  return {
    type: "gccgw_self_check",
    generatedBy: "gccgw self check",
    ok: Object.values(requiredChecks).every((check) => check.ok === true),
    checks,
    guidance: [
      "From the repository root, use: npm run cli -- <command>",
      "From the repository root, use: node bin/gccgw.mjs <command>",
      "To use bare gccgw in a shell, run npm link from the repository root or add the npm-linked bin directory to the shell PATH."
    ],
    redacted: true
  };
}

const INSTALL_PLAN_STEPS = [
  {
    step: "clone-or-place-checkout",
    riskTier: "C",
    command: "git clone <repo-url> /opt/proxy-gateway-minimal",
    boundary: "Source checkout only; no sensitive values, SQLite, service start, DNS, or Nginx mutation implied."
  },
  {
    step: "install-cli",
    riskTier: "B",
    command: "npm ci && npm link && gccgw self check",
    boundary: "Installs project dependencies and registers the local npm CLI on the host."
  },
  {
    step: "preflight",
    riskTier: "C",
    command: "gccgw install preflight --json",
    boundary: "Read-only host shape check."
  },
  {
    step: "bootstrap",
    riskTier: "A",
    command: "gccgw install bootstrap --config-plan <reviewed-install-configure-plan.json> --execute-production-mutation --apply",
    boundary: "Applies reviewed systemd/Nginx/bootstrap materials only after the interactive Risk A prompt and a reviewed install configure plan."
  },
  {
    step: "operator-data",
    riskTier: "A",
    command: "install approved .env, SQLite backup, and node config by separate runbook",
    boundary: "Not performed by install plan/preflight/bootstrap; sensitive values and data remain separately gated."
  },
  {
    step: "status",
    riskTier: "C",
    command: "gccgw service status --json",
    boundary: "Read-only systemd/Nginx/health posture check."
  }
];

const PRODUCTION_INPUT_COMPONENTS = [
  { id: "topology", path: "topology.json", schema: "gccgw.productionTopology.v1" },
  { id: "publicBoundary", path: "public-boundary.json", schema: "gccgw.publicBoundary.v1" },
  { id: "plans", path: "plans.json", schema: "gccgw.subscriptionPlans.v1" },
  { id: "nodes", path: "nodes.json", schema: "gccgw.productionNodes.v1" },
  { id: "requiredEnvironment", path: "env.required.json", schema: "gccgw.requiredEnvironment.v1" },
  { id: "runbook", path: "runbook.md", schema: "markdown.runbook" }
];

function parsePackageJsonFile(files, path) {
  const value = files?.[path];
  if (value === undefined || value === null) {
    return { present: false, parsed: null, parseOk: false };
  }
  if (typeof value === "string") {
    try {
      return { present: true, parsed: JSON.parse(value), parseOk: true };
    } catch {
      return { present: true, parsed: null, parseOk: false };
    }
  }
  return { present: true, parsed: value, parseOk: true };
}

function packageFilePresent(files, path) {
  return files?.[path] !== undefined && files?.[path] !== null;
}

function findForbiddenPackageFields(value, path = []) {
  if (Array.isArray(value)) {
    return value.flatMap((item, index) => findForbiddenPackageFields(item, [...path, String(index)]));
  }
  if (!value || typeof value !== "object") {
    if (typeof value === "string" && /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(value)) {
      return [{ code: "customer_data_field", path: path.join(".") }];
    }
    return [];
  }

  const findings = [];
  for (const [key, child] of Object.entries(value)) {
    const nextPath = [...path, key];
    const joined = nextPath.join(".");
    const lowerKey = key.toLowerCase();
    const allowedPolicyKey = joined === "metadata.customerDataInGit"
      || joined === "registrationPolicy.customerFieldsInPackage";

    if (!allowedPolicyKey && /(customer|email|phone|telegram|realname)/i.test(key)) {
      findings.push({ code: "customer_data_field", path: joined });
    }
    if (/(subscriptionurl|artifactsecret|consoletoken|paymenttoken|accesskey|secretaccesskey|privatekey|sqlite|generatedyaml|handoff)/i.test(lowerKey)) {
      findings.push({ code: "forbidden_runtime_field", path: joined });
    }
    if (key === "value") {
      findings.push({ code: "raw_env_value", path: joined });
    }
    findings.push(...findForbiddenPackageFields(child, nextPath));
  }
  return findings;
}

function refLooksSafe(value, allowedPrefixes) {
  return typeof value === "string" && allowedPrefixes.some((prefix) => value.startsWith(prefix));
}

function nodeRefsSafe(nodes = {}) {
  const slots = Array.isArray(nodes.slots) ? nodes.slots : [];
  return slots.every((slot) => {
    const hostOk = refLooksSafe(slot.hostRef, ["runtime:", "env:", "protected-runtime:", "protected-env:"]);
    const credentialRefs = Array.isArray(slot.credentialRefs) ? slot.credentialRefs : [];
    const credentialsOk = credentialRefs.every((ref) => refLooksSafe(ref, [
      "env:",
      "protected-env:",
      "protected-file:",
      "runtime:"
    ]));
    return hostOk && credentialsOk;
  });
}

function envValuesAbsent(requiredEnv = {}) {
  const groups = [
    ...(Array.isArray(requiredEnv.runtime) ? requiredEnv.runtime : []),
    ...(Array.isArray(requiredEnv.optionalIntegrations) ? requiredEnv.optionalIntegrations : [])
  ];
  return groups.every((entry) => !Object.hasOwn(entry, "value"));
}

function jsonMetadataSafe(parsedFiles = []) {
  return parsedFiles.every((file) => {
    const metadata = file?.metadata || {};
    if (Object.hasOwn(metadata, "secretsInGit") && metadata.secretsInGit !== false) {
      return false;
    }
    if (Object.hasOwn(metadata, "customerDataInGit") && metadata.customerDataInGit !== false) {
      return false;
    }
    if (Object.hasOwn(metadata, "runtimeDataInGit") && metadata.runtimeDataInGit !== false) {
      return false;
    }
    return true;
  });
}

function uniqueFindings(findings) {
  const seen = new Set();
  return findings.filter((finding) => {
    const key = `${finding.code}:${finding.path}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function buildPackageInspectReport({
  packageName = "unknown",
  files = {}
} = {}) {
  const manifestFile = parsePackageJsonFile(files, "package-manifest.json");
  const manifest = manifestFile.parsed || {};
  const declaredComponents = Array.isArray(manifest.components) ? manifest.components : [];
  const declaredByPath = new Map(declaredComponents.map((component) => [component.path, component]));

  const components = [
    {
      id: "manifest",
      path: "package-manifest.json",
      present: manifestFile.present,
      schemaOk: manifestFile.parseOk && manifest.schema === "gccgw.productionInputPackage.v1",
      required: true
    },
    ...PRODUCTION_INPUT_COMPONENTS.map((expected) => {
      const parsed = expected.schema === "markdown.runbook"
        ? { present: packageFilePresent(files, expected.path), parseOk: packageFilePresent(files, expected.path), parsed: null }
        : parsePackageJsonFile(files, expected.path);
      const declared = declaredByPath.get(expected.path);
      return {
        id: expected.id,
        path: expected.path,
        present: parsed.present,
        schemaOk: expected.schema === "markdown.runbook"
          ? parsed.present
          : parsed.parseOk && parsed.parsed?.schema === expected.schema,
        declared: declared !== undefined,
        required: true
      };
    })
  ];

  const topology = parsePackageJsonFile(files, "topology.json").parsed || {};
  const plans = parsePackageJsonFile(files, "plans.json").parsed || {};
  const nodes = parsePackageJsonFile(files, "nodes.json").parsed || {};
  const requiredEnv = parsePackageJsonFile(files, "env.required.json").parsed || {};
  const jsonObjects = [
    manifest,
    topology,
    parsePackageJsonFile(files, "public-boundary.json").parsed || {},
    plans,
    nodes,
    requiredEnv
  ];
  const productionBoundary = inspectProductionArtifactBoundary({ paths: Object.keys(files) });
  const boundaryFindings = productionBoundary.blockers.map((finding) => ({
    code: "production_artifact_boundary",
    path: finding.path,
    detail: finding.reason
  }));
  const forbiddenFindings = uniqueFindings([
    ...jsonObjects.flatMap((item) => findForbiddenPackageFields(item)),
    ...boundaryFindings
  ]);
  const planIds = new Set((Array.isArray(plans.plans) ? plans.plans : []).map((plan) => plan.id));
  const registrationPlanRefs = Array.isArray(manifest.registrationPolicy?.availablePlanRefs)
    ? manifest.registrationPolicy.availablePlanRefs
    : [];

  const checks = {
    manifestPresent: {
      ok: manifestFile.present && manifestFile.parseOk,
      required: true
    },
    requiredComponentsPresent: {
      ok: components.every((component) => component.present === true && component.declared !== false),
      required: true
    },
    componentSchemas: {
      ok: components.every((component) => component.schemaOk === true),
      required: true
    },
    metadataFlagsSafe: {
      ok: jsonMetadataSafe(jsonObjects),
      required: true
    },
    noForbiddenFields: {
      ok: forbiddenFindings.length === 0,
      required: true
    },
    productionArtifactBoundary: {
      ok: productionBoundary.ok,
      required: true
    },
    registrationPolicyNoCustomerFields: {
      ok: manifest.registrationPolicy?.customerFieldsInPackage === false,
      required: true
    },
    registrationPlanRefsKnown: {
      ok: registrationPlanRefs.every((planRef) => planIds.has(planRef)),
      required: true
    },
    nodeRefsSafe: {
      ok: nodeRefsSafe(nodes),
      required: true
    },
    envValuesAbsent: {
      ok: envValuesAbsent(requiredEnv),
      required: true
    }
  };

  return {
    type: "gccgw_package_inspect",
    generatedBy: "gccgw package inspect",
    ok: Object.values(checks).every((check) => check.required !== true || check.ok === true),
    packageName: String(packageName || "unknown"),
    components,
    checks,
    forbiddenFindings,
    productionArtifactBoundary: {
      ok: productionBoundary.ok,
      blockerCount: productionBoundary.blockers.length,
      reviewRequiredCount: productionBoundary.reviewRequired.length
    },
    importPhases: (Array.isArray(manifest.importPhases) ? manifest.importPhases : []).map((phase) => ({
      name: phase.name,
      riskTier: phase.riskTier,
      mutation: phase.mutation === true
    })),
    redacted: true
  };
}

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function parseSafePackageJson(files, path) {
  return parsePackageJsonFile(files, path).parsed || {};
}

function summarizePlans(plans = {}) {
  return safeArray(plans.plans).map((plan) => ({
    id: plan.id,
    durationDays: Number.isFinite(plan.durationDays) ? plan.durationDays : null
  }));
}

function summarizeNodeSlots(nodes = {}) {
  return safeArray(nodes.slots).map((slot) => ({
    id: slot.id,
    pool: slot.pool,
    protocols: safeArray(slot.protocols),
    subscriptionEligible: slot.subscriptionEligible === true,
    hostRefPresent: typeof slot.hostRef === "string" && slot.hostRef.length > 0,
    credentialRefCount: safeArray(slot.credentialRefs).length
  }));
}

function countPublicBoundaryRoutes(publicBoundary = {}) {
  return safeArray(publicBoundary.expectedRoutes).length;
}

export function buildPackageImportDryRunReport({
  packageName = "unknown",
  files = {}
} = {}) {
  const inspect = buildPackageInspectReport({ packageName, files });
  const manifest = parseSafePackageJson(files, "package-manifest.json");
  const topology = parseSafePackageJson(files, "topology.json");
  const publicBoundary = parseSafePackageJson(files, "public-boundary.json");
  const plans = parseSafePackageJson(files, "plans.json");
  const nodes = parseSafePackageJson(files, "nodes.json");
  const requiredEnv = parseSafePackageJson(files, "env.required.json");
  const subscriptionPlans = summarizePlans(plans);
  const nodeSlots = summarizeNodeSlots(nodes);
  const blockers = [];

  if (!inspect.ok) {
    blockers.push({
      code: "package_inspection_failed",
      detail: "Run gccgw package inspect and resolve required package checks before dry-run import."
    });
  }
  if (!safeArray(manifest.importPhases).some((phase) => phase.name === "dry-run" && phase.riskTier === "B" && phase.mutation === false)) {
    blockers.push({
      code: "dry_run_phase_missing",
      detail: "The package manifest must declare a non-mutating B-tier dry-run phase."
    });
  }
  if (topology.operatorAccess?.publicAdmin === true) {
    blockers.push({
      code: "public_admin_exposure_requested",
      detail: "Public Admin exposure is outside the package import dry-run boundary."
    });
  }

  const plannedOperations = [
    {
      id: "inspect-package",
      riskTier: "C",
      mutation: false,
      summary: "Reuse package inspection checks before any import planning."
    },
    {
      id: "prepare-env-requirements",
      riskTier: "B",
      mutation: false,
      summary: "Summarize required runtime environment names and storage classes without values.",
      requiredRuntimeEnvCount: safeArray(requiredEnv.runtime).length,
      optionalIntegrationCount: safeArray(requiredEnv.optionalIntegrations).length
    },
    {
      id: "prepare-public-boundary-plan",
      riskTier: "B",
      mutation: false,
      summary: "Prepare public route expectations for later host validation.",
      expectedRouteCount: countPublicBoundaryRoutes(publicBoundary)
    },
    {
      id: "prepare-package-products",
      riskTier: "B",
      mutation: false,
      summary: "Prepare package subscription plan ids and durations.",
      planCount: subscriptionPlans.length
    },
    {
      id: "prepare-node-slots",
      riskTier: "B",
      mutation: false,
      summary: "Prepare node slot ids, pools, protocols, and reference counts without endpoints or credentials.",
      slotCount: nodeSlots.length
    }
  ];

  return {
    type: "gccgw_package_import_dry_run",
    generatedBy: "gccgw package import --dry-run",
    ok: blockers.length === 0,
    packageName: String(packageName || "unknown"),
    riskTier: "B",
    mutation: false,
    productionAuthority: false,
    packageKind: manifest.metadata?.packageKind || "unknown",
    environment: manifest.metadata?.environment || "unknown",
    controlPlane: {
      publicRouteCount: safeArray(topology.controlPlane?.publicRoutes).length,
      protectedRouteCount: safeArray(topology.controlPlane?.protectedRoutes).length,
      publicAdmin: topology.operatorAccess?.publicAdmin === true
    },
    subscriptionPlans,
    nodeSlots,
    plannedOperations,
    blockers,
    nextGate: {
      command: "gccgw package apply <package-dir> --import-plan <reviewed-package-import-plan.json> --config-plan <reviewed-install-configure-plan.json> --execute-production-mutation --apply",
      riskTier: "A",
      requiresSeparateExactApproval: true,
      mutation: true
    },
    redacted: true
  };
}

function summarizeSafeNodes(proxyConfig) {
  return createNodeRegistry({ proxyConfig }).listSafeNodes();
}

export function buildNodeInspectReport({
  proxyConfig = {},
  configPath = "config/proxy-servers.json"
} = {}) {
  const nodes = summarizeSafeNodes(proxyConfig);
  return {
    type: "gccgw_node_inspect",
    generatedBy: "gccgw node inspect",
    ok: true,
    configPath,
    nodeCount: nodes.length,
    nodes,
    mutation: false,
    productionAuthority: false,
    redacted: true
  };
}

function summarizePackageSlots(nodesPackage = {}) {
  return safeArray(nodesPackage.slots).map((slot) => ({
    id: String(slot.id || ""),
    role: String(slot.role || ""),
    pool: String(slot.pool || ""),
    protocols: safeArray(slot.protocols).map((protocol) => String(protocol)),
    subscriptionEligible: slot.subscriptionEligible === true,
    hostRefPresent: typeof slot.hostRef === "string" && slot.hostRef.length > 0,
    credentialRefCount: safeArray(slot.credentialRefs).length,
    bootstrapAuthority: String(slot.bootstrapAuthority || "")
  }));
}

export function buildNodeValidateReport({
  proxyConfig = {},
  nodesPackage = {},
  configPath = "config/proxy-servers.json",
  packageDir = "deployments/production-template"
} = {}) {
  const runtimeNodes = summarizeSafeNodes(proxyConfig);
  const packageSlots = summarizePackageSlots(nodesPackage);
  const runtimeIds = new Set(runtimeNodes.flatMap((node) => [node.id, node.name].filter(Boolean)));
  const eligibleSlots = packageSlots.filter((slot) => slot.subscriptionEligible);
  const missingEligibleRuntimeNodes = eligibleSlots
    .filter((slot) => !runtimeIds.has(slot.id))
    .map((slot) => ({
      id: slot.id,
      pool: slot.pool
    }));
  const runtimeNodesWithoutPackageSlot = runtimeNodes
    .filter((node) => !packageSlots.some((slot) => slot.id === node.id || slot.id === node.name))
    .map((node) => ({
      id: node.id,
      name: node.name,
      channelPool: node.channelPool
    }));
  const blockers = [];
  if (missingEligibleRuntimeNodes.length > 0) {
    blockers.push(blocker(
      "eligible_package_slot_missing_runtime_node",
      "Every subscription-eligible package slot must have a matching runtime node id before stable output can be trusted."
    ));
  }

  return {
    type: "gccgw_node_validate",
    generatedBy: "gccgw node validate",
    ok: blockers.length === 0,
    configPath,
    packageDir,
    summary: {
      packageSlotCount: packageSlots.length,
      runtimeNodeCount: runtimeNodes.length,
      eligiblePackageSlotCount: eligibleSlots.length,
      missingEligibleRuntimeNodeCount: missingEligibleRuntimeNodes.length
    },
    packageSlots,
    runtimeNodes,
    missingEligibleRuntimeNodes,
    runtimeNodesWithoutPackageSlot,
    blockers,
    mutation: false,
    productionAuthority: false,
    redacted: true
  };
}

const RAW_NODE_FACT_FIELDS = new Set([
  "host",
  "port",
  "password",
  "token",
  "secret",
  "subscriptionUrl",
  "url",
  "privateKey",
  "uuid"
]);

function containsRawNodeField(value) {
  if (!value || typeof value !== "object") {
    return false;
  }
  if (Array.isArray(value)) {
    return value.some(containsRawNodeField);
  }
  return Object.entries(value).some(([key, child]) => RAW_NODE_FACT_FIELDS.has(key) || containsRawNodeField(child));
}

function safeNodeRegistrationSummary(nodeFacts = {}) {
  return {
    id: String(nodeFacts.id || ""),
    role: String(nodeFacts.role || ""),
    pool: String(nodeFacts.pool || nodeFacts.channelPool || ""),
    protocols: safeArray(nodeFacts.protocols).map((protocol) => String(protocol)),
    provider: String(nodeFacts.provider || ""),
    region: String(nodeFacts.region || ""),
    endpointRefPresent: typeof nodeFacts.endpointRef === "string" && nodeFacts.endpointRef.length > 0,
    hostRefPresent: typeof nodeFacts.hostRef === "string" && nodeFacts.hostRef.length > 0,
    portRefPresent: typeof nodeFacts.portRef === "string" && nodeFacts.portRef.length > 0,
    credentialRefCount: safeArray(nodeFacts.credentialRefs).length,
    subscriptionEligible: nodeFacts.subscriptionEligible === true,
    lifecycle: String(nodeFacts.lifecycle || nodeFacts.status || "")
  };
}

export function buildNodeRegisterDryRunPlan({
  nodeFacts = {},
  inputPath = ""
} = {}) {
  const blockers = [];
  if (containsRawNodeField(nodeFacts)) {
    blockers.push(blocker(
      "raw_runtime_field_present",
      "Node registration input must use endpointRef/hostRef, portRef, and credentialRefs instead of raw runtime values."
    ));
  }
  if (!nodeFacts.id) {
    blockers.push(blocker("node_id_required", "Node registration input must include id."));
  }
  if (!nodeFacts.endpointRef && !nodeFacts.hostRef) {
    blockers.push(blocker("endpoint_ref_required", "Node registration input must include endpointRef or hostRef."));
  }
  if (!nodeFacts.portRef) {
    blockers.push(blocker("port_ref_required", "Node registration input must include portRef."));
  }

  return {
    type: "gccgw_node_register_dry_run",
    generatedBy: "gccgw node register --dry-run",
    ok: blockers.length === 0,
    inputPath,
    node: safeNodeRegistrationSummary(nodeFacts),
    plannedOperations: [
      {
        id: "record-safe-node-facts",
        mutation: false,
        summary: "Prepare safe node facts for operator review without writing runtime config."
      },
      {
        id: "validate-node-pool-policy",
        mutation: false,
        summary: "Validate pool and subscription eligibility before any later A-tier activation."
      },
      {
        id: "prepare-render-policy-review",
        mutation: false,
        summary: "Prepare subscription-output review without adding the node to live output."
      }
    ],
    blockers,
    mutation: false,
    productionAuthority: false,
    redacted: true
  };
}

export function buildNodeDisableDryRunPlan({
  nodeId = "",
  reason = ""
} = {}) {
  const blockers = [];
  if (!String(nodeId || "").trim()) {
    blockers.push(blocker("node_id_required", "Node disable dry-run requires a node id."));
  }
  return {
    type: "gccgw_node_disable_dry_run",
    generatedBy: "gccgw node disable --dry-run",
    ok: blockers.length === 0,
    nodeRef: String(nodeId || ""),
    reason: String(reason || ""),
    plannedOperations: [
      {
        id: "mark-node-disabled",
        mutation: false,
        summary: "Plan status change to disabled without writing runtime config."
      },
      {
        id: "validate-subscription-output",
        mutation: false,
        summary: "Plan a follow-up render validation so disabled nodes do not appear in default output."
      },
      {
        id: "record-operator-evidence",
        mutation: false,
        summary: "Plan an execution record before any A-tier runtime mutation."
      }
    ],
    blockers,
    mutation: false,
    productionAuthority: false,
    redacted: true
  };
}

function validatePackageImportPlanEnvelope(plan) {
  const blockers = [];
  if (!plan || typeof plan !== "object") {
    blockers.push(blocker("package_import_plan_missing", "Provide a parsed gccgw package import dry-run plan."));
    return { ok: false, blockers };
  }
  if (plan.type !== "gccgw_package_import_dry_run") {
    blockers.push(blocker("package_import_plan_type_invalid", "Import plan must be generated by gccgw package import --dry-run."));
  }
  if (plan.ok !== true || (Array.isArray(plan.blockers) && plan.blockers.length > 0)) {
    blockers.push(blocker("package_import_plan_not_ok", "Import plan must be ok and blocker-free before package apply."));
  }
  if (plan.redacted !== true) {
    blockers.push(blocker("package_import_plan_must_be_redacted", "Import plan must be redacted before package apply."));
  }
  if (plan.mutation !== false) {
    blockers.push(blocker("package_import_plan_must_be_non_mutating", "Import plan must be a non-mutating dry-run artifact."));
  }
  if (plan.productionAuthority !== false) {
    blockers.push(blocker("package_import_plan_must_not_grant_production_authority", "Import plan must not grant production authority."));
  }
  return {
    ok: blockers.length === 0,
    blockers
  };
}

export function buildPackageApplyPlan({
  packageName = "unknown",
  importPlan,
  configurePlan
} = {}) {
  const importValidation = validatePackageImportPlanEnvelope(importPlan);
  const configureValidation = validateInstallConfigurePlanEnvelope(configurePlan);
  const blockers = [
    ...importValidation.blockers,
    ...configureValidation.blockers
  ];
  const derivedPaths = configurePlan?.derivedPaths || {};
  const materialTargets = {
    envSkeletonPath: derivedPaths.envSkeletonPath || null,
    runtimeDbPath: derivedPaths.runtimeDbPath || null,
    controlDbPath: derivedPaths.controlDbPath || null,
    handoffDir: derivedPaths.handoffDir || null
  };

  if (!materialTargets.envSkeletonPath || !materialTargets.runtimeDbPath || !materialTargets.controlDbPath || !materialTargets.handoffDir) {
    blockers.push(blocker("package_apply_missing_material_targets", "Package apply requires reviewed env, SQLite, and handoff targets."));
  }

  const plannedOperations = [
    {
      id: "write-redacted-env-skeleton",
      mutation: true,
      requiresReviewedPlan: true,
      targetRef: "envSkeletonPath"
    },
    {
      id: "write-package-metadata",
      mutation: true,
      requiresReviewedPlan: true,
      targetRef: "serviceWorkingDirectory"
    },
    {
      id: "initialize-runtime-sqlite",
      mutation: true,
      requiresReviewedPlan: true,
      targetRef: "runtimeDbPath"
    },
    {
      id: "initialize-control-sqlite",
      mutation: true,
      requiresReviewedPlan: true,
      targetRef: "controlDbPath"
    },
    {
      id: "prepare-handoff-directory",
      mutation: true,
      requiresReviewedPlan: true,
      targetRef: "handoffDir"
    }
  ];

  return {
    type: "gccgw_package_apply_plan",
    generatedBy: "gccgw package apply",
    ok: blockers.length === 0,
    packageName: String(packageName || "unknown"),
    riskTier: "A",
    mutation: true,
    productionAuthority: false,
    packageKind: importPlan?.packageKind || "unknown",
    environment: importPlan?.environment || "unknown",
    materialTargets,
    plannedOperations,
    blockers,
    redacted: true
  };
}

export function validatePackageApplyPlanEnvelope(plan) {
  const blockers = [];
  if (!plan || typeof plan !== "object") {
    blockers.push(blocker("package_apply_plan_missing", "Provide a parsed gccgw package apply plan."));
    return { ok: false, blockers };
  }
  if (plan.type !== "gccgw_package_apply_plan") {
    blockers.push(blocker("package_apply_plan_type_invalid", "Apply plan must be generated by gccgw package apply."));
  }
  if (plan.ok !== true || (Array.isArray(plan.blockers) && plan.blockers.length > 0)) {
    blockers.push(blocker("package_apply_plan_not_ok", "Apply plan must be ok and blocker-free before material writes."));
  }
  if (plan.redacted !== true) {
    blockers.push(blocker("package_apply_plan_must_be_redacted", "Apply plan must be redacted before material writes."));
  }
  if (plan.mutation !== true) {
    blockers.push(blocker("package_apply_plan_must_be_mutating", "Apply plan must explicitly describe a mutating A-tier operation."));
  }
  if (plan.productionAuthority !== false) {
    blockers.push(blocker("package_apply_plan_must_not_grant_production_authority", "Apply plan must not grant production authority."));
  }
  if (!plan.materialTargets?.envSkeletonPath || !plan.materialTargets?.runtimeDbPath || !plan.materialTargets?.controlDbPath || !plan.materialTargets?.handoffDir) {
    blockers.push(blocker("package_apply_plan_missing_material_targets", "Apply plan must include env, SQLite, and handoff targets."));
  }
  return {
    ok: blockers.length === 0,
    blockers
  };
}

export function buildInstallPlan({ format = "text" } = {}) {
  const plan = {
    type: "gccgw_install_plan",
    generatedBy: "gccgw install plan",
    riskTier: "A for bootstrap execution",
    productionAuthority: false,
    commands: INSTALL_PLAN_STEPS,
    forbiddenByDefault: [
      "No .env value copy",
      "No SQLite copy or restore",
      "No service start or restart",
      "No DNS, firewall, cloud, or public Nginx boundary mutation",
      "No real subscription issuance"
    ],
    redacted: true
  };

  if (format === "json") {
    return plan;
  }

  const lines = [
    "gccgw install plan",
    "",
    "This is a read-only plan. It does not install, deploy, start services, copy secrets, restore SQLite, mutate DNS, or issue subscriptions.",
    "",
    "Step | Risk | Command | Boundary",
    "--- | --- | --- | ---",
    ...plan.commands.map((step) => [
      step.step,
      step.riskTier,
      step.command,
      step.boundary
    ].join(" | ")),
    "",
    "Forbidden by default:",
    ...plan.forbiddenByDefault.map((item) => `- ${item}`)
  ];
  return `${lines.join("\n")}\n`;
}

function isAbsoluteInstallDir(value) {
  return /^\/[^/]/.test(value) || /^[A-Za-z]:[\\/]/.test(value);
}

function normalizeInstallDir(value) {
  return String(value || "").trim().replace(/[\\/]+$/, "");
}

function pathJoin(base, suffix) {
  const separator = base.includes("\\") ? "\\" : "/";
  return `${base}${separator}${suffix.replace(/\//g, separator)}`;
}

function loopbackHostname(hostname) {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
}

function parsePublicBaseUrl(value) {
  const raw = String(value || "").trim();
  if (!raw) {
    return { raw, url: null, issue: "public_base_url_required" };
  }
  try {
    const url = new URL(raw);
    const https = url.protocol === "https:";
    const loopback = url.protocol === "http:" && loopbackHostname(url.hostname);
    if (!https && !loopback) {
      return { raw, url, issue: "public_base_url_must_be_https_or_loopback" };
    }
    return { raw, url, issue: null };
  } catch {
    return { raw, url: null, issue: "public_base_url_invalid" };
  }
}

function parseConsolePort(value) {
  const raw = value === undefined ? "3456" : String(value).trim();
  const port = Number(raw);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    return { port: null, issue: "console_port_invalid" };
  }
  return { port, issue: null };
}

function blocker(code, message) {
  return { code, severity: "blocker", message };
}

export function buildInstallConfigurePlan({
  domain,
  installDir = "/opt/proxy-gateway-minimal",
  managementSource,
  consolePort,
  targetRole = "subscription-control"
} = {}) {
  const blockers = [];
  const normalizedInstallDir = normalizeInstallDir(installDir);
  const baseUrl = parsePublicBaseUrl(domain);
  const parsedPort = parseConsolePort(consolePort);
  const adminAllowedCidrs = String(managementSource || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);

  if (baseUrl.issue) {
    blockers.push(blocker(baseUrl.issue, "Provide an HTTPS public base URL, or an HTTP loopback URL for private validation."));
  }
  if (!isAbsoluteInstallDir(normalizedInstallDir)) {
    blockers.push(blocker("install_dir_must_be_absolute", "Provide an absolute install directory so derived paths cannot escape the deployment root."));
  }
  if (adminAllowedCidrs.length === 0) {
    blockers.push(blocker("management_source_required", "Provide at least one operator management source CIDR."));
  }
  if (parsedPort.issue) {
    blockers.push(blocker(parsedPort.issue, "Provide a numeric console port between 1 and 65535."));
  }

  const safeInstallDir = isAbsoluteInstallDir(normalizedInstallDir)
    ? normalizedInstallDir
    : "/opt/proxy-gateway-minimal";
  const derivedPaths = {
    runtimeDbPath: pathJoin(safeInstallDir, ".proxy-gateway/subscriptions.sqlite"),
    controlDbPath: pathJoin(safeInstallDir, ".proxy-gateway/subscription-control.sqlite"),
    handoffDir: pathJoin(safeInstallDir, "handoff"),
    envSkeletonPath: pathJoin(safeInstallDir, ".env"),
    serviceWorkingDirectory: safeInstallDir
  };

  return {
    type: "gccgw_install_configure_plan",
    generatedBy: "gccgw install configure --dry-run",
    ok: blockers.length === 0,
    riskTier: "B",
    mutation: false,
    productionAuthority: false,
    install: {
      installDir: normalizedInstallDir || null,
      targetRole: String(targetRole || "subscription-control"),
      consolePort: parsedPort.port
    },
    publicBaseUrl: {
      configured: Boolean(baseUrl.url),
      https: baseUrl.url?.protocol === "https:",
      loopback: Boolean(baseUrl.url && loopbackHostname(baseUrl.url.hostname)),
      host: baseUrl.url?.hostname || null
    },
    management: {
      adminAllowedCidrs,
      trustedProxyCidrs: []
    },
    derivedPaths,
    envSkeleton: [
      { name: "NODE_ENV", valueKind: "literal", valuePreview: "production", secret: false },
      { name: "CONSOLE_PORT", valueKind: "literal", valuePreview: String(parsedPort.port || ""), secret: false },
      { name: "PUBLIC_SUBSCRIPTION_BASE_URL", valueKind: "operator-input", configured: Boolean(baseUrl.url), secret: false },
      { name: "ADMIN_ALLOWED_CIDRS", valueKind: "operator-input", configured: adminAllowedCidrs.length > 0, secret: false },
      { name: "SUBSCRIPTION_DB_PATH", valueKind: "derived-path", pathRef: "runtimeDbPath", secret: false },
      { name: "SUBSCRIPTION_CONTROL_DB_PATH", valueKind: "derived-path", pathRef: "controlDbPath", secret: false },
      { name: "HANDOFF_DIR", valueKind: "derived-path", pathRef: "handoffDir", secret: false },
      { name: "CONSOLE_TOKEN", valueKind: "secret-required", secret: true },
      { name: "SS_PASSWORD", valueKind: "secret-required", secret: true },
      { name: "TRUSTED_PROXY_CIDRS", valueKind: "optional", secret: false },
      { name: "SUB_RATE_LIMIT_WINDOW_MS", valueKind: "default", valuePreview: "60000", secret: false },
      { name: "SUB_RATE_LIMIT_MAX", valueKind: "default", valuePreview: "30", secret: false },
      { name: "SUBSCRIPTION_TEMP_LINK_TTL_MINUTES", valueKind: "default", valuePreview: "1440", secret: false }
    ],
    plannedOperations: [
      { id: "validate-install-facts", mutation: false },
      { id: "derive-db-and-handoff-paths", mutation: false },
      { id: "render-redacted-env-skeleton", mutation: false },
      { id: "prepare-next-bootstrap-gate", mutation: false }
    ],
    blockers,
    nextGate: {
      command: "gccgw install bootstrap --config-plan <reviewed-install-configure-plan.json> --execute-production-mutation --apply",
      riskTier: "A",
      requiresSeparateExactApproval: true,
      mutation: true
    },
    redacted: true
  };
}

export function validateInstallConfigurePlanEnvelope(plan) {
  const blockers = [];
  if (!plan || typeof plan !== "object") {
    blockers.push(blocker("configure_plan_missing", "Provide a parsed gccgw install configure plan."));
    return { ok: false, blockers };
  }
  if (plan.type !== "gccgw_install_configure_plan") {
    blockers.push(blocker("configure_plan_type_invalid", "Configure plan must be generated by gccgw install configure --dry-run."));
  }
  if (plan.ok !== true || (Array.isArray(plan.blockers) && plan.blockers.length > 0)) {
    blockers.push(blocker("configure_plan_not_ok", "Configure plan must be ok and blocker-free before bootstrap."));
  }
  if (plan.redacted !== true) {
    blockers.push(blocker("configure_plan_must_be_redacted", "Configure plan must be redacted before bootstrap."));
  }
  if (plan.mutation !== false) {
    blockers.push(blocker("configure_plan_must_be_non_mutating", "Configure plan must be a non-mutating dry-run artifact."));
  }
  if (plan.productionAuthority !== false) {
    blockers.push(blocker("configure_plan_must_not_grant_production_authority", "Configure plan must not grant production authority."));
  }
  if (!plan.derivedPaths?.envSkeletonPath || !plan.derivedPaths?.runtimeDbPath || !plan.derivedPaths?.controlDbPath) {
    blockers.push(blocker("configure_plan_missing_derived_paths", "Configure plan must include derived env and database paths."));
  }
  return {
    ok: blockers.length === 0,
    blockers
  };
}

export function buildInstallPreflightReport({
  platform = process.platform,
  files = {},
  commands = {},
  isRoot = false
} = {}) {
  const checks = {
    linuxHost: {
      ok: platform === "linux",
      required: true
    },
    packageJson: {
      ok: files.packageJson === true,
      required: true
    },
    bootstrapScript: {
      ok: files.bootstrap === true,
      required: true
    },
    systemdTemplates: {
      ok: files.consoleUnit === true && files.ssUnit === true,
      required: true
    },
    nginxTemplate: {
      ok: files.nginxTemplate === true,
      required: true
    },
    envTemplate: {
      ok: files.envTemplate === true,
      required: true
    },
    node: {
      ok: commands.node === true,
      required: true
    },
    npm: {
      ok: commands.npm === true,
      required: true
    },
    git: {
      ok: commands.git === true,
      required: true
    },
    bash: {
      ok: commands.bash === true,
      required: true
    },
    systemctl: {
      ok: commands.systemctl === true,
      required: false
    },
    nginx: {
      ok: commands.nginx === true,
      required: false
    },
    rootForBootstrap: {
      ok: isRoot === true,
      required: false
    }
  };

  return {
    type: "gccgw_install_preflight",
    generatedBy: "gccgw install preflight",
    ok: Object.values(checks).every((check) => check.required !== true || check.ok === true),
    checks,
    nextCommand: "gccgw install bootstrap --config-plan <reviewed-install-configure-plan.json> --execute-production-mutation --apply",
    redacted: true
  };
}

export function buildBackupPlan({ format = "text" } = {}) {
  return {
    type: "gccgw_backup_plan",
    generatedBy: "gccgw backup plan",
    riskTier: "C for plan and preflight; A for any restore execution",
    mutationAllowed: false,
    purpose: "Describe subscription SQLite backup and restore command boundaries without copying, reading, or printing database contents.",
    commands: [
      {
        command: "scripts/backup-subscriptions.sh",
        riskTier: "A when executed against production state",
        boundary: "Creates a SQLite backup on the approved host only; never copy raw database or backup contents into git, chat, docs, or terminal output."
      },
      {
        command: "scripts/restore-subscriptions.sh <verified-backup.sqlite>",
        riskTier: "A",
        boundary: "Stops and starts the service and replaces SQLite state; requires separate exact approval, fresh backup, integrity checks, and rollback plan."
      }
    ],
    checks: [
      "Confirm target host and service role.",
      "Confirm backup script, restore script, bash, sqlite3, and service manager availability.",
      "Record only safe metadata such as filename label, mode, size, and integrity result.",
      "Never print row data, credential material, delivery links, handoff material, or customer data."
    ],
    sourceDocs: DOMAIN_SOURCE_DOCS.backup,
    redacted: true,
    format
  };
}

export function buildBackupPreflightReport({
  mode = "backup",
  platform = process.platform,
  files = {},
  commands = {}
} = {}) {
  const restoreMode = mode === "restore";
  const checks = {
    linuxHost: {
      ok: platform === "linux",
      required: true,
      detail: "Backup and restore scripts are Bash/Linux host operations."
    },
    backupScript: {
      ok: files.backupScript === true,
      required: true,
      path: "scripts/backup-subscriptions.sh"
    },
    restoreScript: {
      ok: files.restoreScript === true,
      required: restoreMode,
      path: "scripts/restore-subscriptions.sh"
    },
    bash: {
      ok: commands.bash === true,
      required: true,
      command: "bash"
    },
    sqlite3: {
      ok: commands.sqlite3 === true,
      required: true,
      command: "sqlite3"
    },
    systemctl: {
      ok: commands.systemctl === true,
      required: restoreMode,
      command: "systemctl"
    }
  };
  return {
    type: "gccgw_backup_preflight",
    generatedBy: restoreMode ? "gccgw backup restore-preflight" : "gccgw backup preflight",
    mode: restoreMode ? "restore" : "backup",
    ok: Object.values(checks).every((check) => check.required !== true || check.ok === true),
    mutationAllowed: false,
    checks,
    sourceDocs: DOMAIN_SOURCE_DOCS.backup,
    redacted: true
  };
}

export function buildReleasePlan({ format = "text" } = {}) {
  return {
    type: "gccgw_release_plan",
    generatedBy: "gccgw release plan",
    riskTier: "C for plan and status; A for any server promotion or deploy",
    mutationAllowed: false,
    purpose: "Describe the packaged release model without deploying, reloading Nginx, changing systemd, or touching production data.",
    steps: [
      {
        name: "package",
        command: "gccgw package dry-run",
        boundary: "Preview package contents only."
      },
      {
        name: "verify",
        command: "gccgw project verify",
        boundary: "Run local repository gates before selecting a release candidate."
      },
      {
        name: "server-preflight",
        command: "gccgw install preflight",
        boundary: "Read-only host capability check."
      },
      {
        name: "promotion",
        command: "separate approved deployment gate",
        boundary: "No deploy, symlink switch, Nginx reload, service restart, DNS, firewall, or state copy is authorized by this plan."
      }
    ],
    sourceDocs: DOMAIN_SOURCE_DOCS.release,
    redacted: true,
    format
  };
}

export function buildReleaseStatusReport({
  platform = process.platform,
  files = {},
  git = {}
} = {}) {
  return {
    type: "gccgw_release_status",
    generatedBy: "gccgw release status",
    ok: files.packageJson === true,
    platform,
    files: {
      packageJson: files.packageJson === true,
      releaseJson: files.releaseJson === true
    },
    git: {
      branch: String(git.branch || "unknown"),
      head: String(git.head || "unknown")
    },
    mutationAllowed: false,
    sourceDocs: DOMAIN_SOURCE_DOCS.release,
    redacted: true
  };
}

const PROJECT_ARCHITECTURE_LAYERS = [
  {
    layer: "adapter",
    purpose: "Accept commands or HTTP/UI requests and enforce entry-boundary rules.",
    modules: [
      "bin/gccgw.mjs",
      "scripts/*.mjs",
      "server/routes/*.mjs",
      "admin/src/*"
    ],
    rule: "Adapters parse input, authenticate, gate, and call services; they must not own business state transitions."
  },
  {
    layer: "service",
    purpose: "Own the business functions behind subscription control, portal access, channel evidence, and local gateway behavior.",
    modules: [
      "server/services/platform/*.mjs",
      "server/services/subscriptions/*.mjs",
      "server/services/channel-*.mjs",
      "server/services/*.mjs"
    ],
    rule: "Services are the source of business behavior and should be callable from CLI, HTTP, or tests without depending on a specific presentation shell."
  },
  {
    layer: "storage",
    purpose: "Persist runtime and control-plane facts.",
    modules: [
      "server/state.mjs",
      "server/services/platform/subscription-control-db.mjs",
      "server/services/subscriptions/repository.mjs",
      "config/*.json"
    ],
    rule: "SQLite and config writes must go through explicit service functions or execution-gated scripts."
  },
  {
    layer: "output",
    purpose: "Return safe summaries, public site assets, subscription YAML, resource packages, and operator handoff material.",
    modules: [
      "server/routes/subscription.mjs",
      "server/services/subscriptions/serializer.mjs",
      "server/services/platform/resource-package.mjs",
      "handoff/ (gitignored)"
    ],
    rule: "Raw subscription URLs, bearer material, and customer data must not be printed to stdout, chat, docs, or git-tracked files."
  },
  {
    layer: "gate",
    purpose: "Separate read-only checks, dry-runs, local builds, and production mutations.",
    modules: [
      "gccgw command map",
      "docs/*RUNBOOK*.md",
      "project-state/current.json",
      "project-state/tasks.json"
    ],
    rule: "C-tier is read-only/docs, B-tier is local code/test/build, and A-tier requires explicit approval plus rollback discipline."
  }
];

const PROJECT_ARCHITECTURE_FLOWS = [
  {
    name: "Controlled subscription issuance",
    path: [
      "gccgw platform issue-subscription",
      "scripts/platform-issue-subscription.mjs",
      "executeSubscriptionIssuance(...)",
      "subscription-control DB + runtime subscription store",
      "0600 handoff file + safe summary"
    ],
    riskTier: "A",
    boundary: "Execution-gated; no raw subscription material in stdout or git."
  },
  {
    name: "User portal access",
    path: [
      "portal entry / session",
      "server/routes/user-portal.mjs",
      "platform user portal services",
      "subscription-control DB",
      "safe portal state"
    ],
    riskTier: "B/A by endpoint",
    boundary: "User-facing routes must render server-owned lifecycle state, not client-computed subscription authority."
  },
  {
    name: "Public subscription rendering",
    path: [
      "subscription client",
      "server/routes/subscription.mjs",
      "subscription-route-resolver + core",
      "node registry + serializer",
      "Clash/Mihomo YAML"
    ],
    riskTier: "A for public boundary changes",
    boundary: "Public routes expose only approved subscription surfaces; Admin stays blocked publicly."
  },
  {
    name: "Channel technical MVP",
    path: [
      "gccgw channel ...",
      "scripts/channel-*.mjs",
      "server/services/channel-*.mjs",
      "benchmark / readiness / gate evidence",
      "operator decision packet"
    ],
    riskTier: "C/B unless runtime mutation is separately approved",
    boundary: "Channel tools produce evidence and previews; they do not activate production traffic by themselves."
  }
];

export function buildCliArchitectureMap({ format = "text" } = {}) {
  const architecture = {
    type: "gccgw_architecture_map",
    generatedBy: "gccgw architecture",
    principle: "Flatten code into adapters, services, storage, outputs, and gates while preserving runtime structure.",
    layers: PROJECT_ARCHITECTURE_LAYERS,
    flows: PROJECT_ARCHITECTURE_FLOWS
  };

  if (format === "json") {
    return architecture;
  }

  const lines = [
    "gccgw architecture map",
    "",
    architecture.principle,
    "",
    "Layers",
    "Layer | Purpose | Modules | Rule",
    "--- | --- | --- | ---",
    ...architecture.layers.map((layer) => [
      layer.layer,
      layer.purpose,
      layer.modules.join(", "),
      layer.rule
    ].join(" | ")),
    "",
    "Flows",
    "Name | Risk | Path | Boundary",
    "--- | --- | --- | ---",
    ...architecture.flows.map((flow) => [
      flow.name,
      flow.riskTier,
      flow.path.join(" -> "),
      flow.boundary
    ].join(" | "))
  ];
  return `${lines.join("\n")}\n`;
}

function normalizeCommandQuery(value = "") {
  return String(value).replace(/^gccgw\s+/, "").trim().replace(/\s+/g, " ");
}

function commandsForDocsMode({ mode = "list", query } = {}) {
  const commands = listCliCommands();
  if (mode === "list") {
    return commands;
  }
  if (mode === "domain") {
    const wantedDomain = String(query || "").trim();
    const matched = commands.filter((command) => command.domain === wantedDomain);
    if (matched.length === 0) {
      throw new Error(`No gccgw docs found for domain: ${wantedDomain || "(missing)"}`);
    }
    return matched;
  }
  if (mode === "command") {
    const wantedCommand = normalizeCommandQuery(query);
    const matched = commands.filter((command) => normalizeCommandQuery(command.command) === wantedCommand);
    if (matched.length === 0) {
      throw new Error(`No gccgw docs found for command: ${wantedCommand || "(missing)"}`);
    }
    return matched;
  }
  throw new Error(`Unsupported docs mode: ${mode}`);
}

function docsIndexForCommands(commands) {
  const docs = new Map();
  for (const command of commands) {
    for (const path of command.sourceDocs || []) {
      const current = docs.get(path) || {
        path,
        domains: new Set(),
        commands: new Set(),
        riskTiers: new Set(),
        modes: new Set()
      };
      current.domains.add(command.domain);
      current.commands.add(command.command);
      current.riskTiers.add(command.riskTier);
      current.modes.add(command.mode);
      docs.set(path, current);
    }
  }
  return [...docs.values()]
    .map((doc) => ({
      path: doc.path,
      domains: [...doc.domains].sort(),
      commands: [...doc.commands].sort(),
      riskTiers: [...doc.riskTiers].sort(),
      modes: [...doc.modes].sort()
    }))
    .sort((a, b) => a.path.localeCompare(b.path));
}

export function buildCliDocsMap({ mode = "list", query, format = "text" } = {}) {
  const commands = commandsForDocsMode({ mode, query });
  const documents = docsIndexForCommands(commands);
  const docsMap = {
    type: "gccgw_docs_map",
    generatedBy: "gccgw docs",
    mode,
    ...(query ? { query } : {}),
    documents,
    commands
  };

  if (format === "json") {
    return docsMap;
  }

  const lines = [
    "gccgw docs map",
    "",
    `Mode: ${mode}${query ? ` (${query})` : ""}`,
    "",
    "Document | Domains | Risks | Modes | Commands",
    "--- | --- | --- | --- | ---",
    ...documents.map((doc) => [
      doc.path,
      doc.domains.join(", "),
      doc.riskTiers.join(", "),
      doc.modes.join(", "),
      doc.commands.join(", ")
    ].join(" | "))
  ];
  return `${lines.join("\n")}\n`;
}

function buildCommandHelp({ query }) {
  const wantedCommand = normalizeCommandQuery(query);
  const command = listCliCommands().find((entry) => normalizeCommandQuery(entry.command) === wantedCommand);
  if (!command) {
    throw new Error(`No gccgw command found for help: ${wantedCommand || "(missing)"}`);
  }
  const lines = [
    command.command,
    "",
    command.description,
    "",
    `Domain: ${command.domain}`,
    `Risk: ${command.riskTier}`,
    `Mode: ${command.mode}`,
    `Surface: ${command.surface}`,
    ...(command.aliasOf ? [`Alias of: ${command.aliasOf}`] : []),
    ...(command.approvalPrompt ? [`Approval prompt: ${command.approvalPrompt}`] : []),
    ...(command.target ? [`Target: ${command.target}`] : []),
    `Docs: ${command.sourceDocs.join(", ")}`
  ];
  return `${lines.join("\n")}\n`;
}

function hasRegisteredCommand(key) {
  return NODE_SCRIPT_COMMANDS.has(key) || PACKAGE_SCRIPT_COMMANDS.has(key);
}

function hasKnownCommand(key) {
  return hasRegisteredCommand(key) || SPECIAL_COMMAND_ENTRIES.some(([command]) => command === key);
}

function isHelpArg(value) {
  return value === "help" || value === "--help" || value === "-h";
}

function optionValue(args, name) {
  const index = args.indexOf(name);
  if (index === -1) {
    return undefined;
  }
  return args[index + 1];
}

function positionalArgs(args, startIndex = 0) {
  const result = [];
  for (let index = startIndex; index < args.length; index += 1) {
    const value = args[index];
    if (value === "--json" || value === "--dry-run" || value === "--execute-production-mutation" || value === "--apply") {
      continue;
    }
    if (
      value === "--config"
      || value === "--profile"
      || value === "--package"
      || value === "--reason"
      || value === "--input"
      || value === "--desired-state"
    ) {
      index += 1;
      continue;
    }
    result.push(value);
  }
  return result;
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
  gccgw capabilities [--json]
  gccgw architecture [--json]
  gccgw config list [--json] [--config <path>]
  gccgw config show <profile> [--json] [--config <path>]
  gccgw config validate [--profile <profile>] [--json] [--config <path>]
  gccgw docs list [--json]
  gccgw docs domain <domain> [--json]
  gccgw docs command <command> [--json]
  gccgw install configure --dry-run --domain <url> --install-dir <path> --management-source <cidr> [--json]
  gccgw install plan [--json]
  gccgw install preflight [--json]
  gccgw edge credentials reconcile-plan --input <desired-state.json> [--json]
  gccgw edge credentials apply --input <desired-state.json> --execute-production-mutation [--json]
  gccgw edge tuic-credentials plan --input <desired-state.json> [--json]
  gccgw edge tuic-credentials apply --input <desired-state.json> --execute-production-mutation [--json]
  gccgw node inspect [--config <proxy-servers.json>] [--json]
  gccgw node validate [--package <package-dir>] [--config <proxy-servers.json>] [--json]
  gccgw node policy-check [--config <proxy-servers.json>] [--json]
  gccgw node register --dry-run <safe-node-facts.json> [--json]
  gccgw node disable --dry-run <node-id> [--reason <text>] [--json]
  gccgw install bootstrap --config-plan <reviewed-install-configure-plan.json> --execute-production-mutation --apply
  gccgw package inspect <package-dir> [--json]
  gccgw package import <package-dir> --dry-run [--json]
  gccgw package apply <package-dir> --import-plan <reviewed-package-import-plan.json> --config-plan <reviewed-install-configure-plan.json> --execute-production-mutation --apply
  gccgw self check
  gccgw service status [--json]
  gccgw server start
  gccgw project check
  gccgw project handoff-brief [--focus <text>] [--json] [--dry-run]
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
  gccgw capabilities
  gccgw capabilities --json
  gccgw architecture
  gccgw architecture --json
  gccgw config list
  gccgw config show local
  gccgw config validate --profile aliyun-prod
  gccgw docs command platform issue-subscription
  gccgw docs domain platform
  gccgw install configure --dry-run --domain https://sub.example.com --install-dir /opt/gccgw --management-source 203.0.113.10/32 --json
  gccgw install plan
  gccgw install preflight --json
  gccgw edge credentials reconcile-plan --input desired-state.json --json
  gccgw edge credentials apply --input reviewed-desired-state.json --execute-production-mutation --json
  gccgw edge tuic-credentials plan --input desired-state.json --json
  gccgw edge tuic-credentials apply --input reviewed-desired-state.json --execute-production-mutation --json
  gccgw package inspect deployments/production-template --json
  gccgw package import deployments/production-template --dry-run --json
  gccgw package apply deployments/production-template --import-plan reviewed-package-import-plan.json --config-plan reviewed-install-configure-plan.json --execute-production-mutation --apply
  gccgw node inspect --json
  gccgw node validate --package deployments/production-template --json
  gccgw node policy-check --json
  gccgw node register --dry-run safe-node-facts.json --json
  gccgw node disable --dry-run prod-edge-a --reason maintenance --json
  gccgw node plan
  gccgw node preflight --json
  gccgw node status --json
  gccgw self check
  gccgw service status --json
  gccgw project check
  gccgw project verify --with-admin
  gccgw env check
  gccgw ops network-status
  gccgw site verify
  gccgw package dry-run
  gccgw release plan
  gccgw release status --json
  gccgw backup plan
  gccgw backup preflight --json
  gccgw backup restore-preflight --json
  gccgw subscription form <input.json>
  gccgw subscription issue [--dry-run] <input.json>
  gccgw subscription portal-entry [--dry-run] <input.json>
  gccgw subscription portal-initial-account [--dry-run] <input.json>
  gccgw subscription revoke <tenant-ref> --dry-run
  gccgw platform provisioning-form <input.json>
  gccgw platform issue-subscription [--dry-run] <input.json>
  gccgw platform issue-portal-entry [--dry-run] <input.json>
  gccgw platform issue-portal-initial-account [--dry-run] <input.json>
  gccgw platform revoke-access <tenant-ref> --dry-run
  gccgw channel validate <config.json>
  gccgw channel measure <manifest.json>
  gccgw channel decide <packet.json>
  gccgw channel package <fixture.json> [proxy-servers.json]
  gccgw channel record <fixture.json>

Risk A execution prompt:
  Any A-tier command carrying --execute-production-mutation requires an
  interactive approval prompt before dispatching the underlying script.

No-arg compatibility:
  gccgw
    Starts the local proxy gateway server.
`;
}

function commandMetadataForExecutionCommand(command) {
  if (command.commandName) {
    const wanted = normalizeCommandQuery(command.commandName);
    const matched = listCliCommands().find((entry) => normalizeCommandQuery(entry.command) === wanted);
    if (matched) return matched;
  }
  return listCliCommands().find((entry) => entry.handler === "node-script" && entry.target === command.script);
}

function requiresRiskAExecutionPrompt(command) {
  const metadata = commandMetadataForExecutionCommand(command);
  if (metadata?.riskTier !== "A") {
    return null;
  }
  if (metadata.mode !== "execution-gated") {
    return null;
  }
  const hasExecutionFlag = command.executeProductionMutation === true
    || (Array.isArray(command.args) && command.args.includes("--execute-production-mutation"));
  if (!hasExecutionFlag) {
    return null;
  }
  return {
    command: metadata.command,
    riskTier: metadata.riskTier,
    mode: metadata.mode,
    sourceDocs: metadata.sourceDocs,
    description: metadata.description
  };
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
  if (args[0] === "capabilities") {
    return {
      kind: "capability-registry",
      format: args.includes("--json") ? "json" : "text"
    };
  }
  if (args[0] === "config") {
    const mode = args[1] || "list";
    const format = args.includes("--json") ? "json" : "text";
    const configPath = optionValue(args, "--config");
    if (mode === "list") {
      return { kind: "config-map", mode, format, configPath };
    }
    if (mode === "show") {
      return {
        kind: "config-map",
        mode,
        profile: positionalArgs(args, 2)[0],
        format,
        configPath
      };
    }
    if (mode === "validate") {
      return {
        kind: "config-map",
        mode,
        profile: optionValue(args, "--profile") || positionalArgs(args, 2)[0],
        format,
        configPath
      };
    }
    throw new Error(`Unknown gccgw config command: ${mode}`);
  }
  if (args[0] === "architecture") {
    return {
      kind: "architecture-map",
      format: args.includes("--json") ? "json" : "text"
    };
  }
  if (args[0] === "docs") {
    const mode = args[1] || "list";
    const format = args.includes("--json") ? "json" : "text";
    if (mode === "list") {
      return { kind: "docs-map", mode, format };
    }
    if (mode === "domain") {
      return {
        kind: "docs-map",
        mode,
        query: args.find((arg, index) => index > 1 && arg !== "--json"),
        format
      };
    }
    if (mode === "command") {
      return {
        kind: "docs-map",
        mode,
        query: args.slice(2).filter((arg) => arg !== "--json").join(" "),
        format
      };
    }
    throw new Error(`Unknown gccgw docs command: ${mode}`);
  }
  if (args[0] === "package" && args[1] === "inspect") {
    return {
      kind: "package-inspect",
      packageDir: positionalArgs(args, 2)[0],
      format: args.includes("--json") ? "json" : "text"
    };
  }
  if (args[0] === "package" && args[1] === "import") {
    const packageDir = positionalArgs(args, 2)[0];
    if (args.includes("--dry-run")) {
      return {
        kind: "package-import-dry-run",
        packageDir,
        format: args.includes("--json") ? "json" : "text"
      };
    }
    throw new Error("gccgw package import supports --dry-run only. Use gccgw package apply with reviewed plans for the Risk A apply gate.");
  }
  if (args[0] === "package" && args[1] === "apply") {
    return {
      kind: "package-apply",
      commandName: "gccgw package apply",
      packageDir: positionalArgs(args, 2)[0],
      importPlanPath: optionValue(args, "--import-plan"),
      configPlanPath: optionValue(args, "--config-plan"),
      executeProductionMutation: args.includes("--execute-production-mutation"),
      apply: args.includes("--apply"),
      format: args.includes("--json") ? "json" : "text"
    };
  }
  if (args[0] === "edge" && args[1] === "tuic-credentials") {
    const mode = args[2];
    const inputPath = optionValue(args, "--input") || optionValue(args, "--desired-state") || positionalArgs(args, 3)[0];
    if (mode === "plan") {
      return {
        kind: "edge-tuic-credentials-plan",
        inputPath,
        format: args.includes("--json") ? "json" : "text"
      };
    }
    if (mode === "apply") {
      return {
        kind: "edge-tuic-credentials-apply",
        commandName: "gccgw edge tuic-credentials apply",
        inputPath,
        executeProductionMutation: args.includes("--execute-production-mutation"),
        format: args.includes("--json") ? "json" : "text"
      };
    }
    throw new Error(`Unknown gccgw edge tuic-credentials command: ${mode || ""}`.trim());
  }
  if (args[0] === "edge" && args[1] === "credentials") {
    const mode = args[2];
    const inputPath = optionValue(args, "--input") || optionValue(args, "--desired-state") || positionalArgs(args, 3)[0];
    if (mode === "reconcile-plan" || mode === "plan") {
      return {
        kind: "edge-credentials-reconcile-plan",
        inputPath,
        format: args.includes("--json") ? "json" : "text"
      };
    }
    if (mode === "apply") {
      return {
        kind: "edge-credentials-apply",
        commandName: "gccgw edge credentials apply",
        inputPath,
        executeProductionMutation: args.includes("--execute-production-mutation"),
        format: args.includes("--json") ? "json" : "text"
      };
    }
    throw new Error(`Unknown gccgw edge credentials command: ${mode || ""}`.trim());
  }
  const commandKey = `${args[0] || ""} ${args[1] || ""}`.trim();
  if (hasKnownCommand(commandKey) && args.slice(2).some(isHelpArg)) {
    return {
      kind: "command-help",
      query: commandKey
    };
  }
  if (args[0] === "server" && (args[1] === undefined || args[1] === "start")) {
    return { kind: "start-server" };
  }
  if (args[0] === "install" && args[1] === "configure") {
    if (!args.includes("--dry-run")) {
      throw new Error("gccgw install configure currently supports --dry-run only.");
    }
    return {
      kind: "install-configure",
      format: args.includes("--json") ? "json" : "text",
      dryRun: true,
      domain: optionValue(args, "--domain") || optionValue(args, "--public-base-url"),
      installDir: optionValue(args, "--install-dir"),
      managementSource: optionValue(args, "--management-source"),
      consolePort: optionValue(args, "--console-port"),
      targetRole: optionValue(args, "--target-role")
    };
  }
  if (args[0] === "install" && args[1] === "plan") {
    return {
      kind: "install-plan",
      format: args.includes("--json") ? "json" : "text"
    };
  }
  if (args[0] === "install" && args[1] === "preflight") {
    return {
      kind: "install-preflight",
      format: args.includes("--json") ? "json" : "text"
    };
  }
  if (args[0] === "node" && args[1] === "inspect") {
    return {
      kind: "node-inspect",
      configPath: optionValue(args, "--config") || "config/proxy-servers.json",
      format: args.includes("--json") ? "json" : "text"
    };
  }
  if (args[0] === "node" && args[1] === "validate") {
    return {
      kind: "node-validate",
      packageDir: optionValue(args, "--package") || "deployments/production-template",
      configPath: optionValue(args, "--config") || "config/proxy-servers.json",
      format: args.includes("--json") ? "json" : "text"
    };
  }
  if (args[0] === "node" && args[1] === "policy-check") {
    return {
      kind: "node-policy-check",
      configPath: optionValue(args, "--config") || "config/proxy-servers.json",
      format: args.includes("--json") ? "json" : "text"
    };
  }
  if (args[0] === "node" && args[1] === "data-plane-lifecycle-policy") {
    return {
      kind: "node-data-plane-lifecycle-policy",
      configPath: optionValue(args, "--config") || "config/proxy-servers.json",
      format: args.includes("--json") ? "json" : "text"
    };
  }
  if (args[0] === "node" && args[1] === "register") {
    if (!args.includes("--dry-run")) {
      throw new Error("gccgw node register supports --dry-run only. Runtime activation requires a separate Risk A gate.");
    }
    return {
      kind: "node-register-dry-run",
      inputPath: positionalArgs(args, 2)[0],
      format: args.includes("--json") ? "json" : "text"
    };
  }
  if (args[0] === "node" && args[1] === "disable") {
    if (!args.includes("--dry-run")) {
      throw new Error("gccgw node disable supports --dry-run only. Runtime mutation requires a separate Risk A gate.");
    }
    return {
      kind: "node-disable-dry-run",
      nodeId: positionalArgs(args, 2)[0],
      reason: optionValue(args, "--reason") || "",
      format: args.includes("--json") ? "json" : "text"
    };
  }
  if (args[0] === "node" && args[1] === "plan") {
    return {
      kind: "install-plan",
      format: args.includes("--json") ? "json" : "text"
    };
  }
  if (args[0] === "node" && args[1] === "preflight") {
    return {
      kind: "install-preflight",
      format: args.includes("--json") ? "json" : "text"
    };
  }
  if (args[0] === "service" && args[1] === "status") {
    return {
      kind: "service-status",
      format: args.includes("--json") ? "json" : "text"
    };
  }
  if (args[0] === "node" && args[1] === "status") {
    return {
      kind: "service-status",
      format: args.includes("--json") ? "json" : "text"
    };
  }
  if (args[0] === "backup" && args[1] === "plan") {
    return {
      kind: "backup-plan",
      format: args.includes("--json") ? "json" : "text"
    };
  }
  if (args[0] === "backup" && args[1] === "preflight") {
    return {
      kind: "backup-preflight",
      mode: "backup",
      format: args.includes("--json") ? "json" : "text"
    };
  }
  if (args[0] === "backup" && args[1] === "restore-preflight") {
    return {
      kind: "backup-preflight",
      mode: "restore",
      format: args.includes("--json") ? "json" : "text"
    };
  }
  if (args[0] === "release" && args[1] === "plan") {
    return {
      kind: "release-plan",
      format: args.includes("--json") ? "json" : "text"
    };
  }
  if (args[0] === "release" && args[1] === "status") {
    return {
      kind: "release-status",
      format: args.includes("--json") ? "json" : "text"
    };
  }
  if (args[0] === "self" && args[1] === "check") {
    return { kind: "self-check" };
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
      ...(key.startsWith("subscription ") || key.startsWith("node ") ? { commandName: `gccgw ${key}` } : {}),
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
  runSelfCheck,
  runInstallPreflight,
  runBackupPreflight,
  runReleaseStatus,
  runServiceStatus,
  runNetworkStatus,
  runPackageImportDryRun,
  runPackageApply,
  runPackageInspect,
  runInstallConfigure,
  readJsonFile,
  startServer,
  confirmRiskAExecution,
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
    if (command.kind === "capability-registry") {
      const capabilityRegistry = buildCliCapabilityRegistry({ format: command.format });
      writeStdout(command.format === "json" ? `${JSON.stringify(capabilityRegistry, null, 2)}\n` : capabilityRegistry);
      return 0;
    }
    if (command.kind === "config-map") {
      let configMap;
      if (command.mode === "list") {
        configMap = buildGccgwConfigList(command);
      } else if (command.mode === "show") {
        configMap = buildGccgwConfigShow(command);
      } else if (command.mode === "validate") {
        configMap = buildGccgwConfigValidation(command);
      } else {
        throw new Error(`Unsupported gccgw config mode: ${command.mode}`);
      }
      writeStdout(command.format === "json" ? `${JSON.stringify(configMap, null, 2)}\n` : configMap);
      return configMap.ok === false ? 1 : 0;
    }
    if (command.kind === "architecture-map") {
      const architectureMap = buildCliArchitectureMap({ format: command.format });
      writeStdout(command.format === "json" ? `${JSON.stringify(architectureMap, null, 2)}\n` : architectureMap);
      return 0;
    }
    if (command.kind === "docs-map") {
      const docsMap = buildCliDocsMap(command);
      writeStdout(command.format === "json" ? `${JSON.stringify(docsMap, null, 2)}\n` : docsMap);
      return 0;
    }
    if (command.kind === "package-inspect") {
      return await runPackageInspect(command);
    }
    if (command.kind === "package-import-dry-run") {
      return await runPackageImportDryRun(command);
    }
    if (command.kind === "package-apply") {
      const approval = requiresRiskAExecutionPrompt(command);
      if (approval) {
        const accepted = await confirmRiskAExecution?.(approval);
        if (!accepted) {
          writeStderr("Risk A approval prompt rejected; execution stopped before package apply.\n");
          return 1;
        }
      }
      return await runPackageApply(command);
    }
    if (command.kind === "install-configure") {
      return await runInstallConfigure(command);
    }
    if (command.kind === "edge-tuic-credentials-plan") {
      const report = buildTuicCredentialLifecyclePlan({
        desiredState: command.inputPath ? readJsonFile(command.inputPath) : {},
        inputPath: command.inputPath
      });
      writeStdout(command.format === "json" ? `${JSON.stringify(report, null, 2)}\n` : `${JSON.stringify(report, null, 2)}\n`);
      return report.ok ? 0 : 1;
    }
    if (command.kind === "edge-tuic-credentials-apply") {
      const approval = requiresRiskAExecutionPrompt(command);
      if (approval) {
        const accepted = await confirmRiskAExecution?.(approval);
        if (!accepted) {
          writeStderr("Risk A approval prompt rejected; execution stopped before TUIC credential apply.\n");
          return 1;
        }
      }
      const report = buildTuicCredentialLifecycleApplyPlan({
        desiredState: command.inputPath ? readJsonFile(command.inputPath) : {},
        inputPath: command.inputPath,
        executeProductionMutation: command.executeProductionMutation
      });
      writeStdout(command.format === "json" ? `${JSON.stringify(report, null, 2)}\n` : `${JSON.stringify(report, null, 2)}\n`);
      return report.ok ? 0 : 1;
    }
    if (command.kind === "edge-credentials-reconcile-plan") {
      const report = buildCredentialReconciliationPlan({
        desiredState: command.inputPath ? readJsonFile(command.inputPath) : {},
        inputPath: command.inputPath
      });
      writeStdout(command.format === "json" ? `${JSON.stringify(report, null, 2)}\n` : `${JSON.stringify(report, null, 2)}\n`);
      return report.ok ? 0 : 1;
    }
    if (command.kind === "edge-credentials-apply") {
      const approval = requiresRiskAExecutionPrompt(command);
      if (approval) {
        const accepted = await confirmRiskAExecution?.(approval);
        if (!accepted) {
          writeStderr("Risk A approval prompt rejected; execution stopped before edge credential apply.\n");
          return 1;
        }
      }
      const report = buildCredentialReconciliationApplyPlan({
        desiredState: command.inputPath ? readJsonFile(command.inputPath) : {},
        inputPath: command.inputPath,
        executeProductionMutation: command.executeProductionMutation
      });
      writeStdout(command.format === "json" ? `${JSON.stringify(report, null, 2)}\n` : `${JSON.stringify(report, null, 2)}\n`);
      return report.ok ? 0 : 1;
    }
    if (command.kind === "node-inspect") {
      const report = buildNodeInspectReport({
        proxyConfig: readJsonFile(command.configPath),
        configPath: command.configPath
      });
      writeStdout(command.format === "json" ? `${JSON.stringify(report, null, 2)}\n` : `${JSON.stringify(report, null, 2)}\n`);
      return report.ok ? 0 : 1;
    }
    if (command.kind === "node-validate") {
      const report = buildNodeValidateReport({
        proxyConfig: readJsonFile(command.configPath),
        nodesPackage: readJsonFile(`${command.packageDir}/nodes.json`),
        configPath: command.configPath,
        packageDir: command.packageDir
      });
      writeStdout(command.format === "json" ? `${JSON.stringify(report, null, 2)}\n` : `${JSON.stringify(report, null, 2)}\n`);
      return report.ok ? 0 : 1;
    }
    if (command.kind === "node-policy-check") {
      const report = buildStablePoolProtocolPolicy({
        proxyConfig: readJsonFile(command.configPath)
      });
      writeStdout(command.format === "json" ? `${JSON.stringify(report, null, 2)}\n` : `${JSON.stringify(report, null, 2)}\n`);
      return report.ok ? 0 : 1;
    }
    if (command.kind === "node-data-plane-lifecycle-policy") {
      const report = buildDataPlaneCredentialLifecyclePolicy({
        proxyConfig: readJsonFile(command.configPath)
      });
      writeStdout(command.format === "json" ? `${JSON.stringify(report, null, 2)}\n` : `${JSON.stringify(report, null, 2)}\n`);
      return report.ok ? 0 : 1;
    }
    if (command.kind === "node-register-dry-run") {
      const report = buildNodeRegisterDryRunPlan({
        nodeFacts: command.inputPath ? readJsonFile(command.inputPath) : {},
        inputPath: command.inputPath
      });
      writeStdout(command.format === "json" ? `${JSON.stringify(report, null, 2)}\n` : `${JSON.stringify(report, null, 2)}\n`);
      return report.ok ? 0 : 1;
    }
    if (command.kind === "node-disable-dry-run") {
      const report = buildNodeDisableDryRunPlan({
        nodeId: command.nodeId,
        reason: command.reason
      });
      writeStdout(command.format === "json" ? `${JSON.stringify(report, null, 2)}\n` : `${JSON.stringify(report, null, 2)}\n`);
      return report.ok ? 0 : 1;
    }
    if (command.kind === "command-help") {
      writeStdout(buildCommandHelp(command));
      return 0;
    }
    if (command.kind === "install-plan") {
      const plan = buildInstallPlan({ format: command.format });
      writeStdout(command.format === "json" ? `${JSON.stringify(plan, null, 2)}\n` : plan);
      return 0;
    }
    if (command.kind === "backup-plan") {
      const plan = buildBackupPlan({ format: command.format });
      writeStdout(command.format === "json" ? `${JSON.stringify(plan, null, 2)}\n` : `${JSON.stringify(plan, null, 2)}\n`);
      return 0;
    }
    if (command.kind === "release-plan") {
      const plan = buildReleasePlan({ format: command.format });
      writeStdout(command.format === "json" ? `${JSON.stringify(plan, null, 2)}\n` : `${JSON.stringify(plan, null, 2)}\n`);
      return 0;
    }
    if (command.kind === "start-server") {
      return await startServer();
    }
    if (command.kind === "node-script") {
      const approval = requiresRiskAExecutionPrompt(command);
      if (approval) {
        const accepted = await confirmRiskAExecution?.(approval);
        if (!accepted) {
          writeStderr("Risk A approval prompt rejected; execution stopped before script dispatch.\n");
          return 1;
        }
      }
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
    if (command.kind === "self-check") {
      return await runSelfCheck();
    }
    if (command.kind === "install-preflight") {
      return await runInstallPreflight(command);
    }
    if (command.kind === "backup-preflight") {
      return await runBackupPreflight(command);
    }
    if (command.kind === "release-status") {
      return await runReleaseStatus(command);
    }
    if (command.kind === "service-status") {
      return await runServiceStatus(command);
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
