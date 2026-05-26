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

const deliverySteps = [
  "确认需求",
  "完成开通",
  "接收入口",
  "导入客户端"
];

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
        <div>
          <Building2 aria-hidden="true" />
          <h2>获取客户入口</h2>
          <p>请通过已确认的商务或客服渠道申请开通，已开通用户使用专属入口访问。</p>
        </div>
        <a className="company-site-primary" href="#contact">
          联系开通
          <ArrowRight aria-hidden="true" />
        </a>
      </section>
    </main>
  );
}
