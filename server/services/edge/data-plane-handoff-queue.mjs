import { chmodSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";

const SAFE_REF_PATTERN = /^[A-Za-z0-9._:-]{1,128}$/;
const HANDOFF_TYPE = "gccgw_remote_data_plane_credential_handoff";
const ALLOWED_ACTIONS = new Set(["add", "revoke", "rotate", "unchanged"]);

function text(value) {
  return String(value ?? "").trim();
}

function safeRef(value) {
  const normalized = text(value);
  return SAFE_REF_PATTERN.test(normalized) ? normalized : "";
}

function safeIso(value) {
  const raw = text(value);
  const date = new Date(raw);
  return raw && !Number.isNaN(date.getTime()) ? date.toISOString() : "";
}

function nowIsoFrom(now) {
  const value = typeof now === "function" ? now() : new Date();
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
}

function readJson(filePath) {
  try {
    return JSON.parse(readFileSync(filePath, "utf8"));
  } catch {
    return null;
  }
}

function jsonFiles(dir) {
  if (!dir || !existsSync(dir)) {
    return [];
  }
  return readdirSync(dir)
    .filter((file) => file.endsWith(".json"))
    .sort()
    .map((file) => join(dir, file));
}

function actionCounts(actions = []) {
  const counts = {
    actionCount: 0,
    addCount: 0,
    revokeCount: 0,
    rotateCount: 0,
    unchangedCount: 0
  };
  for (const action of Array.isArray(actions) ? actions : []) {
    const actionType = text(action?.action);
    if (!ALLOWED_ACTIONS.has(actionType) || !safeRef(action?.credentialRef)) {
      continue;
    }
    counts.actionCount += 1;
    if (actionType === "add") counts.addCount += 1;
    if (actionType === "revoke") counts.revokeCount += 1;
    if (actionType === "rotate") counts.rotateCount += 1;
    if (actionType === "unchanged") counts.unchangedCount += 1;
  }
  return counts;
}

function summarizeHandoff(payload) {
  if (payload?.type !== HANDOFF_TYPE || payload?.mutation === true) {
    return null;
  }
  const handoffRef = safeRef(payload.handoffRef);
  const channelRef = safeRef(payload.channelRef);
  const runtime = safeRef(payload.runtime);
  if (!handoffRef || !channelRef || !runtime) {
    return null;
  }
  return {
    handoffRef,
    channelRef,
    ...(safeRef(payload.physicalNodeRef) ? { physicalNodeRef: safeRef(payload.physicalNodeRef) } : {}),
    runtime,
    activationSurface: safeRef(payload.activationSurface) || "explicit-restart",
    ...actionCounts(payload.actions),
    status: "pending",
    nextAction: safeRef(payload.nextAction) || "apply_on_data_plane_node",
    ...(safeIso(payload.generatedAt) ? { generatedAt: safeIso(payload.generatedAt) } : {})
  };
}

function protectedWriteJson(filePath, payload) {
  const tmpPath = `${filePath}.${process.pid}.tmp`;
  writeFileSync(tmpPath, `${JSON.stringify(payload, null, 2)}\n`, { mode: 0o600 });
  renameSync(tmpPath, filePath);
  chmodSync(filePath, 0o600);
}

export function createDataPlaneHandoffQueue({
  handoffDir,
  archiveDir = join(text(handoffDir), "archive"),
  now = () => new Date()
} = {}) {
  const safeHandoffDir = text(handoffDir);
  const safeArchiveDir = text(archiveDir);

  function listPending() {
    return jsonFiles(safeHandoffDir)
      .map((filePath) => summarizeHandoff(readJson(filePath)))
      .filter(Boolean);
  }

  function archiveApplied({ handoffRef, appliedByRef } = {}) {
    const safeHandoffRef = safeRef(handoffRef);
    const safeAppliedByRef = safeRef(appliedByRef);
    if (!safeHandoffRef || !safeAppliedByRef || !safeHandoffDir || !safeArchiveDir) {
      return {
        ok: false,
        status: "validation_error",
        mutation: false,
        nextAction: "review_handoff_archive_input"
      };
    }
    const sourcePath = join(safeHandoffDir, `${basename(safeHandoffRef)}.json`);
    const payload = readJson(sourcePath);
    const summary = summarizeHandoff(payload);
    if (!summary || summary.handoffRef !== safeHandoffRef) {
      return {
        ok: false,
        handoffRef: safeHandoffRef,
        status: "not_found",
        mutation: false,
        nextAction: "review_pending_handoff_queue"
      };
    }
    const archivedAt = nowIsoFrom(now);
    mkdirSync(safeArchiveDir, { recursive: true, mode: 0o700 });
    const archivedPayload = {
      ...payload,
      archived: {
        status: "archived",
        appliedByRef: safeAppliedByRef,
        archivedAt,
        mutation: false
      }
    };
    protectedWriteJson(join(safeArchiveDir, `${safeHandoffRef}.json`), archivedPayload);
    renameSync(sourcePath, join(safeArchiveDir, `${safeHandoffRef}.pending-applied.json`));
    return {
      ok: true,
      handoffRef: safeHandoffRef,
      channelRef: summary.channelRef,
      runtime: summary.runtime,
      status: "archived",
      mutation: false,
      archivedAt,
      nextAction: "continue_remote_data_plane_reconciliation"
    };
  }

  return {
    listPending,
    archiveApplied
  };
}
