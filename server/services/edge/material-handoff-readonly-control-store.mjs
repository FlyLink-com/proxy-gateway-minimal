import Database from "better-sqlite3";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { readDataPackDesiredStateRows } from "./data-pack-desired-state-rows.mjs";

const SAFE_REF_PATTERN = /^[A-Za-z0-9._:-]{1,160}$/;
const SAFE_LIFECYCLE_REVISION_REF_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_:/-]{0,127}$/;
const UNSAFE_LIFECYCLE_REVISION_REF_PATTERN =
  /https?:|token=|secret|credential|password|private|customer|@|\/sub\/clash\.yaml|(?:\d{1,3}\.){3}\d{1,3}|[a-z0-9-]+\.[a-z]{2,}/i;
const TRAFFIC_LIFECYCLE_PENDING_ACTIONS = new Set([
  "traffic_supply_expiry_cleanup_pending",
  "traffic_supply_resume_pending",
  "traffic_supply_resume_rollback_pending"
]);

function text(value) {
  return String(value ?? "").trim();
}

function requiredSafeRef(value, field) {
  const normalized = text(value);
  if (!normalized || !SAFE_REF_PATTERN.test(normalized)) {
    throw new Error(`${field} is required`);
  }
  return normalized;
}

function parseJsonArray(value) {
  try {
    const parsed = JSON.parse(value || "[]");
    return Array.isArray(parsed) ? parsed.map(text).filter(Boolean) : [];
  } catch {
    return [];
  }
}

function parseJsonObject(value) {
  try {
    const parsed = JSON.parse(value || "{}");
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function desiredStateLifecycleRevision(row) {
  const event = parseJsonObject(row.event_json);
  const candidate = text(event.lifecycleRevisionRef);
  const lifecycleRevisionRef = (
    SAFE_LIFECYCLE_REVISION_REF_PATTERN.test(candidate)
    && !UNSAFE_LIFECYCLE_REVISION_REF_PATTERN.test(candidate)
  ) ? candidate : "";
  const required = TRAFFIC_LIFECYCLE_PENDING_ACTIONS.has(text(row.next_action));
  return {
    fingerprint: lifecycleRevisionRef
      ? {
        requestRef: row.request_id,
        lifecycleRevisionRef
      }
      : {
        requestRef: row.request_id,
        updatedAt: row.updated_at
      },
    safe: !required || Boolean(lifecycleRevisionRef)
  };
}

function mapEdgeRegisteredNode(row) {
  if (!row) {
    return null;
  }
  return {
    nodeRef: row.node_ref,
    physicalNodeRef: row.physical_node_ref || row.node_ref,
    providerRef: row.provider_ref,
    regionRef: row.region_ref,
    roleRef: row.role_ref,
    pool: row.pool || "private",
    channelRefs: parseJsonArray(row.channel_refs_json),
    imageManifestRef: row.image_manifest_ref,
    releaseRef: row.release_ref,
    lifecycle: row.lifecycle,
    status: row.status,
    firstBootPacketRef: row.first_boot_packet_ref,
    registeredAt: row.registered_at,
    updatedAt: row.updated_at,
    redacted: true
  };
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

export function createReadOnlyMaterialHandoffControlStore({ dbPath } = {}) {
  const safeDbPath = text(dbPath);
  if (!safeDbPath) {
    throw new Error("control DB path is required");
  }
  if (!existsSync(safeDbPath)) {
    throw new Error("control DB path does not exist");
  }

  const db = new Database(safeDbPath, { readonly: true, fileMustExist: true });

  return {
    close() {
      db.close();
    },

    getEdgeRegisteredNode(nodeRef) {
      return mapEdgeRegisteredNode(db.prepare(`
        select * from platform_edge_registered_nodes where node_ref = ?
      `).get(requiredSafeRef(nodeRef, "nodeRef")));
    },

    getLatestEdgeDesiredStateForChannel(channelRef, filters = {}) {
      const safeChannelRef = requiredSafeRef(channelRef, "channelRef");
      const nodeRef = requiredSafeRef(filters.nodeRef || safeChannelRef, "nodeRef");
      const portalRows = db.prepare(`
        select
          r.id as request_id,
          r.status as request_status,
          r.next_action,
          coalesce(r.valid_until, r.expires_at) as valid_until,
          r.updated_at,
          r.event_json,
          c.edge_channel_ref,
          c.edge_credential_ref,
          c.edge_material_digest
        from platform_portal_access_requests r
        join platform_portal_edge_credentials c on c.request_id = r.id
        where c.edge_channel_ref = ?
        order by c.edge_credential_ref asc, r.updated_at asc, r.id asc
      `).all(safeChannelRef);
      const nowMs = Date.now();
      const pack = readDataPackDesiredStateRows(db, safeChannelRef, nowMs);
      const rows = [...portalRows, ...pack.rows];
      if (rows.length === 0) {
        return null;
      }

      const activeRows = [...portalRows
        .map((row) => ({
          ...row,
          validUntilMs: Date.parse(row.valid_until)
        }))
        .filter((row) => (
          ["delivered", "issued"].includes(row.request_status)
          || (
            row.request_status === "disabled"
            && row.next_action === "traffic_supply_resume_pending"
          )
        ))
        .filter((row) => row.edge_credential_ref && row.edge_material_digest)
        .filter((row) => row.valid_until && !Number.isNaN(row.validUntilMs) && row.validUntilMs > nowMs),
        ...pack.activeRows];
      if (new Set(activeRows.map((row) => row.edge_credential_ref)).size !== activeRows.length) {
        throw new Error("edge desired state credential collision");
      }

      const edgeCredentialRefs = [...new Set(activeRows.map((row) => row.edge_credential_ref))]
        .sort((a, b) => a.localeCompare(b));
      const materialDigests = activeRows
        .map((row) => ({
          channelRef: row.edge_channel_ref,
          edgeCredentialRef: row.edge_credential_ref,
          digest: row.edge_material_digest
        }))
        .sort((a, b) => a.edgeCredentialRef.localeCompare(b.edgeCredentialRef));
      const lifecycleRevisionStates = rows.map(desiredStateLifecycleRevision);
      const lifecycleRevisions = lifecycleRevisionStates
        .map(({ fingerprint }) => fingerprint)
        .sort((left, right) => (
          left.requestRef.localeCompare(right.requestRef)
          || String(left.lifecycleRevisionRef || left.updatedAt)
            .localeCompare(String(right.lifecycleRevisionRef || right.updatedAt))
        ));
      const lifecycleRevisionSafe = lifecycleRevisionStates.every(({ safe }) => safe);
      const lifecycleTimes = rows
        .flatMap((row) => [Date.parse(row.valid_until), Date.parse(row.updated_at)])
        .filter((value) => !Number.isNaN(value));
      const validUntil = activeRows.length > 0
        ? new Date(Math.min(...activeRows.map((row) => row.validUntilMs))).toISOString()
        : new Date(Math.max(...lifecycleTimes)).toISOString();
      const fingerprint = sha256(JSON.stringify({
        nodeRef,
        channelRef: safeChannelRef,
        edgeCredentialRefs,
        materialDigests,
        lifecycleRevisions,
        validUntil
      })).slice(0, 24);

      return {
        desiredStateRef: `desired_state_${safeChannelRef}_${fingerprint}`,
        nodeRef,
        generation: `gen_${fingerprint}`,
        channelRefs: [safeChannelRef],
        edgeCredentialRefs,
        materialDigests,
        validUntil,
        lifecycleRevisionSafe,
        redacted: true
      };
    }
  };
}
