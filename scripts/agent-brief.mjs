#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join, relative } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { checkProjectState, findSensitivePatternFindings } from "./check-project-state.mjs";

const DEFAULT_ROOT = dirname(dirname(fileURLToPath(import.meta.url)));

const REQUIRED_FILES = [
  "AGENTS.md",
  "docs/CURRENT_RELEASE_STATE.md",
  "RELEASE_MANIFEST.md",
  "docs/PROJECT_CONTEXT.md",
  "docs/README.md",
  "project-state/current.json",
  "project-state/lanes.json",
  "project-state/tasks.json"
];

const DOCS_TO_READ_FIRST = [
  "docs/CURRENT_RELEASE_STATE.md",
  "RELEASE_MANIFEST.md",
  "docs/PROJECT_CONTEXT.md",
  "docs/README.md"
];

const GUARDED_GUIDANCE_FILES = [
  "AGENTS.md",
  "docs/AGENT_ONBOARDING.md",
  "docs/VALIDATION_BASELINE.md"
];

const CANONICAL_ENTRY_SEQUENCE = [
  "docs/CURRENT_RELEASE_STATE.md",
  "RELEASE_MANIFEST.md",
  "docs/PROJECT_CONTEXT.md",
  "git status --short --branch",
  "docs/README.md",
  "task-relevant subsystem README",
  "fresh native GitHub Issue/PR records before selecting or ordering current work"
];

const VALIDATION_COMMANDS = [
  "git diff --check",
  "npm run project-state:check",
  "npm test",
  "npm run admin:test",
  "npm run admin:build"
];

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

function sourceDocsFrom(...states) {
  return [
    ...new Set(states.flatMap((state) => Array.isArray(state?.sourceDocs) ? state.sourceDocs : []))
  ];
}

function snapshotObservedAt(state) {
  const value = String(state?.observedAt || "");
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match || Number.isNaN(Date.parse(`${value}T00:00:00Z`))) {
    return "unknown";
  }
  const [, yearText, monthText, dayText] = match;
  const daysInMonth = new Date(Date.UTC(Number(yearText), Number(monthText), 0)).getUTCDate();
  return Number(dayText) >= 1 && Number(dayText) <= daysInMonth ? value : "unknown";
}

export function buildAgentBrief({
  rootDir = DEFAULT_ROOT,
  gitStatusText = "",
  gitStatusError = null,
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

  if (REQUIRED_FILES.every((path) => existsSync(join(rootDir, path)))) {
    const stateValidation = checkProjectState({ rootDir });
    if (!stateValidation.ok) {
      errors.push(
        `project-state validation failed with ${stateValidation.errors.length} error(s); run npm run project-state:check for local details`
      );
    }
  }

  const docsToReadFirst = DOCS_TO_READ_FIRST.filter((path) => existsSync(join(rootDir, path)));

  const guardedPaths = [
    ...REQUIRED_FILES,
    ...docsToReadFirst,
    ...GUARDED_GUIDANCE_FILES.filter((path) => existsSync(join(rootDir, path))),
    ...sourceDocsFrom(currentState, lanesState, tasksState)
  ].filter((path) => path.endsWith(".md") || path.endsWith(".json"));
  const sensitiveFindings = findSensitivePatternFindings(rootDir, [...new Set(guardedPaths)]);
  for (const finding of sensitiveFindings) {
    errors.push(`${finding.path}:${finding.line}: sensitive ${finding.type} pattern matched`);
  }

  const git = parseGitStatus(gitStatusText);
  if (gitStatusError) {
    errors.push("git status: required repository-state read failed");
  }
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
      requiresFreshNativeIssuePrRead: true,
      authorityBoundary: "Project #1 is navigation only; native Issue and PR records own current item state, scope, declared risk, done criteria, and sequencing.",
      laneDefinitions: {
        source: "project-state/lanes.json",
        observedAt: snapshotObservedAt(lanesState),
        definitionOnly: true,
        boundary: "Reviewed lane definitions and safety boundaries only; this file does not establish current item membership or active work."
      },
      snapshotHint: {
        compatibilityOnly: true,
        observedAt: {
          current: snapshotObservedAt(currentState),
          tasks: snapshotObservedAt(tasksState)
        },
        sources: [
          "project-state/current.json",
          "project-state/tasks.json"
        ],
        boundary: "Dated compatibility hint only; it is not a live queue, current blocker list, active lane inventory, production fact, or approval."
      }
    },
    docsToReadFirst,
    canonicalEntrySequence: [...CANONICAL_ENTRY_SEQUENCE],
    validation: {
      baselineDoc: existsSync(join(rootDir, "docs/VALIDATION_BASELINE.md"))
        ? "docs/VALIDATION_BASELINE.md"
        : null,
      commands: VALIDATION_COMMANDS
    },
    riskBoundaries: [
      "AGENTS.md always applies as the repository rule set.",
      "Current sequencing requires a fresh native Issue/PR read; Project #1 is navigation only and local project-state snapshots are non-authoritative.",
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
    "- Current sequencing: requires a fresh native Issue/PR read",
    `- Authority: ${brief.project.authorityBoundary}`,
    `- Lane definitions: ${brief.project.laneDefinitions.boundary}`,
    `- Lane-definition observation: ${brief.project.laneDefinitions.observedAt}`,
    `- Snapshot boundary: ${brief.project.snapshotHint.boundary}`,
    "- Dated compatibility hint observations:",
    `  - project-state/current.json: ${brief.project.snapshotHint.observedAt.current}`,
    `  - project-state/tasks.json: ${brief.project.snapshotHint.observedAt.tasks}`,
    "",
    "## Canonical Entry Sequence",
    "AGENTS.md always applies as the repository rule set. Then complete:"
  );
  for (const [index, entry] of brief.canonicalEntrySequence.entries()) {
    lines.push(`${index + 1}. ${entry}`);
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
  if (result.error || result.status !== 0) {
    throw new Error("git status failed");
  }
  return String(result.stdout || "");
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

  let gitStatusText = "";
  let gitStatusError = null;
  try {
    gitStatusText = readStatus(options.rootDir);
  } catch {
    gitStatusError = true;
  }

  const brief = buildAgentBrief({
    rootDir: options.rootDir,
    gitStatusText,
    gitStatusError
  });

  writeStdout(options.json ? `${JSON.stringify(brief, null, 2)}\n` : formatAgentBriefText(brief));
  return brief.ok ? 0 : 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runAgentBrief().then((code) => {
    process.exitCode = code;
  });
}
