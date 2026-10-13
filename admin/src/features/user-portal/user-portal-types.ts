export const PORTAL_REGISTRATION_SESSION_STORAGE_KEY = "gccwebos-portal-registration-session";
export const PORTAL_PAYMENT_RETURN_SESSION_STORAGE_KEY = "gccwebos-portal-payment-return-session-v1";

import type {
  PortalCoinCommerceClient,
  PortalCommerceModelClient,
  PortalWalletFirstCommerceClient
} from "./commerce";
import type { PortalWalletClient } from "./wallet";
import type { PortalReferralClient } from "./referrals/referral-client";
import type {
  PortalRechargeClient,
  PortalRechargeTrustedActionOriginsByAdapter
} from "./recharge";

export type PortalAuthMode = "email" | "authenticator" | "token" | "password" | "passkey";
export type PortalPlanId = "trial" | "monthly" | "monthly_basic" | "monthly_plus" | "yearly";
export type PortalClientId = "clash" | "karing";
export type PortalPaymentChannel = "alipay" | "wxpay" | "qqpay" | "bank" | "jdpay";
export type PortalPaymentOrderStatus =
  | "pending_payment"
  | "payment_amount_mismatch"
  | "payment_failed"
  | "paid_pending_admin_review"
  | "paid_access_delivered"
  | "paid_delivery_blocked"
  | string;
export type PortalSubscriptionStatus = "ready_for_operator_review" | "subscription_ready" | "subscription_disabled";
export type PortalSubscriptionLifecycle = "pending" | "active" | "expired" | "disabled";
export type PortalEmailCodePurpose = "login";
export type PortalSecondFactorKind = "authenticator" | "passkey";
export type PortalSupportCategory = "subscription" | "client_import" | "account_security" | "other";
export type PortalHumanChallengeScope = "portal_login" | "portal_registration";
export type PortalInitialAccount = {
  userRef: string;
  displayName: string;
  issuedAt: string;
  previewPassword?: string;
  requireSecuritySetup: boolean;
};
export type PortalSubscriptionEvent = {
  type: "old_link_invalidated" | "delivery_generation_reissued" | "subscription_link_reset";
  occurredAt: string;
};

export type PortalPaymentOrder = {
  accessRequestRef?: string;
  accessRequestStatus?: string;
  amountMinor: number;
  channel?: PortalPaymentChannel;
  checkoutUrl?: string;
  createdAt: string;
  currency: string;
  orderRef: string;
  paidAt?: string;
  paymentExpiresAt?: string;
  planId: PortalPlanId;
  planLabel?: string;
  providerOrderRef?: string;
  qrCode?: string;
  status: PortalPaymentOrderStatus;
  urlScheme?: string;
  safety: {
    noRawMerchantKey: true;
    noRawProviderPayload: true;
  };
};

export type PortalPaymentCheckoutInput = {
  userRef: string;
  sessionRef?: string;
  planId: Exclude<PortalPlanId, "trial">;
  clientTarget: PortalClientId;
  channel: PortalPaymentChannel;
  device?: "pc" | "mobile";
};

export type PortalPaymentOrdersInput = {
  userRef: string;
  sessionRef?: string;
  plan?: Exclude<PortalPlanId, "trial">;
  status?: PortalPaymentOrderStatus;
};

export type PortalPaymentCheckoutResult = {
  provider: string;
  order: PortalPaymentOrder;
  safety: {
    noRawMerchantKey: true;
    noRawProviderPayload: true;
    noSubscriptionIssued: true;
  };
};

export type PortalSubscriptionUsage = {
  uploadBytes: number;
  downloadBytes: number;
  usedBytes: number;
  totalBytes: number;
  usageRatio: number;
  status: "within_limit" | "over_limit" | "unmetered";
  collectionStatus: "collector_disabled" | "not_collected" | "measured_zero" | "measured" | "stale";
  channelCount: number;
  measuredChannelCount: number;
  updatedAt?: string;
};

export type PortalHistoryRecord = {
  recordRef: string;
  label: string;
  status: "待开通" | "已开通" | "已刷新" | "已过期" | "已停用";
  occurredAt: string;
};

export type PortalSession = {
  status: "authenticated_preview";
  sessionRef?: string;
  transport?: "cookie";
  expiresAt?: string;
  userRef: string;
  displayName: string;
  authMode: PortalAuthMode;
  registeredAt: string;
  safety: {
    noAdminApi: true;
    noPublicAuthActivated: true;
    noRawPasswordReturned: true;
  };
};

export type PortalSecondFactorChallenge = {
  status: "second_factor_required";
  challengeRef: string;
  userRef: string;
  displayName: string;
  authMode: "password";
  availableFactors: PortalSecondFactorKind[];
  expiresInSeconds: number;
  issuedAt: string;
  safety: {
    noAdminApi: true;
    noPublicAuthActivated: true;
    noSessionCreated: true;
  };
};

export type PortalAuthResult = PortalSession | PortalSecondFactorChallenge;

export type PortalCompleteSecondFactorInput = {
  challengeRef: string;
  factor: PortalSecondFactorKind;
  totpCode?: string;
  passkeyProof?: string;
};

export type PortalHumanVerificationInput = {
  challengeId: string;
  challengeAnswer: string;
  honeypot?: string;
};

export type PortalHumanVerificationChallenge = {
  challengeId: string;
  prompt: string;
  answer?: string;
  expiresInSeconds?: number;
  issuedAt?: string;
  safety?: {
    noAdminApi: true;
    noPublicAdmin: true;
    noRawAnswerReturned?: true;
  };
};

export type PortalHumanChallengeRequestInput = {
  scope?: PortalHumanChallengeScope;
};

export type PortalEmailCodeRequestInput = {
  purpose: PortalEmailCodePurpose;
  email: string;
  humanVerification: PortalHumanVerificationInput;
};

export type PortalRegistrationInput = {
  email: string;
  password: string;
  emailVerification?: PortalRegistrationEmailVerificationProof;
  legalAgreement: {
    termsAccepted: true;
    privacyAccepted: true;
    termsVersion: string;
    privacyVersion: string;
  };
};

export type PortalRegistrationEmailVerificationInput = {
  email: string;
};

export type PortalRegistrationEmailVerificationProof = {
  verificationRef: string;
  code: string;
};

export type PortalRegistrationEmailVerificationChallenge = {
  status: "requested" | "simulated";
  verificationRef: string;
  expiresInSeconds: number;
  safety: {
    noAdminApi: true;
    noAccountCreated: true;
    noPublicAuthActivated: true;
    noRawCodeReturned: true;
    noRawEmailReturned: true;
  };
};

export type PortalRegistrationResultBase = {
  status: "registered";
  userRef: string;
  session: PortalSession;
  safety: {
    noAdminApi: true;
    noPaymentActivation: true;
    noPublicAdmin: true;
    noRawCustomerDataReturned: true;
    rawPasswordReturned: false;
  };
};

export type PortalRegistrationWelcomeBonus = {
  status: "pending" | "available";
  coinType: "bonus_coins";
  amountUnits: 10;
  expiresAt: string;
};

export type PortalLegacyTrialRegistrationResult = PortalRegistrationResultBase & {
  commercialModel: "legacy";
  trial: {
    durationDays: number;
    validUntil: string;
    accessRequestStatus: string;
  };
  welcomeBonus?: never;
};

/**
 * A registration-only promotion.  The account deliberately remains on the
 * normal legacy Commerce model; the welcome Coins do not select the deferred
 * wallet-first commerce path.
 */
export type PortalLegacyWelcomeCoinsRegistrationResult = PortalRegistrationResultBase & {
  commercialModel: "legacy";
  welcomeBonus: PortalRegistrationWelcomeBonus;
  trial?: never;
};

export type PortalWalletFirstRegistrationResult = PortalRegistrationResultBase & {
  commercialModel: "wallet_first_unique_v1";
  welcomeBonus: PortalRegistrationWelcomeBonus;
  trial?: never;
};

export type PortalRegistrationResult =
  | PortalLegacyTrialRegistrationResult
  | PortalLegacyWelcomeCoinsRegistrationResult
  | PortalWalletFirstRegistrationResult;

export type PortalWelcomeCoinsRegistrationResult =
  | PortalLegacyWelcomeCoinsRegistrationResult
  | PortalWalletFirstRegistrationResult;

export function isPortalWelcomeCoinsRegistration(
  result: PortalRegistrationResult
): result is PortalWelcomeCoinsRegistrationResult {
  return Object.hasOwn(result, "welcomeBonus");
}

export function isPortalWalletFirstRegistration(
  result: PortalRegistrationResult
): result is PortalWalletFirstRegistrationResult {
  return result.commercialModel === "wallet_first_unique_v1";
}

export type PortalEmailCodeChallenge = {
  status: "simulated" | "requested";
  challengeRef: string;
  expiresInSeconds: number;
  safety: {
    noAdminApi: true;
    noPublicAuthActivated: true;
    noRawCodeReturned: true;
  };
};

export type PortalAuthInput = {
  mode: "email";
  email: string;
  verificationCode: string;
  humanVerification: PortalHumanVerificationInput;
} | {
  mode: "authenticator";
  accountId: string;
  totpCode: string;
  humanVerification: PortalHumanVerificationInput;
} | {
  mode: "token";
  entryToken: string;
  encryptedTotpSecret: string;
  totpCode: string;
  humanVerification: PortalHumanVerificationInput;
} | {
  mode: "password";
  accountId: string;
  password: string;
  rememberMe?: boolean;
  verificationCode?: string;
  humanVerification: PortalHumanVerificationInput;
};

export type PortalApplySubscriptionInput = {
  userRef: string;
  sessionRef?: string;
  planId: PortalPlanId;
  clientTarget: PortalClientId;
  requestOnly?: boolean;
  durationDays?: number;
  quantity?: number;
};

export type PortalRefreshSubscriptionInput = {
  userRef: string;
  sessionRef?: string;
  requestRef: string;
  clientTarget: PortalClientId;
};

export type PortalResetSubscriptionLinkInput = {
  userRef: string;
  sessionRef?: string;
  requestRef: string;
  idempotencyKey: string;
};

export type PortalRevealSubscriptionInput = {
  userRef: string;
  sessionRef?: string;
  requestRef: string;
};

export type PortalDisableSubscriptionInput = {
  userRef: string;
  sessionRef?: string;
  requestRef: string;
};

export type PortalSupportRequestInput = {
  userRef: string;
  sessionRef?: string;
  category: PortalSupportCategory;
  message: string;
  clientTarget: PortalClientId;
  subscriptionRequestRef?: string;
};

export type PortalSupportRequest = {
  status: "submitted";
  supportRef: string;
  userRef: string;
  category: PortalSupportCategory;
  clientTarget: PortalClientId;
  subscriptionRequestRef?: string;
  submittedAt: string;
  safety: {
    noAdminApi: true;
    noDbMutation?: true;
    noPaymentActivation: true;
    noPublicAdmin: true;
    noRawMessageReturned: true;
    noRuntimeMutation?: true;
  };
};

export type PortalSubscriptionRequest = {
  status: PortalSubscriptionStatus;
  lifecycle: PortalSubscriptionLifecycle;
  requestRef: string;
  userRef: string;
  planId: PortalPlanId;
  clientTarget: PortalClientId;
  expiresAt: string;
  durationDays?: number;
  quantity?: number;
  subscriptionUrl?: string;
  usage?: PortalSubscriptionUsage;
  nextAction: "operator_review_required" | "copy_subscription_url" | "subscription_disabled";
  updatedAt?: string;
  event?: PortalSubscriptionEvent;
  historySummary?: PortalHistoryRecord[];
  safety: {
    noAdminApi: true;
    noDbMutation?: true;
    noPaymentActivation: true;
    noPublicAdmin: true;
    noRawCustomerDataReturned: true;
  };
};

export type PortalAccountEntitlement = {
  entitlementRef: string;
  accountId?: string;
  plan: PortalPlanId | string;
  status: string;
  usable: boolean;
  validUntil?: string;
  quota?: {
    trafficGb?: number;
  };
};

/**
 * Safe, session-owned read projection for a wallet-first account resource.
 * It deliberately carries no subscription URL, configuration material,
 * resource reference, node identity, or other delivery internals.
 */
export type PortalCurrentResourcePlan = {
  id: string;
  durationDays: number;
  monthlyTrafficGb: number;
};

export type PortalCurrentResource =
  | {
    state: "none";
  }
  | {
    state: "reconciliation_required";
  }
  | {
    state: "available";
    plan: PortalCurrentResourcePlan;
    validUntil: string;
    setupAvailable: boolean;
  };

/**
 * Ephemeral, explicitly requested setup delivery for a wallet-first resource.
 * The handoff reference is only used for the immediately following explicit
 * acknowledgement; callers must not persist either field.
 */
export type PortalCurrentResourceSetupDelivery = {
  handoffRef: string;
  kind: "subscription_url";
  subscriptionUrl: string;
};

export type PortalUserState = {
  userRef: string;
  subscriptionRequest: PortalSubscriptionRequest | null;
  subscriptionRequests?: PortalSubscriptionRequest[];
  accountEntitlements?: PortalAccountEntitlement[];
  paymentOrders?: PortalPaymentOrder[];
  historySummary?: PortalHistoryRecord[];
  security?: PortalUserSecurityState;
  updatedAt: string;
  safety: {
    noAdminApi: true;
    noPaymentActivation: true;
    noPublicAdmin: true;
  };
};

export type PortalUserSecurityState = {
  authenticatorBound: boolean;
  initialAccount: boolean;
  passkeyEnabled: boolean;
  passkeyExported: boolean;
  setupRequired: boolean;
};

export type PortalAuthenticatorEnrollment = {
  status: "preview";
  enrollmentRef: string;
  userRef: string;
  issuer: string;
  accountLabel: string;
  manualKey: string;
  otpauthUri: string;
  qrDataUri: string;
  expiresInSeconds: number;
  issuedAt: string;
  safety: {
    noAdminApi: true;
    noPublicAuthActivated: true;
    noProductionCredentialMutation: boolean;
  };
};

export type PortalAuthenticatorBinding = {
  status: "bound_preview";
  userRef: string;
  method: "totp";
  boundAt: string;
  safety: {
    noAdminApi: true;
    noPublicAuthActivated: true;
    noProductionCredentialMutation: boolean;
    noRawSecretReturned: true;
  };
};

export type PortalPasskeyBinding = {
  status: "bound_preview";
  userRef: string;
  method: "passkey";
  boundAt: string;
  safety: {
    noAdminApi: true;
    noPublicAuthActivated: true;
    noProductionCredentialMutation: true;
  };
};

export type PortalPasskeyExport = {
  status: "exported_preview";
  userRef: string;
  method: "passkey";
  fileName: string;
  body: string;
  exportedAt: string;
  safety: {
    noAdminApi: true;
    noPublicAuthActivated: true;
    noProductionCredentialMutation: true;
    noRawPrivateKeyReturned: true;
  };
};

export type UserPortalClient = {
  restoreSession?(): Promise<PortalSession | null>;
  logout?(input: { sessionRef: string }): Promise<void>;
  commerce?: PortalCoinCommerceClient;
  commerceModel?: PortalCommerceModelClient;
  walletFirstCommerce?: PortalWalletFirstCommerceClient;
  wallet?: PortalWalletClient;
  referral?: PortalReferralClient;
  recharge?: PortalRechargeClient;
  issueHumanChallenge(input?: PortalHumanChallengeRequestInput): Promise<PortalHumanVerificationChallenge>;
  requestEmailCode(input: PortalEmailCodeRequestInput): Promise<PortalEmailCodeChallenge>;
  requestRegistrationEmailVerification(
    input: PortalRegistrationEmailVerificationInput
  ): Promise<PortalRegistrationEmailVerificationChallenge>;
  registerTrialAccount(input: PortalRegistrationInput): Promise<PortalRegistrationResult>;
  authenticate(input: PortalAuthInput): Promise<PortalAuthResult>;
  completeSecondFactor(input: PortalCompleteSecondFactorInput): Promise<PortalSession>;
  fetchCurrentState(input: { userRef: string; sessionRef?: string }): Promise<PortalUserState>;
  fetchCurrentResource?(input: { sessionRef: string }): Promise<PortalCurrentResource>;
  createCurrentResourceSetup?(input: {
    sessionRef: string;
    idempotencyKey: string;
  }): Promise<PortalCurrentResourceSetupDelivery>;
  acknowledgeCurrentResourceSetup?(input: {
    sessionRef: string;
    handoffRef: string;
  }): Promise<void>;
  fetchSecurityState?(input: { sessionRef: string }): Promise<PortalUserSecurityState>;
  fetchPaymentOrders(input: PortalPaymentOrdersInput): Promise<PortalPaymentOrder[]>;
  createPaymentCheckout(input: PortalPaymentCheckoutInput): Promise<PortalPaymentCheckoutResult>;
  startAuthenticatorEnrollment(input: { userRef: string; sessionRef?: string }): Promise<PortalAuthenticatorEnrollment>;
  confirmAuthenticatorEnrollment(input: {
    userRef: string;
    sessionRef?: string;
    enrollmentRef: string;
    totpCode: string;
  }): Promise<PortalAuthenticatorBinding>;
  enablePasskey(input: { userRef: string }): Promise<PortalPasskeyBinding>;
  exportPasskey(input: { userRef: string }): Promise<PortalPasskeyExport>;
  applyForSubscription(input: PortalApplySubscriptionInput): Promise<PortalSubscriptionRequest>;
  submitSupportRequest(input: PortalSupportRequestInput): Promise<PortalSupportRequest>;
  revealSubscription(input: PortalRevealSubscriptionInput): Promise<PortalSubscriptionRequest>;
  refreshSubscription(input: PortalRefreshSubscriptionInput): Promise<PortalSubscriptionRequest>;
  resetSubscriptionLink(input: PortalResetSubscriptionLinkInput): Promise<PortalSubscriptionRequest>;
  disableSubscription(input: PortalDisableSubscriptionInput): Promise<PortalSubscriptionRequest>;
};

export type LocalUserPortalClientOptions = {
  now?: () => Date;
  demoSubscriptionUrl?: string;
  initialAccounts?: PortalInitialAccount[];
  previewPassword?: string;
  totpSecretFactory?: () => string;
};

export type HttpUserPortalClientOptions = {
  baseUrl?: string;
  fetchFn?: typeof fetch;
  now?: () => Date;
  rechargeTrustedActionOriginsJson?: string;
  rechargeTrustedActionOriginsByAdapter?: PortalRechargeTrustedActionOriginsByAdapter;
};
