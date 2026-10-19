import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { StrictMode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SubscriptionDistributionPanel } from "../features/third-party-node-names/subscription-distribution-panel";
import { DistributionError, type DistributionSnapshot, type SubscriptionDistributionClient } from "../features/third-party-node-names/subscription-distribution-client";

const revision = "a".repeat(64);
const ownId = `ownnode_${"1".repeat(32)}`;
const nodeId = `tpnode_${"2".repeat(32)}`;
function fixture(): DistributionSnapshot {
  return { revision, owned: { enabled: true, items: [{ id: ownId, originalName: "US-origin", defaultName: "US-default", customName: null, displayName: "US-default", protocol: "vless", countryCode: "US", enabled: true, available: true }] },
    routes: ["monthly_basic", "monthly_plus", "yearly"].map((planId) => ({ planId: planId as "monthly_basic" | "monthly_plus" | "yearly", mode: "owned", nodeIds: [] })),
    candidates: [
      { id: nodeId, sourceId: `tpsrc_${"3".repeat(32)}`, sourceName: "已许可来源", displayName: "JP-basic", protocol: "tuic", countryCode: "JP", enabled: true, sourceEnabled: true, tiers: ["monthly_basic"] },
      { id: `tpnode_${"4".repeat(32)}`, sourceId: `tpsrc_${"3".repeat(32)}`, sourceName: "已许可来源", displayName: "JP-paused", protocol: "tuic", countryCode: "JP", enabled: false, sourceEnabled: true, tiers: ["monthly_basic"] },
      { id: `tpnode_${"5".repeat(32)}`, sourceId: `tpsrc_${"3".repeat(32)}`, sourceName: "已许可来源", displayName: "SG-yearly", protocol: "hysteria2", countryCode: "SG", enabled: true, sourceEnabled: true, tiers: ["yearly"] }
    ] };
}
function makeClient(value = fixture()) {
  return { read: vi.fn().mockImplementation(async () => structuredClone(value)),
    saveRoutes: vi.fn().mockImplementation(async (input) => ({ ...structuredClone(value), revision: "b".repeat(64), routes: input.routes })),
    saveOwned: vi.fn().mockImplementation(async (input) => ({ ...structuredClone(value), revision: "b".repeat(64), owned: { enabled: input.enabled, items: value.owned.items.map((node) => ({ ...node, ...input.nodes.find((item: { id: string }) => item.id === node.id) })) } })) } satisfies SubscriptionDistributionClient;
}
async function loaded(client = makeClient(), onSessionExpired?: () => void) { render(<SubscriptionDistributionPanel client={client} onSessionExpired={onSessionExpired} />); await screen.findByText("已读取当前分发设置。"); return client; }
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("subscription distribution panel", () => {
  it("shows authoritative owned defaults and no native import/delete controls", async () => {
    const client = await loaded();
    expect((screen.getByRole("radio", { name: "自有节点" }) as HTMLInputElement).checked).toBe(true);
    expect(screen.getByRole("textbox", { name: "US-default 显示名称" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /删除|导入/ })).toBeNull();
    expect(client.saveRoutes).not.toHaveBeenCalled();
  });
  it("filters candidates by selected tier and disables paused nodes", async () => {
    await loaded(); fireEvent.click(screen.getByRole("radio", { name: "第三方节点" }));
    expect(screen.getByRole("checkbox", { name: /JP-basic/ })).toBeTruthy();
    expect((screen.getByRole("checkbox", { name: /JP-paused/ }) as HTMLInputElement).disabled).toBe(true);
    expect(screen.queryByText("SG-yearly")).toBeNull();
    fireEvent.change(screen.getByRole("combobox", { name: "选择套餐" }), { target: { value: "yearly" } });
    fireEvent.click(screen.getByRole("radio", { name: "第三方节点" }));
    expect(screen.getByRole("checkbox", { name: /SG-yearly/ })).toBeTruthy();
    expect(screen.queryByText("JP-basic")).toBeNull();
  });
  it("allows removing an already-selected paused node before saving replacement targets", async () => {
    const value = fixture(); value.routes[0] = { planId: "monthly_basic", mode: "third-party", nodeIds: [value.candidates[1].id] };
    await loaded(makeClient(value));
    const paused = screen.getByRole("checkbox", { name: /JP-paused/ }) as HTMLInputElement;
    expect(paused.disabled).toBe(false); fireEvent.click(paused);
    expect(paused.checked).toBe(false); expect(paused.disabled).toBe(true);
    fireEvent.click(screen.getByRole("checkbox", { name: /JP-basic/ }));
    expect((screen.getByRole("button", { name: "保存配置路由" }) as HTMLButtonElement).disabled).toBe(false);
  });
  it("requires a target and confirmation, then saves all plans with the exact snapshot revision", async () => {
    const client = await loaded(); fireEvent.click(screen.getByRole("radio", { name: "第三方节点" }));
    expect((screen.getByRole("button", { name: "保存配置路由" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole("checkbox", { name: /JP-basic/ }));
    fireEvent.click(screen.getByRole("button", { name: "保存配置路由" }));
    const dialog = screen.getByRole("dialog"); expect(within(dialog).getByText("JP-basic")).toBeTruthy();
    expect(client.saveRoutes).not.toHaveBeenCalled();
    fireEvent.click(within(dialog).getByRole("button", { name: "确认保存" }));
    await screen.findByText("分发设置已保存。客户端成功刷新订阅后生效。");
    expect(client.saveRoutes).toHaveBeenCalledOnce();
    expect(client.saveRoutes.mock.calls[0][0]).toEqual({ revision, routes: [
      { planId: "monthly_basic", mode: "third-party", nodeIds: [nodeId] },
      { planId: "monthly_plus", mode: "owned", nodeIds: [] }, { planId: "yearly", mode: "owned", nodeIds: [] }
    ] });
  });
  it("saves owned overrides and distribution pause without claiming runtime stop", async () => {
    const client = await loaded();
    fireEvent.change(screen.getByRole("textbox", { name: "US-default 显示名称" }), { target: { value: "美西" } });
    fireEvent.change(screen.getByRole("combobox", { name: "US-default 国家或地区" }), { target: { value: "US" } });
    fireEvent.click(screen.getByRole("checkbox", { name: "US-default 分发启用" }));
    fireEvent.click(screen.getByRole("button", { name: "保存自有分发" }));
    expect(screen.getByText("此操作不会停止现有连接。")).toBeTruthy();
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "确认保存" }));
    await screen.findByText("分发设置已保存。客户端成功刷新订阅后生效。");
    expect(client.saveOwned.mock.calls[0][0]).toEqual({ revision, enabled: true, nodes: [{ id: ownId, customName: "美西", customCountryCode: "US", enabled: false }] });
  });
  it("requires explicit discard before reload replaces dirty drafts", async () => {
    const client = await loaded();
    fireEvent.change(screen.getByRole("textbox", { name: "US-default 显示名称" }), { target: { value: "未保存" } });
    fireEvent.click(screen.getByRole("button", { name: "重新读取分发" }));
    expect(client.read).toHaveBeenCalledOnce();
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "取消" }));
    expect((screen.getByRole("textbox", { name: "US-default 显示名称" }) as HTMLInputElement).value).toBe("未保存");
    fireEvent.click(screen.getByRole("button", { name: "重新读取分发" }));
    fireEvent.click(screen.getByRole("button", { name: "放弃草稿并重新读取" }));
    await waitFor(() => expect(client.read).toHaveBeenCalledTimes(2));
    await waitFor(() => expect((screen.getByRole("textbox", { name: "US-default 显示名称" }) as HTMLInputElement).value).toBe(""));
  });
  it("serializes pending writes and rejects repeated confirm clicks", async () => {
    const client = await loaded();
    let resolveSave: ((snapshot: DistributionSnapshot) => void) | undefined;
    client.saveOwned.mockImplementationOnce(() => new Promise((resolve) => { resolveSave = resolve; }));
    fireEvent.change(screen.getByRole("textbox", { name: "US-default 显示名称" }), { target: { value: "pending" } });
    fireEvent.click(screen.getByRole("button", { name: "保存自有分发" }));
    const confirm = screen.getByRole("button", { name: "确认保存" }); fireEvent.click(confirm); fireEvent.click(confirm);
    expect(client.saveOwned).toHaveBeenCalledOnce();
    expect((screen.getByRole("button", { name: "重新读取分发" }) as HTMLButtonElement).disabled).toBe(true);
    resolveSave?.(fixture());
    await screen.findByText("分发设置已保存。客户端成功刷新订阅后生效。");
  });
  it.each(["stale", "network", "timeout"] as const)("locks mutation after %s and never automatically retries or reloads", async (code) => {
    const client = await loaded(); client.saveOwned.mockRejectedValueOnce(new DistributionError(code));
    fireEvent.change(screen.getByRole("textbox", { name: "US-default 显示名称" }), { target: { value: "draft" } });
    fireEvent.click(screen.getByRole("button", { name: "保存自有分发" }));
    fireEvent.click(screen.getByRole("button", { name: "确认保存" }));
    await screen.findByRole("alert");
    expect((screen.getByRole("textbox", { name: "US-default 显示名称" }).closest("fieldset") as HTMLFieldSetElement).disabled).toBe(true);
    expect(client.saveOwned).toHaveBeenCalledOnce(); expect(client.read).toHaveBeenCalledOnce();
  });
  it("rejects a save receipt that unexpectedly changes an unrelated route", async () => {
    const client = await loaded();
    const changed = fixture(); changed.routes[2] = { planId: "yearly", mode: "third-party", nodeIds: [changed.candidates[2].id] };
    client.saveOwned.mockResolvedValueOnce(changed);
    fireEvent.change(screen.getByRole("textbox", { name: "US-default 显示名称" }), { target: { value: "draft" } });
    fireEvent.click(screen.getByRole("button", { name: "保存自有分发" }));
    fireEvent.click(screen.getByRole("button", { name: "确认保存" }));
    await screen.findByRole("alert");
    expect(screen.queryByText("分发设置已保存。客户端成功刷新订阅后生效。")).toBeNull();
    expect(client.read).toHaveBeenCalledOnce();
  });
  it.each(["session", "permission"] as const)("clears projected node data on %s", async (code) => {
    const expired = vi.fn(); const client = await loaded(makeClient(), expired);
    client.read.mockRejectedValueOnce(new DistributionError(code));
    fireEvent.click(screen.getByRole("button", { name: "重新读取分发" }));
    await screen.findByRole("alert"); expect(expired).toHaveBeenCalledOnce();
    expect(screen.queryByRole("textbox")).toBeNull(); expect(screen.queryByText("US-default")).toBeNull();
  });
  it("reports unavailable without mounting fake controls or preventing sibling management", async () => {
    const client = makeClient(); client.read.mockRejectedValueOnce(new DistributionError("unavailable"));
    render(<><SubscriptionDistributionPanel client={client} /><button>既有第三方管理</button></>);
    await screen.findByRole("alert"); expect(screen.getByRole("button", { name: "既有第三方管理" })).toBeTruthy();
    expect(screen.queryByRole("radio")).toBeNull();
  });
  it("does not lose its initial read in StrictMode cleanup", async () => {
    const client = makeClient(); render(<StrictMode><SubscriptionDistributionPanel client={client} /></StrictMode>);
    await screen.findByText("已读取当前分发设置。"); expect(screen.getByRole("radio", { name: "自有节点" })).toBeTruthy();
  });
});
