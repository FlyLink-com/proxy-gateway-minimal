import { createPortalBrowserFetch } from "../portal-browser-session";

export type PortalCouponStatus = "available" | "used" | "expired";
export type PortalCouponSku = { skuId: string; sizeCode: string; durationDays: number };
// Buyers never see redeem codes after redemption; a coupon is identified by
// its server id and a short display ref (RC-XXXXXXXX).
export type PortalCoupon = {
  id: string;
  ref: string;
  kind: "percent" | "fixed";
  /** percent: basis points off (max 2000); fixed: Coins off (server caps at 20% of list price). */
  value: number;
  allSkus: boolean;
  skus: PortalCouponSku[];
  usableUntil: string;
  redeemedAt: string;
  status: PortalCouponStatus;
  consumedAt: string | null;
  consumedOrderRef: string | null;
  consumedAmount: number | null;
};
export type PortalCouponList = { asOf: string; items: PortalCoupon[] };
export type PortalResiSku = { id: string; sizeCode: string; quotaBytes: number; durationDays: number; listPrice: number };
export type PortalCheckoutOption = {
  id: string; ref: string; kind: "percent" | "fixed"; value: number; usableUntil: string;
  deduction: number; finalPrice: number; capped: boolean; best: boolean;
};
export type PortalCheckoutQuote = {
  skuId: string; sizeCode: string; purchasable: boolean; listPrice: number; deduction: number; finalPrice: number;
  coupon: { id: string; ref: string; kind: "percent" | "fixed"; value: number; capped: boolean } | null;
  selection: "auto" | "manual" | "none";
  options: PortalCheckoutOption[];
};
/** couponId: undefined = auto (best), null = no coupon, string = that coupon. */
export type PortalCheckoutSelection = string | null | undefined;
export type PortalCouponClient = {
  listCoupons(input: { sessionRef: string; signal?: AbortSignal }): Promise<PortalCouponList>;
  redeemCoupon(input: { sessionRef: string; code: string; signal?: AbortSignal }): Promise<PortalCoupon>;
  listSkus?(input: { sessionRef: string; signal?: AbortSignal }): Promise<PortalResiSku[]>;
  checkoutQuote?(input: { sessionRef: string; skuId: string; couponId: PortalCheckoutSelection; signal?: AbortSignal }): Promise<PortalCheckoutQuote>;
};

export type PortalCouponClientErrorCode =
  | "invalid_session" | "residential_relay_unavailable" | "not_found" | "redeem_failed" | "redeem_rate_limited"
  | "redeem_daily_limit" | "coupon_inactive" | "coupon_request_failed";

export class PortalCouponClientError extends Error {
  readonly code: PortalCouponClientErrorCode;
  constructor(code: PortalCouponClientErrorCode) {
    super("Portal coupon request failed.");
    this.name = "PortalCouponClientError";
    this.code = code;
  }
}

const MAX_RESPONSE_BYTES = 262_144;
const COUPON_ID = /^rrcpn_[0-9a-f]{32}$/u;
const SKU_ID = /^rrsku_[0-9a-f]{32}$/u;
const REF = /^RC-[0-9A-F]{8}$/u;
const STATUSES = new Set(["available", "used", "expired"]);

function fail(): never { throw new PortalCouponClientError("coupon_request_failed"); }
function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
function time(value: unknown, nullable: boolean): string | null {
  if (value === null && nullable) return null;
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value))) return fail();
  return value;
}
function count(value: unknown, nullable = false): number | null {
  if (value === null && nullable) return null;
  if (!Number.isSafeInteger(value) || (value as number) < 0) return fail();
  return value as number;
}

export function parsePortalCoupon(raw: unknown): PortalCoupon {
  if (!isObject(raw) || typeof raw.id !== "string" || !COUPON_ID.test(raw.id) || typeof raw.ref !== "string" || !REF.test(raw.ref)) return fail();
  // Defence in depth: a response that carries a redeem code is rejected.
  if ("code" in raw) return fail();
  if (raw.kind !== "percent" && raw.kind !== "fixed") return fail();
  const value = count(raw.value) as number;
  if (value < 1 || (raw.kind === "percent" && value > 2000)) return fail();
  if (typeof raw.allSkus !== "boolean" || !Array.isArray(raw.skus) || !STATUSES.has(raw.status as string)) return fail();
  const skus = raw.skus.map((sku): PortalCouponSku => {
    if (!isObject(sku) || typeof sku.skuId !== "string" || typeof sku.sizeCode !== "string") return fail();
    return { skuId: sku.skuId, sizeCode: sku.sizeCode, durationDays: count(sku.durationDays) as number };
  });
  return {
    id: raw.id, ref: raw.ref, kind: raw.kind, value, allSkus: raw.allSkus, skus,
    usableUntil: time(raw.usableUntil, false) as string, redeemedAt: time(raw.redeemedAt, false) as string,
    status: raw.status as PortalCouponStatus, consumedAt: time(raw.consumedAt, true),
    consumedOrderRef: raw.consumedOrderRef === null ? null : typeof raw.consumedOrderRef === "string" ? raw.consumedOrderRef : fail(),
    consumedAmount: count(raw.consumedAmount, true),
  };
}

export function parsePortalCouponList(body: unknown): PortalCouponList {
  if (!isObject(body) || !Array.isArray(body.items)) return fail();
  return { asOf: time(body.asOf, false) as string, items: body.items.map(parsePortalCoupon) };
}

function kindOf(value: unknown): "percent" | "fixed" {
  return value === "percent" || value === "fixed" ? value : fail();
}

export function parsePortalCheckoutQuote(raw: unknown): PortalCheckoutQuote {
  if (!isObject(raw) || typeof raw.skuId !== "string" || !SKU_ID.test(raw.skuId) || typeof raw.sizeCode !== "string") return fail();
  if (JSON.stringify(raw).includes('"code"')) return fail();
  if (raw.selection !== "auto" && raw.selection !== "manual" && raw.selection !== "none") return fail();
  if (!Array.isArray(raw.options)) return fail();
  const c = raw.coupon;
  const coupon = c === null ? null : isObject(c) && typeof c.id === "string" && COUPON_ID.test(c.id) && typeof c.ref === "string" && REF.test(c.ref)
    ? { id: c.id, ref: c.ref, kind: kindOf(c.kind), value: count(c.value) as number, capped: c.capped === true } : fail();
  return {
    skuId: raw.skuId, sizeCode: raw.sizeCode, purchasable: raw.purchasable === true,
    listPrice: count(raw.listPrice) as number, deduction: count(raw.deduction) as number, finalPrice: count(raw.finalPrice) as number,
    coupon, selection: raw.selection,
    options: raw.options.map((o): PortalCheckoutOption => {
      if (!isObject(o) || typeof o.id !== "string" || !COUPON_ID.test(o.id) || typeof o.ref !== "string" || !REF.test(o.ref)) return fail();
      return { id: o.id, ref: o.ref, kind: kindOf(o.kind), value: count(o.value) as number, usableUntil: time(o.usableUntil, false) as string,
        deduction: count(o.deduction) as number, finalPrice: count(o.finalPrice) as number, capped: o.capped === true, best: o.best === true };
    }),
  };
}

export function parsePortalResiSkus(raw: unknown): PortalResiSku[] {
  if (!isObject(raw) || !Array.isArray(raw.items)) return fail();
  return raw.items.map((s): PortalResiSku => {
    if (!isObject(s) || typeof s.id !== "string" || !SKU_ID.test(s.id) || typeof s.sizeCode !== "string") return fail();
    return { id: s.id, sizeCode: s.sizeCode, quotaBytes: count(s.quotaBytes) as number, durationDays: count(s.durationDays) as number,
      listPrice: count(s.listPrice) as number };
  });
}

export function createPortalCouponClient(options: { fetchFn?: typeof fetch } = {}): PortalCouponClient {
  const fetchFn = createPortalBrowserFetch(options.fetchFn ?? fetch);
  async function call(path: string, init: RequestInit, sessionRef: string): Promise<unknown> {
    let response: Response;
    const headers = new Headers({ "X-Portal-Session": sessionRef, Accept: "application/json" });
    if (init.body) headers.set("Content-Type", "application/json");
    try { response = await fetchFn(path, { ...init, headers }); } catch { return fail(); }
    const text = await response.text().catch(() => fail());
    if (text.length > MAX_RESPONSE_BYTES) return fail();
    let body: unknown = null;
    try { body = text ? JSON.parse(text) : null; } catch { body = null; }
    const error = isObject(body) && typeof body.error === "string" ? body.error : "";
    if (response.status === 404) throw new PortalCouponClientError("not_found");
    if (response.status === 401) throw new PortalCouponClientError("invalid_session");
    if (response.status === 429) throw new PortalCouponClientError(error === "redeem_daily_limit" ? "redeem_daily_limit" : "redeem_rate_limited");
    if (response.status === 409 && error === "coupon_inactive") throw new PortalCouponClientError("coupon_inactive");
    if (response.status === 503) throw new PortalCouponClientError("residential_relay_unavailable");
    if (response.status === 400 && error === "redeem_failed") throw new PortalCouponClientError("redeem_failed");
    if (response.status !== 200 || body === null) return fail();
    return body;
  }
  return {
    async listCoupons({ sessionRef, signal }) {
      return parsePortalCouponList(await call("/api/portal/residential-relay-packs/coupons", { method: "GET", signal }, sessionRef));
    },
    async redeemCoupon({ sessionRef, code, signal }) {
      const body = await call("/api/portal/residential-relay-packs/coupons/redeem",
        { method: "POST", body: JSON.stringify({ code: code.slice(0, 64) }), signal }, sessionRef);
      if (!isObject(body)) return fail();
      return parsePortalCoupon(body.coupon);
    },
    async listSkus({ sessionRef, signal }) {
      return parsePortalResiSkus(await call("/api/portal/residential-relay-packs/skus", { method: "GET", signal }, sessionRef));
    },
    async checkoutQuote({ sessionRef, skuId, couponId, signal }) {
      const body = JSON.stringify(couponId === undefined ? { skuId } : { skuId, couponId });
      return parsePortalCheckoutQuote(await call("/api/portal/residential-relay-packs/checkout/quote", { method: "POST", body, signal }, sessionRef));
    },
  };
}
