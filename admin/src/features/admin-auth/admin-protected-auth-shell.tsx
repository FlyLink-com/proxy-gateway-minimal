import { useEffect, useState, type FormEvent } from "react";
import {
  createAdminProtectedAuthClient,
  type AdminProtectedAuthClient,
  type AdminTotpChallenge,
  type AdminTotpEnrollment
} from "./admin-auth-client";
import { ADMIN_SHELL_COPY, useOptionalAdminLocale } from "../../app/admin-locale";
import { createDefaultAdminSession, saveAdminSession, type AdminSession } from "../subscriptions/admin-session";

type AdminProtectedAuthShellProps = {
  client?: AdminProtectedAuthClient;
  onAuthenticated: (session: AdminSession) => void;
};

function createProtectedSession(): AdminSession {
  return {
    ...createDefaultAdminSession(),
    authMode: "protectedSession"
  };
}

function safeError(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

export function AdminProtectedAuthShell({
  client = createAdminProtectedAuthClient(),
  onAuthenticated
}: AdminProtectedAuthShellProps) {
  const authCopy = useOptionalAdminLocale()?.copy.login.auth ?? ADMIN_SHELL_COPY.en.login.auth;
  const [bootstrapToken, setBootstrapToken] = useState("");
  const [enrollment, setEnrollment] = useState<AdminTotpEnrollment | null>(null);
  const [enrollmentCode, setEnrollmentCode] = useState("");
  const [operatorRef, setOperatorRef] = useState("");
  const [operatorBootstrapToken, setOperatorBootstrapToken] = useState("");
  const [portalAccountMode, setPortalAccountMode] = useState(true);
  const [setupRequired, setSetupRequired] = useState(false);
  const [sessionResolved, setSessionResolved] = useState(false);
  const [operatorRefLocked, setOperatorRefLocked] = useState(false);
  const [challenge, setChallenge] = useState<AdminTotpChallenge | null>(null);
  const [verificationCode, setVerificationCode] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  function openProtectedSession() {
    const session = createProtectedSession();
    saveAdminSession(session);
    onAuthenticated(session);
  }

  useEffect(() => {
    let cancelled = false;
    client.session().then((status) => {
      if (cancelled) return;
      setSessionResolved(true);
      if (status.authenticated) {
        openProtectedSession();
      } else {
        const portalMode = status.mode === "portalAccount";
        setPortalAccountMode(portalMode);
        setSetupRequired(status.setupRequired ?? false);
        if (status.operatorRef) {
          setOperatorRef(status.operatorRef);
          setOperatorRefLocked(portalMode);
        } else {
          setOperatorRefLocked(false);
        }
      }
    }).catch(() => {
      if (!cancelled) {
        setSessionResolved(true);
        setPortalAccountMode(true);
        setSetupRequired(false);
        setOperatorRefLocked(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [client]);

  async function submitBootstrap(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      setEnrollment(await client.startBootstrap({ bootstrapToken }));
    } catch (error) {
      setError(safeError(error, authCopy.fallbackError));
    } finally {
      setBusy(false);
    }
  }

  const showBootstrapSetup = sessionResolved && setupRequired;
  const setupTitle = portalAccountMode ? authCopy.authenticatorSetupTitle : authCopy.firstAdminSetupTitle;
  const setupSecretLabel = portalAccountMode ? authCopy.accountPasswordLabel : authCopy.adminSetupKeyLabel;
  const setupButtonLabel = portalAccountMode ? authCopy.authenticatorSetupButton : authCopy.firstAdminSetupButton;
  const loginTitle = portalAccountMode ? authCopy.portalAccountLoginTitle : authCopy.protectedAdminLoginTitle;
  const operatorLabel = portalAccountMode ? authCopy.accountIdLabel : authCopy.adminIdLabel;
  const passwordLabel = authCopy.adminPasswordLabel;
  const loginButtonLabel = busy ? authCopy.checkingPasswordLabel : authCopy.loginButton;
  const authHeading = enrollment
    ? authCopy.authenticatorSetupTitle
    : challenge
      ? authCopy.authenticatorVerificationTitle
      : showBootstrapSetup
        ? setupTitle
        : loginTitle;

  async function submitEnrollmentCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!enrollment) return;
    setBusy(true);
    setError("");
    try {
      await client.confirmEnrollment({
        enrollmentRef: enrollment.enrollmentRef,
        code: enrollmentCode
      });
      openProtectedSession();
    } catch (error) {
      setError(safeError(error, authCopy.fallbackError));
    } finally {
      setBusy(false);
    }
  }

  async function submitLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const nextChallenge = await client.login({
        operatorRef,
        bootstrapToken: operatorBootstrapToken
      });
      setChallenge(nextChallenge);
      setOperatorBootstrapToken("");
    } catch (error) {
      setError(safeError(error, authCopy.fallbackError));
    } finally {
      setBusy(false);
    }
  }

  async function submitVerification(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!challenge) return;
    setBusy(true);
    setError("");
    try {
      await client.verifyTotp({
        challengeRef: challenge.challengeRef,
        code: verificationCode
      });
      openProtectedSession();
    } catch (error) {
      setError(safeError(error, authCopy.fallbackError));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="admin-protected-auth-panel" aria-labelledby="admin-protected-auth-heading">
      <div className="admin-protected-auth-heading">
        <h2 id="admin-protected-auth-heading">{authHeading}</h2>
      </div>

      {!enrollment && !challenge ? (
        showBootstrapSetup ? (
          <form className="admin-protected-auth-form admin-protected-auth-form-primary" aria-label={authCopy.authenticatorEnrollmentFormLabel} onSubmit={submitBootstrap}>
            <label>
              <span>{setupSecretLabel}</span>
              <input
                autoComplete={portalAccountMode ? "current-password" : "off"}
                onChange={(event) => setBootstrapToken(event.target.value)}
                required
                type="password"
                value={bootstrapToken}
              />
            </label>
            <button className="primary-button admin-protected-auth-submit" disabled={busy || !bootstrapToken.trim()} type="submit">
              {setupButtonLabel}
            </button>
          </form>
        ) : (
          <form className="admin-protected-auth-form admin-protected-auth-form-primary" aria-label={authCopy.passwordFormLabel} onSubmit={submitLogin}>
            <label>
              <span>{operatorLabel}</span>
              <input
                autoComplete="username"
                aria-readonly={operatorRefLocked}
                onChange={(event) => setOperatorRef(event.target.value)}
                placeholder={portalAccountMode ? authCopy.approvedPortalAccountIdPlaceholder : authCopy.approvedAdminIdPlaceholder}
                readOnly={operatorRefLocked}
                required
                spellCheck={false}
                value={operatorRef}
              />
            </label>
            <label>
              <span>{passwordLabel}</span>
              <input
                autoComplete="current-password"
                onChange={(event) => setOperatorBootstrapToken(event.target.value)}
                required
                type="password"
                value={operatorBootstrapToken}
              />
            </label>
            <button className="primary-button admin-protected-auth-submit" disabled={busy || !operatorRef.trim() || !operatorBootstrapToken.trim()} type="submit">
              {loginButtonLabel}
            </button>
          </form>
        )
      ) : null}

      {enrollment ? (
        <form className="admin-protected-auth-factor" aria-label={authCopy.confirmAuthenticatorFormLabel} onSubmit={submitEnrollmentCode}>
          <dl>
            <div>
              <dt>{authCopy.issuerLabel}</dt>
              <dd>{enrollment.issuer}</dd>
            </div>
            <div>
              <dt>{authCopy.operatorLabel}</dt>
              <dd>{enrollment.operatorRef}</dd>
            </div>
            <div>
              <dt>{authCopy.manualKeyLabel}</dt>
              <dd><code>{enrollment.manualKey}</code></dd>
            </div>
          </dl>
          <label>
            <span>{authCopy.authenticatorCodeLabel}</span>
            <input
              autoComplete="one-time-code"
              inputMode="numeric"
              maxLength={8}
              onChange={(event) => setEnrollmentCode(event.target.value)}
              pattern="[0-9]*"
              required
              value={enrollmentCode}
            />
          </label>
          <button className="primary-button admin-protected-auth-submit" disabled={busy || enrollmentCode.trim().length < 6} type="submit">
            {authCopy.confirmAuthenticatorButton}
          </button>
        </form>
      ) : null}

      {challenge ? (
        <form className="admin-protected-auth-factor" aria-label={authCopy.verifyAuthenticatorFormLabel} onSubmit={submitVerification}>
          <label>
            <span>{authCopy.sixDigitCodeLabel}</span>
            <input
              autoComplete="one-time-code"
              inputMode="numeric"
              maxLength={8}
              onChange={(event) => setVerificationCode(event.target.value)}
              pattern="[0-9]*"
              required
              value={verificationCode}
            />
          </label>
          <button className="primary-button admin-protected-auth-submit" disabled={busy || verificationCode.trim().length < 6} type="submit">
            {authCopy.verifyAndOpenAdminButton}
          </button>
        </form>
      ) : null}

      {error ? <div className="connection-health connection-health-warning" role="alert">{error}</div> : null}
    </section>
  );
}
