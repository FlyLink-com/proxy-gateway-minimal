// Local-only Durable Object state for revocable Portal sessions.
// It stores only opaque actor references and lifecycle timestamps; never
// provider tokens, email, passwords, TOTP material or browser cookies.

const MAX_SESSION_MS = 24 * 60 * 60 * 1000;
const ACTOR_KEYS = Object.freeze([
  "accountRef", "audience", "authTimeMs", "factors", "issuerRef", "sessionRef", "subjectRef",
]);

function json(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}

function exactKeys(value, expected) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const keys = Object.keys(value).sort();
  const wanted = [...expected].sort();
  return keys.length === wanted.length && keys.every((key, index) => key === wanted[index]);
}

function validOpaque(value, pattern) {
  return typeof value === "string" && pattern.test(value) && !value.includes("@");
}

function validActor(actor, nowMs, expiresAtMs) {
  if (!exactKeys(actor, ACTOR_KEYS)
    || actor.issuerRef !== "portal"
    || !validOpaque(actor.subjectRef, /^[A-Za-z0-9][A-Za-z0-9._|:/-]{0,191}$/u)
    || !validOpaque(actor.accountRef, /^[A-Za-z0-9][A-Za-z0-9_:/-]{0,127}$/u)
    || !validOpaque(actor.sessionRef, /^[A-Za-z0-9][A-Za-z0-9._-]{7,191}$/u)
    || actor.audience !== "flylink-control-plane"
    || !Number.isSafeInteger(actor.authTimeMs) || actor.authTimeMs < 0
    || actor.authTimeMs > nowMs + 30000 || actor.authTimeMs > expiresAtMs
    || !Array.isArray(actor.factors) || actor.factors.length !== 0) {
    return false;
  }
  return true;
}

async function readBody(request) {
  const raw = await request.text();
  if (raw.length > 8192) throw new Error("body_too_large");
  const value = JSON.parse(raw);
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("body_invalid");
  return value;
}

export class PortalAuthState {
  constructor(state) {
    this.state = state;
  }

  async fetch(request) {
    if (request.method !== "POST") return json(405, { error: "method_not_allowed" });
    let body;
    try { body = await readBody(request); } catch { return json(400, { error: "invalid_request" }); }
    const path = new URL(request.url).pathname;
    try {
      if (path === "/session/create") return await this.createSession(body);
      if (path === "/session/validate") return await this.validateSession(body);
      if (path === "/session/revoke") return await this.revokeSession(body);
      return json(404, { error: "not_found" });
    } catch {
      return json(503, { error: "state_unavailable" });
    }
  }

  async createSession(body) {
    if (!exactKeys(body, ["actor", "bindingRef", "createdAtMs", "expiresAtMs", "nowMs"])) {
      return json(400, { error: "invalid_session" });
    }
    const { actor, bindingRef, createdAtMs, expiresAtMs, nowMs } = body;
    if (!Number.isSafeInteger(nowMs) || nowMs < 0
      || !Number.isSafeInteger(createdAtMs) || createdAtMs < 0
      || !Number.isSafeInteger(expiresAtMs) || expiresAtMs <= nowMs || expiresAtMs <= createdAtMs
      || createdAtMs > nowMs + 30000 || expiresAtMs - createdAtMs > MAX_SESSION_MS
      || !validOpaque(bindingRef, /^[A-Za-z0-9][A-Za-z0-9._-]{7,127}$/u)
      || !validActor(actor, nowMs, expiresAtMs)) {
      return json(400, { error: "invalid_session" });
    }
    const record = {
      kind: "portal_session",
      bindingRef,
      actor: {
        issuerRef: actor.issuerRef,
        subjectRef: actor.subjectRef,
        accountRef: actor.accountRef,
        sessionRef: actor.sessionRef,
        authTimeMs: actor.authTimeMs,
        factors: [...actor.factors],
        audience: actor.audience,
      },
      createdAtMs,
      expiresAtMs,
    };
    let created = false;
    await this.state.storage.transaction(async (txn) => {
      if (await txn.get("record")) return;
      await txn.put("record", record);
      created = true;
    });
    if (!created) return json(409, { error: "session_exists" });
    try {
      await this.state.storage.setAlarm(expiresAtMs);
    } catch {
      await this.state.storage.delete("record");
      throw new Error("session_alarm_unavailable");
    }
    return json(201, { ok: true });
  }

  async validateSession(body) {
    if (!exactKeys(body, ["nowMs"]) || !Number.isSafeInteger(body.nowMs) || body.nowMs < 0) {
      return json(400, { error: "invalid_request" });
    }
    let record = null;
    await this.state.storage.transaction(async (txn) => {
      const current = await txn.get("record");
      if (!current || current.kind !== "portal_session") return;
      if (current.expiresAtMs <= body.nowMs) {
        await txn.delete("record");
        return;
      }
      record = current;
    });
    if (!record) {
      await this.state.storage.deleteAlarm();
      return json(401, { error: "session_invalid" });
    }
    return json(200, { actor: record.actor, bindingRef: record.bindingRef, expiresAtMs: record.expiresAtMs });
  }

  async revokeSession(body) {
    if (!exactKeys(body, [])) return json(400, { error: "invalid_request" });
    await this.state.storage.delete("record");
    await this.state.storage.deleteAlarm();
    return json(200, { ok: true });
  }

  async alarm() {
    await this.state.storage.deleteAll();
  }
}

export const PORTAL_AUTH_STATE_POLICY = Object.freeze({ maxSessionMs: MAX_SESSION_MS });
