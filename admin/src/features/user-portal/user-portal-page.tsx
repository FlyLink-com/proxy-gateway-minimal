import { useMemo, useState, type FormEvent } from "react";
import {
  CalendarDays,
  CircleCheck,
  Copy,
  Headphones,
  History,
  LifeBuoy,
  PackageCheck,
  ReceiptText,
  RefreshCw,
  ShieldCheck,
  User,
  Wifi
} from "lucide-react";
import { copyText } from "../../lib/clipboard";
import { errorMessage } from "../../lib/errors";
import { cn } from "../../lib/utils";
import type {
  PortalClientId,
  PortalContactInfo,
  PortalHistoryRecord,
  PortalPlanId,
  PortalSession,
  PortalSubscriptionRequest,
  UserPortalClient
} from "./user-portal-client";

type AuthMode = "login" | "signup";
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
  action: "opening_requested" | "refreshed";
  previousInvalidatedAt?: string;
};

type SubscriptionLifecycle = "none" | "pending" | "active" | "expired";

const plans: PortalPlan[] = [
  {
    id: "trial",
    label: "7 天试用",
    billingCycle: "管理员发放后 7 天",
    priceLabel: "Trial",
    description: "先申请试用，审核通过后由管理员发放。",
    highlights: ["申请制", "管理员审批", "默认每个账户一次"]
  },
  {
    id: "monthly",
    label: "月卡",
    billingCycle: "30 天",
    priceLabel: "Monthly",
    description: "适合先开通体验，按月管理订阅有效期。",
    highlights: ["一个受控订阅", "有效期 30 天", "可刷新替换旧订阅"]
  },
  {
    id: "yearly",
    label: "年卡",
    billingCycle: "365 天",
    priceLabel: "Yearly",
    description: "适合长期使用，减少频繁续期开通成本。",
    highlights: ["一个受控订阅", "有效期 365 天", "可刷新替换旧订阅"]
  }
];

const clientTargets: Array<{ id: PortalClientId; label: string }> = [
  { id: "clash", label: "Clash / Mihomo" },
  { id: "karing", label: "Karing" }
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
    detail: "Windows / macOS 推荐 Clash Verge Rev；移动端使用支持订阅导入的客户端。"
  },
  {
    title: "复制订阅",
    detail: "订阅生成后复制链接。刷新订阅后请重新复制新链接，旧订阅会失效。"
  },
  {
    title: "导入配置",
    detail: "在客户端中选择从 URL 导入或订阅导入，粘贴链接后保存。"
  },
  {
    title: "开始使用",
    detail: "更新订阅，选择节点或规则模式，再打开系统代理。"
  }
];

const supportItems = [
  {
    title: "在线客服",
    status: "预留",
    detail: "后续可接入 Telegram 机器人助手，由机器人收集问题并转人工处理。"
  },
  {
    title: "人工支持",
    status: "预留",
    detail: "用于订单、订阅刷新失败、客户端导入失败等需要人工判断的问题。"
  },
  {
    title: "问题材料",
    status: "建议",
    detail: "联系支持时保留客户端名称、系统版本、错误截图和最近一次刷新时间。"
  }
];

const emptyContactInfo: PortalContactInfo = {
  email: "",
  phone: "",
  telegram: ""
};

function selectedPlan(planId: PortalPlanId) {
  return plans.find((plan) => plan.id === planId) ?? plans[0];
}

function displayNameFromEmail(email: string) {
  const normalized = email.trim();
  if (!normalized) return "User";
  return normalized.includes("@") ? normalized.split("@")[0] : normalized;
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

function resolveLifecycle(created: CreatedSubscription | null): SubscriptionLifecycle {
  if (!created) return "none";
  return created.request.lifecycle;
}

function lifecycleLabel(lifecycle: SubscriptionLifecycle) {
  switch (lifecycle) {
    case "active":
      return "服务生效中";
    case "pending":
      return "等待管理员审核";
    case "expired":
      return "已过期";
    default:
      return "未开通";
  }
}

function subscriptionCtaLabel(lifecycle: SubscriptionLifecycle, pending: boolean) {
  if (pending) return "处理中";
  if (lifecycle === "active") return "刷新当前订阅";
  if (lifecycle === "pending") return "等待审核中";
  if (lifecycle === "expired") return "重新提交申请";
  return "提交申请";
}

function isContactInfoComplete(contactInfo: PortalContactInfo) {
  return Boolean(contactInfo.email.trim() && contactInfo.phone.trim() && contactInfo.telegram.trim());
}

function contactSummaryLabel(contactInfo: PortalContactInfo) {
  return isContactInfoComplete(contactInfo) ? "已填写邮箱、手机号、Telegram" : "尚未填写授权联系资料";
}

function topbarDescription(view: PortalView) {
  switch (view) {
    case "subscription":
      return "7 天试用 / 月卡 / 年卡均提交申请，管理员审核发放后才显示订阅。";
    case "use":
      return "查看客户端导入步骤和订阅刷新后的使用方式。";
    case "support":
      return "处理授权确认、订阅异常和人工支持请求。";
    case "profile":
      return "查看账户基础信息、授权联系资料与历史记录。";
    default:
      return "";
  }
}

function subscriptionPlan(created: CreatedSubscription | null, fallbackPlanId: PortalPlanId) {
  return selectedPlan(created?.request.planId ?? fallbackPlanId);
}

function expiryDisplay(created: CreatedSubscription | null, lifecycle: SubscriptionLifecycle) {
  if (!created) return "无";
  if (lifecycle === "pending") return "待管理员发放";
  if (lifecycle === "expired") return `${formatDateTime(created.request.expiresAt)}（已过期）`;
  return `${formatDateTime(created.request.expiresAt)} 到期`;
}

function sidebarSubscriptionSummary(
  created: CreatedSubscription | null,
  lifecycle: SubscriptionLifecycle,
  fallbackPlanId: PortalPlanId
) {
  if (!created) return "未开通套餐";
  const plan = subscriptionPlan(created, fallbackPlanId);
  if (lifecycle === "pending") return `${plan.label} · 待审核`;
  if (lifecycle === "expired") return `${plan.label} · 已过期`;
  return `${plan.label} · ${formatDateTime(created.request.expiresAt)} 到期`;
}

function historyRecord(historySummary: PortalHistoryRecord[]) {
  const latest = historySummary[0];
  if (!latest) return "暂无完成套餐记录";
  return `${formatDateTime(latest.occurredAt)} - ${latest.label}`;
}

export function UserPortalPage({
  portalClient
}: {
  portalClient: UserPortalClient;
  onBackToAdmin?: () => void;
}) {
  const [authMode, setAuthMode] = useState<AuthMode>("login");
  const [portalSession, setPortalSession] = useState<PortalSession | null>(null);
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [verificationCode, setVerificationCode] = useState("");
  const [activeView, setActiveView] = useState<PortalView>("subscription");
  const [selectedPlanId, setSelectedPlanId] = useState<PortalPlanId>("monthly");
  const [clientTarget, setClientTarget] = useState<PortalClientId>("clash");
  const [authError, setAuthError] = useState("");
  const [pending, setPending] = useState(false);
  const [actionError, setActionError] = useState("");
  const [created, setCreated] = useState<CreatedSubscription | null>(null);
  const [copied, setCopied] = useState(false);
  const [contactInfo, setContactInfo] = useState<PortalContactInfo>(emptyContactInfo);
  const [historySummary, setHistorySummary] = useState<PortalHistoryRecord[]>([]);
  const [contactModalOpen, setContactModalOpen] = useState(false);
  const [contactSavePending, setContactSavePending] = useState(false);
  const [contactError, setContactError] = useState("");

  const activePlan = useMemo(() => selectedPlan(selectedPlanId), [selectedPlanId]);
  const userEmail = authEmail.trim();
  const userDisplayName = portalSession?.displayName ?? displayNameFromEmail(userEmail);
  const registrationDate = portalSession?.registeredAt ?? new Date("2026-05-31T00:00:00.000Z").toISOString();
  const lifecycle = resolveLifecycle(created);
  const isReady = lifecycle === "active";
  const isWaiting = lifecycle === "pending";
  const currentPlan = subscriptionPlan(created, selectedPlanId);

  async function submitAuth(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAuthError("");
    try {
      const session = await portalClient.authenticate({
        mode: authMode,
        email: authEmail,
        password: authPassword,
        verificationCode
      });
      const portalState = await portalClient.fetchCurrentState({ userRef: session.userRef });
      setPortalSession(session);
      setContactInfo(portalState.contactInfo ?? { ...emptyContactInfo, email: authEmail.trim() });
      if (portalState.subscriptionRequest) {
        setCreated({
          request: portalState.subscriptionRequest,
          action: "opening_requested",
          previousInvalidatedAt: portalState.subscriptionRequest.event?.occurredAt
        });
        setSelectedPlanId(portalState.subscriptionRequest.planId);
        setClientTarget(portalState.subscriptionRequest.clientTarget);
      } else {
        setCreated(null);
      }
      setHistorySummary(portalState.historySummary ?? []);
      setActiveView("subscription");
    } catch (requestError) {
      setAuthError(errorMessage(requestError, "操作失败。"));
    }
  }

  async function saveContactInfo(nextContactInfo: PortalContactInfo) {
    setContactError("");
    setContactSavePending(true);
    try {
      const result = await portalClient.updateContactInfo({
        userRef: portalSession?.userRef ?? "",
        contact: nextContactInfo
      });
      setContactInfo(result.contact);
      setContactModalOpen(false);
    } catch (requestError) {
      setContactError(errorMessage(requestError, "操作失败。"));
    } finally {
      setContactSavePending(false);
    }
  }

  async function submitSubscription(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setActionError("");
    setCopied(false);
    if (lifecycle !== "active" && !isContactInfoComplete(contactInfo)) {
      setActionError("请先填写授权联系资料。");
      setContactModalOpen(true);
      return;
    }
    setPending(true);
    try {
      const wasActive = lifecycle === "active";
      const userRef = portalSession?.userRef ?? "";
      const result = wasActive && created
        ? await portalClient.refreshSubscription({
            userRef,
            requestRef: created.request.requestRef,
            clientTarget
          })
        : await portalClient.applyForSubscription({
            userRef,
            displayName: userDisplayName,
            email: userEmail,
            contact: contactInfo,
            planId: selectedPlanId,
            clientTarget,
            requestOnly: true
          });
      setCreated({
        request: result,
        action: wasActive ? "refreshed" : "opening_requested",
        previousInvalidatedAt: result.event?.occurredAt
      });
      setHistorySummary(result.historySummary ?? historySummary);
    } catch (requestError) {
      setActionError(errorMessage(requestError, "操作失败。"));
    } finally {
      setPending(false);
    }
  }

  async function copySubscriptionUrl() {
    if (!created?.request.subscriptionUrl) return;
    await copyText(created.request.subscriptionUrl);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }

  if (!portalSession) {
    return (
      <main className="portal-auth-shell">
        <section className="portal-auth-card" aria-label="用户登录">
          <div className="portal-auth-header">
            <h1>{authMode === "login" ? "登录" : "注册"}</h1>
            <p>{authMode === "login" ? "登录后管理你的套餐和订阅。" : "用邮箱创建账户，进入订阅管理。"}</p>
          </div>

          <form className="portal-auth-form" onSubmit={submitAuth}>
            <label htmlFor="portal-auth-email">邮箱</label>
            <input
              id="portal-auth-email"
              type="email"
              value={authEmail}
              onChange={(event) => setAuthEmail(event.target.value)}
              required
            />

            <div className="portal-password-row">
              <label htmlFor="portal-auth-password">密码</label>
              {authMode === "login" ? <button type="button">忘记密码？</button> : null}
            </div>
            <input
              id="portal-auth-password"
              type="password"
              value={authPassword}
              onChange={(event) => setAuthPassword(event.target.value)}
              required
            />

            {authMode === "signup" ? (
              <>
                <label htmlFor="portal-auth-code">验证码</label>
                <div className="portal-auth-code-row">
                  <input
                    id="portal-auth-code"
                    value={verificationCode}
                    onChange={(event) => setVerificationCode(event.target.value)}
                    required
                  />
                  <button type="button">获取验证码</button>
                </div>
              </>
            ) : null}

            {authError ? <div className="alert alert-error">{authError}</div> : null}

            <button className="portal-auth-submit" type="submit">
              {authMode === "login" ? "登录" : "注册"}
            </button>
          </form>

          <p className="portal-auth-switch">
            {authMode === "login" ? "还没有账户？" : "已有账户？"}
            <button
              type="button"
              onClick={() => setAuthMode((mode) => (mode === "login" ? "signup" : "login"))}
            >
              {authMode === "login" ? "立即注册" : "返回登录"}
            </button>
          </p>
        </section>
      </main>
    );
  }

  return (
    <>
      <main className="portal-use-shell">
        <aside className="portal-use-sidebar">
          <div className="portal-user-card">
            <span className="portal-avatar">{userDisplayName.charAt(0).toUpperCase()}</span>
            <div>
              <strong>{userDisplayName}</strong>
              <small>{sidebarSubscriptionSummary(created, lifecycle, selectedPlanId)}</small>
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
        </aside>

        <section className="portal-use-main">
          <header className="portal-use-topbar">
            <div>
              <h1>{navItems.find((item) => item.id === activeView)?.label}</h1>
              <p>{topbarDescription(activeView)}</p>
            </div>
            <span className={cn("portal-status-pill", created && "active")}>
              {lifecycleLabel(lifecycle)}
            </span>
          </header>

          {activeView === "subscription" ? (
            <SubscriptionManager
              activePlan={activePlan}
              actionError={actionError}
              clientTarget={clientTarget}
              contactInfo={contactInfo}
              copied={copied}
              created={created}
              isReady={isReady}
              isWaiting={isWaiting}
              lifecycle={lifecycle}
              openContactModal={() => setContactModalOpen(true)}
              pending={pending}
              selectedPlanId={selectedPlanId}
              setActiveView={setActiveView}
              setClientTarget={setClientTarget}
              setSelectedPlanId={setSelectedPlanId}
              submitSubscription={submitSubscription}
              copySubscriptionUrl={copySubscriptionUrl}
              userRef={portalSession.userRef}
            />
          ) : null}
          {activeView === "use" ? <UseGuide created={created} setActiveView={setActiveView} /> : null}
          {activeView === "support" ? <SupportPanel /> : null}
          {activeView === "profile" ? (
            <ProfilePanel
              created={created}
              contactInfo={contactInfo}
              currentPlan={currentPlan}
              historySummary={historySummary}
              lifecycle={lifecycle}
              openContactModal={() => setContactModalOpen(true)}
              registrationDate={registrationDate}
              userEmail={userEmail}
              userRef={portalSession.userRef}
            />
          ) : null}
        </section>
      </main>
      {contactModalOpen ? (
        <ContactInfoModal
          contactError={contactError}
          contactInfo={contactInfo}
          onClose={() => setContactModalOpen(false)}
          pending={contactSavePending}
          saveContactInfo={saveContactInfo}
        />
      ) : null}
    </>
  );
}

function SubscriptionManager({
  activePlan,
  actionError,
  clientTarget,
  contactInfo,
  copied,
  created,
  isReady,
  isWaiting,
  lifecycle,
  openContactModal,
  pending,
  selectedPlanId,
  setActiveView,
  setClientTarget,
  setSelectedPlanId,
  submitSubscription,
  copySubscriptionUrl,
  userRef
}: {
  activePlan: PortalPlan;
  actionError: string;
  clientTarget: PortalClientId;
  contactInfo: PortalContactInfo;
  copied: boolean;
  created: CreatedSubscription | null;
  isReady: boolean;
  isWaiting: boolean;
  lifecycle: SubscriptionLifecycle;
  openContactModal: () => void;
  pending: boolean;
  selectedPlanId: PortalPlanId;
  setActiveView: (value: PortalView) => void;
  setClientTarget: (value: PortalClientId) => void;
  setSelectedPlanId: (value: PortalPlanId) => void;
  submitSubscription: (event: FormEvent<HTMLFormElement>) => void;
  copySubscriptionUrl: () => Promise<void>;
  userRef: string;
}) {
  const planLocked = lifecycle === "active" || lifecycle === "pending";
  return (
    <div className="portal-use-stack">
      <form className="portal-use-card portal-subscription-form" onSubmit={submitSubscription}>
        <div className="portal-section-heading">
          <PackageCheck aria-hidden="true" />
          <div>
            <span className="portal-card-label">套餐</span>
            <h2>{planLocked ? "当前套餐" : "选择试用或套餐"}</h2>
            <p>
              {lifecycle === "active"
                ? "当前套餐已生效。刷新当前订阅只重置链接，不影响原到期时间。"
                : "当前页面只提交试用、月卡、年卡申请；管理员审核通过后发放订阅。"}
            </p>
          </div>
        </div>

        <div className="portal-plan-list compact">
          {plans.map((plan) => (
            <button
              key={plan.id}
              type="button"
              className={cn("portal-plan-row", selectedPlanId === plan.id && "active")}
              onClick={() => setSelectedPlanId(plan.id)}
              aria-pressed={selectedPlanId === plan.id}
              disabled={planLocked}
            >
              <span>
                <strong>{plan.label}</strong>
                <small>{plan.description}</small>
              </span>
              <b>{plan.priceLabel}</b>
            </button>
          ))}
        </div>

        <ul className="portal-plan-highlights">
          {activePlan.highlights.map((item) => (
            <li key={item}><CircleCheck aria-hidden="true" /> {item}</li>
          ))}
        </ul>

        {lifecycle !== "active" ? (
          <div className="portal-contact-summary">
            <div>
              <strong>授权联系信息</strong>
              <span>{contactSummaryLabel(contactInfo)}</span>
            </div>
            <button type="button" onClick={openContactModal}>
              {isContactInfoComplete(contactInfo) ? "修改联系资料" : "填写联系资料"}
            </button>
          </div>
        ) : null}

        {planLocked ? (
          <div className="portal-inline-note">
            {lifecycle === "active"
              ? "套餐生效中，月卡 / 年卡不可在当前周期内直接改选；如需换套餐，请到期后重新申请。"
              : "申请已提交，管理员审核完成前暂不重复提交套餐申请。"}
          </div>
        ) : null}

        <div className="portal-form-grid narrow">
          <label>
            <span>客户端偏好</span>
            <select value={clientTarget} onChange={(event) => setClientTarget(event.target.value as PortalClientId)}>
              {clientTargets.map((target) => (
                <option key={target.id} value={target.id}>{target.label}</option>
              ))}
            </select>
          </label>
          <label>
            <span>有效期</span>
            <input value={activePlan.billingCycle} readOnly />
          </label>
        </div>

        {actionError ? <div className="alert alert-error">{actionError}</div> : null}

        <button className="portal-primary-button" type="submit" disabled={pending || isWaiting}>
          {subscriptionCtaLabel(lifecycle, pending)}
        </button>
      </form>

      <section className="portal-use-card" aria-label="订阅状态">
        <div className="portal-section-heading">
          <RefreshCw aria-hidden="true" />
          <div>
            <span className="portal-card-label">订阅</span>
            <h2>{lifecycleLabel(lifecycle)}</h2>
            <p>
              {lifecycle === "active"
                ? "订阅已生效。可复制链接导入客户端；刷新只重置当前订阅链接。"
                : lifecycle === "pending"
                  ? "申请已提交。管理员审核通过后才会发放试用订阅或正式套餐。"
                  : lifecycle === "expired"
                    ? "套餐已过期，请重新选择试用、月卡或年卡提交申请。"
                    : "还没有有效订阅，请先选择试用或套餐并提交申请。"}
            </p>
          </div>
        </div>

        <div className="portal-state-grid">
          <StateItem active={lifecycle === "none"} title="无有效订阅" detail="选择试用或套餐后提交申请。" />
          <StateItem active={isWaiting} title="等待管理员审核" detail="管理员审核通过后发放订阅。" />
          <StateItem active={isReady} title="服务生效中" detail="可复制订阅并导入客户端。" />
          <StateItem active={lifecycle === "expired"} title="已过期" detail="到期后重新提交申请。" />
        </div>

        {isWaiting ? (
          <div className="portal-action-callout">
            <strong>下一步：等待管理员审核</strong>
            <p>管理员会根据账户 ID <code>{userRef}</code>、联系资料和申请套餐完成审批，审核通过后发放订阅。</p>
            <button type="button" onClick={() => setActiveView("support")}>联系客服支持</button>
          </div>
        ) : null}

        {created?.previousInvalidatedAt ? (
          <div className="portal-event-note">
            你已于 {formatDateTime(created.previousInvalidatedAt)} 刷新订阅，之前的旧链接已失效。
          </div>
        ) : null}

        <div className="portal-link-list">
          <div className="portal-link-box">
            <h3>当前订阅</h3>
            {isReady && created ? (
              <dl className="portal-subscription-meta">
                <div>
                  <dt>套餐</dt>
                  <dd>{activePlan.label}</dd>
                </div>
                <div>
                  <dt>到期时间</dt>
                  <dd>{formatDateTime(created.request.expiresAt)}</dd>
                </div>
              </dl>
            ) : null}
            <code>{created?.request.subscriptionUrl ?? "授权完成后显示订阅链接"}</code>
            <button
              className="portal-copy-button"
              type="button"
              disabled={!created?.request.subscriptionUrl}
              onClick={copySubscriptionUrl}
            >
              <Copy aria-hidden="true" />
              {copied ? "已复制" : "复制"}
            </button>
          </div>
        </div>

        <button className="portal-secondary-button" type="button" onClick={() => setActiveView("use")}>
          查看导入教程
        </button>
      </section>
    </div>
  );
}

function StateItem({ active, detail, title }: { active: boolean; detail: string; title: string }) {
  return (
    <div className={cn("portal-state-item", active && "active")}>
      <strong>{title}</strong>
      <small>{detail}</small>
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
          <h2>复制订阅并导入客户端</h2>
          <p>这个页面只解释用户操作，不展示后台节点、流量图或运维指标。</p>
        </div>
      </div>

      {!created ? (
        <div className="portal-empty-callout">
          <strong>还没有订阅</strong>
          <span>请先到订阅管理提交试用、月卡或年卡申请。</span>
          <button type="button" onClick={() => setActiveView("subscription")}>去提交申请</button>
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

function SupportPanel() {
  return (
    <section className="portal-use-card">
      <div className="portal-section-heading">
        <LifeBuoy aria-hidden="true" />
        <div>
          <span className="portal-card-label">支持</span>
          <h2>客服支持入口</h2>
          <p>当前仅保留支持入口，后期可接 Telegram 机器人助手和人工客服。</p>
        </div>
      </div>

      <div className="portal-support-grid">
        {supportItems.map((item) => (
          <article className="portal-support-card" key={item.title}>
            <ShieldCheck aria-hidden="true" />
            <strong>{item.title}</strong>
            <small>{item.status}</small>
            <p>{item.detail}</p>
          </article>
        ))}
      </div>
    </section>
  );
}

function ProfilePanel({
  created,
  contactInfo,
  currentPlan,
  historySummary,
  lifecycle,
  openContactModal,
  registrationDate,
  userEmail,
  userRef
}: {
  created: CreatedSubscription | null;
  contactInfo: PortalContactInfo;
  currentPlan: PortalPlan;
  historySummary: PortalHistoryRecord[];
  lifecycle: SubscriptionLifecycle;
  openContactModal: () => void;
  registrationDate: string;
  userEmail: string;
  userRef: string;
}) {
  return (
    <section className="portal-use-card">
      <div className="portal-section-heading">
        <User aria-hidden="true" />
        <div>
          <span className="portal-card-label">个人中心</span>
          <h2>账户与历史记录</h2>
          <p>这里展示账户事实、授权联系资料和历史消费摘要。</p>
        </div>
      </div>

      <dl className="portal-profile-list">
        <div>
          <dt>邮箱</dt>
          <dd>{userEmail}</dd>
        </div>
        <div>
          <dt>用户编号</dt>
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

      <div className="portal-profile-contact">
        <div>
          <strong>授权联系资料</strong>
          <p>用于套餐核验、客服回访和后续建表。修改后会保存到用户账户资料。</p>
        </div>
        <div className="portal-contact-summary compact">
          <span>{contactSummaryLabel(contactInfo)}</span>
          <button type="button" onClick={openContactModal}>
            {isContactInfoComplete(contactInfo) ? "修改资料" : "填写资料"}
          </button>
        </div>
      </div>

      <div className="portal-profile-module-grid">
        <article className="portal-profile-module">
          <History aria-hidden="true" />
          <strong>历史消费账单</strong>
          <small>{historyRecord(historySummary)}</small>
        </article>
        <article className="portal-profile-module">
          <CalendarDays aria-hidden="true" />
          <strong>注册日期</strong>
          <small>{formatDateTime(registrationDate)}</small>
        </article>
      </div>
    </section>
  );
}

function ContactInfoModal({
  contactError,
  contactInfo,
  onClose,
  pending,
  saveContactInfo
}: {
  contactError: string;
  contactInfo: PortalContactInfo;
  onClose: () => void;
  pending: boolean;
  saveContactInfo: (contactInfo: PortalContactInfo) => Promise<void>;
}) {
  const [draftContactInfo, setDraftContactInfo] = useState(contactInfo);

  function updateDraftContactInfo(field: keyof PortalContactInfo, value: string) {
    setDraftContactInfo((current) => ({ ...current, [field]: value }));
  }

  function submitContactInfo(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void saveContactInfo(draftContactInfo);
  }

  return (
    <div className="portal-modal-backdrop" role="presentation">
      <form
        className="portal-contact-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="portal-contact-title"
        onSubmit={submitContactInfo}
      >
        <div className="portal-modal-heading">
          <div>
            <span className="portal-card-label">授权资料</span>
            <h2 id="portal-contact-title">填写联系资料</h2>
            <p>这些信息用于管理员授权核验和后续客服联系。</p>
          </div>
          <button type="button" aria-label="关闭联系资料表单" onClick={onClose}>×</button>
        </div>
        <div className="portal-form-grid">
          <label>
            <span>联系邮箱</span>
            <input
              type="email"
              value={draftContactInfo.email}
              onChange={(event) => updateDraftContactInfo("email", event.target.value)}
              required
            />
          </label>
          <label>
            <span>联系手机号</span>
            <input
              value={draftContactInfo.phone}
              onChange={(event) => updateDraftContactInfo("phone", event.target.value)}
              placeholder="+86 138 0013 8000"
              required
            />
          </label>
          <label>
            <span>Telegram 账号</span>
            <input
              value={draftContactInfo.telegram}
              onChange={(event) => updateDraftContactInfo("telegram", event.target.value)}
              placeholder="@username"
              required
            />
          </label>
        </div>
        {contactError ? <div className="alert alert-error">{contactError}</div> : null}
        <div className="portal-modal-actions">
          <button type="button" className="portal-secondary-button" onClick={onClose} disabled={pending}>取消</button>
          <button type="submit" className="portal-primary-button" disabled={pending}>保存资料</button>
        </div>
      </form>
    </div>
  );
}
