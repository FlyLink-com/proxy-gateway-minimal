import { useCallback, useEffect, useId, useRef, useState } from "react";
import { ModalFrame } from "../../shared/public/modal-frame";
import { NODE_COUNTRY_OPTIONS, countryFlag } from "./node-country-model";
import {
  createSubscriptionDistributionClient, DistributionError, DISTRIBUTION_PLANS,
  type DistributionPlan, type DistributionSnapshot, type SubscriptionDistributionClient
} from "./subscription-distribution-client";
import "./subscription-distribution-panel.styles.css";

const PLAN_LABELS: Record<DistributionPlan, string> = { monthly_basic: "基础月度", monthly_plus: "进阶月度", yearly: "年度" };
const ERROR_COPY = {
  session: "Admin 登录已失效，请重新登录。", permission: "当前账户没有订阅分发管理权限。",
  unavailable: "统一订阅分发尚未启用或暂不可用；下方第三方来源管理可继续使用。",
  stale: "分发目录或策略已经变化，请重新读取后核对；本次不会覆盖最新状态。",
  invalid: "接口数据或输入不符合要求，请重新读取后核对。",
  network: "请求结果未确认，请重新读取状态；不会自动重试保存。",
  timeout: "请求超时，结果未确认。请重新读取状态；不会自动重试保存。"
};
type Confirmation = "routes" | "owned" | "reload" | null;
function clone(value: DistributionSnapshot): DistributionSnapshot { return JSON.parse(JSON.stringify(value)) as DistributionSnapshot; }
function dirtyPart(saved: DistributionSnapshot | null, draft: DistributionSnapshot | null, part: "owned" | "routes") {
  return Boolean(saved && draft && JSON.stringify(saved[part]) !== JSON.stringify(draft[part]));
}

export function SubscriptionDistributionPanel({ onSessionExpired, client: providedClient }: {
  onSessionExpired?: () => void; client?: SubscriptionDistributionClient;
} = {}) {
  const [client] = useState(() => providedClient ?? createSubscriptionDistributionClient());
  const [saved, setSaved] = useState<DistributionSnapshot | null>(null);
  const [draft, setDraft] = useState<DistributionSnapshot | null>(null);
  const [planId, setPlanId] = useState<DistributionPlan>("monthly_basic");
  const [busy, setBusy] = useState(false);
  const [stale, setStale] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [confirmation, setConfirmation] = useState<Confirmation>(null);
  const controllerRef = useRef<AbortController | null>(null);
  const inFlightRef = useRef(false);
  const mountedRef = useRef(false);
  const expiredRef = useRef(onSessionExpired);
  expiredRef.current = onSessionExpired;
  const titleId = useId();
  const routesDirty = dirtyPart(saved, draft, "routes");
  const ownedDirty = dirtyPart(saved, draft, "owned");
  const dirty = routesDirty || ownedDirty;
  const locked = busy || stale;

  const run = useCallback(async (operation: (signal: AbortSignal) => Promise<DistributionSnapshot>, mutation = false) => {
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    const controller = new AbortController(); controllerRef.current = controller;
    setBusy(true); setError(""); setMessage(""); setConfirmation(null);
    try {
      const result = await operation(controller.signal);
      if (!mountedRef.current || controller.signal.aborted) return;
      setSaved(result); setDraft(clone(result)); setStale(false);
      setMessage(mutation ? "分发设置已保存。客户端成功刷新订阅后生效。" : "已读取当前分发设置。");
    } catch (caught) {
      if (!mountedRef.current || controller.signal.aborted) return;
      const code = caught instanceof DistributionError ? caught.code : "network";
      setError(ERROR_COPY[code]);
      setStale(true);
      if (code === "session" || code === "permission") {
        setSaved(null); setDraft(null); setConfirmation(null);
        expiredRef.current?.();
      }
    } finally {
      if (controllerRef.current === controller) {
        inFlightRef.current = false;
        if (mountedRef.current) setBusy(false);
      }
    }
  }, []);

  const reload = useCallback(() => run((signal) => client.read(signal)), [client, run]);
  useEffect(() => {
    mountedRef.current = true;
    void reload();
    return () => { mountedRef.current = false; controllerRef.current?.abort(); controllerRef.current = null; inFlightRef.current = false; };
  }, [reload]);
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  function updateOwned(id: string, change: Partial<DistributionSnapshot["owned"]["items"][number]>) {
    if (locked || confirmation) return;
    setDraft((value) => value ? { ...value, owned: { ...value.owned, items: value.owned.items.map((node) => node.id === id ? { ...node, ...change } : node) } } : value);
  }
  function updateRoute(change: Partial<DistributionSnapshot["routes"][number]>) {
    if (locked || confirmation) return;
    setDraft((value) => value ? { ...value, routes: value.routes.map((route) => route.planId === planId ? { ...route, ...change } : route) } : value);
  }
  const invalidPlans = draft?.routes.filter((route) => route.mode === "third-party" && (route.nodeIds.length === 0 || route.nodeIds.some((id) => !draft.candidates.some((node) => node.id === id && node.enabled && node.sourceEnabled && node.tiers.includes(route.planId))))) ?? [];
  function confirmSave() {
    if (!draft || !saved || busy || stale) return;
    if (confirmation === "routes") {
      if (invalidPlans.length || ownedDirty) return;
      const input = { revision: saved.revision, routes: draft.routes.map((route) => ({ ...route, nodeIds: [...route.nodeIds] })) };
      void run(async (signal) => {
        const result = await client.saveRoutes(input, signal);
        if (JSON.stringify(result.owned) !== JSON.stringify(saved.owned) || JSON.stringify(result.candidates) !== JSON.stringify(saved.candidates)) throw new DistributionError("invalid");
        return result;
      }, true);
    } else if (confirmation === "owned") {
      if (routesDirty) return;
      const input = { revision: saved.revision, enabled: draft.owned.enabled, nodes: draft.owned.items.map((node) => ({
        id: node.id, enabled: node.enabled, customName: node.customName?.trim() || null, customCountryCode: node.customCountryCode ?? null
      })) };
      void run(async (signal) => {
        const result = await client.saveOwned(input, signal);
        if (JSON.stringify(result.routes) !== JSON.stringify(saved.routes) || JSON.stringify(result.candidates) !== JSON.stringify(saved.candidates)) throw new DistributionError("invalid");
        return result;
      }, true);
    }
  }
  const route = draft?.routes.find((value) => value.planId === planId);
  const candidates = draft?.candidates.filter((node) => node.tiers.includes(planId)) ?? [];
  return (
    <section className="subscription-distribution" aria-label="统一订阅分发" aria-busy={busy}>
      <div className="subscription-distribution-heading">
        <div><h3>配置路由</h3><p>原订阅链接保持不变，按套餐选择下发的配置来源。</p></div>
        <button type="button" disabled={busy} onClick={() => dirty ? setConfirmation("reload") : void reload()}>重新读取分发</button>
      </div>
      {error ? <p role="alert">{error}</p> : null}
      {message ? <p role="status">{message}</p> : null}
      {busy && !draft ? <p role="status">正在读取分发设置…</p> : null}
      {draft ? <>
        <fieldset disabled={locked || Boolean(confirmation) || routesDirty}>
          <legend>自有节点 · 系统来源</legend>
          <p>暂停分发仅停止后续配置下发。停止 BWH 旧连接供流需另行执行并验证；原有额度和计量保留。</p>
          <label className="subscription-distribution-toggle"><input type="checkbox" checked={draft.owned.enabled} onChange={(event) => setDraft({ ...draft, owned: { ...draft.owned, enabled: event.target.checked } })} />启用自有来源分发</label>
          {draft.owned.items.length ? <div className="subscription-distribution-table-wrap"><table>
            <thead><tr><th>显示名称</th><th>国家／地区</th><th>协议</th><th>分发</th><th>运行目录</th></tr></thead>
            <tbody>{draft.owned.items.map((node) => <tr key={node.id}>
              <td><input aria-label={`${node.defaultName} 显示名称`} value={node.customName ?? ""} placeholder={node.defaultName} maxLength={128} onChange={(event) => updateOwned(node.id, { customName: event.target.value || null })} /></td>
              <td><select aria-label={`${node.defaultName} 国家或地区`} value={node.customCountryCode ?? ""} onChange={(event) => updateOwned(node.id, { customCountryCode: event.target.value || undefined })}>
                <option value="">默认（{node.countryCode}）</option>{NODE_COUNTRY_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select></td>
              <td>{node.protocol}</td><td><label><input aria-label={`${node.defaultName} 分发启用`} type="checkbox" checked={node.enabled} onChange={(event) => updateOwned(node.id, { enabled: event.target.checked })} />{node.enabled ? "启用" : "暂停"}</label></td>
              <td>{node.available ? "可用" : "不可用"}</td>
            </tr>)}</tbody>
          </table></div> : <p>当前运行目录没有自有节点。</p>}
          <button type="button" disabled={!ownedDirty || routesDirty} onClick={() => setConfirmation("owned")}>保存自有分发</button>
        </fieldset>
        <fieldset disabled={locked || Boolean(confirmation) || ownedDirty}>
          <legend>套餐配置路由</legend>
          <label>选择套餐<select aria-label="选择套餐" value={planId} onChange={(event) => setPlanId(event.target.value as DistributionPlan)}>{DISTRIBUTION_PLANS.map((plan) => <option key={plan} value={plan}>{PLAN_LABELS[plan]}</option>)}</select></label>
          {route ? <>
            <div className="subscription-distribution-modes">
              <label><input name={`${titleId}-mode`} type="radio" checked={route.mode === "owned"} onChange={() => updateRoute({ mode: "owned", nodeIds: [] })} />自有节点</label>
              <label><input name={`${titleId}-mode`} type="radio" checked={route.mode === "third-party"} onChange={() => updateRoute({ mode: "third-party", nodeIds: [] })} />第三方节点</label>
            </div>
            {route.mode === "owned" ? <p>该套餐下发已启用且可用的自有节点。</p> : <div className="subscription-distribution-candidates">
              <p>选择该套餐要下发的第三方节点。来源或节点暂停后，不会自动回落自有节点。</p>
              <p>已选 {route.nodeIds.length} / 256 项。</p>
              {candidates.length ? candidates.map((node) => {
                const available = node.enabled && node.sourceEnabled;
                return <label key={node.id}><input type="checkbox" checked={route.nodeIds.includes(node.id)} disabled={!route.nodeIds.includes(node.id) && (!available || route.nodeIds.length >= 256)} onChange={(event) => updateRoute({ nodeIds: event.target.checked ? [...route.nodeIds, node.id] : route.nodeIds.filter((id) => id !== node.id) })} />
                  <span>{countryFlag(node.countryCode)} {node.displayName}<small>{node.sourceName} · {node.protocol}{available ? "" : " · 已暂停"}</small></span>
                </label>;
              }) : <p>该套餐暂无可选第三方节点，请在下方管理来源与套餐归属。</p>}
              {route.nodeIds.some((id) => !candidates.some((node) => node.id === id)) ? <p role="alert">已保存选择中存在不可用节点，请重新选择后保存。</p> : null}
            </div>}
          </> : null}
          {invalidPlans.length ? <p role="alert">{invalidPlans.map((value) => PLAN_LABELS[value.planId]).join("、")}需要选择有效的第三方节点。</p> : null}
          {ownedDirty && routesDirty ? <p>两组设置均有草稿，请先重新读取，再分开保存。</p> : null}
          <button type="button" disabled={!routesDirty || ownedDirty || invalidPlans.length > 0} onClick={() => setConfirmation("routes")}>保存配置路由</button>
        </fieldset>
        <p className="subscription-distribution-footnote">客户端成功刷新订阅后取得新节点。第三方流量不计入自有用量；保存成功不代表旧 BWH 连接已经停止。</p>
      </> : null}
      {confirmation ? <ModalFrame titleId={titleId} title={confirmation === "reload" ? "放弃未保存的分发设置？" : "确认保存订阅分发"} onClose={() => setConfirmation(null)} closeLabel="取消" closeDisabled={busy} footer={
        <button type="button" disabled={busy} onClick={confirmation === "reload" ? () => void reload() : confirmSave}>{confirmation === "reload" ? "放弃草稿并重新读取" : "确认保存"}</button>
      }>
        {confirmation === "reload" ? <p>重新读取将覆盖本页尚未保存的名称、国旗和路由选择。</p> : confirmation === "routes" ? <>
          <p>将保存以下全部套餐路由：</p><ul>{draft?.routes.map((value) => <li key={value.planId}>{PLAN_LABELS[value.planId]}：{value.mode === "owned" ? "自有节点" : `第三方节点（${value.nodeIds.length} 项）`}{value.mode === "third-party" ? <ul>{value.nodeIds.map((id) => <li key={id}>{draft.candidates.find((node) => node.id === id)?.displayName ?? "不可用节点"}</li>)}</ul> : null}</li>)}</ul>
          <p>用户成功刷新后生效，账户、额度与历史用量保持原状。</p>
        </> : <><p>将保存自有来源{draft?.owned.enabled ? "启用" : "暂停"}、各节点分发启停、名称和国旗。</p><p>此操作不会停止现有连接。</p></>}
      </ModalFrame> : null}
    </section>
  );
}
