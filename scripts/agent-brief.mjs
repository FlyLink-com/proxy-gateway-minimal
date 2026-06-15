#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join, relative } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const DEFAULT_ROOT = dirname(dirname(fileURLToPath(import.meta.url)));

const REQUIRED_FILES = [
  "docs/PROJECT_CONTEXT.md",
  "project-state/current.json",
  "project-state/lanes.json",
  "project-state/tasks.json"
];

const DOCS_TO_READ_FIRST = [
  "AGENTS.md",
  "docs/AGENT_ONBOARDING.md",
  "docs/PROJECT_CONTEXT.md",
  "docs/VALIDATION_BASELINE.md",
  "docs/README.md"
];

const VALIDATION_COMMANDS = [
  "git diff --check",
  "npm run project-state:check",
  "npm test",
  "npm run admin:test",
  "npm run admin:build"
];

const SENSITIVE_PATTERNS = [
  { type: "private-key", pattern: /-----BEGIN [A-Z ]*PRIVATE KEY-----/i },
  { type: "token", pattern: /\btoken=[A-Za-z0-9._~+/=-]{8,}/i },
  { type: "password", pattern: /\bpassword\s*=\s*[^,\s"']{4,}/i },
  { type: "api-key", pattern: /\bapi[_-]?key\s*=\s*[^,\s"']{8,}/i },
  { type: "subscription-url", pattern: /\bhttps?:\/\/[^\s"']+[?&]token=[A-Za-z0-9._~+/=-]{8,}/i },
  { type: "proxy-uri", pattern: /\b(?:ss|vless|vmess|trojan|hysteria2|tuic):\/\/[A-Za-z0-9+/=_:;,.?&%#@-]{8,}/i }
];

function isPlaceholderLine(line) {
  return /<[^>]+>|\[redacted\]|\[REDACTED\]|\.\.\.|example\.(?:com|invalid)|placeholder|dummy|fake|sample/i.test(line);
}

function readJson(rootDir, path, errors) {
  const fullPath = join(rootDir, path);
  try {
    return JSON.parse(readFileSync(fullPath, "utf8"));
  } catch (error) {
    errors.push(`${path}: invalid or unreadable JSON`);
    return null;
  }
}

function parseGitStatus(gitStatusText = "") {
  const lines = String(gitStatusText || "").split(/\r?\n/);
  const branchLine = lines.find((line) => line.startsWith("## "));
  const branch = branchLine
    ? branchLine.slice(3).split("...")[0].trim() || "unknown"
    : "unknown";
  const changedFiles = [];

  for (const line of lines) {
    if (!line.trim() || line.startsWith("## ")) {
      continue;
    }
    const trimmed = line.trim();
    const withoutStatus = trimmed.replace(/^[A-Z?! MADRCU]{1,2}\s+/, "");
    const normalized = withoutStatus.includes(" -> ")
      ? withoutStatus.split(" -> ").at(-1)
      : withoutStatus;
    if (normalized) {
      changedFiles.push(normalized.replaceAll("\\", "/"));
    }
  }

  return {
    branch,
    dirty: changedFiles.length > 0,
    changedFiles
  };
}

function collectSensitiveFindings(rootDir, paths) {
  const findings = [];
  for (const path of paths) {
    const fullPath = join(rootDir, path);
    if (!existsSync(fullPath)) {
      continue;
    }
    const lines = readFileSync(fullPath, "utf8").split(/\r?\n/);
    for (const [index, line] of lines.entries()) {
      if (isPlaceholderLine(line)) {
        continue;
      }
      for (const { type, pattern } of SENSITIVE_PATTERNS) {
        if (pattern.test(line)) {
          findings.push({ path, line: index + 1, type });
        }
      }
    }
  }
  return findings;
}

function sourceDocsFrom(...states) {
  return [
    ...new Set(states.flatMap((state) => Array.isArray(state?.sourceDocs) ? state.sourceDocs : []))
  ];
}

export function buildAgentBrief({
  rootDir = DEFAULT_ROOT,
  gitStatusText = "",
  now = new Date().toISOString()
} = {}) {
  const errors = [];
  const warnings = [];
  const missingRequiredFiles = [];

  for (const path of REQUIRED_FILES) {
    if (!existsSync(join(rootDir, path))) {
      missingRequiredFiles.push(path);
      errors.push(`${path}: required file is missing`);
    }
  }

  const currentState = existsSync(join(rootDir, "project-state/current.json"))
    ? readJson(rootDir, "project-state/current.json", errors)
    : null;
  const lanesState = existsSync(join(rootDir, "project-state/lanes.json"))
    ? readJson(rootDir, "project-state/lanes.json", errors)
    : null;
  const tasksState = existsSync(join(rootDir, "project-state/tasks.json"))
    ? readJson(rootDir, "project-state/tasks.json", errors)
    : null;

  const docsToReadFirst = DOCS_TO_READ_FIRST.filter((path) => existsSync(join(rootDir, path)));
  for (const path of DOCS_TO_READ_FIRST) {
    if (!existsSync(join(rootDir, path))) {
      warnings.push(`${path}: optional first-read entry is missing`);
    }
  }

  const guardedPaths = [
    ...REQUIRED_FILES,
    ...docsToReadFirst,
    ...sourceDocsFrom(currentState, lanesState, tasksState)
  ].filter((path) => path.endsWith(".md") || path.endsWith(".json"));
  const sensitiveFindings = collectSensitiveFindings(rootDir, [...new Set(guardedPaths)]);
  for (const finding of sensitiveFindings) {
    errors.push(`${finding.path}:${finding.line}: sensitive ${finding.type} pattern matched`);
  }

  const activeBlockers = Array.isArray(currentState?.activeBlockers)
    ? currentState.activeBlockers.map((blocker) => String(blocker?.id || blocker?.summary || "unnamed-blocker")).slice(0, 8)
    : [];
  const activeLanes = Array.isArray(lanesState?.lanes)
    ? lanesState.lanes.filter((lane) => /active|planned|ready/i.test(String(lane?.status || ""))).map((lane) => String(lane.id)).slice(0, 10)
    : [];
  const readyTasks = Array.isArray(tasksState?.tasks)
    ? tasksState.tasks.filter((task) => /ready|active|blocked/i.test(String(task?.status || ""))).map((task) => String(task.id)).slice(0, 10)
    : [];
  const git = parseGitStatus(gitStatusText);
  if (git.dirty) {
    warnings.push("working tree has local changes; inspect before editing and do not revert user work");
  }

  return {
    type: "gccgw_agent_brief",
    generatedAt: now,
    ok: errors.length === 0,
    redacted: true,
    root: relative(process.cwd(), rootDir) || ".",
    git,
    project: {
      status: String(currentState?.status || "unknown"),
      currentMentalModel: String(currentState?.architectureView?.currentMentalModel || "four-layer control/data-plane boundary"),
      activeLanes,
      readyTasks,
      activeBlockers
    },
    docsToReadFirst,
    validation: {
      baselineDoc: existsSync(join(rootDir, "docs/VALIDATION_BASELINE.md"))
        ? "docs/VALIDATION_BASELINE.md"
        : null,
      commands: VALIDATION_COMMANDS
    },
    riskBoundaries: [
      "Risk A work requires read-only inventory, dry-run or no-op proof, exact operator approval, validation, and rollback evidence.",
      "Short replies such as 同意, 开始, or 继续 are not production approval.",
      "Do not output secrets, tokens, subscription URLs, credentials, raw runtime config, SQLite rows, or customer data.",
      "This command reads local repository files and Git status only."
    ],
    productionAwsImpact: "None",
    missingRequiredFiles,
    sensitiveFindings,
    warnings,
    errors
  };
}

export function formatAgentBriefText(brief) {
  const lines = [
    "# Agent Brief",
    "",
    `Status: ${brief.ok ? "ok" : "blocked"}`,
    `Generated: ${brief.generatedAt}`,
    `Repository root: ${brief.root}`,
    `Production/AWS impact: ${brief.productionAwsImpact}`,
    "",
    "## Git",
    `- Branch: ${brief.git.branch}`,
    `- Dirty: ${brief.git.dirty ? "yes" : "no"}`
  ];

  if (brief.git.changedFiles.length > 0) {
    lines.push("- Changed files:");
    for (const path of brief.git.changedFiles) {
      lines.push(`  - ${path}`);
    }
  }

  lines.push(
    "",
    "## Project",
    `- State: ${brief.project.status}`,
    `- Model: ${brief.project.currentMentalModel}`,
    `- Active lanes: ${brief.project.activeLanes.join(", ") || "unknown"}`,
    `- Ready/blocked tasks: ${brief.project.readyTasks.join(", ") || "unknown"}`,
    "",
    "## Docs To Read First"
  );
  for (const path of brief.docsToReadFirst) {
    lines.push(`- ${path}`);
  }

  lines.push("", "## Validation Baseline");
  for (const command of brief.validation.commands) {
    lines.push(`- ${command}`);
  }

  lines.push("", "## Risk Boundaries");
  for (const boundary of brief.riskBoundaries) {
    lines.push(`- ${boundary}`);
  }

  if (brief.sensitiveFindings.length > 0) {
    lines.push("", "## Sensitive Findings");
    for (const finding of brief.sensitiveFindings) {
      lines.push(`- ${finding.path}:${finding.line} ${finding.type}`);
    }
  }

  if (brief.warnings.length > 0) {
    lines.push("", "## Warnings");
    for (const warning of brief.warnings) {
      lines.push(`- ${warning}`);
    }
  }

  if (brief.errors.length > 0) {
    lines.push("", "## Errors");
    for (const error of brief.errors) {
      lines.push(`- ${error}`);
    }
  }

  return `${lines.join("\n")}\n`;
}

function parseArgs(argv) {
  const options = {
    rootDir: DEFAULT_ROOT,
    json: false
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--json") {
      options.json = true;
    } else if (arg === "--root") {
      options.rootDir = argv[index + 1] ?? DEFAULT_ROOT;
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
  npm run agent:brief -- [--json] [--root <path>]

Builds a redacted repo-only orientation snapshot from local files and Git
status. It does not contact production, cloud, runtime endpoints, or external
services.
`);
}

function readGitStatus(rootDir) {
  const result = spawnSync("git", ["status", "--short", "--branch"], {
    cwd: rootDir,
    encoding: "utf8"
  });
  return `${result.stdout || ""}${result.stderr || ""}`;
}

export async function runAgentBrief(argv = process.argv.slice(2), {
  readStatus = readGitStatus,
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

  const brief = buildAgentBrief({
    rootDir: options.rootDir,
    gitStatusText: readStatus(options.rootDir)
  });

  writeStdout(options.json ? `${JSON.stringify(brief, null, 2)}\n` : formatAgentBriefText(brief));
  return brief.ok ? 0 : 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runAgentBrief().then((code) => {
    process.exitCode = code;
  });
}
