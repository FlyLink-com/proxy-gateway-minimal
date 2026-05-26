import { ArrowRight, Building2, CheckCircle2, Globe2, ShieldCheck, Workflow } from "lucide-react";

const capabilities = [
  {
    title: "稳定订阅",
    description: "为个人和小团队提供清晰的订阅入口，减少重复配置和手动维护。"
  },
  {
    title: "多端导入",
    description: "覆盖桌面端和移动端常见客户端，开通后按指引完成导入。"
  },
  {
    title: "持续支持",
    description: "入口更新、套餐状态和使用问题都通过已确认的服务渠道处理。"
  }
];

const scenarios = [
  {
    title: "个人多端",
    description: "桌面端、移动端按同一开通节奏导入，适合长期自用和多设备使用。"
  },
  {
    title: "小团队协作",
    description: "统一确认需求、统一发送入口，减少成员之间反复转发和解释成本。"
  },
  {
    title: "移动办公",
    description: "适合出差、远程协作和临时设备切换，重点是入口清晰、指引明确。"
  },
  {
    title: "长期维护",
    description: "入口更新、套餐状态和常见问题通过已确认渠道持续跟进。"
  }
];

const productOutcomes = [
  "一处开通，多端导入",
  "入口更新更清晰",
  "持续服务跟进"
];

const deliverySteps = [
  "确认需求",
  "完成开通",
  "接收入口",
  "导入客户端"
];

const contactEmail = "gccltd.co@outlook.com";

export function CompanySitePage() {
  return (
    <main className="company-site-shell">
      <header className="company-site-header">
        <a className="company-site-brand" href="#top" aria-label="GlobalCircle Access home">
          <span>GC</span>
          <strong>GlobalCircle Access</strong>
        </a>
        <nav className="company-site-nav" aria-label="公司官网导航">
          <a href="#capabilities">服务</a>
          <a href="#scenarios">场景</a>
          <a href="#delivery">开通</a>
          <a href="#contact">联系</a>
        </nav>
      </header>

      <section className="company-site-hero" id="top">
        <div className="company-site-hero-copy">
          <h1>GlobalCircle Access</h1>
          <p>
            稳定订阅接入，面向个人和小团队的轻量服务。开通后获取专属入口，
            按指引完成客户端导入。
          </p>
          <div className="company-site-actions">
            <a className="company-site-primary" href="#contact">
              获取客户入口
              <ArrowRight aria-hidden="true" />
            </a>
            <a className="company-site-secondary" href="#capabilities">
              了解服务
            </a>
          </div>
        </div>

        <div className="company-site-visual" aria-label="订阅服务视觉示意">
          <div className="site-orbit site-orbit-a" />
          <div className="site-orbit site-orbit-b" />
          <div className="site-signal-card site-signal-card-main">
            <Globe2 aria-hidden="true" />
            <span>Service</span>
            <strong>稳定接入</strong>
          </div>
          <div className="site-signal-card site-signal-card-sub">
            <ShieldCheck aria-hidden="true" />
            <span>Member</span>
            <strong>专属入口</strong>
          </div>
          <div className="site-signal-card site-signal-card-edge">
            <Workflow aria-hidden="true" />
            <span>Guide</span>
            <strong>多端导入</strong>
          </div>
        </div>
      </section>

      <section className="company-site-section" id="capabilities">
        <div className="company-site-section-heading">
          <span>服务能力</span>
          <h2>稳定、清晰、易上手的订阅接入服务</h2>
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
          <span>应用场景</span>
          <h2>覆盖更多常见订阅接入场景</h2>
          <p>
            这个服务的核心不是复杂配置，而是把开通、入口、导入和后续支持整理成清晰流程。
            因此它可以覆盖个人、小团队、移动办公和长期维护等高频需求。
          </p>
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
          <span>开通流程</span>
          <h2>开通后获取专属入口</h2>
          <p>
            完成开通后，我们会通过已确认的服务渠道发送专属入口和导入说明。
            用户只需要保存最新入口，并按指引导入客户端。
          </p>
        </div>
        <ol className="company-site-steps">
          {deliverySteps.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
      </section>

      <section className="company-site-contact" id="contact">
        <div className="company-site-contact-copy">
          <Building2 aria-hidden="true" />
          <h2>联系我们</h2>
          <p>
            留下联系方式和需求说明，我们会通过邮件回复。已开通用户仍使用专属入口访问。
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
            称呼
            <input name="name" type="text" placeholder="您的称呼" />
          </label>
          <label>
            联系方式
            <input name="contact" type="text" placeholder="邮箱或即时通讯方式" required />
          </label>
          <label>
            需求说明
            <textarea
              name="message"
              rows={4}
              placeholder="简单说明使用人数、设备和开通需求"
              required
            />
          </label>
          <p>表单会调用本机邮件客户端，不会在当前页面保存信息。</p>
          <button className="company-site-primary" type="submit">
            发送邮件
            <ArrowRight aria-hidden="true" />
          </button>
        </form>
      </section>
    </main>
  );
}
