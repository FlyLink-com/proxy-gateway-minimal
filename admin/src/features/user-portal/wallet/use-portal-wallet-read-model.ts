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

export type PortalWalletReadModel = {
  summary: ReadState<PortalWalletSummary>;
  ledger: ReadState<PortalWalletLedgerEntry[]>;
  nextLedgerCursor: {
    afterOccurredAt: string;
    afterEntryRef: string;
  } | null;
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
  const [summaryRevision, setSummaryRevision] = useState(0);
  const [ledgerRevision, setLedgerRevision] = useState(0);
  const wasLedgerOpenRef = useRef(loadLedger);
  const mountedRef = useRef(true);
  const summaryRequestIdRef = useRef(0);
  const ledgerRequestIdRef = useRef(0);
  const ledgerPageRequestIdRef = useRef(0);
  const ledgerStateRef = useRef(ledger);
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
    ledgerStateRef.current = ledger;
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
    sessionRef
  ]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      summaryRequestIdRef.current += 1;
      ledgerRequestIdRef.current += 1;
      ledgerPageRequestIdRef.current += 1;
      loadMoreInFlightRef.current = null;
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
      return;
    }
    const capturedClient = client;
    const capturedSessionRef = sessionRef;
    const capturedGeneration = sessionGeneration;
    setSummary({ phase: "loading" });
    void capturedClient.getSummary({
      sessionRef: capturedSessionRef
    }).then((value) => {
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
    }).catch((error: unknown) => {
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
      setSummary(failure.state);
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
    setNextLedgerCursor(null);
    if (!client || !sessionRef || !loadLedger) {
      setLedger(INACTIVE_STATE);
      return;
    }
    const capturedClient = client;
    const capturedSessionRef = sessionRef;
    const capturedGeneration = sessionGeneration;
    setLedger({ phase: "loading" });
    void capturedClient.listLedger({
      sessionRef: capturedSessionRef,
      limit: 25
    }).then((page) => {
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
    }).catch((error: unknown) => {
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
      setLedger(failure.state);
      setNextLedgerCursor(null);
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
    setSummaryRevision((revision) => revision + 1);
  }, []);

  const retryLedger = useCallback(() => {
    setLedgerRevision((revision) => revision + 1);
  }, []);

  const refreshWallet = useCallback(() => {
    setSummaryRevision((revision) => revision + 1);
    if (loadLedger) {
      setLedgerRevision((revision) => revision + 1);
    }
  }, [loadLedger]);

  const loadMoreLedger = useCallback(() => {
    const cursor = nextLedgerCursorRef.current;
    const currentLedger = ledgerStateRef.current;
    if (
      !client
      || !sessionRef
      || !loadLedger
      || !cursor
      || currentLedger.phase !== "ready"
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
    const capturedClient = client;
    const capturedSessionRef = sessionRef;
    const capturedGeneration = sessionGeneration;
    const capturedCursor = { ...cursor };
    void capturedClient.listLedger({
      sessionRef: capturedSessionRef,
      limit: 25,
      ...capturedCursor
    }).then((page) => {
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
        setLedger({ phase: "error", retryable: true });
        setNextLedgerCursor(null);
        return;
      }
      setLedger({
        phase: "ready",
        value: [...current.value, ...page.entries]
      });
      setNextLedgerCursor(page.nextCursor);
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
      setLedger(failure.state);
      setNextLedgerCursor(null);
    }).finally(() => {
      if (loadMoreInFlightRef.current === flight) {
        loadMoreInFlightRef.current = null;
      }
    });
  }, [
    client,
    ledgerRequestIsCurrent,
    loadLedger,
    sessionGeneration,
    sessionRef
  ]);

  return {
    summary,
    ledger,
    nextLedgerCursor,
    retrySummary,
    retryLedger,
    refreshWallet,
    loadMoreLedger
  };
}
