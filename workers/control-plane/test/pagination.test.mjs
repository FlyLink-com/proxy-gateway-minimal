import assert from "node:assert/strict";
import test from "node:test";
import { AccountRepository } from "../src/repositories/account-repository.mjs";
import { encodeCursor, InvalidCursorError } from "../src/cursor.mjs";
import { createWorker, EXPECTED_ORDER, FIXTURE_ACCOUNTS } from "./helpers.mjs";

async function traverse(repo, limit, status = null) {
  const pages = [];
  let cursor = null;
  do {
    const page = await repo.listDirectory({ status, cursor, limit });
    pages.push(page);
    cursor = page.nextCursor;
  } while (cursor !== null);
  return pages;
}

test("same-timestamp groups have a stable, deterministic order", async (t) => {
  const { mf, db } = await createWorker();
  t.after(() => mf.dispose());
  const repo = new AccountRepository(db);

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const { items } = await repo.listDirectory({ limit: 100 });
    assert.deepEqual(items.map((row) => row.id), EXPECTED_ORDER);
  }
  // The five T1 rows share one timestamp; their order must be id DESC.
  const t1 = FIXTURE_ACCOUNTS.filter(
    (row) => row.createdAt === "2026-03-01T10:00:00.000Z",
  ).map((row) => row.id);
  assert.deepEqual(EXPECTED_ORDER.slice(0, 5), [...t1].sort().reverse());
});

test("continuous paging has no duplicates and no gaps", async (t) => {
  const { mf, db } = await createWorker();
  t.after(() => mf.dispose());
  const repo = new AccountRepository(db);

  const pages = await traverse(repo, 5);
  assert.deepEqual(pages.map((page) => page.items.length), [5, 5, 2]);
  const ids = pages.flatMap((page) => page.items.map((row) => row.id));
  assert.deepEqual(ids, EXPECTED_ORDER);
  assert.equal(new Set(ids).size, ids.length);
  for (const page of pages.slice(0, -1)) {
    assert.equal(typeof page.nextCursor, "string");
  }
});

test("the last page returns an empty next cursor, even when exactly full", async (t) => {
  const { mf, db } = await createWorker();
  t.after(() => mf.dispose());
  const repo = new AccountRepository(db);

  // 12 rows with limit 6: the second page is exactly full, yet the
  // limit+1 probe row is absent, so nextCursor must be null.
  const pages = await traverse(repo, 6);
  assert.deepEqual(pages.map((page) => page.items.length), [6, 6]);
  assert.equal(pages[1].nextCursor, null);

  const single = await repo.listDirectory({ limit: 12 });
  assert.equal(single.items.length, 12);
  assert.equal(single.nextCursor, null);
});

test("invalid cursors are rejected; a cursor at the last row yields an empty page", async (t) => {
  const { mf, db } = await createWorker();
  t.after(() => mf.dispose());
  const repo = new AccountRepository(db);

  const badCursors = [
    "",
    "not base64url!!",
    Buffer.from("[]", "utf8").toString("base64url"),
    Buffer.from('{"createdAt":"2026-03-01T10:00:00.000Z"}', "utf8").toString("base64url"),
    Buffer.from('{"createdAt":"2026-03-01","id":"acct-pg-101"}', "utf8").toString("base64url"),
    Buffer.from('{"createdAt":"2026-03-01T10:00:00.000Z","id":"bad id!"}', "utf8").toString("base64url"),
    Buffer.from('{"createdAt":"2026-03-01T10:00:00.000Z","id":"acct-pg-101","extra":1}', "utf8").toString("base64url"),
    `${encodeCursor({ createdAt: "2026-03-01T10:00:00.000Z", id: "acct-pg-101" })}=`,
    "A".repeat(513),
  ];
  for (const cursor of badCursors) {
    await assert.rejects(
      repo.listDirectory({ cursor, limit: 5 }),
      InvalidCursorError,
      `cursor should be rejected: ${cursor.slice(0, 40)}`,
    );
  }

  const lastRow = FIXTURE_ACCOUNTS[FIXTURE_ACCOUNTS.length - 1];
  const endCursor = encodeCursor({ createdAt: "2025-12-01T00:00:00.000Z", id: lastRow.id });
  const emptyPage = await repo.listDirectory({ cursor: endCursor, limit: 5 });
  assert.deepEqual(emptyPage.items, []);
  assert.equal(emptyPage.nextCursor, null);
});

test("limit boundaries behave at 1, N, and beyond N", async (t) => {
  const { mf, db } = await createWorker();
  t.after(() => mf.dispose());
  const repo = new AccountRepository(db);

  const one = await repo.listDirectory({ limit: 1 });
  assert.equal(one.items.length, 1);
  assert.equal(one.items[0].id, EXPECTED_ORDER[0]);
  assert.equal(typeof one.nextCursor, "string");

  const exact = await repo.listDirectory({ limit: FIXTURE_ACCOUNTS.length });
  assert.equal(exact.items.length, FIXTURE_ACCOUNTS.length);
  assert.equal(exact.nextCursor, null);

  const beyond = await repo.listDirectory({ limit: FIXTURE_ACCOUNTS.length + 50 });
  assert.equal(beyond.items.length, FIXTURE_ACCOUNTS.length);
  assert.equal(beyond.nextCursor, null);
});
