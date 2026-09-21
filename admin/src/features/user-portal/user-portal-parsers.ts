import {
  parsePortalRechargeTrustedActionOriginsJson,
  type PortalRechargeTrustedActionOriginsByAdapter
} from "./recharge";
import { readCookieSession } from "./portal-browser-session";
import type {
  HttpUserPortalClientOptions,
  PortalAccountEntitlement,
  PortalAuthMode,
  PortalClientId,
  PortalCurrentResource,
  PortalCurrentResourceSetupDelivery,
  PortalHumanVerificationChallenge,
  PortalHumanVerificationInput,
  PortalPaymentChannel,
  PortalPaymentCheckoutInput,
  PortalPaymentOrder,
  PortalPlanId,
  PortalRegistrationEmailVerificationChallenge,
  PortalRegistrationEmailVerificationProof,
  PortalRegistrationInput,
  PortalRegistrationResult,
  PortalRegistrationResultBase,
  PortalRegistrationWelcomeBonus,
  PortalSecondFactorKind,
  PortalSession,
  PortalSubscriptionEvent,
  PortalSubscriptionLifecycle,
  PortalSubscriptionRequest,
  PortalSubscriptionUsage,
  PortalSupportCategory,
  PortalSupportRequest,
  PortalUserState
} from "./user-portal-types";

export async function createQrDataUri(otpauthUri: string) {
  const { default: QRCode } = await import("qrcode");
  return QRCode.toDataURL(otpauthUri, {
    errorCorrectionLevel: "M",
    margin: 1,
    width: 208
  });
}

export function portalError(message: string) {
  return new Error(message);
}

export function rechargeTrustedActionOrigins(
  options: HttpUserPortalClientOptions,
): PortalRechargeTrustedActionOriginsByAdapter | undefined {
  const configured = parsePortalRechargeTrustedActionOriginsJson(
    options.rechargeTrustedActionOriginsJson,
  );
  if (
    configured !== undefined
    && options.rechargeTrustedActionOriginsByAdapter !== undefined
  ) throw portalError("Portal recharge configuration is invalid.");
  return configured ?? options.rechargeTrustedActionOriginsByAdapter;
}

export function requiredText(value: string | undefined, message: string) {
  const normalized = String(value ?? "").trim();
  if (!normalized) {
    throw portalError(message);
  }
  return normalized;
}

export function requiredIsoTimestamp(value: unknown, message: string) {
  const normalized = requiredText(
    typeof value === "string" ? value : undefined,
    message
  );
  const parsed = new Date(normalized);
  if (
    Number.isNaN(parsed.getTime())
    || parsed.toISOString() !== normalized
  ) {
    throw portalError(message);
  }
  return normalized;
}

export function strictRecord(
  value: unknown,
  allowedKeys: readonly string[],
  message: string
): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw portalError(message);
  }
  const record = value as Record<string, unknown>;
  if (Object.keys(record).some((key) => !allowedKeys.includes(key))) {
    throw portalError(message);
  }
  return record;
}

export function requiredPositiveInteger(value: unknown, message: string) {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value <= 0) {
    throw portalError(message);
  }
  return value;
}

export function parsePortalCurrentResource(value: unknown): PortalCurrentResource {
  const envelope = strictRecord(value, ["resource"], "当前资源状态无效。");
  const resource = strictRecord(
    envelope.resource,
    ["state", "plan", "validUntil", "setupAvailable"],
    "当前资源状态无效。"
  );
  const state = resource.state;
  if (state === "none" || state === "reconciliation_required") {
    if (Object.keys(resource).length !== 1) {
      throw portalError("当前资源状态无效。");
    }
    return { state };
  }
  if (state !== "available") {
    throw portalError("当前资源状态无效。");
  }
  const plan = strictRecord(
    resource.plan,
    ["id", "durationDays", "monthlyTrafficGb"],
    "当前资源状态无效。"
  );
  if (typeof resource.setupAvailable !== "boolean") {
    throw portalError("当前资源状态无效。");
  }
  return {
    state,
    plan: {
      id: requiredText(typeof plan.id === "string" ? plan.id : undefined, "当前资源状态无效。"),
      durationDays: requiredPositiveInteger(plan.durationDays, "当前资源状态无效。"),
      monthlyTrafficGb: requiredPositiveInteger(plan.monthlyTrafficGb, "当前资源状态无效。")
    },
    validUntil: requiredIsoTimestamp(resource.validUntil, "当前资源状态无效。"),
    setupAvailable: resource.setupAvailable
  };
}

export function requiredSubscriptionUrl(value: unknown, message: string) {
  const normalized = requiredText(typeof value === "string" ? value : undefined, message);
  try {
    const parsed = new URL(normalized);
    if (
      parsed.protocol !== "https:"
      || !parsed.hostname
      || parsed.username
      || parsed.password
      || parsed.hash
    ) {
      throw portalError(message);
    }
  } catch {
    throw portalError(message);
  }
  return normalized;
}

export function parsePortalCurrentResourceSetupDelivery(value: unknown): PortalCurrentResourceSetupDelivery {
  const envelope = strictRecord(value, ["delivery"], "配置交付结果无效。");
  const delivery = strictRecord(
    envelope.delivery,
    ["handoffRef", "kind", "subscriptionUrl"],
    "配置交付结果无效。"
  );
  if (delivery.kind !== "subscription_url") {
    throw portalError("配置交付结果无效。");
  }
  return {
    handoffRef: requiredText(
      typeof delivery.handoffRef === "string" ? delivery.handoffRef : undefined,
      "配置交付结果无效。"
    ),
    kind: "subscription_url",
    subscriptionUrl: requiredSubscriptionUrl(delivery.subscriptionUrl, "配置交付结果无效。")
  };
}

export function requiredEmail(value: string | undefined) {
  const email = requiredText(value, "请输入邮箱。").toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw portalError("请输入正确的邮箱。");
  }
  return email;
}

export function verifiedHuman(input: PortalHumanVerificationInput | undefined) {
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

export function backendHumanVerification(input: PortalHumanVerificationInput | undefined) {
  if (String(input?.honeypot ?? "").trim()) {
    throw portalError("防机器人校验失败。");
  }
  return {
    challengeRef: requiredText(input?.challengeId, "请完成防机器人校验。"),
    answer: requiredText(input?.challengeAnswer, "请完成防机器人校验。")
  };
}

export function backendFactor(factor: PortalSecondFactorKind) {
  return factor === "authenticator" ? "totp" : "passkey";
}

export function portalFactor(factor: string): PortalSecondFactorKind | null {
  if (factor === "totp" || factor === "authenticator") return "authenticator";
  if (factor === "passkey") return "passkey";
  return null;
}

export function mapBackendHumanChallenge(raw: Record<string, unknown>, now: () => Date): PortalHumanVerificationChallenge {
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

export function completeLegacyTrial(registration: Record<string, unknown>) {
  const trial = registration.trial;
  if (!trial || typeof trial !== "object" || Array.isArray(trial)) {
    throw portalError("试用权益无效。");
  }
  const value = trial as Record<string, unknown>;
  const durationDays = Number(value.durationDays);
  if (durationDays !== 7 && durationDays !== 30 && durationDays !== 365) {
    throw portalError("试用时长无效。");
  }
  return {
    durationDays,
    validUntil: requiredText(
      typeof value.validUntil === "string" ? value.validUntil : undefined,
      "试用有效期无效。"
    ),
    accessRequestStatus: requiredText(
      typeof value.accessRequestStatus === "string" ? value.accessRequestStatus : undefined,
      "试用申请状态无效。"
    )
  };
}

export function completeRegistrationWelcomeBonus(value: unknown): PortalRegistrationWelcomeBonus {
  const welcomeBonus = strictRecord(
    value,
    ["status", "coinType", "amountUnits", "expiresAt"],
    "欢迎 Coins 权益无效。"
  );
  const status = welcomeBonus.status;
  if (status !== "pending" && status !== "available") {
    throw portalError("欢迎 Coins 状态无效。");
  }
  if (welcomeBonus.coinType !== "bonus_coins") {
    throw portalError("欢迎 Coins 类型无效。");
  }
  if (welcomeBonus.amountUnits !== 10) {
    throw portalError("欢迎 Coins 数量无效。");
  }
  return {
    status,
    coinType: "bonus_coins",
    amountUnits: 10,
    expiresAt: requiredIsoTimestamp(
      welcomeBonus.expiresAt,
      "欢迎 Coins 有效期无效。"
    )
  };
}

export function mapRegistrationResult(body: Record<string, unknown>): PortalRegistrationResult {
  const registration = (body.registration ?? {}) as Record<string, unknown>;
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
  const common: PortalRegistrationResultBase = {
    status: "registered",
    userRef,
    session: session.transport === "cookie" ? readCookieSession(session) : sessionSummary(
      requiredText(
        (session.userRef ?? session.loginRef ?? userRef) as string | undefined,
        "注册会话无效。"
      ),
      authModeFromBackend(session.authMethod as string | undefined, "password"),
      String(session.issuedAt ?? new Date().toISOString()),
      String(session.displayName ?? session.userRef ?? session.loginRef ?? userRef),
      typeof session.sessionRef === "string" ? session.sessionRef : undefined
    ),
    safety: {
      noAdminApi: true,
      noPaymentActivation: true,
      noPublicAdmin: true,
      noRawCustomerDataReturned: true,
      rawPasswordReturned: false
    }
  };

  if (registration.commercialModel === "wallet_first_unique_v1") {
    if (Object.hasOwn(registration, "trial")) {
      throw portalError("注册账户模型无效。");
    }
    return {
      ...common,
      commercialModel: "wallet_first_unique_v1",
      welcomeBonus: completeRegistrationWelcomeBonus(registration.welcomeBonus)
    };
  }

  if (
    registration.commercialModel === "legacy"
    && Object.hasOwn(registration, "welcomeBonus")
  ) {
    if (Object.hasOwn(registration, "trial")) {
      throw portalError("注册账户模型无效。");
    }
    return {
      ...common,
      commercialModel: "legacy",
      welcomeBonus: completeRegistrationWelcomeBonus(registration.welcomeBonus)
    };
  }

  if (
    Object.hasOwn(registration, "welcomeBonus")
    || (
      Object.hasOwn(registration, "commercialModel")
      && registration.commercialModel !== "legacy"
    )
  ) {
    throw portalError("注册账户模型无效。");
  }

  // Older control-plane releases returned the same complete legacy trial
  // result without a discriminator. Keep only that narrow compatibility
  // fallback while Portal and control-plane releases can roll independently.
  return {
    ...common,
    commercialModel: "legacy",
    trial: completeLegacyTrial(registration)
  };
}

export function mapRegistrationEmailVerification(
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

export function registrationEmailVerificationProof(
  input: PortalRegistrationInput["emailVerification"] | undefined
): PortalRegistrationEmailVerificationProof {
  return {
    verificationRef: requiredText(input?.verificationRef, "请先发送邮箱验证码。"),
    code: requiredText(input?.code, "请输入邮箱验证码。")
  };
}

export function legalAgreementProof(input: PortalRegistrationInput["legalAgreement"]) {
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

export function authModeFromBackend(value: string | undefined, fallback: PortalAuthMode): PortalAuthMode {
  if (value === "totp") return "authenticator";
  if (value === "password" || value === "passkey" || value === "token" || value === "authenticator") return value;
  return fallback;
}

export function stableRef(prefix: string, value: string) {
  let hash = 2166136261;
  for (const char of value) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return `${prefix}_${(hash >>> 0).toString(36)}`;
}

export function expiresAtFromDays(now: Date, days: number) {
  if (!Number.isInteger(days) || days <= 0 || days > 4380) {
    throw portalError("有效期必须在 1 到 4380 天之间。");
  }
  const date = new Date(now);
  date.setDate(date.getDate() + days);
  return date.toISOString();
}

export function durationDaysForPlan(planId: PortalPlanId) {
  if (planId === "yearly") return 365;
  if (planId === "trial") return 7;
  return 30;
}

export function normalizeOrderDurationDays(value: unknown, fallback: number) {
  const parsed = typeof value === "number" ? value : Number(value);
  if (parsed === 7 || parsed === 30 || parsed === 365) return parsed;
  return fallback;
}

export function normalizeOrderQuantity(value: unknown) {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) return 1;
  return Math.max(1, Math.min(12, Math.trunc(parsed)));
}

export function planLabel(planId: PortalPlanId) {
  if (planId === "yearly") return "年度套餐";
  if (planId === "monthly_basic") return "基础月付";
  if (planId === "monthly_plus") return "标准月付";
  if (planId === "trial") return "7 天订阅";
  return "月付套餐";
}

export function normalizePaymentPlan(value: unknown): PortalPaymentCheckoutInput["planId"] {
  if (value === "yearly" || value === "monthly_plus" || value === "monthly_basic") return value;
  if (value === "monthly") return "monthly_basic";
  throw portalError("支付套餐无效。");
}

export function amountMinorForPlan(planId: Exclude<PortalPlanId, "trial">) {
  if (planId === "yearly") return 20000;
  if (planId === "monthly_plus") return 3000;
  return 2000;
}

export function mapPaymentOrder(record: Record<string, unknown>): PortalPaymentOrder {
  const planId = normalizePaymentPlan(record.plan ?? record.planId);
  const orderRef = requiredText(String(record.orderRef ?? ""), "支付订单无效。");
  const channel = typeof record.channel === "string" && ["alipay", "wxpay", "qqpay", "bank", "jdpay"].includes(record.channel)
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
    checkoutUrl: typeof record.checkoutUrl === "string" ? record.checkoutUrl : undefined,
    urlScheme: typeof record.urlScheme === "string" ? record.urlScheme : undefined,
    qrCode: typeof record.qrCode === "string" ? record.qrCode : undefined,
    paymentExpiresAt: typeof record.paymentExpiresAt === "string"
      ? record.paymentExpiresAt
      : typeof record.checkoutExpiresAt === "string"
        ? record.checkoutExpiresAt
        : undefined,
    providerOrderRef: typeof record.providerOrderRef === "string" ? record.providerOrderRef : undefined,
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

export function normalizeSupportMessage(value: string) {
  const message = requiredText(value, "请输入问题描述。").replace(/\s+/g, " ");
  if (message.length < 6) {
    throw portalError("问题描述至少需要 6 个字符。");
  }
  if (message.length > 1200) {
    throw portalError("问题描述不能超过 1200 个字符。");
  }
  return message;
}

export function sessionSummary(
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

export function parsePasskeyProof(proof: string) {
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

export function finiteNumber(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function mapSubscriptionUsage(raw: {
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

export function mapAccessRequest(record: {
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

export function mapAccountEntitlement(record: Record<string, unknown>): PortalAccountEntitlement {
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

export function subscriptionRequestsFromState(state: PortalUserState) {
  return state.subscriptionRequests ?? (state.subscriptionRequest ? [state.subscriptionRequest] : []);
}

export function upsertSubscriptionRequest(
  requests: PortalSubscriptionRequest[],
  request: PortalSubscriptionRequest
) {
  return [
    ...requests.filter((existing) => existing.requestRef !== request.requestRef),
    request
  ];
}

export function historySummaryForRequests(requests: PortalSubscriptionRequest[]) {
  return requests.flatMap((request) => request.historySummary ?? []);
}

export function mapSupportRequest(record: {
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
