import { Fragment, useCallback, useEffect, useMemo, useRef, useState, type ComponentType, type FormEvent, type ReactNode, type SVGProps } from "react";
import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  AppWindow,
  BarChart3,
  CheckCircle2,
  ChevronRight,
  Copy,
  Download,
  Eye,
  ExternalLink,
  Gift,
  Headphones,
  History,
  LayoutGrid,
  LineChart,
  LifeBuoy,
  LogOut,
  Mail,
  Plus,
  QrCode,
  ReceiptText,
  RefreshCw,
  Search,
  Settings,
  ShieldCheck,
  ShoppingBag,
  UserCog,
  WalletCards,
  Wifi,
  type LucideIcon
} from "lucide-react";
import { ModalFrame } from "../../components/modal-frame";
import { copyText } from "../../lib/clipboard";
import { errorMessage } from "../../lib/errors";
import { cn } from "../../lib/utils";
import {
  PublicLocaleSwitch,
  PublicPreferenceSwitch,
  PublicThemeSwitch,
  usePublicLocalePreference,
  usePublicThemePreference
} from "./public-locale-switch";
import {
  MarketplacePanel,
  ReferralRewardsPanel
} from "./portal-commerce-panels";
import {
  PORTAL_COIN_ORDER_STORAGE_KEY,
  type PortalCommerceModel
} from "./commerce";
import { PortalOrdersPanel, type PortalOrdersFilter } from "./orders/portal-orders-panel";
import type { PortalServiceOrder } from "./orders/portal-order-center-model";
import { PortalPersonalCenterPanel } from "./profile/portal-personal-center-panel";
import {
  PortalWalletPanel,
  usePortalWalletReadModel
} from "./wallet";
import {
  clearPortalRechargeReturn,
  readPortalRechargeReturn,
  usePortalRecharge
} from "./recharge";
import { useDesktopScrollRegion } from "./use-desktop-scroll-region";
import {
  PORTAL_PAYMENT_RETURN_SESSION_STORAGE_KEY,
  PORTAL_REGISTRATION_SESSION_STORAGE_KEY
} from "./user-portal-client";
import type {
  PortalAccountEntitlement,
  PortalAuthenticatorEnrollment,
  PortalClientId,
  PortalCurrentResource,
  PortalCurrentResourceSetupDelivery,
  PortalHistoryRecord,
  PortalHumanVerificationChallenge,
  PortalPaymentOrder,
  PortalPaymentChannel,
  PortalPasskeyExport,
  PortalPlanId,
  PortalSupportCategory,
  PortalSupportRequest,
  PortalSecondFactorChallenge,
  PortalSession,
  PortalSubscriptionRequest,
  PortalUserSecurityState,
  PortalUserState,
  UserPortalClient
} from "./user-portal-client";

type DisplayAuthMode = PortalSession["authMode"];
type PortalView =
  | "start"
  | "dashboard"
  | "usage"
  | "marketplace"
  | "orders"
  | "wallet"
  | "referrals"
  | "profile"
  | "settings"
  | "support";

type PortalPlan = {
  id: PortalPlanId;
  label: string;
  billingCycle: string;
  priceLabel: string;
  description: string;
  highlights: string[];
  monthlyTrafficGb?: number;
  badge?: string;
};

type CreatedSubscription = {
  request: PortalSubscriptionRequest;
  action: "opening_requested" | "refreshed" | "disabled";
  previousInvalidatedAt?: string;
};

type SubscriptionLifecycle = "none" | "pending" | "active" | "expired" | "disabled";
type OrderStatusFilter = "all" | "active" | "pending" | "disabled" | "expired";
type OrderSort = "newest" | "oldest" | "expires";
type PaymentFlowStep = "checkout" | "processing" | "success" | "failed";
type PortalOrderRow = PortalServiceOrder;

const plans: PortalPlan[] = [
  {
    id: "trial",
    label: "7 天试用",
    billingCycle: "7 天",
    priceLabel: "免费",
    description: "注册后领取，用于体验账号和客户端连接流程。",
    highlights: ["注册赠送", "有效期 7 天", "体验基础流量"]
  },
  {
    id: "monthly_basic",
    label: "基础月付",
    billingCycle: "30 天",
    priceLabel: "20 元 / 月",
    description: "适合个人低频使用。付款后增加 30 天可用时间。",
    highlights: ["50 GB / 月", "账户共享流量", "多种支付方式"],
    monthlyTrafficGb: 50
  },
  {
    id: "monthly_plus",
    label: "标准月付",
    billingCycle: "30 天",
    priceLabel: "30 元 / 月",
    description: "适合更高流量使用。付款后增加 30 天可用时间。",
    highlights: ["100 GB / 月", "账户共享流量", "优先配置支持"],
    monthlyTrafficGb: 100,
    badge: "推荐"
  },
  {
    id: "yearly",
    label: "年度套餐",
    billingCycle: "365 天",
    priceLabel: "200 元 / 年",
    description: "适合长期使用。付款后增加 365 天可用时间。",
    highlights: ["200 GB / 月", "账户共享流量", "账户内续费"],
    monthlyTrafficGb: 200
  }
];

const purchasePlans = plans.filter((plan) => plan.id !== "trial");

const clientTargets: Array<{ id: PortalClientId; label: string }> = [
  { id: "clash", label: "Clash / Mihomo" }
];

const webDefaultPaymentChannel: PortalPaymentChannel = "alipay";

const cashierPaymentChannels: Array<{
  id: Extract<PortalPaymentChannel, "alipay" | "wxpay">;
  labelEn: string;
  labelZh: string;
  iconSrc: string;
}> = [
  { id: "alipay", labelZh: "支付宝", labelEn: "Alipay", iconSrc: "/payment-alipay-icon.png" },
  { id: "wxpay", labelZh: "微信支付", labelEn: "WeChat Pay", iconSrc: "/payment-wechat-pay-icon.svg" }
];

const orderStatusTabs: Array<{ id: OrderStatusFilter; label: string }> = [
  { id: "all", label: "全部" },
  { id: "active", label: "生效中" },
  { id: "pending", label: "待开通" },
  { id: "disabled", label: "已停用" },
  { id: "expired", label: "已过期" }
];

const navItems: Array<{ id: PortalView; label: string; description: string; icon: LucideIcon }> = [
  { id: "start", label: "开始使用", description: "下载客户端，并按步骤导入订阅。", icon: Wifi },
  { id: "dashboard", label: "概览", description: "查看账户状态、当前套餐、流量和开始使用。", icon: LayoutGrid },
  { id: "usage", label: "用量", description: "查看流量消耗、套餐额度和用量更新状态。", icon: LineChart },
  { id: "marketplace", label: "商城", description: "浏览平台商品、套餐、流量包和增值项。", icon: ShoppingBag },
  { id: "orders", label: "订单管理", description: "查看订单历史、支付状态和付款详情。", icon: ReceiptText },
  { id: "wallet", label: "Coins 钱包", description: "查看可用余额、分类余额和钱包流水。", icon: WalletCards },
  { id: "referrals", label: "推荐奖励", description: "查看推荐链接、归因绩效和奖励状态。", icon: Gift },
  { id: "profile", label: "个人中心", description: "管理账户信息、身份验证器和通行密钥。", icon: UserCog },
  { id: "settings", label: "设置", description: "管理界面语言和显示主题。", icon: Settings },
  { id: "support", label: "支持", description: "提交订阅、客户端或账户问题并追踪处理编号。", icon: Headphones }
];

const portalOrderNavigationItems: Array<{ id: Exclude<PortalOrdersFilter, "all">; zh: string; en: string }> = [
  { id: "coins_consumption", zh: "商城消费", en: "Marketplace purchases" },
  { id: "coin_recharge", zh: "充值订单", en: "Coins recharges" },
  { id: "plans_services", zh: "套餐与服务", en: "Plans and services" }
];

type PortalNavigationGroup = {
  id: "service" | "assets" | "account" | "help";
  zh: string;
  en: string;
  itemIds: PortalView[];
};

const portalNavigationGroups: PortalNavigationGroup[] = [
  {
    id: "service",
    zh: "服务与用量",
    en: "Services and usage",
    itemIds: ["start", "dashboard", "usage"]
  },
  {
    id: "assets",
    zh: "资产与权益",
    en: "Assets and benefits",
    itemIds: ["marketplace", "orders", "wallet", "referrals"]
  },
  {
    id: "account",
    zh: "账户",
    en: "Account",
    itemIds: ["profile", "settings"]
  },
  {
    id: "help",
    zh: "帮助",
    en: "Help",
    itemIds: ["support"]
  }
];

const supportCategories: Array<{ id: PortalSupportCategory; label: string }> = [
  {
    id: "subscription",
    label: "订阅申请"
  },
  {
    id: "client_import",
    label: "客户端导入"
  },
  {
    id: "account_security",
    label: "账号安全"
  },
  {
    id: "other",
    label: "其他问题"
  }
];

const portalAuthEntryCopy = {
  en: {
    documentTitle: "GCC WebOS - Account sign in",
    shellDocumentTitle: "GCC WebOS - Account center",
    language: "Language",
    theme: "Theme",
    preferences: "Display preferences",
    secondFactorAria: "Second-factor verification",
    secondFactorTitle: "Second-factor verification",
    secondFactorDescription: "This account has enhanced verification enabled. Complete one bound factor to enter the user center.",
    authenticatorCode: "Authenticator code",
    verifying: "Verifying",
    verifyAuthenticator: "Verify authenticator",
    passkeyBackup: "Passkey backup content",
    passkeyPlaceholder: "Paste the exported passkey backup content",
    usePasskey: "Use passkey",
    returnToLogin: "Back to account sign in",
    loginAria: "User sign in",
    loginTitle: "Sign in to GCC WebOS",
    loginDescription: "Welcome back. Enter your credentials to continue.",
    welcomeTitle: "Welcome back",
    welcomeDescription: "GCC WebOS keeps your connection private and reliable.",
    trustItems: ["No activity logs", "Encrypted account access", "Plan managed in your account"],
    accountId: "Email",
    accountPlaceholder: "you@example.com",
    password: "Password",
    passwordPlaceholder: "Enter password",
    robot: "Anti-bot challenge",
    robotLoading: "Loading check...",
    robotAnswer: "Answer",
    honeypot: "Company name",
    loadingCheck: "Loading check",
    signingIn: "Signing in...",
    signIn: "Sign in",
    rememberMe: "Remember me",
    forgotPassword: "Forgot password?",
    noAccount: "Don't have an account?",
    registerAccount: "Create your account"
  },
  zh: {
    documentTitle: "GCC WebOS - 账号登录",
    shellDocumentTitle: "GCC WebOS - 用户中心",
    language: "语言",
    theme: "主题",
    preferences: "显示偏好",
    secondFactorAria: "二次验证",
    secondFactorTitle: "二次验证",
    secondFactorDescription: "此账号已开启增强验证。完成一个已绑定因子后才会进入用户中心。",
    authenticatorCode: "身份验证器验证码",
    verifying: "验证中",
    verifyAuthenticator: "验证身份验证器",
    passkeyBackup: "通行密钥备份内容",
    passkeyPlaceholder: "粘贴导出的通行密钥备份内容",
    usePasskey: "使用通行密钥",
    returnToLogin: "返回账号登录",
    loginAria: "用户登录",
    loginTitle: "账号登录",
    loginDescription: "使用账户密码登录，进入用户中心管理套餐、订单和客户端。",
    welcomeTitle: "欢迎回来",
    welcomeDescription: "GCC WebOS 会保护你的连接，并保持订阅访问稳定。",
    trustItems: ["不记录活动日志", "账户访问已加密", "订阅只在账户内管理"],
    accountId: "电子邮箱",
    accountPlaceholder: "you@example.com",
    password: "密码",
    passwordPlaceholder: "请输入密码",
    robot: "防机器人校验",
    robotLoading: "正在加载校验...",
    robotAnswer: "答案",
    honeypot: "公司名称",
    loadingCheck: "加载校验中",
    signingIn: "登录中...",
    signIn: "登录",
    rememberMe: "记住我",
    forgotPassword: "忘记密码？",
    noAccount: "还没有账号？",
    registerAccount: "注册创建账户"
  }
} as const;

type PortalAuthLocale = keyof typeof portalAuthEntryCopy;

function uiText(locale: PortalAuthLocale, zh: string, en: string) {
  return locale === "en" ? en : zh;
}

function nextPortalSetupIdempotencyKey() {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }
  return `portal-setup-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

const defaultPaymentRedirect = (url: string) => {
  window.location.assign(url);
};

function shouldRedirectToPaymentProvider() {
  if (typeof window === "undefined") return false;
  const matchMedia = typeof window.matchMedia === "function"
    ? window.matchMedia.bind(window)
    : null;
  const coarsePointer = Boolean(matchMedia?.("(pointer: coarse)")?.matches);
  const smallViewport = Boolean(matchMedia?.("(max-width: 767px)")?.matches);
  const mobileUserAgent = typeof window.navigator?.userAgent === "string"
    && /Android|iPhone|iPad|iPod|Mobile/i.test(window.navigator.userAgent);
  return mobileUserAgent || (coarsePointer && smallViewport);
}

function paymentDeviceForCurrentBrowser(): "pc" | "mobile" {
  return shouldRedirectToPaymentProvider() ? "mobile" : "pc";
}

function defaultPaymentChannelForCurrentBrowser(): PortalPaymentChannel {
  return shouldRedirectToPaymentProvider() ? "wxpay" : webDefaultPaymentChannel;
}

function paymentRedirectUrl(order: PortalPaymentOrder) {
  return order.urlScheme || order.checkoutUrl || "";
}

function paymentQrPayload(order: PortalPaymentOrder) {
  if (order.qrCode) return order.qrCode;
  if (order.channel === "wxpay") return "";
  return order.checkoutUrl || "";
}

function hasPaymentEntry(order: PortalPaymentOrder) {
  return Boolean(order.checkoutUrl || order.urlScheme || order.qrCode);
}

function paymentScanUnavailableMessage(order: PortalPaymentOrder, locale: PortalAuthLocale) {
  if (order.channel === "wxpay" && !order.qrCode && order.checkoutUrl) {
    return uiText(
      locale,
      "微信支付暂未返回可扫码付款码，请改用支付宝，或在手机端重新提交后跳转微信支付。",
      "WeChat Pay has not returned a scannable payment code. Use Alipay, or retry on mobile to open WeChat Pay."
    );
  }
  return "";
}

function localizedPlan(plan: PortalPlan, locale: PortalAuthLocale): PortalPlan {
  if (locale !== "en") return plan;
  switch (plan.id) {
    case "trial":
      return {
        ...plan,
        label: "7-day trial",
        billingCycle: "7 days",
        priceLabel: "Free",
        description: "Automatically enabled after registration so you can verify the account and client flow.",
        highlights: ["Included with registration", "Valid for 7 days", "One trial per account"]
      };
    case "monthly_basic":
      return {
        ...plan,
        label: "Basic monthly",
        billingCycle: "30 days",
        priceLabel: "20 CNY / month",
        description: "For light personal use. Continue on the payment platform and track status inside your account.",
        highlights: ["Personal use", "Standard regions", "Multiple payment methods"]
      };
    case "monthly_plus":
      return {
        ...plan,
        label: "Monthly member",
        billingCycle: "30 days",
        priceLabel: "30 CNY / month",
        description: "For higher traffic usage. Activation starts after the payment platform confirms payment.",
        highlights: ["100 GB monthly traffic", "Shared account traffic", "Priority setup support"],
        badge: "Popular"
      };
    case "yearly":
      return {
        ...plan,
        label: "Yearly plan",
        billingCycle: "365 days",
        priceLabel: "200 CNY / year",
        description: "For long-term use. Continue on the payment platform and renew inside your account.",
        highlights: ["Yearly billing", "Best value", "Renew inside account"]
      };
    default:
      return plan;
  }
}

function selectedPlan(planId: PortalPlanId, locale: PortalAuthLocale = "zh") {
  return localizedPlan(plans.find((plan) => plan.id === planId) ?? plans[0], locale);
}

function localizedPortalViewCopy(view: PortalView, locale: PortalAuthLocale) {
  return {
    dashboard: {
      label: uiText(locale, "概览", "Overview"),
      description: uiText(locale, "查看账户状态、可用时间、流量和开始使用。", "View account status, available time, usage, and setup guide.")
    },
    usage: {
      label: uiText(locale, "用量", "Usage"),
      description: uiText(locale, "查看账户共享流量额度和使用情况。", "Review shared account traffic quota and usage.")
    },
    marketplace: {
      label: uiText(locale, "商城", "Marketplace"),
      description: uiText(locale, "浏览套餐和流量包，使用 Coins 完成购买。", "Browse plans and data packs, then purchase with Coins.")
    },
    orders: {
      label: uiText(locale, "订单", "Orders"),
      description: uiText(locale, "统一查看商城消费、套餐付款和服务记录。", "Review Marketplace purchases, plan payments, and service records in one place.")
    },
    wallet: {
      label: uiText(locale, "Coins 钱包", "Coins wallet"),
      description: uiText(locale, "查看可用余额、分类余额和钱包流水。", "Review spendable balance, balance categories, and Wallet activity.")
    },
    referrals: {
      label: uiText(locale, "推荐奖励", "Referral rewards"),
      description: uiText(locale, "查看推荐链接、归因绩效和奖励状态。", "Review your referral link, attributed performance, and reward states.")
    },
    start: {
      label: uiText(locale, "开始使用", "Start using"),
      description: uiText(locale, "选择设备、下载客户端并完成连接。", "Choose a device, download a client, and connect step by step.")
    },
    profile: {
      label: uiText(locale, "个人中心", "Personal center"),
      description: uiText(locale, "管理账户信息、身份验证器和通行密钥。", "Manage account information, authenticators, and passkeys.")
    },
    settings: {
      label: uiText(locale, "设置", "Settings"),
      description: uiText(locale, "管理界面语言和显示主题。", "Manage interface language and display theme.")
    },
    support: {
      label: uiText(locale, "支持", "Support"),
      description: uiText(locale, "提交客户端、套餐或账户问题并追踪处理编号。", "Send client, plan, or account questions and track the support reference.")
    }
  }[view];
}

function localizedNavItems(locale: PortalAuthLocale) {
  return navItems.map((item) => ({
    ...item,
    ...localizedPortalViewCopy(item.id, locale),
    ...(item.id === "orders" ? { label: uiText(locale, "订单管理", "Order management") } : {})
  }));
}

function localizedNavGroups(locale: PortalAuthLocale) {
  return portalNavigationGroups.map((group) => ({
    ...group,
    label: uiText(locale, group.zh, group.en)
  }));
}

function localizedOrderStatusTabs(locale: PortalAuthLocale) {
  return orderStatusTabs.map((tab) => ({
    ...tab,
    label: {
      all: uiText(locale, "全部", "All"),
      active: uiText(locale, "生效中", "Active"),
      pending: uiText(locale, "待开通", "Pending"),
      disabled: uiText(locale, "已停用", "Disabled"),
      expired: uiText(locale, "已过期", "Expired")
    }[tab.id]
  }));
}

function localizedSupportCategories(locale: PortalAuthLocale) {
  return supportCategories.map((item) => ({
    ...item,
    label: {
      subscription: uiText(locale, "订阅申请", "Subscription"),
      client_import: uiText(locale, "客户端导入", "Client import"),
      account_security: uiText(locale, "账号安全", "Account security"),
      other: uiText(locale, "其他问题", "Other")
    }[item.id]
  }));
}

function orderStatusLabel(status: PortalOrderRow["status"], locale: PortalAuthLocale = "zh") {
  switch (status) {
    case "active":
      return uiText(locale, "生效中", "Active");
    case "pending":
      return uiText(locale, "待开通", "Pending");
    case "disabled":
      return uiText(locale, "已停用", "Disabled");
    case "expired":
      return uiText(locale, "已过期", "Expired");
    default:
      return uiText(locale, "待开通", "Pending");
  }
}

function paymentStatusLabel(status: PortalPaymentOrder["status"], locale: PortalAuthLocale = "zh") {
  switch (status) {
    case "pending_payment":
      return uiText(locale, "待付款", "Pending payment");
    case "payment_amount_mismatch":
      return uiText(locale, "金额异常", "Amount mismatch");
    case "payment_failed":
      return uiText(locale, "支付失败", "Payment failed");
    case "paid_pending_admin_review":
      return uiText(locale, "待开通", "Pending activation");
    case "paid_access_delivered":
      return uiText(locale, "已开通", "Delivered");
    case "paid_delivery_blocked":
      return uiText(locale, "开通异常", "Delivery issue");
    default:
      return status;
  }
}

function orderHealthLabel(
  orderRows: PortalOrderRow[],
  accountEntitlements: PortalAccountEntitlement[] = [],
  locale: PortalAuthLocale = "zh"
) {
  if (accountEntitlements.some((entitlement) => usableTrafficEntitlement(entitlement))) {
    return uiText(locale, "服务可用", "Service available");
  }
  if (orderRows.length === 0) return uiText(locale, "未开通", "Not active");
  if (activeOrderCount(orderRows) > 0) return uiText(locale, "服务可用", "Service available");
  if (pendingOrderCount(orderRows) > 0) return uiText(locale, "开通中", "Activation pending");
  return orderStatusLabel(orderRows[0].status, locale);
}

function expiryDisplay(created: CreatedSubscription | null, lifecycle: SubscriptionLifecycle, locale: PortalAuthLocale = "zh") {
  if (!created) return uiText(locale, "无", "None");
  if (lifecycle === "pending") return uiText(locale, "开通中", "Activation pending");
  if (lifecycle === "expired") return locale === "en"
    ? `${formatDateTime(created.request.expiresAt, locale)} (expired)`
    : `${formatDateTime(created.request.expiresAt, locale)}（已过期）`;
  if (lifecycle === "disabled") return uiText(locale, "已停用", "Disabled");
  return locale === "en"
    ? `Expires ${formatDateTime(created.request.expiresAt, locale)}`
    : `${formatDateTime(created.request.expiresAt, locale)} 到期`;
}

function portalUiErrorMessage(error: unknown, fallback: string, locale: PortalAuthLocale) {
  const message = errorMessage(error, fallback).trim();
  const normalized = message.toLowerCase();
  const isChinese = locale === "zh";

  if (normalized === "too many requests" || normalized.includes("rate_limited")) {
    return isChinese ? "请求过于频繁，请稍后再试。" : "Too many attempts. Please try again later.";
  }
  if (normalized === "failed to fetch" || normalized === "networkerror when attempting to fetch resource.") {
    return isChinese ? "网络连接失败，请检查网络后重试。" : "Network connection failed. Check your connection and try again.";
  }
  if (normalized === "portal request failed") {
    return isChinese ? "服务暂时不可用，请稍后再试。" : "Service is temporarily unavailable. Please try again later.";
  }
  if (normalized === "human_verification_failed") {
    return isChinese ? "防机器人校验失败，请重新完成校验。" : "Anti-bot verification failed. Please try again.";
  }
  if (normalized.includes("payment_provider_checkout_unavailable")) {
    return isChinese
      ? "暂时无法打开付款页面，请稍后重新提交订单。"
      : "The payment page is not available yet. Try again shortly.";
  }

  return message || fallback;
}

function NoTranslateText({
  children,
  className
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <span className={cn("notranslate", className)} translate="no">
      {children}
    </span>
  );
}

function durationDaysForPlan(planId: PortalPlanId) {
  if (planId === "trial") return 7;
  if (planId === "yearly") return 365;
  return 30;
}

function normalizeOrderQuantity(value: number) {
  if (!Number.isFinite(value)) return 1;
  return Math.max(1, Math.min(12, Math.trunc(value)));
}

function clientTargetLabel(clientTarget: PortalClientId) {
  if (clientTarget === "karing") return "Clash / Mihomo";
  return clientTargets.find((target) => target.id === clientTarget)?.label ?? clientTarget;
}

function orderStatusFromLifecycle(lifecycle: PortalSubscriptionRequest["lifecycle"]): PortalOrderRow["status"] {
  if (lifecycle === "active" || lifecycle === "pending" || lifecycle === "disabled" || lifecycle === "expired") {
    return lifecycle;
  }
  return "pending";
}

function orderNumber(requestRef: string) {
  return requestRef.replace(/^subreq[_-]?/i, "O-").slice(0, 18);
}

function paymentOrderNumber(orderRef: string) {
  return orderRef.replace(/^pay[_-]?/i, "P-").slice(0, 18);
}

function paymentAmountLabel(order: PortalPaymentOrder) {
  const amount = Number.isFinite(order.amountMinor) ? order.amountMinor / 100 : 0;
  return `¥${amount.toFixed(2)}`;
}

function paymentOrderStatusClass(status: PortalPaymentOrder["status"]): PortalOrderRow["status"] {
  if (status === "paid_access_delivered") return "active";
  if (status === "pending_payment" || status === "paid_pending_admin_review") return "pending";
  return "disabled";
}

function paymentRenewalLabel(order: PortalPaymentOrder, locale: PortalAuthLocale = "zh") {
  if (order.status === "pending_payment") return uiText(locale, "付款后生效", "Active after payment");
  if (order.status === "paid_access_delivered") return order.paidAt
    ? uiText(locale, `已于 ${formatDateTime(order.paidAt, locale)} 开通`, `Delivered ${formatDateTime(order.paidAt, locale)}`)
    : uiText(locale, "已开通", "Delivered");
  if (order.status === "paid_pending_admin_review") return uiText(locale, "付款确认中", "Payment confirming");
  if (order.status === "paid_delivery_blocked") return uiText(locale, "需要人工处理", "Manual handling required");
  return uiText(locale, "未生效", "Not active");
}

function paymentOrderMatchesStatus(order: PortalPaymentOrder, statusFilter: OrderStatusFilter) {
  if (statusFilter === "all") return true;
  return paymentOrderStatusClass(order.status) === statusFilter;
}

function paymentOrderSearchText(order: PortalPaymentOrder, locale: PortalAuthLocale = "zh") {
  return [
    paymentOrderNumber(order.orderRef),
    order.orderRef,
    selectedPlan(order.planId, locale).label,
    paymentStatusLabel(order.status, locale),
    paymentAmountLabel(order)
  ].join(" ").toLowerCase();
}

function paymentFlowStep(order: PortalPaymentOrder): PaymentFlowStep {
  if (order.status === "paid_access_delivered") return "success";
  if (order.status === "payment_failed" || order.status === "payment_amount_mismatch") return "failed";
  if (order.status === "paid_pending_admin_review" || order.status === "paid_delivery_blocked") return "processing";
  return "checkout";
}

function paymentChannelLabel(order: PortalPaymentOrder, locale: PortalAuthLocale = "zh") {
  switch (order.channel) {
    case "alipay":
      return uiText(locale, "支付宝", "Alipay");
    case "qqpay":
      return uiText(locale, "QQ 钱包", "QQ Pay");
    case "bank":
      return uiText(locale, "银行转账", "Bank transfer");
    case "jdpay":
      return uiText(locale, "京东支付", "JD Pay");
    case "wxpay":
    default:
      return uiText(locale, "微信支付", "WeChat Pay");
  }
}

function paymentDisplayMethodLabel(order: PortalPaymentOrder, locale: PortalAuthLocale, _isMobilePayment: boolean) {
  return paymentChannelLabel(order, locale);
}

function paymentScanInstruction(order: PortalPaymentOrder, locale: PortalAuthLocale, isMobilePayment: boolean) {
  if (isMobilePayment) {
    return uiText(locale, "提交后会进入所选支付平台；如未自动打开，可点击继续支付。", "Continue in the selected wallet. If it does not open automatically, tap Continue payment.");
  }
  if (order.channel === "alipay") {
    return uiText(locale, "请使用支付宝扫码付款。", "Scan with Alipay to pay.");
  }
  if (order.channel === "wxpay") {
    return uiText(locale, "请使用微信扫码付款。", "Scan with WeChat Pay to pay.");
  }
  return uiText(locale, "请使用所选支付方式扫码付款。", "Scan with the selected payment method to pay.");
}

function paymentFlowTitle(step: PaymentFlowStep, locale: PortalAuthLocale) {
  if (step === "success") return uiText(locale, "支付成功", "Payment successful");
  if (step === "processing") return uiText(locale, "正在核验支付", "Verifying payment");
  if (step === "failed") return uiText(locale, "支付失败", "Payment failed");
  return uiText(locale, "扫码支付", "Scan to pay");
}

function paymentFlowDescription(step: PaymentFlowStep, locale: PortalAuthLocale) {
  if (step === "success") {
    return uiText(locale, "付款已完成，稍后会在账户中显示可用时间。", "Payment is complete. Available time will appear in your account shortly.");
  }
  if (step === "processing") {
    return uiText(locale, "付款结果确认中，请不要重复提交订单。", "Payment is being confirmed. Do not submit another order.");
  }
  if (step === "failed") {
    return uiText(locale, "付款未完成，可重新选择支付方式或返回订单。", "Payment was not completed. Choose a payment method again or return to Orders.");
  }
  return uiText(locale, "请在有效期内完成付款。", "Pay before the code expires.");
}

const PAYMENT_CODE_TTL_MS = 10 * 60 * 1000;

function paymentCodeExpiresAt(order: PortalPaymentOrder) {
  const explicit = order.paymentExpiresAt ? Date.parse(order.paymentExpiresAt) : NaN;
  if (Number.isFinite(explicit)) return new Date(explicit).toISOString();
  const createdAtMs = Date.parse(order.createdAt);
  const baseMs = Number.isFinite(createdAtMs) ? createdAtMs : Date.now();
  return new Date(baseMs + PAYMENT_CODE_TTL_MS).toISOString();
}

function paymentCodeRemainingLabel(remainingMs: number, locale: PortalAuthLocale) {
  if (remainingMs <= 0) return uiText(locale, "已过期", "expired");
  const totalSeconds = Math.ceil(remainingMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes > 0) {
    return locale === "en" ? `${minutes}m ${seconds}s` : `${minutes} 分 ${seconds} 秒`;
  }
  return locale === "en" ? `${seconds}s` : `${seconds} 秒`;
}

async function createPaymentQrDataUri(payload: string) {
  const { default: QRCode } = await import("qrcode");
  return QRCode.toDataURL(payload, {
    errorCorrectionLevel: "M",
    margin: 1,
    width: 224
  });
}

function subscriptionRequestToOrder(
  request: PortalSubscriptionRequest,
  fallback?: { durationDays?: number; quantity?: number }
): PortalOrderRow {
  const durationDays = request.durationDays ?? fallback?.durationDays ?? durationDaysForPlan(request.planId);
  const quantity = normalizeOrderQuantity(request.quantity ?? fallback?.quantity ?? 1);
  return {
    requestRef: request.requestRef,
    request,
    createdAt: request.updatedAt ?? new Date(0).toISOString(),
    planId: request.planId,
    durationDays,
    quantity,
    clientTarget: request.clientTarget,
    status: orderStatusFromLifecycle(request.lifecycle),
    expiresAt: request.expiresAt,
    subscriptionUrl: request.subscriptionUrl
  };
}

function upsertOrderRow(rows: PortalOrderRow[], order: PortalOrderRow) {
  const existingIndex = rows.findIndex((row) => row.requestRef === order.requestRef);
  if (existingIndex === -1) return [order, ...rows];
  return rows.map((row, index) => (index === existingIndex ? order : row));
}

function upsertPaymentOrder(rows: PortalPaymentOrder[], order: PortalPaymentOrder) {
  const existingIndex = rows.findIndex((row) => row.orderRef === order.orderRef);
  if (existingIndex === -1) return [order, ...rows];
  return rows.map((row, index) => (index === existingIndex ? order : row));
}

function createdSubscriptionFromOrder(order: PortalOrderRow | null): CreatedSubscription | null {
  if (!order) return null;
  return {
    request: order.request,
    action: order.status === "disabled"
      ? "disabled"
      : order.request.event
        ? "refreshed"
        : "opening_requested",
    previousInvalidatedAt: order.request.event?.occurredAt
  };
}

function formatDateTime(value: string, locale: PortalAuthLocale = "zh") {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(locale === "en" ? "en-US" : "zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(date);
}

function formatUtcDate(value: string, locale: PortalAuthLocale = "zh") {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(locale === "en" ? "en-US" : "zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: "UTC"
  }).format(date);
}

function formatTrafficBytes(bytes: number) {
  const safeBytes = Number.isFinite(bytes) && bytes > 0 ? bytes : 0;
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = safeBytes;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  const formatted = unitIndex === 0 || value >= 10
    ? Math.round(value).toString()
    : value.toFixed(1).replace(/\.0$/, "");
  return `${formatted} ${units[unitIndex]}`;
}

function trafficUsageLabel(order: PortalOrderRow, locale: PortalAuthLocale = "zh") {
  const usage = order.request.usage;
  if (!usage) return uiText(locale, "暂无用量", "No usage yet");
  if (usage.totalBytes > 0) {
    return `${formatTrafficBytes(usage.usedBytes)} / ${formatTrafficBytes(usage.totalBytes)}`;
  }
  return `${formatTrafficBytes(usage.usedBytes)} / ${uiText(locale, "不限量", "unlimited")}`;
}

function trafficUsageDetail(order: PortalOrderRow, locale: PortalAuthLocale = "zh") {
  const usage = order.request.usage;
  if (!usage) return uiText(locale, "使用后显示", "Shown after use");
  return locale === "en"
    ? `Upload ${formatTrafficBytes(usage.uploadBytes)} / Download ${formatTrafficBytes(usage.downloadBytes)}`
    : `上传 ${formatTrafficBytes(usage.uploadBytes)} / 下载 ${formatTrafficBytes(usage.downloadBytes)}`;
}

function trafficUsageCollectedAt(order: PortalOrderRow, locale: PortalAuthLocale = "zh") {
  const updatedAt = order.request.usage?.updatedAt;
  return updatedAt
    ? locale === "en"
      ? `Updated ${formatDateTime(updatedAt, locale)}`
      : `更新于 ${formatDateTime(updatedAt, locale)}`
    : "";
}

function trafficUsageStatusLabel(order: PortalOrderRow, locale: PortalAuthLocale = "zh") {
  const usage = order.request.usage;
  if (!usage) return "";
  if (usage.status === "over_limit") return uiText(locale, "超额", "Over limit");
  if (usage.collectionStatus === "stale") return uiText(locale, "延迟", "Delayed");
  if (usage.collectionStatus === "measured_zero") return uiText(locale, "零用量", "Zero usage");
  return "";
}

function trafficUsagePercent(order: PortalOrderRow) {
  const usage = order.request.usage;
  if (!usage || usage.totalBytes <= 0) return 0;
  return Math.max(0, Math.min(100, usage.usageRatio * 100));
}

function aggregateTrafficUsage(orderRows: PortalOrderRow[], accountEntitlements: PortalAccountEntitlement[] = []) {
  const summary = orderRows.reduce(
    (summary, order) => {
      const usage = order.request.usage;
      if (!usage) return summary;
      summary.uploadBytes += usage.uploadBytes;
      summary.downloadBytes += usage.downloadBytes;
      summary.usedBytes += usage.usedBytes;
      summary.totalBytes += Math.max(0, usage.totalBytes);
      summary.measuredOrders += 1;
      summary.measuredChannels += usage.measuredChannelCount;
      summary.totalChannels += usage.channelCount;
      if (usage.status === "over_limit") summary.overLimitOrders += 1;
      if (usage.collectionStatus === "stale") summary.staleOrders += 1;
      return summary;
    },
    {
      uploadBytes: 0,
      downloadBytes: 0,
      usedBytes: 0,
      totalBytes: 0,
      measuredOrders: 0,
      measuredChannels: 0,
      totalChannels: 0,
      overLimitOrders: 0,
      staleOrders: 0
    }
  );
  const entitlementQuotaBytes = accountEntitlementTrafficBytes(accountEntitlements);
  if (summary.totalBytes <= 0 && entitlementQuotaBytes > 0) {
    summary.totalBytes = entitlementQuotaBytes;
  }
  return summary;
}

function aggregateTrafficPercent(summary: ReturnType<typeof aggregateTrafficUsage>) {
  if (summary.totalBytes <= 0) return 0;
  return Math.max(0, Math.min(100, (summary.usedBytes / summary.totalBytes) * 100));
}

function orderUsageSortValue(order: PortalOrderRow) {
  return order.request.usage?.usedBytes ?? -1;
}

function activeOrderCount(orderRows: PortalOrderRow[]) {
  return orderRows.filter((order) => order.status === "active").length;
}

function pendingOrderCount(orderRows: PortalOrderRow[]) {
  return orderRows.filter((order) => order.status === "pending").length;
}

function isPortalPlanId(value: string): value is PortalPlanId {
  return value === "trial"
    || value === "monthly"
    || value === "monthly_basic"
    || value === "monthly_plus"
    || value === "yearly";
}

function usableTrafficEntitlement(entitlement: PortalAccountEntitlement) {
  return entitlement.usable && Number(entitlement.quota?.trafficGb ?? 0) > 0;
}

function entitlementTrafficBytes(entitlement: PortalAccountEntitlement) {
  const trafficGb = Number(entitlement.quota?.trafficGb ?? 0);
  return Number.isFinite(trafficGb) && trafficGb > 0 ? trafficGb * 1024 ** 3 : 0;
}

function accountEntitlementTrafficBytes(entitlements: PortalAccountEntitlement[]) {
  return entitlements
    .filter((entitlement) => usableTrafficEntitlement(entitlement))
    .reduce((total, entitlement) => total + entitlementTrafficBytes(entitlement), 0);
}

function currentTrafficEntitlement(entitlements: PortalAccountEntitlement[]) {
  return [...entitlements].reverse().find((entitlement) => usableTrafficEntitlement(entitlement)) ?? null;
}

function planIdFromEntitlement(entitlement: PortalAccountEntitlement): PortalPlanId | null {
  return isPortalPlanId(entitlement.plan) ? entitlement.plan : null;
}

function setupPlanIdFromEntitlement(entitlement: PortalAccountEntitlement | null): PortalPlanId | null {
  const planId = entitlement ? planIdFromEntitlement(entitlement) : null;
  return planId && planId !== "trial" ? planId : null;
}

function entitlementExpiryDisplay(entitlement: PortalAccountEntitlement | null, locale: PortalAuthLocale = "zh") {
  if (!entitlement?.validUntil) return uiText(locale, "无", "None");
  return locale === "en"
    ? `Expires ${formatUtcDate(entitlement.validUntil, locale)}`
    : `${formatUtcDate(entitlement.validUntil, locale)} 到期`;
}

function resolveLifecycle(created: CreatedSubscription | null): SubscriptionLifecycle {
  if (!created) return "none";
  return created.request.lifecycle;
}

function authModeLabel(mode: DisplayAuthMode, locale: PortalAuthLocale = "zh") {
  if (mode === "email") return uiText(locale, "邮箱验证码（未启用）", "Email code (disabled)");
  if (mode === "token") return uiText(locale, "一次性登录", "One-time sign-in");
  if (mode === "password") return uiText(locale, "密码登录", "Password sign-in");
  if (mode === "passkey") return uiText(locale, "通行密钥", "Passkey");
  return uiText(locale, "身份验证器", "Authenticator");
}

function isSecondFactorChallenge(result: PortalSession | PortalSecondFactorChallenge): result is PortalSecondFactorChallenge {
  return result.status === "second_factor_required";
}

function createPendingHumanVerificationChallenge(prompt = "正在加载校验..."): PortalHumanVerificationChallenge {
  return {
    challengeId: "",
    prompt
  };
}

/**
 * A wallet-first account deliberately does not project the legacy
 * access-request/payment state. The wallet and deferred-commerce panels load
 * their own server-owned projections after the authenticated shell commits.
 */
function walletFirstNeutralPortalState(
  session: PortalSession,
  security: PortalUserSecurityState
): PortalUserState {
  return {
    userRef: session.userRef,
    subscriptionRequest: null,
    subscriptionRequests: [],
    accountEntitlements: [],
    paymentOrders: [],
    historySummary: [],
    security,
    updatedAt: new Date().toISOString(),
    safety: {
      noAdminApi: true,
      noPaymentActivation: true,
      noPublicAdmin: true
    }
  };
}

function WalletFirstOrdersNotice({
  locale,
  onOpenMarketplace
}: {
  locale: PortalAuthLocale;
  onOpenMarketplace: () => void;
}) {
  return (
    <section
      aria-labelledby="portal-wallet-first-orders-heading"
      className="portal-use-card portal-v2-orders-panel"
      data-commerce-model="wallet_first_unique_v1"
    >
      <div className="portal-section-heading">
        <ReceiptText aria-hidden="true" />
        <div>
          <span className="portal-card-label">{uiText(locale, "订单", "Orders")}</span>
          <h2 id="portal-wallet-first-orders-heading">
            {uiText(locale, "Coins 服务状态", "Coins service status")}
          </h2>
          <p>
            {uiText(
              locale,
              "此账户使用 Coins 服务资源模型。服务切换和交付状态请在商城中查看。",
              "This account uses the Coins service-resource model. View service transitions and delivery in Marketplace."
            )}
          </p>
        </div>
      </div>
      <button className="portal-primary-button compact" type="button" onClick={onOpenMarketplace}>
        <ShoppingBag aria-hidden="true" />
        {uiText(locale, "前往商城", "Go to Marketplace")}
      </button>
    </section>
  );
}

function WalletFirstCurrentResourceStatus({
  resource,
  locale,
  onOpenMarketplace
}: {
  resource: PortalCurrentResource;
  locale: PortalAuthLocale;
  onOpenMarketplace: () => void;
}) {
  if (resource.state === "none") {
    return (
      <section
        aria-labelledby="portal-wallet-first-resource-heading"
        className="portal-use-card portal-v2-orders-panel"
        data-resource-state="none"
      >
        <div className="portal-section-heading">
          <Wifi aria-hidden="true" />
          <div>
            <span className="portal-card-label">{uiText(locale, "账户资源", "Account resource")}</span>
            <h2 id="portal-wallet-first-resource-heading">
              {uiText(locale, "尚未获得可用服务资源", "No service resource yet")}
            </h2>
            <p>
              {uiText(
                locale,
                "完成 Coins 服务购买并交付后，当前资源会显示在这里。",
                "After a Coins service purchase is delivered, the current resource appears here."
              )}
            </p>
          </div>
        </div>
        <button className="portal-primary-button compact" type="button" onClick={onOpenMarketplace}>
          <ShoppingBag aria-hidden="true" />
          {uiText(locale, "前往商城", "Go to Marketplace")}
        </button>
      </section>
    );
  }

  if (resource.state === "reconciliation_required") {
    return (
      <section
        aria-labelledby="portal-wallet-first-resource-heading"
        className="portal-use-card portal-v2-orders-panel"
        data-resource-state="reconciliation_required"
      >
        <div className="portal-section-heading">
          <AlertTriangle aria-hidden="true" />
          <div>
            <span className="portal-card-label">{uiText(locale, "账户资源", "Account resource")}</span>
            <h2 id="portal-wallet-first-resource-heading">
              {uiText(locale, "服务资源正在核对", "Service resource is being reconciled")}
            </h2>
            <p>
              {uiText(
                locale,
                "为避免展示不准确的配置，本页暂不显示订阅链接或连接材料。请稍后重新登录后再查看。",
                "To avoid showing an inaccurate configuration, this page does not show a subscription link or connection material yet. Please sign in again later to check the status."
              )}
            </p>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section
      aria-labelledby="portal-wallet-first-resource-heading"
      className="portal-use-card portal-v2-orders-panel"
      data-resource-state="available"
    >
      <div className="portal-section-heading">
        <CheckCircle2 aria-hidden="true" />
        <div>
          <span className="portal-card-label">{uiText(locale, "账户资源", "Account resource")}</span>
          <h2 id="portal-wallet-first-resource-heading">
            {uiText(locale, "服务资源已可用", "Service resource is available")}
          </h2>
          <p>
            {resource.setupAvailable
              ? uiText(
                locale,
                "资源已准备就绪。配置需要通过独立、受保护的操作显示；本页不会自动生成或展示订阅链接。",
                "The resource is ready. Configuration is shown through a separate protected action; this page never generates or reveals a subscription link automatically."
              )
              : uiText(
                locale,
                "资源已准备就绪，连接配置仍在准备中。本页不会自动生成或展示订阅链接。",
                "The resource is ready and connection configuration is still being prepared. This page never generates or reveals a subscription link automatically."
              )}
          </p>
        </div>
      </div>
      <dl className="portal-v2-definition-list">
        <div>
          <dt>{uiText(locale, "套餐", "Plan")}</dt>
          <dd>{resource.plan.id}</dd>
        </div>
        <div>
          <dt>{uiText(locale, "资源期限", "Resource term")}</dt>
          <dd>{uiText(locale, `${resource.plan.durationDays} 天`, `${resource.plan.durationDays} days`)}</dd>
        </div>
        <div>
          <dt>{uiText(locale, "月流量", "Monthly traffic")}</dt>
          <dd>{`${resource.plan.monthlyTrafficGb} GB`}</dd>
        </div>
        <div>
          <dt>{uiText(locale, "可用至", "Available until")}</dt>
          <dd>{formatUtcDate(resource.validUntil, locale)}</dd>
        </div>
      </dl>
    </section>
  );
}

function WalletFirstSetupDeliveryPanel({
  clearIdempotencyKey,
  locale,
  nextIdempotencyKey,
  portalClient,
  resource,
  sessionRef
}: {
  clearIdempotencyKey: () => void;
  locale: PortalAuthLocale;
  nextIdempotencyKey: () => string;
  portalClient: UserPortalClient;
  resource: PortalCurrentResource;
  sessionRef: string | undefined;
}) {
  const [delivery, setDelivery] = useState<PortalCurrentResourceSetupDelivery | null>(null);
  const [generating, setGenerating] = useState(false);
  const [acknowledging, setAcknowledging] = useState(false);
  const [copied, setCopied] = useState(false);
  const [acknowledgedResourceIdentity, setAcknowledgedResourceIdentity] = useState<string | null>(null);
  const [setupError, setSetupError] = useState("");
  const observedSessionRef = useRef(sessionRef);
  const resourceIdentity = resource.state === "available"
    ? [
      resource.plan.id,
      resource.plan.durationDays,
      resource.plan.monthlyTrafficGb,
      resource.validUntil
    ].join("|")
    : "";
  const acknowledged = acknowledgedResourceIdentity === resourceIdentity;
  const canRequestSetup = Boolean(
    sessionRef?.trim()
    && portalClient.createCurrentResourceSetup
    && portalClient.acknowledgeCurrentResourceSetup
  );

  useEffect(() => {
    if (observedSessionRef.current === sessionRef) return;
    // A session change must never carry a prior session's delivery or retry key.
    observedSessionRef.current = sessionRef;
    clearIdempotencyKey();
    setDelivery(null);
    setGenerating(false);
    setAcknowledging(false);
    setCopied(false);
    setAcknowledgedResourceIdentity(null);
    setSetupError("");
  }, [clearIdempotencyKey, sessionRef]);

  useEffect(() => () => {
    // Leaving Start must clear the retry key alongside the ephemeral delivery.
    clearIdempotencyKey();
  }, [clearIdempotencyKey]);

  if (resource.state !== "available" || !resource.setupAvailable) {
    return null;
  }

  const clearDelivery = () => {
    clearIdempotencyKey();
    setDelivery(null);
    setCopied(false);
    setAcknowledgedResourceIdentity(null);
    setSetupError("");
  };

  const requestSetup = async () => {
    const createCurrentResourceSetup = portalClient.createCurrentResourceSetup;
    if (!sessionRef?.trim() || !createCurrentResourceSetup || !portalClient.acknowledgeCurrentResourceSetup) {
      setDelivery(null);
      setCopied(false);
      setSetupError(uiText(locale, "配置交付当前不可用，请稍后重试。", "Setup delivery is unavailable. Try again later."));
      return;
    }
    setDelivery(null);
    setCopied(false);
    setAcknowledgedResourceIdentity(null);
    setSetupError("");
    setGenerating(true);
    try {
      const nextDelivery = await createCurrentResourceSetup({
        sessionRef,
        idempotencyKey: nextIdempotencyKey()
      });
      setDelivery(nextDelivery);
    } catch {
      setDelivery(null);
      setCopied(false);
      setSetupError(uiText(locale, "配置链接生成失败，请稍后重试。", "Could not generate the configuration link. Try again later."));
    } finally {
      setGenerating(false);
    }
  };

  const copyDelivery = async () => {
    if (!delivery) return;
    setSetupError("");
    try {
      const copiedToClipboard = await copyText(delivery.subscriptionUrl);
      if (!copiedToClipboard) {
        throw new Error("clipboard_unavailable");
      }
      setCopied(true);
    } catch {
      // Do not leave material on screen after a failed explicit copy. A later
      // explicit request reuses the in-memory idempotency key for recovery.
      setDelivery(null);
      setCopied(false);
      setSetupError(uiText(locale, "复制失败，请重试后再确认完成。", "Copying failed. Retry before confirming completion."));
    }
  };

  const acknowledgeDelivery = async () => {
    const acknowledgeCurrentResourceSetup = portalClient.acknowledgeCurrentResourceSetup;
    if (!delivery || !copied || !sessionRef?.trim() || !acknowledgeCurrentResourceSetup) return;
    setSetupError("");
    setAcknowledging(true);
    try {
      await acknowledgeCurrentResourceSetup({
        sessionRef,
        handoffRef: delivery.handoffRef
      });
      clearIdempotencyKey();
      setDelivery(null);
      setCopied(false);
      setAcknowledgedResourceIdentity(resourceIdentity);
    } catch {
      // Preserve the in-memory delivery so the user can explicitly retry the acknowledgement.
      setSetupError(uiText(locale, "确认未完成，请重试。", "Acknowledgement did not complete. Try again."));
    } finally {
      setAcknowledging(false);
    }
  };

  return (
    <section
      aria-labelledby="portal-wallet-first-setup-heading"
      className="portal-use-card portal-v2-orders-panel"
      data-wallet-first-setup="explicit"
    >
      <div className="portal-section-heading">
        <Wifi aria-hidden="true" />
        <div>
          <span className="portal-card-label">{uiText(locale, "配置交付", "Setup delivery")}</span>
          <h3 id="portal-wallet-first-setup-heading">
            {acknowledged
              ? uiText(locale, "配置已确认", "Setup confirmed")
              : uiText(locale, "生成配置链接", "Generate configuration link")}
          </h3>
          <p>
            {acknowledged
              ? uiText(
                locale,
                "本次配置交付已结束；资源更新后会重新提供新的显式操作。",
                "This setup delivery is complete. A new explicit action becomes available when the resource changes."
              )
              : uiText(
                locale,
                "仅在你点击生成后，本页才会临时显示链接；离开本页、关闭或退出登录会清除它。",
                "The link appears here only after you request it. Leaving this view, closing it, or signing out clears it."
              )}
          </p>
        </div>
      </div>
      {setupError ? <p className="portal-error" role="alert">{setupError}</p> : null}
      {acknowledged ? (
        <p className="portal-success" role="status">
          {uiText(
            locale,
            "配置交付已确认。如仍无法连接，请在支持页面提交问题。",
            "Setup delivery acknowledged. If you still cannot connect, submit a request on the Support page."
          )}
        </p>
      ) : null}
      {delivery ? (
        <div className="portal-form-stack">
          <label className="portal-field">
            <span>{uiText(locale, "订阅链接", "Subscription link")}</span>
            <input
              aria-label={uiText(locale, "订阅链接", "Subscription link")}
              autoComplete="off"
              readOnly
              type="text"
              value={delivery.subscriptionUrl}
            />
          </label>
          <p className="portal-field-hint">
            {uiText(
              locale,
              "请先明确复制链接，再在客户端中导入；复制成功前不能确认完成。",
              "Copy the link explicitly before importing it into your client; completion stays disabled until copying succeeds."
            )}
          </p>
          <div className="portal-action-row">
            <button className="portal-secondary-button compact" type="button" onClick={() => void copyDelivery()}>
              <Copy aria-hidden="true" />
              {copied ? uiText(locale, "已复制", "Copied") : uiText(locale, "复制链接", "Copy link")}
            </button>
            <button
              className="portal-primary-button compact"
              type="button"
              disabled={!copied || acknowledging}
              onClick={() => void acknowledgeDelivery()}
            >
              {acknowledging
                ? uiText(locale, "正在确认…", "Acknowledging…")
                : uiText(locale, "我已完成配置", "I completed setup")}
            </button>
            <button className="portal-link-button" type="button" onClick={clearDelivery}>
              {uiText(locale, "关闭配置链接", "Close configuration link")}
            </button>
          </div>
        </div>
      ) : !acknowledged ? (
        <button
          className="portal-primary-button compact"
          type="button"
          disabled={generating || !canRequestSetup}
          onClick={() => void requestSetup()}
        >
          {generating
            ? uiText(locale, "正在生成…", "Generating…")
            : uiText(locale, "生成配置链接", "Generate configuration link")}
        </button>
      ) : null}
    </section>
  );
}

function buildHumanVerification(
  challenge: PortalHumanVerificationChallenge,
  challengeAnswer: string,
  honeypot: string
) {
  if (honeypot.trim()) {
    throw new Error("防机器人校验失败。");
  }
  const normalizedAnswer = challengeAnswer.trim();
  if (!normalizedAnswer) {
    throw new Error("请完成防机器人校验。");
  }
  if (!challenge.challengeId.trim()) {
    throw new Error("防机器人校验尚未加载，请稍后重试。");
  }
  if (typeof challenge.answer === "string" && normalizedAnswer !== challenge.answer) {
    throw new Error("请完成防机器人校验。");
  }
  return {
    challengeId: challenge.challengeId,
    challengeAnswer: normalizedAnswer,
    honeypot: ""
  };
}

function downloadPasskeyExport(passkeyExport: PortalPasskeyExport) {
  if (typeof document === "undefined" || typeof URL === "undefined" || typeof URL.createObjectURL !== "function") {
    return;
  }
  const blob = new Blob([passkeyExport.body], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = passkeyExport.fileName;
  anchor.rel = "noopener";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export function UserPortalPage({
  initialSession,
  paymentRedirect = defaultPaymentRedirect,
  portalClient
}: {
  initialSession?: PortalSession;
  paymentRedirect?: (url: string) => void;
  portalClient: UserPortalClient;
  onBackToAdmin?: () => void;
}) {
  const { locale, setLocale } = usePublicLocalePreference();
  const { theme, setTheme } = usePublicThemePreference();
  const desktopOrderNavigation = useDesktopScrollRegion();
  const authCopy = portalAuthEntryCopy[locale];
  const [portalSession, setPortalSession] = useState<PortalSession | null>(null);
  const [commerceModel, setCommerceModel] = useState<PortalCommerceModel | null>(null);
  const sessionGenerationRef = useRef(0);
  const walletFirstSetupIdempotencyKeyRef = useRef<string | null>(null);
  const [sessionGeneration, setSessionGeneration] = useState(0);
  const [accountId, setAccountId] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [rememberAccount, setRememberAccount] = useState(false);
  const [robotAnswer, setRobotAnswer] = useState("");
  const [robotTrap, setRobotTrap] = useState("");
  const [humanChallenge, setHumanChallenge] = useState(createPendingHumanVerificationChallenge);
  const [humanChallengeReady, setHumanChallengeReady] = useState(false);
  const [humanChallengeLoading, setHumanChallengeLoading] = useState(true);
  const [activeView, setActiveView] = useState<PortalView>("start");
  const [orderCenterFilter, setOrderCenterFilter] = useState<PortalOrdersFilter>("all");
  const [personalCenterSubview, setPersonalCenterSubview] = useState<"profile" | "security">("profile");
  const [selectedPlanId, setSelectedPlanId] = useState<PortalPlanId>("monthly_basic");
  const [clientTarget, setClientTarget] = useState<PortalClientId>("clash");
  const [paymentChannel, setPaymentChannel] = useState<PortalPaymentChannel>(() => defaultPaymentChannelForCurrentBrowser());
  const [orderRows, setOrderRows] = useState<PortalOrderRow[]>([]);
  const [accountEntitlements, setAccountEntitlements] = useState<PortalAccountEntitlement[]>([]);
  const [walletFirstResource, setWalletFirstResource] = useState<PortalCurrentResource | null>(null);
  const [paymentOrders, setPaymentOrders] = useState<PortalPaymentOrder[]>([]);
  const [lastPaymentOrderRef, setLastPaymentOrderRef] = useState<string | null>(null);
  const [orderStatusFilter, setOrderStatusFilter] = useState<OrderStatusFilter>("all");
  const [orderSearch, setOrderSearch] = useState("");
  const [orderClientFilter, setOrderClientFilter] = useState<"all" | PortalClientId>("all");
  const [orderSort, setOrderSort] = useState<OrderSort>("newest");
  const [orderFormOpen, setOrderFormOpen] = useState(false);
  const [selectedOrderRef, setSelectedOrderRef] = useState<string | null>(null);
  const [activePaymentOrderRef, setActivePaymentOrderRef] = useState<string | null>(null);
  const [authError, setAuthError] = useState("");
  const [pending, setPending] = useState(false);
  const [actionError, setActionError] = useState("");
  const [copiedOrderRef, setCopiedOrderRef] = useState<string | null>(null);
  const [historySummary, setHistorySummary] = useState<PortalHistoryRecord[]>([]);
  const [authenticatorBound, setAuthenticatorBound] = useState(false);
  const [authenticatorEnrollment, setAuthenticatorEnrollment] = useState<PortalAuthenticatorEnrollment | null>(null);
  const [authenticatorCode, setAuthenticatorCode] = useState("");
  const [authenticatorError, setAuthenticatorError] = useState("");
  const [authenticatorPending, setAuthenticatorPending] = useState(false);
  const [passkeyExported, setPasskeyExported] = useState(false);
  const [passkeyPending, setPasskeyPending] = useState(false);
  const [passkeyError, setPasskeyError] = useState("");
  const [securitySetupRequired, setSecuritySetupRequired] = useState(false);
  const [secondFactorChallenge, setSecondFactorChallenge] = useState<PortalSecondFactorChallenge | null>(null);
  const [secondFactorCode, setSecondFactorCode] = useState("");
  const [passkeyProof, setPasskeyProof] = useState("");
  const [secondFactorError, setSecondFactorError] = useState("");
  const [secondFactorPending, setSecondFactorPending] = useState(false);
  const [supportCategory, setSupportCategory] = useState<PortalSupportCategory>("client_import");
  const [supportMessage, setSupportMessage] = useState("");
  const [supportPending, setSupportPending] = useState(false);
  const [supportError, setSupportError] = useState("");
  const [supportResult, setSupportResult] = useState<PortalSupportRequest | null>(null);
  const nextWalletFirstSetupIdempotencyKey = useCallback(() => {
    const existing = walletFirstSetupIdempotencyKeyRef.current;
    if (existing) return existing;
    const next = nextPortalSetupIdempotencyKey();
    walletFirstSetupIdempotencyKeyRef.current = next;
    return next;
  }, []);
  const clearWalletFirstSetupIdempotencyKey = useCallback(() => {
    walletFirstSetupIdempotencyKeyRef.current = null;
  }, []);

  const advanceSessionGeneration = useCallback(() => {
    const nextGeneration = sessionGenerationRef.current + 1;
    sessionGenerationRef.current = nextGeneration;
    setSessionGeneration(nextGeneration);
    return nextGeneration;
  }, []);

  const userDisplayName = portalSession?.displayName ?? (accountId.trim() || "Portal User");
  const registrationDate = portalSession?.registeredAt ?? new Date("2026-05-31T00:00:00.000Z").toISOString();

  useEffect(() => {
    document.title = portalSession ? authCopy.shellDocumentTitle : authCopy.documentTitle;
  }, [authCopy.documentTitle, authCopy.shellDocumentTitle, portalSession]);

  const currentEntitlement = useMemo(() => currentTrafficEntitlement(accountEntitlements), [accountEntitlements]);
  const selectedOrder = useMemo(() => {
    const explicitOrder = selectedOrderRef
      ? orderRows.find((row) => row.requestRef === selectedOrderRef) ?? null
      : null;
    if (explicitOrder) return explicitOrder;
    return orderRows.find((row) => row.status === "active")
      ?? orderRows.find((row) => row.status === "pending")
      ?? (currentEntitlement ? null : orderRows[0] ?? null);
  }, [currentEntitlement, orderRows, selectedOrderRef]);
  const activePaymentOrder = useMemo(
    () => activePaymentOrderRef
      ? paymentOrders.find((order) => order.orderRef === activePaymentOrderRef) ?? null
      : null,
    [activePaymentOrderRef, paymentOrders]
  );
  const paymentFlowActive = activeView === "orders" && Boolean(activePaymentOrder);
  const created = useMemo(() => createdSubscriptionFromOrder(selectedOrder), [selectedOrder]);
  const lifecycle = resolveLifecycle(created);
  const walletFirstCurrentResource = commerceModel === "wallet_first_unique_v1"
    ? walletFirstResource
    : null;
  const shellNavItems = useMemo(() => localizedNavItems(locale), [locale]);
  const shellNavGroups = useMemo(() => localizedNavGroups(locale).map((group) => ({
    ...group,
    items: shellNavItems.filter((item) => group.itemIds.includes(item.id))
  })), [locale, shellNavItems]);
  const activeViewCopy = useMemo(() => localizedPortalViewCopy(activeView, locale), [activeView, locale]);
  const trafficSummary = useMemo(() => aggregateTrafficUsage(orderRows, accountEntitlements), [orderRows, accountEntitlements]);
  const trafficPercent = aggregateTrafficPercent(trafficSummary);
  const hasSetupAccess = orderRows.some((row) => row.status === "active")
    || accountEntitlements.some((entitlement) => usableTrafficEntitlement(entitlement));
  const filteredOrderRows = useMemo(() => {
    const search = orderSearch.trim().toLowerCase();
    const filtered = orderRows.filter((row) => {
      const matchesStatus = orderStatusFilter === "all" || row.status === orderStatusFilter;
      const matchesClient = orderClientFilter === "all" || row.clientTarget === orderClientFilter;
      const searchable = [
        orderNumber(row.requestRef),
        row.requestRef,
        selectedPlan(row.planId, locale).label,
        clientTargetLabel(row.clientTarget),
        orderStatusLabel(row.status, locale)
      ].join(" ").toLowerCase();
      return matchesStatus && matchesClient && (!search || searchable.includes(search));
    });
    return [...filtered].sort((left, right) => {
      if (orderSort === "oldest") return left.createdAt.localeCompare(right.createdAt);
      if (orderSort === "expires") return left.expiresAt.localeCompare(right.expiresAt);
      return right.createdAt.localeCompare(left.createdAt);
    });
  }, [locale, orderClientFilter, orderRows, orderSearch, orderSort, orderStatusFilter]);

  const walletModel = usePortalWalletReadModel({
    client: portalClient.wallet ?? null,
    sessionRef: portalSession?.sessionRef ?? null,
    sessionGeneration,
    loadLedger: activeView === "wallet",
    onSessionInvalid: logout
  });
  const rechargePaymentRedirect = useCallback((url: string) => {
    try {
      if (portalSession && readPortalRechargeReturn()) {
        window.sessionStorage.setItem(
          PORTAL_PAYMENT_RETURN_SESSION_STORAGE_KEY,
          JSON.stringify(portalSession)
        );
      }
    } catch {
      // The durable order remains recoverable after a normal login.
    }
    paymentRedirect(url);
  }, [paymentRedirect, portalSession]);
  const rechargeModel = usePortalRecharge({
    client: portalClient.recharge ?? null,
    enabled: activeView === "wallet",
    sessionRef: portalSession?.sessionRef ?? null,
    sessionGeneration,
    onSessionInvalid: logout,
    onWalletMutation: walletModel.refreshWallet,
    paymentRedirect: rechargePaymentRedirect
  });
  const authoritativeWalletBalance =
    walletModel.summary.phase === "ready"
    || walletModel.summary.phase === "empty"
      ? walletModel.summary.value.spendableUnits
      : null;

  const refreshHumanChallenge = useCallback(async () => {
    setHumanChallengeLoading(true);
    setHumanChallengeReady(false);
    try {
      const nextChallenge = await portalClient.issueHumanChallenge({ scope: "portal_login" });
      setHumanChallenge(nextChallenge);
      setHumanChallengeReady(Boolean(nextChallenge.challengeId.trim()));
      setRobotAnswer("");
    } catch (requestError) {
      setHumanChallenge(createPendingHumanVerificationChallenge("校验加载失败，请刷新页面"));
      setAuthError(portalUiErrorMessage(requestError, "防机器人校验加载失败。", locale));
    } finally {
      setHumanChallengeLoading(false);
    }
  }, [portalClient, locale]);

  useEffect(() => {
    void refreshHumanChallenge();
  }, [refreshHumanChallenge]);

  const hydratePortalSession = useCallback((
    session: PortalSession,
    destination: PortalView = readPortalRechargeReturn() ? "wallet" : "start"
  ) => {
    const hydrateGeneration = advanceSessionGeneration();
    clearWalletFirstSetupIdempotencyKey();
    setWalletFirstResource(null);
    const isCurrent = () => hydrateGeneration === sessionGenerationRef.current;
    const promise = (async () => {
      let resolvedCommerceModel: PortalCommerceModel = "legacy";
      if (portalClient.commerceModel) {
        if (!session.sessionRef?.trim()) {
          throw new Error("用户会话无效。");
        }
        resolvedCommerceModel = await portalClient.commerceModel.getCommerceModel({
          sessionRef: session.sessionRef
        });
        if (
          resolvedCommerceModel !== "legacy"
          && resolvedCommerceModel !== "wallet_first_unique_v1"
        ) {
          throw new Error("账户资源模型无效。");
        }
      }
      if (!isCurrent()) return;
      const walletFirst = resolvedCommerceModel === "wallet_first_unique_v1";
      let portalState: PortalUserState;
      let hydratedWalletFirstResource: PortalCurrentResource | null = null;
      if (walletFirst) {
        if (!portalClient.fetchSecurityState || !portalClient.fetchCurrentResource) {
          throw new Error("账户资源状态不可用。");
        }
        const [security, currentResource] = await Promise.all([
          portalClient.fetchSecurityState({ sessionRef: session.sessionRef! }),
          portalClient.fetchCurrentResource({ sessionRef: session.sessionRef! })
        ]);
        portalState = walletFirstNeutralPortalState(
          session,
          security
        );
        hydratedWalletFirstResource = currentResource;
      } else {
        portalState = await portalClient.fetchCurrentState({
          userRef: session.userRef,
          sessionRef: session.sessionRef
        });
      }
      if (!isCurrent()) return;
      const accountEntitlementRows = portalState.accountEntitlements ?? [];
      const entitlementPlan = [...accountEntitlementRows]
        .reverse()
        .filter((entitlement) => usableTrafficEntitlement(entitlement))
        .map((entitlement) => planIdFromEntitlement(entitlement))
        .find((planId): planId is PortalPlanId => Boolean(planId && planId !== "trial"));
      const subscriptionRequests = portalState.subscriptionRequests?.length
        ? portalState.subscriptionRequests
        : portalState.subscriptionRequest
          ? [portalState.subscriptionRequest]
          : [];
      let hydratedPaymentOrders = portalState.paymentOrders ?? [];
      if (!walletFirst && !hydratedPaymentOrders.length) {
        try {
          hydratedPaymentOrders = await portalClient.fetchPaymentOrders({
            userRef: session.userRef,
            sessionRef: session.sessionRef
          });
        } catch {
          if (!isCurrent()) return;
          hydratedPaymentOrders = [];
        }
      }
      if (!isCurrent()) return;
      setPortalSession(session);
      setCommerceModel(resolvedCommerceModel);
      setWalletFirstResource(hydratedWalletFirstResource);
      setSecondFactorChallenge(null);
      setSecondFactorCode("");
      setPasskeyProof("");
      setSecondFactorError("");
      setSecondFactorPending(false);
      setAuthenticatorBound(portalState.security?.authenticatorBound ?? false);
      setPasskeyExported(portalState.security?.passkeyExported ?? false);
      setSecuritySetupRequired(portalState.security?.setupRequired ?? false);
      setAccountEntitlements(accountEntitlementRows);
      setPaymentOrders([...hydratedPaymentOrders].sort((left, right) => right.createdAt.localeCompare(left.createdAt)));
      setLastPaymentOrderRef(hydratedPaymentOrders[0]?.orderRef ?? null);
      if (subscriptionRequests.length > 0) {
        const orders = subscriptionRequests
          .map((request) => subscriptionRequestToOrder(request))
          .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
        const selected = orders.find((order) => order.requestRef === portalState.subscriptionRequest?.requestRef)
          ?? orders[0];
        const selectedOrderCanDriveSetup = selected.status === "active" || selected.status === "pending";
        setSelectedPlanId(selectedOrderCanDriveSetup ? selected.planId : entitlementPlan ?? selected.planId);
        setClientTarget(selected.clientTarget);
        setOrderRows(orders);
        setSelectedOrderRef(selectedOrderCanDriveSetup || !entitlementPlan ? selected.requestRef : null);
      } else {
        setOrderRows([]);
        setSelectedOrderRef(null);
        if (entitlementPlan) {
          setSelectedPlanId(entitlementPlan);
        }
      }
      setHistorySummary(portalState.historySummary ?? subscriptionRequests.flatMap((request) => request.historySummary ?? []));
      setActivePaymentOrderRef(null);
      setOrderCenterFilter("all");
      setActiveView(destination);
    })();
    return { isCurrent, promise };
  }, [
    advanceSessionGeneration,
    clearWalletFirstSetupIdempotencyKey,
    portalClient
  ]);

  useEffect(() => {
    if (!initialSession || portalSession) return;
    const hydration = hydratePortalSession(initialSession);
    void hydration.promise.catch((caughtError) => {
      if (!hydration.isCurrent()) return;
      setAuthError(portalUiErrorMessage(caughtError, "本地预览会话载入失败，请重新登录。", locale));
    });
  }, [initialSession, portalSession, hydratePortalSession, locale]);

  useEffect(() => {
    if (portalSession) return;
    const paymentReturnSession = window.sessionStorage.getItem(
      PORTAL_PAYMENT_RETURN_SESSION_STORAGE_KEY
    );
    const registrationSession = window.sessionStorage.getItem(
      PORTAL_REGISTRATION_SESSION_STORAGE_KEY
    );
    const rawSession = paymentReturnSession ?? registrationSession;
    if (!rawSession) return;
    const storageKey = paymentReturnSession
      ? PORTAL_PAYMENT_RETURN_SESSION_STORAGE_KEY
      : PORTAL_REGISTRATION_SESSION_STORAGE_KEY;
    window.sessionStorage.removeItem(storageKey);
    const failureMessage = paymentReturnSession
      ? "支付返回会话载入失败，请重新登录后查看充值订单。"
      : "注册会话载入失败，请重新登录。";
    try {
      const session = JSON.parse(rawSession) as PortalSession;
      if (
        !session
        || typeof session.userRef !== "string"
        || (paymentReturnSession && typeof session.sessionRef !== "string")
      ) {
        throw new Error("invalid stored session");
      }
      const hydration = hydratePortalSession(session);
      void hydration.promise.catch((caughtError) => {
        if (!hydration.isCurrent()) return;
        setAuthError(portalUiErrorMessage(caughtError, failureMessage, locale));
      });
    } catch {
      setAuthError(failureMessage);
    }
  }, [portalSession, hydratePortalSession, locale]);

  async function submitAuth(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAuthError("");
    setSecondFactorError("");
    setPending(true);
    let hydrationIsCurrent: (() => boolean) | null = null;
    try {
      if (!humanChallengeReady || humanChallengeLoading) {
        throw new Error("防机器人校验尚未加载，请稍后重试。");
      }
      const humanVerification = buildHumanVerification(humanChallenge, robotAnswer, robotTrap);
      const result = await portalClient.authenticate({
        mode: "password",
        accountId,
        password,
        humanVerification
      });
      setPassword("");
      if (isSecondFactorChallenge(result)) {
        setSecondFactorChallenge(result);
        setSecondFactorCode("");
        return;
      }
      const hydration = hydratePortalSession(result);
      hydrationIsCurrent = hydration.isCurrent;
      await hydration.promise;
    } catch (requestError) {
      if (hydrationIsCurrent && !hydrationIsCurrent()) return;
      setAuthError(portalUiErrorMessage(requestError, "操作失败。", locale));
      setRobotAnswer("");
      void refreshHumanChallenge();
    } finally {
      if (!hydrationIsCurrent || hydrationIsCurrent()) {
        setPending(false);
      }
    }
  }

  async function submitAuthenticatorSecondFactor(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!secondFactorChallenge) return;
    setSecondFactorError("");
    setSecondFactorPending(true);
    let hydrationIsCurrent: (() => boolean) | null = null;
    try {
      const session = await portalClient.completeSecondFactor({
        challengeRef: secondFactorChallenge.challengeRef,
        factor: "authenticator",
        totpCode: secondFactorCode
      });
      const hydration = hydratePortalSession(session);
      hydrationIsCurrent = hydration.isCurrent;
      await hydration.promise;
    } catch (requestError) {
      if (hydrationIsCurrent && !hydrationIsCurrent()) return;
      setSecondFactorError(portalUiErrorMessage(requestError, "二次验证失败。", locale));
      setSecondFactorCode("");
    } finally {
      if (!hydrationIsCurrent || hydrationIsCurrent()) {
        setSecondFactorPending(false);
      }
    }
  }

  async function submitPasskeySecondFactor(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!secondFactorChallenge) return;
    setSecondFactorError("");
    setSecondFactorPending(true);
    let hydrationIsCurrent: (() => boolean) | null = null;
    try {
      const session = await portalClient.completeSecondFactor({
        challengeRef: secondFactorChallenge.challengeRef,
        factor: "passkey",
        passkeyProof
      });
      const hydration = hydratePortalSession(session);
      hydrationIsCurrent = hydration.isCurrent;
      await hydration.promise;
    } catch (requestError) {
      if (hydrationIsCurrent && !hydrationIsCurrent()) return;
      setSecondFactorError(portalUiErrorMessage(requestError, "通行密钥验证失败。", locale));
      setPasskeyProof("");
    } finally {
      if (!hydrationIsCurrent || hydrationIsCurrent()) {
        setSecondFactorPending(false);
      }
    }
  }

  function returnToPasswordLogin() {
    setSecondFactorChallenge(null);
    setSecondFactorCode("");
    setPasskeyProof("");
    setSecondFactorError("");
    setSecondFactorPending(false);
    setRobotAnswer("");
    setRobotTrap("");
    void refreshHumanChallenge();
  }

  async function submitSubscription(
    planIdOverride?: Exclude<PortalPlanId, "trial">,
    paymentChannelOverride?: PortalPaymentChannel
  ): Promise<boolean> {
    setActionError("");
    setCopiedOrderRef(null);
    if (commerceModel === "wallet_first_unique_v1") {
      setActionError(uiText(
        locale,
        "此账户使用 Coins 服务资源模型；请先查看当前资源状态。",
        "This account uses the Coins service-resource model; check the current resource status first."
      ));
      setActiveView("start");
      return false;
    }
    const planId: Exclude<PortalPlanId, "trial"> = planIdOverride
      ?? (selectedPlanId === "trial" ? "monthly_basic" : selectedPlanId as Exclude<PortalPlanId, "trial">);

    setPending(true);
    try {
      const userRef = portalSession?.userRef ?? "";
      const paymentDevice = paymentDeviceForCurrentBrowser();
      const checkoutChannel = paymentChannelOverride ?? paymentChannel;
      const checkout = await portalClient.createPaymentCheckout({
        userRef,
        sessionRef: portalSession?.sessionRef,
        planId: planId as Exclude<PortalPlanId, "trial">,
        clientTarget,
        channel: checkoutChannel,
        device: paymentDevice
      });
      setPaymentOrders((rows) => upsertPaymentOrder(rows, checkout.order));
      setLastPaymentOrderRef(checkout.order.orderRef);
      setSelectedPlanId(planId);
      setOrderFormOpen(false);
      setActiveView("orders");
      setActivePaymentOrderRef(checkout.order.orderRef);
      const redirectUrl = paymentRedirectUrl(checkout.order);
      if (redirectUrl && shouldRedirectToPaymentProvider()) {
        paymentRedirect(redirectUrl);
      }
      return true;
    } catch (requestError) {
      setActionError(portalUiErrorMessage(requestError, "操作失败。", locale));
      return false;
    } finally {
      setPending(false);
    }
  }

  const revealOrCreateSubscriptionLink = useCallback(async (
    clientTargetOverride: PortalClientId,
    options: { refreshExisting?: boolean } = {}
  ): Promise<string | null> => {
    if (commerceModel === "wallet_first_unique_v1") {
      setActionError(uiText(
        locale,
        "此账户的服务资源状态仅可通过当前资源读取确认。",
        "This account's service-resource status can only be confirmed through the current-resource read."
      ));
      setActiveView("start");
      return null;
    }
    if (!portalSession) return null;
    setActionError("");
    setCopiedOrderRef(null);
    setPending(true);
    try {
      if (selectedOrder?.status === "active") {
        let revealed: PortalSubscriptionRequest;
        if (options.refreshExisting) {
          revealed = await portalClient.refreshSubscription({
            userRef: portalSession.userRef,
            sessionRef: portalSession.sessionRef,
            requestRef: selectedOrder.requestRef,
            clientTarget: clientTargetOverride
          });
        } else if (selectedOrder.request.subscriptionUrl) {
          revealed = selectedOrder.request;
        } else {
          revealed = await portalClient.revealSubscription({
            userRef: portalSession.userRef,
            sessionRef: portalSession.sessionRef,
            requestRef: selectedOrder.requestRef
          });
        }
        if (!revealed.subscriptionUrl) {
          throw new Error(uiText(locale, "订阅链接正在生成，请稍后再试。", "Your connection link is being prepared. Try again shortly."));
        }
        const nextOrder = subscriptionRequestToOrder(revealed, {
          durationDays: selectedOrder.durationDays,
          quantity: selectedOrder.quantity
        });
        setOrderRows((rows) => upsertOrderRow(rows, nextOrder));
        setSelectedOrderRef(nextOrder.requestRef);
        setHistorySummary(revealed.historySummary ?? historySummary);
        return revealed.subscriptionUrl;
      }
      const entitlementPlanId = setupPlanIdFromEntitlement(currentEntitlement);
      const basePlanId = entitlementPlanId ?? selectedOrder?.planId ?? selectedPlanId;
      const planId = basePlanId === "trial" ? "monthly_basic" : basePlanId;
      const durationDays = durationDaysForPlan(planId);
      const quantity = 1;
      let result = await portalClient.applyForSubscription({
        userRef: portalSession.userRef,
        sessionRef: portalSession.sessionRef,
        planId,
        clientTarget: clientTargetOverride,
        durationDays,
        quantity
      });
      if (result.lifecycle === "active" && !result.subscriptionUrl) {
        result = await portalClient.revealSubscription({
          userRef: portalSession.userRef,
          sessionRef: portalSession.sessionRef,
          requestRef: result.requestRef
        });
      }
      const order = subscriptionRequestToOrder(result, { durationDays, quantity });
      setOrderRows((rows) => upsertOrderRow(rows, order));
      setSelectedOrderRef(order.requestRef);
      setSelectedPlanId(order.planId);
      setClientTarget(order.clientTarget);
      setHistorySummary(result.historySummary ?? historySummary);
      if (result.lifecycle !== "active" || !result.subscriptionUrl) {
        throw new Error(uiText(locale, "订阅链接正在生成，请稍后再试。", "Your connection link is being prepared. Try again shortly."));
      }
      return result.subscriptionUrl;
    } catch (requestError) {
      setActionError(portalUiErrorMessage(requestError, "生成订阅链接失败。", locale));
      return null;
    } finally {
      setPending(false);
    }
  }, [commerceModel, currentEntitlement, historySummary, locale, portalClient, portalSession, selectedOrder, selectedPlanId]);

  function viewOrder(order: PortalOrderRow) {
    setActivePaymentOrderRef(null);
    setLastPaymentOrderRef(null);
    setSelectedOrderRef(order.requestRef);
    setSelectedPlanId(order.planId);
    setClientTarget(order.clientTarget);
  }

  function openMarketplace() {
    setActionError("");
    setOrderFormOpen(false);
    setActivePaymentOrderRef(null);
    setActiveView("marketplace");
  }

  function closeOrderForm() {
    if (pending) return;
    setOrderFormOpen(false);
    setActionError("");
  }

  function openPaymentOrder(order: PortalPaymentOrder) {
    setActionError("");
    setOrderFormOpen(false);
    setLastPaymentOrderRef(order.orderRef);
    setActiveView("orders");
    setActivePaymentOrderRef(order.orderRef);
    const redirectUrl = paymentRedirectUrl(order);
    if (redirectUrl && shouldRedirectToPaymentProvider()) {
      paymentRedirect(redirectUrl);
    }
  }

  function navigatePortalView(view: PortalView) {
    setActivePaymentOrderRef(null);
    setOrderCenterFilter("all");
    if (view === "profile") {
      setPersonalCenterSubview("profile");
    }
    setActiveView(view);
  }

  function navigatePortalOrderFilter(filter: PortalOrdersFilter) {
    setActivePaymentOrderRef(null);
    setOrderCenterFilter(filter);
    setActiveView("orders");
  }

  async function refreshPaymentOrders(targetOrderRef?: string) {
    if (!portalSession) return;
    setActionError("");
    setPending(true);
    try {
      const refreshedOrders = await portalClient.fetchPaymentOrders({
        userRef: portalSession.userRef,
        sessionRef: portalSession.sessionRef
      });
      setPaymentOrders((rows) => {
        const byRef = new Map(rows.map((order) => [order.orderRef, order]));
        for (const order of refreshedOrders) byRef.set(order.orderRef, order);
        return [...byRef.values()].sort((left, right) => right.createdAt.localeCompare(left.createdAt));
      });
      if (targetOrderRef) {
        setActivePaymentOrderRef(targetOrderRef);
        setLastPaymentOrderRef(targetOrderRef);
      }
    } catch (requestError) {
      setActionError(portalUiErrorMessage(requestError, "支付状态刷新失败。", locale));
    } finally {
      setPending(false);
    }
  }

  async function submitSupportRequest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!portalSession) return;
    setSupportError("");
    setSupportPending(true);
    try {
      const result = await portalClient.submitSupportRequest({
        userRef: portalSession.userRef,
        sessionRef: portalSession.sessionRef,
        category: supportCategory,
        message: supportMessage,
        clientTarget,
        subscriptionRequestRef: created?.request.requestRef
      });
      setSupportResult(result);
      setSupportMessage("");
    } catch (requestError) {
      setSupportError(portalUiErrorMessage(requestError, "问题提交失败。", locale));
    } finally {
      setSupportPending(false);
    }
  }

  async function startAuthenticatorEnrollment() {
    if (!portalSession) return;
    setAuthenticatorError("");
    setAuthenticatorCode("");
    setAuthenticatorPending(true);
    try {
      setAuthenticatorEnrollment(await portalClient.startAuthenticatorEnrollment({
        userRef: portalSession.userRef,
        sessionRef: portalSession.sessionRef
      }));
    } catch (requestError) {
      setAuthenticatorError(portalUiErrorMessage(requestError, "身份验证器绑定失败。", locale));
    } finally {
      setAuthenticatorPending(false);
    }
  }

  async function confirmAuthenticatorEnrollment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!portalSession || !authenticatorEnrollment) return;
    setAuthenticatorError("");
    setAuthenticatorPending(true);
    try {
      await portalClient.confirmAuthenticatorEnrollment({
        userRef: portalSession.userRef,
        sessionRef: portalSession.sessionRef,
        enrollmentRef: authenticatorEnrollment.enrollmentRef,
        totpCode: authenticatorCode
      });
      setAuthenticatorBound(true);
      setSecuritySetupRequired((current) => current && !passkeyExported);
      setAuthenticatorEnrollment(null);
      setAuthenticatorCode("");
    } catch (requestError) {
      setAuthenticatorError(portalUiErrorMessage(requestError, "身份验证器绑定失败。", locale));
    } finally {
      setAuthenticatorPending(false);
    }
  }

  async function exportPasskey() {
    if (!portalSession) return;
    setPasskeyError("");
    setPasskeyPending(true);
    try {
      const passkeyExport = await portalClient.exportPasskey({ userRef: portalSession.userRef });
      downloadPasskeyExport(passkeyExport);
      setPasskeyExported(true);
      setSecuritySetupRequired((current) => current && !authenticatorBound);
    } catch (requestError) {
      setPasskeyError(portalUiErrorMessage(requestError, "通行密钥导出失败。", locale));
    } finally {
      setPasskeyPending(false);
    }
  }

  function closeAuthenticatorEnrollment() {
    if (authenticatorPending) return;
    setAuthenticatorEnrollment(null);
    setAuthenticatorCode("");
    setAuthenticatorError("");
  }

  function logout() {
    advanceSessionGeneration();
    clearWalletFirstSetupIdempotencyKey();
    try {
      window.sessionStorage.removeItem(PORTAL_COIN_ORDER_STORAGE_KEY);
      window.sessionStorage.removeItem(PORTAL_PAYMENT_RETURN_SESSION_STORAGE_KEY);
      clearPortalRechargeReturn();
    } catch {
      // Commerce recovery storage is optional; logout must still complete.
    }
    setPortalSession(null);
    setCommerceModel(null);
    setAccountId("");
    setPassword("");
    setRobotAnswer("");
    setRobotTrap("");
    setHumanChallenge(createPendingHumanVerificationChallenge());
    setHumanChallengeReady(false);
    setHumanChallengeLoading(true);
    void refreshHumanChallenge();
    setActiveView("dashboard");
    setPersonalCenterSubview("profile");
    setSelectedPlanId("monthly_basic");
    setClientTarget("clash");
    setOrderRows([]);
    setAccountEntitlements([]);
    setWalletFirstResource(null);
    setPaymentOrders([]);
    setLastPaymentOrderRef(null);
    setOrderStatusFilter("all");
    setOrderSearch("");
    setOrderClientFilter("all");
    setOrderSort("newest");
    setOrderFormOpen(false);
    setSelectedOrderRef(null);
    setAuthError("");
    setActionError("");
    setPending(false);
    setCopiedOrderRef(null);
    setHistorySummary([]);
    setAuthenticatorBound(false);
    setAuthenticatorEnrollment(null);
    setAuthenticatorCode("");
    setAuthenticatorError("");
    setAuthenticatorPending(false);
    setPasskeyExported(false);
    setPasskeyPending(false);
    setPasskeyError("");
    setSecuritySetupRequired(false);
    setSecondFactorChallenge(null);
    setSecondFactorCode("");
    setPasskeyProof("");
    setSecondFactorError("");
    setSecondFactorPending(false);
    setSupportCategory("client_import");
    setSupportMessage("");
    setSupportPending(false);
    setSupportError("");
    setSupportResult(null);
  }

  if (!portalSession && secondFactorChallenge) {
    const hasAuthenticator = secondFactorChallenge.availableFactors.includes("authenticator");
    const hasPasskey = secondFactorChallenge.availableFactors.includes("passkey");
    return (
      <main className="portal-login-shell portal-login-shell-factor" data-portal-theme={theme}>
        <aside className="portal-login-side" aria-hidden="true">
          <div className="portal-login-brand">
            <span className="portal-login-logo"><ShieldCheck aria-hidden="true" /></span>
            <strong>GCC WebOS</strong>
          </div>
          <div className="portal-login-side-copy">
            <h2>{authCopy.welcomeTitle}</h2>
            <p>{authCopy.welcomeDescription}</p>
            <ul>
              {authCopy.trustItems.map((item) => (
                <li key={item}><span />{item}</li>
              ))}
            </ul>
          </div>
          <p className="portal-login-support">Need help? support@gccwebos.com</p>
        </aside>

        <section className="portal-login-main" aria-label={authCopy.secondFactorAria}>
          <PublicPreferenceSwitch
            ariaLabel={authCopy.preferences}
            localeAriaLabel={authCopy.language}
            themeAriaLabel={authCopy.theme}
            locale={locale}
            theme={theme}
            onLocaleChange={setLocale}
            onThemeChange={setTheme}
          />
          <div className="portal-login-form-card portal-login-factor-card">
            <div className="portal-login-icon"><ShieldCheck aria-hidden="true" /></div>
            <div className="portal-login-header">
              <h1>{authCopy.secondFactorTitle}</h1>
              <p>{authCopy.secondFactorDescription}</p>
            </div>

            {hasAuthenticator ? (
              <form className="portal-login-form" onSubmit={submitAuthenticatorSecondFactor}>
                <label htmlFor="portal-second-factor-code">{authCopy.authenticatorCode}</label>
                <input
                  id="portal-second-factor-code"
                  value={secondFactorCode}
                  onChange={(event) => setSecondFactorCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  placeholder="000000"
                  required
                />
                <button
                  className="portal-login-submit"
                  type="submit"
                  disabled={secondFactorPending || secondFactorCode.length !== 6}
                >
                  {secondFactorPending ? authCopy.verifying : authCopy.verifyAuthenticator}
                </button>
              </form>
            ) : null}

            <div className="portal-second-factor-actions portal-login-factor-actions">
              {hasPasskey ? (
                <form className="portal-passkey-form portal-login-passkey-form" onSubmit={submitPasskeySecondFactor}>
                  <label htmlFor="portal-passkey-proof">{authCopy.passkeyBackup}</label>
                  <textarea
                    id="portal-passkey-proof"
                    value={passkeyProof}
                    onChange={(event) => setPasskeyProof(event.target.value)}
                    autoComplete="off"
                    placeholder={authCopy.passkeyPlaceholder}
                    required
                  />
                  <button
                    className="portal-login-secondary"
                    type="submit"
                    disabled={secondFactorPending || !passkeyProof.trim()}
                  >
                    {secondFactorPending ? authCopy.verifying : authCopy.usePasskey}
                  </button>
                </form>
              ) : null}
              <button className="portal-login-link-button" type="button" disabled={secondFactorPending} onClick={returnToPasswordLogin}>
                {authCopy.returnToLogin}
              </button>
            </div>

            {secondFactorError ? <div className="alert alert-error portal-login-error">{secondFactorError}</div> : null}
          </div>
        </section>
      </main>
    );
  }

  if (!portalSession) {
    const canSubmitPasswordLogin = humanChallengeReady && !humanChallengeLoading;
    return (
      <main className="portal-login-shell" data-portal-theme={theme}>
        <aside className="portal-login-side" aria-hidden="true">
          <div className="portal-login-brand">
            <span className="portal-login-logo"><ShieldCheck aria-hidden="true" /></span>
            <strong>GCC WebOS</strong>
          </div>
          <div className="portal-login-side-copy">
            <h2>{authCopy.welcomeTitle}</h2>
            <p>{authCopy.welcomeDescription}</p>
            <ul>
              {authCopy.trustItems.map((item) => (
                <li key={item}><span />{item}</li>
              ))}
            </ul>
          </div>
          <p className="portal-login-support">Need help? support@gccwebos.com</p>
        </aside>

        <section className="portal-login-main" aria-label={authCopy.loginAria}>
          <PublicPreferenceSwitch
            ariaLabel={authCopy.preferences}
            localeAriaLabel={authCopy.language}
            themeAriaLabel={authCopy.theme}
            locale={locale}
            theme={theme}
            onLocaleChange={setLocale}
            onThemeChange={setTheme}
          />
          <div className="portal-login-form-card">
            <div className="portal-login-header">
              <h1>{authCopy.loginTitle}</h1>
              <p>{authCopy.loginDescription}</p>
            </div>

            <form className="portal-login-form" onSubmit={submitAuth}>
              <label htmlFor="portal-account-id">{authCopy.accountId}</label>
              <input
                id="portal-account-id"
                value={accountId}
                onChange={(event) => setAccountId(event.target.value)}
                autoComplete="username"
                placeholder={authCopy.accountPlaceholder}
                required
              />

              <label htmlFor="portal-password">{authCopy.password}</label>
              <div className="portal-login-password-field">
                <input
                  id="portal-password"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  autoComplete="current-password"
                  placeholder={authCopy.passwordPlaceholder}
                  required
                />
                <button
                  type="button"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  onClick={() => setShowPassword((visible) => !visible)}
                >
                  <Eye aria-hidden="true" />
                </button>
              </div>

              <div className="portal-login-challenge">
                <label htmlFor="portal-robot-check">{authCopy.robot}</label>
                <div className="portal-login-challenge-row">
                  <span className="portal-login-challenge-prompt">
                    {humanChallengeLoading ? authCopy.robotLoading : humanChallenge.prompt}
                  </span>
                  <input
                    id="portal-robot-check"
                    value={robotAnswer}
                    onChange={(event) => setRobotAnswer(event.target.value)}
                    inputMode="numeric"
                    autoComplete="off"
                    placeholder={humanChallengeLoading ? authCopy.robotLoading : humanChallenge.prompt}
                    disabled={!canSubmitPasswordLogin || pending}
                    required
                  />
                </div>
              </div>

              <label className="portal-honeypot" htmlFor="portal-company">{authCopy.honeypot}</label>
              <input
                id="portal-company"
                name="portal-company"
                className="portal-honeypot"
                value={robotTrap}
                onChange={(event) => setRobotTrap(event.target.value)}
                autoComplete="off"
                tabIndex={-1}
                aria-hidden="true"
              />

              <div className="portal-login-meta">
                <label className="portal-login-remember">
                  <input
                    type="checkbox"
                    checked={rememberAccount}
                    onChange={(event) => setRememberAccount(event.target.checked)}
                  />
                  <span>{authCopy.rememberMe}</span>
                </label>
                <button className="portal-login-link-button" type="button" disabled>
                  {authCopy.forgotPassword}
                </button>
              </div>

              {authError ? <div className="alert alert-error portal-login-error">{authError}</div> : null}

              <button className="portal-login-submit" type="submit" disabled={!canSubmitPasswordLogin || pending}>
                {pending ? authCopy.signingIn : humanChallengeLoading ? authCopy.loadingCheck : authCopy.signIn}
              </button>
              <p className="portal-login-register">
                <span>{authCopy.noAccount}</span>
                <a href="/portal/register/">{authCopy.registerAccount}</a>
              </p>
            </form>
          </div>
        </section>
      </main>
    );
  }

  const shouldShowSecuritySetup = Boolean(
    securitySetupRequired
    && (!authenticatorBound || !passkeyExported)
    && !authenticatorEnrollment
  );
  const renderLegacyPaymentFlow = () => (
    <SubscriptionManager
      activePaymentOrder={activePaymentOrder}
      actionError={actionError}
      orderClientFilter={orderClientFilter}
      orderFormOpen={orderFormOpen}
      orderRows={filteredOrderRows}
      paymentOrders={paymentOrders}
      lastPaymentOrderRef={lastPaymentOrderRef}
      orderSearch={orderSearch}
      orderSort={orderSort}
      orderStatusFilter={orderStatusFilter}
      paymentChannel={paymentChannel}
      selectedOrderRef={selectedOrderRef}
      selectedPlanId={selectedPlanId}
      pending={pending}
      setOrderClientFilter={setOrderClientFilter}
      setOrderSearch={setOrderSearch}
      setOrderSort={setOrderSort}
      setOrderStatusFilter={setOrderStatusFilter}
      setPaymentChannel={setPaymentChannel}
      setSelectedPlanId={setSelectedPlanId}
      closePaymentOrder={() => setActivePaymentOrderRef(null)}
      openPaymentOrder={openPaymentOrder}
      refreshPaymentOrders={refreshPaymentOrders}
      submitSubscription={submitSubscription}
      openMarketplace={openMarketplace}
      closeOrderForm={closeOrderForm}
      viewOrder={viewOrder}
      locale={locale}
    />
  );

  return (
    <>
      <div className="portal-use-shell portal-v2-shell" data-portal-theme={theme}>
        <aside className="portal-use-sidebar portal-v2-sidebar">
          <div className="portal-v2-brand">
            <span className="portal-v2-logo">
              <ShieldCheck aria-hidden="true" />
            </span>
            <div>
              <strong>GCC WebOS</strong>
              <small>{uiText(locale, "用户中心", "User center")}</small>
            </div>
          </div>

          <nav className="portal-use-nav" aria-label={uiText(locale, "用户中心导航", "User center navigation")}>
            {shellNavGroups.map((group) => (
              <div
                key={group.id}
                className="portal-nav-group"
                data-portal-nav-group={group.id}
                role="group"
                aria-labelledby={`portal-nav-group-${group.id}`}
              >
                <span className="portal-nav-group-label" id={`portal-nav-group-${group.id}`}>
                  {group.label}
                </span>
                {group.items.map((item) => {
                  const Icon = item.icon;
                  const hasOrderCategories = item.id === "orders"
                    && commerceModel !== "wallet_first_unique_v1";
                  const hasOrderDisclosure = hasOrderCategories && desktopOrderNavigation;
                  const orderCategoriesExpanded = hasOrderDisclosure && activeView === "orders";
                  const current = activeView === item.id
                    && (!hasOrderDisclosure || orderCenterFilter === "all");
                  return (
                    <Fragment key={item.id}>
                      <button
                        type="button"
                        aria-label={item.label}
                        aria-describedby={item.id === "wallet" ? "portal-wallet-nav-balance" : undefined}
                        aria-current={current ? "page" : undefined}
                        aria-expanded={hasOrderDisclosure ? orderCategoriesExpanded : undefined}
                        aria-controls={hasOrderDisclosure ? "portal-order-categories" : undefined}
                        data-portal-view={item.id}
                        className={cn("portal-use-nav-item", current && "active", hasOrderCategories && "portal-order-nav-parent")}
                        onClick={() => navigatePortalView(item.id)}
                      >
                        <Icon aria-hidden="true" />
                        <span>
                          <strong>{item.label}</strong>
                          <small>{item.description}</small>
                        </span>
                        {item.id === "wallet" ? (
                          <span className="sr-only" id="portal-wallet-nav-balance">
                            Coins · {authoritativeWalletBalance ?? "--"}
                          </span>
                        ) : null}
                        {hasOrderCategories ? <ChevronRight className="portal-order-nav-chevron" aria-hidden="true" /> : null}
                      </button>
                      {hasOrderCategories ? (
                        <div
                          id="portal-order-categories"
                          className="portal-order-subnav"
                          role="group"
                          aria-label={uiText(locale, "订单分类", "Order categories")}
                          hidden={!orderCategoriesExpanded}
                        >
                          {portalOrderNavigationItems.map((category) => {
                            const categoryCurrent = orderCategoriesExpanded && orderCenterFilter === category.id;
                            const label = uiText(locale, category.zh, category.en);
                            return (
                              <button
                                key={category.id}
                                type="button"
                                className={cn("portal-use-nav-item portal-order-nav-child", categoryCurrent && "active")}
                                aria-label={label}
                                aria-current={categoryCurrent ? "page" : undefined}
                                onClick={() => navigatePortalOrderFilter(category.id)}
                              >
                                <span><strong>{label}</strong></span>
                              </button>
                            );
                          })}
                        </div>
                      ) : null}
                    </Fragment>
                  );
                })}
              </div>
            ))}
          </nav>

          <div className="portal-user-card portal-v2-user-card portal-v2-account-card">
            <span className="portal-avatar">{userDisplayName.charAt(0).toUpperCase()}</span>
            <div>
              <strong>{userDisplayName}</strong>
              <small>{uiText(locale, "邮箱：", "Email: ")}{portalSession.userRef}</small>
            </div>
            <button
              type="button"
              className="portal-logout-button portal-v2-account-logout"
              aria-label={uiText(locale, "退出登录", "Sign out")}
              onClick={logout}
            >
              <LogOut aria-hidden="true" />
            </button>
          </div>
        </aside>

        <main className={cn(
          "portal-use-main portal-v2-main",
          paymentFlowActive && "portal-v2-main-payment"
        )}>
          {!paymentFlowActive ? (
            <>
              <header className="portal-use-topbar portal-v2-topbar">
                <div className="portal-v2-mobile-brand" aria-label="GCC WebOS">
                  <span className="portal-v2-logo">
                    <ShieldCheck aria-hidden="true" />
                  </span>
                  <strong>GCC WebOS</strong>
                </div>
                <div className="portal-v2-page-title">
                  <h1>{activeView === "dashboard" ? uiText(locale, "账户概览", "Account overview") : activeViewCopy.label}</h1>
                </div>
                <div className="portal-v2-topbar-actions">
                  <form
                    className="portal-v2-primary-actions portal-v2-global-search-form"
                    onSubmit={(event) => {
                      event.preventDefault();
                      navigatePortalView("orders");
                    }}
                  >
                    <label className="portal-v2-global-search" htmlFor="portal-global-search">
                      <Search aria-hidden="true" />
                      <span className="sr-only">{uiText(locale, "订单搜索", "Orders search")}</span>
                      <input
                        id="portal-global-search"
                        type="search"
                        aria-label={uiText(locale, "订单搜索", "Orders search")}
                        value={orderSearch}
                        onChange={(event) => setOrderSearch(event.target.value)}
                        placeholder={uiText(locale, "搜索订单、套餐或状态", "Search orders, plans, or status")}
                      />
                    </label>
                  </form>
                  <div className="portal-v2-utility-actions" aria-label={uiText(locale, "快速操作", "Quick actions")}>
                    <button
                      type="button"
                      className={cn("portal-v2-mobile-icon-button", activeView === "support" && "active")}
                      aria-label={uiText(locale, "打开支持", "Open support")}
                      onClick={() => navigatePortalView("support")}
                    >
                      <Headphones aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      className="portal-v2-mobile-icon-button"
                      aria-label={uiText(locale, "退出", "Sign out from mobile header")}
                      onClick={logout}
                    >
                      <LogOut aria-hidden="true" />
                    </button>
                  </div>
                </div>
              </header>
              <div className="portal-v2-mobile-title">
                <h1>{activeView === "dashboard" ? uiText(locale, "概览", "Dashboard") : activeViewCopy.label}</h1>
              </div>
            </>
          ) : null}

          {activeView === "dashboard" ? (
            walletFirstCurrentResource ? (
              <WalletFirstCurrentResourceStatus
                resource={walletFirstCurrentResource}
                locale={locale}
                onOpenMarketplace={openMarketplace}
              />
            ) : (
              <DashboardPanel
                created={created}
                lifecycle={lifecycle}
                orderRows={orderRows}
                currentEntitlement={currentEntitlement}
                selectedOrder={selectedOrder}
                setActiveView={setActiveView}
                trafficPercent={trafficPercent}
                trafficSummary={trafficSummary}
                locale={locale}
              />
            )
          ) : null}
          {activeView === "usage" ? (
            walletFirstCurrentResource ? (
              <WalletFirstCurrentResourceStatus
                resource={walletFirstCurrentResource}
                locale={locale}
                onOpenMarketplace={openMarketplace}
              />
            ) : (
              <UsagePanel
                orderRows={orderRows}
                currentEntitlement={currentEntitlement}
                setActiveView={setActiveView}
                openMarketplace={openMarketplace}
                trafficPercent={trafficPercent}
                trafficSummary={trafficSummary}
                locale={locale}
              />
            )
          ) : null}
          {activeView === "marketplace" ? (
            <MarketplacePanel
              commerceClient={portalClient.commerce ?? null}
              commerceModelClient={portalClient.commerceModel ?? null}
              locale={locale}
              onOpenWallet={() => setActiveView("wallet")}
              onWalletMutation={walletModel.refreshWallet}
              sessionGeneration={sessionGeneration}
              sessionRef={portalSession.sessionRef ?? null}
              theme={theme}
              walletFirstCommerceClient={portalClient.walletFirstCommerce ?? null}
            />
          ) : null}
          {activeView === "wallet" ? (
            <PortalWalletPanel
              locale={locale}
              model={walletModel}
              rechargeModel={rechargeModel}
            />
          ) : null}
          {activeView === "referrals" ? <ReferralRewardsPanel locale={locale} /> : null}
          {activeView === "start" ? (
            <UseGuide
              key={portalSession.sessionRef ?? "portal-session-none"}
              actionError={actionError}
              copiedOrderRef={copiedOrderRef}
              created={created}
              locale={locale}
              pending={pending}
              selectedOrder={selectedOrder}
              hasSetupAccess={hasSetupAccess}
              walletFirstResource={walletFirstResource}
              nextWalletFirstSetupIdempotencyKey={nextWalletFirstSetupIdempotencyKey}
              clearWalletFirstSetupIdempotencyKey={clearWalletFirstSetupIdempotencyKey}
              portalClient={portalClient}
              sessionRef={portalSession.sessionRef}
              setActiveView={setActiveView}
              openMarketplace={openMarketplace}
              revealOrCreateSubscriptionLink={revealOrCreateSubscriptionLink}
            />
          ) : null}
          {activeView === "support" ? (
            <SupportPanel
              category={supportCategory}
              message={supportMessage}
              pending={supportPending}
              error={supportError}
              result={supportResult}
              setCategory={setSupportCategory}
              setMessage={setSupportMessage}
              resetSupportRequest={() => {
                setSupportResult(null);
                setSupportError("");
                setSupportMessage("");
              }}
              submitSupportRequest={submitSupportRequest}
              locale={locale}
            />
          ) : null}
          {activeView === "orders" && commerceModel === "wallet_first_unique_v1" ? (
            walletFirstCurrentResource ? (
              <WalletFirstCurrentResourceStatus
                resource={walletFirstCurrentResource}
                locale={locale}
                onOpenMarketplace={openMarketplace}
              />
            ) : (
              <WalletFirstOrdersNotice
                locale={locale}
                onOpenMarketplace={openMarketplace}
              />
            )
          ) : activeView === "orders" && paymentFlowActive ? renderLegacyPaymentFlow() : null}
          {activeView === "orders" && commerceModel !== "wallet_first_unique_v1" && !paymentFlowActive ? (
            <PortalOrdersPanel
              filter={orderCenterFilter}
              onFilterChange={setOrderCenterFilter}
              commerceClient={portalClient.commerce ?? null}
              rechargeClient={portalClient.recharge ?? null}
              legacyPaymentOrders={paymentOrders}
              locale={locale}
              onOpenMarketplace={openMarketplace}
              onOpenServiceOrder={viewOrder}
              onOrderSearchChange={setOrderSearch}
              onSessionInvalid={logout}
              onContinueRechargeOrder={rechargeModel.continueOrderPayment}
              orderSearch={orderSearch}
              selectedServiceOrderRef={selectedOrderRef}
              serviceOrders={orderRows}
              sessionGeneration={sessionGeneration}
              sessionRef={portalSession.sessionRef ?? null}
            />
          ) : null}
          {activeView === "settings" ? (
            <section
              className="portal-use-card portal-v2-settings-panel"
              aria-labelledby="portal-settings-heading"
            >
              <div className="portal-section-heading">
                <Settings aria-hidden="true" />
                <div>
                  <span className="portal-card-label">{uiText(locale, "设置", "Settings")}</span>
                  <h2 id="portal-settings-heading">{uiText(locale, "显示偏好", "Display preferences")}</h2>
                  <p>{uiText(locale, "管理用户中心的界面语言和显示主题。", "Manage the User Center language and display theme.")}</p>
                </div>
              </div>
              <div
                className="portal-v2-settings-preference-grid"
                role="group"
                aria-label={authCopy.preferences}
                data-config-group="appearance"
              >
                <div className="portal-v2-settings-group-heading">
                  <h3>{uiText(locale, "外观", "Appearance")}</h3>
                  <p>{uiText(locale, "语言和主题仅影响当前用户中心的显示。", "Language and theme affect only this User Center display.")}</p>
                </div>
                <section className="portal-v2-settings-preference-card">
                  <div>
                    <strong>{uiText(locale, "界面语言", "Interface language")}</strong>
                    <small>{uiText(locale, "选择用户中心使用的语言。", "Choose the language used in the User Center.")}</small>
                  </div>
                  <PublicLocaleSwitch
                    ariaLabel={authCopy.language}
                    locale={locale}
                    onLocaleChange={setLocale}
                  />
                </section>
                <section className="portal-v2-settings-preference-card">
                  <div>
                    <strong>{uiText(locale, "显示主题", "Display theme")}</strong>
                    <small>{uiText(locale, "选择日间或夜间显示。", "Choose light or dark display.")}</small>
                  </div>
                  <PublicThemeSwitch
                    ariaLabel={authCopy.theme}
                    locale={locale}
                    theme={theme}
                    onThemeChange={setTheme}
                  />
                </section>
              </div>
            </section>
          ) : null}
          {activeView === "profile" ? (
            <PortalPersonalCenterPanel
              activeSubview={personalCenterSubview}
              locale={locale}
              onSubviewChange={setPersonalCenterSubview}
              profile={{
                authModeLabel: authModeLabel(portalSession.authMode, locale),
                userRef: portalSession.userRef,
                registeredAtLabel: formatDateTime(registrationDate, locale)
              }}
              security={{
                authenticatorBound,
                authenticatorPending,
                passkeyExported,
                passkeyPending,
                passkeyError,
                onStartAuthenticatorEnrollment: startAuthenticatorEnrollment,
                onExportPasskey: exportPasskey
              }}
            />
          ) : null}
        </main>
      </div>
      {shouldShowSecuritySetup ? (
        <SecuritySetupDialog
          authenticatorBound={authenticatorBound}
          authenticatorPending={authenticatorPending}
          passkeyError={passkeyError}
          passkeyExported={passkeyExported}
          passkeyPending={passkeyPending}
          onBindAuthenticator={startAuthenticatorEnrollment}
          onClose={() => setSecuritySetupRequired(false)}
          onExportPasskey={exportPasskey}
          locale={locale}
        />
      ) : null}
      {authenticatorEnrollment ? (
        <AuthenticatorEnrollmentDialog
          code={authenticatorCode}
          enrollment={authenticatorEnrollment}
          error={authenticatorError}
          pending={authenticatorPending}
          onClose={closeAuthenticatorEnrollment}
          onCodeChange={setAuthenticatorCode}
          onSubmit={confirmAuthenticatorEnrollment}
          locale={locale}
        />
      ) : null}
    </>
  );
}

function DashboardPanel({
  created,
  lifecycle,
  orderRows,
  currentEntitlement,
  selectedOrder,
  setActiveView,
  trafficPercent,
  trafficSummary,
  locale
}: {
  created: CreatedSubscription | null;
  lifecycle: SubscriptionLifecycle;
  orderRows: PortalOrderRow[];
  currentEntitlement: PortalAccountEntitlement | null;
  selectedOrder: PortalOrderRow | null;
  setActiveView: (value: PortalView) => void;
  trafficPercent: number;
  trafficSummary: ReturnType<typeof aggregateTrafficUsage>;
  locale: PortalAuthLocale;
}) {
  const desktopViewport = useDesktopScrollRegion();
  const pendingOrders = pendingOrderCount(orderRows);
  const entitlementPlanId = currentEntitlement ? planIdFromEntitlement(currentEntitlement) : null;
  const currentPlan = selectedOrder
    ? selectedPlan(selectedOrder.planId, locale)
    : entitlementPlanId
      ? selectedPlan(entitlementPlanId, locale)
      : null;
  const entitlementActive = Boolean(currentEntitlement);
  const orderPlanTrafficBytes = (currentPlan?.monthlyTrafficGb ?? 0) > 0
    ? (currentPlan?.monthlyTrafficGb ?? 0) * 1024 ** 3
    : 0;
  const entitlementQuotaBytes = currentEntitlement ? entitlementTrafficBytes(currentEntitlement) : 0;
  const planTrafficBytes = entitlementQuotaBytes || orderPlanTrafficBytes || trafficSummary.totalBytes;
  const remainingTrafficBytes = planTrafficBytes > 0
    ? Math.max(0, planTrafficBytes - trafficSummary.usedBytes)
    : 0;
  const recentOrders = orderRows.slice(0, 3);
  const heavyUsageOrders = [...orderRows]
    .sort((left, right) => orderUsageSortValue(right) - orderUsageSortValue(left))
    .slice(0, 3);
  const hasTrafficAccess = entitlementActive || selectedOrder?.status === "active";
  const currentStatus = selectedOrder?.status ?? (entitlementActive ? "active" : "pending");
  const resourceState = hasTrafficAccess ? "active" : pendingOrders > 0 ? "pending" : "empty";
  const resourceHeading = resourceState === "active"
    ? currentPlan?.label ?? uiText(locale, "账户资源已开通", "Account resource is active")
    : resourceState === "pending"
      ? uiText(locale, "服务订单处理中", "Service order is processing")
      : uiText(locale, "账户尚未开通服务", "No account service yet");
  const resourceDescription = resourceState === "active"
    ? uiText(locale, "当前资源已下发到账户；续期会更新账户的可用时间。", "The current resource is available to this account; renewal updates its available time.")
    : resourceState === "pending"
      ? uiText(locale, "订单确认完成后，服务资源会自动下发到当前账户。", "After the order is confirmed, the service resource is delivered to this account automatically.")
      : uiText(locale, "在商城购买服务后，资源会下发到当前账户。", "After you buy a service in Marketplace, its resource is delivered to this account.");
  const resourceActionView: PortalView = resourceState === "active"
    ? "start"
    : resourceState === "pending"
      ? "orders"
      : "marketplace";
  const resourceActionLabel = resourceState === "active"
    ? uiText(locale, "开始使用", "Start using")
    : resourceState === "pending"
      ? uiText(locale, "查看订单", "View orders")
      : uiText(locale, "前往商城", "Go to Marketplace");

  return (
    <div className="portal-v2-stack">
      {desktopViewport ? <section
        className="portal-v2-resource-state"
        aria-label={uiText(locale, "账户资源状态", "Account resource status")}
        aria-live="polite"
        data-state={resourceState}
      >
        <div className="portal-v2-resource-state-copy">
          <span className="portal-card-label"><Activity aria-hidden="true" /> {uiText(locale, "账户资源", "Account resource")}</span>
          <h2>{resourceHeading}</h2>
          <p>{resourceDescription}</p>
        </div>
        {resourceState === "active" ? (
          <dl className="portal-v2-resource-state-details">
            <div>
              <dt>{uiText(locale, "可用时间", "Available time")}</dt>
              <dd>{selectedOrder ? expiryDisplay(created, lifecycle, locale) : entitlementExpiryDisplay(currentEntitlement, locale)}</dd>
            </div>
            <div>
              <dt>{uiText(locale, "当前额度", "Current quota")}</dt>
              <dd>{planTrafficBytes > 0 ? formatTrafficBytes(planTrafficBytes) : uiText(locale, "未设置", "Not set")}</dd>
            </div>
          </dl>
        ) : null}
        <div className="portal-v2-resource-state-actions">
          <span className={cn("portal-order-status", resourceState === "active" ? "active" : "pending")}>
            {resourceState === "active"
              ? uiText(locale, "生效中", "Active")
              : resourceState === "pending"
                ? uiText(locale, "处理中", "Processing")
                : uiText(locale, "待开通", "Not active")}
          </span>
          <button
            className="portal-primary-button compact"
            type="button"
            onClick={() => setActiveView(resourceActionView)}
          >
            {resourceActionLabel}
          </button>
        </div>
      </section> : null}

      <section className="portal-v2-metric-grid" aria-label={uiText(locale, "账户指标", "Account metrics")}>
        <article className="portal-v2-metric-card">
          <span><Activity aria-hidden="true" /> {uiText(locale, "服务状态", "Service status")}</span>
          <strong>{resourceState === "active"
            ? orderHealthLabel(orderRows, currentEntitlement ? [currentEntitlement] : [], locale)
            : resourceState === "pending"
              ? uiText(locale, "处理中", "Processing")
              : uiText(locale, "待开通", "Not active")}</strong>
          <small>{resourceState === "active"
            ? uiText(locale, "当前账户资源可用", "Current account resource is available")
            : resourceState === "pending"
              ? uiText(locale, `${pendingOrders} 个服务订单待处理`, `${pendingOrders} service orders pending`)
              : uiText(locale, "购买服务后开始计时", "Time starts after service delivery")}</small>
        </article>
        <article className="portal-v2-metric-card">
          <span><ReceiptText aria-hidden="true" /> {uiText(locale, "订单记录", "Order records")}</span>
          <strong>{orderRows.length}</strong>
          <small>{pendingOrders > 0 ? uiText(locale, `${pendingOrders} 个待处理`, `${pendingOrders} pending`) : uiText(locale, "无待处理订单", "No pending orders")}</small>
        </article>
        <article className="portal-v2-metric-card">
          <span><BarChart3 aria-hidden="true" /> {uiText(locale, "共享月流量", "Shared monthly traffic")}</span>
          <strong>{hasTrafficAccess ? formatTrafficBytes(trafficSummary.usedBytes) : "—"}</strong>
          <small>{hasTrafficAccess
            ? trafficSummary.measuredOrders > 0
              ? uiText(locale, "所有设备共享账户流量池", "All devices share the account pool")
              : uiText(locale, "开始使用后显示", "Shown after you start using the service")
            : uiText(locale, "资源开通后开始计量", "Measured after the resource is active")}</small>
        </article>
        <article className="portal-v2-metric-card">
          <span><BarChart3 aria-hidden="true" /> {uiText(locale, "剩余流量", "Remaining traffic")}</span>
          <strong>{hasTrafficAccess && planTrafficBytes > 0 ? formatTrafficBytes(remainingTrafficBytes) : "—"}</strong>
          <small>{hasTrafficAccess && planTrafficBytes > 0
            ? uiText(locale, `本月额度 ${formatTrafficBytes(planTrafficBytes)}`, `${formatTrafficBytes(planTrafficBytes)} monthly quota`)
            : uiText(locale, "资源开通后显示当前额度", "Current quota appears after the resource is active")}</small>
        </article>
      </section>

      <section className="portal-v2-dashboard-grid">
        {!desktopViewport ? <article className="portal-v2-panel portal-v2-subscription-panel">
          <div className="portal-v2-panel-header">
            <div>
              <span className="portal-card-label">{uiText(locale, "当前套餐", "Current plan")}</span>
              <h3>{currentPlan ? currentPlan.label : uiText(locale, "未开通套餐", "No active plan")}</h3>
            </div>
            <span className={cn("portal-order-status", currentStatus)}>
              {selectedOrder || entitlementActive ? orderStatusLabel(currentStatus, locale) : uiText(locale, "未开通", "Not active")}
            </span>
          </div>
          <dl className="portal-v2-definition-list">
            <div>
              <dt>{uiText(locale, "最近订单", "Latest order")}</dt>
              <dd>{selectedOrder ? orderNumber(selectedOrder.requestRef) : uiText(locale, "无", "None")}</dd>
            </div>
            <div>
              <dt>{uiText(locale, "可用时间", "Available time")}</dt>
              <dd>{selectedOrder ? expiryDisplay(created, lifecycle, locale) : entitlementExpiryDisplay(currentEntitlement, locale)}</dd>
            </div>
            <div>
              <dt>{uiText(locale, "首选客户端", "Preferred client")}</dt>
              <dd>{selectedOrder ? <NoTranslateText>{clientTargetLabel(selectedOrder.clientTarget)}</NoTranslateText> : uiText(locale, "待选择", "Not selected")}</dd>
            </div>
          </dl>
          <div className="portal-v2-traffic-summary">
            <div>
              <strong>{trafficSummary.totalBytes > 0 ? `${Math.round(trafficPercent)}%` : uiText(locale, "不限量", "Unlimited")}</strong>
              <span>{trafficSummary.totalBytes > 0 ? uiText(locale, "共享流量使用率", "Shared quota used") : uiText(locale, "暂无流量上限", "No traffic limit")}</span>
            </div>
            <div className="portal-traffic-meter" aria-hidden="true">
              <span style={{ width: `${trafficPercent}%` }} />
            </div>
            <small>{trafficSummary.totalBytes > 0
              ? `${formatTrafficBytes(trafficSummary.usedBytes)} / ${formatTrafficBytes(trafficSummary.totalBytes)}`
              : uiText(locale, `${formatTrafficBytes(trafficSummary.usedBytes)} 已计量`, `${formatTrafficBytes(trafficSummary.usedBytes)} measured`)}</small>
          </div>
        </article> : null}

        <article className="portal-v2-panel">
          <div className="portal-v2-panel-header">
            <div>
              <span className="portal-card-label">{uiText(locale, "最近订单", "Recent orders")}</span>
              <h3>{uiText(locale, "订单活动", "Order activity")}</h3>
            </div>
            <button
              className="portal-link-button"
              type="button"
              onClick={() => setActiveView(desktopViewport ? "orders" : "usage")}
            >
              {desktopViewport
                ? uiText(locale, "查看订单", "View orders")
                : uiText(locale, "查看用量", "View usage")}
            </button>
          </div>
          {recentOrders.length > 0 ? (
            <div className="portal-v2-list">
              {recentOrders.map((order) => (
                <button
                  key={order.requestRef}
                  type="button"
                  onClick={() => setActiveView(desktopViewport ? "orders" : "usage")}
                >
                  <span>
                    <strong>{orderNumber(order.requestRef)}</strong>
                    <small>{selectedPlan(order.planId, locale).label} · {formatDateTime(order.createdAt, locale)}</small>
                  </span>
                  <em className={cn("portal-order-status", order.status)}>{orderStatusLabel(order.status, locale)}</em>
                </button>
              ))}
            </div>
          ) : (
            <div className="portal-v2-empty">
              <ReceiptText aria-hidden="true" />
              <strong>{uiText(locale, "暂无订单", "No orders yet")}</strong>
              <span>{uiText(locale, "商城订单和续费记录会在这里显示。", "Marketplace orders and renewal records appear here.")}</span>
            </div>
          )}
        </article>

        <article className="portal-v2-panel">
          <div className="portal-v2-panel-header">
            <div>
              <span className="portal-card-label">{uiText(locale, "用量排行", "Usage ranking")}</span>
              <h3>{uiText(locale, "共享月流量", "Shared monthly traffic")}</h3>
            </div>
            <button className="portal-link-button" type="button" onClick={() => setActiveView("usage")}>{uiText(locale, "查看用量", "View usage")}</button>
          </div>
          {heavyUsageOrders.length > 0 ? (
            <div className="portal-v2-usage-list">
              {heavyUsageOrders.map((order) => (
                <div key={order.requestRef}>
                  <span>
                    <strong>{selectedPlan(order.planId, locale).label}</strong>
                    <small>{trafficUsageLabel(order, locale)}</small>
                  </span>
                  <div className="portal-traffic-meter" aria-hidden="true">
                    <span style={{ width: `${trafficUsagePercent(order)}%` }} />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="portal-v2-empty">
              <LineChart aria-hidden="true" />
              <strong>{uiText(locale, "使用后显示", "Shown after use")}</strong>
              <span>{uiText(locale, "开始使用后会在这里显示流量。", "Traffic appears here after you start using the service.")}</span>
            </div>
          )}
        </article>
      </section>
    </div>
  );
}

function UsagePanel({
  orderRows,
  currentEntitlement,
  setActiveView,
  openMarketplace,
  trafficPercent,
  trafficSummary,
  locale
}: {
  orderRows: PortalOrderRow[];
  currentEntitlement: PortalAccountEntitlement | null;
  setActiveView: (value: PortalView) => void;
  openMarketplace: () => void;
  trafficPercent: number;
  trafficSummary: ReturnType<typeof aggregateTrafficUsage>;
  locale: PortalAuthLocale;
}) {
  const measuredRows = orderRows.filter((order) => order.request.usage);
  const activeRows = orderRows.filter((order) => order.status === "active");
  const chartRows = measuredRows.length > 0 ? measuredRows : activeRows;
  const entitlementPlanId = currentEntitlement ? planIdFromEntitlement(currentEntitlement) : null;
  const entitlementPlan = entitlementPlanId ? selectedPlan(entitlementPlanId, locale) : null;
  const entitlementQuotaBytes = currentEntitlement ? entitlementTrafficBytes(currentEntitlement) : 0;

  return (
    <div className="portal-v2-stack">
      <section className="portal-v2-metric-grid" aria-label={uiText(locale, "用量指标", "Usage metrics")}>
        <article className="portal-v2-metric-card">
          <span><Download aria-hidden="true" /> {uiText(locale, "下载", "Download")}</span>
          <strong>{formatTrafficBytes(trafficSummary.downloadBytes)}</strong>
          <small>{uiText(locale, "账户共享流量", "Account shared traffic")}</small>
        </article>
        <article className="portal-v2-metric-card">
          <span><Activity aria-hidden="true" /> {uiText(locale, "上传", "Upload")}</span>
          <strong>{formatTrafficBytes(trafficSummary.uploadBytes)}</strong>
          <small>{uiText(locale, "账户共享流量", "Account shared traffic")}</small>
        </article>
        <article className="portal-v2-metric-card">
          <span><BarChart3 aria-hidden="true" /> {uiText(locale, "总用量", "Total usage")}</span>
          <strong>{formatTrafficBytes(trafficSummary.usedBytes)}</strong>
          <small>{trafficSummary.totalBytes > 0 ? uiText(locale, `${Math.round(trafficPercent)}% 额度使用率`, `${Math.round(trafficPercent)}% quota used`) : uiText(locale, "不限量或未设置额度", "Unlimited or no quota set")}</small>
        </article>
        <article className="portal-v2-metric-card">
          <span><AlertTriangle aria-hidden="true" /> {uiText(locale, "状态", "Status")}</span>
          <strong>{trafficSummary.overLimitOrders > 0 ? uiText(locale, "超额", "Over limit") : trafficSummary.staleOrders > 0 ? uiText(locale, "延迟", "Delayed") : uiText(locale, "正常", "Normal")}</strong>
          <small>{trafficSummary.measuredOrders > 0 ? uiText(locale, `${trafficSummary.measuredOrders} 条用量记录已更新`, `${trafficSummary.measuredOrders} usage records updated`) : uiText(locale, "使用后显示", "Shown after use")}</small>
        </article>
      </section>

      <section className="portal-v2-dashboard-grid usage">
        <article className="portal-v2-panel portal-v2-usage-chart">
          <div className="portal-v2-panel-header">
            <div>
              <span className="portal-card-label">{uiText(locale, "账户合计", "Account total")}</span>
              <h3>{uiText(locale, "流量消耗", "Traffic usage")}</h3>
            </div>
            <span>{trafficSummary.totalChannels > 0 ? uiText(locale, `${trafficSummary.measuredChannels}/${trafficSummary.totalChannels} 条线路已更新`, `${trafficSummary.measuredChannels}/${trafficSummary.totalChannels} routes updated`) : uiText(locale, "账户共享流量", "Account shared traffic")}</span>
          </div>
          {chartRows.length > 0 ? (
            <div className="portal-v2-chart-bars" aria-label={uiText(locale, "流量用量占比", "Traffic usage share")}>
              {chartRows.slice(0, 8).map((order) => {
                const percent = order.request.usage ? Math.max(6, trafficUsagePercent(order)) : 8;
                return (
                  <div key={order.requestRef}>
                    <span style={{ height: `${percent}%` }} />
                    <small>{orderNumber(order.requestRef).slice(-5)}</small>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="portal-v2-empty">
              <LineChart aria-hidden="true" />
              <strong>{uiText(locale, "暂无可视化数据", "No chart data yet")}</strong>
              <span>{uiText(locale, "开始连接后会显示用量走势。", "Usage trends appear after you connect.")}</span>
              <button className="portal-primary-button compact" type="button" onClick={currentEntitlement ? () => setActiveView("start") : openMarketplace}>{currentEntitlement ? uiText(locale, "开始使用", "Start using") : uiText(locale, "前往商城", "Go to Marketplace")}</button>
            </div>
          )}
        </article>

        <article className="portal-v2-panel">
          <div className="portal-v2-panel-header">
            <div>
              <span className="portal-card-label">{uiText(locale, "用量记录", "Usage records")}</span>
              <h3>{uiText(locale, "用量明细", "Usage details")}</h3>
            </div>
            <button className="portal-link-button" type="button" onClick={() => setActiveView("start")}>{uiText(locale, "开始使用", "Start using")}</button>
          </div>
          {orderRows.length > 0 ? (
            <div className="portal-v2-usage-list detailed">
              {orderRows.map((order) => (
                <div key={order.requestRef}>
                  <span>
                    <strong>{selectedPlan(order.planId, locale).label}</strong>
                    <small>{orderNumber(order.requestRef)} · <NoTranslateText>{clientTargetLabel(order.clientTarget)}</NoTranslateText></small>
                  </span>
                  <div className="portal-traffic-meter" aria-hidden="true">
                    <span style={{ width: `${trafficUsagePercent(order)}%` }} />
                  </div>
                  <em>{trafficUsageLabel(order, locale)}</em>
                </div>
              ))}
            </div>
          ) : currentEntitlement ? (
            <div className="portal-v2-usage-list detailed">
              <div>
                <span>
                  <strong>{entitlementPlan ? entitlementPlan.label : uiText(locale, "当前套餐", "Current plan")}</strong>
                  <small>{uiText(locale, "账户共享流量额度", "Account shared traffic quota")}</small>
                </span>
                <div className="portal-traffic-meter" aria-hidden="true">
                  <span style={{ width: "0%" }} />
                </div>
                <em>{`0 B / ${formatTrafficBytes(entitlementQuotaBytes)}`}</em>
              </div>
            </div>
          ) : (
            <div className="portal-v2-empty">
              <ReceiptText aria-hidden="true" />
              <strong>{uiText(locale, "暂无订单", "No orders yet")}</strong>
              <span>{uiText(locale, "开始连接后再查看用量。", "Usage appears after you connect.")}</span>
            </div>
          )}
        </article>
      </section>
    </div>
  );
}

function SubscriptionManager({
  activePaymentOrder,
  actionError,
  orderClientFilter,
  orderFormOpen,
  orderRows,
  paymentOrders,
  lastPaymentOrderRef,
  orderSearch,
  orderSort,
  orderStatusFilter,
  paymentChannel,
  selectedOrderRef,
  selectedPlanId,
  pending,
  setOrderClientFilter,
  setOrderSearch,
  setOrderSort,
  setOrderStatusFilter,
  setPaymentChannel,
  setSelectedPlanId,
  closePaymentOrder,
  openPaymentOrder,
  refreshPaymentOrders,
  submitSubscription,
  openMarketplace,
  closeOrderForm,
  viewOrder,
  locale
}: {
  activePaymentOrder: PortalPaymentOrder | null;
  actionError: string;
  orderClientFilter: "all" | PortalClientId;
  orderFormOpen: boolean;
  orderRows: PortalOrderRow[];
  paymentOrders: PortalPaymentOrder[];
  lastPaymentOrderRef: string | null;
  orderSearch: string;
  orderSort: OrderSort;
  orderStatusFilter: OrderStatusFilter;
  paymentChannel: PortalPaymentChannel;
  selectedOrderRef: string | null;
  selectedPlanId: PortalPlanId;
  pending: boolean;
  setOrderClientFilter: (value: "all" | PortalClientId) => void;
  setOrderSearch: (value: string) => void;
  setOrderSort: (value: OrderSort) => void;
  setOrderStatusFilter: (value: OrderStatusFilter) => void;
  setPaymentChannel: (value: PortalPaymentChannel) => void;
  setSelectedPlanId: (value: PortalPlanId) => void;
  closePaymentOrder: () => void;
  openPaymentOrder: (order: PortalPaymentOrder) => void;
  refreshPaymentOrders: (targetOrderRef?: string) => Promise<void>;
  submitSubscription: (planIdOverride?: Exclude<PortalPlanId, "trial">, paymentChannelOverride?: PortalPaymentChannel) => Promise<boolean>;
  openMarketplace: () => void;
  closeOrderForm: () => void;
  viewOrder: (order: PortalOrderRow) => void;
  locale: PortalAuthLocale;
}) {
  const [cashierPlanId, setCashierPlanId] = useState<Exclude<PortalPlanId, "trial"> | null>(null);

  if (activePaymentOrder) {
    return (
      <PortalPaymentFlow
        actionError={actionError}
        closePaymentOrder={closePaymentOrder}
        locale={locale}
        order={activePaymentOrder}
        pending={pending}
        refreshPaymentOrders={refreshPaymentOrders}
        openMarketplace={openMarketplace}
      />
    );
  }

  const selectedOrder = orderRows.find((row) => row.requestRef === selectedOrderRef) ?? orderRows[0] ?? null;
  const purchasePlanOptions = purchasePlans.map((plan) => localizedPlan(plan, locale));
  const cashierPlan = cashierPlanId ? localizedPlan(selectedPlan(cashierPlanId, locale), locale) : null;
  const normalizedSearch = orderSearch.trim().toLowerCase();
  const visiblePaymentOrders = paymentOrders.filter((order) => {
    if (orderClientFilter !== "all") return false;
    if (!paymentOrderMatchesStatus(order, orderStatusFilter)) return false;
    return !normalizedSearch || paymentOrderSearchText(order, locale).includes(normalizedSearch);
  });
  const unifiedOrders = [
    ...visiblePaymentOrders.map((order) => ({
      key: `payment:${order.orderRef}`,
      createdAt: order.createdAt,
      expiresAt: order.paidAt ?? order.createdAt,
      kind: "payment" as const,
      payment: order
    })),
    ...orderRows.map((order) => ({
      key: `subscription:${order.requestRef}`,
      createdAt: order.createdAt,
      expiresAt: order.expiresAt,
      kind: "subscription" as const,
      subscription: order
    }))
  ].sort((left, right) => {
    if (orderSort === "oldest") return left.createdAt.localeCompare(right.createdAt);
    if (orderSort === "expires") return left.expiresAt.localeCompare(right.expiresAt);
    return right.createdAt.localeCompare(left.createdAt);
  });
  const expandedOrderKey = lastPaymentOrderRef
    ? `payment:${lastPaymentOrderRef}`
    : selectedOrder
      ? `subscription:${selectedOrder.requestRef}`
      : unifiedOrders[0]?.key;
  const openCashier = (planId: Exclude<PortalPlanId, "trial">) => {
    setSelectedPlanId(planId);
    setCashierPlanId(planId);
  };
  const closeCashier = () => {
    if (pending) return;
    setCashierPlanId(null);
  };
  const submitCashierOrder = async () => {
    if (!cashierPlanId) return;
    const submitted = await submitSubscription(cashierPlanId, paymentChannel);
    if (submitted) setCashierPlanId(null);
  };

  return (
    <div className="portal-use-stack">
      <section id="portal-order-records" className="portal-order-card" aria-label={uiText(locale, "订单记录", "Order records")}>
        <div className="portal-order-header">
          <div className="portal-section-heading">
            <ReceiptText aria-hidden="true" />
            <div>
              <span className="portal-card-label">{uiText(locale, "订单", "Orders")}</span>
              <h2>{uiText(locale, "订单记录", "Order records")}</h2>
              <p>{uiText(
                locale,
                "订单、履约和权益状态在这里分别显示；流量仅在权益生效后可用。",
                "Order, fulfillment, and entitlement states are shown separately. Traffic is available only after entitlement activation."
              )}</p>
            </div>
          </div>
        </div>

        <div className="portal-order-tabs" role="tablist" aria-label={uiText(locale, "记录状态", "Record status")}>
          {localizedOrderStatusTabs(locale).map((tab) => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={orderStatusFilter === tab.id}
              className={cn("portal-order-tab", orderStatusFilter === tab.id && "active")}
              onClick={() => setOrderStatusFilter(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="portal-order-toolbar">
          <label>
            <span>{uiText(locale, "搜索订单", "Search orders")}</span>
            <div className="portal-search-field">
              <Search aria-hidden="true" />
              <input
                value={orderSearch}
                onChange={(event) => setOrderSearch(event.target.value)}
                placeholder={uiText(locale, "订单号 / 套餐 / 状态", "Order / plan / status")}
              />
            </div>
          </label>
          <label>
            <span>{uiText(locale, "客户端", "Client")}</span>
            <select
              className="notranslate"
              translate="no"
              value={orderClientFilter}
              onChange={(event) => setOrderClientFilter(event.target.value as "all" | PortalClientId)}
            >
              <option value="all">{uiText(locale, "全部客户端", "All clients")}</option>
              {clientTargets.map((target) => (
                <option key={target.id} className="notranslate" translate="no" value={target.id}>{target.label}</option>
              ))}
            </select>
          </label>
          <label>
            <span>{uiText(locale, "排序", "Sort")}</span>
            <select value={orderSort} onChange={(event) => setOrderSort(event.target.value as OrderSort)}>
              <option value="newest">{uiText(locale, "最新创建", "Newest")}</option>
              <option value="oldest">{uiText(locale, "最早创建", "Oldest")}</option>
              <option value="expires">{uiText(locale, "到期时间", "Expiry")}</option>
            </select>
          </label>
          <button className="portal-primary-button compact portal-toolbar-create" type="button" onClick={openMarketplace}>
            <Plus aria-hidden="true" />
            {uiText(locale, "前往商城", "Go to Marketplace")}
          </button>
        </div>

        {unifiedOrders.length === 0 ? (
          <div className="portal-order-empty-state" role="status">
            <ReceiptText aria-hidden="true" />
            <strong>{uiText(locale, "暂无订单", "No orders yet")}</strong>
            <p>{uiText(locale, "商城订单和续费记录会在这里显示。", "Marketplace orders and renewal records appear here.")}</p>
            <button className="portal-primary-button compact" type="button" onClick={openMarketplace}>
              <Plus aria-hidden="true" />
              {uiText(locale, "前往商城", "Go to Marketplace")}
            </button>
          </div>
        ) : (
          <div className="portal-order-table-wrap">
            <table className="portal-order-table" aria-label={uiText(locale, "订单列表", "Orders")}>
              <thead>
                <tr>
                  <th>{uiText(locale, "订单号", "Order")}</th>
                  <th>{uiText(locale, "套餐", "Plan")}</th>
                  <th>{uiText(locale, "状态", "Status")}</th>
                  <th>{uiText(locale, "额度", "Quota")}</th>
                  <th>{uiText(locale, "用量", "Usage")}</th>
                  <th>{uiText(locale, "生效", "Renewal")}</th>
                  <th>{uiText(locale, "操作", "Actions")}</th>
                </tr>
              </thead>
              <tbody>
                {unifiedOrders.map((entry) => {
                  if (entry.kind === "payment") {
                    const order = entry.payment;
                    const plan = selectedPlan(order.planId, locale);
                    return (
                      <Fragment key={entry.key}>
                        <tr className={cn("portal-order-primary-row", expandedOrderKey === entry.key && "selected")}>
                          <td data-label={uiText(locale, "订单号", "Order")}>
                            <span className="portal-order-main-text">{paymentOrderNumber(order.orderRef)}</span>
                          </td>
                          <td data-label={uiText(locale, "套餐", "Plan")}>
                            <span className="portal-order-plan-cell">
                              <strong>{plan.label}</strong>
                              <small>{paymentAmountLabel(order)}</small>
                            </span>
                          </td>
                          <td data-label={uiText(locale, "状态", "Status")}>
                            <span className={cn("portal-order-status", paymentOrderStatusClass(order.status))}>{paymentStatusLabel(order.status, locale)}</span>
                          </td>
                          <td data-label={uiText(locale, "额度", "Quota")}>{plan.billingCycle}</td>
                          <td data-label={uiText(locale, "用量", "Usage")} className="portal-order-sub-text">
                            {uiText(locale, "付款后显示", "After payment")}
                          </td>
                          <td data-label={uiText(locale, "生效", "Renewal")}>{paymentRenewalLabel(order, locale)}</td>
                          <td data-label={uiText(locale, "操作", "Actions")}>
                            <div className="portal-order-actions">
                              <button type="button" onClick={() => openPaymentOrder(order)}>
                                <ExternalLink aria-hidden="true" /> {uiText(locale, "去付款", "Pay now")}
                              </button>
                            </div>
                          </td>
                        </tr>
                        {expandedOrderKey === entry.key ? (
                          <tr className="portal-order-detail-row">
                            <td colSpan={7}>
                              <div className="portal-order-detail">
                                <div className="portal-order-detail-grid">
                                  <div>
                                    <span>{uiText(locale, "类型", "Type")}</span>
                                    <strong>{uiText(locale, "支付订单", "Payment order")}</strong>
                                  </div>
                                  <div>
                                    <span>{uiText(locale, "金额", "Amount")}</span>
                                    <strong>{paymentAmountLabel(order)}</strong>
                                  </div>
                                  <div>
                                    <span>{uiText(locale, "创建时间", "Created")}</span>
                                    <strong>{formatDateTime(order.createdAt, locale)}</strong>
                                  </div>
                                  <div>
                                    <span>{uiText(locale, "支付状态", "Payment status")}</span>
                                    <strong>{paymentStatusLabel(order.status, locale)}</strong>
                                  </div>
                                </div>
                                <p className="portal-payment-next-step">
                                  {uiText(locale, "点击“去付款”查看付款二维码；付款完成后会为账户增加可用时间和套餐额度。", "Pay now shows the payment QR code. After payment, account time and plan quota are credited.")}
                                </p>
                              </div>
                            </td>
                          </tr>
                        ) : null}
                      </Fragment>
                    );
                  }

                  const order = entry.subscription;
                  const plan = selectedPlan(order.planId, locale);
                  return (
                    <Fragment key={entry.key}>
                      <tr className={cn("portal-order-primary-row", selectedOrderRef === order.requestRef && "selected")}>
                        <td data-label={uiText(locale, "订单号", "Order")}>
                          <button className="portal-order-link" type="button" onClick={() => viewOrder(order)}>
                            {orderNumber(order.requestRef)}
                          </button>
                        </td>
                        <td data-label={uiText(locale, "套餐", "Plan")}>
                          <span className="portal-order-plan-cell">
                            <strong>{plan.label}</strong>
                            <small><NoTranslateText>{clientTargetLabel(order.clientTarget)}</NoTranslateText></small>
                          </span>
                        </td>
                        <td data-label={uiText(locale, "状态", "Status")}>
                          <span className={cn("portal-order-status", order.status)}>{orderStatusLabel(order.status, locale)}</span>
                        </td>
                        <td data-label={uiText(locale, "额度", "Quota")}>
                          <span className="portal-order-plan-cell">
                            <strong>{uiText(locale, `${order.durationDays} 天`, `${order.durationDays} days`)}</strong>
                            <small>{order.quantity}</small>
                          </span>
                        </td>
                        <td data-label={uiText(locale, "用量", "Usage")}>
                          <div className={cn("portal-order-usage compact", order.request.usage?.status === "over_limit" && "over-limit")}>
                            <span>{trafficUsageLabel(order, locale)}</span>
                            <small>{trafficUsageDetail(order, locale)}</small>
                            {order.request.usage && order.request.usage.totalBytes > 0 ? (
                              <div className="portal-traffic-meter" aria-hidden="true">
                                <span style={{ width: `${trafficUsagePercent(order)}%` }} />
                              </div>
                            ) : null}
                          </div>
                        </td>
                        <td data-label={uiText(locale, "生效", "Renewal")}>{order.status === "pending" ? uiText(locale, "待开通", "Pending") : formatDateTime(order.expiresAt, locale)}</td>
                        <td data-label={uiText(locale, "操作", "Actions")}>
                          <div className="portal-order-actions">
                            <button type="button" onClick={() => viewOrder(order)}><Eye aria-hidden="true" /> {uiText(locale, "查看", "View")}</button>
                          </div>
                        </td>
                      </tr>
                      {expandedOrderKey === entry.key ? (
                        <tr className="portal-order-detail-row">
                          <td colSpan={7}>
                            <div className="portal-order-detail">
                              <div className="portal-order-detail-grid">
                                <div>
                                  <span>{uiText(locale, "创建时间", "Created")}</span>
                                  <strong>{formatDateTime(order.createdAt, locale)}</strong>
                                </div>
                                <div>
                                  <span>{uiText(locale, "流量详情", "Traffic detail")}</span>
                                  <strong>{trafficUsageDetail(order, locale)}</strong>
                                </div>
                                <div>
                                  <span>{uiText(locale, "链路状态", "Route status")}</span>
                                  <strong>{trafficUsageStatusLabel(order, locale) ?? orderStatusLabel(order.status, locale)}</strong>
                                </div>
                                <div>
                                  <span>{uiText(locale, "更新时间", "Updated")}</span>
                                  <strong>{trafficUsageCollectedAt(order, locale) ?? formatDateTime(order.expiresAt, locale)}</strong>
                                </div>
                              </div>
                              <p className="portal-payment-next-step">
                                {uiText(locale, "订单记录只用于查看套餐、时间和状态；订阅链接和刷新操作请到订阅页完成。", "Order records are for plan, time, and status review. Use the Subscriptions page to copy or refresh the link.")}
                              </p>
                            </div>
                          </td>
                        </tr>
                      ) : null}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {selectedOrder?.request.event?.occurredAt ? (
          <div className="portal-event-note">
            {locale === "en"
              ? `Order ${orderNumber(selectedOrder.requestRef)} was refreshed. The old link expired on ${formatDateTime(selectedOrder.request.event.occurredAt, locale)}.`
              : `订单 ${orderNumber(selectedOrder.requestRef)} 已刷新，旧链接已于 ${formatDateTime(selectedOrder.request.event.occurredAt, locale)} 失效。`}
          </div>
        ) : null}
      </section>
      {orderFormOpen && !cashierPlan ? (
        <ModalFrame
          closeDisabled={pending}
          closeLabel={uiText(locale, "关闭", "Close")}
          onClose={closeOrderForm}
          panelClassName="portal-purchase-modal"
          title={uiText(locale, "选择套餐", "Choose a plan")}
          titleId="portal-order-form-title"
        >
          <div id="portal-order-form" className="portal-order-form">
            <div className="portal-purchase-grid" aria-label={uiText(locale, "套餐选择", "Plan selection")}>
              {purchasePlanOptions.map((plan) => (
                <button
                  key={plan.id}
                  type="button"
                  aria-pressed={selectedPlanId === plan.id}
                  className={cn("portal-purchase-card", selectedPlanId === plan.id && "active", plan.badge && "featured")}
                  disabled={pending}
                  onClick={() => {
                    setSelectedPlanId(plan.id);
                    openCashier(plan.id as Exclude<PortalPlanId, "trial">);
                  }}
                >
                  <span className="portal-purchase-card-top">
                    <strong>{plan.label}</strong>
                    {plan.badge ? <em>{plan.badge}</em> : null}
                  </span>
                  <span className="portal-purchase-price">{plan.priceLabel}</span>
                  <small>{plan.description}</small>
                  <span className="portal-purchase-cycle">{plan.billingCycle}</span>
                  <span className={cn("portal-purchase-card-cta", selectedPlanId === plan.id && "active")}>
                    {pending && selectedPlanId === plan.id
                      ? uiText(locale, "提交中", "Submitting")
                      : locale === "zh"
                        ? `选择${plan.label}`
                        : `Choose ${plan.label}`}
                  </span>
                  <ul>
                    {plan.highlights.map((highlight) => (
                      <li key={highlight}><CheckCircle2 aria-hidden="true" /> {highlight}</li>
                    ))}
                  </ul>
                </button>
              ))}
            </div>

            {actionError ? <div className="alert alert-error">{actionError}</div> : null}
          </div>
        </ModalFrame>
      ) : null}
      {cashierPlan ? (
        <CashierSelectionDialog
          actionError={actionError}
          closeCashier={closeCashier}
          locale={locale}
          paymentChannel={paymentChannel}
          pending={pending}
          plan={cashierPlan}
          setPaymentChannel={setPaymentChannel}
          submitCashierOrder={submitCashierOrder}
        />
      ) : null}
    </div>
  );
}

function CashierSelectionDialog({
  actionError,
  closeCashier,
  locale,
  paymentChannel,
  pending,
  plan,
  setPaymentChannel,
  submitCashierOrder
}: {
  actionError: string;
  closeCashier: () => void;
  locale: PortalAuthLocale;
  paymentChannel: PortalPaymentChannel;
  pending: boolean;
  plan: PortalPlan;
  setPaymentChannel: (value: PortalPaymentChannel) => void;
  submitCashierOrder: () => Promise<void>;
}) {
  const methods = cashierPaymentChannels.map((method) => ({
    id: method.id,
    label: uiText(locale, method.labelZh, method.labelEn),
    iconSrc: method.iconSrc
  }));
  const amountLabel = plan.priceLabel.replace(/\s+/g, " ");

  return (
    <ModalFrame
      closeDisabled={pending}
      closeLabel={uiText(locale, "关闭", "Close")}
      onClose={closeCashier}
      panelClassName="portal-cashier-modal"
      title={uiText(locale, "选择支付方式", "Choose payment method")}
      titleId="portal-cashier-title"
    >
      <div className="portal-cashier-grid">
        <section className="portal-cashier-summary" aria-label={uiText(locale, "订单摘要", "Order summary")}>
          <div className="portal-payment-summary-heading">
            <ReceiptText aria-hidden="true" />
            <h3>{uiText(locale, "订单摘要", "Order summary")}</h3>
          </div>
          <dl>
            <div>
              <dt>{uiText(locale, "支付至", "Pay to")}</dt>
              <dd>GCC WebOS</dd>
            </div>
            <div>
              <dt>{uiText(locale, "订单信息", "Order information")}</dt>
              <dd>{plan.label}</dd>
            </div>
            <div>
              <dt>{uiText(locale, "计费周期", "Billing cycle")}</dt>
              <dd>{plan.billingCycle}</dd>
            </div>
            <div className="portal-payment-summary-total">
              <dt>{uiText(locale, "支付总额", "Total payment")}</dt>
              <dd>{amountLabel}</dd>
            </div>
          </dl>
        </section>
        <section className="portal-cashier-methods" aria-label={uiText(locale, "支付方式", "Payment methods")}>
          <span className="portal-card-label">{uiText(locale, "支付方式", "Payment method")}</span>
          <h4>{uiText(locale, "选择后生成对应二维码", "Choose a method to generate its code")}</h4>
          <div className="portal-cashier-method-list">
            {methods.map((method) => (
              <button
                key={method.id}
                type="button"
                aria-label={method.label}
                aria-pressed={paymentChannel === method.id}
                className={cn("portal-cashier-method", paymentChannel === method.id && "active")}
                disabled={pending}
                onClick={() => setPaymentChannel(method.id)}
              >
                <span className="portal-wallet-logo" aria-hidden="true">
                  <img src={method.iconSrc} alt="" decoding="async" loading="lazy" />
                </span>
                <span>{method.label}</span>
                {paymentChannel === method.id ? <CheckCircle2 aria-hidden="true" /> : null}
              </button>
            ))}
          </div>
        </section>
      </div>
      {actionError ? <div className="alert alert-error">{actionError}</div> : null}
      <div className="portal-cashier-actions">
        <button className="portal-secondary-button compact" type="button" disabled={pending} onClick={closeCashier}>
          {uiText(locale, "取消", "Cancel")}
        </button>
        <button className="portal-primary-button compact" type="button" disabled={pending} onClick={() => void submitCashierOrder()}>
          {pending ? uiText(locale, "提交中", "Submitting") : uiText(locale, "继续支付", "Continue to pay")}
        </button>
      </div>
    </ModalFrame>
  );
}

function PortalPaymentFlow({
  actionError,
  closePaymentOrder,
  locale,
  order,
  pending,
  refreshPaymentOrders,
  openMarketplace
}: {
  actionError: string;
  closePaymentOrder: () => void;
  locale: PortalAuthLocale;
  order: PortalPaymentOrder;
  pending: boolean;
  refreshPaymentOrders: (targetOrderRef?: string) => Promise<void>;
  openMarketplace: () => void;
}) {
  const step = paymentFlowStep(order);
  const plan = selectedPlan(order.planId, locale);
  const title = paymentFlowTitle(step, locale);
  const amount = paymentAmountLabel(order);
  const isMobilePayment = shouldRedirectToPaymentProvider();
  const paymentMethod = paymentDisplayMethodLabel(order, locale, isMobilePayment);
  const paymentScanCopy = paymentScanInstruction(order, locale, isMobilePayment);
  const isCheckout = step === "checkout";
  const isProcessing = step === "processing";
  const isSuccess = step === "success";
  const isFailed = step === "failed";
  const paymentPageTitle = isCheckout ? uiText(locale, "支付确认", "Payment confirmation") : title;
  const subtotalLabel = amount;
  const totalAmountLabel = amount;
  const supportedPaymentMethods = cashierPaymentChannels
    .filter((method) => method.id === order.channel)
    .map((method) => ({
      id: method.id,
      label: uiText(locale, method.labelZh, method.labelEn),
      iconSrc: method.iconSrc
    }));
  const [paymentNowMs, setPaymentNowMs] = useState(() => Date.now());
  const [paymentQrDataUrl, setPaymentQrDataUrl] = useState("");
  const paymentExpiresAt = useMemo(() => paymentCodeExpiresAt(order), [order]);
  const paymentRemainingMs = new Date(paymentExpiresAt).getTime() - paymentNowMs;
  const paymentCodeExpired = isCheckout && paymentRemainingMs <= 0;
  const paymentRemainingLabel = paymentCodeRemainingLabel(paymentRemainingMs, locale);
  const paymentEntryAvailable = hasPaymentEntry(order);
  const qrPayload = paymentQrPayload(order);
  const scanUnavailableMessage = isCheckout && !paymentCodeExpired
    ? paymentScanUnavailableMessage(order, locale)
    : "";
  const paymentExpiryNotice = isCheckout && paymentEntryAvailable ? (
    <div className={cn("portal-payment-expiry portal-payment-expiry-qr", paymentCodeExpired && "expired")}>
      {paymentCodeExpired ? (
        <span>{uiText(locale, "此支付链接已失效", "This payment link has expired")}</span>
      ) : (
        <>
          <span>{uiText(locale, "此支付链接将在", "This payment link expires in")}</span>
          <strong>
            <History aria-hidden="true" />
            {paymentRemainingLabel}
          </strong>
          <span>{uiText(locale, "后失效", "remaining")}</span>
        </>
      )}
    </div>
  ) : null;

  useEffect(() => {
    if (!isCheckout) return undefined;
    setPaymentNowMs(Date.now());
    const timer = window.setInterval(() => setPaymentNowMs(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [isCheckout, order.orderRef]);

  useEffect(() => {
    let cancelled = false;
    setPaymentQrDataUrl("");
    if (!isCheckout || !qrPayload || paymentCodeExpired) return () => {
      cancelled = true;
    };
    void createPaymentQrDataUri(qrPayload).then((dataUrl) => {
      if (!cancelled) setPaymentQrDataUrl(dataUrl);
    }).catch(() => {
      if (!cancelled) setPaymentQrDataUrl("");
    });
    return () => {
      cancelled = true;
    };
  }, [isCheckout, qrPayload, order.orderRef, paymentCodeExpired]);

  return (
    <div className="portal-use-stack portal-payment-page">
      <section className={cn("portal-order-card portal-payment-flow-card portal-payment-page-shell", isCheckout && "portal-payment-flow-card-checkout")} aria-label={paymentPageTitle}>
        <div className={cn("portal-payment-compact-header", isCheckout && "checkout")}>
          <button className="portal-payment-back-button" type="button" onClick={closePaymentOrder}>
            <ArrowLeft aria-hidden="true" />
            {uiText(locale, "返回订单", "Back to Orders")}
          </button>
          {isCheckout ? (
            <span className="portal-payment-compact-spacer" aria-hidden="true" />
          ) : (
            <div className="portal-payment-compact-title">
              <span>{uiText(locale, "支付", "Payment")}</span>
              <h2>{paymentPageTitle}</h2>
            </div>
          )}
          <span className={cn("portal-payment-compact-state", paymentCodeExpired && "expired")}>
            {paymentStatusLabel(order.status, locale)}
          </span>
        </div>

        <div className="portal-payment-page-grid">
          <div className="portal-payment-main-panel">
            {isCheckout ? (
              <article className="portal-payment-scan-card" aria-label={uiText(locale, "支付二维码区域", "Payment QR area")}>
                <div className="portal-payment-scan-layout">
                  <div className="portal-payment-qr-copy">
                    <h3>{uiText(locale, "扫码支付", "Scan to pay")}</h3>
                    <span>{paymentScanCopy}</span>
                  </div>
                  <div className="portal-payment-qr-column">
                    <div className={cn("portal-payment-qr-frame", !paymentQrDataUrl && "placeholder")}>
                      {paymentQrDataUrl && !paymentCodeExpired ? (
                        <img
                          alt={uiText(locale, `${paymentMethod}二维码`, `${paymentMethod} QR code`)}
                          className="portal-payment-qr-image"
                          src={paymentQrDataUrl}
                        />
                      ) : scanUnavailableMessage ? (
                        <AlertTriangle aria-hidden="true" />
                      ) : order.urlScheme && !qrPayload && !paymentCodeExpired ? (
                        <ExternalLink aria-hidden="true" />
                      ) : (
                        <QrCode aria-hidden="true" />
                      )}
                    </div>
                    {paymentExpiryNotice}
                  </div>
                </div>
                {!paymentCodeExpired && !paymentEntryAvailable ? (
                  <div className="alert alert-error">
                    {uiText(locale, "暂时无法打开付款页面，请查看现有订单状态或前往商城。", "The payment page is not available yet. Check the existing order status or go to Marketplace.")}
                  </div>
                ) : null}
                {scanUnavailableMessage ? (
                  <div className="alert alert-error">
                    {scanUnavailableMessage}
                  </div>
                ) : null}
              </article>
            ) : (
              <div className="portal-payment-status-stack">
                <div className={cn("portal-payment-result", step)}>
                  <div className="portal-payment-result-icon" aria-hidden="true">
                    {isSuccess ? <CheckCircle2 /> : isFailed ? <AlertTriangle /> : isProcessing ? <Activity /> : <QrCode />}
                  </div>
                  <div>
                    <strong>{title}</strong>
                    <span>{paymentFlowDescription(step, locale)}</span>
                  </div>
                </div>
                <div className="portal-payment-state-panel">
                  <strong>{isSuccess ? uiText(locale, "订单已完成", "Order completed") : isFailed ? uiText(locale, "订单未完成", "Order incomplete") : uiText(locale, "正在确认交易", "Confirming transaction")}</strong>
                  <span>
                    {isSuccess
                      ? uiText(locale, "服务时间以订单详情中的生效和到期时间为准。", "Service time follows the effective and expiry dates in order details.")
                      : isFailed
                        ? uiText(locale, "请查看现有订单状态或前往商城。", "Check the existing order status or go to Marketplace.")
                        : uiText(locale, "请稍后刷新状态；如果长时间未确认，可联系支持。", "Refresh later. Contact support if confirmation takes too long.")}
                  </span>
                </div>
                <div className="portal-payment-status-actions horizontal">
                  <button className="portal-secondary-button" type="button" disabled={pending} onClick={() => void refreshPaymentOrders(order.orderRef)}>
                    <RefreshCw aria-hidden="true" />
                    {pending ? uiText(locale, "检查中", "Checking") : uiText(locale, "检查状态", "Check status")}
                  </button>
                  {isFailed ? (
                    <button className="portal-primary-button compact" type="button" onClick={openMarketplace}>
                      {uiText(locale, "前往商城", "Go to Marketplace")}
                    </button>
                  ) : null}
                  <button className="portal-secondary-button" type="button" onClick={closePaymentOrder}>
                    {uiText(locale, "返回订单", "Back to Orders")}
                  </button>
                </div>
              </div>
            )}
          </div>

          <aside className="portal-payment-side-panel" aria-label={uiText(locale, "支付详情", "Payment details")}>
            <section className="portal-payment-summary-panel">
              <div className="portal-payment-summary-heading">
                <ReceiptText aria-hidden="true" />
                <h3>{uiText(locale, "订单摘要", "Order summary")}</h3>
              </div>
              <dl>
                <div>
                  <dt>{uiText(locale, "支付至", "Pay to")}</dt>
                  <dd>GCC WebOS</dd>
                </div>
                <div>
                  <dt>{uiText(locale, "订单信息", "Order information")}</dt>
                  <dd>{plan.label}</dd>
                </div>
                <div>
                  <dt>{uiText(locale, "计费周期", "Billing cycle")}</dt>
                  <dd>{plan.billingCycle}</dd>
                </div>
                <div>
                  <dt>{uiText(locale, "交易编号", "Transaction ID")}</dt>
                  <dd>{paymentOrderNumber(order.orderRef)}</dd>
                </div>
                <div>
                  <dt>{uiText(locale, "订单金额", "Order amount")}</dt>
                  <dd>{subtotalLabel}</dd>
                </div>
                <div className="portal-payment-summary-total">
                  <dt>{uiText(locale, "支付总额", "Total payment")}</dt>
                  <dd>{totalAmountLabel}</dd>
                </div>
              </dl>
              {isCheckout ? (
                <div className="portal-payment-summary-wallets">
                  <span className="portal-payment-summary-wallets-label">
                    {uiText(locale, "支付方式", "Payment methods")}
                  </span>
                  <div className="portal-payment-wallet-list" aria-label={uiText(locale, "支持的钱包", "Supported wallets")}>
                    {supportedPaymentMethods.map((method) => (
                      <span key={method.id}>
                        <span className="portal-wallet-logo" aria-hidden="true">
                          <img src={method.iconSrc} alt="" decoding="async" loading="lazy" />
                        </span>
                        {method.label}
                      </span>
                    ))}
                  </div>
                </div>
              ) : null}
            </section>
          </aside>
        </div>

        {actionError ? <div className="alert alert-error">{actionError}</div> : null}
      </section>
    </div>
  );
}

function ApplePlatformIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" {...props}>
      <path d="M16.54 12.55c-.02-2.24 1.83-3.31 1.91-3.36-1.04-1.52-2.66-1.73-3.24-1.75-1.38-.14-2.69.81-3.39.81-.7 0-1.79-.79-2.94-.77-1.51.02-2.9.88-3.68 2.23-1.57 2.72-.4 6.75 1.13 8.96.75 1.08 1.64 2.29 2.81 2.25 1.13-.05 1.55-.73 2.91-.73s1.74.73 2.93.71c1.21-.02 1.98-1.1 2.72-2.19.86-1.26 1.22-2.48 1.24-2.54-.03-.01-2.37-.91-2.4-3.62ZM14.31 5.99c.62-.75 1.04-1.79.93-2.83-.9.04-1.99.6-2.63 1.34-.58.67-1.08 1.73-.94 2.75 1 .08 2.02-.51 2.64-1.26Z" />
    </svg>
  );
}

function AndroidPlatformIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" {...props}>
      <path d="M7.1 8.2 5.7 5.77a.55.55 0 0 1 .2-.75.54.54 0 0 1 .74.2L8.1 7.74a8.62 8.62 0 0 1 7.8 0l1.46-2.52a.54.54 0 0 1 .74-.2.55.55 0 0 1 .2.75L16.9 8.2A7.55 7.55 0 0 1 20 14v.75H4V14c0-2.39 1.2-4.52 3.1-5.8ZM8 12.2a.85.85 0 1 0 0-1.7.85.85 0 0 0 0 1.7Zm8 0a.85.85 0 1 0 0-1.7.85.85 0 0 0 0 1.7ZM4 16h2v3.5A1.5 1.5 0 0 0 7.5 21h1A1.5 1.5 0 0 0 10 19.5V16h4v3.5a1.5 1.5 0 0 0 1.5 1.5h1a1.5 1.5 0 0 0 1.5-1.5V16h2v-1H4v1Z" />
    </svg>
  );
}

function HarmonyPlatformIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" {...props}>
      <path d="M12 3.1c1.45 2.18 1.45 4.34 0 6.48-1.45-2.14-1.45-4.3 0-6.48ZM7.25 4.7c2.34 1.17 3.42 3.04 3.23 5.62-2.33-1.1-3.41-2.97-3.23-5.62Zm9.5 0c.18 2.65-.9 4.52-3.23 5.62-.19-2.58.89-4.45 3.23-5.62ZM4.25 8.68c2.62.12 4.48 1.2 5.57 3.24-2.53.28-4.39-.8-5.57-3.24Zm15.5 0c-1.18 2.44-3.04 3.52-5.57 3.24 1.09-2.04 2.95-3.12 5.57-3.24ZM3.7 13.6c2.5-.73 4.62-.18 6.36 1.65-2.15 1.35-4.27.8-6.36-1.65Zm16.6 0c-2.09 2.45-4.21 3-6.36 1.65 1.74-1.83 3.86-2.38 6.36-1.65ZM7 19.4c.51-2.52 2.18-3.98 5-4.36 2.82.38 4.49 1.84 5 4.36-3.32 1.46-6.68 1.46-10 0Z" />
    </svg>
  );
}

function WindowsPlatformIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" {...props}>
      <path d="M3 5.2 10.8 4v7.35H3V5.2Zm8.7-1.35L21 2.5v8.85h-9.3v-7.5ZM3 12.3h7.8V20L3 18.85V12.3Zm8.7 0H21v9.2l-9.3-1.35V12.3Z" />
    </svg>
  );
}

function LinuxPlatformIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M4 6.5h16v11H4z" />
      <path d="m8 10 2.2 2L8 14" />
      <path d="M13 14h3.5" />
    </svg>
  );
}

function ClashAppIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" {...props}>
      <rect x="4" y="5" width="16" height="13" rx="2.5" stroke="currentColor" strokeWidth="2" />
      <path d="M8 9h8M8 13h5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M9 20h6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function HiddifyAppIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" {...props}>
      <path d="M5 12a7 7 0 1 1 14 0v4.4A2.6 2.6 0 0 1 16.4 19H7.6A2.6 2.6 0 0 1 5 16.4V12Z" stroke="currentColor" strokeWidth="2" />
      <path d="M8.6 12.8h.01M12 12.8h.01M15.4 12.8h.01" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
      <path d="M8 8.6c1.02-.8 2.35-1.25 4-1.25s2.98.45 4 1.25" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function UseGuide({
  actionError,
  copiedOrderRef,
  created,
  locale,
  pending,
  selectedOrder,
  hasSetupAccess,
  walletFirstResource,
  nextWalletFirstSetupIdempotencyKey,
  clearWalletFirstSetupIdempotencyKey,
  portalClient,
  sessionRef,
  setActiveView,
  openMarketplace,
  revealOrCreateSubscriptionLink
}: {
  actionError: string;
  copiedOrderRef: string | null;
  created: CreatedSubscription | null;
  locale: PortalAuthLocale;
  pending: boolean;
  selectedOrder: PortalOrderRow | null;
  hasSetupAccess: boolean;
  walletFirstResource: PortalCurrentResource | null;
  nextWalletFirstSetupIdempotencyKey: () => string;
  clearWalletFirstSetupIdempotencyKey: () => void;
  portalClient: UserPortalClient;
  sessionRef: string | undefined;
  setActiveView: (value: PortalView) => void;
  openMarketplace: () => void;
  revealOrCreateSubscriptionLink: (
    clientTarget: PortalClientId,
    options?: { refreshExisting?: boolean }
  ) => Promise<string | null>;
}) {
  const desktopViewport = useDesktopScrollRegion();
  type GuidePlatformId = "ios" | "android" | "harmony" | "macos" | "windows" | "linux";
  type GuideClientId = "clash" | "clashmi" | "hiddify";
  type GuideStepAction = "download" | "copy" | "import" | "connect" | "verify";

  const [guideStarted, setGuideStarted] = useState(false);
  const [guidePlatform, setGuidePlatform] = useState<GuidePlatformId | null>(null);
  const [guideClient, setGuideClient] = useState<GuideClientId | null>(null);
  const [tutorialStepIndex, setTutorialStepIndex] = useState(0);
  const [visibleSubscriptionUrl, setVisibleSubscriptionUrl] = useState("");
  const [localLinkCopied, setLocalLinkCopied] = useState(false);
  const autoRevealKeyRef = useRef("");
  const guidePlatformOptions: Array<{ id: GuidePlatformId; title: string; detail: string; icon: ComponentType<SVGProps<SVGSVGElement>> }> = [
    {
      id: "ios",
      title: "Apple iOS",
      detail: "iPhone / iPad",
      icon: ApplePlatformIcon
    },
    {
      id: "android",
      title: "Android",
      detail: "Samsung, Xiaomi, etc.",
      icon: AndroidPlatformIcon
    },
    {
      id: "harmony",
      title: "HarmonyOS",
      detail: "Huawei",
      icon: HarmonyPlatformIcon
    },
    {
      id: "macos",
      title: "MacOS",
      detail: "Macbook / iMac",
      icon: ApplePlatformIcon
    },
    {
      id: "windows",
      title: "Windows",
      detail: "PC / Laptop",
      icon: WindowsPlatformIcon
    },
    {
      id: "linux",
      title: "Linux",
      detail: "Terminal / Server",
      icon: LinuxPlatformIcon
    }
  ];
  const guideClients: Record<GuideClientId, {
    name: string;
    subtitle: string;
    platformIds: GuidePlatformId[];
    clientTarget: PortalClientId;
    icon: ComponentType<SVGProps<SVGSVGElement>>;
    href: string;
    downloadText: string;
    steps: Array<{ title: string; detail: ReactNode; action: GuideStepAction }>;
  }> = {
    clash: {
      name: "Clash Verge Rev",
      subtitle: "Windows / macOS / Linux",
      platformIds: ["windows", "macos", "linux"],
      clientTarget: "clash",
      icon: ClashAppIcon,
      href: "https://www.clashverge.dev/install.html",
      downloadText: uiText(locale, "下载 Clash Verge Rev", "Download Clash Verge Rev"),
      steps: [
        {
          title: uiText(locale, "下载 Clash Verge Rev", "Download Clash Verge Rev"),
          detail: uiText(locale, "先安装并打开客户端。装好后回到本页，下一步会生成你的订阅链接。", "Install and open the client first. Return here after installing it, then generate your subscription link."),
          action: "download"
        },
        {
          title: uiText(locale, "复制你的订阅链接", "Copy your subscription link"),
          detail: uiText(locale, "点击生成并复制。这个链接只放进客户端，不要发给别人。", "Generate and copy the link. Put it only into your client and do not share it."),
          action: "copy"
        },
        {
          title: uiText(locale, "导入订阅链接", "Import the subscription link"),
          detail: locale === "zh"
            ? <>在客户端进入 <code>订阅</code>，选择 <code>从 URL 导入</code>，粘贴刚复制的链接并点击导入。</>
            : <>In the client, open <code>Subscriptions</code>, choose <code>Import from URL</code>, paste the link, and update.</>,
          action: "import"
        },
        {
          title: uiText(locale, "选择线路并连接", "Choose a route and connect"),
          detail: locale === "zh"
            ? <>更新完成后选择一条可用线路，再打开 <code>系统代理</code> 或连接开关。</>
            : <>After updating, choose an available route and enable <code>System proxy</code> or the connection switch.</>,
          action: "connect"
        },
        {
          title: uiText(locale, "检查是否可用", "Check that it works"),
          detail: uiText(locale, "打开你要使用的网站或应用。如果能正常加载，说明配置已经生效；如果不可用，先更新订阅或换一条线路。", "Open the site or app you need. If it loads normally, setup is active. If not, update the subscription or try another route."),
          action: "verify"
        }
      ]
    },
    clashmi: {
      name: "Clash Mi",
      subtitle: "iOS / Android / HarmonyOS",
      platformIds: ["ios", "android", "harmony"],
      clientTarget: "clash",
      icon: ClashAppIcon,
      href: "https://clashmi.app/download",
      downloadText: uiText(locale, "打开 Clash Mi 下载页", "Open Clash Mi download"),
      steps: [
        {
          title: uiText(locale, "安装 Clash Mi", "Install Clash Mi"),
          detail: uiText(locale, "安装完成后回到本页继续生成订阅链接。", "Return here after installation to generate your subscription link."),
          action: "download"
        },
        {
          title: uiText(locale, "复制你的订阅链接", "Copy your subscription link"),
          detail: uiText(locale, "点击生成并复制。这个链接只放进客户端，不要发给别人。", "Generate and copy the link. Put it only into your client and do not share it."),
          action: "copy"
        },
        {
          title: uiText(locale, "导入订阅链接", "Import the subscription link"),
          detail: locale === "zh"
            ? <>在 Clash Mi 的配置或订阅页面选择 <code>从 URL 导入</code>，粘贴链接并确认导入。</>
            : <>In Clash Mi, open the configuration or subscription page, choose <code>Import from URL</code>, then paste and import the link.</>,
          action: "import"
        },
        {
          title: uiText(locale, "允许 VPN 并连接", "Allow VPN and connect"),
          detail: uiText(locale, "选择刚导入的配置，允许系统 VPN 权限，然后打开连接开关。", "Select the imported profile, allow the system VPN permission, then turn on the connection."),
          action: "connect"
        },
        {
          title: uiText(locale, "检查是否可用", "Check that it works"),
          detail: uiText(locale, "打开你要使用的网站或应用。如果能正常加载，说明配置已经生效；如果不可用，先更新订阅或换一条线路。", "Open the site or app you need. If it loads normally, setup is active. If not, update the subscription or try another route."),
          action: "verify"
        }
      ]
    },
    hiddify: {
      name: "Hiddify",
      subtitle: uiText(locale, "备用客户端", "Backup client"),
      platformIds: ["ios", "android", "harmony", "macos", "windows", "linux"],
      clientTarget: "clash",
      icon: HiddifyAppIcon,
      href: "https://github.com/hiddify/hiddify-app/releases",
      downloadText: uiText(locale, "查看 Hiddify 发布版", "View Hiddify releases"),
      steps: [
        {
          title: uiText(locale, "安装 Hiddify", "Install Hiddify"),
          detail: uiText(locale, "如果首选客户端装不了，再选 Hiddify。请下载与你设备匹配的版本，装好后回到本页。", "Use Hiddify if the preferred client cannot be installed. Download the release that matches your device, then return here."),
          action: "download"
        },
        {
          title: uiText(locale, "复制你的订阅链接", "Copy your subscription link"),
          detail: uiText(locale, "点击生成并复制。这个链接只给当前账号使用，不要发给别人。", "Generate and copy the link. It is only for this account, so do not share it."),
          action: "copy"
        },
        {
          title: uiText(locale, "导入订阅链接", "Import the subscription link"),
          detail: locale === "zh"
            ? <>在 Hiddify 首页点击 <code>+</code>，优先选择 <code>Add from clipboard</code>，也可以手动把链接填入 URL。</>
            : <>In Hiddify, add a profile and import by <code>Subscription link</code> or <code>URL</code>.</>,
          action: "import"
        },
        {
          title: uiText(locale, "刷新配置并连接", "Refresh and connect"),
          detail: uiText(locale, "保存后刷新配置，选择一条可用线路，然后打开连接开关。", "Save, refresh the profile, choose an available route, then turn on the connection."),
          action: "connect"
        },
        {
          title: uiText(locale, "检查是否可用", "Check that it works"),
          detail: uiText(locale, "打开你要使用的网站或应用。如果能正常加载，说明配置已经生效；如果不可用，先更新订阅或换一条线路。", "Open the site or app you need. If it loads normally, setup is active. If not, update the subscription or try another route."),
          action: "verify"
        }
      ]
    }
  };
  const currentPlatform = guidePlatformOptions.find((item) => item.id === guidePlatform) ?? null;
  const currentClientOptions = guidePlatform
    ? (Object.entries(guideClients) as Array<[GuideClientId, typeof guideClients[GuideClientId]]>)
      .filter(([, guide]) => guide.platformIds.includes(guidePlatform))
    : [];
  const selectedGuide = guideClient ? guideClients[guideClient] : null;
  const activeGuideStep = selectedGuide?.steps[tutorialStepIndex] ?? null;
  const selectedGuideClientTarget = selectedGuide?.clientTarget ?? null;
  useEffect(() => {
    if (activeGuideStep?.action !== "copy" || visibleSubscriptionUrl || !selectedOrder?.subscriptionUrl) {
      return;
    }
    setVisibleSubscriptionUrl(selectedOrder.subscriptionUrl);
    setLocalLinkCopied(false);
  }, [activeGuideStep?.action, selectedOrder?.requestRef, selectedOrder?.subscriptionUrl, visibleSubscriptionUrl]);
  useEffect(() => {
    if (
      walletFirstResource
      ||
      activeGuideStep?.action !== "copy"
      || visibleSubscriptionUrl
      || pending
      || !selectedGuideClientTarget
      || selectedOrder?.status !== "active"
    ) {
      return;
    }
    const revealKey = `${selectedGuideClientTarget}:${selectedOrder.requestRef}`;
    if (autoRevealKeyRef.current === revealKey) {
      return;
    }
    autoRevealKeyRef.current = revealKey;
    void revealOrCreateSubscriptionLink(selectedGuideClientTarget).then((link) => {
      if (!link) return;
      setVisibleSubscriptionUrl(link);
      setLocalLinkCopied(false);
    });
  }, [
    activeGuideStep?.action,
    pending,
    revealOrCreateSubscriptionLink,
    selectedGuideClientTarget,
    selectedOrder?.status,
    selectedOrder?.requestRef,
    visibleSubscriptionUrl,
    walletFirstResource
  ]);

  type ImportTutorial = {
    sourceLabel: string;
    sourceUrl: string;
    sourceHint: string;
    surface: "desktop" | "mobile" | "modal";
    screenTitle: string;
    imageSrc?: string;
    imageAlt?: string;
    sideItems: string[];
    activeSideItem: string;
    entryLabel: string;
    inputLabel: string;
    inputPlaceholder: string;
    confirmLabel: string;
    resultLabel: string;
    callouts: string[];
  };
  type ConnectGuide = {
    caption: string;
    steps: string[];
    verifySteps: string[];
  };
  const importTutorials: Record<GuideClientId, ImportTutorial> = {
    clash: {
      sourceLabel: locale === "zh" ? "Clash Verge Rev 官方订阅导入文档" : "Clash Verge Rev subscription import docs",
      sourceUrl: "https://clashvergerev.com/en/guide/profile",
      sourceHint: locale === "zh" ? "参考 Remote Subscription / Subscription URL Import 路径" : "Based on Remote Subscription / Subscription URL Import",
      surface: "desktop",
      screenTitle: locale === "zh" ? "订阅 URL 导入" : "Subscription URL Import",
      imageSrc: "/guide/clash-subscription-import.png",
      imageAlt: locale === "zh"
        ? "Clash Verge Rev 订阅页面导入订阅文件链接教程截图"
        : "Clash Verge Rev subscription import screenshot",
      sideItems: locale === "zh" ? ["首页", "代理", "订阅", "连接", "规则", "日志", "设置"] : ["Home", "Proxies", "Subscriptions", "Connections", "Rules", "Logs", "Settings"],
      activeSideItem: locale === "zh" ? "订阅" : "Subscriptions",
      entryLabel: locale === "zh" ? "新建 / URL" : "New / URL",
      inputLabel: locale === "zh" ? "订阅文件链接" : "Subscription file URL",
      inputPlaceholder: locale === "zh" ? "粘贴订阅链接" : "Paste subscription link",
      confirmLabel: locale === "zh" ? "导入" : "Import",
      resultLabel: locale === "zh" ? "导入成功后会出现订阅配置卡片" : "A subscription profile card appears after import",
      callouts: locale === "zh"
        ? ["打开左侧订阅", "把链接粘贴到订阅文件链接", "点击导入并等待更新完成"]
        : ["Open Subscriptions", "Paste the link into Subscription file URL", "Click Import and wait for update"]
    },
    clashmi: {
      sourceLabel: locale === "zh" ? "Clash Mi 官方下载页" : "Clash Mi official download",
      sourceUrl: "https://clashmi.app/download",
      sourceHint: locale === "zh" ? "Android：参考从 URL 导入路径" : "Android: use the import-from-URL path",
      surface: "mobile",
      screenTitle: locale === "zh" ? "从 URL 导入订阅" : "Import subscription from URL",
      sideItems: locale === "zh" ? ["首页", "配置", "订阅"] : ["Home", "Profiles", "Subscriptions"],
      activeSideItem: locale === "zh" ? "订阅" : "Subscriptions",
      entryLabel: "+",
      inputLabel: locale === "zh" ? "订阅链接" : "Subscription link",
      inputPlaceholder: locale === "zh" ? "填入订阅链接" : "Paste subscription URL",
      confirmLabel: locale === "zh" ? "Import" : "Import",
      resultLabel: locale === "zh" ? "添加成功后返回主屏幕连接" : "Return to the main screen after adding it",
      callouts: locale === "zh"
        ? ["打开 Clash Mi，进入配置或订阅页面", "选择从 URL 导入", "粘贴订阅链接并确认导入"]
        : ["Open Clash Mi and enter Profiles or Subscriptions", "Choose Import from URL", "Paste the subscription link and import"]
    },
    hiddify: {
      sourceLabel: locale === "zh" ? "Hiddify 官方 App 使用教程" : "Hiddify official app guide",
      sourceUrl: "https://hiddify.com/app/How-to-use-Hiddify-app/",
      sourceHint: locale === "zh" ? "参考 Home + Add from clipboard / Add manually 路径" : "Based on Home + Add from clipboard / Add manually",
      surface: "modal",
      screenTitle: locale === "zh" ? "添加 Profile" : "Add profile",
      sideItems: locale === "zh" ? ["Home", "Proxies", "Settings"] : ["Home", "Proxies", "Settings"],
      activeSideItem: "Home",
      entryLabel: "+",
      inputLabel: locale === "zh" ? "Add from clipboard / URL" : "Add from clipboard / URL",
      inputPlaceholder: locale === "zh" ? "从剪贴板读取，或手动粘贴 URL" : "Read from clipboard or paste URL manually",
      confirmLabel: locale === "zh" ? "Save" : "Save",
      resultLabel: locale === "zh" ? "Profile 添加后回到 Home 点击连接" : "After adding the profile, return Home and connect",
      callouts: locale === "zh"
        ? ["Home 页面点击 +", "优先选 Add from clipboard", "失败时手动填入 URL 后保存"]
        : ["Tap + on Home", "Prefer Add from clipboard", "If needed, paste URL manually and save"]
    }
  };
  const platformImportTutorials: Partial<Record<GuideClientId, Partial<Record<GuidePlatformId, Partial<ImportTutorial>>>>> = {
    clash: {
      windows: {
        sourceHint: locale === "zh" ? "Windows：参考 Remote Subscription / Subscription URL Import 路径" : "Windows: based on Remote Subscription / Subscription URL Import",
        callouts: locale === "zh"
          ? ["打开左侧订阅", "把链接粘贴到订阅文件链接", "点击导入并等待更新完成"]
          : ["Open Subscriptions", "Paste the link into Subscription file URL", "Click Import and wait for update"]
      },
      macos: {
        sourceHint: locale === "zh" ? "macOS：参考 Remote Subscription / Subscription URL Import 路径" : "macOS: based on Remote Subscription / Subscription URL Import",
        callouts: locale === "zh"
          ? ["打开左侧订阅", "把链接粘贴到订阅文件链接", "点击导入并等待更新完成"]
          : ["Open Subscriptions", "Paste the link into Subscription file URL", "Click Import and wait for update"]
      },
      linux: {
        sourceHint: locale === "zh" ? "Linux：先完成订阅导入，后续连接时再按桌面环境处理系统代理" : "Linux: import the subscription first, then handle system proxy according to your desktop environment",
        callouts: locale === "zh"
          ? ["打开左侧订阅", "粘贴订阅文件链接", "点击导入；失败时先检查网络和客户端权限"]
          : ["Open Subscriptions", "Paste the subscription file URL", "Import; if it fails, check network and client permissions"]
      }
    },
    clashmi: {
      ios: {
        sourceHint: locale === "zh" ? "iOS：打开我的配置后，通过右上角 + 添加配置链接" : "iOS: open My Profiles, then use + to add a configuration link",
        resultLabel: locale === "zh" ? "添加完成后返回首页，下一步允许 iOS VPN 配置" : "After importing, return Home and allow the iOS VPN configuration next",
        callouts: locale === "zh"
          ? ["打开 Clash Mi 的我的配置", "点击右上角 + 并选择添加配置链接", "粘贴订阅链接后确认添加"]
          : ["Open My Profiles in Clash Mi", "Tap + and choose Add configuration link", "Paste the subscription link and confirm"]
      },
      android: {
        sourceHint: locale === "zh" ? "Android：参考 Clash Mi 从 URL 导入路径" : "Android: use Clash Mi import from URL",
        resultLabel: locale === "zh" ? "导入完成后返回首页，下一步允许 VPN 连接请求" : "After importing, return Home and allow the VPN connection request next",
        callouts: locale === "zh"
          ? ["打开 Clash Mi，进入配置或订阅页面", "选择从 URL 导入", "粘贴订阅链接并确认导入"]
          : ["Open Clash Mi and enter Profiles or Subscriptions", "Choose Import from URL", "Paste the subscription link and import"]
      },
      harmony: {
        sourceHint: locale === "zh" ? "HarmonyOS：按 Android 兼容流程从 URL 导入 Clash Mi 订阅" : "HarmonyOS: use the Android-compatible Clash Mi import-from-URL flow",
        resultLabel: locale === "zh" ? "导入完成后返回首页，下一步允许 VPN/网络权限" : "After importing, return Home and allow VPN/network permissions next",
        callouts: locale === "zh"
          ? ["打开 Clash Mi，进入配置或订阅页面", "选择从 URL 导入", "粘贴订阅链接并允许系统权限提示"]
          : ["Open Clash Mi and enter Profiles or Subscriptions", "Choose Import from URL", "Paste the link and allow system prompts"]
      }
    },
    hiddify: {
      ios: {
        sourceHint: locale === "zh" ? "iOS / iPadOS：参考 Home + Add from clipboard 路径" : "iOS / iPadOS: based on Home + Add from clipboard",
        resultLabel: locale === "zh" ? "添加 Profile 后，下一步允许 VPN 配置并连接" : "After adding the profile, allow VPN configuration and connect next",
        callouts: locale === "zh"
          ? ["Home 页面点击 +", "优先选 Add from clipboard", "失败时用 Add manually 填 URL"]
          : ["Tap + on Home", "Prefer Add from clipboard", "Use Add manually with URL if needed"]
      },
      android: {
        sourceHint: locale === "zh" ? "Android：参考 Home + Add from clipboard / Add manually 路径" : "Android: based on Home + Add from clipboard / Add manually",
        resultLabel: locale === "zh" ? "添加 Profile 后，下一步允许 VPN 连接请求" : "After adding the profile, allow the VPN connection request next",
        callouts: locale === "zh"
          ? ["Home 页面点击 +", "优先选 Add from clipboard", "失败时用 Add manually 填 URL"]
          : ["Tap + on Home", "Prefer Add from clipboard", "Use Add manually with URL if needed"]
      },
      harmony: {
        sourceHint: locale === "zh" ? "HarmonyOS：按 Android 兼容流程添加 Hiddify Profile" : "HarmonyOS: add the Hiddify profile through the Android-compatible flow",
        resultLabel: locale === "zh" ? "添加 Profile 后，下一步允许 VPN/网络权限" : "After adding the profile, allow VPN/network permissions next",
        callouts: locale === "zh"
          ? ["Home 页面点击 +", "优先选 Add from clipboard", "失败时用 Add manually 填 URL"]
          : ["Tap + on Home", "Prefer Add from clipboard", "Use Add manually with URL if needed"]
      },
      windows: {
        sourceHint: locale === "zh" ? "Windows：参考 Home + Add from clipboard / Add manually 路径" : "Windows: based on Home + Add from clipboard / Add manually",
        resultLabel: locale === "zh" ? "Profile 添加后回到 Home，下一步开启连接" : "After adding the profile, return Home and connect next",
        callouts: locale === "zh"
          ? ["Home 页面点击 +", "优先选 Add from clipboard", "失败时用 Add manually 填 URL 后保存"]
          : ["Click + on Home", "Prefer Add from clipboard", "Use Add manually with URL and save if needed"]
      },
      macos: {
        sourceHint: locale === "zh" ? "macOS：参考 Home + Add from clipboard / Add manually 路径" : "macOS: based on Home + Add from clipboard / Add manually",
        resultLabel: locale === "zh" ? "Profile 添加后回到 Home，下一步开启连接并允许系统权限" : "After adding the profile, return Home, connect, and allow system permissions next",
        callouts: locale === "zh"
          ? ["Home 页面点击 +", "优先选 Add from clipboard", "失败时用 Add manually 填 URL 后保存"]
          : ["Click + on Home", "Prefer Add from clipboard", "Use Add manually with URL and save if needed"]
      },
      linux: {
        sourceHint: locale === "zh" ? "Linux：参考 Home + Add from clipboard / Add manually 路径" : "Linux: based on Home + Add from clipboard / Add manually",
        resultLabel: locale === "zh" ? "Profile 添加后回到 Home，下一步按桌面环境开启连接" : "After adding the profile, return Home and connect according to your desktop environment next",
        callouts: locale === "zh"
          ? ["Home 页面点击 +", "优先选 Add from clipboard", "失败时用 Add manually 填 URL 后保存"]
          : ["Click + on Home", "Prefer Add from clipboard", "Use Add manually with URL and save if needed"]
      }
    }
  };
  const connectGuides: Partial<Record<GuideClientId, Partial<Record<GuidePlatformId, ConnectGuide>>>> = {
    clash: {
      windows: {
        caption: locale === "zh" ? "按图操作：进入设置，打开系统代理开关；如果仍不可用，再返回代理页更换线路。" : "Follow the screenshot: open Settings and enable System Proxy. If it still does not work, return to Proxies and switch routes.",
        steps: locale === "zh" ? ["进入代理选择线路", "打开设置里的系统代理", "回到首页确认流量变化"] : ["Choose a route in Proxies", "Enable System Proxy in Settings", "Return Home and check traffic"],
        verifySteps: locale === "zh" ? ["浏览器能打开目标网站", "系统代理已开启", "不可用时更新订阅或换线路"] : ["Target site loads", "System Proxy is enabled", "If unavailable, update subscription or switch route"]
      },
      macos: {
        caption: locale === "zh" ? "按图操作：进入设置，打开系统代理；如 macOS 弹出网络权限，请允许。" : "Follow the screenshot: open Settings and enable System Proxy. Allow macOS network permissions if prompted.",
        steps: locale === "zh" ? ["进入代理选择线路", "开启系统代理并允许 macOS 权限", "回到首页确认连接"] : ["Choose a route in Proxies", "Enable System Proxy and allow macOS permissions", "Return Home and confirm connection"],
        verifySteps: locale === "zh" ? ["浏览器能打开目标网站", "客户端显示系统代理已开启", "不可用时更新订阅或换线路"] : ["Target site loads", "Client shows System Proxy enabled", "If unavailable, update subscription or switch route"]
      },
      linux: {
        caption: locale === "zh" ? "按图操作：先开启系统代理；如果桌面环境未接管代理，再检查系统网络代理或 TUN 设置。" : "Follow the screenshot: enable System Proxy first. If the desktop environment does not pick it up, check system proxy or TUN settings.",
        steps: locale === "zh" ? ["进入代理选择线路", "开启系统代理或 TUN", "检查桌面网络代理是否生效"] : ["Choose a route in Proxies", "Enable System Proxy or TUN", "Check whether desktop network proxy is active"],
        verifySteps: locale === "zh" ? ["浏览器能打开目标网站", "客户端显示已连接", "不可用时检查系统代理/TUN 或换线路"] : ["Target site loads", "Client shows connected", "If unavailable, check system proxy/TUN or switch route"]
      }
    },
    clashmi: {
      ios: {
        caption: locale === "zh" ? "iOS 首次连接会请求添加 VPN 配置，允许后再等待连接完成。" : "iOS requests permission to add a VPN configuration on first connection; allow it and wait for connection.",
        steps: locale === "zh" ? ["返回 Clash Mi 首页", "点击连接并允许 VPN 配置", "状态变为已连接"] : ["Return to Clash Mi Home", "Tap connect and allow the VPN configuration", "Status changes to connected"],
        verifySteps: locale === "zh" ? ["浏览器能打开目标网站", "状态栏显示 VPN 图标", "不可用时更新订阅或换线路"] : ["Target site loads", "The VPN icon appears in the status bar", "If unavailable, update the subscription or switch routes"]
      },
      android: {
        caption: locale === "zh" ? "Android 首次连接会弹出 VPN 连接请求，允许后再等待连接完成。" : "Android prompts for a VPN connection request on first connect; allow it and wait for connection.",
        steps: locale === "zh" ? ["返回 Clash Mi 首页", "点击连接并允许 VPN 请求", "状态变为已连接"] : ["Return to Clash Mi Home", "Tap connect and allow VPN request", "Status changes to connected"],
        verifySteps: locale === "zh" ? ["浏览器能打开目标网站", "系统显示 VPN 正在运行", "不可用时更新订阅或换线路"] : ["Target site loads", "System shows VPN is running", "If unavailable, update subscription or switch route"]
      },
      harmony: {
        caption: locale === "zh" ? "HarmonyOS 按 Android 兼容流程处理，首次连接时允许 VPN/网络权限。" : "HarmonyOS follows the Android-compatible flow; allow VPN/network permissions on first connect.",
        steps: locale === "zh" ? ["返回 Clash Mi 首页", "点击连接并允许系统权限", "状态变为已连接"] : ["Return to Clash Mi Home", "Tap connect and allow system permissions", "Status changes to connected"],
        verifySteps: locale === "zh" ? ["浏览器能打开目标网站", "系统显示 VPN/网络代理运行", "不可用时更新订阅或换线路"] : ["Target site loads", "System shows VPN/network proxy running", "If unavailable, update subscription or switch route"]
      }
    },
    hiddify: {
      ios: {
        caption: locale === "zh" ? "iOS 首次连接 Hiddify 时允许 VPN 配置。" : "Allow VPN configuration the first time Hiddify connects on iOS.",
        steps: locale === "zh" ? ["返回 Home 选择 Profile", "点击连接并允许 VPN 配置", "状态变为 Connected"] : ["Return Home and choose the profile", "Tap connect and allow VPN configuration", "Status changes to Connected"],
        verifySteps: locale === "zh" ? ["浏览器能打开目标网站", "状态栏出现 VPN 图标", "不可用时更新 Profile 或换线路"] : ["Target site loads", "VPN icon appears in the status bar", "If unavailable, update profile or switch route"]
      },
      android: {
        caption: locale === "zh" ? "Android 首次连接 Hiddify 时允许 VPN 连接请求。" : "Allow the VPN connection request the first time Hiddify connects on Android.",
        steps: locale === "zh" ? ["返回 Home 选择 Profile", "点击连接并允许 VPN 请求", "状态变为 Connected"] : ["Return Home and choose the profile", "Tap connect and allow VPN request", "Status changes to Connected"],
        verifySteps: locale === "zh" ? ["浏览器能打开目标网站", "系统显示 VPN 正在运行", "不可用时更新 Profile 或换线路"] : ["Target site loads", "System shows VPN is running", "If unavailable, update profile or switch route"]
      },
      harmony: {
        caption: locale === "zh" ? "HarmonyOS 按 Android 兼容流程处理，首次连接时允许 VPN/网络权限。" : "HarmonyOS follows the Android-compatible flow; allow VPN/network permissions on first connect.",
        steps: locale === "zh" ? ["返回 Home 选择 Profile", "点击连接并允许系统权限", "状态变为 Connected"] : ["Return Home and choose the profile", "Tap connect and allow system permissions", "Status changes to Connected"],
        verifySteps: locale === "zh" ? ["浏览器能打开目标网站", "系统显示 VPN/网络代理运行", "不可用时更新 Profile 或换线路"] : ["Target site loads", "System shows VPN/network proxy running", "If unavailable, update profile or switch route"]
      },
      windows: {
        caption: locale === "zh" ? "桌面端连接后如浏览器未生效，检查 Hiddify 的系统代理或 TUN 设置。" : "On desktop, if the browser does not use the connection, check Hiddify system proxy or TUN settings.",
        steps: locale === "zh" ? ["返回 Home 选择 Profile", "点击连接", "必要时开启系统代理或 TUN"] : ["Return Home and choose the profile", "Click connect", "Enable system proxy or TUN if needed"],
        verifySteps: locale === "zh" ? ["浏览器能打开目标网站", "Hiddify 显示 Connected", "不可用时检查系统代理/TUN 或换线路"] : ["Target site loads", "Hiddify shows Connected", "If unavailable, check system proxy/TUN or switch route"]
      },
      macos: {
        caption: locale === "zh" ? "macOS 桌面端连接后如浏览器未生效，允许系统网络权限并检查系统代理或 TUN。" : "On macOS, if the browser does not use the connection, allow network permissions and check system proxy or TUN.",
        steps: locale === "zh" ? ["返回 Home 选择 Profile", "点击连接并允许系统权限", "必要时开启系统代理或 TUN"] : ["Return Home and choose the profile", "Click connect and allow system permissions", "Enable system proxy or TUN if needed"],
        verifySteps: locale === "zh" ? ["浏览器能打开目标网站", "Hiddify 显示 Connected", "不可用时检查系统代理/TUN 或换线路"] : ["Target site loads", "Hiddify shows Connected", "If unavailable, check system proxy/TUN or switch route"]
      },
      linux: {
        caption: locale === "zh" ? "Linux 桌面环境差异较大，连接后重点检查系统代理或 TUN 是否真正接管。" : "Linux desktop environments vary; after connecting, check whether system proxy or TUN actually takes over.",
        steps: locale === "zh" ? ["返回 Home 选择 Profile", "点击连接", "检查系统代理或 TUN 是否生效"] : ["Return Home and choose the profile", "Click connect", "Check whether system proxy or TUN is active"],
        verifySteps: locale === "zh" ? ["浏览器能打开目标网站", "Hiddify 显示 Connected", "不可用时检查系统代理/TUN 或换线路"] : ["Target site loads", "Hiddify shows Connected", "If unavailable, check system proxy/TUN or switch route"]
      }
    }
  };
  const importOverride = guideClient && guidePlatform
    ? platformImportTutorials[guideClient]?.[guidePlatform]
    : undefined;
  const activeImportTutorial = guideClient
    ? { ...importTutorials[guideClient], ...importOverride }
    : null;
  const connectGuide = guideClient && guidePlatform
    ? connectGuides[guideClient]?.[guidePlatform]
    : undefined;
  const connectGuideSteps = connectGuide?.steps ?? (locale === "zh"
    ? ["选择线路", "开启连接", "返回首页查看用量"]
    : ["Choose a route", "Connect", "Check usage later"]);
  const verifyGuideSteps = connectGuide?.verifySteps ?? (locale === "zh"
    ? ["目标网站可打开", "客户端显示已连接", "不可用时更新订阅或换线路"]
    : ["Target site loads", "Client shows connected", "If unavailable, update subscription or switch route"]);
  const selectPlatform = (platformId: GuidePlatformId) => {
    setGuidePlatform(platformId);
    setGuideClient(null);
    setTutorialStepIndex(0);
    setVisibleSubscriptionUrl("");
    setLocalLinkCopied(false);
  };
  const selectClient = (clientId: GuideClientId) => {
    setGuideClient(clientId);
    setTutorialStepIndex(0);
    setVisibleSubscriptionUrl("");
    setLocalLinkCopied(false);
  };
  const startSetup = () => {
    if (walletFirstResource) return;
    if (!hasSetupAccess) {
      openMarketplace();
      return;
    }
    setGuideStarted(true);
  };
  const goNextInGuide = () => {
    if (!selectedGuide) return;
    if (tutorialStepIndex < selectedGuide.steps.length - 1) {
      setTutorialStepIndex(tutorialStepIndex + 1);
    }
  };
  const guideStepIcon = (action: GuideStepAction): LucideIcon => {
    switch (action) {
      case "download":
        return Download;
      case "copy":
        return Copy;
      case "import":
        return AppWindow;
      case "connect":
        return Wifi;
      case "verify":
        return CheckCircle2;
      default:
        return CheckCircle2;
    }
  };
  const ActiveGuideStepIcon = activeGuideStep ? guideStepIcon(activeGuideStep.action) : CheckCircle2;
  const SelectedGuideClientIcon = selectedGuide?.icon ?? AppWindow;
  const needsPlanDesktop = desktopViewport && !hasSetupAccess;

  if (walletFirstResource) {
    return (
      <>
        <WalletFirstCurrentResourceStatus
          resource={walletFirstResource}
          locale={locale}
          onOpenMarketplace={openMarketplace}
        />
        <WalletFirstSetupDeliveryPanel
          clearIdempotencyKey={clearWalletFirstSetupIdempotencyKey}
          locale={locale}
          nextIdempotencyKey={nextWalletFirstSetupIdempotencyKey}
          portalClient={portalClient}
          resource={walletFirstResource}
          sessionRef={sessionRef}
        />
      </>
    );
  }

  return (
    <section
      aria-label={uiText(locale, "开始使用", "Start guide")}
      className="portal-use-card portal-start-guide"
      data-access={needsPlanDesktop ? "needs-plan" : undefined}
    >
      {!guideStarted ? (
        <div className="portal-start-flow-panel portal-start-stage portal-start-welcome-stage">
          <span className="portal-start-kicker">
            {needsPlanDesktop
              ? uiText(locale, "开始前", "Before you start")
              : uiText(locale, "快速使用指南", "Quick start guide")}
          </span>
          <h2>
            {needsPlanDesktop
              ? uiText(locale, "先选择适合你的套餐", "Choose a plan first")
              : uiText(locale, "欢迎使用", "Welcome")}
          </h2>
          <p>
            {needsPlanDesktop
              ? uiText(locale, "使用 Coins 购买并完成交付后，再选择设备和客户端开始连接。", "Purchase with Coins and wait for delivery, then choose a device and client to connect.")
              : uiText(locale, "只需几分钟，我们将一步步指引您完成配置。", "It only takes a few minutes. We will guide you through setup step by step.")}
          </p>
          <button className="portal-start-config-button" type="button" onClick={startSetup}>
            {needsPlanDesktop
              ? uiText(locale, "前往商城", "Go to Marketplace")
              : uiText(locale, "开始配置", "Start setup")}
            <ChevronRight aria-hidden="true" />
          </button>
        </div>
      ) : !guidePlatform ? (
        <div className="portal-start-flow-panel portal-start-stage portal-start-device-stage">
          <div className="portal-start-device-heading">
            <span className="portal-start-kicker">{uiText(locale, "第 1 步", "Step 1")}</span>
            <h2>{uiText(locale, "你要在哪台设备上使用？", "Which device will you use?")}</h2>
            <p>{uiText(locale, "选你手上的设备，下一步只显示适合它的客户端。", "Choose the device in front of you. Next we only show clients that fit it.")}</p>
          </div>
          <div className="portal-start-option-list portal-start-platform-options">
            {guidePlatformOptions.map((item) => {
              const Icon = item.icon;
              return (
                <button key={item.id} type="button" className="portal-start-option portal-start-platform-option" onClick={() => selectPlatform(item.id)}>
                  <Icon className="portal-start-platform-icon" aria-hidden="true" />
                  <span className="portal-start-option-copy">
                    <strong><NoTranslateText>{item.title}</NoTranslateText></strong>
                    <span><NoTranslateText>{item.detail}</NoTranslateText></span>
                  </span>
                  <ChevronRight aria-hidden="true" />
                </button>
              );
            })}
          </div>
        </div>
      ) : !selectedGuide ? (
        <div className="portal-start-flow-panel portal-start-stage portal-start-client-stage">
          <div className="portal-start-device-heading">
            <span className="portal-start-kicker">{uiText(locale, "第 2 步", "Step 2")}</span>
            <h2>{uiText(locale, "选择一个客户端", "Choose one client")}</h2>
            <p>
              {currentPlatform
                ? uiText(locale, `${currentPlatform.title} 推荐如下。新手优先选默认客户端，装好后回到这里继续。`, `Recommended for ${currentPlatform.title}. New users should choose the default client, install it, then return here.`)
                : uiText(locale, "选择后进入对应教程。", "Choose a client to continue.")}
            </p>
          </div>
          <div className="portal-start-option-list portal-start-client-options">
            {currentClientOptions.map(([id, item]) => {
              const Icon = item.icon;
              return (
                <button key={id} type="button" className="portal-start-option portal-start-platform-option portal-start-client-option" onClick={() => selectClient(id)}>
                  <Icon className="portal-start-platform-icon" aria-hidden="true" />
                  <span className="portal-start-option-copy">
                    <strong><NoTranslateText>{item.name}</NoTranslateText></strong>
                    <span>{item.subtitle}</span>
                  </span>
                  <ChevronRight aria-hidden="true" />
                </button>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="portal-start-flow-panel portal-start-tutorial portal-start-stage">
          {activeGuideStep ? (
            <article className={cn("portal-start-choice-card portal-start-device-option portal-start-step-focus portal-start-step-option", `portal-start-step-option-${activeGuideStep.action}`)}>
              <span className="portal-start-step-badge">
                {`STEP ${tutorialStepIndex + 1} / ${selectedGuide.steps.length}`}
              </span>
              <ActiveGuideStepIcon aria-hidden="true" />
              <strong>{activeGuideStep.title}</strong>
              <span className="portal-start-step-client">
                <NoTranslateText>{selectedGuide.name}</NoTranslateText>
                {" · "}
                {currentPlatform ? <NoTranslateText>{currentPlatform.title}</NoTranslateText> : selectedGuide.subtitle}
              </span>
              <span className="portal-start-step-detail">{activeGuideStep.detail}</span>
              {activeGuideStep.action === "download" ? (
                <a
                  className="portal-primary-button compact portal-v2-download-link"
                  href={selectedGuide.href}
                  target="_blank"
                  rel="noreferrer"
                  aria-label={selectedGuide.downloadText}
                >
                  <Download aria-hidden="true" />
                  {selectedGuide.downloadText}
                  <ExternalLink aria-hidden="true" />
                </a>
              ) : null}
              {activeGuideStep.action === "copy" ? (
                <div className="portal-start-link-panel">
                  <label className="portal-start-link-field">
                    <span>{uiText(locale, "订阅链接", "Subscription link")}</span>
                    <textarea
                      readOnly
                      rows={3}
                      value={visibleSubscriptionUrl}
                      aria-label={uiText(locale, "订阅链接", "Subscription link")}
                      placeholder={uiText(locale, "链接生成后会显示在这里。", "The link will appear here once generated.")}
                    />
                  </label>
                  <div className="portal-start-copy-row">
                    <button
                      className="portal-secondary-button compact"
                      type="button"
                      disabled={pending}
                      onClick={async () => {
                        const link = await revealOrCreateSubscriptionLink(selectedGuide.clientTarget, {
                          refreshExisting: Boolean(visibleSubscriptionUrl)
                        });
                        if (link) {
                          setVisibleSubscriptionUrl(link);
                          setLocalLinkCopied(false);
                        }
                      }}
                    >
                      <RefreshCw aria-hidden="true" />
                      {visibleSubscriptionUrl
                        ? uiText(locale, "刷新链接", "Refresh link")
                        : uiText(locale, "生成订阅链接", "Generate link")}
                    </button>
                    <button
                      className="portal-primary-button compact"
                      type="button"
                      disabled={pending || !visibleSubscriptionUrl}
                      onClick={async () => {
                        await copyText(visibleSubscriptionUrl);
                        setLocalLinkCopied(true);
                        window.setTimeout(() => setLocalLinkCopied(false), 1800);
                      }}
                    >
                      <Copy aria-hidden="true" />
                      {localLinkCopied || (selectedOrder && copiedOrderRef === selectedOrder.requestRef)
                        ? uiText(locale, "已复制", "Copied")
                        : uiText(locale, "复制链接", "Copy link")}
                    </button>
                  </div>
                  {visibleSubscriptionUrl ? (
                    <p className="portal-start-link-help">
                      {uiText(locale, "如果复制按钮不可用，请直接选中上方链接手动复制。", "If copy is unavailable, select the link above and copy it manually.")}
                    </p>
                  ) : null}
                  {!hasSetupAccess && !visibleSubscriptionUrl ? (
                    <button className="portal-link-button" type="button" onClick={openMarketplace}>
                      {uiText(locale, "需要流量权益？前往商城", "Need traffic entitlement? Go to Marketplace")}
                    </button>
                  ) : null}
                  {actionError ? <div className="alert alert-error">{actionError}</div> : null}
                </div>
              ) : null}
              {activeGuideStep.action === "import" ? (
                activeImportTutorial ? (
                  <div className="portal-start-visual-guide-card portal-start-import-tutorial-card" aria-label={uiText(locale, "导入订阅链接图形教程", "Subscription import visual guide")}>
                    <div className="portal-start-import-reference">
                      <span>{activeImportTutorial.sourceHint}</span>
                      <a href={activeImportTutorial.sourceUrl} target="_blank" rel="noreferrer">
                        {uiText(locale, "参考来源：", "Source: ")}
                        <NoTranslateText>{activeImportTutorial.sourceLabel}</NoTranslateText>
                        <ExternalLink aria-hidden="true" />
                      </a>
                    </div>
                    {activeImportTutorial.imageSrc ? (
                      <figure className="portal-start-guide-screenshot-frame">
                        <img
                          src={activeImportTutorial.imageSrc}
                          alt={activeImportTutorial.imageAlt}
                          loading="lazy"
                        />
                        <figcaption>
                          <strong><NoTranslateText>{activeImportTutorial.screenTitle}</NoTranslateText></strong>
                          <span>{uiText(locale, "按图操作：先进入左侧订阅，再把复制的订阅链接粘贴到订阅文件链接输入框。", "Follow the screenshot: open Subscriptions, then paste the copied link into the subscription URL field.")}</span>
                        </figcaption>
                      </figure>
                    ) : (
                    <div className={cn("portal-start-import-window", `portal-start-import-window-${activeImportTutorial.surface}`)}>
                      <div className="portal-start-import-titlebar">
                        <span className="portal-start-window-dots" aria-hidden="true">
                          <i />
                          <i />
                          <i />
                        </span>
                        <SelectedGuideClientIcon aria-hidden="true" />
                        <strong><NoTranslateText>{selectedGuide.name}</NoTranslateText></strong>
                        <em><NoTranslateText>{activeImportTutorial.screenTitle}</NoTranslateText></em>
                      </div>
                      {activeImportTutorial.surface === "mobile" ? (
                        <div className="portal-start-import-mobile-screen">
                          <div className="portal-start-import-mobile-top">
                            <ArrowLeft aria-hidden="true" />
                            <strong><NoTranslateText>{activeImportTutorial.screenTitle}</NoTranslateText></strong>
                            <button type="button" disabled>
                              <Plus aria-hidden="true" />
                            </button>
                          </div>
                          <div className="portal-start-import-mobile-row">
                            <span>UserAgent</span>
                            <strong>ClashMeta / Sing-box / V2ray</strong>
                            <ChevronRight aria-hidden="true" />
                          </div>
                          <div className="portal-start-import-mobile-row enabled">
                            <span>{uiText(locale, "启用分流规则", "Enable routing rules")}</span>
                            <i aria-hidden="true" />
                          </div>
                          <div className="portal-start-import-field portal-start-import-mobile-field">
                            <span className="portal-start-import-marker">1</span>
                            <label>{activeImportTutorial.inputLabel}</label>
                            <div className="portal-start-import-input">
                              <Copy aria-hidden="true" />
                              <span><NoTranslateText>{visibleSubscriptionUrl || activeImportTutorial.inputPlaceholder}</NoTranslateText></span>
                            </div>
                          </div>
                          <div className="portal-start-import-confirm-row">
                            <button type="button" disabled>
                              <span className="portal-start-import-marker">2</span>
                              {activeImportTutorial.confirmLabel}
                            </button>
                            <span>
                              <CheckCircle2 aria-hidden="true" />
                              {activeImportTutorial.resultLabel}
                            </span>
                          </div>
                        </div>
                      ) : (
                        <div className="portal-start-import-layout">
                          <div className="portal-start-import-sidebar" aria-label={uiText(locale, "客户端菜单", "Client menu")}>
                            {activeImportTutorial.sideItems.map((item) => (
                              <span key={item} className={item === activeImportTutorial.activeSideItem ? "active" : undefined}>
                                {item === activeImportTutorial.activeSideItem ? <b>1</b> : null}
                                {item}
                              </span>
                            ))}
                          </div>
                          <div className="portal-start-import-workspace">
                            <div className="portal-start-import-toolbar">
                              <strong><NoTranslateText>{activeImportTutorial.activeSideItem}</NoTranslateText></strong>
                              <button type="button" disabled>
                                <Plus aria-hidden="true" />
                                {activeImportTutorial.entryLabel}
                              </button>
                            </div>
                            {activeImportTutorial.surface === "modal" ? (
                              <div className="portal-start-import-modal-options">
                                <button type="button" disabled>
                                  <span className="portal-start-import-marker">2</span>
                                  Add from clipboard
                                </button>
                                <button type="button" disabled>
                                  Add manually
                                </button>
                              </div>
                            ) : null}
                            <div className="portal-start-import-field">
                              <span className="portal-start-import-marker">{activeImportTutorial.surface === "modal" ? "3" : "2"}</span>
                              <label>{activeImportTutorial.inputLabel}</label>
                              <div className="portal-start-import-input">
                                <Copy aria-hidden="true" />
                                <span><NoTranslateText>{visibleSubscriptionUrl || activeImportTutorial.inputPlaceholder}</NoTranslateText></span>
                              </div>
                            </div>
                            <div className="portal-start-import-confirm-row">
                              <button type="button" disabled>
                                <span className="portal-start-import-marker">{activeImportTutorial.surface === "modal" ? "4" : "3"}</span>
                                {activeImportTutorial.confirmLabel}
                              </button>
                              <span>
                                <CheckCircle2 aria-hidden="true" />
                                {activeImportTutorial.resultLabel}
                              </span>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                    )}
                    <ol className="portal-start-import-callouts">
                      {activeImportTutorial.callouts.map((step, index) => (
                        <li key={step}>
                          <span>{index + 1}</span>
                          <strong>{step}</strong>
                        </li>
                      ))}
                    </ol>
                  </div>
                ) : null
              ) : null}
              {activeGuideStep.action === "connect" ? (
                <div className="portal-start-visual-guide-card" aria-label={uiText(locale, "连接步骤", "Connection steps")}>
                  {guideClient === "clash" ? (
                    <figure className="portal-start-guide-screenshot-frame">
                      <img
                        src="/guide/clash-system-proxy.png"
                        alt={uiText(locale, "Clash Verge Rev 设置页面开启系统代理教程截图", "Clash Verge Rev system proxy screenshot")}
                        loading="lazy"
                      />
                      <figcaption>
                        <strong>{uiText(locale, "开启系统代理", "Enable System Proxy")}</strong>
                        <span>{connectGuide?.caption ?? uiText(locale, "按图操作：进入设置，打开系统代理开关；如果仍不可用，再返回代理页更换线路。", "Follow the screenshot: open Settings and enable System Proxy. If it still does not work, return to Proxies and switch routes.")}</span>
                      </figcaption>
                    </figure>
                  ) : (
                  <div className="portal-start-client-mock connected">
                    <div className="portal-start-client-mock-top">
                      <SelectedGuideClientIcon aria-hidden="true" />
                      <strong><NoTranslateText>{selectedGuide.name}</NoTranslateText></strong>
                      <span className="portal-start-client-mock-status">{uiText(locale, "连接", "Connect")}</span>
                    </div>
                    <div className="portal-start-client-mock-body">
                      {connectGuideSteps.map((step, index) => (
                        <div key={step} className={cn("portal-start-client-mock-row", index === 1 && "active")}>
                          <span>{index + 1}</span>
                          <strong>{step}</strong>
                          <em>{index === 1 ? uiText(locale, "开启", "On") : ""}</em>
                        </div>
                      ))}
                    </div>
                  </div>
                  )}
                  {guideClient !== "clash" && connectGuide?.caption ? (
                    <p className="portal-start-platform-note">{connectGuide.caption}</p>
                  ) : null}
                  <div className="portal-start-visual-guide">
                    {connectGuideSteps.map((step, index) => (
                      <Fragment key={step}>
                        <span className="portal-start-visual-step">
                          <span>{index + 1}</span>
                          <strong>{step}</strong>
                        </span>
                        {index < connectGuideSteps.length - 1 ? <ChevronRight aria-hidden="true" /> : null}
                      </Fragment>
                    ))}
                  </div>
                </div>
              ) : null}
              {activeGuideStep.action === "verify" ? (
                <div className="portal-start-visual-guide-card" aria-label={uiText(locale, "确认步骤", "Verification steps")}>
                  <div className="portal-start-checklist-card">
                    <div className="portal-start-checklist-head">
                      <CheckCircle2 aria-hidden="true" />
                      <strong>{uiText(locale, "连接成功后应该看到", "After connecting, you should see")}</strong>
                    </div>
                    <div className="portal-start-checklist-body">
                      {verifyGuideSteps.map((step) => (
                        <span key={step}>
                          <CheckCircle2 aria-hidden="true" />
                          {step}
                        </span>
                      ))}
                    </div>
                    <button className="portal-secondary-button compact" type="button" onClick={() => setActiveView("support")}>
                      <LifeBuoy aria-hidden="true" />
                      {uiText(locale, "仍不可用，联系支持", "Still not working? Contact support")}
                    </button>
                  </div>
                  <div className="portal-start-visual-guide">
                    {verifyGuideSteps.map((step, index) => (
                      <Fragment key={step}>
                        <span className="portal-start-visual-step">
                          <span>{index + 1}</span>
                          <strong>{step}</strong>
                        </span>
                        {index < verifyGuideSteps.length - 1 ? <ChevronRight aria-hidden="true" /> : null}
                      </Fragment>
                    ))}
                  </div>
                </div>
              ) : null}
            </article>
          ) : null}
          <div className="portal-start-actions">
            {tutorialStepIndex < selectedGuide.steps.length - 1 ? (
              <button
                className="portal-primary-button compact"
                type="button"
                disabled={activeGuideStep?.action === "copy" && pending && Boolean(visibleSubscriptionUrl)}
                onClick={goNextInGuide}
              >
                {activeGuideStep?.action === "copy"
                  ? visibleSubscriptionUrl
                    ? uiText(locale, "我已复制，下一步", "Copied, next")
                    : uiText(locale, "先查看导入教程", "Preview import guide")
                  : uiText(locale, "下一步", "Next")}
                <ChevronRight aria-hidden="true" />
              </button>
            ) : (
              <button className="portal-primary-button compact" type="button" onClick={() => setActiveView("dashboard")}>
                <CheckCircle2 aria-hidden="true" />
                {uiText(locale, "完成教程", "Finish guide")}
              </button>
            )}
          </div>
        </div>
      )}

      {created?.previousInvalidatedAt ? (
        <div className="portal-event-note">
          {locale === "en"
            ? `Link refreshed. The previous link expired on ${formatDateTime(created.previousInvalidatedAt, locale)}.`
            : `链接已刷新，旧链接已于 ${formatDateTime(created.previousInvalidatedAt, locale)} 失效。`}
        </div>
      ) : null}

    </section>
  );
}

function SupportPanel({
  category,
  error,
  locale,
  message,
  pending,
  result,
  resetSupportRequest,
  setCategory,
  setMessage,
  submitSupportRequest
}: {
  category: PortalSupportCategory;
  error: string;
  locale: PortalAuthLocale;
  message: string;
  pending: boolean;
  result: PortalSupportRequest | null;
  resetSupportRequest: () => void;
  setCategory: (category: PortalSupportCategory) => void;
  setMessage: (message: string) => void;
  submitSupportRequest: (event: FormEvent<HTMLFormElement>) => void;
}) {
  const categoryOptions = localizedSupportCategories(locale);
  return (
    <section className="portal-v2-support-layout">
      <article className="portal-use-card portal-v2-support-form-card">
        <div className="portal-section-heading">
          <LifeBuoy aria-hidden="true" />
          <div>
            <span className="portal-card-label">{uiText(locale, "支持", "Support")}</span>
            <h2>{uiText(locale, "提交问题", "Submit a request")}</h2>
            <p>{uiText(locale, "提交后会生成支持请求编号，我们会使用当前登录邮箱跟进。", "A support reference will be created, and we will follow up through your signed-in email.")}</p>
          </div>
        </div>

        {result ? (
          <div className="portal-support-success" role="status">
            <CheckCircle2 aria-hidden="true" />
            <div>
              <strong>{uiText(locale, "问题已提交", "Request submitted")}</strong>
              <span>{uiText(locale, "请求编号：", "Reference: ")}{result.supportRef}</span>
              <p>{uiText(locale, "我们已记录问题类型和当前登录邮箱，后续处理会以该编号追踪。", "We recorded the request type and signed-in email. Future handling will use this reference.")}</p>
            </div>
            <button className="portal-primary-button compact" type="button" onClick={resetSupportRequest}>
              {uiText(locale, "再提一个问题", "Submit another request")}
            </button>
          </div>
        ) : (
        <form className="portal-support-form" onSubmit={submitSupportRequest}>
          <div className="portal-form-grid narrow">
            <label htmlFor="portal-support-category">
              <span>{uiText(locale, "问题类型", "Request type")}</span>
              <select
                id="portal-support-category"
                value={category}
                onChange={(event) => setCategory(event.target.value as PortalSupportCategory)}
              >
                {categoryOptions.map((item) => (
                  <option key={item.id} value={item.id}>{item.label}</option>
                ))}
              </select>
            </label>
          </div>

          <label className="portal-support-message" htmlFor="portal-support-message">
            <span>{uiText(locale, "问题描述", "Description")}</span>
            <textarea
              id="portal-support-message"
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              maxLength={1200}
              minLength={6}
              placeholder={uiText(locale, "描述遇到的问题、客户端名称和操作步骤", "Describe the issue, client name, and steps you tried")}
              required
            />
          </label>

          {error ? <div className="alert alert-error">{error}</div> : null}
          <button className="portal-primary-button" type="submit" disabled={pending || !message.trim()}>
            {pending ? uiText(locale, "提交中", "Submitting") : uiText(locale, "提交问题", "Submit request")}
          </button>
        </form>
        )}
      </article>

      <aside className="portal-v2-panel portal-v2-support-side">
        <div className="portal-v2-panel-header">
          <div>
            <span className="portal-card-label">{uiText(locale, "处理规则", "Support rules")}</span>
            <h3>{uiText(locale, "支持资料", "Support details")}</h3>
          </div>
          <Mail aria-hidden="true" />
        </div>
        <div className="portal-v2-list static">
          <span>
            <strong>{uiText(locale, "订阅和订单", "Subscriptions and orders")}</strong>
            <small>{uiText(locale, "提供订单编号、套餐和客户端名称，避免提交密码或支付凭证。", "Include order number, plan, and client name. Do not submit passwords or payment receipts.")}</small>
          </span>
          <span>
            <strong>{uiText(locale, "客户端导入", "Client import")}</strong>
            <small>{uiText(locale, "描述客户端版本、系统和导入报错，不需要提交订阅原始链接。", "Describe the client version, system, and import error. Do not submit the raw subscription link.")}</small>
          </span>
          <span>
            <strong>{uiText(locale, "账号安全", "Account security")}</strong>
            <small>{uiText(locale, "身份验证器和通行密钥问题会在个人中心继续处理。", "Authenticator and passkey issues continue from Personal center.")}</small>
          </span>
        </div>
      </aside>
    </section>
  );
}

function SecuritySetupDialog({
  authenticatorBound,
  authenticatorPending,
  locale,
  passkeyError,
  passkeyExported,
  passkeyPending,
  onBindAuthenticator,
  onClose,
  onExportPasskey
}: {
  authenticatorBound: boolean;
  authenticatorPending: boolean;
  locale: PortalAuthLocale;
  passkeyError: string;
  passkeyExported: boolean;
  passkeyPending: boolean;
  onBindAuthenticator: () => Promise<void>;
  onClose: () => void;
  onExportPasskey: () => Promise<void>;
}) {
  const complete = authenticatorBound && passkeyExported;
  return (
    <ModalFrame
      closeDisabled={!complete}
      closeLabel={uiText(locale, "完成", "Done")}
      onClose={onClose}
      subtitle={uiText(locale, "初始账号首次登录必须完成安全绑定。", "Initial accounts must finish security setup on first sign-in.")}
      title={uiText(locale, "账户安全初始化", "Account security setup")}
      titleId="portal-security-setup-title"
    >
      <div className="portal-security-setup-list">
        <div className="portal-security-setup-item">
          <div>
            <strong>{uiText(locale, "身份验证器", "Authenticator")}</strong>
            <p>{uiText(locale, "用 Google Authenticator 或其他身份验证器应用扫码绑定。", "Scan the QR code with Google Authenticator or another authenticator app.")}</p>
          </div>
          <span className={cn("portal-security-status", authenticatorBound && "enabled")}>
            {authenticatorBound ? uiText(locale, "已绑定", "Bound") : uiText(locale, "未绑定", "Not bound")}
          </span>
          <button
            className="portal-security-action"
            type="button"
            disabled={authenticatorPending || authenticatorBound}
            onClick={onBindAuthenticator}
          >
            {authenticatorBound ? uiText(locale, "身份验证器已绑定", "Authenticator bound") : uiText(locale, "绑定身份验证器", "Bind authenticator")}
          </button>
        </div>

        <div className="portal-security-setup-item">
          <div>
            <strong>{uiText(locale, "通行密钥导出", "Passkey export")}</strong>
            <p>{uiText(locale, "导出通行密钥备份包，后续密码登录会进入二次验证。", "Export the passkey backup package. Future password sign-ins will use second-factor verification.")}</p>
          </div>
          <span className={cn("portal-security-status", passkeyExported && "enabled")}>
            {passkeyExported ? uiText(locale, "已导出", "Exported") : uiText(locale, "未导出", "Not exported")}
          </span>
          <button
            className="portal-security-action"
            type="button"
            disabled={passkeyPending}
            onClick={onExportPasskey}
          >
            {passkeyPending
              ? uiText(locale, "导出中", "Exporting")
              : passkeyExported
                ? uiText(locale, "重新导出通行密钥", "Export passkey again")
                : uiText(locale, "导出通行密钥", "Export passkey")}
          </button>
        </div>
      </div>
      {passkeyError ? <div className="alert alert-error">{passkeyError}</div> : null}
    </ModalFrame>
  );
}

function AuthenticatorEnrollmentDialog({
  code,
  enrollment,
  error,
  locale,
  pending,
  onClose,
  onCodeChange,
  onSubmit
}: {
  code: string;
  enrollment: PortalAuthenticatorEnrollment;
  error: string;
  locale: PortalAuthLocale;
  pending: boolean;
  onClose: () => void;
  onCodeChange: (value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <ModalFrame
      closeDisabled={pending}
      closeLabel={uiText(locale, "取消", "Cancel")}
      onClose={onClose}
      subtitle={uiText(locale, "用 Google Authenticator 或其他身份验证器应用扫码，然后输入当前 6 位动态码。", "Scan the QR code with Google Authenticator or another authenticator app, then enter the current 6-digit code.")}
      title={uiText(locale, "绑定身份验证器", "Bind authenticator")}
      titleId="portal-authenticator-enrollment-title"
    >
      <form className="portal-authenticator-form" onSubmit={onSubmit}>
        <div className="portal-authenticator-setup">
          <img
            className="portal-authenticator-qr"
            src={enrollment.qrDataUri}
            alt={uiText(locale, "身份验证器扫码二维码", "Authenticator QR code")}
          />
          <div className="portal-authenticator-copy">
            <strong>{uiText(locale, "扫码绑定", "Scan to bind")}</strong>
            <p>{uiText(locale, "二维码仅用于本次绑定，", "This QR code is only for this binding and is valid for ")}{enrollment.expiresInSeconds / 60}{uiText(locale, " 分钟内有效。", " minutes.")}</p>
            <label htmlFor="portal-authenticator-manual-key">{uiText(locale, "手动密钥", "Manual key")}</label>
            <output
              className="portal-authenticator-manual-key"
              id="portal-authenticator-manual-key"
              aria-label={uiText(locale, "手动密钥", "Manual key")}
            >
              {enrollment.manualKey}
            </output>
          </div>
        </div>

        <label className="portal-authenticator-code" htmlFor="portal-authenticator-code">
          <span>{uiText(locale, "6 位动态码", "6-digit code")}</span>
          <input
            id="portal-authenticator-code"
            value={code}
            onChange={(event) => onCodeChange(event.target.value.replace(/\D/g, "").slice(0, 6))}
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9]{6}"
            required
          />
        </label>

        {error ? <div className="alert alert-error">{error}</div> : null}

        <button className="portal-primary-button" type="submit" disabled={pending || code.length !== 6}>
          {pending ? uiText(locale, "确认中", "Confirming") : uiText(locale, "确认绑定", "Confirm binding")}
        </button>
      </form>
    </ModalFrame>
  );
}
