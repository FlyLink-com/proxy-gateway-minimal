import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type MouseEvent
} from "react";
import { ModalFrame } from "../../components/modal-frame";
import {
  CoinsPurchaseDialog,
  isPortalCoinOrderTerminal,
  PortalCoinCommerceClientError,
  ProductDetailDialog,
  useCoinsPurchaseFlow,
  type PortalCoinCommerceClientErrorCode,
  type PortalCoinCommerceClient,
  type PortalCoinOffer
} from "./commerce";

export type PortalCommerceLocale = "zh" | "en";

type PanelProps = {
  locale: PortalCommerceLocale;
};

export const RECHARGE_DENOMINATIONS = [10, 30, 50, 100, 200, 300] as const;

export type RechargeDenomination =
  (typeof RECHARGE_DENOMINATIONS)[number];

export type RechargeDenominationListProps = {
  autoFocusFirst?: boolean;
  locale: PortalCommerceLocale;
  mode: "dialog-selectable" | "wallet-disabled";
  selectedAmount?: RechargeDenomination | null;
  onSelect?: (amount: RechargeDenomination) => void;
};

function isChinese(locale: PortalCommerceLocale) {
  return locale === "zh";
}

export function RechargeDenominationList({
  autoFocusFirst = false,
  locale,
  mode,
  selectedAmount = null,
  onSelect
}: RechargeDenominationListProps) {
  const zh = isChinese(locale);
  const selectable = mode === "dialog-selectable";

  return (
    <ul
      className={`portal-recharge-denominations portal-recharge-denominations--${mode}`}
      aria-label={zh ? "Coins 充值档位" : "Coins recharge denominations"}
    >
      {RECHARGE_DENOMINATIONS.map((amount) => (
        <li key={amount}>
          <button
            type="button"
            autoFocus={
              autoFocusFirst
              && selectable
              && amount === RECHARGE_DENOMINATIONS[0]
            }
            disabled={!selectable}
            aria-pressed={selectable ? selectedAmount === amount : undefined}
            aria-label={
              selectable
                ? zh
                  ? `选择 ${amount} Coins`
                  : `Select ${amount} Coins`
                : zh
                  ? `充值 ${amount} Coins 暂未开放`
                  : `Recharge ${amount} Coins — not available yet`
            }
            onClick={selectable ? () => onSelect?.(amount) : undefined}
          >
            {amount} Coins
          </button>
        </li>
      ))}
    </ul>
  );
}

export function RechargeDialog({
  locale,
  selectedAmount,
  onSelect,
  onClose
}: {
  locale: PortalCommerceLocale;
  selectedAmount: RechargeDenomination | null;
  onSelect: (amount: RechargeDenomination) => void;
  onClose: () => void;
}) {
  const zh = isChinese(locale);

  return (
    <ModalFrame
      closeLabel={zh ? "关闭" : "Close"}
      onClose={onClose}
      panelClassName="portal-recharge-dialog"
      title={zh ? "充值 Coins" : "Recharge Coins"}
      titleId="portal-recharge-dialog-title"
      footer={(
        <button
          className="portal-primary-button compact"
          type="button"
          disabled
        >
          {zh
            ? "支付通道将在下一阶段接入"
            : "Payment channel will be connected in the next stage"}
        </button>
      )}
    >
      <div className="portal-recharge-dialog__body">
        <p>
          {zh
            ? "选择 Coins 档位。本阶段不会创建订单或发起支付。"
            : "Choose a Coins denomination. This stage does not create an order or start payment."}
        </p>
        <RechargeDenominationList
          autoFocusFirst
          locale={locale}
          mode="dialog-selectable"
          selectedAmount={selectedAmount}
          onSelect={onSelect}
        />
      </div>
    </ModalFrame>
  );
}

type MarketplacePanelProps = PanelProps & {
  commerceClient: PortalCoinCommerceClient | null;
  onOpenRecharge: (returnFocus?: () => void) => void;
  onWalletMutation?: () => void;
  sessionGeneration?: number;
  sessionRef: string | null;
  theme: "light" | "dark";
};

type MarketplaceCatalogState =
  | { status: "loading"; offers: PortalCoinOffer[] }
  | { status: "ready"; offers: PortalCoinOffer[] }
  | { status: "unavailable"; offers: PortalCoinOffer[] }
  | {
      status: "error";
      offers: PortalCoinOffer[];
      errorCode: PortalCoinCommerceClientErrorCode;
      retryable: boolean;
    };

type MarketplaceProductIntent = {
  mode: "detail" | "purchase";
  offerRef: string;
};

function offerTitle(offer: PortalCoinOffer, locale: PortalCommerceLocale) {
  return locale === "zh" ? offer.title.zh : offer.title.en;
}

function offerSummary(offer: PortalCoinOffer, locale: PortalCommerceLocale) {
  return locale === "zh" ? offer.summary.zh : offer.summary.en;
}

function referencePrice(offer: PortalCoinOffer) {
  return `CNY ${(offer.referencePrice.amountMinor / 100).toFixed(2)}`;
}

function safeCommerceFailure(error: unknown): {
  errorCode: PortalCoinCommerceClientErrorCode;
  retryable: boolean;
} {
  if (error instanceof PortalCoinCommerceClientError) {
    return {
      errorCode: error.code,
      retryable: error.retryable
    };
  }
  return {
    errorCode: "commerce_request_failed",
    retryable: true
  };
}

function safeCommerceErrorText(
  errorCode: PortalCoinCommerceClientErrorCode,
  locale: PortalCommerceLocale
) {
  const zh = isChinese(locale);
  if (errorCode === "commerce_session_invalid") {
    return zh
      ? "商城会话已失效，请重新登录。"
      : "The Marketplace session is no longer valid. Sign in again.";
  }
  if (errorCode === "wallet_not_active") {
    return zh
      ? "Coins 钱包尚未启用。"
      : "The Coins wallet is not active.";
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
  if (errorCode === "reconciliation_required") {
    return zh
      ? "订单需要人工核对，尚未完成。"
      : "The Order needs support review and is not complete.";
  }
  return zh
    ? "Coins 购买流程暂时不可用，请安全重试。"
    : "The Coins purchase flow is temporarily unavailable. Retry safely.";
}

function MarketplaceOfferCard({
  busy,
  locale,
  offer,
  onDetails,
  onPurchase
}: {
  busy: boolean;
  locale: PortalCommerceLocale;
  offer: PortalCoinOffer;
  onDetails: (event: MouseEvent<HTMLButtonElement>) => void;
  onPurchase: (event: MouseEvent<HTMLButtonElement>) => void;
}) {
  const zh = isChinese(locale);
  const title = offerTitle(offer, locale);
  const notices = zh
    ? offer.importantNotices.zh
    : offer.importantNotices.en;
  const delivery = offer.delivery.kind === "subscription_plan"
    ? zh
      ? `${offer.delivery.durationDays} 天 · 每月 ${offer.delivery.monthlyTrafficGb} GB`
      : `${offer.delivery.durationDays} days · ${offer.delivery.monthlyTrafficGb} GB monthly`
    : zh
      ? `${offer.delivery.trafficGb} GB · 永不过期`
      : `${offer.delivery.trafficGb} GB · never expires`;

  return (
    <li className="portal-marketplace-card">
      <article>
        <h3>{title}</h3>
        <p>{offerSummary(offer, locale)}</p>
        <dl className="portal-marketplace-card__facts">
          <div>
            <dt>{zh ? "交付" : "Delivery"}</dt>
            <dd>{delivery}</dd>
          </div>
          <div>
            <dt>{zh ? "参考价" : "Reference price"}</dt>
            <dd>{referencePrice(offer)}</dd>
          </div>
          <div>
            <dt>{zh ? "接受的 Coins" : "Accepted Coins"}</dt>
            <dd>{offer.acceptedCoinTypes.join(", ")}</dd>
          </div>
        </dl>
        {notices.length > 0 ? (
          <ul className="portal-marketplace-card__notices">
            {notices.map((notice) => <li key={notice}>{notice}</li>)}
          </ul>
        ) : null}
        <div className="portal-marketplace-card__actions">
          <button
            aria-label={
              zh
                ? `查看详情：${title}`
                : `Details: ${title}`
            }
            type="button"
            disabled={busy}
            onClick={onDetails}
          >
            {zh ? "查看详情" : "Details"}
          </button>
          <button
            aria-label={
              zh
                ? `使用 Coins 购买：${title}`
                : `Buy with Coins: ${title}`
            }
            className="portal-marketplace-card__purchase"
            type="button"
            disabled={busy}
            onClick={onPurchase}
          >
            {zh ? "使用 Coins 购买" : "Buy with Coins"}
          </button>
        </div>
      </article>
    </li>
  );
}

export function MarketplacePanel({
  commerceClient,
  locale,
  onOpenRecharge,
  onWalletMutation,
  sessionGeneration = 0,
  sessionRef,
  theme
}: MarketplacePanelProps) {
  const zh = isChinese(locale);
  const generationRef = useRef(0);
  const [refreshRevision, setRefreshRevision] = useState(0);
  const [catalog, setCatalog] = useState<MarketplaceCatalogState>(() => (
    commerceClient && sessionRef
      ? { status: "loading", offers: [] }
      : { status: "unavailable", offers: [] }
  ));
  const [productIntent, setProductIntent] =
    useState<MarketplaceProductIntent | null>(null);
  const [dialogVisible, setDialogVisible] = useState(false);
  const originFocusRef = useRef<HTMLButtonElement | null>(null);
  const productClientRef = useRef(commerceClient);
  const productSessionRef = useRef(sessionRef);
  const latestProductSessionRef = useRef(sessionRef);
  const productIntentSequenceRef = useRef(0);
  const suppressProductFocusRestoreRef = useRef(false);
  latestProductSessionRef.current = sessionRef;
  const purchaseFlow = useCoinsPurchaseFlow({
    client: commerceClient,
    onWalletMutation,
    sessionGeneration,
    sessionRef
  });

  useEffect(() => {
    if (productSessionRef.current === sessionRef) return;
    productSessionRef.current = sessionRef;
    productIntentSequenceRef.current += 1;
    suppressProductFocusRestoreRef.current = false;
    setProductIntent(null);
    setDialogVisible(false);
    originFocusRef.current = null;
  }, [sessionRef]);

  useEffect(() => {
    if (productClientRef.current === commerceClient) return;
    const ownsPendingMutation = purchaseFlow.phase === "submitting"
      || purchaseFlow.cancelling;
    if (ownsPendingMutation) return;
    productClientRef.current = commerceClient;
    if (purchaseFlow.order !== null) return;
    const hasProductReadState = productIntent !== null
      || dialogVisible
      || purchaseFlow.offer !== null
      || purchaseFlow.quote !== null;
    if (!hasProductReadState) return;
    productIntentSequenceRef.current += 1;
    suppressProductFocusRestoreRef.current = false;
    setProductIntent(null);
    setDialogVisible(false);
    purchaseFlow.reset();
  }, [
    commerceClient,
    dialogVisible,
    productIntent,
    purchaseFlow.cancelling,
    purchaseFlow.offer,
    purchaseFlow.order,
    purchaseFlow.phase,
    purchaseFlow.quote,
    purchaseFlow.reset
  ]);

  useEffect(() => () => {
    productIntentSequenceRef.current += 1;
  }, []);

  const retryCatalog = useCallback(() => {
    setRefreshRevision((revision) => revision + 1);
  }, []);

  useEffect(() => {
    const generation = generationRef.current + 1;
    generationRef.current = generation;
    if (!commerceClient || !sessionRef) {
      setCatalog({ status: "unavailable", offers: [] });
      return () => {
        generationRef.current += 1;
      };
    }
    setCatalog({ status: "loading", offers: [] });
    void commerceClient.listOffers({ sessionRef }).then((offers) => {
      if (generation !== generationRef.current) return;
      setCatalog({ status: "ready", offers });
    }).catch((error: unknown) => {
      if (generation !== generationRef.current) return;
      const failure = safeCommerceFailure(error);
      setCatalog({
        status: "error",
        offers: [],
        ...failure
      });
    });
    return () => {
      generationRef.current += 1;
    };
  }, [commerceClient, refreshRevision, sessionRef]);

  const planOffers = catalog.offers.filter((offer) => offer.category === "plan");
  const dataPackOffers = catalog.offers.filter((offer) => offer.category === "data_pack");
  const productBusy = purchaseFlow.phase === "loading_detail"
    || purchaseFlow.phase === "loading_preview"
    || purchaseFlow.phase === "submitting";

  const restoreProductFocus = useCallback(() => {
    if (suppressProductFocusRestoreRef.current) {
      suppressProductFocusRestoreRef.current = false;
      return;
    }
    originFocusRef.current?.focus();
  }, []);

  const startProduct = useCallback(async (
    offerRef: string,
    mode: MarketplaceProductIntent["mode"],
    origin?: HTMLButtonElement
  ) => {
    if (!commerceClient || !sessionRef) return;
    const intentSequence = productIntentSequenceRef.current + 1;
    productIntentSequenceRef.current = intentSequence;
    const intentSessionRef = sessionRef;
    if (origin) {
      originFocusRef.current = origin;
    }
    if (
      purchaseFlow.order
      && !isPortalCoinOrderTerminal(purchaseFlow.order)
    ) {
      setProductIntent(null);
      setDialogVisible(true);
      return;
    }
    purchaseFlow.reset();
    setProductIntent({ mode, offerRef });
    setDialogVisible(true);
    await purchaseFlow.openProduct(offerRef);
    if (
      intentSequence !== productIntentSequenceRef.current
      || latestProductSessionRef.current !== intentSessionRef
    ) {
      return;
    }
    if (mode === "purchase") {
      await purchaseFlow.previewCheckout();
    }
  }, [commerceClient, purchaseFlow, sessionRef]);

  const previewFromDetails = useCallback(() => {
    setProductIntent((current) => (
      current ? { ...current, mode: "purchase" } : current
    ));
    void purchaseFlow.previewCheckout();
  }, [purchaseFlow]);

  const closeCoinsDialog = useCallback(() => {
    productIntentSequenceRef.current += 1;
    setDialogVisible(false);
    setProductIntent(null);
    if (
      !purchaseFlow.order
      || isPortalCoinOrderTerminal(purchaseFlow.order)
    ) {
      purchaseFlow.reset();
    }
  }, [purchaseFlow]);

  const openRechargeFromCoins = useCallback(() => {
    productIntentSequenceRef.current += 1;
    suppressProductFocusRestoreRef.current = true;
    setDialogVisible(false);
    setProductIntent(null);
    purchaseFlow.reset();
    onOpenRecharge(restoreProductFocus);
  }, [onOpenRecharge, purchaseFlow, restoreProductFocus]);

  const retryProduct = useCallback(() => {
    if (!productIntent) return;
    void startProduct(productIntent.offerRef, productIntent.mode);
  }, [productIntent, startProduct]);

  const activeOrderRef = purchaseFlow.order?.orderRef ?? null;
  const confirmationBlocked = Boolean(
    purchaseFlow.quote
    && !purchaseFlow.order
    && purchaseFlow.errorCode
    && !purchaseFlow.errorRetryable
  );
  useEffect(() => {
    if (!activeOrderRef) return;
    setDialogVisible(true);
  }, [activeOrderRef]);

  return (
    <section
      className="portal-commerce-layout portal-commerce-layout--marketplace"
      aria-label={zh ? "商城目录" : "Marketplace catalog"}
    >
      {catalog.status === "unavailable" ? (
        <div className="portal-marketplace-state" role="status">
          <p>
            {zh
              ? "商城目录暂不可用；当前客户端未提供服务端商城能力。"
              : "The Marketplace catalog is unavailable because this client has no server Commerce capability."}
          </p>
        </div>
      ) : null}
      {catalog.status === "loading" ? (
        <div className="portal-marketplace-state" role="status" aria-live="polite">
          {zh ? "正在加载商城目录…" : "Loading Marketplace catalog…"}
        </div>
      ) : null}
      {catalog.status === "error" ? (
        <div className="portal-marketplace-state" role="alert">
          <p>{safeCommerceErrorText(catalog.errorCode, locale)}</p>
          {catalog.retryable ? (
            <button type="button" onClick={retryCatalog}>
              {zh ? "重试" : "Retry"}
            </button>
          ) : null}
        </div>
      ) : null}
      {catalog.status === "ready" && catalog.offers.length === 0 ? (
        <div className="portal-marketplace-state" role="status">
          {zh ? "当前没有可用商品。" : "No products are currently available."}
        </div>
      ) : null}
      {catalog.status === "ready" && planOffers.length > 0 ? (
        <section
          className="portal-marketplace-group"
          aria-labelledby="portal-marketplace-plan-heading"
        >
          <h2 id="portal-marketplace-plan-heading">{zh ? "套餐" : "Plans"}</h2>
          <ul className="portal-marketplace-grid">
            {planOffers.map((offer) => (
              <MarketplaceOfferCard
                busy={productBusy}
                key={offer.offerRef}
                locale={locale}
                offer={offer}
                onDetails={(event) => {
                  void startProduct(
                    offer.offerRef,
                    "detail",
                    event.currentTarget
                  );
                }}
                onPurchase={(event) => {
                  void startProduct(
                    offer.offerRef,
                    "purchase",
                    event.currentTarget
                  );
                }}
              />
            ))}
          </ul>
        </section>
      ) : null}
      {catalog.status === "ready" && dataPackOffers.length > 0 ? (
        <section
          className="portal-marketplace-group"
          aria-labelledby="portal-marketplace-data-pack-heading"
        >
          <h2 id="portal-marketplace-data-pack-heading">
            {zh ? "流量包" : "Data packs"}
          </h2>
          <ul className="portal-marketplace-grid">
            {dataPackOffers.map((offer) => (
              <MarketplaceOfferCard
                busy={productBusy}
                key={offer.offerRef}
                locale={locale}
                offer={offer}
                onDetails={(event) => {
                  void startProduct(
                    offer.offerRef,
                    "detail",
                    event.currentTarget
                  );
                }}
                onPurchase={(event) => {
                  void startProduct(
                    offer.offerRef,
                    "purchase",
                    event.currentTarget
                  );
                }}
              />
            ))}
          </ul>
        </section>
      ) : null}
      {productBusy && !purchaseFlow.quote && !purchaseFlow.order ? (
        <p
          aria-live="polite"
          className="portal-marketplace-flow-state"
          role="status"
        >
          {purchaseFlow.phase === "loading_preview"
            ? zh
              ? "正在获取服务端报价…"
              : "Loading the server Quote…"
            : zh
              ? "正在加载商品详情…"
              : "Loading product details…"}
        </p>
      ) : null}
      {purchaseFlow.errorCode
        && !purchaseFlow.quote
        && !purchaseFlow.order ? (
          <div className="portal-marketplace-flow-state" role="alert">
            <p>{safeCommerceErrorText(purchaseFlow.errorCode, locale)}</p>
            {productIntent && (
              purchaseFlow.errorRetryable
              || purchaseFlow.errorCode === "quote_expired"
              || purchaseFlow.errorCode === "quote_stale"
            ) ? (
              <button type="button" onClick={retryProduct}>
                {zh ? "重试" : "Retry"}
              </button>
            ) : null}
          </div>
        ) : null}
      {dialogVisible ? (
        <div
          className="portal-coins-dialog-theme"
          data-portal-theme={theme}
        >
          {productIntent?.mode === "detail"
            && purchaseFlow.phase === "detail"
            && purchaseFlow.offer ? (
              <ProductDetailDialog
                locale={locale}
                offer={purchaseFlow.offer}
                onPreview={previewFromDetails}
                onRequestClose={closeCoinsDialog}
                onRestoreFocus={restoreProductFocus}
              />
            ) : purchaseFlow.quote || purchaseFlow.order ? (
              <CoinsPurchaseDialog
                cancelling={purchaseFlow.cancelling}
                confirmDisabled={confirmationBlocked}
                errorCode={purchaseFlow.errorCode}
                locale={locale}
                onCancel={purchaseFlow.cancelPurchase}
                onConfirm={purchaseFlow.confirmPurchase}
                onOpenRecharge={openRechargeFromCoins}
                onRefresh={purchaseFlow.refreshOrder}
                onRequestClose={closeCoinsDialog}
                onRestoreFocus={restoreProductFocus}
                order={purchaseFlow.order}
                quote={purchaseFlow.quote}
                submitting={purchaseFlow.phase === "submitting"}
              />
            ) : null}
        </div>
      ) : null}
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
