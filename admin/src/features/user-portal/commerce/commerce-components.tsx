import type {
  CommerceOrderDto,
  OfferVersionDto,
  ProductVersionDto,
  RechargeOfferDto,
  WalletTransactionDto
} from "./commerce-model";
import "./commerce.css";

export type CommerceStatusTone = "neutral" | "success" | "info" | "warning" | "danger";

export function StatusBadge({ label, tone = "neutral" }: { label: string; tone?: CommerceStatusTone }) {
  return (
    <span className={`coins-commerce-status coins-commerce-status-${tone}`} data-tone={tone}>
      <span className="coins-commerce-status-mark" aria-hidden="true">{statusMark(tone)}</span>
      {label}
    </span>
  );
}

export function BalanceCard({
  title,
  amountCoins,
  description
}: {
  title: string;
  amountCoins: number;
  description?: string;
}) {
  return (
    <section className="coins-commerce-balance-card" aria-label={`${title}：${amountCoins} Coins`}>
      <h3>{title}</h3>
      <p className="coins-commerce-balance-value">
        <strong>{amountCoins}</strong>
        <span>Coins</span>
      </p>
      {description ? <p className="coins-commerce-supporting-copy">{description}</p> : null}
    </section>
  );
}

export function RechargeOfferCard({
  offer,
  onSelect,
  disabled = false
}: {
  offer: RechargeOfferDto;
  onSelect: (rechargeOfferRef: string) => void;
  disabled?: boolean;
}) {
  const actionName = `充值 ${offer.paidCoins} Coins`;
  return (
    <li className="coins-commerce-offer-item">
      <article className="coins-commerce-offer-card" aria-label={`${offer.paidCoins} Coins 充值选项`}>
        <div className="coins-commerce-offer-copy">
          <h3>{offer.paidCoins} Coins</h3>
          <p className="coins-commerce-supporting-copy">
            {offer.bonusCoins > 0 ? `另含 ${offer.bonusCoins} Bonus Coins` : "本档充值不含额外 Bonus Coins"}
          </p>
        </div>
        <button
          className="coins-commerce-action"
          type="button"
          disabled={disabled}
          aria-label={actionName}
          onClick={() => onSelect(offer.rechargeOfferRef)}
        >
          {actionName}
        </button>
      </article>
    </li>
  );
}

export function ProductOfferCard({
  product,
  offer,
  title,
  payableCoins,
  onSelect,
  disabled = false
}: {
  product: ProductVersionDto;
  offer: OfferVersionDto;
  title: string;
  payableCoins: number;
  onSelect: (offerVersionRef: string) => void;
  disabled?: boolean;
}) {
  const actionName = `使用 ${payableCoins} Coins 购买${title}`;
  return (
    <li className="coins-commerce-offer-item">
      <article
        className="coins-commerce-offer-card"
        aria-label={title}
        data-product-kind={product.kind}
      >
        <div className="coins-commerce-offer-copy">
          <h3>{title}</h3>
          <p className="coins-commerce-price">
            <strong>{payableCoins} Coins</strong>
            {payableCoins < offer.priceCoins ? <del>{offer.priceCoins} Coins</del> : null}
          </p>
        </div>
        <button
          className="coins-commerce-action"
          type="button"
          disabled={disabled}
          aria-label={actionName}
          onClick={() => onSelect(offer.offerVersionRef)}
        >
          使用 Coins 支付
        </button>
      </article>
    </li>
  );
}

export function OrderSummary({
  order,
  title,
  statusLabel
}: {
  order: CommerceOrderDto;
  title: string;
  statusLabel: string;
}) {
  const amount = order.orderType === "product" ? order.amountCoins : order.rechargeSnapshot.paidCoins;
  return (
    <section className="coins-commerce-order-summary" aria-label={title}>
      <div className="coins-commerce-section-heading">
        <h3>{title}</h3>
        <StatusBadge label={statusLabel} tone={order.orderType === "product" ? "success" : "info"} />
      </div>
      <dl className="coins-commerce-detail-list">
        <div>
          <dt>订单编号</dt>
          <dd>{order.orderRef}</dd>
        </div>
        <div>
          <dt>订单类型</dt>
          <dd>{order.orderType === "product" ? "Coins 商品" : "Coins 充值"}</dd>
        </div>
        <div>
          <dt>Coins</dt>
          <dd>{amount}</dd>
        </div>
      </dl>
    </section>
  );
}

export type CommerceNoticeState = "loading" | "empty" | "error";

export function StateNotice({
  state,
  title,
  message
}: {
  state: CommerceNoticeState;
  title: string;
  message?: string;
}) {
  return (
    <section
      className={`coins-commerce-state coins-commerce-state-${state}`}
      role={state === "error" ? "alert" : "status"}
      aria-label={title}
      aria-busy={state === "loading"}
    >
      <h3>{title}</h3>
      {message ? <p className="coins-commerce-supporting-copy">{message}</p> : null}
    </section>
  );
}

export function LedgerRow({
  transaction,
  typeLabel
}: {
  transaction: WalletTransactionDto;
  typeLabel: string;
}) {
  return (
    <tr className="coins-commerce-ledger-row" data-transaction-type={transaction.type}>
      <td>{typeLabel}</td>
      <td>{transaction.amountCoins} Coins</td>
      <td><time dateTime={transaction.createdAt}>{formatTimestamp(transaction.createdAt)}</time></td>
    </tr>
  );
}

function statusMark(tone: CommerceStatusTone): string {
  if (tone === "success") return "✓";
  if (tone === "warning" || tone === "danger") return "!";
  return "•";
}

function formatTimestamp(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return value.slice(0, 16).replace("T", " ").replaceAll("-", "/");
}
