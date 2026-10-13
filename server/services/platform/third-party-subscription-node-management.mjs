import { createHash } from "node:crypto";
import { inspectThirdPartySubscriptionSchema } from "./third-party-subscription-migrations.mjs";
import { decorateThirdPartyServers, safeThirdPartyDisplayLabel } from "./third-party-subscription-render.mjs";
import { applyThirdPartyCountryFlag, isThirdPartyCountryCode } from "./third-party-node-country.mjs";

const PROTECTED_PREFIX = "v2:aes-256-gcm:";
const UNSAFE = /[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2060-\u206f]/u;
const RESERVED = new Set([
  "DIRECT", "REJECT", "REJECT-DROP", "PASS", "COMPATIBLE",
  "GLOBAL", "AUTO", "STABLE", "WEAK-NETWORK", "FALLBACK"
]);
const CODES = new Set([
  "not_found", "invalid_input", "invalid_node_name", "duplicate_node_name",
  "revision_conflict", "source_enabled", "empty_source", "third_party_unavailable",
  "protected_value_invalid", "unsupported_source_kind"
]);

function failure(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}

function objectWithKeys(value, keys, optionalKeys = []) {
  if (!value || typeof value !== "object" || Array.isArray(value)
    || Object.keys(value).some(key => !keys.includes(key) && !optionalKeys.includes(key))
    || !keys.every((key) => Object.hasOwn(value, key))) throw failure("invalid_input");
}

function normalizedCountry(value) {
  if (value === null) return null;
  if (!isThirdPartyCountryCode(value)) throw failure("invalid_input");
  return value;
}

function normalizedAlias(value) {
  if (value === null) return null;
  if (typeof value !== "string" || UNSAFE.test(value)
    || /[\ud800-\udfff]/u.test(value)) throw failure("invalid_node_name");
  const alias = value.trim() || null;
  // Match the downstream proxy display-name boundary (UTF-16 code units).
  if (alias && (alias.length > 128 || RESERVED.has(alias.toUpperCase()))) {
    throw failure("invalid_node_name");
  }
  return alias;
}

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
  }
  return value;
}

function revisionOf(snapshot) {
  // Cover encrypted material and inactive rows as well as metadata. updated_at
  // alone cannot detect two writes made with the same clock value.
  return createHash("sha256").update(JSON.stringify(canonical(snapshot))).digest("hex");
}

function validateSourceId(sourceId) {
  if (typeof sourceId !== "string" || !sourceId || sourceId.length > 128 || UNSAFE.test(sourceId)) {
    throw failure("invalid_input");
  }
}

function validateRevision(revision) {
  if (typeof revision !== "string" || !/^[a-f0-9]{64}$/.test(revision)) throw failure("invalid_input");
}

export function createThirdPartyNodeManagement({ database, secretProtector, nowFn = () => new Date() } = {}) {
  let available = false;
  let selectSource;
  let selectTiers;
  let selectNodes;
  let updateConfig;
  let deactivateNode;
  let updateSourceTime;
  let enableSource;
  try {
    available = typeof secretProtector?.protect === "function"
      && typeof secretProtector?.unprotect === "function"
      && inspectThirdPartySubscriptionSchema({ database }).ok === true;
    if (available) {
      selectSource = database.prepare("select * from platform_third_party_sources where id = ?");
      selectTiers = database.prepare("select * from platform_third_party_source_tiers where source_id = ? order by plan_id asc");
      selectNodes = database.prepare("select * from platform_third_party_nodes where source_id = ? order by country_code asc, fingerprint asc, id asc");
      updateConfig = database.prepare("update platform_third_party_nodes set protected_config = ? where source_id = ? and id = ? and active = 1");
      deactivateNode = database.prepare("update platform_third_party_nodes set active = 0 where source_id = ? and id = ? and active = 1");
      updateSourceTime = database.prepare("update platform_third_party_sources set updated_at = ? where id = ?");
      enableSource = database.prepare("update platform_third_party_sources set enabled = 1, updated_at = ? where id = ?");
    }
  } catch {
    available = false;
  }

  function protect(value) {
    try {
      const wrapped = secretProtector.protect(JSON.stringify(value));
      if (typeof wrapped !== "string" || !wrapped.startsWith(PROTECTED_PREFIX)) throw failure("protected_value_invalid");
      return wrapped;
    } catch {
      throw failure("protected_value_invalid");
    }
  }

  function unprotect(value) {
    try {
      if (typeof value !== "string" || !value.startsWith(PROTECTED_PREFIX)) throw failure("protected_value_invalid");
      const plain = secretProtector.unprotect(value);
      if (typeof plain !== "string" || !plain) throw failure("protected_value_invalid");
      return plain;
    } catch {
      throw failure("protected_value_invalid");
    }
  }

  function readSnapshot(sourceId) {
    const source = selectSource.get(sourceId);
    if (!source) throw failure("not_found");
    const descriptor = unprotect(source.protected_url);
    let parsed;
    try { parsed = JSON.parse(descriptor); } catch { throw failure("unsupported_source_kind"); }
    if (!parsed || Array.isArray(parsed) || typeof parsed !== "object"
      || Object.keys(parsed).length !== 2 || parsed.version !== 1 || parsed.kind !== "inline-yaml") {
      throw failure("unsupported_source_kind");
    }
    return { source, tiers: selectTiers.all(sourceId), nodes: selectNodes.all(sourceId) };
  }

  function configOf(row) {
    let config;
    try { config = JSON.parse(unprotect(row.protected_config)); } catch { throw failure("protected_value_invalid"); }
    if (!config || typeof config !== "object" || Array.isArray(config)
      || typeof (config.name || config.displayName) !== "string") throw failure("protected_value_invalid");
    return config;
  }

  function projection(snapshot) {
    const active = snapshot.nodes.filter((row) => row.active === 1);
    const configs = active.map(configOf);
    // Pass only default-name inputs, never the admin alias or credential fields.
    const defaults = decorateThirdPartyServers(active.map((row, index) => ({
      countryCode: row.country_code,
      name: configs[index].name,
      displayName: configs[index].displayName
    })));
    const used = new Set();
    const items = active.map((row, index) => {
      const config = configs[index];
      const customName = Object.hasOwn(config, "adminDisplayName") ? normalizedAlias(config.adminDisplayName) : null;
      const hasCountry = Object.hasOwn(config, "adminCountryCode");
      if (hasCountry && !isThirdPartyCountryCode(config.adminCountryCode)) throw failure("protected_value_invalid");
      const customCountryCode = hasCountry ? config.adminCountryCode : null;
      const defaultName = defaults[index].subscriptionDisplayName;
      const displayName = hasCountry
        ? safeThirdPartyDisplayLabel(applyThirdPartyCountryFlag(customName ?? defaultName, customCountryCode))
        : customName ?? defaultName;
      if (!displayName || RESERVED.has(displayName.toUpperCase())) throw failure("invalid_node_name");
      const key = displayName.toLowerCase();
      if (used.has(key)) throw failure("duplicate_node_name");
      used.add(key);
      return {
        id: row.id,
        originalName: safeThirdPartyDisplayLabel(config.name || config.displayName) || "未命名节点",
        defaultName,
        customName,
        displayName,
        countryCode: row.country_code,
        ...(hasCountry ? { customCountryCode } : {}),
        protocol: row.protocol
      };
    });
    return { sourceId: snapshot.source.id, revision: revisionOf(snapshot), enabled: snapshot.source.enabled === 1, items };
  }

  function timestamp() {
    const date = new Date(nowFn());
    if (Number.isNaN(date.getTime())) throw failure("invalid_input");
    return date.toISOString();
  }

  function guarded(action) {
    return (...args) => {
      if (!available) throw failure("third_party_unavailable");
      try { return action(...args); } catch (error) {
        // No database, encryption, descriptor or supplied-node data in errors.
        throw failure(CODES.has(error?.code) ? error.code : "third_party_unavailable");
      }
    };
  }

  const listSourceNodes = guarded((sourceId) => {
    validateSourceId(sourceId);
    return database.transaction(() => projection(readSnapshot(sourceId))).deferred();
  });

  const saveSourceNodes = guarded((sourceId, input) => {
    validateSourceId(sourceId);
    objectWithKeys(input, ["revision", "nodes"]);
    validateRevision(input.revision);
    if (!Array.isArray(input.nodes) || input.nodes.length > 256) throw failure("invalid_input");
    const retained = new Map();
    for (const node of input.nodes) {
      objectWithKeys(node, ["id", "customName"], ["customCountryCode"]);
      if (typeof node.id !== "string" || !node.id || node.id.length > 128 || retained.has(node.id)) throw failure("invalid_input");
      retained.set(node.id, {
        alias: normalizedAlias(node.customName),
        ...(Object.hasOwn(node, "customCountryCode") ? { country: normalizedCountry(node.customCountryCode) } : {})
      });
    }
    return database.transaction(() => {
      const snapshot = readSnapshot(sourceId);
      if (snapshot.source.enabled === 1) throw failure("source_enabled");
      if (revisionOf(snapshot) !== input.revision) throw failure("revision_conflict");
      const activeIds = new Set(snapshot.nodes.filter((node) => node.active === 1).map((node) => node.id));
      for (const id of retained.keys()) if (!activeIds.has(id)) throw failure("invalid_input");
      // Validate the complete resulting state before any write. Omissions only
      // deactivate current active nodes of this exact source.
      const candidate = { ...snapshot, nodes: snapshot.nodes.map((row) => {
        if (row.active !== 1) return row;
        const config = configOf(row);
        if (!retained.has(row.id)) return { ...row, active: 0 };
        const retainedNode = retained.get(row.id);
        const alias = retainedNode.alias;
        if (alias === null) delete config.adminDisplayName;
        else config.adminDisplayName = alias;
        if (Object.hasOwn(retainedNode, "country")) {
          if (retainedNode.country === null) delete config.adminCountryCode;
          else config.adminCountryCode = retainedNode.country;
        }
        return { ...row, protected_config: protect(config) };
      }) };
      projection(candidate);
      for (const row of candidate.nodes) {
        const previous = snapshot.nodes.find((item) => item.id === row.id);
        if (previous.active === 1 && row.active === 0) deactivateNode.run(sourceId, row.id);
        else if (row.active === 1 && row.protected_config !== previous.protected_config) updateConfig.run(row.protected_config, sourceId, row.id);
      }
      updateSourceTime.run(timestamp(), sourceId);
      return projection(readSnapshot(sourceId));
    }).immediate();
  });

  const enableSourceNodes = guarded((sourceId, input) => {
    validateSourceId(sourceId);
    objectWithKeys(input, ["revision"]);
    validateRevision(input.revision);
    return database.transaction(() => {
      const snapshot = readSnapshot(sourceId);
      if (revisionOf(snapshot) !== input.revision) throw failure("revision_conflict");
      const view = projection(snapshot);
      if (view.items.length === 0) throw failure("empty_source");
      enableSource.run(timestamp(), sourceId);
      return projection(readSnapshot(sourceId));
    }).immediate();
  });

  return { listSourceNodes, saveSourceNodes, enableSourceNodes };
}
