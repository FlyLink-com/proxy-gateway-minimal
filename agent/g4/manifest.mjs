// G4 Agent HTTPS contract — signed desired-state manifest (AGT-MFT-1/2).
//
// The control plane no longer ships credential material to the Agent.
// It ships a signed manifest that binds, at minimum (G1-30 ruling 4):
// node, channel set, generation, desired-state digest, validity
// window, anti-replay id, and signing key id. The Agent verifies the
// manifest locally on BWH and fails closed on any of: bad signature,
// expired / not-yet-valid window, replayed anti-replay id, unknown
// key id, or binding mismatch against its own node/channel identity.
//
// Signing uses Ed25519 from Node's standard crypto module. This module
// deliberately imports nothing from the E4-A work: AGT-MFT-3 permits
// reuse of generic canonicalization/hash utilities only after an
// exact-source audit, and forbids E4-A keys and security semantics.
// The canonical-JSON helper below is written fresh for this contract.

import { createHash, sign as cryptoSign, verify as cryptoVerify } from "node:crypto";

export class ManifestError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "ManifestError";
    this.code = code;
  }
}

// Deterministic JSON: object keys sorted recursively, arrays kept in
// order (callers sort order-insensitive arrays such as channelRefs
// before hashing/signing).
export function canonicalJson(value) {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalJson(item)).join(",")}]`;
  }
  const keys = Object.keys(value).sort();
  return `{${keys
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`)
    .join(",")}}`;
}

export function sha256Hex(data) {
  return createHash("sha256").update(data).digest("hex");
}

// The desired-state digest binds the exact material manifest the
// control plane intends for this node: refs and digests only, never
// material (AGT-DATA-1).
export function desiredStateDigest({ nodeRef, channelRefs, generation, desiredStateRef, materials }) {
  return sha256Hex(
    canonicalJson({
      nodeRef,
      channelRefs: [...channelRefs].sort(),
      generation,
      desiredStateRef,
      materials: [...materials]
        .map((m) => ({
          channelRef: m.channelRef,
          edgeCredentialRef: m.edgeCredentialRef,
          digest: m.digest,
        }))
        .sort((a, b) => (a.edgeCredentialRef < b.edgeCredentialRef ? -1 : 1)),
    }),
  );
}

const REQUIRED_FIELDS = [
  "nodeRef",
  "channelRefs",
  "generation",
  "desiredStateRef",
  "desiredStateDigest",
  "issuedAt",
  "expiresAt",
  "antiReplayId",
  "keyId",
];
const SAFE_GENERATION_PATTERN = /^[A-Za-z0-9._:-]{1,128}$/;

export function normalizeManifest(payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new ManifestError("manifest_invalid", "manifest must be an object");
  }
  for (const field of REQUIRED_FIELDS) {
    if (!(field in payload)) {
      throw new ManifestError("manifest_invalid", `manifest is missing ${field}`);
    }
  }
  const {
    nodeRef,
    channelRefs,
    generation,
    desiredStateRef,
    desiredStateDigest: digest,
    issuedAt,
    expiresAt,
    antiReplayId,
    keyId,
  } = payload;
  const textFields = { nodeRef, generation, desiredStateRef, antiReplayId, keyId };
  for (const [field, value] of Object.entries(textFields)) {
    if (typeof value !== "string" || value.length === 0) {
      throw new ManifestError("manifest_invalid", `manifest ${field} must be a non-empty string`);
    }
  }
  if (
    !SAFE_GENERATION_PATTERN.test(generation)
    || generation === "."
    || generation === ".."
  ) {
    throw new ManifestError("manifest_invalid", "manifest generation must be a safe path segment");
  }
  if (!Array.isArray(channelRefs) || channelRefs.length === 0
    || channelRefs.some((ref) => typeof ref !== "string" || ref.length === 0)
    || new Set(channelRefs).size !== channelRefs.length) {
    throw new ManifestError("manifest_invalid", "manifest channelRefs must be unique non-empty strings");
  }
  if (typeof digest !== "string" || !/^[0-9a-f]{64}$/.test(digest)) {
    throw new ManifestError("manifest_invalid", "manifest desiredStateDigest must be a SHA-256 hex digest");
  }
  for (const [field, value] of Object.entries({ issuedAt, expiresAt })) {
    if (typeof value !== "string" || Number.isNaN(Date.parse(value))) {
      throw new ManifestError("manifest_invalid", `manifest ${field} must be an ISO timestamp`);
    }
  }
  if (Date.parse(expiresAt) <= Date.parse(issuedAt)) {
    throw new ManifestError("manifest_invalid", "manifest expiresAt must be after issuedAt");
  }
  return {
    nodeRef,
    channelRefs: [...channelRefs].sort(),
    generation,
    desiredStateRef,
    desiredStateDigest: digest,
    issuedAt,
    expiresAt,
    antiReplayId,
    keyId,
  };
}

export function signManifest(payload, privateKey) {
  const normalized = normalizeManifest(payload);
  const signature = cryptoSign(null, Buffer.from(canonicalJson(normalized), "utf8"), privateKey);
  return signature.toString("base64url");
}

// Verifier with anti-replay memory. One verifier instance corresponds
// to one Agent identity context; the seen-set is intentionally
// in-memory for the slice (a production Agent persists it with its
// state so a restart cannot reopen a replay window).
export function createManifestVerifier({ publicKeys, now = () => new Date() }) {
  if (!publicKeys || typeof publicKeys.get !== "function") {
    throw new TypeError("createManifestVerifier requires a Map of keyId -> publicKey");
  }
  const seenAntiReplayIds = new Set();
  return {
    verify(payload, signature, { expectedNodeRef, expectedChannelRefs } = {}) {
      const manifest = normalizeManifest(payload);
      if (expectedNodeRef !== undefined && manifest.nodeRef !== expectedNodeRef) {
        throw new ManifestError("binding_mismatch", "manifest nodeRef does not match this agent");
      }
      if (expectedChannelRefs !== undefined) {
        const expected = [...expectedChannelRefs].sort();
        if (canonicalJson(expected) !== canonicalJson(manifest.channelRefs)) {
          throw new ManifestError("binding_mismatch", "manifest channelRefs do not match this agent");
        }
      }
      const publicKey = publicKeys.get(manifest.keyId);
      if (!publicKey) {
        throw new ManifestError("unknown_key", `no public key for keyId ${manifest.keyId}`);
      }
      let valid = false;
      try {
        valid = cryptoVerify(
          null,
          Buffer.from(canonicalJson(manifest), "utf8"),
          publicKey,
          Buffer.from(String(signature), "base64url"),
        );
      } catch {
        valid = false;
      }
      if (!valid) {
        throw new ManifestError("signature_invalid", "manifest signature verification failed");
      }
      const at = now().getTime();
      if (at < Date.parse(manifest.issuedAt)) {
        throw new ManifestError("manifest_not_yet_valid", "manifest validity window has not started");
      }
      if (at >= Date.parse(manifest.expiresAt)) {
        throw new ManifestError("manifest_expired", "manifest validity window has ended");
      }
      if (seenAntiReplayIds.has(manifest.antiReplayId)) {
        throw new ManifestError("replay_detected", "manifest antiReplayId was already consumed");
      }
      seenAntiReplayIds.add(manifest.antiReplayId);
      return manifest;
    },
    hasConsumed(antiReplayId) {
      return seenAntiReplayIds.has(antiReplayId);
    },
  };
}
