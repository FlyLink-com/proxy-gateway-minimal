import { afterEach, describe, expect, test, vi } from "vitest";
import { createElement } from "react";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { App } from "../App";
import { UserPortalPage } from "../features/user-portal/user-portal-page";
import { createTotpCode } from "../features/user-portal/totp-preview";
import {
  createHttpUserPortalClient,
  createLocalUserPortalClient,
  type PortalAuthInput,
  type PortalAuthenticatorBinding,
  type PortalAuthenticatorEnrollment,
  type PortalApplySubscriptionInput,
  type PortalCompleteSecondFactorInput,
  type PortalEmailCodeChallenge,
  type PortalHumanVerificationChallenge,
  type PortalPasskeyBinding,
  type PortalPasskeyExport,
  type PortalRefreshSubscriptionInput,
  type PortalSession,
  type PortalSupportRequest,
  type PortalSupportRequestInput,
  type PortalSubscriptionRequest,
  type PortalUserState,
  type UserPortalClient
} from "../features/user-portal/user-portal-client";

afterEach(() => {
  cleanup();
  window.location.hash = "";
  vi.restoreAllMocks();
});

function portalClient(overrides: Partial<UserPortalClient> = {}): UserPortalClient {
  return {
    issueHumanChallenge: vi.fn(async () => ({
      challengeId: "local-math-v1:4+6",
      prompt: "4 + 6 = ?",
      answer: "10"
    })),
    requestEmailCode: vi.fn(async (): Promise<PortalEmailCodeChallenge> => ({
      status: "simulated",
      challengeRef: "email_challenge_preview",
      expiresInSeconds: 300,
      safety: {
        noAdminApi: true,
        noPublicAuthActivated: true,
        noRawCodeReturned: true
      }
    })),
    authenticate: vi.fn(async (input: PortalAuthInput): Promise<PortalSession> => ({
      status: "authenticated_preview",
      userRef: "user_safe_ref",
      displayName: input.mode === "token"
        ? "user_safe_ref"
        : input.mode === "email"
          ? input.email
          : input.accountId,
      authMode: input.mode,
      registeredAt: "2026-05-31T00:00:00.000Z",
      safety: {
        noAdminApi: true,
        noPublicAuthActivated: true,
        noRawPasswordReturned: true
      }
    })),
    completeSecondFactor: vi.fn(async (_input: PortalCompleteSecondFactorInput): Promise<PortalSession> => ({
      status: "authenticated_preview",
      userRef: "user_safe_ref",
      displayName: "user_safe_ref",
      authMode: "authenticator",
      registeredAt: "2026-05-31T00:00:00.000Z",
      safety: {
        noAdminApi: true,
        noPublicAuthActivated: true,
        noRawPasswordReturned: true
      }
    })),
    fetchCurrentState: vi.fn(async (input: { userRef: string }): Promise<PortalUserState> => ({
      userRef: input.userRef,
      subscriptionRequest: null,
      historySummary: [],
      security: {
        authenticatorBound: false,
        initialAccount: false,
        passkeyEnabled: false,
        passkeyExported: false,
        setupRequired: false
      },
      updatedAt: "2026-05-31T00:00:00.000Z",
      safety: {
        noAdminApi: true,
        noPaymentActivation: true,
        noPublicAdmin: true
      }
    })),
    startAuthenticatorEnrollment: vi.fn(async (input: { userRef: string }): Promise<PortalAuthenticatorEnrollment> => ({
      status: "preview",
      enrollmentRef: "totp_enroll_preview",
      userRef: input.userRef,
      issuer: "GCC Gateway Portal",
      accountLabel: input.userRef,
      manualKey: "JBSW Y3DP EHPK 3PXP",
      otpauthUri: "otpauth://totp/GCC%20Gateway%20Portal:user_safe_ref?secret=JBSWY3DPEHPK3PXP&issuer=GCC+Gateway+Portal&algorithm=SHA1&digits=6&period=30",
      qrDataUri: "data:image/png;base64,preview",
      expiresInSeconds: 300,
      issuedAt: "2026-05-31T00:00:00.000Z",
      safety: {
        noAdminApi: true,
        noPublicAuthActivated: true,
        noProductionCredentialMutation: true
      }
    })),
    confirmAuthenticatorEnrollment: vi.fn(async (input: { userRef: string }): Promise<PortalAuthenticatorBinding> => ({
      status: "bound_preview",
      userRef: input.userRef,
      method: "totp",
      boundAt: "2026-05-31T00:00:00.000Z",
      safety: {
        noAdminApi: true,
        noPublicAuthActivated: true,
        noProductionCredentialMutation: true,
        noRawSecretReturned: true
      }
    })),
    enablePasskey: vi.fn(async (input: { userRef: string }): Promise<PortalPasskeyBinding> => ({
      status: "bound_preview",
      userRef: input.userRef,
      method: "passkey",
      boundAt: "2026-05-31T00:00:00.000Z",
      safety: {
        noAdminApi: true,
        noPublicAuthActivated: true,
        noProductionCredentialMutation: true
      }
    })),
    exportPasskey: vi.fn(async (input: { userRef: string }): Promise<PortalPasskeyExport> => ({
      status: "exported_preview",
      userRef: input.userRef,
      method: "passkey",
      fileName: `${input.userRef}-passkey-preview.json`,
      body: "{\"preview\":true}",
      exportedAt: "2026-05-31T00:00:00.000Z",
      safety: {
        noAdminApi: true,
        noPublicAuthActivated: true,
        noProductionCredentialMutation: true,
        noRawPrivateKeyReturned: true
      }
    })),
    applyForSubscription: vi.fn(async (input: PortalApplySubscriptionInput): Promise<PortalSubscriptionRequest> => {
      const requestOnly = input.requestOnly === true;
      const planLabel = input.planId === "yearly" ? "年卡" : input.planId === "trial" ? "7 天订阅" : "月卡";
      return {
        status: requestOnly ? "ready_for_operator_review" : "subscription_ready",
        lifecycle: requestOnly ? "pending" : "active",
        requestRef: `subreq_${input.planId}`,
      userRef: input.userRef,
      planId: input.planId,
      clientTarget: input.clientTarget,
        expiresAt: requestOnly
          ? "待系统发放"
          : input.planId === "yearly"
            ? "2027-05-31T00:00:00.000Z"
            : "2026-06-30T00:00:00.000Z",
        durationDays: input.durationDays,
        quantity: input.quantity,
        subscriptionUrl: requestOnly ? undefined : "https://sub.example.test/import/visible-once",
        nextAction: requestOnly ? "operator_review_required" : "copy_subscription_url",
        updatedAt: "2026-05-31T00:00:00.000Z",
        historySummary: [
          {
            recordRef: `history_${input.planId}`,
            label: `申请${planLabel}（${requestOnly ? "待发放" : "已授权"}）`,
            status: requestOnly ? "待发放" : "已授权",
            occurredAt: "2026-05-31T00:00:00.000Z"
          }
        ],
        safety: {
          noAdminApi: true,
          noDbMutation: true,
          noPaymentActivation: true,
          noPublicAdmin: true,
          noRawCustomerDataReturned: true
        }
      };
    }),
    submitSupportRequest: vi.fn(async (input: PortalSupportRequestInput): Promise<PortalSupportRequest> => ({
      status: "submitted",
      supportRef: "psup_preview",
      userRef: input.userRef,
      category: input.category,
      clientTarget: input.clientTarget,
      subscriptionRequestRef: input.subscriptionRequestRef,
      submittedAt: "2026-05-31T00:00:00.000Z",
      safety: {
        noAdminApi: true,
        noDbMutation: true,
        noPaymentActivation: true,
        noPublicAdmin: true,
        noRawMessageReturned: true
      }
    })),
    refreshSubscription: vi.fn(async (input: PortalRefreshSubscriptionInput): Promise<PortalSubscriptionRequest> => ({
      status: "subscription_ready",
      lifecycle: "active",
      requestRef: input.requestRef,
      userRef: input.userRef,
      planId: "yearly",
      clientTarget: input.clientTarget,
      expiresAt: "2027-05-31T00:00:00.000Z",
      subscriptionUrl: "https://sub.example.test/import/refreshed-visible-once",
      nextAction: "copy_subscription_url",
      updatedAt: "2026-05-31T00:00:00.000Z",
      event: {
        type: "old_link_invalidated",
        occurredAt: "2026-05-31T00:00:00.000Z"
      },
      historySummary: [
        {
          recordRef: "history_refresh",
          label: "刷新订阅（已刷新）",
          status: "已刷新",
          occurredAt: "2026-05-31T00:00:00.000Z"
        }
      ],
      safety: {
        noAdminApi: true,
        noDbMutation: true,
        noPaymentActivation: true,
        noPublicAdmin: true,
        noRawCustomerDataReturned: true
      }
    })),
    disableSubscription: vi.fn(async (input: { userRef: string; requestRef: string }): Promise<PortalSubscriptionRequest> => ({
      status: "subscription_disabled",
      lifecycle: "disabled",
      requestRef: input.requestRef,
      userRef: input.userRef,
      planId: "trial",
      clientTarget: "clash",
      expiresAt: "2026-06-07T00:00:00.000Z",
      nextAction: "subscription_disabled",
      updatedAt: "2026-05-31T00:00:00.000Z",
      historySummary: [
        {
          recordRef: "history_disabled",
          label: "禁用订阅（已禁用）",
          status: "已禁用",
          occurredAt: "2026-05-31T00:00:00.000Z"
        }
      ],
      safety: {
        noAdminApi: true,
        noDbMutation: true,
        noPaymentActivation: true,
        noPublicAdmin: true,
        noRawCustomerDataReturned: true
      }
    })),
    ...overrides
  };
}

function validHumanVerification() {
  return {
    challengeId: "local-math-v1:4+6",
    challengeAnswer: "10",
    honeypot: ""
  };
}

function backendHumanVerification() {
  return {
    challengeId: "phc_http_1",
    challengeAnswer: "13",
    honeypot: ""
  };
}

function previewAccountWithoutSetup() {
  return [{
    userRef: "user_safe_ref",
    displayName: "user_safe_ref",
    issuedAt: "2026-06-03T00:00:00.000Z",
    requireSecuritySetup: false
  }];
}

function currentRobotAnswer() {
  const prompt = (screen.getByLabelText("防机器人校验") as HTMLInputElement).placeholder;
  const match = prompt.match(/^(\d+)\s+\+\s+(\d+)\s+=\s+\?$/);
  if (!match) {
    throw new Error(`unexpected anti-bot challenge: ${prompt}`);
  }
  return String(Number(match[1]) + Number(match[2]));
}

async function waitForRobotAnswer() {
  await waitFor(() => {
    expect((screen.getByRole("button", { name: "登录" }) as HTMLButtonElement).disabled).toBe(false);
  });
  return currentRobotAnswer();
}

async function enterPortal() {
  await submitPortalLogin();
  return screen.findByRole("navigation", { name: "用户中心导航" });
}

function openNewOrderForm() {
  fireEvent.click(screen.getByRole("button", { name: "新建订单申请" }));
}

async function submitPortalLogin(accountId = "user_safe_ref", password = "user-password") {
  fireEvent.change(screen.getByLabelText("账户 ID"), { target: { value: accountId } });
  fireEvent.change(screen.getByLabelText("密码"), { target: { value: password } });
  fireEvent.change(screen.getByLabelText("防机器人校验"), { target: { value: await waitForRobotAnswer() } });
  fireEvent.click(screen.getByRole("button", { name: "登录" }));
}

describe("user portal route", () => {
  test("opens a separate customer portal without Admin navigation", async () => {
    render(createElement(App));

    expect(screen.getByRole("heading", { name: "连接管理员 API" })).not.toBeNull();
    expect(screen.queryByLabelText("Admin navigation")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "打开用户面板" }));

    expect(await screen.findByRole("heading", { name: "账号登录" })).not.toBeNull();
    expect(screen.getByText("使用账户密码登录。可在个人中心开启身份验证器和通行密钥。")).not.toBeNull();
    expect(screen.getByLabelText("账户 ID")).not.toBeNull();
    expect(screen.getByLabelText("密码")).not.toBeNull();
    expect(screen.getByLabelText("防机器人校验")).not.toBeNull();
    expect(screen.getByRole("button", { name: "登录" })).not.toBeNull();
    expect(screen.queryByRole("group", { name: "登录方式" })).toBeNull();
    expect(screen.queryByRole("button", { name: "入口 Token" })).toBeNull();
    expect(screen.queryByRole("button", { name: "身份验证器" })).toBeNull();
    expect(screen.queryByRole("button", { name: "密码登录" })).toBeNull();
    expect(screen.queryByRole("button", { name: "邮箱验证码" })).toBeNull();
    expect(screen.queryByLabelText("邮箱")).toBeNull();
    expect(screen.queryByLabelText("入口令牌")).toBeNull();
    expect(screen.queryByLabelText("TOTP 密钥")).toBeNull();
    expect(screen.queryByLabelText("动态验证码")).toBeNull();
    expect(screen.queryByLabelText("Admin navigation")).toBeNull();
  });

  test("opens a separate local preview route that can complete a browser login", async () => {
    window.location.hash = "#/portal-preview";
    render(createElement(App));

    expect(await screen.findByRole("heading", { name: "账号登录" })).not.toBeNull();

    await enterPortal();

    expect(screen.queryByText("portal request failed")).toBeNull();
    expect(screen.getByRole("navigation", { name: "用户中心导航" })).not.toBeNull();
    expect(screen.queryByLabelText("Admin navigation")).toBeNull();
  });

  test("lets a signed-in portal user leave back to account login", async () => {
    window.location.hash = "#/portal-preview";
    render(createElement(App));

    await enterPortal();

    fireEvent.click(screen.getByRole("button", { name: "退出登录" }));

    expect(await screen.findByRole("heading", { name: "账号登录" })).not.toBeNull();
    expect(screen.queryByRole("navigation", { name: "用户中心导航" })).toBeNull();
    expect(screen.queryByRole("button", { name: "退出登录" })).toBeNull();
    expect((screen.getByLabelText("账户 ID") as HTMLInputElement).value).toBe("");
    expect((screen.getByLabelText("密码") as HTMLInputElement).value).toBe("");
    expect((screen.getByLabelText("防机器人校验") as HTMLInputElement).value).toBe("");
  });
});

describe("user portal product surface", () => {
  test("renders one normal account login method instead of three login tabs", async () => {
    render(createElement(UserPortalPage, { portalClient: portalClient() }));

    expect(screen.getByRole("heading", { name: "账号登录" })).not.toBeNull();
    expect(screen.getByText("使用账户密码登录。可在个人中心开启身份验证器和通行密钥。")).not.toBeNull();
    expect(screen.queryByRole("group", { name: "登录方式" })).toBeNull();
    expect(screen.getByLabelText("账户 ID")).not.toBeNull();
    expect(screen.getByLabelText("密码")).not.toBeNull();
    expect(screen.getByLabelText("防机器人校验")).not.toBeNull();
    await waitForRobotAnswer();
    expect(screen.getByRole("button", { name: "登录" })).not.toBeNull();
    expect(screen.queryByRole("button", { name: "入口 Token" })).toBeNull();
    expect(screen.queryByRole("button", { name: "身份验证器" })).toBeNull();
    expect(screen.queryByRole("button", { name: "密码登录" })).toBeNull();
    expect(screen.queryByRole("button", { name: "邮箱验证码" })).toBeNull();
    expect(screen.queryByLabelText("邮箱")).toBeNull();
    expect(screen.queryByLabelText("入口令牌")).toBeNull();
    expect(screen.queryByLabelText("TOTP 密钥")).toBeNull();
    expect(screen.queryByLabelText("动态验证码")).toBeNull();
    expect(screen.queryByText("获取验证码")).toBeNull();
  });

  test("loads a portal-issued anti-bot math challenge instead of submitting a fallback challenge", async () => {
    const client = portalClient();
    render(createElement(UserPortalPage, { portalClient: client }));

    await waitForRobotAnswer();
    const robotInput = screen.getByLabelText("防机器人校验") as HTMLInputElement;
    expect(robotInput.placeholder).toMatch(/^\d+ \+ \d+ = \?$/);
    expect(client.issueHumanChallenge).toHaveBeenCalledWith({ scope: "portal_login" });
  });

  test("keeps password login disabled until the backend human challenge is ready", async () => {
    let resolveChallenge: ((value: PortalHumanVerificationChallenge) => void) | undefined;
    const client = portalClient({
      issueHumanChallenge: vi.fn(() => new Promise<PortalHumanVerificationChallenge>((resolve) => {
        resolveChallenge = resolve;
      }))
    });
    render(createElement(UserPortalPage, { portalClient: client }));

    expect((screen.getByLabelText("防机器人校验") as HTMLInputElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: "加载校验中" }) as HTMLButtonElement).disabled).toBe(true);
    expect(client.authenticate).not.toHaveBeenCalled();

    resolveChallenge?.({
      challengeId: "phc_http_delayed",
      prompt: "4 + 6 = ?",
      expiresInSeconds: 120
    });

    await waitForRobotAnswer();
    expect((screen.getByLabelText("防机器人校验") as HTMLInputElement).disabled).toBe(false);
  });

  test("blocks bot-trap submissions before calling the portal client", async () => {
    const client = portalClient();
    const { container } = render(createElement(UserPortalPage, { portalClient: client }));

    fireEvent.change(screen.getByLabelText("账户 ID"), { target: { value: "acct_1" } });
    fireEvent.change(screen.getByLabelText("密码"), { target: { value: "secret-passphrase" } });
    fireEvent.change(screen.getByLabelText("防机器人校验"), { target: { value: await waitForRobotAnswer() } });
    fireEvent.change(container.querySelector("input[name='portal-company']") as HTMLInputElement, { target: { value: "bot" } });
    fireEvent.click(screen.getByRole("button", { name: "登录" }));

    expect(await screen.findByText("防机器人校验失败。")).not.toBeNull();
    expect(client.authenticate).not.toHaveBeenCalled();
  });

  test("local portal client keeps email code login fail-closed while mail issuance is paused", async () => {
    const client = createLocalUserPortalClient();

    await expect(client.requestEmailCode({
      purpose: "login",
      email: "user@example.test",
      humanVerification: validHumanVerification()
    })).rejects.toThrow("邮箱验证码登录尚未启用");

    await expect(client.authenticate({
      mode: "email",
      email: "user@example.test",
      verificationCode: "A1B2",
      humanVerification: validHumanVerification()
    })).rejects.toThrow("邮箱验证码登录尚未启用");
  });

  test("local portal client accepts only issued initial preview accounts", async () => {
    const client = createLocalUserPortalClient({
      now: () => new Date("2026-06-03T00:00:00.000Z")
    });

    await expect(client.authenticate({
      mode: "password",
      accountId: "unknown_account",
      password: "user-password",
      humanVerification: validHumanVerification()
    })).rejects.toThrow("账户或密码无效");

    await expect(client.authenticate({
      mode: "password",
      accountId: "user_safe_ref",
      password: "wrong-password",
      humanVerification: validHumanVerification()
    })).rejects.toThrow("账户或密码无效");

    const result = await client.authenticate({
      mode: "password",
      accountId: "user_safe_ref",
      password: "user-password",
      humanVerification: validHumanVerification()
    });

    expect(result.status).toBe("authenticated_preview");
    const state = await client.fetchCurrentState({ userRef: "user_safe_ref" });
    expect(state.security?.initialAccount).toBe(true);
    expect(state.security?.setupRequired).toBe(true);
    expect(state.security?.passkeyExported).toBe(false);
  });

  test("local portal client validates a separate preview password per issued initial account", async () => {
    const alphaPassword = "alpha-preview-pass";
    const betaPassword = "beta-preview-pass";
    const client = createLocalUserPortalClient({
      now: () => new Date("2026-06-03T00:00:00.000Z"),
      initialAccounts: [
        {
          userRef: "portal_account_alpha",
          displayName: "Portal Account Alpha",
          issuedAt: "2026-06-03T00:00:00.000Z",
          requireSecuritySetup: false,
          previewPassword: alphaPassword
        },
        {
          userRef: "portal_account_beta",
          displayName: "Portal Account Beta",
          issuedAt: "2026-06-03T00:00:00.000Z",
          requireSecuritySetup: false,
          previewPassword: betaPassword
        }
      ]
    });

    await expect(client.authenticate({
      mode: "password",
      accountId: "portal_account_alpha",
      password: betaPassword,
      humanVerification: validHumanVerification()
    })).rejects.toThrow("账户或密码无效");

    const alphaSession = await client.authenticate({
      mode: "password",
      accountId: "portal_account_alpha",
      password: alphaPassword,
      humanVerification: validHumanVerification()
    });
    const betaSession = await client.authenticate({
      mode: "password",
      accountId: "portal_account_beta",
      password: betaPassword,
      humanVerification: validHumanVerification()
    });

    expect(alphaSession.status).toBe("authenticated_preview");
    expect(alphaSession.userRef).toBe("portal_account_alpha");
    expect(betaSession.status).toBe("authenticated_preview");
    expect(betaSession.userRef).toBe("portal_account_beta");

    const serialized = JSON.stringify({
      alphaSession,
      betaSession,
      alphaState: await client.fetchCurrentState({ userRef: "portal_account_alpha" }),
      betaState: await client.fetchCurrentState({ userRef: "portal_account_beta" })
    });
    expect(serialized).not.toContain(alphaPassword);
    expect(serialized).not.toContain(betaPassword);
  });

  test("local portal client creates a scannable authenticator enrollment and verifies a real TOTP code", async () => {
    const now = new Date("2026-06-03T00:00:00.000Z");
    const secret = "JBSWY3DPEHPK3PXP";
    const client = createLocalUserPortalClient({
      now: () => now,
      initialAccounts: previewAccountWithoutSetup(),
      totpSecretFactory: () => secret
    });

    const enrollment = await client.startAuthenticatorEnrollment({ userRef: "user_safe_ref" });

    expect(enrollment.status).toBe("preview");
    expect(enrollment.manualKey).toBe("JBSW Y3DP EHPK 3PXP");
    expect(enrollment.otpauthUri).toContain("otpauth://totp/GCC%20Gateway%20Portal:user_safe_ref");
    expect(enrollment.otpauthUri).toContain("secret=JBSWY3DPEHPK3PXP");
    expect(enrollment.qrDataUri).toMatch(/^data:image\/png;base64,/);

    await expect(client.confirmAuthenticatorEnrollment({
      userRef: "user_safe_ref",
      enrollmentRef: enrollment.enrollmentRef,
      totpCode: "123456"
    })).rejects.toThrow("动态验证码无效或已过期");

    const totpCode = await createTotpCode(secret, now);
    const binding = await client.confirmAuthenticatorEnrollment({
      userRef: "user_safe_ref",
      enrollmentRef: enrollment.enrollmentRef,
      totpCode
    });

    expect(binding.status).toBe("bound_preview");
    expect(binding.method).toBe("totp");
    expect(binding.safety.noRawSecretReturned).toBe(true);
  });

  test("passes password login contract through local client without rendering the raw password", async () => {
    const client = portalClient();
    render(createElement(UserPortalPage, { portalClient: client }));

    fireEvent.change(screen.getByLabelText("账户 ID"), { target: { value: "acct_password_1" } });
    fireEvent.change(screen.getByLabelText("密码"), { target: { value: "secret-passphrase" } });
    const robotAnswer = await waitForRobotAnswer();
    fireEvent.change(screen.getByLabelText("防机器人校验"), { target: { value: robotAnswer } });
    fireEvent.click(screen.getByRole("button", { name: "登录" }));

    await screen.findByRole("navigation", { name: "用户中心导航" });
    expect(client.authenticate).toHaveBeenCalledWith({
      mode: "password",
      accountId: "acct_password_1",
      password: "secret-passphrase",
      humanVerification: expect.objectContaining({
        challengeAnswer: robotAnswer,
        honeypot: ""
      })
    });
    expect(screen.queryByDisplayValue("secret-passphrase")).toBeNull();
  });

  test("loads a backend-issued human challenge before password login", async () => {
    const client = portalClient({
      issueHumanChallenge: vi.fn(async () => ({
        challengeId: "phc_http_1",
        prompt: "8 + 5 = ?",
        expiresInSeconds: 120
      }))
    });
    render(createElement(UserPortalPage, { portalClient: client }));

    await waitFor(() => {
      expect((screen.getByLabelText("防机器人校验") as HTMLInputElement).placeholder).toBe("8 + 5 = ?");
    });

    fireEvent.change(screen.getByLabelText("账户 ID"), { target: { value: "acct_password_1" } });
    fireEvent.change(screen.getByLabelText("密码"), { target: { value: "secret-passphrase" } });
    fireEvent.change(screen.getByLabelText("防机器人校验"), { target: { value: "13" } });
    fireEvent.click(screen.getByRole("button", { name: "登录" }));

    await screen.findByRole("navigation", { name: "用户中心导航" });
    expect(client.issueHumanChallenge).toHaveBeenCalledWith({ scope: "portal_login" });
    expect(client.authenticate).toHaveBeenCalledWith({
      mode: "password",
      accountId: "acct_password_1",
      password: "secret-passphrase",
      humanVerification: {
        challengeId: "phc_http_1",
        challengeAnswer: "13",
        honeypot: ""
      }
    });
  });

  test("http portal client activates entry before creating a scoped session", async () => {
    const fetchFn = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === "/api/portal/entry/enroll") {
        expect(JSON.parse(String(init?.body))).toEqual({
          entryToken: "visible-once-entry",
          encryptedTotpSecret: "enc:totp",
          humanVerification: validHumanVerification()
        });
        return new Response(JSON.stringify({
          enrollment: {
            accountId: "acct_portal_1",
            enrolledAt: "2026-06-03T00:00:00.000Z"
          }
        }), { status: 200, headers: { "Content-Type": "application/json" } });
      }
      if (url === "/api/portal/session") {
        expect(JSON.parse(String(init?.body))).toEqual({
          accountId: "acct_portal_1",
          code: "123456",
          humanVerification: validHumanVerification()
        });
        return new Response(JSON.stringify({
          session: {
            accountId: "acct_portal_1",
            issuedAt: "2026-06-03T00:00:00.000Z",
            expiresAt: "2026-06-03T00:30:00.000Z"
          }
        }), { status: 200, headers: { "Content-Type": "application/json" } });
      }
      return new Response(JSON.stringify({ error: "unexpected_url" }), { status: 404 });
    });
    const client = createHttpUserPortalClient({ fetchFn });

    const session = await client.authenticate({
      mode: "token",
      entryToken: "visible-once-entry",
      encryptedTotpSecret: "enc:totp",
      totpCode: "123456",
      humanVerification: validHumanVerification()
    });

    expect(session.userRef).toBe("acct_portal_1");
    expect(session.authMode).toBe("token");
    expect(session.safety.noAdminApi).toBe(true);
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  test("http portal client posts password login to backend and maps TOTP challenges", async () => {
    const fetchFn = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toBe("/api/portal/password/session");
      expect(JSON.parse(String(init?.body))).toEqual({
        accountId: "acct_password_1",
        password: "secret-passphrase",
        humanVerification: {
          challengeRef: "phc_http_1",
          answer: "13"
        }
      });
      return new Response(JSON.stringify({
        challenge: {
          status: "second_factor_required",
          challengeRef: "mfa_http_1",
          accountId: "acct_password_1",
          availableFactors: ["totp"],
          expiresAt: "2026-06-03T00:05:00.000Z",
          safety: {
            noSessionCreated: true
          }
        }
      }), { status: 202, headers: { "Content-Type": "application/json" } });
    });
    const client = createHttpUserPortalClient({ fetchFn });

    const result = await client.authenticate({
      mode: "password",
      accountId: "acct_password_1",
      password: "secret-passphrase",
      humanVerification: backendHumanVerification()
    });

    expect(result.status).toBe("second_factor_required");
    if (result.status !== "second_factor_required") {
      throw new Error("expected second-factor challenge");
    }
    expect(result.challengeRef).toBe("mfa_http_1");
    expect(result.userRef).toBe("acct_password_1");
    expect(result.availableFactors).toEqual(["authenticator"]);
    expect(result.safety.noSessionCreated).toBe(true);
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  test("http portal client completes backend TOTP second-factor challenges", async () => {
    const fetchFn = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toBe("/api/portal/password/second-factor");
      expect(JSON.parse(String(init?.body))).toEqual({
        challengeRef: "mfa_http_1",
        factor: "totp",
        code: "123456"
      });
      return new Response(JSON.stringify({
        session: {
          sessionRef: "portal_session_http_1",
          accountId: "acct_password_1",
          authMethod: "totp",
          issuedAt: "2026-06-03T00:00:00.000Z",
          expiresAt: "2026-06-03T00:30:00.000Z"
        }
      }), { status: 200, headers: { "Content-Type": "application/json" } });
    });
    const client = createHttpUserPortalClient({ fetchFn });

    const session = await client.completeSecondFactor({
      challengeRef: "mfa_http_1",
      factor: "authenticator",
      totpCode: "123456"
    });

    expect(session.status).toBe("authenticated_preview");
    expect(session.sessionRef).toBe("portal_session_http_1");
    expect(session.userRef).toBe("acct_password_1");
    expect(session.authMode).toBe("authenticator");
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  test("http portal client preserves every backend order for the order table", async () => {
    const fetchFn = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toBe("/api/portal/access-requests/current?portalUserRef=user_safe_ref");
      expect(init?.method).toBe("GET");
      return new Response(JSON.stringify({
        items: [
          {
            id: "pareq_trial_1",
            portalUserRef: "user_safe_ref",
            plan: "trial",
            clientTarget: "clash",
            durationDays: 7,
            quantity: 1,
            status: "pending_admin_review",
            submittedAt: "2026-06-01T00:00:00.000Z",
            updatedAt: "2026-06-01T00:00:00.000Z"
          },
          {
            id: "pareq_monthly_2",
            portalUserRef: "user_safe_ref",
            plan: "monthly",
            clientTarget: "karing",
            durationDays: 30,
            quantity: 3,
            status: "delivered",
            accessGrantRef: "grant_safe_ref",
            usage: {
              uploadBytes: 10,
              downloadBytes: 20,
              usedBytes: 30,
              totalBytes: 100,
              usageRatio: 0.3,
              status: "within_limit",
              updatedAt: "2026-06-02T00:05:00.000Z"
            },
            submittedAt: "2026-06-02T00:00:00.000Z",
            updatedAt: "2026-06-02T00:00:00.000Z"
          }
        ]
      }), { status: 200, headers: { "Content-Type": "application/json" } });
    });
    const client = createHttpUserPortalClient({
      fetchFn,
      now: () => new Date("2026-06-04T00:00:00.000Z")
    });

    const state = await client.fetchCurrentState({ userRef: "user_safe_ref" });
    const requests = (state as PortalUserState & {
      subscriptionRequests?: PortalSubscriptionRequest[];
    }).subscriptionRequests;

    expect(requests?.map((request) => request.requestRef)).toEqual([
      "pareq_trial_1",
      "pareq_monthly_2"
    ]);
    expect(requests?.[1].quantity).toBe(3);
    expect(requests?.[1].clientTarget).toBe("karing");
    expect(requests?.[1].usage).toMatchObject({
      usedBytes: 30,
      totalBytes: 100,
      usageRatio: 0.3,
      status: "within_limit"
    });
    expect(state.subscriptionRequest?.requestRef).toBe("pareq_monthly_2");
    expect(state.historySummary?.map((record) => record.recordRef)).toEqual([
      "history_pareq_trial_1",
      "history_pareq_monthly_2"
    ]);
  });

  test("http portal client sends the portal session when creating an order", async () => {
    const fetchFn = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toBe("/api/portal/access-requests");
      expect(init?.method).toBe("POST");
      expect(init?.headers).toMatchObject({
        "X-Portal-Session": "portal_session_http_1"
      });
      expect(JSON.parse(String(init?.body))).toEqual({
        portalUserRef: "user_safe_ref",
        plan: "trial",
        clientTarget: "clash",
        durationDays: 7,
        quantity: 1
      });
      return new Response(JSON.stringify({
        request: {
          id: "pareq_trial_session_1",
          portalUserRef: "user_safe_ref",
          plan: "trial",
          clientTarget: "clash",
          durationDays: 7,
          quantity: 1,
          status: "delivered",
          accessGrantRef: "grant_safe_ref",
          submittedAt: "2026-06-04T00:00:00.000Z",
          updatedAt: "2026-06-04T00:00:00.000Z"
        }
      }), { status: 201, headers: { "Content-Type": "application/json" } });
    });
    const client = createHttpUserPortalClient({ fetchFn });

    const request = await client.applyForSubscription({
      userRef: "user_safe_ref",
      sessionRef: "portal_session_http_1",
      planId: "trial",
      clientTarget: "clash",
      durationDays: 7,
      quantity: 1
    } as never);

    expect(request.requestRef).toBe("pareq_trial_session_1");
    expect(request.lifecycle).toBe("active");
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  test("http portal client keeps email code login fail-closed without sending a code request", async () => {
    const fetchFn = vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 }));
    const client = createHttpUserPortalClient({ fetchFn });

    await expect(client.requestEmailCode({
      purpose: "login",
      email: "user@example.test",
      humanVerification: validHumanVerification()
    })).rejects.toThrow("邮箱验证码登录尚未启用");

    await expect(client.authenticate({
      mode: "email",
      email: "user@example.test",
      verificationCode: "A1B2",
      humanVerification: validHumanVerification()
    })).rejects.toThrow("邮箱验证码登录尚未启用");
    expect(fetchFn).not.toHaveBeenCalled();
  });

  test("http portal client starts and confirms backend authenticator enrollment with a portal session", async () => {
    const fetchFn = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      expect(init?.headers).toMatchObject({
        "X-Portal-Session": "portal_session_http_1"
      });
      if (url === "/api/portal/security/totp/enrollment") {
        expect(init?.method).toBe("POST");
        expect(JSON.parse(String(init?.body))).toEqual({});
        return new Response(JSON.stringify({
          enrollment: {
            enrollmentRef: "totp_enroll_http_1",
            issuer: "GCC Gateway Portal",
            accountLabel: "user_safe_ref",
            manualKey: "JBSW Y3DP EHPK 3PXP",
            otpauthUri: "otpauth://totp/GCC%20Gateway%20Portal:user_safe_ref?secret=JBSWY3DPEHPK3PXP&issuer=GCC+Gateway+Portal&algorithm=SHA1&digits=6&period=30",
            expiresInSeconds: 300,
            issuedAt: "2026-06-03T00:00:00.000Z"
          }
        }), { status: 201, headers: { "Content-Type": "application/json" } });
      }
      if (url === "/api/portal/security/totp/enrollment/confirm") {
        expect(init?.method).toBe("POST");
        expect(JSON.parse(String(init?.body))).toEqual({
          enrollmentRef: "totp_enroll_http_1",
          code: "123456"
        });
        return new Response(JSON.stringify({
          binding: {
            boundAt: "2026-06-03T00:01:00.000Z"
          },
          security: {
            authenticatorBound: true
          }
        }), { status: 200, headers: { "Content-Type": "application/json" } });
      }
      return new Response(JSON.stringify({ error: "unexpected_url" }), { status: 404 });
    });
    const client = createHttpUserPortalClient({ fetchFn });

    const enrollment = await client.startAuthenticatorEnrollment({
      userRef: "user_safe_ref",
      sessionRef: "portal_session_http_1"
    } as never);
    expect(enrollment.enrollmentRef).toBe("totp_enroll_http_1");
    expect(enrollment.qrDataUri).toMatch(/^data:image\/png;base64,/);

    const binding = await client.confirmAuthenticatorEnrollment({
      userRef: "user_safe_ref",
      sessionRef: "portal_session_http_1",
      enrollmentRef: "totp_enroll_http_1",
      totpCode: "123456"
    } as never);
    expect(binding.userRef).toBe("user_safe_ref");
    expect(binding.method).toBe("totp");
    expect(binding.boundAt).toBe("2026-06-03T00:01:00.000Z");
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  test("does not expose entry token or standalone authenticator as normal login choices", async () => {
    render(createElement(UserPortalPage, { portalClient: portalClient() }));

    expect(screen.queryByRole("group", { name: "登录方式" })).toBeNull();
    expect(screen.queryByRole("button", { name: "入口 Token" })).toBeNull();
    expect(screen.queryByRole("button", { name: "身份验证器" })).toBeNull();
    expect(screen.queryByRole("button", { name: "密码登录" })).toBeNull();
    expect(screen.queryByLabelText("入口令牌")).toBeNull();
    expect(screen.queryByLabelText("TOTP 密钥")).toBeNull();
    expect(screen.queryByLabelText("动态验证码")).toBeNull();
    expect(screen.getByRole("heading", { name: "账号登录" })).not.toBeNull();
  });

  test("requires authenticator QR enrollment before marking the security factor bound", async () => {
    render(createElement(UserPortalPage, { portalClient: portalClient() }));

    await enterPortal();
    fireEvent.click(screen.getByRole("button", { name: "个人中心" }));

    expect(screen.getByRole("heading", { name: "安全设置" })).not.toBeNull();
    expect(screen.getByText("身份验证器")).not.toBeNull();
    expect(screen.getByText("通行密钥")).not.toBeNull();
    expect(screen.getByText("未绑定")).not.toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "绑定身份验证器" }));

    expect(await screen.findByRole("dialog", { name: "绑定身份验证器" })).not.toBeNull();
    expect(screen.getByRole("img", { name: "Google Authenticator 扫码二维码" })).not.toBeNull();
    expect(screen.getByLabelText("手动密钥")).not.toBeNull();
    expect(screen.getByLabelText("6 位动态码")).not.toBeNull();
    expect(screen.getByRole("button", { name: "确认绑定" })).not.toBeNull();
    expect(screen.queryByText("已绑定")).toBeNull();

    fireEvent.change(screen.getByLabelText("6 位动态码"), { target: { value: "123456" } });
    fireEvent.click(screen.getByRole("button", { name: "确认绑定" }));

    expect(await screen.findByText("已绑定")).not.toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "导出通行密钥" }));

    await waitFor(() => {
      expect(screen.getByText("通行密钥").closest(".portal-security-row")?.textContent).toContain("已导出");
    });
    expect(screen.queryByRole("button", { name: "入口 Token" })).toBeNull();
    expect(screen.queryByRole("button", { name: "身份验证器" })).toBeNull();
  });

  test("requires account-level authenticator verification on the next login after binding", async () => {
    const now = new Date("2026-06-03T12:00:00.000Z");
    const secret = "JBSWY3DPEHPK3PXP";
    const client = createLocalUserPortalClient({
      now: () => now,
      initialAccounts: previewAccountWithoutSetup(),
      totpSecretFactory: () => secret
    });
    render(createElement(UserPortalPage, { portalClient: client }));

    await enterPortal();
    fireEvent.click(screen.getByRole("button", { name: "个人中心" }));
    fireEvent.click(screen.getByRole("button", { name: "绑定身份验证器" }));

    expect(await screen.findByRole("dialog", { name: "绑定身份验证器" })).not.toBeNull();

    fireEvent.change(screen.getByLabelText("6 位动态码"), {
      target: { value: await createTotpCode(secret, now) }
    });
    fireEvent.click(screen.getByRole("button", { name: "确认绑定" }));

    expect(await screen.findByText("已绑定")).not.toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "退出登录" }));
    await submitPortalLogin();

    expect(await screen.findByRole("heading", { name: "二次验证" })).not.toBeNull();
    expect(screen.getByLabelText("身份验证器验证码")).not.toBeNull();
    expect(screen.queryByRole("navigation", { name: "用户中心导航" })).toBeNull();
  });

  test("requires account-level passkey verification on the next login after enabling it", async () => {
    const client = createLocalUserPortalClient({
      initialAccounts: previewAccountWithoutSetup()
    });
    const passkeyExport = await client.exportPasskey({ userRef: "user_safe_ref" });
    render(createElement(UserPortalPage, { portalClient: client }));

    await submitPortalLogin();

    expect(await screen.findByRole("heading", { name: "二次验证" })).not.toBeNull();
    expect(screen.getByLabelText("通行密钥备份内容")).not.toBeNull();
    expect(screen.getByRole("button", { name: "使用通行密钥" })).not.toBeNull();

    fireEvent.change(screen.getByLabelText("通行密钥备份内容"), {
      target: { value: "{\"type\":\"local-passkey-preview\",\"passkeyRef\":\"wrong\"}" }
    });
    fireEvent.click(screen.getByRole("button", { name: "使用通行密钥" }));

    expect(await screen.findByText("通行密钥验证失败。")).not.toBeNull();
    expect(screen.queryByRole("navigation", { name: "用户中心导航" })).toBeNull();

    fireEvent.change(screen.getByLabelText("通行密钥备份内容"), {
      target: { value: passkeyExport.body }
    });
    fireEvent.click(screen.getByRole("button", { name: "使用通行密钥" }));

    expect(await screen.findByRole("navigation", { name: "用户中心导航" })).not.toBeNull();
  });

  test("local portal client verifies the exported passkey package instead of a fixed passkey proof", async () => {
    const client = createLocalUserPortalClient({
      initialAccounts: previewAccountWithoutSetup()
    });
    const passkeyExport = await client.exportPasskey({ userRef: "user_safe_ref" });
    const challenge = await client.authenticate({
      mode: "password",
      accountId: "user_safe_ref",
      password: "user-password",
      humanVerification: validHumanVerification()
    });

    expect(challenge.status).toBe("second_factor_required");
    if (challenge.status !== "second_factor_required") {
      throw new Error("expected passkey challenge");
    }

    await expect(client.completeSecondFactor({
      challengeRef: challenge.challengeRef,
      factor: "passkey",
      passkeyProof: "local-passkey-preview"
    })).rejects.toThrow("通行密钥验证失败");

    await expect(client.completeSecondFactor({
      challengeRef: challenge.challengeRef,
      factor: "passkey",
      passkeyProof: JSON.stringify({
        ...JSON.parse(passkeyExport.body),
        userRef: "other_user"
      })
    })).rejects.toThrow("通行密钥验证失败");

    const session = await client.completeSecondFactor({
      challengeRef: challenge.challengeRef,
      factor: "passkey",
      passkeyProof: passkeyExport.body
    });

    expect(session.status).toBe("authenticated_preview");
    expect(session.authMode).toBe("passkey");
  });

  test("prompts an initial account to bind authenticator and export passkey after login", async () => {
    const now = new Date("2026-06-03T12:00:00.000Z");
    const secret = "JBSWY3DPEHPK3PXP";
    const createObjectURL = vi.fn(() => "blob:portal-passkey-preview");
    const revokeObjectURL = vi.fn();
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: createObjectURL
    });
    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true,
      value: revokeObjectURL
    });
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
    const client = createLocalUserPortalClient({
      now: () => now,
      totpSecretFactory: () => secret
    });
    render(createElement(UserPortalPage, { portalClient: client }));

    await enterPortal();

    const setupDialog = await screen.findByRole("dialog", { name: "账户安全初始化" });
    expect(within(setupDialog).getByText("初始账号首次登录必须完成安全绑定。")).not.toBeNull();
    expect(within(setupDialog).getByText("身份验证器")).not.toBeNull();
    expect(within(setupDialog).getByText("通行密钥导出")).not.toBeNull();

    fireEvent.click(within(setupDialog).getByRole("button", { name: "绑定身份验证器" }));

    expect(await screen.findByRole("dialog", { name: "绑定身份验证器" })).not.toBeNull();
    fireEvent.change(screen.getByLabelText("6 位动态码"), {
      target: { value: await createTotpCode(secret, now) }
    });
    fireEvent.click(screen.getByRole("button", { name: "确认绑定" }));

    const resumedSetupDialog = await screen.findByRole("dialog", { name: "账户安全初始化" });
    expect(within(resumedSetupDialog).getByText("已绑定")).not.toBeNull();

    fireEvent.click(within(resumedSetupDialog).getByRole("button", { name: "导出通行密钥" }));

    await waitFor(() => expect(createObjectURL).toHaveBeenCalledTimes(1));
    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: "账户安全初始化" })).toBeNull();
    });
    expect(screen.getByRole("navigation", { name: "用户中心导航" })).not.toBeNull();
  });

  test("defaults to a simple subscription page rather than a dashboard", async () => {
    render(createElement(UserPortalPage, { portalClient: portalClient() }));

    const portalNav = await enterPortal();

    expect(within(portalNav).getByText("订阅管理")).not.toBeNull();
    expect(within(portalNav).getByText("使用教程")).not.toBeNull();
    expect(within(portalNav).getByText("客服支持")).not.toBeNull();
    expect(within(portalNav).getByText("个人中心")).not.toBeNull();
    expect(within(portalNav).queryByText("Dashboard")).toBeNull();
    expect(screen.getByRole("heading", { name: "订阅管理" })).not.toBeNull();
    expect(screen.queryByText("流量仪表盘")).toBeNull();
    expect(screen.queryByText("安全清单")).toBeNull();
  });

  test("keeps the new order form collapsed until the user starts a new order", async () => {
    render(createElement(UserPortalPage, { portalClient: portalClient() }));

    await enterPortal();

    expect(screen.getByRole("button", { name: "新建订单申请" })).not.toBeNull();
    expect(screen.getByText("暂无订单")).not.toBeNull();
    expect(screen.getByRole("button", { name: "立即新建订单申请" })).not.toBeNull();
    expect(screen.queryByRole("table", { name: "订阅订单列表" })).toBeNull();
    expect(screen.queryByLabelText("订单时长")).toBeNull();
    expect(screen.queryByLabelText("数量")).toBeNull();
    expect(screen.queryByRole("button", { name: "确认提交" })).toBeNull();

    openNewOrderForm();

    const orderDialog = screen.getByRole("dialog", { name: "新建订单申请" });
    expect(within(orderDialog).getByText("请选择您需要的套餐配置，提交后系统自动发放。")).not.toBeNull();
    expect(within(orderDialog).getByLabelText("订单时长")).not.toBeNull();
    expect(within(orderDialog).getByLabelText("数量")).not.toBeNull();
    expect(within(orderDialog).queryByText(/删除操作|停用处理/)).toBeNull();
    expect(within(orderDialog).getByRole("button", { name: "取消" })).not.toBeNull();
    expect(within(orderDialog).getByRole("button", { name: "确认提交" })).not.toBeNull();

    fireEvent.click(within(orderDialog).getByRole("button", { name: "取消" }));
    expect(screen.queryByRole("dialog", { name: "新建订单申请" })).toBeNull();
  });

  test("submits yearly opening requests through the user-scoped client", async () => {
    const client = portalClient();
    render(createElement(UserPortalPage, { portalClient: client }));

    await enterPortal();
    openNewOrderForm();
    fireEvent.change(screen.getByLabelText("订单时长"), { target: { value: "365" } });
    fireEvent.click(screen.getByRole("button", { name: "确认提交" }));

    expect((await screen.findAllByText("等待系统发放")).length).toBeGreaterThan(0);
    expect(client.applyForSubscription).toHaveBeenCalledWith(
      expect.objectContaining({
        userRef: "user_safe_ref",
        planId: "yearly",
        clientTarget: "clash",
        requestOnly: true,
        durationDays: 365,
        quantity: 1
      })
    );
    expect(screen.queryByText("https://sub.example.test/import/visible-once")).toBeNull();
    expect(within(screen.getByRole("table", { name: "订阅订单列表" })).getByText("365 天")).not.toBeNull();
    expect(screen.getByText("账户 ID：user_safe_ref")).not.toBeNull();
  });

  test("submits a 7 day subscription as an order request without direct subscription generation", async () => {
    const client = portalClient();
    render(createElement(UserPortalPage, { portalClient: client }));

    await enterPortal();
    openNewOrderForm();
    fireEvent.change(screen.getByLabelText("订单时长"), { target: { value: "7" } });
    fireEvent.click(screen.getByRole("button", { name: "确认提交" }));

    expect((await screen.findAllByText("等待系统发放")).length).toBeGreaterThan(0);
    expect(screen.queryByText("https://sub.example.test/import/visible-once")).toBeNull();
    expect(client.applyForSubscription).toHaveBeenCalledWith(
      expect.objectContaining({
        planId: "trial",
        requestOnly: true
      })
    );
    expect(screen.getByRole("button", { name: /删除/ }).hasAttribute("disabled")).toBe(true);
  });

  test("manages subscriptions through an order table with disabled delete controls", async () => {
    const client = portalClient();
    render(createElement(UserPortalPage, { portalClient: client }));

    await enterPortal();

    expect(screen.getByRole("button", { name: "新建订单申请" })).not.toBeNull();
    expect(screen.getByRole("tab", { name: "全部" })).not.toBeNull();
    expect(screen.getByRole("tab", { name: "生效中" })).not.toBeNull();
    openNewOrderForm();
    expect(screen.getByLabelText("订单时长")).not.toBeNull();
    expect(screen.getByLabelText("数量")).not.toBeNull();

    fireEvent.change(screen.getByLabelText("订单时长"), { target: { value: "30" } });
    fireEvent.change(screen.getByLabelText("数量"), { target: { value: "3" } });
    fireEvent.click(screen.getByRole("button", { name: "确认提交" }));

    await waitFor(() => expect(client.applyForSubscription).toHaveBeenCalledWith(
      expect.objectContaining({
        userRef: "user_safe_ref",
        planId: "monthly",
        clientTarget: "clash",
        requestOnly: true,
        durationDays: 30,
        quantity: 3
      })
    ));

    const orderTable = await screen.findByRole("table", { name: "订阅订单列表" });
    expect(within(orderTable).getByText("订单号")).not.toBeNull();
    expect(within(orderTable).getByText("30 天")).not.toBeNull();
    expect(within(orderTable).getByText("3")).not.toBeNull();
    expect(within(orderTable).getByRole("button", { name: /查看/ })).not.toBeNull();
    expect(within(orderTable).getByRole("button", { name: /编辑/ })).not.toBeNull();
    expect(within(orderTable).getByRole("button", { name: /删除/ }).hasAttribute("disabled")).toBe(true);

    fireEvent.click(within(orderTable).getByRole("button", { name: /编辑/ }));
    const editDialog = screen.getByRole("dialog", { name: "编辑订单申请" });
    expect(within(editDialog).getByText("请选择您需要的套餐配置，提交后系统自动发放。")).not.toBeNull();
    expect(within(editDialog).queryByText(/删除操作|停用处理/)).toBeNull();
    expect(within(editDialog).getByRole("button", { name: "保存改动" })).not.toBeNull();
    fireEvent.click(within(editDialog).getByRole("button", { name: "取消" }));
    expect(screen.queryByRole("dialog", { name: "编辑订单申请" })).toBeNull();
  });

  test("uses the order table as the only subscription management surface", async () => {
    const client = portalClient();
    render(createElement(UserPortalPage, { portalClient: client }));

    await enterPortal();
    openNewOrderForm();
    fireEvent.change(screen.getByLabelText("订单时长"), { target: { value: "30" } });
    fireEvent.change(screen.getByLabelText("数量"), { target: { value: "2" } });
    fireEvent.click(screen.getByRole("button", { name: "确认提交" }));

    const orderTable = await screen.findByRole("table", { name: "订阅订单列表" });
    expect(within(orderTable).getByText("30 天")).not.toBeNull();
    expect(within(orderTable).getByText("2")).not.toBeNull();
    expect(within(orderTable).getByRole("button", { name: /查看/ })).not.toBeNull();
    expect(within(orderTable).getByRole("button", { name: /编辑/ })).not.toBeNull();
    expect(within(orderTable).getByRole("button", { name: /删除/ }).hasAttribute("disabled")).toBe(true);

    expect(screen.queryByRole("region", { name: "订阅状态" })).toBeNull();
    expect(screen.queryByRole("heading", { name: "当前订阅" })).toBeNull();
    expect(screen.queryByText("授权完成后显示订阅链接")).toBeNull();
    expect(screen.queryByRole("button", { name: "复制" })).toBeNull();
    expect(screen.queryByRole("button", { name: "刷新当前订阅" })).toBeNull();
  });

  test("local portal client records 7 day orders without direct subscription generation when requestOnly is set", async () => {
    const client = createLocalUserPortalClient({
      now: () => new Date("2026-05-31T00:00:00.000Z"),
      demoSubscriptionUrl: "https://sub.example.test/import/local-visible-once"
    });

    const request = await client.applyForSubscription({
      userRef: "user_safe_ref",
      planId: "trial",
      clientTarget: "clash",
      requestOnly: true
    });

    expect(request.lifecycle).toBe("pending");
    expect(request.status).toBe("ready_for_operator_review");
    expect(request.subscriptionUrl).toBeUndefined();
    expect(request.expiresAt).toBe("待系统发放");

    const repeat = await client.applyForSubscription({
      userRef: "user_safe_ref",
      planId: "trial",
      clientTarget: "clash",
      requestOnly: true
    });
    expect(repeat.lifecycle).toBe("pending");
    expect(repeat.requestRef).not.toBe(request.requestRef);
  });

  test("does not collect contact details before package application", async () => {
    const client = portalClient();
    render(createElement(UserPortalPage, { portalClient: client }));

    await enterPortal();
    openNewOrderForm();
    fireEvent.click(screen.getByRole("button", { name: "确认提交" }));

    expect(screen.queryByText("请先填写授权联系资料。")).toBeNull();
    expect(screen.queryByRole("dialog", { name: "填写联系资料" })).toBeNull();
    expect(screen.queryByLabelText("联系手机号")).toBeNull();
    expect(screen.queryByLabelText("Telegram 账号")).toBeNull();
    await waitFor(() => expect(client.applyForSubscription).toHaveBeenCalledWith(
      expect.objectContaining({
        userRef: "user_safe_ref",
        planId: "monthly",
        clientTarget: "clash",
        requestOnly: true
      })
    ));
  });

  test("refreshing an active subscription is separate from opening a package", async () => {
    const client = portalClient({
      fetchCurrentState: vi.fn(async (input: { userRef: string }): Promise<PortalUserState> => ({
        userRef: input.userRef,
        subscriptionRequest: {
          status: "subscription_ready",
          lifecycle: "active",
          requestRef: "subreq_existing_monthly",
          userRef: input.userRef,
          planId: "monthly",
          clientTarget: "clash",
          expiresAt: "2026-06-30T00:00:00.000Z",
          subscriptionUrl: "https://sub.example.test/import/existing-visible-once",
          nextAction: "copy_subscription_url",
          safety: {
            noAdminApi: true,
            noDbMutation: true,
            noPaymentActivation: true,
            noPublicAdmin: true,
            noRawCustomerDataReturned: true
          }
        },
        updatedAt: "2026-05-31T00:00:00.000Z",
        safety: {
          noAdminApi: true,
          noPaymentActivation: true,
          noPublicAdmin: true
        }
      }))
    });
    render(createElement(UserPortalPage, { portalClient: client }));

    await enterPortal();
    expect((await screen.findAllByText("服务生效中")).length).toBeGreaterThan(0);

    expect(screen.getByRole("button", { name: /刷新订单/ })).not.toBeNull();
    expect(screen.getByRole("button", { name: "新建订单申请" }).hasAttribute("disabled")).toBe(false);

    fireEvent.click(screen.getByRole("button", { name: /刷新订单/ }));

    expect(client.applyForSubscription).not.toHaveBeenCalled();
    await waitFor(() => expect(client.refreshSubscription).toHaveBeenCalledWith({
      userRef: "user_safe_ref",
      requestRef: "subreq_existing_monthly",
      clientTarget: "clash"
    }));
    await waitFor(() => expect(screen.getByRole("button", { name: /刷新订单/ })).not.toBeNull());
    expect(screen.getByText(/旧链接已于/)).not.toBeNull();
    expect(screen.queryByText("旧订阅失效")).toBeNull();
  });

  test("lets a signed-in user disable their own active subscription without delete controls", async () => {
    const client = portalClient({
      fetchCurrentState: vi.fn(async (input: { userRef: string }): Promise<PortalUserState> => ({
        userRef: input.userRef,
        subscriptionRequest: {
          status: "subscription_ready",
          lifecycle: "active",
          requestRef: "subreq_trial_active",
          userRef: input.userRef,
          planId: "trial",
          clientTarget: "clash",
          expiresAt: "2026-06-07T00:00:00.000Z",
          subscriptionUrl: "https://sub.example.test/import/existing-visible-once",
          nextAction: "copy_subscription_url",
          safety: {
            noAdminApi: true,
            noDbMutation: true,
            noPaymentActivation: true,
            noPublicAdmin: true,
            noRawCustomerDataReturned: true
          }
        },
        updatedAt: "2026-05-31T00:00:00.000Z",
        safety: {
          noAdminApi: true,
          noPaymentActivation: true,
          noPublicAdmin: true
        }
      }))
    });
    render(createElement(UserPortalPage, { portalClient: client }));

    await enterPortal();
    expect((await screen.findAllByText("服务生效中")).length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: "禁用" })).not.toBeNull();
    expect(screen.getByRole("button", { name: /删除/ }).hasAttribute("disabled")).toBe(true);

    fireEvent.click(screen.getByRole("button", { name: "禁用" }));

    await waitFor(() => expect(client.disableSubscription).toHaveBeenCalledWith({
      userRef: "user_safe_ref",
      requestRef: "subreq_trial_active"
    }));
    expect(within(screen.getByRole("table", { name: "订阅订单列表" })).getByText("已禁用")).not.toBeNull();
    expect(screen.queryByText("https://sub.example.test/import/existing-visible-once")).toBeNull();
  });

  test("renders old-link invalidation only when the portal client returns the event", async () => {
    const client = portalClient({
      fetchCurrentState: vi.fn(async (input: { userRef: string }): Promise<PortalUserState> => ({
        userRef: input.userRef,
        subscriptionRequest: {
          status: "subscription_ready",
          lifecycle: "active",
          requestRef: "subreq_existing_monthly",
          userRef: input.userRef,
          planId: "monthly",
          clientTarget: "clash",
          expiresAt: "2026-06-30T00:00:00.000Z",
          subscriptionUrl: "https://sub.example.test/import/existing-visible-once",
          nextAction: "copy_subscription_url",
          safety: {
            noAdminApi: true,
            noDbMutation: true,
            noPaymentActivation: true,
            noPublicAdmin: true,
            noRawCustomerDataReturned: true
          }
        },
        updatedAt: "2026-05-31T00:00:00.000Z",
        safety: {
          noAdminApi: true,
          noPaymentActivation: true,
          noPublicAdmin: true
        }
      })),
      refreshSubscription: vi.fn(async (input: PortalRefreshSubscriptionInput): Promise<PortalSubscriptionRequest> => ({
        status: "subscription_ready",
        lifecycle: "active",
        requestRef: input.requestRef,
        userRef: input.userRef,
        planId: "monthly",
        clientTarget: input.clientTarget,
        expiresAt: "2026-06-30T00:00:00.000Z",
        subscriptionUrl: "https://sub.example.test/import/refreshed-no-event",
        nextAction: "copy_subscription_url",
        safety: {
          noAdminApi: true,
          noDbMutation: true,
          noPaymentActivation: true,
          noPublicAdmin: true,
          noRawCustomerDataReturned: true
        }
      }))
    });
    render(createElement(UserPortalPage, { portalClient: client }));

    await enterPortal();
    expect((await screen.findAllByText("服务生效中")).length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole("button", { name: /刷新订单/ }));

    await waitFor(() => expect(client.refreshSubscription).toHaveBeenCalledTimes(1));
    expect(screen.queryByText(/旧链接已于/)).toBeNull();
  });

  test("trusts server-provided lifecycle instead of recalculating expiry from the browser clock", async () => {
    const client = portalClient({
      fetchCurrentState: vi.fn(async (input: { userRef: string }): Promise<PortalUserState> => ({
        userRef: input.userRef,
        subscriptionRequest: {
          status: "subscription_ready",
          lifecycle: "active",
          requestRef: "subreq_server_authoritative_active",
          userRef: input.userRef,
          planId: "monthly",
          clientTarget: "clash",
          expiresAt: "2000-01-01T00:00:00.000Z",
          subscriptionUrl: "https://sub.example.test/import/server-authoritative",
          nextAction: "copy_subscription_url",
          safety: {
            noAdminApi: true,
            noDbMutation: true,
            noPaymentActivation: true,
            noPublicAdmin: true,
            noRawCustomerDataReturned: true
          }
        },
        updatedAt: "2026-05-31T00:00:00.000Z",
        safety: {
          noAdminApi: true,
          noPaymentActivation: true,
          noPublicAdmin: true
        }
      }))
    });
    render(createElement(UserPortalPage, { portalClient: client }));

    await enterPortal();

    expect((await screen.findAllByText("服务生效中")).length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: /刷新订单/ })).not.toBeNull();
    expect(screen.queryByRole("button", { name: "重新提交申请" })).toBeNull();
  });

  test("hydrates existing active subscription state after authentication", async () => {
    const client = portalClient({
      fetchCurrentState: vi.fn(async (input: { userRef: string }): Promise<PortalUserState> => ({
        userRef: input.userRef,
        subscriptionRequest: {
          status: "subscription_ready",
          lifecycle: "active",
          requestRef: "subreq_existing_yearly",
          userRef: input.userRef,
          planId: "yearly",
          clientTarget: "karing",
          expiresAt: "2027-05-31T00:00:00.000Z",
          subscriptionUrl: "https://sub.example.test/import/existing-visible-once",
          nextAction: "copy_subscription_url",
          safety: {
            noAdminApi: true,
            noDbMutation: true,
            noPaymentActivation: true,
            noPublicAdmin: true,
            noRawCustomerDataReturned: true
          }
        },
        updatedAt: "2026-06-01T00:00:00.000Z",
        safety: {
          noAdminApi: true,
          noPaymentActivation: true,
          noPublicAdmin: true
        }
      }))
    });
    render(createElement(UserPortalPage, { portalClient: client }));

    await enterPortal();

    expect(client.fetchCurrentState).toHaveBeenCalledWith({ userRef: "user_safe_ref" });
    expect((await screen.findAllByText("服务生效中")).length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: /刷新订单/ })).not.toBeNull();
    expect(screen.getByRole("button", { name: "复制链接" })).not.toBeNull();
    expect(screen.queryByText("https://sub.example.test/import/existing-visible-once")).toBeNull();
    const hydratedOrderTable = screen.getByRole("table", { name: "订阅订单列表" });
    expect(within(hydratedOrderTable).getByText("365 天")).not.toBeNull();
    expect(within(hydratedOrderTable).getByText("Karing")).not.toBeNull();
    expect(client.applyForSubscription).not.toHaveBeenCalled();
  });

  test("hydrates all backend orders into the merged order table after authentication", async () => {
    const trialOrder: PortalSubscriptionRequest = {
      status: "ready_for_operator_review",
      lifecycle: "pending",
      requestRef: "pareq_trial_1",
      userRef: "user_safe_ref",
      planId: "trial",
      clientTarget: "clash",
      expiresAt: "待系统发放",
      durationDays: 7,
      quantity: 1,
      nextAction: "operator_review_required",
      updatedAt: "2026-06-01T00:00:00.000Z",
      safety: {
        noAdminApi: true,
        noDbMutation: true,
        noPaymentActivation: true,
        noPublicAdmin: true,
        noRawCustomerDataReturned: true
      }
    };
    const monthlyOrder: PortalSubscriptionRequest = {
      status: "subscription_ready",
      lifecycle: "active",
      requestRef: "pareq_monthly_2",
      userRef: "user_safe_ref",
      planId: "monthly",
      clientTarget: "karing",
      expiresAt: "2026-07-02T00:00:00.000Z",
      durationDays: 30,
      quantity: 3,
      subscriptionUrl: "https://sub.example.test/import/existing-visible-once",
      usage: {
        uploadBytes: 536870912,
        downloadBytes: 1073741824,
        usedBytes: 1610612736,
        totalBytes: 10737418240,
        usageRatio: 0.15,
        status: "within_limit",
        updatedAt: "2026-06-02T00:10:00.000Z"
      },
      nextAction: "copy_subscription_url",
      updatedAt: "2026-06-02T00:00:00.000Z",
      safety: {
        noAdminApi: true,
        noDbMutation: true,
        noPaymentActivation: true,
        noPublicAdmin: true,
        noRawCustomerDataReturned: true
      }
    };
    const client = portalClient({
      fetchCurrentState: vi.fn(async (input: { userRef: string }): Promise<PortalUserState> => ({
        userRef: input.userRef,
        subscriptionRequest: monthlyOrder,
        subscriptionRequests: [trialOrder, monthlyOrder],
        historySummary: [],
        updatedAt: "2026-06-02T00:00:00.000Z",
        safety: {
          noAdminApi: true,
          noPaymentActivation: true,
          noPublicAdmin: true
        }
      } as PortalUserState & { subscriptionRequests: PortalSubscriptionRequest[] }))
    });
    render(createElement(UserPortalPage, { portalClient: client }));

    await enterPortal();

    const hydratedOrderTable = await screen.findByRole("table", { name: "订阅订单列表" });
    expect(within(hydratedOrderTable).getByText("7 天")).not.toBeNull();
    expect(within(hydratedOrderTable).getByText("30 天")).not.toBeNull();
    expect(within(hydratedOrderTable).getByText("3")).not.toBeNull();
    expect(within(hydratedOrderTable).getByText("Karing")).not.toBeNull();
    expect(within(hydratedOrderTable).getByText("流量")).not.toBeNull();
    expect(within(hydratedOrderTable).getByText("1.5 GB / 10 GB")).not.toBeNull();
    expect(screen.getByRole("button", { name: /刷新订单/ })).not.toBeNull();
    expect(client.applyForSubscription).not.toHaveBeenCalled();
  });

  test("does not invent profile history from current subscription state", async () => {
    const client = portalClient({
      fetchCurrentState: vi.fn(async (input: { userRef: string }): Promise<PortalUserState> => ({
        userRef: input.userRef,
        subscriptionRequest: {
          status: "subscription_ready",
          lifecycle: "active",
          requestRef: "subreq_existing_yearly",
          userRef: input.userRef,
          planId: "yearly",
          clientTarget: "karing",
          expiresAt: "2027-05-31T00:00:00.000Z",
          subscriptionUrl: "https://sub.example.test/import/existing-visible-once",
          nextAction: "copy_subscription_url",
          safety: {
            noAdminApi: true,
            noDbMutation: true,
            noPaymentActivation: true,
            noPublicAdmin: true,
            noRawCustomerDataReturned: true
          }
        },
        updatedAt: "2026-06-01T00:00:00.000Z",
        safety: {
          noAdminApi: true,
          noPaymentActivation: true,
          noPublicAdmin: true
        }
      }))
    });
    render(createElement(UserPortalPage, { portalClient: client }));

    await enterPortal();
    fireEvent.click(screen.getByRole("button", { name: "个人中心" }));

    expect(screen.getByText("暂无完成套餐记录")).not.toBeNull();
    expect(screen.queryByText(/申请年卡（已授权）/)).toBeNull();
  });

  test("copies a generated subscription only when the portal client returns visible material", async () => {
    const client = portalClient({
      fetchCurrentState: vi.fn(async (input: { userRef: string }): Promise<PortalUserState> => ({
        userRef: input.userRef,
        subscriptionRequest: {
          status: "subscription_ready",
          lifecycle: "active",
          requestRef: "subreq_existing_monthly",
          userRef: input.userRef,
          planId: "monthly",
          clientTarget: "clash",
          expiresAt: "2026-06-30T00:00:00.000Z",
          subscriptionUrl: "https://sub.example.test/import/visible-once",
          nextAction: "copy_subscription_url",
          safety: {
            noAdminApi: true,
            noDbMutation: true,
            noPaymentActivation: true,
            noPublicAdmin: true,
            noRawCustomerDataReturned: true
          }
        },
        updatedAt: "2026-05-31T00:00:00.000Z",
        safety: {
          noAdminApi: true,
          noPaymentActivation: true,
          noPublicAdmin: true
        }
      }))
    });
    const writeText = vi.fn(async () => undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText }
    });

    render(createElement(UserPortalPage, { portalClient: client }));

    await enterPortal();
    expect((await screen.findAllByText("服务生效中")).length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole("button", { name: "复制链接" }));

    await waitFor(() => expect(writeText).toHaveBeenCalledWith("https://sub.example.test/import/visible-once"));
  });

  test("default local portal client is safe by default and exposes no subscription link", async () => {
    const client = createLocalUserPortalClient({
      now: () => new Date("2026-05-31T00:00:00.000Z")
    });
    render(createElement(UserPortalPage, { portalClient: client }));

    await enterPortal();
    openNewOrderForm();
    fireEvent.click(screen.getByRole("button", { name: "确认提交" }));

    expect((await screen.findAllByText("等待系统发放")).length).toBeGreaterThan(0);
    expect(screen.queryByText("下一步：等待系统发放")).toBeNull();
    expect(screen.queryByText("授权完成后显示订阅链接")).toBeNull();
    expect(screen.queryByRole("button", { name: "复制" })).toBeNull();
    expect(screen.queryByRole("button", { name: "确认提交" })).toBeNull();
    expect(screen.getByRole("button", { name: "新建订单申请" }).hasAttribute("disabled")).toBe(false);

    fireEvent.click(screen.getByRole("button", { name: "个人中心" }));

    expect(screen.getByText("查看账户基础信息与历史记录。")).not.toBeNull();
    expect(screen.getAllByText("月卡 · 等待系统发放").length).toBeGreaterThan(0);
    expect(screen.getByText("待系统发放")).not.toBeNull();
    expect(screen.queryByText("授权联系资料")).toBeNull();
    expect(screen.queryByRole("button", { name: "修改资料" })).toBeNull();
    expect(screen.getByText(/申请月卡（待发放）/)).not.toBeNull();
    expect(screen.queryByText("2026/06/30 到期")).toBeNull();
    expect(screen.queryByText("月卡 / 年卡套餐，申请开通；生效期内可刷新当前订阅。")).toBeNull();
  });

  test("personal center does not collect profile contact info", async () => {
    const client = portalClient();
    render(createElement(UserPortalPage, { portalClient: client }));

    await enterPortal();
    fireEvent.click(screen.getByRole("button", { name: "个人中心" }));

    expect(screen.queryByRole("button", { name: "填写资料" })).toBeNull();
    expect(screen.queryByRole("button", { name: "修改资料" })).toBeNull();
    expect(screen.queryByLabelText("联系手机号")).toBeNull();
    expect(screen.queryByLabelText("Telegram 账号")).toBeNull();
    expect(screen.queryByRole("dialog", { name: "填写联系资料" })).toBeNull();
  });

  test("local preview client preserves server-owned package facts when refreshing", async () => {
    const client = createLocalUserPortalClient({
      now: () => new Date("2026-05-31T00:00:00.000Z"),
      demoSubscriptionUrl: "https://sub.example.test/import/local-visible-once"
    });

    const applied = await client.applyForSubscription({
      userRef: "user_safe_ref",
      planId: "yearly",
      clientTarget: "clash"
    });
    const refreshed = await client.refreshSubscription({
      userRef: "user_safe_ref",
      requestRef: applied.requestRef,
      clientTarget: "karing"
    });

    expect(refreshed.lifecycle).toBe("active");
    expect(refreshed.planId).toBe("yearly");
    expect(refreshed.expiresAt).toBe(applied.expiresAt);
    expect(refreshed.clientTarget).toBe("karing");
  });

  test("renders usage guide, support form, and personal center without payment or dashboard language", async () => {
    const submitSupportRequest = vi.fn(async (input: {
      userRef: string;
      category: string;
      message: string;
      clientTarget: string;
      subscriptionRequestRef?: string;
    }) => ({
      status: "submitted",
      supportRef: "psup_preview",
      userRef: input.userRef,
      category: input.category,
      clientTarget: input.clientTarget,
      submittedAt: "2026-05-31T00:00:00.000Z",
      safety: {
        noAdminApi: true,
        noDbMutation: true,
        noPaymentActivation: true,
        noPublicAdmin: true,
        noRawMessageReturned: true
      }
    }));
    const client = portalClient({
      submitSupportRequest
    } as Partial<UserPortalClient>);
    render(createElement(UserPortalPage, { portalClient: client }));

    await enterPortal();
    fireEvent.click(screen.getByRole("button", { name: "使用教程" }));
    expect(screen.getByText("下载客户端")).not.toBeNull();
    expect(screen.getByText("从订单复制链接")).not.toBeNull();
    expect(screen.getByText("导入配置")).not.toBeNull();
    expect(screen.getByText("Clash Verge Rev")).not.toBeNull();
    expect(screen.getByText("系统代理")).not.toBeNull();
    expect(screen.getByText("这个页面只解释用户操作，不展示后台节点、流量图或运维指标。")).not.toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "客服支持" }));
    expect(screen.getByText("问题反馈表单")).not.toBeNull();
    expect(screen.queryByText(/Telegram|机器人|人工客服/)).toBeNull();
    fireEvent.change(screen.getByLabelText("问题类型"), { target: { value: "client_import" } });
    fireEvent.change(screen.getByLabelText("问题描述"), { target: { value: "Clash 导入后无法更新订阅。" } });
    fireEvent.click(screen.getByRole("button", { name: "提交问题" }));
    await waitFor(() => expect(submitSupportRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        userRef: "user_safe_ref",
        category: "client_import",
        clientTarget: "clash",
        message: "Clash 导入后无法更新订阅。"
      })
    ));
    expect(await screen.findByText(/问题已提交/)).not.toBeNull();
    expect(screen.queryByRole("button", { name: "提交问题" })).toBeNull();
    expect(screen.getByRole("button", { name: "再提一个问题" })).not.toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "个人中心" }));
    expect(screen.getAllByText("注册日期").length).toBe(1);
    expect(screen.getByText("历史消费账单")).not.toBeNull();
    expect(screen.queryByText("充值")).toBeNull();
    expect(screen.queryByText("余额")).toBeNull();
    expect(screen.queryByText("扣费")).toBeNull();
  });
});
