import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CommerceClient } from "./commerce-client";
import { CommerceClientError } from "./commerce-client";
import type { CatalogDto, CommerceOrderDto, PaymentAttemptDto, ReferralSummaryDto, WalletDto } from "./commerce-model";
import { BalanceCard, LedgerRow, OrderSummary, ProductOfferCard, RechargeOfferCard, StateNotice, StatusBadge } from "./commerce-components";

export type CommerceDestination = "wallet" | "catalog" | "orders" | "referral";
export type CommerceFlow =
  | { type: "recharge"; backTo: CommerceDestination; rechargeOfferRef: string }
  | { type: "purchase_confirm"; backTo: CommerceDestination; offerVersionRef: string }
  | { type: "payment_status"; backTo: CommerceDestination; attemptRef: string };
export type CommerceInitialDestination = { type: CommerceDestination } | CommerceFlow;

type Props = { client: CommerceClient; sessionRef: string; initialDestination?: CommerceInitialDestination };
type Loaded = { wallet: WalletDto; catalog: CatalogDto; orders: CommerceOrderDto[]; referral: ReferralSummaryDto };

const destinationLabel: Record<CommerceDestination, string> = { wallet: "钱包", catalog: "商城", orders: "订单", referral: "推荐" };
const statusLabel: Record<PaymentAttemptDto["status"], string> = {
  entry_unavailable: "支付入口不可用", action_required: "需要完成支付", pending: "支付处理中", confirmed_no_charge: "未扣款", provider_insufficient: "支付渠道余额不足", risk_rejected: "风控拒绝", succeeded: "支付成功", unknown: "状态待确认", possibly_charged: "可能已扣款", reversed: "已冲正"
};
const safeStatuses = new Set<PaymentAttemptDto["status"]>(["succeeded", "confirmed_no_charge", "provider_insufficient", "risk_rejected", "reversed"]);
function isFlowDestination(value: CommerceInitialDestination): value is CommerceFlow { return value.type === "recharge" || value.type === "purchase_confirm" || value.type === "payment_status"; }

function newIdempotencyKey(intent: string): string { return `coins-intent-${intent}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`; }

export function CommerceWorkspace({ client, sessionRef, initialDestination = { type: "wallet" } }: Props) {
  const [data, setData] = useState<Loaded | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [destination, setDestination] = useState<CommerceDestination>(isFlowDestination(initialDestination) ? initialDestination.backTo : initialDestination.type);
  const [flow, setFlow] = useState<CommerceFlow | null>(isFlowDestination(initialDestination) ? initialDestination : null);
  const [confirming, setConfirming] = useState(false);
  const [pendingOffer, setPendingOffer] = useState<string | null>(null);
  const [attempt, setAttempt] = useState<PaymentAttemptDto | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const idempotencyKeys = useRef(new Map<string, string>());
  const intentKey = (intent: string) => { const existing = idempotencyKeys.current.get(intent); if (existing) return existing; const key = newIdempotencyKey(intent); idempotencyKeys.current.set(intent, key); return key; };

  const load = useCallback(async () => {
    setError(null);
    try {
      const [wallet, catalog, orders, referral] = await Promise.all([client.getWallet(sessionRef), client.getCatalog(sessionRef), client.listOrders(sessionRef), client.getReferral(sessionRef)]);
      setData({ wallet, catalog, orders, referral });
      if (flow?.type === "payment_status") setAttempt(await client.getPaymentAttempt(sessionRef, flow.attemptRef));
    } catch (cause) { setError(cause); }
  }, [client, sessionRef, flow]);
  useEffect(() => { void load(); }, [load]);

  const go = (next: CommerceDestination) => { setDestination(next); setFlow(null); setConfirming(false); setMessage(null); };
  const selectedOfferRef = pendingOffer ?? (flow?.type === "purchase_confirm" ? flow.offerVersionRef : null);
  const selectedOffer = useMemo(() => data?.catalog.catalog.offerVersions.find((offer) => offer.offerVersionRef === selectedOfferRef) ?? null, [data, selectedOfferRef]);

  const purchase = async () => {
    if (!selectedOfferRef) return;
    try { await client.createProductOrder(sessionRef, { offerVersionRef: selectedOfferRef, idempotencyKey: intentKey(`purchase-${selectedOfferRef}`) }); setMessage("订单已创建"); go("orders"); }
    catch (cause) { if (cause instanceof CommerceClientError && cause.code === "insufficient_coins" || (cause as { code?: string })?.code === "insufficient_coins") setMessage("Coins 不足"); else setMessage("订单暂不可用"); }
    finally { setConfirming(false); }
  };

  if (error) return <StateNotice state="error" title="Coins 商城暂不可用" message="请稍后重试。" />;
  if (!data) return <StateNotice state="loading" title="正在加载 Coins 商城" message="正在并发读取钱包、商城、订单和推荐明细。" />;

  return <main className="coins-commerce">
    <header className="coins-commerce-section-heading"><h1>Coins 商城</h1><nav aria-label="Coins 商业流程"><div>{(Object.keys(destinationLabel) as CommerceDestination[]).map((item) => <button className="coins-commerce-action" type="button" key={item} onClick={() => go(item)}>{destinationLabel[item]}</button>)}</div></nav></header>
    {message ? <p role="status">{message}{message === "Coins 不足" ? <button className="coins-commerce-action" type="button" onClick={() => go("catalog")}>去充值</button> : null}</p> : null}
    {flow?.type === "purchase_confirm" || confirming ? <section aria-label="购买确认"><h2>确认购买</h2><p>请再次确认使用 Coins 支付{selectedOffer ? `（${selectedOffer.priceCoins} Coins）` : ""}。</p><button className="coins-commerce-action" type="button" onClick={() => void purchase()}>确认使用 Coins 支付</button><button className="coins-commerce-action" type="button" onClick={() => { setConfirming(false); setFlow(null); }}>返回</button></section> : null}
    {flow?.type === "payment_status" ? <PaymentStatus client={client} sessionRef={sessionRef} attempt={attempt} backTo={flow.backTo} onBack={() => go(flow.backTo)} /> : null}
    {!flow && destination === "wallet" ? <WalletPage wallet={data.wallet} /> : null}
    {!flow && destination === "catalog" ? <CatalogPage catalog={data.catalog} onRecharge={(ref) => setFlow({ type: "recharge", backTo: "catalog", rechargeOfferRef: ref })} onPurchase={(ref) => { setPendingOffer(ref); setFlow({ type: "purchase_confirm", backTo: "catalog", offerVersionRef: ref }); setConfirming(true); }} /> : null}
    {!flow && destination === "orders" ? <OrdersPage orders={data.orders} /> : null}
    {!flow && destination === "referral" ? <ReferralPage referral={data.referral} /> : null}
    {flow?.type === "recharge" ? <RechargePage client={client} sessionRef={sessionRef} flow={flow} onBack={() => go(flow.backTo)} onDone={() => { if (pendingOffer) { setConfirming(true); setFlow({ type: "purchase_confirm", backTo: "catalog", offerVersionRef: pendingOffer }); } else go("catalog"); }} idempotencyKey={intentKey(`recharge-${flow.rechargeOfferRef}`)} /> : null}
  </main>;
}

function WalletPage({ wallet }: { wallet: WalletDto }) { return <section aria-label="Coins 钱包"><h2>Coins 钱包</h2><div className="coins-commerce-grid">{Object.entries(wallet.summary.byOrigin).map(([origin, balance]) => <BalanceCard key={origin} title={`${origin === "bonus" ? "Bonus" : origin === "paid" ? "Paid" : "Referral"} Coins`} amountCoins={balance.availableCoins} description={`冻结 ${balance.frozenCoins} Coins`} />)}<BalanceCard title="总可用余额" amountCoins={wallet.summary.totalAvailableCoins} description={`总冻结 ${wallet.summary.totalFrozenCoins} Coins`} /></div><table aria-label="Coins 账本"><thead><tr><th>类型</th><th>金额</th><th>时间</th></tr></thead><tbody>{wallet.transactions.map((tx) => <LedgerRow key={tx.transactionRef} transaction={tx} typeLabel={tx.type} />)}</tbody></table></section>; }
function CatalogPage({ catalog, onRecharge, onPurchase }: { catalog: CatalogDto; onRecharge: (ref: string) => void; onPurchase: (ref: string) => void }) { const products = new Map(catalog.catalog.productVersions.map((p) => [p.productVersionRef, p])); return <section aria-label="Coins 商城目录"><h2>Coins 商城目录</h2><h3>充值</h3><ul aria-label="充值档">{catalog.catalog.rechargeOffers.map((offer) => <RechargeOfferCard key={offer.rechargeOfferRef} offer={offer} onSelect={onRecharge} />)}</ul><h3>自营商品</h3><ul aria-label="商品 Offer">{catalog.catalog.offerVersions.map((offer) => { const product = products.get(offer.productVersionRef); return product ? <ProductOfferCard key={offer.offerVersionRef} product={product} offer={offer} title={product.productId} payableCoins={offer.priceCoins} onSelect={onPurchase} /> : null; })}</ul></section>; }
function OrdersPage({ orders }: { orders: CommerceOrderDto[] }) { return <section aria-label="Coins 订单"><h2>Coins 订单</h2>{orders.length ? orders.map((order) => <OrderSummary key={order.orderRef} order={order} title={order.orderRef} statusLabel={order.status} />) : <StateNotice state="empty" title="暂无订单" message="完成购买或充值后会显示在这里。" />}</section>; }
function ReferralPage({ referral }: { referral: ReferralSummaryDto }) { const parts: [string, number][] = [["累计获得", referral.cumulativeEarnedCoins], ["可用余额", referral.availableCoins], ["内部消费", referral.internallyConsumedCoins], ["冻结", referral.frozenCoins], ["待结算冻结", referral.frozenForSettlementCoins], ["外部结算", referral.externallySettledCoins], ["已冲正", referral.reversedCoins]]; return <section aria-label="推荐 Coins"><h2>推荐 Coins</h2><dl>{parts.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value} Coins</dd></div>)}</dl><p>Coins 仅用于平台自营产品，不支持提现或结算。</p></section>; }
function RechargePage({ client, sessionRef, flow, onBack, onDone, idempotencyKey }: { client: CommerceClient; sessionRef: string; flow: Extract<CommerceFlow, { type: "recharge" }>; onBack: () => void; onDone: () => void; idempotencyKey: string }) { const [busy, setBusy] = useState(false); const submit = async () => { setBusy(true); try { await client.createRechargeOrder(sessionRef, { rechargeOfferRef: flow.rechargeOfferRef, preferredProviderId: null, idempotencyKey }); onDone(); } finally { setBusy(false); } }; return <section aria-label="Coins 充值"><h2>充值 Coins</h2><p>充值完成后不会自动购买商品；返回后需再次确认待处理订单。</p><button className="coins-commerce-action" type="button" disabled={busy} onClick={() => void submit()}>创建充值订单</button><button className="coins-commerce-action" type="button" onClick={onBack}>返回{destinationLabel[flow.backTo]}</button></section>; }
function PaymentStatus({ client, sessionRef, attempt, backTo, onBack }: { client: CommerceClient; sessionRef: string; attempt: PaymentAttemptDto | null; backTo: CommerceDestination; onBack: () => void }) { if (!attempt) return <StateNotice state="loading" title="正在读取支付状态" />; const canAct = safeStatuses.has(attempt.status); return <section aria-label="支付状态"><h2>支付状态</h2><StatusBadge label={statusLabel[attempt.status]} tone={attempt.status === "succeeded" ? "success" : attempt.status === "pending" ? "warning" : "neutral"} /><p>{attempt.reconciliationState}</p>{renderNextAction(attempt)}{canAct ? <button className="coins-commerce-action" type="button" onClick={onBack}>返回并创建新订单</button> : null}<button className="coins-commerce-action" type="button" onClick={onBack}>返回{destinationLabel[backTo]}</button></section>; }
function renderNextAction(attempt: PaymentAttemptDto) { const action = attempt.nextAction; if (action.type === "none") return null; if (action.type === "hosted_redirect") return <a href={action.url}>继续支付</a>; if (action.type === "provider_sdk") return <button className="coins-commerce-action" type="button">打开支付组件</button>; if (action.type === "qr") return <pre aria-label="支付二维码">{action.payload}</pre>; return <ol aria-label="银行支付说明">{action.instructions.map((line) => <li key={line}>{line}</li>)}</ol>; }
