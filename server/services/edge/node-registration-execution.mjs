import { createHash } from "node:crypto";
import {
  assertRegistrationExecutionEnabled,
  buildEdgeNodeRegistrationRecordFromFirstBootPacket,
  normalizeRegistrationAnchorFingerprint,
  registrationBindingOf,
  registrationBindingsEqual
} from "./node-registration-ingestion.mjs";

// Programmatic registration execution entry for an approved Risk A execution.
// The gccgw CLI remains dry-run-only; this module is the caller a gated
// execution uses to persist a registration and obtain its receipt.
//
// Execution is disabled by default: the shared gate in the ingestion
// service refuses unless EDGE_NODE_REGISTRATION_EXECUTION_ENABLED is
// exactly the string "true" in the provided environment, and the same
// gate guards the ingestion service's own write entry, so no
// registration write path in this layer is ungated. The flag is a second
// line of defense only; it is not an authorization, and enabling it in
// production still requires its own Risk A approval.
//
// Registration writes are insert-only on every entry in this layer: the
// executor never upserts, and neither does the ingestion service's write
// function; both compare against the shared eleven-field identity
// binding from the ingestion service. A new node is recorded through the
// store's insert-if-absent primitive (one atomic statement: the row
// lands, or an existing row is left completely untouched), so two
// concurrent executions for the same node cannot overwrite each other —
// whichever insert loses the race reads back the winning record and
// either matches it (already-registered) or conflicts. The store's own
// record methods are ungated persistence primitives; the execution gate
// and the no-overwrite rule are enforced at this service layer, and any
// future registration caller must come through it.
//
// The receipt produced here is node-registration evidence only. It is not an
// agent apply receipt and does not evidence subscription rendering. The
// identity anchors (WireGuard public key fingerprint, agent token
// fingerprint) and the wireguard plan ref are persisted in the registration
// record metadata. The agent token anchor is named agentAuthFingerprint in
// code and storage because the subscription control store rejects any input
// field whose name contains "token" (its unsafe-field rule); the value is
// the sha256 fingerprint of the agent token, never the token itself. The
// anchors and the plan ref are part of the idempotency binding: a replay
// whose plan or anchors differ from the stored record is a conflict, never a
// silent re-binding. Key or plan rotation therefore requires a separate
// supersede/retirement flow, not this executor. Equality of the anchors
// with the live WireGuard peer and the NODES_JSON authorization entry is
// verified by the production three-way consistency check, not by this
// module. The receipt is derived from the persisted, read-back record, so
// what the receipt states is what the store actually holds.

function registrationExecutionError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function text(value) {
  return String(value ?? "").trim();
}

// The executor always requires both identity anchors (anchor-less first
// registrations are a legacy-compat path of the ingestion function only).
// Format validation itself is the shared one in the ingestion service.
function requiredAnchorFingerprint(value, field) {
  const normalized = normalizeRegistrationAnchorFingerprint(value, field);
  if (!normalized) {
    throw registrationExecutionError(
      "validation_error",
      `${field} must be a sha256 fingerprint`
    );
  }
  return normalized;
}

function sortedRefs(values) {
  return [...(Array.isArray(values) ? values : [])].sort();
}

function recordDigest(payload) {
  return createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}

export function executeEdgeNodeRegistration({
  controlStore,
  firstBootPacket,
  registration = {},
  env = process.env
} = {}) {
  assertRegistrationExecutionEnabled(env);

  if (
    !controlStore ||
    typeof controlStore.insertEdgeRegisteredNodeIfAbsent !== "function" ||
    typeof controlStore.getEdgeRegisteredNode !== "function"
  ) {
    throw registrationExecutionError(
      "validation_error",
      "controlStore with insertEdgeRegisteredNodeIfAbsent and getEdgeRegisteredNode is required"
    );
  }

  const wireguardPublicKeyFingerprint = requiredAnchorFingerprint(
    registration.wireguardPublicKeyFingerprint,
    "registration.wireguardPublicKeyFingerprint"
  );
  const agentAuthFingerprint = requiredAnchorFingerprint(
    registration.agentAuthFingerprint,
    "registration.agentAuthFingerprint"
  );

  const buildOptions = {
    firstBootPacketRef: registration.firstBootPacketRef,
    registeredAt: registration.registeredAt,
    wireguardPublicKeyFingerprint,
    agentAuthFingerprint
  };
  const candidate = buildEdgeNodeRegistrationRecordFromFirstBootPacket(
    firstBootPacket,
    buildOptions
  );

  const existing = controlStore.getEdgeRegisteredNode(candidate.nodeRef);
  let outcome;
  let stored;
  if (existing) {
    if (!registrationBindingsEqual(existing, candidate)) {
      throw registrationExecutionError(
        "registration_conflict",
        "node is already registered with a different binding"
      );
    }
    outcome = "already-registered";
    stored = existing;
  } else {
    const attempt = controlStore.insertEdgeRegisteredNodeIfAbsent(candidate);
    stored = attempt?.record ?? null;
    if (!stored) {
      throw registrationExecutionError(
        "verification_failed",
        "registration record could not be read back after the insert attempt"
      );
    }
    if (!registrationBindingsEqual(stored, candidate)) {
      if (attempt.inserted) {
        throw registrationExecutionError(
          "verification_failed",
          "stored registration does not match the executed binding"
        );
      }
      throw registrationExecutionError(
        "registration_conflict",
        "a different registration for this node was recorded concurrently"
      );
    }
    outcome = attempt.inserted ? "registered" : "already-registered";
  }

  // The receipt is derived from the persisted, read-back record only, so a
  // receipt can never state a binding the store does not actually hold.
  const binding = registrationBindingOf(stored);
  const receipt = {
    receiptKind: "node-registration",
    receiptRef: `node-registration:${stored.nodeRef}`,
    outcome,
    nodeRef: stored.nodeRef,
    channelRefs: sortedRefs(stored.channelRefs),
    firstBootPacketRef: stored.firstBootPacketRef,
    imageManifestRef: stored.imageManifestRef,
    releaseRef: stored.releaseRef,
    wireguardPlanRef: binding.wireguardPlanRef,
    anchors: {
      wireguardPublicKeyFingerprint: binding.wireguardPublicKeyFingerprint,
      agentAuthFingerprint: binding.agentAuthFingerprint
    },
    registeredAt: stored.registeredAt,
    recordDigest: recordDigest(binding),
    receiptGateRequired: stored.metadata?.receiptGateRequired === true,
    // executedAt is generated by the executor itself at execution time;
    // caller-supplied values are never accepted, so the receipt's time
    // evidence cannot be filled in arbitrarily. It is not read back from
    // the persisted record and is not covered by recordDigest.
    executedAt: new Date().toISOString()
  };

  return {
    ok: true,
    outcome,
    receipt,
    record: stored
  };
}
