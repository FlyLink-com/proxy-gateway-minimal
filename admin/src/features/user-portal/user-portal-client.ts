import {
  createOtpauthUri,
  formatBase32Secret,
  randomBase32Secret,
  verifyTotpCode
} from "./totp-preview";

export const PORTAL_REGISTRATION_SESSION_STORAGE_KEY = "gccwebos-portal-registration-session";

export type PortalAuthMode = "email" | "authenticator" | "token" | "password" | "passkey";
export type PortalPlanId = "trial" | "monthly" | "monthly_basic" | "monthly_plus" | "yearly";
export type PortalClientId = "clash" | "karing";
export type PortalPaymentChannel = "paypal" | "worldfirst" | "alipay" | "wxpay" | "qqpay" | "bank" | "jdpay";
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
  type: "old_link_invalidated";
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
  provider?: string;
  providerCaptureRef?: string;
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

export type PortalPaymentCaptureInput = {
  userRef: string;
  sessionRef?: string;
  orderRef: string;
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

export type PortalRegistrationResult = {
  status: "registered";
  userRef: string;
  session: PortalSession;
  trial: {
    durationDays: number;
    validUntil: string;
    accessRequestStatus: string;
  };
  safety: {
    noAdminApi: true;
    noPaymentActivation: true;
    noPublicAdmin: true;
    noRawCustomerDataReturned: true;
    rawPasswordReturned: false;
  };
};

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
  issueHumanChallenge(input?: PortalHumanChallengeRequestInput): Promise<PortalHumanVerificationChallenge>;
  requestEmailCode(input: PortalEmailCodeRequestInput): Promise<PortalEmailCodeChallenge>;
  requestRegistrationEmailVerification(
    input: PortalRegistrationEmailVerificationInput
  ): Promise<PortalRegistrationEmailVerificationChallenge>;
  registerTrialAccount(input: PortalRegistrationInput): Promise<PortalRegistrationResult>;
  authenticate(input: PortalAuthInput): Promise<PortalAuthResult>;
  completeSecondFactor(input: PortalCompleteSecondFactorInput): Promise<PortalSession>;
  fetchCurrentState(input: { userRef: string; sessionRef?: string }): Promise<PortalUserState>;
  fetchPaymentOrders(input: PortalPaymentOrdersInput): Promise<PortalPaymentOrder[]>;
  createPaymentCheckout(input: PortalPaymentCheckoutInput): Promise<PortalPaymentCheckoutResult>;
  capturePaymentCheckout(input: PortalPaymentCaptureInput): Promise<PortalPaymentCheckoutResult>;
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
};

async function createQrDataUri(otpauthUri: string) {
  const { default: QRCode } = await import("qrcode");
  return QRCode.toDataURL(otpauthUri, {
    errorCorrectionLevel: "M",
    margin: 1,
    width: 208
  });
}

function portalError(message: string) {
  return new Error(message);
}

function requiredText(value: string | undefined, message: string) {
  const normalized = String(value ?? "").trim();
  if (!normalized) {
    throw portalError(message);
  }
  return normalized;
}

function requiredEmail(value: string | undefined) {
  const email = requiredText(value, "请输入邮箱。").toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw portalError("请输入正确的邮箱。");
  }
  return email;
}

function verifiedHuman(input: PortalHumanVerificationInput | undefined) {
  if (String(input?.honeypot ?? "").trim()) {
    throw portalError("防机器人校验失败。");
  }
  const challengeAnswer = requiredText(input?.challengeAnswer, "请完成防机器人校验。");
  const challengeId = requiredText(input?.challengeId, "请完成防机器人校验。");
  const match = /^local-math-v1:(\d{1,2})\+(\d{1,2})$/.exec(challengeId);
  if (!match) {
    throw portalError("请完成防机器人校验。");
  }
  const left = Number(match[1]);
  const right = Number(match[2]);
  const expectedAnswer = String(left + right);
  if (left < 1 || left > 20 || right < 1 || right > 20 || challengeAnswer !== expectedAnswer) {
    throw portalError("请完成防机器人校验。");
  }
  return {
    challengeId,
    challengeAnswer,
    honeypot: ""
  };
}

function createLocalHumanVerificationChallenge(): PortalHumanVerificationChallenge {
  const left = 2 + Math.floor(Math.random() * 8);
  const right = 2 + Math.floor(Math.random() * 8);
  return {
    challengeId: `local-math-v1:${left}+${right}`,
    prompt: `${left} + ${right} = ?`,
    answer: String(left + right),
    safety: {
      noAdminApi: true,
      noPublicAdmin: true
    }
  };
}

function backendHumanVerification(input: PortalHumanVerificationInput | undefined) {
  if (String(input?.honeypot ?? "").trim()) {
    throw portalError("防机器人校验失败。");
  }
  return {
    challengeRef: requiredText(input?.challengeId, "请完成防机器人校验。"),
    answer: requiredText(input?.challengeAnswer, "请完成防机器人校验。")
  };
}

function backendFactor(factor: PortalSecondFactorKind) {
  return factor === "authenticator" ? "totp" : "passkey";
}

function portalFactor(factor: string): PortalSecondFactorKind | null {
  if (factor === "totp" || factor === "authenticator") return "authenticator";
  if (factor === "passkey") return "passkey";
  return null;
}

function mapBackendHumanChallenge(raw: Record<string, unknown>, now: () => Date): PortalHumanVerificationChallenge {
  return {
    challengeId: requiredText(String(raw.challengeRef ?? raw.id ?? ""), "防机器人校验无效。"),
    prompt: requiredText(String(raw.prompt ?? ""), "防机器人校验无效。"),
    expiresInSeconds: Number(raw.expiresInSeconds ?? 120),
    issuedAt: typeof raw.issuedAt === "string" ? raw.issuedAt : now().toISOString(),
    safety: {
      noAdminApi: true,
      noPublicAdmin: true,
      noRawAnswerReturned: true
    }
  };
}

function mapRegistrationResult(body: Record<string, unknown>): PortalRegistrationResult {
  const registration = (body.registration ?? {}) as Record<string, unknown>;
  const trial = (registration.trial ?? {}) as Record<string, unknown>;
  const session = (body.session ?? {}) as Record<string, unknown>;
  const userRef = requiredText(
    (
      registration.userRef
      ?? session.userRef
      ?? session.displayName
      ?? session.loginRef
    ) as string | undefined,
    "注册结果无效。"
  );
  return {
    status: "registered",
    userRef,
    session: sessionSummary(
      requiredText(
        (session.userRef ?? session.loginRef ?? userRef) as string | undefined,
        "注册会话无效。"
      ),
      authModeFromBackend(session.authMethod as string | undefined, "password"),
      String(session.issuedAt ?? new Date().toISOString()),
      String(session.displayName ?? session.userRef ?? session.loginRef ?? userRef),
      typeof session.sessionRef === "string" ? session.sessionRef : undefined
    ),
    trial: {
      durationDays: normalizeOrderDurationDays(Number(trial.durationDays ?? 7), 7),
      validUntil: requiredText(trial.validUntil as string | undefined, "试用有效期无效。"),
      accessRequestStatus: String(trial.accessRequestStatus ?? "pending_admin_review")
    },
    safety: {
      noAdminApi: true,
      noPaymentActivation: true,
      noPublicAdmin: true,
      noRawCustomerDataReturned: true,
      rawPasswordReturned: false
    }
  };
}

function mapRegistrationEmailVerification(
  body: Record<string, unknown>
): PortalRegistrationEmailVerificationChallenge {
  const verification = (body.verification ?? {}) as Record<string, unknown>;
  return {
    status: String(verification.status ?? "requested") === "simulated" ? "simulated" : "requested",
    verificationRef: requiredText(verification.verificationRef as string | undefined, "邮箱验证码请求无效。"),
    expiresInSeconds: Number(verification.expiresInSeconds ?? 600),
    safety: {
      noAdminApi: true,
      noAccountCreated: true,
      noPublicAuthActivated: true,
      noRawCodeReturned: true,
      noRawEmailReturned: true
    }
  };
}

function registrationEmailVerificationProof(
  input: PortalRegistrationInput["emailVerification"] | undefined
): PortalRegistrationEmailVerificationProof {
  return {
    verificationRef: requiredText(input?.verificationRef, "请先发送邮箱验证码。"),
    code: requiredText(input?.code, "请输入邮箱验证码。")
  };
}

function legalAgreementProof(input: PortalRegistrationInput["legalAgreement"]) {
  if (input?.termsAccepted !== true || input?.privacyAccepted !== true) {
    throw portalError("请先同意服务条款和隐私政策。");
  }
  return {
    termsAccepted: true,
    privacyAccepted: true,
    termsVersion: requiredText(input.termsVersion, "服务条款版本无效。"),
    privacyVersion: requiredText(input.privacyVersion, "隐私政策版本无效。")
  };
}

function authModeFromBackend(value: string | undefined, fallback: PortalAuthMode): PortalAuthMode {
  if (value === "totp") return "authenticator";
  if (value === "password" || value === "passkey" || value === "token" || value === "authenticator") return value;
  return fallback;
}

function stableRef(prefix: string, value: string) {
  let hash = 2166136261;
  for (const char of value) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return `${prefix}_${(hash >>> 0).toString(36)}`;
}

function expiresAtFromDays(now: Date, days: number) {
  if (!Number.isInteger(days) || days <= 0 || days > 4380) {
    throw portalError("有效期必须在 1 到 4380 天之间。");
  }
  const date = new Date(now);
  date.setDate(date.getDate() + days);
  return date.toISOString();
}

function durationDaysForPlan(planId: PortalPlanId) {
  if (planId === "yearly") return 365;
  if (planId === "trial") return 7;
  return 30;
}

function normalizeOrderDurationDays(value: unknown, fallback: number) {
  const parsed = typeof value === "number" ? value : Number(value);
  if (parsed === 7 || parsed === 30 || parsed === 365) return parsed;
  return fallback;
}

function normalizeOrderQuantity(value: unknown) {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) return 1;
  return Math.max(1, Math.min(12, Math.trunc(parsed)));
}

function planLabel(planId: PortalPlanId) {
  if (planId === "yearly") return "年度套餐";
  if (planId === "monthly_basic") return "基础月付";
  if (planId === "monthly_plus") return "标准月付";
  if (planId === "trial") return "7 天订阅";
  return "月付套餐";
}

function normalizePaymentPlan(value: unknown): PortalPaymentCheckoutInput["planId"] {
  if (value === "yearly" || value === "monthly_plus" || value === "monthly_basic") return value;
  if (value === "monthly") return "monthly_basic";
  throw portalError("支付套餐无效。");
}

function amountMinorForPlan(planId: Exclude<PortalPlanId, "trial">) {
  if (planId === "yearly") return 20000;
  if (planId === "monthly_plus") return 3000;
  return 2000;
}

function mapPaymentOrder(record: Record<string, unknown>): PortalPaymentOrder {
  const planId = normalizePaymentPlan(record.plan ?? record.planId);
  const orderRef = requiredText(String(record.orderRef ?? ""), "支付订单无效。");
  const channel = typeof record.channel === "string" && ["paypal", "worldfirst", "alipay", "wxpay", "qqpay", "bank", "jdpay"].includes(record.channel)
    ? record.channel as PortalPaymentChannel
    : undefined;
  return {
    orderRef,
    planId,
    planLabel: typeof record.planLabel === "string" ? record.planLabel : planLabel(planId),
    amountMinor: Number(record.amountMinor ?? amountMinorForPlan(planId)),
    channel,
    currency: String(record.currency ?? "CNY"),
    status: String(record.status ?? "pending_payment"),
    provider: typeof record.provider === "string" ? record.provider : undefined,
    checkoutUrl: typeof record.checkoutUrl === "string" ? record.checkoutUrl : undefined,
    urlScheme: typeof record.urlScheme === "string" ? record.urlScheme : undefined,
    qrCode: typeof record.qrCode === "string" ? record.qrCode : undefined,
    paymentExpiresAt: typeof record.paymentExpiresAt === "string"
      ? record.paymentExpiresAt
      : typeof record.checkoutExpiresAt === "string"
        ? record.checkoutExpiresAt
        : undefined,
    providerOrderRef: typeof record.providerOrderRef === "string" ? record.providerOrderRef : undefined,
    providerCaptureRef: typeof record.providerCaptureRef === "string" ? record.providerCaptureRef : undefined,
    accessRequestRef: typeof record.accessRequestRef === "string" ? record.accessRequestRef : undefined,
    accessRequestStatus: typeof record.accessRequestStatus === "string" ? record.accessRequestStatus : undefined,
    paidAt: typeof record.paidAt === "string" ? record.paidAt : undefined,
    createdAt: requiredText(String(record.createdAt ?? ""), "支付订单时间无效。"),
    safety: {
      noRawMerchantKey: true,
      noRawProviderPayload: true
    }
  };
}

function normalizeSupportMessage(value: string) {
  const message = requiredText(value, "请输入问题描述。").replace(/\s+/g, " ");
  if (message.length < 6) {
    throw portalError("问题描述至少需要 6 个字符。");
  }
  if (message.length > 1200) {
    throw portalError("问题描述不能超过 1200 个字符。");
  }
  return message;
}

function sessionSummary(
  userRef: string,
  mode: PortalAuthMode,
  issuedAt: string,
  displayName = userRef,
  sessionRef?: string
): PortalSession {
  return {
    status: "authenticated_preview",
    sessionRef,
    userRef,
    displayName,
    authMode: mode,
    registeredAt: issuedAt,
    safety: {
      noAdminApi: true,
      noPublicAuthActivated: true,
      noRawPasswordReturned: true
    }
  };
}

function parsePasskeyProof(proof: string) {
  try {
    const parsed = JSON.parse(proof);
    if (
      parsed?.version !== 1
      || parsed?.type !== "local-passkey-preview"
      || parsed?.issuer !== "GCC Gateway Portal"
      || typeof parsed?.userRef !== "string"
      || typeof parsed?.passkeyRef !== "string"
    ) {
      return null;
    }
    return {
      userRef: parsed.userRef,
      passkeyRef: parsed.passkeyRef
    };
  } catch {
    return null;
  }
}

function previewPasswordForInitialAccount(account: PortalInitialAccount, index: number, fallbackPassword: string) {
  const explicitPassword = account.previewPassword?.trim();
  if (explicitPassword) return explicitPassword;
  if (index === 0) return fallbackPassword;
  return `${fallbackPassword}-${String(index).padStart(3, "0")}`;
}

export function createLocalPreviewInitialAccounts(count = 5): PortalInitialAccount[] {
  const knownRefs = [
    "user_safe_ref",
    "portal_user_001",
    "portal_user_002",
    "portal_user_003",
    "portal_user_004"
  ];
  return knownRefs.slice(0, Math.max(1, Math.min(count, knownRefs.length))).map((userRef, index) => ({
    userRef,
    displayName: index === 0 ? "user_safe_ref" : `Portal User ${String(index).padStart(3, "0")}`,
    issuedAt: "2026-06-03T00:00:00.000Z",
    requireSecuritySetup: true
  }));
}

function finiteNumber(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function mapSubscriptionUsage(raw: {
  uploadBytes?: unknown;
  downloadBytes?: unknown;
  usedBytes?: unknown;
  totalBytes?: unknown;
  usageRatio?: unknown;
  status?: unknown;
  collectionStatus?: unknown;
  channelCount?: unknown;
  measuredChannelCount?: unknown;
  updatedAt?: unknown;
} | undefined): PortalSubscriptionUsage | undefined {
  if (!raw) return undefined;
  const status = raw.status === "over_limit" || raw.status === "unmetered" ? raw.status : "within_limit";
  const usedBytes = Math.max(0, Math.trunc(finiteNumber(raw.usedBytes)));
  const collectionStatus = raw.collectionStatus === "collector_disabled"
    || raw.collectionStatus === "not_collected"
    || raw.collectionStatus === "measured_zero"
    || raw.collectionStatus === "measured"
    || raw.collectionStatus === "stale"
    ? raw.collectionStatus
    : usedBytes > 0
      ? "measured"
      : "measured_zero";
  const channelCount = Math.max(0, Math.trunc(finiteNumber(raw.channelCount)));
  const measuredChannelCount = Math.max(0, Math.trunc(finiteNumber(raw.measuredChannelCount)));
  return {
    uploadBytes: Math.max(0, Math.trunc(finiteNumber(raw.uploadBytes))),
    downloadBytes: Math.max(0, Math.trunc(finiteNumber(raw.downloadBytes))),
    usedBytes,
    totalBytes: Math.max(0, Math.trunc(finiteNumber(raw.totalBytes))),
    usageRatio: Math.max(0, finiteNumber(raw.usageRatio)),
    status,
    collectionStatus,
    channelCount,
    measuredChannelCount: channelCount > 0 ? Math.min(measuredChannelCount, channelCount) : measuredChannelCount,
    ...(typeof raw.updatedAt === "string" && raw.updatedAt.trim() ? { updatedAt: raw.updatedAt } : {})
  };
}

function mapAccessRequest(record: {
  id?: string;
  portalUserRef?: string;
  plan?: PortalPlanId;
  clientTarget?: PortalClientId;
  durationDays?: number;
  quantity?: number;
  status?: string;
  nextAction?: string;
  submittedAt?: string;
  updatedAt?: string;
  expiresAt?: string;
  validUntil?: string;
  subscriptionUrl?: string;
  usage?: Parameters<typeof mapSubscriptionUsage>[0];
  event?: PortalSubscriptionEvent;
  entitlementRef?: string | null;
  accessGrantRef?: string | null;
  safety?: {
    noDbMutation?: true;
  };
}): PortalSubscriptionRequest {
  const planId = record.plan ?? "monthly";
  const disabled = record.status === "user_disabled" || record.status === "disabled" || record.status === "revoked";
  const lifecycle: PortalSubscriptionLifecycle = disabled
    ? "disabled"
    : record.status === "delivered" || record.status === "issued" || Boolean(record.accessGrantRef || record.subscriptionUrl)
      ? "active"
      : "pending";
  const subscriptionReady = lifecycle === "active" && Boolean(record.accessGrantRef || record.subscriptionUrl);
  const expiresAt = record.expiresAt ?? record.validUntil ?? (lifecycle === "active" && record.durationDays
    ? `开通后 ${record.durationDays} 天`
    : lifecycle === "disabled"
      ? "已停用"
      : "开通中");
  const historyStatus = disabled ? "已停用" : subscriptionReady ? "已开通" : "待开通";
  return {
    status: disabled ? "subscription_disabled" : subscriptionReady ? "subscription_ready" : "ready_for_operator_review",
    lifecycle,
    requestRef: requiredText(record.id, "申请记录无效。"),
    userRef: requiredText(record.portalUserRef, "用户会话无效。"),
    planId,
    clientTarget: record.clientTarget ?? "clash",
    expiresAt,
    durationDays: normalizeOrderDurationDays(record.durationDays, durationDaysForPlan(planId)),
    quantity: normalizeOrderQuantity(record.quantity),
    subscriptionUrl: disabled ? undefined : record.subscriptionUrl,
    usage: mapSubscriptionUsage(record.usage),
    nextAction: disabled ? "subscription_disabled" : subscriptionReady ? "copy_subscription_url" : "operator_review_required",
    updatedAt: record.updatedAt ?? record.submittedAt,
    event: record.event,
    historySummary: [
      {
        recordRef: `history_${record.id ?? "request"}`,
        label: `${disabled ? "停用" : "申请"}${planLabel(planId)}（${historyStatus}）`,
        status: historyStatus,
        occurredAt: record.updatedAt ?? record.submittedAt ?? new Date(0).toISOString()
      }
    ],
    safety: {
      noAdminApi: true,
      ...(record.safety?.noDbMutation === true ? { noDbMutation: true } : {}),
      noPaymentActivation: true,
      noPublicAdmin: true,
      noRawCustomerDataReturned: true
    }
  };
}

function mapAccountEntitlement(record: Record<string, unknown>): PortalAccountEntitlement {
  const quota = record.quota && typeof record.quota === "object"
    ? record.quota as Record<string, unknown>
    : {};
  const trafficGb = Number(quota.trafficGb ?? 0);
  const accountId = typeof record.accountId === "string" && record.accountId.trim()
    ? record.accountId
    : undefined;
  const validUntil = typeof record.validUntil === "string" && record.validUntil.trim()
    ? record.validUntil
    : undefined;
  const entitlementRef = typeof record.id === "string" && record.id.trim()
    ? record.id
    : typeof record.entitlementRef === "string"
      ? record.entitlementRef
      : undefined;
  return {
    entitlementRef: requiredText(entitlementRef, "账户权益无效。"),
    ...(accountId ? { accountId } : {}),
    plan: String(record.plan ?? ""),
    status: String(record.status ?? "pending"),
    usable: record.usable === true,
    ...(validUntil ? { validUntil } : {}),
    quota: {
      trafficGb: Number.isFinite(trafficGb) ? Math.max(0, trafficGb) : 0
    }
  };
}

function subscriptionRequestsFromState(state: PortalUserState) {
  return state.subscriptionRequests ?? (state.subscriptionRequest ? [state.subscriptionRequest] : []);
}

function upsertSubscriptionRequest(
  requests: PortalSubscriptionRequest[],
  request: PortalSubscriptionRequest
) {
  return [
    ...requests.filter((existing) => existing.requestRef !== request.requestRef),
    request
  ];
}

function historySummaryForRequests(requests: PortalSubscriptionRequest[]) {
  return requests.flatMap((request) => request.historySummary ?? []);
}

function mapSupportRequest(record: {
  id?: string;
  portalUserRef?: string;
  category?: PortalSupportCategory;
  clientTarget?: PortalClientId;
  subscriptionRequestRef?: string | null;
  submittedAt?: string;
}): PortalSupportRequest {
  return {
    status: "submitted",
    supportRef: requiredText(record.id, "支持请求无效。"),
    userRef: requiredText(record.portalUserRef, "用户会话无效。"),
    category: record.category ?? "other",
    clientTarget: record.clientTarget ?? "clash",
    subscriptionRequestRef: record.subscriptionRequestRef || undefined,
    submittedAt: requiredText(record.submittedAt, "支持请求时间无效。"),
    safety: {
      noAdminApi: true,
      noPaymentActivation: true,
      noPublicAdmin: true,
      noRawMessageReturned: true,
      noRuntimeMutation: true
    }
  };
}

export function createLocalUserPortalClient(options: LocalUserPortalClientOptions = {}): UserPortalClient {
  const now = options.now ?? (() => new Date());
  const states = new Map<string, PortalUserState>();
  const previewPassword = requiredText(options.previewPassword ?? "user-password", "预览密码无效。");
  const initialAccounts = new Map(
    (options.initialAccounts ?? createLocalPreviewInitialAccounts()).map((account, index) => [
      account.userRef,
      {
        ...account,
        previewPassword: previewPasswordForInitialAccount(account, index, previewPassword)
      }
    ])
  );
  const accountSecurity = new Map<string, {
    authenticatorSecret?: string;
    passkeyExported?: boolean;
    passkeyEnabled?: boolean;
    passkeyRef?: string;
  }>();
  const paymentOrders = new Map<string, PortalPaymentOrder[]>();
  const authenticatorEnrollments = new Map<string, {
    expiresAt: string;
    secret: string;
    userRef: string;
  }>();
  const registrationEntryAccounts = new Map<string, string>();
  const secondFactorChallenges = new Map<string, {
    availableFactors: PortalSecondFactorKind[];
    expiresAt: string;
    userRef: string;
  }>();
  let localSubscriptionSequence = 0;
  let localPaymentSequence = 0;

  function securityState(userRef: string): PortalUserSecurityState {
    const security = accountSecurity.get(userRef);
    const initialAccount = initialAccounts.get(userRef);
    const authenticatorBound = Boolean(security?.authenticatorSecret);
    const passkeyEnabled = security?.passkeyEnabled === true;
    const passkeyExported = security?.passkeyExported === true;
    return {
      authenticatorBound,
      initialAccount: Boolean(initialAccount),
      passkeyEnabled,
      passkeyExported,
      setupRequired: Boolean(initialAccount?.requireSecuritySetup) && (!authenticatorBound || !passkeyExported)
    };
  }

  function enabledFactors(userRef: string): PortalSecondFactorKind[] {
    const security = securityState(userRef);
    const factors: PortalSecondFactorKind[] = [];
    if (security.authenticatorBound) factors.push("authenticator");
    if (security.passkeyEnabled && security.passkeyExported) factors.push("passkey");
    return factors;
  }

  function emptyState(userRef: string): PortalUserState {
      return {
        userRef,
        subscriptionRequest: null,
        subscriptionRequests: [],
        paymentOrders: paymentOrders.get(userRef) ?? [],
        historySummary: [],
        security: securityState(userRef),
        updatedAt: now().toISOString(),
      safety: {
        noAdminApi: true,
        noPaymentActivation: true,
        noPublicAdmin: true
      }
    };
  }

  function currentState(userRef: string) {
    const state = states.get(userRef) ?? emptyState(userRef);
    return {
      ...state,
      paymentOrders: paymentOrders.get(userRef) ?? state.paymentOrders ?? [],
      security: securityState(userRef)
    };
  }

  function setState(userRef: string, next: Omit<PortalUserState, "userRef" | "safety">) {
    const state: PortalUserState = {
      userRef,
      ...next,
      security: next.security ?? securityState(userRef),
      safety: {
        noAdminApi: true,
        noPaymentActivation: true,
        noPublicAdmin: true
      }
    };
    states.set(userRef, state);
    return state;
  }

  function upsertLocalPaymentOrder(userRef: string, order: PortalPaymentOrder) {
    const nextOrders = [
      order,
      ...(paymentOrders.get(userRef) ?? []).filter((existing) => existing.orderRef !== order.orderRef)
    ];
    paymentOrders.set(userRef, nextOrders);
    const state = currentState(userRef);
    setState(userRef, {
      subscriptionRequest: state.subscriptionRequest,
      subscriptionRequests: state.subscriptionRequests,
      paymentOrders: nextOrders,
      historySummary: state.historySummary ?? [],
      security: state.security,
      updatedAt: order.createdAt
    });
    return nextOrders;
  }

  function createSecondFactorChallenge(userRef: string, displayName: string, issuedAt: Date): PortalSecondFactorChallenge {
    const availableFactors = enabledFactors(userRef);
    const expiresAt = new Date(issuedAt.getTime() + 5 * 60 * 1000);
    const challengeRef = stableRef(
      "portal_mfa",
      [
        userRef,
        issuedAt.toISOString(),
        availableFactors.join(",")
      ].join("|")
    );
    secondFactorChallenges.set(challengeRef, {
      availableFactors,
      expiresAt: expiresAt.toISOString(),
      userRef
    });
    return {
      status: "second_factor_required",
      challengeRef,
      userRef,
      displayName,
      authMode: "password",
      availableFactors,
      expiresInSeconds: 300,
      issuedAt: issuedAt.toISOString(),
      safety: {
        noAdminApi: true,
        noPublicAuthActivated: true,
        noSessionCreated: true
      }
    };
  }

  async function startLocalAuthenticatorEnrollment(userRefInput: string): Promise<PortalAuthenticatorEnrollment> {
    const userRef = requiredText(userRefInput, "用户会话无效。");
    if (accountSecurity.get(userRef)?.authenticatorSecret) {
      throw portalError("此账户已绑定身份验证器。");
    }
    const issuedAt = now();
    const secret = options.totpSecretFactory?.() ?? randomBase32Secret();
    const issuer = "GCC Gateway Portal";
    const accountLabel = userRef;
    const otpauthUri = createOtpauthUri({ accountLabel, issuer, secret });
    const enrollmentRef = stableRef("totp_enroll", `${userRef}|${secret}|${issuedAt.toISOString()}`);
    const expiresAt = new Date(issuedAt.getTime() + 5 * 60 * 1000).toISOString();
    authenticatorEnrollments.set(enrollmentRef, {
      expiresAt,
      secret,
      userRef
    });

    return {
      status: "preview",
      enrollmentRef,
      userRef,
      issuer,
      accountLabel,
      manualKey: formatBase32Secret(secret),
      otpauthUri,
      qrDataUri: await createQrDataUri(otpauthUri),
      expiresInSeconds: 300,
      issuedAt: issuedAt.toISOString(),
      safety: {
        noAdminApi: true,
        noPublicAuthActivated: true,
        noProductionCredentialMutation: true
      }
    };
  }

  return {
    async issueHumanChallenge() {
      return createLocalHumanVerificationChallenge();
    },

    async requestEmailCode(input) {
      verifiedHuman(input.humanVerification);
      requiredEmail(input.email);
      if (input.purpose !== "login") {
        throw portalError("邮箱验证码用途无效。");
      }
      throw portalError("邮箱验证码登录尚未启用。");
    },

    async requestRegistrationEmailVerification(input) {
      const email = requiredEmail(input.email);
      return {
        status: "simulated",
        verificationRef: stableRef("reg_email", email),
        expiresInSeconds: 600,
        safety: {
          noAdminApi: true,
          noAccountCreated: true,
          noPublicAuthActivated: true,
          noRawCodeReturned: true,
          noRawEmailReturned: true
        }
      };
    },

    async registerTrialAccount(input) {
      const email = requiredEmail(input.email);
      const password = requiredText(input.password, "请输入密码。");
      registrationEmailVerificationProof(input.emailVerification);
      legalAgreementProof(input.legalAgreement);
      const issuedAt = now();
      initialAccounts.set(email, {
        userRef: email,
        displayName: email,
        issuedAt: issuedAt.toISOString(),
        previewPassword: password,
        requireSecuritySetup: false
      });
      return {
        status: "registered",
        userRef: email,
        session: sessionSummary(email, "password", issuedAt.toISOString(), email, stableRef("portal_session", email)),
        trial: {
          durationDays: 7,
          validUntil: expiresAtFromDays(issuedAt, 7),
          accessRequestStatus: "pending_admin_review"
        },
        safety: {
          noAdminApi: true,
          noPaymentActivation: true,
          noPublicAdmin: true,
          noRawCustomerDataReturned: true,
          rawPasswordReturned: false
        }
      };
    },

    async authenticate(input) {
      const issuedAt = now();
      verifiedHuman(input.humanVerification);
      if (input.mode === "email") {
        requiredEmail(input.email);
        requiredText(input.verificationCode, "请输入邮箱验证码。");
        throw portalError("邮箱验证码登录尚未启用。");
      }
      if (input.mode === "authenticator") {
        const accountId = requiredText(input.accountId, "请输入电子邮箱。");
        const security = accountSecurity.get(accountId);
        if (!security?.authenticatorSecret) {
          throw portalError("此账户未绑定身份验证器。");
        }
        const verified = await verifyTotpCode({
          secret: security.authenticatorSecret,
          code: requiredText(input.totpCode, "请输入动态验证码。"),
          now: now()
        });
        if (!verified) {
          throw portalError("动态验证码无效或已过期。");
        }
        return sessionSummary(accountId, input.mode, issuedAt.toISOString());
      }
      if (input.mode === "password") {
        const loginRef = requiredText(input.accountId, "请输入电子邮箱。");
        const normalizedEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(loginRef.trim())
          ? loginRef.trim().toLowerCase()
          : null;
        const lookupRef = normalizedEmail ?? loginRef;
        const account = initialAccounts.get(lookupRef);
        if (!account || requiredText(input.password, "请输入密码。") !== account.previewPassword) {
          throw portalError("账户或密码无效。");
        }
        if (enabledFactors(account.userRef).length > 0) {
          return createSecondFactorChallenge(account.userRef, account.displayName, issuedAt);
        }
        return sessionSummary(account.userRef, input.mode, issuedAt.toISOString(), account.displayName);
      }

      const entryToken = requiredText(input.entryToken, "开通链接无效，请重新打开邮件中的链接。");
      requiredText(input.encryptedTotpSecret, "请重新完成身份验证器设置。");
      requiredText(input.totpCode, "请输入动态验证码。");
      return sessionSummary(registrationEntryAccounts.get(entryToken) ?? stableRef("portal_user", entryToken), input.mode, issuedAt.toISOString());
    },

    async completeSecondFactor(input) {
      const challengeRef = requiredText(input.challengeRef, "二次验证会话无效。");
      const challenge = secondFactorChallenges.get(challengeRef);
      if (!challenge) {
        throw portalError("二次验证会话无效。");
      }
      if (new Date(challenge.expiresAt).getTime() <= now().getTime()) {
        secondFactorChallenges.delete(challengeRef);
        throw portalError("二次验证已过期，请重新登录。");
      }
      if (!challenge.availableFactors.includes(input.factor)) {
        throw portalError("此二次验证方式不可用。");
      }

      if (input.factor === "authenticator") {
        const secret = accountSecurity.get(challenge.userRef)?.authenticatorSecret;
        if (!secret) {
          throw portalError("此账户未绑定身份验证器。");
        }
        const verified = await verifyTotpCode({
          secret,
          code: requiredText(input.totpCode, "请输入身份验证器验证码。"),
          now: now()
        });
        if (!verified) {
          throw portalError("身份验证器验证码无效或已过期。");
        }
      } else {
        const security = accountSecurity.get(challenge.userRef);
        const submittedProof = parsePasskeyProof(requiredText(input.passkeyProof, "通行密钥验证失败。"));
        if (
          !security?.passkeyEnabled
          || !security.passkeyExported
          || !security.passkeyRef
          || submittedProof?.userRef !== challenge.userRef
          || submittedProof.passkeyRef !== security.passkeyRef
        ) {
          throw portalError("通行密钥验证失败。");
        }
      }

      secondFactorChallenges.delete(challengeRef);
      return sessionSummary(challenge.userRef, input.factor === "passkey" ? "passkey" : "authenticator", now().toISOString());
    },

    async fetchCurrentState(input) {
      if (!input.userRef.trim()) {
        throw portalError("用户会话无效。");
      }
      return currentState(input.userRef);
    },

    async fetchPaymentOrders(input) {
      const userRef = requiredText(input.userRef, "用户会话无效。");
      return (paymentOrders.get(userRef) ?? [])
        .filter((order) => !input.status || order.status === input.status)
        .filter((order) => !input.plan || order.planId === input.plan);
    },

    async createPaymentCheckout(input) {
      const userRef = requiredText(input.userRef, "用户会话无效。");
      const planId = normalizePaymentPlan(input.planId);
      const createdAt = now().toISOString();
      const paymentExpiresAt = new Date(new Date(createdAt).getTime() + 10 * 60 * 1000).toISOString();
      localPaymentSequence += 1;
      const isProviderHostedPreview = input.channel === "paypal";
      const order: PortalPaymentOrder = {
        orderRef: stableRef("pay", [
          userRef,
          planId,
          input.clientTarget,
          input.channel,
          localPaymentSequence,
          createdAt
        ].join("|")),
        planId,
        planLabel: planLabel(planId),
        amountMinor: amountMinorForPlan(planId),
        channel: input.channel,
        currency: isProviderHostedPreview ? "USD" : "CNY",
        status: "pending_payment",
        provider: isProviderHostedPreview ? "local-preview" : undefined,
        checkoutUrl: isProviderHostedPreview ? undefined : `https://pay.example.test/${planId}`,
        createdAt,
        paymentExpiresAt,
        safety: {
          noRawMerchantKey: true,
          noRawProviderPayload: true
        }
      };
      upsertLocalPaymentOrder(userRef, order);
      return {
        provider: "local-preview",
        order,
        safety: {
          noRawMerchantKey: true,
          noRawProviderPayload: true,
          noSubscriptionIssued: true
        }
      };
    },

    async capturePaymentCheckout(input) {
      const userRef = requiredText(input.userRef, "用户会话无效。");
      const orderRef = requiredText(input.orderRef, "支付订单无效。");
      const existing = (paymentOrders.get(userRef) ?? []).find((order) => order.orderRef === orderRef);
      if (!existing) {
        throw portalError("支付订单无效。");
      }
      const paidAt = now().toISOString();
      const captured: PortalPaymentOrder = {
        ...existing,
        status: "paid_pending_admin_review",
        paidAt,
        providerCaptureRef: existing.providerCaptureRef ?? stableRef("capture", `${orderRef}|${paidAt}`)
      };
      upsertLocalPaymentOrder(userRef, captured);
      return {
        provider: "local-preview",
        order: captured,
        safety: {
          noRawMerchantKey: true,
          noRawProviderPayload: true,
          noSubscriptionIssued: true
        }
      };
    },

    async startAuthenticatorEnrollment(input) {
      return startLocalAuthenticatorEnrollment(input.userRef);
    },

    async confirmAuthenticatorEnrollment(input) {
      const userRef = requiredText(input.userRef, "用户会话无效。");
      if (accountSecurity.get(userRef)?.authenticatorSecret) {
        throw portalError("此账户已绑定身份验证器。");
      }
      const enrollmentRef = requiredText(input.enrollmentRef, "身份验证器绑定会话无效。");
      const enrollment = authenticatorEnrollments.get(enrollmentRef);
      if (!enrollment || enrollment.userRef !== userRef) {
        throw portalError("身份验证器绑定会话无效。");
      }
      if (new Date(enrollment.expiresAt).getTime() <= now().getTime()) {
        authenticatorEnrollments.delete(enrollmentRef);
        throw portalError("身份验证器绑定已过期，请重新扫码。");
      }
      const verified = await verifyTotpCode({
        secret: enrollment.secret,
        code: requiredText(input.totpCode, "请输入 6 位动态码。"),
        now: now()
      });
      if (!verified) {
        throw portalError("动态验证码无效或已过期。");
      }
      authenticatorEnrollments.delete(enrollmentRef);
      accountSecurity.set(userRef, {
        ...(accountSecurity.get(userRef) ?? {}),
        authenticatorSecret: enrollment.secret
      });
      return {
        status: "bound_preview",
        userRef,
        method: "totp",
        boundAt: now().toISOString(),
        safety: {
          noAdminApi: true,
          noPublicAuthActivated: true,
          noProductionCredentialMutation: true,
          noRawSecretReturned: true
        }
      };
    },

    async enablePasskey(input) {
      const userRef = requiredText(input.userRef, "用户会话无效。");
      const passkeyRef = accountSecurity.get(userRef)?.passkeyRef ?? stableRef("passkey", `${userRef}|${now().toISOString()}`);
      accountSecurity.set(userRef, {
        ...(accountSecurity.get(userRef) ?? {}),
        passkeyEnabled: true,
        passkeyRef
      });
      return {
        status: "bound_preview",
        userRef,
        method: "passkey",
        boundAt: now().toISOString(),
        safety: {
          noAdminApi: true,
          noPublicAuthActivated: true,
          noProductionCredentialMutation: true
        }
      };
    },

    async exportPasskey(input) {
      const userRef = requiredText(input.userRef, "用户会话无效。");
      const exportedAt = now().toISOString();
      const passkeyRef = accountSecurity.get(userRef)?.passkeyRef ?? stableRef("passkey", `${userRef}|${exportedAt}`);
      accountSecurity.set(userRef, {
        ...(accountSecurity.get(userRef) ?? {}),
        passkeyEnabled: true,
        passkeyExported: true,
        passkeyRef
      });
      return {
        status: "exported_preview",
        userRef,
        method: "passkey",
        fileName: `${userRef}-passkey-preview.json`,
        body: JSON.stringify({
          version: 1,
          type: "local-passkey-preview",
          issuer: "GCC Gateway Portal",
          userRef,
          passkeyRef,
          exportedAt,
          warning: "local preview only; not a WebAuthn private key"
        }, null, 2),
        exportedAt,
        safety: {
          noAdminApi: true,
          noPublicAuthActivated: true,
          noProductionCredentialMutation: true,
          noRawPrivateKeyReturned: true
        }
      };
    },

    async applyForSubscription(input) {
      if (!input.userRef.trim()) {
        throw portalError("用户会话无效。");
      }

      const issuedAt = now().toISOString();
      localSubscriptionSequence += 1;
      const requestOnly = input.requestOnly === true;
      const durationDays = normalizeOrderDurationDays(input.durationDays, durationDaysForPlan(input.planId));
      const quantity = normalizeOrderQuantity(input.quantity);
      const totalDurationDays = durationDays * quantity;
      const expiresAt = requestOnly ? "开通中" : expiresAtFromDays(now(), totalDurationDays);
      const requestRef = stableRef(
        "subreq",
        [
          input.userRef,
          input.planId,
          input.clientTarget,
          durationDays,
          quantity,
          localSubscriptionSequence,
          expiresAt,
          issuedAt
        ].join("|")
      );
      const subscriptionUrl = requestOnly ? undefined : options.demoSubscriptionUrl?.trim() || undefined;
      const subscriptionReady = !requestOnly && Boolean(subscriptionUrl);
      const historySummary: PortalHistoryRecord[] = [
        {
          recordRef: stableRef("history", `${requestRef}|open|${issuedAt}`),
          label: `申请${planLabel(input.planId)}（${subscriptionReady ? "已开通" : "待开通"}）`,
          status: subscriptionReady ? "已开通" : "待开通",
          occurredAt: issuedAt
        }
      ];

      const request: PortalSubscriptionRequest = {
        status: subscriptionReady ? "subscription_ready" : "ready_for_operator_review",
        lifecycle: subscriptionReady ? "active" : "pending",
        requestRef,
        userRef: input.userRef,
        planId: input.planId,
        clientTarget: input.clientTarget,
        expiresAt,
        durationDays,
        quantity,
        subscriptionUrl,
        nextAction: subscriptionReady ? "copy_subscription_url" : "operator_review_required",
        updatedAt: issuedAt,
        historySummary,
        safety: {
          noAdminApi: true,
          noDbMutation: true,
          noPaymentActivation: true,
          noPublicAdmin: true,
          noRawCustomerDataReturned: true
        }
      };
      const subscriptionRequests = upsertSubscriptionRequest(
        subscriptionRequestsFromState(currentState(input.userRef)),
        request
      );
      setState(input.userRef, {
        subscriptionRequest: request,
        subscriptionRequests,
        historySummary: historySummaryForRequests(subscriptionRequests),
        updatedAt: issuedAt
      });
      return request;
    },

    async submitSupportRequest(input) {
      const userRef = requiredText(input.userRef, "用户会话无效。");
      const message = normalizeSupportMessage(input.message);
      const submittedAt = now().toISOString();
      return {
        status: "submitted",
        supportRef: stableRef("psup", [
          userRef,
          input.category,
          input.clientTarget,
          message,
          submittedAt
        ].join("|")),
        userRef,
        category: input.category,
        clientTarget: input.clientTarget,
        subscriptionRequestRef: input.subscriptionRequestRef?.trim() || undefined,
        submittedAt,
        safety: {
          noAdminApi: true,
          noDbMutation: true,
          noPaymentActivation: true,
          noPublicAdmin: true,
          noRawMessageReturned: true
        }
      };
    },

    async revealSubscription(input) {
      if (!input.userRef.trim() || !input.requestRef.trim()) {
        throw portalError("用户会话无效。");
      }

      const existing = currentState(input.userRef);
      const current = subscriptionRequestsFromState(existing).find((request) => request.requestRef === input.requestRef)
        ?? existing.subscriptionRequest;
      if (!current || current.requestRef !== input.requestRef || current.lifecycle !== "active") {
        throw portalError("当前订单尚未开通，无法复制。");
      }

      const subscriptionUrl = current.subscriptionUrl ?? options.demoSubscriptionUrl?.trim();
      if (!subscriptionUrl) {
        throw portalError("当前订单尚未开通，无法复制。");
      }

      const revealed: PortalSubscriptionRequest = {
        ...current,
        status: "subscription_ready",
        lifecycle: "active",
        subscriptionUrl,
        nextAction: "copy_subscription_url"
      };
      const subscriptionRequests = upsertSubscriptionRequest(subscriptionRequestsFromState(existing), revealed);
      setState(input.userRef, {
        subscriptionRequest: revealed,
        subscriptionRequests,
        historySummary: historySummaryForRequests(subscriptionRequests),
        updatedAt: revealed.updatedAt ?? now().toISOString()
      });
      return revealed;
    },

    async refreshSubscription(input) {
      if (!input.userRef.trim() || !input.requestRef.trim()) {
        throw portalError("用户会话无效。");
      }

      const existing = currentState(input.userRef);
      const current = subscriptionRequestsFromState(existing).find((request) => request.requestRef === input.requestRef)
        ?? existing.subscriptionRequest;
      if (!current || current.requestRef !== input.requestRef || current.lifecycle !== "active") {
        throw portalError("当前订单尚未开通，无法刷新。");
      }

      const subscriptionUrl = options.demoSubscriptionUrl?.trim();
      if (!subscriptionUrl) {
        throw portalError("当前订单尚未开通，无法刷新。");
      }

      const refreshedAt = now().toISOString();
      const event: PortalSubscriptionEvent = {
        type: "old_link_invalidated",
        occurredAt: refreshedAt
      };
      const historySummary: PortalHistoryRecord[] = [
        {
          recordRef: stableRef("history", `${current.requestRef}|refresh|${refreshedAt}`),
          label: "刷新订阅（已刷新）",
          status: "已刷新",
          occurredAt: refreshedAt
        },
        ...(existing.historySummary ?? [])
      ];
      const refreshed: PortalSubscriptionRequest = {
        status: "subscription_ready",
        lifecycle: "active",
        requestRef: input.requestRef,
        userRef: input.userRef,
        planId: current.planId,
        clientTarget: input.clientTarget,
        expiresAt: current.expiresAt,
        durationDays: current.durationDays,
        quantity: current.quantity,
        subscriptionUrl,
        usage: current.usage,
        nextAction: "copy_subscription_url",
        updatedAt: refreshedAt,
        event,
        historySummary,
        safety: {
          noAdminApi: true,
          noDbMutation: true,
          noPaymentActivation: true,
          noPublicAdmin: true,
          noRawCustomerDataReturned: true
        }
      };
      const subscriptionRequests = upsertSubscriptionRequest(subscriptionRequestsFromState(existing), refreshed);
      setState(input.userRef, {
        subscriptionRequest: refreshed,
        subscriptionRequests,
        historySummary,
        updatedAt: refreshedAt
      });
      return refreshed;
    },

    async disableSubscription(input) {
      if (!input.userRef.trim() || !input.requestRef.trim()) {
        throw portalError("用户会话无效。");
      }

      const existing = currentState(input.userRef);
      const current = subscriptionRequestsFromState(existing).find((request) => request.requestRef === input.requestRef)
        ?? existing.subscriptionRequest;
      if (!current || current.requestRef !== input.requestRef || current.lifecycle !== "active") {
        throw portalError("当前订单尚未开通，无法停用。");
      }

      const disabledAt = now().toISOString();
      const historySummary: PortalHistoryRecord[] = [
        {
          recordRef: stableRef("history", `${current.requestRef}|disable|${disabledAt}`),
          label: "停用订阅（已停用）",
          status: "已停用",
          occurredAt: disabledAt
        },
        ...(existing.historySummary ?? [])
      ];
      const disabled: PortalSubscriptionRequest = {
        status: "subscription_disabled",
        lifecycle: "disabled",
        requestRef: current.requestRef,
        userRef: input.userRef,
        planId: current.planId,
        clientTarget: current.clientTarget,
        expiresAt: current.expiresAt,
        durationDays: current.durationDays,
        quantity: current.quantity,
        usage: current.usage,
        nextAction: "subscription_disabled",
        updatedAt: disabledAt,
        historySummary,
        safety: {
          noAdminApi: true,
          noDbMutation: true,
          noPaymentActivation: true,
          noPublicAdmin: true,
          noRawCustomerDataReturned: true
        }
      };
      const subscriptionRequests = upsertSubscriptionRequest(subscriptionRequestsFromState(existing), disabled);
      setState(input.userRef, {
        subscriptionRequest: disabled,
        subscriptionRequests,
        historySummary,
        updatedAt: disabledAt
      });
      return disabled;
    }
  };
}

function endpoint(baseUrl: string, path: string) {
  const normalized = baseUrl.trim().replace(/\/$/, "");
  return `${normalized}${path}`;
}

async function jsonRequest(fetchFn: typeof fetch, url: string, init: RequestInit = {}) {
  const response = await fetchFn(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init.headers ?? {})
    }
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw portalError(typeof body?.error === "string" ? body.error : "portal request failed");
  }
  return body;
}

function portalSessionHeaders(sessionRef: string | undefined) {
  return {
    "X-Portal-Session": requiredText(sessionRef, "用户会话无效。")
  };
}

function fallbackHttpSecurityState(): PortalUserSecurityState {
  return {
    authenticatorBound: false,
    initialAccount: false,
    passkeyEnabled: false,
    passkeyExported: false,
    setupRequired: false
  };
}

function mapSecurityState(raw: Record<string, unknown> | undefined): PortalUserSecurityState {
  return {
    authenticatorBound: raw?.authenticatorBound === true,
    initialAccount: raw?.initialAccount === true,
    passkeyEnabled: raw?.passkeyEnabled === true,
    passkeyExported: raw?.passkeyExported === true,
    setupRequired: raw?.setupRequired === true
  };
}

export function createHttpUserPortalClient(options: HttpUserPortalClientOptions = {}): UserPortalClient {
  const baseUrl = options.baseUrl ?? "";
  const fetchFn = options.fetchFn ?? fetch;
  const now = options.now ?? (() => new Date());

  async function createSession(
    accountId: string,
    code: string,
    mode: PortalAuthMode,
    humanVerification: PortalHumanVerificationInput
  ): Promise<PortalSession> {
    const sessionBody = await jsonRequest(fetchFn, endpoint(baseUrl, "/api/portal/session"), {
      method: "POST",
      body: JSON.stringify({ accountId, code, humanVerification })
    });
    const session = sessionBody.session ?? {};
    return sessionSummary(
      requiredText(session.userRef ?? session.loginRef ?? accountId, "用户会话无效。"),
      mode,
      session.issuedAt ?? now().toISOString(),
      String(session.displayName ?? session.userRef ?? session.loginRef ?? accountId),
      session.sessionRef
    );
  }

  return {
    async issueHumanChallenge(input = {}) {
      const body = await jsonRequest(fetchFn, endpoint(baseUrl, "/api/portal/human-challenges"), {
        method: "POST",
        body: JSON.stringify({ scope: input.scope ?? "portal_login" })
      });
      return mapBackendHumanChallenge(body.challenge ?? {}, now);
    },

    async requestEmailCode(input) {
      verifiedHuman(input.humanVerification);
      requiredEmail(input.email);
      if (input.purpose !== "login") {
        throw portalError("邮箱验证码用途无效。");
      }
      throw portalError("邮箱验证码登录尚未启用。");
    },

    async requestRegistrationEmailVerification(input) {
      const body = await jsonRequest(fetchFn, endpoint(baseUrl, "/api/portal/registration/email-verification"), {
        method: "POST",
        body: JSON.stringify({
          email: requiredEmail(input.email)
        })
      });
      return mapRegistrationEmailVerification(body);
    },

    async registerTrialAccount(input) {
      const emailVerification = registrationEmailVerificationProof(input.emailVerification);
      const legalAgreement = legalAgreementProof(input.legalAgreement);
      const body = await jsonRequest(fetchFn, endpoint(baseUrl, "/api/portal/registration"), {
        method: "POST",
        body: JSON.stringify({
          email: requiredEmail(input.email),
          password: requiredText(input.password, "请输入密码。"),
          legalAgreement,
          emailVerification
        })
      });
      return mapRegistrationResult(body);
    },

    async authenticate(input) {
      if (input.mode === "email") {
        verifiedHuman(input.humanVerification);
        requiredEmail(input.email);
        requiredText(input.verificationCode, "请输入邮箱验证码。");
        throw portalError("邮箱验证码登录尚未启用。");
      }
      if (input.mode === "authenticator") {
        return createSession(
          requiredText(input.accountId, "请输入电子邮箱。"),
          requiredText(input.totpCode, "请输入动态验证码。"),
          input.mode,
          verifiedHuman(input.humanVerification)
        );
      }
      if (input.mode === "password") {
        const accountId = requiredText(input.accountId, "请输入电子邮箱。");
        const body = await jsonRequest(fetchFn, endpoint(baseUrl, "/api/portal/password/session"), {
          method: "POST",
          body: JSON.stringify({
            accountId,
            password: requiredText(input.password, "请输入密码。"),
            humanVerification: backendHumanVerification(input.humanVerification)
          })
        });
        if (body.challenge) {
          const factors = Array.isArray(body.challenge.availableFactors)
            ? body.challenge.availableFactors.map((factor: unknown) => portalFactor(String(factor))).filter(Boolean) as PortalSecondFactorKind[]
            : [];
          return {
            status: "second_factor_required",
            challengeRef: requiredText(body.challenge.challengeRef, "二次验证会话无效。"),
            userRef: requiredText(body.challenge.userRef ?? body.challenge.loginRef ?? accountId, "用户会话无效。"),
            displayName: String(body.challenge.displayName ?? body.challenge.userRef ?? body.challenge.loginRef ?? accountId),
            authMode: "password",
            availableFactors: factors,
            expiresInSeconds: Number(body.challenge.expiresInSeconds ?? 300),
            issuedAt: body.challenge.issuedAt ?? now().toISOString(),
            safety: {
              noAdminApi: true,
              noPublicAuthActivated: true,
              noSessionCreated: true
            }
          };
        }
        const session = body.session ?? {};
        return sessionSummary(
          requiredText(session.userRef ?? session.loginRef ?? accountId, "用户会话无效。"),
          authModeFromBackend(session.authMethod, "password"),
          session.issuedAt ?? now().toISOString(),
          String(session.displayName ?? session.userRef ?? session.loginRef ?? accountId),
          session.sessionRef
        );
      }

      const humanVerification = verifiedHuman(input.humanVerification);
      const enrollmentBody = await jsonRequest(fetchFn, endpoint(baseUrl, "/api/portal/entry/enroll"), {
        method: "POST",
        body: JSON.stringify({
          entryToken: requiredText(input.entryToken, "开通链接无效，请重新打开邮件中的链接。"),
          encryptedTotpSecret: requiredText(input.encryptedTotpSecret, "请重新完成身份验证器设置。"),
          humanVerification
        })
      });
      const accountId = requiredText(enrollmentBody.enrollment?.accountId, "账号开通结果无效，请重新开始。");
      return createSession(accountId, requiredText(input.totpCode, "请输入动态验证码。"), input.mode, humanVerification);
    },

    async completeSecondFactor(input) {
      const body = await jsonRequest(fetchFn, endpoint(baseUrl, "/api/portal/password/second-factor"), {
        method: "POST",
        body: JSON.stringify({
          challengeRef: requiredText(input.challengeRef, "二次验证会话无效。"),
          factor: backendFactor(input.factor),
          ...(input.factor === "authenticator"
            ? { code: requiredText(input.totpCode, "请输入身份验证器验证码。") }
            : { passkeyProof: requiredText(input.passkeyProof, "通行密钥验证失败。") })
        })
      });
      const session = body.session ?? {};
      return sessionSummary(
        requiredText(session.userRef ?? session.loginRef, "用户会话无效。"),
        authModeFromBackend(session.authMethod, input.factor === "passkey" ? "passkey" : "authenticator"),
        session.issuedAt ?? now().toISOString(),
        String(session.displayName ?? session.userRef ?? session.loginRef),
        session.sessionRef
      );
    },

    async fetchCurrentState(input) {
      if (!input.userRef.trim()) {
        throw portalError("用户会话无效。");
      }
      const query = new URLSearchParams({ portalUserRef: input.userRef });
      const body = await jsonRequest(fetchFn, endpoint(baseUrl, `/api/portal/access-requests/current?${query.toString()}`), {
        method: "GET",
        ...(input.sessionRef ? { headers: portalSessionHeaders(input.sessionRef) } : {})
      });
      const items = Array.isArray(body.items)
        ? body.items as Parameters<typeof mapAccessRequest>[0][]
        : [];
      const subscriptionRequests = items.map((item) => mapAccessRequest(item));
      const accountEntitlements = Array.isArray(body.accountEntitlements)
        ? (body.accountEntitlements as Record<string, unknown>[]).map((item) => mapAccountEntitlement(item))
        : [];
      const latest = subscriptionRequests[subscriptionRequests.length - 1] ?? null;
      const security = input.sessionRef
        ? mapSecurityState((await jsonRequest(fetchFn, endpoint(baseUrl, "/api/portal/security/current"), {
          method: "GET",
          headers: portalSessionHeaders(input.sessionRef)
        })).security)
        : fallbackHttpSecurityState();
      return {
        userRef: input.userRef,
        subscriptionRequest: latest,
        subscriptionRequests,
        accountEntitlements,
        historySummary: historySummaryForRequests(subscriptionRequests),
        security,
        updatedAt: latest?.updatedAt ?? now().toISOString(),
        safety: {
          noAdminApi: true,
          noPaymentActivation: true,
          noPublicAdmin: true
        }
      };
    },

    async fetchPaymentOrders(input) {
      requiredText(input.userRef, "用户会话无效。");
      const query = new URLSearchParams();
      if (input.status) query.set("status", input.status);
      if (input.plan) query.set("plan", input.plan);
      const suffix = query.toString() ? `?${query.toString()}` : "";
      const body = await jsonRequest(fetchFn, endpoint(baseUrl, `/api/portal/payments/current${suffix}`), {
        method: "GET",
        headers: portalSessionHeaders(input.sessionRef)
      });
      const orders = Array.isArray(body.payments?.orders)
        ? body.payments.orders as Record<string, unknown>[]
        : [];
      return orders.map((order) => mapPaymentOrder(order));
    },

    async createPaymentCheckout(input) {
      requiredText(input.userRef, "用户会话无效。");
      const body = await jsonRequest(fetchFn, endpoint(baseUrl, "/api/portal/payments/checkout"), {
        method: "POST",
        headers: portalSessionHeaders(input.sessionRef),
        body: JSON.stringify({
          plan: normalizePaymentPlan(input.planId),
          clientTarget: input.clientTarget,
          channel: input.channel,
          device: input.device
        })
      });
      const checkout = body.checkout ?? {};
      return {
        provider: String(checkout.provider ?? "paypal"),
        order: mapPaymentOrder(checkout.order ?? {}),
        safety: {
          noRawMerchantKey: true,
          noRawProviderPayload: true,
          noSubscriptionIssued: true
        }
      };
    },

    async capturePaymentCheckout(input) {
      requiredText(input.userRef, "用户会话无效。");
      const body = await jsonRequest(fetchFn, endpoint(baseUrl, "/api/portal/payments/capture"), {
        method: "POST",
        headers: portalSessionHeaders(input.sessionRef),
        body: JSON.stringify({
          orderRef: requiredText(input.orderRef, "支付订单无效。")
        })
      });
      const checkout = body.checkout ?? {};
      return {
        provider: String(checkout.provider ?? "paypal"),
        order: mapPaymentOrder(checkout.order ?? {}),
        safety: {
          noRawMerchantKey: true,
          noRawProviderPayload: true,
          noSubscriptionIssued: true
        }
      };
    },

    async startAuthenticatorEnrollment(input) {
      const userRef = requiredText(input.userRef, "用户会话无效。");
      const body = await jsonRequest(fetchFn, endpoint(baseUrl, "/api/portal/security/totp/enrollment"), {
        method: "POST",
        headers: portalSessionHeaders(input.sessionRef),
        body: JSON.stringify({})
      });
      const enrollment = body.enrollment ?? {};
      const otpauthUri = requiredText(enrollment.otpauthUri, "身份验证器绑定结果无效。");
      return {
        status: "preview",
        enrollmentRef: requiredText(enrollment.enrollmentRef, "身份验证器绑定会话无效。"),
        userRef,
        issuer: requiredText(enrollment.issuer, "身份验证器绑定结果无效。"),
        accountLabel: String(enrollment.accountLabel ?? userRef),
        manualKey: requiredText(enrollment.manualKey, "身份验证器绑定结果无效。"),
        otpauthUri,
        qrDataUri: await createQrDataUri(otpauthUri),
        expiresInSeconds: Number(enrollment.expiresInSeconds ?? 300),
        issuedAt: enrollment.issuedAt ?? now().toISOString(),
        safety: {
          noAdminApi: true,
          noPublicAuthActivated: true,
          noProductionCredentialMutation: false
        }
      };
    },

    async confirmAuthenticatorEnrollment(input) {
      const userRef = requiredText(input.userRef, "用户会话无效。");
      const body = await jsonRequest(fetchFn, endpoint(baseUrl, "/api/portal/security/totp/enrollment/confirm"), {
        method: "POST",
        headers: portalSessionHeaders(input.sessionRef),
        body: JSON.stringify({
          enrollmentRef: requiredText(input.enrollmentRef, "身份验证器绑定会话无效。"),
          code: requiredText(input.totpCode, "请输入 6 位动态码。")
        })
      });
      const binding = body.binding ?? {};
      return {
        status: "bound_preview",
        userRef,
        method: "totp",
        boundAt: binding.boundAt ?? now().toISOString(),
        safety: {
          noAdminApi: true,
          noPublicAuthActivated: true,
          noProductionCredentialMutation: false,
          noRawSecretReturned: true
        }
      };
    },

    async enablePasskey(input) {
      requiredText(input.userRef, "用户会话无效。");
      throw portalError("通行密钥绑定尚未启用。");
    },

    async exportPasskey(input) {
      requiredText(input.userRef, "用户会话无效。");
      throw portalError("通行密钥导出尚未启用。");
    },

    async applyForSubscription(input) {
      const body = await jsonRequest(fetchFn, endpoint(baseUrl, "/api/portal/access-requests"), {
        method: "POST",
        headers: portalSessionHeaders(input.sessionRef),
        body: JSON.stringify({
          portalUserRef: requiredText(input.userRef, "用户会话无效。"),
          plan: input.planId,
          clientTarget: input.clientTarget,
          durationDays: input.durationDays,
          quantity: input.quantity
        })
      });
      return mapAccessRequest(body.request ?? {});
    },

    async submitSupportRequest(input) {
      const body = await jsonRequest(fetchFn, endpoint(baseUrl, "/api/portal/support-requests"), {
        method: "POST",
        headers: portalSessionHeaders(input.sessionRef),
        body: JSON.stringify({
          portalUserRef: requiredText(input.userRef, "用户会话无效。"),
          category: input.category,
          message: normalizeSupportMessage(input.message),
          clientTarget: input.clientTarget,
          subscriptionRequestRef: input.subscriptionRequestRef
        })
      });
      return mapSupportRequest(body.request ?? {});
    },

    async revealSubscription(input) {
      const body = await jsonRequest(fetchFn, endpoint(baseUrl, "/api/portal/access-requests/reveal"), {
        method: "POST",
        headers: portalSessionHeaders(input.sessionRef),
        body: JSON.stringify({
          portalUserRef: requiredText(input.userRef, "用户会话无效。"),
          requestRef: requiredText(input.requestRef, "申请记录无效。")
        })
      });
      return mapAccessRequest(body.request ?? {});
    },

    async refreshSubscription(input) {
      const body = await jsonRequest(fetchFn, endpoint(baseUrl, "/api/portal/access-requests/refresh"), {
        method: "POST",
        headers: portalSessionHeaders(input.sessionRef),
        body: JSON.stringify({
          portalUserRef: requiredText(input.userRef, "用户会话无效。"),
          requestRef: requiredText(input.requestRef, "申请记录无效。"),
          clientTarget: input.clientTarget
        })
      });
      return mapAccessRequest(body.request ?? {});
    },

    async disableSubscription(input) {
      const body = await jsonRequest(fetchFn, endpoint(baseUrl, "/api/portal/access-requests/disable"), {
        method: "POST",
        headers: portalSessionHeaders(input.sessionRef),
        body: JSON.stringify({
          portalUserRef: requiredText(input.userRef, "用户会话无效。"),
          requestRef: requiredText(input.requestRef, "申请记录无效。")
        })
      });
      return mapAccessRequest(body.request ?? {});
    }
  };
}
