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
const CREATE_REQUEST_WAIT_MS = 30_000;

type CreateIntent = {
  client: PortalRechargeClient;
  sessionRef: string;
  sessionGeneration: number;
  offerRef: string;
  idempotencyKey: string;
};

export type PortalRechargeOffersState =
  | { status: "loading" }
  | { status: "ready" }
  | { status: "empty" }
  | { status: "unavailable"; retryable: boolean }
  | { status: "error"; retryable: boolean };

export type PortalRechargeModel = {
  available: boolean;
  dialogOpen: boolean;
  offers: PortalRechargeOffer[];
  offersState: PortalRechargeOffersState;
  activeOrder: PortalRechargeOrder | null;
  busy: boolean;
  error: "unavailable" | "failed" | "delayed" | "create_unknown" | "entry_expired" | null;
  unresolvedCreateOfferRef?: string | null;
  retryCreateOrder?: () => Promise<void>;
  openDialog: () => void;
  closeDialog: () => void;
  retryOffers: () => void;
  createOrder: (offerRef: string) => Promise<void>;
  continueOrderPayment: (order: PortalRechargeOrder) => PortalRechargePaymentRedirectResult;
};

class SettlementDeadlineExceededError extends Error {}

class CreateOutcomeUnknownError extends Error {}

// Abort only bounds the browser wait. It does not prove that the server did not
// commit; recovery must keep the original create idempotency key.
function withCreateDeadline<T>(request: Promise<T>, controller: AbortController) {
  return new Promise<T>((resolve, reject) => {
    let settled = false;
    const finish = (complete: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      controller.signal.removeEventListener("abort", onAbort);
      complete();
    };
    const onAbort = () => finish(() => reject(new CreateOutcomeUnknownError()));
    const timer = setTimeout(() => controller.abort(), CREATE_REQUEST_WAIT_MS);
    controller.signal.addEventListener("abort", onAbort, { once: true });
    if (controller.signal.aborted) onAbort();
    void request.then(
      (value) => finish(() => resolve(value)),
      (caught: unknown) => finish(() => reject(caught)),
    );
  });
}

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
  const [unresolvedCreateOfferRef, setUnresolvedCreateOfferRef] = useState<string | null>(null);
  const [offersState, setOffersState] = useState<PortalRechargeOffersState>(() => (
    enabled && client && sessionRef
      ? { status: "loading" }
      : { status: "unavailable", retryable: false }
  ));
  const [offersRevision, setOffersRevision] = useState(0);
  const requestRef = useRef(0);
  const operationRef = useRef(0);
  const createIntentRef = useRef<CreateIntent | null>(null);
  const createRequestRef = useRef<AbortController | null>(null);
  const creditedRefsRef = useRef(new Set<string>());
  const recoveredCaptureRequestsRef = useRef(
    new Map<string, Promise<PortalRechargeOrder>>(),
  );
  const redirectedOrderRefsRef = useRef(new Set<string>());
  const settlementPollStartedAtRef = useRef(new Map<string, number>());
  const trackedSettlementOrderRefsRef = useRef(new Set<string>());
  const readbackOnlyOrderRefsRef = useRef(new Set<string>());
  const identityRef = useRef({ client, sessionRef, sessionGeneration });
  const offerIdentityRef = useRef({ client, enabled, sessionRef, sessionGeneration });
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
    const request: Promise<PortalRechargeOrder> = Promise.resolve().then(() => capturedClient.captureOrder({
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

  const handoffOrder = useCallback((
    order: PortalRechargeOrder,
  ): PortalRechargePaymentRedirectResult => {
    const current = identityRef.current;
    if (!client || !sessionRef || current.client !== client
      || current.sessionRef !== sessionRef || current.sessionGeneration !== sessionGeneration) return "blocked";
    const result = handoffPortalRechargeOrderToPayment(
      order,
      callbacksRef.current.paymentRedirect,
    );
    if (result === "blocked") setError("failed");
    if (result === "expired") setError("entry_expired");
    if (result === "redirected") redirectedOrderRefsRef.current.add(order.orderRef);
    return result;
  }, [client, sessionRef, sessionGeneration]);

  const redirectOrderToPayment = useCallback((order: PortalRechargeOrder) => {
    if (redirectedOrderRefsRef.current.has(order.orderRef)) return "not_applicable";
    return handoffOrder(order);
  }, [handoffOrder]);

  useEffect(() => {
    const previousOfferIdentity = offerIdentityRef.current;
    const offerIdentityChanged = previousOfferIdentity.client !== client
      || previousOfferIdentity.enabled !== enabled
      || previousOfferIdentity.sessionRef !== sessionRef
      || previousOfferIdentity.sessionGeneration !== sessionGeneration;
    offerIdentityRef.current = { client, enabled, sessionRef, sessionGeneration };
    const requestId = requestRef.current + 1;
    requestRef.current = requestId;
    setOffers([]);
    if (offerIdentityChanged) {
      if (previousOfferIdentity.client !== client || previousOfferIdentity.sessionRef !== sessionRef
        || previousOfferIdentity.sessionGeneration !== sessionGeneration) {
        createIntentRef.current = null;
        redirectedOrderRefsRef.current.clear();
      }
      setActiveOrder(null);
      setDialogOpen(false);
      setError(createIntentRef.current ? "create_unknown" : null);
    }
    // Reloading offers can abort an in-flight create without changing identity.
    // Its unresolved intent still needs the same recovery UI and original key.
    setUnresolvedCreateOfferRef(createIntentRef.current?.offerRef ?? null);
    if (createIntentRef.current) setError("create_unknown");
    operationRef.current += 1;
    creditedRefsRef.current.clear();
    settlementPollStartedAtRef.current.clear();
    trackedSettlementOrderRefsRef.current.clear();
    readbackOnlyOrderRefsRef.current.clear();
    if (!enabled || !client || !sessionRef) {
      setBusy(false);
      setOffersState({ status: "unavailable", retryable: false });
      return;
    }
    setOffersState({ status: "loading" });
    setBusy(true);
    const returnIntent = readPortalRechargeReturn();
    let initialReadComplete = false;
    void Promise.all([
      client.listOffers({ sessionRef }),
      client.listOrders({ sessionRef }),
    ]).then(async ([nextOffers, orders]) => {
      if (requestRef.current !== requestId) return;
      setOffers(nextOffers);
      setOffersState(nextOffers.length > 0 ? { status: "ready" } : { status: "empty" });
      initialReadComplete = true;
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
      if (initialReadComplete) {
        applyFailure(caught);
        return;
      }
      if (
        caught instanceof PortalRechargeClientError
        && caught.code === "payment_recharge_session_invalid"
      ) {
        callbacksRef.current.onSessionInvalid();
        setOffersState({ status: "unavailable", retryable: false });
        return;
      }
      if (
        caught instanceof PortalRechargeClientError
        && caught.code === "payment_recharge_unavailable"
      ) {
        setOffersState({ status: "unavailable", retryable: caught.retryable });
        return;
      }
      setOffersState({
        status: "error",
        retryable: retryableRechargeFailure(caught)
      });
    }).finally(() => {
      if (requestRef.current === requestId) setBusy(false);
    });
    return () => {
      requestRef.current += 1;
      operationRef.current += 1;
      createRequestRef.current?.abort();
      createRequestRef.current = null;
    };
  }, [
    applyFailure,
    captureOrderOnce,
    client,
    enabled,
    offersRevision,
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
    const current = identityRef.current;
    if (!enabled || !client || !sessionRef || createRequestRef.current
      || current.client !== client || current.sessionRef !== sessionRef
      || current.sessionGeneration !== sessionGeneration) return;
    let intent = createIntentRef.current;
    if (intent && (intent.client !== client || intent.sessionRef !== sessionRef
      || intent.sessionGeneration !== sessionGeneration)) intent = null;
    // A different denomination is a new intent, not recovery of an unknown
    // result. Resolve the existing intent before offering another create.
    if (intent && intent.offerRef !== offerRef) {
      setError("create_unknown");
      return;
    }
    intent ??= {
      client, sessionRef, sessionGeneration, offerRef,
      idempotencyKey: createPortalRechargeIdempotencyKey("create"),
    };
    createIntentRef.current = intent;
    const controller = new AbortController();
    createRequestRef.current = controller;
    const operationId = operationRef.current + 1;
    operationRef.current = operationId;
    const capturedClient = client;
    const capturedSessionRef = sessionRef;
    const capturedGeneration = sessionGeneration;
    setBusy(true);
    setError(null);
    try {
      const order = await withCreateDeadline(capturedClient.createOrder({
        sessionRef: capturedSessionRef,
        offerRef,
        idempotencyKey: intent.idempotencyKey,
        signal: controller.signal,
      }), controller);
      if (!operationIsCurrent(operationId, capturedClient, capturedSessionRef, capturedGeneration)) return;
      createIntentRef.current = null;
      setUnresolvedCreateOfferRef(null);
      setActiveOrder(order);
      if (order.status === "created" && order.nextAction === null) {
        trackedSettlementOrderRefsRef.current.add(order.orderRef);
      }
      redirectOrderToPayment(order);
    } catch (caught) {
      if (!operationIsCurrent(operationId, capturedClient, capturedSessionRef, capturedGeneration)) return;
      if (caught instanceof PortalRechargeClientError && caught.code === "payment_recharge_session_invalid") {
        createIntentRef.current = null;
        setUnresolvedCreateOfferRef(null);
        applyFailure(caught);
      } else {
        setUnresolvedCreateOfferRef(intent.offerRef);
        setError("create_unknown");
      }
    } finally {
      if (createRequestRef.current === controller) createRequestRef.current = null;
      if (operationIsCurrent(operationId, capturedClient, capturedSessionRef, capturedGeneration)) {
        setBusy(false);
      }
    }
  }, [applyFailure, client, enabled, operationIsCurrent, redirectOrderToPayment, sessionGeneration, sessionRef]);

  return {
    available: Boolean(enabled && client && sessionRef),
    dialogOpen,
    offers,
    offersState,
    activeOrder,
    busy,
    error,
    unresolvedCreateOfferRef,
    retryCreateOrder: async () => {
      const intent = createIntentRef.current;
      if (intent) await createOrder(intent.offerRef);
    },
    openDialog: () => {
      clearPortalRechargeReturn();
      if (activeOrder) {
        settlementPollStartedAtRef.current.delete(activeOrder.orderRef);
        trackedSettlementOrderRefsRef.current.delete(activeOrder.orderRef);
        readbackOnlyOrderRefsRef.current.delete(activeOrder.orderRef);
      }
      setActiveOrder(null);
      setError(createIntentRef.current ? "create_unknown" : null);
      setDialogOpen(true);
    },
    closeDialog: () => {
      if (!busy) {
        operationRef.current += 1;
        clearPortalRechargeReturn();
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
    retryOffers: () => {
      setOffersRevision((revision) => revision + 1);
    },
    createOrder,
    continueOrderPayment: handoffOrder,
  };
}
