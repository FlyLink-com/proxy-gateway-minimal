import assert from "node:assert/strict";
import test from "node:test";
import { PortalAuthState } from "../src/portal-auth-state.mjs";

class Storage {
  constructor() { this.data = new Map(); this.alarm = null; this.queue = Promise.resolve(); }
  get(key) { return Promise.resolve(this.data.get(key)); }
  put(key, value) { this.data.set(key, structuredClone(value)); return Promise.resolve(); }
  delete(key) { return Promise.resolve(this.data.delete(key)); }
  deleteAll() { this.data.clear(); return Promise.resolve(); }
  setAlarm(at) { this.alarm = at; return Promise.resolve(); }
  deleteAlarm() { this.alarm = null; return Promise.resolve(); }
  transaction(fn) {
    const run = this.queue.then(() => fn({
      get: (key) => Promise.resolve(this.data.get(key)),
      put: (key, value) => { this.data.set(key, structuredClone(value)); return Promise.resolve(); },
      delete: (key) => Promise.resolve(this.data.delete(key)),
    }));
    this.queue = run.catch(() => {});
    return run;
  }
}

const now = 1_798_000_000_000;
const actor = {
  issuerRef: "portal",
  subjectRef: "auth0|portal-synthetic-001",
  accountRef: "acct-synthetic-001",
  sessionRef: "sess_synthetic-session-001",
  issuedAtMs: now - 2000,
  authTimeMs: null,
  factors: [],
  audience: "flylink-control-plane",
};

function request(path, body) {
  return new Request(`https://portal-auth-state.internal${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

test("PortalAuthState stores a strict opaque actor, validates expiry and revokes once", async () => {
  const storage = new Storage();
  const object = new PortalAuthState({ storage }, {});
  const created = await object.fetch(request("/session/create", {
    actor, bindingRef: "idb_synthetic-binding-001", createdAtMs: now, expiresAtMs: now + 60_000, nowMs: now,
  }));
  assert.equal(created.status, 201);
  assert.equal(storage.alarm, now + 60_000);
  const stored = storage.data.get("record");
  assert.equal(JSON.stringify(stored).includes("@"), false);
  assert.equal(JSON.stringify(stored).includes("email"), false);
  assert.equal(stored.actor.issuedAtMs, actor.issuedAtMs);
  assert.equal(stored.actor.authTimeMs, null);

  const duplicate = await object.fetch(request("/session/create", {
    actor, bindingRef: "idb_synthetic-binding-001", createdAtMs: now, expiresAtMs: now + 60_000, nowMs: now,
  }));
  assert.equal(duplicate.status, 409);
  const valid = await object.fetch(request("/session/validate", { nowMs: now + 1000 }));
  assert.equal(valid.status, 200);
  assert.deepEqual((await valid.json()).actor, actor);

  const revoke = await object.fetch(request("/session/revoke", {}));
  assert.equal(revoke.status, 200);
  assert.equal(storage.alarm, null);
  const invalid = await object.fetch(request("/session/validate", { nowMs: now + 2000 }));
  assert.equal(invalid.status, 401);
});

test("PortalAuthState accepts null authTimeMs and rejects invalid issuance or authentication timestamps", async () => {
  const invalidCases = [
    { actor: { ...actor, issuedAtMs: -1 } },
    { actor: { ...actor, issuedAtMs: now + 30_001 } },
    { actor: { ...actor, issuedAtMs: now + 25_000 }, expiresAtMs: now + 20_000 },
    { actor: { ...actor, authTimeMs: -1 } },
    { actor: { ...actor, authTimeMs: now + 30_001 } },
  ];
  for (const candidate of invalidCases) {
    const object = new PortalAuthState({ storage: new Storage() }, {});
    const created = await object.fetch(request("/session/create", {
      actor: candidate.actor,
      bindingRef: "idb_synthetic-binding-001",
      createdAtMs: now,
      expiresAtMs: candidate.expiresAtMs ?? now + 60_000,
      nowMs: now,
    }));
    assert.equal(created.status, 400);
  }
});

test("PortalAuthState rejects unknown actor fields and expired or overlong sessions", async () => {
  const object = new PortalAuthState({ storage: new Storage() }, {});
  const invalidActor = await object.fetch(request("/session/create", {
    actor: { ...actor, email: "private@example.test" },
    bindingRef: "idb_synthetic-binding-001",
    createdAtMs: now, expiresAtMs: now + 60_000, nowMs: now,
  }));
  assert.equal(invalidActor.status, 400);
  const expired = await object.fetch(request("/session/create", {
    actor, bindingRef: "idb_synthetic-binding-001", createdAtMs: now, expiresAtMs: now, nowMs: now,
  }));
  assert.equal(expired.status, 400);
  const tooLong = await object.fetch(request("/session/create", {
    actor, bindingRef: "idb_synthetic-binding-001", createdAtMs: now, expiresAtMs: now + 24 * 60 * 60 * 1000 + 1, nowMs: now,
  }));
  assert.equal(tooLong.status, 400);
});
