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

// --- JSONC parsing: strip // and /* */ comments outside string literals.
function parseJsonc(text) {
  let out = "";
  let inStr = false;
  let esc = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const next = text[i + 1];
    if (inStr) {
      out += ch;
      if (esc) esc = false;
      else if (ch === "\\") esc = true;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') { inStr = true; out += ch; continue; }
    if (ch === "/" && next === "/") {
      while (i < text.length && text[i] !== "\n") i++;
      if (i < text.length) out += "\n";
      continue;
    }
    if (ch === "/" && next === "*") {
      i += 2;
      while (i < text.length && !(text[i] === "*" && text[i + 1] === "/")) i++;
      i++;
      continue;
    }
    out += ch;
  }
  return JSON.parse(out);
}

// TOML account_id is a top-level Wrangler setting. Parse only this field:
// table headers end the top-level section, so nested [vars] keys are ignored.
function readTomlTopLevelAccountIds(text) {
  const values = [];
  let topLevel = true;
  for (const line of text.split(/\\r?\\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    if (/^\\[\\[?/.test(trimmed)) {
      topLevel = false;
      continue;
    }
    if (!topLevel) continue;
    const match = /^\\s*account_id\\s*=\\s*(.*?)\\s*(?:#.*)?$/.exec(line);
    if (!match) continue;
    const literal = match[1].trim();
    let value = null;
    if (literal.startsWith('"') && literal.endsWith('"')) {
      try { value = JSON.parse(literal); } catch { value = null; }
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

// --- Global guards on every Wrangler config.
const allowedAccountIds = new Set(policy.allowedAccountIds ?? []);
for (const file of allConfigs) {
  const raw = readFileSync(file, "utf8");
  const where = rel(file);
  for (const { value, why } of policy.globalForbiddenStrings ?? []) {
    if (raw.includes(value)) fail(where, `forbidden string present (${why})`);
  }

  if (/\\.toml$/.test(file)) {
    const accountIds = readTomlTopLevelAccountIds(raw);
    if (accountIds.length > 1) fail(where, "multiple top-level account_id values are not allowed");
    for (const accountId of accountIds) {
      if (typeof accountId !== "string" || !allowedAccountIds.has(accountId)) {
        fail(where, "top-level account_id is not an allowed account");
      }
    }
    continue;
  }

  let parsed = null;
  try { parsed = parseJsonc(raw); } catch { parsed = null; }
  if (parsed && Object.hasOwn(parsed, "account_id") &&
      (typeof parsed.account_id !== "string" || !allowedAccountIds.has(parsed.account_id))) {
    fail(where, "account_id is not an allowed account");
  }
}

// --- Per-config allowlist evaluation.
for (const cfg of policy.configs ?? []) {
  const file = join(root, cfg.path);
  if (!existsSync(file)) { fail(cfg.path, "in-scope configuration file is missing"); continue; }
  let parsed;
  try {
    parsed = parseJsonc(readFileSync(file, "utf8"));
  } catch (e) {
    fail(cfg.path, `configuration does not parse: ${e.message}`);
    continue;
  }
  const allowedKeys = new Set(cfg.allowedTopLevelKeys ?? []);
  for (const key of Object.keys(parsed)) {
    if (!allowedKeys.has(key)) fail(cfg.path, `top-level key "${key}" is not in the allowlist`);
  }
  for (const [key, want] of Object.entries(cfg.requiredValues ?? {})) {
    if (parsed[key] !== want) fail(cfg.path, `"${key}" must be ${JSON.stringify(want)}, found ${JSON.stringify(parsed[key])}`);
  }
  for (const [key, want] of Object.entries(cfg.requiredValuesIfPresent ?? {})) {
    if (key in parsed && parsed[key] !== want) fail(cfg.path, `"${key}" must be ${JSON.stringify(want)} when present, found ${JSON.stringify(parsed[key])}`);
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
