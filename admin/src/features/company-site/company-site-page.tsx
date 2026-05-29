import {
  ArrowRight,
  Bot,
  Building2,
  CheckCircle2,
  FlaskConical,
  Megaphone
} from "lucide-react";
import { type FormEvent, type MouseEvent, useEffect, useState } from "react";

const contactEmail = "hello@globalcirclecat.com";

const siteCopy = {
  zh: {
    htmlLang: "zh-CN",
    documentTitle: "GlobalCircle AI - 智能体研发与增长自动化",
    navAria: "公司官网导航",
    brandAria: "GlobalCircle AI 首页",
    nav: {
      capabilities: "能力",
      scenarios: "场景",
      delivery: "合作",
      contact: "联系"
    },
    hero: {
      title: "GlobalCircle AI",
      body: "面向广告投放、私域运营和前沿产品团队，提供 AI 研发、增长自动化与业务流程样品验证，让复杂技术转化为可执行的运营结果。",
      primary: "申请试用名额",
      secondary: "查看服务流程"
    },
    visual: {
      aria: "AI 研发与运营增长视觉示意",
      sampleLabel: "增长实验样板",
      sampleTitle: "线索进入后自动归类",
      sampleSource: "识别投放来源、客户意图和优先级",
      sampleFollowup: "同步提醒负责人，并沉淀复盘记录",
      agentLabel: "智能体实验室",
      agentTitle: "智能体样品",
      mediaLabel: "投放运营",
      mediaTitle: "投放实验",
      researchLabel: "产品研究",
      researchTitle: "前沿研究"
    },
    capabilitiesKicker: "技术能力",
    capabilitiesTitle: "极客型团队，把前沿技术变成可运营产品",
    capabilities: [
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
    ],
    directionsKicker: "合作方向",
    directionsTitle: "从研发探索到广告投放和运营增长",
    directionsBody:
      "我们更适合做技术向、探索向的增长合作：一边研究前沿产品形态，一边把广告投放、线索收集、内容生产和客户运营变成可衡量的业务流程。",
    directions: [
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
    ],
    outcomes: ["获客链路更短", "运营动作可追踪", "AI 工作流可复用"],
    workflow: {
      aria: "运营自动化工作流示意",
      label: "服务流程",
      title: "从线索进入到自动跟进",
      nodes: ["提交需求", "智能分层", "专人跟进", "复盘优化"]
    },
    scenarios: [
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
    ],
    delivery: {
      kicker: "合作流程",
      title: "先验证问题，再扩大投放和产品实验",
      body: "不直接堆功能，也不空谈概念。每次合作先定义目标、样品和指标，再决定是否进入更大规模的投放、运营自动化或产品研究。",
      steps: ["问题诊断", "样品验证", "投放测试", "运营复盘"]
    },
    contact: {
      title: "联系我们",
      body: "留下合作方向、投放目标或前沿产品研究需求，我们会把信息同步到自动化诊断流程。公开官网只负责公开咨询与合作线索。"
    },
    form: {
      organization: "公司或机构",
      organizationPlaceholder: "公司、团队或项目名称",
      email: "工作邮箱",
      emailPlaceholder: "name@example.com",
      direction: "合作方向",
      directionPlaceholder: "选择最接近的需求",
      directionOptions: ["申请试用名额", "预约增长诊断", "主流媒体广告投放", "前沿产品研究"],
      stage: "预算或阶段",
      stagePlaceholder: "探索、试点、投放中或已有预算",
      message: "需求说明",
      messagePlaceholder: "说明广告投放、私域运营、自动化流程或前沿产品研究方向",
      submit: "提交合作需求",
      submitting: "提交中",
      success: "已提交，我们会在 2 小时内联系你。",
      errorPrefix: "提交失败，请稍后重试或直接联系"
    }
  },
  en: {
    htmlLang: "en",
    documentTitle: "GlobalCircle AI - Agent R&D and Growth Automation",
    navAria: "Company site navigation",
    brandAria: "GlobalCircle AI home",
    nav: {
      capabilities: "Capabilities",
      scenarios: "Use Cases",
      delivery: "Engagement",
      contact: "Contact"
    },
    hero: {
      title: "GlobalCircle AI",
      body: "We help advertising, private-community operations, and frontier product teams turn AI R&D, growth automation, and workflow prototypes into executable operating results.",
      primary: "Request Trial Access",
      secondary: "View Service Flow"
    },
    visual: {
      aria: "AI R&D and growth operations visual",
      sampleLabel: "Growth experiment sample",
      sampleTitle: "Inbound leads are classified automatically",
      sampleSource: "Identify source, intent, and priority",
      sampleFollowup: "Notify owners and preserve review records",
      agentLabel: "Agent Lab",
      agentTitle: "Agent Prototype",
      mediaLabel: "Media Ops",
      mediaTitle: "Campaign Test",
      researchLabel: "Research",
      researchTitle: "Frontier Study"
    },
    capabilitiesKicker: "Capabilities",
    capabilitiesTitle: "A geek-minded team turning frontier technology into operable products",
    capabilities: [
      {
        title: "Agent Solution Design",
        description: "Break acquisition, follow-up, content, and review loops into clear flows before delivery."
      },
      {
        title: "Product Prototype Validation",
        description: "Run small pilots against real business cases so teams can decide whether to scale."
      },
      {
        title: "Enterprise Knowledge Structuring",
        description: "Turn product materials, campaign assets, and operating records into reusable internal knowledge."
      },
      {
        title: "Operations Automation",
        description: "Stabilize lead segmentation, reminders, content generation, and performance review rhythms."
      }
    ],
    directionsKicker: "Engagement Areas",
    directionsTitle: "From R&D exploration to advertising and operational growth",
    directionsBody:
      "We focus on technical and exploratory growth work: researching frontier product forms while making ads, lead capture, content production, and customer operations measurable.",
    directions: [
      {
        title: "Mainstream Media Advertising",
        description: "Design acquisition paths across search, feed, social, and content platforms with quality and conversion tracking."
      },
      {
        title: "Frontier Product Research",
        description: "Rapidly validate AI agents, automation workflows, and new interaction products through working samples."
      },
      {
        title: "Multi-domain Landing Pages",
        description: "Use dedicated domains for public acquisition and brand tests while customer access is issued separately."
      }
    ],
    outcomes: ["Shorter acquisition path", "Traceable operations", "Reusable AI workflows"],
    workflow: {
      aria: "Operations automation workflow visual",
      label: "Service flow",
      title: "From lead intake to assisted follow-up",
      nodes: ["Submit Need", "Smart Triage", "Owner Follow-up", "Review Loop"]
    },
    scenarios: [
      {
        title: "Campaign Lead Routing",
        description: "Connect landing pages, email contact, and human follow-up so source, intent, and next steps stay clear."
      },
      {
        title: "Private Community Operations",
        description: "Use agent-assisted segmentation, outreach, and content reuse to improve small-team execution."
      },
      {
        title: "Enterprise Knowledge Assistant",
        description: "Organize scattered materials into queryable, auditable, and reusable internal knowledge services."
      },
      {
        title: "Content Production Workflow",
        description: "Stabilize topic selection, source material, drafts, review, and publishing preparation for marketing teams."
      }
    ],
    delivery: {
      kicker: "Engagement Flow",
      title: "Validate the problem before expanding campaigns and product experiments",
      body: "We do not stack features or sell abstract concepts. Each engagement starts with goals, prototypes, and metrics before moving into broader ads, automation, or product research.",
      steps: ["Diagnosis", "Prototype", "Campaign Test", "Review"]
    },
    contact: {
      title: "Contact Us",
      body: "Share your partnership direction, campaign goals, or frontier product research needs. We will route the information into an automated diagnosis flow. The public site handles consultation and partnership leads."
    },
    form: {
      organization: "Company or Organization",
      organizationPlaceholder: "Company, team, or project name",
      email: "Work Email",
      emailPlaceholder: "name@example.com",
      direction: "Engagement Direction",
      directionPlaceholder: "Choose the closest need",
      directionOptions: ["Request Trial Access", "Book Growth Diagnosis", "Mainstream Media Advertising", "Frontier Product Research"],
      stage: "Budget or Stage",
      stagePlaceholder: "Exploration, pilot, running campaign, or approved budget",
      message: "Need Description",
      messagePlaceholder: "Describe advertising, community operations, automation, or frontier product research needs",
      submit: "Submit Partnership Need",
      submitting: "Submitting",
      success: "Submitted. We will contact you within 2 hours.",
      errorPrefix: "Submission failed. Please try again later or contact"
    }
  }
} as const;

type SiteLocale = keyof typeof siteCopy;
const companySiteSectionIds = [
  "top",
  "capabilities",
  "scenarios",
  "api-proof",
  "delivery",
  "contact"
] as const;

function getPreferredCompanySiteLocale(): SiteLocale {
  if (typeof window !== "undefined") {
    const languageOverride = new URLSearchParams(window.location.search).get("lang")?.toLowerCase();
    if (languageOverride === "zh" || languageOverride === "zh-cn") {
      return "zh";
    }
    if (languageOverride === "en" || languageOverride === "en-us") {
      return "en";
    }
  }
  if (typeof navigator === "undefined") {
    return "zh";
  }
  const languages = [...(navigator.languages ?? []), navigator.language].filter(Boolean);
  return languages.some((language) => language.toLowerCase().startsWith("zh")) ? "zh" : "en";
}

function readFormValue(formData: FormData, name: string) {
  return String(formData.get(name) ?? "").trim();
}

export function CompanySitePage() {
  const [leadStatus, setLeadStatus] = useState<"idle" | "submitting" | "success" | "error">("idle");
  const [activeSection, setActiveSection] = useState<(typeof companySiteSectionIds)[number]>("top");
  const locale = getPreferredCompanySiteLocale();
  const copy = siteCopy[locale];

  useEffect(() => {
    document.documentElement.lang = copy.htmlLang;
    document.title = copy.documentTitle;
  }, [copy.documentTitle, copy.htmlLang]);

  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        const visibleEntry = entries
          .filter((entry) => entry.isIntersecting)
          .sort((left, right) => right.intersectionRatio - left.intersectionRatio)[0];

        if (visibleEntry?.target.id && companySiteSectionIds.includes(visibleEntry.target.id as typeof activeSection)) {
          setActiveSection(visibleEntry.target.id as typeof activeSection);
        }
      },
      {
        rootMargin: "-18% 0px -46% 0px",
        threshold: [0.35, 0.55, 0.75]
      }
    );

    companySiteSectionIds.forEach((sectionId) => {
      const section = document.getElementById(sectionId);
      if (section) {
        observer.observe(section);
      }
    });

    return () => observer.disconnect();
  }, []);

  async function handleLeadSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    const payload = {
      organization: readFormValue(formData, "organization"),
      email: readFormValue(formData, "email"),
      direction: readFormValue(formData, "direction"),
      stage: readFormValue(formData, "stage"),
      message: readFormValue(formData, "message"),
      locale
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
    if (companySiteSectionIds.includes(sectionId as typeof activeSection)) {
      setActiveSection(sectionId as typeof activeSection);
    }
    document.getElementById(sectionId)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return (
    <main className="company-site-shell" data-active-section={activeSection}>
      <header className="company-site-header">
        <a
          className="company-site-brand"
          href="#top"
          aria-label={copy.brandAria}
          onClick={(event) => handleSiteAnchorClick(event, "top")}
        >
          <span>GC</span>
          <strong>GlobalCircle AI</strong>
        </a>
        <nav className="company-site-nav" aria-label={copy.navAria}>
          <a href="#capabilities" onClick={(event) => handleSiteAnchorClick(event, "capabilities")}>
            {copy.nav.capabilities}
          </a>
          <a href="#scenarios" onClick={(event) => handleSiteAnchorClick(event, "scenarios")}>
            {copy.nav.scenarios}
          </a>
          <a href="#delivery" onClick={(event) => handleSiteAnchorClick(event, "delivery")}>
            {copy.nav.delivery}
          </a>
          <a href="#contact" onClick={(event) => handleSiteAnchorClick(event, "contact")}>
            {copy.nav.contact}
          </a>
        </nav>
      </header>

      <section className="company-site-hero" id="top">
        <div className="company-site-hero-copy">
          <h1>{copy.hero.title}</h1>
          <p>{copy.hero.body}</p>
          <div className="company-site-actions">
            <a
              className="company-site-primary"
              href="#contact"
              onClick={(event) => handleSiteAnchorClick(event, "contact")}
            >
              {copy.hero.primary}
              <ArrowRight aria-hidden="true" />
            </a>
            <a
              className="company-site-secondary"
              href="#api-proof"
              onClick={(event) => handleSiteAnchorClick(event, "api-proof")}
            >
              {copy.hero.secondary}
            </a>
          </div>
        </div>

        <div className="company-site-visual" aria-label={copy.visual.aria}>
          <div className="site-orbit site-orbit-a" />
          <div className="site-orbit site-orbit-b" />
          <div className="site-terminal-card site-api-console">
            <span>{copy.visual.sampleLabel}</span>
            <strong>{copy.visual.sampleTitle}</strong>
            <p>{copy.visual.sampleSource}</p>
            <p>{copy.visual.sampleFollowup}</p>
          </div>
          <div className="site-signal-card site-signal-card-main">
            <Bot aria-hidden="true" />
            <span>{copy.visual.agentLabel}</span>
            <strong>{copy.visual.agentTitle}</strong>
          </div>
          <div className="site-signal-card site-signal-card-sub">
            <Megaphone aria-hidden="true" />
            <span>{copy.visual.mediaLabel}</span>
            <strong>{copy.visual.mediaTitle}</strong>
          </div>
          <div className="site-signal-card site-signal-card-edge">
            <FlaskConical aria-hidden="true" />
            <span>{copy.visual.researchLabel}</span>
            <strong>{copy.visual.researchTitle}</strong>
          </div>
        </div>
      </section>

      <section className="company-site-section" id="capabilities">
        <div className="company-site-section-heading">
          <span>{copy.capabilitiesKicker}</span>
          <h2>{copy.capabilitiesTitle}</h2>
        </div>
        <div className="company-site-capabilities">
          {copy.capabilities.map((item) => (
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
          <span>{copy.directionsKicker}</span>
          <h2>{copy.directionsTitle}</h2>
          <p>{copy.directionsBody}</p>
          <div className="company-site-direction-list">
            {copy.directions.map((direction) => (
              <article className="company-site-direction" key={direction.title}>
                <strong>{direction.title}</strong>
                <p>{direction.description}</p>
              </article>
            ))}
          </div>
          <div className="company-site-outcomes" aria-label="Product outcomes">
            {copy.outcomes.map((outcome) => (
              <span key={outcome}>{outcome}</span>
            ))}
          </div>
        </div>
        <div className="company-site-effect-layout">
          <div className="site-effect-flow company-site-workflow" aria-label={copy.workflow.aria} id="api-proof">
            <div className="company-site-workflow-header">
              <span>{copy.workflow.label}</span>
              <strong>{copy.workflow.title}</strong>
            </div>
            {copy.workflow.nodes.map((node, index) => (
              <div className="site-effect-step workflow-node" key={node}>
                <span>{String(index + 1).padStart(2, "0")}</span>
                <strong>{node}</strong>
              </div>
            ))}
          </div>
          <div className="company-site-scenario-grid">
            {copy.scenarios.map((scenario) => (
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
          <span>{copy.delivery.kicker}</span>
          <h2>{copy.delivery.title}</h2>
          <p>{copy.delivery.body}</p>
        </div>
        <ol className="company-site-steps">
          {copy.delivery.steps.map((step, index) => (
            <li key={step}>
              <span>{String(index + 1).padStart(2, "0")}</span>
              {step}
            </li>
          ))}
        </ol>
      </section>

      <section className="company-site-contact" id="contact">
        <div className="company-site-contact-copy">
          <Building2 aria-hidden="true" />
          <h2>{copy.contact.title}</h2>
          <p>{copy.contact.body}</p>
          <span className="company-site-email">
            {contactEmail}
          </span>
        </div>
        <form className="company-site-contact-form" onSubmit={handleLeadSubmit}>
          <label>
            {copy.form.organization}
            <input name="organization" type="text" placeholder={copy.form.organizationPlaceholder} required />
          </label>
          <label>
            {copy.form.email}
            <input name="email" type="email" placeholder={copy.form.emailPlaceholder} required />
          </label>
          <label>
            {copy.form.direction}
            <select name="direction" required defaultValue="">
              <option value="" disabled>
                {copy.form.directionPlaceholder}
              </option>
              {copy.form.directionOptions.map((option) => (
                <option value={option} key={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>
          <label>
            {copy.form.stage}
            <input name="stage" type="text" placeholder={copy.form.stagePlaceholder} />
          </label>
          <label>
            {copy.form.message}
            <textarea
              name="message"
              rows={4}
              placeholder={copy.form.messagePlaceholder}
              required
            />
          </label>
          {leadStatus === "success" ? (
            <p className="company-site-form-status company-site-form-status-ok" role="status">
              {copy.form.success}
            </p>
          ) : null}
          {leadStatus === "error" ? (
            <p className="company-site-form-status company-site-form-status-error" role="alert">
              {copy.form.errorPrefix} {contactEmail}.
            </p>
          ) : null}
          <button className="company-site-primary" type="submit" disabled={leadStatus === "submitting"}>
            {leadStatus === "submitting" ? copy.form.submitting : copy.form.submit}
            <ArrowRight aria-hidden="true" />
          </button>
        </form>
      </section>
    </main>
  );
}
