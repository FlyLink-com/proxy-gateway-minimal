import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type MouseEvent
} from "react";
import { Circle, LoaderCircle } from "lucide-react";
import {
  CoinsDialogFrame,
  PortalCoinCommerceClientError,
  ProductDetailDialog,
  type PortalCoinCommerceClientErrorCode,
  type PortalCoinOffer,
  type PortalDeferredCheckoutQuote,
  type PortalDeferredTransition,
  type PortalWalletFirstCommerceClient
} from "./commerce";
import {
  formatPortalDateTime,
  portalCoinTypeListLabel
} from "./portal-commerce-presentation";

type CommerceLocale = "zh" | "en";

export type WalletFirstMarketplacePanelProps = {
  commerceClient: PortalWalletFirstCommerceClient | null;
  locale: CommerceLocale;
  onOpenWallet?: () => void;
  onWalletMutation?: () => void;
  sessionGeneration?: number;
  sessionRef: string | null;
  theme: "light" | "dark";
};

type LoadState =
  | { status: "loading" }
  | { status: "ready" }
  | { status: "unavailable" }
  | {
      status: "error";
      errorCode: PortalCoinCommerceClientErrorCode;
      retryable: boolean;
    };

type FlowState =
  | { status: "idle" }
  | { status: "previewing" }
  | { status: "quote"; quote: PortalDeferredCheckoutQuote }
  | { status: "reserving"; quote: PortalDeferredCheckoutQuote }
  | {
      status: "error";
      errorCode: PortalCoinCommerceClientErrorCode;
      retryable: boolean;
    };

const EMPTY_FLOW: FlowState = { status: "idle" };

function isChinese(locale: CommerceLocale) {
  return locale === "zh";
}

function commerceFailure(error: unknown): {
  errorCode: PortalCoinCommerceClientErrorCode;
  retryable: boolean;
} {
  if (error instanceof PortalCoinCommerceClientError) {
    return { errorCode: error.code, retryable: error.retryable };
  }
  return { errorCode: "commerce_request_failed", retryable: true };
}

function errorText(
  errorCode: PortalCoinCommerceClientErrorCode,
  locale: CommerceLocale
) {
  const zh = isChinese(locale);
  if (errorCode === "commerce_session_invalid") {
    return zh
      ? "商城会话已失效，请重新登录。"
      : "The Marketplace session is no longer valid. Sign in again.";
  }
  if (errorCode === "wallet_not_active") {
    return zh ? "Coins 钱包尚未启用。" : "The Coins wallet is not active.";
  }
  if (errorCode === "insufficient_coins") {
    return zh
      ? "Coins 余额不足，请查看服务端报价。"
      : "The Coins balance is insufficient. Review the server Quote.";
  }
  if (errorCode === "quote_expired" || errorCode === "quote_stale") {
    return zh
      ? "服务端报价已失效，请重新预览。"
      : "The server Quote is no longer current. Preview again.";
  }
  if (
    errorCode === "reconciliation_required"
    || errorCode === "deferred_transition_conflict"
  ) {
    return zh
      ? "存在待核对的切换，暂不能创建新的 Coins 结算。"
      : "An unresolved transition prevents a new Coins settlement.";
  }
  return zh
    ? "Coins 切换流程暂时不可用，请安全重试。"
    : "The Coins transition flow is temporarily unavailable. Retry safely.";
}

function transitionFlowText(
  flowKind: PortalDeferredTransition["flowKind"],
  locale: CommerceLocale
) {
  if (flowKind === "scheduled_switch") {
    return isChinese(locale) ? "到期后切换" : "Scheduled switch";
  }
  return isChinese(locale) ? "首次开通" : "Initial activation";
}

function transitionStateText(
  state: PortalDeferredTransition["state"],
  locale: CommerceLocale
) {
  const zh = isChinese(locale);
  const labels: Record<PortalDeferredTransition["state"], [string, string]> = {
    reserved: ["已预留，等待执行", "Reserved and awaiting execution"],
    processing: ["正在执行", "Applying"],
    effect_applied: ["服务已更新，等待结算", "Service updated; settlement pending"],
    settled: ["已完成", "Completed"],
    requote_required: ["需要重新报价", "A new quote is required"],
    cancelled: ["已取消", "Cancelled"],
    reconciliation_required: ["需要人工核对", "Support review required"]
  };
  return zh ? labels[state][0] : labels[state][1];
}

function offerTitle(offer: PortalCoinOffer, locale: CommerceLocale) {
  return isChinese(locale) ? offer.title.zh : offer.title.en;
}

function offerSummary(offer: PortalCoinOffer, locale: CommerceLocale) {
  return isChinese(locale) ? offer.summary.zh : offer.summary.en;
}

function deliveryText(offer: PortalCoinOffer, locale: CommerceLocale) {
  const zh = isChinese(locale);
  if (offer.delivery.kind === "subscription_plan") {
    return zh
      ? `${offer.delivery.durationDays} 天 · 每月 ${offer.delivery.monthlyTrafficGb} GB`
      : `${offer.delivery.durationDays} days · ${offer.delivery.monthlyTrafficGb} GB monthly`;
  }
  return zh
    ? `${offer.delivery.trafficGb} GB · 永不过期`
    : `${offer.delivery.trafficGb} GB · never expires`;
}

function nextIdempotencyKey() {
  const runtimeCrypto = globalThis.crypto;
  if (!runtimeCrypto || typeof runtimeCrypto.randomUUID !== "function") {
    throw new PortalCoinCommerceClientError("commerce_request_failed", true);
  }
  return runtimeCrypto.randomUUID();
}

function MarketplaceNotice({
  state
}: {
  state: "loading" | "empty" | "unavailable" | "error";
}) {
  if (state === "loading") {
    return (
      <LoaderCircle
        aria-hidden="true"
        className="portal-notice__indicator portal-notice__indicator--loading"
      />
    );
  }
  return (
    <Circle
      aria-hidden="true"
      className="portal-notice__indicator portal-notice__marker"
    />
  );
}

function WalletFirstOfferCard({
  busy,
  locale,
  offer,
  onDetails,
  onPurchase
}: {
  busy: boolean;
  locale: CommerceLocale;
  offer: PortalCoinOffer;
  onDetails: (event: MouseEvent<HTMLButtonElement>) => void;
  onPurchase: (event: MouseEvent<HTMLButtonElement>) => void;
}) {
  const zh = isChinese(locale);
  const title = offerTitle(offer, locale);
  const notices = zh ? offer.importantNotices.zh : offer.importantNotices.en;
  return (
    <li className="portal-marketplace-card">
      <article>
        <h3>{title}</h3>
        <p>{offerSummary(offer, locale)}</p>
        <dl className="portal-marketplace-card__facts">
          <div>
            <dt>{zh ? "交付" : "Delivery"}</dt>
            <dd>{deliveryText(offer, locale)}</dd>
          </div>
          <div>
            <dt>{zh ? "价格" : "Price"}</dt>
            <dd>{offer.baseCoinUnits} Coins</dd>
          </div>
          <div>
            <dt>{zh ? "接受的 Coins" : "Accepted Coins"}</dt>
            <dd>{portalCoinTypeListLabel(offer.acceptedCoinTypes, locale)}</dd>
          </div>
        </dl>
        <ul className="portal-marketplace-card__notices">
          {notices.map((notice) => <li key={notice}>{notice}</li>)}
        </ul>
        <div className="portal-marketplace-card__actions">
          <button
            aria-label={zh ? `查看详情：${title}` : `Details: ${title}`}
            disabled={busy}
            type="button"
            onClick={onDetails}
          >
            {zh ? "查看详情" : "Details"}
          </button>
          <button
            aria-label={zh ? `使用 Coins 预约：${title}` : `Reserve with Coins: ${title}`}
            className="portal-marketplace-card__purchase"
            disabled={busy}
            type="button"
            onClick={onPurchase}
          >
            {zh ? "使用 Coins 预约" : "Reserve with Coins"}
          </button>
        </div>
      </article>
    </li>
  );
}

function isActiveTransition(transition: PortalDeferredTransition) {
  return transition.state !== "settled" && transition.state !== "cancelled";
}

function DeferredTransitionList({
  cancellingTransitionRef,
  emptyText,
  locale,
  onCancel,
  transitions
}: {
  cancellingTransitionRef: string | null;
  emptyText: string;
  locale: CommerceLocale;
  onCancel: (transition: PortalDeferredTransition) => void;
  transitions: PortalDeferredTransition[];
}) {
  const zh = isChinese(locale);
  if (transitions.length === 0) {
    return <p role="status">{emptyText}</p>;
  }
  return (
    <ul className="portal-marketplace-grid">
      {transitions.map((transition) => (
        <li className="portal-marketplace-card" key={transition.transitionRef}>
          <article>
            <h4>{offerTitle(transition.offer, locale)}</h4>
            <p>{transitionStateText(transition.state, locale)}</p>
            <dl className="portal-marketplace-card__facts">
              <div>
                <dt>{zh ? "执行方式" : "Execution"}</dt>
                <dd>{transitionFlowText(transition.flowKind, locale)}</dd>
              </div>
              <div>
                <dt>{zh ? "计划时间" : "Scheduled for"}</dt>
                <dd>{formatPortalDateTime(transition.scheduledFor, locale)}</dd>
              </div>
              <div>
                <dt>{zh ? "Coins" : "Coins"}</dt>
                <dd>{transition.amountUnits} Coins</dd>
              </div>
            </dl>
            {transition.state === "reserved" ? (
              <div className="portal-marketplace-card__actions">
                <button
                  disabled={cancellingTransitionRef === transition.transitionRef}
                  type="button"
                  onClick={() => onCancel(transition)}
                >
                  {cancellingTransitionRef === transition.transitionRef
                    ? (zh ? "正在取消…" : "Cancelling…")
                    : (zh ? "取消预留" : "Cancel reservation")}
                </button>
              </div>
            ) : null}
          </article>
        </li>
      ))}
    </ul>
  );
}

function DeferredQueue({
  cancellingTransitionRef,
  locale,
  onCancel,
  onRefresh,
  refreshError,
  refreshing,
  transitions
}: {
  cancellingTransitionRef: string | null;
  locale: CommerceLocale;
  onCancel: (transition: PortalDeferredTransition) => void;
  onRefresh: () => void;
  refreshError: { errorCode: PortalCoinCommerceClientErrorCode; retryable: boolean } | null;
  refreshing: boolean;
  transitions: PortalDeferredTransition[];
}) {
  const zh = isChinese(locale);
  const activeTransitions = transitions.filter(isActiveTransition);
  const recentTransitions = transitions.filter((transition) => !isActiveTransition(transition));
  return (
    <section
      aria-labelledby="portal-wallet-first-transition-heading"
      className="portal-marketplace-group portal-wallet-first-transition-queue"
    >
      <header className="portal-marketplace-group__header">
        <h2 id="portal-wallet-first-transition-heading">
          {zh ? "服务切换" : "Service transitions"}
        </h2>
        <button
          aria-busy={refreshing || undefined}
          disabled={refreshing}
          type="button"
          onClick={onRefresh}
        >
          {refreshing
            ? (zh ? "正在刷新…" : "Refreshing…")
            : (zh ? "刷新切换" : "Refresh transitions")}
        </button>
      </header>
      {refreshError ? (
        <div aria-live="assertive" className="portal-marketplace-state" data-state="error" role="alert">
          <MarketplaceNotice state="error" />
          <p>{errorText(refreshError.errorCode, locale)}</p>
          {refreshError.retryable ? (
            <button type="button" onClick={onRefresh}>{zh ? "重试" : "Retry"}</button>
          ) : null}
        </div>
      ) : null}
      <section aria-labelledby="portal-wallet-first-active-transition-heading">
        <h3 id="portal-wallet-first-active-transition-heading">
          {zh ? "正在进行的切换" : "Active transitions"}
        </h3>
        <DeferredTransitionList
          cancellingTransitionRef={cancellingTransitionRef}
          emptyText={zh ? "当前没有正在进行的服务切换。" : "There are no active service transitions."}
          locale={locale}
          onCancel={onCancel}
          transitions={activeTransitions}
        />
      </section>
      <section aria-labelledby="portal-wallet-first-recent-transition-heading">
        <h3 id="portal-wallet-first-recent-transition-heading">
          {zh ? "近期切换" : "Recent transitions"}
        </h3>
        <DeferredTransitionList
          cancellingTransitionRef={cancellingTransitionRef}
          emptyText={zh ? "当前没有近期服务切换。" : "There are no recent service transitions."}
          locale={locale}
          onCancel={onCancel}
          transitions={recentTransitions}
        />
      </section>
    </section>
  );
}

/**
 * This component is reachable only after MarketplacePanel projects the model
 * from `/api/portal/commerce/model`.  It owns no legacy client, so a
 * wallet-first account cannot accidentally submit an ordinary Commerce Order.
 */
export function WalletFirstMarketplacePanel({
  commerceClient,
  locale,
  onOpenWallet,
  onWalletMutation,
  sessionGeneration = 0,
  sessionRef,
  theme
}: WalletFirstMarketplacePanelProps) {
  const zh = isChinese(locale);
  const generationRef = useRef(0);
  const transitionRefreshSequenceRef = useRef(0);
  const reserveIntentRef = useRef<{
    pending: boolean;
    quoteRef: string;
    key: string;
  } | null>(null);
  const [revision, setRevision] = useState(0);
  const [load, setLoad] = useState<LoadState>(() => (
    commerceClient && sessionRef ? { status: "loading" } : { status: "unavailable" }
  ));
  const [offers, setOffers] = useState<PortalCoinOffer[]>([]);
  const [transitions, setTransitions] = useState<PortalDeferredTransition[]>([]);
  const [flow, setFlow] = useState<FlowState>(EMPTY_FLOW);
  const [detailOffer, setDetailOffer] = useState<PortalCoinOffer | null>(null);
  const [cancellingTransitionRef, setCancellingTransitionRef] = useState<string | null>(null);
  const [refreshingTransitions, setRefreshingTransitions] = useState(false);
  const [transitionRefreshError, setTransitionRefreshError] = useState<{
    errorCode: PortalCoinCommerceClientErrorCode;
    retryable: boolean;
  } | null>(null);

  useEffect(() => {
    const generation = generationRef.current + 1;
    generationRef.current = generation;
    const initialTransitionRequestId = transitionRefreshSequenceRef.current + 1;
    transitionRefreshSequenceRef.current = initialTransitionRequestId;
    reserveIntentRef.current = null;
    setDetailOffer(null);
    setFlow(EMPTY_FLOW);
    if (!commerceClient || !sessionRef) {
      setOffers([]);
      setTransitions([]);
      setRefreshingTransitions(false);
      setTransitionRefreshError(null);
      setLoad({ status: "unavailable" });
      return () => {
        generationRef.current += 1;
      };
    }
    setRefreshingTransitions(false);
    setTransitionRefreshError(null);
    setLoad({ status: "loading" });
    void Promise.all([
      commerceClient.listOffers({ sessionRef }),
      commerceClient.listDeferredTransitions({ sessionRef })
    ]).then(([nextOffers, nextTransitions]) => {
      if (generation !== generationRef.current) return;
      setOffers(nextOffers);
      if (initialTransitionRequestId === transitionRefreshSequenceRef.current) {
        setTransitions(nextTransitions);
      }
      setLoad({ status: "ready" });
    }).catch((error: unknown) => {
      if (generation !== generationRef.current) return;
      const failure = commerceFailure(error);
      setOffers([]);
      if (initialTransitionRequestId === transitionRefreshSequenceRef.current) {
        setTransitions([]);
      }
      setLoad({ status: "error", ...failure });
    });
    return () => {
      generationRef.current += 1;
    };
  }, [commerceClient, revision, sessionGeneration, sessionRef]);

  const retryLoad = useCallback(() => {
    setRevision((current) => current + 1);
  }, []);

  const refreshTransitions = useCallback(async () => {
    if (!commerceClient || !sessionRef) return;
    const generation = generationRef.current;
    const requestId = transitionRefreshSequenceRef.current + 1;
    transitionRefreshSequenceRef.current = requestId;
    setRefreshingTransitions(true);
    setTransitionRefreshError(null);
    try {
      const nextTransitions = await commerceClient.listDeferredTransitions({ sessionRef });
      if (
        generation !== generationRef.current
        || requestId !== transitionRefreshSequenceRef.current
      ) {
        return;
      }
      setTransitions(nextTransitions);
      onWalletMutation?.();
    } catch (error) {
      if (
        generation !== generationRef.current
        || requestId !== transitionRefreshSequenceRef.current
      ) {
        return;
      }
      setTransitionRefreshError(commerceFailure(error));
    } finally {
      if (
        generation === generationRef.current
        && requestId === transitionRefreshSequenceRef.current
      ) {
        setRefreshingTransitions(false);
      }
    }
  }, [commerceClient, onWalletMutation, sessionRef]);

  const previewOffer = useCallback(async (offer: PortalCoinOffer) => {
    if (!commerceClient || !sessionRef) return;
    const generation = generationRef.current;
    setDetailOffer(null);
    setFlow({ status: "previewing" });
    try {
      const quote = await commerceClient.previewDeferredCheckout({
        sessionRef,
        offerRef: offer.offerRef
      });
      if (generation !== generationRef.current) return;
      reserveIntentRef.current = null;
      setFlow({ status: "quote", quote });
    } catch (error) {
      if (generation !== generationRef.current) return;
      setFlow({ status: "error", ...commerceFailure(error) });
    }
  }, [commerceClient, sessionRef]);

  const closeFlow = useCallback(() => {
    reserveIntentRef.current = null;
    setFlow(EMPTY_FLOW);
  }, []);

  const reserveQuote = useCallback(async () => {
    if (
      !commerceClient
      || !sessionRef
      || (flow.status !== "quote" && flow.status !== "reserving")
      || flow.quote.purchaseAvailability !== "available"
    ) {
      return;
    }
    let intent = reserveIntentRef.current;
    try {
      if (!intent || intent.quoteRef !== flow.quote.quoteRef) {
        intent = {
          pending: false,
          quoteRef: flow.quote.quoteRef,
          key: nextIdempotencyKey()
        };
        reserveIntentRef.current = intent;
      }
    } catch (error) {
      setFlow({ status: "error", ...commerceFailure(error) });
      return;
    }
    if (intent.pending) return;
    intent.pending = true;
    const generation = generationRef.current;
    setFlow({ status: "reserving", quote: flow.quote });
    try {
      const transition = await commerceClient.reserveDeferredTransition({
        sessionRef,
        quoteRef: flow.quote.quoteRef,
        idempotencyKey: intent.key
      });
      if (generation !== generationRef.current) return;
      setTransitions((current) => [
        transition,
        ...current.filter((item) => item.transitionRef !== transition.transitionRef)
      ]);
      reserveIntentRef.current = null;
      setFlow(EMPTY_FLOW);
      onWalletMutation?.();
    } catch (error) {
      if (generation !== generationRef.current) return;
      setFlow({ status: "error", ...commerceFailure(error) });
    } finally {
      if (reserveIntentRef.current === intent) {
        intent.pending = false;
      }
    }
  }, [commerceClient, flow, onWalletMutation, sessionRef]);

  const cancelTransition = useCallback(async (transition: PortalDeferredTransition) => {
    if (
      !commerceClient
      || !sessionRef
      || transition.state !== "reserved"
      || cancellingTransitionRef !== null
    ) {
      return;
    }
    let key: string;
    try {
      key = nextIdempotencyKey();
    } catch (error) {
      setFlow({ status: "error", ...commerceFailure(error) });
      return;
    }
    const generation = generationRef.current;
    setCancellingTransitionRef(transition.transitionRef);
    try {
      const cancelled = await commerceClient.cancelDeferredTransition({
        sessionRef,
        transitionRef: transition.transitionRef,
        idempotencyKey: key
      });
      if (generation !== generationRef.current) return;
      setTransitions((current) => current.map((item) => (
        item.transitionRef === cancelled.transitionRef ? cancelled : item
      )));
      onWalletMutation?.();
    } catch (error) {
      if (generation !== generationRef.current) return;
      setFlow({ status: "error", ...commerceFailure(error) });
    } finally {
      if (generation === generationRef.current) {
        setCancellingTransitionRef(null);
      }
    }
  }, [cancellingTransitionRef, commerceClient, onWalletMutation, sessionRef]);

  const planOffers = offers.filter((offer) => offer.category === "plan");
  const dataPackOffers = offers.filter((offer) => offer.category === "data_pack");
  const busy = flow.status === "previewing" || flow.status === "reserving";

  return (
    <section
      aria-busy={load.status === "loading" || busy || undefined}
      aria-label={zh ? "钱包优先商城目录" : "Wallet-first Marketplace catalog"}
      className="portal-commerce-layout portal-commerce-layout--marketplace"
      data-commerce-model="wallet_first_unique_v1"
    >
      {load.status === "unavailable" ? (
        <div aria-live="polite" className="portal-marketplace-state" data-state="unavailable" role="status">
          <MarketplaceNotice state="unavailable" />
          <p>{zh ? "钱包优先商城暂不可用。" : "The wallet-first Marketplace is unavailable."}</p>
        </div>
      ) : null}
      {load.status === "loading" ? (
        <div aria-live="polite" className="portal-marketplace-state" data-state="loading" role="status">
          <MarketplaceNotice state="loading" />
          <span>{zh ? "正在加载钱包优先商城…" : "Loading wallet-first Marketplace…"}</span>
        </div>
      ) : null}
      {load.status === "error" ? (
        <div aria-live="assertive" className="portal-marketplace-state" data-state="error" role="alert">
          <MarketplaceNotice state="error" />
          <p>{errorText(load.errorCode, locale)}</p>
          {load.retryable ? <button type="button" onClick={retryLoad}>{zh ? "重试" : "Retry"}</button> : null}
        </div>
      ) : null}
      {load.status === "ready" ? (
        <>
          <DeferredQueue
            cancellingTransitionRef={cancellingTransitionRef}
            locale={locale}
            onCancel={(transition) => { void cancelTransition(transition); }}
            onRefresh={() => { void refreshTransitions(); }}
            refreshError={transitionRefreshError}
            refreshing={refreshingTransitions}
            transitions={transitions}
          />
          {offers.length === 0 ? (
            <div aria-live="polite" className="portal-marketplace-state" data-state="empty" role="status">
              <MarketplaceNotice state="empty" />
              <span>{zh ? "当前没有可用商品。" : "No products are currently available."}</span>
            </div>
          ) : null}
          {planOffers.length > 0 ? (
            <section aria-labelledby="portal-wallet-first-plan-heading" className="portal-marketplace-group">
              <h2 id="portal-wallet-first-plan-heading">{zh ? "套餐" : "Plans"}</h2>
              <ul className="portal-marketplace-grid">
                {planOffers.map((offer) => (
                  <WalletFirstOfferCard
                    busy={busy}
                    key={offer.offerRef}
                    locale={locale}
                    offer={offer}
                    onDetails={() => setDetailOffer(offer)}
                    onPurchase={() => { void previewOffer(offer); }}
                  />
                ))}
              </ul>
            </section>
          ) : null}
          {dataPackOffers.length > 0 ? (
            <section aria-labelledby="portal-wallet-first-data-pack-heading" className="portal-marketplace-group">
              <h2 id="portal-wallet-first-data-pack-heading">{zh ? "流量包" : "Data packs"}</h2>
              <ul className="portal-marketplace-grid">
                {dataPackOffers.map((offer) => (
                  <WalletFirstOfferCard
                    busy={busy}
                    key={offer.offerRef}
                    locale={locale}
                    offer={offer}
                    onDetails={() => setDetailOffer(offer)}
                    onPurchase={() => { void previewOffer(offer); }}
                  />
                ))}
              </ul>
            </section>
          ) : null}
        </>
      ) : null}
      {flow.status === "error" ? (
        <div aria-live="assertive" className="portal-marketplace-flow-state" data-state="error" role="alert">
          <MarketplaceNotice state="error" />
          <p>{errorText(flow.errorCode, locale)}</p>
          {flow.retryable ? <button type="button" onClick={closeFlow}>{zh ? "关闭" : "Close"}</button> : null}
        </div>
      ) : null}
      <div className="portal-coins-dialog-theme" data-portal-theme={theme}>
        {detailOffer ? (
          <ProductDetailDialog
            locale={locale}
            offer={detailOffer}
            onPreview={() => { void previewOffer(detailOffer); }}
            onRequestClose={() => setDetailOffer(null)}
          />
        ) : null}
        {(flow.status === "quote" || flow.status === "reserving") ? (
          <CoinsDialogFrame
            busy={flow.status === "reserving"}
            closeDisabled={flow.status === "reserving"}
            closeLabel={zh ? "关闭" : "Close"}
            escapeCloseEnabled={flow.status !== "reserving"}
            onRequestClose={closeFlow}
            panelClassName="portal-coins-purchase-dialog"
            title={zh ? "确认 Coins 服务切换" : "Confirm Coins service transition"}
            footer={(
              <button
                className="portal-coins-dialog__primary"
                disabled={
                  flow.status === "reserving"
                  || flow.quote.purchaseAvailability !== "available"
                }
                type="button"
                onClick={() => { void reserveQuote(); }}
              >
                {flow.status === "reserving"
                  ? (zh ? "正在预留…" : "Reserving…")
                  : (zh ? "确认预留 Coins" : "Reserve Coins")}
              </button>
            )}
          >
            <p>
              {flow.quote.purchaseAvailability === "available"
                ? (zh ? "服务端已生成报价。确认后会创建可追踪的服务切换队列。" : "The server has issued a Quote. Confirm to create a traceable service-transition queue entry.")
                : (zh ? `Coins 余额不足，仍缺少 ${flow.quote.shortfallUnits} Coins。` : `There is a ${flow.quote.shortfallUnits} Coins shortfall.`)}
            </p>
            <dl>
              <div>
                <dt>{zh ? "商品" : "Offer"}</dt>
                <dd>{offerTitle(flow.quote.offer, locale)}</dd>
              </div>
              <div>
                <dt>{zh ? "价格" : "Price"}</dt>
                <dd>{flow.quote.amountUnits} Coins</dd>
              </div>
              <div>
                <dt>{zh ? "执行方式" : "Execution"}</dt>
                <dd>{transitionFlowText(flow.quote.transition.flowKind, locale)}</dd>
              </div>
              <div>
                <dt>{zh ? "计划时间" : "Scheduled for"}</dt>
                <dd>{formatPortalDateTime(flow.quote.transition.scheduledFor, locale)}</dd>
              </div>
            </dl>
            {flow.quote.purchaseAvailability === "insufficient_balance" ? (
              <button
                className="portal-coins-dialog__secondary"
                type="button"
                onClick={() => {
                  closeFlow();
                  onOpenWallet?.();
                }}
              >
                {zh ? "前往钱包" : "Go to Wallet"}
              </button>
            ) : null}
          </CoinsDialogFrame>
        ) : null}
      </div>
    </section>
  );
}
