import { createHash, randomUUID } from "node:crypto";

const FINAL_PORTAL_STATUSES = new Set(["delivered", "issued"]);
const SAFE_REF_PATTERN = /^[A-Za-z0-9._:-]{1,128}$/;
const SECRET_LIKE_PATTERN = /^(?:https?:|mailto:|bearer[ .:_-]|sk[-_]|eyj[a-z0-9_-]{10,})/i;
const SAFE_ERROR_CODES = new Set([
  "account_resource_authority_assignment_conflict",
  "account_resource_authority_invalid_contract",
  "account_resource_authority_target_invalid",
  "account_resource_authority_unavailable",
  "account_resource_authority_version_conflict"
]);

function authorityError(code) {
  const error = new Error("Account resource authority operation rejected");
  error.code = code;
  return error;
}

function requireObject(value) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw authorityError("account_resource_authority_invalid_contract");
  }
  return value;
}

function requireRef(value) {
  if (
    typeof value !== "string"
    || !SAFE_REF_PATTERN.test(value)
    || SECRET_LIKE_PATTERN.test(value)
  ) {
    throw authorityError("account_resource_authority_invalid_contract");
  }
  return value;
}

function requireVersion(value, { initial = false } = {}) {
  if (!Number.isSafeInteger(value) || value < 0 || (initial && value !== 0)) {
    throw authorityError("account_resource_authority_invalid_contract");
  }
  return value;
}

function normalizedNow(nowFn) {
  const value = nowFn();
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
    throw authorityError("account_resource_authority_invalid_contract");
  }
  return value;
}

function bindingRef(prefix, value) {
  if (typeof value !== "string" || value.length === 0) return null;
  return `${prefix}ref_${createHash("sha256")
    .update(value)
    .digest("hex")
    .slice(0, 16)}`;
}

function exactIsoTimestamp(value) {
  if (typeof value !== "string" || value.length === 0) return null;
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return null;
  return new Date(timestamp).toISOString() === value ? timestamp : null;
}

function targetRowIsExact(row, now) {
  if (!row) return null;
  if (
    row.account_status !== "active"
    || row.entitlement_status !== "active"
    || row.request_status !== "issued"
    || row.link_status !== "active"
    || row.entitlement_account_id !== row.account_id
    || row.request_account_id !== row.account_id
    || row.request_entitlement_id !== row.entitlement_id
    || row.link_request_id !== row.resource_request_id
    || row.portal_id !== row.resource_request_id
    || row.portal_user_ref !== row.account_id
    || row.portal_entitlement_ref !== row.entitlement_id
    || !FINAL_PORTAL_STATUSES.has(row.portal_status)
    || row.portal_valid_until !== row.entitlement_valid_until
    || row.portal_expires_at !== row.entitlement_valid_until
    || bindingRef("tenant", row.portal_tenant_id) !== row.link_tenant_ref
    || bindingRef("artifact", row.portal_artifact_id) !== row.link_artifact_ref
  ) {
    return null;
  }
  const validFrom = exactIsoTimestamp(row.entitlement_valid_from);
  const validUntil = exactIsoTimestamp(row.entitlement_valid_until);
  if (validFrom === null || validUntil === null || validFrom >= validUntil) {
    return null;
  }
  return { row, isLapsed: validUntil <= now.getTime() };
}

function closeKnownError(error, fallbackCode) {
  if (SAFE_ERROR_CODES.has(error?.code)) return error;
  if (
    typeof error?.code === "string"
    && /^SQLITE_(?:BUSY|LOCKED)(?:_|$)/.test(error.code)
  ) {
    return authorityError("account_resource_authority_unavailable");
  }
  return authorityError(fallbackCode);
}

export function createAccountResourceAuthorityTargetReader({ database } = {}) {
  if (!database || typeof database.prepare !== "function") {
    throw authorityError("account_resource_authority_invalid_contract");
  }
  const selectTarget = database.prepare(`
    select
      a.id as account_id,
      a.status as account_status,
      e.id as entitlement_id,
      e.account_id as entitlement_account_id,
      e.status as entitlement_status,
      e.valid_from as entitlement_valid_from,
      e.valid_until as entitlement_valid_until,
      r.id as resource_request_id,
      r.account_id as request_account_id,
      r.entitlement_id as request_entitlement_id,
      r.status as request_status,
      l.id as issued_link_id,
      l.request_id as link_request_id,
      l.tenant_ref as link_tenant_ref,
      l.artifact_ref as link_artifact_ref,
      l.status as link_status,
      p.id as portal_id,
      p.portal_user_ref,
      p.entitlement_ref as portal_entitlement_ref,
      p.status as portal_status,
      p.tenant_id as portal_tenant_id,
      p.artifact_id as portal_artifact_id,
      p.expires_at as portal_expires_at,
      p.valid_until as portal_valid_until
    from main.platform_accounts a
    left join main.platform_entitlements e on e.id = @entitlementId
    left join main.platform_issuance_requests r on r.id = @resourceRequestId
    left join main.platform_issued_subscription_links l on l.id = @issuedLinkId
    left join main.platform_portal_access_requests p on p.id = r.id
    where a.id = @accountId
  `);

  function readExactTarget(target, now) {
    return targetRowIsExact(selectTarget.get({
      accountId: target.accountId,
      resourceRequestId: target.resourceRequestId,
      entitlementId: target.entitlementId,
      issuedLinkId: target.issuedLinkId
    }), now);
  }

  return Object.freeze({ readExactTarget });
}

export function createAccountResourceAuthorityStore({
  database,
  nowFn = () => new Date(),
  idFactory = () => `authority_${randomUUID()}`
} = {}) {
  if (
    !database
    || typeof database.prepare !== "function"
    || typeof database.transaction !== "function"
    || typeof nowFn !== "function"
    || typeof idFactory !== "function"
  ) {
    throw authorityError("account_resource_authority_invalid_contract");
  }

  const targetReader = createAccountResourceAuthorityTargetReader({ database });
  const selectCandidateTargets = database.prepare(`
    select
      a.id as account_id,
      a.status as account_status,
      e.id as entitlement_id,
      e.account_id as entitlement_account_id,
      e.status as entitlement_status,
      e.valid_from as entitlement_valid_from,
      e.valid_until as entitlement_valid_until,
      r.id as resource_request_id,
      r.account_id as request_account_id,
      r.entitlement_id as request_entitlement_id,
      r.status as request_status,
      l.id as issued_link_id,
      l.request_id as link_request_id,
      l.tenant_ref as link_tenant_ref,
      l.artifact_ref as link_artifact_ref,
      l.status as link_status,
      p.id as portal_id,
      p.portal_user_ref,
      p.entitlement_ref as portal_entitlement_ref,
      p.status as portal_status,
      p.tenant_id as portal_tenant_id,
      p.artifact_id as portal_artifact_id,
      p.expires_at as portal_expires_at,
      p.valid_until as portal_valid_until
    from platform_accounts a
    join platform_entitlements e on e.account_id = a.id
    join platform_issuance_requests r
      on r.account_id = a.id and r.entitlement_id = e.id
    join platform_issued_subscription_links l on l.request_id = r.id
    left join platform_portal_access_requests p on p.id = r.id
    where a.id = ?
  `);
  const selectActiveAuthorities = database.prepare(`
    select
      authority_ref,
      account_id,
      resource_request_id,
      entitlement_id,
      issued_link_id,
      version
    from platform_account_resource_authorities
    where account_id = ? and status = 'active'
    order by version asc, authority_ref asc
  `);
  const selectAuthorityCount = database.prepare(`
    select count(*) as count
    from platform_account_resource_authorities
    where account_id = ?
  `);
  const selectRelevantAccounts = database.prepare(`
    select id from platform_accounts where status = 'active'
    union
    select account_id as id
      from platform_account_resource_authorities
     where status = 'active'
    order by id
  `);
  const selectActiveAuthorityCount = database.prepare(`
    select count(*) as count
      from platform_account_resource_authorities
     where status = 'active'
  `);
  const insertAuthority = database.prepare(`
    insert into platform_account_resource_authorities (
      authority_ref, account_id, resource_request_id, entitlement_id,
      issued_link_id, status, version, previous_authority_ref,
      created_at, updated_at, created_by, reason,
      revoked_at, revoked_by, revocation_reason
    ) values (?, ?, ?, ?, ?, 'active', ?, ?, ?, ?, ?, ?, null, null, null)
  `);
  const revokeAuthority = database.prepare(`
    update platform_account_resource_authorities
       set status = 'revoked',
           updated_at = ?,
           revoked_at = ?,
           revoked_by = ?,
           revocation_reason = ?
     where authority_ref = ? and status = 'active' and version = ?
  `);

  function normalizeTarget(input, { initial = false } = {}) {
    const value = requireObject(input);
    return {
      accountId: requireRef(value.accountId),
      resourceRequestId: requireRef(value.resourceRequestId),
      entitlementId: requireRef(value.entitlementId),
      issuedLinkId: requireRef(value.issuedLinkId),
      expectedVersion: requireVersion(value.expectedVersion, { initial }),
      createdBy: requireRef(value.createdBy),
      reason: requireRef(value.reason)
    };
  }

  function exactTarget(target, now) {
    return targetReader.readExactTarget(target, now);
  }

  function safeResolved(authority, exact) {
    return {
      ok: true,
      authorityRef: authority.authority_ref,
      accountId: authority.account_id,
      resourceRequestId: authority.resource_request_id,
      entitlementId: authority.entitlement_id,
      issuedLinkId: authority.issued_link_id,
      authorityVersion: authority.version,
      isLapsed: exact.isLapsed
    };
  }

  function resolveCommerceAuthority(input = {}) {
    const value = requireObject(input);
    const accountId = requireRef(value.accountId);
    if (
      value.expectedAuthorityVersion !== undefined
      && (!Number.isSafeInteger(value.expectedAuthorityVersion)
        || value.expectedAuthorityVersion < 1)
    ) {
      throw authorityError("account_resource_authority_invalid_contract");
    }
    const authorities = selectActiveAuthorities.all(accountId);
    if (authorities.length === 0) return { ok: false, reason: "no_authority" };
    if (authorities.length !== 1) {
      return { ok: false, reason: "authority_conflict" };
    }
    const authority = authorities[0];
    if (
      value.expectedAuthorityVersion !== undefined
      && authority.version !== value.expectedAuthorityVersion
    ) {
      return { ok: false, reason: "authority_version_changed" };
    }
    const now = normalizedNow(nowFn);
    const exact = exactTarget({
      accountId: authority.account_id,
      resourceRequestId: authority.resource_request_id,
      entitlementId: authority.entitlement_id,
      issuedLinkId: authority.issued_link_id
    }, now);
    return exact
      ? safeResolved(authority, exact)
      : { ok: false, reason: "authority_drift" };
  }

  const assignImmediate = database.transaction((input) => {
    const target = normalizeTarget(input, { initial: true });
    const now = normalizedNow(nowFn);
    const exact = exactTarget(target, now);
    if (!exact) {
      throw authorityError("account_resource_authority_target_invalid");
    }
    if (selectAuthorityCount.get(target.accountId).count !== 0) {
      throw authorityError("account_resource_authority_assignment_conflict");
    }
    const authorityRef = requireRef(idFactory());
    const timestamp = now.toISOString();
    insertAuthority.run(
      authorityRef,
      target.accountId,
      target.resourceRequestId,
      target.entitlementId,
      target.issuedLinkId,
      1,
      null,
      timestamp,
      timestamp,
      target.createdBy,
      target.reason
    );
    return safeResolved({
      authority_ref: authorityRef,
      account_id: target.accountId,
      resource_request_id: target.resourceRequestId,
      entitlement_id: target.entitlementId,
      issued_link_id: target.issuedLinkId,
      version: 1
    }, exact);
  });

  function assignAuthority(input) {
    try {
      return assignImmediate.immediate(input);
    } catch (error) {
      throw closeKnownError(
        error,
        "account_resource_authority_assignment_conflict"
      );
    }
  }

  const reassignImmediate = database.transaction((input) => {
    const target = normalizeTarget(input);
    const expectedPreviousAuthorityRef =
      input.expectedPreviousAuthorityRef === undefined
        ? undefined
        : requireRef(input.expectedPreviousAuthorityRef);
    const revokedBy = requireRef(input.revokedBy);
    const revocationReason = requireRef(input.revocationReason);
    if (target.expectedVersion < 1) {
      throw authorityError("account_resource_authority_invalid_contract");
    }
    const active = selectActiveAuthorities.all(target.accountId);
    if (
      active.length !== 1
      || active[0].version !== target.expectedVersion
      || (
        expectedPreviousAuthorityRef !== undefined
        && active[0].authority_ref !== expectedPreviousAuthorityRef
      )
    ) {
      throw authorityError("account_resource_authority_version_conflict");
    }
    const previous = active[0];
    const now = normalizedNow(nowFn);
    const exact = exactTarget(target, now);
    if (
      !exact
      || (
        previous.resource_request_id === target.resourceRequestId
        && previous.entitlement_id === target.entitlementId
        && previous.issued_link_id === target.issuedLinkId
      )
    ) {
      throw authorityError("account_resource_authority_target_invalid");
    }
    const timestamp = now.toISOString();
    const revoked = revokeAuthority.run(
      timestamp,
      timestamp,
      revokedBy,
      revocationReason,
      previous.authority_ref,
      previous.version
    );
    if (revoked.changes !== 1) {
      throw authorityError("account_resource_authority_version_conflict");
    }
    const authorityRef = requireRef(idFactory());
    const nextVersion = previous.version + 1;
    insertAuthority.run(
      authorityRef,
      target.accountId,
      target.resourceRequestId,
      target.entitlementId,
      target.issuedLinkId,
      nextVersion,
      previous.authority_ref,
      timestamp,
      timestamp,
      target.createdBy,
      target.reason
    );
    return safeResolved({
      authority_ref: authorityRef,
      account_id: target.accountId,
      resource_request_id: target.resourceRequestId,
      entitlement_id: target.entitlementId,
      issued_link_id: target.issuedLinkId,
      version: nextVersion
    }, exact);
  });

  function reassignAuthority(input) {
    try {
      return reassignImmediate.immediate(input);
    } catch (error) {
      throw closeKnownError(
        error,
        "account_resource_authority_assignment_conflict"
      );
    }
  }

  function dryRunAuthorities() {
    const counts = {
      accounts: 0,
      activeAuthorityRows: 0,
      resolved: 0,
      missingAuthority: 0,
      invalidAuthority: 0,
      authorityConflicts: 0,
      ambiguousBindingsWithoutAuthority: 0,
      singleBindingWithoutAuthority: 0,
      noBindingWithoutAuthority: 0
    };
    const now = normalizedNow(nowFn);
    counts.activeAuthorityRows = selectActiveAuthorityCount.get().count;
    for (const { id: accountId } of selectRelevantAccounts.all()) {
      counts.accounts += 1;
      const authorities = selectActiveAuthorities.all(accountId);
      if (authorities.length > 1) {
        counts.authorityConflicts += 1;
        continue;
      }
      if (authorities.length === 1) {
        const authority = authorities[0];
        const exact = exactTarget({
          accountId,
          resourceRequestId: authority.resource_request_id,
          entitlementId: authority.entitlement_id,
          issuedLinkId: authority.issued_link_id
        }, now);
        if (exact) counts.resolved += 1;
        else counts.invalidAuthority += 1;
        continue;
      }

      counts.missingAuthority += 1;
      const candidates = selectCandidateTargets.all(accountId)
        .filter((row) => targetRowIsExact(row, now));
      if (candidates.length > 1) {
        counts.ambiguousBindingsWithoutAuthority += 1;
      } else if (candidates.length === 1) {
        counts.singleBindingWithoutAuthority += 1;
      } else {
        counts.noBindingWithoutAuthority += 1;
      }
    }
    const ready = counts.missingAuthority === 0
      && counts.invalidAuthority === 0
      && counts.authorityConflicts === 0;
    return {
      ok: true,
      ready,
      aggregateOnly: true,
      counts,
      reasonCodes: {
        no_authority: counts.missingAuthority,
        authority_conflict: counts.authorityConflicts,
        authority_drift: counts.invalidAuthority
      }
    };
  }

  return Object.freeze({
    resolveCommerceAuthority,
    dryRunAuthorities,
    assignAuthority,
    reassignAuthority,
    getActiveAuthority: resolveCommerceAuthority
  });
}
