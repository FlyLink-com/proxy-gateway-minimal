// G4 Agent HTTPS contract — BWH Agent polling core
// (AGT-POLL-3..6, AGT-DATA-1..2, AGT-MFT-2).
//
// One runOnce() is one oneshot poll cycle (AGT-POLL-1: the process is
// started by a systemd timer, does one cycle, and exits — there is no
// daemon and no internal scheduling loop in this module).
//
// Posture is inherited from the current contract and never widened by
// failure (AGT-POLL-6): dryRun defaults to true, applyEnabled defaults
// to false, and transport failures change nothing — the cycle reports
// retry_later and the next timer tick retries with the same scope.
//
// Data boundary (AGT-DATA-1): the desired-state payload may contain
// only a signed manifest plus material references and SHA-256
// digests. If anything else arrives (a material-bearing field), the
// cycle refuses before verification or apply. Materials are resolved
// locally from the protected store by reference and their digests
// must match the manifest before apply (AGT-DATA-2).

import { createHash, randomUUID } from "node:crypto";
import { mkdir, open, readFile, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { desiredStateDigest } from "./manifest.mjs";
import { buildChannelReceipt } from "./receipt.mjs";

export class AgentContractError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "AgentContractError";
    this.code = code;
  }
}

// --- single-instance locks (AGT-POLL-3) -------------------------------

export function createMemoryLock() {
  let held = false;
  return {
    async acquire() {
      if (held) return null;
      held = true;
      return {
        async release() {
          held = false;
        },
      };
    },
  };
}

// A stale timestamp alone is not proof that an owner died: an apply may
// legitimately run longer than staleMs. Treat EPERM as alive and fail
// closed when process liveness cannot be disproved.
function isProcessAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error.code === "EPERM";
  }
}

// Lock file with pid, timestamp and an ownership token. A stale lock is
// reclaimable only when its owner process is gone. A sibling reaper
// directory serializes reclaimers; if a reaper itself is interrupted,
// acquisition fails closed until an operator inspects the stale reaper.
export function createFileLock(path, { staleMs = 120_000, now = () => Date.now() } = {}) {
  const reaperPath = `${path}.reaper`;
  const staleAndOwnerGone = (info) =>
    Number.isInteger(info?.pid)
    && info.pid > 0
    && typeof info.at === "number"
    && now() - info.at > staleMs
    && !isProcessAlive(info.pid);

  async function createOwnedLock() {
    const token = randomUUID();
    const handle = await open(path, "wx");
    try {
      await handle.writeFile(JSON.stringify({ pid: process.pid, at: now(), token }));
    } finally {
      await handle.close();
    }
    return {
      async release() {
        let current;
        try {
          current = JSON.parse(await readFile(path, "utf8"));
        } catch {
          return;
        }
        if (current.token === token) {
          await rm(path, { force: true });
        }
      },
    };
  }

  return {
    async acquire() {
      for (let attempt = 0; attempt < 2; attempt += 1) {
        try {
          return await createOwnedLock();
        } catch (error) {
          if (error.code !== "EEXIST") throw error;
        }

        let observed;
        try {
          observed = JSON.parse(await readFile(path, "utf8"));
        } catch {
          return null;
        }
        if (!staleAndOwnerGone(observed)) return null;

        try {
          await mkdir(reaperPath);
        } catch (error) {
          if (error.code === "EEXIST") return null;
          throw error;
        }

        let reclaimed = false;
        try {
          let current;
          try {
            current = JSON.parse(await readFile(path, "utf8"));
          } catch (error) {
            if (error.code === "ENOENT") {
              reclaimed = true;
            } else {
              return null;
            }
          }
          if (!reclaimed) {
            const sameOwner =
              current.token === observed.token
              && current.pid === observed.pid
              && current.at === observed.at;
            if (!sameOwner || !staleAndOwnerGone(current)) return null;
            await rm(path, { force: true });
            reclaimed = true;
          }
        } finally {
          await rm(reaperPath, { recursive: true, force: true });
        }
        if (!reclaimed) return null;
      }
      return null;
    },
  };
}

// --- applied-state stores ----------------------------------------------

export function createMemoryStateStore(initial = null) {
  let state = initial;
  return {
    async load() {
      return state ? { ...state } : null;
    },
    async save(next) {
      state = { ...next };
    },
  };
}

export function createJsonStateStore(path) {
  return {
    async load() {
      try {
        return JSON.parse(await readFile(path, "utf8"));
      } catch {
        return null;
      }
    },
    async save(next) {
      const tmp = `${path}.tmp`;
      await writeFile(tmp, JSON.stringify(next, null, 2));
      await rename(tmp, path);
    },
  };
}

// --- local material resolution (AGT-DATA-2) -----------------------------

const SAFE_REF_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]*$/;

export function createFileMaterialStore(rootDir) {
  return {
    async resolve(edgeCredentialRef) {
      if (!SAFE_REF_PATTERN.test(edgeCredentialRef) || edgeCredentialRef.includes("..")) {
        throw new AgentContractError(
          "material_ref_invalid",
          `refusing to resolve unsafe material ref: ${edgeCredentialRef}`,
        );
      }
      return readFile(join(rootDir, edgeCredentialRef));
    },
  };
}

// --- payload boundary (AGT-DATA-1) ---------------------------------------

const MATERIAL_ENTRY_KEYS = new Set(["channelRef", "edgeCredentialRef", "digest"]);

export function assertRefsOnlyMaterials(materials) {
  if (!Array.isArray(materials) || materials.length === 0) {
    throw new AgentContractError(
      "data_boundary_violation",
      "desired-state payload must carry a non-empty materials list",
    );
  }
  for (const entry of materials) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      throw new AgentContractError("data_boundary_violation", "material entry must be an object");
    }
    for (const key of Object.keys(entry)) {
      if (!MATERIAL_ENTRY_KEYS.has(key)) {
        throw new AgentContractError(
          "data_boundary_violation",
          `desired-state material entry carries forbidden field: ${key}`,
        );
      }
    }
    if (typeof entry.digest !== "string" || !/^[0-9a-f]{64}$/.test(entry.digest)) {
      throw new AgentContractError(
        "data_boundary_violation",
        "material entry digest must be a SHA-256 hex digest",
      );
    }
  }
}

// --- the poll cycle -------------------------------------------------------

// transport: {
//   fetchDesiredState({ nodeRef, channelRefs, headers }) ->
//     { manifest, signature, materials: [{channelRef, edgeCredentialRef, digest}] }
//   submitReceipt(receipt, { headers }) -> void (throws on failure)
// }
// apply({ manifest, materials: [{...entry, bytes}] }) -> detail object
//   The real node-side apply (config writers) is an existing system and
//   out of scope for this slice; callers inject it.
export function createAgentClient({
  nodeRef,
  channelRefs,
  transport,
  materialStore,
  verifier,
  stateStore,
  lock,
  apply,
  auth = null,
  config = {},
  now = () => new Date(),
}) {
  const dryRun = config.dryRun !== false;
  const applyEnabled = config.applyEnabled === true;

  function buildHeaders() {
    if (!auth) return {};
    return {
      authorization: `Bearer ${auth.token}`,
      "x-agent-key-id": auth.keyId,
      "x-agent-node-ref": nodeRef,
      "x-agent-timestamp": now().toISOString(),
      "x-agent-nonce": randomUUID(),
    };
  }

  async function runOnce() {
    const handle = await lock.acquire();
    if (!handle) {
      return { status: "skipped_locked" };
    }
    try {
      let desired;
      try {
        desired = await transport.fetchDesiredState({
          nodeRef,
          channelRefs,
          headers: buildHeaders(),
        });
      } catch (error) {
        return { status: "retry_later", stage: "fetch", error: String(error?.message ?? error) };
      }

      try {
        assertRefsOnlyMaterials(desired?.materials);
      } catch (error) {
        return { status: "rejected", stage: "data_boundary", code: error.code ?? "data_boundary_violation" };
      }

      let manifest;
      try {
        manifest = verifier.verify(desired.manifest, desired.signature, {
          expectedNodeRef: nodeRef,
          expectedChannelRefs: channelRefs,
        });
      } catch (error) {
        return { status: "rejected", stage: "manifest", code: error.code ?? "manifest_invalid" };
      }

      const computedDigest = desiredStateDigest({
        nodeRef: manifest.nodeRef,
        channelRefs: manifest.channelRefs,
        generation: manifest.generation,
        desiredStateRef: manifest.desiredStateRef,
        materials: desired.materials,
      });
      if (computedDigest !== manifest.desiredStateDigest) {
        return { status: "rejected", stage: "digest", code: "digest_mismatch" };
      }

      let state = await stateStore.load();
      let receiptsRecovered = 0;
      if (Array.isArray(state?.pendingReceipts) && state.pendingReceipts.length > 0) {
        receiptsRecovered = state.pendingReceipts.length;
        try {
          for (const receipt of state.pendingReceipts) {
            await transport.submitReceipt(receipt, { headers: buildHeaders() });
          }
        } catch (error) {
          return {
            status: "retry_later",
            stage: "receipt",
            error: String(error?.message ?? error),
          };
        }
        state = { ...state, pendingReceipts: [] };
        try {
          await stateStore.save(state);
        } catch (error) {
          return {
            status: "retry_later",
            stage: "state",
            error: String(error?.message ?? error),
          };
        }
      }
      if (
        state
        && state.generation === manifest.generation
        && state.desiredStateDigest === manifest.desiredStateDigest
      ) {
        return {
          status: "unchanged",
          generation: manifest.generation,
          receiptsRecovered,
        };
      }

      const resolved = [];
      for (const entry of desired.materials) {
        let bytes;
        try {
          bytes = await materialStore.resolve(entry.edgeCredentialRef);
        } catch (error) {
          return {
            status: "rejected",
            stage: "material_resolve",
            code: error.code ?? "material_resolve_failed",
            channelRef: entry.channelRef,
          };
        }
        const digest = createHash("sha256").update(bytes).digest("hex");
        if (digest !== entry.digest) {
          return { status: "rejected", stage: "material_digest", channelRef: entry.channelRef };
        }
        resolved.push({ ...entry, bytes });
      }

      const effectiveDryRun = dryRun || !applyEnabled;
      const receiptStatus = effectiveDryRun ? "dry_run" : "applied";
      const receipts = manifest.channelRefs.map((channelRef) =>
        buildChannelReceipt({
          nodeRef,
          channelRef,
          generation: manifest.generation,
          desiredStateRef: manifest.desiredStateRef,
          materialDigests: desired.materials.filter((m) => m.channelRef === channelRef),
          idempotencyKey: `receipt:${manifest.desiredStateRef}:${manifest.generation}:${channelRef}`,
          status: receiptStatus,
          detail: { mode: effectiveDryRun ? "dry_run" : "apply" },
        }),
      );

      if (effectiveDryRun) {
        return { status: "dry_run", generation: manifest.generation, receipts };
      }

      await apply({ manifest, materials: resolved });

      const appliedState = {
        generation: manifest.generation,
        desiredStateDigest: manifest.desiredStateDigest,
        desiredStateRef: manifest.desiredStateRef,
        pendingReceipts: receipts,
      };
      try {
        // Persist the completed generation and redacted receipt intent
        // before network acknowledgement. A retry can replay receipts
        // without applying the same generation a second time.
        await stateStore.save(appliedState);
      } catch (error) {
        return { status: "retry_later", stage: "state", error: String(error?.message ?? error) };
      }

      try {
        for (const receipt of receipts) {
          await transport.submitReceipt(receipt, { headers: buildHeaders() });
        }
      } catch (error) {
        return { status: "retry_later", stage: "receipt", error: String(error?.message ?? error) };
      }

      try {
        await stateStore.save({ ...appliedState, pendingReceipts: [] });
      } catch (error) {
        // A later cycle may replay accepted receipts; their deterministic
        // idempotency keys make that replay safe.
        return { status: "retry_later", stage: "state", error: String(error?.message ?? error) };
      }
      return { status: "applied", generation: manifest.generation, receipts };
    } finally {
      await handle.release();
    }
  }

  return { runOnce };
}
