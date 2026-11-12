// Auth0 rehash stage, simulated with the REAL bcrypt primitive (pyca/bcrypt,
// vendored under ./vendor) — not a reimplementation.
//
// Modeling note (explicit, not silent): the bcrypt algorithm's key schedule
// consumes at most 72 bytes of password input; Auth0's own support material
// warns that bytes beyond 72 may be ignored after its bcrypt rehash. Modern
// bcrypt libraries (pyca/bcrypt >= 5) instead REFUSE inputs over 72 bytes.
// Either behavior breaks an over-72 account at rehash time — silent semantic
// change or a hard failure — which is exactly why the import gate in
// auth0-scrypt-import-validator.mjs refuses over-72 accounts up front.
// To demonstrate the documented hazard faithfully, this bridge passes exactly
// the 72-byte input window to the real primitive. This truncation exists ONLY
// inside this hazard model; the production import path never truncates.

import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));

const PY = String.raw`
import sys, os, json, base64
sys.path.insert(0, os.environ["BCRYPT_VENDOR"])
import bcrypt

req = json.load(sys.stdin)
password = base64.b64decode(req["password_b64"])[:72]  # bcrypt's documented 72-byte input window
if req["mode"] == "hash":
    digest = bcrypt.hashpw(password, bcrypt.gensalt(rounds=10))
    print(json.dumps({"hash_b64": base64.b64encode(digest).decode()}))
else:
    stored = base64.b64decode(req["hash_b64"])
    print(json.dumps({"ok": bcrypt.checkpw(password, stored)}))
`;

function runBcrypt(request) {
  const out = execFileSync("python3", ["-c", PY], {
    input: JSON.stringify(request),
    env: { ...process.env, BCRYPT_VENDOR: path.join(here, "vendor") },
    encoding: "utf8",
    maxBuffer: 1024 * 1024
  });
  return JSON.parse(out);
}

function toB64(text) {
  return Buffer.from(String(text), "utf8").toString("base64");
}

// Simulates Auth0 storing bcrypt(presented password) after a successful
// first-login scrypt verification. Returns the stored bcrypt hash (base64).
export function simulateAuth0BcryptRehash(presentedPassword) {
  return runBcrypt({ mode: "hash", password_b64: toB64(presentedPassword) }).hash_b64;
}

// Simulates a later Auth0 login verified against the stored bcrypt hash.
export function simulateAuth0BcryptVerify(storedHashB64, presentedPassword) {
  return runBcrypt({ mode: "verify", password_b64: toB64(presentedPassword), hash_b64: storedHashB64 }).ok === true;
}
