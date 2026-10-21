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
    saveOwned: vi.fn().mockImplementation(async (input) => ({ ...structuredClone(value), revision: "b".repeat(64), owned: { enabled: input.enabled, items: value.owned.items.map((node) => ({ ...node, ...input.nodes.find((item: { id: string }) => item.id === node.id) })) } })),
    setBwhSupply: vi.fn().mockImplementation(async (input) => ({ ...structuredClone(value), bwhSupply: { ...value.bwhSupply, revision: "e".repeat(64),
      state: input.enabled ? "enabled" : "paused", protocolsRunning: input.enabled ? 3 : 0, collectorState: input.enabled ? "running" : "paused",
      nativeDistributionEnabled: input.enabled, canPause: input.enabled, canEnable: !input.enabled } })),
    saveProtocolRating: vi.fn() } satisfies SubscriptionDistributionClient;
}
function supplyFixture(): DistributionSnapshot {
  return { ...fixture(), bwhSupply: { revision: "d".repeat(64), state: "enabled", protocolsRunning: 3, collectorState: "running", nativeDistributionEnabled: true,
    observedAt: "2026-10-19T09:00:00.000Z", canPause: true, canEnable: false } };
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
    expect(screen.queryByRole("region", { name: "BWH 实际供流" })).toBeNull();
    expect(screen.queryByRole("region", { name: "协议用量倍率" })).toBeNull();
    expect(client.setBwhSupply).not.toHaveBeenCalled();
  });
  it("requires separate confirmation for actual supply pause and adopts only the terminal response", async () => {
    const client = await loaded(makeClient(supplyFixture()));
    const supply = screen.getByRole("region", { name: "BWH 实际供流" });
    expect(within(supply).getByText(/供流状态：已启用/)).toBeTruthy();
    expect((within(supply).getByRole("button", { name: "启用 BWH 供流" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(within(supply).getByRole("button", { name: "暂停 BWH 供流" }));
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText(/实际中断.*BWH.*连接/)).toBeTruthy();
    expect(within(dialog).getByText(/原订阅链接、账户、额度.*保留/)).toBeTruthy();
    expect(within(dialog).getByText(/仅下发已选择的第三方节点/)).toBeTruthy();
    expect(client.setBwhSupply).not.toHaveBeenCalled();
    fireEvent.click(within(dialog).getByRole("button", { name: "确认暂停供流" }));
    await screen.findByText("BWH 供流已暂停，自有节点停止下发；仅保留所选第三方配置。");
    expect(client.setBwhSupply).toHaveBeenCalledOnce();
    expect(client.setBwhSupply.mock.calls[0][0]).toEqual({ revision, supplyRevision: "d".repeat(64), enabled: false });
    expect(within(supply).getByText(/供流状态：已暂停/)).toBeTruthy();
    expect(client.read).toHaveBeenCalledOnce();
  });
  it("confirms enablement without claiming native output before service and collector verification", async () => {
    const value = supplyFixture();
    Object.assign(value.bwhSupply!, { state: "paused", protocolsRunning: 0, collectorState: "paused", nativeDistributionEnabled: false, canPause: false, canEnable: true });
    const client = await loaded(makeClient(value));
    fireEvent.click(screen.getByRole("button", { name: "启用 BWH 供流" }));
    expect(within(screen.getByRole("dialog")).getByText(/协议服务和计量.*核验通过.*恢复自有节点下发/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "确认启用供流" }));
    await screen.findByText("BWH 协议、身份与检查点已核验，供流及计量调度已恢复；自然采集结果仍需验收，已保存路由不变。");
    expect(client.setBwhSupply.mock.calls[0][0]).toEqual({ revision, supplyRevision: "d".repeat(64), enabled: true });
    expect(client.read).toHaveBeenCalledOnce();
  });
  it("cancels supply confirmation without sending a command and blocks commands while drafts exist", async () => {
    const client = await loaded(makeClient(supplyFixture()));
    fireEvent.click(screen.getByRole("button", { name: "暂停 BWH 供流" }));
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "取消" }));
    expect(client.setBwhSupply).not.toHaveBeenCalled();
    fireEvent.change(screen.getByRole("textbox", { name: "US-default 显示名称" }), { target: { value: "draft" } });
    expect((screen.getByRole("button", { name: "暂停 BWH 供流" }) as HTMLButtonElement).disabled).toBe(true);
    expect(client.read).toHaveBeenCalledOnce();
  });
  it.each(["transitioning", "unavailable"] as const)("blocks supply commands in %s state even if capability flags are true", async (state) => {
    const value = supplyFixture(); Object.assign(value.bwhSupply!, { state, canPause: true, canEnable: true });
    const client = await loaded(makeClient(value));
    expect((screen.getByRole("button", { name: "暂停 BWH 供流" }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: "启用 BWH 供流" }) as HTMLButtonElement).disabled).toBe(true);
    expect(client.setBwhSupply).not.toHaveBeenCalled();
  });
  it("rejects a supply command response that changes unrelated distribution policy", async () => {
    const value = supplyFixture(); const client = await loaded(makeClient(value));
    const changed = structuredClone(value);
    Object.assign(changed.bwhSupply!, { state: "paused", protocolsRunning: 0, collectorState: "paused", nativeDistributionEnabled: false });
    changed.owned.enabled = false;
    client.setBwhSupply.mockResolvedValueOnce(changed);
    fireEvent.click(screen.getByRole("button", { name: "暂停 BWH 供流" }));
    fireEvent.click(screen.getByRole("button", { name: "确认暂停供流" }));
    await screen.findByRole("alert");
    expect(screen.queryByText("BWH 供流已暂停，自有节点停止下发；仅保留所选第三方配置。")).toBeNull();
    expect((screen.getByRole("button", { name: "暂停 BWH 供流" }) as HTMLButtonElement).disabled).toBe(true);
    expect(client.read).toHaveBeenCalledOnce();
  });
  it.each(["routes", "owned"] as const)("rejects changed supply identity on a normal %s save", async (part) => {
    const value = supplyFixture(); const client = await loaded(makeClient(value));
    const changed = structuredClone(value); changed.bwhSupply!.revision = "e".repeat(64);
    if (part === "owned") {
      client.saveOwned.mockResolvedValueOnce(changed);
      fireEvent.change(screen.getByRole("textbox", { name: "US-default 显示名称" }), { target: { value: "draft" } });
      fireEvent.click(screen.getByRole("button", { name: "保存自有分发" }));
    } else {
      client.saveRoutes.mockResolvedValueOnce(changed);
      fireEvent.click(screen.getByRole("radio", { name: "第三方节点" }));
      fireEvent.click(screen.getByRole("checkbox", { name: /JP-basic/ }));
      fireEvent.click(screen.getByRole("button", { name: "保存配置路由" }));
    }
    fireEvent.click(screen.getByRole("button", { name: "确认保存" }));
    await screen.findByRole("alert");
    expect(screen.queryByText("分发设置已保存。客户端成功刷新订阅后生效。")).toBeNull();
    expect(client.read).toHaveBeenCalledOnce();
  });
  it("accepts normal save receipts when only the supply observation timestamp advances", async () => {
    const value = supplyFixture(); const client = await loaded(makeClient(value));
    const changed = structuredClone(value);
    changed.owned.items[0].customName = "saved";
    changed.bwhSupply!.observedAt = "2026-10-19T09:01:00.000Z";
    client.saveOwned.mockResolvedValueOnce(changed);
    fireEvent.change(screen.getByRole("textbox", { name: "US-default 显示名称" }), { target: { value: "saved" } });
    fireEvent.click(screen.getByRole("button", { name: "保存自有分发" }));
    fireEvent.click(screen.getByRole("button", { name: "确认保存" }));
    await screen.findByText("分发设置已保存。客户端成功刷新订阅后生效。");
    expect(screen.queryByRole("alert")).toBeNull();
    expect(client.saveOwned).toHaveBeenCalledOnce();
  });
  it("serializes supply commands, avoids optimistic state and never polls while pending", async () => {
    const value = supplyFixture(); const client = await loaded(makeClient(value));
    let resolveSave: ((snapshot: DistributionSnapshot) => void) | undefined;
    client.setBwhSupply.mockImplementationOnce(() => new Promise((resolve) => { resolveSave = resolve; }));
    fireEvent.click(screen.getByRole("button", { name: "暂停 BWH 供流" }));
    const confirm = screen.getByRole("button", { name: "确认暂停供流" }); fireEvent.click(confirm); fireEvent.click(confirm);
    expect(client.setBwhSupply).toHaveBeenCalledOnce();
    expect(screen.getByText(/供流状态：已启用/)).toBeTruthy();
    expect((screen.getByRole("button", { name: "重新读取分发" }) as HTMLButtonElement).disabled).toBe(true);
    expect(client.read).toHaveBeenCalledOnce();
    const paused = structuredClone(value);
    Object.assign(paused.bwhSupply!, { revision: "e".repeat(64), state: "paused", protocolsRunning: 0, collectorState: "paused", nativeDistributionEnabled: false, canPause: false, canEnable: true });
    resolveSave?.(paused);
    await screen.findByText("BWH 供流已暂停，自有节点停止下发；仅保留所选第三方配置。");
    expect(client.read).toHaveBeenCalledOnce();
  });
  it.each(["network", "timeout", "stale"] as const)("locks supply controls after an unconfirmed %s command without retry", async (code) => {
    const client = await loaded(makeClient(supplyFixture()));
    client.setBwhSupply.mockRejectedValueOnce(new DistributionError(code));
    fireEvent.click(screen.getByRole("button", { name: "暂停 BWH 供流" }));
    fireEvent.click(screen.getByRole("button", { name: "确认暂停供流" }));
    await screen.findByRole("alert");
    expect((screen.getByRole("button", { name: "暂停 BWH 供流" }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: "启用 BWH 供流" }) as HTMLButtonElement).disabled).toBe(true);
    expect(client.setBwhSupply).toHaveBeenCalledOnce(); expect(client.read).toHaveBeenCalledOnce();
  });
  it("displays enabled automation as read-only client refresh capabilities without polling", async () => {
    const value = fixture();
    value.automation = { clientHealthCheckEnabled: true, dailyRotationEnabled: true, healthCheckIntervalSeconds: 300, rotationTimezone: "UTC" };
    const client = await loaded(makeClient(value));
    const status = screen.getByRole("region", { name: "客户端自动路由能力" });
    expect(within(status).getByText(/每日轮换：已启用/)).toBeTruthy();
    expect(within(status).getByText(/UTC 日期.*成功刷新.*不会强制中断/)).toBeTruthy();
    expect(within(status).getByText(/客户端择优：已启用/)).toBeTruthy();
    expect(within(status).getByText(/每 300 秒.*协议连接测试/)).toBeTruthy();
    expect(within(status).getByText(/服务器不主动探测.*不代表集中式健康保证/)).toBeTruthy();
    expect(within(status).getByText(/provider.*父配置/)).toBeTruthy();
    expect(within(status).queryByRole("button")).toBeNull();
    expect(within(status).queryByRole("checkbox")).toBeNull();
    expect(client.read).toHaveBeenCalledOnce();
    expect(client.saveOwned).not.toHaveBeenCalled();
    expect(client.saveRoutes).not.toHaveBeenCalled();
  });
  it("does not claim automation for legacy snapshots and reports disabled capabilities explicitly", async () => {
    const client = await loaded();
    expect(screen.queryByRole("region", { name: "客户端自动路由能力" })).toBeNull();
    const value = fixture();
    value.automation = { clientHealthCheckEnabled: false, dailyRotationEnabled: false, healthCheckIntervalSeconds: 300, rotationTimezone: "UTC" };
    client.read.mockResolvedValueOnce(value);
    fireEvent.click(screen.getByRole("button", { name: "重新读取分发" }));
    const status = await screen.findByRole("region", { name: "客户端自动路由能力" });
    expect(within(status).getByText(/每日轮换：未启用/)).toBeTruthy();
    expect(within(status).getByText(/客户端择优：未启用/)).toBeTruthy();
    expect(within(status).queryByText(/每 300 秒/)).toBeNull();
    expect(client.read).toHaveBeenCalledTimes(2);
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
  it.each(["routes", "owned"] as const)("rejects automation drift in a %s save receipt without adopting the changed capability", async (part) => {
    const value = fixture();
    value.automation = { clientHealthCheckEnabled: true, dailyRotationEnabled: true, healthCheckIntervalSeconds: 300, rotationTimezone: "UTC" };
    const client = await loaded(makeClient(value));
    const changed = structuredClone(value);
    changed.automation!.dailyRotationEnabled = false;
    if (part === "owned") {
      client.saveOwned.mockResolvedValueOnce(changed);
      fireEvent.change(screen.getByRole("textbox", { name: "US-default 显示名称" }), { target: { value: "draft" } });
      fireEvent.click(screen.getByRole("button", { name: "保存自有分发" }));
    } else {
      client.saveRoutes.mockResolvedValueOnce(changed);
      fireEvent.click(screen.getByRole("radio", { name: "第三方节点" }));
      fireEvent.click(screen.getByRole("checkbox", { name: /JP-basic/ }));
      fireEvent.click(screen.getByRole("button", { name: "保存配置路由" }));
    }
    fireEvent.click(screen.getByRole("button", { name: "确认保存" }));
    await screen.findByRole("alert");
    expect(screen.queryByText("分发设置已保存。客户端成功刷新订阅后生效。")).toBeNull();
    expect(screen.getByText(/每日轮换：已启用/)).toBeTruthy();
    expect((screen.getByRole("textbox", { name: "US-default 显示名称" }).closest("fieldset") as HTMLFieldSetElement).disabled).toBe(true);
    expect(client.read).toHaveBeenCalledOnce();
  });
  it.each(["added", "removed"] as const)("locks saving if the automation projection is unexpectedly %s", async (change) => {
    const value = fixture();
    const automation = { clientHealthCheckEnabled: true, dailyRotationEnabled: true, healthCheckIntervalSeconds: 300 as const, rotationTimezone: "UTC" as const };
    if (change === "removed") value.automation = automation;
    const client = await loaded(makeClient(value));
    const changed = structuredClone(value);
    if (change === "added") changed.automation = automation;
    else delete changed.automation;
    client.saveOwned.mockResolvedValueOnce(changed);
    fireEvent.change(screen.getByRole("textbox", { name: "US-default 显示名称" }), { target: { value: "draft" } });
    fireEvent.click(screen.getByRole("button", { name: "保存自有分发" }));
    fireEvent.click(screen.getByRole("button", { name: "确认保存" }));
    await screen.findByRole("alert");
    expect(screen.queryByText("分发设置已保存。客户端成功刷新订阅后生效。")).toBeNull();
    expect((screen.getByRole("textbox", { name: "US-default 显示名称" }).closest("fieldset") as HTMLFieldSetElement).disabled).toBe(true);
    expect(client.saveOwned).toHaveBeenCalledOnce();
    expect(client.read).toHaveBeenCalledOnce();
  });
  it.each(["routes", "owned"] as const)("preserves automation capabilities after a %s save without writing them", async (part) => {
    const value = fixture();
    value.automation = { clientHealthCheckEnabled: true, dailyRotationEnabled: true, healthCheckIntervalSeconds: 300, rotationTimezone: "UTC" };
    const client = await loaded(makeClient(value));
    if (part === "owned") {
      fireEvent.change(screen.getByRole("textbox", { name: "US-default 显示名称" }), { target: { value: "saved" } });
      fireEvent.click(screen.getByRole("button", { name: "保存自有分发" }));
    } else {
      fireEvent.click(screen.getByRole("radio", { name: "第三方节点" }));
      fireEvent.click(screen.getByRole("checkbox", { name: /JP-basic/ }));
      fireEvent.click(screen.getByRole("button", { name: "保存配置路由" }));
    }
    fireEvent.click(screen.getByRole("button", { name: "确认保存" }));
    await screen.findByText("分发设置已保存。客户端成功刷新订阅后生效。");
    const save = part === "owned" ? client.saveOwned : client.saveRoutes;
    expect(save).toHaveBeenCalledOnce();
    expect(save.mock.calls[0][0]).not.toHaveProperty("automation");
    expect(screen.getByText(/每日轮换：已启用/)).toBeTruthy();
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
  it("keeps protocol multipliers as a local draft until a separate confirmation", async () => {
    const ratingRevision = "c".repeat(64);
    const value = { ...fixture(), protocolRating: { installed: true, revision: ratingRevision, active: { version: 1, state: "active" as const, effectiveNotBefore: "2026-10-20T00:00:00.000Z", multipliers: { vless: "1.0", hy2: "1.0", tuic: "1.0" } }, pending: null } };
    const client = makeClient(value);
    client.saveProtocolRating = vi.fn().mockImplementation(async (input: { vless: string; hy2: string; tuic: string }) => ({ ...structuredClone(value), protocolRating: { ...value.protocolRating, revision: "d".repeat(64), pending: { version: 2, state: "pending" as const, effectiveNotBefore: "2026-10-20T01:00:00.000Z", multipliers: { vless: input.vless, hy2: input.hy2, tuic: input.tuic } } } }));
    await loaded(client);
    const region = screen.getByRole("region", { name: "协议用量倍率" });
    expect(within(region).getByText(/状态：已生效/)).toBeTruthy();
    fireEvent.change(within(region).getByRole("slider", { name: "hy2 用量倍率滑块" }), { target: { value: "2.5" } });
    expect(client.saveProtocolRating).not.toHaveBeenCalled();
    fireEvent.click(within(region).getByRole("button", { name: "保存协议倍率" }));
    expect(client.saveProtocolRating).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "确认保存" }));
    await screen.findByText("协议倍率已保存为待生效，只影响之后的新用量。");
    expect(client.saveProtocolRating).toHaveBeenCalledOnce();
    expect(client.saveProtocolRating.mock.calls[0][0]).toEqual({ ratingRevision, vless: "1.0", hy2: "2.5", tuic: "1.0" });
    expect(client.setBwhSupply).not.toHaveBeenCalled();
    expect(client.saveOwned).not.toHaveBeenCalled();
  });
  it("keeps a pending multiplier across reload and shows the activated policy after a later read", async () => {
    const ratingRevision = "c".repeat(64);
    const active = { version: 1, state: "active" as const, effectiveNotBefore: "2026-10-20T00:00:00.000Z", multipliers: { vless: "1.0", hy2: "1.0", tuic: "1.0" } };
    const value = { ...fixture(), protocolRating: { installed: true, revision: ratingRevision, active, pending: null } };
    const pending = { version: 2, state: "pending" as const, effectiveNotBefore: "2026-10-20T01:00:00.000Z", multipliers: { vless: "1.0", hy2: "2.5", tuic: "1.0" } };
    const client = makeClient(value);
    client.saveProtocolRating = vi.fn().mockImplementation(async (input: { vless: string; hy2: string; tuic: string }) => ({
      ...structuredClone(value),
      protocolRating: { installed: true, revision: "d".repeat(64), active, pending: { ...pending, multipliers: { vless: input.vless, hy2: input.hy2, tuic: input.tuic } } }
    }));
    await loaded(client);
    const region = screen.getByRole("region", { name: "协议用量倍率" });
    fireEvent.change(within(region).getByRole("spinbutton", { name: "hy2 用量倍率" }), { target: { value: "2.5" } });
    expect(client.saveProtocolRating).not.toHaveBeenCalled();
    fireEvent.click(within(region).getByRole("button", { name: "保存协议倍率" }));
    fireEvent.click(screen.getByRole("button", { name: "确认保存" }));
    await screen.findByText("协议倍率已保存为待生效，只影响之后的新用量。");
    expect(within(region).getByText(/待生效倍率：VLESS 1.0，Hysteria2 2.5，TUIC 1.0。策略边界 2026-10-20T01:00:00.000Z/)).toBeTruthy();
    client.read.mockResolvedValueOnce({ ...structuredClone(value), protocolRating: { installed: true, revision: "d".repeat(64), active, pending } });
    await waitFor(() => expect((within(region).getByRole("spinbutton", { name: "hy2 用量倍率" }) as HTMLInputElement).disabled).toBe(false));
    fireEvent.click(screen.getByRole("button", { name: "重新读取分发" }));
    const discardPending = screen.queryByRole("button", { name: "放弃草稿并重新读取" });
    if (discardPending) fireEvent.click(discardPending);
    await screen.findByText("已读取当前分发设置。");
    expect(within(region).getByText(/状态：待生效/)).toBeTruthy();
    expect(client.saveProtocolRating).toHaveBeenCalledOnce();
    client.read.mockResolvedValueOnce({
      ...structuredClone(value),
      protocolRating: { installed: true, revision: "e".repeat(64), active: { ...active, multipliers: pending.multipliers, effectiveNotBefore: pending.effectiveNotBefore }, pending: null }
    });
    await waitFor(() => expect((within(region).getByRole("spinbutton", { name: "hy2 用量倍率" }) as HTMLInputElement).disabled).toBe(false));
    fireEvent.click(screen.getByRole("button", { name: "重新读取分发" }));
    const discardActive = screen.queryByRole("button", { name: "放弃草稿并重新读取" });
    if (discardActive) fireEvent.click(discardActive);
    await screen.findByText(/已生效倍率：VLESS 1.0，Hysteria2 2.5，TUIC 1.0。策略边界 2026-10-20T01:00:00.000Z/);
    expect(within(region).getByText(/状态：已生效/)).toBeTruthy();
    expect(within(region).getByText("待生效倍率：没有待生效倍率。")).toBeTruthy();
    expect(client.saveProtocolRating).toHaveBeenCalledOnce();
    expect(client.setBwhSupply).not.toHaveBeenCalled();
  });
  it.each(["stale", "network"] as const)("reports a %s rating save in operator language and reads again without resubmitting", async (code) => {
    const ratingRevision = "c".repeat(64);
    const value = { ...fixture(), protocolRating: { installed: true, revision: ratingRevision, active: { version: 1, state: "active" as const, effectiveNotBefore: "2026-10-20T00:00:00.000Z", multipliers: { vless: "1.0", hy2: "1.0", tuic: "1.0" } }, pending: null } };
    const client = makeClient(value);
    client.saveProtocolRating = vi.fn().mockRejectedValue(new DistributionError(code));
    await loaded(client);
    const region = screen.getByRole("region", { name: "协议用量倍率" });
    fireEvent.change(within(region).getByRole("spinbutton", { name: "hy2 用量倍率" }), { target: { value: "2.5" } });
    fireEvent.click(within(region).getByRole("button", { name: "保存协议倍率" }));
    fireEvent.click(screen.getByRole("button", { name: "确认保存" }));
    await screen.findByText(code === "stale"
      ? "协议倍率版本已经变化。请重新读取后再保存。本次不会覆盖最新倍率，也不会暂停或恢复供流。"
      : "协议倍率保存结果未确认。请先重新读取，不会自动再次提交，也不会暂停或恢复供流。");
    expect(client.saveProtocolRating).toHaveBeenCalledOnce();
    expect((within(region).getByRole("button", { name: "保存协议倍率" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "重新读取分发" }));
    fireEvent.click(screen.getByRole("button", { name: "放弃草稿并重新读取" }));
    await screen.findByText("已读取当前分发设置。");
    expect(client.saveProtocolRating).toHaveBeenCalledOnce();
    expect(client.read).toHaveBeenCalledTimes(2);
    expect(client.setBwhSupply).not.toHaveBeenCalled();
  });
  it("does not lose its initial read in StrictMode cleanup", async () => {
    const client = makeClient(); render(<StrictMode><SubscriptionDistributionPanel client={client} /></StrictMode>);
    await screen.findByText("已读取当前分发设置。"); expect(screen.getByRole("radio", { name: "自有节点" })).toBeTruthy();
  });
});
