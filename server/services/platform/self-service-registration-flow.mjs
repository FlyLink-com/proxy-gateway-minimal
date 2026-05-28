import { createHash } from "node:crypto";
import { buildPlatformControlledOpenPackage } from "./controlled-open-flow.mjs";

const PAYMENT_PROVIDERS = new Set(["manual", "stripe_placeholder", "crypto_placeholder"]);
const PAYMENT_STATUSES = new Set(["pending", "verified", "failed", "refunded"]);
const PLANS = new Set(["pilot", "growth", "enterprise", "research"]);
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const SAFE_SOURCE_PATTERN = /^[a-z0-9_.-]+$/i;

function text(value) {
  return String(value ?? "").trim();
}

function requiredText(value, field, maxLength = 120) {
  const normalized = text(value).replace(/\s+/g, " ").slice(0, maxLength);
  if (!normalized) {
    throw new Error(`${field} is required`);
  }
  return normalized;
}

function safeSource(value) {
  const normalized = text(value).replace(/\s+/g, "-").slice(0, 80);
  if (!normalized || !SAFE_SOURCE_PATTERN.test(normalized)) {
    return "public-self-service";
  }
  return normalized;
}

function safeIso(value) {
  const raw = text(value);
  if (!raw) {
    return new Date().toISOString();
  }
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) {
    throw new Error("generatedAt must be a valid date");
  }
  return date.toISOString();
}

function hashRef(prefix, ...parts) {
  const input = parts.map(text).filter(Boolean).join("|") || prefix;
  const digest = createHash("sha256").update(input).digest("hex").slice(0, 16);
  return `${prefix}_${digest}`;
}

function normalizePlan(input) {
  const plan = text(input.registration?.requestedPlan || input.entitlement?.plan || "pilot");
  if (!PLANS.has(plan)) {
    throw new Error("requestedPlan is invalid");
  }
  return plan;
}

function normalizePayment(input = {}) {
  const provider = text(input.payment?.provider || "manual");
  if (!PAYMENT_PROVIDERS.has(provider)) {
    throw new Error("payment.provider is invalid");
  }
  const status = text(input.payment?.status || "pending");
  if (!PAYMENT_STATUSES.has(status)) {
    throw new Error("payment.status is invalid");
  }
  return {
    provider,
    status,
    verified: status === "verified",
    externalRefPresent: Boolean(text(input.payment?.externalRef)),
    paymentRef: hashRef("pay", provider, input.payment?.externalRef, status),
    captureMode: "not_captured_by_repository"
  };
}

function registrationSummary(input, plan) {
  const registration = input.registration || {};
  const organization = requiredText(registration.organization, "registration.organization");
  const email = requiredText(registration.email, "registration.email", 160).toLowerCase();
  if (!EMAIL_PATTERN.test(email)) {
    throw new Error("registration.email is invalid");
  }
  const direction = requiredText(registration.direction || "subscription access", "registration.direction");
  return {
    accepted: true,
    registrationRef: hashRef("reg", organization, email, direction),
    customerRef: hashRef("cust", email, organization),
    requestedPlan: plan,
    source: safeSource(registration.source),
    portalEntryPolicy: "operator_issued_dynamic_entry",
    rawCustomerDataReturned: false
  };
}

function blockedPackage(status, requiredNextAction, registration, payment) {
  return {
    packageId: hashRef("pkg", registration.registrationRef, payment.paymentRef, status),
    accountRef: hashRef("acct", registration.registrationRef),
    entitlementRef: hashRef("ent", registration.registrationRef, registration.requestedPlan),
    accessRef: hashRef("access", registration.registrationRef, "pending"),
    plan: registration.requestedPlan,
    accessReady: false,
    activationPackageReady: false,
    riskBoundary: "self_service_intake_only",
    requiredNextAction
  };
}

function leadFromRegistration(input) {
  const registration = input.registration || {};
  return {
    organization: registration.organization,
    email: registration.email,
    direction: registration.direction || "subscription access",
    stage: registration.stage || "self service registration",
    message: registration.message || "Self-service registration request.",
    source: registration.source || "public-self-service"
  };
}

function buildControlledOpenInput(input, generatedAt, plan) {
  return {
    generatedAt,
    lead: leadFromRegistration(input),
    account: {
      status: "active",
      displayName: input.account?.displayName
    },
    entitlement: {
      ...(input.entitlement || {}),
      plan,
      status: "active"
    },
    accessGrant: input.accessGrant || {},
    activationPackage: input.activationPackage,
    operator: {
      requestedBy: input.operator?.requestedBy || "self-service-registration-flow"
    }
  };
}

function safetyFlags() {
  return {
    advisoryOnly: true,
    summaryOnly: true,
    cliPackageOnly: true,
    noRawCustomerData: true,
    noSecrets: true,
    noSubscriptionUrls: true,
    noPublicAdmin: true,
    noPublicLoginSession: true,
    noPaymentCapture: true,
    noPaymentProviderCall: true,
    noPersistence: true,
    noProductionMutation: true,
    noTrafficMovement: true,
    requiresSeparateRiskAApprovalForPublicPortal: true,
    requiresSeparateRiskAApprovalForPaymentActivation: true,
    requiresSeparateRiskAApprovalForPersistence: true
  };
}

export function buildPlatformSelfServiceRegistrationPackage(input = {}) {
  const generatedAt = safeIso(input.generatedAt);
  const plan = normalizePlan(input);
  const payment = normalizePayment(input);
  const registration = registrationSummary(input, plan);
  const autoProvisionAllowed = input.policy?.autoProvision === true;
  const requirePaymentVerified = input.policy?.requirePaymentVerified !== false;
  const paymentBlocked = requirePaymentVerified && !payment.verified;
  const hasAccessReference = Boolean(text(input.accessGrant?.entryRef) || text(input.accessGrant?.artifactRef));
  const blockers = [
    ...(paymentBlocked ? ["payment_not_verified"] : []),
    ...(!autoProvisionAllowed ? ["auto_provision_disabled"] : []),
    ...(autoProvisionAllowed && !paymentBlocked && !hasAccessReference ? ["access_reference_missing"] : [])
  ];

  let controlledPackage = null;
  if (!paymentBlocked && autoProvisionAllowed && hasAccessReference) {
    controlledPackage = buildPlatformControlledOpenPackage(buildControlledOpenInput(input, generatedAt, plan));
  }

  const status = controlledPackage?.status
    || (paymentBlocked ? "pending_payment_verification" : "pending_operator_review");
  const requiredNextAction = paymentBlocked
    ? "verify_payment_before_auto_provision"
    : autoProvisionAllowed
      ? "provide_access_reference_before_auto_provision"
      : "operator_review_required_before_delivery";

  return {
    ok: true,
    mode: "platform-self-service-registration",
    generatedAt,
    status,
    blockers,
    registration,
    payment,
    automation: {
      autoProvisionAllowed,
      autoProvisionAttempted: Boolean(controlledPackage),
      accessIssued: controlledPackage?.flow?.accessIssued === true,
      controlledOpenReady: controlledPackage?.status === "ready_for_operator_delivery"
    },
    portal: {
      publicLoginEnabled: false,
      dynamicEntryRequired: true,
      userPanelExposure: "not_public",
      loginStateSource: "operator_issued_dynamic_entry"
    },
    package: controlledPackage?.package || blockedPackage(status, requiredNextAction, registration, payment),
    entitlement: controlledPackage?.entitlement || {
      entitlementRef: hashRef("ent", registration.registrationRef, plan),
      plan,
      status: "pending",
      usable: false,
      quota: input.entitlement?.quota || {}
    },
    access: controlledPackage?.access || {
      accessRef: hashRef("access", registration.registrationRef, "pending"),
      status: "pending",
      delivery: "operator_issued",
      hasDynamicEntry: false,
      hasArtifact: false,
      visibleOnce: true
    },
    audit: {
      recordType: "platform_self_service_registration_summary",
      evidenceKinds: [
        "registration_summary",
        "payment_status_summary",
        ...(controlledPackage ? ["controlled_open_flow_summary"] : [])
      ],
      requestedByRef: hashRef("operator", input.operator?.requestedBy || "self-service")
    },
    safety: safetyFlags()
  };
}
