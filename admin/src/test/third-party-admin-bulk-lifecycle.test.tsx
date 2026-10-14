import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { ThirdPartyAdminWorkspace } from "../features/third-party-node-names/third-party-admin-workspace";
import { ThirdPartyAdminError } from "../features/third-party-node-names/third-party-admin-client";
import type { ThirdPartyAdminClient, ThirdPartyNodeSnapshot } from "../features/third-party-node-names/third-party-admin-client";

const SOURCE = `tpsrc_${"a".repeat(32)}`;
const ids = ["a", "b", "c"].map((char) => `tpnode_${char.repeat(32)}`);
const revision = (value: number) => value.toString(16).padStart(64, "0");
function fixture(enabled = [true, true, true], sourceEnabled = true) {
  let serial = 1;
  let view: ThirdPartyNodeSnapshot = { sourceId: SOURCE, enabled: sourceEnabled, revision: revision(serial),
    items: ids.map((id, index) => ({ id, sourceName: "", originalName: `合成${index + 1}`, defaultName: `合成${index + 1}`,
      customName: null, countryCode: "US", protocol: "VLESS", enabled: enabled[index] })) };
  const client = {
    listSources: vi.fn().mockResolvedValue([{ id: SOURCE, name: "合成来源", enabled: sourceEnabled, tiers: ["monthly_basic"], sourceKind: "inline-yaml" }]),
    listNodes: vi.fn().mockImplementation(async () => view),
    saveNodes: vi.fn(), enableSource: vi.fn(), disableSource: vi.fn(), importYaml: vi.fn(), deleteNode: vi.fn(),
    setNodeEnabled: vi.fn<NonNullable<ThirdPartyAdminClient["setNodeEnabled"]>>().mockImplementation(async (source, id, expected, value) => {
      if (source !== SOURCE || expected !== view.revision) throw new ThirdPartyAdminError("revision_conflict");
      view = { ...view, revision: revision(++serial), items: view.items.map((node) => node.id === id ? { ...node, enabled: value } : node) };
      return view;
    })
  };
  return { client, snapshot: () => view };
}
afterEach(() => { cleanup(); vi.useRealTimers(); sessionStorage.clear(); });
async function mount(setup = fixture()) {
  const rendered = render(<ThirdPartyAdminWorkspace client={setup.client} />);
  await screen.findByRole("checkbox", { name: "选择 合成1" });
  return { ...setup, ...rendered };
}
function select(...indices: number[]) {
  for (const index of indices) fireEvent.click(screen.getByRole("checkbox", { name: `选择 合成${index}` }));
}
function request(enabled = false) {
  fireEvent.click(screen.getByRole("button", { name: enabled ? "启用选中节点" : "暂停选中节点" }));
}
function confirm(enabled = false) {
  const title = enabled ? "确认启用节点" : "确认暂停节点";
  fireEvent.click(within(screen.getByRole("dialog", { name: title })).getByRole("button", { name: title }));
}
function deferred<T>() { let resolve!: (v: T) => void; const promise = new Promise<T>((done) => { resolve = done; }); return { resolve, promise }; }

test("selected pause uses a frozen exact list and serial revisions without changing the source or other nodes", async () => {
  const { client } = await mount();
  select(1, 2); request();
  expect(within(screen.getByRole("dialog", { name: "确认暂停节点" })).getAllByRole("listitem").map((item) => item.textContent)).toEqual(["合成1", "合成2"]);
  expect(client.setNodeEnabled).not.toHaveBeenCalled();
  confirm();
  await screen.findByText(/已确认暂停 2\/2 个节点/);
  expect(client.setNodeEnabled.mock.calls.map(([source, node, rev, enabled]) => [source, node, rev, enabled])).toEqual([
    [SOURCE, ids[0], revision(1), false], [SOURCE, ids[1], revision(2), false]
  ]);
  expect(within(screen.getByRole("checkbox", { name: "选择 合成3" }).closest("tr")!).getByText("分发中")).toBeInTheDocument();
  expect(client.disableSource).not.toHaveBeenCalled();
  expect(client.deleteNode).not.toHaveBeenCalled();
  expect(screen.getByRole("button", { name: "暂停选中节点" })).toBeDisabled(); // remount clears selection
});

test.each([true, false])("mixed selection skips already matching nodes for enabled=%s", async (enabled) => {
  const { client } = await mount(fixture([true, false, true], false));
  select(1, 2); request(enabled); confirm(enabled);
  await screen.findByText(enabled ? /已确认启用 1\/1/ : /已确认暂停 1\/1/);
  expect(client.setNodeEnabled).toHaveBeenCalledExactlyOnceWith(SOURCE, enabled ? ids[1] : ids[0], revision(1), enabled, expect.any(AbortSignal));
  expect(client.enableSource).not.toHaveBeenCalled();
  expect(client.disableSource).not.toHaveBeenCalled();
  expect(screen.getByRole("button", { name: "启用节点列表" })).toBeEnabled(); // source remains paused
});

test.each([true, false])("each selected lifecycle request gets its own deadline when the total exceeds 15 seconds: enabled=%s", async (enabled) => {
  const { client } = await mount(fixture([!enabled, !enabled, !enabled]));
  const apply = client.setNodeEnabled.getMockImplementation()!;
  client.setNodeEnabled.mockImplementation(async (...args) => {
    await new Promise<void>((resolve) => window.setTimeout(resolve, 6000));
    return apply(...args);
  });
  select(1, 2, 3); request(enabled); vi.useFakeTimers(); confirm(enabled);
  await act(async () => { await vi.advanceTimersByTimeAsync(6000); });
  expect(client.setNodeEnabled).toHaveBeenCalledTimes(2);
  await act(async () => { await vi.advanceTimersByTimeAsync(6000); });
  expect(client.setNodeEnabled).toHaveBeenCalledTimes(3);
  await act(async () => { await vi.advanceTimersByTimeAsync(6000); });
  expect(screen.getByText(enabled ? /已确认启用 3\/3 个节点/ : /已确认暂停 3\/3 个节点/)).toBeInTheDocument();
  expect(client.setNodeEnabled.mock.calls.map(([source, node, rev, value]) => [source, node, rev, value])).toEqual([
    [SOURCE, ids[0], revision(1), enabled], [SOURCE, ids[1], revision(2), enabled], [SOURCE, ids[2], revision(3), enabled]
  ]);
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  expect(client.enableSource).not.toHaveBeenCalled();
  expect(client.disableSource).not.toHaveBeenCalled();
});

test("a later lifecycle request has 15 seconds of its own before abort, preserving confirmed progress and ignoring its late reply", async () => {
  const { client, snapshot } = await mount();
  const first = { ...snapshot(), revision: revision(2), items: snapshot().items.map((node, index) => index === 0 ? { ...node, enabled: false } : node) };
  const second = { ...first, revision: revision(3), items: first.items.map((node, index) => index === 1 ? { ...node, enabled: false } : node) };
  const pending = deferred<ThirdPartyNodeSnapshot>();
  client.setNodeEnabled.mockImplementationOnce(async () => {
    await new Promise<void>((resolve) => window.setTimeout(resolve, 8000));
    return first;
  }).mockReturnValueOnce(pending.promise);
  select(1, 2, 3); request(); vi.useFakeTimers(); confirm();
  await act(async () => { await vi.advanceTimersByTimeAsync(8000); });
  expect(client.setNodeEnabled).toHaveBeenCalledTimes(2);
  await act(async () => { await vi.advanceTimersByTimeAsync(14999); });
  expect(client.setNodeEnabled.mock.calls[1][4]?.aborted).toBe(false);
  expect(screen.queryByText(/已确认暂停 1\/3 个节点.*未确认/)).not.toBeInTheDocument();
  await act(async () => { await vi.advanceTimersByTimeAsync(1); });
  expect(client.setNodeEnabled.mock.calls[1][4]?.aborted).toBe(true);
  expect(screen.getByText(/已确认暂停 1\/3 个节点.*未确认/)).toBeInTheDocument();
  await act(async () => pending.resolve(second));
  expect(client.setNodeEnabled).toHaveBeenCalledTimes(2);
  expect(within(screen.getByRole("checkbox", { name: "选择 合成1" }).closest("tr")!).getByText("已停用")).toBeInTheDocument();
  expect(within(screen.getByRole("checkbox", { name: "选择 合成2" }).closest("tr")!).getByText("分发中")).toBeInTheDocument();
  expect(screen.getByRole("checkbox", { name: "选择 合成3" })).toBeDisabled();
});

test("cancel and a read while confirmation is open never write", async () => {
  const { client } = await mount(); select(1); request();
  fireEvent.click(within(screen.getByRole("dialog", { name: "确认暂停节点" })).getByRole("button", { name: "取消" }));
  expect(client.setNodeEnabled).not.toHaveBeenCalled();
  request();
  fireEvent.click(screen.getByRole("button", { name: "重新读取" }));
  await waitFor(() => expect(screen.queryByRole("dialog", { name: "确认暂停节点" })).not.toBeInTheDocument());
  expect(client.setNodeEnabled).not.toHaveBeenCalled();
});

test("partial conflict retains the confirmed node and locks all remaining actions", async () => {
  const { client, snapshot } = await mount();
  const first = { ...snapshot(), revision: revision(2), items: snapshot().items.map((node, index) => index === 0 ? { ...node, enabled: false } : node) };
  client.setNodeEnabled.mockResolvedValueOnce(first).mockRejectedValueOnce(new ThirdPartyAdminError("revision_conflict"));
  select(1, 2, 3); request(); confirm();
  await screen.findByText(/已确认暂停 1\/3 个节点.*未确认/);
  expect(client.setNodeEnabled).toHaveBeenCalledTimes(2);
  expect(within(screen.getByRole("checkbox", { name: "选择 合成1" }).closest("tr")!).getByText("已停用")).toBeInTheDocument();
  expect(screen.getByRole("checkbox", { name: "选择 合成2" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "暂停来源" })).toBeDisabled();
});

test("a broader pause reply is not confirmed and never touches the next selected node", async () => {
  const { client, snapshot } = await mount();
  client.setNodeEnabled.mockResolvedValueOnce({ ...snapshot(), revision: revision(2), items: snapshot().items.map((node) => ({ ...node, enabled: false })) });
  select(1, 2); request(); confirm();
  await screen.findByText(/已确认暂停 0\/2 个节点.*未确认/);
  expect(client.setNodeEnabled).toHaveBeenCalledTimes(1);
});

test.each(["session", "permission"] as const)("%s during the second pause clears data and progress without retries", async (code) => {
  const { client, snapshot } = await mount();
  client.setNodeEnabled.mockResolvedValueOnce({ ...snapshot(), revision: revision(2), items: snapshot().items.map((node, index) => index === 0 ? { ...node, enabled: false } : node) })
    .mockRejectedValueOnce(new ThirdPartyAdminError(code));
  select(1, 2, 3); request(); confirm();
  await screen.findByText(code === "session" ? "Admin 登录已失效，请重新登录。" : "当前账户没有此操作的 Admin 权限。");
  expect(client.setNodeEnabled).toHaveBeenCalledTimes(2);
  expect(screen.queryByText(/已确认暂停/)).not.toBeInTheDocument();
  expect(screen.queryByRole("checkbox", { name: "选择 合成1" })).not.toBeInTheDocument();
});

test.each(["timeout", "unmount"])("%s rejects a late pause without launching the next request", async (mode) => {
  const { client, snapshot, unmount } = await mount();
  const pending = deferred<ThirdPartyNodeSnapshot>();
  const reply = { ...snapshot(), revision: revision(2), items: snapshot().items.map((node, index) => index === 0 ? { ...node, enabled: false } : node) };
  client.setNodeEnabled.mockReturnValueOnce(pending.promise);
  select(1, 2); request(); vi.useFakeTimers(); confirm();
  if (mode === "timeout") {
    await act(async () => { await vi.advanceTimersByTimeAsync(15000); });
    expect(screen.getByText(/已确认暂停 0\/2 个节点.*未确认/)).toBeInTheDocument();
  } else unmount();
  await act(async () => pending.resolve(reply));
  expect(client.setNodeEnabled).toHaveBeenCalledTimes(1);
  expect(client.setNodeEnabled.mock.calls[0][4]?.aborted).toBe(true);
});
