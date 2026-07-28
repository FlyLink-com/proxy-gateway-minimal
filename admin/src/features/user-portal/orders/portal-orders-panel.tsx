import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode
} from "react";

import {
  PortalCoinCommerceClientError,
  type PortalCoinCommerceClient,
  type PortalCoinOrder
} from "../commerce";

export type PortalOrdersFilter =
  | "all"
  | "coins_consumption"
  | "coins_recharge"
  | "historical";

export type PortalOrdersPanelProps = {
  locale: "zh" | "en";
  commerceClient: PortalCoinCommerceClient | null;
  sessionRef: string | null;
  sessionGeneration: number;
  onSessionInvalid: () => void;
  renderHistoricalOrders: () => ReactNode;
};

const FILTERS: Array<{ id: PortalOrdersFilter; zh: string; en: string }> = [
  { id: "all", zh: "全部", en: "All" },
  { id: "coins_consumption", zh: "Coins 消费订单", en: "Coins Consumption Orders" },
  { id: "coins_recharge", zh: "Coins 充值订单", en: "Coins Recharge Orders" },
  { id: "historical", zh: "历史订单", en: "Historical Orders" }
];

type ReadState<T> =
  | { phase: "loading" }
  | { phase: "ready"; value: T }
  | { phase: "empty"; value: T }
  | { phase: "unavailable"; retryable: boolean; value?: T }
  | { phase: "error"; retryable: boolean; value?: T };

type Cursor = {
  afterCreatedAt: string;
  afterOrderRef: string;
};

type CurrentInputs = {
  alive: boolean;
  commerceClient: PortalCoinCommerceClient | null;
  sessionRef: string | null;
  sessionGeneration: number;
};

function copy(locale: PortalOrdersPanelProps["locale"], zh: string, en: string) {
  return locale === "zh" ? zh : en;
}

function stateValue<T>(state: ReadState<T>) {
  return "value" in state ? state.value : undefined;
}

export function PortalOrdersPanel({
  locale,
  commerceClient,
  sessionRef,
  sessionGeneration,
  onSessionInvalid,
  renderHistoricalOrders
}: PortalOrdersPanelProps) {
  const [filter, setFilter] = useState<PortalOrdersFilter>("all");
  const [listState, setListState] = useState<ReadState<PortalCoinOrder[]>>({
    phase: "loading"
  });
  const [nextCursor, setNextCursor] = useState<Cursor | null>(null);
  const [listRetryRequest, setListRetryRequest] = useState<{
    cursor: Cursor | null;
    append: boolean;
  }>({ cursor: null, append: false });
  const [detailState, setDetailState] = useState<ReadState<PortalCoinOrder>>({
    phase: "empty",
    value: null as never
  });
  const [selectedDetailRef, setSelectedDetailRef] = useState<string | null>(null);
  const currentRef = useRef<CurrentInputs | null>(null);
  const onSessionInvalidRef = useRef<(() => void) | null>(null);
  const listRequestRef = useRef(0);
  const detailRequestRef = useRef(0);
  const visibleOrderRefsRef = useRef(new Set<string>());
  const loadingCursorsRef = useRef(new Map<string, number>());
  const loadMoreRequestRef = useRef(0);
  const shows = (section: PortalOrdersFilter) => filter === "all" || filter === section;

  useEffect(() => {
    onSessionInvalidRef.current = onSessionInvalid;
  }, [onSessionInvalid]);

  useEffect(() => {
    const current: CurrentInputs = {
      alive: true,
      commerceClient,
      sessionRef,
      sessionGeneration
    };
    currentRef.current = current;
    setDetailState({ phase: "empty", value: null as never });
    setSelectedDetailRef(null);
    setNextCursor(null);
    setListRetryRequest({ cursor: null, append: false });
    visibleOrderRefsRef.current.clear();
    return () => {
      current.alive = false;
      listRequestRef.current += 1;
      detailRequestRef.current += 1;
      loadingCursorsRef.current.clear();
    };
  }, [commerceClient, sessionGeneration, sessionRef]);

  const listCurrent = useCallback((current: CurrentInputs, requestId: number) => (
    current.alive
    && currentRef.current === current
    && listRequestRef.current === requestId
    && current.commerceClient === commerceClient
    && current.sessionRef === sessionRef
    && current.sessionGeneration === sessionGeneration
  ), [commerceClient, sessionGeneration, sessionRef]);

  const detailCurrent = useCallback((current: CurrentInputs, requestId: number) => (
    current.alive
    && currentRef.current === current
    && detailRequestRef.current === requestId
    && current.commerceClient === commerceClient
    && current.sessionRef === sessionRef
    && current.sessionGeneration === sessionGeneration
  ), [commerceClient, sessionGeneration, sessionRef]);

  const applyListFailure = useCallback((error: unknown, current: CurrentInputs, requestId: number, append: boolean) => {
    if (!listCurrent(current, requestId)) return;
    const setFailure = (phase: "unavailable" | "error", retryable: boolean) => {
      setListState((previous) => {
        const value = append ? stateValue(previous) : undefined;
        return value === undefined
          ? { phase, retryable }
          : { phase, retryable, value };
      });
    };
    if (error instanceof PortalCoinCommerceClientError) {
      if (error.code === "commerce_session_invalid") {
        onSessionInvalidRef.current?.();
        return;
      }
      if (error.code === "commerce_unavailable") {
        setFailure("unavailable", true);
        return;
      }
      setFailure("error", error.retryable);
      return;
    }
    setFailure("error", true);
  }, [listCurrent]);

  const loadList = useCallback(async (cursor: Cursor | null, append: boolean) => {
    const current = currentRef.current;
    const requestId = listRequestRef.current + 1;
    listRequestRef.current = requestId;
    if (!current || !current.commerceClient || !current.sessionRef) {
      if (current && listCurrent(current, requestId)) {
        setListState({ phase: "unavailable", retryable: false });
        setNextCursor(null);
      }
      return;
    }
    if (listCurrent(current, requestId)) {
      setListRetryRequest({ cursor, append });
    }
    if (!append && listCurrent(current, requestId)) setListState({ phase: "loading" });
    try {
      const page = await current.commerceClient.listOrders(cursor
        ? { sessionRef: current.sessionRef, limit: 25, ...cursor }
        : { sessionRef: current.sessionRef, limit: 25 });
      if (!listCurrent(current, requestId)) return;
      const pageRefs = new Set(page.orders.map((order) => order.orderRef));
      if (pageRefs.size !== page.orders.length || (append && page.orders.some((order) => visibleOrderRefsRef.current.has(order.orderRef)))) {
        setListState((previous) => {
          const value = append ? stateValue(previous) : undefined;
          return value === undefined
            ? { phase: "error", retryable: true }
            : { phase: "error", retryable: true, value };
        });
        return;
      }
      if (append) {
        for (const order of page.orders) visibleOrderRefsRef.current.add(order.orderRef);
      } else {
        visibleOrderRefsRef.current = pageRefs;
      }
      setNextCursor(page.nextCursor);
      setListState((previous) => {
        const existing = append ? stateValue(previous) ?? [] : [];
        const orders = [...existing, ...page.orders];
        return orders.length === 0
          ? { phase: "empty", value: orders }
          : { phase: "ready", value: orders };
      });
    } catch (error) {
      applyListFailure(error, current, requestId, append);
    }
  }, [applyListFailure, listCurrent]);

  useEffect(() => {
    listRequestRef.current += 1;
    loadingCursorsRef.current.clear();
    visibleOrderRefsRef.current.clear();
    if (!shows("coins_consumption")) return;
    void loadList(null, false);
    return () => {
      listRequestRef.current += 1;
      loadingCursorsRef.current.clear();
      visibleOrderRefsRef.current.clear();
    };
  }, [filter, loadList]);

  const loadMore = useCallback(() => {
    if (!nextCursor) return;
    const cursorKey = `${nextCursor.afterCreatedAt}\u0000${nextCursor.afterOrderRef}`;
    if (loadingCursorsRef.current.has(cursorKey)) return;
    const current = currentRef.current;
    if (!current) return;
    const loadMoreRequestId = loadMoreRequestRef.current + 1;
    loadMoreRequestRef.current = loadMoreRequestId;
    loadingCursorsRef.current.set(cursorKey, loadMoreRequestId);
    void loadList(nextCursor, true).finally(() => {
      if (
        currentRef.current === current
        && loadingCursorsRef.current.get(cursorKey) === loadMoreRequestId
      ) {
        loadingCursorsRef.current.delete(cursorKey);
      }
    });
  }, [loadList, nextCursor]);

  const openDetail = useCallback(async (orderRef: string) => {
    setSelectedDetailRef(orderRef);
    const current = currentRef.current;
    const requestId = detailRequestRef.current + 1;
    detailRequestRef.current = requestId;
    if (!current || !current.commerceClient || !current.sessionRef) {
      if (current && detailCurrent(current, requestId)) {
        setDetailState({ phase: "unavailable", retryable: false });
      }
      return;
    }
    if (detailCurrent(current, requestId)) setDetailState({ phase: "loading" });
    try {
      const order = await current.commerceClient.getOrder({
        sessionRef: current.sessionRef,
        orderRef
      });
      if (!detailCurrent(current, requestId)) return;
      setDetailState({ phase: "ready", value: order });
    } catch (error) {
      if (!detailCurrent(current, requestId)) return;
      if (error instanceof PortalCoinCommerceClientError) {
        if (error.code === "commerce_session_invalid") {
          onSessionInvalidRef.current?.();
          return;
        }
        if (error.code === "commerce_unavailable") {
          setDetailState({ phase: "unavailable", retryable: true });
          return;
        }
        setDetailState({ phase: "error", retryable: error.retryable });
        return;
      }
      setDetailState({ phase: "error", retryable: true });
    }
  }, [detailCurrent]);

  const rows = stateValue(listState) ?? [];

  return (
    <section className="portal-orders-panel" aria-labelledby="portal-orders-heading">
      <h2 id="portal-orders-heading">{copy(locale, "订单", "Orders")}</h2>
      <div className="portal-orders-filters" role="tablist" aria-label={copy(locale, "订单分类", "Order categories")}>
        {FILTERS.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={filter === item.id}
            onClick={() => setFilter(item.id)}
          >
            {copy(locale, item.zh, item.en)}
          </button>
        ))}
      </div>
      {shows("coins_consumption") ? (
        <section className="portal-orders-section" aria-labelledby="portal-orders-consumption-heading">
          <h3 id="portal-orders-consumption-heading">{copy(locale, "Coins 消费订单", "Coins consumption orders")}</h3>
          {listState.phase === "loading" ? <p role="status">{copy(locale, "正在加载消费订单…", "Loading consumption orders…")}</p> : null}
          {listState.phase === "empty" ? <p role="status">{copy(locale, "暂无 Coins 消费订单。", "No Coins consumption orders.")}</p> : null}
          {listState.phase === "unavailable" || listState.phase === "error" ? (
            <div role={listState.phase === "error" ? "alert" : "status"}>
              <p>{listState.phase === "unavailable"
                ? copy(locale, "Coins 消费订单暂不可用。", "Coins consumption orders are unavailable.")
                : copy(locale, "Coins 消费订单加载失败。", "Coins consumption orders could not be loaded.")}</p>
              {listState.retryable ? <button type="button" onClick={() => listRetryRequest.append ? loadMore() : void loadList(listRetryRequest.cursor, false)}>{copy(locale, "重试消费订单", "Retry consumption orders")}</button> : null}
            </div>
          ) : null}
          {rows.length > 0 ? (
            <div className="portal-orders-list" aria-label={copy(locale, "Coins 消费订单列表", "Coins consumption order list")}>
              {rows.map((order) => (
                <button key={order.orderRef} type="button" aria-label={order.orderRef} onClick={() => void openDetail(order.orderRef)}>
                  <strong>{order.orderRef}</strong>
                  <span>{order.offer.title[locale]}</span>
                  <span>{order.paymentStatus}</span>
                  <span>{order.fulfillment.status}</span>
                </button>
              ))}
            </div>
          ) : null}
          {nextCursor && rows.length > 0 && (listState.phase === "ready" || listState.phase === "empty") ? <button type="button" onClick={loadMore}>{copy(locale, "加载更多消费订单", "Load more consumption orders")}</button> : null}
          {detailState.phase === "loading" ? <p role="status">{copy(locale, "正在加载订单详情…", "Loading order detail…")}</p> : null}
          {detailState.phase === "unavailable" || detailState.phase === "error" ? (
            <div role={detailState.phase === "error" ? "alert" : "status"}>
              <p>{detailState.phase === "unavailable"
                ? copy(locale, "订单详情暂不可用。", "Order detail is unavailable.")
                : copy(locale, "订单详情加载失败。", "Order detail could not be loaded.")}</p>
              {detailState.retryable && selectedDetailRef ? <button type="button" onClick={() => void openDetail(selectedDetailRef)}>{copy(locale, "重试订单详情", "Retry order detail")}</button> : null}
            </div>
          ) : null}
          {detailState.phase === "ready" ? (
            <section className="portal-orders-detail" aria-label={copy(locale, "Coins 消费订单详情", "Coins consumption order detail")}>
              <h4>{detailState.value.orderRef}</h4>
              <p>{copy(locale, "支付：", "Payment: ")}{detailState.value.paymentStatus}</p>
              <p>{copy(locale, "履约：", "Fulfillment: ")}{detailState.value.fulfillment.status}</p>
              <p>{copy(locale, "Coins：", "Coins: ")}{detailState.value.amountUnits}</p>
            </section>
          ) : null}
        </section>
      ) : null}
      {shows("coins_recharge") ? (
        <section className="portal-orders-section" aria-labelledby="portal-orders-recharge-heading">
          <h3 id="portal-orders-recharge-heading">{copy(locale, "Coins 充值订单", "Coins recharge orders")}</h3>
          <p>{copy(locale, "充值订单数据源尚未接入", "Recharge order data source is not connected yet")}</p>
        </section>
      ) : null}
      {shows("historical") ? (
        <section className="portal-orders-section" aria-labelledby="portal-orders-historical-heading">
          <h3 id="portal-orders-historical-heading">{copy(locale, "历史订单", "Historical orders")}</h3>
          {renderHistoricalOrders()}
        </section>
      ) : null}
    </section>
  );
}
