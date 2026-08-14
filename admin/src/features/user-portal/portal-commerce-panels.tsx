import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type MouseEvent
} from "react";
import { Circle, LoaderCircle } from "lucide-react";
import {
  CoinsPurchaseDialog,
  isPortalCoinOrderTerminal,
  PortalCoinCommerceClientError,
  ProductDetailDialog,
  useCoinsPurchaseFlow,
  type PortalCoinCommerceClientErrorCode,
  type PortalCoinCommerceClient,
  type PortalCommerceModel,
  type PortalCommerceModelClient,
  type PortalCoinOffer
} from "./commerce";
import type { PortalWalletFirstCommerceClient } from "./commerce";
import { portalCoinTypeListLabel } from "./portal-commerce-presentation";
import { WalletFirstMarketplacePanel } from "./wallet-first-marketplace-panel";

export type PortalCommerceLocale = "zh" | "en";

type PanelProps = {
  locale: PortalCommerceLocale;
};

function isChinese(locale: PortalCommerceLocale) {
  return locale === "zh";
}

type MarketplacePanelProps = PanelProps & {
  commerceClient: PortalCoinCommerceClient | null;
  commerceModelClient?: PortalCommerceModelClient | null;
  onWalletMutation?: () => void;
  sessionGeneration?: number;
  sessionRef: string | null;
  theme: "light" | "dark";
  walletFirstCommerceClient?: PortalWalletFirstCommerceClient | null;
};

type LegacyMarketplacePanelProps = Omit<
  MarketplacePanelProps,
  "commerceModelClient" | "walletFirstCommerceClient"
>;

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

function MarketplaceNoticeIndicator({
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
            <dt>{zh ? "价格" : "Price"}</dt>
            <dd>{offer.baseCoinUnits} Coins</dd>
          </div>
          <div>
            <dt>{zh ? "接受的 Coins" : "Accepted Coins"}</dt>
            <dd>{portalCoinTypeListLabel(offer.acceptedCoinTypes, locale)}</dd>
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

function LegacyMarketplacePanel({
  commerceClient,
  locale,
  onWalletMutation,
  sessionGeneration = 0,
  sessionRef,
  theme
}: LegacyMarketplacePanelProps) {
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
  const autoOpenedOrderRef = useRef<string | null>(null);
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
    if (purchaseFlow.order) {
      autoOpenedOrderRef.current = purchaseFlow.order.orderRef;
    }
    setDialogVisible(false);
    setProductIntent(null);
    if (
      !purchaseFlow.order
      || isPortalCoinOrderTerminal(purchaseFlow.order)
    ) {
      purchaseFlow.reset();
    }
  }, [purchaseFlow]);

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
    if (
      !activeOrderRef
      || autoOpenedOrderRef.current === activeOrderRef
    ) {
      return;
    }
    autoOpenedOrderRef.current = activeOrderRef;
    setDialogVisible(true);
  }, [activeOrderRef]);

  return (
    <section
      className="portal-commerce-layout portal-commerce-layout--marketplace"
      aria-label={zh ? "商城目录" : "Marketplace catalog"}
      aria-busy={catalog.status === "loading" || productBusy || undefined}
    >
      {catalog.status === "unavailable" ? (
        <div
          aria-live="polite"
          className="portal-marketplace-state"
          data-state="unavailable"
          role="status"
        >
          <MarketplaceNoticeIndicator state="unavailable" />
          <p>
            {zh
              ? "商城目录暂不可用；当前客户端未提供服务端商城能力。"
              : "The Marketplace catalog is unavailable because this client has no server Commerce capability."}
          </p>
        </div>
      ) : null}
      {catalog.status === "loading" ? (
        <div
          aria-live="polite"
          className="portal-marketplace-state"
          data-state="loading"
          role="status"
        >
          <MarketplaceNoticeIndicator state="loading" />
          <span>
            {zh ? "正在加载商城目录…" : "Loading Marketplace catalog…"}
          </span>
        </div>
      ) : null}
      {catalog.status === "error" ? (
        <div
          aria-live="assertive"
          className="portal-marketplace-state"
          data-state="error"
          role="alert"
        >
          <MarketplaceNoticeIndicator state="error" />
          <p>{safeCommerceErrorText(catalog.errorCode, locale)}</p>
          {catalog.retryable ? (
            <button type="button" onClick={retryCatalog}>
              {zh ? "重试" : "Retry"}
            </button>
          ) : null}
        </div>
      ) : null}
      {catalog.status === "ready" && catalog.offers.length === 0 ? (
        <div
          aria-live="polite"
          className="portal-marketplace-state"
          data-state="empty"
          role="status"
        >
          <MarketplaceNoticeIndicator state="empty" />
          <span>
            {zh ? "当前没有可用商品。" : "No products are currently available."}
          </span>
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
        <div
          aria-live="polite"
          className="portal-marketplace-flow-state"
          data-state="loading"
          role="status"
        >
          <MarketplaceNoticeIndicator state="loading" />
          <span>
            {purchaseFlow.phase === "loading_preview"
              ? zh
                ? "正在获取服务端报价…"
                : "Loading the server Quote…"
              : zh
                ? "正在加载商品详情…"
                : "Loading product details…"}
          </span>
        </div>
      ) : null}
      {purchaseFlow.errorCode
        && !purchaseFlow.quote
        && !purchaseFlow.order ? (
          <div
            aria-live="assertive"
            className="portal-marketplace-flow-state"
            data-state="error"
            role="alert"
          >
            <MarketplaceNoticeIndicator state="error" />
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

type MarketplaceModelState =
  | { status: "loading" }
  | { status: "ready"; model: PortalCommerceModel }
  | {
      status: "error";
      errorCode: PortalCoinCommerceClientErrorCode;
      retryable: boolean;
    };

function WalletFirstMarketplaceModelGate({
  commerceModelClient,
  walletFirstCommerceClient,
  ...legacyProps
}: LegacyMarketplacePanelProps & {
  commerceModelClient: PortalCommerceModelClient;
  walletFirstCommerceClient: PortalWalletFirstCommerceClient | null;
}) {
  const { locale, sessionGeneration = 0, sessionRef } = legacyProps;
  const zh = isChinese(locale);
  const generationRef = useRef(0);
  const [revision, setRevision] = useState(0);
  const [model, setModel] = useState<MarketplaceModelState>(() => (
    sessionRef ? { status: "loading" } : {
      status: "error",
      errorCode: "commerce_unavailable",
      retryable: true
    }
  ));

  useEffect(() => {
    const generation = generationRef.current + 1;
    generationRef.current = generation;
    if (!sessionRef) {
      setModel({
        status: "error",
        errorCode: "commerce_unavailable",
        retryable: true
      });
      return () => {
        generationRef.current += 1;
      };
    }
    setModel({ status: "loading" });
    void commerceModelClient.getCommerceModel({ sessionRef }).then((nextModel) => {
      if (generation !== generationRef.current) return;
      setModel({ status: "ready", model: nextModel });
    }).catch((error: unknown) => {
      if (generation !== generationRef.current) return;
      setModel({ status: "error", ...safeCommerceFailure(error) });
    });
    return () => {
      generationRef.current += 1;
    };
  }, [commerceModelClient, revision, sessionGeneration, sessionRef]);

  if (model.status === "ready" && model.model === "legacy") {
    return <LegacyMarketplacePanel {...legacyProps} />;
  }
  if (model.status === "ready" && model.model === "wallet_first_unique_v1") {
    return (
      <WalletFirstMarketplacePanel
        commerceClient={walletFirstCommerceClient}
        locale={locale}
        onWalletMutation={legacyProps.onWalletMutation}
        sessionGeneration={sessionGeneration}
        sessionRef={sessionRef}
        theme={legacyProps.theme}
      />
    );
  }
  return (
    <section
      aria-busy={model.status === "loading" || undefined}
      aria-label={zh ? "商城目录" : "Marketplace catalog"}
      className="portal-commerce-layout portal-commerce-layout--marketplace"
      data-commerce-model="pending"
    >
      <div
        aria-live={model.status === "loading" ? "polite" : "assertive"}
        className="portal-marketplace-state"
        data-state={model.status}
        role={model.status === "loading" ? "status" : "alert"}
      >
        <MarketplaceNoticeIndicator
          state={model.status === "loading" ? "loading" : "error"}
        />
        <p>
          {model.status === "loading"
            ? (zh ? "正在确认账户的服务结算方式…" : "Confirming the account service-settlement model…")
            : model.status === "error"
              ? safeCommerceErrorText(model.errorCode, locale)
              : (zh ? "商城结算方式不可用。" : "The Marketplace settlement model is unavailable.")}
        </p>
        {model.status === "error" && model.retryable ? (
          <button type="button" onClick={() => setRevision((current) => current + 1)}>
            {zh ? "重试" : "Retry"}
          </button>
        ) : null}
      </div>
    </section>
  );
}

/**
 * The model is never a browser input.  The HTTP Portal client projects it
 * from the authenticated server session, then this gate mounts one isolated
 * route family.  Existing callers without a model capability retain the old
 * local/test-only legacy surface unchanged.
 */
export function MarketplacePanel({
  commerceModelClient = null,
  walletFirstCommerceClient = null,
  ...legacyProps
}: MarketplacePanelProps) {
  if (!commerceModelClient) {
    return <LegacyMarketplacePanel {...legacyProps} />;
  }
  return (
    <WalletFirstMarketplaceModelGate
      {...legacyProps}
      commerceModelClient={commerceModelClient}
      walletFirstCommerceClient={walletFirstCommerceClient}
    />
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
