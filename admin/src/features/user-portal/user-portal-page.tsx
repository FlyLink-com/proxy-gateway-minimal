import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import {
  CheckCircle2,
  Copy,
  Eye,
  Headphones,
  History,
  Info,
  LifeBuoy,
  LogOut,
  Pencil,
  Plus,
  ReceiptText,
  RefreshCw,
  Search,
  ShieldCheck,
  Trash2,
  User,
  Wifi
} from "lucide-react";
import { ModalFrame } from "../../components/modal-frame";
import { copyText } from "../../lib/clipboard";
import { errorMessage } from "../../lib/errors";
import { cn } from "../../lib/utils";
import type {
  PortalAuthenticatorEnrollment,
  PortalClientId,
  PortalHistoryRecord,
  PortalHumanVerificationChallenge,
  PortalPasskeyExport,
  PortalPlanId,
  PortalSupportCategory,
  PortalSupportRequest,
  PortalSecondFactorChallenge,
  PortalSession,
  PortalSubscriptionRequest,
  UserPortalClient
} from "./user-portal-client";

type DisplayAuthMode = PortalSession["authMode"];
type PortalView = "subscription" | "use" | "support" | "profile";

type PortalPlan = {
  id: PortalPlanId;
  label: string;
  billingCycle: string;
  priceLabel: string;
  description: string;
  highlights: string[];
};

type CreatedSubscription = {
  request: PortalSubscriptionRequest;
  action: "opening_requested" | "refreshed" | "disabled";
  previousInvalidatedAt?: string;
};

type SubscriptionLifecycle = "none" | "pending" | "active" | "expired" | "disabled";
type OrderStatusFilter = "all" | "active" | "pending" | "disabled" | "expired";
type OrderSort = "newest" | "oldest" | "expires";
type PortalOrderRow = {
  requestRef: string;
  request: PortalSubscriptionRequest;
  createdAt: string;
  planId: PortalPlanId;
  durationDays: number;
  quantity: number;
  clientTarget: PortalClientId;
  status: Exclude<SubscriptionLifecycle, "none">;
  expiresAt: string;
  subscriptionUrl?: string;
};

const plans: PortalPlan[] = [
  {
    id: "trial",
    label: "7 天订单",
    billingCycle: "7 天",
    priceLabel: "Order",
    description: "提交后进入订单记录，系统自动发放订阅。",
    highlights: ["订单申请", "有效期 7 天", "自动发放"]
  },
  {
    id: "monthly",
    label: "月卡",
    billingCycle: "30 天",
    priceLabel: "Monthly",
    description: "适合先开通体验，按订单管理订阅有效期。",
    highlights: ["订单记录", "有效期 30 天", "自动发放"]
  },
  {
    id: "yearly",
    label: "年卡",
    billingCycle: "365 天",
    priceLabel: "Yearly",
    description: "适合长期使用，减少频繁续期开通成本。",
    highlights: ["订单记录", "有效期 365 天", "自动发放"]
  }
];

const clientTargets: Array<{ id: PortalClientId; label: string }> = [
  { id: "clash", label: "Clash / Mihomo" },
  { id: "karing", label: "Karing" }
];

const orderDurationOptions: Array<{ days: number; label: string; planId: PortalPlanId }> = [
  { days: 7, label: "7 天", planId: "trial" },
  { days: 30, label: "30 天", planId: "monthly" },
  { days: 365, label: "365 天", planId: "yearly" }
];

const orderStatusTabs: Array<{ id: OrderStatusFilter; label: string }> = [
  { id: "all", label: "全部" },
  { id: "active", label: "生效中" },
  { id: "pending", label: "待发放" },
  { id: "disabled", label: "已禁用" },
  { id: "expired", label: "已过期" }
];

const navItems: Array<{ id: PortalView; label: string; icon: typeof ReceiptText }> = [
  { id: "subscription", label: "订阅管理", icon: ReceiptText },
  { id: "use", label: "使用教程", icon: Wifi },
  { id: "support", label: "客服支持", icon: Headphones },
  { id: "profile", label: "个人中心", icon: User }
];

const usageSteps = [
  {
    title: "下载客户端",
    detail: <>Windows / macOS 推荐 <code>Clash Verge Rev</code>；移动端使用支持订阅导入的客户端。</>
  },
  {
    title: "从订单复制链接",
    detail: <>订单发放后在订单行点击 <code>复制链接</code>。刷新订单后请重新复制新链接，旧订阅会失效。</>
  },
  {
    title: "导入配置",
    detail: <>在客户端中选择 <code>从 URL 导入</code> 或 <code>订阅导入</code>，粘贴链接后保存。</>
  },
  {
    title: "开始使用",
    detail: <>更新订阅，选择节点或规则模式，再打开 <code>系统代理</code>。</>
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

function selectedPlan(planId: PortalPlanId) {
  return plans.find((plan) => plan.id === planId) ?? plans[0];
}

function durationDaysForPlan(planId: PortalPlanId) {
  if (planId === "trial") return 7;
  if (planId === "yearly") return 365;
  return 30;
}

function planIdForDuration(days: number): PortalPlanId {
  return orderDurationOptions.find((option) => option.days === days)?.planId ?? "monthly";
}

function normalizeOrderQuantity(value: number) {
  if (!Number.isFinite(value)) return 1;
  return Math.max(1, Math.min(12, Math.trunc(value)));
}

function clientTargetLabel(clientTarget: PortalClientId) {
  return clientTargets.find((target) => target.id === clientTarget)?.label ?? clientTarget;
}

function orderStatusFromLifecycle(lifecycle: PortalSubscriptionRequest["lifecycle"]): PortalOrderRow["status"] {
  if (lifecycle === "active" || lifecycle === "pending" || lifecycle === "disabled" || lifecycle === "expired") {
    return lifecycle;
  }
  return "pending";
}

function orderStatusLabel(status: PortalOrderRow["status"]) {
  switch (status) {
    case "active":
      return "生效中";
    case "pending":
      return "待发放";
    case "disabled":
      return "已禁用";
    case "expired":
      return "已过期";
    default:
      return "待发放";
  }
}

function orderNumber(requestRef: string) {
  return requestRef.replace(/^subreq[_-]?/i, "O-").slice(0, 18);
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

function formatDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
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

function trafficUsageLabel(order: PortalOrderRow) {
  const usage = order.request.usage;
  if (!usage) return "未采集";
  if (usage.totalBytes > 0) {
    return `${formatTrafficBytes(usage.usedBytes)} / ${formatTrafficBytes(usage.totalBytes)}`;
  }
  return `${formatTrafficBytes(usage.usedBytes)} / 不限量`;
}

function trafficUsageDetail(order: PortalOrderRow) {
  const usage = order.request.usage;
  if (!usage) return "等待采集";
  return `上传 ${formatTrafficBytes(usage.uploadBytes)} / 下载 ${formatTrafficBytes(usage.downloadBytes)}`;
}

function trafficUsageChannelLabel(order: PortalOrderRow) {
  const usage = order.request.usage;
  if (!usage) return "";
  if (usage.channelCount > 0) {
    return `已计量 ${usage.measuredChannelCount}/${usage.channelCount} 通道`;
  }
  switch (usage.collectionStatus) {
    case "collector_disabled":
      return "采集未启用";
    case "not_collected":
      return "尚未采集";
    case "stale":
      return "采集延迟";
    default:
      return usage.usedBytes > 0 ? "已计量" : "已计量 0 通道";
  }
}

function trafficUsageCollectedAt(order: PortalOrderRow) {
  const updatedAt = order.request.usage?.updatedAt;
  return updatedAt ? `采集 ${formatDateTime(updatedAt)}` : "";
}

function trafficUsageStatusLabel(order: PortalOrderRow) {
  const usage = order.request.usage;
  if (!usage) return "";
  if (usage.status === "over_limit") return "超额";
  if (usage.collectionStatus === "stale") return "延迟";
  if (usage.collectionStatus === "measured_zero") return "零用量";
  return "";
}

function trafficUsagePercent(order: PortalOrderRow) {
  const usage = order.request.usage;
  if (!usage || usage.totalBytes <= 0) return 0;
  return Math.max(0, Math.min(100, usage.usageRatio * 100));
}

function resolveLifecycle(created: CreatedSubscription | null): SubscriptionLifecycle {
  if (!created) return "none";
  return created.request.lifecycle;
}

function lifecycleLabel(lifecycle: SubscriptionLifecycle) {
  switch (lifecycle) {
    case "active":
      return "服务生效中";
    case "pending":
      return "等待系统发放";
    case "expired":
      return "已过期";
    case "disabled":
      return "订阅已禁用";
    default:
      return "未开通";
  }
}

function topbarDescription(view: PortalView) {
  switch (view) {
    case "subscription":
      return "通过订单提交订阅申请，发放结果回写到订单记录。";
    case "use":
      return "查看客户端导入步骤和订阅刷新后的使用方式。";
    case "support":
      return "提交订阅、客户端或账号问题反馈表单。";
    case "profile":
      return "查看账户基础信息与历史记录。";
    default:
      return "";
  }
}

function subscriptionPlan(created: CreatedSubscription | null, fallbackPlanId: PortalPlanId) {
  return selectedPlan(created?.request.planId ?? fallbackPlanId);
}

function expiryDisplay(created: CreatedSubscription | null, lifecycle: SubscriptionLifecycle) {
  if (!created) return "无";
  if (lifecycle === "pending") return "待系统发放";
  if (lifecycle === "expired") return `${formatDateTime(created.request.expiresAt)}（已过期）`;
  if (lifecycle === "disabled") return "已禁用";
  return `${formatDateTime(created.request.expiresAt)} 到期`;
}

function historyRecord(historySummary: PortalHistoryRecord[]) {
  const latest = historySummary[0];
  if (!latest) return "暂无完成套餐记录";
  return `${formatDateTime(latest.occurredAt)} - ${latest.label}`;
}

function authModeLabel(mode: DisplayAuthMode) {
  if (mode === "email") return "邮箱验证码（未启用）";
  if (mode === "token") return "入口 Token";
  if (mode === "password") return "密码登录";
  if (mode === "passkey") return "通行密钥";
  return "身份验证器";
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
  portalClient
}: {
  portalClient: UserPortalClient;
  onBackToAdmin?: () => void;
}) {
  const [portalSession, setPortalSession] = useState<PortalSession | null>(null);
  const [accountId, setAccountId] = useState("");
  const [password, setPassword] = useState("");
  const [robotAnswer, setRobotAnswer] = useState("");
  const [robotTrap, setRobotTrap] = useState("");
  const [humanChallenge, setHumanChallenge] = useState(createPendingHumanVerificationChallenge);
  const [humanChallengeReady, setHumanChallengeReady] = useState(false);
  const [humanChallengeLoading, setHumanChallengeLoading] = useState(true);
  const [activeView, setActiveView] = useState<PortalView>("subscription");
  const [selectedPlanId, setSelectedPlanId] = useState<PortalPlanId>("monthly");
  const [clientTarget, setClientTarget] = useState<PortalClientId>("clash");
  const [orderDurationDays, setOrderDurationDays] = useState(30);
  const [orderQuantity, setOrderQuantity] = useState(1);
  const [orderRows, setOrderRows] = useState<PortalOrderRow[]>([]);
  const [orderStatusFilter, setOrderStatusFilter] = useState<OrderStatusFilter>("all");
  const [orderSearch, setOrderSearch] = useState("");
  const [orderClientFilter, setOrderClientFilter] = useState<"all" | PortalClientId>("all");
  const [orderSort, setOrderSort] = useState<OrderSort>("newest");
  const [orderFormOpen, setOrderFormOpen] = useState(false);
  const [editingOrderRef, setEditingOrderRef] = useState<string | null>(null);
  const [selectedOrderRef, setSelectedOrderRef] = useState<string | null>(null);
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

  const userDisplayName = portalSession?.displayName ?? (accountId.trim() || "Portal User");
  const registrationDate = portalSession?.registeredAt ?? new Date("2026-05-31T00:00:00.000Z").toISOString();
  const selectedOrder = useMemo(
    () => orderRows.find((row) => row.requestRef === selectedOrderRef) ?? orderRows[0] ?? null,
    [orderRows, selectedOrderRef]
  );
  const created = useMemo(() => createdSubscriptionFromOrder(selectedOrder), [selectedOrder]);
  const lifecycle = resolveLifecycle(created);
  const currentPlan = subscriptionPlan(created, selectedPlanId);
  const filteredOrderRows = useMemo(() => {
    const search = orderSearch.trim().toLowerCase();
    const filtered = orderRows.filter((row) => {
      const matchesStatus = orderStatusFilter === "all" || row.status === orderStatusFilter;
      const matchesClient = orderClientFilter === "all" || row.clientTarget === orderClientFilter;
      const searchable = [
        orderNumber(row.requestRef),
        row.requestRef,
        selectedPlan(row.planId).label,
        clientTargetLabel(row.clientTarget),
        orderStatusLabel(row.status)
      ].join(" ").toLowerCase();
      return matchesStatus && matchesClient && (!search || searchable.includes(search));
    });
    return [...filtered].sort((left, right) => {
      if (orderSort === "oldest") return left.createdAt.localeCompare(right.createdAt);
      if (orderSort === "expires") return left.expiresAt.localeCompare(right.expiresAt);
      return right.createdAt.localeCompare(left.createdAt);
    });
  }, [orderClientFilter, orderRows, orderSearch, orderSort, orderStatusFilter]);

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
      setAuthError(errorMessage(requestError, "防机器人校验加载失败。"));
    } finally {
      setHumanChallengeLoading(false);
    }
  }, [portalClient]);

  useEffect(() => {
    void refreshHumanChallenge();
  }, [refreshHumanChallenge]);

  async function hydratePortalSession(session: PortalSession) {
    const portalState = await portalClient.fetchCurrentState({
      userRef: session.userRef,
      sessionRef: session.sessionRef
    });
    setPortalSession(session);
    setSecondFactorChallenge(null);
    setSecondFactorCode("");
    setPasskeyProof("");
    setSecondFactorError("");
    setSecondFactorPending(false);
    setAuthenticatorBound(portalState.security?.authenticatorBound ?? false);
    setPasskeyExported(portalState.security?.passkeyExported ?? false);
    setSecuritySetupRequired(portalState.security?.setupRequired ?? false);
    const subscriptionRequests = portalState.subscriptionRequests?.length
      ? portalState.subscriptionRequests
      : portalState.subscriptionRequest
        ? [portalState.subscriptionRequest]
        : [];
    if (subscriptionRequests.length > 0) {
      const orders = subscriptionRequests
        .map((request) => subscriptionRequestToOrder(request))
        .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
      const selected = orders.find((order) => order.requestRef === portalState.subscriptionRequest?.requestRef)
        ?? orders[0];
      setSelectedPlanId(selected.planId);
      setOrderDurationDays(selected.durationDays);
      setOrderQuantity(selected.quantity);
      setClientTarget(selected.clientTarget);
      setOrderRows(orders);
      setSelectedOrderRef(selected.requestRef);
    } else {
      setOrderRows([]);
      setSelectedOrderRef(null);
    }
    setHistorySummary(portalState.historySummary ?? subscriptionRequests.flatMap((request) => request.historySummary ?? []));
    setActiveView("subscription");
  }

  async function submitAuth(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAuthError("");
    setSecondFactorError("");
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
      await hydratePortalSession(result);
    } catch (requestError) {
      setAuthError(errorMessage(requestError, "操作失败。"));
      setRobotAnswer("");
      void refreshHumanChallenge();
    }
  }

  async function submitAuthenticatorSecondFactor(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!secondFactorChallenge) return;
    setSecondFactorError("");
    setSecondFactorPending(true);
    try {
      const session = await portalClient.completeSecondFactor({
        challengeRef: secondFactorChallenge.challengeRef,
        factor: "authenticator",
        totpCode: secondFactorCode
      });
      await hydratePortalSession(session);
    } catch (requestError) {
      setSecondFactorError(errorMessage(requestError, "二次验证失败。"));
      setSecondFactorCode("");
    } finally {
      setSecondFactorPending(false);
    }
  }

  async function submitPasskeySecondFactor(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!secondFactorChallenge) return;
    setSecondFactorError("");
    setSecondFactorPending(true);
    try {
      const session = await portalClient.completeSecondFactor({
        challengeRef: secondFactorChallenge.challengeRef,
        factor: "passkey",
        passkeyProof
      });
      await hydratePortalSession(session);
    } catch (requestError) {
      setSecondFactorError(errorMessage(requestError, "通行密钥验证失败。"));
      setPasskeyProof("");
    } finally {
      setSecondFactorPending(false);
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

  async function submitSubscription(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setActionError("");
    setCopiedOrderRef(null);
    const quantity = normalizeOrderQuantity(orderQuantity);
    const planId = planIdForDuration(orderDurationDays);

    if (editingOrderRef) {
      setOrderRows((rows) => rows.map((row) => {
        if (row.requestRef !== editingOrderRef) return row;
        return {
          ...row,
          planId,
          durationDays: orderDurationDays,
          quantity,
          clientTarget,
          request: {
            ...row.request,
            planId,
            durationDays: orderDurationDays,
            quantity,
            clientTarget
          }
        };
      }));
      setSelectedPlanId(planId);
      setEditingOrderRef(null);
      setOrderFormOpen(false);
      return;
    }

    setPending(true);
    try {
      const userRef = portalSession?.userRef ?? "";
      const result = await portalClient.applyForSubscription({
        userRef,
        sessionRef: portalSession?.sessionRef,
        planId,
        clientTarget,
        requestOnly: true,
        durationDays: orderDurationDays,
        quantity
      });
      const order = subscriptionRequestToOrder(result, { durationDays: orderDurationDays, quantity });
      setOrderRows((rows) => upsertOrderRow(rows, order));
      setSelectedOrderRef(order.requestRef);
      setSelectedPlanId(planId);
      setHistorySummary(result.historySummary ?? historySummary);
      setOrderFormOpen(false);
    } catch (requestError) {
      setActionError(errorMessage(requestError, "操作失败。"));
    } finally {
      setPending(false);
    }
  }

  async function refreshSubscription(requestRef?: string) {
    if (!portalSession) return;
    const target = requestRef
      ? orderRows.find((row) => row.requestRef === requestRef)?.request
      : selectedOrder?.request;
    if (!target || target.lifecycle !== "active") return;
    setActionError("");
    setCopiedOrderRef(null);
    setPending(true);
    try {
      const result = await portalClient.refreshSubscription({
        userRef: portalSession.userRef,
        sessionRef: portalSession.sessionRef,
        requestRef: target.requestRef,
        clientTarget
      });
      const existing = orderRows.find((row) => row.requestRef === target.requestRef);
      const order = subscriptionRequestToOrder(result, {
        durationDays: existing?.durationDays,
        quantity: existing?.quantity
      });
      setOrderRows((rows) => upsertOrderRow(rows, order));
      setSelectedOrderRef(order.requestRef);
      setHistorySummary(result.historySummary ?? historySummary);
    } catch (requestError) {
      setActionError(errorMessage(requestError, "刷新订阅失败。"));
    } finally {
      setPending(false);
    }
  }

  async function copyOrderSubscription(order: PortalOrderRow) {
    if (!order.request.subscriptionUrl) return;
    await copyText(order.request.subscriptionUrl);
    setCopiedOrderRef(order.requestRef);
    window.setTimeout(() => setCopiedOrderRef(null), 1800);
  }

  async function disableSubscription(requestRef?: string) {
    if (!portalSession) return;
    const target = requestRef
      ? orderRows.find((row) => row.requestRef === requestRef)?.request
      : selectedOrder?.request;
    if (!target || target.lifecycle !== "active") return;
    setActionError("");
    setCopiedOrderRef(null);
    setPending(true);
    try {
      const result = await portalClient.disableSubscription({
        userRef: portalSession.userRef,
        sessionRef: portalSession.sessionRef,
        requestRef: target.requestRef
      });
      const existing = orderRows.find((row) => row.requestRef === target.requestRef);
      const order = subscriptionRequestToOrder(result, {
        durationDays: existing?.durationDays,
        quantity: existing?.quantity
      });
      setOrderRows((rows) => upsertOrderRow(rows, order));
      setSelectedOrderRef(order.requestRef);
      setHistorySummary(result.historySummary ?? historySummary);
    } catch (requestError) {
      setActionError(errorMessage(requestError, "禁用订阅失败。"));
    } finally {
      setPending(false);
    }
  }

  function viewOrder(order: PortalOrderRow) {
    setSelectedOrderRef(order.requestRef);
    setSelectedPlanId(order.planId);
    setOrderDurationDays(order.durationDays);
    setOrderQuantity(order.quantity);
    setClientTarget(order.clientTarget);
  }

  function editOrder(order: PortalOrderRow) {
    viewOrder(order);
    setEditingOrderRef(order.requestRef);
    setOrderFormOpen(true);
  }

  function startNewOrder() {
    setEditingOrderRef(null);
    setOrderFormOpen(true);
  }

  function closeOrderForm() {
    if (pending) return;
    setOrderFormOpen(false);
    setEditingOrderRef(null);
    setActionError("");
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
      setSupportError(errorMessage(requestError, "问题提交失败。"));
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
      setAuthenticatorError(errorMessage(requestError, "身份验证器绑定失败。"));
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
      setAuthenticatorError(errorMessage(requestError, "身份验证器绑定失败。"));
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
      setPasskeyError(errorMessage(requestError, "通行密钥导出失败。"));
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
    setPortalSession(null);
    setAccountId("");
    setPassword("");
    setRobotAnswer("");
    setRobotTrap("");
    setHumanChallenge(createPendingHumanVerificationChallenge());
    setHumanChallengeReady(false);
    setHumanChallengeLoading(true);
    void refreshHumanChallenge();
    setActiveView("subscription");
    setSelectedPlanId("monthly");
    setClientTarget("clash");
    setOrderDurationDays(30);
    setOrderQuantity(1);
    setOrderRows([]);
    setOrderStatusFilter("all");
    setOrderSearch("");
    setOrderClientFilter("all");
    setOrderSort("newest");
    setOrderFormOpen(false);
    setEditingOrderRef(null);
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
      <main className="portal-auth-shell">
        <section className="portal-auth-card" aria-label="二次验证">
          <div className="portal-auth-header">
            <h1>二次验证</h1>
            <p>此账号已开启增强验证。完成一个已绑定因子后才会进入用户中心。</p>
          </div>

          {hasAuthenticator ? (
            <form className="portal-auth-form" onSubmit={submitAuthenticatorSecondFactor}>
              <label htmlFor="portal-second-factor-code">身份验证器验证码</label>
              <input
                id="portal-second-factor-code"
                value={secondFactorCode}
                onChange={(event) => setSecondFactorCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
                inputMode="numeric"
                autoComplete="one-time-code"
                required
              />
              <button className="portal-auth-submit" type="submit" disabled={secondFactorPending || secondFactorCode.length !== 6}>
                {secondFactorPending ? "验证中" : "验证身份验证器"}
              </button>
            </form>
          ) : null}

          <div className="portal-second-factor-actions">
            {hasPasskey ? (
              <form className="portal-passkey-form" onSubmit={submitPasskeySecondFactor}>
                <label htmlFor="portal-passkey-proof">通行密钥备份内容</label>
                <textarea
                  id="portal-passkey-proof"
                  value={passkeyProof}
                  onChange={(event) => setPasskeyProof(event.target.value)}
                  autoComplete="off"
                  placeholder="粘贴导出的通行密钥备份内容"
                  required
                />
                <button
                  className="portal-secondary-button"
                  type="submit"
                  disabled={secondFactorPending || !passkeyProof.trim()}
                >
                  {secondFactorPending ? "验证中" : "使用通行密钥"}
                </button>
              </form>
            ) : null}
            <button className="portal-secondary-button" type="button" disabled={secondFactorPending} onClick={returnToPasswordLogin}>
              返回账号登录
            </button>
          </div>

          {secondFactorError ? <div className="alert alert-error">{secondFactorError}</div> : null}
        </section>
      </main>
    );
  }

  if (!portalSession) {
    const canSubmitPasswordLogin = humanChallengeReady && !humanChallengeLoading;
    return (
      <main className="portal-auth-shell">
        <section className="portal-auth-card" aria-label="用户登录">
          <div className="portal-auth-header">
            <h1>账号登录</h1>
            <p>使用账户密码登录。可在个人中心开启身份验证器和通行密钥。</p>
          </div>

          <form className="portal-auth-form" onSubmit={submitAuth}>
            <label htmlFor="portal-account-id">账户 ID</label>
            <input
              id="portal-account-id"
              value={accountId}
              onChange={(event) => setAccountId(event.target.value)}
              autoComplete="username"
              required
            />

            <label htmlFor="portal-password">密码</label>
            <input
              id="portal-password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="current-password"
              required
            />

            <label htmlFor="portal-robot-check">防机器人校验</label>
            <input
              id="portal-robot-check"
              value={robotAnswer}
              onChange={(event) => setRobotAnswer(event.target.value)}
              inputMode="numeric"
              autoComplete="off"
              placeholder={humanChallengeLoading ? "正在加载校验..." : humanChallenge.prompt}
              disabled={!canSubmitPasswordLogin}
              required
            />

            <label className="portal-honeypot" htmlFor="portal-company">公司名称</label>
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

            {authError ? <div className="alert alert-error">{authError}</div> : null}

            <button className="portal-auth-submit" type="submit" disabled={!canSubmitPasswordLogin}>
              {humanChallengeLoading ? "加载校验中" : "登录"}
            </button>
          </form>
        </section>
      </main>
    );
  }

  const shouldShowSecuritySetup = Boolean(
    portalSession
    && securitySetupRequired
    && (!authenticatorBound || !passkeyExported)
    && !authenticatorEnrollment
  );

  return (
    <>
      <main className="portal-use-shell">
        <aside className="portal-use-sidebar">
          <div className="portal-user-card">
            <span className="portal-avatar">{userDisplayName.charAt(0).toUpperCase()}</span>
            <div>
              <strong>{userDisplayName}</strong>
              <small>账户 ID：{portalSession.userRef}</small>
            </div>
          </div>

          <nav className="portal-use-nav" aria-label="用户中心导航">
            {navItems.map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.id}
                  type="button"
                  className={cn("portal-use-nav-item", activeView === item.id && "active")}
                  onClick={() => setActiveView(item.id)}
                >
                  <Icon aria-hidden="true" />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </nav>

          <button type="button" className="portal-logout-button" onClick={logout}>
            <LogOut aria-hidden="true" />
            <span>退出登录</span>
          </button>
        </aside>

        <section className="portal-use-main">
          <header className="portal-use-topbar">
            <div>
              <h1>{navItems.find((item) => item.id === activeView)?.label}</h1>
              <p>{topbarDescription(activeView)}</p>
            </div>
            <span
              className={cn("portal-status-indicator", lifecycle, created && lifecycle !== "disabled" && "active")}
              aria-label={`服务状态：${lifecycle === "disabled" ? "已禁用" : lifecycleLabel(lifecycle)}`}
            >
              <span className="portal-status-dot" aria-hidden="true" />
              {lifecycle === "disabled" ? "已禁用" : lifecycleLabel(lifecycle)}
            </span>
          </header>

          {activeView === "subscription" ? (
            <SubscriptionManager
              actionError={actionError}
              clientTarget={clientTarget}
              copiedOrderRef={copiedOrderRef}
              orderClientFilter={orderClientFilter}
              orderDurationDays={orderDurationDays}
              orderFormOpen={orderFormOpen}
              orderQuantity={orderQuantity}
              orderRows={filteredOrderRows}
              orderSearch={orderSearch}
              orderSort={orderSort}
              orderStatusFilter={orderStatusFilter}
              selectedOrderRef={selectedOrderRef}
              editingOrderRef={editingOrderRef}
              pending={pending}
              setClientTarget={setClientTarget}
              setOrderClientFilter={setOrderClientFilter}
              setOrderDurationDays={setOrderDurationDays}
              setOrderQuantity={setOrderQuantity}
              setOrderSearch={setOrderSearch}
              setOrderSort={setOrderSort}
              setOrderStatusFilter={setOrderStatusFilter}
              submitSubscription={submitSubscription}
              startNewOrder={startNewOrder}
              closeOrderForm={closeOrderForm}
              copyOrderSubscription={copyOrderSubscription}
              refreshSubscription={refreshSubscription}
              disableSubscription={disableSubscription}
              editOrder={editOrder}
              viewOrder={viewOrder}
            />
          ) : null}
          {activeView === "use" ? <UseGuide created={created} setActiveView={setActiveView} /> : null}
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
            />
          ) : null}
          {activeView === "profile" ? (
            <ProfilePanel
              created={created}
              currentPlan={currentPlan}
              historySummary={historySummary}
              lifecycle={lifecycle}
              registrationDate={registrationDate}
              authMode={portalSession.authMode}
              authenticatorBound={authenticatorBound}
              authenticatorPending={authenticatorPending}
              passkeyExported={passkeyExported}
              passkeyError={passkeyError}
              passkeyPending={passkeyPending}
              exportPasskey={exportPasskey}
              startAuthenticatorEnrollment={startAuthenticatorEnrollment}
              userRef={portalSession.userRef}
            />
          ) : null}
        </section>
      </main>
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
        />
      ) : null}
    </>
  );
}

function SubscriptionManager({
  actionError,
  clientTarget,
  copiedOrderRef,
  orderClientFilter,
  orderDurationDays,
  orderFormOpen,
  orderQuantity,
  orderRows,
  orderSearch,
  orderSort,
  orderStatusFilter,
  selectedOrderRef,
  editingOrderRef,
  pending,
  setClientTarget,
  setOrderClientFilter,
  setOrderDurationDays,
  setOrderQuantity,
  setOrderSearch,
  setOrderSort,
  setOrderStatusFilter,
  submitSubscription,
  startNewOrder,
  closeOrderForm,
  copyOrderSubscription,
  refreshSubscription,
  disableSubscription,
  editOrder,
  viewOrder
}: {
  actionError: string;
  clientTarget: PortalClientId;
  copiedOrderRef: string | null;
  orderClientFilter: "all" | PortalClientId;
  orderDurationDays: number;
  orderFormOpen: boolean;
  orderQuantity: number;
  orderRows: PortalOrderRow[];
  orderSearch: string;
  orderSort: OrderSort;
  orderStatusFilter: OrderStatusFilter;
  selectedOrderRef: string | null;
  editingOrderRef: string | null;
  pending: boolean;
  setClientTarget: (value: PortalClientId) => void;
  setOrderClientFilter: (value: "all" | PortalClientId) => void;
  setOrderDurationDays: (value: number) => void;
  setOrderQuantity: (value: number) => void;
  setOrderSearch: (value: string) => void;
  setOrderSort: (value: OrderSort) => void;
  setOrderStatusFilter: (value: OrderStatusFilter) => void;
  submitSubscription: (event: FormEvent<HTMLFormElement>) => void;
  startNewOrder: () => void;
  closeOrderForm: () => void;
  copyOrderSubscription: (order: PortalOrderRow) => Promise<void>;
  refreshSubscription: (requestRef?: string) => Promise<void>;
  disableSubscription: (requestRef?: string) => Promise<void>;
  editOrder: (order: PortalOrderRow) => void;
  viewOrder: (order: PortalOrderRow) => void;
}) {
  const selectedOrder = orderRows.find((row) => row.requestRef === selectedOrderRef) ?? orderRows[0] ?? null;
  return (
    <div className="portal-use-stack">
      <section className="portal-order-card" aria-label="订单管理">
        <div className="portal-order-header">
          <div className="portal-section-heading">
            <ReceiptText aria-hidden="true" />
            <div>
              <span className="portal-card-label">订单</span>
              <h2>订单管理</h2>
              <p>按订单查看订阅申请、刷新和停用记录；删除操作以停用处理，保留记录便于查询。</p>
            </div>
          </div>
        </div>

        <div className="portal-order-tabs" role="tablist" aria-label="订单状态">
          {orderStatusTabs.map((tab) => (
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
            <span>搜索订单</span>
            <div className="portal-search-field">
              <Search aria-hidden="true" />
              <input
                value={orderSearch}
                onChange={(event) => setOrderSearch(event.target.value)}
                placeholder="订单号 / 套餐 / 状态"
              />
            </div>
          </label>
          <label>
            <span>客户端</span>
            <select value={orderClientFilter} onChange={(event) => setOrderClientFilter(event.target.value as "all" | PortalClientId)}>
              <option value="all">全部客户端</option>
              {clientTargets.map((target) => (
                <option key={target.id} value={target.id}>{target.label}</option>
              ))}
            </select>
          </label>
          <label>
            <span>排序</span>
            <select value={orderSort} onChange={(event) => setOrderSort(event.target.value as OrderSort)}>
              <option value="newest">最新创建</option>
              <option value="oldest">最早创建</option>
              <option value="expires">到期时间</option>
            </select>
          </label>
          <button className="portal-primary-button compact portal-toolbar-create" type="button" onClick={startNewOrder}>
            <Plus aria-hidden="true" />
            新建订单申请
          </button>
        </div>

        {orderRows.length === 0 ? (
          <div className="portal-order-empty-state" role="status">
            <ReceiptText aria-hidden="true" />
            <strong>暂无订单</strong>
            <p>创建第一条订阅订单后，订单状态、到期时间和可执行操作会在这里统一管理。</p>
            <button className="portal-primary-button compact" type="button" onClick={startNewOrder}>
              <Plus aria-hidden="true" />
              立即新建订单申请
            </button>
          </div>
        ) : (
          <div className="portal-order-table-wrap">
            <table className="portal-order-table" aria-label="订阅订单列表">
              <thead>
                <tr>
                  <th>订单号</th>
                  <th>创建时间</th>
                  <th>时长</th>
                  <th>数量</th>
                  <th>客户端</th>
                  <th>状态</th>
                  <th>流量</th>
                  <th>到期时间</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {orderRows.map((order) => (
                <tr key={order.requestRef} className={cn(selectedOrderRef === order.requestRef && "selected")}>
                  <td>
                    <button className="portal-order-link" type="button" onClick={() => viewOrder(order)}>
                      {orderNumber(order.requestRef)}
                    </button>
                  </td>
                  <td>{formatDateTime(order.createdAt)}</td>
                  <td>{order.durationDays} 天</td>
                  <td>{order.quantity}</td>
                  <td>{clientTargetLabel(order.clientTarget)}</td>
                  <td><span className={cn("portal-order-status", order.status)}>{orderStatusLabel(order.status)}</span></td>
                  <td>
                    <div className={cn("portal-order-usage", order.request.usage?.status === "over_limit" && "over-limit")}>
                      <span>{trafficUsageLabel(order)}</span>
                      <small>{trafficUsageDetail(order)}</small>
                      {order.request.usage && order.request.usage.totalBytes > 0 ? (
                        <div className="portal-traffic-meter" aria-hidden="true">
                          <span style={{ width: `${trafficUsagePercent(order)}%` }} />
                        </div>
                      ) : null}
                      {trafficUsageChannelLabel(order) ? (
                        <small>{trafficUsageChannelLabel(order)}</small>
                      ) : null}
                      {trafficUsageCollectedAt(order) ? (
                        <small>{trafficUsageCollectedAt(order)}</small>
                      ) : null}
                      {trafficUsageStatusLabel(order) ? (
                        <em>{trafficUsageStatusLabel(order)}</em>
                      ) : null}
                    </div>
                  </td>
                  <td>{order.status === "pending" ? "待发放" : formatDateTime(order.expiresAt)}</td>
                  <td>
                    <div className="portal-order-actions">
                      <button type="button" onClick={() => viewOrder(order)}><Eye aria-hidden="true" /> 查看</button>
                      <button type="button" onClick={() => editOrder(order)}><Pencil aria-hidden="true" /> 编辑</button>
                      {order.status === "active" ? (
                        <>
                          {order.request.subscriptionUrl ? (
                            <button type="button" disabled={pending} onClick={() => copyOrderSubscription(order)}>
                              <Copy aria-hidden="true" /> {copiedOrderRef === order.requestRef ? "已复制" : "复制链接"}
                            </button>
                          ) : null}
                          <button type="button" disabled={pending} onClick={() => refreshSubscription(order.requestRef)}>
                            <RefreshCw aria-hidden="true" /> 刷新订单
                          </button>
                          <button type="button" disabled={pending} onClick={() => disableSubscription(order.requestRef)}>
                            禁用
                          </button>
                        </>
                      ) : null}
                      <button type="button" disabled title="删除已禁用"><Trash2 aria-hidden="true" /> 删除</button>
                    </div>
                  </td>
                </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {selectedOrder?.request.event?.occurredAt ? (
          <div className="portal-event-note">
            订单 {orderNumber(selectedOrder.requestRef)} 已刷新，旧链接已于 {formatDateTime(selectedOrder.request.event.occurredAt)} 失效。
          </div>
        ) : null}
      </section>
      {orderFormOpen ? (
        <ModalFrame
          closeDisabled={pending}
          closeLabel="关闭"
          onClose={closeOrderForm}
          subtitle="请选择您需要的套餐配置，提交后系统自动发放。"
          title={editingOrderRef ? "编辑订单申请" : "新建订单申请"}
          titleId="portal-order-form-title"
          footer={(
            <div className="portal-modal-actions">
              <button className="portal-secondary-button" type="button" disabled={pending} onClick={closeOrderForm}>
                取消
              </button>
              <button className="portal-primary-button compact" type="submit" form="portal-order-form" disabled={pending}>
                {editingOrderRef ? "保存改动" : pending ? "提交中" : "确认提交"}
              </button>
            </div>
          )}
        >
          <form id="portal-order-form" className="portal-order-form" onSubmit={submitSubscription}>
            <div className="portal-form-grid narrow">
              <label htmlFor="portal-order-duration">
                <span>订单时长</span>
                <select
                  id="portal-order-duration"
                  value={orderDurationDays}
                  onChange={(event) => setOrderDurationDays(Number(event.target.value))}
                >
                  {orderDurationOptions.map((option) => (
                    <option key={option.days} value={option.days}>{option.label}</option>
                  ))}
                </select>
              </label>
              <label htmlFor="portal-order-quantity">
                <span>数量</span>
                <input
                  id="portal-order-quantity"
                  type="number"
                  min={1}
                  max={12}
                  value={orderQuantity}
                  onChange={(event) => setOrderQuantity(normalizeOrderQuantity(Number(event.target.value)))}
                />
              </label>
              <label>
                <span>使用客户端</span>
                <select value={clientTarget} onChange={(event) => setClientTarget(event.target.value as PortalClientId)}>
                  {clientTargets.map((target) => (
                    <option key={target.id} value={target.id}>{target.label}</option>
                  ))}
                </select>
              </label>
            </div>

            {actionError ? <div className="alert alert-error">{actionError}</div> : null}
          </form>
        </ModalFrame>
      ) : null}
    </div>
  );
}

function UseGuide({
  created,
  setActiveView
}: {
  created: CreatedSubscription | null;
  setActiveView: (value: PortalView) => void;
}) {
  return (
    <section className="portal-use-card">
      <div className="portal-section-heading">
        <Wifi aria-hidden="true" />
        <div>
          <span className="portal-card-label">使用教程</span>
          <h2>从订单复制链接并导入客户端</h2>
          <p>按顺序完成客户端导入和系统代理开启。</p>
        </div>
      </div>

      <div className="portal-info-callout">
        <Info aria-hidden="true" />
        <p>这个页面只解释用户操作，不展示后台节点、流量图或运维指标。</p>
      </div>

      {!created ? (
        <div className="portal-empty-callout">
          <strong>还没有订阅</strong>
          <span>请先到订阅管理新建订单并提交。</span>
          <button type="button" onClick={() => setActiveView("subscription")}>去新建订单</button>
        </div>
      ) : null}

      <ol className="portal-guide-list">
        {usageSteps.map((step, index) => (
          <li key={step.title}>
            <span>{index + 1}</span>
            <div>
              <strong>{step.title}</strong>
              <p>{step.detail}</p>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}

function SupportPanel({
  category,
  error,
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
  message: string;
  pending: boolean;
  result: PortalSupportRequest | null;
  resetSupportRequest: () => void;
  setCategory: (category: PortalSupportCategory) => void;
  setMessage: (message: string) => void;
  submitSupportRequest: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <section className="portal-use-card">
      <div className="portal-section-heading">
        <LifeBuoy aria-hidden="true" />
        <div>
          <span className="portal-card-label">支持</span>
          <h2>问题反馈表单</h2>
          <p>提交后生成支持请求编号，账户 ID 会随表单一起提交。</p>
        </div>
      </div>

      {result ? (
        <div className="portal-support-success" role="status">
          <CheckCircle2 aria-hidden="true" />
          <div>
            <strong>问题已提交</strong>
            <span>请求编号：{result.supportRef}</span>
            <p>我们已记录问题类型和账户 ID，后续处理会以该编号追踪。</p>
          </div>
          <button className="portal-primary-button compact" type="button" onClick={resetSupportRequest}>
            再提一个问题
          </button>
        </div>
      ) : (
      <form className="portal-support-form" onSubmit={submitSupportRequest}>
        <div className="portal-form-grid narrow">
          <label htmlFor="portal-support-category">
            <span>问题类型</span>
            <select
              id="portal-support-category"
              value={category}
              onChange={(event) => setCategory(event.target.value as PortalSupportCategory)}
            >
              {supportCategories.map((item) => (
                <option key={item.id} value={item.id}>{item.label}</option>
              ))}
            </select>
          </label>
        </div>

        <label className="portal-support-message" htmlFor="portal-support-message">
          <span>问题描述</span>
          <textarea
            id="portal-support-message"
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            maxLength={1200}
            minLength={6}
            placeholder="描述遇到的问题、客户端名称和操作步骤"
            required
          />
        </label>

        {error ? <div className="alert alert-error">{error}</div> : null}
        <button className="portal-primary-button" type="submit" disabled={pending || !message.trim()}>
          {pending ? "提交中" : "提交问题"}
        </button>
      </form>
      )}
    </section>
  );
}

function SecuritySetupDialog({
  authenticatorBound,
  authenticatorPending,
  passkeyError,
  passkeyExported,
  passkeyPending,
  onBindAuthenticator,
  onClose,
  onExportPasskey
}: {
  authenticatorBound: boolean;
  authenticatorPending: boolean;
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
      closeLabel="完成"
      onClose={onClose}
      subtitle="初始账号首次登录必须完成安全绑定。"
      title="账户安全初始化"
      titleId="portal-security-setup-title"
    >
      <div className="portal-security-setup-list">
        <div className="portal-security-setup-item">
          <div>
            <strong>身份验证器</strong>
            <p>用 Google Authenticator 或兼容 TOTP 应用扫码绑定。</p>
          </div>
          <span className={cn("portal-security-status", authenticatorBound && "enabled")}>
            {authenticatorBound ? "已绑定" : "未绑定"}
          </span>
          <button
            className="portal-security-action"
            type="button"
            disabled={authenticatorPending}
            onClick={onBindAuthenticator}
          >
            {authenticatorBound ? "重新绑定身份验证器" : "绑定身份验证器"}
          </button>
        </div>

        <div className="portal-security-setup-item">
          <div>
            <strong>通行密钥导出</strong>
            <p>导出通行密钥备份包，后续密码登录会进入二次验证。</p>
          </div>
          <span className={cn("portal-security-status", passkeyExported && "enabled")}>
            {passkeyExported ? "已导出" : "未导出"}
          </span>
          <button
            className="portal-security-action"
            type="button"
            disabled={passkeyPending}
            onClick={onExportPasskey}
          >
            {passkeyPending ? "导出中" : passkeyExported ? "重新导出通行密钥" : "导出通行密钥"}
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
  pending,
  onClose,
  onCodeChange,
  onSubmit
}: {
  code: string;
  enrollment: PortalAuthenticatorEnrollment;
  error: string;
  pending: boolean;
  onClose: () => void;
  onCodeChange: (value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <ModalFrame
      closeDisabled={pending}
      closeLabel="取消"
      onClose={onClose}
      subtitle="用 Google Authenticator 或兼容 TOTP 应用扫码，然后输入当前 6 位动态码。"
      title="绑定身份验证器"
      titleId="portal-authenticator-enrollment-title"
    >
      <form className="portal-authenticator-form" onSubmit={onSubmit}>
        <div className="portal-authenticator-setup">
          <img
            className="portal-authenticator-qr"
            src={enrollment.qrDataUri}
            alt="Google Authenticator 扫码二维码"
          />
          <div className="portal-authenticator-copy">
            <strong>扫码绑定</strong>
            <p>二维码内容是当前账户的一次性 TOTP 绑定 URI，{enrollment.expiresInSeconds / 60} 分钟内确认。</p>
            <label htmlFor="portal-authenticator-manual-key">手动密钥</label>
            <input
              id="portal-authenticator-manual-key"
              value={enrollment.manualKey}
              readOnly
              aria-label="手动密钥"
            />
          </div>
        </div>

        <label className="portal-authenticator-code" htmlFor="portal-authenticator-code">
          <span>6 位动态码</span>
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
          {pending ? "确认中" : "确认绑定"}
        </button>
      </form>
    </ModalFrame>
  );
}

function ProfilePanel({
  created,
  currentPlan,
  historySummary,
  lifecycle,
  registrationDate,
  authMode,
  authenticatorBound,
  authenticatorPending,
  passkeyExported,
  passkeyError,
  passkeyPending,
  exportPasskey,
  startAuthenticatorEnrollment,
  userRef
}: {
  created: CreatedSubscription | null;
  currentPlan: PortalPlan;
  historySummary: PortalHistoryRecord[];
  lifecycle: SubscriptionLifecycle;
  registrationDate: string;
  authMode: PortalSession["authMode"];
  authenticatorBound: boolean;
  authenticatorPending: boolean;
  passkeyExported: boolean;
  passkeyError: string;
  passkeyPending: boolean;
  exportPasskey: () => Promise<void>;
  startAuthenticatorEnrollment: () => Promise<void>;
  userRef: string;
}) {
  return (
    <section className="portal-use-card">
      <div className="portal-section-heading">
        <User aria-hidden="true" />
        <div>
          <span className="portal-card-label">个人中心</span>
          <h2>账户与历史记录</h2>
          <p>这里展示账户事实和历史消费摘要。</p>
        </div>
      </div>

      <div className="portal-profile-summary">
        <dl className="portal-profile-list">
          <div>
            <dt>入口方式</dt>
            <dd>{authModeLabel(authMode)}</dd>
          </div>
          <div>
            <dt>账户 ID</dt>
            <dd>{userRef}</dd>
          </div>
          <div>
            <dt>注册日期</dt>
            <dd>{formatDateTime(registrationDate)}</dd>
          </div>
          <div>
            <dt>当前套餐</dt>
            <dd>{created ? `${currentPlan.label} · ${lifecycleLabel(lifecycle)}` : "未开通"}</dd>
          </div>
          <div>
            <dt>到期时间</dt>
            <dd>{expiryDisplay(created, lifecycle)}</dd>
          </div>
        </dl>

        <article className="portal-profile-history">
          <History aria-hidden="true" />
          <div>
            <strong>历史消费账单</strong>
            <small>{historyRecord(historySummary)}</small>
          </div>
        </article>
      </div>

      <div className="portal-security-panel">
        <div className="portal-section-heading compact">
          <ShieldCheck aria-hidden="true" />
          <div>
            <span className="portal-card-label">安全</span>
            <h3>安全设置</h3>
            <p>身份验证器需要扫码并输入 6 位码后才会显示已绑定；通行密钥导出后用于后续二次验证。</p>
          </div>
        </div>

        <div className="portal-security-list">
          <div className="portal-security-row">
            <div>
              <strong>身份验证器</strong>
              <small>绑定 Google Authenticator 等 TOTP 应用后，后续可作为增强登录因子。</small>
            </div>
            <span className={cn("portal-security-status", authenticatorBound && "enabled")}>
              {authenticatorBound ? "已绑定" : "未绑定"}
            </span>
            <button
              className="portal-security-action"
              type="button"
              disabled={authenticatorPending}
              onClick={startAuthenticatorEnrollment}
            >
              {authenticatorBound ? "重新绑定身份验证器" : "绑定身份验证器"}
            </button>
          </div>

          <div className="portal-security-row">
            <div>
              <strong>通行密钥</strong>
              <small>导出通行密钥备份包；后续密码登录会要求二次验证。</small>
            </div>
            <span className={cn("portal-security-status", passkeyExported && "enabled")}>
              {passkeyExported ? "已导出" : "未导出"}
            </span>
            <button
              className="portal-security-action"
              type="button"
              disabled={passkeyPending}
              onClick={exportPasskey}
            >
              {passkeyPending ? "导出中" : passkeyExported ? "重新导出通行密钥" : "导出通行密钥"}
            </button>
          </div>
        </div>
        {passkeyError ? <div className="alert alert-error">{passkeyError}</div> : null}
      </div>

    </section>
  );
}
