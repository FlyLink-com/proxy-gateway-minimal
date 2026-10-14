const ROOT = "/api/admin/residential-relay-packs";
const SKU_ID = /^rrsku_[0-9a-f]{32}$/;
const UPSTREAM_ID = /^rrup_[0-9a-f]{32}$/;
const REVISION = /^[0-9a-f]{64}$/;
const SIZES = new Set(["100G", "200G", "500G", "1TB"]);
const PROTOCOLS = new Set(["vless", "hysteria2"]);
const MAX_YAML = 64 * 1024;
const MAX_BODY = 2 * 1024 * 1024;
const MESSAGES = {
  session: "Admin session required.",
  permission: "Admin permission denied.",
  unavailable: "Residential relay pack management is unavailable.",
  network: "Residential relay pack request failed.",
  invalid: "Residential relay pack data is invalid.",
  not_found: "The requested SKU was not found.",
  revision_conflict: "The SKU changed. Reload it before saving.",
  no_enabled_upstream: "Enable at least one upstream before enabling this SKU.",
  upstream_enabled: "Pause this upstream before deleting it.",
  invalid_yaml: "The YAML input is invalid.",
  invalid_sku_size: "The pack size is invalid.",
  invalid_price: "The price must be a positive Coin amount.",
  invalid_duration: "The duration must be a positive day count.",
  invalid_quota: "The quota must be a positive byte count.",
  invalid_buyer_protocol: "Buyer protocol must be VLESS or Hy2.",
  upstream_limit: "This SKU already has the maximum number of upstreams.",
  sku_price_unset: "Set a price before enabling or quoting this SKU.",
  invalid_coupon: "The code definition is invalid.",
  coupon_not_found: "Code not found.",
  coupon_inactive: "Code is voided, consumed or expired.",
  coupon_not_applicable: "Code does not apply to this SKU.",
  coupon_not_voidable: "Only unredeemed codes can be voided."
} as const;

export type ResidentialRelayAdminErrorCode = keyof typeof MESSAGES;
export class ResidentialRelayAdminError extends Error {
  readonly code: ResidentialRelayAdminErrorCode;
  constructor(code: ResidentialRelayAdminErrorCode) {
    super(MESSAGES[code]);
    this.name = "ResidentialRelayAdminError";
    this.code = code;
  }
}

export type ResidentialRelayCouponStatus = "issued" | "redeemed" | "consumed" | "voided" | "expired";
export type ResidentialRelayCoupon = {
  id: string; code: string; batchId: string; kind: "percent" | "fixed"; value: number; allSkus: boolean;
  skus: Array<{ skuId: string; sizeCode: string }>; status: ResidentialRelayCouponStatus;
  issuedAt: string; issuedBy: string; expiresAt: string; voidedAt: string | null; voidedBy: string | null;
  redeemedBy: string | null; redeemedAt: string | null; consumedBy: string | null; consumedOrderRef: string | null;
  consumedAmount: number | null; consumedAt: string | null;
};
export type ResidentialRelayCoupons = { asOf: string; items: ResidentialRelayCoupon[] };
export type ResidentialRelayCouponGenerate = {
  count: number; kind: "percent" | "fixed"; value: number; allSkus: boolean; skuIds: string[]; expiresAt: string;
};
export type ResidentialRelayQuote = {
  skuId: string; sizeCode: string; purchasable: boolean; listPrice: number; deduction: number; finalPrice: number;
  coupon: { code: string | null; kind: string; value: number; applied: boolean; capped: boolean } | null;
};
export type ResidentialRelaySku = {
  configured: boolean; id: string | null; sizeCode: string; buyerProtocol: string | null;
  quotaBytes: number; durationDays: number | null; baseCoinUnits: number | null; enabled: boolean;
  upstreamCount: number; enabledUpstreamCount: number; purchasable: boolean;
  terms: { refunds: false; unusedByteRollover: false; renewals: false; autoRenew: false; gracePeriod: false };
};
export type ResidentialRelayUpstream = { id: string; displayName: string; countryCode: string; protocol: string; enabled: boolean };
export type ResidentialRelaySnapshot = { sku: ResidentialRelaySku & { id: string; configured?: true }; revision: string; items: ResidentialRelayUpstream[] };
export type ResidentialRelaySkuSave = {
  sizeCode: string; buyerProtocol: string; durationDays: number; quotaBytes: number; baseCoinUnits: number | null;
  enabled?: boolean; revision?: string;
};

function fail(code: ResidentialRelayAdminErrorCode = "invalid"): never { throw new ResidentialRelayAdminError(code); }
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail();
  return value as Record<string, unknown>;
}
function bool(value: unknown): boolean { if (typeof value !== "boolean") fail(); return value; }
function int(value: unknown, code: ResidentialRelayAdminErrorCode = "invalid"): number {
  if (!Number.isSafeInteger(value) || (value as number) <= 0) fail(code);
  return value as number;
}
function mapError(status: number, code: string): ResidentialRelayAdminErrorCode {
  if (status === 401) return "session";
  if (status === 403) return "permission";
  if (status === 503) return "unavailable";
  if (code in MESSAGES) return code as ResidentialRelayAdminErrorCode;
  return "invalid";
}

function sku(value: unknown, requireId = false): ResidentialRelaySku {
  const row = object(value);
  const sizeCode = String(row.sizeCode ?? "");
  if (!SIZES.has(sizeCode)) fail();
  const id = row.id;
  if (requireId && (typeof id !== "string" || !SKU_ID.test(id))) fail();
  if (id !== null && id !== undefined && typeof id === "string" && !SKU_ID.test(id)) fail();
  const buyer = row.buyerProtocol;
  if (buyer !== null && buyer !== undefined && !PROTOCOLS.has(String(buyer))) fail("invalid_buyer_protocol");
  const terms = object(row.terms);
  for (const key of ["refunds", "unusedByteRollover", "renewals", "autoRenew", "gracePeriod"] as const) {
    if (terms[key] !== false) fail();
  }
  return {
    configured: bool(row.configured ?? true), id: (id as string | null) ?? null, sizeCode,
    buyerProtocol: (buyer as string | null) ?? null, quotaBytes: int(row.quotaBytes, "invalid_quota"),
    durationDays: row.durationDays === null || row.durationDays === undefined ? null : int(row.durationDays, "invalid_duration"),
    baseCoinUnits: row.baseCoinUnits === null || row.baseCoinUnits === undefined ? null : int(row.baseCoinUnits, "invalid_price"),
    enabled: bool(row.enabled), upstreamCount: Number(row.upstreamCount) || 0,
    enabledUpstreamCount: Number(row.enabledUpstreamCount) || 0, purchasable: bool(row.purchasable),
    terms: { refunds: false, unusedByteRollover: false, renewals: false, autoRenew: false, gracePeriod: false }
  };
}

const COUPON_ID = /^rrcpn_[0-9a-f]{32}$/;
const STATUSES = new Set(["issued", "redeemed", "consumed", "voided", "expired"]);
const str = (v: unknown) => (typeof v === "string" ? v : fail());
const strOrNull = (v: unknown) => (v === null || v === undefined ? null : str(v));
function coupons(value: unknown): ResidentialRelayCoupons {
  const row = object(value);
  if (typeof row.asOf !== "string" || !Array.isArray(row.items)) fail();
  return { asOf: row.asOf, items: row.items.map((item) => {
    const c = object(item);
    if (typeof c.id !== "string" || !COUPON_ID.test(c.id) || typeof c.code !== "string" || !Array.isArray(c.skus)) fail();
    if ((c.kind !== "percent" && c.kind !== "fixed") || !STATUSES.has(String(c.status))) fail();
    return {
      id: c.id, code: c.code, batchId: str(c.batchId), kind: c.kind, value: int(c.value), allSkus: bool(c.allSkus),
      skus: c.skus.map((sku) => { const s = object(sku); return { skuId: str(s.skuId), sizeCode: str(s.sizeCode) }; }),
      status: c.status as ResidentialRelayCouponStatus, issuedAt: str(c.issuedAt), issuedBy: str(c.issuedBy),
      expiresAt: str(c.expiresAt), voidedAt: strOrNull(c.voidedAt), voidedBy: strOrNull(c.voidedBy),
      redeemedBy: strOrNull(c.redeemedBy), redeemedAt: strOrNull(c.redeemedAt), consumedBy: strOrNull(c.consumedBy),
      consumedOrderRef: strOrNull(c.consumedOrderRef),
      consumedAmount: c.consumedAmount === null || c.consumedAmount === undefined ? null : Number(c.consumedAmount),
      consumedAt: strOrNull(c.consumedAt),
    };
  }) };
}

function snapshot(value: unknown): ResidentialRelaySnapshot {
  const row = object(value);
  if (typeof row.revision !== "string" || !REVISION.test(row.revision) || !Array.isArray(row.items)) fail();
  const items = row.items.map((item) => {
    const node = object(item);
    if (typeof node.id !== "string" || !UPSTREAM_ID.test(node.id)) fail();
    return { id: node.id, displayName: String(node.displayName ?? ""), countryCode: String(node.countryCode ?? ""),
      protocol: String(node.protocol ?? ""), enabled: bool(node.enabled) };
  });
  const view = sku(row.sku, true);
  return { sku: { ...view, id: view.id as string, configured: true }, revision: row.revision, items };
}

async function request(path: string, init: RequestInit = {}, signal?: AbortSignal) {
  let response: Response;
  try { response = await fetch(`${ROOT}${path}`, { ...init, signal, headers: { "content-type": "application/json", ...(init.headers || {}) } }); }
  catch { fail("network"); }
  const text = await response.text();
  if (text.length > MAX_BODY) fail();
  let body: unknown = null;
  try { body = text ? JSON.parse(text) : null; } catch { fail(); }
  if (!response.ok) {
    const code = typeof (body as { error?: string } | null)?.error === "string" ? (body as { error: string }).error : "";
    fail(mapError(response.status, code));
  }
  return body;
}

export function createResidentialRelayAdminClient() {
  return {
    async listSkus(signal?: AbortSignal) {
      const body = object(await request("/skus", {}, signal));
      if (!Array.isArray(body.skus)) fail();
      return body.skus.map((item) => sku(item));
    },
    async saveSku(input: ResidentialRelaySkuSave, signal?: AbortSignal) {
      if (!SIZES.has(input.sizeCode) || !PROTOCOLS.has(input.buyerProtocol)) fail("invalid_sku_size");
      if (new TextEncoder().encode(JSON.stringify(input)).length > MAX_BODY) fail();
      return snapshot(await request("/skus", { method: "PUT", body: JSON.stringify(input) }, signal));
    },
    async getSku(id: string, signal?: AbortSignal) {
      if (!SKU_ID.test(id)) fail();
      return snapshot(await request(`/skus/${id}`, {}, signal));
    },
    async setSkuEnabled(id: string, revision: string, enabled: boolean, signal?: AbortSignal) {
      if (!SKU_ID.test(id) || !REVISION.test(revision)) fail();
      return snapshot(await request(`/skus/${id}/enabled`, { method: "PATCH", body: JSON.stringify({ revision, enabled }) }, signal));
    },
    async importUpstreams(id: string, revision: string, yamlContent: string, signal?: AbortSignal) {
      if (!SKU_ID.test(id) || !REVISION.test(revision) || typeof yamlContent !== "string"
        || new TextEncoder().encode(yamlContent).length > MAX_YAML) fail("invalid_yaml");
      return snapshot(await request(`/skus/${id}/upstreams/import`, {
        method: "POST", body: JSON.stringify({ revision, yamlContent })
      }, signal));
    },
    async setUpstreamsEnabled(id: string, revision: string, upstreamIds: string[], enabled: boolean, signal?: AbortSignal) {
      if (!SKU_ID.test(id) || !REVISION.test(revision) || !upstreamIds.every((item) => UPSTREAM_ID.test(item))) fail();
      return snapshot(await request(`/skus/${id}/upstreams/${enabled ? "enable" : "pause"}`, {
        method: "POST", body: JSON.stringify({ revision, upstreamIds })
      }, signal));
    },
    async listCoupons(signal?: AbortSignal) { return coupons(await request("/coupons", {}, signal)); },
    async generateCoupons(input: ResidentialRelayCouponGenerate, signal?: AbortSignal) {
      const out = object(await request("/coupons/generate", { method: "POST", body: JSON.stringify(input) }, signal));
      return coupons({ asOf: new Date().toISOString(), items: out.items });
    },
    async voidCoupons(couponIds: string[], signal?: AbortSignal) {
      if (!couponIds.every((item) => COUPON_ID.test(item))) fail();
      object(await request("/coupons/void", { method: "POST", body: JSON.stringify({ couponIds }) }, signal));
    },
    async quote(skuId: string, couponCode?: string, signal?: AbortSignal) {
      if (!SKU_ID.test(skuId)) fail();
      return object(await request("/quote", { method: "POST", body: JSON.stringify({ skuId, ...(couponCode ? { couponCode } : {}) }) }, signal)) as unknown as ResidentialRelayQuote;
    },
    async deleteUpstreams(id: string, revision: string, upstreamIds: string[], signal?: AbortSignal) {
      if (!SKU_ID.test(id) || !REVISION.test(revision) || !upstreamIds.every((item) => UPSTREAM_ID.test(item))) fail();
      return snapshot(await request(`/skus/${id}/upstreams/delete`, {
        method: "POST", body: JSON.stringify({ revision, upstreamIds })
      }, signal));
    }
  };
}

export type ResidentialRelayAdminClient = ReturnType<typeof createResidentialRelayAdminClient>;
