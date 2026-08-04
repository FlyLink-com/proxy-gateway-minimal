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
} from "./portal-recharge-return";
import {
  createPortalRechargeIdempotencyKey,
  handoffPortalRechargeOrderToPayment,
  type PortalRechargePaymentRedirectResult,
} from "./portal-recharge-payment-handoff";

const SETTLEMENT_POLL_INTERVAL_MS = 2_000;
const SETTLEMENT_POLL_WINDOW_MS = 120_000;

export type PortalRechargeModel = {
  available: boolean;
  dialogOpen: boolean;
  offers: PortalRechargeOffer[];
  activeOrder: PortalRechargeOrder | null;
  busy: boolean;
  error: "unavailable" | "failed" | "delayed" | null;
  openDialog: () => void;
  closeDialog: () => void;
  createOrder: (offerRef: string) => Promise<void>;
  continueOrderPayment: (order: PortalRechargeOrder) => PortalRechargePaymentRedirectResult;
};

class SettlementDeadlineExceededError extends Error {}

function settlementRemainingMs(startedAt: number) {
  return Math.max(0, SETTLEMENT_POLL_WINDOW_MS - (Date.now() - startedAt));
}

function withSettlementDeadline<T>(request: Promise<T>, startedAt: number) {
  const remaining = settlementRemainingMs(startedAt);
  if (remaining === 0) {
    return Promise.reject(new SettlementDeadlineExceededError());
  }
  return new Promise<T>((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      settled = true;
      reject(new SettlementDeadlineExceededError());
    }, remaining);
    void request.then((value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(value);
    }, (caught: unknown) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(caught);
    });
  });
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
  const readbackOnlyOrderRefsRef = useRef(new Set<string>());
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
  ): PortalRechargePaymentRedirectResult => {
    if (redirectedOrderRefsRef.current.has(order.orderRef)) return "not_applicable";
    const result = handoffPortalRechargeOrderToPayment(
      order,
      callbacksRef.current.paymentRedirect,
    );
    if (result === "blocked") setError("failed");
    if (result === "redirected") redirectedOrderRefsRef.current.add(order.orderRef);
    return result;
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
    readbackOnlyOrderRefsRef.current.clear();
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
      const nextActiveOrder = returnedOrder;
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
        if (settlementRemainingMs(captureStartedAt) === 0) {
          readbackOnlyOrderRefsRef.current.add(returnedOrder.orderRef);
          setError("delayed");
          return;
        }
        try {
          capturedOrder = await withSettlementDeadline(
            captureOrderOnce(
              client,
              sessionRef,
              returnedOrder.orderRef,
              returnIntent.captureIdempotencyKey,
            ),
            captureStartedAt,
          );
          break;
        } catch (caught) {
          if (requestRef.current !== requestId) return;
          if (caught instanceof SettlementDeadlineExceededError) {
            readbackOnlyOrderRefsRef.current.add(returnedOrder.orderRef);
            setError("delayed");
            return;
          }
          if (!retryableRechargeFailure(caught)) throw caught;
          const retryDelay = Math.min(
            SETTLEMENT_POLL_INTERVAL_MS,
            settlementRemainingMs(captureStartedAt),
          );
          if (retryDelay === 0) {
            readbackOnlyOrderRefsRef.current.add(returnedOrder.orderRef);
            setError("delayed");
            return;
          }
          await new Promise<void>((resolve) => {
            setTimeout(resolve, retryDelay);
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
      || (
        !readbackOnlyOrderRefsRef.current.has(activeOrder.orderRef)
        && !pollAfterReturn(
          activeOrder,
          returnIntent?.orderRef,
          trackedSettlementOrderRefsRef.current.has(activeOrder.orderRef),
        )
      )
    ) return;
    const capturedClient = client;
    const capturedSessionRef = sessionRef;
    const capturedGeneration = sessionGeneration;
    const orderRef = activeOrder.orderRef;
    const pollStartedAt = settlementPollStartedAtRef.current.get(orderRef) ?? Date.now();
    settlementPollStartedAtRef.current.set(orderRef, pollStartedAt);
    const markSettlementDelayed = () => {
      readbackOnlyOrderRefsRef.current.add(orderRef);
      setError("delayed");
    };
    if (settlementRemainingMs(pollStartedAt) === 0) {
      markSettlementDelayed();
      return;
    }
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const stillCurrent = () => {
      const current = identityRef.current;
      return !stopped
        && current.client === capturedClient
        && current.sessionRef === capturedSessionRef
        && current.sessionGeneration === capturedGeneration;
    };
    const scheduleNextPoll = () => {
      const remaining = settlementRemainingMs(pollStartedAt);
      if (remaining === 0) {
        markSettlementDelayed();
        return;
      }
      timer = setTimeout(
        () => void poll(),
        Math.min(SETTLEMENT_POLL_INTERVAL_MS, remaining),
      );
    };
    const poll = async () => {
      if (settlementRemainingMs(pollStartedAt) === 0) {
        if (stillCurrent()) markSettlementDelayed();
        return;
      }
      try {
        const order = await withSettlementDeadline(
          capturedClient.getOrder({
            sessionRef: capturedSessionRef,
            orderRef,
          }),
          pollStartedAt,
        );
        if (!stillCurrent()) return;
        applyCreditedOrder(order);
        const readbackOnly = readbackOnlyOrderRefsRef.current.has(orderRef);
        const trackedWithoutReturn = returnIntent?.orderRef !== orderRef
          && trackedSettlementOrderRefsRef.current.has(orderRef);
        const redirectResult = trackedWithoutReturn && !readbackOnly
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
          readbackOnlyOrderRefsRef.current.delete(orderRef);
          clearPortalRechargeReturn();
          return;
        }
        scheduleNextPoll();
      } catch (caught) {
        if (!stillCurrent()) return;
        if (caught instanceof SettlementDeadlineExceededError) {
          markSettlementDelayed();
          return;
        }
        if (
          retryableRechargeFailure(caught)
          && settlementRemainingMs(pollStartedAt) > 0
        ) {
          scheduleNextPoll();
          return;
        }
        if (retryableRechargeFailure(caught)) {
          markSettlementDelayed();
          return;
        }
        applyFailure(caught);
      }
    };
    scheduleNextPoll();
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
        idempotencyKey: createPortalRechargeIdempotencyKey("create"),
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

  return {
    available: offers.length > 0,
    dialogOpen,
    offers,
    activeOrder,
    busy,
    error,
    openDialog: () => {
      if (activeOrder) {
        settlementPollStartedAtRef.current.delete(activeOrder.orderRef);
        trackedSettlementOrderRefsRef.current.delete(activeOrder.orderRef);
        readbackOnlyOrderRefsRef.current.delete(activeOrder.orderRef);
      }
      setActiveOrder(null);
      setError(null);
      setDialogOpen(true);
    },
    closeDialog: () => {
      if (!busy) {
        operationRef.current += 1;
        if (activeOrder) {
          settlementPollStartedAtRef.current.delete(activeOrder.orderRef);
          trackedSettlementOrderRefsRef.current.delete(activeOrder.orderRef);
          readbackOnlyOrderRefsRef.current.delete(activeOrder.orderRef);
        }
        setActiveOrder(null);
        setError(null);
        setDialogOpen(false);
      }
    },
    createOrder,
    continueOrderPayment: redirectOrderToPayment,
  };
}
