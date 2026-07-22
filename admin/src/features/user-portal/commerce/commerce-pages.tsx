import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { CommerceClient } from "./commerce-client";
import { CommerceClientError } from "./commerce-client";
import type {
  CatalogDto,
  CommerceOrderDto,
  OfferVersionDto,
  PaymentAttemptDto,
  PaymentAttemptStatus,
  PaymentReconciliationState,
  ReferralSummaryDto,
  SafeNextActionDto,
  WalletDto,
  WalletTransactionDto
} from "./commerce-model";
import {
  BalanceCard,
  LedgerRow,
  OrderSummary,
  ProductOfferCard,
  RechargeOfferCard,
  StateNotice,
  StatusBadge
} from "./commerce-components";

export type CommerceDestination = "wallet" | "catalog" | "orders" | "referral";
export type CommerceFlow =
  | { type: "recharge"; backTo: CommerceDestination; rechargeOfferRef: string }
  | { type: "purchase_confirm"; backTo: CommerceDestination; offerVersionRef: string }
  | { type: "payment_status"; backTo: CommerceDestination; attemptRef: string };
export type CommerceInitialDestination = { type: CommerceDestination } | CommerceFlow;

type Props = {
  client: CommerceClient;
  sessionRef: string;
  initialDestination?: CommerceInitialDestination;
};
type Loaded = {
  wallet: WalletDto;
  catalog: CatalogDto;
  orders: CommerceOrderDto[];
  referral: ReferralSummaryDto;
};
type PurchaseIntent = {
  offerVersionRef: string;
  idempotencyKey: string;
  backTo: CommerceDestination;
};
type RechargeIntent = {
  rechargeOfferRef: string;
  idempotencyKey: string;
  backTo: CommerceDestination;
};
type PaymentDisplay = {
  status: PaymentAttemptStatus;
  nextAction: SafeNextActionDto;
  reconciliationState: PaymentReconciliationState;
};
type PaymentState =
  | { type: "idle" }
  | { type: "loading" }
  | { type: "error" }
  | { type: "ready"; display: PaymentDisplay };

const destinationLabel: Record<CommerceDestination, string> = {
  wallet: "钱包",
  catalog: "商城",
  orders: "订单",
  referral: "推荐"
};
const statusLabel: Record<PaymentAttemptStatus, string> = {
  entry_unavailable: "支付入口不可用",
  action_required: "需要完成支付",
  pending: "支付处理中",
  confirmed_no_charge: "未扣款",
  provider_insufficient: "支付渠道余额不足",
  risk_rejected: "风控拒绝",
  succeeded: "支付成功",
  unknown: "状态待确认",
  possibly_charged: "可能已扣款",
  reversed: "已冲正"
};
const safeNewOrderStatuses = new Set<PaymentAttemptStatus>([
  "succeeded",
  "confirmed_no_charge",
  "provider_insufficient",
  "risk_rejected",
  "reversed"
]);
const ledgerLabel: Record<WalletTransactionDto["type"], string> = {
  credit: "入账",
  hold: "冻结",
  capture: "扣减",
  release: "释放",
  referral_freeze: "推荐奖励冻结",
  referral_release: "推荐奖励释放",
  referral_settlement: "推荐奖励结算",
  referral_reversal: "推荐奖励冲正"
};
function isFlow(value: CommerceInitialDestination): value is CommerceFlow {
  return value.type === "recharge" || value.type === "purchase_confirm" || value.type === "payment_status";
}

function createIntentKey(kind: "purchase" | "recharge"): string {
  return `coins-intent-${kind}-${globalThis.crypto.randomUUID()}`;
}

function paymentDisplay(attempt: PaymentAttemptDto): PaymentDisplay {
  return {
    status: attempt.status,
    nextAction: attempt.nextAction,
    reconciliationState: attempt.reconciliationState
  };
}

export function CommerceWorkspace({
  client,
  sessionRef,
  initialDestination = { type: "wallet" }
}: Props) {
  const initialFlow = useRef<CommerceFlow | null>(isFlow(initialDestination) ? initialDestination : null).current;
  const [data, setData] = useState<Loaded | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [destination, setDestination] = useState<CommerceDestination>(
    isFlow(initialDestination) ? initialDestination.backTo : initialDestination.type
  );
  const [flow, setFlow] = useState<CommerceFlow | null>(initialFlow);
  const [purchaseIntent, setPurchaseIntent] = useState<PurchaseIntent | null>(null);
  const [rechargeIntent, setRechargeIntent] = useState<RechargeIntent | null>(null);
  const [payment, setPayment] = useState<PaymentState>(
    initialFlow?.type === "payment_status" ? { type: "loading" } : { type: "idle" }
  );
  const [message, setMessage] = useState<string | null>(null);
  const [purchaseBusy, setPurchaseBusy] = useState(false);
  const [rechargeError, setRechargeError] = useState(false);
  const [rechargeBusy, setRechargeBusy] = useState(false);
  const activeSession = useRef(sessionRef);
  const sessionGeneration = useRef(0);

  useEffect(() => {
    if (initialFlow?.type === "purchase_confirm") {
      setPurchaseIntent((current) => current ?? {
        offerVersionRef: initialFlow.offerVersionRef,
        idempotencyKey: createIntentKey("purchase"),
        backTo: initialFlow.backTo
      });
    } else if (initialFlow?.type === "recharge") {
      setRechargeIntent((current) => current ?? {
        rechargeOfferRef: initialFlow.rechargeOfferRef,
        idempotencyKey: createIntentKey("recharge"),
        backTo: initialFlow.backTo
      });
    }
  }, [initialFlow]);

  useLayoutEffect(() => {
    if (activeSession.current === sessionRef) return;
    activeSession.current = sessionRef;
    sessionGeneration.current += 1;
    setData(null);
    setLoadError(false);
    setDestination("wallet");
    setFlow(null);
    setPurchaseIntent(null);
    setRechargeIntent(null);
    setPayment({ type: "idle" });
    setMessage(null);
    setPurchaseBusy(false);
    setRechargeError(false);
    setRechargeBusy(false);
  }, [sessionRef]);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    setLoadError(false);
    void Promise.all([
      client.getWallet(sessionRef, controller.signal),
      client.getCatalog(sessionRef, controller.signal),
      client.listOrders(sessionRef, controller.signal),
      client.getReferral(sessionRef, controller.signal)
    ]).then(([wallet, catalog, orders, referral]) => {
      if (active) setData({ wallet, catalog, orders, referral });
    }).catch(() => {
      if (active) setLoadError(true);
    });
    return () => {
      active = false;
      controller.abort();
    };
  }, [client, sessionRef]);

  useEffect(() => {
    if (flow?.type !== "payment_status" || payment.type !== "loading") return;
    let active = true;
    void client.getPaymentAttempt(sessionRef, flow.attemptRef).then((attempt) => {
      if (active) setPayment({ type: "ready", display: paymentDisplay(attempt) });
    }).catch(() => {
      if (active) setPayment({ type: "error" });
    });
    return () => { active = false; };
  }, [client, flow, payment.type, sessionRef]);

  const selectedOffer = useMemo(
    () => data?.catalog.catalog.offerVersions.find(
      (offer) => offer.offerVersionRef === purchaseIntent?.offerVersionRef
    ) ?? null,
    [data, purchaseIntent?.offerVersionRef]
  );
  const selectedPayableCoins = useMemo(
    () => selectedOffer && data ? payableCoins(data.catalog, selectedOffer) : null,
    [data, selectedOffer]
  );

  const appendOrder = (order: CommerceOrderDto) => {
    setData((current) => current === null ? current : {
      ...current,
      orders: current.orders.some((item) => item.orderRef === order.orderRef)
        ? current.orders
        : [order, ...current.orders]
    });
  };

  const navigate = (next: CommerceDestination) => {
    setDestination(next);
    setFlow(null);
    setPurchaseIntent(null);
    setRechargeIntent(null);
    setPayment({ type: "idle" });
    setMessage(null);
    setRechargeError(false);
  };

  const beginPurchase = (offerVersionRef: string) => {
    const intent = {
      offerVersionRef,
      idempotencyKey: createIntentKey("purchase"),
      backTo: "catalog" as const
    };
    setPurchaseIntent(intent);
    setFlow({ type: "purchase_confirm", backTo: intent.backTo, offerVersionRef });
    setMessage(null);
  };

  const cancelPurchase = () => {
    const backTo = purchaseIntent?.backTo ?? "catalog";
    setPurchaseIntent(null);
    setFlow(null);
    setDestination(backTo);
    setMessage(null);
  };

  const confirmPurchase = async () => {
    if (purchaseIntent === null || purchaseBusy) return;
    const generation = sessionGeneration.current;
    setPurchaseBusy(true);
    try {
      const result = await client.createProductOrder(sessionRef, {
        offerVersionRef: purchaseIntent.offerVersionRef,
        idempotencyKey: purchaseIntent.idempotencyKey
      });
      if (sessionGeneration.current !== generation) return;
      appendOrder(result.order);
      setPurchaseIntent(null);
      setRechargeIntent(null);
      setFlow(null);
      setDestination("orders");
      setMessage("订单已创建");
    } catch (cause) {
      if (sessionGeneration.current !== generation) return;
      const code = cause instanceof CommerceClientError ? cause.code : (cause as { code?: string })?.code;
      setMessage(code === "insufficient_coins" ? "Coins 不足" : "订单暂不可用");
    } finally {
      if (sessionGeneration.current === generation) setPurchaseBusy(false);
    }
  };

  const recoverWithRecharge = () => {
    setDestination("catalog");
    setFlow(null);
    setMessage(null);
  };

  const beginRecharge = (rechargeOfferRef: string) => {
    const intent = {
      rechargeOfferRef,
      idempotencyKey: createIntentKey("recharge"),
      backTo: "catalog" as const
    };
    setRechargeIntent(intent);
    setFlow({ type: "recharge", backTo: intent.backTo, rechargeOfferRef });
    setRechargeError(false);
    setMessage(null);
  };

  const returnFromRecharge = (backTo: CommerceDestination) => {
    setRechargeIntent(null);
    setRechargeError(false);
    if (purchaseIntent) {
      setFlow({
        type: "purchase_confirm",
        backTo: purchaseIntent.backTo,
        offerVersionRef: purchaseIntent.offerVersionRef
      });
      return;
    }
    setFlow(null);
    setDestination(backTo);
  };

  const createRecharge = async () => {
    if (rechargeIntent === null) return;
    const generation = sessionGeneration.current;
    setRechargeBusy(true);
    setRechargeError(false);
    try {
      const result = await client.createRechargeOrder(sessionRef, {
        rechargeOfferRef: rechargeIntent.rechargeOfferRef,
        preferredProviderId: null,
        idempotencyKey: rechargeIntent.idempotencyKey
      });
      if (sessionGeneration.current !== generation) return;
      appendOrder(result.order);
      setRechargeIntent(null);
      setPayment({
        type: "ready",
        display: result.attempt ? paymentDisplay(result.attempt) : {
          status: result.status,
          nextAction: result.nextAction,
          reconciliationState: result.status === "entry_unavailable"
            ? "not_charge_capable"
            : "pending"
        }
      });
      setFlow({
        type: "payment_status",
        backTo: rechargeIntent.backTo,
        attemptRef: result.attempt?.attemptRef ?? "entry-unavailable"
      });
      setMessage("充值订单已创建");
    } catch {
      if (sessionGeneration.current === generation) setRechargeError(true);
    } finally {
      if (sessionGeneration.current === generation) setRechargeBusy(false);
    }
  };

  const returnFromPayment = (backTo: CommerceDestination) => {
    setPayment({ type: "idle" });
    setMessage(null);
    if (purchaseIntent) {
      setFlow({
        type: "purchase_confirm",
        backTo: purchaseIntent.backTo,
        offerVersionRef: purchaseIntent.offerVersionRef
      });
      return;
    }
    setFlow(null);
    setDestination(backTo);
  };

  const createNewOrder = () => {
    setPurchaseIntent(null);
    setRechargeIntent(null);
    setPayment({ type: "idle" });
    setFlow(null);
    setDestination("catalog");
    setMessage(null);
  };

  if (loadError) {
    return <StateNotice state="error" title="Coins 商城暂不可用" message="请稍后重试。" />;
  }
  if (data === null) {
    return (
      <StateNotice
        state="loading"
        title="正在加载 Coins 商城"
        message="正在并发读取钱包、商城、订单和推荐明细。"
      />
    );
  }

  return (
    <main className="coins-commerce">
      <header className="coins-commerce-section-heading">
        <h1>Coins 商城</h1>
        {flow === null ? (
          <nav aria-label="Coins 商业流程">
            <div>
              {(Object.keys(destinationLabel) as CommerceDestination[]).map((item) => (
                <button
                  className="coins-commerce-action"
                  type="button"
                  key={item}
                  onClick={() => navigate(item)}
                >
                  {destinationLabel[item]}
                </button>
              ))}
            </div>
          </nav>
        ) : null}
      </header>

      {message && message !== "Coins 不足" ? <p role="status">{message}</p> : null}

      {flow?.type === "purchase_confirm" && purchaseIntent ? (
        <PurchaseConfirmPage
          payableCoins={selectedPayableCoins}
          insufficient={message === "Coins 不足"}
          busy={purchaseBusy}
          onConfirm={() => void confirmPurchase()}
          onCancel={cancelPurchase}
          onRecharge={recoverWithRecharge}
        />
      ) : null}

      {flow?.type === "payment_status" ? (
        <PaymentStatusPage
          payment={payment}
          backTo={flow.backTo}
          onBack={() => returnFromPayment(flow.backTo)}
          onCreateNewOrder={createNewOrder}
        />
      ) : null}

      {flow === null && destination === "wallet" ? <WalletPage wallet={data.wallet} /> : null}
      {flow === null && destination === "catalog" ? (
        <CatalogPage
          catalog={data.catalog}
          onRecharge={beginRecharge}
          onPurchase={beginPurchase}
        />
      ) : null}
      {flow === null && destination === "orders" ? <OrdersPage orders={data.orders} /> : null}
      {flow === null && destination === "referral" ? <ReferralPage referral={data.referral} /> : null}

      {flow?.type === "recharge" && rechargeIntent ? (
        <RechargePage
          busy={rechargeBusy}
          failed={rechargeError}
          backTo={flow.backTo}
          onSubmit={() => void createRecharge()}
          onBack={() => returnFromRecharge(flow.backTo)}
        />
      ) : null}
    </main>
  );
}

function PurchaseConfirmPage({
  payableCoins,
  insufficient,
  busy,
  onConfirm,
  onCancel,
  onRecharge
}: {
  payableCoins: number | null;
  insufficient: boolean;
  busy: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  onRecharge: () => void;
}) {
  if (insufficient) {
    return (
      <section aria-label="Coins 不足">
        <h2>Coins 不足</h2>
        <button className="coins-commerce-action" type="button" onClick={onRecharge}>去充值</button>
      </section>
    );
  }
  return (
    <section aria-label="购买确认">
      <h2>确认购买</h2>
      <p>请再次确认使用 Coins 支付{payableCoins === null ? "" : `（${payableCoins} Coins）`}。</p>
      <button className="coins-commerce-action" type="button" disabled={busy} onClick={onConfirm}>
        确认使用 Coins 支付
      </button>
      <button className="coins-commerce-action" type="button" disabled={busy} onClick={onCancel}>
        取消购买
      </button>
    </section>
  );
}

function WalletPage({ wallet }: { wallet: WalletDto }) {
  return (
    <section aria-label="Coins 钱包">
      <h2>Coins 钱包</h2>
      <div className="coins-commerce-grid">
        {Object.entries(wallet.summary.byOrigin).map(([origin, balance]) => (
          <BalanceCard
            key={origin}
            title={`${origin === "bonus" ? "Bonus" : origin === "paid" ? "Paid" : "Referral"} Coins`}
            amountCoins={balance.availableCoins}
            description={`冻结 ${balance.frozenCoins} Coins`}
          />
        ))}
        <BalanceCard
          title="总可用余额"
          amountCoins={wallet.summary.totalAvailableCoins}
          description={`总冻结 ${wallet.summary.totalFrozenCoins} Coins`}
        />
      </div>
      <table aria-label="Coins 账本">
        <thead><tr><th>类型</th><th>金额</th><th>时间</th></tr></thead>
        <tbody>
          {wallet.transactions.map((transaction) => (
            <LedgerRow
              key={transaction.transactionRef}
              transaction={transaction}
              typeLabel={ledgerLabel[transaction.type]}
            />
          ))}
        </tbody>
      </table>
    </section>
  );
}

function payableCoins(catalog: CatalogDto, offer: OfferVersionDto): number {
  const product = catalog.catalog.productVersions.find(
    (item) => item.productVersionRef === offer.productVersionRef
  );
  if (!product || product.kind === "membership" || offer.discountClass === "membership") {
    return offer.priceCoins;
  }
  let price = offer.priceCoins;
  for (const membership of catalog.activeMemberships) {
    for (const benefit of membership.commerceBenefits) {
      if (
        benefit.type === "offer_discount"
        && benefit.eligibleDiscountClasses.includes(offer.discountClass)
      ) {
        const discounted = Number(
          BigInt(offer.priceCoins) * BigInt(benefit.priceBasisPoints) / 10_000n
        );
        price = Math.min(price, discounted);
      }
    }
  }
  return price;
}

function CatalogPage({
  catalog,
  onRecharge,
  onPurchase
}: {
  catalog: CatalogDto;
  onRecharge: (ref: string) => void;
  onPurchase: (ref: string) => void;
}) {
  const products = new Map(
    catalog.catalog.productVersions.map((product) => [product.productVersionRef, product])
  );
  return (
    <section aria-label="Coins 商城目录">
      <h2>Coins 商城目录</h2>
      <h3>充值</h3>
      <ul aria-label="充值档">
        {catalog.catalog.rechargeOffers.map((offer) => (
          <RechargeOfferCard key={offer.rechargeOfferRef} offer={offer} onSelect={onRecharge} />
        ))}
      </ul>
      <h3>自营商品</h3>
      <ul aria-label="商品 Offer">
        {catalog.catalog.offerVersions.map((offer) => {
          const product = products.get(offer.productVersionRef);
          return product ? (
            <ProductOfferCard
              key={offer.offerVersionRef}
              product={product}
              offer={offer}
              title={product.productId}
              payableCoins={payableCoins(catalog, offer)}
              onSelect={onPurchase}
            />
          ) : null;
        })}
      </ul>
    </section>
  );
}

function OrdersPage({ orders }: { orders: CommerceOrderDto[] }) {
  return (
    <section aria-label="Coins 订单">
      <h2>Coins 订单</h2>
      {orders.length > 0 ? orders.map((order) => (
        <OrderSummary
          key={order.orderRef}
          order={order}
          title={order.orderRef}
          statusLabel={order.status}
        />
      )) : (
        <StateNotice state="empty" title="暂无订单" message="完成购买或充值后会显示在这里。" />
      )}
    </section>
  );
}

function ReferralPage({ referral }: { referral: ReferralSummaryDto }) {
  const partitions: [string, number][] = [
    ["累计获得", referral.cumulativeEarnedCoins],
    ["可用余额", referral.availableCoins],
    ["内部消费", referral.internallyConsumedCoins],
    ["待结算冻结", referral.frozenForSettlementCoins],
    ["外部结算", referral.externallySettledCoins],
    ["已冲正", referral.reversedCoins]
  ];
  return (
    <section aria-label="推荐 Coins">
      <h2>推荐 Coins</h2>
      <dl>
        {partitions.map(([label, value]) => (
          <div key={label}><dt>{label}</dt><dd>{value} Coins</dd></div>
        ))}
      </dl>
      <p>Coins 仅用于平台自营产品，不支持提现或对外结算。</p>
    </section>
  );
}

function RechargePage({
  busy,
  failed,
  backTo,
  onSubmit,
  onBack
}: {
  busy: boolean;
  failed: boolean;
  backTo: CommerceDestination;
  onSubmit: () => void;
  onBack: () => void;
}) {
  return (
    <section aria-label="Coins 充值">
      <h2>充值 Coins</h2>
      <p>充值完成后不会自动购买商品；返回后需再次确认待处理订单。</p>
      {failed ? (
        <StateNotice state="error" title="充值订单暂不可用" message="请稍后重试。" />
      ) : null}
      <button className="coins-commerce-action" type="button" disabled={busy} onClick={onSubmit}>
        创建充值订单
      </button>
      <button className="coins-commerce-action" type="button" disabled={busy} onClick={onBack}>
        返回{destinationLabel[backTo]}
      </button>
    </section>
  );
}

function PaymentStatusPage({
  payment,
  backTo,
  onBack,
  onCreateNewOrder
}: {
  payment: PaymentState;
  backTo: CommerceDestination;
  onBack: () => void;
  onCreateNewOrder: () => void;
}) {
  if (payment.type === "loading" || payment.type === "idle") {
    return <StateNotice state="loading" title="正在读取支付状态" />;
  }
  if (payment.type === "error") {
    return (
      <section aria-label="支付状态">
        <StateNotice
          state="error"
          title="支付状态无法确认"
          message="当前无法确认是否已扣款，请勿重试或切换支付方式。"
        />
        <button className="coins-commerce-action" type="button" onClick={onBack}>
          返回{destinationLabel[backTo]}
        </button>
      </section>
    );
  }
  const { display } = payment;
  return (
    <section aria-label="支付状态">
      <h2>支付状态</h2>
      <StatusBadge
        label={statusLabel[display.status]}
        tone={display.status === "succeeded" ? "success" : display.status === "pending" ? "warning" : "neutral"}
      />
      <p>{display.reconciliationState}</p>
      <NextAction action={display.nextAction} />
      {safeNewOrderStatuses.has(display.status) ? (
        <button className="coins-commerce-action" type="button" onClick={onCreateNewOrder}>
          创建新订单
        </button>
      ) : null}
      <button className="coins-commerce-action" type="button" onClick={onBack}>
        返回{destinationLabel[backTo]}
      </button>
    </section>
  );
}

function NextAction({ action }: { action: SafeNextActionDto }) {
  if (action.type === "hosted_redirect") return <a href={action.url}>继续支付</a>;
  if (action.type === "provider_sdk") {
    return <p role="note">当前页面不能直接启动支付组件，请在受支持的支付环境中继续。</p>;
  }
  if (action.type === "qr") return <pre aria-label="支付二维码">{action.payload}</pre>;
  if (action.type === "bank_instructions") {
    return (
      <ol aria-label="银行支付说明">
        {action.instructions.map((instruction) => <li key={instruction}>{instruction}</li>)}
      </ol>
    );
  }
  return <p>暂无后续支付操作</p>;
}
