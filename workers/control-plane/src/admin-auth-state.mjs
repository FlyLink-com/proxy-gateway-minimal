// Per-transaction and per-session state for the Admin Universal Login BFF.
// This Durable Object is source-only until a separate Cloudflare resource gate.
// It stores no provider tokens, passwords, OTPs, authorization codes, or raw cookies.

const TX_TTL_MS = 5 * 60 * 1000;
const SESSION_TTL_MS = 15 * 60 * 1000;

function json(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}
async function readBody(request) {
  const raw = await request.text();
  if (raw.length > 8192) throw new Error("body_too_large");
  const value = JSON.parse(raw);
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("invalid_body");
  return value;
}
function validHash(value) { return typeof value === "string" && /^[a-f0-9]{64}$/.test(value); }
function finiteTime(value) { return Number.isSafeInteger(value) && value > 0; }

export class AdminAuthState {
  constructor(state, env) {
    this.state = state;
    this.env = env;
  }

  async fetch(request) {
    if (request.method !== "POST") return json(405, { error: "method_not_allowed" });
    const path = new URL(request.url).pathname;
    let body;
    try { body = await readBody(request); } catch { return json(400, { error: "invalid_request" }); }

    try {
      if (path === "/transaction/create") return await this.createTransaction(body);
      if (path === "/transaction/consume") return await this.consumeTransaction(body);
      if (path === "/session/create") return await this.createSession(body);
      if (path === "/session/validate") return await this.validateSession(body);
      if (path === "/session/revoke") return await this.revokeSession();
      return json(404, { error: "not_found" });
    } catch {
      return json(503, { error: "state_unavailable" });
    }
  }

  async createTransaction(body) {
    const now = Date.now();
    if (!validHash(body.stateHash) || typeof body.nonce !== "string" || body.nonce.length < 32
      || typeof body.encryptedVerifier !== "string" || body.encryptedVerifier.length > 2048
      || !finiteTime(body.createdAt) || !finiteTime(body.expiresAt)
      || body.createdAt > now + 30000 || body.expiresAt <= now
      || body.expiresAt - body.createdAt > TX_TTL_MS) {
      return json(400, { error: "invalid_transaction" });
    }
    const record = {
      kind: "transaction",
      stateHash: body.stateHash,
      nonce: body.nonce,
      encryptedVerifier: body.encryptedVerifier,
      redirectUri: body.redirectUri,
      createdAt: body.createdAt,
      expiresAt: body.expiresAt,
    };
    let created = false;
    await this.state.storage.transaction(async (txn) => {
      if (await txn.get("record")) return;
      await txn.put("record", record);
      created = true;
    });
    if (!created) return json(409, { error: "transaction_exists" });
    await this.state.storage.setAlarm(record.expiresAt);
    return json(201, { ok: true });
  }

  async consumeTransaction(body) {
    if (!validHash(body.stateHash)) return json(400, { error: "invalid_transaction" });
    const now = finiteTime(body.now) ? body.now : Date.now();
    let record = null;
    await this.state.storage.transaction(async (txn) => {
      const current = await txn.get("record");
      if (!current || current.kind !== "transaction" || current.stateHash !== body.stateHash) return;
      await txn.delete("record");
      if (current.expiresAt > now) record = current;
    });
    await this.state.storage.deleteAlarm();
    if (!record) return json(401, { error: "transaction_invalid" });
    return json(200, { transaction: record });
  }

  async createSession(body) {
    const now = Date.now();
    const actor = body.actor;
    if (!actor || actor.surface !== "admin" || typeof actor.issuer !== "string"
      || typeof actor.subject !== "string" || typeof actor.clientId !== "string"
      || !Array.isArray(actor.scopes) || actor.scopes.length > 32
      || !finiteTime(body.mfaVerifiedAt) || !finiteTime(body.authTime)
      || !finiteTime(body.createdAt) || !finiteTime(body.expiresAt)
      || body.createdAt > now + 30000 || body.expiresAt <= now
      || body.expiresAt - body.createdAt > SESSION_TTL_MS
      || body.mfaVerifiedAt > now + 30000 || now - body.mfaVerifiedAt > 5 * 60 * 1000
      || body.authTime > now + 30000 || now - body.authTime > 5 * 60 * 1000) {
      return json(400, { error: "invalid_session" });
    }
    const record = {
      kind: "session",
      actor: {
        surface: "admin",
        issuer: actor.issuer,
        subject: actor.subject,
        clientId: actor.clientId,
        scopes: actor.scopes,
      },
      mfaVerifiedAt: body.mfaVerifiedAt,
      authTime: body.authTime,
      createdAt: body.createdAt,
      expiresAt: body.expiresAt,
    };
    let created = false;
    await this.state.storage.transaction(async (txn) => {
      if (await txn.get("record")) return;
      await txn.put("record", record);
      created = true;
    });
    if (!created) return json(409, { error: "session_exists" });
    await this.state.storage.setAlarm(record.expiresAt);
    return json(201, { ok: true });
  }

  async validateSession(body) {
    const now = finiteTime(body.now) ? body.now : Date.now();
    let record = null;
    await this.state.storage.transaction(async (txn) => {
      const current = await txn.get("record");
      if (!current || current.kind !== "session") return;
      if (current.expiresAt <= now) {
        await txn.delete("record");
        return;
      }
      record = current;
    });
    if (!record) {
      await this.state.storage.deleteAlarm();
      return json(401, { error: "session_invalid" });
    }
    return json(200, { actor: record.actor, mfaVerifiedAt: record.mfaVerifiedAt, authTime: record.authTime, expiresAt: record.expiresAt });
  }

  async revokeSession() {
    await this.state.storage.delete("record");
    await this.state.storage.deleteAlarm();
    return json(200, { ok: true });
  }

  async alarm() {
    await this.state.storage.deleteAll();
  }
}

export const ADMIN_AUTH_STATE_TTLS = Object.freeze({ transactionMs: TX_TTL_MS, sessionMs: SESSION_TTL_MS });
