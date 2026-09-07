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
  PortalWalletLedgerPageError,
  PortalWalletReadModel,
  ReadState
} from "./use-portal-wallet-read-model";
import {
  PortalRechargeDialog,
  PortalRechargeOffers,
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

function WalletRefreshNotice({ locale, error, source, onRetry }: {
  locale: PortalWalletPanelProps["locale"];
  error?: PortalWalletLedgerPageError | null;
  source: "summary" | "ledger";
  onRetry: () => void;
}) {
  if (!error) return null;
  const zh = locale === "zh";
  const summary = source === "summary";
  return (
    <div className="portal-wallet-state" role={error.phase === "unavailable" ? "status" : "alert"}>
      <p>{summary
        ? zh ? "余额更新失败，当前为上次数据。" : "Balance update failed. Showing the last available data."
        : zh ? "账单更新失败，当前为上次数据。" : "Activity update failed. Showing the last available data."}</p>
      {error.retryable ? (
        <button type="button" onClick={onRetry}>
          {summary ? zh ? "重试余额" : "Retry balance" : zh ? "重试流水" : "Retry activity"}
        </button>
      ) : null}
    </div>
  );
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
      <WalletRefreshNotice locale={locale} error={model.summaryRefreshError} source="summary" onRetry={model.retrySummary} />
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
    },
    {
      id: "held",
      label: zh ? "订单预留" : "Order reserved",
      value: summary.heldUnits,
      featured: false
    }
  ] as const;
  const statusBalances = [
    {
      id: "pending",
      label: zh ? "待确认奖励" : "Pending rewards",
      value: summary.pendingUnits
    }
  ] as const;
  return (
    <>
      {summary.status !== "active" ? (
        <p className="portal-wallet-status" role="status" aria-live="polite">
          {zh ? "钱包状态：" : "Wallet status: "}
          <strong>{walletStatusLabel(summary.status, locale)}</strong>
        </p>
      ) : null}
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
  const retainedStateNotices = (
    <>
      <WalletRefreshNotice locale={locale} error={model.ledgerRefreshError} source="ledger" onRetry={model.retryLedger} />
      {view === "all" && model.ledgerAutoRefreshPaused ? (
        <p className="portal-wallet-status" role="status">
          {zh ? "正在查看历史记录" : "Viewing historical activity"}
        </p>
      ) : null}
    </>
  );
  if (state.phase === "loading") {
    return (
      <div className="portal-wallet-state" role="status" aria-live="polite">
        {zh ? "正在加载钱包流水…" : "Loading Wallet activity…"}
      </div>
    );
  }
  if (state.phase === "empty") {
    return (
      <>
        {retainedStateNotices}
        <div className="portal-wallet-state" role="status">
          {zh ? "暂无钱包流水。" : "No Wallet activity yet."}
        </div>
      </>
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
      {retainedStateNotices}
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
  const [selectedOfferRef, setSelectedOfferRef] = useState<string | null>(null);
  const allActivity = ledgerView === "all";
  return (
    <section
      className="portal-commerce-layout portal-commerce-layout--wallet"
      aria-label={zh ? "Coins 钱包" : "Coins Wallet"}
    >
      {allActivity ? (
        <header className="portal-commerce-layout__header portal-wallet-header">
          <h2 id="portal-wallet-heading">
            {zh ? "全部钱包流水" : "All Wallet activity"}
          </h2>
          <button
            className="portal-secondary-button compact"
            type="button"
            onClick={() => {
              setLedgerView("overview");
              model.retryLedger();
            }}
          >
            {zh ? "返回钱包" : "Back to Wallet"}
          </button>
        </header>
      ) : null}
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
        <div className={`portal-wallet-overview-content${rechargeModel?.available ? "" : " portal-wallet-overview-content--balance-only"}`}>
          <section
            className="portal-commerce-layout__section portal-wallet-balance-card"
            aria-label={zh ? "余额" : "Balance"}
          >
            <SummaryState locale={locale} model={model} />
          </section>
          {rechargeModel?.available ? (
            <section
              className="portal-wallet-recharge"
              aria-labelledby="portal-wallet-recharge-heading"
            >
              <h3 id="portal-wallet-recharge-heading">{zh ? "充值 Coins" : "Recharge Coins"}</h3>
              {rechargeModel.unresolvedCreateOfferRef ? (
                <div className="portal-wallet-state" role="status">
                  <p>{zh ? "有一笔充值订单待确认，请先查看进度。" : "A recharge attempt needs confirmation. Check its progress first."}</p>
                  <button type="button" disabled={rechargeModel.busy} onClick={rechargeModel.openDialog}>
                    {zh ? "确认本次充值订单" : "Check this recharge attempt"}
                  </button>
                </div>
              ) : (
                <PortalRechargeOffers
                  compact
                  locale={locale}
                  model={rechargeModel}
                  onChoose={(offerRef) => {
                    setSelectedOfferRef(offerRef);
                    rechargeModel.openDialog();
                    void rechargeModel.createOrder(offerRef);
                  }}
                />
              )}
            </section>
          ) : null}
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
          <WalletGuide locale={locale} />
        </div>
      )}
      {rechargeModel?.dialogOpen ? (
        <PortalRechargeDialog
          locale={locale}
          model={rechargeModel}
          selectedOffer={rechargeModel.offers.find(offer => offer.offerRef === selectedOfferRef)}
        />
      ) : null}
    </section>
  );
}
