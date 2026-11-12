// Bounded write flow: POST /v1/accounts/:accountId/second-factor-challenges
//
// Proves the write contract end to end against the real Worker and a
// fresh local D1 database:
//   - one idempotent issuance creates exactly one challenge row plus
//     one idempotency record, atomically;
//   - a retry with the same key and the same request replays the
//     original response (header idempotency-replayed: true) and does
//     not create a second challenge;
//   - the same key with a different request is a 409 conflict;
//   - validation, unknown-account, and auth failures write nothing;
//   - read and write tokens are separate privileges, both fail-closed;
//   - the repository batch rolls the challenge insert back when the
//     idempotency insert fails (atomicity / failure recovery);
//   - neither the challenge hash nor any secret material ever appears
//     in a response.

import assert from "node:assert/strict";
import test from "node:test";
import {
  createWorker,
  authHeaders,
  writeAuthHeaders,
  READ_TOKEN,
  WRITE_TOKEN,
} from "./helpers.mjs";
import { ChallengeRepository } from "../src/repositories/challenge-repository.mjs";

const BASE = "http://control-plane.local";
const KEY = "synth-idem-key-0001";
const ACCOUNT = "acct-pg-102";

function postChallenge(mf, accountId, { key = KEY, body, headers } = {}) {
  return mf.dispatchFetch(`${BASE}/v1/accounts/${accountId}/second-factor-challenges`, {
    method: "POST",
    headers: headers ?? writeAuthHeaders(key),
    body: typeof body === "string" ? body : JSON.stringify(body ?? { allowedFactors: ["totp"] }),
  });
}

async function challengeCount(db, accountId) {
  const row = await db
    .prepare("SELECT COUNT(*) AS n FROM platform_portal_second_factor_challenges WHERE account_id = ?")
    .bind(accountId)
    .first();
  return row.n;
}

async function idempotencyCount(db) {
  const row = await db
    .prepare("SELECT COUNT(*) AS n FROM platform_write_idempotency_keys")
    .first();
  return row.n;
}

test("issuance returns 201 with the safe projection and stores hash + idempotency record", async (t) => {
  const { mf, db } = await createWorker();
  t.after(() => mf.dispose());

  const res = await postChallenge(mf, ACCOUNT, { body: { allowedFactors: ["webauthn", "totp"] } });
  assert.equal(res.status, 201);
  assert.equal(res.headers.get("idempotency-replayed"), null);
  const text = await res.text();
  const body = JSON.parse(text);
  assert.deepEqual(Object.keys(body), ["challenge"]);
  assert.deepEqual(
    Object.keys(body.challenge).sort(),
    ["accountId", "allowedFactors", "createdAt", "expiresAt", "id", "status"],
  );
  assert.equal(body.challenge.accountId, ACCOUNT);
  assert.equal(body.challenge.status, "active");
  // Canonical (sorted) factor order is stored and returned.
  assert.deepEqual(body.challenge.allowedFactors, ["totp", "webauthn"]);
  assert.equal(
    Date.parse(body.challenge.expiresAt) - Date.parse(body.challenge.createdAt),
    600_000,
  );

  assert.equal(await challengeCount(db, ACCOUNT), 1);
  const row = await db
    .prepare(
      `SELECT challenge_hash, allowed_factors_json, status, failure_count
         FROM platform_portal_second_factor_challenges WHERE account_id = ?`,
    )
    .bind(ACCOUNT)
    .first();
  assert.match(row.challenge_hash, /^[0-9a-f]{64}$/);
  assert.equal(row.allowed_factors_json, '["totp","webauthn"]');
  assert.equal(row.status, "active");
  assert.equal(row.failure_count, 0);
  // The stored hash (and therefore the secret) never leaks into the response.
  assert.ok(!text.includes(row.challenge_hash));

  assert.equal(await idempotencyCount(db), 1);
  const record = await db
    .prepare("SELECT response_status, response_body_json FROM platform_write_idempotency_keys")
    .first();
  assert.equal(record.response_status, 201);
  assert.equal(JSON.parse(record.response_body_json).challenge.id, body.challenge.id);
});

test("replay: same key and canonically identical request returns the original response, no second write", async (t) => {
  const { mf, db } = await createWorker();
  t.after(() => mf.dispose());

  const first = await postChallenge(mf, ACCOUNT, { body: { allowedFactors: ["totp", "email"] } });
  assert.equal(first.status, 201);
  const firstBody = await first.json();

  // Same factors, different order: canonically the same request.
  const replay = await postChallenge(mf, ACCOUNT, { body: { allowedFactors: ["email", "totp"] } });
  assert.equal(replay.status, 201);
  assert.equal(replay.headers.get("idempotency-replayed"), "true");
  const replayBody = await replay.json();
  assert.equal(replayBody.challenge.id, firstBody.challenge.id);
  assert.equal(replayBody.challenge.createdAt, firstBody.challenge.createdAt);

  assert.equal(await challengeCount(db, ACCOUNT), 1);
  assert.equal(await idempotencyCount(db), 1);
});

test("conflict: same key with a different request is 409 and writes nothing new", async (t) => {
  const { mf, db } = await createWorker();
  t.after(() => mf.dispose());

  const first = await postChallenge(mf, ACCOUNT, { body: { allowedFactors: ["totp"] } });
  assert.equal(first.status, 201);

  const conflict = await postChallenge(mf, ACCOUNT, { body: { allowedFactors: ["sms"] } });
  assert.equal(conflict.status, 409);
  assert.equal((await conflict.json()).error.code, "idempotency_key_conflict");

  assert.equal(await challengeCount(db, ACCOUNT), 1);
  assert.equal(await idempotencyCount(db), 1);
});

test("idempotency keys are scoped per account: the same key on another account is a new write", async (t) => {
  const { mf, db } = await createWorker();
  t.after(() => mf.dispose());

  const a = await postChallenge(mf, "acct-pg-102", {});
  const b = await postChallenge(mf, "acct-pg-104", {});
  assert.equal(a.status, 201);
  assert.equal(b.status, 201);
  assert.notEqual((await a.json()).challenge.id, (await b.json()).challenge.id);
  assert.equal(await idempotencyCount(db), 2);
});

test("missing or malformed Idempotency-Key is 400 and writes nothing", async (t) => {
  const { mf, db } = await createWorker();
  t.after(() => mf.dispose());

  const missing = await mf.dispatchFetch(`${BASE}/v1/accounts/${ACCOUNT}/second-factor-challenges`, {
    method: "POST",
    headers: writeAuthHeaders(undefined),
    body: JSON.stringify({ allowedFactors: ["totp"] }),
  });
  assert.equal(missing.status, 400);
  assert.equal((await missing.json()).error.code, "invalid_idempotency_key");

  const short = await postChallenge(mf, ACCOUNT, { key: "short" });
  assert.equal(short.status, 400);
  assert.equal((await short.json()).error.code, "invalid_idempotency_key");

  assert.equal(await challengeCount(db, ACCOUNT), 0);
  assert.equal(await idempotencyCount(db), 0);
});

test("body validation: malformed bodies are 400 and write nothing", async (t) => {
  const { mf, db } = await createWorker();
  t.after(() => mf.dispose());

  const cases = [
    "not json",
    "[]",
    "{}",
    JSON.stringify({ allowedFactors: ["totp"], extra: true }),
    JSON.stringify({ allowedFactors: [] }),
    JSON.stringify({ allowedFactors: ["carrier-pigeon"] }),
    JSON.stringify({ allowedFactors: ["totp", "totp"] }),
    JSON.stringify({ allowedFactors: "totp" }),
  ];
  for (const [index, raw] of cases.entries()) {
    const res = await postChallenge(mf, ACCOUNT, {
      key: `synth-idem-body-${index}`,
      body: raw,
    });
    assert.equal(res.status, 400, `case ${index}: ${raw}`);
    assert.equal((await res.json()).error.code, "invalid_body", `case ${index}`);
  }
  assert.equal(await challengeCount(db, ACCOUNT), 0);
  assert.equal(await idempotencyCount(db), 0);
});

test("unknown account is 404 and writes nothing (no orphan idempotency record)", async (t) => {
  const { mf, db } = await createWorker();
  t.after(() => mf.dispose());

  const res = await postChallenge(mf, "acct-pg-999", {});
  assert.equal(res.status, 404);
  assert.equal((await res.json()).error.code, "account_not_found");
  assert.equal(await challengeCount(db, "acct-pg-999"), 0);
  assert.equal(await idempotencyCount(db), 0);
});

test("privilege separation: read token cannot write, write token cannot read", async (t) => {
  const { mf, db } = await createWorker();
  t.after(() => mf.dispose());

  const readOnWrite = await mf.dispatchFetch(`${BASE}/v1/accounts/${ACCOUNT}/second-factor-challenges`, {
    method: "POST",
    headers: { ...authHeaders(), "idempotency-key": KEY, "content-type": "application/json" },
    body: JSON.stringify({ allowedFactors: ["totp"] }),
  });
  assert.equal(readOnWrite.status, 401);

  const writeOnRead = await mf.dispatchFetch(`${BASE}/v1/accounts/${ACCOUNT}`, {
    headers: { authorization: `Bearer ${WRITE_TOKEN}` },
  });
  assert.equal(writeOnRead.status, 401);

  const wrongWrite = await mf.dispatchFetch(`${BASE}/v1/accounts/${ACCOUNT}/second-factor-challenges`, {
    method: "POST",
    headers: {
      authorization: "Bearer synth-test-write-token-wrong",
      "idempotency-key": KEY,
      "content-type": "application/json",
    },
    body: JSON.stringify({ allowedFactors: ["totp"] }),
  });
  assert.equal(wrongWrite.status, 401);

  assert.equal(await challengeCount(db, ACCOUNT), 0);
  assert.equal(await idempotencyCount(db), 0);
  assert.ok(READ_TOKEN !== WRITE_TOKEN);
});

test("fail-closed: without a configured write token every write is 401", async (t) => {
  const { mf, db } = await createWorker({ withWriteToken: false });
  t.after(() => mf.dispose());

  const res = await postChallenge(mf, ACCOUNT, {});
  assert.equal(res.status, 401);
  assert.equal(await challengeCount(db, ACCOUNT), 0);
  assert.equal(await idempotencyCount(db), 0);
});

test("non-POST methods on the challenge route are 405", async (t) => {
  const { mf } = await createWorker();
  t.after(() => mf.dispose());

  const res = await mf.dispatchFetch(`${BASE}/v1/accounts/${ACCOUNT}/second-factor-challenges`, {
    headers: writeAuthHeaders(KEY),
  });
  assert.equal(res.status, 405);
  assert.equal((await res.json()).error.code, "method_not_allowed");
});

test("repository batch is atomic: a failing idempotency insert rolls back the challenge insert", async (t) => {
  const { mf, db } = await createWorker();
  t.after(() => mf.dispose());

  // Pre-commit an idempotency record, then try to issue a challenge
  // under the same (scope, key): the second insert must fail and the
  // challenge insert in the same batch must not persist.
  const scope = "POST:/v1/accounts/acct-pg-102/second-factor-challenges";
  await db
    .prepare(
      `INSERT INTO platform_write_idempotency_keys
         (scope, idempotency_key, request_fingerprint, response_status, response_body_json, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .bind(scope, "synth-idem-atomic-1", "fingerprint-x", 201, "{}", "2026-03-01T10:00:00.000Z")
    .run();

  const repository = new ChallengeRepository(db);
  await assert.rejects(
    repository.issueChallengeAtomically({
      challenge: {
        id: "chal-atomic-1",
        accountId: "acct-pg-102",
        challengeHash: "0".repeat(64),
        allowedFactorsJson: '["totp"]',
        expiresAt: "2026-03-01T10:10:00.000Z",
        createdAt: "2026-03-01T10:00:00.000Z",
      },
      idempotency: {
        scope,
        key: "synth-idem-atomic-1",
        fingerprint: "fingerprint-x",
        responseStatus: 201,
        responseBodyJson: "{}",
        createdAt: "2026-03-01T10:00:00.000Z",
      },
    }),
  );
  assert.equal(await challengeCount(db, "acct-pg-102"), 0);
  assert.equal(await idempotencyCount(db), 1);
});
