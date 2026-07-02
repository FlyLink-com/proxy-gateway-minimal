import { useEffect, useState, type FormEvent } from "react";
import { errorMessage } from "../../lib/errors";
import {
  PORTAL_REGISTRATION_SESSION_STORAGE_KEY,
  type PortalRegistrationEmailVerificationChallenge,
  type PortalRegistrationResult,
  type UserPortalClient
} from "./user-portal-client";
import { PublicLocaleSwitch, usePublicLocalePreference } from "./public-locale-switch";

type UserRegistrationPageProps = {
  portalClient: UserPortalClient;
};

const registrationCopy = {
  en: {
    documentTitle: "GCC WebOS - Registration",
    language: "Language",
    resultAria: "Registration result",
    resultTitle: "Registration complete",
    resultDescription: "Your 7-day trial is ready. Opening the user center now.",
    loginLink: "Open user center",
    pageAria: "User registration",
    title: "Register for a 7-day trial",
    description: "Verify your email and set a password. Plans and purchases are managed in the user center.",
    fields: {
      email: "Email address",
      password: "Password",
      confirmPassword: "Confirm password",
      emailCode: "Email verification code",
      emailCodePlaceholder: "6-digit code",
      honeypot: "Company name"
    },
    sendVerification: "Send email code",
    sendingVerification: "Sending code",
    verificationSent: "Email code sent.",
    verificationRequired: "Send and enter the email verification code first.",
    passwordMismatch: "Passwords do not match.",
    verificationSendError: "Email verification failed to send.",
    submitError: "Registration submission failed.",
    submitting: "Submitting",
    submit: "Register for 7-day trial",
    existingAccount: "Already have an account? Sign in"
  },
  zh: {
    documentTitle: "GCC WebOS - 用户注册",
    language: "语言",
    resultAria: "注册结果",
    resultTitle: "注册完成",
    resultDescription: "7 天试用已开通，正在进入用户面板。",
    loginLink: "进入用户面板",
    pageAria: "用户注册",
    title: "注册领取 7 天试用",
    description: "验证邮箱并设置密码。套餐购买和续费在用户面板内完成。",
    fields: {
      email: "电子邮箱",
      password: "密码",
      confirmPassword: "确认密码",
      emailCode: "邮箱验证码",
      emailCodePlaceholder: "6 位验证码",
      honeypot: "公司名称"
    },
    sendVerification: "发送邮箱验证码",
    sendingVerification: "发送中",
    verificationSent: "邮箱验证码已发送。",
    verificationRequired: "请先发送并填写邮箱验证码。",
    passwordMismatch: "两次输入的密码不一致。",
    verificationSendError: "邮箱验证码发送失败。",
    submitError: "注册提交失败。",
    submitting: "提交中",
    submit: "注册领取 7 天试用",
    existingAccount: "已有账户，去登录"
  }
} as const;

function redirectToPortal() {
  window.history.pushState(null, "", "/portal");
  const event = typeof PopStateEvent === "function"
    ? new PopStateEvent("popstate")
    : new Event("popstate");
  window.dispatchEvent(event);
}

function persistRegistrationSession(result: PortalRegistrationResult) {
  window.sessionStorage.setItem(
    PORTAL_REGISTRATION_SESSION_STORAGE_KEY,
    JSON.stringify(result.session)
  );
}

export function UserRegistrationPage({ portalClient }: UserRegistrationPageProps) {
  const { locale, setLocale } = usePublicLocalePreference();
  const copy = registrationCopy[locale];
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [honeypot, setHoneypot] = useState("");
  const [emailVerification, setEmailVerification] = useState<PortalRegistrationEmailVerificationChallenge | null>(null);
  const [emailVerificationCode, setEmailVerificationCode] = useState("");
  const [verificationPending, setVerificationPending] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<PortalRegistrationResult | null>(null);

  useEffect(() => {
    document.title = copy.documentTitle;
  }, [copy.documentTitle]);

  async function requestEmailVerification() {
    setVerificationPending(true);
    setError(null);
    try {
      if (honeypot.trim()) {
        throw new Error(copy.verificationSendError);
      }
      const nextVerification = await portalClient.requestRegistrationEmailVerification({
        email
      });
      setEmailVerification(nextVerification);
      setEmailVerificationCode("");
    } catch (caughtError) {
      setError(errorMessage(caughtError, copy.verificationSendError));
    } finally {
      setVerificationPending(false);
    }
  }

  async function submitRegistration(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!emailVerification || !emailVerificationCode.trim()) {
      setError(copy.verificationRequired);
      return;
    }
    if (password !== confirmPassword) {
      setError(copy.passwordMismatch);
      return;
    }
    if (honeypot.trim()) {
      setError(copy.submitError);
      return;
    }
    setPending(true);
    setError(null);
    try {
      const nextResult = await portalClient.registerTrialAccount({
        email,
        password,
        emailVerification: {
          verificationRef: emailVerification.verificationRef,
          code: emailVerificationCode
        }
      });
      persistRegistrationSession(nextResult);
      setResult(nextResult);
      redirectToPortal();
    } catch (caughtError) {
      setError(errorMessage(caughtError, copy.submitError));
    } finally {
      setPending(false);
    }
  }

  if (result) {
    return (
      <main className="portal-auth-shell">
        <section className="portal-auth-card" aria-label={copy.resultAria}>
          <PublicLocaleSwitch ariaLabel={copy.language} locale={locale} onLocaleChange={setLocale} />
          <div className="portal-auth-header">
            <h1>{copy.resultTitle}</h1>
            <p>{copy.resultDescription}</p>
          </div>
          <a className="portal-auth-submit portal-registration-login-link" href="/portal/">
            {copy.loginLink}
          </a>
        </section>
      </main>
    );
  }

  return (
    <main className="portal-auth-shell">
      <section className="portal-auth-card" aria-label={copy.pageAria}>
        <PublicLocaleSwitch ariaLabel={copy.language} locale={locale} onLocaleChange={setLocale} />
        <div className="portal-auth-header">
          <h1>{copy.title}</h1>
          <p>{copy.description}</p>
        </div>
        <form className="portal-auth-form" onSubmit={submitRegistration}>
          <label htmlFor="portal-registration-email">{copy.fields.email}</label>
          <input
            id="portal-registration-email"
            type="email"
            value={email}
            onChange={(event) => {
              setEmail(event.target.value);
              setEmailVerification(null);
              setEmailVerificationCode("");
            }}
            placeholder="you@example.com"
            autoComplete="email"
          />

          <label htmlFor="portal-registration-password">{copy.fields.password}</label>
          <input
            id="portal-registration-password"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="new-password"
          />

          <label htmlFor="portal-registration-confirm-password">{copy.fields.confirmPassword}</label>
          <input
            id="portal-registration-confirm-password"
            type="password"
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
            autoComplete="new-password"
          />

          <button
            className="portal-auth-submit portal-auth-secondary-action"
            type="button"
            disabled={verificationPending || !email.trim()}
            onClick={requestEmailVerification}
          >
            {verificationPending ? copy.sendingVerification : copy.sendVerification}
          </button>
          {emailVerification ? (
            <p className="portal-inline-success">{copy.verificationSent}</p>
          ) : null}

          <label htmlFor="portal-registration-email-code">{copy.fields.emailCode}</label>
          <input
            id="portal-registration-email-code"
            value={emailVerificationCode}
            onChange={(event) => setEmailVerificationCode(event.target.value)}
            placeholder={copy.fields.emailCodePlaceholder}
            autoComplete="one-time-code"
            inputMode="numeric"
          />

          <label className="portal-honeypot" htmlFor="portal-registration-company">{copy.fields.honeypot}</label>
          <input
            id="portal-registration-company"
            name="portal-registration-company"
            className="portal-honeypot"
            value={honeypot}
            onChange={(event) => setHoneypot(event.target.value)}
            tabIndex={-1}
            autoComplete="off"
          />

          {error ? <p className="portal-inline-error" role="alert">{error}</p> : null}
          <button
            className="portal-auth-submit"
            type="submit"
            disabled={pending
              || !email.trim()
              || !password.trim()
              || !confirmPassword.trim()
              || !emailVerification
              || !emailVerificationCode.trim()}
          >
            {pending ? copy.submitting : copy.submit}
          </button>
          <a className="portal-auth-switch" href="/portal/">{copy.existingAccount}</a>
        </form>
      </section>
    </main>
  );
}
