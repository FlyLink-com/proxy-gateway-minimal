#!/usr/bin/env node
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const DEFAULT_ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const MODEL = "claude-opus-4-7";

const RAW_SECRET_PATTERNS = [
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/g,
  /\btoken=[A-Za-z0-9._~+/=-]{8,}/gi,
  /\bpassword\s*=\s*[^,\s"']{4,}/gi,
  /\bapi[_-]?key\s*=\s*[^,\s"']{8,}/gi,
  /\bss:\/\/[A-Za-z0-9+/=_-]{8,}/gi
];

const CONTEXT_FILES = [
  "docs/PROJECT_CONTEXT.md",
  "project-state/current.json",
  "project-state/tasks.json",
  "project-state/lanes.json"
];

export const HANDOFF_BRIEF_SCHEMA = {
  type: "object",
  properties: {
    summary: {
      type: "string",
      description: "Two to four sentences on current project posture and direction."
    },
    active_blockers: {
      type: "array",
      items: { type: "string" },
      description: "Concrete blockers that must be resolved before Risk A work."
    },
    next_steps: {
      type: "array",
      items: { type: "string" },
      description: "Ordered, actionable next steps for the next operator or agent."
    },
    risk_boundaries: {
      type: "array",
      items: { type: "string" },
      description: "What must not be assumed, mutated, or copied without live verification."
    },
    validation_commands: {
      type: "array",
      items: { type: "string" },
      description: "Safe gccgw/npm commands to re-orient or validate before editing."
    },
    docs_to_read_first: {
      type: "array",
      items: { type: "string" },
      description: "Repo-relative doc paths to read before making changes."
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
  "Never include secrets, subscription URLs, credentials, customer data, or raw runtime dumps."
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
  return redactSecrets(readFileSync(fullPath, "utf8"));
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

  for (const repoPath of CONTEXT_FILES) {
    const text = readRepoText(rootDir, repoPath);
    if (text == null) {
      continue;
    }
    sources.push(repoPath);
    sections.push(`## ${repoPath}\n\n${text}`);
  }

  if (includeLatestRecord) {
    const latestRecord = findLatestProductionRecord(rootDir);
    if (latestRecord) {
      const text = readRepoText(rootDir, latestRecord);
      if (text != null) {
        sources.push(latestRecord);
        sections.push(`## ${latestRecord}\n\n${text}`);
      }
    }
  }

  return {
    sources,
    text: sections.join("\n\n---\n\n")
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
          "Return JSON matching the schema only."
        ].join("\n\n")
      }
    ]
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
      }
    };
    console.log(JSON.stringify(payload, null, 2));
    return 0;
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    console.error("ANTHROPIC_API_KEY is not set. Use --dry-run to inspect the request shape.");
    return 1;
  }

  let Anthropic;
  try {
    ({ default: Anthropic } = await import("@anthropic-ai/sdk"));
  } catch {
    console.error("Missing @anthropic-ai/sdk. Install with: npm install --save-dev @anthropic-ai/sdk");
    return 1;
  }

  const client = createClient ? createClient(Anthropic) : new Anthropic();
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
    brief = JSON.parse(extractJsonText(message));
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
