import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

function ensureParentDirectory(dbPath) {
  if (dbPath && dbPath !== ":memory:") {
    mkdirSync(dirname(dbPath), { recursive: true });
  }
}

function mapTenant(row) {
  if (!row) return null;
  return {
    id: row.id,
    displayName: row.display_name,
    status: row.status,
    expiresAt: row.expires_at,
    note: row.note,
    nodeId: row.node_id,
    credentialMode: row.credential_mode,
    tokenPrefix: row.token_prefix,
    lastUsedAt: row.last_used_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function mapTenantAuth(row) {
  if (!row) return null;
  return {
    ...mapTenant(row),
    tokenHash: row.token_hash
  };
}

function mapTempLink(row) {
  if (!row) return null;
  return {
    id: row.id,
    tenantId: row.tenant_id,
    tokenPrefix: row.token_prefix,
    expiresAt: row.expires_at,
    usedAt: row.used_at,
    createdAt: row.created_at
  };
}

function mapTempLinkAuth(row) {
  if (!row) return null;
  return {
    id: row.temp_id,
    tenantId: row.temp_tenant_id,
    tokenHash: row.temp_token_hash,
    tokenPrefix: row.temp_token_prefix,
    expiresAt: row.temp_expires_at,
    usedAt: row.temp_used_at,
    createdAt: row.temp_created_at,
    tenant: mapTenantAuth({
      id: row.tenant_id,
      display_name: row.display_name,
      status: row.status,
      expires_at: row.tenant_expires_at,
      note: row.note,
      node_id: row.node_id,
      credential_mode: row.credential_mode,
      token_hash: row.tenant_token_hash,
      token_prefix: row.tenant_token_prefix,
      last_used_at: row.last_used_at,
      created_at: row.tenant_created_at,
      updated_at: row.updated_at
    })
  };
}

export function createSqliteSubscriptionStore({ dbPath, database } = {}) {
  if (!database && !dbPath) {
    throw new Error("dbPath or database is required");
  }

  ensureParentDirectory(dbPath);
  const ownsDatabase = !database;
  const db = database ?? new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.pragma("busy_timeout = 2000");
  db.exec(`
    create table if not exists subscription_tenants (
      id text primary key,
      display_name text not null,
      status text not null check (status in ('active', 'disabled')),
      expires_at text not null,
      note text not null default '',
      node_id text not null,
      credential_mode text not null check (credential_mode in ('shared-node')),
      token_hash text not null,
      token_prefix text not null,
      last_used_at text,
      created_at text not null,
      updated_at text not null
    );

    create unique index if not exists subscription_tenants_token_hash_idx
      on subscription_tenants(token_hash);
    create index if not exists subscription_tenants_status_idx
      on subscription_tenants(status);
    create index if not exists subscription_tenants_expires_at_idx
      on subscription_tenants(expires_at);

    create table if not exists subscription_audit_events (
      id text primary key,
      action text not null,
      tenant_id text,
      actor text not null,
      created_at text not null,
      metadata_json text not null default '{}'
    );

    create table if not exists subscription_temp_links (
      id text primary key,
      tenant_id text not null references subscription_tenants(id) on delete cascade,
      token_hash text not null,
      token_prefix text not null,
      expires_at text not null,
      used_at text,
      created_at text not null
    );

    create unique index if not exists subscription_temp_links_token_hash_idx
      on subscription_temp_links(token_hash);
    create index if not exists subscription_temp_links_tenant_id_idx
      on subscription_temp_links(tenant_id);
    create index if not exists subscription_temp_links_expires_at_idx
      on subscription_temp_links(expires_at);
  `);

  function listTenants() {
    return db.prepare(`
      select * from subscription_tenants
      order by created_at desc, display_name asc
    `).all().map(mapTenant);
  }

  function getTenant(id) {
    return mapTenant(db.prepare("select * from subscription_tenants where id = ?").get(id));
  }

  function findTenantByTokenHash(tokenHash) {
    return mapTenantAuth(db.prepare("select * from subscription_tenants where token_hash = ?").get(tokenHash));
  }

  function createTenant(input) {
    db.prepare(`
      insert into subscription_tenants (
        id, display_name, status, expires_at, note, node_id, credential_mode,
        token_hash, token_prefix, last_used_at, created_at, updated_at
      ) values (
        @id, @displayName, @status, @expiresAt, @note, @nodeId, @credentialMode,
        @tokenHash, @tokenPrefix, null, @now, @now
      )
    `).run(input);
    return getTenant(input.id);
  }

  function renewTenant(id, { expiresAt, now }) {
    const result = db.prepare(`
      update subscription_tenants
      set expires_at = ?, status = 'active', updated_at = ?
      where id = ?
    `).run(expiresAt, now, id);
    return result.changes === 1 ? getTenant(id) : null;
  }

  function setTenantStatus(id, { status, now }) {
    const result = db.prepare(`
      update subscription_tenants
      set status = ?, updated_at = ?
      where id = ?
    `).run(status, now, id);
    return result.changes === 1 ? getTenant(id) : null;
  }

  function resetTenantToken(id, { tokenHash, tokenPrefix, now }) {
    const result = db.prepare(`
      update subscription_tenants
      set token_hash = ?, token_prefix = ?, updated_at = ?
      where id = ?
    `).run(tokenHash, tokenPrefix, now, id);
    return result.changes === 1 ? getTenant(id) : null;
  }

  function markLastUsed(id, { now }) {
    const result = db.prepare(`
      update subscription_tenants
      set last_used_at = ?, updated_at = ?
      where id = ?
    `).run(now, now, id);
    return result.changes === 1 ? getTenant(id) : null;
  }

  function createTempLink(input) {
    db.prepare(`
      insert into subscription_temp_links (
        id, tenant_id, token_hash, token_prefix, expires_at, used_at, created_at
      ) values (
        @id, @tenantId, @tokenHash, @tokenPrefix, @expiresAt, null, @now
      )
    `).run(input);
    return mapTempLink(db.prepare("select * from subscription_temp_links where id = ?").get(input.id));
  }

  function findTempLinkByTokenHash(tokenHash) {
    return mapTempLinkAuth(db.prepare(`
      select
        l.id as temp_id,
        l.tenant_id as temp_tenant_id,
        l.token_hash as temp_token_hash,
        l.token_prefix as temp_token_prefix,
        l.expires_at as temp_expires_at,
        l.used_at as temp_used_at,
        l.created_at as temp_created_at,
        t.id as tenant_id,
        t.display_name,
        t.status,
        t.expires_at as tenant_expires_at,
        t.note,
        t.node_id,
        t.credential_mode,
        t.token_hash as tenant_token_hash,
        t.token_prefix as tenant_token_prefix,
        t.last_used_at,
        t.created_at as tenant_created_at,
        t.updated_at
      from subscription_temp_links l
      join subscription_tenants t on t.id = l.tenant_id
      where l.token_hash = ?
    `).get(tokenHash));
  }

  function markTempLinkUsed(id, { now }) {
    const result = db.prepare(`
      update subscription_temp_links
      set used_at = ?
      where id = ?
    `).run(now, id);

    if (result.changes !== 1) {
      return null;
    }

    return mapTempLink(db.prepare("select * from subscription_temp_links where id = ?").get(id));
  }

  function close() {
    if (ownsDatabase) {
      db.close();
    }
  }

  return {
    listTenants,
    getTenant,
    findTenantByTokenHash,
    createTenant,
    renewTenant,
    setTenantStatus,
    resetTenantToken,
    markLastUsed,
    createTempLink,
    findTempLinkByTokenHash,
    markTempLinkUsed,
    close
  };
}

export const createSubscriptionRepository = createSqliteSubscriptionStore;
