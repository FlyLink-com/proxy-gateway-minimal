import { createHash, randomUUID } from "node:crypto";
import {
  TRIAL_DURATION_DAYS,
  TRIAL_TRAFFIC_LIMIT_BYTES
} from "./subscription-package-policy.mjs";

const VALID_PLANS = new Set(["trial", "monthly", "yearly"]);
const DEFAULT_PRIMARY_REGION = "japan";
const DEFAULT_DEVICE_COUNT = 1;
const DEFAULT_REGISTRATION_RISK_WINDOW_MS = 24 * 60 * 60 * 1000;
const DEFAULT_MAX_REGISTRATIONS_PER_SOURCE_IP = 3;
const DEFAULT_LEGAL_VERSION = "2026-07-02";

function registrationError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function requiredText(value, field) {
  const normalized = String(value ?? "").trim();
  if (!normalized) {
    throw registrationError("validation_error", `${field} is required`);
  }
  return normalized;
}

function optionalText(value) {
  const normalized = String(value ?? "").trim();
  return normalized || null;
}

function isoNow(nowFn) {
  const value = nowFn();
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw registrationError("validation_error", "now must be a valid date");
  }
  return date.toISOString();
}

function addDays(isoTimestamp, days) {
  const date = new Date(isoTimestamp);
  if (Number.isNaN(date.getTime())) {
    throw registrationError("validation_error", "timestamp must be a valid date");
  }
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000).toISOString();
}

function digest(value) {
  return createHash("sha256").update(String(value)).digest("hex");
}

function defaultRef(prefix) {
  return `${prefix}_${randomUUID().replaceAll("-", "").slice(0, 24)}`;
}

function normalizeEmail(value) {
  const email = requiredText(value, "email").toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw registrationError("validation_error", "email is invalid");
  }
  return email;
}

function normalizePlan(value) {
  const plan = String(value || "trial").trim().toLowerCase();
  if (!VALID_PLANS.has(plan)) {
    throw registrationError("validation_error", "plan is invalid");
  }
  return plan;
}

function normalizePositiveInteger(value, field, { min = 1, max = 20 } = {}) {
  const parsed = Number(value ?? min);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
    throw registrationError("validation_error", `${field} is invalid`);
  }
  return parsed;
}

function safeEnumLikeText(value, field) {
  const normalized = String(value || "unspecified").trim().toLowerCase();
  if (!/^[a-z][a-z0-9_-]{1,31}$/.test(normalized)) {
    throw registrationError("validation_error", `${field} is invalid`);
  }
  return normalized;
}

function normalizePassword(value) {
  const password = requiredText(value, "password");
  if (password.length < 8 || password.length > 160) {
    throw registrationError("validation_error", "password is invalid");
  }
  return password;
}

function normalizeLegalAgreement(value) {
  const agreement = value && typeof value === "object" ? value : {};
  if (agreement.termsAccepted !== true || agreement.privacyAccepted !== true) {
    throw registrationError("legal_agreement_required", "legal agreement is required");
  }
  return {
    termsVersion: optionalText(agreement.termsVersion) || DEFAULT_LEGAL_VERSION,
    privacyVersion: optionalText(agreement.privacyVersion) || DEFAULT_LEGAL_VERSION
  };
}

function safeRegistrationSummary({
  userRef,
  accessRequest,
  planIntent,
  validFrom,
  validUntil
}) {
  return {
    action: "portal_registration_created",
    userRef,
    status: "registered",
    planIntent,
    trial: {
      plan: "trial",
      durationDays: TRIAL_DURATION_DAYS,
      entitlementRef: "recorded",
      accessRequestRef: accessRequest.id,
      accessRequestStatus: accessRequest.status,
      validFrom,
      validUntil
    },
    nextAction: "enter_user_panel",
    safety: {
      noSubscriptionUrl: true,
      emailReturnedToAccountOwner: true,
      noInternalAccountIdReturned: true,
      rawPasswordReturned: false,
      rawEntryTokenVisibleOnce: false,
      noRuntimeMutation: true,
      noProductionMutation: true
    }
  };
}

export function createPortalRegistrationService(options = {}) {
  const controlStore = options.controlStore;
  const userPortalAuth = options.userPortalAuth;
  const passwordCredentialService = options.passwordCredentialService;
  const portalAccessRequests = options.portalAccessRequests;
  const nowFn = options.nowFn || (() => new Date());
  const accountIdFactory = options.accountIdFactory || (() => defaultRef("acct"));
  const entitlementIdFactory = options.entitlementIdFactory || (() => defaultRef("ent_trial"));
  const approvalRefFactory = options.approvalRefFactory || (() => defaultRef("approval_registration"));
  const registrationRiskWindowMs = options.registrationRiskWindowMs ?? DEFAULT_REGISTRATION_RISK_WINDOW_MS;
  const maxRegistrationsPerSourceIp = options.maxRegistrationsPerSourceIp ?? DEFAULT_MAX_REGISTRATIONS_PER_SOURCE_IP;

  if (!controlStore) {
    throw new Error("controlStore is required");
  }
  if (!userPortalAuth || typeof userPortalAuth.createPasswordSetupSession !== "function") {
    throw new Error("userPortalAuth with createPasswordSetupSession is required");
  }
  if (!passwordCredentialService || typeof passwordCredentialService.issueInitialPasswordCredential !== "function") {
    throw new Error("passwordCredentialService with issueInitialPasswordCredential is required");
  }
  if (!portalAccessRequests || typeof portalAccessRequests.submitRequest !== "function") {
    throw new Error("portalAccessRequests with submitRequest is required");
  }

  function sourceDigests(requestContext = {}) {
    const sourceIp = optionalText(requestContext.sourceIp);
    const userAgent = optionalText(requestContext.userAgent);
    return {
      sourceIpDigest: sourceIp ? digest(sourceIp) : null,
      requestKeyDigest: sourceIp || userAgent ? digest(`${sourceIp || ""}:${userAgent || ""}`) : null
    };
  }

  function storedAccounts() {
    return typeof controlStore.listAccounts === "function" ? controlStore.listAccounts() : [];
  }

  function metadataFor(account) {
    return account?.metadata && typeof account.metadata === "object" ? account.metadata : {};
  }

  function ensureEmailNotRegistered(email) {
    const emailDigest = digest(email);
    const existing = storedAccounts().find((account) => {
      const metadata = metadataFor(account);
      return metadata.loginDigest === emailDigest || metadata.contactDigest === emailDigest;
    });
    if (existing) {
      throw registrationError("account_already_exists", "account already exists");
    }
    return emailDigest;
  }

  function recentSourceRegistrationCount({ sourceIpDigest, now }) {
    if (!sourceIpDigest || !Number.isFinite(registrationRiskWindowMs) || registrationRiskWindowMs <= 0) {
      return 0;
    }
    const windowStartMs = new Date(now).getTime() - registrationRiskWindowMs;
    return storedAccounts().filter((account) => {
      const metadata = metadataFor(account);
      if (metadata.registrationSourceIpDigest !== sourceIpDigest) {
        return false;
      }
      const createdAtMs = new Date(account.createdAt).getTime();
      return Number.isFinite(createdAtMs) && createdAtMs >= windowStartMs;
    }).length;
  }

  function enforceRegistrationRisk({ sourceIpDigest, now }) {
    if (
      Number.isFinite(maxRegistrationsPerSourceIp)
      && maxRegistrationsPerSourceIp >= 0
      && recentSourceRegistrationCount({ sourceIpDigest, now }) >= maxRegistrationsPerSourceIp
    ) {
      throw registrationError("registration_rate_limited", "registration rate limited");
    }
  }

  function submitRegistration(input = {}) {
    const now = isoNow(nowFn);
    const email = normalizeEmail(input.email);
    const password = normalizePassword(input.password);
    const legalAgreement = normalizeLegalAgreement(input.legalAgreement);
    const emailDigest = ensureEmailNotRegistered(email);
    const { sourceIpDigest, requestKeyDigest } = sourceDigests(input.requestContext);
    enforceRegistrationRisk({ sourceIpDigest, now });
    const displayName = email;
    const planIntent = normalizePlan(input.plan || input.planIntent || "trial");
    const deviceCount = normalizePositiveInteger(input.deviceCount || input.devices || DEFAULT_DEVICE_COUNT, "deviceCount");
    const primaryRegion = safeEnumLikeText(input.primaryRegion || input.region || DEFAULT_PRIMARY_REGION, "primaryRegion");
    const useCase = optionalText(input.useCase);
    const validUntil = addDays(now, TRIAL_DURATION_DAYS);
    const accountId = requiredText(input.accountId || accountIdFactory({ email, now }), "accountId");
    const entitlementId = requiredText(
      input.entitlementId || entitlementIdFactory({ accountId, now }),
      "entitlementId"
    );
    const approvalRef = requiredText(input.approvalRef || approvalRefFactory({ accountId, now }), "approvalRef");

    const createWithCredential = () => {
      controlStore.createAccount({
        id: accountId,
        ownerRef: accountId,
        status: "active",
        createdAt: now,
        updatedAt: now,
        metadata: {
          initialAccount: false,
          requireSecuritySetup: false,
          registrationSource: "self_service_portal",
          singleSubscriptionOnly: true,
          subscriptionLimit: 1,
          loginRef: email,
          displayRef: email,
          contactDigest: emailDigest,
          loginDigest: emailDigest,
          displayDigest: digest(displayName),
          useCaseDigest: useCase ? digest(useCase) : null,
          intentPlan: planIntent,
          requestedDeviceCount: deviceCount,
          primaryRegion,
          legalAgreementAccepted: true,
          legalAgreementAcceptedAt: now,
          termsVersion: legalAgreement.termsVersion,
          privacyVersion: legalAgreement.privacyVersion,
          legalAgreementSourceIpDigest: sourceIpDigest,
          legalAgreementRequestKeyDigest: requestKeyDigest,
          registrationSourceIpDigest: sourceIpDigest,
          registrationRequestKeyDigest: requestKeyDigest
        }
      });

      controlStore.createEntitlement({
        id: entitlementId,
        accountId,
        plan: "trial",
        status: "active",
        validFrom: now,
        validUntil,
        maxArtifacts: 1,
        maxDevices: deviceCount,
        trafficLimitBytes: TRIAL_TRAFFIC_LIMIT_BYTES,
        createdAt: now,
        updatedAt: now
      });

      const accessRequest = portalAccessRequests.submitRequest({
        portalUserRef: accountId,
        plan: "trial",
        clientTarget: input.clientTarget || "clash",
        quantity: 1
      });

      passwordCredentialService.issueInitialPasswordCredential({
        accountId,
        approvalRef,
        issuedByRef: "portal_self_registration",
        plainPassword: password,
        mustRotate: false
      });

      const session = userPortalAuth.createPasswordSetupSession({
        accountId,
        loginRef: email
      });

      return {
        registration: safeRegistrationSummary({
          userRef: email,
          accessRequest,
          planIntent,
          validFrom: now,
          validUntil
        }),
        session: session.session
      };
    };

    return typeof controlStore.runInTransaction === "function"
      ? controlStore.runInTransaction(createWithCredential)
      : createWithCredential();
  }

  return {
    submitRegistration
  };
}
