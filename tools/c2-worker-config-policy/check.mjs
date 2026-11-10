#!/usr/bin/env node
// C2 Worker configuration drift check (default-deny allowlist).
//
// Usage: node tools/c2-worker-config-policy/check.mjs [--root <dir>] [--policy <file>]
// Exit 0 = all in-scope Wrangler configurations conform to policy.json.
// Exit 1 = findings are printed, one per line, prefixed with FAIL.
// See docs/C2_CRYPTO_WORKER_DEPLOYMENT_AND_DRIFT_CONTROL_V1.md.

import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join, dirname, relative } from "node:path";
import { isDeepStrictEqual } from "node:util";
import { fileURLToPath } from "node:url";

const args = process.argv.slice(2);
function argValue(flag) {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : null;
}
const scriptDir = dirname(fileURLToPath(import.meta.url));
const root = argValue("--root") ?? join(scriptDir, "..", "..");
const policyPath = argValue("--policy") ?? join(scriptDir, "policy.json");
const policy = JSON.parse(readFileSync(policyPath, "utf8"));

const findings = [];
const fail = (where, msg) => findings.push(`${where}: ${msg}`);

// --- JSONC parsing: strip comments and trailing commas outside string literals.
function stripJsoncComments(text) {
  let out = "";
  let inString = false;
  let escaped = false;
  let inLineComment = false;
  let inBlockComment = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const next = text[i + 1];
    if (inLineComment) {
      if (ch === "\n") {
        inLineComment = false;
        out += "\n";
      }
      continue;
    }
    if (inBlockComment) {
      if (ch === "*" && next === "/") {
        inBlockComment = false;
        i++;
      } else if (ch === "\n") {
        out += "\n";
      }
      continue;
    }
    if (inString) {
      out += ch;
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') {
      inString = true;
      out += ch;
      continue;
    }
    if (ch === "/" && next === "/") {
      inLineComment = true;
      i++;
      continue;
    }
    if (ch === "/" && next === "*") {
      inBlockComment = true;
      i++;
      continue;
    }
    out += ch;
  }
  if (inBlockComment) throw new SyntaxError("unterminated JSONC block comment");
  return out;
}

function stripJsoncTrailingCommas(text) {
  let out = "";
  let inString = false;
  let escaped = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      out += ch;
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') {
      inString = true;
      out += ch;
      continue;
    }
    if (ch === ",") {
      let next = i + 1;
      while (next < text.length && /\s/u.test(text[next])) next++;
      if (text[next] === "}" || text[next] === "]") continue;
    }
    out += ch;
  }
  return out;
}

function parseJsonc(text) {
  return JSON.parse(stripJsoncTrailingCommas(stripJsoncComments(text)));
}

// TOML account_id is a top-level Wrangler setting. Recognize bare and quoted
// keys, strip comments without treating # inside strings as a comment, and
// fail closed when an account_id assignment is present but not a simple string.
function stripTomlComment(line) {
  let quote = null;
  let escaped = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quote === '"') {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') quote = null;
      continue;
    }
    if (quote === "'") {
      if (ch === "'") quote = null;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      continue;
    }
    if (ch === "#") return line.slice(0, i);
  }
  return line;
}

function readTomlTopLevelAccountIds(text) {
  const values = [];
  let topLevel = true;
  for (const originalLine of text.replace(/^\uFEFF/u, "").split(/\r?\n/u)) {
    const line = stripTomlComment(originalLine);
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (/^\s*\[/u.test(line)) {
      topLevel = false;
      continue;
    }
    if (!topLevel) continue;

    const match = /^\s*(?:"((?:\\.|[^"\\])*)"|'([^']*)'|([A-Za-z0-9_-]+))\s*=\s*(.*?)\s*$/u.exec(line);
    const looksLikeAccountIdKey = /^\s*(?:"account_id"|'account_id'|account_id)(?:\s|=|$)/u.test(line);
    if (!match) {
      if (looksLikeAccountIdKey) values.push(null);
      continue;
    }

    let key;
    try {
      if (match[1] !== undefined) key = JSON.parse('"' + match[1] + '"');
      else if (match[2] !== undefined) key = match[2];
      else key = match[3];
    } catch {
      if (looksLikeAccountIdKey) values.push(null);
      continue;
    }
    if (key !== "account_id") continue;

    const literal = match[4].trim();
    let value = null;
    if (literal.startsWith('"') && literal.endsWith('"')) {
      try {
        const parsed = JSON.parse(literal);
        if (typeof parsed === "string") value = parsed;
      } catch {
        value = null;
      }
    } else if (literal.startsWith("'") && literal.endsWith("'")) {
      value = literal.slice(1, -1);
    }
    values.push(value);
  }
  return values;
}

// --- Collect every Wrangler config in the tree (excluding deps/vcs).
const WRANGLER_RE = /^wrangler(\..+)?\.(jsonc|json|toml)$/;
function walk(dir, acc) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === ".git") continue;
    const p = join(dir, entry.name);
    if (entry.isDirectory()) walk(p, acc);
    else if (WRANGLER_RE.test(entry.name)) acc.push(p);
  }
  return acc;
}
const allConfigs = walk(root, []);
const rel = (p) => relative(root, p).split("\\").join("/");

// --- Global guards on every Wrangler config. Parse failures are findings,
// never silently skipped, because every discovered Wrangler config is in scope.
const allowedAccountIds = new Set(policy.allowedAccountIds ?? []);
const parsedJsonConfigs = new Map();
for (const file of allConfigs) {
  const raw = readFileSync(file, "utf8");
  const where = rel(file);
  for (const { value, why } of policy.globalForbiddenStrings ?? []) {
    if (raw.includes(value)) fail(where, `forbidden string present (${why})`);
  }

  if (/\.toml$/u.test(file)) {
    const accountIds = readTomlTopLevelAccountIds(raw);
    if (accountIds.length > 1) fail(where, "multiple top-level account_id values are not allowed");
    for (const accountId of accountIds) {
      if (typeof accountId !== "string" || !allowedAccountIds.has(accountId)) {
        fail(where, "top-level account_id is not an allowed account");
      }
    }
    continue;
  }

  try {
    const parsed = parseJsonc(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      fail(where, "configuration root must be an object");
      continue;
    }
    parsedJsonConfigs.set(file, parsed);
    if (Object.hasOwn(parsed, "account_id") &&
        (typeof parsed.account_id !== "string" || !allowedAccountIds.has(parsed.account_id))) {
      fail(where, "account_id is not an allowed account");
    }
  } catch (e) {
    fail(where, `configuration does not parse: ${e.message}`);
  }
}

// --- Per-config allowlist evaluation.
for (const cfg of policy.configs ?? []) {
  const file = join(root, cfg.path);
  if (!existsSync(file)) { fail(cfg.path, "in-scope configuration file is missing"); continue; }
  const parsed = parsedJsonConfigs.get(file);
  if (!parsed) continue; // The global scan already recorded the parse failure.

  const allowedKeys = new Set(cfg.allowedTopLevelKeys ?? []);
  for (const key of Object.keys(parsed)) {
    if (!allowedKeys.has(key)) fail(cfg.path, `top-level key "${key}" is not in the allowlist`);
  }
  for (const [key, want] of Object.entries(cfg.requiredValues ?? {})) {
    if (parsed[key] !== want) fail(cfg.path, `"${key}" must be ${JSON.stringify(want)}, found ${JSON.stringify(parsed[key])}`);
  }
  for (const [key, want] of Object.entries(cfg.requiredValuesIfPresent ?? {})) {
    if (Object.hasOwn(parsed, key) && parsed[key] !== want) fail(cfg.path, `"${key}" must be ${JSON.stringify(want)} when present, found ${JSON.stringify(parsed[key])}`);
  }
  for (const [section, allowedEntries] of Object.entries(cfg.allowedBindings ?? {})) {
    const entries = parsed[section];
    if (entries === undefined) continue;
    if (!Array.isArray(entries)) { fail(cfg.path, `"${section}" must be an array`); continue; }
    if (entries.length > allowedEntries.length) {
      fail(cfg.path, `"${section}" has ${entries.length} entries, allowlist permits at most ${allowedEntries.length}`);
    }
    const remainingAllowedEntries = [...allowedEntries];
    for (const entry of entries) {
      const matchIndex = remainingAllowedEntries.findIndex((allowed) => isDeepStrictEqual(entry, allowed));
      if (matchIndex < 0) {
        fail(cfg.path, `"${section}" entry ${JSON.stringify(entry)} does not exactly match an unused allowlisted entry`);
      } else {
        remainingAllowedEntries.splice(matchIndex, 1);
      }
    }
  }
}

if (findings.length > 0) {
  for (const f of findings) console.log(`FAIL ${f}`);
  console.log(`C2_POLICY_CHECK: FAIL (${findings.length} finding${findings.length === 1 ? "" : "s"})`);
  process.exit(1);
}
console.log(`C2_POLICY_CHECK: PASS (${allConfigs.length} wrangler configs scanned, ${(policy.configs ?? []).length} in-scope configs conform)`);
