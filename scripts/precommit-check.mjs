#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const DEFAULT_ROOT = dirname(dirname(fileURLToPath(import.meta.url)));

function normalizePath(path) {
  return String(path || "").replaceAll("\\", "/").replace(/^\.\//, "");
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function command(command, reason) {
  return { command, reason };
}

function isMarkdownOrDoc(path) {
  return (
    path.endsWith(".md") ||
    path.startsWith("docs/") ||
    path === "README.md" ||
    path === "README_EN.md" ||
    path === "AGENTS.md" ||
    path === ".github/pull_request_template.md"
  );
}

function isProjectState(path) {
  return (
    path.startsWith("project-state/") ||
    path === "scripts/check-project-state.mjs" ||
    path === "server/tests/project-state-check.test.mjs"
  );
}

function isAdmin(path) {
  return path.startsWith("admin/");
}

function isServerOrSharedCode(path) {
  if (isMarkdownOrDoc(path)) {
    return false;
  }
  return (
    path.startsWith("server/") ||
    path.startsWith("agent/") ||
    path.startsWith("scripts/") ||
    path.startsWith("bin/") ||
    path === "index.mjs" ||
    path === "daemon.mjs" ||
    path === "candidate-start.mjs" ||
    path === "package.json"
  );
}

export function buildPrecommitCheckPlan({ changedFiles = [] } = {}) {
  const files = unique(changedFiles.map(normalizePath));
  const hasAdmin = files.some(isAdmin);
  const hasProjectState = files.some(isProjectState);
  const hasServerOrSharedCode = files.some(isServerOrSharedCode);
  const hasOnlyDocs = files.length > 0 && files.every((path) => isMarkdownOrDoc(path) && !hasAdmin);
  const commands = [command("git diff --check", "catch whitespace errors in the working diff")];

  if (hasProjectState) {
    commands.push(command("npm run project-state:check", "validate structured project state and active docs guardrails"));
  }

  if (hasAdmin) {
    commands.push(command("npm run admin:test", "run Admin UI tests for UI changes"));
    commands.push(command("npm run admin:build", "build Admin UI for UI changes"));
    commands.push(command("npm test", "run shared server regression tests"));
  } else if (hasServerOrSharedCode) {
    commands.push(command("npm test", "run server/shared regression tests"));
  } else if (!hasOnlyDocs && files.length === 0) {
    commands.push(command("npm test", "no changed files were detected; run the default regression suite"));
  } else if (!hasOnlyDocs && !hasProjectState) {
    commands.push(command("npm test", "unclassified repository files changed; run the default regression suite"));
  }

  const dedupedCommands = [];
  const seen = new Set();
  for (const item of commands) {
    if (seen.has(item.command)) {
      continue;
    }
    seen.add(item.command);
    dedupedCommands.push(item);
  }

  let riskTier = "C";
  if (hasAdmin || hasServerOrSharedCode) {
    riskTier = "B";
  } else if (hasProjectState) {
    riskTier = "C/B";
  }

  return {
    type: "gccgw_precommit_check_plan",
    ok: true,
    redacted: true,
    riskTier,
    changedFiles: files,
    commands: dedupedCommands,
    productionAwsImpact: "None",
    notes: [
      "Opt-in local repository validation only.",
      "No Git hook is installed by this command.",
      "No production, cloud, runtime endpoint, tenant, or sensitive file access is performed."
    ]
  };
}

function parseArgs(argv) {
  const options = {
    rootDir: DEFAULT_ROOT,
    dryRun: false,
    json: false,
    changedFiles: []
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--dry-run") {
      options.dryRun = true;
    } else if (arg === "--json") {
      options.json = true;
    } else if (arg === "--root") {
      options.rootDir = argv[index + 1] ?? DEFAULT_ROOT;
      index += 1;
    } else if (arg === "--changed-file") {
      options.changedFiles.push(argv[index + 1] ?? "");
      index += 1;
    } else if (arg === "--help" || arg === "-h") {
      options.help = true;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return options;
}

function printHelp() {
  console.log(`Usage:
  npm run precommit:check -- [--dry-run] [--json] [--changed-file <path>]

Selects and optionally runs local validation commands for the current working
tree. It does not install a Git hook and does not contact production or cloud
services.
`);
}

function gitLines(rootDir, args) {
  const result = spawnSync("git", args, {
    cwd: rootDir,
    encoding: "utf8"
  });
  if (result.status !== 0) {
    return [];
  }
  return result.stdout.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
}

function detectChangedFiles(rootDir) {
  return unique([
    ...gitLines(rootDir, ["diff", "--name-only"]),
    ...gitLines(rootDir, ["diff", "--name-only", "--cached"]),
    ...gitLines(rootDir, ["ls-files", "--others", "--exclude-standard"])
  ].map(normalizePath));
}

function runShellCommand(rootDir, commandText) {
  const result = spawnSync(commandText, {
    cwd: rootDir,
    shell: true,
    stdio: "inherit"
  });
  return result.status ?? 1;
}

function formatPlanText(plan) {
  const lines = [
    "# Precommit Check Plan",
    "",
    `Risk: ${plan.riskTier}`,
    `Production/AWS impact: ${plan.productionAwsImpact}`,
    "",
    "## Changed Files"
  ];
  if (plan.changedFiles.length === 0) {
    lines.push("- none detected");
  } else {
    for (const path of plan.changedFiles) {
      lines.push(`- ${path}`);
    }
  }
  lines.push("", "## Commands");
  for (const item of plan.commands) {
    lines.push(`- ${item.command} (${item.reason})`);
  }
  return `${lines.join("\n")}\n`;
}

export async function runPrecommitCheck(argv = process.argv.slice(2), {
  detectFiles = detectChangedFiles,
  executeCommand = runShellCommand,
  writeStdout = (text) => process.stdout.write(text),
  writeStderr = (text) => process.stderr.write(text)
} = {}) {
  let options;
  try {
    options = parseArgs(argv);
  } catch (error) {
    writeStderr(`${error.message}\n`);
    return 1;
  }

  if (options.help) {
    printHelp();
    return 0;
  }

  const changedFiles = options.changedFiles.length > 0
    ? options.changedFiles
    : detectFiles(options.rootDir);
  const plan = buildPrecommitCheckPlan({ changedFiles });

  if (options.json || options.dryRun) {
    writeStdout(options.json ? `${JSON.stringify(plan, null, 2)}\n` : formatPlanText(plan));
  }

  if (options.dryRun) {
    return 0;
  }

  for (const item of plan.commands) {
    const code = executeCommand(options.rootDir, item.command);
    if (code !== 0) {
      return code;
    }
  }
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runPrecommitCheck().then((code) => {
    process.exitCode = code;
  });
}
