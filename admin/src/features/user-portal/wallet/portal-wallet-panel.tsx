import { useState } from "react";

import {
  formatPortalDateTime,
  portalCoinTypeLabel,
  portalLedgerCategoryLabel
} from "../portal-commerce-presentation";
import { useDesktopScrollRegion } from "../use-desktop-scroll-region";
import type {
  PortalWalletLedgerEntry,
  PortalWalletStatus,
  PortalWalletSummary
} from "./api-contract";
import type {
  PortalWalletReadModel,
  ReadState
} from "./use-portal-wallet-read-model";
import {
  PortalRechargeDialog,
  type PortalRechargeModel
} from "../recharge";

export type PortalWalletPanelProps = {
  locale: "zh" | "en";
  model: PortalWalletReadModel;
  rechargeModel?: PortalRechargeModel;
};

type WalletLedgerView = "overview" | "all";

const RECENT_LEDGER_LIMIT = 5;

function walletStatusLabel(
  status: PortalWalletStatus,
  locale: PortalWalletPanelProps["locale"]
) {
  const labels = locale === "zh"
    ? {
        not_created: "待首次入账",
        active: "正常",
        frozen: "已冻结",
        closed: "已关闭"
      }
    : {
        not_created: "Awaiting first credit",
        active: "Active",
        frozen: "Frozen",
        closed: "Closed"
      };
  return labels[status];
}

function SummaryState({
  locale,
  model
}: PortalWalletPanelProps) {
  const zh = locale === "zh";
  const state = model.summary;
  if (state.phase === "loading") {
    return (
      <div className="portal-wallet-state" role="status" aria-live="polite">
        {zh ? "正在加载钱包余额…" : "Loading Wallet balance…"}
      </div>
    );
  }
  if (state.phase === "unavailable" || state.phase === "error") {
    const unavailable = state.phase === "unavailable";
    return (
      <div
        className="portal-wallet-state"
        role={unavailable ? "status" : "alert"}
      >
        <p>
          {unavailable
            ? zh
              ? "钱包余额暂不可用。"
              : "Wallet balance is unavailable."
            : zh
              ? "钱包余额加载失败。"
              : "Wallet balance could not be loaded."}
        </p>
        {state.retryable ? (
          <button type="button" onClick={model.retrySummary}>
            {zh ? "重试余额" : "Retry balance"}
          </button>
        ) : null}
      </div>
    );
  }
  return (
    <>
      {state.phase === "empty" ? (
        <p className="portal-wallet-state" role="status">
          {zh
            ? "尚无 Coins 入账。首次充值到账后，钱包将自动启用。"
            : "No Coins have been credited yet. Your Wallet will activate automatically after the first successful recharge."}
        </p>
      ) : null}
      <WalletSummary locale={locale} summary={state.value} />
    </>
  );
}

function WalletSummary({
  locale,
  summary
}: {
  locale: PortalWalletPanelProps["locale"];
  summary: PortalWalletSummary;
}) {
  const zh = locale === "zh";
  const primaryBalances = [
    {
      id: "spendable",
      label: zh ? "可用余额" : "Spendable balance",
      value: summary.spendableUnits,
      featured: true
    },
    {
      id: "paid",
      label: zh ? "已购可用" : "Purchased available",
      value: summary.balances.paidCoins,
      featured: false
    },
    {
      id: "bonus",
      label: zh ? "赠送可用" : "Bonus available",
      value: summary.balances.bonusCoins,
      featured: false
    },
    {
      id: "reward",
      label: zh ? "奖励可用" : "Reward available",
      value: summary.balances.rewardCoins,
      featured: false
    }
  ] as const;
  const statusBalances = [
    {
      id: "held",
      label: zh ? "订单预留" : "Order reserved",
      value: summary.heldUnits
    },
    {
      id: "pending",
      label: zh ? "待确认奖励" : "Pending rewards",
      value: summary.pendingUnits
    }
  ] as const;
  return (
    <>
      <p className="portal-wallet-status">
        {zh ? "钱包状态：" : "Wallet status: "}
        <strong>{walletStatusLabel(summary.status, locale)}</strong>
      </p>
      <dl className="portal-wallet-balance-grid">
        {primaryBalances.map((balance) => (
          <div
            className={balance.featured
              ? "portal-wallet-balance-grid__spendable"
              : undefined}
            key={balance.id}
          >
            <dt>{balance.label}</dt>
            <dd>{balance.value}</dd>
          </div>
        ))}
      </dl>
      <dl
        className="portal-wallet-status-grid"
        aria-label={zh ? "订单与奖励状态" : "Order and reward status"}
      >
        {statusBalances.map((balance) => (
          <div key={balance.id}>
            <dt>{balance.label}</dt>
            <dd>{balance.value}</dd>
          </div>
        ))}
      </dl>
    </>
  );
}

function WalletGuide({ locale }: Pick<PortalWalletPanelProps, "locale">) {
  const zh = locale === "zh";
  return (
    <aside
      aria-labelledby="portal-wallet-guide-heading"
      className="portal-wallet-guide"
    >
      <h3 id="portal-wallet-guide-heading">
        {zh ? "钱包规则指南" : "Wallet guide"}
      </h3>
      <ol>
        <li>
          <strong>{zh ? "Coins 有何区别？" : "Coins types"}</strong>
          <p>
            {zh
              ? "已购 Coins 通过充值获得；赠送 Coins 可能有有效期；奖励 Coins 来自活动或推广奖励。"
              : "Purchased Coins come from recharge. Bonus Coins may have an expiry. Reward Coins come from promotions or referral rewards."}
          </p>
        </li>
        <li>
          <strong>{zh ? "系统如何使用 Coins？" : "How Coins are used"}</strong>
          <p>
            {zh
              ? "商品可接受的 Coins 类型以商品详情为准；符合规则时，系统会优先使用较早到期的赠送 Coins。"
              : "Eligible Coin types are shown on each product. When the rules allow it, the system uses bonus Coins with an earlier expiry first."}
          </p>
        </li>
        <li>
          <strong>{zh ? "订单预留与待确认是什么？" : "Order reserves and pending rewards"}</strong>
          <p>
            {zh
              ? "订单预留表示 Coins 正被订单处理占用；待确认奖励不等同于充值支付状态。充值进度请在订单中查看。"
              : "Order reserves mean Coins are being held while an order is processed. Pending rewards are not recharge payment status. View recharge progress in Orders."}
          </p>
        </li>
      </ol>
    </aside>
  );
}

function signedDelta(value: number) {
  return value > 0 ? `+${value}` : String(value);
}

function bucketDelta(value: number | null) {
  return value === null ? "—" : signedDelta(value);
}

function recentActivityDelta(entry: PortalWalletLedgerEntry) {
  if (entry.category === "credit") return entry.totalDeltaUnits;
  return entry.availableDeltaUnits !== 0
    ? entry.availableDeltaUnits
    : entry.totalDeltaUnits;
}

function LedgerTable({
  entries,
  locale,
  view
}: {
  entries: PortalWalletLedgerEntry[];
  locale: PortalWalletPanelProps["locale"];
  view: WalletLedgerView;
}) {
  const zh = locale === "zh";
  const desktopScrollRegion = useDesktopScrollRegion();
  const fullActivity = view === "all";
  const scrollable = fullActivity && desktopScrollRegion;
  return (
    <div
      aria-label={scrollable
        ? zh
          ? "Coins 钱包流水表"
          : "Coins Wallet activity table"
        : undefined}
      className={`portal-wallet-ledger-wrap portal-wallet-ledger-wrap--${view}`}
      role={scrollable ? "region" : undefined}
      tabIndex={scrollable ? 0 : undefined}
    >
      <table
        className={`portal-wallet-ledger portal-wallet-ledger--${view}`}
        aria-label={fullActivity
          ? zh ? "Coins 钱包流水" : "Coins Wallet activity"
          : zh ? "近期 Coins 钱包流水" : "Recent Coins Wallet activity"}
      >
        <thead>
          <tr>
            <th scope="col">{zh ? "类别" : "Category"}</th>
            <th scope="col">{zh ? "币种" : "Coin type"}</th>
            <th scope="col">{zh ? "发生时间" : "Occurred at"}</th>
            {fullActivity ? (
              <>
                <th scope="col">{zh ? "关联订单" : "Related order"}</th>
                <th scope="col">{zh ? "总变动" : "Overall delta"}</th>
                <th scope="col">{zh ? "可用" : "Available"}</th>
                <th scope="col">{zh ? "待确认" : "Pending"}</th>
                <th scope="col">{zh ? "冻结" : "Held"}</th>
              </>
            ) : <th scope="col">{zh ? "变动" : "Change"}</th>}
          </tr>
        </thead>
        <tbody>
          {entries.map((entry) => (
            <tr key={entry.entryRef}>
              <td>{portalLedgerCategoryLabel(entry.category, locale)}</td>
              <td>{portalCoinTypeLabel(entry.coinType, locale)}</td>
              <td>
                <time dateTime={entry.occurredAt}>
                  {formatPortalDateTime(entry.occurredAt, locale)}
                </time>
              </td>
              {fullActivity ? (
                <>
                  <td>{entry.relatedOrderRef ?? "—"}</td>
                  <td>{signedDelta(entry.totalDeltaUnits)}</td>
                  <td>{bucketDelta(entry.availableDeltaUnits)}</td>
                  <td>{bucketDelta(entry.pendingDeltaUnits)}</td>
                  <td>{bucketDelta(entry.heldDeltaUnits)}</td>
                </>
              ) : <td>{signedDelta(recentActivityDelta(entry))}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function LedgerState({
  locale,
  model,
  view
}: PortalWalletPanelProps & { view: WalletLedgerView }) {
  const zh = locale === "zh";
  const state: ReadState<PortalWalletLedgerEntry[]> = model.ledger;
  if (state.phase === "loading") {
    return (
      <div className="portal-wallet-state" role="status" aria-live="polite">
        {zh ? "正在加载钱包流水…" : "Loading Wallet activity…"}
      </div>
    );
  }
  if (state.phase === "empty") {
    return (
      <div className="portal-wallet-state" role="status">
        {zh ? "暂无钱包流水。" : "No Wallet activity yet."}
      </div>
    );
  }
  if (state.phase === "unavailable" || state.phase === "error") {
    const unavailable = state.phase === "unavailable";
    return (
      <div
        className="portal-wallet-state"
        role={unavailable ? "status" : "alert"}
      >
        <p>
          {unavailable
            ? zh
              ? "钱包流水暂不可用。"
              : "Wallet activity is unavailable."
            : zh
              ? "钱包流水加载失败。"
              : "Wallet activity could not be loaded."}
        </p>
        {state.retryable ? (
          <button type="button" onClick={model.retryLedger}>
            {zh ? "重试流水" : "Retry activity"}
          </button>
        ) : null}
      </div>
    );
  }
  return (
    <>
      <LedgerTable
        entries={view === "overview"
          ? state.value.slice(0, RECENT_LEDGER_LIMIT)
          : state.value}
        locale={locale}
        view={view}
      />
      {view === "all" && model.loadMoreLedgerError ? (
        <div
          className="portal-wallet-state"
          role={model.loadMoreLedgerError.phase === "unavailable"
            ? "status"
            : "alert"}
        >
          <p>
            {model.loadMoreLedgerError.phase === "unavailable"
              ? zh
                ? "更多钱包流水暂不可用，当前已加载流水仍会保留。"
                : "More Wallet activity is unavailable. Your current activity is still shown."
              : zh
                ? "更多钱包流水加载失败，当前已加载流水仍会保留。"
                : "More Wallet activity could not be loaded. Your current activity is still shown."}
          </p>
          {model.loadMoreLedgerError.retryable ? (
            <button type="button" onClick={model.loadMoreLedger}>
              {zh
                ? "重试加载更多流水"
                : "Retry loading more activity"}
            </button>
          ) : null}
        </div>
      ) : view === "all" && model.nextLedgerCursor ? (
        <button
          aria-busy={model.loadingMoreLedger}
          className="portal-wallet-load-more"
          disabled={model.loadingMoreLedger}
          type="button"
          onClick={model.loadMoreLedger}
        >
          {model.loadingMoreLedger
            ? zh
              ? "正在加载更多流水…"
              : "Loading more activity…"
            : zh
              ? "加载更多流水"
              : "Load more activity"}
        </button>
      ) : null}
    </>
  );
}

export function PortalWalletPanel({
  locale,
  model,
  rechargeModel
}: PortalWalletPanelProps) {
  const zh = locale === "zh";
  const [ledgerView, setLedgerView] = useState<WalletLedgerView>("overview");
  const allActivity = ledgerView === "all";
  return (
    <section
      className="portal-commerce-layout portal-commerce-layout--wallet"
      aria-labelledby="portal-wallet-heading"
    >
      <header className="portal-commerce-layout__header portal-wallet-header">
        <h2 id="portal-wallet-heading">
          {allActivity
            ? zh ? "全部钱包流水" : "All Wallet activity"
            : zh ? "钱包总览" : "Wallet overview"}
        </h2>
        {allActivity ? (
          <button
            className="portal-secondary-button compact"
            type="button"
            onClick={() => setLedgerView("overview")}
          >
            {zh ? "返回钱包总览" : "Back to Wallet overview"}
          </button>
        ) : rechargeModel?.available ? (
          <button
            className="portal-primary-button compact"
            type="button"
            onClick={rechargeModel.openDialog}
          >
            {zh ? "充值 Coins" : "Recharge Coins"}
          </button>
        ) : null}
      </header>
      {allActivity ? (
        <section
          className="portal-commerce-layout__section portal-wallet-all-activity"
          aria-labelledby="portal-wallet-ledger-heading"
        >
          <h3 id="portal-wallet-ledger-heading">
            {zh ? "全部流水" : "All activity"}
          </h3>
          <LedgerState locale={locale} model={model} view="all" />
        </section>
      ) : (
        <div className="portal-wallet-overview-content">
          <div className="portal-wallet-overview-main">
            <section
              className="portal-commerce-layout__section"
              aria-labelledby="portal-wallet-balance-heading"
            >
              <div className="portal-wallet-section-heading">
                <h3 id="portal-wallet-balance-heading">{zh ? "余额" : "Balance"}</h3>
                <button
                  aria-busy={model.summary.phase === "loading" || undefined}
                  className="portal-wallet-view-all"
                  disabled={model.summary.phase === "loading"}
                  type="button"
                  onClick={model.refreshWallet}
                >
                  {model.summary.phase === "loading"
                    ? zh ? "正在刷新…" : "Refreshing…"
                    : zh ? "刷新钱包" : "Refresh Wallet"}
                </button>
              </div>
              <SummaryState locale={locale} model={model} />
            </section>
            <section
              className="portal-commerce-layout__section portal-wallet-recent-activity"
              aria-labelledby="portal-wallet-ledger-heading"
            >
              <div className="portal-wallet-section-heading">
                <h3 id="portal-wallet-ledger-heading">
                  {zh ? "近期账变明细" : "Recent Wallet activity"}
                </h3>
                <button
                  className="portal-wallet-view-all"
                  type="button"
                  onClick={() => setLedgerView("all")}
                >
                  {zh ? "查看全部" : "View all activity"}
                </button>
              </div>
              <LedgerState locale={locale} model={model} view="overview" />
            </section>
          </div>
          <WalletGuide locale={locale} />
        </div>
      )}
      {rechargeModel?.dialogOpen ? (
        <PortalRechargeDialog locale={locale} model={rechargeModel} />
      ) : null}
    </section>
  );
}
