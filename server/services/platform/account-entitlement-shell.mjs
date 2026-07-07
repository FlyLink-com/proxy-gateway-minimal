import { createHash, randomBytes } from "node:crypto";
import {
  createPlatformControlSummary,
  normalizePlatformAccount,
  normalizePlatformEntitlement
} from "./control-plane-contract.mjs";

const REDACTED_EMAIL = "[REDACTED_EMAIL]";
const SAFE_DISPLAY_VALUE_PATTERN = /^[\p{L}\p{N}][\p{L}\p{N} ._:-]{0,79}$/u;
const UNSAFE_DISPLAY_VALUE_PATTERN = /https?:|token|secret|credential|password|private|customer|@|\/|\b[a-z0-9-]+\.[a-z]{2,}\b/i;
const PUBLIC_EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PAID_PLAN_CREDITS = Object.freeze({
  monthly_basic: Object.freeze({
    plan: "monthly_basic",
    durationDays: 30,
    trafficGbPerMonth: 50
  }),
  monthly_plus: Object.freeze({
    plan: "monthly_plus",
    durationDays: 30,
    trafficGbPerMonth: 100
  }),
  yearly: Object.freeze({
    plan: "yearly",
    durationDays: 365,
    trafficGbPerMonth: 200
  })
});

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

function defaultInitialPasswordFactory() {
  return randomBytes(18).toString("base64url");
}

function cleanMutationText(value, maxLength = 160) {
  if (typeof value !== "string") {
    return "";
  }
  return value.trim().replace(/\s+/g, " ").slice(0, maxLength);
}

function digest(value) {
  return createHash("sha256").update(String(value ?? "")).digest("hex");
}

function normalizePublicEmail(value) {
  const email = cleanMutationText(value, 180).toLowerCase();
  return PUBLIC_EMAIL_PATTERN.test(email) ? email : "";
}

function publicEmailFromMetadata(metadata = {}) {
  return [
    metadata.loginRef,
    metadata.displayRef,
    metadata.email
  ].map(normalizePublicEmail).find(Boolean) || "";
}

function safeDisplayRef(value, fallback) {
  const cleaned = cleanMutationText(value, 80);
  if (!cleaned || !SAFE_DISPLAY_VALUE_PATTERN.test(cleaned) || UNSAFE_DISPLAY_VALUE_PATTERN.test(cleaned)) {
    return fallback;
  }
  return cleaned;
}

function controlAccountStatus(value, fallback = "active") {
  const normalized = String(value || fallback).trim();
  if (normalized === "active" || normalized === "suspended" || normalized === "disabled") {
    return normalized;
  }
  if (normalized === "pending_review") {
    return "suspended";
  }
  return fallback;
}

function controlEntitlementStatus(value, fallback = "active") {
  const normalized = String(value || fallback).trim();
  if (normalized === "active" || normalized === "expired" || normalized === "revoked" || normalized === "suspended") {
    return normalized;
  }
  if (normalized === "disabled") {
    return "revoked";
  }
  return fallback;
}

function addDays(isoTimestamp, days) {
  const date = new Date(isoTimestamp);
  if (Number.isNaN(date.getTime())) {
    throw platformError("validation_error", "timestamp must be a valid date");
  }
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000).toISOString();
}

function normalizePaidAt(value, nowFn) {
  const raw = value || isoNow(nowFn);
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) {
    throw platformError("validation_error", "paidAt must be a valid date");
  }
  return date.toISOString();
}

function paidPlanCreditFor(value) {
  const plan = cleanMutationText(value, 40);
  const credit = PAID_PLAN_CREDITS[plan];
  if (!credit) {
    throw platformError("validation_error", "paid plan is not supported");
  }
  return credit;
}

function trafficGbToBytes(value) {
  return Math.trunc(Number(value || 0) * 1024 ** 3);
}

function metadataFromAccountPayload(payload = {}, fallbackDisplayRef) {
  const email = normalizePublicEmail(payload.email);
  const metadata = {
    source: "admin_user_management",
    displayRef: email || safeDisplayRef(payload.displayName || payload.organization, fallbackDisplayRef)
  };
  const organizationRef = safeDisplayRef(payload.organization, "");
  if (organizationRef) {
    metadata.organizationRef = organizationRef;
  }
  if (email) {
    metadata.contactDigest = digest(email);
    metadata.loginDigest = digest(email);
    metadata.loginRef = email;
  }
  return metadata;
}

function mergeAccountMetadata(existingMetadata = {}, payload = {}, fallbackDisplayRef) {
  const nextMetadata = metadataFromAccountPayload(payload, fallbackDisplayRef);
  const existingEmail = publicEmailFromMetadata(existingMetadata);
  if (!publicEmailFromMetadata(nextMetadata) && existingEmail) {
    nextMetadata.loginRef = existingEmail;
    nextMetadata.displayRef = existingEmail;
    nextMetadata.loginDigest = existingMetadata.loginDigest || digest(existingEmail);
    nextMetadata.contactDigest = existingMetadata.contactDigest || digest(existingEmail);
  }
  return {
    ...existingMetadata,
    ...nextMetadata
  };
}

function requiredMutationRef(payload, field) {
  const value = cleanMutationText(payload?.[field], 120);
  if (!value) {
    throw platformError("validation_error", `${field} is required`);
  }
  return value;
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
    email: account.email,
    displayName: account.displayName,
    entitlementCount: entitlements.length,
    usableEntitlementCount,
    createdAt: account.createdAt,
    updatedAt: account.updatedAt
  };
}

function mutationSummary(action, account, payload, now) {
  const operatorRef = requiredMutationRef(payload, "operatorRef");
  const approvalRef = requiredMutationRef(payload, "approvalRef");
  return {
    action,
    accountId: account.id,
    approvalRef,
    auditRequired: true,
    operatorRef,
    reason: cleanMutationText(payload?.reason, 240),
    submittedAt: now,
    safety: {
      rawCredentialReturned: false,
      rawSubscriptionUrlReturned: false,
      runtimeMutation: false
    }
  };
}

function initialPasswordHandoff(account, initialPassword) {
  return {
    type: "portal_initial_password_handoff",
    accountId: account.id,
    initialPassword,
    visibleOnce: true,
    mustRotate: true,
    delivery: "operator_handoff_only",
    safety: {
      storedAsHash: true,
      returnedInListApis: false,
      auditLogMaterial: "redacted"
    }
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

function summaryForStoredEntitlement(entitlement, now) {
  const validUntil = entitlement.validUntil || "";
  const usable = entitlement.status === "active"
    && validUntil
    && new Date(validUntil).getTime() > new Date(now).getTime();
  return {
    id: entitlement.id,
    type: "platform_entitlement_summary",
    accountId: entitlement.accountId,
    status: entitlement.status,
    plan: entitlement.plan,
    usable: Boolean(usable),
    validUntil,
    quota: {
      trafficGb: Number(((entitlement.trafficLimitBytes ?? 0) / 1024 ** 3).toFixed(3))
    },
    createdAt: entitlement.createdAt,
    updatedAt: entitlement.updatedAt
  };
}

function summaryForStoredAccount(account, entitlements, now) {
  const metadata = account.metadata || {};
  const entitlementSummaries = entitlements.map((entitlement) => summaryForStoredEntitlement(entitlement, now));
  const usableEntitlementCount = entitlementSummaries.filter((entitlement) => entitlement.usable).length;
  const publicEmail = publicEmailFromMetadata(metadata);
  const displayName = publicEmail || safeDisplayRef(metadata.displayRef, "email_not_available");
  return {
    id: account.id,
    type: "platform_account_summary",
    leadId: cleanMutationText(metadata.leadId, 80),
    status: account.status,
    organization: safeDisplayRef(metadata.organizationRef, displayName),
    email: publicEmail || REDACTED_EMAIL,
    displayName,
    entitlementCount: entitlementSummaries.length,
    usableEntitlementCount,
    createdAt: account.createdAt,
    updatedAt: account.updatedAt
  };
}

export function createPlatformAccountEntitlementShell(options = {}) {
  const nowFn = options.nowFn || (() => new Date());
  const accountIdFactory = options.accountIdFactory;
  const entitlementIdFactory = options.entitlementIdFactory;
  const initialPasswordFactory = options.initialPasswordFactory || defaultInitialPasswordFactory;
  const passwordCredentialService = options.passwordCredentialService || null;
  const controlStore = options.controlStore;
  const usesPersistentStore = Boolean(
    controlStore
    && typeof controlStore.createAccount === "function"
    && typeof controlStore.getAccount === "function"
    && typeof controlStore.listAccounts === "function"
    && typeof controlStore.updateAccount === "function"
    && typeof controlStore.createEntitlement === "function"
    && typeof controlStore.listEntitlements === "function"
  );
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

  function getPersistentAccount(id) {
    const account = controlStore.getAccount(String(id || "").trim());
    if (!account) {
      throw platformError("not_found", "account not found");
    }
    return account;
  }

  function persistentEntitlementsForAccount(accountId) {
    return controlStore.listEntitlements({ accountId });
  }

  function persistentAccountSummary(account, now) {
    return summaryForStoredAccount(account, persistentEntitlementsForAccount(account.id), now);
  }

  function recordPersistentAudit(action, account, payload, now) {
    if (typeof controlStore.recordAuditEvent !== "function") {
      return null;
    }
    const operatorRef = requiredMutationRef(payload, "operatorRef");
    const approvalRef = requiredMutationRef(payload, "approvalRef");
    return controlStore.recordAuditEvent({
      id: `audit_${digest([action, account.id, operatorRef, approvalRef, now].join("|")).slice(0, 20)}`,
      entityType: "account",
      entityRef: account.id,
      action,
      actorRef: operatorRef,
      createdAt: now,
      metadata: {
        approvalRef,
        reasonProvided: Boolean(cleanMutationText(payload?.reason, 240))
      }
    });
  }

  function issueInitialPassword(account, payload) {
    if (!passwordCredentialService || typeof passwordCredentialService.issueInitialPasswordCredential !== "function") {
      throw platformError("validation_error", "portal password credential service is required");
    }
    const operatorRef = requiredMutationRef(payload, "operatorRef");
    const approvalRef = requiredMutationRef(payload, "approvalRef");
    const initialPassword = cleanMutationText(initialPasswordFactory({
      accountId: account.id,
      operatorRef,
      approvalRef
    }), 160);
    if (!initialPassword) {
      throw platformError("validation_error", "initial password is required");
    }
    const credential = passwordCredentialService.issueInitialPasswordCredential({
      accountId: account.id,
      approvalRef,
      issuedByRef: operatorRef,
      plainPassword: initialPassword,
      mustRotate: true
    });
    return {
      credential,
      initialCredential: initialPasswordHandoff(account, initialPassword)
    };
  }

  return {
    createAccountFromLead(lead, payload = {}) {
      if (usesPersistentStore) {
        if (!lead?.id) {
          throw platformError("validation_error", "lead is required");
        }
        const now = isoNow(nowFn);
        accountSequence += 1;
        const accountId = payload.id || accountIdFactory?.() || nextId("acct", now, accountSequence);
        const account = controlStore.createAccount({
          id: accountId,
          ownerRef: accountId,
          status: controlAccountStatus(payload.status || "active"),
          createdAt: now,
          updatedAt: now,
          metadata: {
            ...metadataFromAccountPayload({
              displayName: payload.displayName || lead.organization,
              email: lead.email,
              organization: lead.organization
            }, accountId),
            leadId: lead.id
          }
        });
        return persistentAccountSummary(account, now);
      }
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

    createAccount(payload = {}) {
      if (usesPersistentStore) {
        requiredMutationRef(payload, "operatorRef");
        requiredMutationRef(payload, "approvalRef");
        const now = isoNow(nowFn);
        accountSequence += 1;
        const accountId = payload.id || accountIdFactory?.() || nextId("acct", now, accountSequence);
        const createWithCredential = () => {
          if (controlStore.getAccount(accountId)) {
            throw platformError("validation_error", "account already exists");
          }
          const account = controlStore.createAccount({
            id: accountId,
            ownerRef: accountId,
            status: controlAccountStatus(payload.status || "active"),
            createdAt: now,
            updatedAt: now,
            metadata: metadataFromAccountPayload(payload, accountId)
          });
          const handoff = issueInitialPassword(account, payload);
          recordPersistentAudit("account_created", account, payload, now);
          return {
            account: persistentAccountSummary(account, now),
            credential: handoff.credential,
            initialCredential: handoff.initialCredential,
            mutation: mutationSummary("account_created", account, payload, now)
          };
        };
        return typeof controlStore.runInTransaction === "function"
          ? controlStore.runInTransaction(createWithCredential)
          : createWithCredential();
      }
      requiredMutationRef(payload, "operatorRef");
      requiredMutationRef(payload, "approvalRef");
      const now = isoNow(nowFn);
      accountSequence += 1;
      const account = normalizePlatformAccount({
        ...payload,
        createdAt: now,
        updatedAt: now
      }, {
        now,
        idFactory: () => accountIdFactory?.() || nextId("acct", now, accountSequence)
      });
      if (accounts.has(account.id)) {
        throw platformError("validation_error", "account already exists");
      }
      const mutation = mutationSummary("account_created", account, payload, now);
      accounts.set(account.id, account);
      return {
        account: summaryForAccount(account, [], now),
        mutation
      };
    },

    listAccounts(filters = {}) {
      if (usesPersistentStore) {
        const now = isoNow(nowFn);
        const listUserAccounts = typeof controlStore.listPortalUserAccounts === "function"
          ? controlStore.listPortalUserAccounts
          : controlStore.listAccounts;
        return listUserAccounts({ status: filters.status })
          .map((account) => persistentAccountSummary(account, now));
      }
      const status = String(filters.status || "").trim();
      const now = isoNow(nowFn);
      return [...accounts.values()]
        .filter((account) => !status || account.status === status)
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id))
        .map((account) => summaryForAccount(account, entitlementsForAccount(account.id), now));
    },

    getAccount(id) {
      if (usesPersistentStore) {
        return { ...getPersistentAccount(id) };
      }
      return { ...getStoredAccount(id) };
    },

    updateAccount(id, payload = {}) {
      if (usesPersistentStore) {
        const existing = getPersistentAccount(id);
        requiredMutationRef(payload, "operatorRef");
        requiredMutationRef(payload, "approvalRef");
        const now = isoNow(nowFn);
        const account = controlStore.updateAccount(existing.id, {
          status: controlAccountStatus(payload.status || existing.status, existing.status),
          updatedAt: now,
          metadata: mergeAccountMetadata(existing.metadata, payload, existing.id)
        });
        recordPersistentAudit("account_updated", account, payload, now);
        return {
          account: persistentAccountSummary(account, now),
          mutation: mutationSummary("account_updated", account, payload, now)
        };
      }
      const existing = getStoredAccount(id);
      requiredMutationRef(payload, "operatorRef");
      requiredMutationRef(payload, "approvalRef");
      const now = isoNow(nowFn);
      const account = normalizePlatformAccount({
        ...existing,
        ...payload,
        id: existing.id,
        leadId: existing.leadId,
        createdAt: existing.createdAt,
        updatedAt: now
      }, {
        now,
        idFactory: () => existing.id
      });
      const mutation = mutationSummary("account_updated", account, payload, now);
      accounts.set(account.id, account);
      return {
        account: summaryForAccount(account, entitlementsForAccount(account.id), now),
        mutation
      };
    },

    disableAccount(id, payload = {}) {
      if (usesPersistentStore) {
        const existing = getPersistentAccount(id);
        requiredMutationRef(payload, "operatorRef");
        requiredMutationRef(payload, "approvalRef");
        const now = isoNow(nowFn);
        const account = controlStore.updateAccount(existing.id, {
          status: "disabled",
          updatedAt: now,
          metadata: {
            lastDisableRef: requiredMutationRef(payload, "approvalRef")
          }
        });
        recordPersistentAudit("account_disabled", account, payload, now);
        return {
          account: persistentAccountSummary(account, now),
          mutation: mutationSummary("account_disabled", account, payload, now)
        };
      }
      const existing = getStoredAccount(id);
      requiredMutationRef(payload, "operatorRef");
      requiredMutationRef(payload, "approvalRef");
      const now = isoNow(nowFn);
      const account = normalizePlatformAccount({
        ...existing,
        status: "disabled",
        updatedAt: now
      }, {
        now,
        idFactory: () => existing.id
      });
      const mutation = mutationSummary("account_disabled", account, payload, now);
      accounts.set(account.id, account);
      return {
        account: summaryForAccount(account, entitlementsForAccount(account.id), now),
        mutation
      };
    },

    previewAccountDeletion(id, payload = {}) {
      if (usesPersistentStore) {
        const account = getPersistentAccount(id);
        requiredMutationRef(payload, "operatorRef");
        requiredMutationRef(payload, "approvalRef");
        const accountEntitlements = persistentEntitlementsForAccount(account.id);
        const activeEntitlementCount = accountEntitlements.filter((entitlement) => entitlement.status === "active").length;
        return {
          accountId: account.id,
          accountStatus: account.status,
          activeEntitlementCount,
          entitlementCount: accountEntitlements.length,
          hardDeleteAvailable: false,
          nextAction: "retain_auditable_account_or_disable_only",
          state: "blocked",
          safety: {
            accountDeleted: false,
            entitlementsDeleted: false,
            runtimeMutation: false
          }
        };
      }
      const account = getStoredAccount(id);
      requiredMutationRef(payload, "operatorRef");
      requiredMutationRef(payload, "approvalRef");
      const accountEntitlements = entitlementsForAccount(account.id);
      const activeEntitlementCount = accountEntitlements.filter((entitlement) => entitlement.status === "active").length;
      return {
        accountId: account.id,
        accountStatus: account.status,
        activeEntitlementCount,
        entitlementCount: accountEntitlements.length,
        hardDeleteAvailable: false,
        nextAction: "retain_auditable_account_or_disable_only",
        state: "blocked",
        safety: {
          accountDeleted: false,
          entitlementsDeleted: false,
          runtimeMutation: false
        }
      };
    },

    deleteAccount(id) {
      if (usesPersistentStore) {
        getPersistentAccount(id);
        throw platformError("lifecycle_blocked", "physical account delete is disabled");
      }
      getStoredAccount(id);
      throw platformError("lifecycle_blocked", "physical account delete is disabled");
    },

    creditPurchasedPlan(accountId, payload = {}) {
      const credit = paidPlanCreditFor(payload.plan);
      const paidAt = normalizePaidAt(payload.paidAt, nowFn);
      const validUntil = addDays(paidAt, credit.durationDays);
      entitlementSequence += 1;
      const idBase = entitlementIdFactory?.();
      const entitlementId = idBase
        ? `${idBase}_${entitlementSequence.toString(36)}`
        : nextId("ent", paidAt, entitlementSequence);
      const planSummary = { ...credit };
      const orderRef = cleanMutationText(payload.orderRef, 120);

      if (usesPersistentStore) {
        const account = getPersistentAccount(accountId);
        const createCredit = () => {
          const entitlement = controlStore.createEntitlement({
            id: entitlementId,
            accountId: account.id,
            plan: credit.plan,
            status: "active",
            validFrom: paidAt,
            validUntil,
            maxArtifacts: 1,
            maxDevices: 1,
            trafficLimitBytes: trafficGbToBytes(credit.trafficGbPerMonth),
            createdAt: paidAt,
            updatedAt: paidAt
          });
          if (typeof controlStore.recordAuditEvent === "function") {
            controlStore.recordAuditEvent({
              id: `audit_${digest([
                "account_plan_credited",
                account.id,
                orderRef,
                credit.plan,
                paidAt,
                entitlementSequence
              ].join("|")).slice(0, 20)}`,
              entityType: "account",
              entityRef: account.id,
              action: "account_plan_credited",
              actorRef: "payment_provider",
              createdAt: paidAt,
              metadata: {
                orderRef,
                plan: credit.plan,
                durationDays: credit.durationDays,
                trafficGbPerMonth: credit.trafficGbPerMonth,
                amountMinor: Number.isInteger(Number(payload.amountMinor)) ? Number(payload.amountMinor) : null,
                currency: cleanMutationText(payload.currency, 12) || "CNY"
              }
            });
          }
          return {
            account: persistentAccountSummary(account, paidAt),
            entitlement: summaryForStoredEntitlement(entitlement, paidAt),
            plan: planSummary,
            safety: {
              subscriptionIssued: false,
              runtimeMutation: false,
              rawSubscriptionUrlReturned: false
            }
          };
        };
        return typeof controlStore.runInTransaction === "function"
          ? controlStore.runInTransaction(createCredit)
          : createCredit();
      }

      const account = getStoredAccount(accountId);
      const entitlement = {
        id: entitlementId,
        type: "platform_entitlement",
        accountId: account.id,
        plan: credit.plan,
        status: "active",
        validFrom: paidAt,
        validUntil,
        quota: {
          trafficGb: credit.trafficGbPerMonth
        },
        createdAt: paidAt,
        updatedAt: paidAt
      };
      entitlements.set(entitlement.id, entitlement);
      return {
        account: summaryForAccount(account, entitlementsForAccount(account.id), paidAt),
        entitlement: summaryForEntitlement(entitlement, paidAt),
        plan: planSummary,
        safety: {
          subscriptionIssued: false,
          runtimeMutation: false,
          rawSubscriptionUrlReturned: false
        }
      };
    },

    createEntitlement(accountId, payload = {}) {
      if (usesPersistentStore) {
        const account = getPersistentAccount(accountId);
        const now = isoNow(nowFn);
        entitlementSequence += 1;
        const quota = payload.quota && typeof payload.quota === "object" ? payload.quota : {};
        const trafficLimitBytes = Number.isFinite(Number(payload.trafficLimitBytes))
          ? Number(payload.trafficLimitBytes)
          : Math.trunc((Number(quota.trafficGb) || 0) * 1024 ** 3);
        const artifactLimit = Number(payload.maxArtifacts);
        const deviceLimit = Number(payload.maxDevices);
        const entitlement = controlStore.createEntitlement({
          id: payload.id || entitlementIdFactory?.() || nextId("ent", now, entitlementSequence),
          accountId: account.id,
          plan: cleanMutationText(payload.plan, 40) || "trial",
          status: controlEntitlementStatus(payload.status || "active"),
          validFrom: payload.validFrom || now,
          validUntil: payload.validUntil || addDays(now, 30),
          maxArtifacts: Number.isInteger(artifactLimit) && artifactLimit > 0 ? artifactLimit : 1,
          maxDevices: Number.isInteger(deviceLimit) && deviceLimit > 0 ? deviceLimit : 1,
          trafficLimitBytes,
          createdAt: now,
          updatedAt: now
        });
        return summaryForStoredEntitlement(entitlement, now);
      }
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
      if (usesPersistentStore) {
        const now = isoNow(nowFn);
        return controlStore.listEntitlements({ accountId: filters.accountId })
          .map((entitlement) => summaryForStoredEntitlement(entitlement, now));
      }
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
