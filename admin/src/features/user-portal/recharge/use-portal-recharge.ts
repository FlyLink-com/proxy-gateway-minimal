import { useCallback, useEffect, useRef, useState } from "react";

import {
  PortalRechargeClientError,
  type PortalRechargeClient,
  type PortalRechargeOffer,
  type PortalRechargeOrder,
} from "./portal-recharge-client";
import {
  clearPortalRechargeReturn,
  readPortalRechargeReturn,
  stagePortalRechargeReturn,
} from "./portal-recharge-return";

const SETTLEMENT_POLL_INTERVAL_MS = 2_000;
const SETTLEMENT_POLL_WINDOW_MS = 120_000;

export type PortalRechargeModel = {
  available: boolean;
  dialogOpen: boolean;
  offers: PortalRechargeOffer[];
  activeOrder: PortalRechargeOrder | null;
  busy: boolean;
  error: "unavailable" | "failed" | null;
  openDialog: () => void;
  closeDialog: () => void;
  createOrder: (offerRef: string) => Promise<void>;
  captureOrder: () => Promise<void>;
  refreshOrder: () => Promise<void>;
};

function idempotencyKey(kind: "create" | "capture") {
  const random = typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `${Date.now()}_${Math.random().toString(16).slice(2)}`;
  return `portal_${kind}_${random}`;
}

function nonTerminal(order: PortalRechargeOrder) {
  return order.status === "created"
    || order.status === "entry_ready"
    || order.status === "pending"
    || order.status === "payment_verified";
}

function returnResolved(order: PortalRechargeOrder) {
  return !nonTerminal(order);
}

function captureOnReturn(order: PortalRechargeOrder) {
  return order.status === "entry_ready" && order.adapterKey === "paypal_v1";
}

function retryableRechargeFailure(caught: unknown) {
  return caught instanceof PortalRechargeClientError && caught.retryable;
}

type PaymentRedirectResult = "not_applicable" | "blocked" | "redirected";

function pollAfterReturn(
  order: PortalRechargeOrder,
  returnOrderRef: string | undefined,
  trackedWithoutReturn: boolean,
) {
  if (trackedWithoutReturn) return nonTerminal(order);
  if (order.status === "created") return order.nextAction === null;
  if (returnOrderRef !== order.orderRef) return false;
  return order.status === "pending"
    || order.status === "payment_verified"
    || (order.status === "entry_ready" && !captureOnReturn(order));
}

export function usePortalRecharge({
  client,
  enabled,
  sessionRef,
  sessionGeneration,
  onSessionInvalid,
  onWalletMutation,
  paymentRedirect,
}: {
  client: PortalRechargeClient | null;
  enabled: boolean;
  sessionRef: string | null;
  sessionGeneration: number;
  onSessionInvalid: () => void;
  onWalletMutation: () => void;
  paymentRedirect: (url: string) => void;
}): PortalRechargeModel {
  const [offers, setOffers] = useState<PortalRechargeOffer[]>([]);
  const [activeOrder, setActiveOrder] = useState<PortalRechargeOrder | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<PortalRechargeModel["error"]>(null);
  const requestRef = useRef(0);
  const operationRef = useRef(0);
  const creditedRefsRef = useRef(new Set<string>());
  const recoveredCaptureRequestsRef = useRef(
    new Map<string, Promise<PortalRechargeOrder>>(),
  );
  const redirectedOrderRefsRef = useRef(new Set<string>());
  const settlementPollStartedAtRef = useRef(new Map<string, number>());
  const trackedSettlementOrderRefsRef = useRef(new Set<string>());
  const identityRef = useRef({ client, sessionRef, sessionGeneration });
  identityRef.current = { client, sessionRef, sessionGeneration };
  const callbacksRef = useRef({ onSessionInvalid, onWalletMutation, paymentRedirect });
  callbacksRef.current = { onSessionInvalid, onWalletMutation, paymentRedirect };

  const applyFailure = useCallback((caught: unknown) => {
    if (
      caught instanceof PortalRechargeClientError
      && caught.code === "payment_recharge_session_invalid"
    ) {
      callbacksRef.current.onSessionInvalid();
      return;
    }
    setError(caught instanceof PortalRechargeClientError
      && caught.code === "payment_recharge_unavailable" ? "unavailable" : "failed");
  }, []);

  const notifyWalletIfCredited = useCallback((order: PortalRechargeOrder) => {
    if (order.status === "credited" && !creditedRefsRef.current.has(order.orderRef)) {
      creditedRefsRef.current.add(order.orderRef);
      callbacksRef.current.onWalletMutation();
    }
  }, []);

  const captureOrderOnce = useCallback((
    capturedClient: PortalRechargeClient,
    capturedSessionRef: string,
    orderRef: string,
    captureIdempotencyKey: string,
  ) => {
    const existing = recoveredCaptureRequestsRef.current.get(captureIdempotencyKey);
    if (existing) return existing;
    let request!: Promise<PortalRechargeOrder>;
    request = Promise.resolve().then(() => capturedClient.captureOrder({
      sessionRef: capturedSessionRef,
      orderRef,
      idempotencyKey: captureIdempotencyKey,
    })).catch((caught: unknown) => {
      if (
        retryableRechargeFailure(caught)
        && recoveredCaptureRequestsRef.current.get(captureIdempotencyKey) === request
      ) {
        recoveredCaptureRequestsRef.current.delete(captureIdempotencyKey);
      }
      throw caught;
    });
    recoveredCaptureRequestsRef.current.set(captureIdempotencyKey, request);
    return request;
  }, []);

  const redirectOrderToPayment = useCallback((
    order: PortalRechargeOrder,
  ): PaymentRedirectResult => {
    if (
      order.status !== "entry_ready"
      || order.nextAction?.type !== "redirect"
      || redirectedOrderRefsRef.current.has(order.orderRef)
    ) return "not_applicable";
    const staged = stagePortalRechargeReturn({
      version: 1,
      orderRef: order.orderRef,
      captureIdempotencyKey: idempotencyKey("capture"),
    });
    if (!staged) {
      setError("failed");
      return "blocked";
    }
    redirectedOrderRefsRef.current.add(order.orderRef);
    callbacksRef.current.paymentRedirect(order.nextAction.url);
    return "redirected";
  }, []);

  useEffect(() => {
    const requestId = requestRef.current + 1;
    requestRef.current = requestId;
    setOffers([]);
    setActiveOrder(null);
    setDialogOpen(false);
    setError(null);
    operationRef.current += 1;
    creditedRefsRef.current.clear();
    settlementPollStartedAtRef.current.clear();
    trackedSettlementOrderRefsRef.current.clear();
    if (!enabled || !client || !sessionRef) return;
    setBusy(true);
    const returnIntent = readPortalRechargeReturn();
    void Promise.all([
      client.listOffers({ sessionRef }),
      client.listOrders({ sessionRef }),
    ]).then(async ([nextOffers, orders]) => {
      if (requestRef.current !== requestId) return;
      setOffers(nextOffers);
      const returnedOrder = returnIntent
        ? orders.find((order) => order.orderRef === returnIntent.orderRef) ?? null
        : null;
      const nextActiveOrder = returnedOrder ?? orders.find(nonTerminal) ?? null;
      setActiveOrder(nextActiveOrder);
      if (
        nextActiveOrder
        && (
          (nextActiveOrder.status === "created" && nextActiveOrder.nextAction === null)
          || nextActiveOrder.status === "pending"
          || nextActiveOrder.status === "payment_verified"
        )
      ) trackedSettlementOrderRefsRef.current.add(nextActiveOrder.orderRef);
      if (!returnedOrder || !returnIntent) return;
      setDialogOpen(true);
      if (returnResolved(returnedOrder)) {
        notifyWalletIfCredited(returnedOrder);
        clearPortalRechargeReturn();
        return;
      }
      if (
        !captureOnReturn(returnedOrder)
      ) return;
      const captureStartedAt = Date.now();
      let capturedOrder: PortalRechargeOrder | null = null;
      while (requestRef.current === requestId) {
        try {
          capturedOrder = await captureOrderOnce(
            client,
            sessionRef,
            returnedOrder.orderRef,
            returnIntent.captureIdempotencyKey,
          );
          break;
        } catch (caught) {
          if (requestRef.current !== requestId) return;
          if (
            !retryableRechargeFailure(caught)
            || Date.now() - captureStartedAt >= SETTLEMENT_POLL_WINDOW_MS
          ) throw caught;
          await new Promise<void>((resolve) => {
            setTimeout(resolve, SETTLEMENT_POLL_INTERVAL_MS);
          });
        }
      }
      if (!capturedOrder) return;
      if (requestRef.current !== requestId) return;
      setActiveOrder(capturedOrder);
      if (capturedOrder.status === "credited" && !creditedRefsRef.current.has(capturedOrder.orderRef)) {
        creditedRefsRef.current.add(capturedOrder.orderRef);
        callbacksRef.current.onWalletMutation();
      }
      if (returnResolved(capturedOrder)) clearPortalRechargeReturn();
    }).catch((caught: unknown) => {
      if (requestRef.current !== requestId) return;
      applyFailure(caught);
    }).finally(() => {
      if (requestRef.current === requestId) setBusy(false);
    });
    return () => { requestRef.current += 1; };
  }, [
    applyFailure,
    captureOrderOnce,
    client,
    enabled,
    notifyWalletIfCredited,
    sessionGeneration,
    sessionRef,
  ]);

  const operationIsCurrent = useCallback((
    operationId: number,
    capturedClient: PortalRechargeClient,
    capturedSessionRef: string,
    capturedGeneration: number,
  ) => {
    const current = identityRef.current;
    return operationRef.current === operationId
      && current.client === capturedClient
      && current.sessionRef === capturedSessionRef
      && current.sessionGeneration === capturedGeneration;
  }, []);

  const applyCreditedOrder = useCallback((order: PortalRechargeOrder) => {
    setActiveOrder(order);
    notifyWalletIfCredited(order);
  }, [notifyWalletIfCredited]);

  useEffect(() => {
    const returnIntent = readPortalRechargeReturn();
    if (
      !dialogOpen
      || !client
      || !sessionRef
      || !activeOrder
      || !pollAfterReturn(
        activeOrder,
        returnIntent?.orderRef,
        trackedSettlementOrderRefsRef.current.has(activeOrder.orderRef),
      )
    ) return;
    const capturedClient = client;
    const capturedSessionRef = sessionRef;
    const capturedGeneration = sessionGeneration;
    const orderRef = activeOrder.orderRef;
    const pollStartedAt = settlementPollStartedAtRef.current.get(orderRef) ?? Date.now();
    settlementPollStartedAtRef.current.set(orderRef, pollStartedAt);
    if (Date.now() - pollStartedAt >= SETTLEMENT_POLL_WINDOW_MS) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const stillCurrent = () => {
      const current = identityRef.current;
      return !stopped
        && current.client === capturedClient
        && current.sessionRef === capturedSessionRef
        && current.sessionGeneration === capturedGeneration;
    };
    const poll = async () => {
      try {
        const order = await capturedClient.getOrder({
          sessionRef: capturedSessionRef,
          orderRef,
        });
        if (!stillCurrent()) return;
        applyCreditedOrder(order);
        const trackedWithoutReturn = returnIntent?.orderRef !== orderRef
          && trackedSettlementOrderRefsRef.current.has(orderRef);
        const redirectResult = trackedWithoutReturn
          ? redirectOrderToPayment(order)
          : "not_applicable";
        if (redirectResult !== "not_applicable") {
          settlementPollStartedAtRef.current.delete(orderRef);
          trackedSettlementOrderRefsRef.current.delete(orderRef);
          return;
        }
        if (returnResolved(order)) {
          settlementPollStartedAtRef.current.delete(orderRef);
          trackedSettlementOrderRefsRef.current.delete(orderRef);
          clearPortalRechargeReturn();
          return;
        }
        if (Date.now() - pollStartedAt >= SETTLEMENT_POLL_WINDOW_MS) return;
        timer = setTimeout(() => void poll(), SETTLEMENT_POLL_INTERVAL_MS);
      } catch (caught) {
        if (!stillCurrent()) return;
        if (
          retryableRechargeFailure(caught)
          && Date.now() - pollStartedAt < SETTLEMENT_POLL_WINDOW_MS
        ) {
          timer = setTimeout(() => void poll(), SETTLEMENT_POLL_INTERVAL_MS);
          return;
        }
        applyFailure(caught);
      }
    };
    timer = setTimeout(() => void poll(), SETTLEMENT_POLL_INTERVAL_MS);
    return () => {
      stopped = true;
      if (timer !== null) clearTimeout(timer);
    };
  }, [
    activeOrder,
    applyCreditedOrder,
    applyFailure,
    client,
    dialogOpen,
    redirectOrderToPayment,
    sessionGeneration,
    sessionRef,
  ]);

  const createOrder = useCallback(async (offerRef: string) => {
    if (!client || !sessionRef) return;
    const operationId = operationRef.current + 1;
    operationRef.current = operationId;
    const capturedClient = client;
    const capturedSessionRef = sessionRef;
    const capturedGeneration = sessionGeneration;
    setBusy(true);
    setError(null);
    try {
      const order = await capturedClient.createOrder({
        sessionRef: capturedSessionRef,
        offerRef,
        idempotencyKey: idempotencyKey("create"),
      });
      if (!operationIsCurrent(operationId, capturedClient, capturedSessionRef, capturedGeneration)) return;
      setActiveOrder(order);
      if (order.status === "created" && order.nextAction === null) {
        trackedSettlementOrderRefsRef.current.add(order.orderRef);
      }
      redirectOrderToPayment(order);
    } catch (caught) {
      if (!operationIsCurrent(operationId, capturedClient, capturedSessionRef, capturedGeneration)) return;
      applyFailure(caught);
    } finally {
      if (operationIsCurrent(operationId, capturedClient, capturedSessionRef, capturedGeneration)) {
        setBusy(false);
      }
    }
  }, [applyFailure, client, operationIsCurrent, redirectOrderToPayment, sessionGeneration, sessionRef]);

  const captureOrder = useCallback(async () => {
    if (!client || !sessionRef || !activeOrder) return;
    const operationId = operationRef.current + 1;
    operationRef.current = operationId;
    const capturedClient = client;
    const capturedSessionRef = sessionRef;
    const capturedGeneration = sessionGeneration;
    setBusy(true);
    setError(null);
    try {
      const returnIntent = readPortalRechargeReturn();
      const order = await capturedClient.captureOrder({
        sessionRef: capturedSessionRef,
        orderRef: activeOrder.orderRef,
        idempotencyKey: returnIntent?.orderRef === activeOrder.orderRef
          ? returnIntent.captureIdempotencyKey
          : idempotencyKey("capture"),
      });
      if (!operationIsCurrent(operationId, capturedClient, capturedSessionRef, capturedGeneration)) return;
      applyCreditedOrder(order);
      if (returnResolved(order)) clearPortalRechargeReturn();
    } catch (caught) {
      if (!operationIsCurrent(operationId, capturedClient, capturedSessionRef, capturedGeneration)) return;
      applyFailure(caught);
    } finally {
      if (operationIsCurrent(operationId, capturedClient, capturedSessionRef, capturedGeneration)) {
        setBusy(false);
      }
    }
  }, [activeOrder, applyCreditedOrder, applyFailure, client, operationIsCurrent, sessionGeneration, sessionRef]);

  const refreshOrder = useCallback(async () => {
    if (!client || !sessionRef || !activeOrder) return;
    const operationId = operationRef.current + 1;
    operationRef.current = operationId;
    const capturedClient = client;
    const capturedSessionRef = sessionRef;
    const capturedGeneration = sessionGeneration;
    setBusy(true);
    setError(null);
    try {
      const order = await capturedClient.getOrder({
        sessionRef: capturedSessionRef,
        orderRef: activeOrder.orderRef
      });
      if (!operationIsCurrent(operationId, capturedClient, capturedSessionRef, capturedGeneration)) return;
      applyCreditedOrder(order);
      if (returnResolved(order)) clearPortalRechargeReturn();
    } catch (caught) {
      if (!operationIsCurrent(operationId, capturedClient, capturedSessionRef, capturedGeneration)) return;
      applyFailure(caught);
    } finally {
      if (operationIsCurrent(operationId, capturedClient, capturedSessionRef, capturedGeneration)) {
        setBusy(false);
      }
    }
  }, [activeOrder, applyCreditedOrder, applyFailure, client, operationIsCurrent, sessionGeneration, sessionRef]);

  return {
    available: offers.length > 0,
    dialogOpen,
    offers,
    activeOrder,
    busy,
    error,
    openDialog: () => setDialogOpen(true),
    closeDialog: () => {
      if (!busy) {
        operationRef.current += 1;
        setDialogOpen(false);
      }
    },
    createOrder,
    captureOrder,
    refreshOrder,
  };
}
