import {
  ArrowRight,
  Bot,
  Building2,
  CheckCircle2,
  FlaskConical,
  LockKeyhole,
  Megaphone
} from "lucide-react";
import { type FormEvent, type MouseEvent, useState } from "react";

const capabilities = [
  {
    title: "Agent Studio",
    description: "把业务流程拆成可验证的智能体原型，先跑通闭环，再进入交付和运营。"
  },
  {
    title: "API Sandbox",
    description: "为开发者和内部团队提供可试验的接口沙盒，快速验证模型、工具和自动化链路。"
  },
  {
    title: "私有知识接入",
    description: "围绕企业资料、产品文档和运营素材建立受控知识接入，保持边界清晰。"
  },
  {
    title: "运营自动化",
    description: "把线索收集、内容生产、客户跟进和复盘指标沉淀成可复用工作流。"
  }
];

const cooperationDirections = [
  {
    title: "主流媒体广告投放",
    description: "面向搜索、信息流、社交平台和内容平台的获客链路设计，重点关注线索质量和可追踪转化。"
  },
  {
    title: "前沿产品研究",
    description: "围绕 AI Agent、自动化工作流、API 沙盒和新型交互产品做快速验证与样品交付。"
  },
  {
    title: "多域名投放落地页",
    description: "域名池只承载公开获客、广告测试和品牌触达；客户工作台入口按交付说明单独提供。"
  }
];

const scenarios = [
  {
    title: "广告投放线索分流",
    description: "把投放落地页、邮件联系和人工跟进连接起来，让线索来源、意图和后续动作更清楚。"
  },
  {
    title: "私域用户运营",
    description: "通过智能体辅助分层、触达和内容复用，提升小团队运营效率。"
  },
  {
    title: "企业知识助手",
    description: "把分散资料整理为可查询、可追问、可审计的内部知识服务。"
  },
  {
    title: "内容生产工作流",
    description: "把选题、素材、初稿、审核和发布准备拆成稳定流程，适合广告与品牌运营团队。"
  }
];

const productOutcomes = [
  "获客链路更短",
  "运营动作可追踪",
  "AI 工作流可复用"
];

const collaborationSteps = [
  "问题诊断",
  "样品验证",
  "投放测试",
  "运营复盘"
];

const workflowNodes = [
  "接收 Webhook",
  "大模型提炼",
  "发送企业微信",
  "记录线索状态"
];

const contactEmail = "hello@globalcirclecat.com";
const telegramRegistrationHref = "https://t.me/gcaltd0528_bot?start=public_landing";
const telegramRegistrationSteps = [
  "扫码打开客户 Bot",
  "私聊绑定 Telegram 身份",
  "后台审核并发放权限",
  "机器人内查看订阅面板"
];

function readFormValue(formData: FormData, name: string) {
  return String(formData.get(name) ?? "").trim();
}

export function CompanySitePage() {
  const [leadStatus, setLeadStatus] = useState<"idle" | "submitting" | "success" | "error">("idle");

  async function handleLeadSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    const payload = {
      organization: readFormValue(formData, "organization"),
      email: readFormValue(formData, "email"),
      direction: readFormValue(formData, "direction"),
      stage: readFormValue(formData, "stage"),
      message: readFormValue(formData, "message")
    };

    setLeadStatus("submitting");
    try {
      const response = await fetch("/api/public/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      if (!response.ok) {
        throw new Error("Lead intake failed");
      }
      form.reset();
      setLeadStatus("success");
    } catch (error) {
      setLeadStatus("error");
    }
  }

  function handleTelegramOnboardingClick(event: MouseEvent<HTMLAnchorElement>) {
    event.preventDefault();
    document.getElementById("telegram-onboarding")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return (
    <main className="company-site-shell">
      <header className="company-site-header">
        <a className="company-site-brand" href="#top" aria-label="GlobalCircle AI home">
          <span>GC</span>
          <strong>GlobalCircle AI</strong>
        </a>
        <nav className="company-site-nav" aria-label="公司官网导航">
          <a href="#capabilities">能力</a>
          <a href="#scenarios">场景</a>
          <a href="#delivery">合作</a>
          <a href="#contact">联系</a>
          <a
            className="company-site-workbench-link"
            href="#telegram-onboarding"
            aria-label="开发者工作台申请访问"
            onClick={handleTelegramOnboardingClick}
          >
            <LockKeyhole aria-hidden="true" />
            开发者工作台
          </a>
        </nav>
      </header>

      <section className="company-site-hero" id="top">
        <div className="company-site-hero-copy">
          <h1>GlobalCircle AI</h1>
          <p>
            AI Agent 研发与运营自动化实验室。面向主流媒体广告投放、增长运营和
            前沿产品研究，构建可落地的智能体、API 沙盒与自动化工作流。
          </p>
          <div className="company-site-actions">
            <a className="company-site-primary" href="#telegram-onboarding" onClick={handleTelegramOnboardingClick}>
              获取 API 密钥（限时免费）
              <ArrowRight aria-hidden="true" />
            </a>
            <a className="company-site-secondary" href="#api-proof">
              查看 API 示例
            </a>
          </div>
        </div>

        <div className="company-site-visual" aria-label="AI 研发与运营增长视觉示意">
          <div className="site-orbit site-orbit-a" />
          <div className="site-orbit site-orbit-b" />
          <div className="site-terminal-card site-api-console">
            <span>API Sandbox 示例</span>
            <code>{`curl -X POST https://api.globalcirclecat.com/v1/sandbox/run`}</code>
            <code>{`{ "intent": "media_lead_triage" }`}</code>
            <code>{`{ "next_action": "send_wecom_summary" }`}</code>
          </div>
          <div className="site-signal-card site-signal-card-main">
            <Bot aria-hidden="true" />
            <span>Agent Lab</span>
            <strong>智能体样品</strong>
          </div>
          <div className="site-signal-card site-signal-card-sub">
            <Megaphone aria-hidden="true" />
            <span>Media Ops</span>
            <strong>投放实验</strong>
          </div>
          <div className="site-signal-card site-signal-card-edge">
            <FlaskConical aria-hidden="true" />
            <span>Research</span>
            <strong>前沿研究</strong>
          </div>
        </div>
      </section>

      <section className="company-site-section" id="capabilities">
        <div className="company-site-section-heading">
          <span>技术能力</span>
          <h2>极客型团队，把前沿技术变成可运营产品</h2>
        </div>
        <div className="company-site-capabilities">
          {capabilities.map((item) => (
            <article className="company-site-card" key={item.title}>
              <CheckCircle2 aria-hidden="true" />
              <h3>{item.title}</h3>
              <p>{item.description}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="company-site-product-effect" id="scenarios">
        <div className="company-site-effect-copy">
          <span>合作方向</span>
          <h2>从研发探索到广告投放和运营增长</h2>
          <p>
            我们更适合做技术向、探索向的增长合作：一边研究前沿产品形态，
            一边把广告投放、线索收集、内容生产和客户运营变成可衡量的系统。
          </p>
          <div className="company-site-direction-list">
            {cooperationDirections.map((direction) => (
              <article className="company-site-direction" key={direction.title}>
                <strong>{direction.title}</strong>
                <p>{direction.description}</p>
              </article>
            ))}
          </div>
          <div className="company-site-outcomes" aria-label="产品效果指标">
            {productOutcomes.map((outcome) => (
              <span key={outcome}>{outcome}</span>
            ))}
          </div>
        </div>
        <div className="company-site-effect-layout">
          <div className="site-effect-flow company-site-workflow" aria-label="运营自动化工作流示意" id="api-proof">
            <div className="company-site-workflow-header">
              <span>workflow.demo</span>
              <strong>从线索进入到自动跟进</strong>
            </div>
            {workflowNodes.map((node, index) => (
              <div className="site-effect-step workflow-node" key={node}>
                <span>{String(index + 1).padStart(2, "0")}</span>
                <strong>{node}</strong>
              </div>
            ))}
          </div>
          <div className="company-site-scenario-grid">
            {scenarios.map((scenario) => (
              <article className="company-site-scenario-card" key={scenario.title}>
                <CheckCircle2 aria-hidden="true" />
                <h3>{scenario.title}</h3>
                <p>{scenario.description}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="company-site-band" id="delivery">
        <div>
          <span>合作流程</span>
          <h2>先验证问题，再扩大投放和产品实验</h2>
          <p>
            不直接堆功能，也不空谈概念。每次合作先定义目标、样品和指标，
            再决定是否进入更大规模的投放、运营自动化或产品研究。
          </p>
        </div>
        <ol className="company-site-steps">
          {collaborationSteps.map((step, index) => (
            <li key={step}>
              <span>{String(index + 1).padStart(2, "0")}</span>
              {step}
            </li>
          ))}
        </ol>
      </section>

      <section className="company-site-telegram-entry" id="telegram-onboarding">
        <div className="company-site-telegram-copy">
          <Bot aria-hidden="true" />
          <span>Registration</span>
          <h2>Telegram 扫码注册</h2>
          <p>
            公开官网暂时只提供扫码入口。用户扫码后在机器人私聊完成绑定，
            后台再通过受控授权和订阅分发为用户生成自己的面板与订阅入口。
          </p>
          <div className="company-site-telegram-actions">
            <a
              className="company-site-primary"
              href={telegramRegistrationHref}
              target="_blank"
              rel="noreferrer noopener"
            >
              扫码进入 Telegram 注册
              <ArrowRight aria-hidden="true" />
            </a>
            <span>@gcaltd0528_bot</span>
          </div>
        </div>
        <div className="company-site-telegram-panel">
          <a
            className="company-site-qr-link"
            href={telegramRegistrationHref}
            target="_blank"
            rel="noreferrer noopener"
            aria-label="Telegram 注册二维码占位"
          >
            <span className="company-site-qr-pattern" aria-hidden="true">
              {Array.from({ length: 49 }, (_, index) => (
                <i key={index} />
              ))}
            </span>
          </a>
          <ol className="company-site-telegram-steps">
            {telegramRegistrationSteps.map((step, index) => (
              <li key={step}>
                <span>{String(index + 1).padStart(2, "0")}</span>
                {step}
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="company-site-contact" id="contact">
        <div className="company-site-contact-copy">
          <Building2 aria-hidden="true" />
          <h2>联系我们</h2>
          <p>
            留下合作方向、投放目标或前沿产品研究需求，表单会进入公开站点 lead intake。
            用户注册优先走 Telegram 扫码入口；公开官网不承载客户数据。
          </p>
          <span className="company-site-email">
            {contactEmail}
          </span>
        </div>
        <form className="company-site-contact-form" onSubmit={handleLeadSubmit}>
          <label>
            公司或机构
            <input name="organization" type="text" placeholder="公司、团队或项目名称" required />
          </label>
          <label>
            工作邮箱
            <input name="email" type="email" placeholder="name@example.com" required />
          </label>
          <label>
            合作方向
            <select name="direction" required defaultValue="">
              <option value="" disabled>
                选择最接近的需求
              </option>
              <option value="获取 API 密钥">获取 API 密钥</option>
              <option value="预约自动化诊断">预约自动化诊断</option>
              <option value="主流媒体广告投放">主流媒体广告投放</option>
              <option value="前沿产品研究">前沿产品研究</option>
            </select>
          </label>
          <label>
            预算或阶段
            <input name="stage" type="text" placeholder="探索、试点、投放中或已有预算" />
          </label>
          <label>
            需求说明
            <textarea
              name="message"
              rows={4}
              placeholder="说明 AI Agent、API 沙盒、广告投放、自动化工作流或前沿产品研究方向"
              required
            />
          </label>
          {leadStatus === "success" ? (
            <p className="company-site-form-status company-site-form-status-ok" role="status">
              已提交，我们会在 2 小时内联系你。
            </p>
          ) : null}
          {leadStatus === "error" ? (
            <p className="company-site-form-status company-site-form-status-error" role="alert">
              提交失败，请稍后重试或直接联系 {contactEmail}。
            </p>
          ) : null}
          <button className="company-site-primary" type="submit" disabled={leadStatus === "submitting"}>
            {leadStatus === "submitting" ? "提交中" : "提交自动化诊断"}
            <ArrowRight aria-hidden="true" />
          </button>
        </form>
      </section>
    </main>
  );
}
