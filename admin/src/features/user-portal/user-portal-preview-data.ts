import { PortalCouponClientError, type PortalCouponClient, type PortalCouponList } from "./coupons/coupon-client";
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
    { code: "WK7M-Q4RT-9HZC", kind: "percent", value: 1000, allSkus: true, skus: ALL, expiresAt: "2026-11-30T15:59:59.000Z",
      redeemedAt: "2026-10-10T02:00:00.000Z", status: "available", consumedAt: null, consumedOrderRef: null, consumedAmount: null },
    { code: "B8NP-3XVE-K2DA", kind: "fixed", value: 20, allSkus: false, skus: [SKUS.g500], expiresAt: "2026-12-31T15:59:59.000Z",
      redeemedAt: "2026-10-12T02:00:00.000Z", status: "available", consumedAt: null, consumedOrderRef: null, consumedAmount: null },
    { code: "F5HU-7GTY-MW3S", kind: "percent", value: 2000, allSkus: false, skus: [SKUS.g100, SKUS.g200], expiresAt: "2027-01-31T15:59:59.000Z",
      redeemedAt: "2026-10-13T02:00:00.000Z", status: "available", consumedAt: null, consumedOrderRef: null, consumedAmount: null },
    { code: "R6DJ-2PKN-ZX8Q", kind: "fixed", value: 5, allSkus: false, skus: [SKUS.g100], expiresAt: "2026-12-01T00:00:00.000Z",
      redeemedAt: "2026-09-20T02:00:00.000Z", status: "used", consumedAt: "2026-09-21T03:10:00.000Z", consumedOrderRef: "ord_preview_0921", consumedAmount: 5 },
    { code: "S9TC-4VAH-E7GM", kind: "percent", value: 1500, allSkus: true, skus: ALL, expiresAt: "2026-08-31T15:59:59.000Z",
      redeemedAt: "2026-07-01T02:00:00.000Z", status: "expired", consumedAt: null, consumedOrderRef: null, consumedAmount: null },
  ],
};

// Preview-only redeem: "PREV-IEW2-CODE" (any case/spacing) succeeds once; anything else fails generically.
export function createLocalPreviewCouponClient(): PortalCouponClient {
  const state = structuredClone(LOCAL_PREVIEW_COUPONS);
  let redeemed = false;
  return {
    async listCoupons() { return structuredClone(state); },
    async redeemCoupon({ code }) {
      if (redeemed || code.toUpperCase().replace(/[\s-]/g, "") !== "PREVIEW2CODE") {
        throw new PortalCouponClientError("redeem_failed");
      }
      redeemed = true;
      const coupon = { code: "PREV-IEW2-CODE", kind: "percent" as const, value: 500, allSkus: true, skus: ALL,
        expiresAt: "2026-12-31T15:59:59.000Z", redeemedAt: new Date().toISOString(), status: "available" as const,
        consumedAt: null, consumedOrderRef: null, consumedAmount: null };
      state.items.unshift(coupon);
      return structuredClone(coupon);
    },
  };
}
