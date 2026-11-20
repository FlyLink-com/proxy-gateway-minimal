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
import { canonicalJson, desiredStateDigest } from "./manifest.mjs";
import { buildChannelReceipt, buildReceiptIdempotencyKey } from "./receipt.mjs";

export class AgentContractError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "AgentContractError";
    this.code = code;
  }
}

// D1 Stage 1B writer-epoch forwarding (handoff docs/D1_STAGE1B_AGENT_
// EPOCH_MUSE_HANDOFF_V1.md). x-writer-epoch is a decimal ASCII integer
// in 1..2147483647 with no leading zeroes. It is NOT authentication:
// the scoped bearer token, nonce, timestamp, key ID, nodeRef and
// idempotency rules remain necessary. The epoch only ever comes from a
// durable coordinator receipt via epochProvider; it is never generated,
// defaulted, or guessed by this client. Forwarding is OFF by default:
// production transport stays disabled until an approved staged handover
// explicitly enables it.
const WRITER_EPOCH_PATTERN = /^(0|[1-9][0-9]*)$/;
const WRITER_EPOCH_MAX = 2147483647;

// Writer error codes the client preserves on a retry_later. Four are
// returned by the Worker (Stage 1A/1B): writer_epoch_required,
// writer_epoch_stale, writer_authority_not_d1,
// writer_authority_unavailable. The fifth, writer_epoch_invalid, is
// client-side only: this client raises it when the coordinator-issued
// epoch is malformed, and the Worker never returns it. A transport
// failure carrying one of these codes must surface as retry_later with
// the code preserved: the client never falls back to a local write and
// never retries with a different epoch.
export const WRITER_ERROR_CODES = new Set([
  "writer_epoch_required",
  "writer_epoch_invalid",
  "writer_epoch_stale",
  "writer_authority_not_d1",
  "writer_authority_unavailable",
]);

export function isValidWriterEpoch(value) {
  if (typeof value !== "string" || !WRITER_EPOCH_PATTERN.test(value)) return false;
  const epoch = Number(value);
  return Number.isSafeInteger(epoch) && epoch >= 1 && epoch <= WRITER_EPOCH_MAX;
}

export function writerErrorCode(error) {
  const code = error?.code;
  return typeof code === "string" && WRITER_ERROR_CODES.has(code) ? code : null;
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
  // D1 Stage 1B: epochProvider supplies the coordinator-issued epoch
  // (durable coordinator receipt) as a decimal ASCII string; it is
  // consulted only when writerEpochForwarding is true. Both default to
  // off: without an approved staged handover the client sends no
  // x-writer-epoch header and behaves exactly as before.
  epochProvider = null,
  writerEpochForwarding = false,
}) {
  const dryRun = config.dryRun !== false;
  const applyEnabled = config.applyEnabled === true;

  // Read and normalize the current coordinator epoch. Throws
  // AgentContractError (writer_epoch_required / writer_epoch_invalid)
  // when forwarding is enabled but no valid coordinator epoch is
  // available: fail closed, never send a guessed or default epoch.
  function coordinatorWriterEpoch() {
    if (typeof epochProvider !== "function") {
      throw new AgentContractError(
        "writer_epoch_required",
        "writer epoch forwarding requires a coordinator epoch provider",
      );
    }
    const epoch = epochProvider();
    if (epoch === null || epoch === undefined) {
      throw new AgentContractError(
        "writer_epoch_required",
        "no coordinator-issued writer epoch is available",
      );
    }
    // The coordinator receipt carries the epoch as a number; the wire
    // header is always its decimal ASCII string. Normalize here so a
    // numeric receipt epoch is accepted; isValidWriterEpoch still
    // enforces the wire format (string, 1..2147483647, no leading
    // zeroes), so 0, fractions, and out-of-range numbers stay invalid.
    const epochText = typeof epoch === "number" ? String(epoch) : epoch;
    if (!isValidWriterEpoch(epochText)) {
      throw new AgentContractError(
        "writer_epoch_invalid",
        "coordinator-issued writer epoch is malformed",
      );
    }
    return epochText;
  }

  function buildHeaders(writerEpoch) {
    const headers = {};
    if (auth) {
      headers.authorization = `Bearer ${auth.token}`;
      headers["x-agent-key-id"] = auth.keyId;
      headers["x-agent-node-ref"] = nodeRef;
      headers["x-agent-timestamp"] = now().toISOString();
      headers["x-agent-nonce"] = randomUUID();
    }
    if (writerEpochForwarding) {
      if (writerEpoch === undefined || writerEpoch === null) {
        throw new AgentContractError(
          "writer_epoch_required",
          "pending operation has no recorded writer epoch",
        );
      }
      if (!isValidWriterEpoch(writerEpoch)) {
        throw new AgentContractError("writer_epoch_invalid", "recorded writer epoch is malformed");
      }
      if (writerEpoch !== coordinatorWriterEpoch()) {
        throw new AgentContractError("writer_epoch_stale", "recorded writer epoch is no longer current");
      }
      headers["x-writer-epoch"] = writerEpoch;
    }
    return headers;
  }

  async function runOnce() {
    const handle = await lock.acquire();
    if (!handle) {
      return { status: "skipped_locked" };
    }
    try {
      let state = await stateStore.load();
      if (!state || typeof state !== "object" || Array.isArray(state)) state = {};

      let receiptsRecovered = 0;
      let receiptsDeferred = 0;
      const pendingReceipts = state.pendingReceipts ?? [];
      const previouslyDeferredReceipts = state.deferredReceipts ?? [];
      if (!Array.isArray(pendingReceipts) || !Array.isArray(previouslyDeferredReceipts)) {
        return { status: "rejected", stage: "receipt_state", code: "receipt_state_invalid" };
      }
      const receiptsToRecover = [];
      const receiptsToDefer = [];
      for (const receipt of [...pendingReceipts, ...previouslyDeferredReceipts]) {
        if (
          !receipt
          || typeof receipt !== "object"
          || Array.isArray(receipt)
          || typeof receipt.channelRef !== "string"
          || receipt.channelRef.length === 0
        ) {
          return { status: "rejected", stage: "receipt_state", code: "receipt_scope_unverifiable" };
        }
        if (channelRefs.includes(receipt.channelRef)) receiptsToRecover.push(receipt);
        else receiptsToDefer.push(receipt);
      }
      receiptsRecovered = receiptsToRecover.length;
      receiptsDeferred = receiptsToDefer.length;
      if (pendingReceipts.length > 0 || previouslyDeferredReceipts.length > 0) {
        state = {
          ...state,
          pendingReceipts: receiptsToRecover,
          deferredReceipts: receiptsToDefer,
        };
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
      if (receiptsToRecover.length > 0) {
        try {
          for (const { writerEpoch, ...receipt } of receiptsToRecover) {
            await transport.submitReceipt(receipt, { headers: buildHeaders(writerEpoch) });
          }
        } catch (error) {
          // A writer-epoch/authority rejection keeps the receipts
          // pending for the next cycle: never drop them, never retry
          // with a different epoch, never fall back to a local write.
          const code = writerErrorCode(error);
          return {
            status: "retry_later",
            stage: "receipt",
            ...(code ? { code } : {}),
            error: String(error?.message ?? error),
          };
        }
        state = {
          ...state,
          pendingReceipts: [],
          deferredReceipts: receiptsToDefer,
        };
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

      const claimKeyPattern = /^claim:[A-Za-z0-9][A-Za-z0-9._:-]{0,127}:[A-Za-z0-9_-]{16,128}$/;
      const claimScopeFingerprint = canonicalJson({
        nodeRef,
        channelRefs: [...channelRefs].sort(),
      });
      let claimIdempotencyKey = state.pendingClaim?.idempotencyKey;
      let claimEpoch = state.pendingClaim?.writerEpoch;
      let desired;
      try {
        if (
          typeof claimIdempotencyKey !== "string"
          || !claimKeyPattern.test(claimIdempotencyKey)
          || state.pendingClaim?.scopeFingerprint !== claimScopeFingerprint
        ) {
          claimEpoch = writerEpochForwarding ? coordinatorWriterEpoch() : undefined;
          claimIdempotencyKey = "claim:" + nodeRef + ":" + randomUUID();
          state = {
            ...state,
            pendingClaim: {
              idempotencyKey: claimIdempotencyKey,
              scopeFingerprint: claimScopeFingerprint,
              ...(writerEpochForwarding ? { writerEpoch: claimEpoch } : {}),
            },
          };
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
        desired = await transport.fetchDesiredState({
          nodeRef,
          channelRefs,
          headers: buildHeaders(claimEpoch),
          idempotencyKey: claimIdempotencyKey,
        });
      } catch (error) {
        // Keep the persisted claim key and epoch after authority errors.
        // A later cycle may replay them only if the coordinator agrees.
        const writerCode = writerErrorCode(error);
        if (writerCode) {
          return {
            status: "retry_later",
            stage: "fetch",
            code: writerCode,
            error: String(error?.message ?? error),
          };
        }
        if (error?.code === "claim_expired" || error?.statusCode === 410) {
          state = { ...state, pendingClaim: null };
          try {
            await stateStore.save(state);
          } catch (saveError) {
            return {
              status: "retry_later",
              stage: "state",
              error: String(saveError?.message ?? saveError),
            };
          }
          return {
            status: "retry_later",
            stage: "claim",
            code: "claim_expired",
            error: String(error?.message ?? error),
          };
        }
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

      state = { ...state, pendingClaim: null };
      try {
        await stateStore.save(state);
      } catch (error) {
        return { status: "retry_later", stage: "state", error: String(error?.message ?? error) };
      }

      if (
        state.generation === manifest.generation
        && state.desiredStateDigest === manifest.desiredStateDigest
      ) {
        return {
          status: "unchanged",
          generation: manifest.generation,
          receiptsRecovered,
          receiptsDeferred,
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
          idempotencyKey: buildReceiptIdempotencyKey({
            desiredStateRef: manifest.desiredStateRef,
            generation: manifest.generation,
            channelRef,
          }),
          status: receiptStatus,
          detail: { mode: effectiveDryRun ? "dry_run" : "apply" },
        }),
      );

      if (effectiveDryRun) {
        return { status: "dry_run", generation: manifest.generation, receipts, receiptsDeferred };
      }

      await apply({ manifest, materials: resolved });

      const appliedState = {
        generation: manifest.generation,
        desiredStateDigest: manifest.desiredStateDigest,
        desiredStateRef: manifest.desiredStateRef,
        pendingClaim: null,
        // The epoch belongs to the durable queue entry, not the wire receipt.
        // Every receipt for a claim keeps the epoch used to obtain that claim.
        pendingReceipts: writerEpochForwarding
          ? receipts.map((receipt) => ({ ...receipt, writerEpoch: claimEpoch }))
          : receipts,
        deferredReceipts: Array.isArray(state.deferredReceipts) ? state.deferredReceipts : [],
      };
      try {
        await stateStore.save(appliedState);
      } catch (error) {
        return { status: "retry_later", stage: "state", error: String(error?.message ?? error) };
      }

      try {
        for (const receipt of receipts) {
          await transport.submitReceipt(receipt, { headers: buildHeaders(claimEpoch) });
        }
      } catch (error) {
        // Receipts stay pending in appliedState: the next cycle
        // resubmits them with the same idempotency keys. A writer
        // rejection is reported with its stable code, not swallowed.
        const code = writerErrorCode(error);
        return {
          status: "retry_later",
          stage: "receipt",
          ...(code ? { code } : {}),
          error: String(error?.message ?? error),
        };
      }

      try {
        await stateStore.save({ ...appliedState, pendingReceipts: [] });
      } catch (error) {
        return { status: "retry_later", stage: "state", error: String(error?.message ?? error) };
      }
      return { status: "applied", generation: manifest.generation, receipts, receiptsRecovered, receiptsDeferred };
    } finally {
      await handle.release();
    }
  }
  return { runOnce };
}
