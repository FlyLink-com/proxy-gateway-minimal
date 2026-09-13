import { useEffect, useRef, useState } from "react";
import {
  createAdminUserMonitorClient,
  isUserMonitorAccountId,
  parseUserMonitorRange,
  UserMonitorReadError,
  type UserMonitorAccountsPage,
  type UserMonitorBucket,
  type UserMonitorClient,
  type UserMonitorCoins,
  type UserMonitorDirectoryQuery,
  type UserMonitorGrowth,
  type UserMonitorLedgerQuery,
  type UserMonitorRange,
  type UserMonitorTraffic,
  type UserMonitorTrafficQuery
} from "./admin-user-monitor-client";

export type {
  UserMonitorAccountsPage,
  UserMonitorBucket,
  UserMonitorClient,
  UserMonitorCoins,
  UserMonitorDirectoryQuery,
  UserMonitorGrowth,
  UserMonitorLedgerQuery,
  UserMonitorRange,
  UserMonitorTraffic,
  UserMonitorTrafficQuery
};

export type UserMonitorSourceKey = "growth" | "accounts" | "coins" | "traffic";
export type UserMonitorSourceError = "session" | "permission" | "unavailable" | "invalid" | "network" | "timeout";
export type UserMonitorSourceState<T> = {
  phase: "idle" | "loading" | "ready" | "error";
  data: T | null;
  error: UserMonitorSourceError | null;
  fetchedAt: string | null;
};
export type UserMonitorSources = {
  growth: UserMonitorSourceState<UserMonitorGrowth>;
  accounts: UserMonitorSourceState<UserMonitorAccountsPage>;
  coins: UserMonitorSourceState<UserMonitorCoins>;
  traffic: UserMonitorSourceState<UserMonitorTraffic>;
};

const KEYS: UserMonitorSourceKey[] = ["growth", "accounts", "coins", "traffic"];
const SAFE: UserMonitorSourceError[] = ["session", "permission", "unavailable", "invalid", "network", "timeout"];
type Slot = { gen: number; ac: AbortController | null; to: ReturnType<typeof setTimeout> | null; blocked: boolean };

function idle<T>(): UserMonitorSourceState<T> {
  return { phase: "idle", data: null, error: null, fetchedAt: null };
}

function init(): UserMonitorSources {
  return { growth: idle(), accounts: idle(), coins: idle(), traffic: idle() };
}

function rolling24h(): UserMonitorRange {
  const to = Date.now();
  return { from: new Date(to - 86_400_000).toISOString(), to: new Date(to).toISOString() };
}

function codeOf(error: unknown): UserMonitorSourceError {
  if (error instanceof Error && error.name === "AbortError") return "network";
  if (error instanceof UserMonitorReadError && (SAFE as string[]).includes(error.code)) {
    return error.code;
  }
  return "network";
}

function normalizeDir(query: UserMonitorDirectoryQuery): UserMonitorDirectoryQuery {
  const next: UserMonitorDirectoryQuery = { limit: query.limit ?? 20 };
  const accountId = query.accountId?.trim();
  if (accountId) next.accountId = accountId;
  if (query.status) next.status = query.status;
  if (query.cursor) next.cursor = query.cursor;
  return next;
}

export function useAdminUserMonitor(createClient: () => UserMonitorClient = createAdminUserMonitorClient) {
  const [connected, setConnected] = useState(false);
  const [intervalSeconds, setIv] = useState(30);
  const [sources, setSources] = useState(init);
  const [query, setQuery] = useState(rolling24h);
  const [bucket, setBucketState] = useState<UserMonitorBucket>("day");
  const [fixedRange, setFixed] = useState(false);
  const [directory, setDirectory] = useState<UserMonitorDirectoryQuery>({ limit: 20 });
  const [selectedAccountId, setSelected] = useState<string | null>(null);
  const [coinsHasPrev, setCoinsHasPrev] = useState(false);
  const mounted = useRef(true);
  const vis = useRef(typeof document === "undefined" || document.visibilityState !== "hidden");
  const connectedR = useRef(false);
  const queryR = useRef(query);
  const bucketR = useRef<UserMonitorBucket>("day");
  const fixedR = useRef(false);
  const dirR = useRef<UserMonitorDirectoryQuery>({ limit: 20 });
  const selectedR = useRef<string | null>(null);
  const ivR = useRef(30);
  const createR = useRef(createClient);
  const clientR = useRef<UserMonitorClient | null>(null);
  const pollR = useRef<ReturnType<typeof setInterval> | null>(null);
  const resumeAll = useRef(false);
  const coinsCursorR = useRef<string | undefined>(undefined);
  const coinsNextR = useRef<string | null>(null);
  const coinsStackR = useRef<string[]>([]);
  const pendingR = useRef<Record<UserMonitorSourceKey, "explicit" | "resume" | null>>({
    growth: null,
    accounts: null,
    coins: null,
    traffic: null
  });
  const coinsNavR = useRef<{ dir: "next" | "prev"; from: string | undefined; to: string | undefined } | null>(null);
  const slots = useRef<Record<UserMonitorSourceKey, Slot>>({
    growth: { gen: 0, ac: null, to: null, blocked: false },
    accounts: { gen: 0, ac: null, to: null, blocked: false },
    coins: { gen: 0, ac: null, to: null, blocked: false },
    traffic: { gen: 0, ac: null, to: null, blocked: false }
  });
  createR.current = createClient;

  const patch = (key: UserMonitorSourceKey, next: UserMonitorSourceState<never>) => {
    if (!mounted.current) return;
    setSources((s) => ({ ...s, [key]: next }));
  };

  const cancel = (key: UserMonitorSourceKey) => {
    const sl = slots.current[key];
    sl.gen++;
    sl.ac?.abort();
    sl.ac = null;
    if (sl.to) {
      clearTimeout(sl.to);
      sl.to = null;
    }
  };

  const clearPoll = () => {
    if (pollR.current) {
      clearInterval(pollR.current);
      pollR.current = null;
    }
  };

  const rangeQ = (slide: boolean): UserMonitorRange => {
    const parsed = parseUserMonitorRange(queryR.current.from, queryR.current.to);
    if (!parsed) return queryR.current;
    if (!slide || fixedR.current) return parsed;
    const duration = Date.parse(parsed.to) - Date.parse(parsed.from);
    const to = Date.now();
    const next = { from: new Date(to - duration).toISOString(), to: new Date(to).toISOString() };
    queryR.current = next;
    if (mounted.current) setQuery(next);
    return next;
  };

  const currentRange = (): UserMonitorRange => (
    parseUserMonitorRange(queryR.current.from, queryR.current.to) ?? queryR.current
  );

  const load = (
    key: UserMonitorSourceKey,
    kind: "auto" | "manual" | "start" | "apply" | "resume",
    sharedRange?: UserMonitorRange
  ) => {
    if (!connectedR.current || !vis.current) return;
    if ((key === "coins" || key === "traffic") && !selectedR.current) return;
    const sl = slots.current[key];
    if (kind !== "apply" && sl.ac) return;
    if (kind === "auto" && sl.blocked) return;
    if (kind === "auto" && fixedR.current && (key === "growth" || key === "traffic")) return;
    if (kind === "resume" && sl.blocked) return;
    if (kind !== "auto" && kind !== "apply" && kind !== "resume") sl.blocked = false;
    pendingR.current[key] = null;
    const gen = ++sl.gen;
    sl.ac?.abort();
    const ac = new AbortController();
    sl.ac = ac;
    if (sl.to) clearTimeout(sl.to);
    sl.to = setTimeout(() => {
      if (sl.gen !== gen) return;
      sl.gen++;
      ac.abort();
      sl.ac = null;
      sl.to = null;
      patch(key, { phase: "error", data: null, error: "timeout", fetchedAt: null });
    }, 15_000);
    patch(key, { phase: "loading", data: null, error: null, fetchedAt: null });
    const c = clientR.current!;
    const fail = (error: unknown) => {
      if (!mounted.current || sl.gen !== gen) return;
      if (sl.to) {
        clearTimeout(sl.to);
        sl.to = null;
      }
      sl.ac = null;
      if (error instanceof Error && error.name === "AbortError") {
        patch(key, { phase: "error", data: null, error: "network", fetchedAt: null });
        return;
      }
      const nextError = codeOf(error);
      sl.blocked = nextError === "session" || nextError === "permission";
      patch(key, { phase: "error", data: null, error: nextError, fetchedAt: null });
    };
    let run: Promise<unknown>;
    try {
      const range = sharedRange ?? currentRange();
      if (key === "growth") run = c.growth(range, ac.signal);
      else if (key === "accounts") run = c.accounts(dirR.current, ac.signal);
      else if (key === "coins") {
        const q: UserMonitorLedgerQuery = { limit: 20 };
        const cursor = coinsNavR.current ? coinsNavR.current.to : coinsCursorR.current;
        if (cursor) q.cursor = cursor;
        run = c.coins(selectedR.current!, q, ac.signal);
      } else {
        run = c.traffic(selectedR.current!, { ...range, bucket: bucketR.current }, ac.signal);
      }
    } catch (error) {
      fail(error);
      return;
    }
    void run.then((data) => {
      if (!mounted.current || sl.gen !== gen) return;
      if (sl.to) {
        clearTimeout(sl.to);
        sl.to = null;
      }
      sl.ac = null;
      sl.blocked = false;
      if (key === "coins") {
        const page = data as UserMonitorCoins;
        const nav = coinsNavR.current;
        if (nav) {
          if (nav.dir === "next") coinsStackR.current.push(nav.from ?? "");
          else coinsStackR.current.pop();
          coinsCursorR.current = nav.to;
          coinsNavR.current = null;
        }
        coinsNextR.current = page.nextCursor;
        if (mounted.current) setCoinsHasPrev(coinsStackR.current.length > 0);
      }
      patch(key, { phase: "ready", data: data as never, error: null, fetchedAt: new Date().toISOString() });
    }, fail);
  };

  const activeKeys = (): UserMonitorSourceKey[] => (
    selectedR.current ? KEYS : ["growth", "accounts"]
  );

  const loadAll = (kind: "auto" | "manual" | "start") => {
    const slide = (kind === "auto" || kind === "manual") && !fixedR.current;
    const rangeBusy = Boolean(slots.current.growth.ac || (selectedR.current && slots.current.traffic.ac));
    const shared = rangeQ(slide && !rangeBusy);
    for (const key of activeKeys()) load(key, kind, shared);
  };

  const schedule = () => {
    clearPoll();
    if (!connectedR.current || !vis.current || ivR.current <= 0) return;
    pollR.current = setInterval(() => loadAll("auto"), ivR.current * 1000);
  };

  const start = () => {
    if (connectedR.current) return;
    connectedR.current = true;
    setConnected(true);
    clientR.current = createR.current();
    if (vis.current) {
      loadAll("start");
      schedule();
    } else {
      resumeAll.current = true;
    }
  };

  const resetCoinsPage = () => {
    coinsCursorR.current = undefined;
    coinsNextR.current = null;
    coinsStackR.current = [];
    coinsNavR.current = null;
    if (mounted.current) setCoinsHasPrev(false);
  };

  const stop = () => {
    connectedR.current = false;
    setConnected(false);
    clientR.current = null;
    clearPoll();
    resumeAll.current = false;
    pendingR.current = { growth: null, accounts: null, coins: null, traffic: null };
    resetCoinsPage();
    for (const key of KEYS) {
      cancel(key);
      slots.current[key].blocked = false;
    }
    if (mounted.current) setSources(init());
  };

  const applyRange = (range: UserMonitorRange, fixed: boolean) => {
    const parsed = parseUserMonitorRange(range.from, range.to);
    if (!parsed) return;
    queryR.current = parsed;
    fixedR.current = fixed;
    setQuery(parsed);
    setFixed(fixed);
    cancel("growth");
    cancel("traffic");
    pendingR.current.growth = "explicit";
    if (selectedR.current) pendingR.current.traffic = "explicit";
    if (connectedR.current && vis.current) {
      load("growth", "apply");
      if (selectedR.current) load("traffic", "apply");
    } else if (mounted.current) {
      patch("growth", idle());
      if (selectedR.current) patch("traffic", idle());
    }
  };

  const setBucket = (next: UserMonitorBucket) => {
    if (next !== "hour" && next !== "day") return;
    bucketR.current = next;
    setBucketState(next);
    cancel("traffic");
    if (!selectedR.current) return;
    pendingR.current.traffic = "explicit";
    if (connectedR.current && vis.current) load("traffic", "apply");
    else if (mounted.current) patch("traffic", idle());
  };

  const applyDirectory = (nextQuery: UserMonitorDirectoryQuery) => {
    const next = normalizeDir(nextQuery);
    dirR.current = next;
    setDirectory(next);
    cancel("accounts");
    pendingR.current.accounts = "explicit";
    if (connectedR.current && vis.current) load("accounts", "apply");
    else if (mounted.current) patch("accounts", idle());
  };

  const selectAccount = (accountId: string | null) => {
    if (accountId !== null && !isUserMonitorAccountId(accountId)) return;
    if (accountId === selectedR.current) return;
    selectedR.current = accountId;
    setSelected(accountId);
    resetCoinsPage();
    cancel("coins");
    cancel("traffic");
    if (!accountId) {
      pendingR.current.coins = null;
      pendingR.current.traffic = null;
      patch("coins", idle());
      patch("traffic", idle());
      return;
    }
    pendingR.current.coins = "explicit";
    pendingR.current.traffic = "explicit";
    if (connectedR.current && vis.current) {
      load("coins", "apply");
      load("traffic", "apply");
    } else {
      patch("coins", idle());
      patch("traffic", idle());
    }
  };

  const pageCoins = (dir: "next" | "prev") => {
    if (!selectedR.current) return;
    if (slots.current.coins.ac || coinsNavR.current) return;
    if (dir === "next") {
      if (!coinsNextR.current) return;
      coinsNavR.current = { dir: "next", from: coinsCursorR.current, to: coinsNextR.current };
    } else {
      if (coinsStackR.current.length === 0) return;
      const prev = coinsStackR.current[coinsStackR.current.length - 1];
      coinsNavR.current = { dir: "prev", from: coinsCursorR.current, to: prev || undefined };
    }
    pendingR.current.coins = "explicit";
    if (connectedR.current && vis.current) load("coins", "apply");
    else if (mounted.current) patch("coins", idle());
  };

  const setIntervalSeconds = (value: number) => {
    if (value !== 0 && value !== 30 && value !== 60) return;
    ivR.current = value;
    setIv(value);
    schedule();
  };

  useEffect(() => {
    mounted.current = true;
    const onVis = () => {
      const visible = document.visibilityState !== "hidden";
      vis.current = visible;
      if (!visible) {
        clearPoll();
        for (const key of KEYS) {
          if (slots.current[key].ac && !pendingR.current[key]) pendingR.current[key] = "resume";
          cancel(key);
        }
        if (mounted.current) {
          setSources((s) => {
            const next = { ...s };
            for (const key of KEYS) if (next[key].phase === "loading") next[key] = idle();
            return next;
          });
        }
        return;
      }
      if (!connectedR.current) return;
      if (resumeAll.current) {
        resumeAll.current = false;
        pendingR.current = { growth: null, accounts: null, coins: null, traffic: null };
        loadAll("start");
        schedule();
        return;
      }
      for (const key of KEYS) {
        const pending = pendingR.current[key];
        if (!pending) continue;
        if (pending === "resume" && slots.current[key].blocked) {
          pendingR.current[key] = null;
          continue;
        }
        pendingR.current[key] = null;
        load(key, pending === "explicit" ? "apply" : "resume");
      }
      if (ivR.current > 0) loadAll("auto");
      schedule();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      mounted.current = false;
      connectedR.current = false;
      clearPoll();
      for (const key of KEYS) cancel(key);
    };
  }, []);

  return {
    connected,
    intervalSeconds,
    setIntervalSeconds,
    sources,
    query,
    bucket,
    setBucket,
    fixedRange,
    directory,
    selectedAccountId,
    coinsHasPrev,
    start,
    stop,
    refresh: () => loadAll("manual"),
    retry: (key: UserMonitorSourceKey) => load(key, "manual"),
    applyRange,
    applyDirectory,
    selectAccount,
    pageCoins
  };
}
