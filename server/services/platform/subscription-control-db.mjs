import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

const UNSAFE_FIELD_PARTS = [
  "email",
  "phone",
  "url",
  "token",
  "secret",
  "password",
  "credential",
  "raw",
  "yaml",
  "sspassword"
];

function platformError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function ensureParentDirectory(dbPath) {
  if (dbPath && dbPath !== ":memory:") {
    mkdirSync(dirname(dbPath), { recursive: true });
  }
}

function text(value) {
  return String(value ?? "").trim();
}

function requiredText(value, field) {
  const normalized = text(value);
  if (!normalized) {
    throw platformError("validation_error", `${field} is required`);
  }
  return normalized;
}

function optionalText(value) {
  const normalized = text(value);
  return normalized || null;
}

function integer(value, field, { min = 0 } = {}) {
  const normalized = Number(value);
  if (!Number.isInteger(normalized) || normalized < min) {
    throw platformError("validation_error", `${field} must be an integer >= ${min}`);
  }
  return normalized;
}

function isoText(value, field) {
  const raw = requiredText(value, field);
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) {
    throw platformError("validation_error", `${field} must be a valid ISO timestamp`);
  }
  return date.toISOString();
}

function optionalIsoText(value, field) {
  const raw = optionalText(value);
  if (!raw) {
    return null;
  }
  return isoText(raw, field);
}

function assertNoUnsafeFields(value, path = []) {
  if (value == null || typeof value !== "object") {
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertNoUnsafeFields(item, [...path, String(index)]));
    return;
  }
  for (const [key, nested] of Object.entries(value)) {
    const normalizedKey = String(key).toLowerCase();
    if (UNSAFE_FIELD_PARTS.some((part) => normalizedKey.includes(part))) {
      throw platformError("validation_error", "unsafe field is not allowed in subscription control database input");
    }
    assertNoUnsafeFields(nested, [...path, key]);
  }
}

function jsonObject(value, field) {
  if (value == null) {
    return "{}";
  }
  if (typeof value !== "object" || Array.isArray(value)) {
    throw platformError("validation_error", `${field} must be an object`);
  }
  return JSON.stringify(value);
}

function parseJsonObject(value) {
  if (!value) {
    return {};
  }
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function sqliteRun(statement, input) {
  try {
    return statement.run(input);
  } catch (error) {
    if (String(error.code || "").startsWith("SQLITE_CONSTRAINT")) {
      throw platformError("constraint_error", "subscription control database constraint failed");
    }
    throw error;
  }
}

function mapAccount(row) {
  if (!row) return null;
  return {
    id: row.id,
    ownerRef: row.owner_ref,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    metadata: parseJsonObject(row.metadata_json)
  };
}

function mapEntitlement(row) {
  if (!row) return null;
  const now = new Date();
  const validUntil = new Date(row.valid_until);
  return {
    id: row.id,
    accountId: row.account_id,
    plan: row.plan,
    status: row.status,
    validFrom: row.valid_from,
    validUntil: row.valid_until,
    maxArtifacts: row.max_artifacts,
    maxDevices: row.max_devices,
    trafficLimitBytes: row.traffic_limit_bytes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    usable: row.status === "active" && validUntil >= now
  };
}

function mapIssuanceRequest(row) {
  if (!row) return null;
  return {
    id: row.id,
    accountId: row.account_id,
    entitlementId: row.entitlement_id,
    approvalRef: row.approval_ref,
    status: row.status,
    quantity: row.quantity,
    nodeId: row.node_id,
    purpose: row.purpose,
    requestedByRef: row.requested_by_ref,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    metadata: parseJsonObject(row.metadata_json)
  };
}

function mapIssuedLink(row) {
  if (!row) return null;
  return {
    id: row.id,
    requestId: row.request_id,
    tenantRef: row.tenant_ref,
    artifactRef: row.artifact_ref,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function mapQuotaCounter(row) {
  if (!row) return null;
  return {
    accountId: row.account_id,
    entitlementId: row.entitlement_id,
    metric: row.metric,
    period: row.period,
    amount: row.amount,
    updatedAt: row.updated_at
  };
}

function mapDeviceBinding(row) {
  if (!row) return null;
  return {
    id: row.id,
    accountId: row.account_id,
    artifactRef: row.artifact_ref,
    deviceRef: row.device_ref,
    status: row.status,
    firstSeenAt: row.first_seen_at,
    lastSeenAt: row.last_seen_at
  };
}

function mapRevocationEvent(row) {
  if (!row) return null;
  return {
    id: row.id,
    requestId: row.request_id,
    issuedLinkId: row.issued_link_id,
    tenantRef: row.tenant_ref,
    artifactRef: row.artifact_ref,
    reasonCode: row.reason_code,
    revokedByRef: row.revoked_by_ref,
    createdAt: row.created_at
  };
}

function mapAuditEvent(row) {
  if (!row) return null;
  return {
    id: row.id,
    entityType: row.entity_type,
    entityRef: row.entity_ref,
    action: row.action,
    actorRef: row.actor_ref,
    createdAt: row.created_at,
    metadata: parseJsonObject(row.metadata_json)
  };
}

export function createSqliteSubscriptionControlStore({ dbPath, database } = {}) {
  if (!database && !dbPath) {
    throw new Error("dbPath or database is required");
  }

  ensureParentDirectory(dbPath);
  const ownsDatabase = !database;
  const db = database ?? new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.pragma("busy_timeout = 2000");
  db.pragma("foreign_keys = ON");
  db.exec(`
    create table if not exists platform_accounts (
      id text primary key,
      owner_ref text not null,
      status text not null check (status in ('active', 'suspended', 'disabled')),
      created_at text not null,
      updated_at text not null,
      metadata_json text not null default '{}'
    );

    create index if not exists platform_accounts_status_idx
      on platform_accounts(status);

    create table if not exists platform_entitlements (
      id text primary key,
      account_id text not null references platform_accounts(id) on delete cascade,
      plan text not null,
      status text not null check (status in ('active', 'expired', 'revoked', 'suspended')),
      valid_from text not null,
      valid_until text not null,
      max_artifacts integer not null default 1,
      max_devices integer not null default 1,
      traffic_limit_bytes integer not null default 0,
      created_at text not null,
      updated_at text not null
    );

    create index if not exists platform_entitlements_account_id_idx
      on platform_entitlements(account_id);
    create index if not exists platform_entitlements_status_idx
      on platform_entitlements(status);

    create table if not exists platform_issuance_requests (
      id text primary key,
      account_id text not null references platform_accounts(id) on delete cascade,
      entitlement_id text not null references platform_entitlements(id) on delete cascade,
      approval_ref text not null,
      status text not null check (status in ('planned', 'issued', 'failed', 'revoked', 'cancelled')),
      quantity integer not null check (quantity > 0),
      node_id text not null,
      purpose text not null,
      requested_by_ref text not null,
      created_at text not null,
      updated_at text not null,
      metadata_json text not null default '{}'
    );

    create index if not exists platform_issuance_requests_account_id_idx
      on platform_issuance_requests(account_id);
    create index if not exists platform_issuance_requests_entitlement_id_idx
      on platform_issuance_requests(entitlement_id);
    create index if not exists platform_issuance_requests_status_idx
      on platform_issuance_requests(status);

    create table if not exists platform_issued_subscription_links (
      id text primary key,
      request_id text not null references platform_issuance_requests(id) on delete cascade,
      tenant_ref text not null,
      artifact_ref text not null,
      status text not null check (status in ('active', 'revoked', 'rotated', 'disabled')),
      created_at text not null,
      updated_at text not null
    );

    create index if not exists platform_issued_subscription_links_request_id_idx
      on platform_issued_subscription_links(request_id);
    create index if not exists platform_issued_subscription_links_status_idx
      on platform_issued_subscription_links(status);

    create table if not exists platform_quota_counters (
      account_id text not null references platform_accounts(id) on delete cascade,
      entitlement_id text not null references platform_entitlements(id) on delete cascade,
      metric text not null,
      period text not null,
      amount integer not null default 0,
      updated_at text not null,
      primary key (account_id, entitlement_id, metric, period)
    );

    create table if not exists platform_device_bindings (
      id text primary key,
      account_id text not null references platform_accounts(id) on delete cascade,
      artifact_ref text not null,
      device_ref text not null,
      status text not null check (status in ('active', 'blocked', 'released')),
      first_seen_at text not null,
      last_seen_at text not null
    );

    create index if not exists platform_device_bindings_account_id_idx
      on platform_device_bindings(account_id);
    create index if not exists platform_device_bindings_artifact_ref_idx
      on platform_device_bindings(artifact_ref);

    create table if not exists platform_revocation_events (
      id text primary key,
      request_id text not null references platform_issuance_requests(id) on delete cascade,
      issued_link_id text references platform_issued_subscription_links(id) on delete set null,
      tenant_ref text not null,
      artifact_ref text not null,
      reason_code text not null,
      revoked_by_ref text not null,
      created_at text not null
    );

    create index if not exists platform_revocation_events_request_id_idx
      on platform_revocation_events(request_id);

    create table if not exists platform_audit_events (
      id text primary key,
      entity_type text not null,
      entity_ref text not null,
      action text not null,
      actor_ref text not null,
      created_at text not null,
      metadata_json text not null default '{}'
    );

    create index if not exists platform_audit_events_entity_ref_idx
      on platform_audit_events(entity_ref);
  `);

  function createAccount(input) {
    assertNoUnsafeFields(input);
    const record = {
      id: requiredText(input.id, "id"),
      ownerRef: requiredText(input.ownerRef, "ownerRef"),
      status: requiredText(input.status || "active", "status"),
      createdAt: isoText(input.createdAt, "createdAt"),
      updatedAt: isoText(input.updatedAt, "updatedAt"),
      metadataJson: jsonObject(input.metadata, "metadata")
    };
    sqliteRun(db.prepare(`
      insert into platform_accounts (
        id, owner_ref, status, created_at, updated_at, metadata_json
      ) values (
        @id, @ownerRef, @status, @createdAt, @updatedAt, @metadataJson
      )
    `), record);
    return getAccount(record.id);
  }

  function getAccount(id) {
    return mapAccount(db.prepare("select * from platform_accounts where id = ?").get(requiredText(id, "id")));
  }

  function createEntitlement(input) {
    assertNoUnsafeFields(input);
    const record = {
      id: requiredText(input.id, "id"),
      accountId: requiredText(input.accountId, "accountId"),
      plan: requiredText(input.plan, "plan"),
      status: requiredText(input.status || "active", "status"),
      validFrom: isoText(input.validFrom, "validFrom"),
      validUntil: isoText(input.validUntil, "validUntil"),
      maxArtifacts: integer(input.maxArtifacts ?? 1, "maxArtifacts", { min: 1 }),
      maxDevices: integer(input.maxDevices ?? 1, "maxDevices", { min: 1 }),
      trafficLimitBytes: integer(input.trafficLimitBytes ?? 0, "trafficLimitBytes", { min: 0 }),
      createdAt: isoText(input.createdAt, "createdAt"),
      updatedAt: isoText(input.updatedAt, "updatedAt")
    };
    sqliteRun(db.prepare(`
      insert into platform_entitlements (
        id, account_id, plan, status, valid_from, valid_until,
        max_artifacts, max_devices, traffic_limit_bytes, created_at, updated_at
      ) values (
        @id, @accountId, @plan, @status, @validFrom, @validUntil,
        @maxArtifacts, @maxDevices, @trafficLimitBytes, @createdAt, @updatedAt
      )
    `), record);
    return getEntitlement(record.id);
  }

  function getEntitlement(id) {
    return mapEntitlement(db.prepare("select * from platform_entitlements where id = ?").get(requiredText(id, "id")));
  }

  function createIssuanceRequest(input) {
    assertNoUnsafeFields(input);
    const record = {
      id: requiredText(input.id, "id"),
      accountId: requiredText(input.accountId, "accountId"),
      entitlementId: requiredText(input.entitlementId, "entitlementId"),
      approvalRef: requiredText(input.approvalRef, "approvalRef"),
      status: requiredText(input.status || "planned", "status"),
      quantity: integer(input.quantity ?? 1, "quantity", { min: 1 }),
      nodeId: requiredText(input.nodeId, "nodeId"),
      purpose: requiredText(input.purpose, "purpose"),
      requestedByRef: requiredText(input.requestedByRef, "requestedByRef"),
      createdAt: isoText(input.createdAt, "createdAt"),
      updatedAt: isoText(input.updatedAt, "updatedAt"),
      metadataJson: jsonObject(input.metadata, "metadata")
    };
    sqliteRun(db.prepare(`
      insert into platform_issuance_requests (
        id, account_id, entitlement_id, approval_ref, status, quantity, node_id,
        purpose, requested_by_ref, created_at, updated_at, metadata_json
      ) values (
        @id, @accountId, @entitlementId, @approvalRef, @status, @quantity, @nodeId,
        @purpose, @requestedByRef, @createdAt, @updatedAt, @metadataJson
      )
    `), record);
    return getIssuanceRequest(record.id);
  }

  function getIssuanceRequest(id) {
    return mapIssuanceRequest(db.prepare("select * from platform_issuance_requests where id = ?").get(requiredText(id, "id")));
  }

  function setIssuanceRequestStatus(id, { status, updatedAt }) {
    assertNoUnsafeFields({ status, updatedAt });
    const result = db.prepare(`
      update platform_issuance_requests
      set status = ?, updated_at = ?
      where id = ?
    `).run(requiredText(status, "status"), isoText(updatedAt, "updatedAt"), requiredText(id, "id"));
    if (result.changes !== 1) {
      throw platformError("not_found", "issuance request not found");
    }
    return getIssuanceRequest(id);
  }

  function linkIssuedSubscription(input) {
    assertNoUnsafeFields(input);
    const record = {
      id: requiredText(input.id, "id"),
      requestId: requiredText(input.requestId, "requestId"),
      tenantRef: requiredText(input.tenantRef, "tenantRef"),
      artifactRef: requiredText(input.artifactRef, "artifactRef"),
      status: requiredText(input.status || "active", "status"),
      createdAt: isoText(input.createdAt, "createdAt"),
      updatedAt: isoText(input.updatedAt, "updatedAt")
    };
    sqliteRun(db.prepare(`
      insert into platform_issued_subscription_links (
        id, request_id, tenant_ref, artifact_ref, status, created_at, updated_at
      ) values (
        @id, @requestId, @tenantRef, @artifactRef, @status, @createdAt, @updatedAt
      )
    `), record);
    return getIssuedLink(record.id);
  }

  function getIssuedLink(id) {
    return mapIssuedLink(db.prepare("select * from platform_issued_subscription_links where id = ?").get(requiredText(id, "id")));
  }

  function setIssuedLinkStatus(id, { status, updatedAt }) {
    assertNoUnsafeFields({ status, updatedAt });
    const result = db.prepare(`
      update platform_issued_subscription_links
      set status = ?, updated_at = ?
      where id = ?
    `).run(requiredText(status, "status"), isoText(updatedAt, "updatedAt"), requiredText(id, "id"));
    if (result.changes !== 1) {
      throw platformError("not_found", "issued link not found");
    }
    return getIssuedLink(id);
  }

  function upsertQuotaCounter(input) {
    assertNoUnsafeFields(input);
    const record = {
      accountId: requiredText(input.accountId, "accountId"),
      entitlementId: requiredText(input.entitlementId, "entitlementId"),
      metric: requiredText(input.metric, "metric"),
      period: requiredText(input.period, "period"),
      amount: integer(input.amount ?? 0, "amount", { min: 0 }),
      updatedAt: isoText(input.updatedAt, "updatedAt")
    };
    sqliteRun(db.prepare(`
      insert into platform_quota_counters (
        account_id, entitlement_id, metric, period, amount, updated_at
      ) values (
        @accountId, @entitlementId, @metric, @period, @amount, @updatedAt
      )
      on conflict(account_id, entitlement_id, metric, period)
      do update set
        amount = platform_quota_counters.amount + excluded.amount,
        updated_at = excluded.updated_at
    `), record);
    return mapQuotaCounter(db.prepare(`
      select * from platform_quota_counters
      where account_id = ? and entitlement_id = ? and metric = ? and period = ?
    `).get(record.accountId, record.entitlementId, record.metric, record.period));
  }

  function bindDevice(input) {
    assertNoUnsafeFields(input);
    const record = {
      id: requiredText(input.id, "id"),
      accountId: requiredText(input.accountId, "accountId"),
      artifactRef: requiredText(input.artifactRef, "artifactRef"),
      deviceRef: requiredText(input.deviceRef, "deviceRef"),
      status: requiredText(input.status || "active", "status"),
      firstSeenAt: isoText(input.firstSeenAt, "firstSeenAt"),
      lastSeenAt: isoText(input.lastSeenAt, "lastSeenAt")
    };
    sqliteRun(db.prepare(`
      insert into platform_device_bindings (
        id, account_id, artifact_ref, device_ref, status, first_seen_at, last_seen_at
      ) values (
        @id, @accountId, @artifactRef, @deviceRef, @status, @firstSeenAt, @lastSeenAt
      )
    `), record);
    return getDeviceBinding(record.id);
  }

  function getDeviceBinding(id) {
    return mapDeviceBinding(db.prepare("select * from platform_device_bindings where id = ?").get(requiredText(id, "id")));
  }

  function recordRevocation(input) {
    assertNoUnsafeFields(input);
    const record = {
      id: requiredText(input.id, "id"),
      requestId: requiredText(input.requestId, "requestId"),
      issuedLinkId: optionalText(input.issuedLinkId),
      tenantRef: requiredText(input.tenantRef, "tenantRef"),
      artifactRef: requiredText(input.artifactRef, "artifactRef"),
      reasonCode: requiredText(input.reasonCode, "reasonCode"),
      revokedByRef: requiredText(input.revokedByRef, "revokedByRef"),
      createdAt: isoText(input.createdAt, "createdAt")
    };
    sqliteRun(db.prepare(`
      insert into platform_revocation_events (
        id, request_id, issued_link_id, tenant_ref, artifact_ref,
        reason_code, revoked_by_ref, created_at
      ) values (
        @id, @requestId, @issuedLinkId, @tenantRef, @artifactRef,
        @reasonCode, @revokedByRef, @createdAt
      )
    `), record);
    return getRevocationEvent(record.id);
  }

  function getRevocationEvent(id) {
    return mapRevocationEvent(db.prepare("select * from platform_revocation_events where id = ?").get(requiredText(id, "id")));
  }

  function recordAuditEvent(input) {
    assertNoUnsafeFields(input);
    const record = {
      id: requiredText(input.id, "id"),
      entityType: requiredText(input.entityType, "entityType"),
      entityRef: requiredText(input.entityRef, "entityRef"),
      action: requiredText(input.action, "action"),
      actorRef: requiredText(input.actorRef, "actorRef"),
      createdAt: isoText(input.createdAt, "createdAt"),
      metadataJson: jsonObject(input.metadata, "metadata")
    };
    sqliteRun(db.prepare(`
      insert into platform_audit_events (
        id, entity_type, entity_ref, action, actor_ref, created_at, metadata_json
      ) values (
        @id, @entityType, @entityRef, @action, @actorRef, @createdAt, @metadataJson
      )
    `), record);
    return getAuditEvent(record.id);
  }

  function getAuditEvent(id) {
    return mapAuditEvent(db.prepare("select * from platform_audit_events where id = ?").get(requiredText(id, "id")));
  }

  function getAccountControlSummary(accountId) {
    const account = getAccount(accountId);
    if (!account) {
      throw platformError("not_found", "account not found");
    }
    const entitlements = db.prepare(`
      select * from platform_entitlements
      where account_id = ?
      order by created_at asc, id asc
    `).all(account.id).map(mapEntitlement);
    const issuanceRequests = db.prepare(`
      select * from platform_issuance_requests
      where account_id = ?
      order by created_at asc, id asc
    `).all(account.id).map(mapIssuanceRequest);
    const requestIds = issuanceRequests.map((request) => request.id);
    const issuedLinks = requestIds.length
      ? db.prepare(`
          select * from platform_issued_subscription_links
          where request_id in (${requestIds.map(() => "?").join(",")})
          order by created_at asc, id asc
        `).all(...requestIds).map(mapIssuedLink)
      : [];
    const quotaCounters = db.prepare(`
      select * from platform_quota_counters
      where account_id = ?
      order by period asc, metric asc
    `).all(account.id).map(mapQuotaCounter);
    const deviceBindings = db.prepare(`
      select * from platform_device_bindings
      where account_id = ?
      order by first_seen_at asc, id asc
    `).all(account.id).map(mapDeviceBinding);
    const revocationEvents = requestIds.length
      ? db.prepare(`
          select * from platform_revocation_events
          where request_id in (${requestIds.map(() => "?").join(",")})
          order by created_at asc, id asc
        `).all(...requestIds).map(mapRevocationEvent)
      : [];
    const entityRefs = [
      account.id,
      ...entitlements.map((entitlement) => entitlement.id),
      ...requestIds,
      ...issuedLinks.map((link) => link.id),
      ...revocationEvents.map((event) => event.id)
    ];
    const auditEvents = entityRefs.length
      ? db.prepare(`
          select * from platform_audit_events
          where entity_ref in (${entityRefs.map(() => "?").join(",")})
          order by created_at asc, id asc
        `).all(...entityRefs).map(mapAuditEvent)
      : [];

    return {
      type: "subscription_control_account_summary",
      account,
      entitlements,
      issuanceRequests,
      issuedLinks,
      quotaCounters,
      deviceBindings,
      revocationEvents,
      auditEvents,
      safety: {
        summaryOnly: true,
        rawCustomerDataReturned: false,
        rawDeliveryLinkReturned: false,
        rawSecretReturned: false
      }
    };
  }

  function close() {
    if (ownsDatabase) {
      db.close();
    }
  }

  return {
    createAccount,
    getAccount,
    createEntitlement,
    getEntitlement,
    createIssuanceRequest,
    getIssuanceRequest,
    setIssuanceRequestStatus,
    linkIssuedSubscription,
    getIssuedLink,
    setIssuedLinkStatus,
    upsertQuotaCounter,
    bindDevice,
    getDeviceBinding,
    recordRevocation,
    getRevocationEvent,
    recordAuditEvent,
    getAuditEvent,
    getAccountControlSummary,
    close
  };
}
