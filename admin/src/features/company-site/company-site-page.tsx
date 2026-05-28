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
    title: "智能体方案设计",
    description: "把获客、跟进、内容和复盘拆成清晰流程，先做可验证样品，再进入交付。"
  },
  {
    title: "产品样品验证",
    description: "用小范围试点验证真实业务场景，帮助团队判断是否值得继续投入。"
  },
  {
    title: "企业资料整理",
    description: "把产品资料、投放素材和运营记录整理成可复用的内部知识资产。"
  },
  {
    title: "运营自动化",
    description: "让线索分层、通知提醒、内容生成和效果复盘形成稳定执行节奏。"
  }
];

const cooperationDirections = [
  {
    title: "主流媒体广告投放",
    description: "面向搜索、信息流、社交平台和内容平台设计获客链路，重点关注线索质量和转化效率。"
  },
  {
    title: "前沿产品研究",
    description: "围绕 AI Agent、自动化工作流和新型交互产品做快速验证与样品交付。"
  },
  {
    title: "多域名投放落地页",
    description: "用独立域名承载公开获客、广告测试和品牌触达，客户入口按交付节奏单独提供。"
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
  "提交需求",
  "智能分层",
  "专人跟进",
  "复盘优化"
];

const contactEmail = "hello@globalcirclecat.com";
const telegramRegistrationHref = "https://t.me/gcaltd0528_bot?start=public_landing";
const telegramRegistrationSteps = [
  "扫码开启咨询",
  "确认联系方式",
  "获得服务入口",
  "接收后续服务"
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
        throw new Error("Public lead intake failed");
      }
      form.reset();
      setLeadStatus("success");
    } catch (error) {
      setLeadStatus("error");
    }
  }

  function handleSiteAnchorClick(event: MouseEvent<HTMLAnchorElement>, sectionId: string) {
    event.preventDefault();
    document.getElementById(sectionId)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return (
    <main className="company-site-shell">
      <header className="company-site-header">
        <a
          className="company-site-brand"
          href="#top"
          aria-label="GlobalCircle AI home"
          onClick={(event) => handleSiteAnchorClick(event, "top")}
        >
          <span>GC</span>
          <strong>GlobalCircle AI</strong>
        </a>
        <nav className="company-site-nav" aria-label="公司官网导航">
          <a href="#capabilities" onClick={(event) => handleSiteAnchorClick(event, "capabilities")}>
            能力
          </a>
          <a href="#scenarios" onClick={(event) => handleSiteAnchorClick(event, "scenarios")}>
            场景
          </a>
          <a href="#delivery" onClick={(event) => handleSiteAnchorClick(event, "delivery")}>
            合作
          </a>
          <a href="#contact" onClick={(event) => handleSiteAnchorClick(event, "contact")}>
            联系
          </a>
          <a
            className="company-site-workbench-link"
            href="#telegram-onboarding"
            aria-label="注册入口"
            onClick={(event) => handleSiteAnchorClick(event, "telegram-onboarding")}
          >
            <LockKeyhole aria-hidden="true" />
            注册入口
          </a>
        </nav>
      </header>

      <section className="company-site-hero" id="top">
        <div className="company-site-hero-copy">
          <h1>GlobalCircle AI</h1>
          <p>
            面向广告投放、私域运营和前沿产品团队，提供 AI 研发、增长自动化与
            业务流程样品验证，让复杂技术转化为可执行的运营结果。
          </p>
          <div className="company-site-actions">
            <a
              className="company-site-primary"
              href="#telegram-onboarding"
              onClick={(event) => handleSiteAnchorClick(event, "telegram-onboarding")}
            >
              申请试用名额
              <ArrowRight aria-hidden="true" />
            </a>
            <a
              className="company-site-secondary"
              href="#api-proof"
              onClick={(event) => handleSiteAnchorClick(event, "api-proof")}
            >
              查看服务流程
            </a>
          </div>
        </div>

        <div className="company-site-visual" aria-label="AI 研发与运营增长视觉示意">
          <div className="site-orbit site-orbit-a" />
          <div className="site-orbit site-orbit-b" />
          <div className="site-terminal-card site-api-console">
            <span>增长实验样板</span>
            <strong>线索进入后自动归类</strong>
            <p>识别投放来源、客户意图和优先级</p>
            <p>同步提醒负责人，并沉淀复盘记录</p>
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
            一边把广告投放、线索收集、内容生产和客户运营变成可衡量的业务流程。
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
              <span>service flow</span>
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
            扫码进入 Telegram 后，可以快速完成联系确认并获取后续服务入口。
            我们会根据需求阶段安排诊断、试用或合作跟进。
          </p>
          <div className="company-site-telegram-actions">
            <a
              className="company-site-primary"
              href={telegramRegistrationHref}
              target="_blank"
              rel="noreferrer noopener"
            >
              扫码进入 Telegram
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
            留下合作方向、投放目标或前沿产品研究需求，我们会把信息同步到自动化诊断流程。
            用户注册优先走 Telegram 扫码入口；公开官网只负责公开咨询与合作线索。
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
              <option value="申请试用名额">申请试用名额</option>
              <option value="预约增长诊断">预约增长诊断</option>
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
              placeholder="说明广告投放、私域运营、自动化流程或前沿产品研究方向"
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
            {leadStatus === "submitting" ? "提交中" : "提交合作需求"}
            <ArrowRight aria-hidden="true" />
          </button>
        </form>
      </section>
    </main>
  );
}
