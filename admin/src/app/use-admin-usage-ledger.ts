import { useEffect, useRef, useState } from "react";
import {
  createAdminUsageLedgerClient,
  UsageLedgerReadError,
  type AdminUsageLedgerSummary,
  type UsageLedgerClient,
  type UsageLedgerErrorCode
} from "./admin-usage-ledger-client";

export type {
  AdminUsageLedgerSummary,
  UsageLedgerClient,
  UsageLedgerErrorCode
};

export type UsageLedgerHookError = UsageLedgerErrorCode | "timeout";
export type UsageLedgerPhase = "idle" | "loading" | "ready" | "error";
export type UsageLedgerHookState = {
  phase: UsageLedgerPhase;
  data: AdminUsageLedgerSummary | null;
  error: UsageLedgerHookError | null;
  fetchedAt: string | null;
};

const TIMEOUT_MS = 15_000;
const SAFE: UsageLedgerHookError[] = ["session", "permission", "unavailable", "invalid", "network", "timeout"];

function idle(): UsageLedgerHookState {
  return { phase: "idle", data: null, error: null, fetchedAt: null };
}

function codeOf(error: unknown): UsageLedgerHookError {
  if (error instanceof Error && error.name === "AbortError") return "network";
  if (error instanceof UsageLedgerReadError && (SAFE as string[]).includes(error.code)) {
    return error.code;
  }
  return "network";
}

export function useAdminUsageLedger(createClient: () => UsageLedgerClient = createAdminUsageLedgerClient) {
  const [state, setState] = useState<UsageLedgerHookState>(idle);
  const mounted = useRef(true);
  const gen = useRef(0);
  const ac = useRef<AbortController | null>(null);
  const timeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const createR = useRef(createClient);
  const firstFactory = useRef(true);

  const cancel = () => {
    gen.current += 1;
    ac.current?.abort();
    ac.current = null;
    if (timeout.current) {
      clearTimeout(timeout.current);
      timeout.current = null;
    }
  };

  const load = () => {
    if (!mounted.current) return;
    const requestGen = gen.current + 1;
    cancel();
    gen.current = requestGen;
    const controller = new AbortController();
    ac.current = controller;
    timeout.current = setTimeout(() => {
      if (gen.current !== requestGen) return;
      gen.current += 1;
      controller.abort();
      ac.current = null;
      timeout.current = null;
      if (mounted.current) {
        setState({ phase: "error", data: null, error: "timeout", fetchedAt: null });
      }
    }, TIMEOUT_MS);
    setState({ phase: "loading", data: null, error: null, fetchedAt: null });
    let run: Promise<AdminUsageLedgerSummary>;
    try {
      run = createR.current().summary(controller.signal);
    } catch (error) {
      if (!mounted.current || gen.current !== requestGen) return;
      if (timeout.current) {
        clearTimeout(timeout.current);
        timeout.current = null;
      }
      ac.current = null;
      setState({ phase: "error", data: null, error: codeOf(error), fetchedAt: null });
      return;
    }
    void run.then(
      (data) => {
        if (!mounted.current || gen.current !== requestGen) return;
        if (timeout.current) {
          clearTimeout(timeout.current);
          timeout.current = null;
        }
        ac.current = null;
        setState({ phase: "ready", data, error: null, fetchedAt: new Date().toISOString() });
      },
      (error) => {
        if (!mounted.current || gen.current !== requestGen) return;
        if (timeout.current) {
          clearTimeout(timeout.current);
          timeout.current = null;
        }
        ac.current = null;
        if (error instanceof Error && error.name === "AbortError") {
          setState({ phase: "error", data: null, error: "network", fetchedAt: null });
          return;
        }
        setState({ phase: "error", data: null, error: codeOf(error), fetchedAt: null });
      }
    );
  };

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      cancel();
    };
  }, []);

  useEffect(() => {
    if (firstFactory.current) {
      firstFactory.current = false;
      createR.current = createClient;
      return;
    }
    createR.current = createClient;
    cancel();
    if (mounted.current) setState(idle());
  }, [createClient]);

  return {
    // Hide the previous auth/client owner's data during render, before effect cleanup.
    ...(createR.current === createClient ? state : idle()),
    load,
    refresh: load
  };
}
