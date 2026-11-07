import assert from "node:assert/strict";
import test from "node:test";
import { AccountRepository } from "../src/repositories/account-repository.mjs";
import { createWorker, EXPECTED_ORDER } from "./helpers.mjs";

test("findById returns exactly the safe projection", async (t) => {
  const { mf, db } = await createWorker();
  t.after(() => mf.dispose());
  const repo = new AccountRepository(db);

  const account = await repo.findById("acct-pg-103");
  assert.deepEqual(Object.keys(account).sort(), [
    "createdAt",
    "id",
    "status",
    "updatedAt",
  ]);
  assert.deepEqual(account, {
    id: "acct-pg-103",
    status: "suspended",
    createdAt: "2026-03-01T10:00:00.000Z",
    updatedAt: "2026-03-01T10:00:00.000Z",
  });
});

test("findById returns null for an unknown account", async (t) => {
  const { mf, db } = await createWorker();
  t.after(() => mf.dispose());
  const repo = new AccountRepository(db);
  assert.equal(await repo.findById("acct-pg-999"), null);
});

test("listDirectory returns the full directory in contract order", async (t) => {
  const { mf, db } = await createWorker();
  t.after(() => mf.dispose());
  const repo = new AccountRepository(db);

  const { items, nextCursor } = await repo.listDirectory({ limit: 100 });
  assert.deepEqual(items.map((row) => row.id), EXPECTED_ORDER);
  assert.equal(nextCursor, null);
  for (const item of items) {
    assert.deepEqual(Object.keys(item).sort(), [
      "createdAt",
      "id",
      "status",
      "updatedAt",
    ]);
  }
});

test("listDirectory status filter only returns matching rows", async (t) => {
  const { mf, db } = await createWorker();
  t.after(() => mf.dispose());
  const repo = new AccountRepository(db);

  const { items, nextCursor } = await repo.listDirectory({
    status: "suspended",
    limit: 100,
  });
  assert.deepEqual(items.map((row) => row.id), ["acct-pg-103", "acct-pg-108"]);
  assert.equal(nextCursor, null);
});
