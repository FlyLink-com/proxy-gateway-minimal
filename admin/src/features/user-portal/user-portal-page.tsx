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
import { cn } from "../../lib/utils";
import type {
  PortalClientId,
  PortalContactInfo,
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
  durationDays: number;
  priceLabel: string;
  description: string;
  highlights: string[];
};

type CreatedSubscription = {
  request: PortalSubscriptionRequest;
  action: "opening_requested" | "refreshed";
  previousInvalidated: boolean;
  createdAt: string;
};

type SubscriptionLifecycle = "none" | "pending" | "active" | "expired";

const plans: PortalPlan[] = [
  {
    id: "monthly",
    label: "月卡",
    billingCycle: "30 天",
    durationDays: 30,
    priceLabel: "Monthly",
    description: "适合先开通体验，按月管理订阅有效期。",
    highlights: ["一个受控订阅", "有效期 30 天", "可刷新替换旧订阅"]
  },
  {
    id: "yearly",
    label: "年卡",
    billingCycle: "365 天",
    durationDays: 365,
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

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "操作失败。";
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
  const expiry = new Date(created.request.expiresAt).getTime();
  if (!Number.isNaN(expiry) && expiry < Date.now()) return "expired";
  return created.request.status === "subscription_ready" ? "active" : "pending";
}

function lifecycleLabel(lifecycle: SubscriptionLifecycle) {
  switch (lifecycle) {
    case "active":
      return "服务生效中";
    case "pending":
      return "等待授权";
    case "expired":
      return "已过期";
    default:
      return "未开通";
  }
}

function subscriptionCtaLabel(lifecycle: SubscriptionLifecycle, pending: boolean) {
  if (pending) return "处理中";
  if (lifecycle === "active") return "刷新当前订阅";
  if (lifecycle === "pending") return "等待授权中";
  if (lifecycle === "expired") return "重新申请开通";
  return "申请开通";
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
      return "月卡 / 年卡套餐，申请开通；生效期内可刷新当前订阅。";
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
  if (lifecycle === "pending") return "待授权";
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
  if (lifecycle === "pending") return `${plan.label} · 待授权`;
  if (lifecycle === "expired") return `${plan.label} · 已过期`;
  return `${plan.label} · ${formatDateTime(created.request.expiresAt)} 到期`;
}

function historyRecord(created: CreatedSubscription | null, lifecycle: SubscriptionLifecycle, fallbackPlanId: PortalPlanId) {
  if (!created) return "暂无历史记录";
  const plan = subscriptionPlan(created, fallbackPlanId);
  const action = created.action === "refreshed" ? "刷新订阅" : `申请${plan.label}`;
  const status =
    lifecycle === "pending" ? "审核中" : lifecycle === "active" ? "已授权" : lifecycle === "expired" ? "已过期" : "已记录";
  return `${formatDateTime(created.createdAt)} - ${action}（${status}）`;
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
  const [contactModalOpen, setContactModalOpen] = useState(false);

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
      setPortalSession(session);
      setContactInfo((current) => ({
        ...current,
        email: current.email || authEmail.trim()
      }));
      setActiveView("subscription");
    } catch (requestError) {
      setAuthError(errorMessage(requestError));
    }
  }

  function updateContactInfo(field: keyof PortalContactInfo, value: string) {
    setContactInfo((current) => ({ ...current, [field]: value }));
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
      const result = await portalClient.requestSubscription({
        userRef: portalSession?.userRef ?? "",
        displayName: userDisplayName,
        email: userEmail,
        contact: contactInfo,
        planId: selectedPlanId,
        clientTarget,
        durationDays: activePlan.durationDays
      });
      setCreated({
        request: result,
        action: wasActive ? "refreshed" : "opening_requested",
        previousInvalidated: wasActive,
        createdAt: new Date().toISOString()
      });
    } catch (requestError) {
      setActionError(errorMessage(requestError));
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
          contactInfo={contactInfo}
          onClose={() => setContactModalOpen(false)}
          updateContactInfo={updateContactInfo}
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
            <h2>{planLocked ? "当前套餐" : "选择月卡或年卡"}</h2>
            <p>
              {lifecycle === "active"
                ? "当前套餐已生效。刷新当前订阅只重置链接，不影响原到期时间。"
                : "当前页面只处理月卡 / 年卡套餐申请和当前订阅刷新。"}
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
              : "申请已提交，授权完成前暂不重复提交套餐申请。"}
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
                  ? "申请已提交。请按客服支持指引完成外部付款或授权核验。"
                  : lifecycle === "expired"
                    ? "套餐已过期，请重新选择月卡或年卡申请开通。"
                    : "还没有有效订阅，请先选择套餐并申请开通。"}
            </p>
          </div>
        </div>

        <div className="portal-state-grid">
          <StateItem active={lifecycle === "none"} title="无有效订阅" detail="选择月卡或年卡后申请开通。" />
          <StateItem active={isWaiting} title="等待授权" detail="完成外部付款或授权核验后生效。" />
          <StateItem active={isReady} title="服务生效中" detail="可复制订阅并导入客户端。" />
          <StateItem active={lifecycle === "expired"} title="已过期" detail="到期后重新申请月卡或年卡。" />
        </div>

        {isWaiting ? (
          <div className="portal-action-callout">
            <strong>下一步：联系客服完成授权</strong>
            <p>请在客服支持中发送账户 ID <code>{userRef}</code> 和购买套餐，管理员核实后为你开通订阅。</p>
            <button type="button" onClick={() => setActiveView("support")}>联系客服支持</button>
          </div>
        ) : null}

        {created?.previousInvalidated ? (
          <div className="portal-event-note">
            你已于 {formatDateTime(created.createdAt)} 刷新订阅，之前的旧链接已失效。
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
          <span>请先到订阅管理申请月卡或年卡套餐。</span>
          <button type="button" onClick={() => setActiveView("subscription")}>去申请开通</button>
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
  lifecycle,
  openContactModal,
  registrationDate,
  userEmail,
  userRef
}: {
  created: CreatedSubscription | null;
  contactInfo: PortalContactInfo;
  currentPlan: PortalPlan;
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
          <p>用于套餐核验、客服回访和后续建表。修改后会作为下一次申请或客服沟通资料。</p>
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
          <small>{historyRecord(created, lifecycle, currentPlan.id)}</small>
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
  contactInfo,
  onClose,
  updateContactInfo
}: {
  contactInfo: PortalContactInfo;
  onClose: () => void;
  updateContactInfo: (field: keyof PortalContactInfo, value: string) => void;
}) {
  function saveContactInfo(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onClose();
  }

  return (
    <div className="portal-modal-backdrop" role="presentation">
      <form
        className="portal-contact-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="portal-contact-title"
        onSubmit={saveContactInfo}
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
              value={contactInfo.email}
              onChange={(event) => updateContactInfo("email", event.target.value)}
              required
            />
          </label>
          <label>
            <span>联系手机号</span>
            <input
              value={contactInfo.phone}
              onChange={(event) => updateContactInfo("phone", event.target.value)}
              placeholder="+86 138 0013 8000"
              required
            />
          </label>
          <label>
            <span>Telegram 账号</span>
            <input
              value={contactInfo.telegram}
              onChange={(event) => updateContactInfo("telegram", event.target.value)}
              placeholder="@username"
              required
            />
          </label>
        </div>
        <div className="portal-modal-actions">
          <button type="button" className="portal-secondary-button" onClick={onClose}>取消</button>
          <button type="submit" className="portal-primary-button">保存资料</button>
        </div>
      </form>
    </div>
  );
}
