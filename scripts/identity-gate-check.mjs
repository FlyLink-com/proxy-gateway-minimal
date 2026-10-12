#!/usr/bin/env node
import { realpathSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { assertNoDuplicateObjectKeys } from "../server/services/deployment/strict-json-scan.mjs";
import { normalizeCredentialMaterialRecord } from "../server/services/edge/credential-material-store.mjs";
import { readActiveConfigFile } from "../server/services/edge/runtime-config-readonly-proof.mjs";

const REF = /^[A-Za-z0-9._:-]{1,160}$/;
// Same credentialRef alphabet the Hysteria2 adapter writes as a userpass username.
const HY2_REF = /^[A-Za-z0-9._:-]{1,128}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SURFACE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const MAX_PRINCIPALS = 5000;
const USER_LINE = /^( *)("(?:[^"\\]|\\.)*"|'(?:[^']|'')*'|[A-Za-z0-9._:-]+):\s*(.+)$/;

function blocked(code) {
  return {
    runtime_count: 0,
    mapped_count: 0,
    missing: 0,
    stale: 0,
    changed: 0,
    missing_material: 0,
    map_total: 0,
    equalities: { runtime_eq: false, map_eq: false },
    state: "blocked",
    code
  };
}

function isCount(value) {
  return Number.isSafeInteger(value) && value >= 0 && value <= MAX_PRINCIPALS;
}

function safeToken(value) {
  return typeof value === "string" && REF.test(value);
}

function parseScalar(raw) {
  const value = String(raw ?? "").trim();
  if (!value) return null;
  if (value.startsWith("\"")) {
    try {
      const decoded = JSON.parse(value);
      if (typeof decoded === "string") return decoded;
    } catch {
      // Fall through to a quoted token with trailing YAML decoration.
    }
    const match = /^"((?:[^"\\]|\\.)*)"/.exec(value);
    if (!match) return null;
    try {
      const decoded = JSON.parse(`"${match[1]}"`);
      return typeof decoded === "string" ? decoded : null;
    } catch {
      return null;
    }
  }
  if (value.startsWith("'")) {
    if (!value.endsWith("'") || value.length < 2) return null;
    return value.slice(1, -1).replaceAll("''", "'");
  }
  if (/[{}\[\]&*!|>]/.test(value)) return null;
  const comment = value.indexOf(" #");
  return (comment >= 0 ? value.slice(0, comment) : value).trim() || null;
}

function usableSecret(value) {
  return typeof value === "string"
    && value.length > 0
    && value.length <= 4096
    && !/[\u0000-\u001f\u007f]/.test(value);
}

function parseJsonDocument(text) {
  try {
    const source = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
    assertNoDuplicateObjectKeys(source);
    return {
      ok: true,
      value: JSON.parse(source, (key, parsed) => {
        if (key === "__proto__" || key === "constructor" || key === "prototype") {
          throw new Error("input_invalid");
        }
        return parsed;
      })
    };
  } catch {
    return { ok: false, code: "input_invalid" };
  }
}

function principalFrom(value) {
  if (typeof value === "string") return safeToken(value) ? value : null;
  if (value && typeof value === "object" && !Array.isArray(value) && safeToken(value.principal)) {
    return value.principal;
  }
  return null;
}

function unwrapRuntime(value) {
  let entries = value;
  let declared;
  if (value && typeof value === "object" && !Array.isArray(value)) {
    if (!Array.isArray(value.entries)) return { ok: false, code: "input_invalid" };
    if (value.runtime_count !== undefined && !isCount(value.runtime_count)) {
      return { ok: false, code: "input_invalid" };
    }
    entries = value.entries;
    declared = value.runtime_count;
  }
  if (!Array.isArray(entries)) return { ok: false, code: "input_invalid" };
  if (entries.length > MAX_PRINCIPALS) return { ok: false, code: "input_invalid" };
  const principals = new Set();
  for (const entry of entries) {
    const principal = principalFrom(entry);
    if (!principal) return { ok: false, code: "input_invalid" };
    if (principals.has(principal)) return { ok: false, code: "duplicate_principals" };
    principals.add(principal);
  }
  return { ok: true, principals, declared };
}

function entryReference(entry) {
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) return null;
  if (!safeToken(entry.principal) || !safeToken(entry.reference)) return null;
  return { principal: entry.principal, reference: entry.reference };
}

function unwrapMap(value) {
  let entries = value;
  let declared;
  if (Array.isArray(value)) {
    entries = value;
  } else if (value && typeof value === "object") {
    if (Object.hasOwn(value, "entries")) {
      if (!Array.isArray(value.entries)) return { ok: false, code: "input_invalid" };
      if (value.map_total !== undefined && !isCount(value.map_total)) {
        return { ok: false, code: "input_invalid" };
      }
      entries = value.entries;
      declared = value.map_total;
    } else {
      entries = Object.entries(value).map(([principal, reference]) => ({ principal, reference }));
    }
  } else {
    return { ok: false, code: "input_invalid" };
  }
  if (entries.length > MAX_PRINCIPALS) return { ok: false, code: "input_invalid" };
  const byPrincipal = new Map();
  for (const entry of entries) {
    const normalized = entryReference(entry);
    if (!normalized) return { ok: false, code: "input_invalid" };
    if (byPrincipal.has(normalized.principal)) return { ok: false, code: "duplicate_principals" };
    byPrincipal.set(normalized.principal, normalized.reference);
  }
  return { ok: true, byPrincipal, declared };
}

function unwrapMaterial(value) {
  let entries = value;
  if (value && typeof value === "object" && !Array.isArray(value) && Array.isArray(value.entries)) {
    entries = value.entries;
  }
  if (!Array.isArray(entries)) return { ok: false, code: "input_invalid" };
  if (entries.length > MAX_PRINCIPALS) return { ok: false, code: "input_invalid" };
  const byPrincipal = new Map();
  for (const entry of entries) {
    const normalized = entryReference(entry);
    if (!normalized) return { ok: false, code: "input_invalid" };
    if (byPrincipal.has(normalized.principal)) return { ok: false, code: "duplicate_principals" };
    byPrincipal.set(normalized.principal, normalized.reference);
  }
  return { ok: true, byPrincipal };
}

// Declared runtime_count / map_total are external cardinalities. They must
// match the set identities or the snapshot is blocked as equality_failed.
export function computeIdentityGate({ runtimePrincipals, mapEntries, materialRefs } = {}) {
  const runtime = unwrapRuntime(runtimePrincipals);
  if (!runtime.ok) return blocked(runtime.code);
  const map = unwrapMap(mapEntries);
  if (!map.ok) return blocked(map.code);
  const material = unwrapMaterial(materialRefs);
  if (!material.ok) return blocked(material.code);

  let mapped = 0;
  let missing = 0;
  let changed = 0;
  let missingMaterial = 0;
  for (const principal of runtime.principals) {
    const mappedReference = map.byPrincipal.get(principal);
    const materialReference = material.byPrincipal.get(principal);
    if (mappedReference === undefined) missing += 1;
    else mapped += 1;
    if (materialReference === undefined) missingMaterial += 1;
    else if (mappedReference !== undefined && mappedReference !== materialReference) changed += 1;
  }
  let stale = 0;
  for (const principal of map.byPrincipal.keys()) {
    if (!runtime.principals.has(principal)) stale += 1;
  }

  const runtime_count = runtime.declared ?? runtime.principals.size;
  const map_total = map.declared ?? map.byPrincipal.size;
  const runtime_eq = runtime_count === mapped + missing;
  const map_eq = map_total === mapped + stale;
  const equalitiesHold = runtime_eq && map_eq;
  const differences = missing + stale + changed + missingMaterial;
  const result = {
    runtime_count,
    mapped_count: mapped,
    missing,
    stale,
    changed,
    missing_material: missingMaterial,
    map_total,
    equalities: { runtime_eq, map_eq },
    state: !equalitiesHold ? "blocked" : differences > 0 ? "degraded" : "verified"
  };
  if (result.state === "blocked") result.code = "equality_failed";
  return result;
}

function parseXrayPrincipals(text) {
  const parsed = parseJsonDocument(text);
  if (!parsed.ok) return parsed;
  const config = parsed.value;
  if (!config || typeof config !== "object" || Array.isArray(config) || !Array.isArray(config.inbounds)) {
    return { ok: false, code: "input_invalid" };
  }
  const principals = [];
  const materialKeyByPrincipal = new Map();
  const seenIds = new Set();
  for (const inbound of config.inbounds) {
    if (!inbound || typeof inbound !== "object" || Array.isArray(inbound) || inbound.protocol !== "vless") {
      continue;
    }
    if (!Array.isArray(inbound.settings?.clients)) return { ok: false, code: "input_invalid" };
    for (const client of inbound.settings.clients) {
      const email = client?.email;
      const id = typeof client?.id === "string" ? client.id.toLowerCase() : "";
      if (!safeToken(email) || !UUID.test(id)) return { ok: false, code: "input_invalid" };
      if (materialKeyByPrincipal.has(email) || seenIds.has(id)) {
        return { ok: false, code: "duplicate_principals" };
      }
      seenIds.add(id);
      materialKeyByPrincipal.set(email, id);
      principals.push(email);
    }
  }
  if (principals.length > MAX_PRINCIPALS) return { ok: false, code: "input_invalid" };
  return { ok: true, principals, materialKeyByPrincipal };
}

function yamlLines(text) {
  if (typeof text !== "string" || text.includes("\0") || text.includes("\t")) {
    return { ok: false, code: "input_invalid" };
  }
  const lines = text.replaceAll("\r\n", "\n").replaceAll("\r", "\n").split("\n");
  for (const line of lines) {
    if (!line.trim() || line.trimStart().startsWith("#")) continue;
    if (/^\s*(?:<<\s*:|[%?!&*]|---(?:\s|$)|\.\.\.(?:\s|$))/.test(line)) {
      return { ok: false, code: "input_invalid" };
    }
    if (/^\s*(?:- )?[A-Za-z0-9._-]+\s+:/.test(line)) return { ok: false, code: "input_invalid" };
  }
  return { ok: true, lines };
}

function sectionField(lines, name, indent) {
  const prefix = `${" ".repeat(indent)}${name}:`;
  const matches = lines.filter((line) => line.startsWith(prefix) && line[indent + name.length] === ":");
  if (matches.length !== 1) return { ok: false, code: "input_invalid" };
  return { ok: true, raw: matches[0].slice(prefix.length).trim() };
}

function indentedSection(lines, name, indent) {
  const prefix = `${" ".repeat(indent)}${name}:`;
  const starts = [];
  for (let index = 0; index < lines.length; index += 1) {
    if (lines[index].startsWith(prefix) && lines[index][indent + name.length] === ":") starts.push(index);
  }
  if (starts.length !== 1) return { ok: false, code: "input_invalid" };
  const header = lines[starts[0]].slice(prefix.length).trim();
  const value = !header || header.startsWith("#") ? "" : header;
  if (value === "{}") return { ok: true, value, lines: [] };
  if (value !== "") return { ok: false, code: "input_invalid" };
  const body = [];
  for (let index = starts[0] + 1; index < lines.length; index += 1) {
    const line = lines[index];
    if (!line.trim() || line.startsWith(" ".repeat(indent + 1))) {
      body.push(line);
      continue;
    }
    break;
  }
  return { ok: true, value, lines: body };
}

function parseMihomoPrincipals(text) {
  const document = yamlLines(text);
  if (!document.ok) return document;
  const lines = document.lines;
  const start = lines.findIndex((line) => line.startsWith("listeners:"));
  if (start < 0 || !/^listeners:/.test(lines[start])) return { ok: false, code: "input_invalid" };
  const header = lines[start].slice("listeners:".length).trim();
  const headerValue = !header || header.startsWith("#") ? "" : header;
  if (headerValue === "[]") return { ok: true, principals: [], materialKeyByPrincipal: new Map() };
  if (headerValue !== "") return { ok: false, code: "input_invalid" };

  const body = [];
  for (let index = start + 1; index < lines.length; index += 1) {
    const line = lines[index];
    if (!line.trim() || line.trimStart().startsWith("#")) {
      body.push(line);
      continue;
    }
    if (!line.startsWith(" ")) break;
    body.push(line);
  }

  const groups = [];
  for (const line of body) {
    if (!line.trim() || line.trimStart().startsWith("#")) continue;
    if (line.startsWith("  - ")) {
      groups.push([line]);
      continue;
    }
    if (groups.length === 0 || !line.startsWith("    ")) return { ok: false, code: "input_invalid" };
    groups[groups.length - 1].push(line);
  }

  const principals = [];
  const seen = new Set();
  for (const group of groups) {
    const typeLine = group.find((line) => line.startsWith("    type:"));
    const type = typeLine ? parseScalar(typeLine.slice("    type:".length)) : "";
    if (type !== "tuic") {
      if (!type) return { ok: false, code: "input_invalid" };
      continue;
    }
    const usersAt = group.findIndex((line) => line.startsWith("    users:"));
    if (usersAt < 0) return { ok: false, code: "input_invalid" };
    const usersValue = group[usersAt].slice("    users:".length).trim();
    if (usersValue === "{}") continue;
    if (usersValue !== "") return { ok: false, code: "input_invalid" };
    for (let index = usersAt + 1; index < group.length; index += 1) {
      const line = group[index];
      if (!line.trim() || line.trimStart().startsWith("#")) continue;
      if (!line.startsWith("      ")) break;
      const match = USER_LINE.exec(line);
      if (!match || match[1].length !== 6) return { ok: false, code: "input_invalid" };
      const user = parseScalar(match[2]);
      const secret = parseScalar(match[3]);
      const principal = typeof user === "string" ? user.toLowerCase() : "";
      if (!UUID.test(principal) || !usableSecret(secret)) return { ok: false, code: "input_invalid" };
      if (seen.has(principal)) return { ok: false, code: "duplicate_principals" };
      seen.add(principal);
      principals.push(principal);
    }
  }
  if (principals.length > MAX_PRINCIPALS) return { ok: false, code: "input_invalid" };
  return { ok: true, principals, materialKeyByPrincipal: new Map(principals.map((principal) => [principal, principal])) };
}

// Userpass usernames are the usage-map keys and the credential refs. Protected
// material matches only when that ref's password is the rendered secret.
function parseHy2Principals(text) {
  const document = yamlLines(text);
  if (!document.ok) return document;
  for (const line of document.lines) {
    if (!line.trim() || line.trimStart().startsWith("#")) continue;
    const quoted = /^( *)("(?:[^"\\]|\\.)*"|'(?:[^']|'')*')\s*:/.exec(line);
    if (!quoted) continue;
    const user = parseScalar(quoted[2]);
    if (quoted[1].length !== 4 || !HY2_REF.test(user ?? "")) {
      return { ok: false, code: "input_invalid" };
    }
  }
  const auth = indentedSection(document.lines, "auth", 0);
  if (!auth.ok || auth.value === "{}") return { ok: false, code: "input_invalid" };
  const typeField = sectionField(auth.lines, "type", 2);
  if (!typeField.ok || parseScalar(typeField.raw) !== "userpass") {
    return { ok: false, code: "input_invalid" };
  }
  const userpass = indentedSection(auth.lines, "userpass", 2);
  if (!userpass.ok) return userpass;
  const principals = [];
  const passwordByPrincipal = new Map();
  for (const line of userpass.lines) {
    if (!line.trim() || line.trimStart().startsWith("#")) continue;
    const match = USER_LINE.exec(line);
    if (!match || match[1].length !== 4) return { ok: false, code: "input_invalid" };
    const user = parseScalar(match[2]);
    const secret = parseScalar(match[3]);
    if (!HY2_REF.test(user ?? "") || !usableSecret(secret)) {
      return { ok: false, code: "input_invalid" };
    }
    if (passwordByPrincipal.has(user)) return { ok: false, code: "duplicate_principals" };
    passwordByPrincipal.set(user, secret);
    principals.push(user);
  }
  if (principals.length > MAX_PRINCIPALS) return { ok: false, code: "input_invalid" };
  return { ok: true, principals, passwordByPrincipal };
}

function parseIdentityMap(text, kind) {
  const parsed = parseJsonDocument(text);
  if (!parsed.ok) return parsed;
  if (!parsed.value || typeof parsed.value !== "object" || Array.isArray(parsed.value)) {
    return { ok: false, code: "input_invalid" };
  }
  const entries = [];
  const seen = new Set();
  for (const [rawKey, rawReference] of Object.entries(parsed.value)) {
    const principal = kind === "mihomo" ? rawKey.toLowerCase() : rawKey;
    const validPrincipal = kind === "mihomo" ? UUID.test(principal) : safeToken(principal);
    if (!validPrincipal || !safeToken(rawReference)) return { ok: false, code: "input_invalid" };
    if (seen.has(principal)) return { ok: false, code: "duplicate_principals" };
    seen.add(principal);
    entries.push({ principal, reference: rawReference });
  }
  return { ok: true, entries };
}

function parseMaterialIndex(text) {
  const parsed = parseJsonDocument(text);
  if (!parsed.ok) return parsed;
  const records = Array.isArray(parsed.value)
    ? parsed.value
    : parsed.value && typeof parsed.value === "object" ? parsed.value.records : null;
  if (!Array.isArray(records)) return { ok: false, code: "input_invalid" };
  if (records.length > MAX_PRINCIPALS) return { ok: false, code: "input_invalid" };
  const byUuid = new Map();
  const byCredentialRef = new Map();
  const seenRefs = new Set();
  for (const record of records) {
    let normalized;
    try {
      normalized = normalizeCredentialMaterialRecord(record);
    } catch {
      return { ok: false, code: "input_invalid" };
    }
    const uuid = normalized.material.uuid.toLowerCase();
    if (!UUID.test(uuid)) return { ok: false, code: "input_invalid" };
    if (byUuid.has(uuid) || seenRefs.has(normalized.credentialRef)) {
      return { ok: false, code: "duplicate_principals" };
    }
    seenRefs.add(normalized.credentialRef);
    byUuid.set(uuid, normalized.credentialRef);
    byCredentialRef.set(normalized.credentialRef, {
      credentialRef: normalized.credentialRef,
      password: normalized.material.password
    });
  }
  return { ok: true, byUuid, byCredentialRef };
}

function parseRuntime(kind, runtimeText) {
  if (kind === "xray") return parseXrayPrincipals(runtimeText);
  if (kind === "mihomo") return parseMihomoPrincipals(runtimeText);
  if (kind === "hy2") return parseHy2Principals(runtimeText);
  return { ok: false, code: "input_invalid" };
}

function materialReferenceFor(kind, runtime, material, principal) {
  if (kind === "hy2") {
    const record = material.byCredentialRef.get(principal);
    if (!record || record.password !== runtime.passwordByPrincipal.get(principal)) return undefined;
    return record.credentialRef;
  }
  const materialKey = runtime.materialKeyByPrincipal.get(principal);
  return materialKey ? material.byUuid.get(materialKey) : undefined;
}

function observe(kind, runtimeText, mapText, materialText) {
  const runtime = parseRuntime(kind, runtimeText);
  if (!runtime.ok) return runtime;
  const map = parseIdentityMap(mapText, kind);
  if (!map.ok) return map;
  const material = parseMaterialIndex(materialText);
  if (!material.ok) return material;
  const materialRefs = [];
  for (const principal of runtime.principals) {
    const reference = materialReferenceFor(kind, runtime, material, principal);
    if (reference) materialRefs.push({ principal, reference });
  }
  return computeIdentityGate({
    runtimePrincipals: runtime.principals,
    mapEntries: map.entries,
    materialRefs
  });
}

function readRequired(path) {
  if (typeof path !== "string" || path.length === 0 || path.includes("\0")) {
    return { ok: false, code: "input_invalid" };
  }
  try {
    const text = readActiveConfigFile(path);
    if (typeof text !== "string") return { ok: false, code: "input_unreadable" };
    if (text.length === 0) return { ok: false, code: "input_invalid" };
    return { ok: true, text };
  } catch {
    return { ok: false, code: "input_unreadable" };
  }
}

function argValue(argv, name) {
  const prefix = `${name}=`;
  const inline = argv.find((item) => item.startsWith(prefix));
  if (inline) return inline.slice(prefix.length);
  const index = argv.indexOf(name);
  return index >= 0 ? argv[index + 1] ?? "" : "";
}

function present(surface, gate) {
  const output = {
    surface,
    runtime_count: gate.runtime_count,
    mapped_count: gate.mapped_count,
    missing: gate.missing,
    stale: gate.stale,
    changed: gate.changed,
    missing_material: gate.missing_material,
    map_total: gate.map_total,
    equalities: gate.equalities,
    state: gate.state
  };
  if (gate.code) output.code = gate.code;
  return output;
}

export function runIdentityGateCli({
  argv = process.argv.slice(2),
  stdout = process.stdout
} = {}) {
  const surfaceArg = argValue(argv, "--surface");
  const surface = typeof surfaceArg === "string" && surfaceArg.length <= 80 && SURFACE.test(surfaceArg)
    ? surfaceArg
    : "";
  const kind = argValue(argv, "--runtime-kind");
  const runtimePath = argValue(argv, "--runtime-config");
  const mapPath = argValue(argv, "--identity-map");
  const materialPath = argValue(argv, "--material");
  const finish = (gate) => {
    stdout.write(`${JSON.stringify(present(surface, gate))}\n`);
    return gate.state === "blocked" ? 1 : 0;
  };
  if (!surface || (kind !== "xray" && kind !== "mihomo" && kind !== "hy2") || !runtimePath || !mapPath || !materialPath) {
    return finish(blocked("input_invalid"));
  }
  const runtime = readRequired(runtimePath);
  if (!runtime.ok) return finish(blocked(runtime.code));
  const map = readRequired(mapPath);
  if (!map.ok) return finish(blocked(map.code));
  const material = readRequired(materialPath);
  if (!material.ok) return finish(blocked(material.code));
  const gate = observe(kind, runtime.text, map.text, material.text);
  return finish(gate.ok === false ? blocked(gate.code) : gate);
}

function isDirectInvocation() {
  if (!process.argv[1]) return false;
  try {
    return realpathSync(resolve(process.argv[1])) === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
}

if (isDirectInvocation()) {
  process.exitCode = runIdentityGateCli();
}
