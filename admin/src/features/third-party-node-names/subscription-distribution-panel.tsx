import { useCallback, useEffect, useId, useRef, useState } from "react";
import { ModalFrame } from "../../shared/public/modal-frame";
import { NODE_COUNTRY_OPTIONS, countryFlag } from "./node-country-model";
import {
  createSubscriptionDistributionClient, DistributionError, DISTRIBUTION_PLANS, isVerifiedBwhSupplyState,
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
const SUPPLY_LABELS = { enabled: "已启用", paused: "已暂停", transitioning: "处理中", failed: "失败待核对", unavailable: "不可用" };
const BANDWIDTH_LABELS = { desired: "已保存", applying: "待生效", applied: "已生效", failed: "失败", unknown: "需要重新读取" };
type Confirmation = "routes" | "owned" | "reload" | "supply-pause" | "supply-enable" | "bandwidth" | null;
function normalizeMbpsDraft(raw: string): string | null {
  const text = raw.trim();
  if (!/^\d{1,5}(\.\d+)?$/.test(text)) return null;
  const [wholeText, fractionText = ""] = text.split(".");
  const whole = Number(wholeText);
  const thousandths = Number((fractionText + "000").slice(0, 3));
  if (!Number.isInteger(whole) || !Number.isInteger(thousandths)) return null;
  let snapped = Math.round((whole * 1000 + thousandths) / 100) * 100;
  if (snapped < 100) snapped = 100;
  if (snapped > 1_000_000) snapped = 1_000_000;
  const major = Math.trunc(snapped / 1000);
  const minor = Math.trunc((snapped % 1000) / 100);
  return minor === 0 ? String(major) : `${major}.${minor}`;
}
function clone(value: DistributionSnapshot): DistributionSnapshot { return JSON.parse(JSON.stringify(value)) as DistributionSnapshot; }
function dirtyPart(saved: DistributionSnapshot | null, draft: DistributionSnapshot | null, part: "owned" | "routes") {
  return Boolean(saved && draft && JSON.stringify(saved[part]) !== JSON.stringify(draft[part]));
}
function supplyIdentity(value: DistributionSnapshot) {
  if (!value.bwhSupply) return undefined;
  const { revision, state, protocolsRunning, collectorState, nativeDistributionEnabled, canPause, canEnable } = value.bwhSupply;
  return JSON.stringify({ revision, state, protocolsRunning, collectorState, nativeDistributionEnabled, canPause, canEnable });
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

  const run = useCallback(async (operation: (signal: AbortSignal) => Promise<DistributionSnapshot>, mutation = false, successMessage?: string) => {
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    const controller = new AbortController(); controllerRef.current = controller;
    setBusy(true); setError(""); setMessage(""); setConfirmation(null);
    try {
      const result = await operation(controller.signal);
      if (!mountedRef.current || controller.signal.aborted) return;
      setSaved(result); setDraft(clone(result)); setStale(false);
      setMessage(successMessage ?? (mutation ? "分发设置已保存。客户端成功刷新订阅后生效。" : "已读取当前分发设置。"));
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

  function updateBandwidth(change: Partial<NonNullable<DistributionSnapshot["bwhBandwidth"]>>) {
    if (locked || confirmation) return;
    setDraft((value) => value?.bwhBandwidth ? { ...value, bwhBandwidth: { ...value.bwhBandwidth, ...change } } : value);
  }
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
    if (confirmation === "supply-pause" || confirmation === "supply-enable") {
      const enabled = confirmation === "supply-enable";
      const supply = saved.bwhSupply;
      if (dirty || !supply || supply.state === "unavailable" || supply.state === "transitioning" || !(enabled ? supply.canEnable : supply.canPause)) return;
      void run(async (signal) => {
        const result = await client.setBwhSupply({ revision: saved.revision, supplyRevision: supply.revision, enabled }, signal);
        if (!isVerifiedBwhSupplyState(result.bwhSupply, enabled) || JSON.stringify(result.owned) !== JSON.stringify(saved.owned)
          || JSON.stringify(result.routes) !== JSON.stringify(saved.routes) || JSON.stringify(result.candidates) !== JSON.stringify(saved.candidates)
          || JSON.stringify(result.automation) !== JSON.stringify(saved.automation)) throw new DistributionError("invalid");
        return result;
      }, true, enabled ? "BWH 协议、身份与检查点已核验，供流及计量调度已恢复；自然采集结果仍需验收，已保存路由不变。" : "BWH 供流已暂停，自有节点停止下发；仅保留所选第三方配置。");
    } else if (confirmation === "bandwidth") {
      const bandwidth = saved.bwhBandwidth;
      const draftBandwidth = draft.bwhBandwidth;
      if (dirty || !bandwidth || !draftBandwidth || typeof client.saveBwhBandwidth !== "function") return;
      const input = {
        bandwidthRevision: bandwidth.revision,
        inboundEnabled: draftBandwidth.inboundEnabled,
        outboundEnabled: draftBandwidth.outboundEnabled,
        inboundMbps: draftBandwidth.inboundMbps ?? "0.1",
        outboundMbps: draftBandwidth.outboundMbps ?? "0.1"
      };
      void run(async (signal) => {
        const result = await client.saveBwhBandwidth?.(input, signal);
        if (!result?.bwhBandwidth || result.bwhBandwidth.inboundEnabled !== input.inboundEnabled || result.bwhBandwidth.outboundEnabled !== input.outboundEnabled
          || JSON.stringify(result.owned) !== JSON.stringify(saved.owned) || JSON.stringify(result.routes) !== JSON.stringify(saved.routes)
          || JSON.stringify(result.candidates) !== JSON.stringify(saved.candidates) || JSON.stringify(result.automation) !== JSON.stringify(saved.automation)
          || supplyIdentity(result) !== supplyIdentity(saved)) throw new DistributionError("invalid");
        return result;
      }, true, "总限速已保存。仅保存限速目标，当前未应用主机规则；不会暂停或恢复供流。");
    } else if (confirmation === "routes") {
      if (invalidPlans.length || ownedDirty) return;
      const input = { revision: saved.revision, routes: draft.routes.map((route) => ({ ...route, nodeIds: [...route.nodeIds] })) };
      void run(async (signal) => {
        const result = await client.saveRoutes(input, signal);
        if (JSON.stringify(result.owned) !== JSON.stringify(saved.owned) || JSON.stringify(result.candidates) !== JSON.stringify(saved.candidates) || JSON.stringify(result.automation) !== JSON.stringify(saved.automation) || supplyIdentity(result) !== supplyIdentity(saved)) throw new DistributionError("invalid");
        return result;
      }, true);
    } else if (confirmation === "owned") {
      if (routesDirty) return;
      const input = { revision: saved.revision, enabled: draft.owned.enabled, nodes: draft.owned.items.map((node) => ({
        id: node.id, enabled: node.enabled, customName: node.customName?.trim() || null, customCountryCode: node.customCountryCode ?? null
      })) };
      void run(async (signal) => {
        const result = await client.saveOwned(input, signal);
        if (JSON.stringify(result.routes) !== JSON.stringify(saved.routes) || JSON.stringify(result.candidates) !== JSON.stringify(saved.candidates) || JSON.stringify(result.automation) !== JSON.stringify(saved.automation) || supplyIdentity(result) !== supplyIdentity(saved)) throw new DistributionError("invalid");
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
        {draft.bwhSupply ? <section aria-label="BWH 实际供流">
          <h4>BWH 实际供流</h4>
          <p>供流状态：{SUPPLY_LABELS[draft.bwhSupply.state]}。协议运行 {draft.bwhSupply.protocolsRunning} / 3；计量调度{draft.bwhSupply.collectorState === "running" ? "已启用，待自然采集验收" : draft.bwhSupply.collectorState === "paused" ? "已暂停" : "状态未知"}；自有节点下发许可{draft.bwhSupply.nativeDistributionEnabled ? "开启" : "关闭"}。</p>
          <p>这是实际供流控制，与下方“分发启停”不同。暂停会中断 BWH 代理连接，并停止自有节点下发；原订阅链接、账户、额度和历史用量保留，仅下发已选择的第三方节点。</p>
          <button type="button" disabled={locked || dirty || Boolean(confirmation) || draft.bwhSupply.state === "transitioning" || draft.bwhSupply.state === "unavailable" || !draft.bwhSupply.canPause} onClick={() => setConfirmation("supply-pause")}>暂停 BWH 供流</button>
          <button type="button" disabled={locked || dirty || Boolean(confirmation) || draft.bwhSupply.state === "transitioning" || draft.bwhSupply.state === "unavailable" || !draft.bwhSupply.canEnable} onClick={() => setConfirmation("supply-enable")}>启用 BWH 供流</button>
          {dirty ? <p>请先保存或放弃分发草稿，再操作实际供流。</p> : null}
          {draft.bwhSupply.state === "enabled" && !draft.bwhSupply.canPause ? <p>暂停前须将三个套餐的路由分别保存为有效的第三方节点；这不会自动为其他订阅补选节点。</p> : null}
          {draft.bwhSupply.state === "unavailable" ? <p>宿主控制尚未安装或核验未通过；不会仅凭页面按钮执行停启。</p> : null}
        </section> : null}
        {draft.automation ? <section aria-label="客户端自动路由能力">
          <h4>客户端自动路由能力 · 只读</h4>
          <p>每日轮换：{draft.automation.dailyRotationEnabled ? "已启用" : "未启用"}。</p>
          {draft.automation.dailyRotationEnabled ? <p>按 UTC 日期重排已选节点池，客户端成功刷新订阅后取得当天顺序；不减少节点，不会强制中断午夜时仍在使用的连接。</p> : null}
          <p>客户端择优：{draft.automation.clientHealthCheckEnabled ? "已启用" : "未启用"}。</p>
          {draft.automation.clientHealthCheckEnabled ? <p>支持的客户端每 300 秒通过节点进行真实协议连接测试并自动择优；服务器不主动探测节点，不代表集中式健康保证。原始 provider 片段的自动路由由父配置负责。</p> : null}
        </section> : null}
        <fieldset disabled={locked || Boolean(confirmation) || routesDirty}>
          <legend>自有节点 · 系统来源</legend>
          {draft.bwhBandwidth ? <section className="subscription-distribution-bandwidth" aria-label="服务器总限速">
            <h4>服务器总限速</h4>
            <p>总限速状态：{BANDWIDTH_LABELS[draft.bwhBandwidth.state]}。</p>
            {(["inbound", "outbound"] as const).map((direction) => {
              const label = direction === "inbound" ? "总入站" : "总出站";
              const enabled = direction === "inbound" ? draft.bwhBandwidth!.inboundEnabled : draft.bwhBandwidth!.outboundEnabled;
              const shown = (direction === "inbound" ? draft.bwhBandwidth!.inboundMbps : draft.bwhBandwidth!.outboundMbps) ?? "0.1";
              const changeRate = (raw: string) => {
                const next = normalizeMbpsDraft(raw);
                if (!next) return;
                updateBandwidth(direction === "inbound" ? { inboundMbps: next } : { outboundMbps: next });
              };
              return <div key={direction}>
                <label><input type="checkbox" role="switch" checked={enabled} onChange={(event) => updateBandwidth(direction === "inbound" ? { inboundEnabled: event.target.checked } : { outboundEnabled: event.target.checked })} />{label}</label>
                <input type="range" aria-label={`${label}速率`} min="0.1" max="1000" step="0.1" value={shown} onChange={(event) => changeRate(String(event.target.value))} />
                <input type="number" aria-label={`${label}数值`} min="0.1" max="1000" step="0.1" value={shown} onChange={(event) => changeRate(String(event.target.value))} />
              </div>;
            })}
            {dirty ? <p>请先保存或放弃分发草稿，再保存总限速。</p> : null}
            <button type="button" disabled={locked || dirty || Boolean(confirmation)} onClick={() => setConfirmation("bandwidth")}>保存总限速</button>
          </section> : null}
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
      {confirmation ? <ModalFrame titleId={titleId} title={confirmation === "reload" ? "放弃未保存的分发设置？" : confirmation === "supply-pause" ? "确认暂停 BWH 实际供流" : confirmation === "supply-enable" ? "确认启用 BWH 实际供流" : confirmation === "bandwidth" ? "确认保存总限速" : "确认保存订阅分发"} onClose={() => setConfirmation(null)} closeLabel="取消" closeDisabled={busy} footer={
        <button type="button" disabled={busy} onClick={confirmation === "reload" ? () => void reload() : confirmSave}>{confirmation === "reload" ? "放弃草稿并重新读取" : confirmation === "supply-pause" ? "确认暂停供流" : confirmation === "supply-enable" ? "确认启用供流" : "确认保存"}</button>
      }>
        {confirmation === "reload" ? <p>重新读取将覆盖本页尚未保存的名称、国旗和路由选择。</p> : confirmation === "bandwidth" ? <>
          <p>总入站{draft?.bwhBandwidth?.inboundEnabled ? ` ${draft.bwhBandwidth.inboundMbps ?? "0.1"} Mbps` : "关闭"}；总出站{draft?.bwhBandwidth?.outboundEnabled ? ` ${draft.bwhBandwidth.outboundMbps ?? "0.1"} Mbps` : "关闭"}。</p>
          <p>此操作仅保存总入站和总出站限速目标，当前未应用主机规则；不会暂停或恢复供流。</p>
        </> : confirmation === "supply-pause" ? <>
          <p>此操作会实际中断现有 BWH 代理连接，并停止自有节点下发；不是仅隐藏节点。</p>
          <p>原订阅链接、账户、额度和历史用量保留；成功刷新后仅下发已选择的第三方节点。未选择有效第三方节点的订阅不会自动回落自有节点。</p>
        </> : confirmation === "supply-enable" ? <>
          <p>将申请恢复 BWH 实际供流；协议服务和计量均核验通过后，才恢复自有节点下发。</p>
          <p>原订阅链接、账户、额度和历史用量保留；已选择的配置路由不变。</p>
        </> : confirmation === "routes" ? <>
          <p>将保存以下全部套餐路由：</p><ul>{draft?.routes.map((value) => <li key={value.planId}>{PLAN_LABELS[value.planId]}：{value.mode === "owned" ? "自有节点" : `第三方节点（${value.nodeIds.length} 项）`}{value.mode === "third-party" ? <ul>{value.nodeIds.map((id) => <li key={id}>{draft.candidates.find((node) => node.id === id)?.displayName ?? "不可用节点"}</li>)}</ul> : null}</li>)}</ul>
          <p>用户成功刷新后生效，账户、额度与历史用量保持原状。</p>
        </> : <><p>将保存自有来源{draft?.owned.enabled ? "启用" : "暂停"}、各节点分发启停、名称和国旗。</p><p>此操作不会停止现有连接。</p></>}
      </ModalFrame> : null}
    </section>
  );
}
