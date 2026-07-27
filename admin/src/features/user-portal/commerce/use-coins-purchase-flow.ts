import { useCallback, useEffect, useRef, useState } from "react";
import type {
  PortalCoinCommerceClient,
  PortalCoinCommerceClientErrorCode,
  PortalCoinOffer,
  PortalCoinOrder,
  PortalCoinQuote
} from "./api-contract";
import { PortalCoinCommerceClientError } from "./commerce-client";

export type CoinsPurchasePhase =
  | "idle"
  | "loading_detail"
  | "detail"
  | "loading_preview"
  | "quote"
  | "submitting"
  | "order"
  | "error";

type CoinsPurchaseState = {
  phase: CoinsPurchasePhase;
  offer: PortalCoinOffer | null;
  quote: PortalCoinQuote | null;
  order: PortalCoinOrder | null;
  cancelling: boolean;
  errorCode: PortalCoinCommerceClientErrorCode | null;
  errorRetryable: boolean;
};

const INITIAL_STATE: CoinsPurchaseState = {
  phase: "idle",
  offer: null,
  quote: null,
  order: null,
  cancelling: false,
  errorCode: null,
  errorRetryable: false
};

export const PORTAL_COIN_ORDER_STORAGE_KEY =
  "portal-coins-active-order-v1";

export type PortalCoinOrderStorage = Pick<
  Storage,
  "getItem" | "removeItem" | "setItem"
>;

const COMMERCE_REFERENCE = /^[a-z][a-z0-9_]{2,95}$/;

function browserSessionStorage(): PortalCoinOrderStorage | null {
  try {
    return typeof window === "undefined" ? null : window.sessionStorage;
  } catch {
    return null;
  }
}

function discardStoredOrder(storage: PortalCoinOrderStorage | null) {
  if (!storage) return;
  try {
    storage.removeItem(PORTAL_COIN_ORDER_STORAGE_KEY);
  } catch {
    // Storage is optional recovery state.
  }
}

function persistOrderReference(
  storage: PortalCoinOrderStorage | null,
  orderRef: string
) {
  if (!storage) return;
  try {
    storage.setItem(
      PORTAL_COIN_ORDER_STORAGE_KEY,
      JSON.stringify({ orderRef })
    );
  } catch {
    // The strict server Order remains authoritative when storage is unavailable.
  }
}

function readStoredOrderReference(
  storage: PortalCoinOrderStorage | null
): string | null {
  if (!storage) return null;
  try {
    const raw = storage.getItem(PORTAL_COIN_ORDER_STORAGE_KEY);
    if (raw === null) return null;
    if (typeof raw !== "string") {
      discardStoredOrder(storage);
      return null;
    }
    const value: unknown = JSON.parse(raw);
    if (
      !value
      || typeof value !== "object"
      || Array.isArray(value)
      || Object.getPrototypeOf(value) !== Object.prototype
      || Reflect.ownKeys(value).length !== 1
      || !Object.hasOwn(value, "orderRef")
    ) {
      discardStoredOrder(storage);
      return null;
    }
    const descriptor = Object.getOwnPropertyDescriptor(value, "orderRef");
    if (
      !descriptor
      || !descriptor.enumerable
      || !("value" in descriptor)
      || typeof descriptor.value !== "string"
      || !COMMERCE_REFERENCE.test(descriptor.value)
    ) {
      discardStoredOrder(storage);
      return null;
    }
    if (raw !== JSON.stringify({ orderRef: descriptor.value })) {
      discardStoredOrder(storage);
      return null;
    }
    return descriptor.value;
  } catch {
    discardStoredOrder(storage);
    return null;
  }
}

function safeError(error: unknown): {
  code: PortalCoinCommerceClientErrorCode;
  retryable: boolean;
} {
  if (error instanceof PortalCoinCommerceClientError) {
    return { code: error.code, retryable: error.retryable };
  }
  return { code: "commerce_request_failed", retryable: true };
}

export function isPortalCoinOrderTerminal(order: PortalCoinOrder): boolean {
  if (order.paymentStatus === "captured") {
    return order.fulfillment.status === "delivered"
      || order.fulfillment.status === "failed";
  }
  return order.paymentStatus === "cancelled"
    || order.paymentStatus === "capture_failed"
    || order.paymentStatus === "reconciliation_required";
}

export type PortalCoinOrderUiState =
  | "reserved"
  | "settling"
  | "delivering"
  | "succeeded"
  | "delivery_failed"
  | "cancelled"
  | "capture_failed"
  | "reconciliation_required";

export function portalCoinOrderUiState(
  order: PortalCoinOrder
): PortalCoinOrderUiState {
  switch (order.paymentStatus) {
    case "held":
      return "reserved";
    case "capture_pending":
      return "settling";
    case "cancelled":
      return "cancelled";
    case "capture_failed":
      return "capture_failed";
    case "reconciliation_required":
      return "reconciliation_required";
    case "captured":
      if (order.fulfillment.status === "delivered") return "succeeded";
      if (order.fulfillment.status === "failed") return "delivery_failed";
      return "delivering";
  }
}

export type UseCoinsPurchaseFlowOptions = {
  cancelIdempotencyKey?: () => string;
  client: PortalCoinCommerceClient | null;
  createIdempotencyKey?: () => string;
  pollIntervalMs?: number;
  sessionRef: string | null;
  storage?: PortalCoinOrderStorage | null;
};

export function useCoinsPurchaseFlow({
  cancelIdempotencyKey = () => crypto.randomUUID(),
  client,
  createIdempotencyKey = () => crypto.randomUUID(),
  pollIntervalMs = 2_000,
  sessionRef,
  storage = browserSessionStorage()
}: UseCoinsPurchaseFlowOptions) {
  const [state, setState] = useState<CoinsPurchaseState>(INITIAL_STATE);
  const [pollRevision, setPollRevision] = useState(0);
  const clientRef = useRef(client);
  const sessionRefRef = useRef(sessionRef);
  const identityRef = useRef({ client, sessionRef });
  const storageRef = useRef(storage);
  const generationRef = useRef(0);
  const offerRef = useRef<string | null>(null);
  const quoteRef = useRef<PortalCoinQuote | null>(null);
  const orderRef = useRef<PortalCoinOrder | null>(null);
  const createIdempotencyKeyRef = useRef(createIdempotencyKey);
  const cancelIdempotencyKeyRef = useRef(cancelIdempotencyKey);
  const createIntentRef = useRef<{
    key: string;
    pending: boolean;
    quoteRef: string;
  } | null>(null);
  const cancelIntentRef = useRef<{
    key: string;
    orderRef: string;
    pending: boolean;
  } | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const detailRequestSequenceRef = useRef(0);
  const quoteRequestSequenceRef = useRef(0);
  const orderReadSequenceRef = useRef(0);
  clientRef.current = client;
  sessionRefRef.current = sessionRef;
  createIdempotencyKeyRef.current = createIdempotencyKey;
  cancelIdempotencyKeyRef.current = cancelIdempotencyKey;
  storageRef.current = storage;

  const invalidateFlow = useCallback((discardRecovery: boolean) => {
    generationRef.current += 1;
    detailRequestSequenceRef.current += 1;
    quoteRequestSequenceRef.current += 1;
    orderReadSequenceRef.current += 1;
    offerRef.current = null;
    quoteRef.current = null;
    orderRef.current = null;
    createIntentRef.current = null;
    cancelIntentRef.current = null;
    if (discardRecovery) {
      discardStoredOrder(storageRef.current);
    }
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    setPollRevision((current) => current + 1);
    setState({ ...INITIAL_STATE });
  }, []);

  const reset = useCallback(() => {
    invalidateFlow(true);
  }, [invalidateFlow]);

  useEffect(() => {
    const previous = identityRef.current;
    if (previous.client === client && previous.sessionRef === sessionRef) return;
    identityRef.current = { client, sessionRef };
    const discardRecovery = previous.sessionRef !== null
      && previous.sessionRef !== sessionRef;
    invalidateFlow(discardRecovery);
  }, [client, invalidateFlow, sessionRef]);

  const openProduct = useCallback(async (nextOfferRef: string) => {
    const activeClient = clientRef.current;
    const activeSessionRef = sessionRefRef.current;
    if (!activeClient || !activeSessionRef) return;
    const generation = generationRef.current;
    const sequence = detailRequestSequenceRef.current + 1;
    detailRequestSequenceRef.current = sequence;
    quoteRequestSequenceRef.current += 1;
    setState((current) => ({
      ...current,
      phase: "loading_detail",
      quote: null,
      order: null,
      cancelling: false,
      errorCode: null,
      errorRetryable: false
    }));
    try {
      const nextOffer = await activeClient.getOffer({
        sessionRef: activeSessionRef,
        offerRef: nextOfferRef
      });
      if (
        generation !== generationRef.current
        || sequence !== detailRequestSequenceRef.current
      ) {
        return;
      }
      offerRef.current = nextOffer.offerRef;
      quoteRef.current = null;
      createIntentRef.current = null;
      setState({
        phase: "detail",
        offer: nextOffer,
        quote: null,
        order: null,
        cancelling: false,
        errorCode: null,
        errorRetryable: false
      });
    } catch (error) {
      if (
        generation !== generationRef.current
        || sequence !== detailRequestSequenceRef.current
      ) {
        return;
      }
      const failure = safeError(error);
      setState((current) => ({
        ...current,
        phase: "error",
        errorCode: failure.code,
        errorRetryable: failure.retryable
      }));
    }
  }, []);

  const previewCheckout = useCallback(async () => {
    const activeClient = clientRef.current;
    const activeSessionRef = sessionRefRef.current;
    const activeOfferRef = offerRef.current;
    if (!activeClient || !activeSessionRef || !activeOfferRef) return;
    const generation = generationRef.current;
    const sequence = quoteRequestSequenceRef.current + 1;
    quoteRequestSequenceRef.current = sequence;
    setState((current) => ({
      ...current,
      phase: "loading_preview",
      errorCode: null,
      errorRetryable: false
    }));
    try {
      const nextQuote = await activeClient.previewCheckout({
        sessionRef: activeSessionRef,
        offerRef: activeOfferRef
      });
      if (
        generation !== generationRef.current
        || sequence !== quoteRequestSequenceRef.current
      ) {
        return;
      }
      quoteRef.current = nextQuote;
      createIntentRef.current = null;
      setState((current) => ({
        ...current,
        phase: "quote",
        quote: nextQuote,
        errorCode: null,
        errorRetryable: false
      }));
    } catch (error) {
      if (
        generation !== generationRef.current
        || sequence !== quoteRequestSequenceRef.current
      ) {
        return;
      }
      const failure = safeError(error);
      setState((current) => ({
        ...current,
        phase: "error",
        errorCode: failure.code,
        errorRetryable: failure.retryable
      }));
    }
  }, []);

  const confirmPurchase = useCallback(async () => {
    const activeClient = clientRef.current;
    const activeSessionRef = sessionRefRef.current;
    const activeQuote = quoteRef.current;
    if (
      !activeClient
      || !activeSessionRef
      || !activeQuote
      || orderRef.current !== null
      || activeQuote.purchaseAvailability !== "available"
    ) {
      return;
    }
    let intent = createIntentRef.current;
    if (!intent || intent.quoteRef !== activeQuote.quoteRef) {
      intent = {
        key: createIdempotencyKeyRef.current(),
        pending: false,
        quoteRef: activeQuote.quoteRef
      };
      createIntentRef.current = intent;
    }
    if (intent.pending) return;
    intent.pending = true;
    const generation = generationRef.current;
    setState((current) => ({
      ...current,
      phase: "submitting",
      errorCode: null,
      errorRetryable: false
    }));
    try {
      const nextOrder = await activeClient.createOrder({
        sessionRef: activeSessionRef,
        quoteRef: activeQuote.quoteRef,
        idempotencyKey: intent.key
      });
      if (generation !== generationRef.current) return;
      orderRef.current = nextOrder;
      quoteRef.current = null;
      createIntentRef.current = null;
      cancelIntentRef.current = null;
      persistOrderReference(storageRef.current, nextOrder.orderRef);
      setState((current) => ({
        ...current,
        phase: "order",
        quote: null,
        order: nextOrder,
        errorCode: null,
        errorRetryable: false
      }));
    } catch (error) {
      if (generation !== generationRef.current) return;
      const failure = safeError(error);
      const requiresNewPreview = failure.code === "quote_expired"
        || failure.code === "quote_stale";
      if (requiresNewPreview) {
        quoteRef.current = null;
        createIntentRef.current = null;
      }
      setState((current) => ({
        ...current,
        phase: requiresNewPreview ? "detail" : "error",
        quote: requiresNewPreview ? null : current.quote,
        errorCode: failure.code,
        errorRetryable: failure.retryable
      }));
    } finally {
      if (createIntentRef.current === intent) {
        intent.pending = false;
      }
    }
  }, []);

  const cancelPurchase = useCallback(async () => {
    const activeClient = clientRef.current;
    const activeSessionRef = sessionRefRef.current;
    const activeOrder = orderRef.current;
    if (
      !activeClient
      || !activeSessionRef
      || !activeOrder
      || activeOrder.paymentStatus !== "held"
    ) {
      return;
    }
    let intent = cancelIntentRef.current;
    if (!intent || intent.orderRef !== activeOrder.orderRef) {
      intent = {
        key: cancelIdempotencyKeyRef.current(),
        orderRef: activeOrder.orderRef,
        pending: false
      };
      cancelIntentRef.current = intent;
    }
    if (intent.pending) return;
    intent.pending = true;
    const generation = generationRef.current;
    orderReadSequenceRef.current += 1;
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    setState((current) => ({
      ...current,
      cancelling: true,
      errorCode: null,
      errorRetryable: false
    }));
    try {
      await activeClient.cancelOrder({
        sessionRef: activeSessionRef,
        orderRef: activeOrder.orderRef,
        idempotencyKey: intent.key
      });
      if (generation !== generationRef.current) return;
      const sequence = orderReadSequenceRef.current + 1;
      orderReadSequenceRef.current = sequence;
      const readback = await activeClient.getOrder({
        sessionRef: activeSessionRef,
        orderRef: activeOrder.orderRef
      });
      if (
        generation !== generationRef.current
        || sequence !== orderReadSequenceRef.current
        || orderRef.current?.orderRef !== activeOrder.orderRef
      ) {
        return;
      }
      orderRef.current = readback;
      persistOrderReference(storageRef.current, readback.orderRef);
      setPollRevision((current) => current + 1);
      setState((current) => ({
        ...current,
        phase: "order",
        order: readback,
        cancelling: false,
        errorCode: null,
        errorRetryable: false
      }));
    } catch (error) {
      if (generation !== generationRef.current) return;
      const failure = safeError(error);
      setState((current) => ({
        ...current,
        phase: "order",
        cancelling: false,
        errorCode: failure.code,
        errorRetryable: failure.retryable
      }));
    } finally {
      if (cancelIntentRef.current === intent) {
        intent.pending = false;
      }
      if (generation === generationRef.current) {
        setState((current) => (
          current.cancelling ? { ...current, cancelling: false } : current
        ));
      }
    }
  }, []);

  const refreshOrder = useCallback(async () => {
    const activeClient = clientRef.current;
    const activeSessionRef = sessionRefRef.current;
    const activeOrder = orderRef.current;
    if (
      !activeClient
      || !activeSessionRef
      || !activeOrder
      || cancelIntentRef.current?.pending
    ) {
      return;
    }
    const generation = generationRef.current;
    const sequence = orderReadSequenceRef.current + 1;
    orderReadSequenceRef.current = sequence;
    try {
      const readback = await activeClient.getOrder({
        sessionRef: activeSessionRef,
        orderRef: activeOrder.orderRef
      });
      if (
        generation !== generationRef.current
        || sequence !== orderReadSequenceRef.current
        || orderRef.current?.orderRef !== activeOrder.orderRef
      ) {
        return;
      }
      orderRef.current = readback;
      persistOrderReference(storageRef.current, readback.orderRef);
      setPollRevision((current) => current + 1);
      setState((current) => ({
        ...current,
        phase: "order",
        order: readback,
        errorCode: null,
        errorRetryable: false
      }));
    } catch (error) {
      if (
        generation !== generationRef.current
        || sequence !== orderReadSequenceRef.current
      ) {
        return;
      }
      const failure = safeError(error);
      setState((current) => ({
        ...current,
        errorCode: failure.code,
        errorRetryable: failure.retryable
      }));
    }
  }, []);

  useEffect(() => {
    const storedOrderRef = readStoredOrderReference(storage);
    if (!client || !sessionRef || !storedOrderRef) return;
    const generation = generationRef.current;
    const sequence = orderReadSequenceRef.current + 1;
    orderReadSequenceRef.current = sequence;
    void client.getOrder({
      sessionRef,
      orderRef: storedOrderRef
    }).then((readback) => {
      if (
        generation !== generationRef.current
        || sequence !== orderReadSequenceRef.current
        || clientRef.current !== client
        || sessionRefRef.current !== sessionRef
      ) {
        return;
      }
      orderRef.current = readback;
      persistOrderReference(storageRef.current, readback.orderRef);
      setState((current) => ({
        ...current,
        phase: "order",
        offer: readback.offer,
        order: readback,
        errorCode: null,
        errorRetryable: false
      }));
    }).catch((error: unknown) => {
      if (
        generation !== generationRef.current
        || sequence !== orderReadSequenceRef.current
        || clientRef.current !== client
        || sessionRefRef.current !== sessionRef
      ) {
        return;
      }
      const failure = safeError(error);
      setState((current) => ({
        ...current,
        errorCode: failure.code,
        errorRetryable: failure.retryable
      }));
    });
  }, [client, sessionRef, storage]);

  const activeOrderRef = state.order?.orderRef ?? null;
  const activePaymentStatus = state.order?.paymentStatus ?? null;
  const activeFulfillmentStatus = state.order?.fulfillment.status ?? null;
  useEffect(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    const activeOrder = orderRef.current;
    if (
      !activeOrderRef
      || !activeOrder
      || activeOrder.orderRef !== activeOrderRef
      || state.cancelling
      || cancelIntentRef.current?.pending
      || isPortalCoinOrderTerminal(activeOrder)
    ) {
      return;
    }
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      void refreshOrder();
    }, pollIntervalMs);
    return () => {
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [
    activeFulfillmentStatus,
    activeOrderRef,
    activePaymentStatus,
    pollIntervalMs,
    pollRevision,
    refreshOrder,
    state.cancelling
  ]);

  useEffect(() => () => {
    generationRef.current += 1;
    orderReadSequenceRef.current += 1;
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  return {
    ...state,
    cancelPurchase,
    confirmPurchase,
    openProduct,
    previewCheckout,
    refreshOrder,
    reset
  };
}
