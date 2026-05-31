export type PortalAuthMode = "login" | "signup";
export type PortalPlanId = "trial" | "monthly" | "yearly";
export type PortalClientId = "clash" | "karing";
export type PortalSubscriptionStatus = "ready_for_operator_review" | "subscription_ready";
export type PortalSubscriptionLifecycle = "pending" | "active" | "expired";
export type PortalSubscriptionEvent = {
  type: "old_link_invalidated";
  occurredAt: string;
};

export type PortalHistoryRecord = {
  recordRef: string;
  label: string;
  status: "审核中" | "已授权" | "已刷新" | "已过期";
  occurredAt: string;
};

export type PortalSession = {
  status: "authenticated_preview";
  userRef: string;
  displayName: string;
  authMode: PortalAuthMode;
  registeredAt: string;
  safety: {
    noAdminApi: true;
    noPublicAuthActivated: true;
    noRawPasswordReturned: true;
  };
};

export type PortalAuthInput = {
  mode: PortalAuthMode;
  email: string;
  password: string;
  verificationCode?: string;
};

export type PortalContactInfo = {
  email: string;
  phone: string;
  telegram: string;
};

export type PortalApplySubscriptionInput = {
  userRef: string;
  displayName: string;
  email: string;
  contact: PortalContactInfo;
  planId: PortalPlanId;
  clientTarget: PortalClientId;
  requestOnly?: boolean;
};

export type PortalRefreshSubscriptionInput = {
  userRef: string;
  requestRef: string;
  clientTarget: PortalClientId;
};

export type PortalSubscriptionRequest = {
  status: PortalSubscriptionStatus;
  lifecycle: PortalSubscriptionLifecycle;
  requestRef: string;
  userRef: string;
  planId: PortalPlanId;
  clientTarget: PortalClientId;
  expiresAt: string;
  subscriptionUrl?: string;
  nextAction: "operator_review_required" | "copy_subscription_url";
  updatedAt?: string;
  event?: PortalSubscriptionEvent;
  historySummary?: PortalHistoryRecord[];
  safety: {
    noAdminApi: true;
    noDbMutation: true;
    noPaymentActivation: true;
    noPublicAdmin: true;
    noRawCustomerDataReturned: true;
  };
};

export type PortalUserState = {
  userRef: string;
  contactInfo: PortalContactInfo | null;
  subscriptionRequest: PortalSubscriptionRequest | null;
  historySummary?: PortalHistoryRecord[];
  updatedAt: string;
  safety: {
    noAdminApi: true;
    noPaymentActivation: true;
    noPublicAdmin: true;
  };
};

export type PortalUpdateContactInfoInput = {
  userRef: string;
  contact: PortalContactInfo;
};

export type PortalContactInfoUpdate = {
  userRef: string;
  contact: PortalContactInfo;
  updatedAt: string;
  safety: {
    noAdminApi: true;
    noPaymentActivation: true;
    noPublicAdmin: true;
  };
};

export type UserPortalClient = {
  authenticate(input: PortalAuthInput): Promise<PortalSession>;
  fetchCurrentState(input: { userRef: string }): Promise<PortalUserState>;
  updateContactInfo(input: PortalUpdateContactInfoInput): Promise<PortalContactInfoUpdate>;
  applyForSubscription(input: PortalApplySubscriptionInput): Promise<PortalSubscriptionRequest>;
  refreshSubscription(input: PortalRefreshSubscriptionInput): Promise<PortalSubscriptionRequest>;
};

export type LocalUserPortalClientOptions = {
  now?: () => Date;
  demoSubscriptionUrl?: string;
};

function portalError(message: string) {
  return new Error(message);
}

function normalizeEmail(email: string) {
  const normalized = email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
    throw portalError("请输入有效邮箱。");
  }
  return normalized;
}

function normalizeDisplayName(displayName: string, email: string) {
  const normalized = displayName.trim().replace(/\s+/g, " ");
  if (normalized) return normalized.slice(0, 80);
  return email.includes("@") ? email.split("@")[0] : "User";
}

function normalizePhone(phone: string) {
  const normalized = phone.trim().replace(/\s+/g, " ");
  if (!/^[+\d][\d ()-]{5,31}$/.test(normalized)) {
    throw portalError("请输入有效手机号。");
  }
  return normalized;
}

function normalizeTelegram(telegram: string) {
  const normalized = telegram.trim();
  if (!normalized || normalized.length > 64 || /\s/.test(normalized)) {
    throw portalError("请输入 Telegram 账号。");
  }
  if (normalized.startsWith("https://t.me/")) return normalized;
  return normalized.startsWith("@") ? normalized : `@${normalized}`;
}

function stableRef(prefix: string, value: string) {
  let hash = 2166136261;
  for (const char of value) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return `${prefix}_${(hash >>> 0).toString(36)}`;
}

function expiresAtFromDays(now: Date, days: number) {
  if (!Number.isInteger(days) || days <= 0 || days > 366) {
    throw portalError("有效期必须在 1 到 366 天之间。");
  }
  const date = new Date(now);
  date.setDate(date.getDate() + days);
  return date.toISOString();
}

function durationDaysForPlan(planId: PortalPlanId) {
  if (planId === "yearly") return 365;
  if (planId === "trial") return 7;
  return 30;
}

function planLabel(planId: PortalPlanId) {
  if (planId === "yearly") return "年卡";
  if (planId === "trial") return "7 天试用";
  return "月卡";
}

export function createLocalUserPortalClient(options: LocalUserPortalClientOptions = {}): UserPortalClient {
  const now = options.now ?? (() => new Date());
  const states = new Map<string, PortalUserState>();

  function emptyState(userRef: string): PortalUserState {
    return {
      userRef,
      contactInfo: null,
      subscriptionRequest: null,
      historySummary: [],
      updatedAt: now().toISOString(),
      safety: {
        noAdminApi: true,
        noPaymentActivation: true,
        noPublicAdmin: true
      }
    };
  }

  function currentState(userRef: string) {
    return states.get(userRef) ?? emptyState(userRef);
  }

  function setState(userRef: string, next: Omit<PortalUserState, "userRef" | "safety">) {
    const state: PortalUserState = {
      userRef,
      ...next,
      safety: {
        noAdminApi: true,
        noPaymentActivation: true,
        noPublicAdmin: true
      }
    };
    states.set(userRef, state);
    return state;
  }

  return {
    async authenticate(input) {
      const email = normalizeEmail(input.email);
      if (!input.password.trim()) {
        throw portalError("请输入密码。");
      }
      if (input.mode === "signup" && !input.verificationCode?.trim()) {
        throw portalError("请输入验证码。");
      }

      return {
        status: "authenticated_preview",
        userRef: stableRef("user", email),
        displayName: normalizeDisplayName("", email),
        authMode: input.mode,
        registeredAt: now().toISOString(),
        safety: {
          noAdminApi: true,
          noPublicAuthActivated: true,
          noRawPasswordReturned: true
        }
      };
    },

    async fetchCurrentState(input) {
      if (!input.userRef.trim()) {
        throw portalError("用户会话无效。");
      }
      return currentState(input.userRef);
    },

    async updateContactInfo(input) {
      if (!input.userRef.trim()) {
        throw portalError("用户会话无效。");
      }
      const contact: PortalContactInfo = {
        email: normalizeEmail(input.contact.email),
        phone: normalizePhone(input.contact.phone),
        telegram: normalizeTelegram(input.contact.telegram)
      };
      const existing = currentState(input.userRef);
      const updatedAt = now().toISOString();
      setState(input.userRef, {
        contactInfo: contact,
        subscriptionRequest: existing.subscriptionRequest,
        historySummary: existing.historySummary ?? [],
        updatedAt
      });
      return {
        userRef: input.userRef,
        contact,
        updatedAt,
        safety: {
          noAdminApi: true,
          noPaymentActivation: true,
          noPublicAdmin: true
        }
      };
    },

    async applyForSubscription(input) {
      const email = normalizeEmail(input.email);
      const contactEmail = normalizeEmail(input.contact.email);
      const contactPhone = normalizePhone(input.contact.phone);
      const contactTelegram = normalizeTelegram(input.contact.telegram);
      const displayName = normalizeDisplayName(input.displayName, email);
      if (!input.userRef.trim()) {
        throw portalError("用户会话无效。");
      }

      const issuedAt = now().toISOString();
      const requestOnly = input.requestOnly === true || input.planId === "trial";
      const expiresAt = requestOnly ? "待管理员发放" : expiresAtFromDays(now(), durationDaysForPlan(input.planId));
      const requestRef = stableRef(
        "subreq",
        [
          input.userRef,
          email,
          displayName,
          input.planId,
          input.clientTarget,
          expiresAt,
          contactEmail,
          contactPhone,
          contactTelegram,
          issuedAt
        ].join("|")
      );
      const subscriptionUrl = requestOnly ? undefined : options.demoSubscriptionUrl?.trim() || undefined;
      const historySummary: PortalHistoryRecord[] = [
        {
          recordRef: stableRef("history", `${requestRef}|open|${issuedAt}`),
          label: `申请${planLabel(input.planId)}（${subscriptionUrl ? "已授权" : "审核中"}）`,
          status: subscriptionUrl ? "已授权" : "审核中",
          occurredAt: issuedAt
        }
      ];

      const request: PortalSubscriptionRequest = {
        status: subscriptionUrl ? "subscription_ready" : "ready_for_operator_review",
        lifecycle: subscriptionUrl ? "active" : "pending",
        requestRef,
        userRef: input.userRef,
        planId: input.planId,
        clientTarget: input.clientTarget,
        expiresAt,
        subscriptionUrl,
        nextAction: subscriptionUrl ? "copy_subscription_url" : "operator_review_required",
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
      setState(input.userRef, {
        contactInfo: {
          email: contactEmail,
          phone: contactPhone,
          telegram: contactTelegram
        },
        subscriptionRequest: request,
        historySummary,
        updatedAt: issuedAt
      });
      return request;
    },

    async refreshSubscription(input) {
      if (!input.userRef.trim() || !input.requestRef.trim()) {
        throw portalError("用户会话无效。");
      }

      const existing = currentState(input.userRef);
      const current = existing.subscriptionRequest;
      if (!current || current.requestRef !== input.requestRef || current.lifecycle !== "active") {
        throw portalError("当前订阅尚未生效，无法刷新。");
      }

      const subscriptionUrl = options.demoSubscriptionUrl?.trim();
      if (!subscriptionUrl) {
        throw portalError("当前订阅尚未生效，无法刷新。");
      }

      const refreshedAt = now().toISOString();
      const event: PortalSubscriptionEvent = {
        type: "old_link_invalidated",
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
        subscriptionUrl,
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
      setState(input.userRef, {
        contactInfo: existing.contactInfo,
        subscriptionRequest: refreshed,
        historySummary,
        updatedAt: refreshedAt
      });
      return refreshed;
    }
  };
}
