import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState
} from "react";
import type {
  PortalWalletClient,
  PortalWalletLedgerEntry,
  PortalWalletSummary
} from "./api-contract";
import { PortalWalletClientError } from "./wallet-client";

export type ReadState<T> =
  | { phase: "loading" }
  | { phase: "ready"; value: T }
  | { phase: "empty"; value: T }
  | { phase: "unavailable"; retryable: boolean }
  | { phase: "error"; retryable: boolean };

export type PortalWalletLedgerPageError = {
  phase: "unavailable" | "error";
  retryable: boolean;
};

export type PortalWalletReadModel = {
  summary: ReadState<PortalWalletSummary>;
  ledger: ReadState<PortalWalletLedgerEntry[]>;
  nextLedgerCursor: {
    afterOccurredAt: string;
    afterEntryRef: string;
  } | null;
  loadingMoreLedger: boolean;
  loadMoreLedgerError: PortalWalletLedgerPageError | null;
  summaryRefreshError?: PortalWalletLedgerPageError | null;
  ledgerRefreshError?: PortalWalletLedgerPageError | null;
  ledgerAutoRefreshPaused?: boolean;
  retrySummary: () => void;
  retryLedger: () => void;
  refreshWallet: () => void;
  loadMoreLedger: () => void;
};

export type UsePortalWalletReadModelInput = {
  client: PortalWalletClient | null;
  sessionRef: string | null;
  sessionGeneration: number;
  loadLedger: boolean;
  onSessionInvalid: () => void;
};

const INACTIVE_STATE = {
  phase: "unavailable",
  retryable: false
} as const;

type WalletIdentity = Pick<UsePortalWalletReadModelInput, "client" | "sessionRef" | "sessionGeneration">;
type ReadFlight<T> = WalletIdentity & { promise: Promise<T>; settled: boolean; invalidated: boolean };
type LedgerPage = Awaited<ReturnType<PortalWalletClient["listLedger"]>>;
const AUTO_REFRESH_MS = 30_000;
const EVENT_REFRESH_THROTTLE_MS = 5_000;

function sameIdentity(left: WalletIdentity | null, right: WalletIdentity) {
  return left !== null && left.client === right.client
    && left.sessionRef === right.sessionRef && left.sessionGeneration === right.sessionGeneration;
}

function flightIsPending<T>(flight: ReadFlight<T> | null, identity: WalletIdentity) {
  return sameIdentity(flight, identity) && !flight!.settled;
}

function hasValue<T>(state: ReadState<T>): state is Extract<ReadState<T>, { value: T }> {
  return state.phase === "ready" || state.phase === "empty";
}

function failureState(error: unknown): {
  kind: "session_invalid";
} | {
  kind: "state";
  state:
    | { phase: "unavailable"; retryable: boolean }
    | { phase: "error"; retryable: boolean };
} {
  if (!(error instanceof PortalWalletClientError)) {
    return {
      kind: "state",
      state: { phase: "error", retryable: true }
    };
  }
  switch (error.code) {
    case "wallet_session_invalid":
      return { kind: "session_invalid" };
    case "wallet_unavailable":
      return {
        kind: "state",
        state: { phase: "unavailable", retryable: true }
      };
    case "wallet_request_invalid":
      return {
        kind: "state",
        state: { phase: "error", retryable: false }
      };
    case "wallet_request_failed":
      return {
        kind: "state",
        state: { phase: "error", retryable: true }
      };
  }
}

function sameCursor(
  left: PortalWalletReadModel["nextLedgerCursor"],
  right: PortalWalletReadModel["nextLedgerCursor"]
) {
  return Boolean(
    left
    && right
    && left.afterOccurredAt === right.afterOccurredAt
    && left.afterEntryRef === right.afterEntryRef
  );
}

export function usePortalWalletReadModel({
  client,
  sessionRef,
  sessionGeneration,
  loadLedger,
  onSessionInvalid
}: UsePortalWalletReadModelInput): PortalWalletReadModel {
  const [summary, setSummary] =
    useState<ReadState<PortalWalletSummary>>(INACTIVE_STATE);
  const [ledger, setLedger] =
    useState<ReadState<PortalWalletLedgerEntry[]>>(INACTIVE_STATE);
  const [nextLedgerCursor, setNextLedgerCursor] =
    useState<PortalWalletReadModel["nextLedgerCursor"]>(null);
  const [loadingMoreLedger, setLoadingMoreLedger] = useState(false);
  const [loadMoreLedgerError, setLoadMoreLedgerError] =
    useState<PortalWalletLedgerPageError | null>(null);
  const [summaryRefreshError, setSummaryRefreshError] = useState<PortalWalletLedgerPageError | null>(null);
  const [ledgerRefreshError, setLedgerRefreshError] = useState<PortalWalletLedgerPageError | null>(null);
  const [ledgerAutoRefreshPaused, setLedgerAutoRefreshPaused] = useState(false);
  const [summaryRevision, setSummaryRevision] = useState(0);
  const [ledgerRevision, setLedgerRevision] = useState(0);
  const wasLedgerOpenRef = useRef(loadLedger);
  const mountedRef = useRef(true);
  const summaryRequestIdRef = useRef(0);
  const ledgerRequestIdRef = useRef(0);
  const ledgerPageRequestIdRef = useRef(0);
  const ledgerStateRef = useRef(ledger);
  const summaryStateRef = useRef(summary);
  const summaryOwnerRef = useRef<WalletIdentity | null>(null);
  const ledgerOwnerRef = useRef<WalletIdentity | null>(null);
  const summaryFlightRef = useRef<ReadFlight<PortalWalletSummary> | null>(null);
  const ledgerFlightRef = useRef<ReadFlight<LedgerPage> | null>(null);
  const pendingSummaryRefreshRef = useRef(false);
  const pendingLedgerRefreshRef = useRef(false);
  const ledgerAutoRefreshPausedRef = useRef(false);
  const lastRefreshStartedAtRef = useRef(0);
  const nextLedgerCursorRef = useRef(nextLedgerCursor);
  const onSessionInvalidRef = useRef(onSessionInvalid);
  const currentInputRef = useRef({
    client,
    loadLedger,
    sessionGeneration,
    sessionRef
  });
  const loadMoreInFlightRef = useRef<{
    cursorKey: string;
    pageRequestId: number;
  } | null>(null);

  useLayoutEffect(() => {
    if (!sameIdentity(currentInputRef.current, { client, sessionRef, sessionGeneration })) {
      pendingSummaryRefreshRef.current = false;
      pendingLedgerRefreshRef.current = false;
      ledgerAutoRefreshPausedRef.current = false;
      setLedgerAutoRefreshPaused(false);
      setSummaryRefreshError(null);
      setLedgerRefreshError(null);
    }
    ledgerStateRef.current = ledger;
    summaryStateRef.current = summary;
    nextLedgerCursorRef.current = nextLedgerCursor;
    onSessionInvalidRef.current = onSessionInvalid;
    currentInputRef.current = {
      client,
      loadLedger,
      sessionGeneration,
      sessionRef
    };
  }, [
    client,
    ledger,
    loadLedger,
    nextLedgerCursor,
    onSessionInvalid,
    sessionGeneration,
    sessionRef,
    summary
  ]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      summaryRequestIdRef.current += 1;
      ledgerRequestIdRef.current += 1;
      ledgerPageRequestIdRef.current += 1;
      loadMoreInFlightRef.current = null;
      pendingSummaryRefreshRef.current = false;
      pendingLedgerRefreshRef.current = false;
    };
  }, []);

  useEffect(() => {
    const didOpenLedger = loadLedger && !wasLedgerOpenRef.current;
    wasLedgerOpenRef.current = loadLedger;
    if (didOpenLedger) {
      setSummaryRevision((revision) => revision + 1);
    }
  }, [loadLedger]);

  const summaryRequestIsCurrent = useCallback((
    requestId: number,
    capturedClient: PortalWalletClient,
    capturedSessionRef: string,
    capturedGeneration: number
  ) => {
    const current = currentInputRef.current;
    return mountedRef.current
      && summaryRequestIdRef.current === requestId
      && current.client === capturedClient
      && current.sessionRef === capturedSessionRef
      && current.sessionGeneration === capturedGeneration;
  }, []);

  const ledgerRequestIsCurrent = useCallback((
    requestId: number,
    capturedClient: PortalWalletClient,
    capturedSessionRef: string,
    capturedGeneration: number
  ) => {
    const current = currentInputRef.current;
    return mountedRef.current
      && ledgerRequestIdRef.current === requestId
      && current.client === capturedClient
      && current.sessionRef === capturedSessionRef
      && current.sessionGeneration === capturedGeneration
      && current.loadLedger;
  }, []);

  useEffect(() => {
    const requestId = summaryRequestIdRef.current + 1;
    summaryRequestIdRef.current = requestId;
    if (!client || !sessionRef) {
      setSummary(INACTIVE_STATE);
      setSummaryRefreshError(null);
      return;
    }
    const capturedClient = client;
    const capturedSessionRef = sessionRef;
    const capturedGeneration = sessionGeneration;
    const identity = { client, sessionRef, sessionGeneration };
    const preserveValue = sameIdentity(summaryOwnerRef.current, identity) && hasValue(summaryStateRef.current);
    summaryOwnerRef.current = identity;
    if (!preserveValue) {
      setSummary({ phase: "loading" });
      setSummaryRefreshError(null);
    }
    lastRefreshStartedAtRef.current = Date.now();
    // Reuse an unresolved read during the StrictMode effect probe or a view
    // transition. Explicit mutation invalidations queue one successor instead.
    const existingFlight = summaryFlightRef.current;
    const flight: ReadFlight<PortalWalletSummary> = flightIsPending(existingFlight, identity)
      ? existingFlight!
      : { ...identity, settled: false, invalidated: false, promise: Promise.resolve().then(() => capturedClient.getSummary({ sessionRef: capturedSessionRef })) };
    summaryFlightRef.current = flight;
    void flight.promise.then((value) => {
      flight.settled = true;
      if (flight.invalidated) return;
      if (!summaryRequestIsCurrent(
        requestId,
        capturedClient,
        capturedSessionRef,
        capturedGeneration
      )) {
        return;
      }
      setSummary(
        value.status === "not_created"
          ? { phase: "empty", value }
          : { phase: "ready", value }
      );
      setSummaryRefreshError(null);
    }).catch((error: unknown) => {
      flight.settled = true;
      if (!summaryRequestIsCurrent(
        requestId,
        capturedClient,
        capturedSessionRef,
        capturedGeneration
      )) {
        return;
      }
      const failure = failureState(error);
      if (failure.kind === "session_invalid") {
        onSessionInvalidRef.current();
        return;
      }
      if (flight.invalidated) return;
      if (preserveValue) setSummaryRefreshError(failure.state);
      else setSummary(failure.state);
    }).finally(() => {
      if (summaryFlightRef.current === flight && summaryRequestIsCurrent(requestId, capturedClient, capturedSessionRef, capturedGeneration)) {
        summaryFlightRef.current = null;
        if (pendingSummaryRefreshRef.current) {
          pendingSummaryRefreshRef.current = false;
          setSummaryRevision((revision) => revision + 1);
        }
      }
    });
    return () => {
      if (summaryRequestIdRef.current === requestId) {
        summaryRequestIdRef.current += 1;
      }
    };
  }, [
    client,
    sessionGeneration,
    sessionRef,
    summaryRequestIsCurrent,
    summaryRevision
  ]);

  useEffect(() => {
    const requestId = ledgerRequestIdRef.current + 1;
    ledgerRequestIdRef.current = requestId;
    ledgerPageRequestIdRef.current += 1;
    loadMoreInFlightRef.current = null;
    setLoadingMoreLedger(false);
    setLoadMoreLedgerError(null);
    if (!client || !sessionRef || !loadLedger) {
      if (flightIsPending(ledgerFlightRef.current, { client, sessionRef, sessionGeneration })) {
        ledgerFlightRef.current!.invalidated = true;
      }
      setLedger(INACTIVE_STATE);
      setNextLedgerCursor(null);
      setLedgerRefreshError(null);
      pendingLedgerRefreshRef.current = false;
      ledgerAutoRefreshPausedRef.current = false;
      setLedgerAutoRefreshPaused(false);
      return;
    }
    const capturedClient = client;
    const capturedSessionRef = sessionRef;
    const capturedGeneration = sessionGeneration;
    const identity = { client, sessionRef, sessionGeneration };
    const preserveValue = sameIdentity(ledgerOwnerRef.current, identity) && hasValue(ledgerStateRef.current);
    ledgerOwnerRef.current = identity;
    if (!preserveValue) {
      setLedger({ phase: "loading" });
      setNextLedgerCursor(null);
      setLedgerRefreshError(null);
    }
    lastRefreshStartedAtRef.current = Date.now();
    const existingFlight = ledgerFlightRef.current;
    const flight: ReadFlight<LedgerPage> = flightIsPending(existingFlight, identity)
      ? existingFlight!
      : { ...identity, settled: false, invalidated: false, promise: Promise.resolve().then(() => capturedClient.listLedger({ sessionRef: capturedSessionRef, limit: 25 })) };
    ledgerFlightRef.current = flight;
    // A request retained across a closed Wallet may predate a purchase made
    // elsewhere. Preserve single-flight, but always follow it with a fresh page.
    if (flight.invalidated) pendingLedgerRefreshRef.current = true;
    void flight.promise.then((page) => {
      flight.settled = true;
      if (flight.invalidated) return;
      if (!ledgerRequestIsCurrent(
        requestId,
        capturedClient,
        capturedSessionRef,
        capturedGeneration
      )) {
        return;
      }
      setLedger(
        page.entries.length === 0
          ? { phase: "empty", value: [] }
          : { phase: "ready", value: page.entries }
      );
      setNextLedgerCursor(page.nextCursor);
      setLedgerRefreshError(null);
      ledgerAutoRefreshPausedRef.current = false;
      setLedgerAutoRefreshPaused(false);
    }).catch((error: unknown) => {
      flight.settled = true;
      if (!ledgerRequestIsCurrent(
        requestId,
        capturedClient,
        capturedSessionRef,
        capturedGeneration
      )) {
        return;
      }
      const failure = failureState(error);
      if (failure.kind === "session_invalid") {
        onSessionInvalidRef.current();
        return;
      }
      if (flight.invalidated) return;
      if (preserveValue) setLedgerRefreshError(failure.state);
      else {
        setLedger(failure.state);
        setNextLedgerCursor(null);
      }
    }).finally(() => {
      if (ledgerFlightRef.current === flight && ledgerRequestIsCurrent(requestId, capturedClient, capturedSessionRef, capturedGeneration)) {
        ledgerFlightRef.current = null;
        if (pendingLedgerRefreshRef.current) {
          pendingLedgerRefreshRef.current = false;
          setLedgerRevision((revision) => revision + 1);
        }
      }
    });
    return () => {
      if (ledgerRequestIdRef.current === requestId) {
        ledgerRequestIdRef.current += 1;
      }
      ledgerPageRequestIdRef.current += 1;
      loadMoreInFlightRef.current = null;
    };
  }, [
    client,
    ledgerRequestIsCurrent,
    ledgerRevision,
    loadLedger,
    sessionGeneration,
    sessionRef
  ]);

  const retrySummary = useCallback(() => {
    const current = currentInputRef.current;
    if (!mountedRef.current || !current.client || !current.sessionRef) return;
    if (flightIsPending(summaryFlightRef.current, current)) {
      summaryFlightRef.current!.invalidated = true;
      pendingSummaryRefreshRef.current = true;
      return;
    }
    lastRefreshStartedAtRef.current = Date.now();
    setSummaryRevision((revision) => revision + 1);
  }, []);

  const retryLedger = useCallback(() => {
    const current = currentInputRef.current;
    if (!mountedRef.current || !current.client || !current.sessionRef || !current.loadLedger) return;
    if (flightIsPending(ledgerFlightRef.current, current) || loadMoreInFlightRef.current) {
      if (flightIsPending(ledgerFlightRef.current, current)) ledgerFlightRef.current!.invalidated = true;
      pendingLedgerRefreshRef.current = true;
      return;
    }
    lastRefreshStartedAtRef.current = Date.now();
    setLedgerRevision((revision) => revision + 1);
  }, []);

  const refreshWallet = useCallback(() => {
    retrySummary();
    retryLedger();
  }, [retrySummary, retryLedger]);

  useEffect(() => {
    if (!client || !sessionRef || !loadLedger) return;
    let timer: ReturnType<typeof setInterval> | null = null;
    const eligible = () => mountedRef.current && currentInputRef.current.loadLedger
      && document.visibilityState !== "hidden" && navigator.onLine !== false;
    const refresh = () => {
      const current = currentInputRef.current;
      if (!eligible() || Date.now() - lastRefreshStartedAtRef.current < EVENT_REFRESH_THROTTLE_MS
        || flightIsPending(summaryFlightRef.current, current)
        || flightIsPending(ledgerFlightRef.current, current) || loadMoreInFlightRef.current) return;
      lastRefreshStartedAtRef.current = Date.now();
      setSummaryRevision((revision) => revision + 1);
      if (!ledgerAutoRefreshPausedRef.current) setLedgerRevision((revision) => revision + 1);
    };
    const reconcileTimer = () => {
      if (timer !== null) clearInterval(timer);
      timer = eligible() ? setInterval(refresh, AUTO_REFRESH_MS) : null;
    };
    const onEnvironmentChange = () => { reconcileTimer(); refresh(); };
    reconcileTimer();
    document.addEventListener("visibilitychange", onEnvironmentChange);
    window.addEventListener("focus", refresh);
    window.addEventListener("online", onEnvironmentChange);
    window.addEventListener("offline", onEnvironmentChange);
    return () => {
      if (timer !== null) clearInterval(timer);
      document.removeEventListener("visibilitychange", onEnvironmentChange);
      window.removeEventListener("focus", refresh);
      window.removeEventListener("online", onEnvironmentChange);
      window.removeEventListener("offline", onEnvironmentChange);
    };
  }, [client, loadLedger, sessionGeneration, sessionRef]);

  const loadMoreLedger = useCallback(() => {
    const cursor = nextLedgerCursorRef.current;
    const currentLedger = ledgerStateRef.current;
    if (
      !client
      || !sessionRef
      || !loadLedger
      || !cursor
      || currentLedger.phase !== "ready"
      || flightIsPending(ledgerFlightRef.current, currentInputRef.current)
    ) {
      return;
    }
    const cursorKey = `${cursor.afterOccurredAt}\n${cursor.afterEntryRef}`;
    if (loadMoreInFlightRef.current?.cursorKey === cursorKey) return;
    const channelRequestId = ledgerRequestIdRef.current;
    const pageRequestId = ledgerPageRequestIdRef.current + 1;
    ledgerPageRequestIdRef.current = pageRequestId;
    const flight = { cursorKey, pageRequestId };
    loadMoreInFlightRef.current = flight;
    // Once browsing history, retain the loaded page/cursor until an explicit
    // first-page refresh or leaving Wallet. Polling must not remove older rows.
    ledgerAutoRefreshPausedRef.current = true;
    setLedgerAutoRefreshPaused(true);
    const capturedClient = client;
    const capturedSessionRef = sessionRef;
    const capturedGeneration = sessionGeneration;
    const capturedCursor = { ...cursor };
    setLoadingMoreLedger(true);
    setLoadMoreLedgerError(null);
    void capturedClient.listLedger({
      sessionRef: capturedSessionRef,
      limit: 25,
      ...capturedCursor
    }).then((page) => {
      if (pendingLedgerRefreshRef.current) return;
      if (
        !ledgerRequestIsCurrent(
          channelRequestId,
          capturedClient,
          capturedSessionRef,
          capturedGeneration
        )
        || ledgerPageRequestIdRef.current !== pageRequestId
        || !sameCursor(nextLedgerCursorRef.current, capturedCursor)
      ) {
        return;
      }
      const current = ledgerStateRef.current;
      if (current.phase !== "ready") return;
      const seenEntryRefs = new Set(
        current.value.map((entry) => entry.entryRef)
      );
      if (page.entries.some((entry) => seenEntryRefs.has(entry.entryRef))) {
        setLoadMoreLedgerError({ phase: "error", retryable: true });
        return;
      }
      setLedger({
        phase: "ready",
        value: [...current.value, ...page.entries]
      });
      setNextLedgerCursor(page.nextCursor);
      setLoadMoreLedgerError(null);
    }).catch((error: unknown) => {
      if (
        !ledgerRequestIsCurrent(
          channelRequestId,
          capturedClient,
          capturedSessionRef,
          capturedGeneration
        )
        || ledgerPageRequestIdRef.current !== pageRequestId
        || !sameCursor(nextLedgerCursorRef.current, capturedCursor)
      ) {
        return;
      }
      const failure = failureState(error);
      if (failure.kind === "session_invalid") {
        onSessionInvalidRef.current();
        return;
      }
      setLoadMoreLedgerError(failure.state);
    }).finally(() => {
      if (loadMoreInFlightRef.current === flight) {
        loadMoreInFlightRef.current = null;
        setLoadingMoreLedger(false);
        if (pendingLedgerRefreshRef.current && ledgerRequestIsCurrent(channelRequestId, capturedClient, capturedSessionRef, capturedGeneration)) {
          pendingLedgerRefreshRef.current = false;
          setLedgerRevision((revision) => revision + 1);
        }
      }
    });
  }, [
    client,
    ledgerRequestIsCurrent,
    loadLedger,
    sessionGeneration,
    sessionRef
  ]);

  const identity = { client, sessionRef, sessionGeneration };
  const summaryOwned = sameIdentity(summaryOwnerRef.current, identity) && Boolean(client && sessionRef);
  const ledgerOwned = sameIdentity(ledgerOwnerRef.current, identity) && Boolean(client && sessionRef && loadLedger);
  return {
    // Mask stale owners during render, before effects run, so switching account
    // generations cannot paint or hand a parent the previous account's values.
    summary: summaryOwned ? summary : client && sessionRef ? { phase: "loading" } : INACTIVE_STATE,
    ledger: ledgerOwned ? ledger : client && sessionRef && loadLedger ? { phase: "loading" } : INACTIVE_STATE,
    nextLedgerCursor: ledgerOwned ? nextLedgerCursor : null,
    loadingMoreLedger,
    loadMoreLedgerError,
    summaryRefreshError: summaryOwned ? summaryRefreshError : null,
    ledgerRefreshError: ledgerOwned ? ledgerRefreshError : null,
    ledgerAutoRefreshPaused: ledgerOwned && ledgerAutoRefreshPaused,
    retrySummary,
    retryLedger,
    refreshWallet,
    loadMoreLedger
  };
}
