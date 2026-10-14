import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ResidentialRelayAdminWorkspace } from "../features/residential-relay-packs/residential-relay-admin-workspace";
import type { ResidentialRelayAdminClient, ResidentialRelaySku, ResidentialRelaySnapshot } from "../features/residential-relay-packs/residential-relay-admin-client";
import { ResidentialRelayAdminError } from "../features/residential-relay-packs/residential-relay-admin-client";

const GiB = 1024 ** 3;
const TERMS = { refunds: false, unusedByteRollover: false, renewals: false, autoRenew: false, gracePeriod: false } as const;
const SKU_ID = `rrsku_${"a".repeat(32)}`;
const UP_A = `rrup_${"1".repeat(32)}`;
const UP_B = `rrup_${"2".repeat(32)}`;
const REV = (n: number) => String(n).repeat(64).slice(0, 64);

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
    fireEvent.click(screen.getByLabelText("全选"));
    fireEvent.click(screen.getByRole("button", { name: /启用所选/ }));
    await waitFor(() => expect(c.setUpstreamsEnabled).toHaveBeenCalledWith(SKU_ID, REV(1), [UP_A, UP_B], true));
    await screen.findAllByText("已启用");
    fireEvent.click(screen.getByLabelText("选择 US 1"));
    expect((screen.getByRole("button", { name: /删除所选/ }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("shows a fixed message when enabling a SKU without enabled upstreams", async () => {
    const c = client({ saveSku: vi.fn(async () => { throw new ResidentialRelayAdminError("no_enabled_upstream"); }) });
    render(<ResidentialRelayAdminWorkspace client={c} />);
    await screen.findByText("US 1");
    fireEvent.click(screen.getByRole("button", { name: "保存配置" }));
    expect(await screen.findByRole("alert")).toHaveProperty("textContent", "请先启用至少一条上游线路，再启用此 SKU。");
  });
});
