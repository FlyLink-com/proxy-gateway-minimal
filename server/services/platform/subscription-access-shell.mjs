import {
  createPlatformControlSummary,
  isEntitlementUsable,
  normalizeSubscriptionAccessGrant
} from "./control-plane-contract.mjs";

function platformError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function isoNow(nowFn) {
  const value = nowFn();
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw platformError("validation_error", "now must be a valid date");
  }
  return date.toISOString();
}

function nextId(prefix, now, sequence) {
  return `${prefix}_${new Date(now).getTime().toString(36)}_${sequence.toString(36)}`;
}

function summaryForAccessGrant(accessGrant) {
  const summary = createPlatformControlSummary({ accessGrant }).access;
  return {
    id: summary.id,
    type: "subscription_access_grant_summary",
    accountId: accessGrant.accountId,
    entitlementId: accessGrant.entitlementId,
    status: summary.status,
    delivery: summary.delivery,
    hasDynamicEntry: summary.hasDynamicEntry,
    hasArtifact: summary.hasArtifact,
    visibleOnce: summary.visibleOnce,
    issuedAt: summary.issuedAt,
    updatedAt: accessGrant.updatedAt
  };
}

export function createPlatformSubscriptionAccessShell(options = {}) {
  const accountShell = options.accountShell;
  if (!accountShell) {
    throw platformError("validation_error", "accountShell is required");
  }

  const nowFn = options.nowFn || (() => new Date());
  const accessIdFactory = options.accessIdFactory;
  const accessGrants = new Map();
  let accessSequence = 0;

  return {
    issueDynamicEntry(accountId, entitlementId, payload = {}) {
      const account = accountShell.getAccount(accountId);
      const entitlement = accountShell.getEntitlement(entitlementId);
      if (entitlement.accountId !== account.id) {
        throw platformError("validation_error", "entitlement does not belong to account");
      }
      const now = isoNow(nowFn);
      if (!isEntitlementUsable(entitlement, { now })) {
        throw platformError("validation_error", "entitlement is not usable");
      }
      accessSequence += 1;
      const accessGrant = normalizeSubscriptionAccessGrant({
        accountId: account.id,
        entitlementId: entitlement.id,
        entryRef: payload.entryRef,
        artifactRef: payload.artifactRef,
        visibleOnce: payload.visibleOnce,
        status: "issued",
        delivery: "operator_issued",
        issuedAt: now,
        updatedAt: now
      }, {
        now,
        idFactory: () => accessIdFactory?.() || nextId("access", now, accessSequence)
      });
      accessGrants.set(accessGrant.id, accessGrant);
      return summaryForAccessGrant(accessGrant);
    },

    listAccessGrants(filters = {}) {
      const accountId = String(filters.accountId || "").trim();
      const entitlementId = String(filters.entitlementId || "").trim();
      return [...accessGrants.values()]
        .filter((accessGrant) => !accountId || accessGrant.accountId === accountId)
        .filter((accessGrant) => !entitlementId || accessGrant.entitlementId === entitlementId)
        .sort((a, b) => a.issuedAt.localeCompare(b.issuedAt) || a.id.localeCompare(b.id))
        .map(summaryForAccessGrant);
    }
  };
}
