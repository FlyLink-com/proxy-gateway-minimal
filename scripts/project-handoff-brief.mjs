#!/usr/bin/env node
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const DEFAULT_ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const MODEL = "claude-opus-4-7";

const REQUIRED_FRESH_NATIVE_READ_STEP =
  "Freshly read the native GitHub Issue and PR records before selecting or ordering work; use Project #1 only as a navigation projection.";
const PROJECT_PROJECTION_BOUNDARY =
  "Project #1 is a mutable navigation projection only; native GitHub Issue and PR records own their current state.";
const DATED_SNAPSHOT_BOUNDARY =
  "Dated project-state snapshots must not be used to select or order work and cannot authorize mutation.";
const OFFLINE_SUMMARY =
  "Offline repository context was loaded, but current work posture, blockers, completion, and sequencing are intentionally withheld until a fresh native GitHub Issue/PR read is performed.";
const RISK_A_BOUNDARY =
  "Risk A requires fresh task-specific evidence, exact approval, validation, rollback readiness, and post-action readback; Project fields and old receipts cannot replace that gate.";
const SAFE_VALIDATION_COMMANDS = [
  "git status --short --branch",
  "git diff --check",
  "npm run project-state:check"
];
const SAFE_DOCS_TO_READ_FIRST = [
  "AGENTS.md",
  "docs/CURRENT_RELEASE_STATE.md",
  "RELEASE_MANIFEST.md",
  "docs/PROJECT_CONTEXT.md",
  "docs/README.md"
];
const ALLOWED_MODEL_SUMMARIES = [
  "The repository is a release-managed modular monolith with separate source, artifact, deployment, and runtime evidence domains.",
  "The handoff context supplies stable repository taxonomy and safety constraints, not current work state or sequencing.",
  "The requested focus is a bounded repository-local change whose current work state must come from native Issue and PR evidence."
];
const ALLOWED_MODEL_NEXT_STEPS = [
  "After the fresh native read, inspect only the focus-relevant repository files, canonical docs, and tests.",
  "After the fresh native read, define the smallest repository-local source-and-test change justified by that evidence.",
  "Run focused validation for the selected repository-local change before broader validation.",
  "Re-read the resulting diff and validation evidence before handing the change back for review."
];
const ALLOWED_MODEL_SUMMARY_SET = new Set(ALLOWED_MODEL_SUMMARIES);
const ALLOWED_MODEL_NEXT_STEP_SET = new Set(ALLOWED_MODEL_NEXT_STEPS);
const ALLOWED_MODEL_VALIDATION_COMMANDS = new Set([
  ...SAFE_VALIDATION_COMMANDS,
  "npm test",
  "npm run admin:test",
  "npm run admin:build",
  "npm run docs:authority:check",
  "npm run docs:authority:strict"
]);
const ALLOWED_MODEL_DOCS = new Set([
  ...SAFE_DOCS_TO_READ_FIRST,
  "docs/VALIDATION_BASELINE.md",
  "docs/GITHUB_ISSUE_PR_WORKFLOW.md",
  "docs/PROJECT_CONTROL_PLANE.md",
  "docs/PROJECT_OPERATING_MODEL.md"
]);

const RAW_SECRET_PATTERNS = [
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/g,
  /\btoken=[A-Za-z0-9._~+/=-]{8,}/gi,
  /\bpassword\s*=\s*[^,\s"']{4,}/gi,
  /\bapi[_-]?key\s*=\s*[^,\s"']{8,}/gi,
  /\bss:\/\/[A-Za-z0-9+/=_-]{8,}/gi
];

const REQUIRED_CANONICAL_CONTEXT_FILES = [
  "AGENTS.md",
  "docs/CURRENT_RELEASE_STATE.md",
  "RELEASE_MANIFEST.md",
  "docs/PROJECT_CONTEXT.md",
  "docs/README.md"
];
const REQUIRED_PROJECT_STATE_FILES = [
  "project-state/current.json",
  "project-state/tasks.json",
  "project-state/lanes.json"
];
const CONTEXT_FILES = [
  ...REQUIRED_CANONICAL_CONTEXT_FILES,
  ...REQUIRED_PROJECT_STATE_FILES
];

export const HANDOFF_BRIEF_SCHEMA = {
  type: "object",
  properties: {
    summary: {
      type: "string",
      enum: ALLOWED_MODEL_SUMMARIES,
      description: "Select one stable repository-orientation statement. Current posture is intentionally outside this offline request."
    },
    active_blockers: {
      type: "array",
      items: { type: "string" },
      maxItems: 0,
      description: "Must be empty because blockers require a fresh native read."
    },
    next_steps: {
      type: "array",
      items: {
        type: "string",
        enum: [REQUIRED_FRESH_NATIVE_READ_STEP, ...ALLOWED_MODEL_NEXT_STEPS]
      },
      minItems: 1,
      description: "Choose only allowlisted conditional steps. The first item must require a fresh native GitHub Issue/PR read; never select or order work from dated project-state snapshots or Project fields."
    },
    risk_boundaries: {
      type: "array",
      items: { type: "string" },
      maxItems: 0,
      description: "Must be empty; deterministic authority boundaries are appended locally."
    },
    validation_commands: {
      type: "array",
      items: {
        type: "string",
        enum: [...ALLOWED_MODEL_VALIDATION_COMMANDS]
      },
      description: "Choose only allowlisted local validation commands relevant to the focus."
    },
    docs_to_read_first: {
      type: "array",
      items: {
        type: "string",
        enum: [...ALLOWED_MODEL_DOCS]
      },
      description: "Choose only allowlisted canonical repo-relative documents relevant to the focus."
    }
  },
  required: [
    "summary",
    "active_blockers",
    "next_steps",
    "risk_boundaries",
    "validation_commands",
    "docs_to_read_first"
  ],
  additionalProperties: false
};

const FROZEN_SYSTEM_PROMPT = [
  "You produce compact operator handoff briefs for the proxy-gateway-minimal repository.",
  "Use only the supplied repository context. Do not invent production facts, hosts, tokens, or approvals.",
  "Prefer repo-relative paths, gccgw command names, and explicit risk boundaries.",
  "When context is ambiguous or drift-prone, say what must be verified live instead of guessing.",
  "Current work selection and sequencing require fresh native GitHub Issue and PR records.",
  "Treat Project #1 only as a mutable navigation projection, never as Issue/PR state or execution authority.",
  "Never select or order work from dated project-state snapshots, historical task status, or snapshot queues.",
  "Never include secrets, subscription URLs, credentials, customer data, or raw runtime dumps."
].join("\n");

const AUTHORITY_PROMPT = [
  "# Sequencing authority boundary",
  "",
  `- The first next_steps item must be exactly: ${REQUIRED_FRESH_NATIVE_READ_STEP}`,
  `- ${PROJECT_PROJECTION_BOUNDARY}`,
  `- ${DATED_SNAPSHOT_BOUNDARY}`,
  "- The supplied project-state sections contain stable orientation, taxonomy, and safety projections only. They deliberately omit live queue and status fields.",
  "- Do not name an Issue or PR as current, next, Ready, Blocked, closed, or complete unless a fresh native read supplied outside these dated snapshots establishes that fact.",
  "- If fresh native state is unavailable, keep later next_steps conditional on that read instead of reconstructing a queue from repository history."
].join("\n");

export function redactSecrets(text) {
  let redacted = String(text ?? "");
  for (const pattern of RAW_SECRET_PATTERNS) {
    redacted = redacted.replace(pattern, "[REDACTED]");
  }
  return redacted;
}

function readRepoText(rootDir, repoPath) {
  const fullPath = join(rootDir, repoPath);
  if (!existsSync(fullPath)) {
    return null;
  }
  try {
    return redactSecrets(readFileSync(fullPath, "utf8"));
  } catch {
    return null;
  }
}

function readRepoJson(rootDir, repoPath) {
  const text = readRepoText(rootDir, repoPath);
  if (text == null) {
    return null;
  }
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function stringArray(value) {
  return Array.isArray(value)
    ? value.filter((item) => typeof item === "string")
    : [];
}

function stableCurrentProjection(state) {
  return {
    authorityBoundary: "Dated orientation only. Resolve current work state and sequencing from fresh native Issue and PR records.",
    observedAt: String(state?.observedAt ?? "unknown"),
    requiresLiveIssueRead: state?.requiresLiveIssueRead === true
  };
}

function stableLaneProjection(state) {
  const laneDefinitions = Array.isArray(state?.lanes)
    ? state.lanes.map((lane) => ({
        id: String(lane?.id ?? ""),
        name: String(lane?.name ?? ""),
        riskBoundary: String(lane?.riskBoundary ?? ""),
        primaryDocs: stringArray(lane?.primaryDocs),
        primaryCodeAreas: stringArray(lane?.primaryCodeAreas),
        nonGoals: stringArray(lane?.nonGoals)
      }))
    : [];

  return {
    authorityBoundary: "Definition lookup only. Lane definitions do not identify current membership, status, or sequencing.",
    sourceDocs: stringArray(state?.sourceDocs),
    laneDefinitions
  };
}

function stableTaskSafetyProjection(state) {
  const entries = Array.isArray(state?.tasks)
    ? state.tasks
        .map((task) => ({
          id: String(task?.id ?? ""),
          risk: String(task?.risk ?? ""),
          lane: String(task?.lane ?? ""),
          allowedFiles: stringArray(task?.allowedFiles),
          forbiddenActions: stringArray(task?.forbiddenActions)
        }))
        .filter((task) => task.id)
        .sort((left, right) => left.id.localeCompare(right.id))
    : [];

  return {
    authorityBoundary: "Historical safety-contract lookup only. Entry order is lexical, not work priority, and no task status or queue is included.",
    taskSafetyContracts: Object.fromEntries(entries.map(({ id, ...contract }) => [id, contract]))
  };
}

function stableProjectStateProjection(repoPath, state) {
  if (repoPath === "project-state/current.json") {
    return stableCurrentProjection(state);
  }
  if (repoPath === "project-state/tasks.json") {
    return stableTaskSafetyProjection(state);
  }
  if (repoPath === "project-state/lanes.json") {
    return stableLaneProjection(state);
  }
  return null;
}

function findLatestProductionRecord(rootDir) {
  const recordsDir = join(rootDir, "docs/production-replacement-records");
  if (!existsSync(recordsDir)) {
    return null;
  }

  const candidates = readdirSync(recordsDir)
    .filter((name) => name.endsWith(".md") && !name.startsWith("templates"))
    .map((name) => {
      const fullPath = join(recordsDir, name);
      return {
        repoPath: relative(rootDir, fullPath).replaceAll("\\", "/"),
        mtimeMs: statSync(fullPath).mtimeMs
      };
    })
    .sort((left, right) => right.mtimeMs - left.mtimeMs);

  return candidates[0]?.repoPath ?? null;
}

export function loadContextBundle(rootDir, { includeLatestRecord = true } = {}) {
  const sections = [];
  const sources = [];
  const errors = [];

  for (const repoPath of CONTEXT_FILES) {
    if (repoPath.startsWith("project-state/")) {
      const state = readRepoJson(rootDir, repoPath);
      const projection = stableProjectStateProjection(repoPath, state);
      if (state == null || projection == null) {
        errors.push(`${repoPath}: required snapshot is missing, unreadable, or invalid JSON`);
        continue;
      }
      sources.push(repoPath);
      sections.push(
        `## ${repoPath} (stable projection; no live status or ordering)\n\n${redactSecrets(JSON.stringify(projection, null, 2))}`
      );
    } else {
      const text = readRepoText(rootDir, repoPath);
      if (text == null) {
        errors.push(`${repoPath}: required canonical context is missing or unreadable`);
        continue;
      }
      sources.push(repoPath);
      sections.push(`## ${repoPath}\n\n${text}`);
    }
  }

  if (includeLatestRecord) {
    const latestRecord = findLatestProductionRecord(rootDir);
    if (latestRecord) {
      const text = readRepoText(rootDir, latestRecord);
      if (text != null) {
        sources.push(latestRecord);
        sections.push(`## ${latestRecord} (dated evidence only; live verification required)\n\n${text}`);
      }
    }
  }

  return {
    sources,
    text: sections.join("\n\n---\n\n"),
    errors
  };
}

export function buildHandoffBriefRequest({
  contextBundle,
  focus = "",
  model = MODEL
}) {
  const focusText = focus.trim() || "General resume-work handoff for the next operator or coding agent.";
  const cachedContext = contextBundle.text.trim();

  return {
    model,
    max_tokens: 16000,
    thinking: { type: "adaptive" },
    output_config: {
      effort: "high",
      format: {
        type: "json_schema",
        schema: HANDOFF_BRIEF_SCHEMA
      }
    },
    system: [
      {
        type: "text",
        text: FROZEN_SYSTEM_PROMPT
      },
      {
        type: "text",
        text: AUTHORITY_PROMPT
      },
      {
        type: "text",
        text: `# Repository context\n\n${cachedContext}`,
        cache_control: { type: "ephemeral" }
      }
    ],
    messages: [
      {
        role: "user",
        content: [
          "Generate a structured handoff brief from the cached repository context.",
          `Focus: ${focusText}`,
          "Lead next_steps with the required fresh native Issue/PR read. Do not reconstruct current work order from dated snapshots or Project fields.",
          "Return JSON matching the schema only."
        ].join("\n\n")
      }
    ]
  };
}

function normalizeGeneratedText(value) {
  if (typeof value !== "string") {
    return null;
  }

  let text = redactSecrets(value).normalize("NFKC").trim();
  for (const whitespace of ["\r", "\n", "\t"]) {
    text = text.replaceAll(whitespace, " ");
  }
  while (text.includes("  ")) {
    text = text.replaceAll("  ", " ");
  }
  if (!text || text.length > 800) {
    return null;
  }
  return text;
}

function allowlistedStrings(values, allowlist) {
  if (!Array.isArray(values)) {
    return [];
  }
  return values
    .map((value) => normalizeGeneratedText(value))
    .filter((value) => value && allowlist.has(value));
}

function uniqueStrings(values) {
  return [...new Set(values)];
}

export function enforceHandoffAuthorityBoundary(brief) {
  const normalizedSummary = normalizeGeneratedText(brief?.summary);
  const generatedSummary = normalizedSummary && ALLOWED_MODEL_SUMMARY_SET.has(normalizedSummary)
    ? normalizedSummary
    : null;
  const generatedSteps = allowlistedStrings(
    brief?.next_steps,
    ALLOWED_MODEL_NEXT_STEP_SET
  ).slice(0, 5);

  return {
    summary: generatedSummary
      ? `${generatedSummary} ${OFFLINE_SUMMARY}`
      : OFFLINE_SUMMARY,
    active_blockers: [],
    next_steps: uniqueStrings([REQUIRED_FRESH_NATIVE_READ_STEP, ...generatedSteps]),
    risk_boundaries: [
      PROJECT_PROJECTION_BOUNDARY,
      DATED_SNAPSHOT_BOUNDARY,
      RISK_A_BOUNDARY
    ],
    validation_commands: uniqueStrings([
      ...SAFE_VALIDATION_COMMANDS,
      ...allowlistedStrings(brief?.validation_commands, ALLOWED_MODEL_VALIDATION_COMMANDS)
    ]),
    docs_to_read_first: uniqueStrings([
      ...SAFE_DOCS_TO_READ_FIRST,
      ...allowlistedStrings(brief?.docs_to_read_first, ALLOWED_MODEL_DOCS)
    ])
  };
}

function parseArgs(argv) {
  const options = {
    rootDir: DEFAULT_ROOT,
    focus: "",
    json: false,
    dryRun: false,
    includeLatestRecord: true
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--json") {
      options.json = true;
    } else if (arg === "--dry-run") {
      options.dryRun = true;
    } else if (arg === "--no-latest-record") {
      options.includeLatestRecord = false;
    } else if (arg === "--focus") {
      options.focus = argv[index + 1] ?? "";
      index += 1;
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
  gccgw project handoff-brief [--focus <text>] [--json] [--dry-run]
                            [--no-latest-record] [--root <path>]

Requires ANTHROPIC_API_KEY and @anthropic-ai/sdk (devDependency).

Examples:
  gccgw project handoff-brief --dry-run
  gccgw project handoff-brief --focus "Gate 11 lifecycle usage follow-up" --json
`);
}

function extractJsonText(message) {
  const chunks = [];
  for (const block of message.content ?? []) {
    if (block.type === "text" && block.text) {
      chunks.push(block.text);
    }
  }
  return chunks.join("");
}

export async function runProjectHandoffBrief(argv = process.argv.slice(2), {
  rootDir = DEFAULT_ROOT,
  createClient,
  callClaude
} = {}) {
  let options;
  try {
    options = parseArgs(argv);
  } catch (error) {
    console.error(error.message);
    return 1;
  }

  if (options.help) {
    printHelp();
    return 0;
  }

  const resolvedRoot = options.rootDir ?? rootDir;
  const contextBundle = loadContextBundle(resolvedRoot, {
    includeLatestRecord: options.includeLatestRecord
  });

  if (contextBundle.errors.length > 0) {
    console.error(`Repository handoff context is incomplete:\n${contextBundle.errors.join("\n")}`);
    return 1;
  }

  if (contextBundle.sources.length === 0) {
    console.error("No repository context files were found.");
    return 1;
  }

  const request = buildHandoffBriefRequest({
    contextBundle,
    focus: options.focus
  });

  if (options.dryRun) {
    const payload = {
      ok: true,
      dryRun: true,
      model: request.model,
      sources: contextBundle.sources,
      contextChars: contextBundle.text.length,
      focus: options.focus.trim() || null,
      promptCaching: {
        strategy: "cache_control on frozen repository context system block",
        volatileSuffix: "user focus question"
      },
      requestPreview: {
        systemBlocks: request.system.length,
        cachedBlock: "repository context",
        outputFormat: "json_schema"
      },
      authorityBoundary: {
        sequencing: "fresh native GitHub Issue and PR records",
        project: "navigation projection only",
        datedSnapshots: "stable orientation and safety only; never work ordering"
      }
    };
    console.log(JSON.stringify(payload, null, 2));
    return 0;
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    console.error("ANTHROPIC_API_KEY is not set. Use --dry-run to inspect the request shape.");
    return 1;
  }

  let client;
  if (createClient) {
    client = createClient();
  } else {
    let Anthropic;
    try {
      ({ default: Anthropic } = await import("@anthropic-ai/sdk"));
    } catch {
      console.error("Missing @anthropic-ai/sdk. Install with: npm install --save-dev @anthropic-ai/sdk");
      return 1;
    }
    client = new Anthropic();
  }
  const invoke = callClaude ?? (async (anthropicClient, body) => {
    const stream = anthropicClient.messages.stream(body);
    return stream.finalMessage();
  });

  let message;
  try {
    message = await invoke(client, request);
  } catch (error) {
    console.error(`Claude API request failed: ${error.message}`);
    return 1;
  }

  let brief;
  try {
    brief = enforceHandoffAuthorityBoundary(JSON.parse(extractJsonText(message)));
  } catch (error) {
    console.error(`Failed to parse structured handoff brief: ${error.message}`);
    return 1;
  }

  const result = {
    ok: true,
    model: request.model,
    sources: contextBundle.sources,
    focus: options.focus.trim() || null,
    brief,
    usage: message.usage ?? null,
    cache: {
      cache_creation_input_tokens: message.usage?.cache_creation_input_tokens ?? 0,
      cache_read_input_tokens: message.usage?.cache_read_input_tokens ?? 0
    }
  };

  if (options.json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log("# Project handoff brief\n");
    console.log(result.brief.summary);
    console.log("\n## Active blockers");
    for (const item of result.brief.active_blockers) {
      console.log(`- ${item}`);
    }
    console.log("\n## Next steps");
    for (const item of result.brief.next_steps) {
      console.log(`- ${item}`);
    }
    console.log("\n## Risk boundaries");
    for (const item of result.brief.risk_boundaries) {
      console.log(`- ${item}`);
    }
    console.log("\n## Validation commands");
    for (const item of result.brief.validation_commands) {
      console.log(`- ${item}`);
    }
    console.log("\n## Docs to read first");
    for (const item of result.brief.docs_to_read_first) {
      console.log(`- ${item}`);
    }
    console.log("\n## Prompt cache");
    console.log(
      `- cache_read_input_tokens=${result.cache.cache_read_input_tokens}, cache_creation_input_tokens=${result.cache.cache_creation_input_tokens}`
    );
  }

  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runProjectHandoffBrief().then((code) => {
    process.exitCode = code;
  });
}
