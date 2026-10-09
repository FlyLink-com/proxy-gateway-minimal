import { createHash } from "node:crypto";
import Database from "better-sqlite3";

export const NATIVE_SESSION_MIGRATION_ID = "20261006_native_refresh_grants_v1";
export const NATIVE_SESSION_MAX_SECONDS = 604800;
const TABLE = "platform_native_refresh_grants";
const EPOCHS = "platform_native_auth_epochs";
const stamp = "strftime('%Y-%m-%dT%H:%M:%fZ','now')";
function failure(code = "native_session_unavailable") {
  return Object.assign(new Error("Native session operation unavailable"), { code });
}
const revokeAccount = (account) => `
  insert into ${EPOCHS}(account_id, epoch) select ${account}, 1
    where exists (select 1 from platform_accounts where id = ${account})
    on conflict(account_id) do update set epoch = epoch + 1;
  update platform_portal_second_factor_challenges set status = 'locked', updated_at = ${stamp}
    where account_id = ${account} and status = 'active' and instr(challenge_hash, 'portalnative_mfa_v1_') = 1;
  update ${TABLE} set revoked_at = coalesce(revoked_at, ${stamp}) where account_id = ${account};
  update platform_portal_sessions set status = 'revoked', revoked_at = coalesce(revoked_at, ${stamp}), updated_at = ${stamp}
    where id in (select access_session_ref from ${TABLE} where account_id = ${account}) and status = 'active';`;
const definitions = [
  ["table", EPOCHS, `create table ${EPOCHS} (
    account_id text primary key references platform_accounts(id) on delete cascade,
    epoch integer not null check(typeof(epoch) = 'integer' and epoch >= 0)
  )`],
  ["table", TABLE, `create table ${TABLE} (
    token_hash text primary key check(length(token_hash) = 64 and token_hash not glob '*[^0-9a-f]*'),
    family_id text not null,
    generation integer not null check(generation >= 0),
    account_id text not null references platform_accounts(id) on delete cascade,
    access_session_ref text not null references platform_portal_sessions(id) on delete cascade,
    credential_binding text not null check(length(credential_binding) = 64),
    auth_issued_at text not null,
    expires_at text not null,
    created_at text not null,
    consumed_at text,
    revoked_at text,
    unique(family_id, generation)
  )`],
  ["index", "native_sessions_active_family_idx", `create unique index native_sessions_active_family_idx on ${TABLE}(family_id) where consumed_at is null and revoked_at is null`],
  ["index", "native_sessions_account_idx", `create index native_sessions_account_idx on ${TABLE}(account_id)`],
  ["index", "native_sessions_access_idx", `create index native_sessions_access_idx on ${TABLE}(access_session_ref)`],
  ["trigger", "native_sessions_account_state_revoke", `create trigger native_sessions_account_state_revoke
    after update of status on platform_accounts when new.status <> 'active'
    begin ${revokeAccount("new.id")} end`],
  ["trigger", "native_sessions_access_revoke", `create trigger native_sessions_access_revoke
    after update of status, revoked_at on platform_portal_sessions
    when (new.status = 'revoked' or new.revoked_at is not null) and old.status <> 'revoked' and old.revoked_at is null
    begin
      update ${TABLE} set revoked_at = coalesce(revoked_at, ${stamp})
        where family_id in (select family_id from ${TABLE} where access_session_ref = new.id);
      update platform_portal_sessions set status = 'revoked', revoked_at = coalesce(revoked_at, ${stamp}), updated_at = ${stamp}
        where id in (select access_session_ref from ${TABLE} where family_id in
          (select family_id from ${TABLE} where access_session_ref = new.id)) and status = 'active';
    end`],
  ["trigger", "native_sessions_access_delete", `create trigger native_sessions_access_delete
    before delete on platform_portal_sessions begin
      update ${TABLE} set revoked_at = coalesce(revoked_at, ${stamp})
        where family_id in (select family_id from ${TABLE} where access_session_ref = old.id);
      update platform_portal_sessions set status = 'revoked', revoked_at = coalesce(revoked_at, ${stamp}), updated_at = ${stamp}
        where id in (select access_session_ref from ${TABLE} where family_id in
          (select family_id from ${TABLE} where access_session_ref = old.id)) and status = 'active';
    end`],
];
for (const [kind, table, fields] of [
  ["password", "platform_portal_password_credentials", ["account_id", "password_hash", "status", "revoked_at", "locked_until", "must_rotate"]],
  ["totp", "platform_portal_totp_credentials", ["account_id", "encrypted_totp_secret", "status", "revoked_at", "locked_until"]],
  ["passkey", "platform_portal_passkey_credentials", ["account_id", "credential_id", "credential_id_hash", "public_key_jwk_json", "status", "revoked_at"]],
]) {
  const prefix = `native_sessions_${kind}`;
  definitions.push(
    ["trigger", `${prefix}_insert`, `create trigger ${prefix}_insert after insert on ${table}
      when new.status = 'active' begin ${revokeAccount("new.account_id")} end`],
    ["trigger", `${prefix}_update`, `create trigger ${prefix}_update after update of ${fields.join(", ")} on ${table}
      when ${fields.map(field => field === "locked_until"
        ? `(new.locked_until is not old.locked_until and new.locked_until is not null)`
        : `new.${field} is not old.${field}`).join(" or ")}
      begin ${revokeAccount("old.account_id")} ${revokeAccount("new.account_id")} end`],
    ["trigger", `${prefix}_delete`, `create trigger ${prefix}_delete after delete on ${table}
      begin ${revokeAccount("old.account_id")} end`],
  );
}
// SQLite canonicalizes only the leading CREATE keywords. Preserve the rest
// byte-for-byte: lowercasing or collapsing literal whitespace can change SQL.
const normalize = value => String(value).trim().replace(/;$/, "")
  .replace(/^create\s+(?:(unique)\s+)?(table|index|trigger)\b/i,
    (_, unique, kind) => `CREATE ${unique ? "UNIQUE " : ""}${kind.toUpperCase()}`);
export const NATIVE_SESSION_DDL_SHA256 = createHash("sha256").update(definitions.map(([, , sql]) => normalize(sql)).join("\n")).digest("hex");

// Inspection and runtime use never create, repair or upgrade schema.
export function inspectNativeSessionSchema({ database }) {
  let present = 0;
  let mismatched = 0;
  for (const [type, name, sql] of definitions) {
    const row = database.prepare("select type, sql from sqlite_master where name = ?").get(name);
    if (!row) continue;
    present++;
    if (row.type !== type || normalize(row.sql) !== normalize(sql)) mismatched++;
  }
  return { migrationId: NATIVE_SESSION_MIGRATION_ID, ddlSha256: NATIVE_SESSION_DDL_SHA256, ready: present === definitions.length && mismatched === 0,
    absent: present === 0, objectsPresent: present, objectsExpected: definitions.length, mismatched };
}

// Explicit operator/tool/test entry point. Never called by service construction.
export function applyNativeSessionMigration({ database }) {
  return database.transaction(() => {
    const before = inspectNativeSessionSchema({ database });
    if (before.ready) return before;
    if (!before.absent) throw failure("native_session_schema_conflict");
    for (const [, , sql] of definitions) database.exec(sql);
    const after = inspectNativeSessionSchema({ database });
    if (!after.ready) throw failure("native_session_schema_conflict");
    return after;
  }).immediate();
}

export function dryRunNativeSessionMigration({ database }) {
  const before = database.serialize();
  const copy = new Database(before);
  try {
    copy.pragma("foreign_keys = ON");
    const result = applyNativeSessionMigration({ database: copy });
    if (!before.equals(database.serialize())) throw failure("native_session_source_changed");
    return { ...result, mode: "dry-run", sourceChanged: false };
  } finally { copy.close(); }
}

export function createNativeSessionStore({ database: db }) {
  function requireReady() {
    if (!inspectNativeSessionSchema({ database: db }).ready) throw failure();
  }
  function credentialBinding(accountId) {
    const password = db.prepare("select id, password_hash, status, revoked_at, must_rotate from platform_portal_password_credentials where account_id = ? order by id").all(accountId);
    const totp = db.prepare("select id, encrypted_totp_secret, status, revoked_at from platform_portal_totp_credentials where account_id = ? order by id").all(accountId);
    const passkey = db.prepare("select id, credential_id, credential_id_hash, public_key_jwk_json, status, revoked_at from platform_portal_passkey_credentials where account_id = ? order by id").all(accountId);
    const epoch = db.prepare(`select epoch from ${EPOCHS} where account_id = ?`).get(accountId)?.epoch ?? 0;
    return createHash("sha256").update(JSON.stringify([epoch, password, totp, passkey])).digest("hex");
  }
  function revokeFamily(familyId, at) {
    db.prepare(`update ${TABLE} set revoked_at = coalesce(revoked_at, ?) where family_id = ?`).run(at, familyId);
    db.prepare(`update platform_portal_sessions set status = 'revoked', revoked_at = coalesce(revoked_at, ?), updated_at = ?
      where id in (select access_session_ref from ${TABLE} where family_id = ?) and status = 'active'`).run(at, at, familyId);
  }
  function insert(input) {
    db.prepare(`insert into ${TABLE} (token_hash, family_id, generation, account_id, access_session_ref, credential_binding,
      auth_issued_at, expires_at, created_at) values (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(input.tokenHash, input.familyId,
      input.generation, input.accountId, input.accessSessionRef, input.credentialBinding,
      input.authIssuedAt, input.expiresAt, input.createdAt);
  }
  function valid(row, at) {
    const ms = Date.parse(at);
    const issued = Date.parse(row.auth_issued_at);
    const expiry = Date.parse(row.expires_at);
    const created = Date.parse(row.created_at);
    const account = db.prepare("select status from platform_accounts where id = ?").get(row.account_id);
    const access = db.prepare("select status, revoked_at from platform_portal_sessions where id = ?").get(row.access_session_ref);
    return Number.isFinite(ms) && Number.isFinite(issued) && Number.isFinite(created)
      && expiry === issued + NATIVE_SESSION_MAX_SECONDS * 1000 && issued <= created && created <= ms && ms < expiry
      && account?.status === "active" && access && access.status !== "revoked" && !access.revoked_at
      && credentialBinding(row.account_id) === row.credential_binding;
  }
  return Object.freeze({
    requireReady,
    credentialBinding,
    revokeAccessIfPresent({ sessionRef, at }) {
      const schema = inspectNativeSessionSchema({ database: db });
      if (schema.absent) return;
      if (!schema.ready) throw failure();
      const families = db.prepare(`select distinct family_id from ${TABLE} where access_session_ref = ?`).all(sessionRef);
      for (const row of families) revokeFamily(row.family_id, at);
    },
    create(input) {
      requireReady();
      return db.transaction(() => {
        const account = db.prepare("select status from platform_accounts where id = ?").get(input.accountId);
        const access = db.prepare("select account_id, status, revoked_at, issued_at, expires_at from platform_portal_sessions where id = ?").get(input.accessSessionRef);
        if (account?.status !== "active" || access?.account_id !== input.accountId || access.status !== "active" || access.revoked_at
          || access.issued_at !== input.authIssuedAt || Date.parse(access.expires_at) <= Date.parse(input.createdAt)
          || credentialBinding(input.accountId) !== input.credentialBinding) throw failure("invalid_session");
        insert(input);
      }).immediate();
    },
    rotate({ tokenHash, nextTokenHash, at, createAccess }) {
      requireReady();
      return db.transaction(() => {
        const row = db.prepare(`select * from ${TABLE} where token_hash = ?`).get(tokenHash);
        if (!row) return null;
        if (row.consumed_at || row.revoked_at || !valid(row, at)) {
          revokeFamily(row.family_id, at);
          return null; // Commit revocation before the service throws its generic 401.
        }
        const changed = db.prepare(`update ${TABLE} set consumed_at = ? where token_hash = ? and consumed_at is null and revoked_at is null`).run(at, tokenHash);
        if (changed.changes !== 1) { revokeFamily(row.family_id, at); return null; }
        const session = createAccess(row);
        insert({ tokenHash: nextTokenHash, familyId: row.family_id, generation: row.generation + 1, accountId: row.account_id,
          accessSessionRef: session.sessionRef, credentialBinding: row.credential_binding, authIssuedAt: row.auth_issued_at,
          expiresAt: row.expires_at, createdAt: at });
        return { session, issuedAt: row.auth_issued_at, expiresAt: row.expires_at };
      }).immediate();
    },
    logout({ tokenHash, at }) {
      requireReady();
      db.transaction(() => {
        const row = db.prepare(`select family_id from ${TABLE} where token_hash = ?`).get(tokenHash);
        if (row) revokeFamily(row.family_id, at);
      }).immediate();
    },
  });
}
