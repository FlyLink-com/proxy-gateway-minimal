import assert from "node:assert/strict";
import test from "node:test";
import {
  createWorker,
  writeAuthHeaders,
} from "./helpers.mjs";
import { ChallengeRepository } from "../src/repositories/challenge-repository.mjs";
import {
  WriterAuthorityRepository,
  parseWriterEpoch,
} from "../src/writer-authority.mjs";

const url = "http://control-plane.local/v1/accounts/acct-pg-102/second-factor-challenges";
const body = JSON.stringify({ allowedFactors: ["totp"] });

function post(mf, headers = writeAuthHeaders("synth-writer-authority-idem-0001")) {
  return mf.dispatchFetch(url, { method: "POST", headers, body });
}
async function count(db, table) {
  const row = await db.prepare("SELECT COUNT(*) AS n FROM " + table).first();
  return row.n;
}

test("remote-default BWH authority: G3 writes fail closed and no data changes", async (t) => {
  const { mf, db } = await createWorker({ writerPhase: "BWH_ACTIVE" });
  t.after(() => mf.dispose());
  const state = await new WriterAuthorityRepository(db).current();
  assert.deepEqual(state, { authority: "BWH", phase: "BWH_ACTIVE", epoch: 1 });
  const response = await post(mf);
  assert.equal(response.status, 503);
  assert.equal((await response.json()).error.code, "writer_authority_not_d1");
  assert.equal(await count(db, "platform_write_idempotency_keys"), 0);
  assert.equal(await db.prepare(
    "SELECT COUNT(*) AS n FROM platform_portal_second_factor_challenges WHERE account_id = 'acct-pg-102'"
  ).first().then(x => x.n), 0);
});

test("FROZEN and RECOVERY reject D1 writes", async (t) => {
  for (const writerPhase of ["FROZEN", "RECOVERY"]) {
    const { mf, db } = await createWorker({ writerPhase });
    t.after(() => mf.dispose());
    const result = await post(mf, { ...writeAuthHeaders("synth-writer-" + writerPhase + "-0000001"),
      "x-writer-epoch": writerPhase === "FROZEN" ? "2" : "4" });
    assert.equal(result.status, 503);
    assert.equal((await result.json()).error.code, "writer_authority_not_d1");
    assert.equal(await count(db, "platform_write_idempotency_keys"), 0);
  }
});

test("D1_ACTIVE with current epoch succeeds; stale epoch and malformed headers reject", async (t) => {
  const { mf, db } = await createWorker();
  t.after(() => mf.dispose());
  const valid = writeAuthHeaders("synth-writer-correct-epoch-00001");
  const cases = [
    [{ ...valid, "x-writer-epoch": "2" }, 409, "writer_epoch_stale"],
    [{ ...valid, "x-writer-epoch": "4" }, 409, "writer_epoch_stale"],
    [{ ...valid, "x-writer-epoch": "0" }, 400, "writer_epoch_required"],
    [{ ...valid, "x-writer-epoch": "0003" }, 400, "writer_epoch_required"],
    [{ ...valid, "x-writer-epoch": "2147483648" }, 400, "writer_epoch_required"],
    [Object.fromEntries(Object.entries(valid).filter(([k]) => k !== "x-writer-epoch")),
      400, "writer_epoch_required"],
  ];
  for (const [headers, status, code] of cases) {
    const res = await post(mf, headers);
    assert.equal(res.status, status);
    assert.equal((await res.json()).error.code, code);
  }
  assert.equal(await count(db, "platform_write_idempotency_keys"), 0);
  const good = await post(mf, valid);
  assert.equal(good.status, 201);
  assert.equal(await count(db, "platform_write_idempotency_keys"), 1);
  assert.equal(parseWriterEpoch("3"), 3);
  assert.throws(() => parseWriterEpoch("3e0"));
});

test("atomic gate rejects a stale preflight race without partial business/idempotency rows", async (t) => {
  const { mf, db } = await createWorker();
  t.after(() => mf.dispose());
  const gate = new WriterAuthorityRepository(db);
  assert.deepEqual(await gate.assertWritable(3), {
    authority: "D1", phase: "D1_ACTIVE", epoch: 3
  });
  // Simulate authority withdrawal between HTTP preflight and DB transaction.
  await db.prepare(
    "UPDATE platform_writer_authority SET phase = 'RECOVERY', authority = 'D1', " +
    "epoch = 4, changed_at = '2026-11-20T00:00:03.000Z' WHERE singleton = 1"
  ).run();
  const repository = new ChallengeRepository(db);
  await assert.rejects(
    repository.issueChallengeAtomically({
      epoch: 3,
      challenge: {
        id: "chal-synth-fenced-race", accountId: "acct-pg-102",
        challengeHash: "b".repeat(64), allowedFactorsJson: '["totp"]',
        expiresAt: "2026-11-20T00:10:00.000Z",
        createdAt: "2026-11-20T00:00:00.000Z"
      },
      idempotency: {
        scope: "POST:/v1/accounts/acct-pg-102/second-factor-challenges",
        key: "synth-race-epoch-key-00001", fingerprint: "abc",
        responseStatus: 201, responseBodyJson: "{}", createdAt: "2026-11-20T00:00:00.000Z"
      }
    }),
    /writer_authority_denied/
  );
  assert.equal(await count(db, "platform_write_idempotency_keys"), 0);
  const row = await db.prepare(
    "SELECT COUNT(*) AS n FROM platform_portal_second_factor_challenges WHERE id = 'chal-synth-fenced-race'"
  ).first();
  assert.equal(row.n, 0);
});

test("authority singleton forbids skipped phases, epoch replay, deletion and unsafe rollback", async (t) => {
  const { mf, db } = await createWorker({ writerPhase: "BWH_ACTIVE" });
  t.after(() => mf.dispose());
  await assert.rejects(db.prepare(
    "UPDATE platform_writer_authority SET phase = 'D1_ACTIVE', authority = 'D1', epoch = 2 WHERE singleton = 1"
  ).run(), /writer_authority_transition_denied/);
  await assert.rejects(db.prepare(
    "UPDATE platform_writer_authority SET epoch = 1 WHERE singleton = 1"
  ).run(), /writer_authority_transition_denied/);
  await assert.rejects(db.prepare(
    "DELETE FROM platform_writer_authority WHERE singleton = 1"
  ).run(), /writer_authority_delete_denied/);
  await db.prepare(
    "UPDATE platform_writer_authority SET phase = 'FROZEN', epoch = 2 WHERE singleton = 1"
  ).run();
  await db.prepare(
    "UPDATE platform_writer_authority SET phase = 'D1_ACTIVE', authority = 'D1', epoch = 3 WHERE singleton = 1"
  ).run();
  await db.prepare(
    "UPDATE platform_writer_authority SET phase = 'RECOVERY', epoch = 4 WHERE singleton = 1"
  ).run();
  await assert.rejects(db.prepare(
    "UPDATE platform_writer_authority SET phase = 'BWH_ACTIVE', authority = 'BWH', epoch = 5 WHERE singleton = 1"
  ).run(), /writer_authority_transition_denied/);
  assert.equal((await db.prepare(
    "SELECT phase FROM platform_writer_authority WHERE singleton = 1"
  ).first()).phase, "RECOVERY");
});

test("authority singleton rejects replacement with recursive triggers disabled", async (t) => {
  const { mf, db } = await createWorker({ writerPhase: "BWH_ACTIVE" });
  t.after(() => mf.dispose());
  await db.prepare("PRAGMA recursive_triggers = OFF").run();
  const setting = await db.prepare("PRAGMA recursive_triggers").first();
  assert.equal(setting.recursive_triggers, 0);
  await assert.rejects(db.prepare(
    "INSERT OR REPLACE INTO platform_writer_authority " +
    "(singleton, authority, phase, epoch, changed_at) VALUES (1, 'D1', 'D1_ACTIVE', 1, 'synth')"
  ).run(), /writer_authority_insert_denied/);
  assert.deepEqual(await new WriterAuthorityRepository(db).current(), {
    authority: "BWH", phase: "BWH_ACTIVE", epoch: 1
  });
});

test("missing authority schema rejects writes before business transaction", async (t) => {
  const { mf, db } = await createWorker();
  t.after(() => mf.dispose());
  await db.prepare("DROP TABLE platform_writer_authority").run();
  const res = await post(mf);
  assert.equal(res.status, 503);
  assert.equal((await res.json()).error.code, "writer_authority_unavailable");
  assert.equal(await count(db, "platform_write_idempotency_keys"), 0);
});
