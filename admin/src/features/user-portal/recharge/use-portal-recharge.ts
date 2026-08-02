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
  const recoveredCaptureKeysRef = useRef(new Set<string>());
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

  useEffect(() => {
    const requestId = requestRef.current + 1;
    requestRef.current = requestId;
    setOffers([]);
    setActiveOrder(null);
    setDialogOpen(false);
    setError(null);
    operationRef.current += 1;
    creditedRefsRef.current.clear();
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
      if (!returnedOrder || !returnIntent) return;
      setDialogOpen(true);
      if (returnResolved(returnedOrder)) {
        clearPortalRechargeReturn();
        return;
      }
      if (
        returnedOrder.status !== "entry_ready"
        || recoveredCaptureKeysRef.current.has(returnIntent.captureIdempotencyKey)
      ) return;
      recoveredCaptureKeysRef.current.add(returnIntent.captureIdempotencyKey);
      const capturedOrder = await client.captureOrder({
        sessionRef,
        orderRef: returnedOrder.orderRef,
        idempotencyKey: returnIntent.captureIdempotencyKey,
      });
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
  }, [applyFailure, client, enabled, sessionGeneration, sessionRef]);

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
    if (order.status === "credited" && !creditedRefsRef.current.has(order.orderRef)) {
      creditedRefsRef.current.add(order.orderRef);
      callbacksRef.current.onWalletMutation();
    }
  }, []);

  useEffect(() => {
    const returnIntent = readPortalRechargeReturn();
    if (
      !dialogOpen
      || !client
      || !sessionRef
      || !activeOrder
      || returnIntent?.orderRef !== activeOrder.orderRef
      || (activeOrder.status !== "pending" && activeOrder.status !== "payment_verified")
    ) return;
    const capturedClient = client;
    const capturedSessionRef = sessionRef;
    const capturedGeneration = sessionGeneration;
    const orderRef = activeOrder.orderRef;
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
        if (returnResolved(order)) {
          clearPortalRechargeReturn();
          return;
        }
        timer = setTimeout(() => void poll(), 2_000);
      } catch (caught) {
        if (stillCurrent()) applyFailure(caught);
      }
    };
    timer = setTimeout(() => void poll(), 2_000);
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
      if (order.nextAction?.type === "redirect") {
        stagePortalRechargeReturn({
          version: 1,
          orderRef: order.orderRef,
          captureIdempotencyKey: idempotencyKey("capture"),
        });
        callbacksRef.current.paymentRedirect(order.nextAction.url);
      }
    } catch (caught) {
      if (!operationIsCurrent(operationId, capturedClient, capturedSessionRef, capturedGeneration)) return;
      applyFailure(caught);
    } finally {
      if (operationIsCurrent(operationId, capturedClient, capturedSessionRef, capturedGeneration)) {
        setBusy(false);
      }
    }
  }, [applyFailure, client, operationIsCurrent, sessionGeneration, sessionRef]);

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
