import { useCallback, useEffect, useId, useRef, useState } from "react";
import { Pause, Play } from "lucide-react";
import { ModalFrame } from "../../shared/public/modal-frame";
import { ThirdPartyNodeNamesPage } from "./third-party-node-names-page";
import { ThirdPartyAdminImport } from "./third-party-admin-import";
import type { ThirdPartyImportInput } from "./third-party-admin-import";
import { createThirdPartyAdminClient, ThirdPartyAdminError } from "./third-party-admin-client";
import type { ThirdPartyAdminClient, ThirdPartyAdminErrorCode, ThirdPartySource, ThirdPartyNodeSnapshot } from "./third-party-admin-client";
import type { ThirdPartyNode } from "./node-name-model";
import { renderedNodeName } from "./node-name-model";
import { clearThirdPartySourceSelection, readThirdPartySourceSelection, rememberThirdPartySourceSelection } from "./third-party-source-selection";
import "./third-party-admin-workspace.styles.css";

const ERROR_COPY: Record<ThirdPartyAdminErrorCode, string> = {
  session: "Admin 登录已失效，请重新登录。", permission: "当前账户没有此操作的 Admin 权限。",
  unavailable: "第三方节点管理尚未启用或服务暂不可用。", network: "请求未确认，请检查连接并重新读取状态。",
  invalid: "请求或响应不符合接口要求，请重新读取后检查输入。",
  not_found: "来源不存在或已被删除，请重新读取来源列表。",
  rate_limited: "请求过于频繁，请稍后手动重新读取；不会自动重试。",
  revision_conflict: "来源已被其他操作更新。请重新读取，核对后再修改；不会覆盖最新版本。",
  source_enabled: "来源当前已启用，请重新读取并先停用来源。", empty_source: "空来源不可启用，请先导入节点。",
  node_enabled: "该节点仍已启用，请重新读取并先停用该节点，再删除。",
  invalid_node_name: "节点名称不符合要求，请检查长度和保留名称。", duplicate_node_name: "存在重复的节点名称。",
  invalid_yaml: "YAML 无法导入，请检查格式、节点协议和字段是否受支持；不会显示原始配置。",
  invalid_tiers: "适用套餐无效，请重新读取后检查套餐选择。",
  remote_import_disabled: "HTTPS YAML 导入尚未开放，请先下载获准分发的 YAML 文件，再使用文件导入。",
  unsupported_source_kind: "此来源类型暂不支持此操作，请选择文件导入的来源。",
  protected_value_invalid: "来源的受保护数据无法读取，请联系管理员核查；不会显示原始配置。",
};

// Compare the entire safe projection, including order, against exactly the
// requested row change. Never report success for a broader source mutation.
function verifyNodeMutation(before: ThirdPartyNodeSnapshot, after: ThirdPartyNodeSnapshot, nodeId: string, enabled?: boolean) {
  const expected = enabled === undefined ? before.items.filter((node) => node.id !== nodeId)
    : before.items.map((node) => node.id === nodeId ? { ...node, enabled } : node);
  const fields = (node: ThirdPartyNode) => [node.id, node.sourceName, node.originalName, node.defaultName,
    node.customName, node.countryCode, node.customCountryCode ?? null, node.protocol, node.enabled ?? true];
  if (after.sourceId !== before.sourceId || after.enabled !== before.enabled || after.revision === before.revision
    || after.items.length !== expected.length || after.items.some((node, index) => JSON.stringify(fields(node)) !== JSON.stringify(fields(expected[index])))) {
    throw new ThirdPartyAdminError("invalid");
  }
  return after;
}

function sourceLabel(source: ThirdPartySource, sources: readonly ThirdPartySource[]) {
  const sameName = sources.filter((item) => item.name === source.name);
  return sameName.length > 1 ? `${source.name} · 来源 ${sameName.findIndex((item) => item.id === source.id) + 1}` : source.name;
}

function deletableSelection(view: ThirdPartyNodeSnapshot, nodeIds: readonly string[], canPause: boolean) {
  return nodeIds.length > 0 && new Set(nodeIds).size === nodeIds.length
    && nodeIds.every((id) => view.items.some((node) => node.id === id && (node.enabled === false || canPause)));
}

export function ThirdPartyAdminWorkspace({ client: suppliedClient, onSessionExpired }: {
  client?: ThirdPartyAdminClient; onSessionExpired?: () => void;
}) {
  const [client] = useState(() => suppliedClient ?? createThirdPartyAdminClient());
  const [sources, setSources] = useState<ThirdPartySource[]>([]);
  const [snapshot, setSnapshot] = useState<ThirdPartyNodeSnapshot | null>(null);
  const [editorEpoch, setEditorEpoch] = useState(0);
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [stale, setStale] = useState(false);
  const [denied, setDenied] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [confirm, setConfirm] = useState<"enable" | "disable" | "reload" | null>(null);
  const [nodeConfirm, setNodeConfirm] = useState<{ snapshot: ThirdPartyNodeSnapshot; nodeIds: readonly string[]; enabled: boolean } | null>(null);
  const [bulkConfirm, setBulkConfirm] = useState<{ snapshot: ThirdPartyNodeSnapshot; nodeIds: readonly string[]; sourceLabel: string } | null>(null);
  const busyRef = useRef(false);
  const requestRef = useRef<AbortController | null>(null);
  const generation = useRef(0);
  const mounted = useRef(true);
  const currentSource = sources.find((source) => source.id === snapshot?.sourceId);
  const modalId = useId();

  const run = useCallback(async <T,>(operation: (signal: AbortSignal, beginRequest: () => void) => Promise<T>, success: (value: T) => void, mutation = false,
    failure?: () => void) => {
    if (busyRef.current || !mounted.current) return false;
    busyRef.current = true;
    setBusy(true); setError(""); setNotice(""); setNodeConfirm(null); setBulkConfirm(null);
    const controller = new AbortController(); requestRef.current = controller;
    const requestId = ++generation.current;
    let timeout = window.setTimeout(() => controller.abort(), 15000);
    const isCurrent = () => mounted.current && generation.current === requestId;
    // Serial batches get the same bounded deadline for each HTTP request, not
    // one deadline shared by every selected node. An aborted batch stays stopped.
    const beginRequest = () => {
      if (!isCurrent() || controller.signal.aborted) throw new DOMException("Request cancelled", "AbortError");
      window.clearTimeout(timeout);
      timeout = window.setTimeout(() => controller.abort(), 15000);
    };
    let abortListener: () => void = () => {};
    try {
      // A late or non-cooperative transport must not publish success after timeout.
      const result = await Promise.race([operation(controller.signal, beginRequest), new Promise<never>((_resolve, reject) => {
        abortListener = () => reject(new DOMException("Request cancelled", "AbortError"));
        controller.signal.addEventListener("abort", abortListener, { once: true });
        if (controller.signal.aborted) abortListener();
      })]);
      if (!isCurrent() || controller.signal.aborted) return false;
      success(result); setStale(false); setDenied(false);
      return true;
    } catch (reason) {
      if (!isCurrent()) return false;
      const code = reason instanceof ThirdPartyAdminError ? reason.code : "network";
      setError(ERROR_COPY[code] ?? "操作未完成，请重新读取后核对；后台错误正文不会显示。");
      if (mutation || code === "revision_conflict" || code === "source_enabled" || code === "node_enabled") setStale(true);
      if (code === "session" || code === "permission") {
        clearThirdPartySourceSelection();
        setSnapshot(null); setSources([]); setDirty(false); setDenied(true); setNotice(""); setConfirm(null);
        if (code === "session") onSessionExpired?.();
      } else failure?.();
      return false;
    } finally {
      window.clearTimeout(timeout);
      controller.signal.removeEventListener("abort", abortListener);
      if (isCurrent()) { busyRef.current = false; setBusy(false); requestRef.current = null; }
    }
  }, [onSessionExpired]);

  const readAll = useCallback((preferredId?: string) => run(async (signal) => {
    const listed = await client.listSources(signal);
    if (signal.aborted || !mounted.current) throw new DOMException("Request cancelled", "AbortError");
    // Keep the list usable even if one source cannot be decrypted/read.
    setSources(listed);
    const editable = listed.filter((source) => source.sourceKind === "inline-yaml");
    const selectedId = preferredId ?? readThirdPartySourceSelection();
    // Preserve an explicit/remembered empty source. Only an unselected first
    // visit prefers a source known to contain retained (not necessarily enabled) nodes.
    const target = editable.find((source) => source.id === selectedId)
      ?? editable.find((source) => (source.nodeCount ?? 0) > 0) ?? editable[0];
    return { listed, view: target ? await client.listNodes(target.id, signal) : null };
  }, ({ listed, view }) => {
    setSources(listed); setSnapshot(view); setDirty(false); setEditorEpoch((epoch) => epoch + 1);
    if (view) rememberThirdPartySourceSelection(view.sourceId); else clearThirdPartySourceSelection();
  }), [client, run]);

  useEffect(() => {
    mounted.current = true;
    void readAll();
    return () => {
      mounted.current = false; generation.current += 1; requestRef.current?.abort(); busyRef.current = false;
    };
  }, [readAll]);

  const receive = (view: ThirdPartyNodeSnapshot) => {
    setSnapshot(view); setDirty(false); setEditorEpoch((epoch) => epoch + 1);
    rememberThirdPartySourceSelection(view.sourceId);
    setSources((current) => current.map((source) => source.id === view.sourceId ? { ...source, enabled: view.enabled, nodeCount: view.items.length } : source));
  };

  function save(nodes: readonly ThirdPartyNode[]) {
    if (!snapshot || snapshot.enabled || stale || denied || busyRef.current) return;
    void run((signal) => client.saveNodes(snapshot.sourceId, {
      revision: snapshot.revision, nodes: nodes.map(({ id, customName, customCountryCode }) => ({ id, customName,
        ...(customCountryCode === undefined ? {} : { customCountryCode }) }))
    }, signal), (view) => { receive(view); setNotice("节点列表已保存，尚未启用分发。"); }, true);
  }

  function rowActionAllowed() {
    return snapshot && currentSource?.sourceKind === "inline-yaml" && !dirty && !stale && !denied && !busyRef.current && mounted.current;
  }

  function requestNodesEnabled(nodeIds: readonly string[], enabled: boolean) {
    if (!rowActionAllowed() || !snapshot || !client.setNodeEnabled || typeof enabled !== "boolean"
      || !deletableSelection(snapshot, nodeIds, true)) return;
    const targets = nodeIds.filter((id) => (snapshot.items.find((node) => node.id === id)!.enabled ?? true) !== enabled);
    if (!targets.length) return;
    setNodeConfirm({ snapshot, nodeIds: targets, enabled });
  }

  function executeNodeEnabled() {
    const action = nodeConfirm;
    setNodeConfirm(null);
    if (!action || !rowActionAllowed() || !snapshot || snapshot !== action.snapshot || !client.setNodeEnabled) return;
    if (!deletableSelection(action.snapshot, action.nodeIds, true)) return;
    const setNodeEnabled = client.setNodeEnabled.bind(client);
    const verb = action.enabled ? "启用" : "暂停";
    let confirmed = 0;
    void run(async (signal, beginRequest) => {
      let view = action.snapshot;
      for (const nodeId of action.nodeIds) {
        if (signal.aborted || !mounted.current) throw new DOMException("Request cancelled", "AbortError");
        beginRequest();
        const result = await setNodeEnabled(view.sourceId, nodeId, view.revision, action.enabled, signal);
        if (signal.aborted || !mounted.current) throw new DOMException("Request cancelled", "AbortError");
        view = verifyNodeMutation(view, result, nodeId, action.enabled);
        confirmed += 1;
        receive(view);
      }
      return view;
    }, () => {
      setNotice(`已确认${verb} ${confirmed}/${action.nodeIds.length} 个节点。来源保持原状态，其他节点不受影响。`);
    }, true, () => {
      setNotice(`已确认${verb} ${confirmed}/${action.nodeIds.length} 个节点；其余结果未确认，请重新读取。不会自动重试。`);
    });
  }

  function requestDeleteNodes(nodeIds: readonly string[]) {
    if (!rowActionAllowed() || !snapshot || !currentSource || !client.deleteNode
      || !deletableSelection(snapshot, nodeIds, !!client.setNodeEnabled)) return;
    setBulkConfirm({ snapshot, nodeIds: [...nodeIds], sourceLabel: sourceLabel(currentSource, sources) });
  }

  function executeDeleteNodes() {
    const action = bulkConfirm;
    setBulkConfirm(null);
    if (!action || !rowActionAllowed() || snapshot !== action.snapshot || !client.deleteNode
      || !deletableSelection(action.snapshot, action.nodeIds, !!client.setNodeEnabled)) return;
    const removeNode = client.deleteNode.bind(client);
    const pauseNode = client.setNodeEnabled?.bind(client);
    let confirmed = 0;
    const pausedNotDeleted = new Set<string>();
    void run(async (signal, beginRequest) => {
      let view = action.snapshot;
      const checkActive = () => {
        if (signal.aborted || !mounted.current) throw new DOMException("Request cancelled", "AbortError");
      };
      for (const nodeId of action.nodeIds) {
        checkActive();
        const node = view.items.find((item) => item.id === nodeId);
        if (!node) throw new ThirdPartyAdminError("invalid");
        if (node.enabled !== false) {
          if (!pauseNode) throw new ThirdPartyAdminError("node_enabled");
          beginRequest();
          const paused = await pauseNode(view.sourceId, nodeId, view.revision, false, signal);
          checkActive();
          view = verifyNodeMutation(view, paused, nodeId, false);
          pausedNotDeleted.add(nodeId);
          receive(view);
        }
        checkActive();
        beginRequest();
        const result = await removeNode(view.sourceId, nodeId, view.revision, signal);
        checkActive();
        view = verifyNodeMutation(view, result, nodeId);
        confirmed += 1;
        pausedNotDeleted.delete(nodeId);
        // Publish only individually confirmed results. A later failure must
        // retain this progress, but never resurrect it after an auth denial.
        receive(view);
      }
      return view;
    }, () => {
      setNotice(`已确认删除 ${confirmed}/${action.nodeIds.length} 个节点。来源保持原状态，其他节点不受影响。`);
    }, true, () => {
      setNotice(`已确认删除 ${confirmed}/${action.nodeIds.length} 个节点；已确认暂停但未确认删除 ${pausedNotDeleted.size} 个；其余 ${action.nodeIds.length - confirmed} 个删除结果未确认，请重新读取。不会自动重试。`);
    });
  }

  async function importYaml(input: ThirdPartyImportInput) {
    if (dirty || stale || denied || busyRef.current) return false;
    return run(async (signal) => {
      const created = await client.importYaml(input, signal);
      return { created, view: await client.listNodes(created.id, signal) };
    }, ({ created, view }) => {
      setSources((current) => [...current, created]); receive(view);
      setNotice("来源已导入并保持停用，请核对节点后启用。");
    }, true);
  }

  function executeConfirmed() {
    const action = confirm;
    setConfirm(null);
    if (busyRef.current || denied) return;
    if (action === "reload") { void readAll(snapshot?.sourceId); return; }
    if (!snapshot || dirty || stale) return;
    if (action === "enable") {
      void run((signal) => client.enableSource(snapshot.sourceId, snapshot.revision, signal), (view) => {
        receive(view); setNotice("此来源已启用。后续符合套餐权益的订阅请求将包含这些节点。");
      }, true);
    } else if (action === "disable") {
      void run(async (signal) => {
        await client.disableSource(snapshot.sourceId, signal);
        const view = await client.listNodes(snapshot.sourceId, signal);
        if (view.enabled) throw new ThirdPartyAdminError("source_enabled");
        return view;
      }, (view) => { receive(view); setNotice("来源已停用，可以编辑。已下载的第三方配置不会被远程撤销。"); }, true);
    }
  }

  const importAction = <ThirdPartyAdminImport disabled={busy || dirty || stale || denied} onImport={importYaml} />;
  const placeholder = snapshot ? undefined : busy
    ? { title: "正在读取节点", description: "读取完成前不能保存或启用，请稍候。" }
    : error || denied
      ? { title: "节点列表暂不可用", description: "请按上方提示处理并重新读取；当前没有可编辑的节点列表。" }
      : {
        title: sources.length ? "暂无可编辑来源" : "暂无来源",
        description: "请先导入获准分发的 YAML 文件。来源就绪后才能保存或启用节点列表。",
      };
  return <div className="tp-admin-workspace" aria-busy={busy}>
    <p className="tp-admin-boundary">仅限已登录 Admin。勾选单个或多个节点后，统一使用功能栏启用、暂停或删除。来源分发总开关不改变各节点开关；改名和国旗调整需暂停来源并保存，不改变自营计量。</p>
    <div className="tp-admin-source-toolbar">
      <label>来源<select aria-label="第三方来源" disabled={busy || dirty || stale || denied || !sources.length} value={snapshot?.sourceId ?? ""} onChange={(event) => {
        const id = event.target.value;
        if (busyRef.current || dirty || stale || denied || !sources.some((source) => source.id === id && source.sourceKind === "inline-yaml")) return;
        setSnapshot(null);
        void run((signal) => client.listNodes(id, signal), receive);
      }}><option value="" disabled>选择来源</option>{sources.map((source) => {
        const count = source.id === snapshot?.sourceId ? snapshot.items.length : source.nodeCount;
        return <option key={source.id} value={source.id} disabled={source.sourceKind !== "inline-yaml"}>{sourceLabel(source, sources)}{count === undefined ? "" : ` · ${count} 个节点`}{source.sourceKind !== "inline-yaml" ? " · 暂不支持编辑" : source.enabled ? " · 已启用" : " · 已暂停"}</option>;
      })}</select></label>
      <button type="button" disabled={busy || denied} onClick={() => dirty ? setConfirm("reload") : void readAll(snapshot?.sourceId)}>重新读取</button>
      <button type="button" aria-label={snapshot?.enabled ? "暂停来源" : "启用节点列表"}
        disabled={!snapshot || busy || dirty || stale || denied || (!snapshot.enabled && !snapshot.items.length)}
        onClick={() => { if (rowActionAllowed()) setConfirm(snapshot?.enabled ? "disable" : "enable"); }}>
        {snapshot?.enabled ? <Pause size={16} aria-hidden="true" /> : <Play size={16} aria-hidden="true" />}
        来源分发：{!snapshot ? "未就绪" : snapshot.enabled ? "已启用 · 暂停来源" : "已暂停 · 启用来源"}
      </button>
    </div>
    {error ? <p className="tp-admin-error" role="alert">{error}</p> : null}
    {stale ? <p role="alert">结果未确认或版本已变化。修改入口已锁定，请先重新读取；不会自动重试写入。</p> : null}
    {dirty ? <p>有未保存的节点修改，请先保存或重新读取。来源切换及导入暂不可用。</p> : null}
    {notice ? <p role="status">{notice}</p> : null}
    {snapshot && !snapshot.items.length && currentSource ? <p>当前来源「{sourceLabel(currentSource, sources)}」暂无节点。{sources.some((source) => source.id !== snapshot.sourceId && source.sourceKind === "inline-yaml" && (source.nodeCount ?? 0) > 0)
      ? `另有 ${sources.filter((source) => source.id !== snapshot.sourceId && source.sourceKind === "inline-yaml" && (source.nodeCount ?? 0) > 0).length} 个来源含节点，请在来源菜单切换。` : "可切换其他来源，或导入新的 YAML 来源。"}</p> : null}
    <ThirdPartyNodeNamesPage key={snapshot ? `${snapshot.sourceId}:${snapshot.revision}:${editorEpoch}` : "no-source"} initialNodes={snapshot?.items.map((node) => ({ ...node, sourceName: currentSource?.name ?? "" })) ?? []} persistence={{
      enabled: snapshot?.enabled ?? false, busy: busy || stale || denied, placeholder,
      onSave: save, onEnable: () => { if (snapshot) setConfirm("enable"); }, onDirtyChange: setDirty, importAction,
      onDisable: () => { if (snapshot?.enabled && !busyRef.current && !dirty && !stale && !denied) setConfirm("disable"); },
      selectionActionsOnly: true,
      onSetNodesEnabled: client.setNodeEnabled ? requestNodesEnabled : undefined,
      onDeleteNodes: client.deleteNode ? requestDeleteNodes : undefined,
      bulkPauseBeforeDelete: !!client.setNodeEnabled,
    }} />
    {confirm ? <div className="tp-import"><ModalFrame title={confirm === "enable" ? "确认启用分发" : confirm === "disable" ? "确认停用来源" : "放弃未保存修改？"} titleId={`${modalId}-confirm`} panelClassName="tp-import-modal" closeLabel="取消操作" onClose={() => setConfirm(null)}>
      {confirm === "disable" ? <p>将停用整个来源「{currentSource?.name ?? "当前来源"}」，共 {snapshot?.items.length ?? 0} 个节点。可用于整组维护；改名和国旗调整保存后需手动重新启用来源。</p> : null}
      <p>{confirm === "enable" ? "将把已保存且单独启用的节点提供给来源所分配套餐的有效订阅用户。请确认你有权分发这些配置。" : confirm === "disable" ? "后续订阅不再下发此来源。已下载配置及第三方凭证不会因此失效。" : "重新读取将丢弃当前未保存的改名和国旗草稿，不会写入后台。"}</p>
      <button type="button" onClick={() => setConfirm(null)}>取消</button><button type="button" onClick={executeConfirmed}>确认{confirm === "enable" ? "启用" : confirm === "disable" ? "停用" : "重新读取"}</button>
    </ModalFrame></div> : null}
    {nodeConfirm ? <div className="tp-import"><ModalFrame title={nodeConfirm.enabled ? "确认启用节点" : "确认暂停节点"} titleId={`${modalId}-node-confirm`} panelClassName="tp-import-modal" closeLabel="取消操作" onClose={() => setNodeConfirm(null)}>
      <p>将{nodeConfirm.enabled ? "启用" : "暂停"}以下 {nodeConfirm.nodeIds.length} 个选中节点，逐项确认后立即保存；已处于目标状态的节点不重复修改。来源开关和其他节点保持不变。</p>
      <ul style={{ maxHeight: "16rem", overflowY: "auto" }}>{nodeConfirm.nodeIds.map((id) => <li key={id}>{renderedNodeName(nodeConfirm.snapshot.items.find((node) => node.id === id)!)}</li>)}</ul>
      <p>{nodeConfirm.enabled ? "仅当来源已启用且订阅套餐符合条件时，该节点才会参与后续分发。" : "后续订阅不再下发该节点。已下载的配置及第三方凭证不会因此失效。"}</p>
      <p>任何失败或状态变化都会停止剩余操作，不自动重试；暂停只影响后续订阅下发。</p>
      <button type="button" onClick={() => setNodeConfirm(null)}>取消</button><button type="button" onClick={executeNodeEnabled}>{nodeConfirm.enabled ? "确认启用节点" : "确认暂停节点"}</button>
    </ModalFrame></div> : null}
    {bulkConfirm ? <div className="tp-import"><ModalFrame title="确认批量删除节点" titleId={`${modalId}-bulk-confirm`} panelClassName="tp-import-modal" closeLabel="取消操作" onClose={() => setBulkConfirm(null)}>
      <p>将从来源「{bulkConfirm.sourceLabel}」删除以下 {bulkConfirm.nodeIds.length} 个节点。此操作不可撤销。</p>
      <p>其中 {bulkConfirm.snapshot.items.filter((node) => bulkConfirm.nodeIds.includes(node.id) && node.enabled !== false).length} 个仍启用，确认后将先暂停再删除；已暂停的直接删除。不会暂停整个来源。</p>
      <ul style={{ maxHeight: "16rem", overflowY: "auto" }}>{bulkConfirm.nodeIds.map((id) => <li key={id}>{renderedNodeName(bulkConfirm.snapshot.items.find((node) => node.id === id)!)}</li>)}</ul>
      <p>逐项确认后立即保存。任何失败或状态变化都会停止剩余操作，来源开关和其他节点保持不变。</p>
      <button type="button" disabled={busy} onClick={() => setBulkConfirm(null)}>取消</button><button type="button" disabled={busy} onClick={executeDeleteNodes}>确认批量删除</button>
    </ModalFrame></div> : null}
  </div>;
}
