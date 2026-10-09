import type {
  LocalUserPortalClientOptions,
  PortalAuthenticatorEnrollment,
  PortalHistoryRecord,
  PortalPaymentOrder,
  PortalSecondFactorChallenge,
  PortalSecondFactorKind,
  PortalSubscriptionEvent,
  PortalSubscriptionRequest,
  PortalUserSecurityState,
  PortalUserState,
  UserPortalClient
} from "./user-portal-types";
import {
  amountMinorForPlan,
  createQrDataUri,
  durationDaysForPlan,
  expiresAtFromDays,
  historySummaryForRequests,
  legalAgreementProof,
  normalizeOrderDurationDays,
  normalizeOrderQuantity,
  normalizePaymentPlan,
  normalizeSupportMessage,
  parsePasskeyProof,
  planLabel,
  portalError,
  registrationEmailVerificationProof,
  requiredEmail,
  requiredText,
  sessionSummary,
  stableRef,
  subscriptionRequestsFromState,
  upsertSubscriptionRequest,
  verifiedHuman
} from "./user-portal-parsers";
import {
  createLocalHumanVerificationChallenge,
  createLocalPreviewInitialAccounts,
  previewPasswordForInitialAccount
} from "./user-portal-preview-data";
import {
  createOtpauthUri,
  formatBase32Secret,
  randomBase32Secret,
  verifyTotpCode
} from "./totp-preview";

export function createLocalUserPortalClient(options: LocalUserPortalClientOptions = {}): UserPortalClient {
  const now = options.now ?? (() => new Date());
  const states = new Map<string, PortalUserState>();
  const subscriptionResetOperations = new Map<string, PortalSubscriptionRequest>();
  const previewPassword = requiredText(options.previewPassword ?? "user-password", "预览密码无效。");
  const initialAccounts = new Map(
    (options.initialAccounts ?? createLocalPreviewInitialAccounts()).map((account, index) => [
      account.userRef,
      {
        ...account,
        previewPassword: previewPasswordForInitialAccount(account, index, previewPassword)
      }
    ])
  );
  const accountSecurity = new Map<string, {
    authenticatorSecret?: string;
    passkeyExported?: boolean;
    passkeyEnabled?: boolean;
    passkeyRef?: string;
  }>();
  const paymentOrders = new Map<string, PortalPaymentOrder[]>();
  const authenticatorEnrollments = new Map<string, {
    expiresAt: string;
    secret: string;
    userRef: string;
  }>();
  const registrationEntryAccounts = new Map<string, string>();
  const secondFactorChallenges = new Map<string, {
    availableFactors: PortalSecondFactorKind[];
    expiresAt: string;
    userRef: string;
  }>();
  let localSubscriptionSequence = 0;
  let localPaymentSequence = 0;

  function securityState(userRef: string): PortalUserSecurityState {
    const security = accountSecurity.get(userRef);
    const initialAccount = initialAccounts.get(userRef);
    const authenticatorBound = Boolean(security?.authenticatorSecret);
    const passkeyEnabled = security?.passkeyEnabled === true;
    const passkeyExported = security?.passkeyExported === true;
    return {
      authenticatorBound,
      initialAccount: Boolean(initialAccount),
      passkeyEnabled,
      passkeyExported,
      setupRequired: Boolean(initialAccount?.requireSecuritySetup) && (!authenticatorBound || !passkeyExported)
    };
  }

  function enabledFactors(userRef: string): PortalSecondFactorKind[] {
    const security = securityState(userRef);
    const factors: PortalSecondFactorKind[] = [];
    if (security.authenticatorBound) factors.push("authenticator");
    if (security.passkeyEnabled && security.passkeyExported) factors.push("passkey");
    return factors;
  }

  function emptyState(userRef: string): PortalUserState {
      return {
        userRef,
        subscriptionRequest: null,
        subscriptionRequests: [],
        paymentOrders: paymentOrders.get(userRef) ?? [],
        historySummary: [],
        security: securityState(userRef),
        updatedAt: now().toISOString(),
      safety: {
        noAdminApi: true,
        noPaymentActivation: true,
        noPublicAdmin: true
      }
    };
  }

  function currentState(userRef: string) {
    const state = states.get(userRef) ?? emptyState(userRef);
    return {
      ...state,
      paymentOrders: paymentOrders.get(userRef) ?? state.paymentOrders ?? [],
      security: securityState(userRef)
    };
  }

  function setState(userRef: string, next: Omit<PortalUserState, "userRef" | "safety">) {
    const state: PortalUserState = {
      userRef,
      ...next,
      security: next.security ?? securityState(userRef),
      safety: {
        noAdminApi: true,
        noPaymentActivation: true,
        noPublicAdmin: true
      }
    };
    states.set(userRef, state);
    return state;
  }

  function upsertLocalPaymentOrder(userRef: string, order: PortalPaymentOrder) {
    const nextOrders = [
      order,
      ...(paymentOrders.get(userRef) ?? []).filter((existing) => existing.orderRef !== order.orderRef)
    ];
    paymentOrders.set(userRef, nextOrders);
    const state = currentState(userRef);
    setState(userRef, {
      subscriptionRequest: state.subscriptionRequest,
      subscriptionRequests: state.subscriptionRequests,
      paymentOrders: nextOrders,
      historySummary: state.historySummary ?? [],
      security: state.security,
      updatedAt: order.createdAt
    });
    return nextOrders;
  }

  function createSecondFactorChallenge(userRef: string, displayName: string, issuedAt: Date): PortalSecondFactorChallenge {
    const availableFactors = enabledFactors(userRef);
    const expiresAt = new Date(issuedAt.getTime() + 5 * 60 * 1000);
    const challengeRef = stableRef(
      "portal_mfa",
      [
        userRef,
        issuedAt.toISOString(),
        availableFactors.join(",")
      ].join("|")
    );
    secondFactorChallenges.set(challengeRef, {
      availableFactors,
      expiresAt: expiresAt.toISOString(),
      userRef
    });
    return {
      status: "second_factor_required",
      challengeRef,
      userRef,
      displayName,
      authMode: "password",
      availableFactors,
      expiresInSeconds: 300,
      issuedAt: issuedAt.toISOString(),
      safety: {
        noAdminApi: true,
        noPublicAuthActivated: true,
        noSessionCreated: true
      }
    };
  }

  async function startLocalAuthenticatorEnrollment(userRefInput: string): Promise<PortalAuthenticatorEnrollment> {
    const userRef = requiredText(userRefInput, "用户会话无效。");
    if (accountSecurity.get(userRef)?.authenticatorSecret) {
      throw portalError("此账户已绑定身份验证器。");
    }
    const issuedAt = now();
    const secret = options.totpSecretFactory?.() ?? randomBase32Secret();
    const issuer = "GCC Gateway Portal";
    const accountLabel = userRef;
    const otpauthUri = createOtpauthUri({ accountLabel, issuer, secret });
    const enrollmentRef = stableRef("totp_enroll", `${userRef}|${secret}|${issuedAt.toISOString()}`);
    const expiresAt = new Date(issuedAt.getTime() + 5 * 60 * 1000).toISOString();
    authenticatorEnrollments.set(enrollmentRef, {
      expiresAt,
      secret,
      userRef
    });

    return {
      status: "preview",
      enrollmentRef,
      userRef,
      issuer,
      accountLabel,
      manualKey: formatBase32Secret(secret),
      otpauthUri,
      qrDataUri: await createQrDataUri(otpauthUri),
      expiresInSeconds: 300,
      issuedAt: issuedAt.toISOString(),
      safety: {
        noAdminApi: true,
        noPublicAuthActivated: true,
        noProductionCredentialMutation: true
      }
    };
  }

  return {
    async issueHumanChallenge() {
      return createLocalHumanVerificationChallenge();
    },

    async requestEmailCode(input) {
      verifiedHuman(input.humanVerification);
      requiredEmail(input.email);
      if (input.purpose !== "login") {
        throw portalError("邮箱验证码用途无效。");
      }
      throw portalError("邮箱验证码登录尚未启用。");
    },

    async requestRegistrationEmailVerification(input) {
      const email = requiredEmail(input.email);
      return {
        status: "simulated",
        verificationRef: stableRef("reg_email", email),
        expiresInSeconds: 600,
        safety: {
          noAdminApi: true,
          noAccountCreated: true,
          noPublicAuthActivated: true,
          noRawCodeReturned: true,
          noRawEmailReturned: true
        }
      };
    },

    async registerTrialAccount(input) {
      const email = requiredEmail(input.email);
      const password = requiredText(input.password, "请输入密码。");
      registrationEmailVerificationProof(input.emailVerification);
      legalAgreementProof(input.legalAgreement);
      const issuedAt = now();
      initialAccounts.set(email, {
        userRef: email,
        displayName: email,
        issuedAt: issuedAt.toISOString(),
        previewPassword: password,
        requireSecuritySetup: false
      });
      return {
        status: "registered",
        userRef: email,
        commercialModel: "legacy",
        session: sessionSummary(email, "password", issuedAt.toISOString(), email, stableRef("portal_session", email)),
        trial: {
          durationDays: 7,
          validUntil: expiresAtFromDays(issuedAt, 7),
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
    },

    async authenticate(input) {
      const issuedAt = now();
      verifiedHuman(input.humanVerification);
      if (input.mode === "email") {
        requiredEmail(input.email);
        requiredText(input.verificationCode, "请输入邮箱验证码。");
        throw portalError("邮箱验证码登录尚未启用。");
      }
      if (input.mode === "authenticator") {
        const accountId = requiredText(input.accountId, "请输入电子邮箱。");
        const security = accountSecurity.get(accountId);
        if (!security?.authenticatorSecret) {
          throw portalError("此账户未绑定身份验证器。");
        }
        const verified = await verifyTotpCode({
          secret: security.authenticatorSecret,
          code: requiredText(input.totpCode, "请输入动态验证码。"),
          now: now()
        });
        if (!verified) {
          throw portalError("动态验证码无效或已过期。");
        }
        return sessionSummary(accountId, input.mode, issuedAt.toISOString());
      }
      if (input.mode === "password") {
        const loginRef = requiredText(input.accountId, "请输入电子邮箱。");
        const normalizedEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(loginRef.trim())
          ? loginRef.trim().toLowerCase()
          : null;
        const lookupRef = normalizedEmail ?? loginRef;
        const account = initialAccounts.get(lookupRef);
        if (!account || requiredText(input.password, "请输入密码。") !== account.previewPassword) {
          throw portalError("账户或密码无效。");
        }
        if (enabledFactors(account.userRef).length > 0) {
          return createSecondFactorChallenge(account.userRef, account.displayName, issuedAt);
        }
        return sessionSummary(account.userRef, input.mode, issuedAt.toISOString(), account.displayName);
      }

      const entryToken = requiredText(input.entryToken, "开通链接无效，请重新打开邮件中的链接。");
      requiredText(input.encryptedTotpSecret, "请重新完成身份验证器设置。");
      requiredText(input.totpCode, "请输入动态验证码。");
      return sessionSummary(registrationEntryAccounts.get(entryToken) ?? stableRef("portal_user", entryToken), input.mode, issuedAt.toISOString());
    },

    async completeSecondFactor(input) {
      const challengeRef = requiredText(input.challengeRef, "二次验证会话无效。");
      const challenge = secondFactorChallenges.get(challengeRef);
      if (!challenge) {
        throw portalError("二次验证会话无效。");
      }
      if (new Date(challenge.expiresAt).getTime() <= now().getTime()) {
        secondFactorChallenges.delete(challengeRef);
        throw portalError("二次验证已过期，请重新登录。");
      }
      if (!challenge.availableFactors.includes(input.factor)) {
        throw portalError("此二次验证方式不可用。");
      }

      if (input.factor === "authenticator") {
        const secret = accountSecurity.get(challenge.userRef)?.authenticatorSecret;
        if (!secret) {
          throw portalError("此账户未绑定身份验证器。");
        }
        const verified = await verifyTotpCode({
          secret,
          code: requiredText(input.totpCode, "请输入身份验证器验证码。"),
          now: now()
        });
        if (!verified) {
          throw portalError("身份验证器验证码无效或已过期。");
        }
      } else {
        const security = accountSecurity.get(challenge.userRef);
        const submittedProof = parsePasskeyProof(requiredText(input.passkeyProof, "通行密钥验证失败。"));
        if (
          !security?.passkeyEnabled
          || !security.passkeyExported
          || !security.passkeyRef
          || submittedProof?.userRef !== challenge.userRef
          || submittedProof.passkeyRef !== security.passkeyRef
        ) {
          throw portalError("通行密钥验证失败。");
        }
      }

      secondFactorChallenges.delete(challengeRef);
      return sessionSummary(challenge.userRef, input.factor === "passkey" ? "passkey" : "authenticator", now().toISOString());
    },

    async fetchCurrentState(input) {
      if (!input.userRef.trim()) {
        throw portalError("用户会话无效。");
      }
      return currentState(input.userRef);
    },

    async fetchPaymentOrders(input) {
      const userRef = requiredText(input.userRef, "用户会话无效。");
      return (paymentOrders.get(userRef) ?? [])
        .filter((order) => !input.status || order.status === input.status)
        .filter((order) => !input.plan || order.planId === input.plan);
    },

    async createPaymentCheckout(input) {
      const userRef = requiredText(input.userRef, "用户会话无效。");
      const planId = normalizePaymentPlan(input.planId);
      const createdAt = now().toISOString();
      const paymentExpiresAt = new Date(new Date(createdAt).getTime() + 10 * 60 * 1000).toISOString();
      localPaymentSequence += 1;
      const order: PortalPaymentOrder = {
        orderRef: stableRef("pay", [
          userRef,
          planId,
          input.clientTarget,
          input.channel,
          localPaymentSequence,
          createdAt
        ].join("|")),
        planId,
        planLabel: planLabel(planId),
        amountMinor: amountMinorForPlan(planId),
        channel: input.channel,
        currency: "CNY",
        status: "pending_payment",
        checkoutUrl: `https://pay.example.test/${planId}`,
        createdAt,
        paymentExpiresAt,
        safety: {
          noRawMerchantKey: true,
          noRawProviderPayload: true
        }
      };
      upsertLocalPaymentOrder(userRef, order);
      return {
        provider: "local-preview",
        order,
        safety: {
          noRawMerchantKey: true,
          noRawProviderPayload: true,
          noSubscriptionIssued: true
        }
      };
    },

    async startAuthenticatorEnrollment(input) {
      return startLocalAuthenticatorEnrollment(input.userRef);
    },

    async confirmAuthenticatorEnrollment(input) {
      const userRef = requiredText(input.userRef, "用户会话无效。");
      if (accountSecurity.get(userRef)?.authenticatorSecret) {
        throw portalError("此账户已绑定身份验证器。");
      }
      const enrollmentRef = requiredText(input.enrollmentRef, "身份验证器绑定会话无效。");
      const enrollment = authenticatorEnrollments.get(enrollmentRef);
      if (!enrollment || enrollment.userRef !== userRef) {
        throw portalError("身份验证器绑定会话无效。");
      }
      if (new Date(enrollment.expiresAt).getTime() <= now().getTime()) {
        authenticatorEnrollments.delete(enrollmentRef);
        throw portalError("身份验证器绑定已过期，请重新扫码。");
      }
      const verified = await verifyTotpCode({
        secret: enrollment.secret,
        code: requiredText(input.totpCode, "请输入 6 位动态码。"),
        now: now()
      });
      if (!verified) {
        throw portalError("动态验证码无效或已过期。");
      }
      authenticatorEnrollments.delete(enrollmentRef);
      accountSecurity.set(userRef, {
        ...(accountSecurity.get(userRef) ?? {}),
        authenticatorSecret: enrollment.secret
      });
      return {
        status: "bound_preview",
        userRef,
        method: "totp",
        boundAt: now().toISOString(),
        safety: {
          noAdminApi: true,
          noPublicAuthActivated: true,
          noProductionCredentialMutation: true,
          noRawSecretReturned: true
        }
      };
    },

    async enablePasskey(input) {
      const userRef = requiredText(input.userRef, "用户会话无效。");
      const passkeyRef = accountSecurity.get(userRef)?.passkeyRef ?? stableRef("passkey", `${userRef}|${now().toISOString()}`);
      accountSecurity.set(userRef, {
        ...(accountSecurity.get(userRef) ?? {}),
        passkeyEnabled: true,
        passkeyRef
      });
      return {
        status: "bound_preview",
        userRef,
        method: "passkey",
        boundAt: now().toISOString(),
        safety: {
          noAdminApi: true,
          noPublicAuthActivated: true,
          noProductionCredentialMutation: true
        }
      };
    },

    async exportPasskey(input) {
      const userRef = requiredText(input.userRef, "用户会话无效。");
      const exportedAt = now().toISOString();
      const passkeyRef = accountSecurity.get(userRef)?.passkeyRef ?? stableRef("passkey", `${userRef}|${exportedAt}`);
      accountSecurity.set(userRef, {
        ...(accountSecurity.get(userRef) ?? {}),
        passkeyEnabled: true,
        passkeyExported: true,
        passkeyRef
      });
      return {
        status: "exported_preview",
        userRef,
        method: "passkey",
        fileName: `${userRef}-passkey-preview.json`,
        body: JSON.stringify({
          version: 1,
          type: "local-passkey-preview",
          issuer: "GCC Gateway Portal",
          userRef,
          passkeyRef,
          exportedAt,
          warning: "local preview only; not a WebAuthn private key"
        }, null, 2),
        exportedAt,
        safety: {
          noAdminApi: true,
          noPublicAuthActivated: true,
          noProductionCredentialMutation: true,
          noRawPrivateKeyReturned: true
        }
      };
    },

    async applyForSubscription(input) {
      if (!input.userRef.trim()) {
        throw portalError("用户会话无效。");
      }

      const issuedAt = now().toISOString();
      localSubscriptionSequence += 1;
      const requestOnly = input.requestOnly === true;
      const durationDays = normalizeOrderDurationDays(input.durationDays, durationDaysForPlan(input.planId));
      const quantity = normalizeOrderQuantity(input.quantity);
      const totalDurationDays = durationDays * quantity;
      const expiresAt = requestOnly ? "开通中" : expiresAtFromDays(now(), totalDurationDays);
      const requestRef = stableRef(
        "subreq",
        [
          input.userRef,
          input.planId,
          input.clientTarget,
          durationDays,
          quantity,
          localSubscriptionSequence,
          expiresAt,
          issuedAt
        ].join("|")
      );
      const subscriptionUrl = requestOnly ? undefined : options.demoSubscriptionUrl?.trim() || undefined;
      const subscriptionReady = !requestOnly && Boolean(subscriptionUrl);
      const historySummary: PortalHistoryRecord[] = [
        {
          recordRef: stableRef("history", `${requestRef}|open|${issuedAt}`),
          label: `申请${planLabel(input.planId)}（${subscriptionReady ? "已开通" : "待开通"}）`,
          status: subscriptionReady ? "已开通" : "待开通",
          occurredAt: issuedAt
        }
      ];

      const request: PortalSubscriptionRequest = {
        status: subscriptionReady ? "subscription_ready" : "ready_for_operator_review",
        lifecycle: subscriptionReady ? "active" : "pending",
        requestRef,
        userRef: input.userRef,
        planId: input.planId,
        clientTarget: input.clientTarget,
        expiresAt,
        durationDays,
        quantity,
        subscriptionUrl,
        nextAction: subscriptionReady ? "copy_subscription_url" : "operator_review_required",
        updatedAt: issuedAt,
        historySummary,
        safety: {
          noAdminApi: true,
          noDbMutation: true,
          noPaymentActivation: true,
          noPublicAdmin: true,
          noRawCustomerDataReturned: true
        }
      };
      const subscriptionRequests = upsertSubscriptionRequest(
        subscriptionRequestsFromState(currentState(input.userRef)),
        request
      );
      setState(input.userRef, {
        subscriptionRequest: request,
        subscriptionRequests,
        historySummary: historySummaryForRequests(subscriptionRequests),
        updatedAt: issuedAt
      });
      return request;
    },

    async submitSupportRequest(input) {
      const userRef = requiredText(input.userRef, "用户会话无效。");
      const message = normalizeSupportMessage(input.message);
      const submittedAt = now().toISOString();
      return {
        status: "submitted",
        supportRef: stableRef("psup", [
          userRef,
          input.category,
          input.clientTarget,
          message,
          submittedAt
        ].join("|")),
        userRef,
        category: input.category,
        clientTarget: input.clientTarget,
        subscriptionRequestRef: input.subscriptionRequestRef?.trim() || undefined,
        submittedAt,
        safety: {
          noAdminApi: true,
          noDbMutation: true,
          noPaymentActivation: true,
          noPublicAdmin: true,
          noRawMessageReturned: true
        }
      };
    },

    async revealSubscription(input) {
      if (!input.userRef.trim() || !input.requestRef.trim()) {
        throw portalError("用户会话无效。");
      }

      const existing = currentState(input.userRef);
      const current = subscriptionRequestsFromState(existing).find((request) => request.requestRef === input.requestRef)
        ?? existing.subscriptionRequest;
      if (!current || current.requestRef !== input.requestRef || current.lifecycle !== "active") {
        throw portalError("当前订单尚未开通，无法复制。");
      }

      const subscriptionUrl = current.subscriptionUrl ?? options.demoSubscriptionUrl?.trim();
      if (!subscriptionUrl) {
        throw portalError("当前订单尚未开通，无法复制。");
      }

      const revealed: PortalSubscriptionRequest = {
        ...current,
        status: "subscription_ready",
        lifecycle: "active",
        subscriptionUrl,
        nextAction: "copy_subscription_url"
      };
      const subscriptionRequests = upsertSubscriptionRequest(subscriptionRequestsFromState(existing), revealed);
      setState(input.userRef, {
        subscriptionRequest: revealed,
        subscriptionRequests,
        historySummary: historySummaryForRequests(subscriptionRequests),
        updatedAt: revealed.updatedAt ?? now().toISOString()
      });
      return revealed;
    },

    async refreshSubscription(input) {
      if (!input.userRef.trim() || !input.requestRef.trim()) {
        throw portalError("用户会话无效。");
      }

      const existing = currentState(input.userRef);
      const current = subscriptionRequestsFromState(existing).find((request) => request.requestRef === input.requestRef)
        ?? existing.subscriptionRequest;
      if (!current || current.requestRef !== input.requestRef || current.lifecycle !== "active") {
        throw portalError("当前订单尚未开通，无法刷新。");
      }

      const subscriptionUrl = current.subscriptionUrl ?? options.demoSubscriptionUrl?.trim();
      if (!subscriptionUrl) {
        throw portalError("当前订单尚未开通，无法刷新。");
      }

      const refreshedAt = now().toISOString();
      const event: PortalSubscriptionEvent = {
        type: "delivery_generation_reissued",
        occurredAt: refreshedAt
      };
      const historySummary: PortalHistoryRecord[] = [
        {
          recordRef: stableRef("history", `${current.requestRef}|refresh|${refreshedAt}`),
          label: "刷新订阅（已刷新）",
          status: "已刷新",
          occurredAt: refreshedAt
        },
        ...(existing.historySummary ?? [])
      ];
      const refreshed: PortalSubscriptionRequest = {
        status: "subscription_ready",
        lifecycle: "active",
        requestRef: input.requestRef,
        userRef: input.userRef,
        planId: current.planId,
        clientTarget: input.clientTarget,
        expiresAt: current.expiresAt,
        durationDays: current.durationDays,
        quantity: current.quantity,
        subscriptionUrl,
        usage: current.usage,
        nextAction: "copy_subscription_url",
        updatedAt: refreshedAt,
        event,
        historySummary,
        safety: {
          noAdminApi: true,
          noDbMutation: true,
          noPaymentActivation: true,
          noPublicAdmin: true,
          noRawCustomerDataReturned: true
        }
      };
      const subscriptionRequests = upsertSubscriptionRequest(subscriptionRequestsFromState(existing), refreshed);
      setState(input.userRef, {
        subscriptionRequest: refreshed,
        subscriptionRequests,
        historySummary,
        updatedAt: refreshedAt
      });
      return refreshed;
    },

    async resetSubscriptionLink(input) {
      const userRef = requiredText(input.userRef, "用户会话无效。");
      const requestRef = requiredText(input.requestRef, "申请记录无效。");
      const idempotencyKey = requiredText(input.idempotencyKey, "重置请求无效。");
      const operationKey = `${userRef}|${requestRef}|${idempotencyKey}`;
      const completed = subscriptionResetOperations.get(operationKey);
      if (completed) return completed;
      const existing = currentState(userRef);
      const current = subscriptionRequestsFromState(existing).find((request) => request.requestRef === requestRef);
      if (!current || current.lifecycle !== "active" || !current.subscriptionUrl) {
        throw portalError("当前订单尚未开通，无法重置订阅链接。");
      }
      const subscriptionUrl = new URL(current.subscriptionUrl);
      subscriptionUrl.searchParams.set("preview-reset", stableRef("reset", operationKey));
      const updatedAt = now().toISOString();
      const result: PortalSubscriptionRequest = {
        ...current,
        subscriptionUrl: subscriptionUrl.toString(),
        updatedAt,
        event: { type: "subscription_link_reset", occurredAt: updatedAt }
      };
      const subscriptionRequests = upsertSubscriptionRequest(subscriptionRequestsFromState(existing), result);
      setState(userRef, { ...existing, subscriptionRequest: result, subscriptionRequests, updatedAt });
      subscriptionResetOperations.set(operationKey, result);
      return result;
    },

    async disableSubscription(input) {
      if (!input.userRef.trim() || !input.requestRef.trim()) {
        throw portalError("用户会话无效。");
      }

      const existing = currentState(input.userRef);
      const current = subscriptionRequestsFromState(existing).find((request) => request.requestRef === input.requestRef)
        ?? existing.subscriptionRequest;
      if (!current || current.requestRef !== input.requestRef || current.lifecycle !== "active") {
        throw portalError("当前订单尚未开通，无法停用。");
      }

      const disabledAt = now().toISOString();
      const historySummary: PortalHistoryRecord[] = [
        {
          recordRef: stableRef("history", `${current.requestRef}|disable|${disabledAt}`),
          label: "停用订阅（已停用）",
          status: "已停用",
          occurredAt: disabledAt
        },
        ...(existing.historySummary ?? [])
      ];
      const disabled: PortalSubscriptionRequest = {
        status: "subscription_disabled",
        lifecycle: "disabled",
        requestRef: current.requestRef,
        userRef: input.userRef,
        planId: current.planId,
        clientTarget: current.clientTarget,
        expiresAt: current.expiresAt,
        durationDays: current.durationDays,
        quantity: current.quantity,
        usage: current.usage,
        nextAction: "subscription_disabled",
        updatedAt: disabledAt,
        historySummary,
        safety: {
          noAdminApi: true,
          noDbMutation: true,
          noPaymentActivation: true,
          noPublicAdmin: true,
          noRawCustomerDataReturned: true
        }
      };
      const subscriptionRequests = upsertSubscriptionRequest(subscriptionRequestsFromState(existing), disabled);
      setState(input.userRef, {
        subscriptionRequest: disabled,
        subscriptionRequests,
        historySummary,
        updatedAt: disabledAt
      });
      return disabled;
    }
  };
}
