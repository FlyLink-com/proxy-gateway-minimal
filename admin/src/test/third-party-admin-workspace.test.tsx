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
const SOURCE: ThirdPartySource = { id: SOURCE_ID, name: "合成来源", enabled: false, tiers: ["monthly_basic"], sourceKind: "inline-yaml" };
const NODES: ThirdPartyNodeSnapshot["items"] = [
  { id: NODE_ID, sourceName: "", originalName: "原始日本", defaultName: "[3P] JP 1 | 原始日本", customName: null, countryCode: "JP", protocol: "VLESS" },
  { id: SECOND_NODE_ID, sourceName: "", originalName: "原始美国", defaultName: "[3P] US 1 | 原始美国", customName: null, countryCode: "US", protocol: "Hy2" }
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

describe("authenticated third-party Admin workspace", () => {
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
    expect(screen.getByRole("button", { name: "删除 原始日本" })).toBeDisabled();
  });

  test("enabled sources are read-only until a confirmed disable and fresh node read", async () => {
    const client = fakeClient(true);
    await mount(client);
    expect(screen.getByRole("button", { name: "编辑 原始日本" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "删除 原始美国" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "保存节点列表" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "停用后编辑" }));
    expect(client.disableSource).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog", { name: "确认停用来源" })).toHaveTextContent("已下载配置及第三方凭证不会因此失效");
    client.listNodes.mockResolvedValue(SNAPSHOT);
    fireEvent.click(screen.getByRole("button", { name: "确认停用" }));
    await waitFor(() => expect(client.disableSource).toHaveBeenCalledWith(SOURCE_ID, expect.any(AbortSignal)));
    await waitFor(() => expect(screen.getByRole("button", { name: "编辑 原始日本" })).toBeEnabled());
    expect(client.listNodes).toHaveBeenCalledTimes(2);
    expect(client.saveNodes).not.toHaveBeenCalled();
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

  test("deletion affects only the complete saved retained list, not an immediate endpoint", async () => {
    const { client } = await mount();
    fireEvent.click(screen.getByRole("button", { name: "删除 原始日本" }));
    fireEvent.click(screen.getByRole("button", { name: "确认删除" }));
    expect(screen.queryByRole("button", { name: "编辑 原始日本" })).not.toBeInTheDocument();
    expect(client.saveNodes).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "保存节点列表" }));
    await waitFor(() => expect(client.saveNodes).toHaveBeenCalledWith(SOURCE_ID, {
      revision: REVISION, nodes: [{ id: SECOND_NODE_ID, customName: null }]
    }, expect.any(AbortSignal)));
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
