import {
  ArrowRight,
  Bot,
  Building2,
  CheckCircle2,
  FlaskConical,
  Megaphone
} from "lucide-react";

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
    description: "域名池只承载公开获客、广告测试和品牌触达；登录态工具入口继续由运营侧单独发放。"
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

const contactEmail = "gccltd.co@outlook.com";

export function CompanySitePage() {
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
            <a className="company-site-primary" href="#contact">
              申请沙盒访问
              <ArrowRight aria-hidden="true" />
            </a>
            <a className="company-site-secondary" href="#scenarios">
              查看合作方向
            </a>
          </div>
        </div>

        <div className="company-site-visual" aria-label="AI 研发与运营增长视觉示意">
          <div className="site-orbit site-orbit-a" />
          <div className="site-orbit site-orbit-b" />
          <div className="site-terminal-card" aria-hidden="true">
            <span>research.log</span>
            <code>agent.prototype()</code>
            <code>media.signal.scan()</code>
            <code>growth.loop.measure()</code>
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
        </div>
        <div className="company-site-effect-layout">
          <div className="site-effect-flow" aria-label="产品效果示意">
            {productOutcomes.map((outcome, index) => (
              <div className="site-effect-step" key={outcome}>
                <span>{String(index + 1).padStart(2, "0")}</span>
                <strong>{outcome}</strong>
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
          {collaborationSteps.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
      </section>

      <section className="company-site-contact" id="contact">
        <div className="company-site-contact-copy">
          <Building2 aria-hidden="true" />
          <h2>联系我们</h2>
          <p>
            留下合作方向、投放目标或前沿产品研究需求，我们会通过邮件回复。
            登录态客户工具仍通过单独发放的动态入口访问。
          </p>
          <a className="company-site-email" href={`mailto:${contactEmail}`}>
            {contactEmail}
          </a>
        </div>
        <form
          className="company-site-contact-form"
          action={`mailto:${contactEmail}`}
          method="post"
          encType="text/plain"
        >
          <label>
            公司或机构
            <input name="organization" type="text" placeholder="公司、团队或项目名称" />
          </label>
          <label>
            联系邮箱
            <input name="email" type="email" placeholder="name@example.com" required />
          </label>
          <label>
            投放或运营目标
            <input name="growth_goal" type="text" placeholder="获客、转化、私域运营或内容增长" required />
          </label>
          <label>
            技术需求
            <textarea
              name="technical_need"
              rows={4}
              placeholder="简单说明 AI Agent、API 沙盒、自动化工作流或前沿产品研究方向"
              required
            />
          </label>
          <p>表单会调用本机邮件客户端，不会在当前页面保存信息。</p>
          <button className="company-site-primary" type="submit">
            发送合作需求
            <ArrowRight aria-hidden="true" />
          </button>
        </form>
      </section>
    </main>
  );
}
