// Boundary verification for the C1-D01 Auth0 scrypt import route.
// All passwords are synthetic fixtures. No tenant, no production data.
import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
  legacyEnroll, parseLegacyEnvelope, toAuth0CustomPasswordHash, validateAuth0ScryptObject,
  simulateAuth0ScryptVerify, utf8ByteLength, classifyByAttestedUtf8Bytes,
  classifyFromEnvelopeOnly, planImport
} from "./auth0-scrypt-import-validator.mjs";
import { simulateAuth0BcryptRehash, simulateAuth0BcryptVerify } from "./bcrypt-stage.mjs";

const salt = (n) => Buffer.alloc(16, n);

test("conversion preserves scrypt parameters and bytes exactly", () => {
  const envelope = legacyEnroll("synthetic-conversion-pw", salt(1));
  const parsed = parseLegacyEnvelope(envelope);
  const auth0 = toAuth0CustomPasswordHash(envelope);
  assert.equal(validateAuth0ScryptObject(auth0), true);
  assert.equal(auth0.algorithm, "scrypt");
  assert.equal(auth0.cost, 32768);
  assert.equal(auth0.blockSize, 8);
  assert.equal(auth0.parallelization, 1);
  assert.equal(auth0.keylen, 64);
  assert.equal(auth0.password.encoding, "utf8");
  assert.deepEqual(Buffer.from(auth0.salt.value, "base64"), parsed.salt);
  assert.deepEqual(Buffer.from(auth0.hash.value, "base64"), parsed.hash);
});

test("legacy envelope rejects noncanonical base64url and non-16-byte salts", () => {
  const envelope = legacyEnroll("synthetic-parser-pw", salt(12));
  const parts = envelope.split("$");
  const badSalt = [...parts.slice(0, 5), parts[5] + "!!", parts[6]].join("$");
  const badHash = [...parts.slice(0, 6), parts[6] + "!!"].join("$");
  const shortSalt = [...parts.slice(0, 5), Buffer.alloc(8, 1).toString("base64url"), parts[6]].join("$");
  assert.throws(() => parseLegacyEnvelope(badSalt), /legacy_scrypt_hash_invalid/);
  assert.throws(() => parseLegacyEnvelope(badHash), /legacy_scrypt_hash_invalid/);
  assert.throws(() => parseLegacyEnvelope(shortSalt), /legacy_scrypt_hash_invalid/);
});

test("Auth0 Scrypt shape gate requires salt, UTF-8 password encoding, and exact nested keys", () => {
  const valid = toAuth0CustomPasswordHash(legacyEnroll("synthetic-shape-pw", salt(13)));
  const missingSalt = structuredClone(valid);
  delete missingSalt.salt;
  assert.throws(() => validateAuth0ScryptObject(missingSalt), /auth0_object_shape_invalid/);
  const wrongPasswordEncoding = structuredClone(valid);
  wrongPasswordEncoding.password.encoding = "utf16";
  assert.throws(() => validateAuth0ScryptObject(wrongPasswordEncoding), /auth0_object_password_encoding_invalid/);
  const nestedExtra = structuredClone(valid);
  nestedExtra.hash.unreviewed = true;
  assert.throws(() => validateAuth0ScryptObject(nestedExtra), /auth0_object_hash_invalid/);

  const wrongKeylen = structuredClone(valid);
  wrongKeylen.keylen = 32;
  assert.throws(() => validateAuth0ScryptObject(wrongKeylen), /auth0_object_keylen_invalid/);
  const wrongCost = structuredClone(valid);
  wrongCost.cost = 16384;
  assert.throws(() => validateAuth0ScryptObject(wrongCost), /auth0_object_cost_invalid/);
  const wrongBlockSize = structuredClone(valid);
  wrongBlockSize.blockSize = 16;
  assert.throws(() => validateAuth0ScryptObject(wrongBlockSize), /auth0_object_block_size_invalid/);
  const wrongParallelization = structuredClone(valid);
  wrongParallelization.parallelization = 2;
  assert.throws(() => validateAuth0ScryptObject(wrongParallelization), /auth0_object_parallelization_invalid/);

  const shortHash = structuredClone(valid);
  shortHash.hash.value = Buffer.alloc(32, 1).toString("base64");
  assert.throws(() => validateAuth0ScryptObject(shortHash), /auth0_object_material_invalid/);
  const shortSalt = structuredClone(valid);
  shortSalt.salt.value = Buffer.alloc(8, 1).toString("base64");
  assert.throws(() => validateAuth0ScryptObject(shortSalt), /auth0_object_material_invalid/);
  const utf8Hash = structuredClone(valid);
  utf8Hash.hash.encoding = "utf8";
  assert.throws(() => validateAuth0ScryptObject(utf8Hash), /auth0_object_material_invalid/);
  const hexSalt = structuredClone(valid);
  hexSalt.salt.encoding = "hex";
  assert.throws(() => validateAuth0ScryptObject(hexSalt), /auth0_object_material_invalid/);
});

test("known-answer: validator scrypt matches Python hashlib.scrypt byte-for-byte", () => {
  const envelope = legacyEnroll("synthetic-kat-pw", salt(2));
  const parsed = parseLegacyEnvelope(envelope);
  const py = execFileSync("python3", ["-c", String.raw`
import sys, hashlib, json
req = json.load(sys.stdin)
dk = hashlib.scrypt(req["password"].encode(), salt=bytes.fromhex(req["salt_hex"]),
                    n=32768, r=8, p=1, dklen=64, maxmem=64*1024*1024)
print(dk.hex())
`], { input: JSON.stringify({ password: "synthetic-kat-pw", salt_hex: parsed.salt.toString("hex") }), encoding: "utf8" }).trim();
  assert.equal(parsed.hash.toString("hex"), py);
});

function fullCycle(presented) {
  const envelope = legacyEnroll(presented, salt(3));
  const plan = planImport({ envelope, attestedUtf8Bytes: utf8ByteLength(presented) });
  assert.equal(plan.action, "import");
  assert.equal(simulateAuth0ScryptVerify(plan.auth0, presented), true, "first-login scrypt stage");
  const stored = simulateAuth0BcryptRehash(presented);
  return { plan, stored };
}

test("71-byte password: importable, full first-login + rehash cycle", () => {
  const pw = "a".repeat(71);
  const { stored } = fullCycle(pw);
  assert.equal(simulateAuth0BcryptVerify(stored, pw), true);
  assert.equal(simulateAuth0BcryptVerify(stored, "a".repeat(70) + "b"), false);
});

test("72-byte password: exactly at the window, full cycle works", () => {
  const pw = "b".repeat(72);
  const { stored } = fullCycle(pw);
  assert.equal(simulateAuth0BcryptVerify(stored, pw), true);
  assert.equal(simulateAuth0BcryptVerify(stored, "b".repeat(71) + "c"), false);
});

test("73-byte password: gate refuses import (targeted reset), no Auth0 object produced", () => {
  const pw = "c".repeat(72) + "D";
  const envelope = legacyEnroll(pw, salt(4));
  const plan = planImport({ envelope, attestedUtf8Bytes: utf8ByteLength(pw) });
  assert.equal(plan.action, "targeted_reset");
  assert.equal(plan.classification, "reset_required");
  assert.equal("auth0" in plan, false);
});

test("HAZARD DEMO (gate deliberately bypassed): semantics change exactly at the bcrypt rehash", () => {
  const pw = "c".repeat(72) + "D";
  const collider = "c".repeat(72) + "E"; // distinct password, same first 72 bytes
  const envelope = legacyEnroll(pw, salt(5));
  const auth0 = toAuth0CustomPasswordHash(envelope); // bypass: what must never happen in production
  // Pre-rehash (scrypt stage): semantics intact — the collider is rejected.
  assert.equal(simulateAuth0ScryptVerify(auth0, pw), true);
  assert.equal(simulateAuth0ScryptVerify(auth0, collider), false);
  // Auth0 rehashes the presented password with bcrypt after this first login.
  const stored = simulateAuth0BcryptRehash(pw);
  assert.equal(simulateAuth0BcryptVerify(stored, pw), true);
  // Post-rehash: the collider now verifies. The password's meaning silently changed.
  assert.equal(simulateAuth0BcryptVerify(stored, collider), true);
  assert.equal(simulateAuth0BcryptVerify(stored, "c".repeat(72)), true);
});

test("Chinese passwords are judged in UTF-8 bytes, not characters", () => {
  const zh72 = "飞".repeat(24); // 24 chars, exactly 72 bytes
  assert.equal(zh72.length, 24);
  assert.equal(utf8ByteLength(zh72), 72);
  assert.equal(classifyByAttestedUtf8Bytes(utf8ByteLength(zh72)), "importable");
  const { stored } = fullCycle(zh72);
  assert.equal(simulateAuth0BcryptVerify(stored, zh72), true);

  const zh75 = "飞".repeat(25); // 25 chars — far under 72 characters, but 75 bytes
  assert.equal(utf8ByteLength(zh75), 75);
  const plan = planImport({ envelope: legacyEnroll(zh75, salt(6)), attestedUtf8Bytes: utf8ByteLength(zh75) });
  assert.equal(plan.action, "targeted_reset");
});

test("R1 whitespace: legacy trims before hashing; Auth0 does not trim at verify time", () => {
  const typedByUser = "  synthetic-pw  ";
  const envelope = legacyEnroll(typedByUser, salt(7)); // production hashes the TRIMMED value
  const auth0 = toAuth0CustomPasswordHash(envelope);
  // The imported hash is a hash of "synthetic-pw". At Auth0:
  assert.equal(simulateAuth0ScryptVerify(auth0, "synthetic-pw"), true, "trimmed form verifies");
  assert.equal(simulateAuth0ScryptVerify(auth0, typedByUser), false, "the spaced form the user actually types FAILS");
  // Interior spaces are untouched by trim and behave normally end to end.
  const interior = "correct horse battery";
  const auth0Interior = toAuth0CustomPasswordHash(legacyEnroll(interior, salt(8)));
  assert.equal(simulateAuth0ScryptVerify(auth0Interior, interior), true);
});

test("Yi's constraint in code: byte length is unknowable from the stored envelope alone", () => {
  for (const pw of ["a".repeat(71), "b".repeat(72), "c".repeat(73), "d".repeat(100), "飞".repeat(40)]) {
    const envelope = legacyEnroll(pw, salt(9));
    assert.equal(classifyFromEnvelopeOnly(envelope), "unknown_length_unattested");
    // And without attestation the gate holds the import rather than guessing.
    assert.equal(planImport({ envelope }).action, "hold_no_attestation");
  }
});

test("inherent bcrypt window property: a 73-byte extension of a 72-byte password also verifies post-rehash", () => {
  const pw = "e".repeat(72);
  const { stored } = fullCycle(pw);
  assert.equal(simulateAuth0BcryptVerify(stored, pw), true, "the true password still works — no lockout");
  assert.equal(simulateAuth0BcryptVerify(stored, pw + "x"), true, "extension collides inside the 72-byte window (Auth0-inherent)");
});
