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

function walletStatusLabel(
  status: PortalWalletStatus,
  locale: PortalWalletPanelProps["locale"]
) {
  const labels = locale === "zh"
    ? {
        not_created: "尚未创建",
        active: "正常",
        frozen: "已冻结",
        closed: "已关闭"
      }
    : {
        not_created: "Not created",
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
            ? "钱包尚未创建，当前可用余额为 0 Coins。"
            : "Wallet not created. Available balance is 0 Coins."}
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
  const balances = [
    {
      id: "spendable",
      label: zh ? "可用余额" : "Spendable balance",
      value: summary.spendableUnits,
      featured: true
    },
    {
      id: "paid",
      label: zh ? "已购 Coins" : "Purchased Coins",
      value: summary.balances.paidCoins,
      featured: false
    },
    {
      id: "bonus",
      label: zh ? "赠送 Coins" : "Bonus Coins",
      value: summary.balances.bonusCoins,
      featured: false
    },
    {
      id: "reward",
      label: zh ? "奖励 Coins" : "Reward Coins",
      value: summary.balances.rewardCoins,
      featured: false
    },
    {
      id: "held",
      label: zh ? "冻结中" : "Held",
      value: summary.heldUnits,
      featured: false
    },
    {
      id: "pending",
      label: zh ? "待确认" : "Pending",
      value: summary.pendingUnits,
      featured: false
    }
  ] as const;
  return (
    <>
      <p className="portal-wallet-status">
        {zh ? "钱包状态：" : "Wallet status: "}
        <strong>{walletStatusLabel(summary.status, locale)}</strong>
      </p>
      <dl className="portal-wallet-balance-grid">
        {balances.map((balance) => (
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
    </>
  );
}

function signedDelta(value: number) {
  return value > 0 ? `+${value}` : String(value);
}

function bucketDelta(value: number | null) {
  return value === null ? "—" : signedDelta(value);
}

function LedgerTable({
  entries,
  locale
}: {
  entries: PortalWalletLedgerEntry[];
  locale: PortalWalletPanelProps["locale"];
}) {
  const zh = locale === "zh";
  const desktopScrollRegion = useDesktopScrollRegion();
  return (
    <div
      aria-label={desktopScrollRegion
        ? zh
          ? "Coins 钱包流水表"
          : "Coins Wallet activity table"
        : undefined}
      className="portal-wallet-ledger-wrap"
      role={desktopScrollRegion ? "region" : undefined}
      tabIndex={desktopScrollRegion ? 0 : undefined}
    >
      <table
        className="portal-wallet-ledger"
        aria-label={zh ? "Coins 钱包流水" : "Coins Wallet activity"}
      >
        <thead>
          <tr>
            <th scope="col">{zh ? "类别" : "Category"}</th>
            <th scope="col">{zh ? "币种" : "Coin type"}</th>
            <th scope="col">{zh ? "发生时间" : "Occurred at"}</th>
            <th scope="col">{zh ? "关联订单" : "Related order"}</th>
            <th scope="col">{zh ? "总变动" : "Overall delta"}</th>
            <th scope="col">{zh ? "可用" : "Available"}</th>
            <th scope="col">{zh ? "待确认" : "Pending"}</th>
            <th scope="col">{zh ? "冻结" : "Held"}</th>
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
              <td>{entry.relatedOrderRef ?? "—"}</td>
              <td>{signedDelta(entry.totalDeltaUnits)}</td>
              <td>{bucketDelta(entry.availableDeltaUnits)}</td>
              <td>{bucketDelta(entry.pendingDeltaUnits)}</td>
              <td>{bucketDelta(entry.heldDeltaUnits)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function LedgerState({
  locale,
  model
}: PortalWalletPanelProps) {
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
      <LedgerTable entries={state.value} locale={locale} />
      {model.loadMoreLedgerError ? (
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
      ) : model.nextLedgerCursor ? (
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
  return (
    <section
      className="portal-commerce-layout portal-commerce-layout--wallet"
      aria-labelledby="portal-wallet-heading"
    >
      <header className="portal-commerce-layout__header">
        <h2 id="portal-wallet-heading">
          {zh ? "钱包总览" : "Wallet overview"}
        </h2>
      </header>
      <section
        className="portal-commerce-layout__section"
        aria-labelledby="portal-wallet-balance-heading"
      >
        <h3 id="portal-wallet-balance-heading">{zh ? "余额" : "Balance"}</h3>
        <SummaryState locale={locale} model={model} />
      </section>
      {rechargeModel?.available ? (
        <section
          className="portal-commerce-layout__section portal-wallet-recharge"
          aria-labelledby="portal-wallet-recharge-heading"
        >
          <div>
            <h3 id="portal-wallet-recharge-heading">
              {zh ? "充值" : "Recharge"}
            </h3>
            <p>
              {zh
                ? "选择充值档位；支付确认后，已购 Coins 将自动入账。"
                : "Choose a recharge denomination. Purchased Coins are credited automatically after payment confirmation."}
            </p>
          </div>
          <button
            className="portal-primary-button compact"
            type="button"
            onClick={rechargeModel.openDialog}
          >
            {zh ? "充值 Coins" : "Recharge Coins"}
          </button>
        </section>
      ) : null}
      <section
        className="portal-commerce-layout__section"
        aria-labelledby="portal-wallet-ledger-heading"
      >
        <h3 id="portal-wallet-ledger-heading">
          {zh ? "钱包流水" : "Wallet activity"}
        </h3>
        <LedgerState locale={locale} model={model} />
      </section>
      {rechargeModel?.dialogOpen ? (
        <PortalRechargeDialog locale={locale} model={rechargeModel} />
      ) : null}
    </section>
  );
}
