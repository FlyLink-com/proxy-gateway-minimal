import assert from "node:assert/strict";
import test from "node:test";
import { createWorker, authHeaders, READ_TOKEN, EXPECTED_ORDER } from "./helpers.mjs";

const BASE = "http://control-plane.local";

test("healthz is open and returns JSON", async (t) => {
  const { mf } = await createWorker();
  t.after(() => mf.dispose());
  const res = await mf.dispatchFetch(`${BASE}/healthz`);
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.ok, true);
});

test("auth matrix: missing, malformed, wrong, and correct tokens", async (t) => {
  const { mf } = await createWorker();
  t.after(() => mf.dispose());

  const missing = await mf.dispatchFetch(`${BASE}/v1/accounts`);
  assert.equal(missing.status, 401);
  assert.equal((await missing.json()).error.code, "unauthorized");

  const wrongScheme = await mf.dispatchFetch(`${BASE}/v1/accounts`, {
    headers: { authorization: `Token ${READ_TOKEN}` },
  });
  assert.equal(wrongScheme.status, 401);

  const wrongToken = await mf.dispatchFetch(`${BASE}/v1/accounts`, {
    headers: { authorization: "Bearer synth-wrong-token" },
  });
  assert.equal(wrongToken.status, 401);

  const correct = await mf.dispatchFetch(`${BASE}/v1/accounts`, {
    headers: authHeaders(),
  });
  assert.equal(correct.status, 200);
});

test("fail-closed: without a configured token every protected request is 401", async (t) => {
  const { mf } = await createWorker({ withToken: false });
  t.after(() => mf.dispose());

  for (const headers of [{}, authHeaders(), { authorization: "Bearer anything" }]) {
    const res = await mf.dispatchFetch(`${BASE}/v1/accounts`, { headers });
    assert.equal(res.status, 401);
    const byId = await mf.dispatchFetch(`${BASE}/v1/accounts/acct-pg-101`, { headers });
    assert.equal(byId.status, 401);
  }
  const health = await mf.dispatchFetch(`${BASE}/healthz`);
  assert.equal(health.status, 200);
});

test("get account by id returns only the safe projection", async (t) => {
  const { mf } = await createWorker();
  t.after(() => mf.dispose());

  const res = await mf.dispatchFetch(`${BASE}/v1/accounts/acct-pg-101`, {
    headers: authHeaders(),
  });
  assert.equal(res.status, 200);
  const text = await res.text();
  const body = JSON.parse(text);
  assert.deepEqual(Object.keys(body.account).sort(), [
    "createdAt",
    "id",
    "status",
    "updatedAt",
  ]);
  assert.equal(body.account.id, "acct-pg-101");
  assert.ok(!text.includes("owner_ref"));
  assert.ok(!text.includes("owner-synth"));
  assert.ok(!text.includes("metadata"));
});

test("unknown account is 404 JSON; malformed id is 400 JSON", async (t) => {
  const { mf } = await createWorker();
  t.after(() => mf.dispose());

  const missing = await mf.dispatchFetch(`${BASE}/v1/accounts/acct-pg-999`, {
    headers: authHeaders(),
  });
  assert.equal(missing.status, 404);
  assert.equal((await missing.json()).error.code, "account_not_found");

  const malformed = await mf.dispatchFetch(
    `${BASE}/v1/accounts/${encodeURIComponent("bad id!")}`,
    { headers: authHeaders() },
  );
  assert.equal(malformed.status, 400);
  assert.equal((await malformed.json()).error.code, "invalid_query");
});

test("list endpoint paginates with nextCursor and validates input", async (t) => {
  const { mf } = await createWorker();
  t.after(() => mf.dispose());
  const headers = authHeaders();

  const page1Res = await mf.dispatchFetch(`${BASE}/v1/accounts?limit=5`, { headers });
  assert.equal(page1Res.status, 200);
  const page1 = await page1Res.json();
  assert.deepEqual(page1.items.map((row) => row.id), EXPECTED_ORDER.slice(0, 5));
  assert.equal(typeof page1.nextCursor, "string");

  const page2Res = await mf.dispatchFetch(
    `${BASE}/v1/accounts?limit=5&cursor=${encodeURIComponent(page1.nextCursor)}`,
    { headers },
  );
  assert.equal(page2Res.status, 200);
  const page2 = await page2Res.json();
  assert.deepEqual(page2.items.map((row) => row.id), EXPECTED_ORDER.slice(5, 10));

  const badCursor = await mf.dispatchFetch(`${BASE}/v1/accounts?cursor=zzz!!!`, { headers });
  assert.equal(badCursor.status, 400);
  assert.equal((await badCursor.json()).error.code, "invalid_query");

  for (const query of ["limit=0", "limit=101", "limit=abc", "status=bogus", "bogus=1"]) {
    const res = await mf.dispatchFetch(`${BASE}/v1/accounts?${query}`, { headers });
    assert.equal(res.status, 400, `query should be rejected: ${query}`);
  }

  const suspended = await mf.dispatchFetch(`${BASE}/v1/accounts?status=suspended`, {
    headers,
  });
  assert.equal(suspended.status, 200);
  const suspendedBody = await suspended.json();
  assert.deepEqual(
    suspendedBody.items.map((row) => row.id),
    ["acct-pg-103", "acct-pg-108"],
  );
});

test("unknown routes are 404 JSON and non-GET is 405 JSON", async (t) => {
  const { mf } = await createWorker();
  t.after(() => mf.dispose());

  const res = await mf.dispatchFetch(`${BASE}/nope`, { headers: authHeaders() });
  assert.equal(res.status, 404);
  assert.equal((await res.json()).error.code, "not_found");

  const post = await mf.dispatchFetch(`${BASE}/v1/accounts`, {
    method: "POST",
    headers: authHeaders(),
  });
  assert.equal(post.status, 405);
});
