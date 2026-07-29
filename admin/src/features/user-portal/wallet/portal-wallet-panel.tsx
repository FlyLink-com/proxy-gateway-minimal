import { RechargeDenominationList } from "../portal-commerce-panels";
import type {
  PortalWalletLedgerEntry,
  PortalWalletStatus,
  PortalWalletSummary
} from "./api-contract";
import type {
  PortalWalletReadModel,
  ReadState
} from "./use-portal-wallet-read-model";

export type PortalWalletPanelProps = {
  locale: "zh" | "en";
  model: PortalWalletReadModel;
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
    [zh ? "已购 Coins" : "Paid Coins", summary.balances.paidCoins],
    [zh ? "赠送 Coins" : "Bonus Coins", summary.balances.bonusCoins],
    [zh ? "奖励 Coins" : "Reward Coins", summary.balances.rewardCoins],
    [zh ? "可用余额" : "Spendable", summary.spendableUnits],
    [zh ? "冻结中" : "Held", summary.heldUnits],
    [zh ? "待确认" : "Pending", summary.pendingUnits]
  ] as const;
  return (
    <>
      <p className="portal-wallet-status">
        {zh ? "钱包状态：" : "Wallet status: "}
        <strong>{walletStatusLabel(summary.status, locale)}</strong>
      </p>
      <dl className="portal-wallet-balance-grid">
        {balances.map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{value}</dd>
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
  return (
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
            <td>{entry.category}</td>
            <td>{entry.coinType}</td>
            <td>{entry.occurredAt}</td>
            <td>{entry.relatedOrderRef ?? "—"}</td>
            <td>{signedDelta(entry.totalDeltaUnits)}</td>
            <td>{bucketDelta(entry.availableDeltaUnits)}</td>
            <td>{bucketDelta(entry.pendingDeltaUnits)}</td>
            <td>{bucketDelta(entry.heldDeltaUnits)}</td>
          </tr>
        ))}
      </tbody>
    </table>
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
      {model.nextLedgerCursor ? (
        <button
          className="portal-wallet-load-more"
          type="button"
          onClick={model.loadMoreLedger}
        >
          {zh ? "加载更多流水" : "Load more activity"}
        </button>
      ) : null}
    </>
  );
}

export function PortalWalletPanel({
  locale,
  model
}: PortalWalletPanelProps) {
  const zh = locale === "zh";
  return (
    <section
      className="portal-commerce-layout portal-commerce-layout--wallet"
      aria-labelledby="portal-wallet-heading"
    >
      <header className="portal-commerce-layout__header">
        <h2 id="portal-wallet-heading">
          {zh ? "余额与充值" : "Balance and recharge"}
        </h2>
      </header>
      <section
        className="portal-commerce-layout__section"
        aria-labelledby="portal-wallet-balance-heading"
      >
        <h3 id="portal-wallet-balance-heading">{zh ? "余额" : "Balance"}</h3>
        <SummaryState locale={locale} model={model} />
      </section>
      <section
        className="portal-commerce-layout__section"
        aria-labelledby="portal-wallet-recharge-heading"
      >
        <h3 id="portal-wallet-recharge-heading">{zh ? "充值" : "Recharge"}</h3>
        <RechargeDenominationList locale={locale} mode="wallet-disabled" />
      </section>
      <section
        className="portal-commerce-layout__section"
        aria-labelledby="portal-wallet-ledger-heading"
      >
        <h3 id="portal-wallet-ledger-heading">
          {zh ? "钱包流水" : "Wallet activity"}
        </h3>
        <LedgerState locale={locale} model={model} />
      </section>
    </section>
  );
}
