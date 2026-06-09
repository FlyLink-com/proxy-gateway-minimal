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

function jsonArray(value, field) {
  if (value == null) {
    return "[]";
  }
  if (!Array.isArray(value)) {
    throw platformError("validation_error", `${field} must be an array`);
  }
  return JSON.stringify(value);
}

function parseJsonArray(value) {
  if (!value) {
    return [];
  }
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
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

function ensureTableColumns(db, tableName, columns) {
  const existing = new Set(db.prepare(`pragma table_info(${tableName})`).all().map((column) => column.name));
  for (const column of columns) {
    if (!existing.has(column.name)) {
      db.exec(`alter table ${tableName} add column ${column.definition}`);
      existing.add(column.name);
    }
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

function mapIssuedSubscriptionBinding(row) {
  if (!row) return null;
  return {
    id: row.link_id,
    linkId: row.link_id,
    requestId: row.request_id,
    accountId: row.account_id,
    entitlementId: row.entitlement_id,
    tenantRef: row.tenant_ref,
    artifactRef: row.artifact_ref,
    status: row.link_status,
    requestStatus: row.request_status,
    entitlementStatus: row.entitlement_status,
    nodeId: row.node_id,
    plan: row.plan,
    validFrom: row.valid_from,
    validUntil: row.valid_until,
    createdAt: row.link_created_at,
    updatedAt: row.link_updated_at
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

function mapUsageBinding(row) {
  if (!row) return null;
  return {
    id: row.link_id,
    linkId: row.link_id,
    requestId: row.request_id,
    accountId: row.account_id,
    entitlementId: row.entitlement_id,
    tenantRef: row.tenant_ref,
    artifactRef: row.artifact_ref,
    status: row.link_status,
    requestStatus: row.request_status,
    entitlementStatus: row.entitlement_status,
    nodeId: row.node_id,
    plan: row.plan,
    validFrom: row.valid_from,
    validUntil: row.valid_until,
    trafficLimitBytes: row.traffic_limit_bytes,
    edgeCredentialRef: row.edge_credential_ref || `edgecred_${row.request_id}`,
    portalUserRef: row.portal_user_ref,
    createdAt: row.link_created_at,
    updatedAt: row.link_updated_at
  };
}

function mapUsageSample(row) {
  if (!row) return null;
  return {
    id: row.id,
    sourceRef: row.source_ref,
    channelRef: row.channel_ref,
    edgeCredentialRef: row.edge_credential_ref,
    accountId: row.account_id,
    entitlementId: row.entitlement_id,
    requestId: row.request_id,
    observedAt: row.observed_at,
    intervalStartedAt: row.interval_started_at,
    intervalEndedAt: row.interval_ended_at,
    uploadBytes: row.upload_bytes,
    downloadBytes: row.download_bytes,
    totalBytes: row.total_bytes,
    sampleDigest: row.sample_digest,
    createdAt: row.created_at
  };
}

function mapUsageRollup(row) {
  if (!row) return null;
  return {
    edgeCredentialRef: row.edge_credential_ref,
    accountId: row.account_id,
    entitlementId: row.entitlement_id,
    requestId: row.request_id,
    channelRef: row.channel_ref,
    uploadBytes: row.upload_bytes,
    downloadBytes: row.download_bytes,
    totalBytes: row.total_bytes,
    lastObservedAt: row.last_observed_at,
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

function mapEdgeApplyReceipt(row) {
  if (!row) return null;
  return {
    id: row.id,
    channelRef: row.channel_ref,
    desiredStateRef: row.desired_state_ref,
    status: row.status,
    actionCounts: {
      add: row.add_count,
      revoke: row.revoke_count,
      rotate: row.rotate_count,
      unchanged: row.unchanged_count
    },
    configTestOk: row.config_test_ok === 1,
    serviceActive: row.service_active === 1,
    listenerUdp443: row.listener_udp443 === 1,
    backupRef: row.backup_ref,
    rollbackRef: row.rollback_ref,
    appliedAt: row.applied_at,
    createdAt: row.created_at
  };
}

function mapPortalAccessRequest(row) {
  if (!row) return null;
  const event = parseJsonObject(row.event_json);
  return {
    id: row.id,
    portalUserRef: row.portal_user_ref,
    plan: row.plan,
    clientTarget: row.client_target,
    durationDays: row.duration_days,
    quantity: row.quantity,
    status: row.status,
    nextAction: row.next_action,
    noteProvided: row.note_provided === 1,
    priorTrialState: row.prior_trial_state,
    submittedAt: row.submitted_at,
    updatedAt: row.updated_at,
    reviewedAt: row.reviewed_at,
    reviewedByRef: row.reviewed_by_ref,
    safeReasonCode: row.safe_reason_code,
    expiresAt: row.expires_at,
    validUntil: row.valid_until,
    entitlementRef: row.entitlement_ref,
    accessGrantRef: row.access_grant_ref,
    tenantId: row.tenant_id,
    artifactId: row.artifact_id,
    subscriptionUrl: row.subscription_url,
    edgeChannelRef: row.edge_channel_ref,
    edgeCredentialRef: row.edge_credential_ref,
    edgeMaterialDigest: row.edge_material_digest,
    edgeLifecycleMutation: row.edge_lifecycle_mutation === 1,
    event: Object.keys(event).length > 0 ? event : null
  };
}

function mapPortalEdgeCredential(row) {
  if (!row) return null;
  return {
    edgeChannelRef: row.edge_channel_ref,
    edgeCredentialRef: row.edge_credential_ref,
    edgeMaterialDigest: row.edge_material_digest
  };
}

function mapPortalEntry(row) {
  if (!row) return null;
  return {
    id: row.id,
    accountId: row.account_id,
    entitlementId: row.entitlement_id,
    tokenHash: row.token_hash,
    status: row.status,
    expiresAt: row.expires_at,
    maxUses: row.max_uses,
    useCount: row.use_count,
    issuedByRef: row.issued_by_ref,
    approvalRef: row.approval_ref,
    usedAt: row.used_at,
    revokedAt: row.revoked_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function mapPortalTotpCredential(row) {
  if (!row) return null;
  return {
    id: row.id,
    accountId: row.account_id,
    encryptedTotpSecret: row.encrypted_totp_secret,
    status: row.status,
    failureCount: row.failure_count,
    lockedUntil: row.locked_until,
    enrolledAt: row.enrolled_at,
    lastVerifiedAt: row.last_verified_at,
    revokedAt: row.revoked_at,
    updatedAt: row.updated_at
  };
}

function mapPortalPasswordCredential(row) {
  if (!row) return null;
  return {
    id: row.id,
    accountId: row.account_id,
    passwordHash: row.password_hash,
    status: row.status,
    failureCount: row.failure_count,
    lockedUntil: row.locked_until,
    mustRotate: row.must_rotate === 1,
    createdAt: row.created_at,
    lastVerifiedAt: row.last_verified_at,
    revokedAt: row.revoked_at,
    updatedAt: row.updated_at
  };
}

function mapPortalPasskeyCredential(row) {
  if (!row) return null;
  return {
    id: row.id,
    accountId: row.account_id,
    credentialId: row.credential_id,
    credentialIdHash: row.credential_id_hash,
    publicKeyJwk: parseJsonObject(row.public_key_jwk_json),
    signCount: row.sign_count,
    transports: parseJsonArray(row.transports_json),
    status: row.status,
    createdAt: row.created_at,
    lastVerifiedAt: row.last_verified_at,
    revokedAt: row.revoked_at,
    updatedAt: row.updated_at
  };
}

function mapPortalSecondFactorChallenge(row) {
  if (!row) return null;
  return {
    id: row.id,
    accountId: row.account_id,
    challengeHash: row.challenge_hash,
    allowedFactors: parseJsonArray(row.allowed_factors_json),
    status: row.status,
    failureCount: row.failure_count,
    expiresAt: row.expires_at,
    usedAt: row.used_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function mapPortalSession(row) {
  if (!row) return null;
  return {
    sessionRef: row.id,
    accountId: row.account_id,
    entryId: row.entry_id,
    authMethod: row.auth_method,
    status: row.status,
    issuedAt: row.issued_at,
    expiresAt: row.expires_at,
    revokedAt: row.revoked_at,
    updatedAt: row.updated_at
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

    create table if not exists platform_usage_samples (
      id text primary key,
      source_ref text not null,
      channel_ref text not null,
      edge_credential_ref text not null,
      account_id text not null references platform_accounts(id) on delete cascade,
      entitlement_id text not null references platform_entitlements(id) on delete cascade,
      request_id text not null references platform_issuance_requests(id) on delete cascade,
      observed_at text not null,
      interval_started_at text not null,
      interval_ended_at text not null,
      upload_bytes integer not null default 0 check (upload_bytes >= 0),
      download_bytes integer not null default 0 check (download_bytes >= 0),
      total_bytes integer not null default 0 check (total_bytes >= 0),
      sample_digest text not null unique,
      created_at text not null
    );

    create index if not exists platform_usage_samples_edge_credential_idx
      on platform_usage_samples(edge_credential_ref, observed_at);
    create index if not exists platform_usage_samples_account_entitlement_idx
      on platform_usage_samples(account_id, entitlement_id, observed_at);

    create table if not exists platform_usage_rollups (
      edge_credential_ref text primary key,
      account_id text not null references platform_accounts(id) on delete cascade,
      entitlement_id text not null references platform_entitlements(id) on delete cascade,
      request_id text not null references platform_issuance_requests(id) on delete cascade,
      channel_ref text not null,
      upload_bytes integer not null default 0 check (upload_bytes >= 0),
      download_bytes integer not null default 0 check (download_bytes >= 0),
      total_bytes integer not null default 0 check (total_bytes >= 0),
      last_observed_at text not null,
      updated_at text not null
    );

    create index if not exists platform_usage_rollups_account_entitlement_idx
      on platform_usage_rollups(account_id, entitlement_id);
    create index if not exists platform_usage_rollups_channel_idx
      on platform_usage_rollups(channel_ref);

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

    create table if not exists platform_edge_apply_receipts (
      id text primary key,
      channel_ref text not null,
      desired_state_ref text not null,
      status text not null check (status in ('pending', 'applied', 'failed', 'rolled_back', 'drift_detected')),
      add_count integer not null default 0,
      revoke_count integer not null default 0,
      rotate_count integer not null default 0,
      unchanged_count integer not null default 0,
      config_test_ok integer not null default 0 check (config_test_ok in (0, 1)),
      service_active integer not null default 0 check (service_active in (0, 1)),
      listener_udp443 integer not null default 0 check (listener_udp443 in (0, 1)),
      backup_ref text,
      rollback_ref text,
      applied_at text,
      created_at text not null
    );

    create index if not exists platform_edge_apply_receipts_channel_idx
      on platform_edge_apply_receipts(channel_ref, created_at);
    create index if not exists platform_edge_apply_receipts_desired_state_idx
      on platform_edge_apply_receipts(desired_state_ref);

    create table if not exists platform_portal_access_requests (
      id text primary key,
      portal_user_ref text not null,
      plan text not null check (plan in ('trial', 'monthly', 'yearly')),
      client_target text not null check (client_target in ('clash', 'karing')),
      duration_days integer not null check (duration_days > 0),
      quantity integer not null check (quantity > 0),
      status text not null check (status in (
        'pending_admin_review',
        'approved_pending_delivery',
        'delivered',
        'issued',
        'rejected',
        'disabled'
      )),
      next_action text not null,
      note_provided integer not null default 0 check (note_provided in (0, 1)),
      prior_trial_state text not null,
      submitted_at text not null,
      updated_at text not null,
      reviewed_at text,
      reviewed_by_ref text,
      safe_reason_code text,
      expires_at text,
      valid_until text,
      entitlement_ref text,
      access_grant_ref text,
      tenant_id text,
      artifact_id text,
      subscription_url text,
      edge_channel_ref text,
      edge_credential_ref text,
      edge_material_digest text,
      edge_lifecycle_mutation integer not null default 0 check (edge_lifecycle_mutation in (0, 1)),
      event_json text not null default '{}'
    );

    create index if not exists platform_portal_access_requests_user_idx
      on platform_portal_access_requests(portal_user_ref, submitted_at);
    create index if not exists platform_portal_access_requests_status_idx
      on platform_portal_access_requests(status);
    create index if not exists platform_portal_access_requests_plan_idx
      on platform_portal_access_requests(plan);

    create table if not exists platform_portal_edge_credentials (
      request_id text not null references platform_portal_access_requests(id) on delete cascade,
      edge_channel_ref text not null,
      edge_credential_ref text not null,
      edge_material_digest text not null,
      ordinal integer not null default 0 check (ordinal >= 0),
      primary key (request_id, edge_channel_ref)
    );

    create unique index if not exists platform_portal_edge_credentials_ref_idx
      on platform_portal_edge_credentials(edge_credential_ref);
    create index if not exists platform_portal_edge_credentials_request_idx
      on platform_portal_edge_credentials(request_id, ordinal);

    create table if not exists platform_portal_entries (
      id text primary key,
      account_id text not null references platform_accounts(id) on delete cascade,
      entitlement_id text not null references platform_entitlements(id) on delete cascade,
      token_hash text not null unique,
      status text not null check (status in ('active', 'used', 'revoked', 'expired')),
      expires_at text not null,
      max_uses integer not null check (max_uses > 0),
      use_count integer not null default 0 check (use_count >= 0),
      issued_by_ref text not null,
      approval_ref text not null,
      used_at text,
      revoked_at text,
      created_at text not null,
      updated_at text not null
    );

    create index if not exists platform_portal_entries_account_id_idx
      on platform_portal_entries(account_id);
    create index if not exists platform_portal_entries_token_hash_idx
      on platform_portal_entries(token_hash);
    create index if not exists platform_portal_entries_status_idx
      on platform_portal_entries(status);

    create table if not exists platform_portal_totp_credentials (
      id text primary key,
      account_id text not null references platform_accounts(id) on delete cascade,
      encrypted_totp_secret text not null,
      status text not null check (status in ('active', 'revoked', 'locked')),
      failure_count integer not null default 0 check (failure_count >= 0),
      locked_until text,
      enrolled_at text not null,
      last_verified_at text,
      revoked_at text,
      updated_at text not null
    );

    create index if not exists platform_portal_totp_credentials_account_id_idx
      on platform_portal_totp_credentials(account_id);
    create index if not exists platform_portal_totp_credentials_status_idx
      on platform_portal_totp_credentials(status);

    create table if not exists platform_portal_password_credentials (
      id text primary key,
      account_id text not null references platform_accounts(id) on delete cascade,
      password_hash text not null,
      status text not null check (status in ('active', 'revoked', 'locked')),
      failure_count integer not null default 0 check (failure_count >= 0),
      locked_until text,
      must_rotate integer not null default 0 check (must_rotate in (0, 1)),
      created_at text not null,
      last_verified_at text,
      revoked_at text,
      updated_at text not null
    );

    create index if not exists platform_portal_password_credentials_account_id_idx
      on platform_portal_password_credentials(account_id);
    create index if not exists platform_portal_password_credentials_status_idx
      on platform_portal_password_credentials(status);

    create table if not exists platform_portal_passkey_credentials (
      id text primary key,
      account_id text not null references platform_accounts(id) on delete cascade,
      credential_id text not null unique,
      credential_id_hash text not null unique,
      public_key_jwk_json text not null,
      sign_count integer not null default 0 check (sign_count >= 0),
      transports_json text not null default '[]',
      status text not null check (status in ('active', 'revoked', 'locked')),
      created_at text not null,
      last_verified_at text,
      revoked_at text,
      updated_at text not null
    );

    create index if not exists platform_portal_passkey_credentials_account_id_idx
      on platform_portal_passkey_credentials(account_id);
    create index if not exists platform_portal_passkey_credentials_status_idx
      on platform_portal_passkey_credentials(status);

    create table if not exists platform_portal_second_factor_challenges (
      id text primary key,
      account_id text not null references platform_accounts(id) on delete cascade,
      challenge_hash text not null,
      allowed_factors_json text not null,
      status text not null check (status in ('active', 'used', 'expired', 'locked')),
      failure_count integer not null default 0 check (failure_count >= 0),
      expires_at text not null,
      used_at text,
      created_at text not null,
      updated_at text not null
    );

    create index if not exists platform_portal_second_factor_account_id_idx
      on platform_portal_second_factor_challenges(account_id);
    create index if not exists platform_portal_second_factor_status_idx
      on platform_portal_second_factor_challenges(status);

    create table if not exists platform_portal_sessions (
      id text primary key,
      account_id text not null references platform_accounts(id) on delete cascade,
      entry_id text references platform_portal_entries(id) on delete set null,
      auth_method text not null,
      status text not null check (status in ('active', 'revoked', 'expired')),
      issued_at text not null,
      expires_at text not null,
      revoked_at text,
      updated_at text not null
    );

    create index if not exists platform_portal_sessions_account_id_idx
      on platform_portal_sessions(account_id);
    create index if not exists platform_portal_sessions_status_idx
      on platform_portal_sessions(status);
  `);

  ensureTableColumns(db, "platform_portal_access_requests", [
    { name: "client_target", definition: "client_target text not null default 'clash'" },
    { name: "duration_days", definition: "duration_days integer not null default 30" },
    { name: "quantity", definition: "quantity integer not null default 1" },
    { name: "note_provided", definition: "note_provided integer not null default 0" },
    { name: "expires_at", definition: "expires_at text" },
    { name: "valid_until", definition: "valid_until text" },
    { name: "tenant_id", definition: "tenant_id text" },
    { name: "artifact_id", definition: "artifact_id text" },
    { name: "subscription_url", definition: "subscription_url text" },
    { name: "edge_channel_ref", definition: "edge_channel_ref text" },
    { name: "edge_credential_ref", definition: "edge_credential_ref text" },
    { name: "edge_material_digest", definition: "edge_material_digest text" },
    { name: "edge_lifecycle_mutation", definition: "edge_lifecycle_mutation integer not null default 0" },
    { name: "event_json", definition: "event_json text not null default '{}'" }
  ]);

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

  function listIssuedSubscriptionBindings(filters = {}) {
    assertNoUnsafeFields(filters);
    const clauses = [
      "l.status = 'active'",
      "r.status = 'issued'",
      "e.status = 'active'"
    ];
    const params = [];
    const nodeId = optionalText(filters.nodeId);
    const tenantRef = optionalText(filters.tenantRef);
    if (nodeId) {
      clauses.push("r.node_id = ?");
      params.push(nodeId);
    }
    if (tenantRef) {
      clauses.push("l.tenant_ref = ?");
      params.push(tenantRef);
    }

    return db.prepare(`
      select
        l.id as link_id,
        l.request_id,
        l.tenant_ref,
        l.artifact_ref,
        l.status as link_status,
        l.created_at as link_created_at,
        l.updated_at as link_updated_at,
        r.account_id,
        r.entitlement_id,
        r.status as request_status,
        r.node_id,
        e.plan,
        e.status as entitlement_status,
        e.valid_from,
        e.valid_until
      from platform_issued_subscription_links l
      join platform_issuance_requests r on r.id = l.request_id
      join platform_entitlements e on e.id = r.entitlement_id
      where ${clauses.join(" and ")}
      order by l.created_at asc, l.id asc
    `).all(...params).map(mapIssuedSubscriptionBinding);
  }

  function findIssuedSubscriptionBindingByTenantRef(tenantRef) {
    const [binding] = listIssuedSubscriptionBindings({
      tenantRef: requiredText(tenantRef, "tenantRef")
    }).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || b.id.localeCompare(a.id));
    return binding || null;
  }

  function findIssuedSubscriptionBindingByEdgeCredentialRef(edgeCredentialRef) {
    const safeEdgeCredentialRef = requiredText(edgeCredentialRef, "edgeCredentialRef");
    const durableCredential = mapUsageBinding(db.prepare(`
      select
        l.id as link_id,
        l.request_id,
        l.tenant_ref,
        l.artifact_ref,
        l.status as link_status,
        l.created_at as link_created_at,
        l.updated_at as link_updated_at,
        r.account_id,
        r.entitlement_id,
        r.status as request_status,
        c.edge_channel_ref as node_id,
        e.plan,
        e.status as entitlement_status,
        e.valid_from,
        e.valid_until,
        e.traffic_limit_bytes,
        c.edge_credential_ref,
        p.portal_user_ref
      from platform_issued_subscription_links l
      join platform_issuance_requests r on r.id = l.request_id
      join platform_entitlements e on e.id = r.entitlement_id
      join platform_portal_edge_credentials c on c.request_id = r.id
      left join platform_portal_access_requests p on p.id = r.id
      where l.status = 'active'
        and r.status = 'issued'
        and e.status = 'active'
        and c.edge_credential_ref = ?
      order by l.created_at desc, c.ordinal asc, l.id desc
      limit 1
    `).get(safeEdgeCredentialRef));
    if (durableCredential) {
      return durableCredential;
    }

    const direct = mapUsageBinding(db.prepare(`
      select
        l.id as link_id,
        l.request_id,
        l.tenant_ref,
        l.artifact_ref,
        l.status as link_status,
        l.created_at as link_created_at,
        l.updated_at as link_updated_at,
        r.account_id,
        r.entitlement_id,
        r.status as request_status,
        r.node_id,
        e.plan,
        e.status as entitlement_status,
        e.valid_from,
        e.valid_until,
        e.traffic_limit_bytes,
        p.edge_credential_ref,
        p.portal_user_ref
      from platform_issued_subscription_links l
      join platform_issuance_requests r on r.id = l.request_id
      join platform_entitlements e on e.id = r.entitlement_id
      left join platform_portal_access_requests p on p.id = r.id
      where l.status = 'active'
        and r.status = 'issued'
        and e.status = 'active'
        and coalesce(p.edge_credential_ref, 'edgecred_' || r.id) = ?
      order by l.created_at desc, l.id desc
      limit 1
    `).get(safeEdgeCredentialRef));
    if (direct) {
      return direct;
    }

    const derivedRows = db.prepare(`
      select
        l.id as link_id,
        l.request_id,
        l.tenant_ref,
        l.artifact_ref,
        l.status as link_status,
        l.created_at as link_created_at,
        l.updated_at as link_updated_at,
        r.account_id,
        r.entitlement_id,
        r.status as request_status,
        r.node_id,
        e.plan,
        e.status as entitlement_status,
        e.valid_from,
        e.valid_until,
        e.traffic_limit_bytes,
        p.edge_credential_ref,
        p.portal_user_ref
      from platform_issued_subscription_links l
      join platform_issuance_requests r on r.id = l.request_id
      join platform_entitlements e on e.id = r.entitlement_id
      left join platform_portal_access_requests p on p.id = r.id
      where l.status = 'active'
        and r.status = 'issued'
        and e.status = 'active'
      order by l.created_at desc, l.id desc
    `).all();

    for (const row of derivedRows) {
      const prefix = `edgecred_${row.request_id}_`;
      if (!safeEdgeCredentialRef.startsWith(prefix)) {
        continue;
      }
      const channelRef = safeEdgeCredentialRef.slice(prefix.length);
      if (!channelRef) {
        continue;
      }
      return mapUsageBinding({
        ...row,
        node_id: channelRef,
        edge_credential_ref: safeEdgeCredentialRef
      });
    }
    return null;
  }

  function findUsageBindingByTenantRef(tenantRef) {
    return mapUsageBinding(db.prepare(`
      select
        l.id as link_id,
        l.request_id,
        l.tenant_ref,
        l.artifact_ref,
        l.status as link_status,
        l.created_at as link_created_at,
        l.updated_at as link_updated_at,
        r.account_id,
        r.entitlement_id,
        r.status as request_status,
        r.node_id,
        e.plan,
        e.status as entitlement_status,
        e.valid_from,
        e.valid_until,
        e.traffic_limit_bytes,
        p.edge_credential_ref,
        p.portal_user_ref
      from platform_issued_subscription_links l
      join platform_issuance_requests r on r.id = l.request_id
      join platform_entitlements e on e.id = r.entitlement_id
      left join platform_portal_access_requests p on p.id = r.id
      where l.status = 'active'
        and r.status = 'issued'
        and e.status = 'active'
        and l.tenant_ref = ?
      order by l.created_at desc, l.id desc
      limit 1
    `).get(requiredText(tenantRef, "tenantRef")));
  }

  function getUsageSampleByDigest(sampleDigest) {
    return mapUsageSample(db.prepare(`
      select * from platform_usage_samples
      where sample_digest = ?
    `).get(requiredText(sampleDigest, "sampleDigest")));
  }

  function getUsageRollupByEdgeCredentialRef(edgeCredentialRef) {
    return mapUsageRollup(db.prepare(`
      select * from platform_usage_rollups
      where edge_credential_ref = ?
    `).get(requiredText(edgeCredentialRef, "edgeCredentialRef")));
  }

  function listUsageRollupsByRequestId(requestId) {
    return db.prepare(`
      select * from platform_usage_rollups
      where request_id = ?
      order by updated_at asc, edge_credential_ref asc
    `).all(requiredText(requestId, "requestId")).map(mapUsageRollup);
  }

  function listUsageSamples(filters = {}) {
    const clauses = [];
    const params = [];
    const edgeCredentialRef = optionalText(filters.edgeCredentialRef);
    const accountId = optionalText(filters.accountId);
    const entitlementId = optionalText(filters.entitlementId);
    if (edgeCredentialRef) {
      clauses.push("edge_credential_ref = ?");
      params.push(edgeCredentialRef);
    }
    if (accountId) {
      clauses.push("account_id = ?");
      params.push(accountId);
    }
    if (entitlementId) {
      clauses.push("entitlement_id = ?");
      params.push(entitlementId);
    }
    const where = clauses.length ? `where ${clauses.join(" and ")}` : "";
    return db.prepare(`
      select * from platform_usage_samples
      ${where}
      order by observed_at asc, id asc
    `).all(...params).map(mapUsageSample);
  }

  function recordUsageSample(input) {
    const uploadBytes = integer(input.uploadBytes ?? 0, "uploadBytes", { min: 0 });
    const downloadBytes = integer(input.downloadBytes ?? 0, "downloadBytes", { min: 0 });
    const totalBytes = integer(input.totalBytes ?? uploadBytes + downloadBytes, "totalBytes", { min: 0 });
    const record = {
      id: requiredText(input.id, "id"),
      sourceRef: requiredText(input.sourceRef, "sourceRef"),
      channelRef: requiredText(input.channelRef, "channelRef"),
      edgeCredentialRef: requiredText(input.edgeCredentialRef, "edgeCredentialRef"),
      accountId: requiredText(input.accountId, "accountId"),
      entitlementId: requiredText(input.entitlementId, "entitlementId"),
      requestId: requiredText(input.requestId, "requestId"),
      observedAt: isoText(input.observedAt, "observedAt"),
      intervalStartedAt: isoText(input.intervalStartedAt, "intervalStartedAt"),
      intervalEndedAt: isoText(input.intervalEndedAt, "intervalEndedAt"),
      uploadBytes,
      downloadBytes,
      totalBytes,
      sampleDigest: requiredText(input.sampleDigest, "sampleDigest"),
      createdAt: isoText(input.createdAt, "createdAt")
    };
    const inserted = db.transaction(() => {
      const result = db.prepare(`
        insert or ignore into platform_usage_samples (
          id, source_ref, channel_ref, edge_credential_ref, account_id,
          entitlement_id, request_id, observed_at, interval_started_at,
          interval_ended_at, upload_bytes, download_bytes, total_bytes,
          sample_digest, created_at
        ) values (
          @id, @sourceRef, @channelRef, @edgeCredentialRef, @accountId,
          @entitlementId, @requestId, @observedAt, @intervalStartedAt,
          @intervalEndedAt, @uploadBytes, @downloadBytes, @totalBytes,
          @sampleDigest, @createdAt
        )
      `).run(record);
      if (result.changes === 0) {
        return false;
      }
      sqliteRun(db.prepare(`
        insert into platform_usage_rollups (
          edge_credential_ref, account_id, entitlement_id, request_id, channel_ref,
          upload_bytes, download_bytes, total_bytes, last_observed_at, updated_at
        ) values (
          @edgeCredentialRef, @accountId, @entitlementId, @requestId, @channelRef,
          @uploadBytes, @downloadBytes, @totalBytes, @observedAt, @createdAt
        )
        on conflict(edge_credential_ref)
        do update set
          upload_bytes = platform_usage_rollups.upload_bytes + excluded.upload_bytes,
          download_bytes = platform_usage_rollups.download_bytes + excluded.download_bytes,
          total_bytes = platform_usage_rollups.total_bytes + excluded.total_bytes,
          last_observed_at = excluded.last_observed_at,
          updated_at = excluded.updated_at
      `), record);
      return true;
    })();
    return {
      inserted,
      sample: getUsageSampleByDigest(record.sampleDigest),
      rollup: getUsageRollupByEdgeCredentialRef(record.edgeCredentialRef)
    };
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

  function recordEdgeApplyReceipt(input) {
    assertNoUnsafeFields(input);
    const actionCounts = input.actionCounts ?? {};
    const record = {
      id: requiredText(input.id, "id"),
      channelRef: requiredText(input.channelRef, "channelRef"),
      desiredStateRef: requiredText(input.desiredStateRef, "desiredStateRef"),
      status: requiredText(input.status, "status"),
      addCount: integer(actionCounts.add ?? 0, "actionCounts.add", { min: 0 }),
      revokeCount: integer(actionCounts.revoke ?? 0, "actionCounts.revoke", { min: 0 }),
      rotateCount: integer(actionCounts.rotate ?? 0, "actionCounts.rotate", { min: 0 }),
      unchangedCount: integer(actionCounts.unchanged ?? 0, "actionCounts.unchanged", { min: 0 }),
      configTestOk: input.configTestOk === true ? 1 : 0,
      serviceActive: input.serviceActive === true ? 1 : 0,
      listenerUdp443: input.listenerUdp443 === true ? 1 : 0,
      backupRef: optionalText(input.backupRef),
      rollbackRef: optionalText(input.rollbackRef),
      appliedAt: optionalIsoText(input.appliedAt, "appliedAt"),
      createdAt: isoText(input.createdAt, "createdAt")
    };
    sqliteRun(db.prepare(`
      insert into platform_edge_apply_receipts (
        id, channel_ref, desired_state_ref, status, add_count, revoke_count,
        rotate_count, unchanged_count, config_test_ok, service_active,
        listener_udp443, backup_ref, rollback_ref, applied_at, created_at
      ) values (
        @id, @channelRef, @desiredStateRef, @status, @addCount, @revokeCount,
        @rotateCount, @unchangedCount, @configTestOk, @serviceActive,
        @listenerUdp443, @backupRef, @rollbackRef, @appliedAt, @createdAt
      )
    `), record);
    return getEdgeApplyReceipt(record.id);
  }

  function getEdgeApplyReceipt(id) {
    return mapEdgeApplyReceipt(db.prepare("select * from platform_edge_apply_receipts where id = ?").get(requiredText(id, "id")));
  }

  function listEdgeApplyReceipts(filters = {}) {
    const channelRef = optionalText(filters.channelRef);
    if (channelRef) {
      return db.prepare(`
        select * from platform_edge_apply_receipts
        where channel_ref = ?
        order by created_at asc, id asc
      `).all(channelRef).map(mapEdgeApplyReceipt);
    }
    return db.prepare(`
      select * from platform_edge_apply_receipts
      order by created_at asc, id asc
    `).all().map(mapEdgeApplyReceipt);
  }

  function listPortalEdgeCredentials(requestId) {
    return db.prepare(`
      select edge_channel_ref, edge_credential_ref, edge_material_digest
      from platform_portal_edge_credentials
      where request_id = ?
      order by ordinal asc, edge_channel_ref asc
    `).all(requiredText(requestId, "requestId")).map(mapPortalEdgeCredential);
  }

  function attachPortalEdgeCredentials(record) {
    if (!record) {
      return null;
    }
    const edgeCredentials = listPortalEdgeCredentials(record.id);
    return edgeCredentials.length > 0 ? { ...record, edgeCredentials } : record;
  }

  function normalizePortalEdgeCredentials(input, record) {
    const rawCredentials = Array.isArray(input.edgeCredentials) ? input.edgeCredentials : [];
    const seen = new Set();
    const credentials = [];
    for (const credential of rawCredentials) {
      const edgeChannelRef = requiredText(credential?.edgeChannelRef, "edgeChannelRef");
      const edgeCredentialRef = requiredText(credential?.edgeCredentialRef, "edgeCredentialRef");
      const edgeMaterialDigest = requiredText(credential?.edgeMaterialDigest, "edgeMaterialDigest");
      const key = `${edgeChannelRef}\u0000${edgeCredentialRef}`;
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      credentials.push({ edgeChannelRef, edgeCredentialRef, edgeMaterialDigest });
    }
    if (credentials.length === 0 && record.edgeChannelRef && record.edgeCredentialRef && record.edgeMaterialDigest) {
      credentials.push({
        edgeChannelRef: record.edgeChannelRef,
        edgeCredentialRef: record.edgeCredentialRef,
        edgeMaterialDigest: record.edgeMaterialDigest
      });
    }
    return credentials;
  }

  function upsertPortalAccessRequest(input) {
    const record = {
      id: requiredText(input.id, "id"),
      portalUserRef: requiredText(input.portalUserRef, "portalUserRef"),
      plan: requiredText(input.plan, "plan"),
      clientTarget: requiredText(input.clientTarget || "clash", "clientTarget"),
      durationDays: integer(input.durationDays, "durationDays", { min: 1 }),
      quantity: integer(input.quantity ?? 1, "quantity", { min: 1 }),
      status: requiredText(input.status, "status"),
      nextAction: requiredText(input.nextAction, "nextAction"),
      noteProvided: input.noteProvided ? 1 : 0,
      priorTrialState: requiredText(input.priorTrialState, "priorTrialState"),
      submittedAt: isoText(input.submittedAt, "submittedAt"),
      updatedAt: isoText(input.updatedAt, "updatedAt"),
      reviewedAt: optionalIsoText(input.reviewedAt, "reviewedAt"),
      reviewedByRef: optionalText(input.reviewedByRef),
      safeReasonCode: optionalText(input.safeReasonCode),
      expiresAt: optionalIsoText(input.expiresAt, "expiresAt"),
      validUntil: optionalIsoText(input.validUntil, "validUntil"),
      entitlementRef: optionalText(input.entitlementRef),
      accessGrantRef: optionalText(input.accessGrantRef),
      tenantId: optionalText(input.tenantId),
      artifactId: optionalText(input.artifactId),
      subscriptionUrl: optionalText(input.subscriptionUrl),
      edgeChannelRef: optionalText(input.edgeChannelRef),
      edgeCredentialRef: optionalText(input.edgeCredentialRef),
      edgeMaterialDigest: optionalText(input.edgeMaterialDigest),
      edgeLifecycleMutation: input.edgeLifecycleMutation ? 1 : 0,
      eventJson: jsonObject(input.event, "event")
    };
    const edgeCredentials = normalizePortalEdgeCredentials(input, record);
    db.transaction(() => {
      sqliteRun(db.prepare(`
        insert into platform_portal_access_requests (
          id, portal_user_ref, plan, client_target, duration_days, quantity,
          status, next_action, note_provided, prior_trial_state, submitted_at,
          updated_at, reviewed_at, reviewed_by_ref, safe_reason_code, expires_at,
          valid_until, entitlement_ref, access_grant_ref, tenant_id, artifact_id,
          subscription_url, edge_channel_ref, edge_credential_ref,
          edge_material_digest, edge_lifecycle_mutation, event_json
        ) values (
          @id, @portalUserRef, @plan, @clientTarget, @durationDays, @quantity,
          @status, @nextAction, @noteProvided, @priorTrialState, @submittedAt,
          @updatedAt, @reviewedAt, @reviewedByRef, @safeReasonCode, @expiresAt,
          @validUntil, @entitlementRef, @accessGrantRef, @tenantId, @artifactId,
          @subscriptionUrl, @edgeChannelRef, @edgeCredentialRef,
          @edgeMaterialDigest, @edgeLifecycleMutation, @eventJson
        )
        on conflict(id) do update set
          portal_user_ref = excluded.portal_user_ref,
          plan = excluded.plan,
          client_target = excluded.client_target,
          duration_days = excluded.duration_days,
          quantity = excluded.quantity,
          status = excluded.status,
          next_action = excluded.next_action,
          note_provided = excluded.note_provided,
          prior_trial_state = excluded.prior_trial_state,
          submitted_at = excluded.submitted_at,
          updated_at = excluded.updated_at,
          reviewed_at = excluded.reviewed_at,
          reviewed_by_ref = excluded.reviewed_by_ref,
          safe_reason_code = excluded.safe_reason_code,
          expires_at = excluded.expires_at,
          valid_until = excluded.valid_until,
          entitlement_ref = excluded.entitlement_ref,
          access_grant_ref = excluded.access_grant_ref,
          tenant_id = excluded.tenant_id,
          artifact_id = excluded.artifact_id,
          subscription_url = excluded.subscription_url,
          edge_channel_ref = excluded.edge_channel_ref,
          edge_credential_ref = excluded.edge_credential_ref,
          edge_material_digest = excluded.edge_material_digest,
          edge_lifecycle_mutation = excluded.edge_lifecycle_mutation,
          event_json = excluded.event_json
      `), record);
      db.prepare("delete from platform_portal_edge_credentials where request_id = ?").run(record.id);
      const insertEdgeCredential = db.prepare(`
        insert into platform_portal_edge_credentials (
          request_id, edge_channel_ref, edge_credential_ref, edge_material_digest, ordinal
        ) values (
          @requestId, @edgeChannelRef, @edgeCredentialRef, @edgeMaterialDigest, @ordinal
        )
      `);
      edgeCredentials.forEach((credential, ordinal) => {
        sqliteRun(insertEdgeCredential, {
          requestId: record.id,
          edgeChannelRef: credential.edgeChannelRef,
          edgeCredentialRef: credential.edgeCredentialRef,
          edgeMaterialDigest: credential.edgeMaterialDigest,
          ordinal
        });
      });
    })();
    return getPortalAccessRequest(record.id);
  }

  function getPortalAccessRequest(id) {
    return attachPortalEdgeCredentials(mapPortalAccessRequest(db.prepare(`
      select * from platform_portal_access_requests
      where id = ?
    `).get(requiredText(id, "id"))));
  }

  function listPortalAccessRequests(filters = {}) {
    const clauses = [];
    const params = [];
    const status = optionalText(filters.status);
    const portalUserRef = optionalText(filters.portalUserRef);
    const plan = optionalText(filters.plan);
    if (status) {
      clauses.push("status = ?");
      params.push(status);
    }
    if (portalUserRef) {
      clauses.push("portal_user_ref = ?");
      params.push(portalUserRef);
    }
    if (plan) {
      clauses.push("plan = ?");
      params.push(plan);
    }
    const where = clauses.length ? `where ${clauses.join(" and ")}` : "";
    return db.prepare(`
      select * from platform_portal_access_requests
      ${where}
      order by submitted_at asc, id asc
    `).all(...params).map(mapPortalAccessRequest).map(attachPortalEdgeCredentials);
  }

  function createPortalEntry(input) {
    const record = {
      id: requiredText(input.id, "id"),
      accountId: requiredText(input.accountId, "accountId"),
      entitlementId: requiredText(input.entitlementId, "entitlementId"),
      tokenHash: requiredText(input.tokenHash, "tokenHash"),
      status: requiredText(input.status || "active", "status"),
      expiresAt: isoText(input.expiresAt, "expiresAt"),
      maxUses: integer(input.maxUses ?? 1, "maxUses", { min: 1 }),
      useCount: integer(input.useCount ?? 0, "useCount", { min: 0 }),
      issuedByRef: requiredText(input.issuedByRef, "issuedByRef"),
      approvalRef: requiredText(input.approvalRef, "approvalRef"),
      usedAt: optionalIsoText(input.usedAt, "usedAt"),
      revokedAt: optionalIsoText(input.revokedAt, "revokedAt"),
      createdAt: isoText(input.createdAt, "createdAt"),
      updatedAt: isoText(input.updatedAt, "updatedAt")
    };
    sqliteRun(db.prepare(`
      insert into platform_portal_entries (
        id, account_id, entitlement_id, token_hash, status, expires_at, max_uses,
        use_count, issued_by_ref, approval_ref, used_at, revoked_at, created_at, updated_at
      ) values (
        @id, @accountId, @entitlementId, @tokenHash, @status, @expiresAt, @maxUses,
        @useCount, @issuedByRef, @approvalRef, @usedAt, @revokedAt, @createdAt, @updatedAt
      )
    `), record);
    return getPortalEntry(record.id);
  }

  function getPortalEntry(id) {
    return mapPortalEntry(db.prepare("select * from platform_portal_entries where id = ?").get(requiredText(id, "id")));
  }

  function findPortalEntryByTokenHash(tokenHash) {
    return mapPortalEntry(db.prepare("select * from platform_portal_entries where token_hash = ?").get(requiredText(tokenHash, "tokenHash")));
  }

  function markPortalEntryUsed(id, { usedAt, updatedAt }) {
    const result = db.prepare(`
      update platform_portal_entries
      set status = 'used', use_count = use_count + 1, used_at = ?, updated_at = ?
      where id = ? and status = 'active'
    `).run(isoText(usedAt, "usedAt"), isoText(updatedAt, "updatedAt"), requiredText(id, "id"));
    if (result.changes !== 1) {
      throw platformError("validation_error", "portal entry is not active");
    }
    return getPortalEntry(id);
  }

  function createPortalTotpCredential(input) {
    const record = {
      id: requiredText(input.id, "id"),
      accountId: requiredText(input.accountId, "accountId"),
      encryptedTotpSecret: requiredText(input.encryptedTotpSecret, "encryptedTotpSecret"),
      status: requiredText(input.status || "active", "status"),
      failureCount: integer(input.failureCount ?? 0, "failureCount", { min: 0 }),
      lockedUntil: optionalIsoText(input.lockedUntil, "lockedUntil"),
      enrolledAt: isoText(input.enrolledAt, "enrolledAt"),
      lastVerifiedAt: optionalIsoText(input.lastVerifiedAt, "lastVerifiedAt"),
      revokedAt: optionalIsoText(input.revokedAt, "revokedAt"),
      updatedAt: isoText(input.updatedAt, "updatedAt")
    };
    sqliteRun(db.prepare(`
      insert into platform_portal_totp_credentials (
        id, account_id, encrypted_totp_secret, status, failure_count, locked_until,
        enrolled_at, last_verified_at, revoked_at, updated_at
      ) values (
        @id, @accountId, @encryptedTotpSecret, @status, @failureCount, @lockedUntil,
        @enrolledAt, @lastVerifiedAt, @revokedAt, @updatedAt
      )
    `), record);
    return getPortalTotpCredential(record.id);
  }

  function getPortalTotpCredential(id) {
    return mapPortalTotpCredential(db.prepare("select * from platform_portal_totp_credentials where id = ?").get(requiredText(id, "id")));
  }

  function getActivePortalTotpCredential(accountId) {
    return mapPortalTotpCredential(db.prepare(`
      select * from platform_portal_totp_credentials
      where account_id = ? and status = 'active'
      order by enrolled_at desc, id desc
      limit 1
    `).get(requiredText(accountId, "accountId")));
  }

  function recordPortalTotpVerificationFailure(id, { updatedAt }) {
    const result = db.prepare(`
      update platform_portal_totp_credentials
      set failure_count = failure_count + 1, updated_at = ?
      where id = ? and status = 'active'
    `).run(isoText(updatedAt, "updatedAt"), requiredText(id, "id"));
    if (result.changes !== 1) {
      throw platformError("not_found", "active portal TOTP credential not found");
    }
    return getPortalTotpCredential(id);
  }

  function markPortalTotpVerified(id, { verifiedAt, updatedAt }) {
    const result = db.prepare(`
      update platform_portal_totp_credentials
      set failure_count = 0, last_verified_at = ?, updated_at = ?
      where id = ? and status = 'active'
    `).run(isoText(verifiedAt, "verifiedAt"), isoText(updatedAt, "updatedAt"), requiredText(id, "id"));
    if (result.changes !== 1) {
      throw platformError("not_found", "active portal TOTP credential not found");
    }
    return getPortalTotpCredential(id);
  }

  function createPortalPasswordCredential(input) {
    const record = {
      id: requiredText(input.id, "id"),
      accountId: requiredText(input.accountId, "accountId"),
      passwordHash: requiredText(input.passwordHash, "passwordHash"),
      status: requiredText(input.status || "active", "status"),
      failureCount: integer(input.failureCount ?? 0, "failureCount", { min: 0 }),
      lockedUntil: optionalIsoText(input.lockedUntil, "lockedUntil"),
      mustRotate: input.mustRotate ? 1 : 0,
      createdAt: isoText(input.createdAt, "createdAt"),
      lastVerifiedAt: optionalIsoText(input.lastVerifiedAt, "lastVerifiedAt"),
      revokedAt: optionalIsoText(input.revokedAt, "revokedAt"),
      updatedAt: isoText(input.updatedAt, "updatedAt")
    };
    sqliteRun(db.prepare(`
      insert into platform_portal_password_credentials (
        id, account_id, password_hash, status, failure_count, locked_until,
        must_rotate, created_at, last_verified_at, revoked_at, updated_at
      ) values (
        @id, @accountId, @passwordHash, @status, @failureCount, @lockedUntil,
        @mustRotate, @createdAt, @lastVerifiedAt, @revokedAt, @updatedAt
      )
    `), record);
    return getPortalPasswordCredential(record.id);
  }

  function getPortalPasswordCredential(id) {
    return mapPortalPasswordCredential(db.prepare("select * from platform_portal_password_credentials where id = ?").get(requiredText(id, "id")));
  }

  function getActivePortalPasswordCredential(accountId) {
    return mapPortalPasswordCredential(db.prepare(`
      select * from platform_portal_password_credentials
      where account_id = ? and status = 'active'
      order by created_at desc, id desc
      limit 1
    `).get(requiredText(accountId, "accountId")));
  }

  function recordPortalPasswordVerificationFailure(id, { updatedAt, lockedUntil } = {}) {
    const nextLockedUntil = optionalIsoText(lockedUntil, "lockedUntil");
    const result = db.prepare(`
      update platform_portal_password_credentials
      set failure_count = failure_count + 1,
        status = case when ? is not null then 'locked' else status end,
        locked_until = coalesce(?, locked_until),
        updated_at = ?
      where id = ? and status in ('active', 'locked')
    `).run(
      nextLockedUntil,
      nextLockedUntil,
      isoText(updatedAt, "updatedAt"),
      requiredText(id, "id")
    );
    if (result.changes !== 1) {
      throw platformError("not_found", "active portal password credential not found");
    }
    return getPortalPasswordCredential(id);
  }

  function markPortalPasswordVerified(id, { verifiedAt, updatedAt }) {
    const result = db.prepare(`
      update platform_portal_password_credentials
      set failure_count = 0, status = 'active', locked_until = null,
        last_verified_at = ?, updated_at = ?
      where id = ? and status in ('active', 'locked')
    `).run(
      isoText(verifiedAt, "verifiedAt"),
      isoText(updatedAt, "updatedAt"),
      requiredText(id, "id")
    );
    if (result.changes !== 1) {
      throw platformError("not_found", "active portal password credential not found");
    }
    return getPortalPasswordCredential(id);
  }

  function createPortalPasskeyCredential(input) {
    const record = {
      id: requiredText(input.id, "id"),
      accountId: requiredText(input.accountId, "accountId"),
      credentialId: requiredText(input.credentialId, "credentialId"),
      credentialIdHash: requiredText(input.credentialIdHash, "credentialIdHash"),
      publicKeyJwkJson: jsonObject(input.publicKeyJwk, "publicKeyJwk"),
      signCount: integer(input.signCount ?? 0, "signCount", { min: 0 }),
      transportsJson: jsonArray(input.transports ?? [], "transports"),
      status: requiredText(input.status || "active", "status"),
      createdAt: isoText(input.createdAt, "createdAt"),
      lastVerifiedAt: optionalIsoText(input.lastVerifiedAt, "lastVerifiedAt"),
      revokedAt: optionalIsoText(input.revokedAt, "revokedAt"),
      updatedAt: isoText(input.updatedAt, "updatedAt")
    };
    sqliteRun(db.prepare(`
      insert into platform_portal_passkey_credentials (
        id, account_id, credential_id, credential_id_hash, public_key_jwk_json,
        sign_count, transports_json, status, created_at, last_verified_at,
        revoked_at, updated_at
      ) values (
        @id, @accountId, @credentialId, @credentialIdHash, @publicKeyJwkJson,
        @signCount, @transportsJson, @status, @createdAt, @lastVerifiedAt,
        @revokedAt, @updatedAt
      )
    `), record);
    return getPortalPasskeyCredential(record.id);
  }

  function getPortalPasskeyCredential(id) {
    return mapPortalPasskeyCredential(db.prepare("select * from platform_portal_passkey_credentials where id = ?").get(requiredText(id, "id")));
  }

  function getPortalPasskeyCredentialByCredentialId(credentialId) {
    return mapPortalPasskeyCredential(db.prepare("select * from platform_portal_passkey_credentials where credential_id = ?").get(requiredText(credentialId, "credentialId")));
  }

  function listActivePortalPasskeyCredentials(accountId) {
    return db.prepare(`
      select * from platform_portal_passkey_credentials
      where account_id = ? and status = 'active'
      order by created_at asc, id asc
    `).all(requiredText(accountId, "accountId")).map(mapPortalPasskeyCredential);
  }

  function markPortalPasskeyVerified(id, { verifiedAt, signCount, updatedAt }) {
    const result = db.prepare(`
      update platform_portal_passkey_credentials
      set sign_count = ?, last_verified_at = ?, updated_at = ?
      where id = ? and status = 'active'
    `).run(
      integer(signCount, "signCount", { min: 0 }),
      isoText(verifiedAt, "verifiedAt"),
      isoText(updatedAt, "updatedAt"),
      requiredText(id, "id")
    );
    if (result.changes !== 1) {
      throw platformError("not_found", "active portal passkey credential not found");
    }
    return getPortalPasskeyCredential(id);
  }

  function createPortalSecondFactorChallenge(input) {
    const record = {
      id: requiredText(input.id, "id"),
      accountId: requiredText(input.accountId, "accountId"),
      challengeHash: requiredText(input.challengeHash, "challengeHash"),
      allowedFactorsJson: jsonArray(input.allowedFactors ?? [], "allowedFactors"),
      status: requiredText(input.status || "active", "status"),
      failureCount: integer(input.failureCount ?? 0, "failureCount", { min: 0 }),
      expiresAt: isoText(input.expiresAt, "expiresAt"),
      usedAt: optionalIsoText(input.usedAt, "usedAt"),
      createdAt: isoText(input.createdAt, "createdAt"),
      updatedAt: isoText(input.updatedAt, "updatedAt")
    };
    sqliteRun(db.prepare(`
      insert into platform_portal_second_factor_challenges (
        id, account_id, challenge_hash, allowed_factors_json, status,
        failure_count, expires_at, used_at, created_at, updated_at
      ) values (
        @id, @accountId, @challengeHash, @allowedFactorsJson, @status,
        @failureCount, @expiresAt, @usedAt, @createdAt, @updatedAt
      )
    `), record);
    return getPortalSecondFactorChallenge(record.id);
  }

  function getPortalSecondFactorChallenge(id) {
    return mapPortalSecondFactorChallenge(db.prepare("select * from platform_portal_second_factor_challenges where id = ?").get(requiredText(id, "id")));
  }

  function markPortalSecondFactorChallengeUsed(id, { usedAt, updatedAt }) {
    const result = db.prepare(`
      update platform_portal_second_factor_challenges
      set status = 'used', used_at = ?, updated_at = ?
      where id = ? and status = 'active'
    `).run(
      isoText(usedAt, "usedAt"),
      isoText(updatedAt, "updatedAt"),
      requiredText(id, "id")
    );
    if (result.changes !== 1) {
      throw platformError("validation_error", "portal second-factor challenge is not active");
    }
    return getPortalSecondFactorChallenge(id);
  }

  function recordPortalSecondFactorChallengeFailure(id, { updatedAt } = {}) {
    const result = db.prepare(`
      update platform_portal_second_factor_challenges
      set failure_count = failure_count + 1, updated_at = ?
      where id = ? and status = 'active'
    `).run(isoText(updatedAt, "updatedAt"), requiredText(id, "id"));
    if (result.changes !== 1) {
      throw platformError("not_found", "active portal second-factor challenge not found");
    }
    return getPortalSecondFactorChallenge(id);
  }

  function createPortalSession(input) {
    const record = {
      id: requiredText(input.id, "id"),
      accountId: requiredText(input.accountId, "accountId"),
      entryId: optionalText(input.entryId),
      authMethod: requiredText(input.authMethod, "authMethod"),
      status: requiredText(input.status || "active", "status"),
      issuedAt: isoText(input.issuedAt, "issuedAt"),
      expiresAt: isoText(input.expiresAt, "expiresAt"),
      revokedAt: optionalIsoText(input.revokedAt, "revokedAt"),
      updatedAt: isoText(input.updatedAt, "updatedAt")
    };
    sqliteRun(db.prepare(`
      insert into platform_portal_sessions (
        id, account_id, entry_id, auth_method, status, issued_at, expires_at, revoked_at, updated_at
      ) values (
        @id, @accountId, @entryId, @authMethod, @status, @issuedAt, @expiresAt, @revokedAt, @updatedAt
      )
    `), record);
    return getPortalSession(record.id);
  }

  function getPortalSession(id) {
    return mapPortalSession(db.prepare("select * from platform_portal_sessions where id = ?").get(requiredText(id, "id")));
  }

  function listPortalSessions({ accountId }) {
    return db.prepare(`
      select * from platform_portal_sessions
      where account_id = ?
      order by issued_at asc, id asc
    `).all(requiredText(accountId, "accountId")).map(mapPortalSession);
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

  function runInTransaction(callback) {
    if (typeof callback !== "function") {
      throw platformError("validation_error", "transaction callback is required");
    }
    return db.transaction(callback)();
  }

  return {
    runInTransaction,
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
    listIssuedSubscriptionBindings,
    findIssuedSubscriptionBindingByTenantRef,
    findIssuedSubscriptionBindingByEdgeCredentialRef,
    findUsageBindingByTenantRef,
    recordUsageSample,
    getUsageSampleByDigest,
    getUsageRollupByEdgeCredentialRef,
    listUsageRollupsByRequestId,
    listUsageSamples,
    upsertQuotaCounter,
    bindDevice,
    getDeviceBinding,
    recordRevocation,
    getRevocationEvent,
    recordAuditEvent,
    getAuditEvent,
    recordEdgeApplyReceipt,
    getEdgeApplyReceipt,
    listEdgeApplyReceipts,
    upsertPortalAccessRequest,
    getPortalAccessRequest,
    listPortalAccessRequests,
    createPortalEntry,
    getPortalEntry,
    findPortalEntryByTokenHash,
    markPortalEntryUsed,
    createPortalTotpCredential,
    getPortalTotpCredential,
    getActivePortalTotpCredential,
    recordPortalTotpVerificationFailure,
    markPortalTotpVerified,
    createPortalPasswordCredential,
    getPortalPasswordCredential,
    getActivePortalPasswordCredential,
    recordPortalPasswordVerificationFailure,
    markPortalPasswordVerified,
    createPortalPasskeyCredential,
    getPortalPasskeyCredential,
    getPortalPasskeyCredentialByCredentialId,
    listActivePortalPasskeyCredentials,
    markPortalPasskeyVerified,
    createPortalSecondFactorChallenge,
    getPortalSecondFactorChallenge,
    markPortalSecondFactorChallengeUsed,
    recordPortalSecondFactorChallengeFailure,
    createPortalSession,
    getPortalSession,
    listPortalSessions,
    getAccountControlSummary,
    close
  };
}
