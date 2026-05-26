import { useMemo, useState, type FormEvent } from "react";
import {
  CircleCheck,
  CircleX,
  Copy,
  Download,
  FileText,
  HelpCircle,
  LayoutDashboard,
  ListChecks,
  PackageCheck,
  ReceiptText,
  ShieldCheck,
  User,
  Wifi
} from "lucide-react";
import type { AdminApiClient } from "../subscriptions/api-client";
import type { SubscriptionTenant } from "../subscriptions/types";
import { copyText } from "../../lib/clipboard";
import { cn } from "../../lib/utils";

type PortalPlanId = "starter" | "professional" | "team";
type PortalClientId = "clash" | "mihomo" | "karing";
type AuthMode = "login" | "signup";
type PortalView = "dashboard" | "subscription" | "use" | "check" | "support" | "profile";

type PortalPlan = {
  id: PortalPlanId;
  label: string;
  price: string;
  description: string;
  quota: string;
};

type CreatedSubscription = {
  tenant: SubscriptionTenant;
  subscriptionUrl: string;
  clientTarget: PortalClientId;
};

const plans: PortalPlan[] = [
  {
    id: "starter",
    label: "Starter",
    price: "Trial",
    description: "单用户试用入口，由运营侧审核后生成一个受控订阅。",
    quota: "1 profile"
  },
  {
    id: "professional",
    label: "Professional",
    price: "Standard",
    description: "默认个人套餐，适合稳定日常订阅刷新和客户端导入。",
    quota: "3 profiles"
  },
  {
    id: "team",
    label: "Team",
    price: "Managed",
    description: "团队或商务客户入口，生命周期变更需要运营侧确认。",
    quota: "10 profiles"
  }
];

const clientTargets: Array<{ id: PortalClientId; label: string }> = [
  { id: "clash", label: "Clash" },
  { id: "mihomo", label: "Mihomo" },
  { id: "karing", label: "Karing" }
];

const navItems: Array<{ id: PortalView; label: string; icon: typeof LayoutDashboard }> = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { id: "subscription", label: "订阅管理", icon: ReceiptText },
  { id: "use", label: "开始使用", icon: Wifi },
  { id: "check", label: "安全清单", icon: ListChecks },
  { id: "support", label: "客服支持", icon: HelpCircle },
  { id: "profile", label: "个人中心", icon: User }
];

const appDownloads = [
  { label: "Clash Verge Rev", platform: "Windows / macOS", note: "推荐桌面客户端" },
  { label: "FlClash", platform: "iOS / Android", note: "移动端导入入口" },
  { label: "Mihomo Party", platform: "Linux / Advanced", note: "高级客户端" }
];

const onboardingGuides = [
  {
    platform: "Windows / macOS",
    app: "Clash Verge Rev",
    steps: ["复制订阅链接", "Profiles 中粘贴导入", "选择规则模式", "打开系统代理"]
  },
  {
    platform: "iOS / Android",
    app: "FlClash / Karing",
    steps: ["安装移动端客户端", "从剪贴板导入订阅", "更新配置", "选择延迟较低的节点"]
  },
  {
    platform: "Linux / Advanced",
    app: "Mihomo Party",
    steps: ["导入订阅配置", "检查端口和系统代理", "按需开启 TUN", "保留原配置作为回退"]
  }
];

const faqItems = [
  {
    question: "更新订阅失败怎么办？",
    answer: "先复制最新订阅链接重新导入，再检查系统时间、网络代理和客户端版本。"
  },
  {
    question: "为什么有些网站仍显示原 IP？",
    answer: "通常是系统代理未开启、规则未命中、DNS 缓存或浏览器已有连接未重建导致。"
  },
  {
    question: "换设备后需要重新生成订阅吗？",
    answer: "当前 MVP 允许复制同一受控订阅；正式设备限制会在阿里云平台侧单独接入。"
  }
];

const subscriptionStates = [
  { label: "未购买", description: "选择套餐后由运营侧生成订阅。", activeWhenCreated: false },
  { label: "已可用", description: "订阅链接已生成，可复制到客户端。", activeWhenCreated: true },
  { label: "即将过期", description: "后续接入续费提醒和到期通知。", activeWhenCreated: false },
  { label: "已过期", description: "后续接入恢复购买和历史记录。", activeWhenCreated: false }
];

const supportChannels = [
  { title: "工单系统", status: "待接入", detail: "提交客户端、系统版本、错误截图和订阅导入状态。" },
  { title: "邮箱支持", status: "待配置", detail: "用于订单、账号和长期问题追踪，不在仓库写入真实地址。" },
  { title: "即时消息", status: "待配置", detail: "用于紧急联络和状态通知，不在 MVP 中接入外部客服。" }
];

const profileModules = [
  { title: "设备管理", detail: "后续展示已导入订阅的设备和最近活跃时间。" },
  { title: "账单记录", detail: "后续展示套餐、续费、退款和开票状态。" },
  { title: "账号安全", detail: "后续接入密码、二次验证和登录会话管理。" }
];

const usageSteps = [
  "下载对应设备的应用。",
  "复制订阅链接到应用。",
  "代理中选择住宅节点或已分配节点。",
  "进入设置并打开系统代理。",
  "开启规则模式后再访问目标服务。"
];

const checklist = {
  recommended: [
    "保持订阅链接私密，仅在自己的设备中导入。",
    "先更新订阅，再判断节点是否异常。",
    "只保留一个系统代理或 VPN 入口。",
    "更换设备前确认旧客户端已停止连接。",
    "遇到问题时保留客户端、系统版本和错误截图。"
  ],
  forbidden: [
    "不要使用已经暴露在普通代理下的账号。",
    "关闭其他 VPN，避免本地链路冲突。",
    "不要共享订阅链接或账号。",
    "清理旧代理配置残留后再导入。",
    "出现异常时先更新订阅并重启客户端。"
  ]
};

function expiresAtFromDays(days: number) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString();
}

function selectedPlanLabel(planId: PortalPlanId) {
  return plans.find((plan) => plan.id === planId)?.label ?? "Professional";
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "订阅生成失败。";
}

function displayNameFromEmail(email: string) {
  const normalized = email.trim();
  if (!normalized) return "User";
  return normalized.includes("@") ? normalized.split("@")[0] : normalized;
}

export function UserPortalPage({
  apiClient
}: {
  apiClient: AdminApiClient;
  onBackToAdmin?: () => void;
}) {
  const [authMode, setAuthMode] = useState<AuthMode>("login");
  const [authenticated, setAuthenticated] = useState(false);
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [verificationCode, setVerificationCode] = useState("");
  const [activeView, setActiveView] = useState<PortalView>("dashboard");
  const [selectedPlan, setSelectedPlan] = useState<PortalPlanId>("professional");
  const [clientTarget, setClientTarget] = useState<PortalClientId>("clash");
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [durationDays, setDurationDays] = useState("30");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [created, setCreated] = useState<CreatedSubscription | null>(null);
  const [copied, setCopied] = useState("");

  const activePlan = useMemo(
    () => plans.find((plan) => plan.id === selectedPlan) ?? plans[1],
    [selectedPlan]
  );

  const userEmail = email.trim() || authEmail.trim();
  const userDisplayName = displayName.trim() || displayNameFromEmail(userEmail);

  function submitAuth(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setEmail((current) => current || authEmail.trim());
    setDisplayName((current) => current || displayNameFromEmail(authEmail));
    setAuthenticated(true);
  }

  async function submitSubscription(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError("");
    setCopied("");
    try {
      const result = await apiClient.createTenant({
        displayName: userDisplayName,
        expiresAt: expiresAtFromDays(Number(durationDays)),
        note: `portal plan=${selectedPlan}; client=${clientTarget}; email=${userEmail}; source=use-dashboard`
      });
      setCreated({
        tenant: result.tenant,
        subscriptionUrl: result.subscriptionUrl,
        clientTarget
      });
      setActiveView("use");
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setPending(false);
    }
  }

  async function copySubscriptionUrl(value: string, label: string) {
    await copyText(value);
    setCopied(label);
    window.setTimeout(() => setCopied(""), 1800);
  }

  if (!authenticated) {
    return (
      <main className="portal-auth-shell">
        <section className="portal-auth-card" aria-label="用户登录">
          <div className="portal-auth-header">
            <h1>{authMode === "login" ? "Log in" : "Sign up"}</h1>
            <p>{authMode === "login" ? "欢迎回来，请登录您的账户" : "创建新账户，开始使用我们的服务"}</p>
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

  const currentTitle = navItems.find((item) => item.id === activeView)?.label ?? "Dashboard";
  const statusLabel = created ? selectedPlanLabel(selectedPlan) : "暂无会员";

  return (
    <main className="portal-use-shell">
      <aside className="portal-use-sidebar">
        <div className="portal-user-card">
          <span className="portal-avatar">{userDisplayName.charAt(0).toUpperCase()}</span>
          <div>
            <strong>{userDisplayName}</strong>
            <small>{statusLabel}</small>
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
            <h1>{currentTitle}</h1>
            <p>订阅、下载、使用步骤和清单集中在一个用户后台内。</p>
          </div>
          <span className={cn("portal-status-pill", created && "active")}>
            {created ? "订阅可用" : "待购买套餐"}
          </span>
        </header>

        {activeView === "dashboard" ? renderDashboard(created, selectedPlan) : null}
        {activeView === "subscription" ? (
          <SubscriptionManager
            activePlan={activePlan}
            clientTarget={clientTarget}
            durationDays={durationDays}
            email={email}
            error={error}
            pending={pending}
            selectedPlan={selectedPlan}
            setClientTarget={setClientTarget}
            setDurationDays={setDurationDays}
            setEmail={setEmail}
            setDisplayName={setDisplayName}
            setSelectedPlan={setSelectedPlan}
            submitSubscription={submitSubscription}
            displayName={displayName}
          />
        ) : null}
        {activeView === "use" ? (
          <UseInstructions
            copied={copied}
            created={created}
            copySubscriptionUrl={copySubscriptionUrl}
          />
        ) : null}
        {activeView === "check" ? <Checklist /> : null}
        {activeView === "support" ? <SupportPanel /> : null}
        {activeView === "profile" ? (
          <ProfilePanel email={userEmail} displayName={userDisplayName} created={created} />
        ) : null}
      </section>
    </main>
  );
}

function renderDashboard(created: CreatedSubscription | null, selectedPlan: PortalPlanId) {
  return (
    <div className="portal-dashboard-grid">
      <section className="portal-use-card portal-package-card">
        <div>
          <span className="portal-card-label">套餐状态</span>
          <h2>{created ? selectedPlanLabel(selectedPlan) : "未购买套餐"}</h2>
          <p>{created ? "订阅已生成，可进入开始使用复制链接。" : "请选择适合的套餐后生成订阅。"}</p>
        </div>
        <div className="portal-traffic-meter">
          <span style={{ width: created ? "68%" : "8%" }} />
        </div>
        <small>{created ? "本期流量正常" : "暂无会员"}</small>
      </section>

      <section className="portal-use-card">
        <span className="portal-card-label">快捷入口</span>
        <div className="portal-quick-grid">
          <span><PackageCheck aria-hidden="true" /> 购买套餐</span>
          <span><Wifi aria-hidden="true" /> 开始使用</span>
          <span><ListChecks aria-hidden="true" /> 使用清单</span>
          <span><User aria-hidden="true" /> 个人中心</span>
        </div>
      </section>

      <section className="portal-use-card">
        <span className="portal-card-label">订阅状态</span>
        <div className="portal-state-grid">
          {subscriptionStates.map((state) => (
            <div
              className={cn(
                "portal-state-item",
                created === null && state.label === "未购买" && "active",
                created !== null && state.activeWhenCreated && "active"
              )}
              key={state.label}
            >
              <strong>{state.label}</strong>
              <small>{state.description}</small>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function SubscriptionManager({
  activePlan,
  clientTarget,
  displayName,
  durationDays,
  email,
  error,
  pending,
  selectedPlan,
  setClientTarget,
  setDisplayName,
  setDurationDays,
  setEmail,
  setSelectedPlan,
  submitSubscription
}: {
  activePlan: PortalPlan;
  clientTarget: PortalClientId;
  displayName: string;
  durationDays: string;
  email: string;
  error: string;
  pending: boolean;
  selectedPlan: PortalPlanId;
  setClientTarget: (value: PortalClientId) => void;
  setDisplayName: (value: string) => void;
  setDurationDays: (value: string) => void;
  setEmail: (value: string) => void;
  setSelectedPlan: (value: PortalPlanId) => void;
  submitSubscription: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <form className="portal-use-card portal-subscription-form" onSubmit={submitSubscription}>
      <div>
        <span className="portal-card-label">Select a Plan</span>
        <h2>订阅管理</h2>
        <p>请选择适合您的套餐后生成订阅。当前实现仍由运营后台 API 受控创建，不开放公开支付或真实自助注册。</p>
      </div>

      <div className="portal-plan-list">
        {plans.map((plan) => (
          <button
            key={plan.id}
            type="button"
            className={cn("portal-plan-row", selectedPlan === plan.id && "active")}
            onClick={() => setSelectedPlan(plan.id)}
            aria-pressed={selectedPlan === plan.id}
          >
            <span>
              <strong>{plan.label}</strong>
              <small>{plan.description}</small>
            </span>
            <b>{plan.price}</b>
          </button>
        ))}
      </div>

      <p className="portal-plan-note">{activePlan.quota}</p>

      <div className="portal-form-grid">
        <label>
          <span>用户邮箱</span>
          <input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
          />
        </label>
        <label>
          <span>显示名称</span>
          <input
            value={displayName}
            onChange={(event) => setDisplayName(event.target.value)}
            required
          />
        </label>
        <label>
          <span>有效期</span>
          <select value={durationDays} onChange={(event) => setDurationDays(event.target.value)}>
            <option value="30">30 天</option>
            <option value="90">90 天</option>
            <option value="365">365 天</option>
          </select>
        </label>
        <label>
          <span>客户端</span>
          <select value={clientTarget} onChange={(event) => setClientTarget(event.target.value as PortalClientId)}>
            {clientTargets.map((target) => (
              <option key={target.id} value={target.id}>{target.label}</option>
            ))}
          </select>
        </label>
      </div>

      {error ? <div className="alert alert-error">{error}</div> : null}

      <button className="portal-primary-button" type="submit" disabled={pending}>
        {pending ? "生成中" : "生成订阅"}
      </button>
    </form>
  );
}

function UseInstructions({
  copied,
  created,
  copySubscriptionUrl
}: {
  copied: string;
  created: CreatedSubscription | null;
  copySubscriptionUrl: (value: string, label: string) => Promise<void>;
}) {
  const subscriptionUrl = created?.subscriptionUrl ?? "";
  return (
    <section className="portal-use-stack" role="region" aria-label="开始使用">
      <div className="portal-use-card">
        <span className="portal-card-label">使用说明</span>
        <h2>下载对应设备的应用，复制订阅链接到应用</h2>
        <div className="portal-link-list">
          <LinkBox
            copied={copied === "primary"}
            label="订阅链接"
            value={subscriptionUrl}
            onCopy={() => copySubscriptionUrl(subscriptionUrl, "primary")}
          />
          <LinkBox
            copied={copied === "backup"}
            label="国内备用订阅链接"
            value={subscriptionUrl}
            note="备用分发域接入前，暂由同一受控订阅产物提供。"
            onCopy={() => copySubscriptionUrl(subscriptionUrl, "backup")}
          />
        </div>
      </div>

      <div className="portal-use-card">
        <span className="portal-card-label">应用下载</span>
        <div className="portal-download-grid">
          {appDownloads.map((item) => (
            <a key={item.label} className="portal-download-item" href="#download">
              <Download aria-hidden="true" />
              <span>{item.label}</span>
              <small>{item.platform} · {item.note}</small>
            </a>
          ))}
        </div>
      </div>

      <div className="portal-use-card">
        <span className="portal-card-label">订阅导入指南</span>
        <div className="portal-guide-grid">
          {onboardingGuides.map((guide) => (
            <section className="portal-guide-item" key={guide.platform}>
              <h3>{guide.platform}</h3>
              <p>{guide.app}</p>
              <ol>
                {guide.steps.map((step) => (
                  <li key={step}>{step}</li>
                ))}
              </ol>
            </section>
          ))}
        </div>
      </div>

      <div className="portal-use-card">
        <span className="portal-card-label">使用步骤</span>
        <ol className="portal-step-list">
          {usageSteps.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
      </div>

      <div className="portal-use-card">
        <span className="portal-card-label">常见问题</span>
        <div className="portal-faq-list">
          {faqItems.map((item) => (
            <details className="portal-faq-item" key={item.question} open>
              <summary>{item.question}</summary>
              <p>{item.answer}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}

function LinkBox({
  copied,
  label,
  note,
  onCopy,
  value
}: {
  copied: boolean;
  label: string;
  note?: string;
  onCopy: () => Promise<void>;
  value: string;
}) {
  return (
    <div className="portal-link-box">
      <div>
        <h3>{label}</h3>
        {note ? <small>{note}</small> : null}
      </div>
      {value ? <code>{value}</code> : <p className="muted">请先在订阅管理中生成订阅。</p>}
      <button className="portal-copy-button" type="button" onClick={onCopy} disabled={!value}>
        <Copy aria-hidden="true" />
        {copied ? "已复制" : "复制"}
      </button>
    </div>
  );
}

function Checklist() {
  return (
    <div className="portal-use-stack">
      <ChecklistSection title="正确做法" items={checklist.recommended} tone="good" />
      <ChecklistSection title="禁止做法" items={checklist.forbidden} tone="bad" />
    </div>
  );
}

function ChecklistSection({ title, items, tone }: { title: string; items: string[]; tone: "good" | "bad" }) {
  const Icon = tone === "bad" ? CircleX : CircleCheck;
  return (
    <section className="portal-use-card">
      <div className="portal-section-heading">
        {tone === "bad" ? <CircleX aria-hidden="true" /> : <ShieldCheck aria-hidden="true" />}
        <h2>{title}</h2>
      </div>
      <div className="portal-check-list">
        {items.map((item) => (
          <div className={cn("portal-check-item", tone)} key={item}>
            <span>{item}</span>
            <Icon aria-hidden="true" />
          </div>
        ))}
      </div>
    </section>
  );
}

function SupportPanel() {
  return (
    <section className="portal-use-card">
      <span className="portal-card-label">客服支持</span>
      <h2>提交问题前先完成清单排查</h2>
      <p>当前 MVP 不接入在线客服系统，只保留面向用户的支持入口形态。真实支持渠道、工单和通知后续在阿里云平台侧接入。</p>
      <div className="portal-support-grid">
        {supportChannels.map((channel) => (
          <div className="portal-support-card" key={channel.title}>
            <FileText aria-hidden="true" />
            <strong>{channel.title}</strong>
            <small>{channel.status}</small>
            <p>{channel.detail}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

function ProfilePanel({
  created,
  displayName,
  email
}: {
  created: CreatedSubscription | null;
  displayName: string;
  email: string;
}) {
  return (
    <section className="portal-use-card">
      <span className="portal-card-label">个人中心</span>
      <h2>{displayName}</h2>
      <dl className="portal-profile-list">
        <div>
          <dt>邮箱</dt>
          <dd>{email || "未填写"}</dd>
        </div>
        <div>
          <dt>套餐</dt>
          <dd>{created ? created.tenant.displayName : "暂无会员"}</dd>
        </div>
        <div>
          <dt>订阅状态</dt>
          <dd>{created ? "active" : "pending"}</dd>
        </div>
      </dl>
      <div className="portal-profile-module-grid">
        {profileModules.map((module) => (
          <div className="portal-profile-module" key={module.title}>
            <strong>{module.title}</strong>
            <small>{module.detail}</small>
          </div>
        ))}
      </div>
    </section>
  );
}
