import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ResidentialRelayAdminWorkspace } from "../features/residential-relay-packs/residential-relay-admin-workspace";
import type { ResidentialRelayAdminClient, ResidentialRelaySku, ResidentialRelaySnapshot } from "../features/residential-relay-packs/residential-relay-admin-client";
import { ResidentialRelayAdminError } from "../features/residential-relay-packs/residential-relay-admin-client";

const GiB = 1024 ** 3;
const TERMS = { refunds: false, unusedByteRollover: false, renewals: false, autoRenew: false, gracePeriod: false } as const;
const SKU_ID = `rrsku_${"a".repeat(32)}`;
const UP_A = `rrup_${"1".repeat(32)}`;
const UP_B = `rrup_${"2".repeat(32)}`;
const CPN = `rrcpn_${"c".repeat(32)}`;
const REV = (n: number) => String(n).repeat(64).slice(0, 64);

function sku(patch: Partial<ResidentialRelaySku> = {}): ResidentialRelaySku {
  return { configured: true, id: SKU_ID, sizeCode: "100G", buyerProtocol: "vless", quotaBytes: 100 * GiB,
    durationDays: 30, baseCoinUnits: 30, enabled: false, upstreamCount: 2, enabledUpstreamCount: 0,
    purchasable: false, discount: null, displayPrice: { listPrice: 30, discountedPrice: 30, discountActive: false }, terms: TERMS, ...patch };
}
function snap(patch: Partial<ResidentialRelaySku> = {}, items = [
  { id: UP_A, displayName: "US 1", countryCode: "US", protocol: "ss", enabled: false },
  { id: UP_B, displayName: "US 2", countryCode: "US", protocol: "ss", enabled: false }], rev = 1): ResidentialRelaySnapshot {
  return { sku: { ...sku(patch), id: SKU_ID, configured: true }, revision: REV(rev), items };
}
const others = ["200G", "500G", "1TB"].map((sizeCode) => sku({ configured: false, id: null, sizeCode, buyerProtocol: null,
  durationDays: null, baseCoinUnits: null, upstreamCount: 0 }));

function client(overrides: Partial<ResidentialRelayAdminClient> = {}): ResidentialRelayAdminClient {
  return {
    listSkus: vi.fn(async () => [sku(), ...others]),
    getSku: vi.fn(async () => snap()),
    saveSku: vi.fn(async () => snap()),
    setSkuEnabled: vi.fn(async () => snap()),
    importUpstreams: vi.fn(async () => snap()),
    setUpstreamsEnabled: vi.fn(async (_id, _rev, ids, enabled) => snap({ enabledUpstreamCount: enabled ? ids.length : 0 },
      [{ id: UP_A, displayName: "US 1", countryCode: "US", protocol: "ss", enabled: enabled && ids.includes(UP_A) },
        { id: UP_B, displayName: "US 2", countryCode: "US", protocol: "ss", enabled: enabled && ids.includes(UP_B) }], 2)),
    deleteUpstreams: vi.fn(async () => snap({}, [], 3)),
    setDiscount: vi.fn(async () => snap({ discount: { kind: "percent", value: 2000, startsAt: null, endsAt: null, enabled: true, active: true },
      displayPrice: { listPrice: 30, discountedPrice: 24, discountActive: true } }, undefined, 4)),
    clearDiscount: vi.fn(async () => snap()),
    listCoupons: vi.fn(async () => ({ revision: REV(5), items: [] })),
    createCoupon: vi.fn(async (_rev, input) => ({ revision: REV(6), items: [{ id: CPN, code: input.code, kind: input.kind, value: input.value,
      allSkus: input.allSkus, skuIds: input.skuIds, startsAt: null, endsAt: null, totalLimit: input.totalLimit ?? null,
      perUserLimit: input.perUserLimit ?? null, stackable: input.stackable, enabled: false, redemptionCount: 0 }] })),
    setCouponsEnabled: vi.fn(async () => ({ revision: REV(7), items: [] })),
    deleteCoupons: vi.fn(async () => ({ revision: REV(8), items: [] })),
    quote: vi.fn(async () => ({ skuId: SKU_ID, sizeCode: "100G", purchasable: true, listPrice: 30, priceAfterDiscount: 24,
      finalPrice: 19, stacked: true, discount: { kind: "percent", value: 2000, applied: true },
      coupon: { code: "SAVE5", kind: "fixed", value: 5, stackable: true, applied: true } })),
    ...overrides
  } as ResidentialRelayAdminClient;
}

describe("ResidentialRelayAdminWorkspace", () => {
  afterEach(() => cleanup());

  it("lists all four sizes and states the locked one-shot terms", async () => {
    render(<ResidentialRelayAdminWorkspace client={client()} />);
    for (const size of ["100G", "200G", "500G", "1TB"]) expect(await screen.findByRole("tab", { name: new RegExp(size) })).toBeTruthy();
    expect(screen.getByText(/不续费、不退款、不结转/)).toBeTruthy();
    expect(await screen.findByText("US 1")).toBeTruthy();
  });

  it("saves SKU price, duration, quota and buyer protocol", async () => {
    const c = client();
    render(<ResidentialRelayAdminWorkspace client={c} />);
    await screen.findByText("US 1");
    fireEvent.change(screen.getByLabelText("买家协议"), { target: { value: "hysteria2" } });
    fireEvent.change(screen.getByLabelText("时长（天）"), { target: { value: "14" } });
    fireEvent.change(screen.getByLabelText("额度（GB）"), { target: { value: "120" } });
    fireEvent.change(screen.getByLabelText("价格（Coins）"), { target: { value: "45" } });
    fireEvent.click(screen.getByRole("button", { name: "保存配置" }));
    await waitFor(() => expect(c.saveSku).toHaveBeenCalledWith({ sizeCode: "100G", buyerProtocol: "hysteria2", durationDays: 14,
      quotaBytes: 120 * GiB, baseCoinUnits: 45, enabled: undefined, revision: REV(1) }));
  });

  it("multi-select enables, and delete is blocked while any selected upstream is enabled", async () => {
    const c = client();
    render(<ResidentialRelayAdminWorkspace client={c} />);
    await screen.findByText("US 1");
    const upstreams = screen.getByRole("region", { name: "上游线路" });
    fireEvent.click(within(upstreams).getByLabelText("全选"));
    fireEvent.click(within(upstreams).getByRole("button", { name: /启用所选/ }));
    await waitFor(() => expect(c.setUpstreamsEnabled).toHaveBeenCalledWith(SKU_ID, REV(1), [UP_A, UP_B], true));
    await screen.findAllByText("已启用");
    fireEvent.click(screen.getByLabelText("选择 US 1"));
    expect((within(upstreams).getByRole("button", { name: /删除所选/ }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("saves a percent discount as basis points and shows original vs discounted price", async () => {
    const c = client();
    render(<ResidentialRelayAdminWorkspace client={c} />);
    await screen.findByText("US 1");
    const discountPanel = screen.getByRole("region", { name: "SKU 折扣" });
    fireEvent.change(within(discountPanel).getByLabelText("折扣（%）"), { target: { value: "20" } });
    fireEvent.click(screen.getByRole("button", { name: "保存折扣" }));
    await waitFor(() => expect(c.setDiscount).toHaveBeenCalledWith(SKU_ID, REV(1), { kind: "percent", value: 2000, startsAt: null, endsAt: null }));
    expect((await screen.findAllByText("24")).length).toBeGreaterThan(0);
  });

  it("creates a coupon with limits and no stacking, then quotes with it", async () => {
    const c = client();
    render(<ResidentialRelayAdminWorkspace client={c} />);
    await screen.findByText("US 1");
    const coupons = screen.getByRole("region", { name: "优惠码" });
    fireEvent.change(within(coupons).getByLabelText("优惠码"), { target: { value: "save5" } });
    fireEvent.change(within(coupons).getByLabelText("类型"), { target: { value: "fixed" } });
    fireEvent.change(within(coupons).getByLabelText("减免（Coins）"), { target: { value: "5" } });
    fireEvent.change(within(coupons).getByLabelText("总次数上限（可选）"), { target: { value: "100" } });
    fireEvent.change(within(coupons).getByLabelText("每用户上限（可选）"), { target: { value: "1" } });
    fireEvent.click(within(coupons).getByLabelText("可与 SKU 折扣叠加"));
    fireEvent.click(within(coupons).getByRole("button", { name: "创建优惠码（默认停用）" }));
    await waitFor(() => expect(c.createCoupon).toHaveBeenCalledWith(REV(5), { code: "SAVE5", kind: "fixed", value: 5, allSkus: true,
      skuIds: [], startsAt: null, endsAt: null, totalLimit: 100, perUserLimit: 1, stackable: false }));
    expect(await within(coupons).findByText("SAVE5")).toBeTruthy();
    fireEvent.change(within(coupons).getByLabelText("SKU"), { target: { value: SKU_ID } });
    fireEvent.change(within(coupons).getByLabelText("优惠码（可选）"), { target: { value: "save5" } });
    fireEvent.click(within(coupons).getByRole("button", { name: "计算报价" }));
    await waitFor(() => expect(c.quote).toHaveBeenCalledWith(SKU_ID, "SAVE5"));
    expect((await within(coupons).findByLabelText("报价结果")).textContent).toContain("19");
  });

  it("shows a fixed message when enabling a SKU without enabled upstreams", async () => {
    const c = client({ saveSku: vi.fn(async () => { throw new ResidentialRelayAdminError("no_enabled_upstream"); }) });
    render(<ResidentialRelayAdminWorkspace client={c} />);
    await screen.findByText("US 1");
    fireEvent.click(screen.getByRole("button", { name: "保存配置" }));
    expect(await screen.findByRole("alert")).toHaveProperty("textContent", "请先启用至少一条上游线路，再启用此 SKU。");
  });
});
