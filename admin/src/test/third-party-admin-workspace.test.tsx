import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";
import { ThirdPartyAdminWorkspace } from "../features/third-party-node-names/third-party-admin-workspace";
import { ThirdPartyAdminError } from "../features/third-party-node-names/third-party-admin-client";
import type { ThirdPartyAdminClient, ThirdPartyNodeSnapshot, ThirdPartySource } from "../features/third-party-node-names/third-party-admin-client";

const SOURCE_ID = `tpsrc_${"a".repeat(32)}`;
const NEXT_SOURCE_ID = `tpsrc_${"b".repeat(32)}`;
const NODE_ID = `tpnode_${"a".repeat(32)}`;
const SECOND_NODE_ID = `tpnode_${"b".repeat(32)}`;
const REVISION = "a".repeat(64);
const NEXT_REVISION = "b".repeat(64);
const SAVED_REVISION = "c".repeat(64);
const SOURCE: ThirdPartySource = { id: SOURCE_ID, name: "合成来源", enabled: false, tiers: ["monthly_basic"], sourceKind: "inline-yaml" };
const NODES: ThirdPartyNodeSnapshot["items"] = [
  { id: NODE_ID, sourceName: "", originalName: "原始日本", defaultName: "[3P] JP 1 | 原始日本", customName: null, countryCode: "JP", protocol: "VLESS", enabled: true },
  { id: SECOND_NODE_ID, sourceName: "", originalName: "原始美国", defaultName: "[3P] US 1 | 原始美国", customName: null, countryCode: "US", protocol: "Hy2", enabled: true }
];
const SNAPSHOT: ThirdPartyNodeSnapshot = { sourceId: SOURCE_ID, revision: REVISION, enabled: false, items: NODES };

afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); });

function fakeClient(enabled = false) {
  return {
    listSources: vi.fn<ThirdPartyAdminClient["listSources"]>().mockResolvedValue([{ ...SOURCE, enabled }]),
    listNodes: vi.fn<ThirdPartyAdminClient["listNodes"]>().mockResolvedValue({ ...SNAPSHOT, enabled }),
    saveNodes: vi.fn<ThirdPartyAdminClient["saveNodes"]>().mockResolvedValue({ ...SNAPSHOT, revision: NEXT_REVISION }),
    enableSource: vi.fn<ThirdPartyAdminClient["enableSource"]>().mockResolvedValue({ ...SNAPSHOT, revision: NEXT_REVISION, enabled: true }),
    disableSource: vi.fn<ThirdPartyAdminClient["disableSource"]>().mockResolvedValue(SOURCE),
    setNodeEnabled: vi.fn<NonNullable<ThirdPartyAdminClient["setNodeEnabled"]>>().mockImplementation(async (_source, nodeId, _revision, nodeEnabled) => ({
      ...SNAPSHOT, enabled, revision: NEXT_REVISION, items: NODES.map((node) => node.id === nodeId ? { ...node, enabled: nodeEnabled } : node)
    })),
    deleteNode: vi.fn<NonNullable<ThirdPartyAdminClient["deleteNode"]>>().mockResolvedValue({ ...SNAPSHOT, enabled, revision: SAVED_REVISION, items: [NODES[1]] }),
    importYaml: vi.fn<ThirdPartyAdminClient["importYaml"]>().mockResolvedValue({ ...SOURCE, id: NEXT_SOURCE_ID, name: "新导入来源" })
  };
}

async function mount(client = fakeClient(), onSessionExpired?: () => void) {
  const rendered = render(<ThirdPartyAdminWorkspace client={client} onSessionExpired={onSessionExpired} />);
  await screen.findByRole("button", { name: "编辑 原始日本" });
  return { client, ...rendered };
}

function editAlias(value = "自定义日本") {
  fireEvent.click(screen.getByRole("button", { name: "编辑 原始日本" }));
  fireEvent.change(screen.getByRole("textbox", { name: "对外显示名称" }), { target: { value } });
  fireEvent.click(screen.getByRole("button", { name: "应用到待保存列表" }));
}

function rereadWithDiscard() {
  fireEvent.click(screen.getByRole("button", { name: "重新读取" }));
  const confirm = screen.queryByRole("dialog", { name: "放弃未保存修改？" });
  if (confirm) fireEvent.click(within(confirm).getByRole("button", { name: "确认重新读取" }));
}

function submitSyntheticImport() {
  fireEvent.click(screen.getByRole("button", { name: "导入" }));
  const dialog = screen.getByRole("dialog", { name: "导入第三方节点" });
  fireEvent.change(within(dialog).getByRole("textbox", { name: "来源名称" }), { target: { value: "新导入来源" } });
  const file = new File(["proxies: []"], "synthetic.yaml", { type: "text/yaml" });
  Object.defineProperty(file, "text", { value: async () => "proxies: []" });
  fireEvent.change(within(dialog).getByLabelText("YAML 文件"), { target: { files: [file] } });
  fireEvent.click(within(dialog).getByRole("checkbox", { name: "基础月卡" }));
  fireEvent.click(within(dialog).getByRole("button", { name: "导入并保持停用" }));
  return dialog;
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

function selectNode(originalName = "原始日本") {
  const checkbox = screen.getByRole("checkbox", { name: `选择 ${originalName}` });
  if (!(checkbox as HTMLInputElement).checked) fireEvent.click(checkbox);
}

function nodeSwitch(enabled = false) {
  return screen.getByRole("button", { name: enabled ? "启用选中节点" : "暂停选中节点" });
}

function expectNodeState(originalName: string, enabled: boolean, sourceEnabled = true) {
  const row = screen.getByRole("checkbox", { name: `选择 ${originalName}` }).closest("tr")!;
  expect(within(row).getByText(enabled ? sourceEnabled ? "分发中" : "待分发" : "已停用")).toBeInTheDocument();
}

function confirmNodeState(enabled = false) {
  selectNode();
  fireEvent.click(nodeSwitch(enabled));
  const label = enabled ? "确认启用节点" : "确认暂停节点";
  fireEvent.click(within(screen.getByRole("dialog", { name: label })).getByRole("button", { name: label }));
}

function requestNodeDeletion() {
  selectNode();
  fireEvent.click(screen.getByRole("button", { name: "删除选中节点" }));
  fireEvent.click(screen.getByRole("button", { name: "确认批量删除" }));
}

describe("authenticated third-party Admin workspace", () => {
  test("node lifecycle actions are consolidated into selection-scoped toolbar controls", async () => {
    const { client } = await mount(fakeClient(true));
    expect(screen.queryByRole("button", { name: "停用节点 原始日本" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "删除 原始日本" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "暂停选中节点" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "启用选中节点" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "删除选中节点" })).toBeDisabled();
    fireEvent.click(screen.getByRole("checkbox", { name: "选择 原始日本" }));
    expect(screen.getByRole("button", { name: "暂停选中节点" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "启用选中节点" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "删除选中节点" })).toBeEnabled();
    expect(client.setNodeEnabled).not.toHaveBeenCalled();
    expect(client.deleteNode).not.toHaveBeenCalled();
  });

  test("no sources keeps the complete empty card and import without implying a saved source", async () => {
    const client = fakeClient();
    client.listSources.mockResolvedValue([]);
    render(<ThirdPartyAdminWorkspace client={client} />);
    await screen.findByRole("heading", { name: "暂无来源" });
    expect(screen.getByRole("region", { name: "第三方节点列表" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "原始名称" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "对外显示名称" })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "搜索节点" })).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "导入" })).toHaveLength(1);
    expect(screen.getByRole("button", { name: "导入" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "保存节点列表" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "启用节点列表" })).toBeDisabled();
    expect(screen.queryByRole("button", { name: "暂停来源" })).not.toBeInTheDocument();
    expect(screen.queryByText("已保存 · 未启用")).not.toBeInTheDocument();
    expect(screen.queryByText(/本地预览|演示节点/)).not.toBeInTheDocument();
    expect(screen.getAllByRole("row")).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "保存节点列表" }));
    fireEvent.click(screen.getByRole("button", { name: "启用节点列表" }));
    expect(client.listNodes).not.toHaveBeenCalled();
    expect(client.saveNodes).not.toHaveBeenCalled();
    expect(client.enableSource).not.toHaveBeenCalled();
    expect(client.importYaml).not.toHaveBeenCalled();
  });

  test("loading keeps the card but cannot present confirmed-empty or saved state", async () => {
    const client = fakeClient();
    const pending = deferred<ThirdPartySource[]>();
    client.listSources.mockReturnValue(pending.promise);
    render(<ThirdPartyAdminWorkspace client={client} />);
    expect(screen.getByRole("heading", { name: "正在读取节点" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "保存节点列表" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "启用节点列表" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "导入" })).toBeDisabled();
    expect(screen.queryByRole("heading", { name: "暂无来源" })).not.toBeInTheDocument();
    expect(screen.queryByText("已保存 · 未启用")).not.toBeInTheDocument();
    await act(async () => pending.resolve([]));
    expect(screen.getByRole("heading", { name: "暂无来源" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "导入" })).toBeEnabled();
  });

  test("remote-only sources retain the empty editor without fetching remote nodes", async () => {
    const client = fakeClient();
    client.listSources.mockResolvedValue([{ ...SOURCE, sourceKind: "remote" }]);
    render(<ThirdPartyAdminWorkspace client={client} />);
    await screen.findByRole("heading", { name: "暂无可编辑来源" });
    expect(screen.getByRole("button", { name: "保存节点列表" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "启用节点列表" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "导入" })).toBeEnabled();
    expect(client.listNodes).not.toHaveBeenCalled();
  });

  test("a failed initial read is not presented as an empty or saved source", async () => {
    const client = fakeClient();
    client.listSources.mockRejectedValue(new ThirdPartyAdminError("network"));
    render(<ThirdPartyAdminWorkspace client={client} />);
    await screen.findByRole("heading", { name: "节点列表暂不可用" });
    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "暂无来源" })).not.toBeInTheDocument();
    expect(screen.queryByText("已保存 · 未启用")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "保存节点列表" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "启用节点列表" })).toBeDisabled();
    expect(client.saveNodes).not.toHaveBeenCalled();
    expect(client.enableSource).not.toHaveBeenCalled();
  });

  test("initial read never writes and exposes enable only for a saved disabled source", async () => {
    const { client } = await mount();
    expect(client.listSources).toHaveBeenCalledTimes(1);
    expect(client.listNodes).toHaveBeenCalledWith(SOURCE_ID, expect.any(AbortSignal));
    expect(client.saveNodes).not.toHaveBeenCalled();
    expect(client.enableSource).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "保存节点列表" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "启用节点列表" })).toBeEnabled();
    expect(screen.queryByRole("button", { name: "暂停来源" })).not.toBeInTheDocument();
  });

  test("enabling requires explicit confirmation and the current source revision", async () => {
    const { client } = await mount();
    fireEvent.click(screen.getByRole("button", { name: "启用节点列表" }));
    expect(client.enableSource).not.toHaveBeenCalled();
    const dialog = screen.getByRole("dialog", { name: "确认启用分发" });
    expect(within(dialog).getByText(/请确认你有权分发这些配置/)).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("button", { name: "取消" }));
    expect(client.enableSource).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "启用节点列表" }));
    fireEvent.click(screen.getByRole("button", { name: "确认启用" }));
    await waitFor(() => expect(client.enableSource).toHaveBeenCalledWith(SOURCE_ID, REVISION, expect.any(AbortSignal)));
    await screen.findByText("已启用 · 后台");
    expect(screen.getByRole("button", { name: "编辑 原始日本" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "删除选中节点" })).toBeDisabled();
  });

  test("enabled sources retain the confirmed whole-source maintenance option for editing names and flags", async () => {
    const client = fakeClient(true);
    await mount(client);
    const actions = within(screen.getByRole("group", { name: "节点列表操作" }));
    expect(actions.getByRole("button", { name: "导入" })).toBeInTheDocument();
    expect(actions.getByRole("button", { name: "保存节点列表" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "暂停来源" })).toBeEnabled();
    expect(actions.queryByRole("button", { name: "暂停来源" })).not.toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "暂停来源" })).toHaveLength(1);
    expect(screen.queryByRole("button", { name: "启用节点列表" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "停用后编辑" })).not.toBeInTheDocument();
    expect(screen.getByText("已启用 · 后台")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "编辑 原始日本" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "删除选中节点" })).toBeDisabled();
    expect(screen.getByRole("combobox", { name: "国家/地区 原始日本" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "保存节点列表" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "暂停来源" }));
    expect(client.disableSource).not.toHaveBeenCalled();
    const dialog = screen.getByRole("dialog", { name: "确认停用来源" });
    expect(dialog).toHaveTextContent("已下载配置及第三方凭证不会因此失效");
    expect(dialog).toHaveTextContent(/整个来源|此来源的全部节点/);
    fireEvent.click(within(dialog).getByRole("button", { name: "取消" }));
    expect(client.disableSource).not.toHaveBeenCalled();
    expect(client.listNodes).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "删除选中节点" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "暂停来源" }));
    client.listNodes.mockResolvedValue(SNAPSHOT);
    fireEvent.click(screen.getByRole("button", { name: "确认停用" }));
    await waitFor(() => expect(client.disableSource).toHaveBeenCalledWith(SOURCE_ID, expect.any(AbortSignal)));
    await waitFor(() => expect(screen.getByRole("button", { name: "编辑 原始日本" })).toBeEnabled());
    expect(client.listNodes).toHaveBeenCalledTimes(2);
    expect(client.saveNodes).not.toHaveBeenCalled();
  });

  test("whole-source disable, name save and explicit re-enable use each fresh revision", async () => {
    const client = fakeClient(true);
    await mount(client);
    client.listNodes.mockResolvedValue({ ...SNAPSHOT, revision: NEXT_REVISION });
    const retained = [{ ...NODES[0], customName: "自定义日本" }, NODES[1]];
    client.saveNodes.mockResolvedValue({ ...SNAPSHOT, revision: SAVED_REVISION, items: retained });
    client.enableSource.mockResolvedValue({ ...SNAPSHOT, revision: SAVED_REVISION, items: retained, enabled: true });

    fireEvent.click(screen.getByRole("button", { name: "暂停来源" }));
    fireEvent.click(screen.getByRole("button", { name: "确认停用" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "编辑 原始日本" })).toBeEnabled());
    expect(client.disableSource).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("button", { name: "暂停来源" })).not.toBeInTheDocument();
    editAlias();
    expect(client.saveNodes).not.toHaveBeenCalled();
    expect(client.enableSource).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "启用节点列表" })).toBeDisabled();
    expect(screen.getByText("自定义日本")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "编辑 原始美国" })).toBeEnabled();

    fireEvent.click(screen.getByRole("button", { name: "保存节点列表" }));
    await waitFor(() => expect(client.saveNodes).toHaveBeenCalledWith(SOURCE_ID, {
      revision: NEXT_REVISION, nodes: [{ id: NODE_ID, customName: "自定义日本" }, { id: SECOND_NODE_ID, customName: null }]
    }, expect.any(AbortSignal)));
    await waitFor(() => expect(screen.getByRole("button", { name: "启用节点列表" })).toBeEnabled());
    expect(client.enableSource).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "启用节点列表" }));
    expect(client.enableSource).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "确认启用" }));
    await waitFor(() => expect(client.enableSource).toHaveBeenCalledWith(SOURCE_ID, SAVED_REVISION, expect.any(AbortSignal)));
    await screen.findByText("已启用 · 后台");
    expect(screen.getByText("自定义日本")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "删除选中节点" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "暂停来源" })).toBeEnabled();
  });

  test("pending disable and its readback block repeated submissions and edits", async () => {
    const client = fakeClient(true);
    const mutation = deferred<ThirdPartySource>();
    const readback = deferred<ThirdPartyNodeSnapshot>();
    client.disableSource.mockReturnValue(mutation.promise);
    await mount(client);
    client.listNodes.mockReturnValue(readback.promise);
    fireEvent.click(screen.getByRole("button", { name: "暂停来源" }));
    const confirm = screen.getByRole("button", { name: "确认停用" });
    fireEvent.click(confirm);
    fireEvent.click(confirm);
    fireEvent.click(screen.getByRole("button", { name: "暂停来源" }));
    expect(client.disableSource).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "暂停来源" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "重新读取" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "导入" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "删除选中节点" })).toBeDisabled();
    await act(async () => mutation.resolve(SOURCE));
    expect(client.listNodes).toHaveBeenCalledTimes(2);
    expect(screen.getByRole("button", { name: "删除选中节点" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "暂停来源" })).toBeDisabled();
    await act(async () => readback.resolve({ ...SNAPSHOT, revision: NEXT_REVISION }));
    expect(screen.getByRole("button", { name: "编辑 原始日本" })).toBeEnabled();
    expect(client.disableSource).toHaveBeenCalledTimes(1);
    expect(client.saveNodes).not.toHaveBeenCalled();
    expect(client.enableSource).not.toHaveBeenCalled();
  });

  test.each(["disable", "readback"] as const)("%s failure leaves editing and resubmission locked without retry", async (phase) => {
    const client = fakeClient(true);
    await mount(client);
    if (phase === "disable") client.disableSource.mockRejectedValue(new ThirdPartyAdminError("network"));
    else client.listNodes.mockRejectedValue(new ThirdPartyAdminError("network"));
    fireEvent.click(screen.getByRole("button", { name: "暂停来源" }));
    fireEvent.click(screen.getByRole("button", { name: "确认停用" }));
    await screen.findByText(/结果未确认或版本已变化/);
    expect(client.disableSource).toHaveBeenCalledTimes(1);
    expect(client.listNodes).toHaveBeenCalledTimes(phase === "disable" ? 1 : 2);
    expect(screen.getByRole("button", { name: "暂停来源" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "保存节点列表" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "删除选中节点" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "编辑 原始日本" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "重新读取" })).toBeEnabled();
    expect(screen.queryByText(/来源已停用，可以编辑/)).not.toBeInTheDocument();
    expect(client.saveNodes).not.toHaveBeenCalled();
    expect(client.enableSource).not.toHaveBeenCalled();
  });

  test("a still-enabled disable readback keeps nodes locked and does not claim disable success", async () => {
    const client = fakeClient(true);
    await mount(client);
    fireEvent.click(screen.getByRole("button", { name: "暂停来源" }));
    fireEvent.click(screen.getByRole("button", { name: "确认停用" }));
    await waitFor(() => expect(client.listNodes).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.getByRole("button", { name: "重新读取" })).toBeEnabled());
    expect(screen.getByText("已启用 · 后台")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "编辑 原始日本" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "删除选中节点" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "保存节点列表" })).toBeDisabled();
    expect(screen.queryByText(/来源已停用，可以编辑/)).not.toBeInTheDocument();
    expect(client.saveNodes).not.toHaveBeenCalled();
    expect(client.disableSource).toHaveBeenCalledTimes(1);
  });

  test("an enabled empty source still exposes disable rather than an unavailable enable button", async () => {
    const client = fakeClient(true);
    client.listNodes.mockResolvedValue({ ...SNAPSHOT, enabled: true, items: [] });
    render(<ThirdPartyAdminWorkspace client={client} />);
    await screen.findByText("已启用 · 后台");
    expect(screen.getByRole("button", { name: "暂停来源" })).toBeEnabled();
    expect(within(screen.getByRole("group", { name: "节点列表操作" })).queryByRole("button", { name: "暂停来源" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "启用节点列表" })).not.toBeInTheDocument();
    expect(client.disableSource).not.toHaveBeenCalled();
  });

  test("save sends the complete node draft despite filtering, then enable uses returned revision", async () => {
    const { client } = await mount();
    editAlias();
    expect(client.saveNodes).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "启用节点列表" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "导入" })).toBeDisabled();
    expect(screen.getByRole("combobox", { name: "第三方来源" })).toBeDisabled();
    fireEvent.change(screen.getByRole("textbox", { name: "搜索节点" }), { target: { value: "日本" } });
    fireEvent.click(screen.getByRole("button", { name: "保存节点列表" }));
    await waitFor(() => expect(client.saveNodes).toHaveBeenCalledWith(SOURCE_ID, {
      revision: REVISION, nodes: [{ id: NODE_ID, customName: "自定义日本" }, { id: SECOND_NODE_ID, customName: null }]
    }, expect.any(AbortSignal)));
    await waitFor(() => expect(screen.getByRole("button", { name: "启用节点列表" })).toBeEnabled());
    expect(client.enableSource).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "启用节点列表" }));
    fireEvent.click(screen.getByRole("button", { name: "确认启用" }));
    await waitFor(() => expect(client.enableSource).toHaveBeenCalledWith(SOURCE_ID, NEXT_REVISION, expect.any(AbortSignal)));
  });

  test("a country selection persists only on save, survives refresh and can explicitly return to the original name", async () => {
    const client = fakeClient();
    await mount(client);
    const withCountry: ThirdPartyNodeSnapshot = {
      ...SNAPSHOT, revision: NEXT_REVISION, items: [{ ...NODES[0], customCountryCode: "US" }, NODES[1]]
    };
    client.saveNodes.mockResolvedValue(withCountry);
    client.listNodes.mockResolvedValue(withCountry);
    const country = screen.getByRole("combobox", { name: "国家/地区 原始日本" });
    expect(country).toHaveValue("");
    fireEvent.change(country, { target: { value: "US" } });
    expect(client.saveNodes).not.toHaveBeenCalled();
    expect(screen.getByRole("cell", { name: /^🇺🇸.*原始日本/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "启用节点列表" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "保存节点列表" }));
    await waitFor(() => expect(client.saveNodes).toHaveBeenCalledWith(SOURCE_ID, {
      revision: REVISION, nodes: [
        { id: NODE_ID, customName: null, customCountryCode: "US" },
        { id: SECOND_NODE_ID, customName: null }
      ]
    }, expect.any(AbortSignal)));
    await waitFor(() => expect(screen.getByRole("button", { name: "启用节点列表" })).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: "重新读取" }));
    await waitFor(() => expect(client.listNodes).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.getByRole("combobox", { name: "国家/地区 原始日本" })).toBeEnabled());
    expect(screen.getByRole("combobox", { name: "国家/地区 原始日本" })).toHaveValue("US");
    expect(screen.getByRole("cell", { name: /^🇺🇸.*原始日本/ })).toBeInTheDocument();
    expect(client.enableSource).not.toHaveBeenCalled();

    client.saveNodes.mockResolvedValue({ ...SNAPSHOT, revision: SAVED_REVISION });
    fireEvent.change(screen.getByRole("combobox", { name: "国家/地区 原始日本" }), { target: { value: "" } });
    expect(client.saveNodes).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "保存节点列表" }));
    await waitFor(() => expect(client.saveNodes).toHaveBeenLastCalledWith(SOURCE_ID, {
      revision: NEXT_REVISION, nodes: [
        { id: NODE_ID, customName: null, customCountryCode: null },
        { id: SECOND_NODE_ID, customName: null }
      ]
    }, expect.any(AbortSignal)));
    await waitFor(() => expect(screen.getByRole("button", { name: "启用节点列表" })).toBeEnabled());
    expect(screen.getByRole("combobox", { name: "国家/地区 原始日本" })).toHaveValue("");
    expect(screen.getByRole("cell", { name: NODES[0].defaultName })).toBeInTheDocument();
    expect(client.enableSource).not.toHaveBeenCalled();
  });

  test("an enabled source can disable and delete one node while its sibling remains enabled", async () => {
    const { client } = await mount(fakeClient(true));
    expectNodeState("原始日本", true);
    expect(screen.getByRole("button", { name: "删除选中节点" })).toBeDisabled();
    selectNode();
    fireEvent.click(nodeSwitch());
    const dialog = screen.getByRole("dialog", { name: "确认暂停节点" });
    expect(dialog).toHaveTextContent(NODES[0].defaultName);
    expect(client.setNodeEnabled).not.toHaveBeenCalled();
    fireEvent.click(within(dialog).getByRole("button", { name: "取消" }));
    expectNodeState("原始日本", true);
    expect(client.setNodeEnabled).not.toHaveBeenCalled();
    confirmNodeState();
    await waitFor(() => expectNodeState("原始日本", false));
    expect(client.setNodeEnabled).toHaveBeenCalledExactlyOnceWith(SOURCE_ID, NODE_ID, REVISION, false, expect.any(AbortSignal));
    expectNodeState("原始美国", true);
    expect(screen.getByRole("button", { name: "暂停来源" })).toBeEnabled();
    requestNodeDeletion();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole("button", { name: "编辑 原始日本" })).not.toBeInTheDocument());
    expect(client.deleteNode).toHaveBeenCalledExactlyOnceWith(SOURCE_ID, NODE_ID, NEXT_REVISION, expect.any(AbortSignal));
    expectNodeState("原始美国", true);
    expect(screen.getByRole("button", { name: "暂停来源" })).toBeEnabled();
    expect(client.disableSource).not.toHaveBeenCalled();
    expect(client.saveNodes).not.toHaveBeenCalled();
    expect(client.enableSource).not.toHaveBeenCalled();
  });

  test.each([false, true])("a disabled node can be restored independently with source enabled=%s", async (enabled) => {
    const client = fakeClient(enabled);
    client.listNodes.mockResolvedValue({ ...SNAPSHOT, enabled, items: [{ ...NODES[0], enabled: false }, NODES[1]] });
    await mount(client);
    confirmNodeState(true);
    await waitFor(() => expectNodeState("原始日本", true, enabled));
    expect(client.setNodeEnabled).toHaveBeenCalledExactlyOnceWith(SOURCE_ID, NODE_ID, REVISION, true, expect.any(AbortSignal));
    expectNodeState("原始美国", true, enabled);
    expect(client.disableSource).not.toHaveBeenCalled();
    expect(client.enableSource).not.toHaveBeenCalled();
  });

  test("an enabled selection requires explicit confirmation before pause and deletion", async () => {
    const { client } = await mount();
    selectNode();
    fireEvent.click(screen.getByRole("button", { name: "删除选中节点" }));
    const dialog = screen.getByRole("dialog", { name: "确认批量删除节点" });
    expect(dialog).toHaveTextContent("1 个仍启用");
    expect(dialog).toHaveTextContent("先暂停再删除");
    expect(client.setNodeEnabled).not.toHaveBeenCalled();
    expect(client.deleteNode).not.toHaveBeenCalled();
    fireEvent.click(within(dialog).getByRole("button", { name: "取消" }));
    expect(client.setNodeEnabled).not.toHaveBeenCalled();
    expect(client.deleteNode).not.toHaveBeenCalled();
  });

  test("cancelling an individual deletion has no write", async () => {
    const client = fakeClient(true);
    client.listNodes.mockResolvedValue({ ...SNAPSHOT, enabled: true, items: [{ ...NODES[0], enabled: false }, NODES[1]] });
    await mount(client);
    selectNode();
    fireEvent.click(screen.getByRole("button", { name: "删除选中节点" }));
    fireEvent.click(within(screen.getByRole("dialog", { name: "确认批量删除节点" })).getByRole("button", { name: "取消" }));
    expect(client.deleteNode).not.toHaveBeenCalled();
    expect(client.setNodeEnabled).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "编辑 原始日本" })).toBeInTheDocument();
  });

  test.each(["name", "country"] as const)("unsaved %s edits block all immediate node mutations", async (field) => {
    const client = fakeClient();
    client.listNodes.mockResolvedValue({ ...SNAPSHOT, items: [{ ...NODES[0], enabled: false }, NODES[1]] });
    await mount(client);
    selectNode();
    if (field === "name") editAlias();
    else fireEvent.change(screen.getByRole("combobox", { name: "国家/地区 原始日本" }), { target: { value: "US" } });
    expect(nodeSwitch()).toBeDisabled();
    expect(nodeSwitch(true)).toBeDisabled();
    expect(screen.getByRole("button", { name: "删除选中节点" })).toBeDisabled();
    expect(client.setNodeEnabled).not.toHaveBeenCalled();
    expect(client.deleteNode).not.toHaveBeenCalled();
  });

  test.each(["network", "revision_conflict", "node_enabled"] as const)("%s single-node failure locks writes without retry", async (code) => {
    const client = fakeClient(true);
    client.setNodeEnabled.mockRejectedValue(new ThirdPartyAdminError(code));
    await mount(client);
    confirmNodeState();
    await screen.findByText(/结果未确认或版本已变化/);
    expectNodeState("原始日本", true);
    expect(nodeSwitch()).toBeDisabled();
    expect(nodeSwitch(true)).toBeDisabled();
    expect(screen.getByRole("checkbox", { name: "选择 原始美国" })).toBeDisabled();
    expect(client.setNodeEnabled).toHaveBeenCalledTimes(1);
    expect(client.disableSource).not.toHaveBeenCalled();
    if (code === "node_enabled") expect(screen.getByText("该节点仍已启用，请重新读取并先停用该节点，再删除。")).toBeInTheDocument();
  });

  test.each(["session", "permission"] as const)("%s single-node failure clears private rows", async (code) => {
    const client = fakeClient(true);
    const expired = vi.fn();
    client.setNodeEnabled.mockRejectedValue(new ThirdPartyAdminError(code));
    await mount(client, expired);
    confirmNodeState();
    await waitFor(() => expect(screen.queryByRole("button", { name: "编辑 原始日本" })).not.toBeInTheDocument());
    expect(screen.queryByRole("checkbox", { name: /^选择 原始/ })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "导入" })).toBeDisabled();
    expect(expired).toHaveBeenCalledTimes(code === "session" ? 1 : 0);
    expect(client.setNodeEnabled).toHaveBeenCalledTimes(1);
  });

  test.each(["network", "revision_conflict", "node_enabled", "session", "permission"] as const)("%s deletion failure never drops the row optimistically or retries", async (code) => {
    const client = fakeClient(true);
    const expired = vi.fn();
    client.listNodes.mockResolvedValue({ ...SNAPSHOT, enabled: true, items: [{ ...NODES[0], enabled: false }, NODES[1]] });
    client.deleteNode.mockRejectedValue(new ThirdPartyAdminError(code));
    await mount(client, expired);
    requestNodeDeletion();
    await screen.findByText(/结果未确认或版本已变化/);
    if (code === "session" || code === "permission") {
      expect(screen.queryByRole("button", { name: "编辑 原始日本" })).not.toBeInTheDocument();
      expect(expired).toHaveBeenCalledTimes(code === "session" ? 1 : 0);
    } else {
      expect(screen.getByRole("button", { name: "编辑 原始日本" })).toBeInTheDocument();
      expectNodeState("原始日本", false);
      expect(nodeSwitch()).toBeDisabled();
      expect(nodeSwitch(true)).toBeDisabled();
    }
    expect(client.deleteNode).toHaveBeenCalledTimes(1);
    expect(client.disableSource).not.toHaveBeenCalled();
    expect(client.saveNodes).not.toHaveBeenCalled();
  });

  test("pending deletion retains the target and blocks duplicate and sibling actions", async () => {
    const client = fakeClient(true);
    const pending = deferred<ThirdPartyNodeSnapshot>();
    client.listNodes.mockResolvedValue({ ...SNAPSHOT, enabled: true, items: [{ ...NODES[0], enabled: false }, NODES[1]] });
    client.deleteNode.mockReturnValue(pending.promise);
    await mount(client);
    selectNode();
    fireEvent.click(screen.getByRole("button", { name: "删除选中节点" }));
    const button = screen.getByRole("button", { name: "确认批量删除" });
    fireEvent.click(button); fireEvent.click(button);
    expect(client.deleteNode).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "编辑 原始日本" })).toBeInTheDocument();
    expect(nodeSwitch()).toBeDisabled();
    expect(screen.getByRole("checkbox", { name: "选择 原始美国" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "暂停来源" })).toBeDisabled();
    await act(async () => pending.resolve({ ...SNAPSHOT, enabled: true, revision: NEXT_REVISION, items: [NODES[1]] }));
    expect(screen.queryByRole("button", { name: "编辑 原始日本" })).not.toBeInTheDocument();
    selectNode("原始美国");
    expect(nodeSwitch()).toBeEnabled();
  });

  test("reloading while node confirmation is open prevents an old confirmation from writing", async () => {
    const { client } = await mount(fakeClient(true));
    selectNode();
    fireEvent.click(nodeSwitch());
    const confirm = within(screen.getByRole("dialog", { name: "确认暂停节点" })).getByRole("button", { name: "确认暂停节点" });
    // A programmatic reload simulates a stale confirmation despite modal focus containment.
    fireEvent.click(screen.getByRole("button", { name: "重新读取" }));
    await waitFor(() => expect(client.listNodes).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.getByRole("button", { name: "重新读取" })).toBeEnabled());
    expect(screen.queryByRole("dialog", { name: "确认暂停节点" })).not.toBeInTheDocument();
    fireEvent.click(confirm);
    expect(client.setNodeEnabled).not.toHaveBeenCalled();
  });

  test.each(["source", "revision", "target", "sibling", "name", "order", "missing"] as const)("%s mismatch in a node mutation readback locks the unchanged view", async (mismatch) => {
    const client = fakeClient(true);
    const view: ThirdPartyNodeSnapshot = { ...SNAPSHOT, enabled: true, revision: NEXT_REVISION, items: [{ ...NODES[0], enabled: false }, { ...NODES[1] }] };
    if (mismatch === "source") view.enabled = false;
    if (mismatch === "revision") view.revision = REVISION;
    if (mismatch === "target") view.items[0].enabled = true;
    if (mismatch === "sibling") view.items[1].enabled = false;
    if (mismatch === "name") view.items[0].customName = "未请求的改名";
    if (mismatch === "order") view.items.reverse();
    if (mismatch === "missing") view.items.pop();
    client.setNodeEnabled.mockResolvedValue(view);
    await mount(client);
    confirmNodeState();
    await screen.findByText(/结果未确认或版本已变化/);
    expectNodeState("原始日本", true);
    expectNodeState("原始美国", true);
    expect(nodeSwitch()).toBeDisabled();
    expect(client.setNodeEnabled).toHaveBeenCalledTimes(1);
  });

  test.each(["target", "sibling", "source"] as const)("deletion rejects a %s mismatch and keeps the prior rows visible", async (mismatch) => {
    const client = fakeClient(true);
    const items = [{ ...NODES[0], enabled: false }, NODES[1]];
    client.listNodes.mockResolvedValue({ ...SNAPSHOT, enabled: true, items });
    client.deleteNode.mockResolvedValue({ ...SNAPSHOT, enabled: mismatch !== "source", revision: NEXT_REVISION,
      items: mismatch === "target" ? items : [{ ...NODES[1], enabled: mismatch !== "sibling" }] });
    await mount(client);
    requestNodeDeletion();
    await screen.findByText(/结果未确认或版本已变化/);
    expect(screen.getByRole("button", { name: "编辑 原始日本" })).toBeInTheDocument();
    expect(nodeSwitch()).toBeDisabled();
    expect(client.deleteNode).toHaveBeenCalledTimes(1);
  });

  test("pending node mutation blocks duplicate clicks and other writes until verified completion", async () => {
    const client = fakeClient(true);
    const pending = deferred<ThirdPartyNodeSnapshot>();
    client.setNodeEnabled.mockReturnValue(pending.promise);
    await mount(client);
    selectNode();
    fireEvent.click(nodeSwitch());
    const button = within(screen.getByRole("dialog", { name: "确认暂停节点" })).getByRole("button", { name: "确认暂停节点" });
    fireEvent.click(button); fireEvent.click(button);
    expect(client.setNodeEnabled).toHaveBeenCalledTimes(1);
    expectNodeState("原始日本", true);
    expect(nodeSwitch()).toBeDisabled();
    expect(screen.getByRole("button", { name: "暂停来源" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "重新读取" })).toBeDisabled();
    await act(async () => pending.resolve({ ...SNAPSHOT, enabled: true, revision: NEXT_REVISION, items: [{ ...NODES[0], enabled: false }, NODES[1]] }));
    expectNodeState("原始日本", false);
    expectNodeState("原始美国", true);
  });

  test("node mutation timeout aborts the request and rejects late success", async () => {
    const client = fakeClient(true);
    const pending = deferred<ThirdPartyNodeSnapshot>();
    client.setNodeEnabled.mockReturnValue(pending.promise);
    await mount(client);
    vi.useFakeTimers();
    confirmNodeState();
    const signal = client.setNodeEnabled.mock.calls[0][4]!;
    await act(async () => vi.advanceTimersByTimeAsync(15000));
    expect(signal.aborted).toBe(true);
    expect(nodeSwitch()).toBeDisabled();
    await act(async () => pending.resolve({ ...SNAPSHOT, enabled: true, revision: NEXT_REVISION, items: [{ ...NODES[0], enabled: false }, NODES[1]] }));
    expectNodeState("原始日本", true);
    expect(nodeSwitch()).toBeDisabled();
    expect(client.setNodeEnabled).toHaveBeenCalledTimes(1);
  });

  test("unmount aborts a pending node mutation and ignores late readback", async () => {
    const client = fakeClient(true);
    const pending = deferred<ThirdPartyNodeSnapshot>();
    client.setNodeEnabled.mockReturnValue(pending.promise);
    const rendered = await mount(client);
    confirmNodeState();
    const signal = client.setNodeEnabled.mock.calls[0][4]!;
    rendered.unmount();
    expect(signal.aborted).toBe(true);
    await act(async () => pending.resolve({ ...SNAPSHOT, enabled: true, revision: NEXT_REVISION, items: [{ ...NODES[0], enabled: false }, NODES[1]] }));
    expect(screen.queryByRole("checkbox", { name: /^选择 原始/ })).not.toBeInTheDocument();
    expect(client.setNodeEnabled).toHaveBeenCalledTimes(1);
  });

  test.each(["revision_conflict", "network"] as const)("%s save failure locks writes until explicit reload and never automatically retries", async (code) => {
    const client = fakeClient();
    client.saveNodes.mockRejectedValue(new ThirdPartyAdminError(code));
    await mount(client);
    editAlias();
    fireEvent.click(screen.getByRole("button", { name: "保存节点列表" }));
    await screen.findByText(/结果未确认或版本已变化/);
    expect(client.saveNodes).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "保存节点列表" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "启用节点列表" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "编辑 原始日本" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "导入" })).toBeDisabled();
    client.listNodes.mockResolvedValue({ ...SNAPSHOT, revision: NEXT_REVISION });
    rereadWithDiscard();
    await waitFor(() => expect(screen.getByRole("button", { name: "编辑 原始日本" })).toBeEnabled());
    expect(screen.queryByText("自定义日本")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "启用节点列表" })).toBeEnabled();
    expect(client.saveNodes).toHaveBeenCalledTimes(1);
  });

  test("explicit reload discards applied drafts even when the backend revision is unchanged", async () => {
    const { client } = await mount();
    editAlias();
    expect(screen.getByText("自定义日本")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "重新读取" }));
    const dialog = screen.getByRole("dialog", { name: "放弃未保存修改？" });
    expect(client.listNodes).toHaveBeenCalledTimes(1);
    fireEvent.click(within(dialog).getByRole("button", { name: "确认重新读取" }));
    await waitFor(() => expect(client.listNodes).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.queryByText("自定义日本")).not.toBeInTheDocument());
    expect(screen.getByText(NODES[0].defaultName)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "保存节点列表" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "启用节点列表" })).toBeEnabled();
    expect(client.saveNodes).not.toHaveBeenCalled();
  });

  test("cancelling draft discard keeps local edits and makes no read", async () => {
    const { client } = await mount();
    editAlias();
    fireEvent.click(screen.getByRole("button", { name: "重新读取" }));
    fireEvent.click(within(screen.getByRole("dialog", { name: "放弃未保存修改？" })).getByRole("button", { name: "取消" }));
    expect(screen.getByText("自定义日本")).toBeInTheDocument();
    expect(client.listNodes).toHaveBeenCalledTimes(1);
    expect(client.saveNodes).not.toHaveBeenCalled();
  });

  test.each(["session", "permission"] as const)("%s failure clears previously loaded node data and closes writes", async (code) => {
    const client = fakeClient();
    const onSessionExpired = vi.fn();
    await mount(client, onSessionExpired);
    client.listSources.mockRejectedValue(new ThirdPartyAdminError(code));
    fireEvent.click(screen.getByRole("button", { name: "重新读取" }));
    await screen.findByText(code === "session" ? "Admin 登录已失效，请重新登录。" : "当前账户没有此操作的 Admin 权限。");
    expect(screen.queryByText("原始日本")).not.toBeInTheDocument();
    expect(screen.queryByText("原始美国")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "保存节点列表" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "启用节点列表" })).toBeDisabled();
    expect(screen.queryByText("已保存 · 未启用")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "导入" })).toBeDisabled();
    expect(screen.getByRole("combobox", { name: "第三方来源" })).toBeDisabled();
    expect(onSessionExpired).toHaveBeenCalledTimes(code === "session" ? 1 : 0);
  });

  test("a mutation pending response blocks repeated submission and other writes", async () => {
    const client = fakeClient();
    const pending = deferred<ThirdPartyNodeSnapshot>();
    client.saveNodes.mockReturnValue(pending.promise);
    await mount(client);
    editAlias();
    fireEvent.click(screen.getByRole("button", { name: "保存节点列表" }));
    fireEvent.click(screen.getByRole("button", { name: "保存节点列表" }));
    expect(client.saveNodes).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "重新读取" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "编辑 原始美国" })).toBeDisabled();
    await act(async () => pending.resolve({ ...SNAPSHOT, revision: NEXT_REVISION }));
    expect(screen.getByRole("button", { name: "启用节点列表" })).toBeEnabled();
  });

  test("empty sources cannot be enabled", async () => {
    const client = fakeClient();
    client.listNodes.mockResolvedValue({ ...SNAPSHOT, items: [] });
    render(<ThirdPartyAdminWorkspace client={client} />);
    await screen.findByText("此来源没有保留的节点，空列表不能启用。");
    expect(screen.getByRole("button", { name: "启用节点列表" })).toBeDisabled();
    expect(client.enableSource).not.toHaveBeenCalled();
  });

  test("remote-first inventories select an editable inline source instead of failing on remote data", async () => {
    const client = fakeClient();
    client.listSources.mockResolvedValue([{ ...SOURCE, id: NEXT_SOURCE_ID, name: "旧远程来源", sourceKind: "remote" }, SOURCE]);
    await mount(client);
    expect(client.listNodes).toHaveBeenCalledTimes(1);
    expect(client.listNodes).toHaveBeenCalledWith(SOURCE_ID, expect.any(AbortSignal));
    expect(screen.getByRole("option", { name: "旧远程来源 · 暂不支持编辑" })).toBeDisabled();
    expect(screen.getByRole("combobox", { name: "第三方来源" })).toHaveValue(SOURCE_ID);
  });

  test("one unreadable inline source does not block selecting another healthy source", async () => {
    const client = fakeClient();
    client.listSources.mockResolvedValue([SOURCE, { ...SOURCE, id: NEXT_SOURCE_ID, name: "健康来源" }]);
    client.listNodes.mockRejectedValueOnce(new ThirdPartyAdminError("protected_value_invalid"));
    client.listNodes.mockResolvedValue({ ...SNAPSHOT, sourceId: NEXT_SOURCE_ID });
    render(<ThirdPartyAdminWorkspace client={client} />);
    await screen.findByRole("alert");
    const select = screen.getByRole("combobox", { name: "第三方来源" });
    expect(select).toBeEnabled();
    fireEvent.change(select, { target: { value: NEXT_SOURCE_ID } });
    await screen.findByRole("button", { name: "编辑 原始日本" });
    expect(client.listNodes).toHaveBeenLastCalledWith(NEXT_SOURCE_ID, expect.any(AbortSignal));
    expect(select).toHaveValue(NEXT_SOURCE_ID);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  test("a timed-out mutation unlocks reload but stays stale and rejects late success", async () => {
    const client = fakeClient();
    const pending = deferred<ThirdPartyNodeSnapshot>();
    client.saveNodes.mockReturnValue(pending.promise);
    await mount(client);
    editAlias();
    vi.useFakeTimers();
    fireEvent.click(screen.getByRole("button", { name: "保存节点列表" }));
    const requestSignal = client.saveNodes.mock.calls[0][2]!;
    await act(async () => vi.advanceTimersByTimeAsync(15000));
    expect(requestSignal.aborted).toBe(true);
    expect(screen.getByText(/结果未确认或版本已变化/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "重新读取" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "启用节点列表" })).toBeDisabled();
    await act(async () => pending.resolve({ ...SNAPSHOT, revision: NEXT_REVISION }));
    expect(screen.queryByText("节点列表已保存，尚未启用分发。")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "编辑 原始日本" })).toBeDisabled();
    expect(client.saveNodes).toHaveBeenCalledTimes(1);
  });

  test("unmount aborts an outstanding read and ignores its late result", async () => {
    const client = fakeClient();
    const pending = deferred<ThirdPartySource[]>();
    client.listSources.mockReturnValue(pending.promise);
    const rendered = render(<ThirdPartyAdminWorkspace client={client} />);
    await waitFor(() => expect(client.listSources).toHaveBeenCalledTimes(1));
    const requestSignal = client.listSources.mock.calls[0][0]!;
    rendered.unmount();
    expect(requestSignal.aborted).toBe(true);
    await act(async () => pending.resolve([SOURCE]));
    expect(screen.queryByText("原始日本")).not.toBeInTheDocument();
    expect(client.listNodes).not.toHaveBeenCalled();
  });

  test.each([false, true])("file import immediately displays the returned nodes and stays disabled (initially empty: %s)", async (initiallyEmpty) => {
    const client = fakeClient();
    if (initiallyEmpty) {
      client.listSources.mockResolvedValue([]);
      render(<ThirdPartyAdminWorkspace client={client} />);
      await screen.findByRole("heading", { name: "暂无来源" });
    } else await mount(client);
    client.listNodes.mockResolvedValue({ ...SNAPSHOT, sourceId: NEXT_SOURCE_ID, revision: NEXT_REVISION });
    fireEvent.click(screen.getByRole("button", { name: "导入" }));
    const dialog = screen.getByRole("dialog", { name: "导入第三方节点" });
    fireEvent.change(within(dialog).getByRole("textbox", { name: "来源名称" }), { target: { value: "新导入来源" } });
    const file = new File(["proxies: []"], "synthetic.yaml", { type: "text/yaml" });
    Object.defineProperty(file, "text", { value: async () => "proxies: []" });
    fireEvent.change(within(dialog).getByLabelText("YAML 文件"), { target: { files: [file] } });
    fireEvent.click(within(dialog).getByRole("checkbox", { name: "基础月卡" }));
    fireEvent.click(within(dialog).getByRole("button", { name: "导入并保持停用" }));
    await waitFor(() => expect(client.importYaml).toHaveBeenCalledWith({ name: "新导入来源", yamlContent: "proxies: []", tiers: ["monthly_basic"] }, expect.any(AbortSignal)));
    await screen.findByText("来源已导入并保持停用，请核对节点后启用。");
    expect(client.enableSource).not.toHaveBeenCalled();
    expect(client.importYaml).toHaveBeenCalledTimes(1);
    expect(screen.getByText("已保存 · 未启用")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "编辑 原始日本" })).toBeEnabled();
    expect(screen.getByRole("combobox", { name: "第三方来源" })).toHaveValue(NEXT_SOURCE_ID);
    expect(screen.queryByRole("heading", { name: "暂无来源" })).not.toBeInTheDocument();
    expect(screen.queryByRole("dialog", { name: "导入第三方节点" })).not.toBeInTheDocument();
    expect(client.listSources).toHaveBeenCalledTimes(1);
    expect(client.saveNodes).not.toHaveBeenCalled();
  });

  test.each([
    ["network", "请求未确认，请检查连接并重新读取状态。"],
    ["invalid_yaml", "YAML 无法导入，请检查格式、节点协议和字段是否受支持；不会显示原始配置。"],
    ["invalid_tiers", "适用套餐无效，请重新读取后检查套餐选择。"],
    ["not_found", "来源不存在或已被删除，请重新读取来源列表。"],
    ["rate_limited", "请求过于频繁，请稍后手动重新读取；不会自动重试。"],
    ["remote_import_disabled", "HTTPS YAML 导入尚未开放，请先下载获准分发的 YAML 文件，再使用文件导入。"],
    ["unsupported_source_kind", "此来源类型暂不支持此操作，请选择文件导入的来源。"],
    ["protected_value_invalid", "来源的受保护数据无法读取，请联系管理员核查；不会显示原始配置。"],
  ] as const)("%s import failure shows safe guidance and stays locked until explicit refresh", async (code, copy) => {
    const client = fakeClient();
    const error = new ThirdPartyAdminError(code);
    error.message = "synthetic-private-backend-detail";
    client.importYaml.mockRejectedValue(error);
    await mount(client);
    const dialog = submitSyntheticImport();
    await screen.findByText(/结果未确认或版本已变化/);
    expect(screen.getByText(copy)).toHaveAttribute("role", "alert");
    expect(screen.queryByText(error.message)).not.toBeInTheDocument();
    expect(client.importYaml).toHaveBeenCalledTimes(1);
    expect(within(dialog).getByRole("button", { name: "导入并保持停用" })).toBeDisabled();
    fireEvent.click(within(dialog).getByRole("button", { name: "关闭导入" }));
    expect(screen.getByRole("button", { name: "导入" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "编辑 原始日本" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "保存节点列表" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "启用节点列表" })).toBeDisabled();
    expect(client.listSources).toHaveBeenCalledTimes(1);
    rereadWithDiscard();
    await waitFor(() => expect(screen.getByRole("button", { name: "导入" })).toBeEnabled());
    expect(client.listSources).toHaveBeenCalledTimes(2);
    expect(client.importYaml).toHaveBeenCalledTimes(1);
    expect(client.enableSource).not.toHaveBeenCalled();
  });

  test("successful import followed by unreadable nodes stays locked without repeating the import", async () => {
    const client = fakeClient();
    await mount(client);
    client.listNodes.mockRejectedValueOnce(new ThirdPartyAdminError("protected_value_invalid"));
    const dialog = submitSyntheticImport();
    await screen.findByText(/结果未确认或版本已变化/);
    expect(screen.getByText("来源的受保护数据无法读取，请联系管理员核查；不会显示原始配置。")).toHaveAttribute("role", "alert");
    expect(client.importYaml).toHaveBeenCalledTimes(1);
    expect(client.listNodes).toHaveBeenLastCalledWith(NEXT_SOURCE_ID, expect.any(AbortSignal));
    expect(screen.queryByText("来源已导入并保持停用，请核对节点后启用。")).not.toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "导入并保持停用" })).toBeDisabled();
    fireEvent.click(within(dialog).getByRole("button", { name: "关闭导入" }));
    expect(screen.getByRole("button", { name: "导入" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "启用节点列表" })).toBeDisabled();
    client.listSources.mockResolvedValue([{ ...SOURCE, id: NEXT_SOURCE_ID, name: "新导入来源" }]);
    client.listNodes.mockResolvedValue({ ...SNAPSHOT, sourceId: NEXT_SOURCE_ID });
    rereadWithDiscard();
    await waitFor(() => expect(screen.getByRole("combobox", { name: "第三方来源" })).toHaveValue(NEXT_SOURCE_ID));
    expect(screen.getByRole("button", { name: "导入" })).toBeEnabled();
    expect(client.importYaml).toHaveBeenCalledTimes(1);
    expect(client.enableSource).not.toHaveBeenCalled();
  });
});
