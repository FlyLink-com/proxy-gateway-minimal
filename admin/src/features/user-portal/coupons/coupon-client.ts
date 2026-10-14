import { createPortalBrowserFetch } from "../portal-browser-session";

export type PortalCouponStatus = "available" | "used" | "expired";
export type PortalCouponSku = { skuId: string; sizeCode: string; durationDays: number };
export type PortalCoupon = {
  code: string;
  kind: "percent" | "fixed";
  /** percent: basis points off (max 2000); fixed: Coins off (server caps at 20% of list price). */
  value: number;
  allSkus: boolean;
  skus: PortalCouponSku[];
  expiresAt: string;
  redeemedAt: string;
  status: PortalCouponStatus;
  consumedAt: string | null;
  consumedOrderRef: string | null;
  consumedAmount: number | null;
};
export type PortalCouponList = { asOf: string; items: PortalCoupon[] };
export type PortalCouponClient = {
  listCoupons(input: { sessionRef: string; signal?: AbortSignal }): Promise<PortalCouponList>;
  redeemCoupon(input: { sessionRef: string; code: string; signal?: AbortSignal }): Promise<PortalCoupon>;
};

export type PortalCouponClientErrorCode =
  | "invalid_session" | "residential_relay_unavailable" | "not_found" | "redeem_failed" | "redeem_rate_limited"
  | "coupon_request_failed";

export class PortalCouponClientError extends Error {
  readonly code: PortalCouponClientErrorCode;
  constructor(code: PortalCouponClientErrorCode) {
    super("Portal coupon request failed.");
    this.name = "PortalCouponClientError";
    this.code = code;
  }
}

const MAX_RESPONSE_BYTES = 262_144;
const CODE = /^[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/u;
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
  if (!isObject(raw) || typeof raw.code !== "string" || !CODE.test(raw.code)) return fail();
  if (raw.kind !== "percent" && raw.kind !== "fixed") return fail();
  const value = count(raw.value) as number;
  if (value < 1 || (raw.kind === "percent" && value > 2000)) return fail();
  if (typeof raw.allSkus !== "boolean" || !Array.isArray(raw.skus) || !STATUSES.has(raw.status as string)) return fail();
  const skus = raw.skus.map((sku): PortalCouponSku => {
    if (!isObject(sku) || typeof sku.skuId !== "string" || typeof sku.sizeCode !== "string") return fail();
    return { skuId: sku.skuId, sizeCode: sku.sizeCode, durationDays: count(sku.durationDays) as number };
  });
  return {
    code: raw.code, kind: raw.kind, value, allSkus: raw.allSkus, skus,
    expiresAt: time(raw.expiresAt, false) as string, redeemedAt: time(raw.redeemedAt, false) as string,
    status: raw.status as PortalCouponStatus, consumedAt: time(raw.consumedAt, true),
    consumedOrderRef: raw.consumedOrderRef === null ? null : typeof raw.consumedOrderRef === "string" ? raw.consumedOrderRef : fail(),
    consumedAmount: count(raw.consumedAmount, true),
  };
}

export function parsePortalCouponList(body: unknown): PortalCouponList {
  if (!isObject(body) || !Array.isArray(body.items)) return fail();
  return { asOf: time(body.asOf, false) as string, items: body.items.map(parsePortalCoupon) };
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
    if (response.status === 429) throw new PortalCouponClientError("redeem_rate_limited");
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
  };
}
