import { chmodSync, mkdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const SAFE_REF_PATTERN = /^[A-Za-z0-9._:-]{1,128}$/;
const ALLOWED_ACTIONS = new Set(["add", "revoke", "rotate", "unchanged"]);

function text(value) {
  return String(value ?? "").trim();
}

function safeRef(value, fallback = "") {
  const normalized = text(value);
  return SAFE_REF_PATTERN.test(normalized) ? normalized : fallback;
}

function bool(value) {
  return value === true;
}

function nowIsoFrom(now) {
  const value = typeof now === "function" ? now() : new Date();
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
}

function handoffStamp(iso) {
  return iso.replace(/[^A-Za-z0-9]+/g, "_");
}

function failedReceipt(nowIso) {
  return {
    status: "failed",
    mutation: false,
    service: {
      name: "remote-data-plane-handoff",
      active: false,
      restarted: false
    },
    listener: {
      udp443: false,
      tcp: false
    },
    appliedAt: nowIso
  };
}

function sanitizeAction(action = {}) {
  const actionType = text(action.action);
  if (!ALLOWED_ACTIONS.has(actionType)) {
    return null;
  }
  const credentialRef = safeRef(action.credentialRef);
  if (!credentialRef) {
    return null;
  }
  return {
    action: actionType,
    credentialRef,
    ...(safeRef(action.orderRef) ? { orderRef: safeRef(action.orderRef) } : {}),
    ...(safeRef(action.userRef) ? { userRef: safeRef(action.userRef) } : {}),
    ...(text(action.expiresAt) ? { expiresAt: text(action.expiresAt) } : {}),
    ...(safeRef(action.materialFingerprint) ? { materialFingerprint: safeRef(action.materialFingerprint) } : {})
  };
}

function writeProtectedJson(filePath, payload, fileOps) {
  const tmpPath = `${filePath}.${process.pid}.tmp`;
  let published = false;
  try {
    fileOps.writeFileSync(tmpPath, `${JSON.stringify(payload, null, 2)}\n`, { mode: 0o600 });
    fileOps.chmodSync(tmpPath, 0o600);
    fileOps.renameSync(tmpPath, filePath);
    published = true;
  } finally {
    if (!published) {
      fileOps.rmSync(tmpPath, { force: true });
    }
  }
}

export function createDataPlaneHandoffRuntimeAdapter({
  handoffDir,
  physicalNodeRef = "",
  nodeRef = "",
  now = () => new Date(),
  fileOps: suppliedFileOps = {}
} = {}) {
  const safePhysicalNodeRef = safeRef(physicalNodeRef);
  const safeNodeRef = safeRef(nodeRef || physicalNodeRef);
  const fileOps = {
    chmodSync: typeof suppliedFileOps.chmodSync === "function" ? suppliedFileOps.chmodSync : chmodSync,
    mkdirSync: typeof suppliedFileOps.mkdirSync === "function" ? suppliedFileOps.mkdirSync : mkdirSync,
    renameSync: typeof suppliedFileOps.renameSync === "function" ? suppliedFileOps.renameSync : renameSync,
    rmSync: typeof suppliedFileOps.rmSync === "function" ? suppliedFileOps.rmSync : rmSync,
    writeFileSync: typeof suppliedFileOps.writeFileSync === "function" ? suppliedFileOps.writeFileSync : writeFileSync
  };

  return {
    applyCredentialReconciliation(payload = {}) {
      const generatedAt = nowIsoFrom(now);
      const safeChannelRef = safeRef(payload.channelRef);
      const safeDesiredStateRef = safeRef(payload.desiredStateRef);
      const runtime = safeRef(payload.runtime);
      const activationSurface = safeRef(payload.activationSurface, "explicit-restart");
      const normalizedHandoffDir = text(handoffDir);
      if (!safeChannelRef || !safeDesiredStateRef || !runtime || !normalizedHandoffDir) {
        return failedReceipt(generatedAt);
      }

      const actions = Array.isArray(payload.actions)
        ? payload.actions.map(sanitizeAction).filter(Boolean)
        : [];
      const handoffRef = safeRef(
        `handoff_${safeChannelRef}_${handoffStamp(generatedAt)}`,
        `handoff_${handoffStamp(generatedAt)}`
      );
      const handoffPayload = {
        type: "gccgw_remote_data_plane_credential_handoff",
        generatedBy: "gccgw edge credentials handoff",
        handoffRef,
        channelRef: safeChannelRef,
        ...(safePhysicalNodeRef ? { physicalNodeRef: safePhysicalNodeRef } : {}),
        ...(safeNodeRef ? { nodeRef: safeNodeRef } : {}),
        desiredStateRef: safeDesiredStateRef,
        runtime,
        activationSurface,
        summary: {
          desiredCount: payload.summary?.desiredCount ?? actions.length,
          currentCount: payload.summary?.currentCount ?? 0,
          addCount: payload.summary?.addCount ?? actions.filter((action) => action.action === "add").length,
          revokeCount: payload.summary?.revokeCount ?? actions.filter((action) => action.action === "revoke").length,
          rotateCount: payload.summary?.rotateCount ?? actions.filter((action) => action.action === "rotate").length,
          unchangedCount: payload.summary?.unchangedCount ?? actions.filter((action) => action.action === "unchanged").length
        },
        actions,
        nextAction: "apply_on_data_plane_node",
        mutation: false,
        productionAuthority: false,
        redacted: true,
        generatedAt
      };

      try {
        fileOps.mkdirSync(normalizedHandoffDir, { recursive: true, mode: 0o700 });
        writeProtectedJson(join(normalizedHandoffDir, `${handoffRef}.json`), handoffPayload, fileOps);
      } catch {
        return failedReceipt(generatedAt);
      }

      return {
        status: "pending",
        mutation: false,
        handoffRef,
        service: {
          name: "remote-data-plane-handoff",
          active: false,
          restarted: false
        },
        listener: {
          udp443: false,
          tcp: false
        },
        appliedAt: generatedAt
      };
    }
  };
}
