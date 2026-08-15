import { Check, Mail, ShieldCheck } from "lucide-react";
import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import { errorMessage } from "../../lib/errors";
import {
  isPortalWelcomeCoinsRegistration,
  PORTAL_REGISTRATION_SESSION_STORAGE_KEY,
  type PortalRegistrationEmailVerificationChallenge,
  type PortalRegistrationResult,
  type UserPortalClient
} from "./user-portal-client";
import { PublicLocaleSwitch, usePublicLocalePreference } from "./public-locale-switch";

type UserRegistrationPageProps = {
  portalClient: UserPortalClient;
};

type RegistrationStep = "account" | "verify" | "complete";

const PORTAL_REGISTRATION_LEGAL_AGREEMENT = {
  termsAccepted: true,
  privacyAccepted: true,
  termsVersion: "2026-07-02",
  privacyVersion: "2026-07-02"
} as const;

const registrationCopy = {
  en: {
    documentTitle: "GCC WebOS - Registration",
    language: "Language",
    pageAria: "User registration",
    brand: "GCC WebOS",
    support: "Need help? support@gccwebos.com",
    progressTitle: "Create your account",
    steps: ["Create account", "Verify email", "Ready"],
    stepLabel: (current: number) => `Step ${current} of 3`,
    accountTitle: "Create your account",
    accountDescription: "No credit card required. Manage Coins and packages from your account center.",
    verifyTitle: "Check your inbox",
    verifyDescription: (email: string) => `We sent a 6-digit code to ${email || "your email"}`,
    verifyHelp: "Check your spam folder if you do not see the email.",
    codeTimer: (remaining: string) => `The code expires in ${remaining}.`,
    resultTitle: "You're ready to connect.",
    resultDescription: "Your GCC WebOS account is active.",
    legacyTrialDescription: "Your GCC WebOS account is active. You are on the Starter Trial plan.",
    loginLink: "Open dashboard",
    downloadLink: "Download app",
    trialHint: "Your free trial ends in 7 days. Upgrade anytime from your dashboard.",
    remainingDays: "7 days remaining",
    welcomeBonusDescription: (amount: number) => `Your new account receives ${amount} Bonus Coins for eligible packages.`,
    welcomeBonusPending: "Your welcome Coins are being added to the Wallet. The Wallet will show the available balance once crediting completes.",
    welcomeBonusAvailable: "Your welcome Coins are available in the Wallet and are used before purchased Coins when a package accepts them.",
    welcomeBonusExpires: "Bonus Coins expire",
    welcomeBonusBadge: "Welcome bonus",
    welcomeBonusName: (amount: number) => `${amount} Bonus Coins`,
    fields: {
      email: "Email address",
      password: "Password",
      confirmPassword: "Confirm password",
      emailCode: "Verification code",
      emailCodePlaceholder: "6-digit code",
      honeypot: "Company name"
    },
    passwordRules: {
      label: "Password rules",
      length: "8 or more characters",
      uppercase: "One uppercase letter",
      number: "One number",
      symbol: "One symbol (!@#$...)"
    },
    legalPrefix: "I agree to the",
    terms: "Terms of Service",
    legalJoin: "and",
    privacy: "Privacy Policy",
    accountSubmit: "Create account",
    verifySubmit: "Verify code",
    back: "Back",
    resendVerification: "Resend code",
    sendingVerification: "Sending code",
    verificationSent: "Email code sent.",
    legalRequired: "Please agree to the Terms of Service and Privacy Policy.",
    passwordRuleRequired: "Password must meet all requirements above.",
    passwordMismatch: "Passwords do not match.",
    verificationRequired: "Enter the email verification code first.",
    verificationSendError: "Email verification failed to send.",
    submitError: "Registration submission failed.",
    submitting: "Submitting",
    existingAccountPrefix: "Already have an account?",
    existingAccountAction: "Sign in",
    planBadge: "Starter Trial",
    planName: "7-day trial"
  },
  zh: {
    documentTitle: "GCC WebOS - 用户注册",
    language: "语言",
    pageAria: "用户注册",
    brand: "GCC WebOS",
    support: "需要帮助？support@gccwebos.com",
    progressTitle: "创建你的账户",
    steps: ["创建账户", "验证邮箱", "完成"],
    stepLabel: (current: number) => `第 ${current} 步，共 3 步`,
    accountTitle: "创建你的账户",
    accountDescription: "无需信用卡。完成注册后，可在用户中心管理 Coins 和套餐。",
    verifyTitle: "检查你的邮箱",
    verifyDescription: (email: string) => `我们已向 ${email || "你的邮箱"} 发送 6 位验证码`,
    verifyHelp: "如果没有看到邮件，请检查垃圾邮件文件夹。",
    codeTimer: (remaining: string) => `验证码将在 ${remaining} 后过期。`,
    resultTitle: "账户已准备好。",
    resultDescription: "你的 GCC WebOS 账户已激活。",
    legacyTrialDescription: "你的 GCC WebOS 账户已激活，当前为 Starter Trial 方案。",
    loginLink: "打开用户面板",
    downloadLink: "下载应用",
    trialHint: "免费试用将在 7 天后结束，可随时在用户面板内升级。",
    remainingDays: "7 天剩余",
    welcomeBonusDescription: (amount: number) => `新账户可获得 ${amount} 个赠送 Coins，用于支持赠送 Coins 的套餐。`,
    welcomeBonusPending: "欢迎赠送正在写入 Coins 钱包；入账完成后，可在钱包内查看可用余额。",
    welcomeBonusAvailable: "欢迎赠送已在 Coins 钱包可用；套餐允许时会优先使用赠送 Coins，再使用已购 Coins。",
    welcomeBonusExpires: "赠送 Coins 到期时间",
    welcomeBonusBadge: "欢迎赠送",
    welcomeBonusName: (amount: number) => `${amount} 个赠送 Coins`,
    fields: {
      email: "电子邮箱",
      password: "密码",
      confirmPassword: "确认密码",
      emailCode: "邮箱验证码",
      emailCodePlaceholder: "6 位验证码",
      honeypot: "公司名称"
    },
    passwordRules: {
      label: "密码规则",
      length: "至少 8 位字符",
      uppercase: "包含一个大写字母",
      number: "包含一个数字",
      symbol: "包含一个符号（!@#$...）"
    },
    legalPrefix: "我同意",
    terms: "服务条款",
    legalJoin: "和",
    privacy: "隐私政策",
    accountSubmit: "创建账户",
    verifySubmit: "验证并开通",
    back: "返回",
    resendVerification: "重新发送",
    sendingVerification: "发送中",
    verificationSent: "邮箱验证码已发送。",
    legalRequired: "请先同意服务条款和隐私政策。",
    passwordRuleRequired: "密码必须满足上方全部要求。",
    passwordMismatch: "两次输入的密码不一致。",
    verificationRequired: "请先填写邮箱验证码。",
    verificationSendError: "邮箱验证码发送失败。",
    submitError: "注册提交失败。",
    submitting: "提交中",
    existingAccountPrefix: "已有账户？",
    existingAccountAction: "登录",
    planBadge: "Starter Trial",
    planName: "7 天试用"
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

function passwordState(password: string) {
  return {
    length: password.length >= 8,
    uppercase: /[A-Z]/.test(password),
    number: /\d/.test(password),
    symbol: /[^A-Za-z0-9]/.test(password)
  };
}

function isPasswordReady(rules: ReturnType<typeof passwordState>) {
  return rules.length && rules.uppercase && rules.number && rules.symbol;
}

function formatCountdown(seconds: number) {
  const safeSeconds = Math.max(0, Math.ceil(seconds));
  const minutes = Math.floor(safeSeconds / 60);
  const remainder = safeSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`;
}

function splitOtpDigits(value: string) {
  return Array.from({ length: 6 }, (_, index) => value[index] ?? "");
}

function formatWelcomeBonusExpiry(value: string, locale: "zh" | "en") {
  return new Intl.DateTimeFormat(locale === "zh" ? "zh-CN" : "en-US", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(value));
}

export function UserRegistrationPage({ portalClient }: UserRegistrationPageProps) {
  const { locale, setLocale } = usePublicLocalePreference();
  const copy = registrationCopy[locale];
  const [step, setStep] = useState<RegistrationStep>("account");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [legalAccepted, setLegalAccepted] = useState(true);
  const [honeypot, setHoneypot] = useState("");
  const [emailVerification, setEmailVerification] = useState<PortalRegistrationEmailVerificationChallenge | null>(null);
  const [emailVerificationCode, setEmailVerificationCode] = useState("");
  const [verificationPending, setVerificationPending] = useState(false);
  const [verificationExpiresAtMs, setVerificationExpiresAtMs] = useState<number | null>(null);
  const [remainingSeconds, setRemainingSeconds] = useState(0);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<PortalRegistrationResult | null>(null);
  const rules = useMemo(() => passwordState(password), [password]);
  const passwordReady = isPasswordReady(rules);
  const activeStep = step === "account" ? 1 : step === "verify" ? 2 : 3;
  const otpDigits = useMemo(() => splitOtpDigits(emailVerificationCode), [emailVerificationCode]);
  const activeOtpIndex = Math.min(emailVerificationCode.length, 5);
  const countdownLabel = formatCountdown(remainingSeconds);

  useEffect(() => {
    document.title = copy.documentTitle;
  }, [copy.documentTitle]);

  useEffect(() => {
    if (!verificationExpiresAtMs) return undefined;
    const expiresAtMs = verificationExpiresAtMs;
    function refreshRemaining() {
      setRemainingSeconds(Math.max(0, Math.ceil((expiresAtMs - Date.now()) / 1000)));
    }
    refreshRemaining();
    const intervalId = window.setInterval(refreshRemaining, 1000);
    return () => window.clearInterval(intervalId);
  }, [verificationExpiresAtMs]);

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
      setVerificationExpiresAtMs(Date.now() + nextVerification.expiresInSeconds * 1000);
      setEmailVerificationCode("");
      setStep("verify");
    } catch (caughtError) {
      setError(errorMessage(caughtError, copy.verificationSendError));
    } finally {
      setVerificationPending(false);
    }
  }

  async function continueFromAccount(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!legalAccepted) {
      setError(copy.legalRequired);
      return;
    }
    if (!passwordReady) {
      setError(copy.passwordRuleRequired);
      return;
    }
    if (password !== confirmPassword) {
      setError(copy.passwordMismatch);
      return;
    }
    await requestEmailVerification();
  }

  async function submitRegistration(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!emailVerification || !emailVerificationCode.trim()) {
      setError(copy.verificationRequired);
      return;
    }
    setPending(true);
    setError(null);
    try {
      const nextResult = await portalClient.registerTrialAccount({
        email,
        password,
        legalAgreement: PORTAL_REGISTRATION_LEGAL_AGREEMENT,
        emailVerification: {
          verificationRef: emailVerification.verificationRef,
          code: emailVerificationCode
        }
      });
      persistRegistrationSession(nextResult);
      setResult(nextResult);
      setStep("complete");
      redirectToPortal();
    } catch (caughtError) {
      setError(errorMessage(caughtError, copy.submitError));
    } finally {
      setPending(false);
    }
  }

  function renderStepShell(children: ReactNode) {
    return (
      <main className="portal-auth-shell portal-registration-shell">
        <aside className="portal-registration-sidebar" aria-label={copy.progressTitle}>
          <div className="portal-registration-sidebar-top">
            <div className="portal-registration-brand">
              <span className="portal-registration-logo" aria-hidden="true">
                <ShieldCheck size={18} strokeWidth={2.4} />
              </span>
              <strong>{copy.brand}</strong>
            </div>
            <div className="portal-registration-progress">
              <p>{copy.progressTitle}</p>
              <ol>
                {copy.steps.map((label, index) => {
                  const position = index + 1;
                  const complete = activeStep > position;
                  const current = activeStep === position;
                  return (
                    <li key={label} className={current ? "is-current" : complete ? "is-complete" : ""}>
                      <span>{complete ? <Check size={14} strokeWidth={3} /> : position}</span>
                      <strong>{label}</strong>
                    </li>
                  );
                })}
              </ol>
            </div>
          </div>
          <p className="portal-registration-support">{copy.support}</p>
        </aside>
        <section className="portal-registration-main" aria-label={copy.pageAria}>
          <PublicLocaleSwitch ariaLabel={copy.language} locale={locale} onLocaleChange={setLocale} />
          {children}
        </section>
      </main>
    );
  }

  if (result) {
    const welcomeBonus = isPortalWelcomeCoinsRegistration(result)
      ? result.welcomeBonus
      : null;
    return renderStepShell(
      <div className="portal-registration-success">
        <div className="portal-registration-success-logo" aria-hidden="true">
          <span>✓</span>
        </div>
        <p className="portal-registration-step-label">{copy.stepLabel(3)}</p>
        <h1>{copy.resultTitle}</h1>
        <p>{welcomeBonus
          ? copy.welcomeBonusDescription(welcomeBonus.amountUnits)
          : copy.legacyTrialDescription}</p>
        <div className="portal-registration-success-actions">
          <a className="portal-auth-submit portal-registration-login-link" href="/portal/">
            {copy.loginLink}
          </a>
          <a className="portal-registration-secondary-link" href="#/site/download">
            {copy.downloadLink}
          </a>
        </div>
        <p className="portal-registration-trial-hint">
          {welcomeBonus
            ? welcomeBonus.status === "pending"
              ? copy.welcomeBonusPending
              : copy.welcomeBonusAvailable
            : copy.trialHint}
        </p>
        <div className="portal-registration-success-pills" aria-label={copy.resultTitle}>
          {welcomeBonus ? (
            <>
              <span>{copy.welcomeBonusBadge}</span>
              <span>{copy.welcomeBonusName(welcomeBonus.amountUnits)}</span>
              <span>{welcomeBonus.status === "pending"
                ? locale === "zh" ? "入账中" : "Pending"
                : locale === "zh" ? "可用" : "Available"}</span>
            </>
          ) : (
            <>
              <span>{copy.planBadge}</span>
              <span>{copy.planName}</span>
              <span>{copy.remainingDays}</span>
            </>
          )}
        </div>
        {welcomeBonus ? (
          <p className="portal-registration-trial-hint">
            {copy.welcomeBonusExpires}{" "}
            <time dateTime={welcomeBonus.expiresAt}>
              {formatWelcomeBonusExpiry(welcomeBonus.expiresAt, locale)}
            </time>
          </p>
        ) : null}
      </div>
    );
  }

  if (step === "verify") {
    return renderStepShell(
      <form className="portal-registration-content portal-registration-verify-step" onSubmit={submitRegistration}>
        <div className="portal-registration-mail-icon" aria-hidden="true">
          <Mail size={16} strokeWidth={2.4} />
        </div>
        <p className="portal-registration-step-label">{copy.stepLabel(2)}</p>
        <h1>{copy.verifyTitle}</h1>
        <p className="portal-registration-copy">{copy.verifyDescription(email)}</p>
        <p className="portal-registration-timer">{copy.codeTimer(countdownLabel)}</p>
        <div className="portal-registration-otp-field">
          <label className="portal-registration-otp-label" htmlFor="portal-registration-email-code">
            {copy.fields.emailCode}
          </label>
          <div className="portal-registration-otp-control">
            <input
              id="portal-registration-email-code"
              className="portal-registration-otp-input"
              value={emailVerificationCode}
              onChange={(event) => setEmailVerificationCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
              aria-label={copy.fields.emailCode}
              autoComplete="one-time-code"
              inputMode="numeric"
              maxLength={6}
              required
            />
            <div className="portal-registration-otp-slots" aria-hidden="true">
              {otpDigits.map((digit, index) => (
                <span
                  key={index}
                  className={[
                    digit ? "is-filled" : "",
                    index === activeOtpIndex ? "is-active" : ""
                  ].filter(Boolean).join(" ")}
                >
                  {digit}
                </span>
              ))}
            </div>
          </div>
        </div>
        <button
          className="portal-auth-submit"
          type="submit"
          disabled={pending || emailVerificationCode.trim().length < 6}
        >
          {pending ? copy.submitting : copy.verifySubmit}
        </button>
        <div className="portal-registration-resend-row">
          <button
            type="button"
            disabled={verificationPending}
            onClick={requestEmailVerification}
          >
            {verificationPending ? copy.sendingVerification : copy.resendVerification}
          </button>
        </div>
        <p className="portal-registration-email-help">{copy.verifyHelp}</p>
        {error ? <p className="portal-inline-error" role="alert">{error}</p> : null}
      </form>
    );
  }

  return renderStepShell(
    <form className="portal-registration-content portal-registration-account-step" onSubmit={continueFromAccount}>
      <p className="portal-registration-step-label">{copy.stepLabel(1)}</p>
      <h1>{copy.accountTitle}</h1>
      <p className="portal-registration-copy">{copy.accountDescription}</p>
      <div className="portal-registration-field">
        <label htmlFor="portal-registration-email">{copy.fields.email}</label>
        <input
          id="portal-registration-email"
          type="email"
          value={email}
          onChange={(event) => {
            setEmail(event.target.value);
            setEmailVerification(null);
            setEmailVerificationCode("");
            setVerificationExpiresAtMs(null);
            setRemainingSeconds(0);
          }}
          placeholder="you@example.com"
          autoComplete="email"
          required
        />
      </div>
      <div className="portal-registration-field">
        <label htmlFor="portal-registration-password">{copy.fields.password}</label>
        <input
          id="portal-registration-password"
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          autoComplete="new-password"
          required
        />
      </div>
      <div className="portal-registration-rules">
        {Object.entries(copy.passwordRules).map(([key, label]) => (
          key === "label" ? null :
          <span key={key} className={rules[key as keyof typeof rules] ? "is-valid" : ""}>
            <i aria-hidden="true">{rules[key as keyof typeof rules] ? "✓" : ""}</i>
            {label}
          </span>
        ))}
      </div>
      <div className="portal-registration-field">
        <label htmlFor="portal-registration-confirm-password">{copy.fields.confirmPassword}</label>
        <input
          id="portal-registration-confirm-password"
          type="password"
          value={confirmPassword}
          onChange={(event) => setConfirmPassword(event.target.value)}
          autoComplete="new-password"
          required
        />
      </div>
      <label className="portal-registration-checkbox">
        <input
          type="checkbox"
          checked={legalAccepted}
          onChange={(event) => setLegalAccepted(event.target.checked)}
        />
        <span>
          {copy.legalPrefix}{" "}
          <a href="#/site/info/terms">{copy.terms}</a>
          {" "}{copy.legalJoin}{" "}
          <a href="#/site/info/privacy">{copy.privacy}</a>
        </span>
      </label>
      <button
        className="portal-auth-submit"
        type="submit"
        disabled={verificationPending || !email.trim() || !password.trim() || !confirmPassword.trim()}
      >
        {verificationPending ? copy.sendingVerification : copy.accountSubmit}
      </button>
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
      <p className="portal-registration-signin">
        {copy.existingAccountPrefix} <a href="/portal/">{copy.existingAccountAction} →</a>
      </p>
    </form>
  );
}
