// D1 Stage 2 — freeze execution entry point (D6).
//
// POST /api/admin/platform/d1-freeze executes the R10 §5 freeze
// procedure in-process (A0→A3→B) via the startup-held freeze
// coordinator and returns the T1 receipt JSON. GET
// /api/admin/platform/d1-freeze/status reports the held wiring
// (snapshot id, scheduler wiring, current authority) so the operator
// can verify P2 before freezing.
//
// Auth is copied verbatim from admin-order-status-summary: the
// /api/admin prefix stack (IP allowlist, admin session gateway,
// console token) plus requireAdminCapability("operations.read").
// No write capability exists in the admin authorization model (all
// capabilities are ".read"); introducing a dedicated freeze/write
// capability is a separate auth-model decision, not part of this
// wiring PR.
//
// The route never accepts a caller-fabricated bundle, matrix or
// receipt: the body may only carry snapshotId, checkpointId,
// outstandingJobs and the optional T-0 checklist line. Everything
// else is built live by the executor. The body snapshotId defaults
// to the held coordinator's snapshot id (boot date); a different
// snapshot id creates a fresh coordinator from the same held wiring
// (same database handle, same scheduler references) — the held
// coordinator itself is never mutated. Phase C (the D-2 snapshot
// instruction) is a separate operator step, not this route.

import { Router } from "express";
import { requireAdminCapability } from "../middleware/admin-authorization.mjs";
import { createFreezeDrainCoordinator } from "../services/platform/d1-card9-freeze-drain-coordinator.mjs";
import {
  createD1FreezeExecutor,
  D1_FREEZE_EXECUTION_SCHEMA_VERSION,
  deriveFreezeCheckpointId
} from "../services/platform/d1-freeze-executor.mjs";

const PATH = "/api/admin/platform/d1-freeze";
const SNAPSHOT_ID_PATTERN = /^s2s-[a-z0-9-]{3,80}$/;

function isFreezeConflict(error) {
  const code = error?.code;
  if (typeof code !== "string") return false;
  if (code === "freeze_validation_error") return false;
  return code.startsWith("freeze_") || code.startsWith("writer_authority_");
}

function sendFreezeError(res, error) {
  const code = error?.code;
  const evidence = error?.executionEvidence;
  const body = { error: "internal_error" };
  if (evidence !== undefined) body.executionEvidence = evidence;
  if (code === "d1_freeze_unavailable" || code === "freeze_validation_error") {
    res.status(503).json({ error: "d1_freeze_unavailable", message: error?.message || "freeze wiring is not installed in this process", ...(evidence !== undefined ? { executionEvidence: evidence } : {}) });
    return;
  }
  if (isFreezeConflict(error)) {
    // The refusal message is the error code itself: internal error
    // messages may name credential rows or other operator-only detail,
    // and this body is returned to the caller. Refusal semantics
    // (409 + error code) are unchanged.
    res.status(409).json({ error: code, message: code, ...(evidence !== undefined ? { executionEvidence: evidence } : {}) });
    return;
  }
  res.status(500).json(body);
}

function validateBody(body) {
  if (body !== undefined && body !== null && (typeof body !== "object" || Array.isArray(body))) {
    return "request body must be a JSON object";
  }
  const input = body && typeof body === "object" ? body : {};
  if (input.snapshotId !== undefined && (typeof input.snapshotId !== "string" || !SNAPSHOT_ID_PATTERN.test(input.snapshotId))) {
    return "snapshotId must match s2s-[a-z0-9-]{3,80}";
  }
  if (input.checkpointId !== undefined && (typeof input.checkpointId !== "string" || input.checkpointId.length === 0)) {
    return "checkpointId must be a non-empty string";
  }
  if (input.outstandingJobs !== undefined) {
    if (!Array.isArray(input.outstandingJobs)) return "outstandingJobs must be an array of { ref, kind }";
    for (const [index, job] of input.outstandingJobs.entries()) {
      if (!job || typeof job !== "object" || Array.isArray(job)
        || typeof job.ref !== "string" || job.ref.length === 0
        || typeof job.kind !== "string" || job.kind.length === 0) {
        return `outstandingJobs[${index}] requires a non-empty ref and kind`;
      }
    }
  }
  if (input.t0ChecklistLine !== undefined && typeof input.t0ChecklistLine !== "string") {
    return "t0ChecklistLine must be a string";
  }
  return null;
}

export function adminD1FreezeRoutes(state) {
  const router = Router();
  if (state?.platform?.adminAuthorizationEnabled !== true) return router;

  router.use(PATH, (_req, res, next) => {
    res.set("Cache-Control", "no-store");
    next();
  });

  router.get(`${PATH}/status`, requireAdminCapability("operations.read"), (_req, res) => {
    res.set("Cache-Control", "no-store");
    const coordinator = state.platform?.d1FreezeCoordinator;
    const wiring = state.platform?.d1FreezeWiring;
    if (!coordinator || !wiring) {
      res.status(503).json({
        schemaVersion: D1_FREEZE_EXECUTION_SCHEMA_VERSION,
        wiringInstalled: false,
        error: "d1_freeze_unavailable",
        message: "freeze wiring is not installed in this process"
      });
      return;
    }
    let authority = null;
    let authorityError = null;
    try {
      authority = coordinator.currentAuthority();
    } catch (error) {
      authorityError = error?.code || "authority_unreadable";
    }
    res.json({
      schemaVersion: D1_FREEZE_EXECUTION_SCHEMA_VERSION,
      wiringInstalled: true,
      snapshotId: coordinator.snapshotId,
      schedulerWiring: coordinator.schedulerWiring(),
      authority,
      authorityError,
      checkpointIdDefault: deriveFreezeCheckpointId(coordinator.snapshotId)
    });
  });

  router.post(PATH, requireAdminCapability("operations.read"), async (req, res) => {
    res.set("Cache-Control", "no-store");
    const coordinator = state.platform?.d1FreezeCoordinator;
    const wiring = state.platform?.d1FreezeWiring;
    if (!coordinator || !wiring) {
      res.status(503).json({
        error: "d1_freeze_unavailable",
        message: "freeze wiring is not installed in this process"
      });
      return;
    }
    const validationError = validateBody(req.body);
    if (validationError) {
      res.status(400).json({ error: "validation_error", message: validationError });
      return;
    }
    const input = req.body && typeof req.body === "object" ? req.body : {};
    try {
      let effectiveCoordinator = coordinator;
      if (input.snapshotId && input.snapshotId !== coordinator.snapshotId) {
        effectiveCoordinator = createFreezeDrainCoordinator(wiring.db, {
          snapshotId: input.snapshotId,
          scheduler: wiring.scheduler
        });
      }
      const executor = createD1FreezeExecutor({
        db: wiring.db,
        coordinator: effectiveCoordinator,
        deferredSnapshot: wiring.deferredSnapshot ?? null,
        trafficAccounting: wiring.trafficAccounting ?? null,
        coinCommerceStore: wiring.coinCommerceStore ?? null,
        dbPath: wiring.dbPath ?? null,
        schedulerEnabled: wiring.schedulerEnabled ?? {},
        rotationCreation: wiring.rotationCreation ?? null,
        ...(state.platform.d1FreezeExecutorOptions ?? {})
      });
      const result = await executor.executeFreeze({
        snapshotId: input.snapshotId,
        checkpointId: input.checkpointId,
        outstandingJobs: input.outstandingJobs,
        t0ChecklistLine: input.t0ChecklistLine
      });
      res.json(result);
    } catch (error) {
      sendFreezeError(res, error);
    }
  });

  return router;
}
