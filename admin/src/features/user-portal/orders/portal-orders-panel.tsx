import {
  Fragment,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState
} from "react";
import { Search } from "lucide-react";

import {
  PortalCoinCommerceClientError,
  type PortalCoinCommerceClient,
  type PortalCoinOrder
} from "../commerce";
import { portalCoinTypeLabel } from "../portal-commerce-presentation";
import type { PortalPaymentOrder } from "../user-portal-client";
import { useDesktopScrollRegion } from "../use-desktop-scroll-region";
import {
  buildPortalOrderCenterItems,
  type PortalOrderCenterItem,
  type PortalOrderCenterStatus,
  type PortalServiceOrder
} from "./portal-order-center-model";

export type PortalOrdersFilter = "all" | "coins_consumption" | "plans_services";

export type PortalOrdersPanelProps = {
  locale: "zh" | "en";
  commerceClient: PortalCoinCommerceClient | null;
  sessionRef: string | null;
  sessionGeneration: number;
  onSessionInvalid: () => void;
  legacyPaymentOrders: PortalPaymentOrder[];
  serviceOrders: PortalServiceOrder[];
  selectedServiceOrderRef: string | null;
  orderSearch: string;
  onOrderSearchChange: (value: string) => void;
  onOpenServiceOrder: (order: PortalServiceOrder) => void;
  onOpenMarketplace: () => void;
};

const FILTERS: Array<{ id: PortalOrdersFilter; zh: string; en: string }> = [
  { id: "all", zh: "全部", en: "All" },
  { id: "coins_consumption", zh: "商城消费", en: "Marketplace purchases" },
  { id: "plans_services", zh: "套餐与服务", en: "Plans and services" }
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

export type PortalOrdersIdentity = {
  commerceClient: PortalCoinCommerceClient | null;
  sessionRef: string | null;
  sessionGeneration: number;
};

type CurrentInputs = PortalOrdersIdentity & {
  alive: boolean;
};

function copy(locale: PortalOrdersPanelProps["locale"], zh: string, en: string) {
  return locale === "zh" ? zh : en;
}

function stateValue<T>(state: ReadState<T>) {
  return "value" in state ? state.value : undefined;
}

function formatDateTime(value: string, locale: PortalOrdersPanelProps["locale"]) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(locale === "en" ? "en-US" : "zh-CN", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(date);
}

function formatBytes(value: number) {
  let amount = Number.isFinite(value) && value > 0 ? value : 0;
  const units = ["B", "KB", "MB", "GB", "TB"];
  let unit = 0;
  while (amount >= 1024 && unit < units.length - 1) {
    amount /= 1024;
    unit += 1;
  }
  return `${amount >= 10 || unit === 0 ? amount.toFixed(0) : amount.toFixed(1)} ${units[unit]}`;
}

function paymentAmount(order: PortalPaymentOrder) {
  const amount = Number.isFinite(order.amountMinor) ? order.amountMinor / 100 : 0;
  return `${order.currency} ${amount.toFixed(2)}`;
}

function paymentStatusLabel(
  status: PortalPaymentOrder["status"],
  locale: PortalOrdersPanelProps["locale"]
) {
  switch (status) {
    case "pending_payment":
      return copy(locale, "待付款", "Pending payment");
    case "payment_amount_mismatch":
      return copy(locale, "金额异常", "Amount mismatch");
    case "payment_failed":
      return copy(locale, "支付失败", "Payment failed");
    case "paid_pending_admin_review":
      return copy(locale, "待开通", "Pending activation");
    case "paid_access_delivered":
      return copy(locale, "已开通", "Activated");
    case "paid_delivery_blocked":
      return copy(locale, "开通异常", "Activation issue");
    default:
      return copy(locale, "需要处理", "Needs attention");
  }
}

function coinPaymentLabel(
  status: PortalCoinOrder["paymentStatus"],
  locale: PortalOrdersPanelProps["locale"]
) {
  switch (status) {
    case "held":
      return copy(locale, "Coins 已预留", "Coins reserved");
    case "capture_pending":
      return copy(locale, "支付确认中", "Payment processing");
    case "captured":
      return copy(locale, "支付完成", "Payment complete");
    case "cancelled":
      return copy(locale, "已取消", "Cancelled");
    case "capture_failed":
      return copy(locale, "支付失败", "Payment failed");
    case "reconciliation_required":
      return copy(locale, "需要人工核对", "Review required");
    default:
      return copy(locale, "需要处理", "Needs attention");
  }
}

function fulfillmentLabel(
  status: PortalCoinOrder["fulfillment"]["status"],
  locale: PortalOrdersPanelProps["locale"]
) {
  switch (status) {
    case "not_requested":
      return copy(locale, "等待交付", "Awaiting delivery");
    case "pending":
    case "processing":
      return copy(locale, "交付中", "Delivering");
    case "delivered":
      return copy(locale, "已交付", "Delivered");
    case "failed":
      return copy(locale, "交付异常", "Delivery issue");
    default:
      return copy(locale, "需要处理", "Needs attention");
  }
}

function serviceStatusLabel(
  status: PortalServiceOrder["status"],
  locale: PortalOrdersPanelProps["locale"]
) {
  switch (status) {
    case "active":
      return copy(locale, "生效中", "Active");
    case "pending":
      return copy(locale, "待开通", "Pending");
    case "expired":
      return copy(locale, "已过期", "Expired");
    case "disabled":
      return copy(locale, "已停用", "Disabled");
  }
}

function centerStatusLabel(
  status: PortalOrderCenterStatus,
  locale: PortalOrdersPanelProps["locale"]
) {
  switch (status) {
    case "in_progress":
      return copy(locale, "处理中", "In progress");
    case "successful":
      return copy(locale, "已完成", "Completed");
    case "attention":
      return copy(locale, "需要处理", "Needs attention");
    case "closed":
      return copy(locale, "已关闭", "Closed");
  }
}

function itemTypeLabel(
  item: PortalOrderCenterItem,
  locale: PortalOrdersPanelProps["locale"]
) {
  if (item.kind === "coins_consumption") return copy(locale, "商城消费", "Marketplace purchase");
  if (item.kind === "legacy_payment") return copy(locale, "套餐付款", "Plan payment");
  return copy(locale, "服务记录", "Service record");
}

function serviceProductLabel(
  order: PortalServiceOrder,
  locale: PortalOrdersPanelProps["locale"]
) {
  const historyLabel = order.request.historySummary?.[0]?.label;
  if (historyLabel) return historyLabel;
  if (order.planId === "trial") return copy(locale, "试用套餐", "Trial plan");
  if (order.planId === "yearly") return copy(locale, "年付套餐", "Annual plan");
  return copy(locale, "基础月付", "Monthly basic");
}

function legacyPaymentProductLabel(
  order: PortalPaymentOrder,
  locale: PortalOrdersPanelProps["locale"]
) {
  if (locale === "zh") {
    const explicitLabel = order.planLabel?.trim();
    if (explicitLabel) return explicitLabel;
  }
  if (order.planId === "yearly") return copy(locale, "年度套餐", "Annual plan");
  if (order.planId === "monthly_plus") return copy(locale, "标准月付", "Standard monthly");
  if (order.planId === "trial") return copy(locale, "7 天订阅", "7-day plan");
  return copy(locale, "基础月付", "Basic monthly");
}

function productLabel(item: PortalOrderCenterItem, locale: PortalOrdersPanelProps["locale"]) {
  if (item.kind === "coins_consumption") return item.source.offer.title[locale];
  if (item.kind === "legacy_payment") return legacyPaymentProductLabel(item.source, locale);
  return serviceProductLabel(item.source, locale);
}

function amountLabel(item: PortalOrderCenterItem) {
  if (item.kind === "coins_consumption") return `${item.source.amountUnits} Coins`;
  if (item.kind === "legacy_payment") return paymentAmount(item.source);
  return "—";
}

function displayOrderRef(item: PortalOrderCenterItem) {
  if (item.kind === "coins_consumption") return item.source.orderRef;
  if (item.kind === "legacy_payment") {
    return item.source.orderRef.replace(/^pay[_-]?/i, "P-").slice(0, 18);
  }
  return item.source.requestRef.replace(/^subreq[_-]?/i, "O-").slice(0, 18);
}

function accessibleOrderRef(item: PortalOrderCenterItem) {
  if (item.kind === "coins_consumption") return item.source.orderRef;
  if (item.kind === "legacy_payment") return item.source.orderRef;
  return item.source.requestRef;
}

function orderDetailId(item: PortalOrderCenterItem) {
  return `portal-order-detail-${item.key.replace(/[^a-zA-Z0-9_-]/g, "-")}`;
}

function orderDetailLabel(
  item: PortalOrderCenterItem,
  locale: PortalOrdersPanelProps["locale"]
) {
  if (item.kind === "coins_consumption") {
    return copy(
      locale,
      "Coins 消费订单详情",
      "Coins consumption order detail"
    );
  }
  return copy(
    locale,
    `${itemTypeLabel(item, locale)}详情：${displayOrderRef(item)}`,
    `${itemTypeLabel(item, locale)} details: ${displayOrderRef(item)}`
  );
}

function itemStatusLabel(
  item: PortalOrderCenterItem,
  locale: PortalOrdersPanelProps["locale"]
) {
  if (item.kind === "coins_consumption") {
    return `${coinPaymentLabel(item.source.paymentStatus, locale)} · ${fulfillmentLabel(item.source.fulfillment.status, locale)}`;
  }
  if (item.kind === "legacy_payment") return paymentStatusLabel(item.source.status, locale);
  return serviceStatusLabel(item.source.status, locale);
}

function itemSearchText(item: PortalOrderCenterItem, locale: PortalOrdersPanelProps["locale"]) {
  return [
    item.key,
    itemTypeLabel(item, locale),
    productLabel(item, locale),
    amountLabel(item),
    itemStatusLabel(item, locale),
    centerStatusLabel(item.status, locale)
  ].join(" ").toLowerCase();
}

function clientLabel(client: PortalServiceOrder["clientTarget"]) {
  if (client === "karing") return "Clash / Mihomo";
  if (client === "clash") return "Clash";
  return client;
}

function allocationLabel(
  allocation: PortalCoinOrder["allocation"],
  locale: PortalOrdersPanelProps["locale"]
) {
  return allocation
    .map((entry) => (
      `${portalCoinTypeLabel(entry.coinType, locale)} ${entry.amountUnits}`
    ))
    .join(" + ");
}

export function portalOrdersIdentityMatches(
  left: PortalOrdersIdentity,
  right: PortalOrdersIdentity
) {
  return left.commerceClient === right.commerceClient
    && left.sessionRef === right.sessionRef
    && left.sessionGeneration === right.sessionGeneration;
}

export function PortalOrdersPanel({
  locale,
  commerceClient,
  sessionRef,
  sessionGeneration,
  onSessionInvalid,
  legacyPaymentOrders = [],
  serviceOrders = [],
  selectedServiceOrderRef = null,
  orderSearch = "",
  onOrderSearchChange = () => undefined,
  onOpenServiceOrder = () => undefined,
  onOpenMarketplace = () => undefined
}: PortalOrdersPanelProps) {
  const desktopScrollRegion = useDesktopScrollRegion();
  const allFilterButtonRef = useRef<HTMLButtonElement | null>(null);
  const toolbarMarketplaceButtonRef = useRef<HTMLButtonElement | null>(null);
  const emptyActionButtonRef = useRef<HTMLButtonElement | null>(null);
  const emptyActionFocusedRef = useRef(false);
  const [filter, setFilter] = useState<PortalOrdersFilter>("all");
  const [statusFilter, setStatusFilter] = useState<"all" | PortalOrderCenterStatus>("all");
  const [sort, setSort] = useState<"newest" | "oldest">("newest");
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
  const [selectedLegacyDetailRef, setSelectedLegacyDetailRef] =
    useState<string | null>(null);
  const [selectedServiceDetailRef, setSelectedServiceDetailRef] =
    useState<string | null>(selectedServiceOrderRef);
  const initialIdentity = { commerceClient, sessionRef, sessionGeneration };
  const [listIdentity, setListIdentity] = useState<PortalOrdersIdentity>(initialIdentity);
  const [detailIdentity, setDetailIdentity] = useState<PortalOrdersIdentity>(initialIdentity);
  const currentRef = useRef<CurrentInputs | null>(null);
  const onSessionInvalidRef = useRef<(() => void) | null>(null);
  const listRequestRef = useRef(0);
  const detailRequestRef = useRef(0);
  const visibleOrderRefsRef = useRef(new Set<string>());
  const loadingCursorsRef = useRef(new Map<string, number>());
  const loadMoreRequestRef = useRef(0);
  const showsCoins = filter === "all" || filter === "coins_consumption";

  useLayoutEffect(() => {
    onSessionInvalidRef.current = onSessionInvalid;
  }, [onSessionInvalid]);

  useLayoutEffect(() => {
    const current: CurrentInputs = {
      alive: true,
      commerceClient,
      sessionRef,
      sessionGeneration
    };
    currentRef.current = current;
    setListIdentity(current);
    setDetailIdentity(current);
    setListState({ phase: "loading" });
    setDetailState({ phase: "empty", value: null as never });
    setSelectedDetailRef(null);
    setSelectedLegacyDetailRef(null);
    setSelectedServiceDetailRef(null);
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

  useLayoutEffect(() => {
    setSelectedServiceDetailRef(selectedServiceOrderRef);
  }, [selectedServiceOrderRef]);

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
      setListIdentity(current);
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
    if (!showsCoins) return;
    void loadList(null, false);
    return () => {
      listRequestRef.current += 1;
      loadingCursorsRef.current.clear();
      visibleOrderRefsRef.current.clear();
    };
  }, [loadList, showsCoins]);

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
    setSelectedLegacyDetailRef(null);
    setSelectedServiceDetailRef(null);
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
    setDetailIdentity(current);
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

  const invalidateCoinDetail = useCallback(() => {
    detailRequestRef.current += 1;
    setSelectedDetailRef(null);
    setDetailState({ phase: "empty", value: null as never });
  }, []);

  const toggleCoinDetail = useCallback((orderRef: string) => {
    if (selectedDetailRef === orderRef) {
      invalidateCoinDetail();
      return;
    }
    void openDetail(orderRef);
  }, [invalidateCoinDetail, openDetail, selectedDetailRef]);

  const renderedIdentity = { commerceClient, sessionRef, sessionGeneration };
  const visibleListState = portalOrdersIdentityMatches(listIdentity, renderedIdentity)
    ? listState
    : { phase: "loading" as const };
  const visibleDetailState = portalOrdersIdentityMatches(detailIdentity, renderedIdentity)
    ? detailState
    : { phase: "empty" as const, value: null as never };
  const coinOrders = stateValue(visibleListState) ?? [];
  const allItems = useMemo(() => buildPortalOrderCenterItems({
    coinOrders,
    legacyPaymentOrders,
    serviceOrders
  }), [coinOrders, legacyPaymentOrders, serviceOrders]);
  const visibleItems = useMemo(() => {
    const search = orderSearch.trim().toLowerCase();
    const filtered = allItems.filter((item) => {
      const matchesType = filter === "all"
        || (filter === "coins_consumption" && item.kind === "coins_consumption")
        || (filter === "plans_services" && item.kind !== "coins_consumption");
      const matchesStatus = statusFilter === "all" || item.status === statusFilter;
      return matchesType && matchesStatus && (!search || itemSearchText(item, locale).includes(search));
    });
    return sort === "newest" ? filtered : [...filtered].reverse();
  }, [allItems, filter, locale, orderSearch, sort, statusFilter]);
  const coinSourceFailed = showsCoins
    && (visibleListState.phase === "unavailable" || visibleListState.phase === "error");
  const showEmptyState = visibleItems.length === 0
    && !(showsCoins && (
      visibleListState.phase === "loading"
      || visibleListState.phase === "unavailable"
      || visibleListState.phase === "error"
    ));
  const hasActiveFilters = filter !== "all"
    || statusFilter !== "all"
    || orderSearch.trim().length > 0;
  const useContextualEmptyState = desktopScrollRegion && showEmptyState;
  const clearFilters = () => {
    setFilter("all");
    setStatusFilter("all");
    onOrderSearchChange("");
    allFilterButtonRef.current?.focus();
  };
  useLayoutEffect(() => {
    if (
      useContextualEmptyState
      && document.activeElement === toolbarMarketplaceButtonRef.current
    ) {
      emptyActionButtonRef.current?.focus();
    } else if (!useContextualEmptyState && emptyActionFocusedRef.current) {
      emptyActionFocusedRef.current = false;
      toolbarMarketplaceButtonRef.current?.focus();
    }
  }, [useContextualEmptyState]);
  const selectedDetailKey = selectedDetailRef
    ? `coins_consumption:${selectedDetailRef}`
    : selectedLegacyDetailRef
      ? `legacy_payment:${selectedLegacyDetailRef}`
      : selectedServiceDetailRef
        ? `service_access:${selectedServiceDetailRef}`
        : null;

  const detailContent = (item: PortalOrderCenterItem) => {
    if (item.kind === "coins_consumption") {
      if (visibleDetailState.phase === "loading") {
        return <p role="status">{copy(locale, "正在加载订单详情…", "Loading order detail…")}</p>;
      }
      if (visibleDetailState.phase === "unavailable" || visibleDetailState.phase === "error") {
        return (
          <div role={visibleDetailState.phase === "error" ? "alert" : "status"}>
            <p>{visibleDetailState.phase === "unavailable"
              ? copy(locale, "订单详情暂不可用。", "Order detail is unavailable.")
              : copy(locale, "订单详情加载失败。", "Order detail could not be loaded.")}</p>
            {visibleDetailState.retryable && selectedDetailRef ? (
              <button type="button" onClick={() => void openDetail(selectedDetailRef)}>
                {copy(locale, "重试订单详情", "Retry order detail")}
              </button>
            ) : null}
          </div>
        );
      }
      if (visibleDetailState.phase !== "ready") return null;
      const order = visibleDetailState.value;
      return (
        <>
          <div className="portal-order-detail-grid">
            <div><span>{copy(locale, "金额", "Amount")}</span><strong>{order.amountUnits} Coins</strong></div>
            <div><span>{copy(locale, "支付", "Payment")}</span><strong>{coinPaymentLabel(order.paymentStatus, locale)}</strong></div>
            <div><span>{copy(locale, "履约", "Fulfillment")}</span><strong>{fulfillmentLabel(order.fulfillment.status, locale)}</strong></div>
            <div><span>{copy(locale, "Coins 分配", "Coins allocation")}</span><strong>{allocationLabel(order.allocation, locale)}</strong></div>
          </div>
        </>
      );
    }
    if (item.kind === "legacy_payment") {
      const order = item.source;
      return (
        <div className="portal-order-detail-grid">
          <div><span>{copy(locale, "金额", "Amount")}</span><strong>{paymentAmount(order)}</strong></div>
          <div><span>{copy(locale, "支付状态", "Payment status")}</span><strong>{paymentStatusLabel(order.status, locale)}</strong></div>
          <div><span>{copy(locale, "创建时间", "Created")}</span><strong>{formatDateTime(order.createdAt, locale)}</strong></div>
          <div><span>{copy(locale, "付款时间", "Paid")}</span><strong>{order.paidAt ? formatDateTime(order.paidAt, locale) : "—"}</strong></div>
        </div>
      );
    }
    const order = item.source;
    const usage = order.request.usage;
    return (
      <div className="portal-order-detail-grid">
        <div><span>{copy(locale, "套餐", "Plan")}</span><strong>{serviceProductLabel(order, locale)}</strong></div>
        <div><span>{copy(locale, "客户端", "Client")}</span><strong>{clientLabel(order.clientTarget)}</strong></div>
        <div><span>{copy(locale, "额度 / 用量", "Quota / usage")}</span><strong>{usage ? `${formatBytes(usage.usedBytes)} / ${formatBytes(usage.totalBytes)}` : "—"}</strong></div>
        <div><span>{copy(locale, "状态", "Lifecycle")}</span><strong>{serviceStatusLabel(order.status, locale)}</strong></div>
        <div><span>{copy(locale, "到期时间", "Expires")}</span><strong>{formatDateTime(order.expiresAt, locale)}</strong></div>
      </div>
    );
  };

  return (
    <section className="portal-orders-panel" aria-label={copy(locale, "订单记录", "Order records")}>
      <div className="portal-orders-filters" role="group" aria-label={copy(locale, "订单类型", "Order type")}>
        {FILTERS.map((item) => (
          <button
            key={item.id}
            ref={item.id === "all" ? allFilterButtonRef : undefined}
            type="button"
            aria-pressed={filter === item.id}
            onClick={() => setFilter(item.id)}
          >
            {copy(locale, item.zh, item.en)}
          </button>
        ))}
      </div>

      <div className="portal-order-toolbar">
        <label className="portal-order-search-control">
          <span>{copy(locale, "搜索订单", "Search orders")}</span>
          <span
            className="portal-order-search-field"
            data-state={orderSearch.length === 0 ? "empty" : "filled"}
          >
            <Search aria-hidden="true" />
            <input
              className="portal-order-search-input"
              value={orderSearch}
              onChange={(event) => onOrderSearchChange(event.target.value)}
              placeholder={copy(locale, "订单 / 商品或服务 / 状态", "Order / product or service / status")}
            />
          </span>
        </label>
        <label>
          <span>{copy(locale, "状态", "Status")}</span>
          <select
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value as "all" | PortalOrderCenterStatus)}
          >
            <option value="all">{copy(locale, "全部状态", "All statuses")}</option>
            <option value="in_progress">{copy(locale, "处理中", "In progress")}</option>
            <option value="successful">{copy(locale, "已完成", "Completed")}</option>
            <option value="attention">{copy(locale, "需要处理", "Needs attention")}</option>
            <option value="closed">{copy(locale, "已关闭", "Closed")}</option>
          </select>
        </label>
        <label>
          <span>{copy(locale, "排序", "Sort")}</span>
          <select value={sort} onChange={(event) => setSort(event.target.value as "newest" | "oldest")}>
            <option value="newest">{copy(locale, "最新创建", "Newest")}</option>
            <option value="oldest">{copy(locale, "最早创建", "Oldest")}</option>
          </select>
        </label>
        <button
          aria-hidden={useContextualEmptyState ? "true" : undefined}
          className="portal-primary-button compact portal-toolbar-create"
          data-empty-hidden={useContextualEmptyState ? "true" : undefined}
          ref={toolbarMarketplaceButtonRef}
          tabIndex={useContextualEmptyState ? -1 : undefined}
          type="button"
          onClick={onOpenMarketplace}
        >
          {copy(locale, "前往商城", "Go to Marketplace")}
        </button>
      </div>

      {visibleListState.phase === "loading" && showsCoins ? (
        <p className="portal-orders-inline-note" role="status">{copy(locale, "正在加载商城订单…", "Loading Marketplace orders…")}</p>
      ) : null}
      {coinSourceFailed ? (
        <div className="portal-orders-inline-note" role={visibleListState.phase === "error" ? "alert" : "status"}>
          <span>{copy(locale, "部分商城订单暂不可用", "Some Marketplace orders are temporarily unavailable")}</span>
          {visibleListState.retryable ? (
            <button type="button" onClick={() => listRetryRequest.append ? loadMore() : void loadList(listRetryRequest.cursor, false)}>
              {copy(locale, "重试消费订单", "Retry consumption orders")}
            </button>
          ) : null}
        </div>
      ) : null}
      <div
        aria-label={desktopScrollRegion && !showEmptyState
          ? copy(locale, "可滚动订单表格", "Scrollable orders table")
          : undefined}
        className="portal-order-table-wrap"
        data-empty={useContextualEmptyState ? "true" : undefined}
        role={desktopScrollRegion && !showEmptyState ? "region" : undefined}
        tabIndex={desktopScrollRegion && !showEmptyState ? 0 : undefined}
      >
        <table className="portal-order-table" aria-label={copy(locale, "订单列表", "Orders")}>
          <thead>
            <tr>
              <th scope="col">{copy(locale, "订单", "Order")}</th>
              <th scope="col">{copy(locale, "类型", "Type")}</th>
              <th scope="col">{copy(locale, "商品或服务", "Product or service")}</th>
              <th scope="col">{copy(locale, "金额", "Amount")}</th>
              <th scope="col">{copy(locale, "状态", "Status")}</th>
              <th scope="col">{copy(locale, "创建时间", "Created")}</th>
              <th scope="col">{copy(locale, "操作", "Actions")}</th>
            </tr>
          </thead>
          <tbody>
            {showEmptyState ? (
              <tr>
                <td colSpan={7} className="portal-order-empty-state">
                  {desktopScrollRegion ? (
                    <div className="portal-order-empty-content">
                      <strong>
                        {hasActiveFilters
                          ? copy(locale, "暂无符合条件的订单", "No matching orders")
                          : copy(locale, "暂无订单", "No orders yet")}
                      </strong>
                      <span>
                        {hasActiveFilters
                          ? copy(locale, "调整筛选条件，或清除筛选查看全部订单。", "Adjust the filters, or clear them to see all orders.")
                          : copy(locale, "商城购买和服务记录会在这里统一显示。", "Marketplace purchases and service records appear here.")}
                      </span>
                      {hasActiveFilters ? (
                        <button
                          className="portal-secondary-button compact"
                          ref={emptyActionButtonRef}
                          type="button"
                          onBlur={() => {
                            emptyActionFocusedRef.current = false;
                          }}
                          onClick={clearFilters}
                          onFocus={() => {
                            emptyActionFocusedRef.current = true;
                          }}
                        >
                          {copy(locale, "清除筛选", "Clear filters")}
                        </button>
                      ) : (
                        <button
                          className="portal-primary-button compact"
                          ref={emptyActionButtonRef}
                          type="button"
                          onBlur={() => {
                            emptyActionFocusedRef.current = false;
                          }}
                          onClick={onOpenMarketplace}
                          onFocus={() => {
                            emptyActionFocusedRef.current = true;
                          }}
                        >
                          {copy(locale, "前往商城", "Go to Marketplace")}
                        </button>
                      )}
                    </div>
                  ) : filter !== "plans_services" && visibleListState.phase === "empty"
                    ? copy(locale, "暂无 Coins 消费订单。", "No Coins consumption orders.")
                    : copy(locale, "暂无符合条件的订单", "No matching orders")}
                </td>
              </tr>
            ) : visibleItems.map((item) => {
              const actionLabel = copy(locale, "查看", "View");
              const action = item.kind === "coins_consumption"
                ? () => toggleCoinDetail(item.source.orderRef)
                : item.kind === "legacy_payment"
                  ? () => {
                    invalidateCoinDetail();
                    setSelectedServiceDetailRef(null);
                    setSelectedLegacyDetailRef((current) => (
                      current === item.source.orderRef ? null : item.source.orderRef
                    ));
                  }
                  : () => {
                    const opening = selectedServiceDetailRef
                      !== item.source.requestRef;
                    invalidateCoinDetail();
                    setSelectedLegacyDetailRef(null);
                    setSelectedServiceDetailRef(
                      opening ? item.source.requestRef : null
                    );
                    if (opening) onOpenServiceOrder(item.source);
                  };
              const expanded = selectedDetailKey === item.key;
              const detailId = orderDetailId(item);
              const accessibleActionLabel = [
                actionLabel,
                accessibleOrderRef(item),
                productLabel(item, locale),
                itemStatusLabel(item, locale)
              ].join(locale === "zh" ? "：" : ": ");
              return (
                <Fragment key={item.key}>
                  <tr className={expanded ? "selected" : undefined}>
                    <td data-label={copy(locale, "订单", "Order")}>
                      <span className="portal-order-main-text">{displayOrderRef(item)}</span>
                    </td>
                    <td data-label={copy(locale, "类型", "Type")}>{itemTypeLabel(item, locale)}</td>
                    <td data-label={copy(locale, "商品或服务", "Product or service")}>{productLabel(item, locale)}</td>
                    <td data-label={copy(locale, "金额", "Amount")}>{amountLabel(item)}</td>
                    <td data-label={copy(locale, "状态", "Status")}>
                      <span className={`portal-order-status ${item.status}`}>{itemStatusLabel(item, locale)}</span>
                    </td>
                    <td data-label={copy(locale, "创建时间", "Created")}>
                      <time dateTime={item.createdAt}>
                        {formatDateTime(item.createdAt, locale)}
                      </time>
                    </td>
                    <td data-label={copy(locale, "操作", "Actions")}>
                      <div className="portal-order-actions">
                        <button
                          type="button"
                          onClick={action}
                          aria-controls={expanded ? detailId : undefined}
                          aria-expanded={expanded}
                          aria-label={accessibleActionLabel}
                        >
                          {actionLabel}
                        </button>
                      </div>
                    </td>
                  </tr>
                  {expanded ? (
                    <tr className="portal-order-detail-row">
                      <td colSpan={7}>
                        <div
                          aria-label={orderDetailLabel(item, locale)}
                          className="portal-order-detail"
                          id={detailId}
                          role="region"
                        >
                          <p className="portal-order-detail__title">
                            {productLabel(item, locale)} · {displayOrderRef(item)}
                          </p>
                          {detailContent(item)}
                        </div>
                      </td>
                    </tr>
                  ) : null}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
      {nextCursor && coinOrders.length > 0 && showsCoins && (visibleListState.phase === "ready" || visibleListState.phase === "empty") ? (
        <button
          className="portal-orders-load-more"
          type="button"
          onClick={loadMore}
        >
          {copy(locale, "加载更多消费订单", "Load more consumption orders")}
        </button>
      ) : null}
    </section>
  );
}
