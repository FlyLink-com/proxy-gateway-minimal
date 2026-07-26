export type PortalCommerceLocale = "zh" | "en";

type PanelProps = {
  locale: PortalCommerceLocale;
};

const RECHARGE_DENOMINATIONS = [10, 30, 50, 100, 200, 300] as const;

function isChinese(locale: PortalCommerceLocale) {
  return locale === "zh";
}

export function MarketplacePanel({ locale }: PanelProps) {
  const zh = isChinese(locale);
  const categories = zh ? ["商品", "套餐", "流量包", "增值项"] : ["Products", "Plans", "Data packs", "Add-ons"];

  return (
    <section className="portal-commerce-layout portal-commerce-layout--marketplace" aria-labelledby="portal-commerce-marketplace-heading">
      <header className="portal-commerce-layout__header">
        <h2 id="portal-commerce-marketplace-heading">{zh ? "平台服务商城" : "Platform service marketplace"}</h2>
        <p>
          {zh
            ? "商城负责展示平台服务类别；具体可用目录将由服务确认。"
            : "The marketplace owns the display of platform service categories; catalog availability will be confirmed by the service."}
        </p>
      </header>
      <section className="portal-commerce-layout__section" aria-label={zh ? "服务类别" : "Service categories"}>
        <ul className="portal-commerce-layout__list">
          {categories.map((category) => (
            <li key={category}>{category}</li>
          ))}
        </ul>
        <p>
          {zh
            ? "现有套餐购买路径仍可单独使用。"
            : "The existing plan purchase path remains available separately."}
        </p>
        <button type="button" disabled>
          {zh ? "购买暂未开放" : "Purchasing is not available yet"}
        </button>
      </section>
    </section>
  );
}

export function WalletPanel({ locale }: PanelProps) {
  const zh = isChinese(locale);
  const balances = zh ? ["已购 Coins", "赠送 Coins", "奖励 Coins"] : ["Paid Coins", "Bonus Coins", "Reward Coins"];

  return (
    <section className="portal-commerce-layout portal-commerce-layout--wallet" aria-labelledby="portal-commerce-wallet-heading">
      <header className="portal-commerce-layout__header">
        <h2 id="portal-commerce-wallet-heading">{zh ? "余额与充值" : "Balance and recharge"}</h2>
      </header>
      <section className="portal-commerce-layout__section" aria-labelledby="portal-commerce-wallet-balance-heading">
        <h3 id="portal-commerce-wallet-balance-heading">{zh ? "余额" : "Balance"}</h3>
        <div className="portal-commerce-layout__balances">
          {balances.map((balance) => (
            <article key={balance}>
              <h4>{balance}</h4>
              <p>--</p>
            </article>
          ))}
        </div>
      </section>
      <section className="portal-commerce-layout__section" aria-labelledby="portal-commerce-wallet-recharge-heading">
        <h3 id="portal-commerce-wallet-recharge-heading">{zh ? "充值" : "Recharge"}</h3>
        <ul className="portal-commerce-layout__list">
          {RECHARGE_DENOMINATIONS.map((amount) => (
            <li key={amount}>
              <span>{amount} Coins</span>
              <button
                type="button"
                disabled
                aria-label={zh ? `充值 ${amount} Coins 暂未开放` : `Recharge ${amount} Coins — not available yet`}
              >
                {zh ? "充值暂未开放" : "Recharge is not available yet"}
              </button>
            </li>
          ))}
        </ul>
      </section>
      <section className="portal-commerce-layout__section" aria-label={zh ? "钱包功能" : "Wallet functions"}>
        <ul className="portal-commerce-layout__list">
          <li>{zh ? "流水" : "Activity"}</li>
          <li>{zh ? "奖励" : "Rewards"}</li>
        </ul>
      </section>
    </section>
  );
}

export function ReferralRewardsPanel({ locale }: PanelProps) {
  const zh = isChinese(locale);
  const metrics = zh
    ? ["有效注册", "归因消费", "待确认奖励", "可用奖励"]
    : ["Attributed registrations", "Attributed spend", "Pending reward", "Available reward"];

  return (
    <section className="portal-commerce-layout portal-commerce-layout--referral-rewards" aria-labelledby="portal-commerce-referral-heading">
      <header className="portal-commerce-layout__header">
        <h2 id="portal-commerce-referral-heading">{zh ? "推广绩效" : "Referral performance"}</h2>
        <h3>{zh ? "我的推荐链接" : "My referral link"}</h3>
        <p>
          {zh
            ? "每个账户仅拥有一个推荐链接，首次创建链接时会建立推广档案。"
            : "Each account owns exactly one referral link, and the profile is created on first link creation."}
        </p>
      </header>
      <section className="portal-commerce-layout__section" aria-label={zh ? "推广指标" : "Referral metrics"}>
        <dl className="portal-commerce-layout__metrics">
          {metrics.map((metric) => (
            <div className="portal-commerce-layout__metric" key={metric}>
              <dt>{metric}</dt>
              <dd>--</dd>
            </div>
          ))}
        </dl>
        <button type="button" disabled>
          {zh ? "生成推荐链接（暂未开放）" : "Create referral link (not available yet)"}
        </button>
      </section>
      <section className="portal-commerce-layout__section" aria-label={zh ? "奖励状态" : "Reward states"}>
        <p>
          {zh
            ? "奖励不会递归产生新的奖励。pending 表示待确认，available 表示可用，held 表示暂时保留，reversed 表示已撤销。"
            : "Referral rewards do not recursively create new rewards. pending means awaiting confirmation, available means usable, held means temporarily retained, and reversed means cancelled."}
        </p>
      </section>
    </section>
  );
}
