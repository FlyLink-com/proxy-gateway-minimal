// Step 6, executed the way Yi directed on 2026-11-08: inside the current VM.
//
// A local, Auth0-SHAPED tenant simulator. It is NOT Auth0: no tenant exists,
// no vendor account is touched. It exists so the step-6 checklist can be run
// end to end in this VM against the contracts proven in steps 1-5:
//   import gate -> first-login scrypt verify -> bcrypt rehash -> token
//   issuance/verification (real Ed25519 signatures, per-tenant keys) ->
//   voluntary TOTP enrollment (Portal) / mandatory TOTP (Admin) ->
//   per-issuer session revocation.
// What only a real tenant can prove is listed in the step-6 record file;
// nothing here claims to have proven those items.

import { createHmac, generateKeyPairSync, randomBytes, sign, verify, createPublicKey } from "node:crypto";
import {
  planImport, simulateAuth0ScryptVerify, utf8ByteLength, BCRYPT_INPUT_WINDOW_BYTES
} from "./auth0-scrypt-import-validator.mjs";
import { simulateAuth0BcryptRehash, simulateAuth0BcryptVerify } from "./bcrypt-stage.mjs";
import { classifyAttestationRecord } from "./login-attestation.mjs";
import { createSessionRevocationRegistry } from "./tenant-isolation.mjs";

function fail(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}

// --- Base32 + RFC 6238 TOTP (the "authenticator app" side and server side) ---
const B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
export function base32Encode(buffer) {
  let bits = 0, value = 0, out = "";
  for (const byte of buffer) {
    value = (value << 8) | byte; bits += 8;
    while (bits >= 5) { out += B32[(value >>> (bits - 5)) & 31]; bits -= 5; }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out;
}
export function base32Decode(text) {
  const clean = String(text).replace(/=+$/u, "").toUpperCase();
  let bits = 0, value = 0;
  const out = [];
  for (const ch of clean) {
    const idx = B32.indexOf(ch);
    if (idx < 0) throw fail("base32_invalid");
    value = (value << 5) | idx; bits += 5;
    if (bits >= 8) { out.push((value >>> (bits - 8)) & 255); bits -= 8; }
  }
  return Buffer.from(out);
}
export function totpAt(secretBase32, timestampMs, digits = 6) {
  const counter = Math.floor(timestampMs / 30000);
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(counter));
  const mac = createHmac("sha1", base32Decode(secretBase32)).update(msg).digest();
  const offset = mac[mac.length - 1] & 15;
  const binary = ((mac[offset] & 127) << 24) | (mac[offset + 1] << 16) | (mac[offset + 2] << 8) | mac[offset + 3];
  return String(binary % (10 ** digits)).padStart(digits, "0");
}
function totpMatches(secretBase32, code, timestampMs) {
  return [-30000, 0, 30000].some((delta) => totpAt(secretBase32, timestampMs + delta) === String(code));
}

// The attestation record stores only a bucket; the import gate needs a byte
// count. Classification depends solely on the >72 boundary, so the bucket
// maps to its boundary representative without inventing information.
function attestedBytesFromRecord(record) {
  if (!record) return null;
  return record.bucket === "over_72" ? BCRYPT_INPUT_WINDOW_BYTES + 1 : BCRYPT_INPUT_WINDOW_BYTES;
}

const b64u = (data) => Buffer.from(data).toString("base64url");

export function createMockTenant({ tenantRef, issuerRef, nowFn = () => Date.now() } = {}) {
  if (!tenantRef || !issuerRef) throw fail("tenant_config_invalid");
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const kid = tenantRef + "-k1";
  const jwk = { ...publicKey.export({ format: "jwk" }), kid, alg: "EdDSA", use: "sig" };
  const users = new Map();       // email -> user record (credentials never leave via inspect)
  const enrollments = new Map(); // accountRef -> { secretBase32 }
  const revocations = createSessionRevocationRegistry();
  let sessionSeq = 0;

  function issueToken({ subjectRef, sessionRef, factors, nowMs }) {
    const header = { alg: "EdDSA", typ: "JWT", kid };
    const payload = {
      iss: issuerRef, aud: "flylink-control-plane", sub: subjectRef,
      iat: Math.floor(nowMs / 1000), exp: Math.floor(nowMs / 1000) + 600,
      sid: sessionRef, amr: [...factors]
    };
    const data = b64u(JSON.stringify(header)) + "." + b64u(JSON.stringify(payload));
    const signature = sign(null, Buffer.from(data), privateKey);
    return data + "." + b64u(signature);
  }

  function buildContext(user, factors, nowMs) {
    const sessionRef = "sess-" + (++sessionSeq).toString(16).padStart(4, "0") + randomBytes(4).toString("hex");
    const subjectRef = "auth0|" + user.accountRef;
    const context = Object.freeze({
      accountRef: user.accountRef, audience: "flylink-control-plane",
      authTimeMs: nowMs, expiresAtMs: nowMs + 120000,
      factors: Object.freeze([...factors]), issuerRef, sessionRef, subjectRef
    });
    return { context, token: issueToken({ subjectRef, sessionRef, factors, nowMs }) };
  }

  return Object.freeze({
    tenantRef,
    issuerRef,
    exportJwks: () => ({ keys: [jwk] }),

    verifyToken(token, nowMs = nowFn()) {
      const parts = String(token ?? "").split(".");
      if (parts.length !== 3) throw fail("token_malformed");
      let payload;
      try {
        payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
      } catch { throw fail("token_malformed"); }
      if (payload.iss !== issuerRef) throw fail("token_issuer_mismatch");
      const key = createPublicKey({ key: jwk, format: "jwk" });
      const ok = verify(null, Buffer.from(parts[0] + "." + parts[1]), key, Buffer.from(parts[2], "base64url"));
      if (!ok) throw fail("token_signature_invalid");
      if (payload.exp <= Math.floor(nowMs / 1000)) throw fail("token_expired");
      if (typeof payload.sid !== "string" || payload.sid.length === 0) throw fail("token_session_invalid");
      if (revocations.isRevoked({ issuerRef, sessionRef: payload.sid })) throw fail("token_revoked");
      return payload;
    },

    // Pipeline from steps 1-4: legacy accounts arrive with an envelope and
    // (optionally) an attestation record; the import gate decides each one.
    importLegacyAccounts(accounts) {
      if (!Array.isArray(accounts)) throw fail("import_batch_invalid");

      // Prepare the entire batch without side effects. The Map is keyed by
      // email and token subjects use accountRef, so duplicate keys must fail
      // closed instead of silently overwriting or aliasing identities.
      const prepared = [];
      const seenAccountRefs = new Set();
      const seenEmails = new Set();
      for (const account of accounts) {
        if (!account || typeof account !== "object" || Array.isArray(account)) {
          throw fail("import_account_invalid");
        }
        const { accountRef, email } = account;
        if (typeof accountRef !== "string" || accountRef.length === 0) {
          throw fail("import_account_ref_invalid");
        }
        if (typeof email !== "string" || email.length === 0) {
          throw fail("import_email_invalid");
        }
        if (seenAccountRefs.has(accountRef)) throw fail("import_batch_duplicate_account_ref");
        if (seenEmails.has(email)) throw fail("import_batch_duplicate_email");
        seenAccountRefs.add(accountRef);
        seenEmails.add(email);

        const attestation = account.attestation;
        if (attestation !== undefined && attestation !== null) {
          classifyAttestationRecord(attestation); // validates the exact record shape
          if (attestation.accountRef !== accountRef) {
            throw fail("attestation_account_ref_mismatch");
          }
        }
        const classification = classifyAttestationRecord(attestation ?? undefined);
        const plan = classification.eligibility === "r1_implementation_proof_hold"
          ? null
          : planImport({
            envelope: account.envelope,
            attestedUtf8Bytes: attestedBytesFromRecord(attestation)
          });
        prepared.push({ accountRef, email, classification, plan });
      }

      // All input, attestation, uniqueness, and import-plan validation has
      // completed before the first user write.
      const report = [];
      for (const { accountRef, email, classification, plan } of prepared) {
        if (classification.eligibility === "r1_implementation_proof_hold") {
          report.push({
            accountRef,
            action: "held_r1_implementation_proof",
            advisories: [...classification.advisories]
          });
          continue;
        }
        if (plan.action === "import") {
          users.set(email, {
            accountRef, email, status: "active",
            credential: { kind: "scrypt", auth0: plan.auth0 },
            advisories: [...classification.advisories]
          });
          report.push({ accountRef, action: "imported", advisories: [...classification.advisories] });
        } else if (plan.action === "targeted_reset") {
          users.set(email, {
            accountRef, email, status: "reset_required",
            credential: null, advisories: []
          });
          report.push({ accountRef, action: "reset_required", advisories: [] });
        } else {
          report.push({ accountRef, action: "held_no_attestation", advisories: [] });
        }
      }
      return Object.freeze(report);
    },

    inspectUser(email) {
      const user = users.get(email);
      if (!user) return undefined;
      return Object.freeze({
        accountRef: user.accountRef, status: user.status,
        credentialKind: user.credential?.kind ?? null,
        storedForm: user.credential?.kind === "bcrypt" ? "bcrypt:$2b$" : (user.credential ? "custom_password_hash:scrypt" : null),
        advisories: [...user.advisories]
      });
    },

    login(email, password) {
      const user = users.get(email);
      if (!user) return Object.freeze({ outcome: "invalid_credentials" });
      if (user.status === "reset_required") return Object.freeze({ outcome: "reset_required" });
      let ok = false;
      if (user.credential.kind === "scrypt") {
        ok = simulateAuth0ScryptVerify(user.credential.auth0, password);
        if (ok) {
          // Auth0 behavior: after a successful custom-hash verification the
          // presented password is rehashed with bcrypt and stored instead.
          user.credential = { kind: "bcrypt", hashB64: simulateAuth0BcryptRehash(password) };
        }
      } else {
        ok = simulateAuth0BcryptVerify(user.credential.hashB64, password);
      }
      if (!ok) return Object.freeze({ outcome: "invalid_credentials" });
      const { context, token } = buildContext(user, ["password"], nowFn());
      return Object.freeze({ outcome: "ok", context, token });
    },

    // Auth0-side reset boundary: Auth0 does not trim. First-party callers
    // must apply String(value ?? "").trim() before sending the password here.
    // Preserve exactly what this provider mock receives; do not hide a client
    // normalization gap by trimming inside the simulated provider.
    // The new password must also fit the 72-byte bcrypt window.
    completeReset(email, passwordReceivedByAuth0) {
      const user = users.get(email);
      if (!user || user.status !== "reset_required") throw fail("reset_not_applicable");
      if (typeof passwordReceivedByAuth0 !== "string" || passwordReceivedByAuth0.length === 0) {
        throw fail("reset_password_invalid");
      }
      if (utf8ByteLength(passwordReceivedByAuth0) > BCRYPT_INPUT_WINDOW_BYTES) {
        throw fail("reset_password_over_72_bytes");
      }
      user.credential = { kind: "bcrypt", hashB64: simulateAuth0BcryptRehash(passwordReceivedByAuth0) };
      user.status = "active";
      return true;
    },

    // T1 enrollment: the user binds an authenticator in settings (voluntary
    // on Portal; a gate on Admin). Enrollment lives in THIS tenant only.
    enrollTotp(accountRef) {
      const secretBase32 = base32Encode(randomBytes(20));
      enrollments.set(accountRef, { secretBase32 });
      return Object.freeze({ secretBase32 });
    },
    hasTotp: (accountRef) => enrollments.has(accountRef),

    stepUpTotp(context, code, nowMs = nowFn()) {
      const enrollment = enrollments.get(context.accountRef);
      if (!enrollment) throw fail("totp_not_enrolled");
      if (!totpMatches(enrollment.secretBase32, code, nowMs)) throw fail("totp_code_invalid");
      if (context.factors.includes("totp")) return context;
      return Object.freeze({ ...context, factors: Object.freeze([...context.factors, "totp"]) });
    },

    revokeSession: (sessionRef) => revocations.revoke({ issuerRef, sessionRef }),
    isSessionRevoked: (sessionRef) => revocations.isRevoked({ issuerRef, sessionRef })
  });
}
