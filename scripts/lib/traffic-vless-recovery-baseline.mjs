import { createHash } from "node:crypto";
import { lstatSync, realpathSync, statSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";
import Database from "better-sqlite3";
import { usageCycleForBinding } from "../../server/services/platform/usage-billing-cycle.mjs";

const SOURCE = "xray_statsquery_user_traffic";
const CHANNELS = new Set(["channel-vultr-a-vless-reality-tcp", "channel-sgp-a-vless-reality-tcp"]);
const MAX_AGE_MS = 300000;
const MAX_CURSOR_AGE_MS = 900000;
const MAX_ACTIVATION_MS = 86400000;
const MAX_ENTRIES = 10000;
const SAFE_MAX = BigInt(Number.MAX_SAFE_INTEGER);
const RETENTION_POLICY = "preserve-ineligible";
const RETAINED_REASONS = new Set(["account_suspended", "account_disabled", "entitlement_expired", "entitlement_revoked", "entitlement_suspended", "entitlement_elapsed", "portal_elapsed", "request_revoked", "request_cancelled", "links_inactive", "portal_disabled"]);
const PENDING_LIFECYCLE = new Set(["traffic_supply_resume_pending", "traffic_supply_resume_rollback_pending", "traffic_supply_expiry_cleanup_pending"]);
const TABLES = {
  platform_usage_counter_cursors: { source_ref: "TEXT", channel_ref: "TEXT", edge_credential_ref: "TEXT", upload_bytes: "INTEGER", download_bytes: "INTEGER", observed_at: "TEXT", epoch: "INTEGER", updated_at: "TEXT" },
  platform_usage_samples: { id: "TEXT", source_ref: "TEXT", channel_ref: "TEXT", edge_credential_ref: "TEXT", upload_bytes: "INTEGER", download_bytes: "INTEGER", total_bytes: "INTEGER" },
  platform_usage_rollups: { edge_credential_ref: "TEXT", channel_ref: "TEXT", upload_bytes: "INTEGER", download_bytes: "INTEGER", total_bytes: "INTEGER" },
  platform_portal_edge_credentials: { request_id: "TEXT", edge_channel_ref: "TEXT", edge_credential_ref: "TEXT", edge_material_digest: "TEXT", ordinal: "INTEGER" },
  platform_portal_access_requests: { id: "TEXT", portal_user_ref: "TEXT", status: "TEXT", valid_until: "TEXT", expires_at: "TEXT", edge_channel_ref: "TEXT", edge_credential_ref: "TEXT" },
  platform_issued_subscription_links: { id: "TEXT", request_id: "TEXT", status: "TEXT" },
  platform_issuance_requests: { id: "TEXT", account_id: "TEXT", entitlement_id: "TEXT", status: "TEXT", node_id: "TEXT" },
  platform_entitlements: { id: "TEXT", account_id: "TEXT", status: "TEXT", valid_from: "TEXT", valid_until: "TEXT", traffic_limit_bytes: "INTEGER" },
  platform_accounts: { id: "TEXT", owner_ref: "TEXT", status: "TEXT" }
};

function fail(code) { throw Object.assign(new Error(code), { baselineCode: code }); }
function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
  if (typeof value === "bigint") return JSON.stringify(value.toString());
  return JSON.stringify(value);
}
function digest(value) { return createHash("sha256").update(canonical(value)).digest("hex"); }
function isoMs(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)) fail("baseline_timestamp_invalid");
  const ms = Date.parse(value);
  if (!Number.isFinite(ms) || new Date(ms).toISOString() !== value) fail("baseline_timestamp_invalid");
  return ms;
}
function clock(nowFn) {
  const value = nowFn();
  const normalized = value instanceof Date ? value.toISOString() : value;
  return { iso: normalized, ms: isoMs(normalized) };
}
function scope(channelRefs) {
  if (!Array.isArray(channelRefs) || channelRefs.length < 1 || channelRefs.length > 2 || new Set(channelRefs).size !== channelRefs.length || channelRefs.some((ref) => !CHANNELS.has(ref))) fail("baseline_scope_invalid");
  return [...channelRefs].sort();
}
function safeInteger(value) {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) fail("baseline_counter_invalid");
  return value;
}
function storedInteger(value) {
  if (typeof value !== "bigint" || value < 0n || value > SAFE_MAX) fail("baseline_counter_invalid");
  return Number(value);
}
function validateBytes(uploadBytes, downloadBytes) {
  safeInteger(uploadBytes);
  safeInteger(downloadBytes);
  if (!Number.isSafeInteger(uploadBytes + downloadBytes)) fail("baseline_counter_invalid");
}
function sameBillingCycle(binding, ...times) {
  const cycles = times.map((at) => usageCycleForBinding(binding, at));
  if (cycles.some((cycle) => !cycle) || cycles.some((cycle) => cycle.startedAt !== cycles[0].startedAt || cycle.endedAt !== cycles[0].endedAt)) fail("baseline_billing_cycle_changed");
}
function text(value) { if (typeof value !== "string" || !value.trim() || value.length > 1024) fail("baseline_binding_invalid"); return value; }
function onlyKeys(value, keys) {
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).some((key) => !keys.includes(key))) fail("baseline_input_invalid");
}
function identity(dbPath) {
  if (typeof dbPath !== "string" || !isAbsolute(dbPath) || !lstatSync(dbPath).isFile() || lstatSync(dbPath).isSymbolicLink()) fail("baseline_database_invalid");
  const canonicalPath = realpathSync(dbPath);
  const normalize = (path) => process.platform === "win32" ? path.toLowerCase() : path;
  if (normalize(canonicalPath) !== normalize(resolve(dbPath))) fail("baseline_database_invalid");
  const stat = statSync(dbPath, { bigint: true });
  return digest({ path: normalize(canonicalPath), dev: stat.dev.toString(), ino: stat.ino.toString() });
}
function openDatabase(dbPath, readonly, action) {
  const databaseIdentityDigest = identity(dbPath);
  const db = new Database(dbPath, { readonly, fileMustExist: true, timeout: 5000 });
  try {
    db.defaultSafeIntegers(true);
    db.pragma("trusted_schema = OFF");
    if (readonly) db.pragma("query_only = ON");
    if (identity(dbPath) !== databaseIdentityDigest) fail("baseline_database_identity_changed");
    const result = action(db, databaseIdentityDigest);
    if (identity(dbPath) !== databaseIdentityDigest) fail("baseline_database_identity_changed");
    return result;
  } finally { db.close(); }
}
function schemaDigest(db) {
  const cursorPk = [];
  for (const [table, expected] of Object.entries(TABLES)) {
    if (db.prepare("SELECT type FROM sqlite_schema WHERE name=?").get(table)?.type !== "table") fail("baseline_schema_invalid");
    const columns = db.prepare(`PRAGMA table_info(${table})`).all();
    if (Object.entries(expected).some(([name, type]) => !columns.some((column) => column.name === name && column.type.toUpperCase() === type))) fail("baseline_schema_invalid");
    if (table === "platform_usage_counter_cursors") cursorPk.push(...columns.filter((column) => column.pk > 0n).sort((a, b) => Number(a.pk - b.pk)).map((column) => column.name));
  }
  if (cursorPk.join(",") !== "source_ref,channel_ref,edge_credential_ref") fail("baseline_schema_invalid");
  if (db.prepare("SELECT COUNT(*) AS count FROM sqlite_schema WHERE type='trigger' AND tbl_name='platform_usage_counter_cursors'").get().count !== 0n) fail("baseline_cursor_triggers_unsupported");
  return digest(db.prepare(`SELECT type,name,tbl_name,sql FROM sqlite_schema WHERE tbl_name IN (${Object.keys(TABLES).map(() => "?").join(",")}) ORDER BY type,name`).all(...Object.keys(TABLES)));
}
function hashRows(db, table, channels, order) {
  const hash = createHash("sha256");
  let count = 0;
  for (const row of db.prepare(`SELECT * FROM ${table} WHERE channel_ref IN (${channels.map(() => "?").join(",")}) ORDER BY ${order}`).iterate(...channels)) {
    hash.update(canonical(row)).update("\n");
    count += 1;
    if (!Number.isSafeInteger(count)) fail("baseline_scope_too_large");
  }
  return { count, digest: hash.digest("hex") };
}
function retentionPolicy(value) {
  if (value !== undefined && value !== RETENTION_POLICY) fail("baseline_retention_policy_invalid");
  return value;
}
function storedCursor(row, nowMs) {
  const cursor = { uploadBytes: storedInteger(row.upload_bytes), downloadBytes: storedInteger(row.download_bytes), observedAt: row.observed_at, epoch: storedInteger(row.epoch), updatedAt: row.updated_at };
  validateBytes(cursor.uploadBytes, cursor.downloadBytes);
  if (isoMs(cursor.observedAt) > nowMs || isoMs(cursor.updatedAt) > nowMs) fail("baseline_cursor_timestamp_invalid");
  return cursor;
}
function retainedState(db, databaseIdentityDigest, channels, nowMs) {
  const schema = schemaDigest(db);
  const placeholders = channels.map(() => "?").join(",");
  // A terminal status does not establish the identity of a missing durable
  // credential. Do not derive a fallback key or silently drop such history.
  const legacyCount = db.prepare(`SELECT COUNT(*) AS count FROM platform_issuance_requests r
    WHERE r.node_id IN (${placeholders})
      AND (r.status NOT IN ('planned','failed','cancelled')
        OR EXISTS (SELECT 1 FROM platform_issued_subscription_links l WHERE l.request_id=r.id)
        OR EXISTS (SELECT 1 FROM platform_portal_access_requests p WHERE p.id=r.id AND
          (p.status IN ('delivered','issued') OR coalesce(p.edge_credential_ref,'')<>''
            OR coalesce(p.edge_material_digest,'')<>'' OR coalesce(p.tenant_id,'')<>''
            OR coalesce(p.artifact_id,'')<>'' OR coalesce(p.access_grant_ref,'')<>'')))
      AND NOT EXISTS (SELECT 1 FROM platform_portal_edge_credentials c WHERE c.request_id=r.id AND c.edge_channel_ref=r.node_id)`).get(...channels).count;
  if (legacyCount !== 0n) fail("baseline_legacy_binding_unsupported");
  const bindings = db.prepare(`
    SELECT c.request_id,c.edge_channel_ref,c.edge_credential_ref,c.edge_material_digest,c.ordinal,
      p.portal_user_ref,p.status AS portal_status,p.valid_until AS portal_valid_until,p.expires_at AS portal_expires_at,
      p.updated_at AS portal_updated_at,p.entitlement_ref,p.edge_lifecycle_mutation,p.next_action,p.event_json,
      r.account_id,r.entitlement_id,r.status AS request_status,r.updated_at AS request_updated_at,r.node_id,
      e.account_id AS entitlement_account_id,e.status AS entitlement_status,e.plan,e.valid_from,e.valid_until,e.traffic_limit_bytes,e.updated_at AS entitlement_updated_at,
      a.id AS account_id_readback,a.owner_ref,a.status AS account_status,a.updated_at AS account_updated_at
    FROM platform_portal_edge_credentials c
    LEFT JOIN platform_portal_access_requests p ON p.id=c.request_id
    LEFT JOIN platform_issuance_requests r ON r.id=c.request_id
    LEFT JOIN platform_entitlements e ON e.id=r.entitlement_id
    LEFT JOIN platform_accounts a ON a.id=r.account_id
    WHERE c.edge_channel_ref IN (${placeholders}) ORDER BY c.edge_channel_ref,c.edge_credential_ref,c.request_id,c.ordinal
  `).all(...channels);
  if (!bindings.length || bindings.length > MAX_ENTRIES) fail("baseline_binding_scope_invalid");
  const byKey = new Map();
  for (const binding of bindings) {
    for (const key of ["request_id", "edge_channel_ref", "edge_credential_ref", "edge_material_digest", "account_id", "account_id_readback", "entitlement_id", "portal_user_ref", "owner_ref", "next_action", "plan"]) text(binding[key]);
    // Accounting resolves credentials globally, not by channel. Check the
    // actual rows, including unselected channels, rather than relying on an
    // index whose presence is not part of the legacy schema contract.
    if (db.prepare("SELECT COUNT(*) AS count FROM platform_portal_edge_credentials WHERE edge_credential_ref=?").get(binding.edge_credential_ref).count !== 1n) fail("baseline_binding_ambiguous");
    if (binding.account_id_readback !== binding.account_id || binding.entitlement_account_id !== binding.account_id
      || binding.entitlement_ref !== binding.entitlement_id || binding.portal_user_ref !== binding.account_id
      || binding.owner_ref !== binding.account_id || ![0n, 1n].includes(binding.edge_lifecycle_mutation)) fail("baseline_binding_invalid");
    if (!["active", "suspended", "disabled"].includes(binding.account_status)
      || !["active", "expired", "revoked", "suspended"].includes(binding.entitlement_status)
      || !["issued", "revoked", "cancelled"].includes(binding.request_status)
      || !["delivered", "issued", "disabled"].includes(binding.portal_status)
      || PENDING_LIFECYCLE.has(binding.next_action)) fail("baseline_binding_invalid");
    const from = isoMs(binding.valid_from);
    const until = isoMs(binding.valid_until);
    const portalUntil = isoMs(binding.portal_valid_until || binding.portal_expires_at);
    if (from >= until || from > nowMs) fail("baseline_binding_invalid");
    binding.links = db.prepare("SELECT id,request_id,tenant_ref,artifact_ref,status,created_at,updated_at FROM platform_issued_subscription_links WHERE request_id=? ORDER BY id").all(binding.request_id);
    if (!binding.links.length || binding.links.length > MAX_ENTRIES) fail("baseline_binding_invalid");
    for (const link of binding.links) {
      for (const key of ["id", "request_id", "tenant_ref", "artifact_ref"]) text(link[key]);
      if (link.request_id !== binding.request_id || !["active", "revoked", "rotated", "disabled"].includes(link.status)) fail("baseline_binding_invalid");
    }
    const activeLinks = binding.links.filter((link) => link.status === "active");
    if (activeLinks.length > 1) fail("baseline_binding_ambiguous");
    const reasons = [];
    if (binding.account_status !== "active") reasons.push(`account_${binding.account_status}`);
    if (binding.entitlement_status !== "active") reasons.push(`entitlement_${binding.entitlement_status}`);
    if (until <= nowMs) reasons.push("entitlement_elapsed");
    if (portalUntil <= nowMs) reasons.push("portal_elapsed");
    if (binding.request_status !== "issued") reasons.push(`request_${binding.request_status}`);
    if (activeLinks.length === 0) reasons.push("links_inactive");
    if (binding.portal_status === "disabled") reasons.push("portal_disabled");
    const key = `${binding.edge_channel_ref}\0${binding.edge_credential_ref}`;
    if (byKey.has(key)) fail("baseline_binding_ambiguous");
    byKey.set(key, { binding, reasons: reasons.sort(), cursor: null });
  }
  const rows = db.prepare(`SELECT * FROM platform_usage_counter_cursors WHERE channel_ref IN (${placeholders}) ORDER BY channel_ref,edge_credential_ref,source_ref`).all(...channels);
  for (const row of rows) {
    if (row.source_ref !== SOURCE) fail("baseline_source_invalid");
    const item = byKey.get(`${row.channel_ref}\0${row.edge_credential_ref}`);
    if (!item || item.cursor !== null) fail("baseline_binding_missing");
    item.cursor = storedCursor(row, nowMs);
  }
  const entries = [], retainedBindings = [];
  for (const { binding, reasons, cursor } of byKey.values()) {
    const common = { sourceRef: SOURCE, channelRef: binding.edge_channel_ref, edgeCredentialRef: binding.edge_credential_ref, bindingDigest: digest(binding) };
    if (reasons.length) retainedBindings.push({ ...common, reasons, cursor });
    else {
      if (!cursor) fail("baseline_cursor_scope_incomplete");
      entries.push({ ...common, billingBinding: { plan: binding.plan, validFrom: binding.valid_from, validUntil: binding.valid_until }, cursor });
    }
  }
  if (channels.some((channel) => !entries.some((entry) => entry.channelRef === channel))) fail("baseline_binding_scope_invalid");
  const samples = hashRows(db, "platform_usage_samples", channels, "id");
  const rollups = hashRows(db, "platform_usage_rollups", channels, "edge_credential_ref");
  return { version: 2, retentionPolicy: RETENTION_POLICY, retainedBindings, retentionDigest: digest(retainedBindings),
    channelRefs: channels, databaseIdentityDigest, schemaDigest: schema, bindingDigest: digest(bindings),
    cursorDigest: digest(entries), accountingDigest: digest({ samples, rollups }),
    sampleCount: samples.count, rollupCount: rollups.count, entries };
}
function state(db, databaseIdentityDigest, channels, nowMs, policy) {
  if (retentionPolicy(policy)) return retainedState(db, databaseIdentityDigest, channels, nowMs);
  const schema = schemaDigest(db);
  const placeholders = channels.map(() => "?").join(",");
  // Only durable, uniquely resolvable active bindings are supported. Legacy
  // fallback identities need their own reviewed migration/retention decision.
  const legacyCount = db.prepare(`SELECT COUNT(*) AS count FROM platform_issuance_requests r WHERE r.status='issued' AND r.node_id IN (${placeholders}) AND NOT EXISTS (SELECT 1 FROM platform_portal_edge_credentials c WHERE c.request_id=r.id AND c.edge_channel_ref=r.node_id)`).get(...channels).count;
  if (legacyCount !== 0n) fail("baseline_legacy_binding_unsupported");
  const bindings = db.prepare(`
    SELECT c.request_id,c.edge_channel_ref,c.edge_credential_ref,c.edge_material_digest,c.ordinal,
      p.portal_user_ref,p.status AS portal_status,p.valid_until AS portal_valid_until,p.expires_at AS portal_expires_at,
      p.updated_at AS portal_updated_at,p.entitlement_ref,p.edge_lifecycle_mutation,
      l.id AS link_id,l.status AS link_status,l.updated_at AS link_updated_at,
      r.account_id,r.entitlement_id,r.status AS request_status,r.updated_at AS request_updated_at,
      e.account_id AS entitlement_account_id,e.status AS entitlement_status,e.plan,e.valid_from,e.valid_until,e.traffic_limit_bytes,e.updated_at AS entitlement_updated_at,
      a.owner_ref,a.status AS account_status,a.updated_at AS account_updated_at
    FROM platform_portal_edge_credentials c
    LEFT JOIN platform_portal_access_requests p ON p.id=c.request_id
    LEFT JOIN platform_issuance_requests r ON r.id=c.request_id
    LEFT JOIN platform_entitlements e ON e.id=r.entitlement_id
    LEFT JOIN platform_accounts a ON a.id=r.account_id
    LEFT JOIN platform_issued_subscription_links l ON l.request_id=r.id AND l.status='active'
    WHERE c.edge_channel_ref IN (${placeholders}) ORDER BY c.edge_channel_ref,c.edge_credential_ref,l.id
  `).all(...channels);
  if (!bindings.length || bindings.length > MAX_ENTRIES) fail("baseline_binding_scope_invalid");
  const byKey = new Map();
  for (const binding of bindings) {
    for (const key of ["request_id", "edge_channel_ref", "edge_credential_ref", "edge_material_digest", "link_id", "account_id", "entitlement_id", "portal_user_ref", "owner_ref"]) text(binding[key]);
    if (binding.link_status !== "active" || binding.request_status !== "issued" || binding.entitlement_status !== "active" || binding.account_status !== "active" || !["delivered", "issued"].includes(binding.portal_status) || binding.entitlement_account_id !== binding.account_id || binding.entitlement_ref !== binding.entitlement_id || ![0n, 1n].includes(binding.edge_lifecycle_mutation)) fail("baseline_binding_invalid");
    if (isoMs(binding.valid_from) > nowMs || isoMs(binding.valid_until) <= nowMs || isoMs(binding.portal_valid_until || binding.portal_expires_at) <= nowMs) fail("baseline_binding_expired");
    const key = `${binding.edge_channel_ref}\0${binding.edge_credential_ref}`;
    if (byKey.has(key)) fail("baseline_binding_ambiguous");
    byKey.set(key, binding);
  }
  if (channels.some((channel) => !bindings.some((binding) => binding.edge_channel_ref === channel))) fail("baseline_binding_scope_invalid");
  const rows = db.prepare(`SELECT * FROM platform_usage_counter_cursors WHERE channel_ref IN (${placeholders}) ORDER BY channel_ref,edge_credential_ref,source_ref`).all(...channels);
  if (rows.length !== bindings.length) fail("baseline_cursor_scope_incomplete");
  const entries = rows.map((row) => {
    if (row.source_ref !== SOURCE) fail("baseline_source_invalid");
    const binding = byKey.get(`${row.channel_ref}\0${row.edge_credential_ref}`);
    if (!binding) fail("baseline_binding_missing");
    const cursor = { uploadBytes: storedInteger(row.upload_bytes), downloadBytes: storedInteger(row.download_bytes), observedAt: row.observed_at, epoch: storedInteger(row.epoch), updatedAt: row.updated_at };
    validateBytes(cursor.uploadBytes, cursor.downloadBytes);
    if (isoMs(cursor.observedAt) > nowMs || isoMs(cursor.updatedAt) > nowMs) fail("baseline_cursor_timestamp_invalid");
    const billingBinding = { plan: binding.plan, validFrom: binding.valid_from, validUntil: binding.valid_until };
    return { sourceRef: SOURCE, channelRef: row.channel_ref, edgeCredentialRef: row.edge_credential_ref, bindingDigest: digest(binding), billingBinding, cursor };
  });
  const samples = hashRows(db, "platform_usage_samples", channels, "id");
  const rollups = hashRows(db, "platform_usage_rollups", channels, "edge_credential_ref");
  return {
    version: 1, channelRefs: channels, databaseIdentityDigest, schemaDigest: schema,
    bindingDigest: digest(bindings), cursorDigest: digest(entries), accountingDigest: digest({ samples, rollups }),
    sampleCount: samples.count, rollupCount: rollups.count, entries
  };
}
function publicSummary(action, extra = {}) {
  return { type: "traffic_vless_recovery_baseline", action, ok: true, productionAuthorized: false, productionCollectionAuthorized: false, operatorApprovalRequired: true, ...extra };
}
function errorSummary(action, error) {
  return publicSummary(action, { ok: false, status: "blocked", errorCode: error?.baselineCode || "baseline_operation_failed" });
}
function snapshotSummary(action, inventory) {
  return publicSummary(action, { status: "requires_review", channelCount: inventory.channelRefs.length, cursorCount: inventory.entries.length, databaseIdentityDigest: inventory.databaseIdentityDigest, bindingDigest: inventory.bindingDigest, cursorDigest: inventory.cursorDigest, accountingDigest: inventory.accountingDigest,
    ...(inventory.version === 2 ? { eligibleBindingCount: inventory.entries.length, retainedBindingCount: inventory.retainedBindings.length } : {}) });
}

// privateInventory and privatePlan contain credential references. Callers must
// keep them in memory or protected files; stdout receives summary only.
export function inspectTrafficVlessBaseline({ dbPath, channelRefs, nowFn = () => new Date(), retentionPolicy: policy } = {}) {
  try {
    const channels = scope(channelRefs);
    const now = clock(nowFn);
    retentionPolicy(policy);
    const privateInventory = openDatabase(dbPath, true, (db, id) => db.transaction(() => state(db, id, channels, now.ms, policy))());
    return { ok: true, privateInventory, summary: snapshotSummary("inspect", privateInventory) };
  } catch (error) { return { ok: false, privateInventory: null, summary: errorSummary("inspect", error) }; }
}

export function prepareTrafficVlessBaseline({ dbPath, channelRefs, observations, expectedInventory, nowFn = () => new Date(), validForSeconds = 300, retentionPolicy: policy } = {}) {
  try {
    const channels = scope(channelRefs);
    const now = clock(nowFn);
    if (!Number.isInteger(validForSeconds) || validForSeconds < 1 || validForSeconds > 300) fail("baseline_validity_invalid");
    if (!Array.isArray(observations) || observations.length < 1 || observations.length > MAX_ENTRIES) fail("baseline_observations_invalid");
    retentionPolicy(policy);
    const current = openDatabase(dbPath, true, (db, id) => db.transaction(() => state(db, id, channels, now.ms, policy))());
    if (!expectedInventory || digest(current) !== digest(expectedInventory)) fail("baseline_inventory_changed");
    const byKey = new Map();
    for (const observation of observations) {
      onlyKeys(observation, ["sourceRef", "accountingMode", "channelRef", "edgeCredentialRef", "observedAt", "uploadBytes", "downloadBytes", "counterResetConfirmed"]);
      if (observation.sourceRef !== SOURCE || observation.accountingMode !== "cumulative" || !channels.includes(observation.channelRef)) fail("baseline_source_invalid");
      text(observation.edgeCredentialRef);
      validateBytes(observation.uploadBytes, observation.downloadBytes);
      const observedMs = isoMs(observation.observedAt);
      if (observedMs > now.ms || now.ms - observedMs > MAX_AGE_MS) fail("baseline_observation_stale");
      if (observation.counterResetConfirmed !== undefined && typeof observation.counterResetConfirmed !== "boolean") fail("baseline_reset_evidence_invalid");
      const key = `${observation.channelRef}\0${observation.edgeCredentialRef}`;
      if (byKey.has(key)) fail("baseline_observation_duplicate");
      byKey.set(key, observation);
    }
    // Retained counters are optional, but are parsed/validated above just like
    // every other observation. They never become writable baseline entries.
    if (policy) for (const entry of current.retainedBindings) byKey.delete(`${entry.channelRef}\0${entry.edgeCredentialRef}`);
    if (byKey.size !== current.entries.length) fail("baseline_observation_scope_incomplete");
    let resetCount = 0;
    const entries = current.entries.map(({ cursor: before, ...entry }) => {
      const observed = byKey.get(`${entry.channelRef}\0${entry.edgeCredentialRef}`);
      if (!observed) fail("baseline_observation_scope_incomplete");
      if (isoMs(observed.observedAt) <= isoMs(before.observedAt)) fail("baseline_observation_not_newer");
      sameBillingCycle(entry.billingBinding, observed.observedAt, now.iso);
      const reset = observed.uploadBytes < before.uploadBytes || observed.downloadBytes < before.downloadBytes;
      if (reset !== (observed.counterResetConfirmed === true)) fail("baseline_reset_evidence_required");
      resetCount += Number(reset);
      const epoch = safeInteger(before.epoch + Number(reset));
      return { ...entry, before, after: { uploadBytes: observed.uploadBytes, downloadBytes: observed.downloadBytes, observedAt: observed.observedAt, epoch, updatedAt: now.iso } };
    });
    const earliestObservationMs = Math.min(...entries.map((entry) => isoMs(entry.after.observedAt)));
    const expiresAt = new Date(Math.min(now.ms + validForSeconds * 1000, earliestObservationMs + MAX_AGE_MS)).toISOString();
    if (isoMs(expiresAt) <= now.ms) fail("baseline_observation_stale");
    const privatePlan = {
      type: "traffic_vless_baseline_private_plan", version: current.version, preparedAt: now.iso, expiresAt,
      channelRefs: channels, databaseIdentityDigest: current.databaseIdentityDigest, schemaDigest: current.schemaDigest,
      bindingDigest: current.bindingDigest, accountingDigest: current.accountingDigest,
      beforeCursorDigest: current.cursorDigest,
      afterCursorDigest: digest(entries.map(({ before, after, ...entry }) => ({ ...entry, cursor: after }))),
      entries
    };
    if (policy) Object.assign(privatePlan, { retentionPolicy: policy, retainedBindings: current.retainedBindings, retentionDigest: current.retentionDigest });
    privatePlan.planDigest = digest(privatePlan);
    return { ok: true, privatePlan, summary: publicSummary("prepare", { status: "requires_review", planDigest: privatePlan.planDigest, plannedCursorCount: entries.length, channelCount: channels.length, resetCount, expiresAt, historicalBytesRecorded: 0,
      ...(policy ? { eligibleBindingCount: entries.length, retainedBindingCount: current.retainedBindings.length } : {}) }) };
  } catch (error) { return { ok: false, privatePlan: null, summary: errorSummary("prepare", error) }; }
}

function validatePlan(plan, expectedPlanDigest, nowMs, enforceExpiry) {
  onlyKeys(plan, ["type", "version", "preparedAt", "expiresAt", "channelRefs", "databaseIdentityDigest", "schemaDigest", "bindingDigest", "accountingDigest", "beforeCursorDigest", "afterCursorDigest", "entries", "planDigest", ...(plan?.version === 2 ? ["retentionPolicy", "retainedBindings", "retentionDigest"] : [])]);
  if (plan.type !== "traffic_vless_baseline_private_plan" || ![1, 2].includes(plan.version) || typeof expectedPlanDigest !== "string" || !/^[a-f0-9]{64}$/.test(expectedPlanDigest)) fail("baseline_plan_invalid");
  const { planDigest, ...body } = plan;
  if (planDigest !== expectedPlanDigest || digest(body) !== expectedPlanDigest) fail("baseline_plan_digest_mismatch");
  scope(plan.channelRefs);
  const preparedMs = isoMs(plan.preparedAt);
  const expiryMs = isoMs(plan.expiresAt);
  if (preparedMs > nowMs || expiryMs <= preparedMs || expiryMs - preparedMs > MAX_AGE_MS || (enforceExpiry && nowMs > expiryMs)) fail("baseline_plan_expired");
  if (!Array.isArray(plan.entries) || !plan.entries.length || plan.entries.length > MAX_ENTRIES) fail("baseline_plan_invalid");
  if (plan.version === 2) {
    if (plan.retentionPolicy !== RETENTION_POLICY || !Array.isArray(plan.retainedBindings)
      || plan.retainedBindings.length + plan.entries.length > MAX_ENTRIES
      || digest(plan.retainedBindings) !== plan.retentionDigest) fail("baseline_retention_invalid");
    const seen = new Set(plan.entries.map((entry) => `${entry.channelRef}\0${entry.edgeCredentialRef}`));
    if (seen.size !== plan.entries.length || plan.channelRefs.some((channel) => !plan.entries.some((entry) => entry.channelRef === channel))) fail("baseline_plan_invalid");
    for (const entry of plan.retainedBindings) {
      onlyKeys(entry, ["sourceRef", "channelRef", "edgeCredentialRef", "reasons", "bindingDigest", "cursor"]);
      text(entry.edgeCredentialRef);
      const key = `${entry.channelRef}\0${entry.edgeCredentialRef}`;
      if (entry.sourceRef !== SOURCE || !plan.channelRefs.includes(entry.channelRef) || seen.has(key)
        || typeof entry.bindingDigest !== "string" || !/^[a-f0-9]{64}$/.test(entry.bindingDigest)
        || !Array.isArray(entry.reasons) || !entry.reasons.length || new Set(entry.reasons).size !== entry.reasons.length
        || entry.reasons.some((reason) => !RETAINED_REASONS.has(reason))) fail("baseline_retention_invalid");
      seen.add(key);
      if (entry.cursor !== null) {
        onlyKeys(entry.cursor, ["uploadBytes", "downloadBytes", "observedAt", "epoch", "updatedAt"]);
        validateBytes(entry.cursor.uploadBytes, entry.cursor.downloadBytes);
        safeInteger(entry.cursor.epoch);
        if (isoMs(entry.cursor.observedAt) > preparedMs || isoMs(entry.cursor.updatedAt) > preparedMs) fail("baseline_retention_invalid");
      }
    }
  }
  for (const entry of plan.entries) {
    onlyKeys(entry, ["sourceRef", "channelRef", "edgeCredentialRef", "bindingDigest", "billingBinding", "before", "after"]);
    if (entry.sourceRef !== SOURCE || !plan.channelRefs.includes(entry.channelRef)) fail("baseline_plan_invalid");
    text(entry.edgeCredentialRef);
    onlyKeys(entry.billingBinding, ["plan", "validFrom", "validUntil"]);
    text(entry.billingBinding.plan);
    if (isoMs(entry.billingBinding.validFrom) >= isoMs(entry.billingBinding.validUntil)) fail("baseline_plan_invalid");
    for (const cursor of [entry.before, entry.after]) {
      onlyKeys(cursor, ["uploadBytes", "downloadBytes", "observedAt", "epoch", "updatedAt"]);
      validateBytes(cursor.uploadBytes, cursor.downloadBytes);
      safeInteger(cursor.epoch);
      isoMs(cursor.observedAt);
      isoMs(cursor.updatedAt);
    }
    if (isoMs(entry.after.observedAt) <= isoMs(entry.before.observedAt) || isoMs(entry.after.observedAt) > preparedMs || expiryMs - isoMs(entry.after.observedAt) > MAX_AGE_MS || entry.after.updatedAt !== plan.preparedAt) fail("baseline_plan_invalid");
    const reset = entry.after.uploadBytes < entry.before.uploadBytes || entry.after.downloadBytes < entry.before.downloadBytes;
    if (entry.after.epoch !== entry.before.epoch + Number(reset)) fail("baseline_plan_invalid");
    sameBillingCycle(entry.billingBinding, entry.after.observedAt, plan.preparedAt);
    if (enforceExpiry) sameBillingCycle(entry.billingBinding, entry.after.observedAt, new Date(nowMs).toISOString());
  }
  if (digest(plan.entries.map(({ before, after, ...entry }) => ({ ...entry, cursor: before }))) !== plan.beforeCursorDigest || digest(plan.entries.map(({ before, after, ...entry }) => ({ ...entry, cursor: after }))) !== plan.afterCursorDigest) fail("baseline_plan_invalid");
}
function compareIdentity(current, plan) {
  for (const key of ["databaseIdentityDigest", "schemaDigest", "bindingDigest"]) {
    if (current[key] !== plan[key]) fail(`baseline_${key === "databaseIdentityDigest" ? "database_identity" : key.replace("Digest", "")}_changed`);
  }
  if (plan.version === 2 && (current.version !== 2 || current.retentionPolicy !== plan.retentionPolicy
    || current.retentionDigest !== plan.retentionDigest || digest(current.retainedBindings) !== digest(plan.retainedBindings))) fail("baseline_retention_changed");
}
function compareState(current, plan) {
  compareIdentity(current, plan);
  if (current.accountingDigest !== plan.accountingDigest) fail("baseline_accounting_changed");
  if (current.cursorDigest === plan.beforeCursorDigest) return "before";
  if (current.cursorDigest === plan.afterCursorDigest) return "after";
  fail("baseline_cursor_changed");
}

export function applyTrafficVlessBaseline({ dbPath, plan, expectedPlanDigest, nowFn = () => new Date() } = {}) {
  try {
    const now = clock(nowFn);
    validatePlan(plan, expectedPlanDigest, now.ms, true);
    const result = openDatabase(dbPath, false, (db, id) => db.transaction(() => {
      // BEGIN IMMEDIATE can wait for another writer. The observation window
      // must still be valid after that wait, before changing any cursor.
      const transactionNow = clock(nowFn);
      validatePlan(plan, expectedPlanDigest, transactionNow.ms, true);
      const current = state(db, id, plan.channelRefs, transactionNow.ms, plan.retentionPolicy);
      const phase = compareState(current, plan);
      if (phase === "after") return { status: "baseline_already_applied", updatedCursorCount: 0 };
      const update = db.prepare(`UPDATE platform_usage_counter_cursors SET upload_bytes=@uploadBytes,download_bytes=@downloadBytes,observed_at=@observedAt,epoch=@epoch,updated_at=@updatedAt WHERE source_ref=@sourceRef AND channel_ref=@channelRef AND edge_credential_ref=@edgeCredentialRef AND upload_bytes=@oldUpload AND download_bytes=@oldDownload AND observed_at=@oldObservedAt AND epoch=@oldEpoch AND updated_at=@oldUpdatedAt`);
      for (const entry of plan.entries) {
        const result = update.run({ sourceRef: entry.sourceRef, channelRef: entry.channelRef, edgeCredentialRef: entry.edgeCredentialRef, ...entry.after, oldUpload: entry.before.uploadBytes, oldDownload: entry.before.downloadBytes, oldObservedAt: entry.before.observedAt, oldEpoch: entry.before.epoch, oldUpdatedAt: entry.before.updatedAt });
        if (result.changes !== 1) fail("baseline_cursor_compare_and_swap_failed");
      }
      // Recheck exact bindings, accounting row content and every target before
      // COMMIT, so an unexpected constraint or side effect rolls back all rows.
      if (compareState(state(db, id, plan.channelRefs, transactionNow.ms, plan.retentionPolicy), plan) !== "after") fail("baseline_verification_failed");
      validatePlan(plan, expectedPlanDigest, clock(nowFn).ms, true);
      if (identity(dbPath) !== id) fail("baseline_database_identity_changed");
      return { status: "baseline_applied", updatedCursorCount: plan.entries.length };
    }).immediate());
    return publicSummary("apply", { ...result, planDigest: expectedPlanDigest, sampleWrites: 0, rollupWrites: 0, lifecycleInvoked: false });
  } catch (error) { return errorSummary("apply", error); }
}

// Read-only reconciliation is allowed after expiry: it reports exact old/new
// state and never turns an expired plan into mutation or collection authority.
export function verifyTrafficVlessBaseline({ dbPath, plan, expectedPlanDigest, nowFn = () => new Date() } = {}) {
  try {
    const now = clock(nowFn);
    validatePlan(plan, expectedPlanDigest, now.ms, false);
    const phase = openDatabase(dbPath, true, (db, id) => db.transaction(() => compareState(state(db, id, plan.channelRefs, now.ms, plan.retentionPolicy), plan))());
    return publicSummary("verify", { ok: phase === "after", status: phase === "after" ? "baseline_verified" : "baseline_not_applied", planDigest: expectedPlanDigest, exactCursorState: phase, mutationAllowed: false });
  } catch (error) { return errorSummary("verify", error); }
}

// Admission is evidence for a caller that has separately verified the protected
// applied receipt. This function cannot prove operator approval or the receipt,
// and must never be used by itself to authorize a first collection.
export function admitTrafficVlessBaseline({ dbPath, plan, expectedPlanDigest, nowFn = () => new Date() } = {}) {
  try {
    const now = clock(nowFn);
    validatePlan(plan, expectedPlanDigest, now.ms, false);
    if (now.ms - isoMs(plan.preparedAt) > MAX_ACTIVATION_MS) fail("baseline_activation_window_expired");
    openDatabase(dbPath, true, (db, id) => db.transaction(() => {
      const current = state(db, id, plan.channelRefs, now.ms, plan.retentionPolicy);
      compareIdentity(current, plan);
      if (current.entries.length !== plan.entries.length) fail("baseline_cursor_scope_incomplete");
      const expectedByKey = new Map(plan.entries.map((entry) => [`${entry.sourceRef}\0${entry.channelRef}\0${entry.edgeCredentialRef}`, entry]));
      for (const entry of current.entries) {
        const expected = expectedByKey.get(`${entry.sourceRef}\0${entry.channelRef}\0${entry.edgeCredentialRef}`);
        if (!expected || entry.bindingDigest !== expected.bindingDigest) fail("baseline_binding_changed");
        if (isoMs(entry.cursor.observedAt) < isoMs(expected.after.observedAt) || entry.cursor.epoch < expected.after.epoch || (entry.cursor.epoch === expected.after.epoch && (entry.cursor.uploadBytes < expected.after.uploadBytes || entry.cursor.downloadBytes < expected.after.downloadBytes))) fail("baseline_cursor_before_baseline");
        if (now.ms - isoMs(entry.cursor.observedAt) > MAX_CURSOR_AGE_MS) fail("baseline_cursor_stale");
        sameBillingCycle(entry.billingBinding, expected.after.observedAt, entry.cursor.observedAt, now.iso);
      }
    })());
    return publicSummary("admit", { status: "baseline_scope_admitted", planDigest: expectedPlanDigest, cursorCount: plan.entries.length, appliedReceiptVerificationRequired: true, mutationAllowed: false });
  } catch (error) { return errorSummary("admit", error); }
}
