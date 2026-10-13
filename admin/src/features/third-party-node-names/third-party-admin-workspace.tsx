import { useCallback, useEffect, useId, useRef, useState } from "react";
import { ModalFrame } from "../../shared/public/modal-frame";
import { ThirdPartyNodeNamesPage } from "./third-party-node-names-page";
import { ThirdPartyAdminImport } from "./third-party-admin-import";
import type { ThirdPartyImportInput } from "./third-party-admin-import";
import { createThirdPartyAdminClient, ThirdPartyAdminError } from "./third-party-admin-client";
import type { ThirdPartyAdminClient, ThirdPartySource, ThirdPartyNodeSnapshot } from "./third-party-admin-client";
import type { ThirdPartyNode } from "./node-name-model";
import "./third-party-admin-workspace.styles.css";

const ERROR_COPY: Record<string, string> = {
  session: "Admin 登录已失效，请重新登录。", permission: "当前账户没有此操作的 Admin 权限。",
  unavailable: "第三方节点管理尚未启用或服务暂不可用。", network: "请求未确认，请检查连接并重新读取状态。",
  invalid: "请求或响应不符合接口要求，请重新读取后检查输入。",
  revision_conflict: "来源已被其他操作更新。请重新读取，核对后再修改；不会覆盖最新版本。",
  source_enabled: "来源当前已启用，请重新读取并先停用来源。", empty_source: "空来源不可启用，请先导入节点。",
  invalid_node_name: "节点名称不符合要求，请检查长度和保留名称。", duplicate_node_name: "存在重复的节点名称。",
};

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
  const busyRef = useRef(false);
  const requestRef = useRef<AbortController | null>(null);
  const generation = useRef(0);
  const mounted = useRef(true);
  const currentSource = sources.find((source) => source.id === snapshot?.sourceId);
  const modalId = useId();

  const run = useCallback(async <T,>(operation: (signal: AbortSignal) => Promise<T>, success: (value: T) => void, mutation = false) => {
    if (busyRef.current || !mounted.current) return false;
    busyRef.current = true;
    setBusy(true); setError(""); setNotice("");
    const controller = new AbortController(); requestRef.current = controller;
    const requestId = ++generation.current;
    const timeout = window.setTimeout(() => controller.abort(), 15000);
    const isCurrent = () => mounted.current && generation.current === requestId;
    let abortListener: () => void = () => {};
    try {
      // A late or non-cooperative transport must not publish success after timeout.
      const result = await Promise.race([operation(controller.signal), new Promise<never>((_resolve, reject) => {
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
      if (mutation || code === "revision_conflict" || code === "source_enabled") setStale(true);
      if (code === "session" || code === "permission") {
        setSnapshot(null); setSources([]); setDirty(false); setDenied(true);
        if (code === "session") onSessionExpired?.();
      }
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
    const target = editable.find((source) => source.id === preferredId) ?? editable[0];
    return { listed, view: target ? await client.listNodes(target.id, signal) : null };
  }, ({ listed, view }) => {
    setSources(listed); setSnapshot(view); setDirty(false); setEditorEpoch((epoch) => epoch + 1);
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
    setSources((current) => current.map((source) => source.id === view.sourceId ? { ...source, enabled: view.enabled } : source));
  };

  function save(nodes: readonly ThirdPartyNode[]) {
    if (!snapshot || snapshot.enabled || stale || denied || busyRef.current) return;
    void run((signal) => client.saveNodes(snapshot.sourceId, {
      revision: snapshot.revision, nodes: nodes.map(({ id, customName }) => ({ id, customName }))
    }, signal), (view) => { receive(view); setNotice("节点列表已保存，尚未启用分发。"); }, true);
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
        return client.listNodes(snapshot.sourceId, signal);
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
    <p className="tp-admin-boundary">仅限已登录 Admin。改名和删除先保存，启用后才参与后续订阅分发；不改变自营计量。</p>
    <div className="tp-admin-source-toolbar">
      <label>来源<select aria-label="第三方来源" disabled={busy || dirty || stale || denied || !sources.length} value={snapshot?.sourceId ?? ""} onChange={(event) => {
        const id = event.target.value;
        if (busyRef.current || dirty || stale || denied) return;
        setSnapshot(null);
        void run((signal) => client.listNodes(id, signal), receive);
      }}><option value="" disabled>选择来源</option>{sources.map((source) => <option key={source.id} value={source.id} disabled={source.sourceKind !== "inline-yaml"}>{source.name}{source.sourceKind !== "inline-yaml" ? " · 暂不支持编辑" : source.enabled ? " · 已启用" : " · 停用"}</option>)}</select></label>
      <button type="button" disabled={busy || denied} onClick={() => dirty ? setConfirm("reload") : void readAll(snapshot?.sourceId)}>重新读取</button>
      {snapshot?.enabled ? <button type="button" disabled={busy || stale || denied} onClick={() => setConfirm("disable")}>停用后编辑</button> : null}
    </div>
    {error ? <p className="tp-admin-error" role="alert">{error}</p> : null}
    {stale ? <p role="alert">结果未确认或版本已变化。修改入口已锁定，请先重新读取；不会自动重试写入。</p> : null}
    {dirty ? <p>有未保存的节点修改，请先保存或重新读取。来源切换及导入暂不可用。</p> : null}
    {notice ? <p role="status">{notice}</p> : null}
    <ThirdPartyNodeNamesPage key={snapshot ? `${snapshot.sourceId}:${snapshot.revision}:${editorEpoch}` : "no-source"} initialNodes={snapshot?.items.map((node) => ({ ...node, sourceName: currentSource?.name ?? "" })) ?? []} persistence={{
      enabled: snapshot?.enabled ?? false, busy: busy || stale || denied, placeholder,
      onSave: save, onEnable: () => { if (snapshot) setConfirm("enable"); }, onDirtyChange: setDirty, importAction,
    }} />
    {confirm ? <div className="tp-import"><ModalFrame title={confirm === "enable" ? "确认启用分发" : confirm === "disable" ? "确认停用来源" : "放弃未保存修改？"} titleId={`${modalId}-confirm`} panelClassName="tp-import-modal" closeLabel="取消操作" onClose={() => setConfirm(null)}>
      <p>{confirm === "enable" ? "将把已保存的节点提供给来源所分配套餐的有效订阅用户。请确认你有权分发这些配置。" : confirm === "disable" ? "后续订阅不再下发此来源。已下载配置及第三方凭证不会因此失效。" : "重新读取将丢弃当前未保存的改名和删除草稿，不会写入后台。"}</p>
      <button type="button" onClick={() => setConfirm(null)}>取消</button><button type="button" onClick={executeConfirmed}>确认{confirm === "enable" ? "启用" : confirm === "disable" ? "停用" : "重新读取"}</button>
    </ModalFrame></div> : null}
  </div>;
}
