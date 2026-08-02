import { afterEach, describe, expect, test, vi } from "vitest";
import { createElement } from "react";
import "@testing-library/jest-dom/vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { App } from "../App";
import {
  isLocalPortalShellPreviewEnabled,
  UserPortalRoute
} from "../features/user-portal/user-portal-route";
import { UserRegistrationPage } from "../features/user-portal/user-registration-page";
import { UserPortalPage } from "../features/user-portal/user-portal-page";
import { createTotpCode } from "../features/user-portal/totp-preview";
import {
  createHttpUserPortalClient,
  createLocalUserPortalClient,
  PORTAL_REGISTRATION_SESSION_STORAGE_KEY,
  type PortalAuthInput,
  type PortalAuthenticatorBinding,
  type PortalAuthenticatorEnrollment,
  type PortalApplySubscriptionInput,
  type PortalCompleteSecondFactorInput,
  type PortalEmailCodeChallenge,
  type PortalHumanVerificationChallenge,
  type PortalPaymentCheckoutInput,
  type PortalPaymentCheckoutResult,
  type PortalPaymentOrder,
  type PortalPasskeyBinding,
  type PortalPasskeyExport,
  type PortalRefreshSubscriptionInput,
  type PortalRevealSubscriptionInput,
  type PortalRegistrationEmailVerificationChallenge,
  type PortalRegistrationInput,
  type PortalRegistrationResult,
  type PortalSession,
  type PortalSupportRequest,
  type PortalSupportRequestInput,
  type PortalSubscriptionRequest,
  type PortalUserState,
  type UserPortalClient
} from "../features/user-portal/user-portal-client";
import {
  PortalWalletClientError,
  type PortalWalletClient,
  type PortalWalletLedgerEntry,
  type PortalWalletSummary
} from "../features/user-portal/wallet";
import type {
  PortalCoinCommerceClient,
  PortalCoinOrder
} from "../features/user-portal/commerce";
import type {
  PortalRechargeClient,
  PortalRechargeOffer,
  PortalRechargeOrder
} from "../features/user-portal/recharge";

afterEach(() => {
  cleanup();
  window.localStorage.clear();
  window.sessionStorage.clear();
  window.location.hash = "";
  vi.restoreAllMocks();
});

function installMobilePaymentDevice() {
  const originalMatchMedia = window.matchMedia;
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    writable: true,
    value: vi.fn((query: string) => ({
      matches: query.includes("pointer: coarse") || query.includes("max-width"),
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn()
    }))
  });
  return () => {
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      writable: true,
      value: originalMatchMedia
    });
  };
}

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
    requestRegistrationEmailVerification: vi.fn(async (): Promise<PortalRegistrationEmailVerificationChallenge> => ({
      status: "requested",
      verificationRef: "reg_email_preview",
      expiresInSeconds: 600,
      safety: {
        noAdminApi: true,
        noAccountCreated: true,
        noPublicAuthActivated: true,
        noRawCodeReturned: true,
        noRawEmailReturned: true
      }
    })),
    registerTrialAccount: vi.fn(async (input: PortalRegistrationInput): Promise<PortalRegistrationResult> => {
      const userRef = input.email.trim().toLowerCase();
      return {
        status: "registered",
        userRef,
        session: {
          status: "authenticated_preview",
          sessionRef: "portal_session_registration_preview",
          userRef,
          displayName: userRef,
          authMode: "password",
          registeredAt: "2026-07-01T00:00:00.000Z",
          safety: {
            noAdminApi: true,
            noPublicAuthActivated: true,
            noRawPasswordReturned: true
          }
        },
        trial: {
          durationDays: 7,
          validUntil: "2026-07-07T00:00:00.000Z",
          accessRequestStatus: "pending_admin_review"
        },
        safety: {
          noAdminApi: true,
          noPaymentActivation: true,
          noPublicAdmin: true,
          noRawCustomerDataReturned: true,
          rawPasswordReturned: false
        }
      };
    }),
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
      paymentOrders: [],
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
    fetchPaymentOrders: vi.fn(async (): Promise<PortalPaymentOrder[]> => []),
    createPaymentCheckout: vi.fn(async (input: PortalPaymentCheckoutInput): Promise<PortalPaymentCheckoutResult> => ({
      provider: "niuniu-pay",
      order: {
        orderRef: `pay_${input.planId}`,
        planId: input.planId,
        planLabel: input.planId === "yearly"
          ? "yearly"
          : input.planId === "monthly_plus"
            ? "monthly plus"
            : "monthly basic",
        amountMinor: input.planId === "yearly"
          ? 20000
          : input.planId === "monthly_plus"
            ? 3000
            : 2000,
        channel: input.channel,
        currency: "CNY",
        status: "pending_payment",
        checkoutUrl: `https://pay.example.test/${input.planId}`,
        createdAt: "2026-05-31T00:00:00.000Z",
        paymentExpiresAt: "2099-01-01T00:00:00.000Z",
        safety: {
          noRawMerchantKey: true,
          noRawProviderPayload: true
        }
      },
      safety: {
        noRawMerchantKey: true,
        noRawProviderPayload: true,
        noSubscriptionIssued: true
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
      const planLabel = input.planId === "yearly"
        ? "年度套餐"
        : input.planId === "monthly_plus"
          ? "标准月付"
          : input.planId === "monthly_basic"
            ? "基础月付"
            : input.planId === "trial"
              ? "7 天试用"
              : "月付套餐";
      return {
        status: requestOnly ? "ready_for_operator_review" : "subscription_ready",
        lifecycle: requestOnly ? "pending" : "active",
        requestRef: `subreq_${input.planId}`,
      userRef: input.userRef,
      planId: input.planId,
      clientTarget: input.clientTarget,
        expiresAt: requestOnly
          ? "开通中"
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
            label: `申请${planLabel}（${requestOnly ? "待开通" : "已开通"}）`,
            status: requestOnly ? "待开通" : "已开通",
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
    revealSubscription: vi.fn(async (input: PortalRevealSubscriptionInput): Promise<PortalSubscriptionRequest> => ({
      status: "subscription_ready",
      lifecycle: "active",
      requestRef: input.requestRef,
      userRef: input.userRef,
      planId: "trial",
      clientTarget: "clash",
      expiresAt: "2026-06-07T00:00:00.000Z",
      subscriptionUrl: "https://sub.example.test/import/revealed-visible-once",
      nextAction: "copy_subscription_url",
      updatedAt: "2026-05-31T00:00:00.000Z",
      safety: {
        noAdminApi: true,
        noDbMutation: true,
        noPaymentActivation: true,
        noPublicAdmin: true,
        noRawCustomerDataReturned: true
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
          label: "停用订阅（已停用）",
          status: "已停用",
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

function portalWalletSession(
  sessionRef: string,
  userRef: string
): PortalSession {
  return {
    status: "authenticated_preview",
    sessionRef,
    userRef,
    displayName: userRef,
    authMode: "password",
    registeredAt: "2026-07-27T00:00:00.000Z",
    safety: {
      noAdminApi: true,
      noPublicAuthActivated: true,
      noRawPasswordReturned: true
    }
  };
}

function portalWalletSummary(
  spendableUnits: number,
  status: PortalWalletSummary["status"] = "active"
): PortalWalletSummary {
  if (status === "not_created") {
    return {
      status,
      version: 0,
      balances: {
        paidCoins: 0,
        bonusCoins: 0,
        rewardCoins: 0
      },
      spendableUnits: 0,
      heldUnits: 0,
      pendingUnits: 0
    };
  }
  return {
    status,
    version: 2,
    balances: {
      paidCoins: spendableUnits - 5,
      bonusCoins: 4,
      rewardCoins: 1
    },
    spendableUnits,
    heldUnits: 3,
    pendingUnits: 2
  };
}

const RETURN_RECHARGE_OFFER: PortalRechargeOffer = {
  offerRef: "coins_30",
  quoteVersion: 1,
  paidCoinUnits: 30,
  amountMinor: 100,
  currency: "USD",
  currencyExponent: 2
};

function returnedRechargeOrder(
  status: PortalRechargeOrder["status"]
): PortalRechargeOrder {
  return {
    orderRef: "payment_return_order_1",
    offerRef: RETURN_RECHARGE_OFFER.offerRef,
    quoteVersion: 1,
    expectedPaidCoinUnits: 30,
    amountMinor: 100,
    currency: "USD",
    currencyExponent: 2,
    adapterKey: "paypal_v1",
    paymentMethod: "paypal",
    status,
    providerOrderRef: "paypal_return_order_1",
    nextAction: null,
    walletOperationRef: null,
    walletLotRef: null,
    expiresAt: "2026-08-02T05:00:00.000Z",
    createdAt: "2026-08-02T03:00:00.000Z",
    updatedAt: "2026-08-02T03:10:00.000Z"
  };
}

function portalWalletEntry(): PortalWalletLedgerEntry {
  return {
    entryRef: "entry_wallet_shell_001",
    category: "credit",
    coinType: "paid_coins",
    amountUnits: 20,
    availableDeltaUnits: null,
    pendingDeltaUnits: null,
    heldDeltaUnits: null,
    totalDeltaUnits: 20,
    relatedOrderRef: null,
    occurredAt: "2026-07-27T12:00:00.000Z"
  };
}

function deferredValue<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });
  return { promise, reject, resolve };
}

function activeSubscriptionRequest(overrides: Partial<PortalSubscriptionRequest> = {}): PortalSubscriptionRequest {
  return {
    status: "subscription_ready",
    lifecycle: "active",
    requestRef: "subreq_existing_monthly",
    userRef: "user_safe_ref",
    planId: "monthly_basic",
    clientTarget: "clash",
    expiresAt: "2026-06-30T00:00:00.000Z",
    durationDays: 30,
    quantity: 1,
    subscriptionUrl: "https://sub.example.test/import/existing-visible-once",
    nextAction: "copy_subscription_url",
    updatedAt: "2026-05-31T00:00:00.000Z",
    safety: {
      noAdminApi: true,
      noDbMutation: true,
      noPaymentActivation: true,
      noPublicAdmin: true,
      noRawCustomerDataReturned: true
    },
    ...overrides
  };
}

function paymentOrder(
  overrides: Partial<PortalPaymentOrder> = {}
): PortalPaymentOrder {
  return {
    orderRef: "pay_existing_monthly",
    planId: "monthly_basic",
    planLabel: "基础月付",
    amountMinor: 2000,
    channel: "alipay",
    currency: "CNY",
    status: "pending_payment",
    checkoutUrl: "https://pay.example.test/existing",
    createdAt: "2026-05-31T00:00:00.000Z",
    paymentExpiresAt: "2099-01-01T00:00:00.000Z",
    safety: {
      noRawMerchantKey: true,
      noRawProviderPayload: true
    },
    ...overrides
  };
}

function marketplaceOrder(): PortalCoinOrder {
  return {
    orderRef: "commerce_order_001",
    offer: {
      offerRef: "offer_marketplace_001",
      offerVersionRef: "offer_version_marketplace_001",
      category: "plan",
      title: { zh: "商城测试商品", en: "Marketplace test offer" },
      summary: { zh: "统一订单列表测试商品", en: "Unified order list test offer" },
      importantNotices: {
        zh: ["仅用于订单中心测试"],
        en: ["Order-center fixture only"]
      },
      baseCoinUnits: 20,
      referencePrice: { currency: "CNY", amountMinor: 2_000 },
      acceptedCoinTypes: ["paid_coins"],
      delivery: {
        kind: "subscription_plan",
        durationDays: 30,
        monthlyTrafficGb: 50,
        trafficGb: null,
        neverExpires: false,
        discountBasisPoints: 0
      }
    },
    amountUnits: 20,
    allocation: [{ coinType: "paid_coins", amountUnits: 20 }],
    paymentStatus: "captured",
    cancelUntil: "2026-07-28T12:30:00.000Z",
    fulfillment: { status: "delivered", safeCode: null },
    createdAt: "2026-07-28T12:00:00.000Z",
    updatedAt: "2026-07-28T12:01:00.000Z"
  };
}

async function authenticatedSessionWithRef(input: PortalAuthInput): Promise<PortalSession> {
  return {
    status: "authenticated_preview",
    sessionRef: "portal_session_orders_test",
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
  };
}

function portalClientWithPaymentOrders(
  paymentOrders: PortalPaymentOrder[],
  stateOverrides: Partial<Omit<PortalUserState, "userRef">> = {},
  clientOverrides: Partial<UserPortalClient> = {}
): UserPortalClient {
  return portalClient({
    fetchCurrentState: vi.fn(async (input: {
      userRef: string;
    }): Promise<PortalUserState> => ({
      userRef: input.userRef,
      subscriptionRequest: null,
      paymentOrders,
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
      },
      ...stateOverrides
    })),
    ...clientOverrides
  });
}

function portalClientWithActiveSubscription(
  requestOverrides: Partial<PortalSubscriptionRequest> = {},
  clientOverrides: Partial<UserPortalClient> = {}
): UserPortalClient {
  return portalClient({
    fetchCurrentState: vi.fn(async (input: { userRef: string }): Promise<PortalUserState> => ({
      userRef: input.userRef,
      subscriptionRequest: activeSubscriptionRequest({
        userRef: input.userRef,
        ...requestOverrides
      }),
      paymentOrders: [],
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
    ...clientOverrides
  });
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

function openPortalDashboard() {
  fireEvent.click(screen.getByRole("button", { name: "概览" }));
}

function openPortalProfile() {
  fireEvent.click(screen.getByRole("button", { name: "个人中心" }));
}

function openPortalSettings() {
  fireEvent.click(screen.getByRole("button", { name: "设置" }));
}

function openPortalWallet() {
  fireEvent.click(screen.getByRole("button", { name: "Coins 钱包" }));
}

function openPortalOrders() {
  fireEvent.click(screen.getByRole("button", { name: "订单" }));
}

function expectMarketplaceWithoutLegacyCheckout(client: UserPortalClient) {
  expect(screen.getByRole("region", { name: "商城目录" })).not.toBeNull();
  expect(screen.getByRole("status")).toHaveTextContent(
    "当前客户端未提供服务端商城能力"
  );
  expect(screen.queryByRole("heading", { name: "平台服务商城" })).toBeNull();
  expect(screen.queryByRole("dialog", { name: "选择套餐" })).toBeNull();
  expect(screen.queryByRole("dialog", { name: "选择支付方式" })).toBeNull();
  expect(client.createPaymentCheckout).not.toHaveBeenCalled();
  expect(client.applyForSubscription).not.toHaveBeenCalled();
}

function openPortalSubscriptions() {
  openPortalStartGuide();
  const startSetup = screen.queryByRole("button", { name: "开始配置" });
  if (startSetup) fireEvent.click(startSetup);
  const desktopOption = screen.queryByRole("button", { name: "Windows PC / Laptop" });
  if (desktopOption) fireEvent.click(desktopOption);
  const clashOption = screen.queryByRole("button", { name: "Clash Verge Rev Windows / macOS / Linux" });
  if (clashOption) fireEvent.click(clashOption);
  const nextButton = screen.queryByRole("button", { name: "下一步" });
  if (nextButton) fireEvent.click(nextButton);
}

function openPortalStartGuide() {
  const portalNav = screen.queryByRole("navigation", { name: "用户中心导航" })
    ?? screen.getByRole("navigation", { name: "User center navigation" });
  const startButton = within(portalNav).queryByRole("button", { name: "开始使用" })
    ?? within(portalNav).queryByRole("button", { name: "Start using" });
  if (!startButton) {
    throw new Error("Start guide navigation item is not available");
  }
  fireEvent.click(startButton);
}

async function submitPortalLogin(accountId = "user_safe_ref", password = "user-password") {
  fireEvent.change(screen.getByLabelText("电子邮箱"), { target: { value: accountId } });
  fireEvent.change(screen.getByLabelText("密码"), { target: { value: password } });
  fireEvent.change(screen.getByLabelText("防机器人校验"), { target: { value: await waitForRobotAnswer() } });
  fireEvent.click(screen.getByRole("button", { name: "登录" }));
}

describe("user portal route", () => {
  test("keeps automatic portal shell preview local to development loopback hosts", () => {
    expect(isLocalPortalShellPreviewEnabled(
      { MODE: "development" },
      { hostname: "127.0.0.1" }
    )).toBe(true);
    expect(isLocalPortalShellPreviewEnabled(
      { MODE: "development" },
      { hostname: "localhost" }
    )).toBe(true);
    expect(isLocalPortalShellPreviewEnabled(
      { MODE: "production" },
      { hostname: "127.0.0.1" }
    )).toBe(false);
    expect(isLocalPortalShellPreviewEnabled(
      { MODE: "development" },
      { hostname: "admin.gccwebos.com" }
    )).toBe(false);
    expect(isLocalPortalShellPreviewEnabled(
      { MODE: "development", VITE_USER_PORTAL_LOCAL_SHELL_PREVIEW: "false" },
      { hostname: "127.0.0.1" }
    )).toBe(false);
  });

  test("enters the local development portal shell without a test account", async () => {
    render(createElement(UserPortalRoute, {
      mode: "login",
      env: { MODE: "development" },
      location: { hostname: "127.0.0.1" }
    }));

    expect(await screen.findByRole("heading", {
      name: "先选择适合你的套餐"
    })).not.toBeNull();
    await waitFor(() => expect(document.title).toBe("GCC WebOS - 用户中心"));
    expect(screen.getByRole("navigation", { name: "用户中心导航" })).not.toBeNull();
    expect(screen.getByRole("button", { name: "开始使用" })).not.toBeNull();
    expect(screen.getByRole("button", { name: "订单" })).not.toBeNull();
    expect(screen.queryByRole("button", { name: "订阅" })).toBeNull();
    expect(screen.queryByRole("region", { name: "用户登录" })).toBeNull();
  });

  test("does not expose the customer portal from the Admin app shell", async () => {
    render(createElement(App));

    expect(screen.getByRole("heading", { name: "Connect Admin API" })).not.toBeNull();
    expect(screen.queryByLabelText("Admin navigation")).toBeNull();
    expect(screen.queryByRole("heading", { name: "账号登录" })).toBeNull();

    window.location.hash = "#/portal";
    window.dispatchEvent(new HashChangeEvent("hashchange"));

    expect(screen.getByRole("heading", { name: "Connect Admin API" })).not.toBeNull();
    expect(screen.queryByRole("heading", { name: "账号登录" })).toBeNull();
    expect(screen.queryByLabelText("Admin navigation")).toBeNull();
  });

  test("keeps local customer portal preview as a portal-only surface", async () => {
    render(createElement(UserPortalPage, {
      portalClient: createLocalUserPortalClient({
        demoSubscriptionUrl: "https://sub.example.test/import/local-preview-visible-once"
      })
    }));

    expect(await screen.findByRole("heading", { name: "账号登录" })).not.toBeNull();

    await enterPortal();

    expect(screen.queryByText("portal request failed")).toBeNull();
    expect(screen.getByRole("navigation", { name: "用户中心导航" })).not.toBeNull();
    expect(screen.queryByLabelText("Admin navigation")).toBeNull();
  });

  test("keeps display theme beside language preferences across sign in", async () => {
    render(createElement(UserPortalPage, {
      portalClient: createLocalUserPortalClient({
        demoSubscriptionUrl: "https://sub.example.test/import/local-preview-visible-once"
      })
    }));

    expect(screen.getByRole("group", { name: "显示偏好" })).not.toBeNull();
    expect(document.querySelector(".portal-login-shell")?.getAttribute("data-portal-theme")).toBe("light");

    fireEvent.click(screen.getByRole("button", { name: "夜间主题" }));
    expect(window.localStorage.getItem("gccwebos-portal-theme")).toBe("dark");
    expect(document.querySelector(".portal-login-shell")?.getAttribute("data-portal-theme")).toBe("dark");

    await enterPortal();

    expect(await screen.findByRole("heading", {
      name: "先选择适合你的套餐"
    })).not.toBeNull();
    openPortalDashboard();
    expect(screen.queryByRole("group", { name: "显示偏好" })).toBeNull();
    openPortalSettings();
    expect(screen.getByRole("group", { name: "显示偏好" })).not.toBeNull();
    expect(document.querySelector(".portal-v2-shell")?.getAttribute("data-portal-theme")).toBe("dark");

    fireEvent.click(screen.getByRole("button", { name: "日间主题" }));
    expect(window.localStorage.getItem("gccwebos-portal-theme")).toBe("light");
    expect(document.querySelector(".portal-v2-shell")?.getAttribute("data-portal-theme")).toBe("light");
  });

  test("translates the signed-in portal shell when switching to English", async () => {
    render(createElement(UserPortalPage, { portalClient: portalClientWithActiveSubscription() }));

    await enterPortal();

    openPortalDashboard();
    openPortalSettings();
    fireEvent.click(screen.getByRole("button", { name: "EN" }));

    openPortalStartGuide();
    expect(await screen.findByRole("heading", { name: "Welcome" })).not.toBeNull();
    expect(screen.getByRole("navigation", { name: "User center navigation" })).not.toBeNull();
    expect(screen.getByRole("button", { name: "Orders" })).not.toBeNull();
    expect(screen.queryByRole("button", { name: "Subscriptions" })).toBeNull();

    expect(screen.getByRole("button", { name: "Start setup" })).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Start setup" }));
    await waitFor(() => expect(screen.getByRole("heading", { name: "Which device will you use?" })).not.toBeNull());
    expect(document.querySelector(".portal-use-topbar")).not.toBeNull();
    expect(document.querySelector(".portal-start-platform-options")).not.toBeNull();
    expect(screen.getByRole("button", { name: "Apple iOS iPhone / iPad" })).not.toBeNull();
    expect(screen.getByRole("button", { name: "Windows PC / Laptop" })).not.toBeNull();
    expect(screen.getByRole("button", { name: "Linux Terminal / Server" })).not.toBeNull();
    expect(screen.queryByRole("button", { name: "Ask about a client" })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Overview" }));
    expect(await screen.findByRole("heading", { name: "Account overview" })).not.toBeNull();
    expect(screen.queryByPlaceholderText("Search products, usage, clients")).toBeNull();
    expect(screen.queryByRole("button", { name: "Recharge Coins" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Buy plan" })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Support" }));
    expect(await screen.findByRole("heading", { name: "Submit a request" })).not.toBeNull();
    expect(screen.getByLabelText("Request type")).not.toBeNull();
    expect(screen.getByPlaceholderText("Describe the issue, client name, and steps you tried")).not.toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Personal center" }));
    expect(await screen.findByRole("heading", { name: "Account management" })).not.toBeNull();
    expect(screen.getByText("Sign-in method")).not.toBeNull();
    expect(screen.queryByText("Security settings")).toBeNull();
    fireEvent.click(screen.getByRole("tab", { name: "Security" }));
    expect(screen.getByText("Security settings")).not.toBeNull();
    expect(screen.queryByText("Sign-in method")).toBeNull();
  });

  test("lets a signed-in portal-only user leave back to account login", async () => {
    render(createElement(UserPortalPage, {
      portalClient: createLocalUserPortalClient({
        demoSubscriptionUrl: "https://sub.example.test/import/local-preview-visible-once"
      })
    }));

    await enterPortal();

    fireEvent.click(screen.getByRole("button", { name: "退出登录" }));

    expect(await screen.findByRole("heading", { name: "账号登录" })).not.toBeNull();
    expect(screen.queryByRole("navigation", { name: "用户中心导航" })).toBeNull();
    expect(screen.queryByRole("button", { name: "退出登录" })).toBeNull();
    expect((screen.getByLabelText("电子邮箱") as HTMLInputElement).value).toBe("");
    expect((screen.getByLabelText("密码") as HTMLInputElement).value).toBe("");
    expect((screen.getByLabelText("防机器人校验") as HTMLInputElement).value).toBe("");
  });
});

describe("user portal product surface", () => {
  test("uses the saved public-site language preference on registration and login entry pages", async () => {
    window.localStorage.setItem("gccwebos-site-locale", "en");
    const issueHumanChallenge = vi.fn(async (): Promise<PortalHumanVerificationChallenge> => ({
      challengeId: "phc_registration_locale",
      prompt: "8 + 5 = ?",
      expiresInSeconds: 180
    }));

    render(createElement(UserRegistrationPage, {
      portalClient: portalClient({ issueHumanChallenge })
    }));

    expect(document.documentElement.lang).toBe("en");
    expect(document.title).toBe("GCC WebOS - Registration");
    expect(screen.getByRole("heading", { name: "Create your account" })).not.toBeNull();
    expect(screen.getByText("Start your free trial")).not.toBeNull();
    expect(screen.getByLabelText("Email address")).not.toBeNull();
    expect(screen.getByLabelText("Password")).not.toBeNull();
    expect(screen.getByLabelText("Confirm password")).not.toBeNull();
    expect(screen.queryByLabelText("Verification code")).toBeNull();
    expect(screen.queryByLabelText("Name or team")).toBeNull();
    expect(screen.queryByLabelText("Plan interest")).toBeNull();
    expect(screen.queryByLabelText("Anti-bot check")).toBeNull();
    expect(screen.getByRole("button", { name: "Create account" })).not.toBeNull();
    expect(screen.queryByRole("button", { name: /Continue with Google/ })).toBeNull();
    expect(screen.getByRole("link", { name: "Terms of Service" }).getAttribute("href")).toBe("#/site/info/terms");
    expect(screen.getByRole("link", { name: "Privacy Policy" }).getAttribute("href")).toBe("#/site/info/privacy");
    expect(screen.queryByRole("button", { name: "Register for 7-day trial" })).toBeNull();
    expect(issueHumanChallenge).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "中" }));

    expect(window.localStorage.getItem("gccwebos-site-locale")).toBe("zh");
    expect(document.documentElement.lang).toBe("zh-CN");
    expect(document.title).toBe("GCC WebOS - 用户注册");
    expect(screen.getByRole("heading", { name: "创建你的账户" })).not.toBeNull();
    expect(screen.getByRole("button", { name: "创建账户" })).not.toBeNull();
    expect(screen.queryByRole("button", { name: /使用 Google 继续/ })).toBeNull();

    cleanup();
    window.localStorage.setItem("gccwebos-site-locale", "en");
    render(createElement(UserPortalPage, { portalClient: portalClient() }));

    expect(document.documentElement.lang).toBe("en");
    expect(document.title).toBe("GCC WebOS - Account sign in");
    expect(screen.getByRole("heading", { name: "Sign in to GCC WebOS" })).not.toBeNull();
    expect(screen.getByText("Welcome back. Enter your credentials to continue.")).not.toBeNull();
    expect(screen.getByLabelText("Email")).not.toBeNull();
    expect(screen.getByLabelText("Password")).not.toBeNull();
    expect(screen.getByLabelText("Anti-bot challenge")).not.toBeNull();
    expect(screen.getByRole("button", { name: "Loading check" })).not.toBeNull();
  });

  test("renders one normal account login method instead of three login tabs", async () => {
    render(createElement(UserPortalPage, { portalClient: portalClient() }));

    expect(screen.getByRole("heading", { name: "账号登录" })).not.toBeNull();
    expect(screen.getByText("使用账户密码登录，进入用户中心管理套餐、订单和客户端。")).not.toBeNull();
    expect(screen.queryByRole("group", { name: "登录方式" })).toBeNull();
    expect(screen.getByLabelText("电子邮箱")).not.toBeNull();
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

  test("links account login to self-service registration in the same portal", async () => {
    render(createElement(UserPortalPage, { portalClient: portalClient() }));

    const registrationLink = screen.getByRole("link", { name: "注册领取 7 天试用" });
    expect(registrationLink.getAttribute("href")).toBe("/portal/register/");
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

    fireEvent.change(screen.getByLabelText("电子邮箱"), { target: { value: "user@example.test" } });
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

    await expect(client.startAuthenticatorEnrollment({
      userRef: "user_safe_ref"
    })).rejects.toThrow("此账户已绑定身份验证器。");
  });

  test("passes password login contract through local client without rendering the raw password", async () => {
    const client = portalClient();
    render(createElement(UserPortalPage, { portalClient: client }));

    fireEvent.change(screen.getByLabelText("电子邮箱"), { target: { value: "user@example.test" } });
    fireEvent.change(screen.getByLabelText("密码"), { target: { value: "secret-passphrase" } });
    const robotAnswer = await waitForRobotAnswer();
    fireEvent.change(screen.getByLabelText("防机器人校验"), { target: { value: robotAnswer } });
    fireEvent.click(screen.getByRole("button", { name: "登录" }));

    await screen.findByRole("navigation", { name: "用户中心导航" });
    expect(client.authenticate).toHaveBeenCalledWith({
      mode: "password",
      accountId: "user@example.test",
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

    fireEvent.change(screen.getByLabelText("电子邮箱"), { target: { value: "user@example.test" } });
    fireEvent.change(screen.getByLabelText("密码"), { target: { value: "secret-passphrase" } });
    fireEvent.change(screen.getByLabelText("防机器人校验"), { target: { value: "13" } });
    fireEvent.click(screen.getByRole("button", { name: "登录" }));

    await screen.findByRole("navigation", { name: "用户中心导航" });
    expect(client.issueHumanChallenge).toHaveBeenCalledWith({ scope: "portal_login" });
    expect(client.authenticate).toHaveBeenCalledWith({
      mode: "password",
      accountId: "user@example.test",
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

  test("http portal client submits registration without echoing collected form fields", async () => {
    const fetchFn = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input) === "/api/portal/registration/email-verification") {
        expect(JSON.parse(String(init?.body))).toEqual({
          email: "local-user@example.test"
        });
        return new Response(JSON.stringify({
          verification: {
            status: "requested",
            verificationRef: "reg_email_1",
            expiresInSeconds: 600,
            safety: {
              noRawCodeReturned: true,
              noRawEmailReturned: true
            }
          }
        }), { status: 201, headers: { "Content-Type": "application/json" } });
      }
      expect(String(input)).toBe("/api/portal/registration");
      expect(JSON.parse(String(init?.body))).toEqual({
        email: "local-user@example.test",
        password: "register-passphrase-1",
        legalAgreement: {
          termsAccepted: true,
          privacyAccepted: true,
          termsVersion: "2026-07-02",
          privacyVersion: "2026-07-02"
        },
        emailVerification: {
          verificationRef: "reg_email_1",
          code: "246810"
        }
      });
      return new Response(JSON.stringify({
        registration: {
          userRef: "local-user@example.test",
          status: "registered",
          trial: {
            durationDays: 7,
            validUntil: "2026-07-07T09:00:00.000Z",
            accessRequestStatus: "pending_admin_review"
          },
          safety: {
            emailReturnedToAccountOwner: true,
            noInternalAccountIdReturned: true,
            noSubscriptionUrl: true,
            rawPasswordReturned: false
          }
        },
        session: {
          sessionRef: "portal_session_registration_1",
          userRef: "local-user@example.test",
          displayName: "local-user@example.test",
          authMethod: "password",
          issuedAt: "2026-07-01T09:00:00.000Z"
        }
      }), { status: 201, headers: { "Content-Type": "application/json" } });
    });
    const client = createHttpUserPortalClient({ fetchFn });

    const verification = await client.requestRegistrationEmailVerification({
      email: "local-user@example.test"
    });

    const result = await client.registerTrialAccount({
      email: "local-user@example.test",
      password: "register-passphrase-1",
      legalAgreement: {
        termsAccepted: true,
        privacyAccepted: true,
        termsVersion: "2026-07-02",
        privacyVersion: "2026-07-02"
      },
      emailVerification: {
        verificationRef: verification.verificationRef,
        code: "246810"
      }
    });

    expect(result.status).toBe("registered");
    expect("accountId" in result).toBe(false);
    expect(result.userRef).toBe("local-user@example.test");
    expect(result.session.userRef).toBe("local-user@example.test");
    expect(result.session.displayName).toBe("local-user@example.test");
    expect(result.session.authMode).toBe("password");
    expect(result.trial.durationDays).toBe(7);
    expect(JSON.stringify(result)).not.toContain("acct_registration_1");
    expect(JSON.stringify(result)).toContain("local-user@example.test");
    expect(JSON.stringify(result)).not.toContain("register-passphrase-1");
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  test("registration page creates a trial account and stores the portal session", async () => {
    const requestRegistrationEmailVerification = vi.fn(async (): Promise<PortalRegistrationEmailVerificationChallenge> => ({
      status: "requested",
      verificationRef: "reg_email_1",
      expiresInSeconds: 600,
      safety: {
        noAdminApi: true,
        noAccountCreated: true,
        noPublicAuthActivated: true,
        noRawCodeReturned: true,
        noRawEmailReturned: true
      }
    }));
    const registerTrialAccount = vi.fn(async (input: PortalRegistrationInput): Promise<PortalRegistrationResult> => {
      const userRef = input.email.trim().toLowerCase();
      return {
        status: "registered",
        userRef,
        session: {
          status: "authenticated_preview",
          sessionRef: "portal_session_registration_1",
          userRef,
          displayName: userRef,
          authMode: "password",
          registeredAt: "2026-07-01T09:00:00.000Z",
          safety: {
            noAdminApi: true,
            noPublicAuthActivated: true,
            noRawPasswordReturned: true
          }
        },
        trial: {
          durationDays: 7,
          validUntil: "2026-07-07T09:00:00.000Z",
          accessRequestStatus: "pending_admin_review"
        },
        safety: {
          noAdminApi: true,
          noPaymentActivation: true,
          noPublicAdmin: true,
          noRawCustomerDataReturned: true,
          rawPasswordReturned: false
        }
      };
    });
    const client = portalClient({
      requestRegistrationEmailVerification,
      registerTrialAccount
    });
    render(createElement(UserRegistrationPage, { portalClient: client }));

    fireEvent.change(screen.getByLabelText("电子邮箱"), { target: { value: "local-user@example.test" } });
    fireEvent.change(screen.getByLabelText("密码"), { target: { value: "Register-passphrase-1!" } });
    fireEvent.change(screen.getByLabelText("确认密码"), { target: { value: "Register-passphrase-1!" } });
    expect(screen.queryByLabelText("邮箱验证码")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "创建账户" }));

    await waitFor(() => {
      expect(requestRegistrationEmailVerification).toHaveBeenCalledWith({
        email: "local-user@example.test"
      });
    });
    expect(screen.getByRole("heading", { name: "选择试用方案" })).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "继续邮箱验证" }));

    expect(screen.getByRole("button", { name: "重新发送" })).not.toBeNull();
    expect(document.querySelector(".portal-registration-sidebar")).not.toBeNull();
    expect(screen.getByText("开始 7 天试用")).not.toBeNull();
    expect(screen.getByText("验证邮箱")).not.toBeNull();
    expect(document.querySelectorAll(".portal-registration-otp-slots span")).toHaveLength(6);
    fireEvent.change(await screen.findByLabelText("邮箱验证码"), { target: { value: "246810" } });
    expect(Array.from(document.querySelectorAll(".portal-registration-otp-slots span")).map((slot) => slot.textContent).join("")).toBe("246810");
    fireEvent.click(screen.getByRole("button", { name: "验证并开通" }));

    await waitFor(() => {
      expect(registerTrialAccount).toHaveBeenCalledWith({
        email: "local-user@example.test",
        password: "Register-passphrase-1!",
        legalAgreement: {
          termsAccepted: true,
          privacyAccepted: true,
          termsVersion: "2026-07-02",
          privacyVersion: "2026-07-02"
        },
        emailVerification: {
          verificationRef: "reg_email_1",
          code: "246810"
        }
      });
    });
    expect(screen.getByRole("heading", { name: "账户已准备好。" })).not.toBeNull();
    expect(screen.queryByLabelText("电子邮箱")).toBeNull();
    expect(screen.queryByLabelText("密码")).toBeNull();
    expect(screen.queryByText("Register-passphrase-1!")).toBeNull();
    const persisted = window.sessionStorage.getItem(PORTAL_REGISTRATION_SESSION_STORAGE_KEY);
    expect(persisted).not.toBeNull();
    expect(persisted ?? "").not.toContain("acct_registration_1");
    expect(persisted ?? "").toContain("local-user@example.test");
    expect(persisted ?? "").not.toContain("Register-passphrase-1!");
    expect(screen.getByRole("link", { name: "打开用户面板" }).getAttribute("href")).toBe("/portal/");
  });

  test("http portal client posts password login to backend and maps TOTP challenges", async () => {
    const fetchFn = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toBe("/api/portal/password/session");
      expect(JSON.parse(String(init?.body))).toEqual({
        accountId: "user@example.test",
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
          userRef: "user@example.test",
          displayName: "user@example.test",
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
      accountId: "user@example.test",
      password: "secret-passphrase",
      humanVerification: backendHumanVerification()
    });

    expect(result.status).toBe("second_factor_required");
    if (result.status !== "second_factor_required") {
      throw new Error("expected second-factor challenge");
    }
    expect(result.challengeRef).toBe("mfa_http_1");
    expect(result.userRef).toBe("user@example.test");
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
          userRef: "user@example.test",
          displayName: "user@example.test",
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
    expect(session.userRef).toBe("user@example.test");
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
        ],
        accountEntitlements: [
          {
            id: "ent_admin_yearly",
            accountId: "user_safe_ref",
            plan: "yearly",
            status: "active",
            usable: true,
            validUntil: "2027-07-07T00:00:00.000Z",
            quota: { trafficGb: 200 }
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
    expect(state.accountEntitlements).toEqual([
      {
        entitlementRef: "ent_admin_yearly",
        accountId: "user_safe_ref",
        plan: "yearly",
        status: "active",
        usable: true,
        validUntil: "2027-07-07T00:00:00.000Z",
        quota: { trafficGb: 200 }
      }
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

  test("http portal client creates a session-scoped payment checkout for paid plans", async () => {
    const fetchFn = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toBe("/api/portal/payments/checkout");
      expect(init?.method).toBe("POST");
      expect(init?.headers).toMatchObject({
        "X-Portal-Session": "portal_session_http_1"
      });
      expect(JSON.parse(String(init?.body))).toEqual({
        plan: "monthly_plus",
        clientTarget: "clash",
        channel: "wxpay",
        device: "mobile"
      });
      return new Response(JSON.stringify({
        checkout: {
          provider: "niuniu-pay",
          order: {
            orderRef: "pay_http_001",
            plan: "monthly_plus",
            planLabel: "monthly plus",
            amountMinor: 3000,
            currency: "CNY",
            status: "pending_payment",
            checkoutUrl: "https://pay.example.test/pay_http_001",
            urlScheme: "weixin://pay/pay_http_001",
            qrCode: "wxpay_qr_payload_safe",
            createdAt: "2026-07-02T10:00:00.000Z"
          },
          safety: {
            noRawMerchantKey: true,
            noRawProviderPayload: true,
            noSubscriptionIssued: true
          }
        }
      }), { status: 201, headers: { "Content-Type": "application/json" } });
    });
    const client = createHttpUserPortalClient({ fetchFn });

    const checkout = await client.createPaymentCheckout({
      userRef: "user_safe_ref",
      sessionRef: "portal_session_http_1",
      planId: "monthly_plus",
      clientTarget: "clash",
      channel: "wxpay",
      device: "mobile"
    });

    expect(checkout.order).toMatchObject({
      orderRef: "pay_http_001",
      planId: "monthly_plus",
      amountMinor: 3000,
      status: "pending_payment",
      checkoutUrl: "https://pay.example.test/pay_http_001",
      urlScheme: "weixin://pay/pay_http_001",
      qrCode: "wxpay_qr_payload_safe"
    });
    expect(JSON.stringify(checkout)).not.toMatch(/merchantSecret|apiKey|token=|rawPayload/i);
  });

  test("http portal client lists session-scoped payment orders", async () => {
    const fetchFn = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toBe("/api/portal/payments/current?status=paid_access_delivered");
      expect(init?.method).toBe("GET");
      expect(init?.headers).toMatchObject({
        "X-Portal-Session": "portal_session_http_1"
      });
      return new Response(JSON.stringify({
        payments: {
          orders: [
            {
              orderRef: "pay_current_001",
              plan: "monthly_basic",
              planLabel: "monthly basic",
              amountMinor: 2000,
              currency: "CNY",
              status: "paid_access_delivered",
              providerOrderRef: "provider_safe_001",
              accessRequestRef: "pareq_current_001",
              createdAt: "2026-07-02T10:00:00.000Z",
              paidAt: "2026-07-02T10:03:00.000Z"
            }
          ],
          safety: {
            sessionScoped: true,
            noRawMerchantKey: true,
            noRawProviderPayload: true
          }
        }
      }), { status: 200, headers: { "Content-Type": "application/json" } });
    });
    const client = createHttpUserPortalClient({ fetchFn });

    const orders = await client.fetchPaymentOrders({
      userRef: "user_safe_ref",
      sessionRef: "portal_session_http_1",
      status: "paid_access_delivered"
    });

    expect(orders).toHaveLength(1);
    expect(orders[0]).toMatchObject({
      orderRef: "pay_current_001",
      planId: "monthly_basic",
      status: "paid_access_delivered",
      accessRequestRef: "pareq_current_001"
    });
    expect(JSON.stringify(orders)).not.toMatch(/merchantSecret|apiKey|token=|rawPayload/i);
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
    fireEvent.click(screen.getByRole("tab", { name: "安全" }));

    expect(screen.getByRole("heading", { name: "安全设置" })).not.toBeNull();
    expect(screen.getByText("身份验证器")).not.toBeNull();
    expect(screen.getByText("通行密钥")).not.toBeNull();
    expect(screen.getByText("未绑定")).not.toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "绑定身份验证器" }));

    expect(await screen.findByRole("dialog", { name: "绑定身份验证器" })).not.toBeNull();
    expect(screen.getByRole("img", { name: "身份验证器扫码二维码" })).not.toBeNull();
    expect(screen.getByLabelText("手动密钥")).not.toBeNull();
    expect(screen.getByLabelText("6 位动态码")).not.toBeNull();
    expect(screen.getByRole("button", { name: "确认绑定" })).not.toBeNull();
    expect(screen.queryByText("已绑定")).toBeNull();

    fireEvent.change(screen.getByLabelText("6 位动态码"), { target: { value: "123456" } });
    fireEvent.click(screen.getByRole("button", { name: "确认绑定" }));

    expect(await screen.findByText("已绑定")).not.toBeNull();

    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
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
    fireEvent.click(screen.getByRole("tab", { name: "安全" }));
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

  test("defaults to the Figma-style start guide and keeps account dashboard reachable", async () => {
    render(createElement(UserPortalPage, { portalClient: portalClient() }));

    const portalNav = await enterPortal();

    expect(within(portalNav).getByRole("button", { name: "开始使用" })).not.toBeNull();
    expect(within(portalNav).getByRole("button", { name: "概览" })).not.toBeNull();
    expect(within(portalNav).getByRole("button", { name: "用量" })).not.toBeNull();
    expect(within(portalNav).getByRole("button", { name: "个人中心" })).not.toBeNull();
    expect(within(portalNav).getByRole("button", { name: "支持" })).not.toBeNull();
    expect(within(portalNav).getByRole("button", { name: "订单" })).not.toBeNull();
    expect(within(portalNav).queryByRole("button", { name: "订阅" })).toBeNull();
    expect(within(portalNav).queryByText("Dashboard")).toBeNull();
    expect(screen.getByRole("heading", { name: "先选择适合你的套餐" })).not.toBeNull();
    expect(screen.getByRole("region", { name: "开始使用" })).toHaveAttribute(
      "data-access",
      "needs-plan"
    );
    expect(screen.getByRole("button", { name: "前往商城" })).not.toBeNull();

    fireEvent.click(within(portalNav).getByRole("button", { name: "概览" }));
    expect(screen.getByRole("heading", { name: "账户概览" })).not.toBeNull();
    expect(screen.getByRole("region", { name: "账户资源状态" })).toHaveAttribute(
      "data-state",
      "empty"
    );
    expect(screen.getByRole("button", { name: "前往商城" })).not.toBeNull();
    expect(screen.getByText("订单活动")).not.toBeNull();
    expect(screen.getByText("服务状态")).not.toBeNull();
    expect(screen.getAllByText("账户资源").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("共享月流量").length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText("剩余流量")).not.toBeNull();
    expect(screen.queryByText("订阅流量")).toBeNull();
    expect(screen.queryByText("流量仪表盘")).toBeNull();
    expect(screen.queryByText("安全清单")).toBeNull();
    expect(screen.queryByText("不限量")).toBeNull();
    expect(screen.getByText("资源开通后显示当前额度")).not.toBeNull();
  });

  test("routes Dashboard order activity to the unified Orders center", async () => {
    render(createElement(UserPortalPage, {
      portalClient: portalClientWithActiveSubscription()
    }));

    const portalNav = await enterPortal();
    fireEvent.click(within(portalNav).getByRole("button", { name: "概览" }));

    const orderActivity = screen.getByRole("heading", {
      name: "订单活动"
    }).closest("article");
    expect(orderActivity).not.toBeNull();
    const orderActivityButtons = within(orderActivity as HTMLElement).getAllByRole("button");
    expect(orderActivityButtons).toHaveLength(2);
    fireEvent.click(orderActivityButtons[1]);

    expect(screen.getByRole("region", { name: "订单记录" })).not.toBeNull();
    expect(screen.getAllByRole("heading", { name: "订单" }).length).toBeGreaterThan(0);

    fireEvent.click(within(portalNav).getByRole("button", { name: "概览" }));
    fireEvent.click(screen.getByRole("button", { name: "查看订单" }));

    expect(screen.getByRole("region", { name: "订单记录" })).not.toBeNull();
  });

  test("does not present historical usage as an active desktop plan", async () => {
    render(createElement(UserPortalPage, {
      portalClient: portalClientWithActiveSubscription({
        lifecycle: "expired",
        expiresAt: "2026-05-30T00:00:00.000Z",
        usage: {
          uploadBytes: 1024,
          downloadBytes: 2048,
          usedBytes: 3072,
          totalBytes: 50 * 1024 ** 3,
          usageRatio: 3072 / (50 * 1024 ** 3),
          status: "within_limit",
          collectionStatus: "measured",
          channelCount: 1,
          measuredChannelCount: 1,
          updatedAt: "2026-05-30T00:00:00.000Z"
        }
      })
    }));

    const portalNav = await enterPortal();
    fireEvent.click(within(portalNav).getByRole("button", { name: "概览" }));

    expect(screen.getByRole("region", { name: "账户资源状态" }))
      .toHaveAttribute("data-state", "empty");
    expect(screen.getByRole("heading", { name: "账户尚未开通服务" })).not.toBeNull();
    expect(screen.getByRole("button", { name: "前往商城" })).not.toBeNull();
    expect(screen.queryByText("不限量")).toBeNull();
    expect(screen.queryByText("共享流量使用率")).toBeNull();
    const remainingTrafficCard = screen.getByText("剩余流量").closest("article");
    expect(remainingTrafficCard).not.toBeNull();
    expect(within(remainingTrafficCard as HTMLElement).getByText("—")).not.toBeNull();
    expect(within(remainingTrafficCard as HTMLElement).getByText(
      "资源开通后显示当前额度"
    )).not.toBeNull();
    expect(within(remainingTrafficCard as HTMLElement).queryByText(
      "本月额度 50.0 GB"
    )).toBeNull();
  });

  test("preserves the legacy no-plan Start guide copy and route on mobile", async () => {
    const restoreViewport = installMobilePaymentDevice();
    try {
      const client = portalClient();
      render(createElement(UserPortalPage, { portalClient: client }));

      const portalNav = await enterPortal();

      fireEvent.click(within(portalNav).getByRole("button", { name: "概览" }));
      expect(screen.getByText("不限量")).not.toBeNull();
      expect(screen.queryByText("尚未开通")).toBeNull();
      fireEvent.click(within(portalNav).getByRole("button", { name: "开始使用" }));

      expect(screen.getByRole("heading", { name: "欢迎使用" })).not.toBeNull();
      expect(screen.queryByRole("heading", {
        name: "先选择适合你的套餐"
      })).toBeNull();
      expect(screen.getByRole("region", { name: "开始使用" })).not.toHaveAttribute(
        "data-access"
      );

      fireEvent.click(screen.getByRole("button", { name: "开始配置" }));

      expectMarketplaceWithoutLegacyCheckout(client);
    } finally {
      restoreViewport();
    }
  });

  test("preserves the legacy Dashboard order activity route on mobile", async () => {
    const restoreViewport = installMobilePaymentDevice();
    try {
      render(createElement(UserPortalPage, {
        portalClient: portalClientWithActiveSubscription()
      }));

      const portalNav = await enterPortal();
      fireEvent.click(within(portalNav).getByRole("button", { name: "概览" }));

      const orderActivity = screen.getByRole("heading", {
        name: "订单活动"
      }).closest("article");
      expect(orderActivity).not.toBeNull();
      expect(within(orderActivity as HTMLElement).queryByRole("button", {
        name: "查看订单"
      })).toBeNull();
      const orderActivityButtons = within(orderActivity as HTMLElement).getAllByRole("button");
      expect(orderActivityButtons).toHaveLength(2);
      fireEvent.click(orderActivityButtons[1]);

      expect(screen.getByRole("heading", { name: "流量消耗" })).not.toBeNull();

      fireEvent.click(within(portalNav).getByRole("button", { name: "概览" }));
      fireEvent.click(within(screen.getByRole("heading", {
        name: "订单活动"
      }).closest("article") as HTMLElement).getByRole("button", {
        name: "查看用量"
      }));

      expect(screen.getByRole("heading", { name: "流量消耗" })).not.toBeNull();
    } finally {
      restoreViewport();
    }
  });

  test("adds commerce entries to the existing Portal shell", async () => {
    render(createElement(UserPortalPage, { portalClient: portalClient() }));

    const portalNav = await enterPortal();

    expect(within(portalNav).getAllByRole("button").map((button) => button.getAttribute("aria-label"))).toEqual([
      "开始使用",
      "概览",
      "用量",
      "商城",
      "订单",
      "Coins 钱包",
      "推荐奖励",
      "个人中心",
      "设置",
      "支持"
    ]);
    expect(within(portalNav).getByRole("button", { name: "商城" })).not.toBeNull();
    expect(within(portalNav).getByRole("button", { name: "Coins 钱包" })).not.toBeNull();
    expect(within(portalNav).getByRole("button", { name: "推荐奖励" })).not.toBeNull();
    expect(within(portalNav).queryByRole("button", { name: "钱包" })).toBeNull();
    expect(within(portalNav).getByRole("button", { name: "设置" })).not.toBeNull();
    expect(screen.queryByRole("button", { name: "Coins 支付" })).toBeNull();
    expect([...portalNav.querySelectorAll(".portal-nav-group-label")].map((node) => node.textContent)).toEqual([
      "服务与用量",
      "资产与权益",
      "账户",
      "帮助"
    ]);
    expect(within(portalNav).getByRole("button", { name: "Coins 钱包" })
      .closest("[data-portal-nav-group]")).toHaveAttribute("data-portal-nav-group", "assets");
    expect(within(portalNav).getByRole("button", { name: "设置" })
      .closest("[data-portal-nav-group]")).toHaveAttribute("data-portal-nav-group", "account");

    const topbar = document.querySelector(".portal-use-topbar");
    expect(topbar).not.toBeNull();
    expect(within(topbar as HTMLElement).queryByRole("button", { name: /Coins 钱包/ })).toBeNull();
    expect(within(topbar as HTMLElement).queryByRole("group", { name: "显示偏好" })).toBeNull();

    fireEvent.click(within(portalNav).getByRole("button", { name: "商城" }));
    expect(await screen.findByRole("region", { name: "商城目录" })).not.toBeNull();
    expect(screen.getByRole("status")).toHaveTextContent(
      "当前客户端未提供服务端商城能力"
    );
    expect(screen.queryByText("商品")).toBeNull();
    expect(screen.queryByText("增值项")).toBeNull();
    expect(screen.queryByRole("button", { name: "购买暂未开放" })).toBeNull();
  });

  test("restores the payment handoff session and opens the durable returned recharge receipt", async () => {
    const session = portalWalletSession(
      "session_payment_return_001",
      "payment-return@example.test"
    );
    window.sessionStorage.setItem(
      "gccwebos-portal-payment-return-session-v1",
      JSON.stringify(session)
    );
    window.sessionStorage.setItem(
      "gccwebos-portal-recharge-return-v1",
      JSON.stringify({
        version: 1,
        orderRef: "payment_return_order_1",
        captureIdempotencyKey: "portal_capture_return_1"
      })
    );
    const wallet: PortalWalletClient = {
      getSummary: vi.fn(async () => portalWalletSummary(1000)),
      listLedger: vi.fn(async () => ({ entries: [], nextCursor: null }))
    };
    const recharge: PortalRechargeClient = {
      listOffers: vi.fn(async () => [RETURN_RECHARGE_OFFER]),
      listOrders: vi.fn(async () => [returnedRechargeOrder("pending")]),
      createOrder: vi.fn(async () => returnedRechargeOrder("entry_ready")),
      getOrder: vi.fn(async () => returnedRechargeOrder("pending")),
      captureOrder: vi.fn(async () => returnedRechargeOrder("pending"))
    };
    const client = portalClient({ wallet, recharge });

    render(createElement(UserPortalPage, { portalClient: client }));

    expect(await screen.findByRole("navigation", { name: "用户中心导航" }))
      .toBeInTheDocument();
    expect(await screen.findByRole("heading", { name: "钱包总览" }))
      .toBeInTheDocument();
    expect(await screen.findByRole("dialog", { name: "充值 Coins" }))
      .toBeInTheDocument();
    expect(screen.getByText("支付确认中")).toBeInTheDocument();
    expect(client.fetchCurrentState).toHaveBeenCalledWith({
      userRef: session.userRef,
      sessionRef: session.sessionRef
    });
    expect(recharge.captureOrder).not.toHaveBeenCalled();
    expect(window.sessionStorage.getItem(
      "gccwebos-portal-payment-return-session-v1"
    )).toBeNull();
  });

  test("Wallet loads summary for the authenticated shell and ledger only after opening", async () => {
    const summary = deferredValue<PortalWalletSummary>();
    const ledger = deferredValue<{
      entries: PortalWalletLedgerEntry[];
      nextCursor: null;
    }>();
    const wallet: PortalWalletClient = {
      getSummary: vi.fn(() => summary.promise),
      listLedger: vi.fn(() => ledger.promise)
    };
    const session = portalWalletSession(
      "session_wallet_shell_001",
      "wallet-user@example.test"
    );
    const client = portalClient({ wallet });
    render(createElement(UserPortalPage, {
      initialSession: session,
      portalClient: client
    }));

    const navigation = await screen.findByRole("navigation", {
      name: "用户中心导航"
    });
    await waitFor(() => {
      expect(wallet.getSummary).toHaveBeenCalledWith({
        sessionRef: session.sessionRef
      });
    });
    expect(wallet.listLedger).not.toHaveBeenCalled();
    expect(within(navigation).queryByRole("button", { name: "钱包" })).toBeNull();
    const walletButton = within(navigation).getByRole("button", { name: "Coins 钱包" });
    const topbar = document.querySelector(".portal-use-topbar");
    expect(topbar).not.toBeNull();
    expect(within(topbar as HTMLElement).queryByText("Coins · --")).toBeNull();
    expect(within(navigation).getByText("Coins · --")).toBeInTheDocument();

    await act(async () => {
      summary.resolve(portalWalletSummary(155));
      await summary.promise;
    });
    expect(await within(navigation).findByText("Coins · 155")).toBeInTheDocument();

    fireEvent.click(walletButton);
    await waitFor(() => {
      expect(wallet.listLedger).toHaveBeenCalledWith({
        sessionRef: session.sessionRef,
        limit: 25
      });
    });
    expect(await screen.findByText("正在加载钱包流水…")).toBeInTheDocument();

    await act(async () => {
      ledger.resolve({
        entries: [portalWalletEntry()],
        nextCursor: null
      });
      await ledger.promise;
    });
    expect(await screen.findByRole("table", {
      name: "近期 Coins 钱包流水"
    })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "查看全部" }));
    expect(await screen.findByRole("table", {
      name: "Coins 钱包流水"
    })).toBeInTheDocument();
  });

  test("Wallet uses only server-confirmed not-created as zero", async () => {
    const session = portalWalletSession(
      "session_wallet_zero_001",
      "wallet-zero@example.test"
    );
    const confirmedZero: PortalWalletClient = {
      getSummary: vi.fn(async () => portalWalletSummary(0, "not_created")),
      listLedger: vi.fn(async () => ({ entries: [], nextCursor: null }))
    };
    render(createElement(UserPortalPage, {
      initialSession: session,
      portalClient: portalClient({ wallet: confirmedZero })
    }));

    const zeroBalance = await screen.findByText("Coins · 0");
    expect(zeroBalance.closest("button")).toHaveAttribute("aria-label", "Coins 钱包");

    cleanup();
    const failed: PortalWalletClient = {
      getSummary: vi.fn(async () => {
        throw new PortalWalletClientError("wallet_unavailable", true);
      }),
      listLedger: vi.fn(async () => ({ entries: [], nextCursor: null }))
    };
    render(createElement(UserPortalPage, {
      initialSession: portalWalletSession(
        "session_wallet_failed_001",
        "wallet-failed@example.test"
      ),
      portalClient: portalClient({ wallet: failed })
    }));

    await waitFor(() => expect(failed.getSummary).toHaveBeenCalled());
    const failedBalance = screen.getByText("Coins · --");
    expect(failedBalance.closest("button")).toHaveAttribute("aria-label", "Coins 钱包");
    expect(screen.queryByText("Coins · 0")).not.toBeInTheDocument();

    cleanup();
    const rejected: PortalWalletClient = {
      getSummary: vi.fn(async () => {
        throw new PortalWalletClientError("wallet_request_failed", true);
      }),
      listLedger: vi.fn(async () => ({ entries: [], nextCursor: null }))
    };
    render(createElement(UserPortalPage, {
      initialSession: portalWalletSession(
        "session_wallet_rejected_001",
        "wallet-rejected@example.test"
      ),
      portalClient: portalClient({ wallet: rejected })
    }));

    await waitFor(() => expect(rejected.getSummary).toHaveBeenCalled());
    const rejectedBalance = screen.getByText("Coins · --");
    expect(rejectedBalance.closest("button")).toHaveAttribute("aria-label", "Coins 钱包");
  });

  test("Wallet hydrate generation ignores a late older session completion", async () => {
    const firstState = deferredValue<PortalUserState>();
    const secondState = deferredValue<PortalUserState>();
    const firstSession = portalWalletSession(
      "session_wallet_generation_old",
      "wallet-old@example.test"
    );
    const secondSession = portalWalletSession(
      "session_wallet_generation_new",
      "wallet-new@example.test"
    );
    const stateTemplateClient = portalClient();
    const oldState = await stateTemplateClient.fetchCurrentState({
      userRef: firstSession.userRef,
      sessionRef: firstSession.sessionRef
    });
    const newState = await stateTemplateClient.fetchCurrentState({
      userRef: secondSession.userRef,
      sessionRef: secondSession.sessionRef
    });
    const wallet: PortalWalletClient = {
      getSummary: vi.fn(async ({ sessionRef }) => (
        sessionRef === secondSession.sessionRef
          ? portalWalletSummary(222)
          : portalWalletSummary(111)
      )),
      listLedger: vi.fn(async () => ({ entries: [], nextCursor: null }))
    };
    const client = portalClient({
      wallet,
      fetchCurrentState: vi.fn(({ sessionRef }) => (
        sessionRef === firstSession.sessionRef
          ? firstState.promise
          : secondState.promise
      ))
    });
    const { rerender } = render(createElement(UserPortalPage, {
      initialSession: firstSession,
      portalClient: client
    }));
    await waitFor(() => {
      expect(client.fetchCurrentState).toHaveBeenCalledWith({
        userRef: firstSession.userRef,
        sessionRef: firstSession.sessionRef
      });
    });

    rerender(createElement(UserPortalPage, {
      initialSession: secondSession,
      portalClient: client
    }));
    await waitFor(() => {
      expect(client.fetchCurrentState).toHaveBeenCalledWith({
        userRef: secondSession.userRef,
        sessionRef: secondSession.sessionRef
      });
    });
    await act(async () => {
      secondState.resolve({ ...newState, userRef: secondSession.userRef });
      await secondState.promise;
    });
    expect(await screen.findByText("Coins · 222")).toBeInTheDocument();

    await act(async () => {
      firstState.resolve({ ...oldState, userRef: firstSession.userRef });
      await firstState.promise;
    });
    await waitFor(() => {
      expect(screen.getByText("Coins · 222")).toBeInTheDocument();
      expect(screen.queryByText("Coins · 111")).not.toBeInTheDocument();
    });
    expect(wallet.getSummary).not.toHaveBeenCalledWith({
      sessionRef: firstSession.sessionRef
    });
  });

  test("Wallet hydrate generation ignores a late older session rejection", async () => {
    const oldState = deferredValue<PortalUserState>();
    const currentState = deferredValue<PortalUserState>();
    const firstSession = portalWalletSession(
      "session_wallet_rejection_old",
      "wallet-rejection-old@example.test"
    );
    const secondSession = portalWalletSession(
      "session_wallet_rejection_new",
      "wallet-rejection-new@example.test"
    );
    const templateClient = portalClient();
    const secondPortalState = await templateClient.fetchCurrentState({
      userRef: secondSession.userRef,
      sessionRef: secondSession.sessionRef
    });
    const wallet: PortalWalletClient = {
      getSummary: vi.fn(async ({ sessionRef }) => (
        sessionRef === secondSession.sessionRef
          ? portalWalletSummary(444)
          : portalWalletSummary(111)
      )),
      listLedger: vi.fn(async () => ({ entries: [], nextCursor: null }))
    };
    const client = portalClient({
      wallet,
      fetchCurrentState: vi.fn(({ sessionRef }) => (
        sessionRef === firstSession.sessionRef
          ? oldState.promise
          : currentState.promise
      ))
    });
    const { rerender } = render(createElement(UserPortalPage, {
      initialSession: firstSession,
      portalClient: client
    }));
    await waitFor(() => {
      expect(client.fetchCurrentState).toHaveBeenCalledWith({
        userRef: firstSession.userRef,
        sessionRef: firstSession.sessionRef
      });
    });

    rerender(createElement(UserPortalPage, {
      initialSession: secondSession,
      portalClient: client
    }));
    await act(async () => {
      currentState.resolve({ ...secondPortalState, userRef: secondSession.userRef });
      await currentState.promise;
    });
    expect(await screen.findByText("Coins · 444")).toBeInTheDocument();

    await act(async () => {
      oldState.reject(new Error("synthetic stale hydrate rejection"));
      await Promise.allSettled([oldState.promise]);
    });
    expect(screen.getByRole("navigation", {
      name: "用户中心导航"
    })).toBeInTheDocument();
    expect(screen.getByText("Coins · 444")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "账号登录" })).toBeNull();
  });

  test("a stale login hydrate rejection cannot reset the committed session challenge", async () => {
    const staleState = deferredValue<PortalUserState>();
    const currentState = deferredValue<PortalUserState>();
    const staleSession = portalWalletSession(
      "session_wallet_login_rejection_old",
      "wallet-login-rejection-old@example.test"
    );
    const currentSession = portalWalletSession(
      "session_wallet_login_rejection_new",
      "wallet-login-rejection-new@example.test"
    );
    const templateClient = portalClient();
    const currentPortalState = await templateClient.fetchCurrentState({
      userRef: currentSession.userRef,
      sessionRef: currentSession.sessionRef
    });
    const issueHumanChallenge = vi.fn(async () => ({
      challengeId: "challenge_current",
      prompt: "1 + 1 = ?",
      expiresInSeconds: 120
    }));
    const wallet: PortalWalletClient = {
      getSummary: vi.fn(async ({ sessionRef }) => (
        sessionRef === currentSession.sessionRef
          ? portalWalletSummary(555)
          : portalWalletSummary(111)
      )),
      listLedger: vi.fn(async () => ({ entries: [], nextCursor: null }))
    };
    const client = portalClient({
      authenticate: vi.fn(async () => staleSession),
      fetchCurrentState: vi.fn(({ sessionRef }) => (
        sessionRef === staleSession.sessionRef
          ? staleState.promise
          : currentState.promise
      )),
      issueHumanChallenge,
      wallet
    });
    const { rerender } = render(createElement(UserPortalPage, { portalClient: client }));

    await submitPortalLogin();
    await waitFor(() => {
      expect(client.fetchCurrentState).toHaveBeenCalledWith({
        userRef: staleSession.userRef,
        sessionRef: staleSession.sessionRef
      });
      expect(issueHumanChallenge).toHaveBeenCalledTimes(1);
    });

    rerender(createElement(UserPortalPage, {
      initialSession: currentSession,
      portalClient: client
    }));
    await act(async () => {
      currentState.resolve({ ...currentPortalState, userRef: currentSession.userRef });
      await currentState.promise;
    });
    expect(await screen.findByText("Coins · 555")).toBeInTheDocument();

    await act(async () => {
      staleState.reject(new Error("synthetic stale login hydrate rejection"));
      await Promise.allSettled([staleState.promise]);
    });
    expect(screen.getByRole("navigation", {
      name: "用户中心导航"
    })).toBeInTheDocument();
    expect(screen.getByText("Coins · 555")).toBeInTheDocument();
    expect(issueHumanChallenge).toHaveBeenCalledTimes(1);
  });

  test("Wallet stale session-invalid cannot log out a newer login", async () => {
    const oldSummary = deferredValue<PortalWalletSummary>();
    const oldSession = portalWalletSession(
      "session_wallet_logout_old",
      "wallet-old@example.test"
    );
    const newSession = portalWalletSession(
      "session_wallet_logout_new",
      "wallet-new@example.test"
    );
    const authenticate = vi.fn()
      .mockResolvedValueOnce(oldSession)
      .mockResolvedValueOnce(newSession);
    const wallet: PortalWalletClient = {
      getSummary: vi.fn(({ sessionRef }) => (
        sessionRef === oldSession.sessionRef
          ? oldSummary.promise
          : Promise.resolve(portalWalletSummary(333))
      )),
      listLedger: vi.fn(async () => ({ entries: [], nextCursor: null }))
    };
    const client = portalClient({ authenticate, wallet });
    render(createElement(UserPortalPage, { portalClient: client }));

    await enterPortal();
    await waitFor(() => {
      expect(wallet.getSummary).toHaveBeenCalledWith({
        sessionRef: oldSession.sessionRef
      });
    });
    fireEvent.click(screen.getByRole("button", { name: "退出登录" }));
    expect(await screen.findByRole("heading", { name: "账号登录" })).toBeInTheDocument();

    await enterPortal();
    expect(await screen.findByText("Coins · 333")).toBeInTheDocument();
    await act(async () => {
      oldSummary.reject(
        new PortalWalletClientError("wallet_session_invalid", false)
      );
      await Promise.allSettled([oldSummary.promise]);
    });

    expect(screen.getByRole("navigation", {
      name: "用户中心导航"
    })).toBeInTheDocument();
    expect(screen.getByText("Coins · 333")).toBeInTheDocument();
  });

  test("places Orders in navigation and expands legacy payment detail in place", async () => {
    const client = portalClientWithPaymentOrders([paymentOrder()]);
    render(createElement(UserPortalPage, { portalClient: client }));

    const navigation = await enterPortal();

    expect(
      within(navigation)
        .getAllByRole("button")
        .map((button) => button.getAttribute("aria-label"))
    ).toEqual([
      "开始使用",
      "概览",
      "用量",
      "商城",
      "订单",
      "Coins 钱包",
      "推荐奖励",
      "个人中心",
      "设置",
      "支持"
    ]);

    openPortalOrders();
    const viewPayment = screen.getByRole("button", { name: /^查看：/ });
    fireEvent.click(viewPayment);
    expect(screen.getByRole("region", {
      name: "套餐付款详情：P-existing_monthly"
    })).toBeInTheDocument();
    expect(viewPayment).toHaveAttribute("aria-expanded", "true");
    fireEvent.click(viewPayment);
    expect(screen.queryByRole("region", {
      name: "套餐付款详情：P-existing_monthly"
    })).toBeNull();
    expect(screen.getByRole("table", { name: "订单列表" })).not.toBeNull();
  });

  test("keeps the Header focused on Orders search and moves Wallet and preferences into navigation", async () => {
    render(createElement(UserPortalPage, { portalClient: portalClient() }));

    const navigation = await enterPortal();
    expect(navigation.querySelector(".portal-use-nav-item.active"))
      .toHaveAttribute("aria-current", "page");
    expect(navigation.querySelectorAll('[aria-current="page"]')).toHaveLength(1);

    fireEvent.click(within(navigation).getByRole("button", { name: "商城" }));
    expect(within(navigation).getByRole("button", { name: "商城" }))
      .toHaveAttribute("aria-current", "page");
    expect(navigation.querySelectorAll('[aria-current="page"]')).toHaveLength(1);

    const topbar = document.querySelector(".portal-use-topbar");
    expect(topbar).not.toBeNull();
    const globalSearch = within(topbar as HTMLElement).getByRole("searchbox", {
      name: "订单搜索"
    });
    expect(globalSearch).toHaveAttribute("placeholder", "搜索订单、套餐或状态");
    expect((topbar as HTMLElement).querySelector(".portal-v2-page-title > span"))
      .toBeNull();
    expect((topbar as HTMLElement).querySelector(".portal-v2-page-title > p"))
      .toBeNull();
    fireEvent.change(globalSearch, { target: { value: "待付款" } });
    fireEvent.submit(globalSearch.closest("form") as HTMLFormElement);
    expect(within(topbar as HTMLElement).getByRole("heading", {
      level: 1,
      name: "订单"
    })).toBeInTheDocument();
    expect(within(topbar as HTMLElement).queryByRole("button", {
      name: /Coins 钱包/
    })).toBeNull();
    expect(within(topbar as HTMLElement).queryByRole("group", {
      name: "显示偏好"
    })).toBeNull();
    expect((topbar as HTMLElement).querySelector(".portal-status-indicator"))
      .toBeNull();
    const walletEntry = within(navigation).getByRole("button", {
      name: "Coins 钱包"
    });
    fireEvent.click(walletEntry);
    expect(walletEntry).toHaveAttribute("aria-current", "page");
    expect(navigation.querySelectorAll('[aria-current="page"]')).toHaveLength(1);

    fireEvent.click(within(navigation).getByRole("button", { name: "设置" }));
    const preferences = screen.getByRole("group", { name: "显示偏好" });
    expect(within(preferences).getByRole("heading", { name: "外观" })).toBeInTheDocument();
    expect(preferences).toHaveAttribute("data-config-group", "appearance");
    fireEvent.click(within(preferences).getByRole("button", { name: "EN" }));
    expect(within(screen.getByRole("navigation", {
      name: "User center navigation"
    })).getByRole("button", { name: "Coins wallet" })).toBeInTheDocument();
  });

  test("keeps the Wallet overview focused on balances, recent activity, and rules without recharge controls", async () => {
    render(createElement(UserPortalPage, { portalClient: portalClient() }));

    const navigation = await enterPortal();
    const topbar = document.querySelector(".portal-use-topbar");
    expect(topbar).not.toBeNull();
    fireEvent.click(within(navigation).getByRole("button", { name: "Coins 钱包" }));

    expect(await screen.findAllByRole("heading", { level: 2, name: "钱包总览" })).toHaveLength(1);
    const walletSection = document.querySelector(".portal-commerce-layout--wallet");
    expect(walletSection).not.toBeNull();
    expect(within(walletSection as HTMLElement).getByRole("heading", {
      name: "余额"
    })).not.toBeNull();
    expect(within(walletSection as HTMLElement).getByRole("heading", {
      name: "近期账变明细"
    })).not.toBeNull();
    expect(within(walletSection as HTMLElement).getByRole("complementary", {
      name: "钱包规则指南"
    })).not.toBeNull();
    expect(within(walletSection as HTMLElement).queryByRole("button", {
      name: "充值 Coins"
    })).toBeNull();
    expect(within(walletSection as HTMLElement).queryByRole("heading", {
      name: "充值"
    })).toBeNull();
    expect(within(walletSection as HTMLElement).queryByRole("list", {
      name: "Coins 充值档位"
    })).toBeNull();

    openPortalSettings();
    fireEvent.click(screen.getByRole("button", { name: "EN" }));

    const englishNavigation = screen.getByRole("navigation", { name: "User center navigation" });
    expect(within(englishNavigation).queryByRole("button", { name: "Wallet" })).toBeNull();
    fireEvent.click(within(englishNavigation).getByRole("button", { name: "Coins wallet" }));
    expect(await screen.findAllByRole("heading", { level: 2, name: "Wallet overview" })).toHaveLength(1);
    const englishWalletSection = document.querySelector(".portal-commerce-layout--wallet");
    expect(englishWalletSection).not.toBeNull();
    expect(within(englishWalletSection as HTMLElement).getByRole("heading", {
      name: "Recent Wallet activity"
    })).not.toBeNull();
    expect(within(englishWalletSection as HTMLElement).getByRole("complementary", {
      name: "Wallet guide"
    })).not.toBeNull();
    expect(within(englishWalletSection as HTMLElement).queryByRole("button", {
      name: "Recharge Coins"
    })).toBeNull();
    expect(within(englishWalletSection as HTMLElement).queryByRole("heading", {
      name: "Recharge"
    })).toBeNull();
    expect(within(englishWalletSection as HTMLElement).queryByRole("list", {
      name: "Coins recharge denominations"
    })).toBeNull();
  });

  test("does not expose Recharge Coins from the signed-in topbar", async () => {
    render(createElement(UserPortalPage, { portalClient: portalClient() }));

    await enterPortal();
    const topbar = document.querySelector(".portal-use-topbar");
    expect(topbar).not.toBeNull();
    expect(within(topbar as HTMLElement).queryByRole("button", {
      name: "充值 Coins"
    })).toBeNull();
    expect(screen.queryByRole("dialog", { name: "充值 Coins" })).toBeNull();
  });

  test("keeps referral rewards as one-link placeholders without cash-out actions", async () => {
    render(createElement(UserPortalPage, { portalClient: portalClient() }));

    const portalNav = await enterPortal();
    fireEvent.click(within(portalNav).getByRole("button", { name: "推荐奖励" }));

    expect(await screen.findByRole("heading", { name: "推广绩效" })).not.toBeNull();
    expect(screen.getAllByText("我的推荐链接")).toHaveLength(1);
    expect(screen.getByText("有效注册")).not.toBeNull();
    expect(screen.getByText("归因消费")).not.toBeNull();
    expect(screen.getByText("待确认奖励")).not.toBeNull();
    expect(screen.getByText("可用奖励")).not.toBeNull();
    expect(screen.getAllByText("--")).toHaveLength(4);
    expect((screen.getByRole("button", { name: "生成推荐链接（暂未开放）" }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.queryByRole("button", { name: /提现/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /转账/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /Admin/ })).toBeNull();
  });

  test("uses user-facing wording instead of internal entitlement language", async () => {
    render(createElement(UserPortalPage, { portalClient: portalClientWithActiveSubscription() }));

    const portalNav = await enterPortal();

    fireEvent.click(within(portalNav).getByRole("button", { name: "订单" }));
    expect(screen.queryByText("统一查看订单记录")).toBeNull();
    expect(screen.getByRole("region", { name: "订单记录" })).not.toBeNull();
    expect(screen.queryByRole("dialog", { name: "选择套餐" })).toBeNull();
    expect(screen.queryByRole("dialog", { name: "选择支付方式" })).toBeNull();
    expect(screen.queryByRole("heading", { name: "订单管理" })).toBeNull();
    expect(screen.queryByText(/订阅链接和用量记录/)).toBeNull();

    fireEvent.click(within(portalNav).getByRole("button", { name: "用量" }));
    expect(await screen.findByRole("heading", { name: "流量消耗" })).not.toBeNull();
    expect(screen.getAllByText("账户共享流量").length).toBeGreaterThan(0);
    expect(screen.queryByText("按订单合计")).toBeNull();
    fireEvent.click(within(portalNav).getByRole("button", { name: "开始使用" }));
    expect(await screen.findByRole("heading", { name: "欢迎使用" })).not.toBeNull();
    expect(document.querySelector('[data-portal-view="start"]')?.classList.contains("active")).toBe(true);

    expect(within(portalNav).queryByRole("button", { name: "订阅" })).toBeNull();
    expect(within(portalNav).getByRole("button", { name: "订单" })).not.toBeNull();

    fireEvent.click(within(portalNav).getByRole("button", { name: "开始使用" }));
    await waitFor(() => expect(screen.getByRole("heading", { name: "欢迎使用" })).not.toBeNull());
    expect(document.querySelector(".portal-use-topbar")).not.toBeNull();
    expect(document.querySelector(".portal-v2-shell-start")).toBeNull();
    expect(document.querySelector(".portal-v2-sidebar")).not.toBeNull();
    expect(screen.getByText("只需几分钟，我们将一步步指引您完成配置。")).not.toBeNull();
    expect(screen.getByRole("button", { name: "开始配置" })).not.toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "开始配置" }));
    await waitFor(() => expect(screen.getByRole("heading", { name: "你要在哪台设备上使用？" })).not.toBeNull());
    expect(document.querySelector(".portal-start-platform-options")).not.toBeNull();
    expect(screen.getByRole("button", { name: "Apple iOS iPhone / iPad" })).not.toBeNull();
    expect(screen.getByRole("button", { name: "Windows PC / Laptop" })).not.toBeNull();
    expect(screen.getByText("选你手上的设备，下一步只显示适合它的客户端。")).not.toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Apple iOS iPhone / iPad" }));
    await waitFor(() => expect(screen.getByRole("heading", { name: "选择一个客户端" })).not.toBeNull());
    fireEvent.click(screen.getByRole("button", { name: "Hiddify 备用客户端" }));
    await waitFor(() => expect(screen.getAllByText("安装 Hiddify").length).toBeGreaterThan(0));
    expect(screen.getByText("如果首选客户端装不了，再选 Hiddify。请下载与你设备匹配的版本，装好后回到本页。")).not.toBeNull();

    expect(screen.queryByText("从订单复制链接")).toBeNull();
    expect(screen.queryByText("请先购买套餐并提交订单。")).toBeNull();
    expect(screen.queryByText(/账户权益|节点|支付渠道|订阅内容/)).toBeNull();
  });

  test("keeps existing order history reachable without opening legacy purchase dialogs", async () => {
    const client = portalClientWithPaymentOrders([paymentOrder()]);
    render(createElement(UserPortalPage, { portalClient: client }));

    await enterPortal();
    openPortalOrders();

    expect(await screen.findByRole("table", { name: "订单列表" })).not.toBeNull();
    expect(screen.getByText("P-existing_monthly")).not.toBeNull();
    expect(screen.queryByRole("dialog", { name: "选择套餐" })).toBeNull();
    expect(screen.queryByRole("dialog", { name: "选择支付方式" })).toBeNull();
    expect(client.createPaymentCheckout).not.toHaveBeenCalled();
    expect(client.applyForSubscription).not.toHaveBeenCalled();
  });

  test("keeps Orders to one heading, one type filter, and one list", async () => {
    const commerceClient = {
      listOrders: vi.fn(async () => ({ orders: [marketplaceOrder()], nextCursor: null }))
    } as unknown as PortalCoinCommerceClient;
    const client = portalClientWithPaymentOrders([
      paymentOrder({ planLabel: "遗留套餐测试" })
    ], {
      subscriptionRequest: activeSubscriptionRequest({
        historySummary: [{
          recordRef: "service_record_001",
          label: "订阅服务测试",
          status: "已开通",
          occurredAt: "2026-07-28T11:00:00.000Z"
        }]
      }),
      historySummary: [{
        recordRef: "service_record_001",
        label: "订阅服务测试",
        status: "已开通",
        occurredAt: "2026-07-28T11:00:00.000Z"
      }]
    }, {
      authenticate: vi.fn(authenticatedSessionWithRef),
      commerce: commerceClient
    });
    render(createElement(UserPortalPage, { portalClient: client }));

    await enterPortal();
    openPortalOrders();

    expect(screen.getByRole("group", { name: "订单类型" })).toBeInTheDocument();
    expect(screen.getAllByRole("table", { name: "订单列表" })).toHaveLength(1);
    const ordersRegion = screen.getByRole("region", { name: "订单记录" });
    expect(within(ordersRegion).queryByRole("heading")).toBeNull();
    expect(document.querySelector(".portal-v2-page-title h1")).not.toBeNull();
    expect(document.querySelector(".portal-v2-mobile-title h1")).not.toHaveAttribute("aria-hidden");
    expect(screen.queryByText("订单记录")).toBeNull();
    expect(screen.queryByText("历史订单")).toBeNull();
    expect(screen.queryByText("充值订单数据源尚未接入")).toBeNull();
  });

  test("keeps marketplace, legacy payment, and service rows in the shared Orders list", async () => {
    const commerceClient = {
      listOrders: vi.fn(async () => ({ orders: [marketplaceOrder()], nextCursor: null }))
    } as unknown as PortalCoinCommerceClient;
    const client = portalClientWithPaymentOrders([
      paymentOrder({ planLabel: "遗留套餐测试" })
    ], {
      subscriptionRequest: activeSubscriptionRequest({
        historySummary: [{
          recordRef: "service_record_001",
          label: "订阅服务测试",
          status: "已开通",
          occurredAt: "2026-07-28T11:00:00.000Z"
        }]
      }),
      historySummary: [{
        recordRef: "service_record_001",
        label: "订阅服务测试",
        status: "已开通",
        occurredAt: "2026-07-28T11:00:00.000Z"
      }]
    }, {
      authenticate: vi.fn(authenticatedSessionWithRef),
      commerce: commerceClient
    });
    render(createElement(UserPortalPage, { portalClient: client }));

    await enterPortal();
    openPortalOrders();

    const orderTable = await screen.findByRole("table", { name: "订单列表" });
    expect(await within(orderTable).findByText("商城消费")).toBeInTheDocument();
    expect(within(orderTable).getByText("商城测试商品")).toBeInTheDocument();
    expect(within(orderTable).getByText("套餐付款")).toBeInTheDocument();
    expect(within(orderTable).getByText("遗留套餐测试")).toBeInTheDocument();
    expect(within(orderTable).getByText("服务记录")).toBeInTheDocument();
    expect(within(orderTable).getAllByText("订阅服务测试").length)
      .toBeGreaterThan(0);

    const serviceView = within(orderTable).getByRole("button", {
      name: /^查看：.*订阅服务测试/
    });
    if (serviceView.getAttribute("aria-expanded") !== "true") {
      fireEvent.click(serviceView);
    }
    expect(within(orderTable).getByText("客户端")).toBeInTheDocument();
  });

  test("keeps legacy payment history read-only and Personal Center free of order records", async () => {
    const client = portalClientWithPaymentOrders([paymentOrder()]);
    render(createElement(UserPortalPage, { portalClient: client }));

    await enterPortal();
    openPortalOrders();
    fireEvent.click(screen.getByRole("button", { name: /^查看：/ }));
    expect(screen.getByRole("region", {
      name: "套餐付款详情：P-existing_monthly"
    })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^去付款：/ })).toBeNull();
    expect(screen.queryByRole("button", { name: "返回订单" })).toBeNull();

    openPortalProfile();
    expect(screen.queryByRole("table", { name: "订单列表" })).toBeNull();
    expect(screen.queryByRole("button", { name: "返回订单" })).toBeNull();
  });

  test("routes every new-acquisition entry to Marketplace", async () => {
    const client = portalClient();
    render(createElement(UserPortalPage, { portalClient: client }));
    const portalNav = await enterPortal();

    expect(screen.queryByRole("button", { name: "购买套餐" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Buy plan" })).toBeNull();

    fireEvent.click(within(portalNav).getByRole("button", { name: "用量" }));
    fireEvent.click(screen.getByRole("button", { name: "前往商城" }));
    expectMarketplaceWithoutLegacyCheckout(client);
  });

  test("routes users without delivered traffic entitlement to Marketplace", async () => {
    const client = portalClient();
    render(createElement(UserPortalPage, { portalClient: client }));

    await enterPortal();
    openPortalStartGuide();
    expect(screen.getByRole("heading", {
      name: "先选择适合你的套餐"
    })).not.toBeNull();
    expect(screen.queryByRole("button", { name: "开始配置" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "前往商城" }));

    expectMarketplaceWithoutLegacyCheckout(client);
    expect(screen.queryByRole("heading", {
      name: "你要在哪台设备上使用？"
    })).toBeNull();
  });

  test("routes order creation controls to Marketplace", async () => {
    const client = portalClient();
    render(createElement(UserPortalPage, { portalClient: client }));

    await enterPortal();
    openPortalOrders();

    const orders = screen.getByRole("region", { name: "订单记录" });
    const acquisitionButtons = within(orders).getAllByRole("button", {
      name: "前往商城"
    });
    expect(acquisitionButtons).toHaveLength(1);
    fireEvent.click(acquisitionButtons[0]);

    expectMarketplaceWithoutLegacyCheckout(client);
  });

  test("keeps failed legacy payment read-only and routes replacement to Marketplace", async () => {
    const client = portalClientWithPaymentOrders([
      paymentOrder({ status: "payment_failed" })
    ]);
    render(createElement(UserPortalPage, { portalClient: client }));

    await enterPortal();
    openPortalOrders();
    fireEvent.click(screen.getByRole("button", { name: /^查看：/ }));
    expect(screen.getByRole("region", {
      name: "套餐付款详情：P-existing_monthly"
    })).toBeInTheDocument();
    expect(screen.getAllByText("支付失败").length).toBeGreaterThan(0);
    expect(screen.queryByRole("button", { name: /^去付款：/ })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "前往商城" }));

    expectMarketplaceWithoutLegacyCheckout(client);
  });

  test("does not render payment UI from a legacy hosted checkout URL", async () => {
    const client = portalClientWithPaymentOrders([
      paymentOrder({
        orderRef: "pay_wx_hosted_only",
        channel: "wxpay",
        checkoutUrl: "https://pay.example.test/wxpay/hosted-only"
      })
    ]);
    render(createElement(UserPortalPage, { portalClient: client, paymentRedirect: vi.fn() }));

    await enterPortal();
    openPortalOrders();
    fireEvent.click(screen.getByRole("button", { name: /^查看：/ }));

    expect(screen.getByRole("region", {
      name: "套餐付款详情：P-wx_hosted_only"
    })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "扫码支付" })).toBeNull();
    expect(screen.queryByAltText("微信支付二维码")).toBeNull();
    expect(client.createPaymentCheckout).not.toHaveBeenCalled();
    expect(client.applyForSubscription).not.toHaveBeenCalled();
  });

  test("does not redirect a mobile legacy payment record to the provider", async () => {
    const restoreDevice = installMobilePaymentDevice();
    const client = portalClientWithPaymentOrders([
      paymentOrder({
        orderRef: "pay_mobile_scheme",
        channel: "wxpay",
        checkoutUrl: "https://pay.example.test/monthly_basic",
        urlScheme: "weixin://pay/monthly_basic"
      })
    ]);
    const paymentRedirect = vi.fn();
    try {
      render(createElement(UserPortalPage, { portalClient: client, paymentRedirect }));

      await enterPortal();
      openPortalOrders();
      fireEvent.click(screen.getByRole("button", { name: /^查看：/ }));

      expect(screen.getByRole("region", {
        name: "套餐付款详情：P-mobile_scheme"
      })).toBeInTheDocument();
      expect(paymentRedirect).not.toHaveBeenCalled();
      expect(client.createPaymentCheckout).not.toHaveBeenCalled();
      expect(client.applyForSubscription).not.toHaveBeenCalled();
    } finally {
      restoreDevice();
    }
  });

  test("shows read-only payment status when a legacy checkout URL is unavailable", async () => {
    const client = portalClientWithPaymentOrders([
      paymentOrder({
        orderRef: "pay_without_url",
        checkoutUrl: undefined
      })
    ]);
    const paymentRedirect = vi.fn();
    render(createElement(UserPortalPage, { portalClient: client, paymentRedirect }));

    await enterPortal();
    openPortalOrders();
    fireEvent.click(screen.getByRole("button", { name: /^查看：/ }));

    expect(paymentRedirect).not.toHaveBeenCalled();
    expect(screen.getByRole("region", {
      name: "套餐付款详情：P-without_url"
    })).toBeInTheDocument();
    expect(screen.getAllByText("待付款").length).toBeGreaterThan(0);
    expect(screen.queryByRole("heading", { name: "扫码支付" })).toBeNull();
    expect(client.createPaymentCheckout).not.toHaveBeenCalled();
    expect(client.applyForSubscription).not.toHaveBeenCalled();
  });

  test("keeps package payment records read-only in the order table", async () => {
    const client = portalClientWithPaymentOrders([
      paymentOrder({
        orderRef: "pay_monthly_plus",
        planId: "monthly_plus",
        amountMinor: 3000
      })
    ]);
    const paymentRedirect = vi.fn();
    render(createElement(UserPortalPage, { portalClient: client, paymentRedirect }));

    await enterPortal();
    openPortalOrders();
    fireEvent.click(screen.getByRole("button", { name: /^查看：/ }));

    expect(paymentRedirect).not.toHaveBeenCalled();
    expect(screen.getByRole("region", {
      name: "套餐付款详情：P-monthly_plus"
    })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "扫码支付" })).toBeNull();
    expect(screen.queryByRole("link", { name: "打开支付页面" })).toBeNull();

    const orderTable = screen.getByRole("table", { name: "订单列表" });
    expect(within(orderTable).getByText("P-monthly_plus")).not.toBeNull();
    expect(within(orderTable).getByRole("button", { name: /^查看：/ }))
      .toHaveAttribute("aria-expanded", "true");
    expect(within(orderTable).queryByRole("button", { name: /^去付款：/ }))
      .toBeNull();
    expect(client.createPaymentCheckout).not.toHaveBeenCalled();
    expect(client.applyForSubscription).not.toHaveBeenCalled();
  });

  test("keeps pending payment records separate from subscription setup", async () => {
    const client = portalClientWithPaymentOrders([paymentOrder()]);
    const paymentRedirect = vi.fn();
    render(createElement(UserPortalPage, { portalClient: client, paymentRedirect }));

    await enterPortal();
    openPortalOrders();
    fireEvent.click(screen.getByRole("button", { name: /^查看：/ }));

    expect(paymentRedirect).not.toHaveBeenCalled();
    expect(screen.getByRole("region", {
      name: "套餐付款详情：P-existing_monthly"
    })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "扫码支付" })).toBeNull();
    expect(screen.queryByRole("link", { name: "打开支付页面" })).toBeNull();

    const orderTable = screen.getByRole("table", { name: "订单列表" });
    expect(within(orderTable).getByText("P-existing_monthly")).not.toBeNull();
    expect(within(orderTable).getByRole("button", { name: /^查看：/ }))
      .toHaveAttribute("aria-expanded", "true");
    expect(within(orderTable).queryByRole("button", { name: /^去付款：/ }))
      .toBeNull();

    expect(screen.queryByRole("region", { name: "订阅状态" })).toBeNull();
    expect(screen.queryByRole("heading", { name: "当前订阅" })).toBeNull();
    expect(screen.queryByText("授权完成后显示订阅链接")).toBeNull();
    expect(screen.queryByRole("button", { name: "复制" })).toBeNull();
    expect(screen.queryByRole("button", { name: "刷新当前订阅" })).toBeNull();
    expect(client.createPaymentCheckout).not.toHaveBeenCalled();
    expect(client.applyForSubscription).not.toHaveBeenCalled();
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
    expect(request.expiresAt).toBe("开通中");

    const repeat = await client.applyForSubscription({
      userRef: "user_safe_ref",
      planId: "trial",
      clientTarget: "clash",
      requestOnly: true
    });
    expect(repeat.lifecycle).toBe("pending");
    expect(repeat.requestRef).not.toBe(request.requestRef);
  });

  test("uses the start guide for an active subscription link without exposing lifecycle controls", async () => {
    const client = portalClient({
      fetchCurrentState: vi.fn(async (input: { userRef: string }): Promise<PortalUserState> => ({
        userRef: input.userRef,
        subscriptionRequest: {
          status: "subscription_ready",
          lifecycle: "active",
          requestRef: "subreq_existing_monthly",
          userRef: input.userRef,
          planId: "monthly_basic",
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
    openPortalSubscriptions();

    expect(await screen.findByRole("button", { name: "复制链接" })).not.toBeNull();
    expect(screen.queryByRole("button", { name: /刷新订阅/ })).toBeNull();
    expect(screen.queryByRole("button", { name: "停用订阅" })).toBeNull();
    expect(screen.getByDisplayValue("https://sub.example.test/import/existing-visible-once")).not.toBeNull();
    expect(client.applyForSubscription).not.toHaveBeenCalled();
    expect(client.refreshSubscription).not.toHaveBeenCalled();
  });

  test("does not expose disable controls in the user start guide", async () => {
    const client = portalClient({
      fetchCurrentState: vi.fn(async (input: { userRef: string }): Promise<PortalUserState> => ({
        userRef: input.userRef,
        subscriptionRequest: {
          status: "subscription_ready",
          lifecycle: "active",
          requestRef: "subreq_paid_active",
          userRef: input.userRef,
          planId: "monthly_basic",
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
    openPortalSubscriptions();

    expect(await screen.findByRole("button", { name: "复制链接" })).not.toBeNull();
    expect(screen.queryByRole("button", { name: "停用订阅" })).toBeNull();
    expect(client.disableSubscription).not.toHaveBeenCalled();
    expect(screen.getByDisplayValue("https://sub.example.test/import/existing-visible-once")).not.toBeNull();
  });

  test("does not render old-link invalidation unless the current session creates it", async () => {
    const client = portalClient({
      fetchCurrentState: vi.fn(async (input: { userRef: string }): Promise<PortalUserState> => ({
        userRef: input.userRef,
        subscriptionRequest: {
          status: "subscription_ready",
          lifecycle: "active",
          requestRef: "subreq_existing_monthly",
          userRef: input.userRef,
          planId: "monthly_basic",
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
        planId: "monthly_basic",
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
    openPortalSubscriptions();

    expect(await screen.findByRole("button", { name: "复制链接" })).not.toBeNull();
    expect(client.refreshSubscription).not.toHaveBeenCalled();
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
          planId: "monthly_basic",
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

    openPortalSubscriptions();
    expect(await screen.findByRole("button", { name: "复制链接" })).not.toBeNull();
    expect(screen.queryByRole("button", { name: /刷新订阅/ })).toBeNull();
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
    openPortalSubscriptions();
    expect(await screen.findByRole("button", { name: "复制链接" })).not.toBeNull();
    expect(screen.queryByRole("button", { name: /刷新订阅/ })).toBeNull();
    expect(screen.getByDisplayValue("https://sub.example.test/import/existing-visible-once")).not.toBeNull();
    openPortalOrders();
    const orderTable = screen.getByRole("table", { name: "订单列表" });
    expect(within(orderTable).getByText("O-existing_yearly")).not.toBeNull();
    expect(screen.queryByRole("button", { name: /刷新订阅/ })).toBeNull();
    expect(screen.queryByRole("button", { name: "停用订阅" })).toBeNull();
    expect(client.applyForSubscription).not.toHaveBeenCalled();
  });

  test("hydrates backend orders into usage and setup surfaces after authentication", async () => {
    const trialOrder: PortalSubscriptionRequest = {
      status: "ready_for_operator_review",
      lifecycle: "pending",
      requestRef: "pareq_trial_1",
      userRef: "user_safe_ref",
      planId: "trial",
      clientTarget: "clash",
      expiresAt: "开通中",
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
      planId: "monthly_plus",
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
        collectionStatus: "measured",
        channelCount: 3,
        measuredChannelCount: 2,
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

    openPortalOrders();
    const orderTable = screen.getByRole("table", { name: "订单列表" });
    expect(within(orderTable).getByText("pareq_trial_1")).not.toBeNull();
    expect(within(orderTable).getByText("pareq_monthly_2")).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "用量" }));
    expect(await screen.findByRole("heading", { name: "流量消耗" })).not.toBeNull();
    expect(screen.getAllByText(/7 天/).length).toBeGreaterThan(0);
    expect(screen.getByText("标准月付")).not.toBeNull();
    expect(screen.getByText("1.5 GB / 10 GB")).not.toBeNull();
    expect(screen.queryByText(/channel-vultr|edgecred/i)).toBeNull();
    expect(screen.queryByRole("button", { name: /刷新订阅/ })).toBeNull();
    openPortalSubscriptions();
    expect(screen.getByRole("button", { name: "复制链接" })).not.toBeNull();
    expect(client.applyForSubscription).not.toHaveBeenCalled();
  });

  test("keeps current service state free of fabricated completion history", async () => {
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
    fireEvent.click(screen.getByRole("button", { name: "订单" }));

    expect(screen.queryByText("暂无完成套餐记录")).toBeNull();
    const orderTable = screen.getByRole("table", { name: "订单列表" });
    expect(within(orderTable).getByText("O-existing_yearly")).not.toBeNull();
    expect(screen.queryByText(/申请年度套餐（已开通）/)).toBeNull();
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
          planId: "monthly_basic",
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
    openPortalSubscriptions();

    expect(await screen.findByDisplayValue("https://sub.example.test/import/visible-once")).not.toBeNull();
    expect(writeText).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "复制链接" }));

    await waitFor(() => expect(writeText).toHaveBeenCalledWith("https://sub.example.test/import/visible-once"));
  });

  test("reveals an active paid traffic plan link before copying when the list hides the URL", async () => {
    const revealSubscription = vi.fn(async (input: PortalRevealSubscriptionInput): Promise<PortalSubscriptionRequest> => ({
      status: "subscription_ready",
      lifecycle: "active",
      requestRef: input.requestRef,
      userRef: input.userRef,
      planId: "monthly_basic",
      clientTarget: "clash",
      expiresAt: "2026-06-30T00:00:00.000Z",
      durationDays: 30,
      quantity: 1,
      subscriptionUrl: "https://sub.example.test/import/paid-visible-once",
      nextAction: "copy_subscription_url",
      updatedAt: "2026-05-31T00:00:00.000Z",
      safety: {
        noAdminApi: true,
        noDbMutation: true,
        noPaymentActivation: true,
        noPublicAdmin: true,
        noRawCustomerDataReturned: true
      }
    }));
    const client = portalClient({
      revealSubscription,
      fetchCurrentState: vi.fn(async (input: { userRef: string }): Promise<PortalUserState> => ({
        userRef: input.userRef,
        subscriptionRequest: {
          status: "subscription_ready",
          lifecycle: "active",
          requestRef: "subreq_paid_active",
          userRef: input.userRef,
          planId: "monthly_basic",
          clientTarget: "clash",
          expiresAt: "2026-06-30T00:00:00.000Z",
          durationDays: 30,
          quantity: 1,
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
    openPortalSubscriptions();

    await waitFor(() => expect(revealSubscription).toHaveBeenCalledWith(expect.objectContaining({
      userRef: "user_safe_ref",
      requestRef: "subreq_paid_active"
    })));
    expect(await screen.findByDisplayValue("https://sub.example.test/import/paid-visible-once")).not.toBeNull();
    expect(writeText).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "复制链接" }));

    await waitFor(() => expect(writeText).toHaveBeenCalledWith("https://sub.example.test/import/paid-visible-once"));
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
    expect(screen.queryByRole("table", { name: "订单列表" })).toBeNull();
    expect(screen.queryByRole("dialog", { name: "选择套餐" })).toBeNull();
    expect(screen.queryByRole("dialog", { name: "选择支付方式" })).toBeNull();
  });

  test("defaults Personal Center to profile and isolates security controls", async () => {
    render(createElement(UserPortalPage, { portalClient: portalClient() }));

    await enterPortal();
    fireEvent.click(screen.getByRole("button", { name: "个人中心" }));

    expect(screen.getByRole("tab", { name: "资料" }))
      .toHaveAttribute("aria-selected", "true");
    expect(screen.getByText("登录邮箱")).not.toBeNull();
    expect(screen.queryByText("安全设置")).toBeNull();

    fireEvent.click(screen.getByRole("tab", { name: "安全" }));

    expect(screen.getByText("安全设置")).not.toBeNull();
    expect(screen.queryByText("登录邮箱")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "概览" }));
    fireEvent.click(screen.getByRole("button", { name: "个人中心" }));

    expect(screen.getByRole("tab", { name: "资料" }))
      .toHaveAttribute("aria-selected", "true");
    expect(screen.getByText("登录邮箱")).not.toBeNull();
    expect(screen.queryByText("安全设置")).toBeNull();
  });

  test("supports keyboard navigation across Personal Center tabs", async () => {
    render(createElement(UserPortalPage, { portalClient: portalClient() }));

    await enterPortal();
    fireEvent.click(screen.getByRole("button", { name: "个人中心" }));

    const profileTab = screen.getByRole("tab", { name: "资料" });
    const securityTab = screen.getByRole("tab", { name: "安全" });
    profileTab.focus();

    fireEvent.keyDown(profileTab, { key: "ArrowRight" });

    expect(securityTab).toHaveFocus();
    expect(securityTab).toHaveAttribute("aria-selected", "true");
    expect(screen.getByText("安全设置")).not.toBeNull();

    fireEvent.keyDown(securityTab, { key: "ArrowRight" });

    expect(profileTab).toHaveFocus();
    expect(profileTab).toHaveAttribute("aria-selected", "true");
    expect(screen.getByText("登录邮箱")).not.toBeNull();

    fireEvent.keyDown(profileTab, { key: "ArrowLeft" });

    expect(securityTab).toHaveFocus();
    expect(securityTab).toHaveAttribute("aria-selected", "true");

    fireEvent.keyDown(securityTab, { key: "Home" });

    expect(profileTab).toHaveFocus();
    expect(profileTab).toHaveAttribute("aria-selected", "true");

    fireEvent.keyDown(profileTab, { key: "End" });

    expect(securityTab).toHaveFocus();
    expect(securityTab).toHaveAttribute("aria-selected", "true");
    expect(screen.getByText("安全设置")).not.toBeNull();
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
    const client = portalClientWithActiveSubscription({}, {
      submitSupportRequest
    } as Partial<UserPortalClient>);
    const writeText = vi.fn(async () => undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText }
    });
    render(createElement(UserPortalPage, { portalClient: client }));

    await enterPortal();
    openPortalStartGuide();
    expect(screen.getByRole("heading", { name: "欢迎使用" })).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "开始配置" }));
    expect(screen.getByRole("heading", { name: "你要在哪台设备上使用？" })).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Windows PC / Laptop" }));
    expect(screen.getByRole("heading", { name: "选择一个客户端" })).not.toBeNull();
    expect(screen.getByRole("button", { name: "Clash Verge Rev Windows / macOS / Linux" })).not.toBeNull();
    expect(screen.getByRole("button", { name: "Hiddify 备用客户端" })).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Clash Verge Rev Windows / macOS / Linux" }));
    expect(screen.getByText("STEP 1 / 5")).not.toBeNull();
    expect(screen.getAllByText("下载 Clash Verge Rev").length).toBeGreaterThanOrEqual(2);
    expect(screen.queryByText("复制你的订阅链接")).toBeNull();
    expect(screen.queryByText("导入订阅链接")).toBeNull();
    expect(screen.getByRole("link", { name: "下载 Clash Verge Rev" }).getAttribute("href")).toBe(
      "https://www.clashverge.dev/install.html"
    );
    expect(screen.queryByRole("button", { name: "返回选择设备" })).toBeNull();
    expect(screen.queryByRole("button", { name: "返回选择客户端" })).toBeNull();
    expect(screen.queryByRole("button", { name: "返回开始" })).toBeNull();
    expect(screen.getByRole("button", { name: "下一步" })).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "下一步" }));
    expect(screen.getByText("STEP 2 / 5")).not.toBeNull();
    expect(screen.getByText("复制你的订阅链接")).not.toBeNull();
    expect(screen.getByText("点击生成并复制。这个链接只放进客户端，不要发给别人。")).not.toBeNull();
    await waitFor(() => expect(screen.getByDisplayValue("https://sub.example.test/import/existing-visible-once")).not.toBeNull());
    fireEvent.click(screen.getByRole("button", { name: "刷新链接" }));
    await waitFor(() => expect(client.refreshSubscription).toHaveBeenCalledWith(expect.objectContaining({
      userRef: "user_safe_ref",
      requestRef: "subreq_existing_monthly",
      clientTarget: "clash"
    })));
    await waitFor(() => expect(screen.getByDisplayValue("https://sub.example.test/import/refreshed-visible-once")).not.toBeNull());
    expect(screen.queryByRole("button", { name: "先查看导入教程" })).toBeNull();
    expect(writeText).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "复制链接" }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith("https://sub.example.test/import/refreshed-visible-once"));
    expect(screen.queryByRole("button", { name: "上一步" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "我已复制，下一步" }));
    expect(screen.getByText("STEP 3 / 5")).not.toBeNull();
    expect(screen.getByText("导入订阅链接")).not.toBeNull();
    expect(document.querySelector('[aria-label="导入订阅链接图形教程"]')).not.toBeNull();
    expect(screen.getByRole("link", { name: /参考来源：\s*Clash Verge Rev 官方订阅导入文档/ }).getAttribute("href")).toBe(
      "https://clashvergerev.com/en/guide/profile"
    );
    expect(screen.getByText("订阅 URL 导入")).not.toBeNull();
    expect(screen.getAllByText(/订阅文件链接/).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByAltText("Clash Verge Rev 订阅页面导入订阅文件链接教程截图").getAttribute("src")).toBe(
      "/guide/clash-subscription-import.png"
    );
    expect(screen.getAllByText("打开左侧订阅").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("把链接粘贴到订阅文件链接").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("点击导入并等待更新完成").length).toBeGreaterThanOrEqual(1);
    expect(document.querySelector(".portal-start-import-window")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "下一步" }));
    expect(screen.getByText("STEP 4 / 5")).not.toBeNull();
    expect(screen.getByText("选择线路并连接")).not.toBeNull();
    expect(screen.queryByText(/Shadowrocket、Surge、Stash、v2rayN/)).toBeNull();
    expect(screen.getByText("系统代理")).not.toBeNull();
    expect(screen.getByAltText("Clash Verge Rev 设置页面开启系统代理教程截图").getAttribute("src")).toBe(
      "/guide/clash-system-proxy.png"
    );
    expect(document.querySelector(".portal-v2-client-boundary")).toBeNull();
    expect(screen.queryByText("推荐优先使用", { exact: false })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "下一步" }));
    expect(screen.getByText("STEP 5 / 5")).not.toBeNull();
    expect(screen.getByText("检查是否可用")).not.toBeNull();
    expect(screen.getAllByText("浏览器能打开目标网站").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByRole("button", { name: "仍不可用，联系支持" })).not.toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "支持" }));
    expect(screen.getByRole("heading", { name: "提交问题" })).not.toBeNull();
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
    expect(screen.queryByText("订单与付款记录")).toBeNull();
    expect(screen.queryByText("充值")).toBeNull();
    expect(screen.queryByText("余额")).toBeNull();
    expect(screen.queryByText("扣费")).toBeNull();
  });

  test("requires delivered entitlement before setup and sends acquisition to Marketplace", async () => {
    const client = portalClient();
    render(createElement(UserPortalPage, { portalClient: client }));

    await enterPortal();
    openPortalStartGuide();
    fireEvent.click(screen.getByRole("button", { name: "前往商城" }));

    expectMarketplaceWithoutLegacyCheckout(client);
    expect(screen.queryByRole("dialog", { name: "选择套餐" })).toBeNull();
    expect(screen.queryByRole("heading", {
      name: "你要在哪台设备上使用？"
    })).toBeNull();
  });

  test("lets a registration trial order start setup without forcing a paid plan", async () => {
    const client = portalClient({
      fetchCurrentState: vi.fn(async (input: { userRef: string }): Promise<PortalUserState> => ({
        userRef: input.userRef,
        subscriptionRequest: {
          requestRef: "pareq_registration_trial",
          userRef: input.userRef,
          planId: "trial",
          clientTarget: "clash",
          status: "subscription_ready",
          lifecycle: "active",
          durationDays: 7,
          quantity: 1,
          expiresAt: "2026-07-14T00:00:00.000Z",
          updatedAt: "2026-07-07T00:00:00.000Z",
          nextAction: "copy_subscription_url",
          safety: {
            noAdminApi: true,
            noDbMutation: true,
            noPaymentActivation: true,
            noPublicAdmin: true,
            noRawCustomerDataReturned: true
          }
        },
        subscriptionRequests: [
          {
            requestRef: "pareq_registration_trial",
            userRef: input.userRef,
            planId: "trial",
            clientTarget: "clash",
            status: "subscription_ready",
            lifecycle: "active",
            durationDays: 7,
            quantity: 1,
            expiresAt: "2026-07-14T00:00:00.000Z",
            updatedAt: "2026-07-07T00:00:00.000Z",
            nextAction: "copy_subscription_url",
            safety: {
              noAdminApi: true,
              noDbMutation: true,
              noPaymentActivation: true,
              noPublicAdmin: true,
              noRawCustomerDataReturned: true
            }
          }
        ],
        accountEntitlements: [
          {
            entitlementRef: "ent_registration_trial",
            accountId: input.userRef,
            plan: "trial",
            status: "active",
            usable: true,
            validUntil: "2026-07-14T00:00:00.000Z",
            quota: { trafficGb: 0 }
          }
        ],
        paymentOrders: [],
        historySummary: [],
        security: {
          authenticatorBound: false,
          initialAccount: false,
          passkeyEnabled: false,
          passkeyExported: false,
          setupRequired: false
        },
        updatedAt: "2026-07-07T00:00:00.000Z",
        safety: {
          noAdminApi: true,
          noPaymentActivation: true,
          noPublicAdmin: true
        }
      })),
      revealSubscription: vi.fn(async (input: PortalRevealSubscriptionInput): Promise<PortalSubscriptionRequest> => ({
        status: "subscription_ready",
        lifecycle: "active",
        requestRef: input.requestRef,
        userRef: input.userRef,
        planId: "trial",
        clientTarget: "clash",
        durationDays: 7,
        quantity: 1,
        expiresAt: "2026-07-14T00:00:00.000Z",
        subscriptionUrl: "https://sub.example.test/import/registration-trial-visible-once",
        nextAction: "copy_subscription_url",
        updatedAt: "2026-07-07T00:00:00.000Z",
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
    openPortalStartGuide();
    fireEvent.click(screen.getByRole("button", { name: "开始配置" }));

    await waitFor(() => expect(screen.getByRole("heading", { name: "你要在哪台设备上使用？" })).not.toBeNull());
    expect(screen.queryByRole("dialog", { name: "选择套餐" })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Windows PC / Laptop" }));
    fireEvent.click(screen.getByRole("button", { name: /Clash Verge Rev/ }));
    fireEvent.click(screen.getByRole("button", { name: "下一步" }));
    fireEvent.click(screen.getByRole("button", { name: "生成订阅链接" }));

    await waitFor(() => expect(client.revealSubscription).toHaveBeenCalledWith(expect.objectContaining({
      requestRef: "pareq_registration_trial"
    })));
    expect(client.applyForSubscription).not.toHaveBeenCalled();
    expect(await screen.findByDisplayValue("https://sub.example.test/import/registration-trial-visible-once")).not.toBeNull();
  });

  test("lets an admin-granted yearly traffic entitlement start setup without a payment order", async () => {
    const client = portalClient({
      fetchCurrentState: vi.fn(async (input: { userRef: string }): Promise<PortalUserState> => ({
        userRef: input.userRef,
        subscriptionRequest: null,
        subscriptionRequests: [],
        accountEntitlements: [
          {
            entitlementRef: "ent_admin_yearly",
            accountId: input.userRef,
            plan: "yearly",
            status: "active",
            usable: true,
            validUntil: "2027-07-07T00:00:00.000Z",
            quota: { trafficGb: 200 }
          }
        ],
        paymentOrders: [],
        historySummary: [],
        security: {
          authenticatorBound: false,
          initialAccount: false,
          passkeyEnabled: false,
          passkeyExported: false,
          setupRequired: false
        },
        updatedAt: "2026-07-07T00:00:00.000Z",
        safety: {
          noAdminApi: true,
          noPaymentActivation: true,
          noPublicAdmin: true
        }
      }))
    });
    render(createElement(UserPortalPage, { portalClient: client }));

    await enterPortal();
    openPortalStartGuide();
    fireEvent.click(screen.getByRole("button", { name: "开始配置" }));

    await waitFor(() => expect(screen.getByRole("heading", { name: "你要在哪台设备上使用？" })).not.toBeNull());
    expect(screen.queryByRole("dialog", { name: "选择套餐" })).toBeNull();
    expect(client.applyForSubscription).not.toHaveBeenCalled();

    openPortalDashboard();
    expect(await screen.findByRole("heading", { name: "账户概览" })).not.toBeNull();
    expect(screen.getAllByText("年度套餐").length).toBeGreaterThan(0);
    expect(screen.getAllByText("生效中").length).toBeGreaterThan(0);
    expect(screen.getByText("2027/07/07 到期")).not.toBeNull();
    expect(screen.getAllByText("本月额度 200 GB").length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole("button", { name: "用量" }));
    expect(await screen.findByRole("heading", { name: "流量消耗" })).not.toBeNull();
    expect(screen.getByText("0% 额度使用率")).not.toBeNull();
    expect(screen.getAllByText("0 B / 200 GB").length).toBeGreaterThan(0);

    openPortalProfile();
    expect(await screen.findByRole("heading", { name: "账户管理" })).not.toBeNull();
    expect(screen.queryByText("年度套餐 · 服务生效中")).toBeNull();
    expect(screen.queryByText("2027/07/07 到期")).toBeNull();
  });

  test("uses an admin-granted yearly entitlement instead of a disabled trial when generating the setup link", async () => {
    const client = portalClient({
      fetchCurrentState: vi.fn(async (input: { userRef: string }): Promise<PortalUserState> => ({
        userRef: input.userRef,
        subscriptionRequest: {
          requestRef: "subreq_disabled_trial",
          userRef: input.userRef,
          planId: "trial",
          clientTarget: "clash",
          status: "subscription_disabled",
          lifecycle: "disabled",
          durationDays: 7,
          quantity: 1,
          expiresAt: "2026-07-07T00:00:00.000Z",
          updatedAt: "2026-07-03T16:33:01.555Z",
          nextAction: "subscription_disabled",
          safety: {
            noAdminApi: true,
            noDbMutation: true,
            noPaymentActivation: true,
            noPublicAdmin: true,
            noRawCustomerDataReturned: true
          }
        },
        subscriptionRequests: [
          {
            requestRef: "subreq_disabled_trial",
            userRef: input.userRef,
            planId: "trial",
            clientTarget: "clash",
            status: "subscription_disabled",
            lifecycle: "disabled",
            durationDays: 7,
            quantity: 1,
            expiresAt: "2026-07-07T00:00:00.000Z",
            updatedAt: "2026-07-03T16:33:01.555Z",
            nextAction: "subscription_disabled",
            safety: {
              noAdminApi: true,
              noDbMutation: true,
              noPaymentActivation: true,
              noPublicAdmin: true,
              noRawCustomerDataReturned: true
            }
          }
        ],
        accountEntitlements: [
          {
            entitlementRef: "ent_admin_yearly",
            accountId: input.userRef,
            plan: "yearly",
            status: "active",
            usable: true,
            validUntil: "2027-07-07T00:00:00.000Z",
            quota: { trafficGb: 200 }
          }
        ],
        paymentOrders: [],
        historySummary: [],
        security: {
          authenticatorBound: false,
          initialAccount: false,
          passkeyEnabled: false,
          passkeyExported: false,
          setupRequired: false
        },
        updatedAt: "2026-07-07T00:00:00.000Z",
        safety: {
          noAdminApi: true,
          noPaymentActivation: true,
          noPublicAdmin: true
        }
      }))
    });
    render(createElement(UserPortalPage, { portalClient: client }));

    await enterPortal();
    openPortalStartGuide();
    fireEvent.click(screen.getByRole("button", { name: "开始配置" }));
    await waitFor(() => expect(screen.getByRole("heading", { name: "你要在哪台设备上使用？" })).not.toBeNull());
    fireEvent.click(screen.getByRole("button", { name: "Windows PC / Laptop" }));
    await waitFor(() => expect(screen.getByRole("heading", { name: "选择一个客户端" })).not.toBeNull());
    fireEvent.click(screen.getByRole("button", { name: "Clash Verge Rev Windows / macOS / Linux" }));
    await screen.findAllByText("下载 Clash Verge Rev");
    fireEvent.click(screen.getByRole("button", { name: "下一步" }));
    expect(await screen.findByText("复制你的订阅链接")).not.toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "生成订阅链接" }));

    await waitFor(() => expect(client.applyForSubscription).toHaveBeenCalledWith(expect.objectContaining({
      planId: "yearly",
      durationDays: 365,
      quantity: 1,
      clientTarget: "clash"
    })));
    expect((screen.getByLabelText("订阅链接") as HTMLTextAreaElement).value).toBe("https://sub.example.test/import/visible-once");
  });

  test("omits the empty subscription-link preview notice before a link exists", async () => {
    const client = portalClient({
      fetchCurrentState: vi.fn(async (input: { userRef: string }): Promise<PortalUserState> => ({
        userRef: input.userRef,
        subscriptionRequest: null,
        subscriptionRequests: [],
        accountEntitlements: [
          {
            entitlementRef: "ent_admin_yearly",
            accountId: input.userRef,
            plan: "yearly",
            status: "active",
            usable: true,
            validUntil: "2027-07-07T00:00:00.000Z",
            quota: { trafficGb: 200 }
          }
        ],
        paymentOrders: [],
        historySummary: [],
        security: {
          authenticatorBound: false,
          initialAccount: false,
          passkeyEnabled: false,
          passkeyExported: false,
          setupRequired: false
        },
        updatedAt: "2026-07-07T00:00:00.000Z",
        safety: {
          noAdminApi: true,
          noPaymentActivation: true,
          noPublicAdmin: true
        }
      }))
    });
    render(createElement(UserPortalPage, { portalClient: client }));

    await enterPortal();
    openPortalStartGuide();
    fireEvent.click(screen.getByRole("button", { name: "开始配置" }));
    await waitFor(() => expect(screen.getByRole("heading", { name: "你要在哪台设备上使用？" })).not.toBeNull());
    fireEvent.click(screen.getByRole("button", { name: "Windows PC / Laptop" }));
    await waitFor(() => expect(screen.getByRole("heading", { name: "选择一个客户端" })).not.toBeNull());
    fireEvent.click(screen.getByRole("button", { name: "Clash Verge Rev Windows / macOS / Linux" }));
    await screen.findAllByText("下载 Clash Verge Rev");
    fireEvent.click(screen.getByRole("button", { name: "下一步" }));

    expect(await screen.findByText("复制你的订阅链接")).not.toBeNull();
    expect(screen.getByPlaceholderText("链接生成后会显示在这里。")).not.toBeNull();
    expect(screen.queryByText("暂时没有链接也可以先查看后续教程；正式导入前请先生成并复制订阅链接。")).toBeNull();
  });

  test("offers Clash Mi instead of Karing for Android setup", async () => {
    const client = portalClientWithActiveSubscription({
      clientTarget: "clash",
      subscriptionUrl: "https://sub.example.test/import/clashmi-visible-once"
    });
    const writeText = vi.fn(async () => undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText }
    });
    render(createElement(UserPortalPage, { portalClient: client }));

    await enterPortal();
    openPortalStartGuide();
    fireEvent.click(screen.getByRole("button", { name: "开始配置" }));
    fireEvent.click(screen.getByRole("button", { name: "Android Samsung, Xiaomi, etc." }));
    expect(screen.getByRole("button", { name: "Clash Mi iOS / Android / HarmonyOS" })).not.toBeNull();
    expect(screen.queryByRole("button", { name: "Karing iOS / Android / HarmonyOS" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Clash Mi iOS / Android / HarmonyOS" }));
    expect(screen.getByRole("link", { name: "打开 Clash Mi 下载页" }).getAttribute("href")).toBe("https://clashmi.app/download");
    fireEvent.click(screen.getByRole("button", { name: "下一步" }));
    await waitFor(() => expect(screen.getByDisplayValue("https://sub.example.test/import/clashmi-visible-once")).not.toBeNull());
    fireEvent.click(screen.getByRole("button", { name: "复制链接" }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith("https://sub.example.test/import/clashmi-visible-once"));
    expect(client.applyForSubscription).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "我已复制，下一步" }));

    expect(screen.getByText("STEP 3 / 5")).not.toBeNull();
    expect(screen.getByText("Android：参考 Clash Mi 从 URL 导入路径")).not.toBeNull();
    expect(screen.getByText("打开 Clash Mi，进入配置或订阅页面")).not.toBeNull();
    expect(screen.getByText("粘贴订阅链接并确认导入")).not.toBeNull();
    expect(screen.getByText("导入完成后返回首页，下一步允许 VPN 连接请求")).not.toBeNull();
    expect(screen.queryByAltText("Clash Verge Rev 订阅页面导入订阅文件链接教程截图")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "下一步" }));
    expect(screen.getByText("STEP 4 / 5")).not.toBeNull();
    expect(screen.getByText("Android 首次连接会弹出 VPN 连接请求，允许后再等待连接完成。")).not.toBeNull();
    expect(screen.getAllByText("点击连接并允许 VPN 请求").length).toBeGreaterThanOrEqual(1);

    fireEvent.click(screen.getByRole("button", { name: "下一步" }));
    expect(screen.getByText("STEP 5 / 5")).not.toBeNull();
    expect(screen.getAllByText("系统显示 VPN 正在运行").length).toBeGreaterThanOrEqual(1);
  });

  test("offers Clash Mi for iOS setup", async () => {
    const client = portalClientWithActiveSubscription({ clientTarget: "clash" });
    render(createElement(UserPortalPage, { portalClient: client }));

    await enterPortal();
    openPortalStartGuide();
    fireEvent.click(screen.getByRole("button", { name: "开始配置" }));
    await waitFor(() => expect(screen.getByRole("heading", { name: "你要在哪台设备上使用？" })).not.toBeNull());
    fireEvent.click(screen.getByRole("button", { name: "Apple iOS iPhone / iPad" }));

    expect(screen.getByRole("button", { name: "Clash Mi iOS / Android / HarmonyOS" })).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Clash Mi iOS / Android / HarmonyOS" }));
    expect(screen.getByRole("link", { name: "打开 Clash Mi 下载页" }).getAttribute("href")).toBe("https://clashmi.app/download");
  });

  test("renders Linux desktop fallback instructions after copying a Hiddify link", async () => {
    const client = portalClientWithActiveSubscription({
      clientTarget: "karing",
      subscriptionUrl: "https://sub.example.test/import/hiddify-visible-once"
    });
    const writeText = vi.fn(async () => undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText }
    });
    render(createElement(UserPortalPage, { portalClient: client }));

    await enterPortal();
    openPortalStartGuide();
    fireEvent.click(screen.getByRole("button", { name: "开始配置" }));
    fireEvent.click(screen.getByRole("button", { name: "Linux Terminal / Server" }));
    fireEvent.click(screen.getByRole("button", { name: "Hiddify 备用客户端" }));
    fireEvent.click(screen.getByRole("button", { name: "下一步" }));
    await waitFor(() => expect(screen.getByDisplayValue("https://sub.example.test/import/hiddify-visible-once")).not.toBeNull());
    fireEvent.click(screen.getByRole("button", { name: "复制链接" }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith("https://sub.example.test/import/hiddify-visible-once"));
    expect(client.applyForSubscription).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "我已复制，下一步" }));

    expect(screen.getByText("STEP 3 / 5")).not.toBeNull();
    expect(screen.getByText("Linux：参考 Home + Add from clipboard / Add manually 路径")).not.toBeNull();
    expect(screen.getByText("失败时用 Add manually 填 URL 后保存")).not.toBeNull();
    expect(screen.queryByAltText("Clash Verge Rev 订阅页面导入订阅文件链接教程截图")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "下一步" }));
    expect(screen.getByText("STEP 4 / 5")).not.toBeNull();
    expect(screen.getByText("Linux 桌面环境差异较大，连接后重点检查系统代理或 TUN 是否真正接管。")).not.toBeNull();
    expect(screen.getAllByText("检查系统代理或 TUN 是否生效").length).toBeGreaterThanOrEqual(1);

    fireEvent.click(screen.getByRole("button", { name: "下一步" }));
    expect(screen.getByText("STEP 5 / 5")).not.toBeNull();
    expect(screen.getAllByText("不可用时检查系统代理/TUN 或换线路").length).toBeGreaterThanOrEqual(1);
  });

  test("start guide media steps keep the shared frame while constraining visual tutorials", () => {
    const css = readFileSync(
      resolve("src/styles/portal-static-preserve/user-portal-desktop.css"),
      "utf8"
    ).replace(/\r\n?/g, "\n");

    expect(css).toContain(".portal-start-flow-panel.portal-start-tutorial {\n  height: var(--portal-start-panel-height);\n  min-height: var(--portal-start-panel-height);\n  overflow: hidden;");
    expect(css).toContain(".portal-start-step-option {\n  box-sizing: border-box;\n  height: 388px;");
    expect(css).toContain("min-height: 388px;\n  overflow: hidden;\n  padding: 34px 40px 32px;");
    expect(css).toContain(".portal-start-step-option-import,\n.portal-start-step-option-connect,\n.portal-start-step-option-verify {\n  align-content: start;\n  gap: 8px;");
    expect(css).toContain(".portal-start-step-option-copy {\n  gap: 9px;\n  overflow-y: auto;\n  overscroll-behavior: contain;");
    expect(css).toContain(".portal-start-step-option-import .portal-start-visual-guide-card,\n.portal-start-step-option-connect .portal-start-visual-guide-card,\n.portal-start-step-option-verify .portal-start-visual-guide-card {\n  gap: 8px;\n  max-height: 178px;");
    expect(css).toContain("overflow-y: auto;\n  overscroll-behavior: contain;");
    expect(css).toContain(".portal-start-guide-screenshot-frame {\n  box-sizing: border-box;");
    expect(css).toContain(".portal-start-guide-screenshot-frame img {\n  display: block;\n  width: 100%;\n  height: auto;\n  max-width: 100%;");
    expect(css).toContain(".portal-start-import-window {\n  box-sizing: border-box;\n  display: grid;\n  max-width: 100%;\n  min-width: 0;");
    expect(css).toContain(".portal-start-import-input span {\n  min-width: 0;\n  overflow: hidden;");
    expect(css).toContain("overflow-wrap: anywhere;\n  text-overflow: clip;\n  white-space: normal;\n  word-break: break-word;");
    expect(css).toContain(".portal-start-visual-step strong {\n  color: #111827;\n  font-size: 13px;\n  font-weight: 720;\n  overflow-wrap: anywhere;\n  white-space: normal;");
  });

  test("keeps the no-plan start stage compact on desktop without changing mobile", () => {
    const css = readFileSync(
      resolve("src/styles/portal-static-preserve/user-portal-desktop.css"),
      "utf8"
    ).replace(/\r\n?/g, "\n");

    expect(css).toMatch(
      /@media \(min-width: 721px\) \{[\s\S]*?\.portal-start-guide\[data-access="needs-plan"\]\s*\{[^}]*--portal-start-panel-height:\s*360px;/s
    );
    expect(css).not.toMatch(
      /@media \(max-width: 720px\) \{[\s\S]*?\.portal-start-guide\[data-access="needs-plan"\]/s
    );
  });

  test("mobile order layout prevents table and action overflow", () => {
    const css = readFileSync(
      resolve("src/styles/portal-static-preserve/user-portal-desktop.css"),
      "utf8"
    ).replace(/\r\n?/g, "\n");

    expect(css).toContain(".portal-v2-shell .portal-order-table {\n    min-width: 0;");
    expect(css).toContain(".portal-order-table td {\n    display: grid;\n    grid-template-columns: minmax(72px, 0.34fr) minmax(0, 1fr);");
    expect(css).toContain(".portal-order-actions button,\n  .portal-order-actions a {\n    justify-content: center;\n    min-width: 0;\n    width: 100%;");
    expect(css).toContain(".portal-order-link,\n  .portal-order-main-text,\n  .portal-order-plan-cell,");
    expect(css).toContain(".portal-v2-shell .portal-order-detail-grid {\n    grid-template-columns: 1fr;");
    expect(css).toContain(".portal-v2-shell .modal-backdrop .portal-purchase-modal,");
    expect(css).toContain("scroll-snap-type: x mandatory;");
    expect(css).not.toContain("portal-checkout-footer");
    expect(css).not.toContain("portal-mobile-checkout-summary");
    expect(css).not.toContain("portal-purchase-quick-row");
    expect(css).toContain("padding-bottom: calc(118px + env(safe-area-inset-bottom));");
  });
});
