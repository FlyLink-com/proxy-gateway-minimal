import { Check, Globe2, Pause, Pencil, Play, Power, RotateCcw, Save, Search, ShieldCheck, Trash2, X } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import type { ReactNode } from "react";
import { renderedNodeName, validateNodeName } from "./node-name-model";
import type { ThirdPartyNode } from "./node-name-model";
import { isNodeCountryCode, NODE_COUNTRY_OPTIONS } from "./node-country-model";
import { ThirdPartyImportEntry } from "./third-party-import-entry";
import "./third-party-node-names.css";

const COUNTRIES: Record<string, string> = { JP: "日本", SG: "新加坡", US: "美国", DE: "德国", GB: "英国", HK: "香港" };
const countryOptions = NODE_COUNTRY_OPTIONS.map(({ value, label }) => <option key={value} value={value}>{label}</option>);

export type ThirdPartyNodePersistence = {
  enabled: boolean;
  busy: boolean;
  onSave: (nodes: readonly ThirdPartyNode[]) => void;
  onEnable: () => void;
  onDisable?: () => void;
  onSetNodeEnabled?: (nodeId: string, enabled: boolean) => void;
  onSetNodesEnabled?: (nodeIds: readonly string[], enabled: boolean) => void;
  selectionActionsOnly?: boolean;
  onDeleteNode?: (nodeId: string) => void;
  onDeleteNodes?: (nodeIds: readonly string[]) => void;
  // The owner must confirm the complete target list and safely pause enabled
  // nodes before deletion. Omitted/false preserves the paused-only contract.
  bulkPauseBeforeDelete?: boolean;
  onDirtyChange?: (dirty: boolean) => void;
  importAction: ReactNode;
  // No confirmed source snapshot: show the editor shell without claiming a
  // saved list or allowing a write. Import availability belongs to the owner.
  placeholder?: { title: string; description: string };
};

export function ThirdPartyNodeNamesPage({ initialNodes, persistence }: { initialNodes: readonly ThirdPartyNode[]; persistence?: ThirdPartyNodePersistence }) {
  const [nodes, setNodes] = useState(() => initialNodes.map((node) => ({ ...node })));
  const [selectedId, setSelectedId] = useState("");
  const [draft, setDraft] = useState("");
  const [search, setSearch] = useState("");
  const [protocol, setProtocol] = useState("");
  const [selectionError, setSelectionError] = useState("");
  const [message, setMessage] = useState("");
  const [deleteId, setDeleteId] = useState("");
  const [checkedIds, setCheckedIds] = useState<ReadonlySet<string>>(() => new Set());
  // The owner remounts with the server revision after a successful save. In local
  // preview these snapshots remain in memory and never imply backend success.
  const [savedNodes, setSavedNodes] = useState<readonly ThirdPartyNode[] | null>(() => persistence ? nodes : null);
  const [enabledNodes, setEnabledNodes] = useState<readonly ThirdPartyNode[] | null>(null);
  const fieldId = useId();
  const editButtons = useRef(new Map<string, HTMLButtonElement>());
  const deleteButtons = useRef(new Map<string, HTMLButtonElement>());
  const searchInput = useRef<HTMLInputElement>(null);
  const selected = nodes.find((node) => node.id === selectedId);
  const deleteTarget = nodes.find((node) => node.id === deleteId);
  const validation = selected ? validateNodeName(nodes, selectedId, draft) : { value: null, error: null };
  const dirty = selected
    ? validation.error ? draft !== (selected.customName ?? "") : validation.value !== selected.customName
    : false;
  const query = search.trim().toLowerCase();
  const filtered = nodes.filter((node) => (!protocol || node.protocol === protocol)
    && [node.originalName, renderedNodeName(node), node.sourceName, node.customCountryCode ?? node.countryCode, COUNTRIES[node.customCountryCode ?? node.countryCode] ?? ""].some((part) => part.toLowerCase().includes(query)));
  const editorHidden = Boolean(selected && !filtered.some((node) => node.id === selectedId));
  const listSaved = savedNodes === nodes;
  const listEnabled = persistence ? persistence.enabled : enabledNodes === nodes;
  const writesBlocked = Boolean(persistence?.placeholder || persistence?.busy || persistence?.enabled);
  const actionBlocked = Boolean(writesBlocked || deleteId || dirty || validation.error);
  // Direct deletion has its own confirmation, not an unsaved bulk-list edit.
  const unsaved = !listSaved || Boolean(dirty || validation.error || (deleteId && !persistence?.onDeleteNode));
  const lifecycleBlocked = Boolean(persistence?.placeholder || persistence?.busy || !listSaved || dirty || validation.error || selectedId);
  const selectionActionsOnly = persistence?.selectionActionsOnly === true;
  const directLifecycle = Boolean(persistence?.onSetNodeEnabled || persistence?.onSetNodesEnabled);
  const bulkSelection = Boolean(persistence?.onDeleteNodes || (selectionActionsOnly && persistence?.onSetNodesEnabled));
  const checkedNodes = filtered.filter((node) => checkedIds.has(node.id));
  const checkedEnabledCount = checkedNodes.filter((node) => node.enabled !== false).length;
  const checkedPausedCount = checkedNodes.length - checkedEnabledCount;
  const bulkPauseBeforeDelete = persistence?.bulkPauseBeforeDelete === true;
  const bulkSelectionBlocked = lifecycleBlocked || Boolean(deleteId);
  const bulkDeleteBlocked = !persistence?.onDeleteNodes || bulkSelectionBlocked || !checkedNodes.length || (checkedEnabledCount > 0 && !bulkPauseBeforeDelete)
    || checkedNodes.length !== checkedIds.size;
  const bulkLifecycleBlocked = !persistence?.onSetNodesEnabled || bulkSelectionBlocked || checkedNodes.length !== checkedIds.size;
  const allVisibleChecked = filtered.length > 0 && checkedNodes.length === filtered.length;
  const onDirtyChange = persistence?.onDirtyChange;
  useEffect(() => { onDirtyChange?.(unsaved); }, [onDirtyChange, unsaved]);
  const saveState = persistence?.placeholder ? "未就绪" : persistence
    ? listEnabled ? "已启用 · 后台" : unsaved ? "未保存 · 草稿" : "已保存 · 未启用"
    : listEnabled ? "已启用 · 本地预览" : listSaved ? "已保存 · 本地" : "未保存 · 本地";

  function saveList() {
    if (actionBlocked || listSaved || (!persistence && !nodes.length)) return;
    if (persistence) { persistence.onSave(nodes); return; }
    setSavedNodes(nodes);
    setMessage("已保存本地快照，刷新后恢复；未保存到后台。");
  }

  function enableList() {
    if (actionBlocked || !nodes.length || !listSaved || listEnabled) return;
    if (persistence) { persistence.onEnable(); return; }
    setEnabledNodes(nodes);
    setMessage("已启用（本地预览），不会发布或改变真实订阅；刷新后恢复。");
  }

  function requestDisable() {
    if (!persistence?.enabled || persistence.busy || persistence.placeholder || unsaved) return;
    persistence.onDisable?.();
  }

  function updateFilter(nextSearch: string, nextProtocol: string) {
    setSearch(nextSearch);
    setProtocol(nextProtocol);
    // A row-local confirmation must never remain armed when filters change.
    setDeleteId("");
    // Selection cannot carry hidden rows into a later destructive action.
    setCheckedIds(new Set());
  }

  function checkNode(nodeId: string, checked: boolean) {
    if (!bulkSelection || bulkSelectionBlocked || !filtered.some((node) => node.id === nodeId)) return;
    setCheckedIds((current) => {
      const next = new Set(current);
      if (checked) next.add(nodeId);
      else next.delete(nodeId);
      return next;
    });
  }

  function checkVisibleNodes(checked: boolean) {
    if (!bulkSelection || bulkSelectionBlocked) return;
    setCheckedIds(new Set(checked ? filtered.map((node) => node.id) : []));
  }

  function requestBulkDelete() {
    if (!persistence?.onDeleteNodes || bulkDeleteBlocked) return;
    // The owner owns confirmation and revision-bound mutation. Do not remove
    // rows optimistically or pass this component's mutable selection object.
    persistence.onDeleteNodes(Object.freeze(checkedNodes.map((node) => node.id)));
  }

  function requestBulkLifecycle(enabled: boolean) {
    if (!selectionActionsOnly || !persistence?.onSetNodesEnabled || bulkLifecycleBlocked) return;
    const targets = checkedNodes.filter((node) => (node.enabled !== false) !== enabled);
    if (!targets.length) return;
    // Only request the selected nodes needing a change. Confirmation, latest
    // revisions and partial-result handling belong to the owner, not this view.
    persistence.onSetNodesEnabled(Object.freeze(targets.map((node) => node.id)), enabled);
  }

  function selectNode(node: ThirdPartyNode) {
    if (writesBlocked || deleteId) return;
    if (node.id === selectedId) return;
    if (dirty) { setSelectionError("请先应用或取消当前修改。"); return; }
    setSelectedId(node.id);
    setDraft(node.customName ?? "");
    setSelectionError("");
    setMessage("");
  }

  function updateDraft(value: string) {
    if (writesBlocked) return;
    setDraft(value);
    setSelectionError("");
    setMessage("");
  }

  function updateCountry(nodeId: string, country: string) {
    if (writesBlocked || deleteId || dirty || validation.error || (country !== "" && !isNodeCountryCode(country))) return;
    const next = nodes.map((node) => node.id === nodeId ? { ...node, customCountryCode: country || null } : node);
    const target = next.find((node) => node.id === nodeId);
    if (!target) return;
    const result = validateNodeName(next, nodeId, target.customName ?? "");
    if (result.error) { setSelectionError(result.error); return; }
    setNodes(next);
    setSelectionError("");
    setMessage(persistence ? "国旗已加入待保存草稿，请保存节点列表；后台尚未改变。" : "国旗已更新本地预览，尚未保存到后台。");
  }

  function finishEditing() {
    setSelectedId("");
    setDraft("");
    setSelectionError("");
    const button = editButtons.current.get(selectedId);
    requestAnimationFrame(() => button?.focus());
  }

  function apply() {
    if (writesBlocked || deleteId || !selected || validation.error || !dirty) return;
    setNodes((current) => current.map((node) => node.id === selectedId ? { ...node, customName: validation.value } : node));
    finishEditing();
    setMessage(persistence ? "名称已加入待保存草稿，请保存节点列表；后台尚未改变。" : "已更新本地预览，尚未保存到后台。");
  }

  function cancelDelete() {
    const opener = deleteButtons.current.get(deleteId);
    setDeleteId("");
    requestAnimationFrame(() => {
      if (opener?.isConnected) opener.focus();
      else searchInput.current?.focus();
    });
  }

  function confirmDelete() {
    if (persistence?.onDeleteNode) {
      if (lifecycleBlocked || !deleteTarget || deleteTarget.enabled !== false) return;
      setDeleteId("");
      persistence.onDeleteNode(deleteTarget.id);
      return;
    }
    if (writesBlocked || !deleteTarget) return;
    setNodes((current) => current.filter((node) => node.id !== deleteId));
    if (selectedId === deleteId) {
      setSelectedId("");
      setDraft("");
      setSelectionError("");
    }
    setDeleteId("");
    setMessage(persistence ? "已从草稿移除 1 个节点，请保存节点列表；后台尚未改变。" : "已从本地预览删除 1 个节点，刷新页面可恢复；后台未改变。");
    searchInput.current?.focus();
  }

  return (
    <div className="tp-names">
      <header className="tp-names-heading">
        <div><p className="tp-names-eyebrow">订阅管理 / 第三方节点</p><h1>第三方节点命名</h1></div>
        <span className="tp-names-local-badge"><ShieldCheck size={15} aria-hidden="true" />{persistence ? "管理员操作" : "本地预览"}</span>
      </header>
      <section className="tp-names-panel" aria-label="第三方节点列表">
        <div className="tp-names-panel-heading"><h2>节点列表 <span>{filtered.length} / {nodes.length}</span></h2><span className={`tp-names-save-state${listEnabled ? " is-enabled" : ""}`}>{saveState}</span></div>
        <div className="tp-names-toolbar">
          <div className="tp-names-filters">
            <label className="tp-names-search"><span className="tp-names-sr-only">搜索节点</span><Search size={17} aria-hidden="true" /><input ref={searchInput} type="text" value={search} onChange={(event) => { updateFilter(event.target.value, protocol); searchInput.current?.focus(); }} placeholder="搜索节点名称" /></label>
            <label><span className="tp-names-sr-only">协议筛选</span><select value={protocol} onChange={(event) => updateFilter(search, event.target.value)}><option value="">全部协议</option>{["VLESS", "Hy2", "TUIC", "SS"].map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
          </div>
          <div className="tp-names-toolbar-actions" role="group" aria-label="节点列表操作">
            {persistence ? persistence.importAction : <ThirdPartyImportEntry disabled={Boolean(deleteId)} />}
            {selectionActionsOnly ? <>
              <button type="button" className="tp-names-selection-action tp-names-cancel-soft" aria-label="启用选中节点" title="启用选中且当前已暂停的节点，需确认；不改变来源分发开关" disabled={bulkLifecycleBlocked || !checkedPausedCount} onClick={() => requestBulkLifecycle(true)}><Play size={16} aria-hidden="true" /></button>
              <button type="button" className="tp-names-selection-action tp-names-danger-soft" aria-label="暂停选中节点" title="暂停选中且当前已启用的节点，需确认；未选中节点不变" disabled={bulkLifecycleBlocked || !checkedEnabledCount} onClick={() => requestBulkLifecycle(false)}><Pause size={16} aria-hidden="true" /></button>
            </> : null}
            {bulkSelection || selectionActionsOnly ? <button type="button" className="tp-names-bulk-delete tp-names-danger-soft" aria-label="删除选中节点" title={checkedEnabledCount ? bulkPauseBeforeDelete ? "确认后先暂停选中的启用节点，再逐项删除；未选中节点不变" : "选中节点包含仍启用的节点，请先逐个停用，不会自动停用" : "删除当前筛选中选中的已停用节点，需再次确认"} disabled={bulkDeleteBlocked} onClick={requestBulkDelete}><Trash2 size={16} aria-hidden="true" /></button> : null}
            <button type="button" aria-label="保存节点列表" title={persistence ? "保存完整节点列表到后台，不自动启用" : "保存本地快照，不写入后台"} disabled={actionBlocked || listSaved || (!persistence && !nodes.length)} onClick={saveList}><Save size={15} aria-hidden="true" />保存</button>
            {selectionActionsOnly ? null : persistence?.enabled && persistence.onDisable ? <button type="button" className="tp-names-danger-soft" aria-label="暂停来源" title="暂停整个来源的分发；单节点停用请使用行内按钮" disabled={persistence.busy || Boolean(persistence.placeholder) || unsaved || Boolean(deleteId)} onClick={requestDisable}><Pause size={15} aria-hidden="true" />暂停来源</button>
              : <button type="button" className="tp-names-primary" aria-label="启用节点列表" aria-pressed={listEnabled} title={persistence ? "启用后台已保存的节点列表" : "仅启用本地预览，不发布真实订阅"} disabled={actionBlocked || !nodes.length || !listSaved || listEnabled} onClick={enableList}>{persistence ? <Play size={15} aria-hidden="true" /> : <Power size={15} aria-hidden="true" />}{listEnabled ? "已启用" : persistence ? "启用来源" : "启用"}</button>}
          </div>
        </div>
        {bulkSelection ? <div className="tp-names-bulk-selection" aria-label="批量选择状态">
          <span aria-live="polite">已选择 {checkedNodes.length} 个节点</span>
          <button type="button" className="tp-names-cancel-soft" disabled={!checkedIds.size || bulkSelectionBlocked} onClick={() => { if (!bulkSelectionBlocked) setCheckedIds(new Set()); }}>取消选择</button>
          {checkedEnabledCount ? <span className="tp-names-bulk-warning">选中节点中有 {checkedEnabledCount} 个仍启用，{bulkPauseBeforeDelete ? "确认后先暂停，再逐项删除；未选中节点不变。" : "请先逐个停用后再删除。不会自动停用。"}</span> : null}
        </div> : null}
        {persistence && !persistence.placeholder ? <p className="tp-names-maintenance-hint">{selectionActionsOnly
          ? "勾选一个或多个节点后，使用上方播放、暂停或删除图标；确认后只处理选中节点，不改变来源分发开关。名称和国旗修改仍需暂停来源后保存。已缓存的第三方凭证不会被撤销。"
          : directLifecycle
          ? "行内暂停/播放图标只停用或启用该节点，确认后立即生效；停用后可用垃圾桶删除，无需停用整个来源。名称和国旗修改仍需暂停来源后保存。已缓存的第三方凭证不会被撤销。"
          : listEnabled
          ? "来源已启用，节点暂不可编辑或删除。请先停用来源，再删除并保存，最后按需重新启用。停用会暂停整个来源的后续订阅分发。"
          : "点击节点行右侧的垃圾桶图标并确认删除，再点击上方“保存”才会生效；保存不会自动启用来源。"}</p> : null}
        {selectionError ? <p className="tp-names-selection-error" role="alert">{selectionError}</p> : null}
        {editorHidden ? <div className="tp-names-hidden-editor" role="alert"><span>正在编辑的节点被筛选隐藏，修改已保留。</span><button type="button" onClick={() => updateFilter("", "")}>返回编辑行</button></div> : null}
        <div className="tp-names-table-scroll" tabIndex={0} role="region" aria-label="节点列表，可横向滚动">
          <table className={bulkSelection ? "tp-names-bulk-table" : undefined}><thead><tr>{bulkSelection ? <th scope="col" className="tp-names-bulk-cell"><label className="tp-names-check-target"><input type="checkbox" aria-label="选择当前筛选的全部节点" title="仅选择当前筛选中可见的节点" checked={allVisibleChecked} ref={(element) => { if (element) element.indeterminate = checkedNodes.length > 0 && !allVisibleChecked; }} disabled={bulkSelectionBlocked || !filtered.length} onChange={(event) => checkVisibleNodes(event.target.checked)} /></label></th> : null}<th scope="col">原始名称</th><th scope="col">对外显示名称</th><th scope="col">国家/地区</th><th scope="col">协议</th><th scope="col">操作</th></tr></thead>
            <tbody>{filtered.map((node) => {
              const editing = node.id === selectedId;
              const nodeEnabled = node.enabled !== false;
              const deleteBlocked = persistence?.onDeleteNode ? lifecycleBlocked || nodeEnabled : writesBlocked;
              return <tr key={node.id} className={editing ? "tp-names-selected" : ""}>
                {bulkSelection ? <td className="tp-names-bulk-cell"><label className="tp-names-check-target"><input type="checkbox" aria-label={`选择 ${node.originalName}`} checked={checkedIds.has(node.id)} disabled={bulkSelectionBlocked} onChange={(event) => checkNode(node.id, event.target.checked)} /></label></td> : null}
                <td><strong>{node.originalName}</strong></td>
                <td>{editing ? <form id={`${fieldId}-form`} onSubmit={(event) => { event.preventDefault(); apply(); }}>
                  <label className="tp-names-sr-only" htmlFor={fieldId}>对外显示名称</label>
                  <input id={fieldId} value={draft} disabled={writesBlocked || Boolean(deleteId)} onChange={(event) => updateDraft(event.target.value)} onKeyDown={(event) => {
                    if (event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229) {
                      if (event.key === "Enter") event.preventDefault();
                      return;
                    }
                    if (event.key === "Escape") { event.preventDefault(); finishEditing(); setMessage(""); }
                    if (event.key === "Enter") { event.preventDefault(); apply(); }
                  }} aria-invalid={Boolean(validation.error)} aria-describedby={`${fieldId}-hint${validation.error ? ` ${fieldId}-error` : ""}`} placeholder={node.defaultName} autoComplete="off" spellCheck={false} autoFocus />
                  <span id={`${fieldId}-hint`} className="tp-names-sr-only">留空并应用后恢复默认名称，最多 128 个字符，部分符号计为两个字符。Enter 应用到草稿，Escape 取消。</span>
                  {validation.error ? <p id={`${fieldId}-error`} className="tp-names-error" role="alert">{validation.error}</p> : null}
                </form> : <span className="tp-names-rendered">{renderedNodeName(node)}</span>}</td>
                <td><select className="tp-names-country" aria-label={`国家/地区 ${node.originalName}`} title="仅调整显示国旗，不改变真实节点地区；需保存后生效" value={node.customCountryCode ?? ""} disabled={writesBlocked || Boolean(deleteId) || dirty || Boolean(validation.error)} onChange={(event) => updateCountry(node.id, event.target.value)}><option value="">保留原名称</option><option value="OTHER">不显示国旗</option>{countryOptions}</select></td>
                <td><span className="tp-names-protocol">{node.protocol}</span>{directLifecycle || selectionActionsOnly ? <span className={`tp-names-node-state${nodeEnabled ? "" : " is-disabled"}`} aria-label={`节点状态 ${node.originalName}`}>{nodeEnabled ? listEnabled ? "分发中" : "待分发" : "已停用"}</span> : null}</td>
                <td><div className={`tp-names-actions-slot${deleteId === node.id ? " is-confirming" : ""}`}><div className="tp-names-row-actions">
                  <button type="button" className="tp-names-edit" hidden={editing} disabled={writesBlocked || Boolean(deleteId)} aria-label={`编辑 ${node.originalName}`} ref={(element) => { if (element) editButtons.current.set(node.id, element); else editButtons.current.delete(node.id); }} onClick={() => selectNode(node)}><Pencil size={14} aria-hidden="true" />编辑</button>
                  {editing ? <>
                    <button type="submit" form={`${fieldId}-form`} className="tp-names-primary" aria-label={persistence ? "应用到待保存列表" : "应用到本地预览"} disabled={writesBlocked || Boolean(deleteId) || !dirty || Boolean(validation.error)}><Check size={14} aria-hidden="true" />保存</button>
                    <button type="button" aria-label="恢复默认名称" title="恢复默认名称" onClick={() => updateDraft("")} disabled={writesBlocked || Boolean(deleteId) || !draft}><RotateCcw size={14} aria-hidden="true" />恢复</button>
                    <button type="button" aria-label="取消修改" disabled={writesBlocked || Boolean(deleteId)} onClick={() => { finishEditing(); setMessage(""); }}><X size={14} aria-hidden="true" />取消</button>
                  </> : null}
                  {!selectionActionsOnly && persistence?.onSetNodeEnabled ? <button type="button" className={`tp-names-node-toggle ${nodeEnabled ? "tp-names-danger-soft" : "tp-names-cancel-soft"}`} aria-label={`${nodeEnabled ? "停用" : "启用"}节点 ${node.originalName}`} title={nodeEnabled ? "暂停此节点：仅停止此节点的后续分发" : "启用此节点：来源启用时参与分发"} disabled={lifecycleBlocked || Boolean(deleteId)} onClick={() => { if (!lifecycleBlocked && !deleteId) persistence.onSetNodeEnabled?.(node.id, !nodeEnabled); }}>{nodeEnabled ? <Pause size={16} aria-hidden="true" /> : <Play size={16} aria-hidden="true" />}</button> : null}
                  {!selectionActionsOnly ? <button type="button" className="tp-names-delete" aria-label={`删除 ${node.originalName}`} title={persistence?.onDeleteNode && nodeEnabled ? "请先停用此节点，再删除" : "删除节点"} aria-expanded={deleteId === node.id} disabled={deleteBlocked || Boolean(deleteId)} ref={(element) => { if (element) deleteButtons.current.set(node.id, element); else deleteButtons.current.delete(node.id); }} onClick={() => { if (deleteBlocked) return; setDeleteId(node.id); setMessage(""); }}><Trash2 size={15} aria-hidden="true" /></button> : null}
                </div>
                  {!selectionActionsOnly && deleteId === node.id ? <section className="tp-names-delete-reveal" aria-label="删除节点确认" onKeyDown={(event) => { if (event.key === "Escape") { event.preventDefault(); cancelDelete(); } }}>
                    <span className="tp-names-sr-only">删除 {renderedNodeName(node)}（{node.originalName}）。{persistence?.onDeleteNode ? "确认后立即从后台移除此已停用节点；其他节点不变，不撤销客户端已缓存的凭证。" : persistence ? "仅从待保存草稿移除；保存节点列表后才会停止后续订阅分发，不撤销客户端已缓存的凭证。" : "仅从本地预览移除，刷新页面可恢复，不会删除后台节点。"}{editing && dirty ? "该节点尚未保存的名称修改也会被丢弃。" : ""}</span>
                    <button type="button" className="tp-names-danger-soft" aria-label="确认删除" disabled={deleteBlocked} onClick={confirmDelete}><Trash2 size={14} aria-hidden="true" />删除</button>
                    <button type="button" className="tp-names-cancel-soft" aria-label="取消删除" onClick={cancelDelete} autoFocus><X size={14} aria-hidden="true" />取消</button>
                  </section> : null}
                </div></td>
              </tr>;
            })}</tbody>
          </table>
          {filtered.length === 0 ? <div className="tp-names-empty"><Globe2 size={26} aria-hidden="true" /><h3>{persistence?.placeholder?.title ?? (nodes.length ? "没有匹配的节点" : persistence ? "暂无节点" : "暂无演示节点")}</h3><p>{persistence?.placeholder?.description ?? (nodes.length ? "尝试更换搜索词或协议筛选。" : persistence ? "此来源没有保留的节点，空列表不能启用。" : "此预览不读取后台节点。")}</p></div> : null}
        </div>
        <footer className="tp-names-list-foot"><ShieldCheck size={14} aria-hidden="true" /><span>{directLifecycle ? "节点停用与删除只影响后续订阅分发；不修改上游凭证或历史用量。" : persistence ? listEnabled ? "来源已启用，请先停用后再编辑；不修改节点凭证或历史用量。" : "修改需保存列表后生效；启用需单独操作，不修改节点凭证或历史用量。" : "本地预览 · 合成数据 · 未连接后台 · 刷新后恢复"}</span><span className="tp-names-feedback" role="status">{message}</span></footer>
      </section>
    </div>
  );
}
