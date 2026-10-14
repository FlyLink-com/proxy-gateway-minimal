import {
  PortalCouponClientError, type PortalCheckoutOption, type PortalCouponClient, type PortalCouponList, type PortalResiSku
} from "./coupons/coupon-client";
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
const sid = (n: number) => `rrsku_${String(n).repeat(32)}`;
const cid = (n: number) => `rrcpn_${String(n).repeat(32)}`;
const SKUS = {
  g100: { skuId: sid(1), sizeCode: "100G", durationDays: 30 },
  g200: { skuId: sid(2), sizeCode: "200G", durationDays: 30 },
  g500: { skuId: sid(3), sizeCode: "500G", durationDays: 30 },
  t1: { skuId: sid(4), sizeCode: "1TB", durationDays: 30 },
};
const ALL = [SKUS.g100, SKUS.g200, SKUS.g500, SKUS.t1];
const GiB = 1024 ** 3;
const PREVIEW_SKUS: PortalResiSku[] = [
  { id: SKUS.g100.skuId, sizeCode: "100G", quotaBytes: 100 * GiB, durationDays: 30, listPrice: 30 },
  { id: SKUS.g200.skuId, sizeCode: "200G", quotaBytes: 200 * GiB, durationDays: 30, listPrice: 50 },
  { id: SKUS.g500.skuId, sizeCode: "500G", quotaBytes: 500 * GiB, durationDays: 30, listPrice: 120 },
];
const none = { consumedAt: null, consumedOrderRef: null, consumedAmount: null };

export const LOCAL_PREVIEW_COUPONS: PortalCouponList = {
  asOf: "2026-10-14T16:00:00.000Z",
  items: [
    { id: cid(1), ref: "RC-11111111", kind: "percent", value: 1000, allSkus: true, skus: ALL, usableUntil: "2026-11-09T02:00:00.000Z",
      redeemedAt: "2026-10-10T02:00:00.000Z", status: "available", ...none },
    { id: cid(2), ref: "RC-22222222", kind: "fixed", value: 20, allSkus: false, skus: [SKUS.g500], usableUntil: "2026-11-11T02:00:00.000Z",
      redeemedAt: "2026-10-12T02:00:00.000Z", status: "available", ...none },
    { id: cid(3), ref: "RC-33333333", kind: "percent", value: 2000, allSkus: false, skus: [SKUS.g100, SKUS.g200], usableUntil: "2026-11-12T02:00:00.000Z",
      redeemedAt: "2026-10-13T02:00:00.000Z", status: "available", ...none },
    { id: cid(4), ref: "RC-44444444", kind: "fixed", value: 5, allSkus: false, skus: [SKUS.g100], usableUntil: "2026-10-20T02:00:00.000Z",
      redeemedAt: "2026-09-20T02:00:00.000Z", status: "used", consumedAt: "2026-09-21T03:10:00.000Z", consumedOrderRef: "ord_preview_0921", consumedAmount: 5 },
    { id: cid(5), ref: "RC-55555555", kind: "percent", value: 1500, allSkus: true, skus: ALL, usableUntil: "2026-07-31T02:00:00.000Z",
      redeemedAt: "2026-07-01T02:00:00.000Z", status: "expired", ...none },
  ],
};

// Mirrors the server rule: percent half-up, capped at floor(20% of list), never below 0.
function previewPrice(listPrice: number, kind: "percent" | "fixed", value: number) {
  const raw = kind === "percent" ? Math.floor((listPrice * value + 5000) / 10000) : value;
  const deduction = Math.min(raw, Math.floor(listPrice * 0.2), listPrice);
  return { deduction, finalPrice: Math.max(0, listPrice - deduction), capped: deduction < raw };
}

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
      const coupon = { id: cid(6), ref: "RC-66666666", kind: "percent" as const, value: 500, allSkus: true, skus: ALL,
        usableUntil: new Date(Date.now() + 30 * 86_400_000).toISOString(), redeemedAt: new Date().toISOString(), status: "available" as const, ...none };
      state.items.unshift(coupon);
      return structuredClone(coupon);
    },
    async listSkus() { return structuredClone(PREVIEW_SKUS); },
    async checkoutQuote({ skuId, couponId }) {
      const sku = PREVIEW_SKUS.find(item => item.id === skuId);
      if (!sku) throw new PortalCouponClientError("not_found");
      const options: PortalCheckoutOption[] = state.items
        .filter(c => c.status === "available" && (c.allSkus || c.skus.some(s => s.skuId === skuId)))
        .map(c => ({ id: c.id, ref: c.ref, kind: c.kind, value: c.value, usableUntil: c.usableUntil, best: false, ...previewPrice(sku.listPrice, c.kind, c.value) }))
        .sort((a, b) => b.deduction - a.deduction || Date.parse(a.usableUntil) - Date.parse(b.usableUntil));
      if (options[0]) options[0].best = true;
      const chosen = couponId === undefined ? options[0] ?? null : couponId === null ? null : options.find(o => o.id === couponId);
      if (chosen === undefined) throw new PortalCouponClientError("coupon_inactive");
      return {
        skuId, sizeCode: sku.sizeCode, purchasable: true, listPrice: sku.listPrice,
        deduction: chosen?.deduction ?? 0, finalPrice: chosen?.finalPrice ?? sku.listPrice,
        coupon: chosen ? { id: chosen.id, ref: chosen.ref, kind: chosen.kind, value: chosen.value, capped: chosen.capped } : null,
        selection: couponId === undefined ? "auto" : couponId === null ? "none" : "manual", options,
      };
    },
  };
}
