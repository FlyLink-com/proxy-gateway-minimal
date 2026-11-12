import { createHash } from "node:crypto";
import { portalAccessEventJson } from "./control-json-contracts.mjs";

const TABLE = "platform_portal_subscription_link_resets";
const COLUMNS = ["operation_key_digest", "request_ref", "owner_ref", "tenant_id", "previous_artifact_id",
  "replacement_artifact_id", "subscription_url", "prepared_at", "completed_at", "state", "source_digest"];
function fail(code = "subscription_link_reset_conflict") {
  return Object.assign(new Error("Subscription link reset cannot be completed"), { code });
}
function hash(value) { return createHash("sha256").update(JSON.stringify(value)).digest("hex"); }
function reference(value) {
  if (typeof value !== "string" || !/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/.test(value)) throw fail("validation_error");
  return value;
}
function keys(input) {
  if (!input || !/^[a-f0-9]{64}$/.test(input.operationKeyDigest)) throw fail("validation_error");
  return { operationKeyDigest: input.operationKeyDigest, requestRef: reference(input.requestRef), ownerRef: reference(input.ownerRef) };
}
function mapped(row) {
  return row ? { operationKeyDigest: row.operation_key_digest, requestRef: row.request_ref, ownerRef: row.owner_ref,
    state: row.state, preparedAt: row.prepared_at, completedAt: row.completed_at,
    plan: { tenantId: row.tenant_id, previousArtifactId: row.previous_artifact_id,
      replacementArtifactId: row.replacement_artifact_id, subscriptionUrl: row.subscription_url, preparedAt: row.prepared_at } } : null;
}

// This migration is explicit. Normal application/control-store construction
// never calls it. A production rollout must separately approve the schema.
export function ensurePortalSubscriptionLinkResetSchema(database) {
  database.transaction(() => {
    database.exec(`create table if not exists ${TABLE} (
      operation_key_digest text primary key,
      request_ref text not null references platform_portal_access_requests(id),
      owner_ref text not null,
      tenant_id text not null,
      previous_artifact_id text not null,
      replacement_artifact_id text not null,
      subscription_url text not null,
      prepared_at text not null,
      completed_at text,
      state text not null check(state in ('prepared','completed')),
      source_digest text not null,
      check ((state = 'prepared' and completed_at is null) or (state = 'completed' and completed_at is not null))
    );
    create unique index if not exists portal_link_reset_pending_request_idx on ${TABLE}(request_ref) where state = 'prepared';
    create unique index if not exists portal_link_reset_replacement_idx on ${TABLE}(replacement_artifact_id);
    `);
    checkPortalSubscriptionLinkResetSchema(database);
  }).immediate();
}

export function checkPortalSubscriptionLinkResetSchema(database) {
  try {
    const columns = database.prepare(`pragma table_info(${TABLE})`).all().map(column => column.name);
    if (columns.length !== COLUMNS.length || COLUMNS.some(column => !columns.includes(column))) throw fail();
    const indexes = database.prepare(`pragma index_list(${TABLE})`).all();
    // Read-only metering inspectors use SafeIntegers. Accept the exact SQLite
    // flag in either mode without changing the caller's connection policy.
    const enabled = value => value === 1 || value === 1n;
    if (!indexes.some(index => index.name === "portal_link_reset_pending_request_idx" && enabled(index.unique) && enabled(index.partial))
      || !indexes.some(index => index.name === "portal_link_reset_replacement_idx" && enabled(index.unique))) throw fail();
    const pendingColumns = database.prepare("pragma index_info(portal_link_reset_pending_request_idx)").all().map(column => column.name);
    const replacementColumns = database.prepare("pragma index_info(portal_link_reset_replacement_idx)").all().map(column => column.name);
    const predicate = database.prepare("select sql from sqlite_master where type = 'index' and name = 'portal_link_reset_pending_request_idx'").get()?.sql;
    if (JSON.stringify(pendingColumns) !== '["request_ref"]' || JSON.stringify(replacementColumns) !== '["replacement_artifact_id"]'
      || !/where\s+state\s*=\s*'prepared'\s*;?\s*$/i.test(predicate || "")) throw fail();
    return true;
  } catch { throw fail("subscription_link_reset_schema_unavailable"); }
}

// Compatibility proof for immutable issuance/audit references. It does not
// modify the binding, infer a chain from generic rotated runtime objects, or
// accept an uncommitted journal entry. Absence of the opt-in schema means no
// proof; callers retain their ordinary exact-reference legacy behavior.
export function verifyPortalSubscriptionLinkResetLineage(database, input = {}) {
  try {
    const { requestRef, ownerRef, tenantId, originalArtifactRef, currentArtifactId } = input;
    for (const value of [requestRef, ownerRef, tenantId, currentArtifactId]) reference(value);
    if (typeof originalArtifactRef !== "string" || !/^artifactref_[a-f0-9]{16}$/.test(originalArtifactRef)) return false;
    checkPortalSubscriptionLinkResetSchema(database);
    const request = database.prepare("select portal_user_ref, tenant_id, artifact_id from platform_portal_access_requests where id = ?").get(requestRef);
    if (!request || request.portal_user_ref !== ownerRef || request.tenant_id !== tenantId || request.artifact_id !== currentArtifactId) return false;
    const rows = database.prepare(`select previous_artifact_id, replacement_artifact_id, prepared_at, completed_at
      from ${TABLE} where request_ref = ? and owner_ref = ? and tenant_id = ? and state = 'completed'`)
      .all(requestRef, ownerRef, tenantId);
    const artifactRef = id => `artifactref_${createHash("sha256").update(id).digest("hex").slice(0, 16)}`;
    const starts = rows.filter(row => artifactRef(row.previous_artifact_id) === originalArtifactRef);
    if (starts.length !== 1) return false;
    const visited = new Set();
    let current = starts[0].previous_artifact_id;
    let completedAt = null;
    while (current !== currentArtifactId) {
      if (visited.has(current)) return false;
      visited.add(current);
      const next = rows.filter(row => row.previous_artifact_id === current);
      if (next.length !== 1) return false;
      const [row] = next;
      if (!Number.isFinite(Date.parse(row.prepared_at)) || !Number.isFinite(Date.parse(row.completed_at))
        || row.prepared_at > row.completed_at || (completedAt && row.prepared_at < completedAt)) return false;
      current = row.replacement_artifact_id;
      completedAt = row.completed_at;
    }
    // A stale pointer into the middle of a later completed chain is not the
    // current resource, even if a corrupt record points back to that item.
    return visited.size > 0 && !rows.some(row => row.previous_artifact_id === currentArtifactId);
  } catch { return false; }
}

/** Uses exactly the control store's SQLite connection. Completion holds its
 * IMMEDIATE write lock while the runtime database commits its exact plan.
 * If the process dies between DB commits, the already durable prepared row
 * retains the only raw replacement URL, allowing deterministic recovery.
 * This API returns sensitive handoff material to the authenticated service,
 * never directly to summaries, audit logs or public API responses.
 */
export function createPortalSubscriptionLinkResetStore({ database, nowFn = () => new Date() } = {}) {
  const db = database;
  checkPortalSubscriptionLinkResetSchema(db);
  function now() { const value = nowFn(); return new Date(value).toISOString(); }
  function read(input, required = false) {
    const key = keys(input);
    const row = db.prepare(`select * from ${TABLE} where operation_key_digest = ?`).get(key.operationKeyDigest);
    if (row && (row.request_ref !== key.requestRef || row.owner_ref !== key.ownerRef)) throw fail("not_found");
    if (!row && required) throw fail("not_found");
    return row || null;
  }
  function requestFor(input, plan, at, expectedArtifactId) {
    const request = db.prepare("select * from platform_portal_access_requests where id = ?").get(input.requestRef);
    if (!request || request.portal_user_ref !== input.ownerRef) throw fail("not_found");
    if (!["issued", "delivered"].includes(request.status) || request.tenant_id !== plan.tenantId
      || request.artifact_id !== expectedArtifactId || !Number.isFinite(Date.parse(request.valid_until))
      || Date.parse(request.valid_until) <= Date.parse(at)) throw fail();
    return request;
  }
  function validatePlan(plan, at) {
    if (!plan || typeof plan !== "object" || Array.isArray(plan)
      || Object.keys(plan).length !== 5) throw fail("validation_error");
    for (const field of ["tenantId", "previousArtifactId", "replacementArtifactId"]) reference(plan[field]);
    if (plan.previousArtifactId === plan.replacementArtifactId || typeof plan.preparedAt !== "string"
      || !Number.isFinite(Date.parse(plan.preparedAt)) || new Date(plan.preparedAt).toISOString() !== plan.preparedAt
      || plan.preparedAt > at || typeof plan.subscriptionUrl !== "string" || plan.subscriptionUrl.length > 2048) throw fail("validation_error");
    let url;
    try { url = new URL(plan.subscriptionUrl); } catch { throw fail("validation_error"); }
    // The core additionally enforces the exact configured origin/path prefix.
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.search || url.hash
      || !/\/sub\/a\/[A-Za-z0-9_-]{16,192}\.yaml$/.test(url.pathname)) throw fail("validation_error");
  }
  return Object.freeze({
    get(input) { return mapped(read(input)); },
    getPending({ requestRef, ownerRef }) {
      reference(requestRef); reference(ownerRef);
      const row = db.prepare(`select * from ${TABLE} where request_ref = ? and state = 'prepared'`).get(requestRef);
      if (row && row.owner_ref !== ownerRef) throw fail("not_found");
      return mapped(row);
    },
    getLatestCompletedAt({ requestRef, ownerRef }) {
      reference(requestRef); reference(ownerRef);
      const request = db.prepare("select portal_user_ref from platform_portal_access_requests where id = ?").get(requestRef);
      if (!request || request.portal_user_ref !== ownerRef) throw fail("not_found");
      return db.prepare(`select max(completed_at) at from ${TABLE} where request_ref = ? and owner_ref = ? and state = 'completed'`)
        .get(requestRef, ownerRef).at || null;
    },
    prepare(input) {
      keys(input);
      const at = now();
      const cooldownMs = input.cooldownMs ?? 300_000;
      if (!Number.isSafeInteger(cooldownMs) || cooldownMs < 0 || cooldownMs > 31 * 86400_000) throw fail("validation_error");
      validatePlan(input.plan, at);
      return db.transaction(() => {
        const existing = read(input);
        if (existing) {
          if (JSON.stringify(mapped(existing).plan) !== JSON.stringify({ tenantId: input.plan.tenantId,
            previousArtifactId: input.plan.previousArtifactId, replacementArtifactId: input.plan.replacementArtifactId,
            subscriptionUrl: input.plan.subscriptionUrl, preparedAt: input.plan.preparedAt })) throw fail();
          return mapped(existing);
        }
        const request = requestFor(input, input.plan, at, input.plan.previousArtifactId);
        if (db.prepare(`select 1 from ${TABLE} where request_ref = ? and state = 'prepared'`).get(input.requestRef)) throw fail();
        const latest = db.prepare(`select max(completed_at) at from ${TABLE} where request_ref = ? and owner_ref = ? and state = 'completed'`)
          .get(input.requestRef, input.ownerRef).at;
        if (latest && Date.parse(at) - Date.parse(latest) < cooldownMs) {
          throw Object.assign(fail("subscription_link_reset_rate_limited"), {
            retryAfterSeconds: Math.ceil((Date.parse(latest) + cooldownMs - Date.parse(at)) / 1000)
          });
        }
        db.prepare(`insert into ${TABLE} (${COLUMNS.join(",")}) values (?,?,?,?,?,?,?,?,null,'prepared',?)`)
          .run(input.operationKeyDigest, input.requestRef, input.ownerRef, input.plan.tenantId,
            input.plan.previousArtifactId, input.plan.replacementArtifactId, input.plan.subscriptionUrl,
            input.plan.preparedAt, hash(request));
        return mapped(read(input, true));
      }).immediate();
    },
    complete(input) {
      keys(input);
      if (typeof input.commitRuntime !== "function") throw fail("validation_error");
      return db.transaction(() => {
        const row = read(input, true);
        const operation = mapped(row);
        const at = now();
        const expectedArtifactId = row.state === "completed" ? row.replacement_artifact_id : row.previous_artifact_id;
        const request = requestFor(input, operation.plan, at, expectedArtifactId);
        if (row.state === "prepared" && hash(request) !== row.source_digest) throw fail();
        if (row.state === "completed" && request.subscription_url !== row.subscription_url) throw fail();
        const result = input.commitRuntime(operation.plan);
        if (!result || typeof result.then === "function" || result.previous?.id !== row.previous_artifact_id
          || result.previous?.tenantId !== row.tenant_id || result.previous?.status !== "rotated"
          || result.replacement?.id !== row.replacement_artifact_id || result.replacement?.tenantId !== row.tenant_id
          || result.replacement?.status !== "active" || result.subscriptionUrl !== row.subscription_url) throw fail();
        if (row.state === "completed") return operation;
        const updated = db.prepare(`update platform_portal_access_requests set artifact_id = ?, subscription_url = ?, event_json = ?, updated_at = ?
          where id = ? and portal_user_ref = ? and tenant_id = ? and artifact_id = ? and updated_at = ? and status = ?`)
          .run(row.replacement_artifact_id, row.subscription_url, portalAccessEventJson({ type: "subscription_link_reset", occurredAt: at }), at,
            row.request_ref, row.owner_ref, row.tenant_id, row.previous_artifact_id, request.updated_at, request.status);
        if (updated.changes !== 1) throw fail();
        db.prepare(`update ${TABLE} set state = 'completed', completed_at = ? where operation_key_digest = ? and state = 'prepared'`)
          .run(at, row.operation_key_digest);
        return mapped(read(input, true));
      }).immediate();
    }
  });
}
