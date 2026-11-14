import {
  createPlatformControlSummary,
  normalizePlatformAccount,
  normalizePlatformEntitlement
} from "./control-plane-contract.mjs";
import { maskEmailOrKeep } from "./email-masking.mjs";

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

function summaryForAccount(account, entitlements, now) {
  const usableEntitlementCount = entitlements
    .filter((entitlement) => createPlatformControlSummary({ entitlement, now }).entitlement.usable)
    .length;
  return {
    id: account.id,
    type: "platform_account_summary",
    leadId: account.leadId,
    status: account.status,
    organization: account.organization,
    // Display only: the admin list shows the masked email, never the raw
    // lead email. A non-email display label passes through unchanged.
    email: maskEmailOrKeep(account.email),
    displayName: maskEmailOrKeep(account.displayName),
    entitlementCount: entitlements.length,
    usableEntitlementCount,
    createdAt: account.createdAt,
    updatedAt: account.updatedAt
  };
}

function summaryForEntitlement(entitlement, now) {
  const summary = createPlatformControlSummary({ entitlement, now }).entitlement;
  return {
    id: summary.id,
    type: "platform_entitlement_summary",
    accountId: entitlement.accountId,
    status: summary.status,
    plan: summary.plan,
    usable: summary.usable,
    validUntil: summary.validUntil,
    quota: summary.quota,
    createdAt: entitlement.createdAt,
    updatedAt: entitlement.updatedAt
  };
}

export function createPlatformAccountEntitlementShell(options = {}) {
  const nowFn = options.nowFn || (() => new Date());
  const accountIdFactory = options.accountIdFactory;
  const entitlementIdFactory = options.entitlementIdFactory;
  const accounts = new Map();
  const entitlements = new Map();
  let accountSequence = 0;
  let entitlementSequence = 0;

  function getStoredAccount(id) {
    const account = accounts.get(String(id || "").trim());
    if (!account) {
      throw platformError("not_found", "account not found");
    }
    return account;
  }

  function entitlementsForAccount(accountId) {
    return [...entitlements.values()].filter((entitlement) => entitlement.accountId === accountId);
  }

  return {
    createAccountFromLead(lead, payload = {}) {
      if (!lead?.id) {
        throw platformError("validation_error", "lead is required");
      }
      const now = isoNow(nowFn);
      accountSequence += 1;
      const account = normalizePlatformAccount({
        id: payload.id,
        leadId: lead.id,
        organization: lead.organization,
        email: lead.email,
        displayName: payload.displayName,
        status: payload.status,
        createdAt: now,
        updatedAt: now
      }, {
        now,
        idFactory: () => accountIdFactory?.() || nextId("acct", now, accountSequence)
      });
      accounts.set(account.id, account);
      return summaryForAccount(account, [], now);
    },

    listAccounts(filters = {}) {
      const status = String(filters.status || "").trim();
      const now = isoNow(nowFn);
      return [...accounts.values()]
        .filter((account) => !status || account.status === status)
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id))
        .map((account) => summaryForAccount(account, entitlementsForAccount(account.id), now));
    },

    getAccount(id) {
      return { ...getStoredAccount(id) };
    },

    createEntitlement(accountId, payload = {}) {
      const account = getStoredAccount(accountId);
      const now = isoNow(nowFn);
      entitlementSequence += 1;
      const entitlement = normalizePlatformEntitlement({
        ...payload,
        accountId: account.id,
        createdAt: now,
        updatedAt: now
      }, {
        now,
        idFactory: () => entitlementIdFactory?.() || nextId("ent", now, entitlementSequence)
      });
      entitlements.set(entitlement.id, entitlement);
      return summaryForEntitlement(entitlement, now);
    },

    listEntitlements(filters = {}) {
      const accountId = String(filters.accountId || "").trim();
      const now = isoNow(nowFn);
      return [...entitlements.values()]
        .filter((entitlement) => !accountId || entitlement.accountId === accountId)
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id))
        .map((entitlement) => summaryForEntitlement(entitlement, now));
    },

    getEntitlement(id) {
      const entitlement = entitlements.get(String(id || "").trim());
      if (!entitlement) {
        throw platformError("not_found", "entitlement not found");
      }
      return { ...entitlement };
    }
  };
}
