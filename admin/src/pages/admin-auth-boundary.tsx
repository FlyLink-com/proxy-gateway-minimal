import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode
} from "react";
import {
  AdminAuthError,
  createAdminAuthClient,
  type AdminAuthClient,
  type AdminAuthErrorCode
} from "../app/admin-auth-client";

const REQUEST_TIMEOUT_MS = 15_000;
const MAX_TIMEOUT_MS = 2_147_483_647;

type View =
  | "session"
  | "login"
  | "setup"
  | "challenge"
  | "ready"
  | "logout_unconfirmed";

const ERROR_COPY: Record<AdminAuthErrorCode, string> = {
  session: "登录状态已失效，请重新登录。",
  permission: "当前账户没有管理权限。",
  rate_limited: "尝试过于频繁，请稍后再试。",
  unavailable: "服务暂时不可用，请稍后重试。",
  invalid: "请求无效，请检查输入后重试。",
  network: "网络异常，请检查连接后重试。"
};

function safeErrorCopy(error: unknown): string {
  if (error instanceof AdminAuthError) {
    return ERROR_COPY[error.code];
  }
  if (error instanceof DOMException && error.name === "AbortError") {
    return ERROR_COPY.network;
  }
  return ERROR_COPY.invalid;
}

function delayUntil(iso: string): number {
  const at = Date.parse(iso);
  if (!Number.isFinite(at)) {
    return 0;
  }
  return Math.max(0, Math.min(at - Date.now(), MAX_TIMEOUT_MS));
}

export function AdminAuthBoundary({
  children,
  createClient
}: {
  children: (controls: { onSessionExpired: () => void }) => ReactNode;
  createClient?: () => AdminAuthClient;
}) {
  const clientRef = useRef<AdminAuthClient | null>(null);
  if (!clientRef.current) {
    clientRef.current = (createClient ?? createAdminAuthClient)();
  }
  const client = clientRef.current;

  const [view, setView] = useState<View>("session");
  const [operatorRef, setOperatorRef] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [challengeRef, setChallengeRef] = useState<string | null>(null);
  const [challengeExpiresAt, setChallengeExpiresAt] = useState<string | null>(null);
  const [sessionExpiresAt, setSessionExpiresAt] = useState<string | null>(null);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const generationRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);
  const timerRef = useRef<number | null>(null);
  const busyRef = useRef(false);
  const mountedRef = useRef(true);

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const abortPendingRequest = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
  }, []);

  const beginRequest = useCallback(() => {
    abortPendingRequest();
    generationRef.current += 1;
    const generation = generationRef.current;
    const controller = new AbortController();
    abortRef.current = controller;
    const timeout = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    return {
      generation,
      signal: controller.signal,
      finish() {
        window.clearTimeout(timeout);
        if (abortRef.current === controller) {
          abortRef.current = null;
        }
      }
    };
  }, [abortPendingRequest]);

  const invalidateInFlight = useCallback(() => {
    abortPendingRequest();
    generationRef.current += 1;
    busyRef.current = false;
    setLoading(false);
  }, [abortPendingRequest]);

  const isCurrent = useCallback((generation: number, signal?: AbortSignal) => {
    return mountedRef.current && generation === generationRef.current && !signal?.aborted;
  }, []);

  const clearBusyIfGeneration = useCallback((generation: number) => {
    if (mountedRef.current && generation === generationRef.current) {
      busyRef.current = false;
      setLoading(false);
    }
  }, []);

  const resetSecrets = useCallback(() => {
    setPassword("");
    setCode("");
    setChallengeRef(null);
    setChallengeExpiresAt(null);
  }, []);

  const expireSession = useCallback(() => {
    clearTimer();
    invalidateInFlight();
    setSessionExpiresAt(null);
    resetSecrets();
    setErrorText(ERROR_COPY.session);
    setView("login");
  }, [clearTimer, invalidateInFlight, resetSecrets]);

  const expireChallenge = useCallback(() => {
    clearTimer();
    invalidateInFlight();
    resetSecrets();
    setErrorText("验证已过期，请重新登录。");
    setView("login");
  }, [clearTimer, invalidateInFlight, resetSecrets]);

  const onSessionExpired = useCallback(() => {
    expireSession();
  }, [expireSession]);

  const loadSession = useCallback(async () => {
    if (busyRef.current) {
      return;
    }
    busyRef.current = true;
    setLoading(true);
    setErrorText(null);
    const req = beginRequest();
    try {
      const status = await client.session(req.signal);
      if (!isCurrent(req.generation, req.signal)) {
        return;
      }
      if (status.authenticated) {
        setSessionExpiresAt(status.expiresAt);
        resetSecrets();
        setView("ready");
        return;
      }
      setSessionExpiresAt(null);
      if (status.operatorRef) {
        setOperatorRef(status.operatorRef);
      }
      if (status.setupRequired) {
        resetSecrets();
        setView("setup");
        return;
      }
      resetSecrets();
      setView("login");
    } catch (error) {
      if (!mountedRef.current || req.generation !== generationRef.current) {
        return;
      }
      if (error instanceof AdminAuthError && error.code === "session") {
        expireSession();
        return;
      }
      setView("session");
      setErrorText(safeErrorCopy(error));
    } finally {
      req.finish();
      clearBusyIfGeneration(req.generation);
    }
  }, [beginRequest, clearBusyIfGeneration, client, expireSession, isCurrent, resetSecrets]);

  useEffect(() => {
    mountedRef.current = true;
    void loadSession();
    return () => {
      mountedRef.current = false;
      clearTimer();
      invalidateInFlight();
    };
  }, [clearTimer, invalidateInFlight, loadSession]);

  useEffect(() => {
    clearTimer();
    if (view === "ready" && sessionExpiresAt) {
      timerRef.current = window.setTimeout(expireSession, delayUntil(sessionExpiresAt));
    }
    if (view === "challenge" && challengeExpiresAt) {
      timerRef.current = window.setTimeout(expireChallenge, delayUntil(challengeExpiresAt));
    }
    return () => {
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [view, sessionExpiresAt, challengeExpiresAt, clearTimer, expireSession, expireChallenge]);

  const submitLogin = useCallback(
    async (event: React.FormEvent) => {
      event.preventDefault();
      if (busyRef.current) {
        return;
      }
      const capturedPassword = password;
      setPassword("");
      busyRef.current = true;
      setLoading(true);
      setErrorText(null);
      const req = beginRequest();
      try {
        const challenge = await client.login(
          { operatorRef, password: capturedPassword },
          req.signal
        );
        if (!isCurrent(req.generation, req.signal)) {
          return;
        }
        setChallengeRef(challenge.challengeRef);
        setChallengeExpiresAt(challenge.expiresAt);
        setCode("");
        setView("challenge");
      } catch (error) {
        if (!mountedRef.current || req.generation !== generationRef.current) {
          return;
        }
        if (error instanceof AdminAuthError && error.code === "session") {
          setErrorText("账户或密码不正确。");
          setView("login");
          return;
        }
        setErrorText(safeErrorCopy(error));
        setView("login");
      } finally {
        req.finish();
        clearBusyIfGeneration(req.generation);
      }
    },
    [beginRequest, clearBusyIfGeneration, client, isCurrent, operatorRef, password]
  );

  const submitVerify = useCallback(
    async (event: React.FormEvent) => {
      event.preventDefault();
      if (busyRef.current || !challengeRef) {
        return;
      }
      const capturedCode = code;
      setCode("");
      busyRef.current = true;
      setLoading(true);
      setErrorText(null);
      const req = beginRequest();
      let verified = false;
      try {
        await client.verify({ challengeRef, code: capturedCode }, req.signal);
        verified = true;
        if (!isCurrent(req.generation, req.signal)) {
          return;
        }
        const status = await client.session(req.signal);
        if (!isCurrent(req.generation, req.signal)) {
          return;
        }
        if (!status.authenticated) {
          resetSecrets();
          setErrorText(ERROR_COPY.session);
          setView("login");
          return;
        }
        setSessionExpiresAt(status.expiresAt);
        resetSecrets();
        setView("ready");
      } catch (error) {
        if (!mountedRef.current || req.generation !== generationRef.current) {
          return;
        }
        if (error instanceof AdminAuthError && error.code === "session") {
          if (verified) {
            resetSecrets();
            setErrorText(ERROR_COPY.session);
            setView("login");
            return;
          }
          setErrorText(ERROR_COPY.invalid);
          setView("challenge");
          return;
        }
        if (verified) {
          setChallengeRef(null);
          setChallengeExpiresAt(null);
          setCode("");
          setErrorText(safeErrorCopy(error));
          setView("session");
          return;
        }
        setErrorText(safeErrorCopy(error));
        setView("challenge");
      } finally {
        req.finish();
        clearBusyIfGeneration(req.generation);
      }
    },
    [beginRequest, challengeRef, clearBusyIfGeneration, client, code, isCurrent, resetSecrets]
  );

  const submitLogout = useCallback(async () => {
    clearTimer();
    invalidateInFlight();
    setSessionExpiresAt(null);
    resetSecrets();
    setView("logout_unconfirmed");
    busyRef.current = true;
    setLoading(true);
    setErrorText(null);
    const req = beginRequest();
    try {
      await client.logout(req.signal);
      if (!isCurrent(req.generation, req.signal)) {
        return;
      }
      setView("login");
    } catch (error) {
      if (!mountedRef.current || req.generation !== generationRef.current) {
        return;
      }
      if (error instanceof DOMException && error.name === "AbortError") {
        setErrorText(safeErrorCopy(error));
      } else {
        setErrorText("退出未确认，请重试。");
      }
      setView("logout_unconfirmed");
    } finally {
      req.finish();
      clearBusyIfGeneration(req.generation);
    }
  }, [
    beginRequest,
    clearBusyIfGeneration,
    clearTimer,
    client,
    invalidateInFlight,
    isCurrent,
    resetSecrets
  ]);

  const renderError = errorText ? (
    <p className="admin-auth-error" role="alert">
      {errorText}
    </p>
  ) : null;

  const loadingHint = loading ? <p>正在验证…</p> : null;

  return (
    <main className="admin-auth-boundary">
      {view === "ready" ? (
        <section className="admin-auth-card">
          <div className="admin-auth-actions">
            <button type="button" onClick={() => void submitLogout()} disabled={loading}>
              退出登录
            </button>
          </div>
          {children({ onSessionExpired })}
        </section>
      ) : (
        <section className="admin-auth-card">
          <h1>Admin Console</h1>
          <p>GCC WebOS</p>
          {view === "setup" ? (
            <>
              <p>管理员尚未完成安全设置，请联系维护人员。</p>
              {renderError}
              <div className="admin-auth-actions">
                <button type="button" onClick={() => void loadSession()} disabled={loading}>
                  重试
                </button>
              </div>
            </>
          ) : null}
          {view === "session" ? (
            <>
              {renderError}
              {loadingHint}
              <div className="admin-auth-actions">
                <button type="button" onClick={() => void loadSession()} disabled={loading}>
                  重试
                </button>
              </div>
            </>
          ) : null}
          {view === "login" ? (
            <form onSubmit={(event) => void submitLogin(event)}>
              <div className="admin-auth-field">
                <label htmlFor="admin-auth-operator">管理员账户</label>
                <input
                  id="admin-auth-operator"
                  name="username"
                  autoComplete="username"
                  value={operatorRef}
                  onChange={(event) => setOperatorRef(event.target.value)}
                  disabled={loading}
                />
              </div>
              <div className="admin-auth-field">
                <label htmlFor="admin-auth-password">密码</label>
                <input
                  id="admin-auth-password"
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  disabled={loading}
                />
              </div>
              {renderError}
              {loadingHint}
              <div className="admin-auth-actions">
                <button type="submit" disabled={loading}>
                  登录
                </button>
              </div>
            </form>
          ) : null}
          {view === "challenge" ? (
            <form onSubmit={(event) => void submitVerify(event)}>
              <div className="admin-auth-field">
                <label htmlFor="admin-auth-code">动态验证码</label>
                <input
                  id="admin-auth-code"
                  name="totp"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  value={code}
                  onChange={(event) => setCode(event.target.value)}
                  disabled={loading}
                />
              </div>
              {renderError}
              {loadingHint}
              <div className="admin-auth-actions">
                <button type="submit" disabled={loading}>
                  验证并登录
                </button>
              </div>
            </form>
          ) : null}
          {view === "logout_unconfirmed" ? (
            <>
              {renderError}
              {loadingHint}
              <div className="admin-auth-actions">
                <button type="button" onClick={() => void submitLogout()} disabled={loading}>
                  重试
                </button>
              </div>
            </>
          ) : null}
        </section>
      )}
    </main>
  );
}
