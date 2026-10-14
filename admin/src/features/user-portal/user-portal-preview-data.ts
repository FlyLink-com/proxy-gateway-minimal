import type { PortalCouponClient, PortalCouponList } from "./coupons/coupon-client";
import type {
  PortalHumanVerificationChallenge,
  PortalInitialAccount
} from "./user-portal-types";

export function createLocalHumanVerificationChallenge(): PortalHumanVerificationChallenge {
  const left = 2 + Math.floor(Math.random() * 8);
  const right = 2 + Math.floor(Math.random() * 8);
  return {
    challengeId: `local-math-v1:${left}+${right}`,
    prompt: `${left} + ${right} = ?`,
    answer: String(left + right),
    safety: {
      noAdminApi: true,
      noPublicAdmin: true
    }
  };
}

export function createLocalPreviewInitialAccounts(count = 5): PortalInitialAccount[] {
  const knownRefs = [
    "user_safe_ref",
    "portal_user_001",
    "portal_user_002",
    "portal_user_003",
    "portal_user_004"
  ];
  return knownRefs.slice(0, Math.max(1, Math.min(count, knownRefs.length))).map((userRef, index) => ({
    userRef,
    displayName: index === 0 ? "user_safe_ref" : `Portal User ${String(index).padStart(3, "0")}`,
    issuedAt: "2026-06-03T00:00:00.000Z",
    requireSecuritySetup: true
  }));
}

export function previewPasswordForInitialAccount(account: PortalInitialAccount, index: number, fallbackPassword: string) {
  const explicitPassword = account.previewPassword?.trim();
  if (explicitPassword) return explicitPassword;
  if (index === 0) return fallbackPassword;
  return `${fallbackPassword}-${String(index).padStart(3, "0")}`;
}


// Fake coupons for the loopback-only local shell preview. Never used over HTTP.
const SKUS = {
  g100: { skuId: "rrsku_preview_100g", sizeCode: "100G", durationDays: 30 },
  g200: { skuId: "rrsku_preview_200g", sizeCode: "200G", durationDays: 30 },
  g500: { skuId: "rrsku_preview_500g", sizeCode: "500G", durationDays: 30 },
  t1: { skuId: "rrsku_preview_1tb", sizeCode: "1TB", durationDays: 30 },
};
const ALL = [SKUS.g100, SKUS.g200, SKUS.g500, SKUS.t1];

export const LOCAL_PREVIEW_COUPONS: PortalCouponList = {
  asOf: "2026-10-14T16:00:00.000Z",
  items: [
    { code: "WELCOME10", kind: "percent", value: 1000, allSkus: true, skus: ALL, startsAt: null, endsAt: "2026-11-30T15:59:59.000Z",
      remainingUses: 1, usedCount: 0, status: "available", reason: null, grantedAt: "2026-10-10T02:00:00.000Z" },
    { code: "BIGPACK20", kind: "fixed", value: 20, allSkus: false, skus: [SKUS.g500, SKUS.t1], startsAt: "2026-10-01T00:00:00.000Z",
      endsAt: "2026-12-31T15:59:59.000Z", remainingUses: 2, usedCount: 0, status: "available", reason: null, grantedAt: "2026-10-12T02:00:00.000Z" },
    { code: "WINTER15", kind: "percent", value: 1500, allSkus: false, skus: [SKUS.g100, SKUS.g200], startsAt: "2026-12-01T00:00:00.000Z",
      endsAt: null, remainingUses: null, usedCount: 0, status: "available", reason: "upcoming", grantedAt: "2026-10-13T02:00:00.000Z" },
    { code: "FIRST5", kind: "fixed", value: 5, allSkus: false, skus: [SKUS.g100], startsAt: null, endsAt: null,
      remainingUses: 0, usedCount: 1, status: "used", reason: null, grantedAt: "2026-09-20T02:00:00.000Z" },
    { code: "SUMMER25", kind: "percent", value: 2500, allSkus: true, skus: ALL, startsAt: "2026-07-01T00:00:00.000Z",
      endsAt: "2026-08-31T15:59:59.000Z", remainingUses: 1, usedCount: 0, status: "expired", reason: "ended", grantedAt: "2026-07-01T02:00:00.000Z" },
  ],
};

export function createLocalPreviewCouponClient(): PortalCouponClient {
  return { async listCoupons() { return structuredClone(LOCAL_PREVIEW_COUPONS); } };
}
