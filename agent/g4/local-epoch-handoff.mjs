// U-F16 local review prototype only. Not a production publishing contract.
import { createPublicKey, verify } from "node:crypto";
import { readFileSync } from "node:fs";
import { isValidWriterEpoch } from "./agent-client.mjs";

const FIELDS = ["kind", "origin", "nodeRef", "epoch", "receiptDigest", "issuedAt", "expiresAt"];
const KIND = "g4-local-epoch-handoff-v1";
const MAX_AGE_MS = 60_000;

function fail(code) {
  return Object.assign(new Error("Local writer epoch handoff rejected"), { code });
}

export function localHandoffBytes(payload) {
  return Buffer.from(JSON.stringify(FIELDS.map(field => payload[field])), "utf8");
}

export function localEpochProvider({ baseUrl, nodeRef, handoffPath, publicKeyPath }) {
  const url = new URL(baseUrl);
  // Intentionally no DNS names or HTTPS/remote fallback in this prototype.
  if (url.protocol !== "http:" || !["127.0.0.1", "[::1]"].includes(url.hostname)
    || url.username || url.password || url.pathname !== "/" || url.search || url.hash) {
    throw fail("writer_epoch_invalid");
  }
  const publicKey = createPublicKey(readFileSync(publicKeyPath));
  if (publicKey.asymmetricKeyType !== "ed25519") throw fail("writer_epoch_invalid");

  return () => {
    let content;
    try {
      content = readFileSync(handoffPath, "utf8");
    } catch (error) {
      throw fail(error.code === "ENOENT" ? "writer_epoch_required" : "writer_epoch_invalid");
    }
    try {
      if (Buffer.byteLength(content) > 4096) throw fail("writer_epoch_invalid");
      const { payload, signature } = JSON.parse(content);
      const now = Date.now();
      if (!payload || Object.keys(payload).length !== FIELDS.length
        || !FIELDS.every(field => Object.hasOwn(payload, field))
        || payload.kind !== KIND || payload.origin !== url.origin || payload.nodeRef !== nodeRef
        || !Number.isSafeInteger(payload.epoch) || !isValidWriterEpoch(String(payload.epoch))
        || typeof payload.receiptDigest !== "string" || !/^[a-f0-9]{64}$/.test(payload.receiptDigest)
        || !Number.isSafeInteger(payload.issuedAt) || !Number.isSafeInteger(payload.expiresAt)
        || payload.issuedAt > now || payload.expiresAt <= payload.issuedAt
        || payload.expiresAt - payload.issuedAt > MAX_AGE_MS
        || typeof signature !== "string" || !/^[A-Za-z0-9_-]{86}$/.test(signature)
        || !verify(null, localHandoffBytes(payload), publicKey, Buffer.from(signature, "base64url"))) {
        throw fail("writer_epoch_invalid");
      }
      if (now >= payload.expiresAt) throw fail("writer_epoch_stale");
      return payload.epoch;
    } catch (error) {
      if (error.code === "writer_epoch_stale") throw error;
      throw fail("writer_epoch_invalid");
    }
  };
}
