import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { couponsToCsv } from "../features/residential-relay-packs/residential-relay-pricing-panels";
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

const COUPON = { id: CPN, ref: "RC-11111111", code: "••••-••••-JKMN", codeMasked: true, batchId: "rrbat_1", kind: "percent" as const, value: 1500, allSkus: true, skus: [],
  status: "consumed" as const, issuedAt: "2026-10-01T00:00:00.000Z", issuedBy: "op_alice", issuer: "op_bob", recipientRef: "acct_a",
  expiresAt: "2026-10-31T00:00:00.000Z", usableUntil: "2026-11-01T00:00:00.000Z",
  voidedAt: null, voidedBy: null, redeemedBy: "acct_a", redeemedAt: "2026-10-02T00:00:00.000Z", consumedBy: "acct_a",
  consumedOrderRef: "order_77", consumedAmount: 5, consumedAt: "2026-10-03T00:00:00.000Z" };

function sku(patch: Partial<ResidentialRelaySku> = {}): ResidentialRelaySku {
  return { configured: true, id: SKU_ID, sizeCode: "100G", buyerProtocol: "vless", quotaBytes: 100 * GiB,
    durationDays: 30, baseCoinUnits: 30, enabled: false, upstreamCount: 2, enabledUpstreamCount: 0,
    purchasable: false, terms: TERMS, ...patch };
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
    listCoupons: vi.fn(async () => ({ asOf: "2026-10-14T00:00:00.000Z", actor: "op_alice", items: [COUPON] })),
    generateCoupons: vi.fn(async () => ({ asOf: "2026-10-14T00:00:00.000Z", actor: "op_alice", items: [{ ...COUPON, code: "NEWC-ODE2-3456", codeMasked: false }] })),
    voidCoupons: vi.fn(async () => undefined),
    quote: vi.fn(async () => ({ skuId: SKU_ID, sizeCode: "100G", purchasable: true, listPrice: 30,
      deduction: 5, finalPrice: 25, coupon: { id: CPN, ref: "RC-11111111", kind: "fixed", value: 5, applied: true, capped: false } })),
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

  it("has no per-pack discount or stacking controls", async () => {
    render(<ResidentialRelayAdminWorkspace client={client()} />);
    await screen.findByText("US 1");
    expect(screen.queryByRole("region", { name: "SKU 折扣" })).toBeNull();
    expect(screen.queryByText(/叠加|保存折扣|剩余次数|每用户/)).toBeNull();
  });

  it("generates redeem codes in a batch, shows audit columns, filters and quotes", async () => {
    const c = client();
    render(<ResidentialRelayAdminWorkspace client={c} />);
    await screen.findByText("US 1");
    const panel = screen.getByRole("region", { name: "兑换码" });
    const table = await within(panel).findByRole("table", { name: "兑换码列表" });
    for (const head of ["签发时间", "折扣比例", "抵扣金额", "生成账户", "发放人", "领取人", "兑换账户", "消耗账户", "过期时间", "状态"]) {
      expect(within(table).getByRole("columnheader", { name: head })).toBeTruthy();
    }
    expect(within(table).getByText("15%")).toBeTruthy();
    expect(within(table).getByText("5 Coins")).toBeTruthy();
    expect(within(table).getByText("op_alice")).toBeTruthy();
    expect(within(table).getByText("op_bob")).toBeTruthy();
    expect(within(table).getByText("RC-11111111")).toBeTruthy();
    expect((within(panel).getByLabelText("发放人") as HTMLInputElement).value).toBe("op_alice");
    expect((within(panel).getByLabelText("有效期") as HTMLInputElement).readOnly).toBe(true);
    expect(within(table).getByText(/order_77/)).toBeTruthy();
    fireEvent.change(within(panel).getByLabelText("状态"), { target: { value: "voided" } });
    expect(within(panel).getByText("暂无兑换码。")).toBeTruthy();
    fireEvent.change(within(panel).getByLabelText("状态"), { target: { value: "" } });
    expect((within(panel).getByRole("button", { name: /作废所选/ }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(within(panel).getByLabelText("数量"), { target: { value: "20" } });
    fireEvent.change(within(panel).getByLabelText("比例（%，≤20）"), { target: { value: "15" } });
    fireEvent.change(within(panel).getByLabelText("发放人"), { target: { value: "op_carol" } });
    fireEvent.change(within(panel).getByLabelText("领取人（可选）"), { target: { value: "acct_z" } });
    fireEvent.click(within(panel).getByRole("button", { name: "生成兑换码" }));
    await waitFor(() => expect(c.generateCoupons).toHaveBeenCalledWith(expect.objectContaining({ count: 20, kind: "percent", value: 1500, allSkus: true, issuer: "op_carol", recipientRef: "acct_z" })));
    expect(await within(panel).findByLabelText("新生成的兑换码")).toBeTruthy();
    fireEvent.change(within(panel).getByLabelText("SKU"), { target: { value: SKU_ID } });
    fireEvent.click(within(panel).getByRole("button", { name: "计算报价" }));
    expect((await within(panel).findByLabelText("报价结果")).textContent).toContain("25");
  });

  it("exports CSV with formula-safe quoting", () => {
    const csv = couponsToCsv([{ ...COUPON, issuedBy: "=cmd()" }]);
    expect(csv.split("\r\n")[0]).toContain("issued_at,percent,deduction_coins,issued_by,issuer,recipient");
    expect(csv).toContain(`"'=cmd()"`);
    expect(csv).toContain(`"order_77"`);
  });

  it("shows a fixed message when enabling a SKU without enabled upstreams", async () => {
    const c = client({ saveSku: vi.fn(async () => { throw new ResidentialRelayAdminError("no_enabled_upstream"); }) });
    render(<ResidentialRelayAdminWorkspace client={c} />);
    await screen.findByText("US 1");
    fireEvent.click(screen.getByRole("button", { name: "保存配置" }));
    expect(await screen.findByRole("alert")).toHaveProperty("textContent", "请先启用至少一条上游线路，再启用此 SKU。");
  });
});
