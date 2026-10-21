import { createHash } from "node:crypto";
import { DATA_PACK_TECHNICAL_VALID_UNTIL, lifetimeDataPackQuotaBytesFor } from "../../server/services/platform/usage-billing-cycle.mjs";
import { readProtocolRatedUsage } from "../../server/services/platform/protocol-traffic-rating.mjs";
import { assertNoDuplicateObjectKeys } from "../../server/services/deployment/strict-json-scan.mjs";

const PURPOSE = "coin_commerce_data_pack_fulfillment";
const MAX = 10000;
const REF = /^[A-Za-z0-9._:-]{1,128}$/;
const MATERIAL = /^sha256:[a-f0-9]{64}$/;
const TABLES = ["platform_data_pack_resources", "platform_data_pack_edge_credentials",
  "platform_data_pack_artifact_rotations", "platform_data_pack_credential_resets"];
const fail = (code = "baseline_pack_binding_invalid") => {
  throw Object.assign(new Error(code), { baselineCode: code });
};
const canonical = value => JSON.stringify(value, (_, item) => typeof item === "bigint" ? item.toString() : item);
const hash = value => createHash("sha256").update(value).digest("hex");
function ref(value) { if (typeof value !== "string" || !REF.test(value)) fail(); return value; }
function integer(value) {
  if (typeof value !== "bigint" || value < 0n || value > BigInt(Number.MAX_SAFE_INTEGER)) fail();
  return Number(value);
}
function iso(value) {
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString() !== value) fail();
  return value;
}
function metadata(value, expected) {
  let actual;
  try {
    if (typeof value !== "string" || value.length > 8192) fail();
    assertNoDuplicateObjectKeys(value);
    actual = JSON.parse(value);
  }
  catch { fail(); }
  if (!actual || Array.isArray(actual) || typeof actual !== "object") fail();
  if (expected && (Object.keys(actual).sort().join(",") !== Object.keys(expected).sort().join(",")
    || Object.keys(expected).some(key => actual[key] !== expected[key]))) fail();
  return actual;
}

function unissuedReservation(db, request, account, entitlement, now) {
  const value = metadata(request.metadata_json), quota = lifetimeDataPackQuotaBytesFor({ plan: entitlement.plan });
  ref(value.orderRef); ref(value.commandRef); ref(account.id); ref(request.node_id);
  const orderDigest = hash(value.orderRef);
  if (request.id !== `pareq_pack_${orderDigest}` || entitlement.id !== `ent_pack_${orderDigest}`
    || request.approval_ref !== `approval_pack_${orderDigest}` || request.purpose !== PURPOSE
    || request.requested_by_ref !== "coin_commerce_fulfillment" || request.quantity !== 1n
    || entitlement.account_id !== account.id || quota === null
    || integer(entitlement.traffic_limit_bytes) !== quota || entitlement.max_artifacts !== 1n || entitlement.max_devices !== 1n
    || entitlement.valid_from !== request.created_at || entitlement.valid_until !== DATA_PACK_TECHNICAL_VALID_UNTIL
    || !["active", "suspended", "disabled"].includes(account.status)
    || !["active", "suspended", "expired", "revoked"].includes(entitlement.status)
    || typeof account.owner_ref !== "string" || !account.owner_ref.trim()) fail();
  for (const row of [account, entitlement, request]) {
    if (iso(row.created_at) > now || iso(row.updated_at) > now) fail();
  }
  metadata(request.metadata_json, { version: 1, kind: "data_pack", commandRef: value.commandRef,
    orderRef: value.orderRef, offerVersionRef: entitlement.plan, quotaBytes: quota,
    nodeId: request.node_id, commercialNeverExpires: true, technicalValidUntil: DATA_PACK_TECHNICAL_VALID_UNTIL });
  const effectRef = `effect_coin_commerce_${hash(`GCCWEBOS:COIN_COMMERCE_SUBSCRIPTION_FULFILLMENT:v1\0${value.commandRef}`)}`;
  // No issued link/material/resource is checked by the caller; these additional
  // checks reject any durable evidence that the reservation has already run.
  const queries = [
    ["select 1 from platform_portal_access_requests where id=?", [request.id]],
    ["select 1 from platform_portal_edge_credentials where request_id=?", [request.id]],
    ["select 1 from platform_audit_events where id=? or (entity_type=? and entity_ref=?)", [effectRef, PURPOSE, entitlement.id]],
    ["select 1 from platform_data_pack_credential_resets where order_ref=? or request_ref=? or entitlement_ref=?", [value.orderRef, request.id, entitlement.id]],
    ["select 1 from platform_data_pack_artifact_rotations where order_ref=?", [value.orderRef]],
    ["select 1 from platform_usage_samples where request_id=? or entitlement_id=?", [request.id, entitlement.id]],
    ["select 1 from platform_usage_rollups where request_id=? or entitlement_id=?", [request.id, entitlement.id]]
  ];
  if (queries.some(([sql, params]) => db.prepare(`${sql} limit 1`).get(...params))) fail();
  return { request, account, entitlement, unissued: true };
}

// This is the control-side issued-order proof. It deliberately never opens a
// Commerce database, synthesizes a Portal request, or issues credentials. The
// source driver independently proves protected material against runtime config.
// The caller holds the read transaction and has enabled safe-integer mode.
export function readFullMeteringDataPackBindings({ db, channels, nowMs, sources }) {
  const empty = { requestRefs: [], entries: [], retainedBindings: [], evidence: [], schema: [], hasSchema: false };
  const placeholders = channels.map(() => "?").join(",");
  const schema = db.prepare(`select type,name,tbl_name,sql from sqlite_schema
    where tbl_name in (${TABLES.map(() => "?").join(",")}) order by type,name`).all(...TABLES);
  if (!schema.length) {
    // An untouched pre-pack database remains readable. A pack request without its
    // schema is not a valid legacy fallback, even while issuance is incomplete.
    if (db.prepare(`select 1 from platform_issuance_requests where node_id in (${placeholders})
      and purpose = ? limit 1`).get(...channels, PURPOSE)) fail("baseline_pack_schema_missing");
    return empty;
  }
  if (TABLES.some(table => !schema.some(row => row.name === table && row.type === "table"))) fail("baseline_pack_schema_invalid");
  const requests = db.prepare(`
    select r.id as request_ref from platform_issuance_requests r
    left join platform_entitlements e on e.id=r.entitlement_id
    where (r.node_id in (${placeholders}) or exists
      (select 1 from platform_data_pack_edge_credentials c where c.request_ref=r.id
        and c.edge_channel_ref in (${placeholders})))
      and (r.purpose=? or e.plan in ('offerv_pack_100gb_v1','offerv_pack_200gb_v1','offerv_pack_500gb_v1')
        or exists (select 1 from platform_data_pack_resources p where p.request_ref=r.id)
        or exists (select 1 from platform_data_pack_edge_credentials c where c.request_ref=r.id))
    union select c.request_ref from platform_data_pack_edge_credentials c
      where c.edge_channel_ref in (${placeholders})
    order by request_ref limit ${MAX + 1}
  `).all(...channels, ...channels, PURPOSE, ...channels);
  if (requests.length > MAX) fail("baseline_scope_too_large");
  const result = { ...empty, schema, hasSchema: true };
  const now = new Date(nowMs).toISOString();
  for (const { request_ref: requestRef } of requests) {
    ref(requestRef);
    const request = db.prepare("select * from platform_issuance_requests where id=?").get(requestRef);
    const resources = db.prepare("select * from platform_data_pack_resources where request_ref=? limit 2").all(requestRef);
    const credentials = db.prepare("select * from platform_data_pack_edge_credentials where request_ref=? limit 2").all(requestRef);
    const links = db.prepare("select * from platform_issued_subscription_links where request_id=? order by id limit 2").all(requestRef);
    if (!request) fail();
    const account = db.prepare("select * from platform_accounts where id=?").get(request.account_id);
    const entitlement = db.prepare("select * from platform_entitlements where id=?").get(request.entitlement_id);
    if (!account || !entitlement) fail();
    if (["planned", "failed", "cancelled"].includes(request.status)
      && !resources.length && !credentials.length && !links.length) {
      result.evidence.push(unissuedReservation(db, request, account, entitlement, now));
      result.requestRefs.push(request.id);
      continue;
    }
    if (resources.length !== 1 || credentials.length !== 1 || links.length !== 1) fail();
    const resource = resources[0], credential = credentials[0], link = links[0];
    [resource.order_ref, resource.command_ref, request.account_id, request.entitlement_id,
      credential.edge_credential_ref, credential.edge_channel_ref, link.id, link.tenant_ref, link.artifact_ref].forEach(ref);
    const orderDigest = hash(resource.order_ref), quota = lifetimeDataPackQuotaBytesFor({ plan: entitlement.plan });
    if (request.id !== `pareq_pack_${orderDigest}` || entitlement.id !== `ent_pack_${orderDigest}`
      || request.approval_ref !== `approval_pack_${orderDigest}` || request.purpose !== PURPOSE
      || request.requested_by_ref !== "coin_commerce_fulfillment" || request.quantity !== 1n
      || !["issued", "revoked", "cancelled"].includes(request.status)
      || !["active", "suspended", "disabled"].includes(account.status)
      || typeof account.owner_ref !== "string" || !account.owner_ref.trim()
      || !["active", "suspended", "expired", "revoked"].includes(entitlement.status)
      || entitlement.account_id !== account.id || resource.account_id !== account.id
      || resource.entitlement_ref !== entitlement.id || credential.entitlement_ref !== entitlement.id
      || resource.offer_version_ref !== entitlement.plan || quota === null
      || integer(resource.quota_bytes) !== quota || integer(entitlement.traffic_limit_bytes) !== quota
      || resource.commercial_never_expires !== 1n || entitlement.max_artifacts !== 1n || entitlement.max_devices !== 1n
      || entitlement.valid_from !== request.created_at || entitlement.valid_until !== DATA_PACK_TECHNICAL_VALID_UNTIL
      || resource.technical_valid_until !== DATA_PACK_TECHNICAL_VALID_UNTIL
      || request.node_id !== credential.edge_channel_ref || !channels.includes(credential.edge_channel_ref)
      || !MATERIAL.test(credential.edge_material_digest)
      || !["active", "disabled", "rotated"].includes(credential.status)
      || link.id !== `${request.id}_link_1` || !["active", "disabled", "rotated", "revoked"].includes(link.status)) fail();
    for (const row of [account, entitlement, request, resource, credential, link]) {
      if (iso(row.created_at) > now || (row.updated_at && iso(row.updated_at) > now)) fail();
    }
    if (iso(entitlement.valid_from) >= iso(entitlement.valid_until) || entitlement.valid_from > now) fail();
    metadata(request.metadata_json, { version: 1, kind: "data_pack", commandRef: resource.command_ref,
      orderRef: resource.order_ref, offerVersionRef: entitlement.plan, quotaBytes: quota,
      nodeId: credential.edge_channel_ref, commercialNeverExpires: true,
      technicalValidUntil: DATA_PACK_TECHNICAL_VALID_UNTIL });
    const effectRef = `effect_coin_commerce_${hash(`GCCWEBOS:COIN_COMMERCE_SUBSCRIPTION_FULFILLMENT:v1\0${resource.command_ref}`)}`;
    const effect = db.prepare("select * from platform_audit_events where id=?").get(effectRef);
    if (!effect || effect.entity_type !== PURPOSE || effect.entity_ref !== entitlement.id
      || effect.action !== "data_pack_fulfillment_applied" || effect.actor_ref !== "coin_commerce_fulfillment"
      || effect.created_at !== resource.created_at) fail();
    metadata(effect.metadata_json, { version: 1, kind: "data_pack", commandRef: resource.command_ref,
      orderRef: resource.order_ref, accountId: account.id, requestRef: request.id,
      entitlementRef: entitlement.id, issuedLinkRef: link.id, offerVersionRef: entitlement.plan,
      quotaBytes: quota, commercialNeverExpires: true, technicalValidUntil: DATA_PACK_TECHNICAL_VALID_UNTIL });
    // Credential resolution is global. Even an unselected channel or an inactive
    // legacy row cannot share a pack's principal or claim to be its Portal row.
    if (db.prepare("select count(*) as count from platform_data_pack_edge_credentials where edge_credential_ref=?")
      .get(credential.edge_credential_ref).count !== 1n
      || db.prepare("select 1 from platform_portal_edge_credentials where edge_credential_ref=? or request_id=? limit 1")
        .get(credential.edge_credential_ref, request.id)
      || db.prepare("select 1 from platform_portal_access_requests where edge_credential_ref=? or id=? limit 1")
        .get(credential.edge_credential_ref, request.id)) fail("baseline_binding_ambiguous");
    const resets = db.prepare(`select * from platform_data_pack_credential_resets
      where order_ref=? order by (status='complete'), updated_at desc, created_at desc, rotation_ref desc limit 2`).all(resource.order_ref);
    if (resets.length > 1 && resets[0].status !== "complete" && resets[1].status !== "complete") fail();
    const reset = resets[0];
    if (reset) {
      if (reset.account_id !== account.id || reset.request_ref !== request.id || reset.entitlement_ref !== entitlement.id
        || reset.edge_channel_ref !== credential.edge_channel_ref || reset.edge_credential_ref !== credential.edge_credential_ref
        || !MATERIAL.test(reset.old_edge_material_digest)
        || !["prepared", "staged", "control_switched", "material_committed", "edge_applied", "complete"].includes(reset.status)
        || iso(reset.created_at) > now || iso(reset.updated_at) > now) fail();
      const old = ["prepared", "staged"].includes(reset.status);
      if ((reset.status === "prepared" ? reset.new_edge_material_digest !== null
        : !MATERIAL.test(reset.new_edge_material_digest) || reset.new_edge_material_digest === reset.old_edge_material_digest)
        || credential.edge_material_digest !== (old ? reset.old_edge_material_digest : reset.new_edge_material_digest)) fail();
      if (reset.status === "control_switched") fail("baseline_pack_material_pending");
    }
    const measured = db.prepare(`select count(*) as count, sum(total_bytes) as total
      from platform_usage_samples where account_id=? and entitlement_id=? and request_id=?
        and observed_at>=? and observed_at<=?`)
      .get(account.id, entitlement.id, request.id, entitlement.valid_from, now);
    const rated = readProtocolRatedUsage(db, {
      accountId: account.id, entitlementId: entitlement.id, requestId: request.id, cycleKey: "lifetime",
      observedFrom: entitlement.valid_from, observedTo: now, inclusiveEnd: true
    });
    const used = rated.mode === "rated"
      ? (rated.totalBytes === null ? null : integer(BigInt(rated.totalBytes)))
      : (measured.count === 0n ? null : integer(measured.total));
    const reasons = [];
    if (account.status !== "active") reasons.push(`account_${account.status}`);
    if (entitlement.status !== "active") reasons.push(`entitlement_${entitlement.status}`);
    if (entitlement.valid_until <= now) reasons.push("entitlement_elapsed");
    if (request.status !== "issued") reasons.push(`request_${request.status}`);
    if (link.status !== "active") reasons.push("links_inactive");
    if (credential.status !== "active") reasons.push(`credential_${credential.status}`);
    if (rated.mode === "rated" && rated.historyUnobserved) reasons.push("quota_unobserved");
    else if (used !== null && used >= quota) reasons.push("quota_exhausted");
    const evidence = { account, entitlement, request, resource, credential, link, effect, reset };
    const common = { sourceRef: sources[credential.edge_channel_ref], channelRef: credential.edge_channel_ref,
      edgeCredentialRef: credential.edge_credential_ref, materialDigest: credential.edge_material_digest,
      bindingDigest: hash(canonical(evidence)) };
    result.requestRefs.push(request.id);
    result.evidence.push(evidence);
    if (reasons.length) result.retainedBindings.push({ ...common, reasons: reasons.sort() });
    else result.entries.push({ ...common, accountId: account.id, entitlementId: entitlement.id,
      requestId: request.id, billingBinding: { plan: entitlement.plan,
        validFrom: entitlement.valid_from, validUntil: entitlement.valid_until } });
  }
  return result;
}
