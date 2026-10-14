import "@testing-library/jest-dom/vitest";
import { StrictMode } from "react";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { ThirdPartyAdminWorkspace } from "../features/third-party-node-names/third-party-admin-workspace";
import { ThirdPartyAdminError } from "../features/third-party-node-names/third-party-admin-client";
import type { ThirdPartyAdminClient, ThirdPartyNodeSnapshot, ThirdPartySource } from "../features/third-party-node-names/third-party-admin-client";

vi.mock("../features/third-party-node-names/third-party-node-names-page", async (original) => {
  const actual = await original<typeof import("../features/third-party-node-names/third-party-node-names-page")>();
  return { ...actual, ThirdPartyNodeNamesPage: (props: Parameters<typeof actual.ThirdPartyNodeNamesPage>[0]) => {
    const request = (ids: readonly string[]) => (props.persistence as typeof props.persistence & { onDeleteNodes?: (ids: readonly string[]) => void })?.onDeleteNodes?.(ids);
    return <><actual.ThirdPartyNodeNamesPage {...props} />
      <button onClick={() => request(props.initialNodes.map((node) => node.id))}>test request bulk</button>
      <button onClick={() => request([props.initialNodes[0]?.id ?? "", `tpnode_${"f".repeat(32)}`])}>test request foreign</button>
      <button onClick={() => request([props.initialNodes[0]?.id ?? "", props.initialNodes[0]?.id ?? ""])}>test request duplicate</button>
    </>;
  } };
});

const OLD = `tpsrc_${"a".repeat(32)}`;
const NEW = `tpsrc_${"b".repeat(32)}`;
const A = `tpnode_${"a".repeat(32)}`;
const B = `tpnode_${"b".repeat(32)}`;
const R1 = "a".repeat(64), R2 = "b".repeat(64), R3 = "c".repeat(64);
const KEY = "gccwebos.admin.third-party.selected-source.v1";
const source = (id: string, name = "合成来源"): ThirdPartySource => ({ id, name, enabled: true, tiers: ["monthly_basic"], sourceKind: "inline-yaml" });
const NODES: ThirdPartyNodeSnapshot["items"] = [
  { id: A, sourceName: "", originalName: "合成甲", defaultName: "合成甲", customName: null, countryCode: "US", protocol: "VLESS", enabled: false },
  { id: B, sourceName: "", originalName: "合成乙", defaultName: "合成乙", customName: null, countryCode: "US", protocol: "VLESS", enabled: false }
];
const snapshot = (sourceId = NEW, items = NODES, revision = R1): ThirdPartyNodeSnapshot => ({ sourceId, items, revision, enabled: true });
function fixture() {
  let current = snapshot();
  return {
    listSources: vi.fn<ThirdPartyAdminClient["listSources"]>().mockResolvedValue([source(NEW)]),
    listNodes: vi.fn<ThirdPartyAdminClient["listNodes"]>().mockImplementation(async () => current),
    saveNodes: vi.fn(), enableSource: vi.fn(), disableSource: vi.fn(), importYaml: vi.fn(), setNodeEnabled: vi.fn(),
    deleteNode: vi.fn<NonNullable<ThirdPartyAdminClient["deleteNode"]>>().mockImplementation(async (_source, nodeId, revision) => {
      if (revision !== current.revision) throw new ThirdPartyAdminError("revision_conflict");
      current = { ...current, revision: revision === R1 ? R2 : R3, items: current.items.filter((node) => node.id !== nodeId) };
      return current;
    })
  };
}
beforeEach(() => sessionStorage.clear());
afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); sessionStorage.clear(); });
async function mount(client = fixture()) {
  const mounted = render(<ThirdPartyAdminWorkspace client={client} />);
  await screen.findByRole("button", { name: "删除 合成甲" });
  return { client, ...mounted };
}
function requestBulk() { fireEvent.click(screen.getByRole("button", { name: "test request bulk" })); }
function confirmBulk() {
  const dialog = screen.getByRole("dialog", { name: "确认批量删除节点" });
  fireEvent.click(within(dialog).getByRole("button", { name: "确认批量删除" }));
}
function deferred<T>() { let resolve!: (v: T) => void; const promise = new Promise<T>((done) => { resolve = done; }); return { promise, resolve }; }

test("refresh restores selected valid source and distinguishes duplicate names", async () => {
  const client = fixture();
  client.listSources.mockResolvedValue([source(OLD), source(NEW)]);
  client.listNodes.mockImplementation(async (id) => snapshot(id, id === OLD ? [] : NODES));
  const page = render(<ThirdPartyAdminWorkspace client={client} />);
  await screen.findByRole("heading", { name: "暂无节点" });
  expect(screen.getByText(/当前来源.*合成来源.*暂无节点/)).toBeInTheDocument();
  const select = screen.getByRole("combobox", { name: "第三方来源" });
  const names = within(select).getAllByRole("option").slice(1).map((option) => option.textContent);
  expect(new Set(names).size).toBe(2);
  fireEvent.change(select, { target: { value: NEW } });
  await screen.findByRole("button", { name: "删除 合成甲" });
  expect(JSON.parse(sessionStorage.getItem(KEY)!)).toEqual({ version: 1, sourceId: NEW });
  page.unmount();
  render(<ThirdPartyAdminWorkspace client={client} />);
  await screen.findByRole("button", { name: "删除 合成甲" });
  expect(screen.getByRole("combobox", { name: "第三方来源" })).toHaveValue(NEW);
});

test.each(["malformed", JSON.stringify({ version: 1, sourceId: OLD }), JSON.stringify({ version: 2, sourceId: NEW }), JSON.stringify({ version: 1, sourceId: NEW, secret: "synthetic-extra" })])("untrusted stored selection falls back safely: %s", async (stored) => {
  sessionStorage.setItem(KEY, stored);
  const { client } = await mount();
  expect(client.listNodes).toHaveBeenCalledWith(NEW, expect.any(AbortSignal));
  expect(JSON.parse(sessionStorage.getItem(KEY)!)).toEqual({ version: 1, sourceId: NEW });
});

test("unavailable sessionStorage never breaks a successful read", async () => {
  vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("unavailable"); });
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("unavailable"); });
  await mount();
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
});

test.each(["session", "permission"] as const)("%s rejection clears remembered selection", async (code) => {
  const { client } = await mount();
  client.listSources.mockRejectedValue(new ThirdPartyAdminError(code));
  fireEvent.click(screen.getByRole("button", { name: "重新读取" }));
  await screen.findByRole("alert");
  expect(sessionStorage.getItem(KEY)).toBeNull();
});

test("bulk delete confirms exact count then serially uses fresh revisions and no pause calls", async () => {
  const { client } = await mount();
  requestBulk();
  expect(client.deleteNode).not.toHaveBeenCalled();
  const confirmation = within(screen.getByRole("dialog", { name: "确认批量删除节点" }));
  expect(confirmation.getByText(/来源「合成来源」.*2 个/)).toBeInTheDocument();
  expect(confirmation.getAllByRole("listitem").map((item) => item.textContent)).toEqual(["合成甲", "合成乙"]);
  confirmBulk();
  await screen.findByText(/已确认删除 2\/2 个节点/);
  expect(client.deleteNode.mock.calls.map(([id, node, revision]) => [id, node, revision])).toEqual([[NEW, A, R1], [NEW, B, R2]]);
  expect(client.setNodeEnabled).not.toHaveBeenCalled();
  expect(client.disableSource).not.toHaveBeenCalled();
  expect(screen.queryByRole("button", { name: "删除 合成甲" })).not.toBeInTheDocument();
});

test("cancel, foreign IDs, duplicates, and enabled selection issue no delete", async () => {
  const { client } = await mount();
  requestBulk();
  fireEvent.click(within(screen.getByRole("dialog", { name: "确认批量删除节点" })).getByRole("button", { name: "取消" }));
  fireEvent.click(screen.getByRole("button", { name: "test request foreign" }));
  expect(screen.queryByRole("dialog", { name: "确认批量删除节点" })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "test request duplicate" }));
  expect(client.deleteNode).not.toHaveBeenCalled();
  cleanup();
  client.listNodes.mockResolvedValue(snapshot(NEW, NODES.map((node, index) => ({ ...node, enabled: index === 0 }))));
  await mount(client);
  requestBulk();
  expect(screen.queryByRole("dialog", { name: "确认批量删除节点" })).not.toBeInTheDocument();
  expect(client.deleteNode).not.toHaveBeenCalled();
});

test("partial conflict retains first deletion and locks writes without reporting total success", async () => {
  const { client } = await mount();
  client.deleteNode.mockResolvedValueOnce(snapshot(NEW, [NODES[1]], R2)).mockRejectedValueOnce(new ThirdPartyAdminError("revision_conflict"));
  requestBulk(); confirmBulk();
  await screen.findByText(/已确认删除 1\/2 个节点.*未确认/);
  expect(client.deleteNode).toHaveBeenCalledTimes(2);
  expect(screen.queryByRole("button", { name: "删除 合成甲" })).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "删除 合成乙" })).toBeDisabled();
  expect(screen.queryByText(/已确认删除 2\/2/)).not.toBeInTheDocument();
});

test("timeout after first success stops, preserves progress, ignores late second response and never retries", async () => {
  const client = fixture();
  const third = { ...NODES[1], id: `tpnode_${"c".repeat(32)}`, originalName: "合成丙", defaultName: "合成丙" };
  client.listNodes.mockResolvedValue(snapshot(NEW, [...NODES, third]));
  await mount(client);
  const pending = deferred<ThirdPartyNodeSnapshot>();
  client.deleteNode.mockResolvedValueOnce(snapshot(NEW, [NODES[1], third], R2)).mockReturnValueOnce(pending.promise);
  requestBulk(); vi.useFakeTimers(); confirmBulk();
  await act(async () => { await Promise.resolve(); await Promise.resolve(); });
  expect(client.deleteNode).toHaveBeenCalledTimes(2);
  await act(async () => { await vi.advanceTimersByTimeAsync(15000); });
  expect(screen.getByText(/已确认删除 1\/3 个节点.*未确认/)).toBeInTheDocument();
  expect(client.deleteNode.mock.calls[1][3]?.aborted).toBe(true);
  await act(async () => pending.resolve(snapshot(NEW, [third], R3)));
  expect(screen.getByRole("button", { name: "删除 合成乙" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "删除 合成丙" })).toBeDisabled();
  expect(client.deleteNode).toHaveBeenCalledTimes(2);
});

test.each(["session", "permission"] as const)("%s rejection after first deletion clears data and does not restore a partial success message", async (code) => {
  const { client } = await mount();
  client.deleteNode.mockResolvedValueOnce(snapshot(NEW, [NODES[1]], R2)).mockRejectedValueOnce(new ThirdPartyAdminError(code));
  requestBulk(); confirmBulk();
  await screen.findByText(code === "session" ? "Admin 登录已失效，请重新登录。" : "当前账户没有此操作的 Admin 权限。");
  expect(sessionStorage.getItem(KEY)).toBeNull();
  expect(screen.queryByText(/已确认删除/)).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "删除 合成乙" })).not.toBeInTheDocument();
});

test("pending confirmation is invalidated by a source reload; unmount stops later requests", async () => {
  const { client, unmount } = await mount();
  requestBulk();
  fireEvent.click(screen.getByRole("button", { name: "重新读取" }));
  await waitFor(() => expect(screen.queryByRole("dialog", { name: "确认批量删除节点" })).not.toBeInTheDocument());
  expect(client.deleteNode).not.toHaveBeenCalled();
  const pending = deferred<ThirdPartyNodeSnapshot>();
  client.deleteNode.mockReturnValueOnce(pending.promise);
  requestBulk(); confirmBulk();
  unmount();
  await act(async () => pending.resolve(snapshot(NEW, [NODES[1]], R2)));
  expect(client.deleteNode).toHaveBeenCalledTimes(1);
  expect(client.deleteNode.mock.calls[0][3]?.aborted).toBe(true);
});

test("duplicate confirmation and new selections cannot interleave while a batch is in flight", async () => {
  const { client } = await mount();
  const pending = deferred<ThirdPartyNodeSnapshot>();
  client.deleteNode.mockReturnValueOnce(pending.promise);
  requestBulk();
  const button = within(screen.getByRole("dialog", { name: "确认批量删除节点" })).getByRole("button", { name: "确认批量删除" });
  fireEvent.click(button); fireEvent.click(button); requestBulk();
  expect(client.deleteNode).toHaveBeenCalledTimes(1);
  expect(screen.queryByRole("dialog", { name: "确认批量删除节点" })).not.toBeInTheDocument();
  expect(screen.getByRole("combobox", { name: "第三方来源" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "重新读取" })).toBeDisabled();
  client.deleteNode.mockResolvedValueOnce(snapshot(NEW, [], R3));
  await act(async () => pending.resolve(snapshot(NEW, [NODES[1]], R2)));
  await screen.findByText(/已确认删除 2\/2 个节点/);
  expect(client.deleteNode).toHaveBeenCalledTimes(2);
});

test("changing source invalidates its prior confirmation without deleting from either source", async () => {
  const client = fixture();
  client.listSources.mockResolvedValue([source(NEW), source(OLD)]);
  client.listNodes.mockImplementation(async (id) => snapshot(id));
  await mount(client);
  requestBulk();
  fireEvent.change(screen.getByRole("combobox", { name: "第三方来源" }), { target: { value: OLD } });
  await waitFor(() => expect(screen.getByRole("combobox", { name: "第三方来源" })).toHaveValue(OLD));
  expect(screen.queryByRole("dialog", { name: "确认批量删除节点" })).not.toBeInTheDocument();
  expect(client.deleteNode).not.toHaveBeenCalled();
});

test("a broader mutation response stops the batch before confirming any deletion", async () => {
  const { client } = await mount();
  client.deleteNode.mockResolvedValueOnce(snapshot(NEW, [{ ...NODES[1], enabled: true }], R2));
  requestBulk(); confirmBulk();
  await screen.findByText(/已确认删除 0\/2 个节点.*未确认/);
  expect(client.deleteNode).toHaveBeenCalledTimes(1);
  expect(screen.getByRole("button", { name: "删除 合成甲" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "删除 合成乙" })).toBeDisabled();
});

test("stored remote sources are never used for an inline read and failed switches are not remembered", async () => {
  sessionStorage.setItem(KEY, JSON.stringify({ version: 1, sourceId: OLD }));
  const client = fixture();
  client.listSources.mockResolvedValue([{ ...source(OLD), sourceKind: "remote" }, source(NEW)]);
  await mount(client);
  expect(client.listNodes).toHaveBeenCalledWith(NEW, expect.any(AbortSignal));
  client.listSources.mockResolvedValue([source(OLD), source(NEW)]);
  fireEvent.click(screen.getByRole("button", { name: "重新读取" }));
  await waitFor(() => expect(screen.getByRole("combobox", { name: "第三方来源" })).toBeEnabled());
  client.listNodes.mockRejectedValueOnce(new ThirdPartyAdminError("network"));
  fireEvent.change(screen.getByRole("combobox", { name: "第三方来源" }), { target: { value: OLD } });
  await screen.findByRole("alert");
  expect(JSON.parse(sessionStorage.getItem(KEY)!)).toEqual({ version: 1, sourceId: NEW });
});

test("StrictMode initialization restores only a confirmed source and performs no mutations", async () => {
  sessionStorage.setItem(KEY, JSON.stringify({ version: 1, sourceId: NEW }));
  const client = fixture();
  client.listSources.mockResolvedValue([source(OLD), source(NEW)]);
  render(<StrictMode><ThirdPartyAdminWorkspace client={client} /></StrictMode>);
  await screen.findByRole("button", { name: "删除 合成甲" });
  expect(client.listNodes).toHaveBeenCalledTimes(1);
  expect(client.listNodes).toHaveBeenCalledWith(NEW, expect.any(AbortSignal));
  expect(client.deleteNode).not.toHaveBeenCalled();
  expect(client.saveNodes).not.toHaveBeenCalled();
});

test("confirmed import remembers its newly returned source, not the old empty source", async () => {
  const client = fixture();
  client.listSources.mockResolvedValue([source(OLD)]);
  client.listNodes.mockImplementation(async (id) => snapshot(id, id === OLD ? [] : NODES));
  client.importYaml.mockResolvedValue({ ...source(NEW), name: "新来源", enabled: false });
  render(<ThirdPartyAdminWorkspace client={client} />);
  await screen.findByRole("heading", { name: "暂无节点" });
  fireEvent.click(screen.getByRole("button", { name: "导入" }));
  const dialog = within(screen.getByRole("dialog", { name: "导入第三方节点" }));
  fireEvent.change(dialog.getByRole("textbox", { name: "来源名称" }), { target: { value: "新来源" } });
  const file = new File(["proxies: []"], "synthetic.yaml", { type: "text/yaml" });
  Object.defineProperty(file, "text", { value: async () => "proxies: []" });
  fireEvent.change(dialog.getByLabelText("YAML 文件"), { target: { files: [file] } });
  fireEvent.click(dialog.getByRole("checkbox", { name: "基础月卡" }));
  fireEvent.click(dialog.getByRole("button", { name: "导入并保持停用" }));
  await screen.findByText("来源已导入并保持停用，请核对节点后启用。");
  expect(JSON.parse(sessionStorage.getItem(KEY)!)).toEqual({ version: 1, sourceId: NEW });
  expect(screen.getByRole("combobox", { name: "第三方来源" })).toHaveValue(NEW);
});
