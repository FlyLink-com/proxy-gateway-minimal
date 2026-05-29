export type PortalAuthMode = "login" | "signup";
export type PortalPlanId = "starter" | "professional" | "team";
export type PortalClientId = "clash" | "mihomo" | "karing";
export type PortalSubscriptionStatus = "ready_for_operator_review" | "subscription_ready";

export type PortalSession = {
  status: "authenticated_preview";
  userRef: string;
  displayName: string;
  authMode: PortalAuthMode;
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

export type PortalSubscriptionRequestInput = {
  userRef: string;
  displayName: string;
  email: string;
  planId: PortalPlanId;
  clientTarget: PortalClientId;
  durationDays: number;
};

export type PortalSubscriptionRequest = {
  status: PortalSubscriptionStatus;
  requestRef: string;
  userRef: string;
  planId: PortalPlanId;
  clientTarget: PortalClientId;
  expiresAt: string;
  subscriptionUrl?: string;
  nextAction: "operator_review_required" | "copy_subscription_url";
  safety: {
    noAdminApi: true;
    noDbMutation: true;
    noPaymentActivation: true;
    noPublicAdmin: true;
    noRawCustomerDataReturned: true;
  };
};

export type UserPortalClient = {
  authenticate(input: PortalAuthInput): Promise<PortalSession>;
  requestSubscription(input: PortalSubscriptionRequestInput): Promise<PortalSubscriptionRequest>;
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

export function createLocalUserPortalClient(options: LocalUserPortalClientOptions = {}): UserPortalClient {
  const now = options.now ?? (() => new Date());

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
        safety: {
          noAdminApi: true,
          noPublicAuthActivated: true,
          noRawPasswordReturned: true
        }
      };
    },

    async requestSubscription(input) {
      const email = normalizeEmail(input.email);
      const displayName = normalizeDisplayName(input.displayName, email);
      if (!input.userRef.trim()) {
        throw portalError("用户会话无效。");
      }

      const expiresAt = expiresAtFromDays(now(), input.durationDays);
      const requestRef = stableRef(
        "subreq",
        `${input.userRef}|${email}|${displayName}|${input.planId}|${input.clientTarget}|${expiresAt}`
      );
      const subscriptionUrl = options.demoSubscriptionUrl?.trim() || undefined;

      return {
        status: subscriptionUrl ? "subscription_ready" : "ready_for_operator_review",
        requestRef,
        userRef: input.userRef,
        planId: input.planId,
        clientTarget: input.clientTarget,
        expiresAt,
        subscriptionUrl,
        nextAction: subscriptionUrl ? "copy_subscription_url" : "operator_review_required",
        safety: {
          noAdminApi: true,
          noDbMutation: true,
          noPaymentActivation: true,
          noPublicAdmin: true,
          noRawCustomerDataReturned: true
        }
      };
    }
  };
}
