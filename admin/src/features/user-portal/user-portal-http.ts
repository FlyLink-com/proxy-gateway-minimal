import type {
  HttpUserPortalClientOptions,
  PortalAuthMode,
  PortalCurrentResource,
  PortalCurrentResourceSetupDelivery,
  PortalHumanVerificationInput,
  PortalSecondFactorKind,
  PortalSession,
  PortalUserSecurityState,
  UserPortalClient
} from "./user-portal-types";
import { createPortalBrowserFetch, readCookieSession, withPortalAuthLock } from "./portal-browser-session";
import {
  backendFactor,
  backendHumanVerification,
  createQrDataUri,
  historySummaryForRequests,
  legalAgreementProof,
  mapAccessRequest,
  mapAccountEntitlement,
  mapBackendHumanChallenge,
  mapPaymentOrder,
  mapRegistrationEmailVerification,
  mapRegistrationResult,
  mapSupportRequest,
  normalizePaymentPlan,
  normalizeSupportMessage,
  parsePortalCurrentResource,
  parsePortalCurrentResourceSetupDelivery,
  portalError,
  portalFactor,
  rechargeTrustedActionOrigins,
  registrationEmailVerificationProof,
  requiredEmail,
  requiredText,
  verifiedHuman
} from "./user-portal-parsers";
import {
  createPortalCommerceModelClient,
  createPortalCoinCommerceClient,
  createPortalWalletFirstCommerceClient,
  type PortalCoinCommerceClient,
  type PortalCommerceModelClient,
  type PortalWalletFirstCommerceClient
} from "./commerce";
import {
  createPortalWalletClient,
  type PortalWalletClient
} from "./wallet";
import {
  createPortalRechargeClient,
  type PortalRechargeClient
} from "./recharge";

function endpoint(baseUrl: string, path: string) {
  const normalized = baseUrl.trim().replace(/\/$/, "");
  return `${normalized}${path}`;
}

async function jsonRequest(fetchFn: typeof fetch, url: string, init: RequestInit = {}) {
  const path = new URL(url, typeof window === "undefined" ? "http://localhost" : window.location.origin).pathname;
  const bounded = new Set([
    "/api/portal/session", "/api/portal/password/session", "/api/portal/password/second-factor",
    "/api/portal/registration", "/api/portal/browser-session", "/api/portal/browser-session/logout"
  ]).has(path);
  const controller = bounded ? new AbortController() : null;
  const forwardAbort = () => controller?.abort(init.signal?.reason);
  if (init.signal?.aborted) forwardAbort();
  else init.signal?.addEventListener("abort", forwardAbort, { once: true });
  let timer: ReturnType<typeof setTimeout> | undefined;
  const request = async () => {
    const response = await fetchFn(url, {
      ...init,
      signal: controller?.signal ?? init.signal,
      headers: { "Content-Type": "application/json", ...(init.headers ?? {}) }
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw portalError(typeof body?.error === "string" ? body.error : "portal request failed");
    }
    return body;
  };
  try {
    if (!controller) return await request();
    // Abort the actual fetch and bound the complete headers/body read. A lost
    // authentication response is surfaced, never retried automatically.
    return await Promise.race([
      request(),
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => {
          const error = new Error("Portal request timed out.");
          controller.abort(error);
          reject(error);
        }, init.method === "GET" ? 15_000 : 30_000);
      })
    ]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
    init.signal?.removeEventListener("abort", forwardAbort);
  }
}

async function noContentRequest(
  fetchFn: typeof fetch,
  url: string,
  init: RequestInit = {},
  unexpectedNoContentResponseError: string
) {
  const response = await fetchFn(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init.headers ?? {})
    }
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw portalError(typeof body?.error === "string" ? body.error : "portal request failed");
  }
  if (response.status !== 204) {
    throw portalError(unexpectedNoContentResponseError);
  }
  if ((await response.text()).trim()) {
    throw portalError(unexpectedNoContentResponseError);
  }
}

function portalSessionHeaders(sessionRef: string | undefined) {
  return {
    "X-Portal-Session": requiredText(sessionRef, "用户会话无效。")
  };
}

function fallbackHttpSecurityState(): PortalUserSecurityState {
  return {
    authenticatorBound: false,
    initialAccount: false,
    passkeyEnabled: false,
    passkeyExported: false,
    setupRequired: false
  };
}

function mapSecurityState(raw: Record<string, unknown> | undefined): PortalUserSecurityState {
  return {
    authenticatorBound: raw?.authenticatorBound === true,
    initialAccount: raw?.initialAccount === true,
    passkeyEnabled: raw?.passkeyEnabled === true,
    passkeyExported: raw?.passkeyExported === true,
    setupRequired: raw?.setupRequired === true
  };
}

export function createHttpUserPortalClient(
  options: HttpUserPortalClientOptions = {}
): UserPortalClient & {
  commerce: PortalCoinCommerceClient;
  commerceModel: PortalCommerceModelClient;
  fetchCurrentResource: (input: { sessionRef: string }) => Promise<PortalCurrentResource>;
  createCurrentResourceSetup: (input: {
    sessionRef: string;
    idempotencyKey: string;
  }) => Promise<PortalCurrentResourceSetupDelivery>;
  acknowledgeCurrentResourceSetup: (input: {
    sessionRef: string;
    handoffRef: string;
  }) => Promise<void>;
  walletFirstCommerce: PortalWalletFirstCommerceClient;
  wallet: PortalWalletClient;
  recharge: PortalRechargeClient;
} {
  const baseUrl = options.baseUrl ?? "";
  const fetchFn = createPortalBrowserFetch(options.fetchFn ?? fetch);
  const now = options.now ?? (() => new Date());
  const rechargeActionOrigins = rechargeTrustedActionOrigins(options);

  async function createSession(
    accountId: string,
    code: string,
    mode: PortalAuthMode,
    humanVerification: PortalHumanVerificationInput
  ): Promise<PortalSession> {
    const sessionBody = await withPortalAuthLock(() => jsonRequest(fetchFn, endpoint(baseUrl, "/api/portal/session"), {
      method: "POST",
      body: JSON.stringify({ accountId, code, humanVerification })
    }));
    const session = sessionBody.session ?? {};
    return { ...readCookieSession(session), authMode: mode };
  }

  return {
    async restoreSession() {
      const body = await jsonRequest(fetchFn, endpoint(baseUrl, "/api/portal/browser-session"), { method: "GET" });
      if (!Object.hasOwn(body, "session")) throw portalError("Portal session is invalid.");
      return body.session === null ? null : readCookieSession(body.session);
    },
    async logout(input) {
      await withPortalAuthLock(async () => {
        const body = await jsonRequest(fetchFn, endpoint(baseUrl, "/api/portal/browser-session/logout"), {
          method: "POST", headers: portalSessionHeaders(input.sessionRef), body: "{}",
        });
        if (body.loggedOut !== true) throw portalError("Logout was not confirmed.");
      });
    },
    commerce: createPortalCoinCommerceClient({ fetchFn }),
    commerceModel: createPortalCommerceModelClient({ fetchFn }),
    walletFirstCommerce: createPortalWalletFirstCommerceClient({ fetchFn }),
    wallet: createPortalWalletClient({ fetchFn }),
    recharge: createPortalRechargeClient({
      baseUrl,
      fetchFn,
      trustedActionOriginsByAdapter: rechargeActionOrigins,
    }),
    async issueHumanChallenge(input = {}) {
      const body = await jsonRequest(fetchFn, endpoint(baseUrl, "/api/portal/human-challenges"), {
        method: "POST",
        body: JSON.stringify({ scope: input.scope ?? "portal_login" })
      });
      return mapBackendHumanChallenge(body.challenge ?? {}, now);
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
      const body = await jsonRequest(fetchFn, endpoint(baseUrl, "/api/portal/registration/email-verification"), {
        method: "POST",
        body: JSON.stringify({
          email: requiredEmail(input.email)
        })
      });
      return mapRegistrationEmailVerification(body);
    },

    async registerTrialAccount(input) {
      const emailVerification = registrationEmailVerificationProof(input.emailVerification);
      const legalAgreement = legalAgreementProof(input.legalAgreement);
      const body = await withPortalAuthLock(() => jsonRequest(fetchFn, endpoint(baseUrl, "/api/portal/registration"), {
        method: "POST",
        body: JSON.stringify({
          email: requiredEmail(input.email),
          password: requiredText(input.password, "请输入密码。"),
          legalAgreement,
          emailVerification
        })
      }));
      readCookieSession(body.session);
      return mapRegistrationResult(body);
    },

    async authenticate(input) {
      if (input.mode === "email") {
        verifiedHuman(input.humanVerification);
        requiredEmail(input.email);
        requiredText(input.verificationCode, "请输入邮箱验证码。");
        throw portalError("邮箱验证码登录尚未启用。");
      }
      if (input.mode === "authenticator") {
        return createSession(
          requiredText(input.accountId, "请输入电子邮箱。"),
          requiredText(input.totpCode, "请输入动态验证码。"),
          input.mode,
          verifiedHuman(input.humanVerification)
        );
      }
      if (input.mode === "password") {
        const accountId = requiredText(input.accountId, "请输入电子邮箱。");
        const body = await withPortalAuthLock(() => jsonRequest(fetchFn, endpoint(baseUrl, "/api/portal/password/session"), {
          method: "POST",
          body: JSON.stringify({
            accountId,
            password: requiredText(input.password, "请输入密码。"),
            rememberMe: input.rememberMe === true,
            humanVerification: backendHumanVerification(input.humanVerification)
          })
        }));
        if (body.challenge) {
          const factors = Array.isArray(body.challenge.availableFactors)
            ? body.challenge.availableFactors.map((factor: unknown) => portalFactor(String(factor))).filter(Boolean) as PortalSecondFactorKind[]
            : [];
          return {
            status: "second_factor_required",
            challengeRef: requiredText(body.challenge.challengeRef, "二次验证会话无效。"),
            userRef: requiredText(body.challenge.userRef ?? body.challenge.loginRef ?? accountId, "用户会话无效。"),
            displayName: String(body.challenge.displayName ?? body.challenge.userRef ?? body.challenge.loginRef ?? accountId),
            authMode: "password",
            availableFactors: factors,
            expiresInSeconds: Number(body.challenge.expiresInSeconds ?? 300),
            issuedAt: body.challenge.issuedAt ?? now().toISOString(),
            safety: {
              noAdminApi: true,
              noPublicAuthActivated: true,
              noSessionCreated: true
            }
          };
        }
        const session = body.session ?? {};
        return readCookieSession(session);
      }

      const humanVerification = verifiedHuman(input.humanVerification);
      const enrollmentBody = await jsonRequest(fetchFn, endpoint(baseUrl, "/api/portal/entry/enroll"), {
        method: "POST",
        body: JSON.stringify({
          entryToken: requiredText(input.entryToken, "开通链接无效，请重新打开邮件中的链接。"),
          encryptedTotpSecret: requiredText(input.encryptedTotpSecret, "请重新完成身份验证器设置。"),
          humanVerification
        })
      });
      const accountId = requiredText(enrollmentBody.enrollment?.accountId, "账号开通结果无效，请重新开始。");
      return createSession(accountId, requiredText(input.totpCode, "请输入动态验证码。"), input.mode, humanVerification);
    },

    async completeSecondFactor(input) {
      const body = await withPortalAuthLock(() => jsonRequest(fetchFn, endpoint(baseUrl, "/api/portal/password/second-factor"), {
        method: "POST",
        body: JSON.stringify({
          challengeRef: requiredText(input.challengeRef, "二次验证会话无效。"),
          factor: backendFactor(input.factor),
          ...(input.factor === "authenticator"
            ? { code: requiredText(input.totpCode, "请输入身份验证器验证码。") }
            : { passkeyProof: requiredText(input.passkeyProof, "通行密钥验证失败。") })
        })
      }));
      const session = body.session ?? {};
      return readCookieSession(session);
    },

    async fetchCurrentState(input) {
      if (!input.userRef.trim()) {
        throw portalError("用户会话无效。");
      }
      const query = new URLSearchParams({ portalUserRef: input.userRef });
      const body = await jsonRequest(fetchFn, endpoint(baseUrl, `/api/portal/access-requests/current?${query.toString()}`), {
        method: "GET",
        ...(input.sessionRef ? { headers: portalSessionHeaders(input.sessionRef) } : {})
      });
      const items = Array.isArray(body.items)
        ? body.items as Parameters<typeof mapAccessRequest>[0][]
        : [];
      const subscriptionRequests = items.map((item) => mapAccessRequest(item));
      const accountEntitlements = Array.isArray(body.accountEntitlements)
        ? (body.accountEntitlements as Record<string, unknown>[]).map((item) => mapAccountEntitlement(item))
        : [];
      const latest = subscriptionRequests[subscriptionRequests.length - 1] ?? null;
      const security = input.sessionRef
        ? mapSecurityState((await jsonRequest(fetchFn, endpoint(baseUrl, "/api/portal/security/current"), {
          method: "GET",
          headers: portalSessionHeaders(input.sessionRef)
        })).security)
        : fallbackHttpSecurityState();
      return {
        userRef: input.userRef,
        subscriptionRequest: latest,
        subscriptionRequests,
        accountEntitlements,
        historySummary: historySummaryForRequests(subscriptionRequests),
        security,
        updatedAt: latest?.updatedAt ?? now().toISOString(),
        safety: {
          noAdminApi: true,
          noPaymentActivation: true,
          noPublicAdmin: true
        }
      };
    },

    async fetchCurrentResource(input) {
      const body = await jsonRequest(fetchFn, endpoint(baseUrl, "/api/portal/resources/current"), {
        method: "GET",
        headers: portalSessionHeaders(input.sessionRef)
      });
      return parsePortalCurrentResource(body);
    },

    async createCurrentResourceSetup(input) {
      const idempotencyKey = requiredText(input.idempotencyKey, "配置请求无效。");
      const body = await jsonRequest(fetchFn, endpoint(baseUrl, "/api/portal/resources/current/setup"), {
        method: "POST",
        headers: portalSessionHeaders(input.sessionRef),
        body: JSON.stringify({ idempotencyKey })
      });
      return parsePortalCurrentResourceSetupDelivery(body);
    },

    async acknowledgeCurrentResourceSetup(input) {
      const handoffRef = requiredText(input.handoffRef, "配置确认无效。");
      await noContentRequest(fetchFn, endpoint(baseUrl, "/api/portal/resources/current/setup/ack"), {
        method: "POST",
        headers: portalSessionHeaders(input.sessionRef),
        body: JSON.stringify({ handoffRef })
      }, "配置确认结果无效。");
    },

    async fetchSecurityState(input) {
      const sessionRef = requiredText(input.sessionRef, "用户会话无效。");
      const body = await jsonRequest(fetchFn, endpoint(baseUrl, "/api/portal/security/current"), {
        method: "GET",
        headers: portalSessionHeaders(sessionRef)
      });
      return mapSecurityState(body.security);
    },

    async fetchPaymentOrders(input) {
      requiredText(input.userRef, "用户会话无效。");
      const query = new URLSearchParams();
      if (input.status) query.set("status", input.status);
      if (input.plan) query.set("plan", input.plan);
      const suffix = query.toString() ? `?${query.toString()}` : "";
      const body = await jsonRequest(fetchFn, endpoint(baseUrl, `/api/portal/payments/current${suffix}`), {
        method: "GET",
        headers: portalSessionHeaders(input.sessionRef)
      });
      const orders = Array.isArray(body.payments?.orders)
        ? body.payments.orders as Record<string, unknown>[]
        : [];
      return orders.map((order) => mapPaymentOrder(order));
    },

    async createPaymentCheckout(input) {
      requiredText(input.userRef, "用户会话无效。");
      const body = await jsonRequest(fetchFn, endpoint(baseUrl, "/api/portal/payments/checkout"), {
        method: "POST",
        headers: portalSessionHeaders(input.sessionRef),
        body: JSON.stringify({
          plan: normalizePaymentPlan(input.planId),
          clientTarget: input.clientTarget,
          channel: input.channel,
          device: input.device
        })
      });
      const checkout = body.checkout ?? {};
      return {
        provider: String(checkout.provider ?? "niuniu-pay"),
        order: mapPaymentOrder(checkout.order ?? {}),
        safety: {
          noRawMerchantKey: true,
          noRawProviderPayload: true,
          noSubscriptionIssued: true
        }
      };
    },

    async startAuthenticatorEnrollment(input) {
      const userRef = requiredText(input.userRef, "用户会话无效。");
      const body = await jsonRequest(fetchFn, endpoint(baseUrl, "/api/portal/security/totp/enrollment"), {
        method: "POST",
        headers: portalSessionHeaders(input.sessionRef),
        body: JSON.stringify({})
      });
      const enrollment = body.enrollment ?? {};
      const otpauthUri = requiredText(enrollment.otpauthUri, "身份验证器绑定结果无效。");
      return {
        status: "preview",
        enrollmentRef: requiredText(enrollment.enrollmentRef, "身份验证器绑定会话无效。"),
        userRef,
        issuer: requiredText(enrollment.issuer, "身份验证器绑定结果无效。"),
        accountLabel: String(enrollment.accountLabel ?? userRef),
        manualKey: requiredText(enrollment.manualKey, "身份验证器绑定结果无效。"),
        otpauthUri,
        qrDataUri: await createQrDataUri(otpauthUri),
        expiresInSeconds: Number(enrollment.expiresInSeconds ?? 300),
        issuedAt: enrollment.issuedAt ?? now().toISOString(),
        safety: {
          noAdminApi: true,
          noPublicAuthActivated: true,
          noProductionCredentialMutation: true
        }
      };
    },

    async confirmAuthenticatorEnrollment(input) {
      const userRef = requiredText(input.userRef, "用户会话无效。");
      const body = await jsonRequest(fetchFn, endpoint(baseUrl, "/api/portal/security/totp/enrollment/confirm"), {
        method: "POST",
        headers: portalSessionHeaders(input.sessionRef),
        body: JSON.stringify({
          enrollmentRef: requiredText(input.enrollmentRef, "身份验证器绑定会话无效。"),
          code: requiredText(input.totpCode, "请输入 6 位动态码。")
        })
      });
      const binding = body.binding ?? {};
      return {
        status: "bound_preview",
        userRef,
        method: "totp",
        boundAt: binding.boundAt ?? now().toISOString(),
        safety: {
          noAdminApi: true,
          noPublicAuthActivated: true,
          noProductionCredentialMutation: true,
          noRawSecretReturned: true
        }
      };
    },

    async enablePasskey(input) {
      requiredText(input.userRef, "用户会话无效。");
      throw portalError("通行密钥绑定尚未启用。");
    },

    async exportPasskey(input) {
      requiredText(input.userRef, "用户会话无效。");
      throw portalError("通行密钥导出尚未启用。");
    },

    async applyForSubscription(input) {
      const body = await jsonRequest(fetchFn, endpoint(baseUrl, "/api/portal/access-requests"), {
        method: "POST",
        headers: portalSessionHeaders(input.sessionRef),
        body: JSON.stringify({
          portalUserRef: requiredText(input.userRef, "用户会话无效。"),
          plan: input.planId,
          clientTarget: input.clientTarget,
          durationDays: input.durationDays,
          quantity: input.quantity
        })
      });
      return mapAccessRequest(body.request ?? {});
    },

    async submitSupportRequest(input) {
      const body = await jsonRequest(fetchFn, endpoint(baseUrl, "/api/portal/support-requests"), {
        method: "POST",
        headers: portalSessionHeaders(input.sessionRef),
        body: JSON.stringify({
          portalUserRef: requiredText(input.userRef, "用户会话无效。"),
          category: input.category,
          message: normalizeSupportMessage(input.message),
          clientTarget: input.clientTarget,
          subscriptionRequestRef: input.subscriptionRequestRef
        })
      });
      return mapSupportRequest(body.request ?? {});
    },

    async revealSubscription(input) {
      const body = await jsonRequest(fetchFn, endpoint(baseUrl, "/api/portal/access-requests/reveal"), {
        method: "POST",
        headers: portalSessionHeaders(input.sessionRef),
        body: JSON.stringify({
          portalUserRef: requiredText(input.userRef, "用户会话无效。"),
          requestRef: requiredText(input.requestRef, "申请记录无效。")
        })
      });
      return mapAccessRequest(body.request ?? {});
    },

    async refreshSubscription(input) {
      const body = await jsonRequest(fetchFn, endpoint(baseUrl, "/api/portal/access-requests/refresh"), {
        method: "POST",
        headers: portalSessionHeaders(input.sessionRef),
        body: JSON.stringify({
          portalUserRef: requiredText(input.userRef, "用户会话无效。"),
          requestRef: requiredText(input.requestRef, "申请记录无效。"),
          clientTarget: input.clientTarget
        })
      });
      return mapAccessRequest(body.request ?? {});
    },

    async disableSubscription(input) {
      const body = await jsonRequest(fetchFn, endpoint(baseUrl, "/api/portal/access-requests/disable"), {
        method: "POST",
        headers: portalSessionHeaders(input.sessionRef),
        body: JSON.stringify({
          portalUserRef: requiredText(input.userRef, "用户会话无效。"),
          requestRef: requiredText(input.requestRef, "申请记录无效。")
        })
      });
      return mapAccessRequest(body.request ?? {});
    }
  };
}
