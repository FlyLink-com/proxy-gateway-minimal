// G4 Agent HTTPS contract — communication credential rotation
// (AGT-ROT-1..5, G1-30 ruling 2).
//
// Scope guard (AGT-ROT-5): this state machine exists ONLY for the
// BWH Agent <-> control-plane communication credential. It refuses
// any other scope at construction time; it must never be applied to
// node-agent credentials, VPN node identities, or user identities.
//
// Rules implemented:
// - Dual-key overlap: during rotation the old and new keys are both
//   valid; the overlap window is at most 15 minutes from the moment
//   the new key is activated (ROT-1).
// - The old key may be revoked (rotation path) only after the new key
//   has completed one recorded successful authentication (ROT-2).
// - The overlap window can never be extended: this module exposes no
//   extension operation at all. If the window expires before the new
//   key is acknowledged, the candidate is revoked, the current key is
//   retained, and an exception blocks further automatic rotation (ROT-3).
// - Leak exception: a key may be revoked immediately on a confirmed
//   leak, without the ROT-2 precondition, and the revocation is
//   audit-logged (ROT-4).

export const MAX_OVERLAP_MS = 15 * 60 * 1000;
export const ROTATION_SCOPE = "bwh-agent-control-plane-communications";

export class RotationError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "RotationError";
    this.code = code;
  }
}

export function createKeyRotation({ initialKeyId, scope, now = () => Date.now() }) {
  if (scope !== ROTATION_SCOPE) {
    throw new RotationError(
      "scope_violation",
      "key rotation applies only to BWH Agent <-> control-plane communication credentials",
    );
  }
  if (typeof initialKeyId !== "string" || initialKeyId.length === 0) {
    throw new RotationError("validation_error", "initialKeyId is required");
  }

  let currentKeyId = initialKeyId;
  let overlap = null; // { nextKeyId, startedAt, expiresAt }
  let exception = null; // { type, at, detail }
  const successfulAuthAt = new Map(); // keyId -> epoch ms
  const revoked = new Set();
  const audit = [];
  const log = (type, detail) => audit.push({ type, at: now(), ...detail });

  function settleExpiredOverlap(at) {
    if (overlap && at >= overlap.expiresAt) {
      const expired = overlap;
      overlap = null;
      revoked.add(expired.nextKeyId);
      exception = {
        type: "overlap_expired",
        at,
        detail: `overlap for ${expired.nextKeyId} expired before acknowledgement; current key ${currentKeyId} retained`,
      };
      log("overlap_expired", { nextKeyId: expired.nextKeyId, currentKeyId });
    }
  }

  return {
    beginRotation(nextKeyId) {
      const at = now();
      settleExpiredOverlap(at);
      if (exception) {
        throw new RotationError("rotation_exception_active", "manual ruling is required before another rotation");
      }
      if (overlap) {
        throw new RotationError("rotation_in_progress", "a rotation overlap is already active");
      }
      if (typeof nextKeyId !== "string" || nextKeyId.length === 0 || nextKeyId === currentKeyId) {
        throw new RotationError("validation_error", "nextKeyId must differ from the current key");
      }
      if (revoked.has(nextKeyId)) {
        throw new RotationError("validation_error", "nextKeyId was previously revoked");
      }
      overlap = { nextKeyId, startedAt: at, expiresAt: at + MAX_OVERLAP_MS };
      log("rotation_started", { oldKeyId: currentKeyId, nextKeyId });
      return { ...overlap };
    },

    recordSuccessfulAuth(keyId) {
      const at = now();
      settleExpiredOverlap(at);
      const known = keyId === currentKeyId || (overlap && keyId === overlap.nextKeyId);
      if (!known || revoked.has(keyId)) {
        throw new RotationError("unknown_key", `key ${keyId} is not an active communication key`);
      }
      successfulAuthAt.set(keyId, at);
      log("auth_success", { keyId });
    },

    isKeyValid(keyId, at = now()) {
      settleExpiredOverlap(at);
      if (revoked.has(keyId)) return false;
      if (keyId === currentKeyId) return true;
      if (overlap && keyId === overlap.nextKeyId && at < overlap.expiresAt) return true;
      return false;
    },

    revokeKey(keyId, { reason } = {}) {
      const at = now();
      settleExpiredOverlap(at);
      if (reason === "leak") {
        revoked.add(keyId);
        log("revoked_leak", { keyId });
        if (overlap && keyId === overlap.nextKeyId) {
          overlap = null;
          log("rotation_aborted_leak", { keyId });
        }
        if (keyId === currentKeyId) {
          if (overlap) {
            currentKeyId = overlap.nextKeyId;
            overlap = null;
            log("promoted_after_leak", { keyId: currentKeyId });
          } else {
            currentKeyId = null;
            exception = { type: "no_valid_key", at, detail: "current key revoked for leak with no successor" };
          }
        }
        return;
      }
      if (reason !== "rotation") {
        throw new RotationError("validation_error", "revoke reason must be 'rotation' or 'leak'");
      }
      // Rotation-path revocation of the old key (ROT-2): the successor
      // must exist and must already have a recorded successful auth.
      if (!overlap) {
        throw new RotationError("no_rotation_in_progress", "no active rotation is in progress");
      }
      const successor = overlap.nextKeyId;
      if (!successor || !successfulAuthAt.has(successor)) {
        throw new RotationError(
          "revoke_precondition_unmet",
          "the new key must complete a recorded successful authentication before the old key is revoked",
        );
      }
      if (keyId !== currentKeyId) {
        throw new RotationError("validation_error", "rotation revocation targets the outgoing current key");
      }
      revoked.add(keyId);
      currentKeyId = successor;
      overlap = null;
      exception = null;
      log("revoked_rotation", { keyId, promotedKeyId: successor });
    },

    status() {
      settleExpiredOverlap(now());
      return {
        currentKeyId,
        overlap: overlap ? { ...overlap } : null,
        exception: exception ? { ...exception } : null,
        revokedKeyIds: [...revoked],
      };
    },

    auditLog() {
      return audit.map((entry) => ({ ...entry }));
    },
  };
}
