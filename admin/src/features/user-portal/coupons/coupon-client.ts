import { createPortalBrowserFetch } from "../portal-browser-session";

export type PortalCouponStatus = "available" | "used" | "expired";
export type PortalCouponReason = "upcoming" | "ended" | "paused" | "exhausted" | null;
export type PortalCouponSku = { skuId: string; sizeCode: string; durationDays: number };
export type PortalCoupon = {
  code: string;
  kind: "percent" | "fixed";
  /** percent: basis points off; fixed: Coins off. */
  value: number;
  allSkus: boolean;
  skus: PortalCouponSku[];
  startsAt: string | null;
  endsAt: string | null;
  /** null = unlimited. */
  remainingUses: number | null;
  usedCount: number;
  status: PortalCouponStatus;
  reason: PortalCouponReason;
  grantedAt: string;
};
export type PortalCouponList = { asOf: string; items: PortalCoupon[] };
export type PortalCouponClient = {
  listCoupons(input: { sessionRef: string; signal?: AbortSignal }): Promise<PortalCouponList>;
};

export type PortalCouponClientErrorCode =
  | "invalid_session" | "residential_relay_unavailable" | "not_found" | "coupon_request_failed";

export class PortalCouponClientError extends Error {
  readonly code: PortalCouponClientErrorCode;
  constructor(code: PortalCouponClientErrorCode) {
    super("Portal coupon request failed.");
    this.name = "PortalCouponClientError";
    this.code = code;
  }
}

const MAX_RESPONSE_BYTES = 262_144;
const CODE = /^[A-Z0-9][A-Z0-9_-]{2,31}$/u;
const STATUSES = new Set(["available", "used", "expired"]);
const REASONS = new Set(["upcoming", "ended", "paused", "exhausted", null]);

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

export function parsePortalCouponList(body: unknown): PortalCouponList {
  if (!isObject(body) || !Array.isArray(body.items)) return fail();
  const items = body.items.map((raw): PortalCoupon => {
    if (!isObject(raw) || typeof raw.code !== "string" || !CODE.test(raw.code)) return fail();
    if (raw.kind !== "percent" && raw.kind !== "fixed") return fail();
    const value = count(raw.value) as number;
    if (value < 1 || (raw.kind === "percent" && value > 10000)) return fail();
    if (typeof raw.allSkus !== "boolean" || !Array.isArray(raw.skus)) return fail();
    if (!STATUSES.has(raw.status as string) || !REASONS.has(raw.reason as never)) return fail();
    const skus = raw.skus.map((sku): PortalCouponSku => {
      if (!isObject(sku) || typeof sku.skuId !== "string" || typeof sku.sizeCode !== "string") return fail();
      return { skuId: sku.skuId, sizeCode: sku.sizeCode, durationDays: count(sku.durationDays) as number };
    });
    return {
      code: raw.code, kind: raw.kind, value, allSkus: raw.allSkus, skus,
      startsAt: time(raw.startsAt, true), endsAt: time(raw.endsAt, true),
      remainingUses: count(raw.remainingUses, true), usedCount: count(raw.usedCount) as number,
      status: raw.status as PortalCouponStatus, reason: raw.reason as PortalCouponReason,
      grantedAt: time(raw.grantedAt, false) as string,
    };
  });
  return { asOf: time(body.asOf, false) as string, items };
}

export function createPortalCouponClient(options: { fetchFn?: typeof fetch } = {}): PortalCouponClient {
  const fetchFn = createPortalBrowserFetch(options.fetchFn ?? fetch);
  return {
    async listCoupons({ sessionRef, signal }) {
      let response: Response;
      try {
        response = await fetchFn("/api/portal/residential-relay-packs/coupons", {
          method: "GET", signal,
          headers: new Headers({ "X-Portal-Session": sessionRef, Accept: "application/json" }),
        });
      } catch { return fail(); }
      const text = await response.text().catch(() => fail());
      if (text.length > MAX_RESPONSE_BYTES) return fail();
      if (response.status === 404) throw new PortalCouponClientError("not_found");
      if (response.status === 401) throw new PortalCouponClientError("invalid_session");
      if (response.status === 503) throw new PortalCouponClientError("residential_relay_unavailable");
      if (response.status !== 200) return fail();
      let body: unknown;
      try { body = JSON.parse(text); } catch { return fail(); }
      return parsePortalCouponList(body);
    },
  };
}
