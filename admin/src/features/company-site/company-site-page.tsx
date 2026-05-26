import { ArrowRight, Building2, CheckCircle2, Globe2, ShieldCheck, Workflow } from "lucide-react";

const capabilities = [
  {
    title: "订阅分发",
    description: "将客户订阅、套餐状态和客户端导入材料集中在受控分发流程中。"
  },
  {
    title: "接入治理",
    description: "通过服务端授权、可撤销入口和运营审核降低公开暴露面。"
  },
  {
    title: "节点解耦",
    description: "平台侧只管理用户和订阅，转发能力由独立边缘节点承载。"
  }
];

const deliverySteps = [
  "商务确认",
  "运营开通",
  "专属入口发放",
  "客户端导入"
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
          <a href="#capabilities">能力</a>
          <a href="#delivery">交付</a>
          <a href="#contact">联系</a>
        </nav>
      </header>

      <section className="company-site-hero" id="top">
        <div className="company-site-hero-copy">
          <h1>GlobalCircle Access</h1>
          <p>
            面向个人和小团队的订阅接入服务。官网只承载品牌、商务沟通和服务说明。
          </p>
          <div className="company-site-actions">
            <a className="company-site-primary" href="#contact">
              获取客户入口
              <ArrowRight aria-hidden="true" />
            </a>
            <a className="company-site-secondary" href="#capabilities">
              查看能力
            </a>
          </div>
        </div>

        <div className="company-site-visual" aria-label="订阅平台视觉示意">
          <div className="site-orbit site-orbit-a" />
          <div className="site-orbit site-orbit-b" />
          <div className="site-signal-card site-signal-card-main">
            <Globe2 aria-hidden="true" />
            <span>Public Site</span>
            <strong>Brand only</strong>
          </div>
          <div className="site-signal-card site-signal-card-sub">
            <ShieldCheck aria-hidden="true" />
            <span>Access</span>
            <strong>Operator issued</strong>
          </div>
          <div className="site-signal-card site-signal-card-edge">
            <Workflow aria-hidden="true" />
            <span>Delivery</span>
            <strong>Controlled</strong>
          </div>
        </div>
      </section>

      <section className="company-site-section" id="capabilities">
        <div className="company-site-section-heading">
          <span>Service</span>
          <h2>一个轻量、可运营、可替换的订阅分发平台</h2>
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
          <span>Delivery</span>
          <h2>客户入口由运营侧发放</h2>
          <p>
            官网不直接承载登录后界面。开通后的访问入口通过独立渠道发放，并可按客户、
            周期或风险状态进行轮换。
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
