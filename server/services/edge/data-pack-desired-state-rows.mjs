import { createHash } from "node:crypto";

const TECHNICAL_VALID_UNTIL = "9999-12-31T23:59:59.999Z";
const DIGEST = /^sha256:[a-f0-9]{64}$/;

function invalidBinding() {
  const error = new Error("Data-pack edge desired state requires reconciliation");
  error.code = "data_pack_edge_desired_state_reconciliation_required";
  return error;
}

function metadata(value) {
  try {
    const parsed = JSON.parse(value);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed;
  } catch {
    // Malformed persisted metadata must never authorize traffic supply.
  }
  throw invalidBinding();
}

function effectRef(commandRef) {
  return `effect_coin_commerce_${createHash("sha256")
    .update(`GCCWEBOS:COIN_COMMERCE_SUBSCRIPTION_FULFILLMENT:v1\0${commandRef}`)
    .digest("hex")}`;
}

// Shared by the mutable control store and the read-only handoff projection.
// A registered credential alone is deliberately insufficient: the immutable
// order effect must exist, and measured lifetime usage must remain below quota.
export function readDataPackDesiredStateRows(db, channelRef, nowMs) {
  return db.transaction(() => {
    const candidates = db.prepare(`
      select c.request_ref, c.entitlement_ref, c.edge_channel_ref,
             c.edge_credential_ref, c.edge_material_digest,
             c.status as credential_status, c.updated_at,
             r.account_id, r.status as request_status, r.purpose,
             r.node_id, r.metadata_json as request_metadata_json,
             e.status as entitlement_status, e.plan, e.valid_from,
             e.valid_until, e.traffic_limit_bytes,
             a.status as account_status,
             p.order_ref, p.command_ref, p.offer_version_ref,
             p.quota_bytes, p.commercial_never_expires,
             p.technical_valid_until, p.created_at as resource_created_at
        from platform_data_pack_edge_credentials c
        left join platform_issuance_requests r on r.id = c.request_ref
        left join platform_entitlements e on e.id = c.entitlement_ref
        left join platform_accounts a on a.id = r.account_id
        left join platform_data_pack_resources p
          on p.request_ref = c.request_ref and p.entitlement_ref = c.entitlement_ref
       where c.edge_channel_ref = ?
       order by c.edge_credential_ref asc
    `).all(channelRef);
    const rows = [];
    const activeRows = [];
    for (const candidate of candidates) {
      const row = {
        request_id: candidate.request_ref,
        updated_at: candidate.updated_at,
        valid_until: candidate.valid_until || candidate.updated_at,
        edge_channel_ref: candidate.edge_channel_ref,
        edge_credential_ref: candidate.edge_credential_ref,
        edge_material_digest: candidate.edge_material_digest
      };
      rows.push(row);
      if (candidate.credential_status !== "active") continue;
      if (!candidate.account_id || !candidate.entitlement_status
        || candidate.request_status !== "issued"
        || candidate.purpose !== "coin_commerce_data_pack_fulfillment"
        || candidate.node_id !== channelRef
        || !DIGEST.test(candidate.edge_material_digest)) throw invalidBinding();
      // Registration can precede the fulfillment effect. Withhold the
      // credential until that effect is durably present; do not call it delivered.
      if (!candidate.order_ref) continue;
      const requestMetadata = metadata(candidate.request_metadata_json);
      if (requestMetadata.kind !== "data_pack"
        || requestMetadata.commandRef !== candidate.command_ref
        || requestMetadata.orderRef !== candidate.order_ref
        || requestMetadata.offerVersionRef !== candidate.offer_version_ref
        || requestMetadata.quotaBytes !== candidate.quota_bytes
        || requestMetadata.nodeId !== channelRef
        || candidate.plan !== candidate.offer_version_ref
        || candidate.traffic_limit_bytes !== candidate.quota_bytes
        || !Number.isSafeInteger(candidate.quota_bytes)
        || candidate.quota_bytes <= 0
        || Number.isNaN(Date.parse(candidate.valid_from))
        || candidate.commercial_never_expires !== 1
        || candidate.technical_valid_until !== TECHNICAL_VALID_UNTIL
        || candidate.valid_until !== TECHNICAL_VALID_UNTIL) throw invalidBinding();
      const effect = db.prepare(`
        select * from platform_audit_events where id = ?
      `).get(effectRef(candidate.command_ref));
      if (!effect) continue;
      const effectMetadata = metadata(effect.metadata_json);
      const links = db.prepare(`
        select id, request_id, status from platform_issued_subscription_links
         where request_id = ? and status = 'active'
      `).all(candidate.request_ref);
      const expectedEffect = {
        version: 1, kind: "data_pack",
        commandRef: candidate.command_ref, orderRef: candidate.order_ref,
        accountId: candidate.account_id, requestRef: candidate.request_ref,
        entitlementRef: candidate.entitlement_ref,
        issuedLinkRef: effectMetadata.issuedLinkRef,
        offerVersionRef: candidate.offer_version_ref,
        quotaBytes: candidate.quota_bytes,
        commercialNeverExpires: true,
        technicalValidUntil: TECHNICAL_VALID_UNTIL
      };
      if (effect.entity_type !== "coin_commerce_data_pack_fulfillment"
        || effect.entity_ref !== candidate.entitlement_ref
        || effect.action !== "data_pack_fulfillment_applied"
        || effect.actor_ref !== "coin_commerce_fulfillment"
        || effect.created_at !== candidate.resource_created_at
        || JSON.stringify(effectMetadata) !== JSON.stringify(expectedEffect)
        || links.length !== 1 || links[0].id !== effectMetadata.issuedLinkRef) {
        throw invalidBinding();
      }
      if (candidate.account_status !== "active"
        || candidate.entitlement_status !== "active"
        || Date.parse(candidate.valid_from) > nowMs
        || Date.parse(candidate.valid_until) <= nowMs) continue;
      const measured = db.prepare(`
        select count(*) as sample_count, sum(total_bytes) as used_bytes
          from platform_usage_samples
         where account_id = ? and entitlement_id = ? and request_id = ?
           and observed_at >= ? and observed_at <= ?
      `).get(candidate.account_id, candidate.entitlement_ref,
        candidate.request_ref, candidate.valid_from, new Date(nowMs).toISOString());
      if (measured.sample_count > 0 && (!Number.isSafeInteger(measured.used_bytes)
        || measured.used_bytes < 0)) throw invalidBinding();
      if (measured.sample_count === 0 || measured.used_bytes < candidate.quota_bytes) {
        activeRows.push({ ...row, validUntilMs: Date.parse(candidate.valid_until) });
      }
    }
    return { rows, activeRows };
  })();
}
