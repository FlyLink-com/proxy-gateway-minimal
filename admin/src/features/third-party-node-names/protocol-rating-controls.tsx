import { useEffect, useId, useState } from "react";
import { ModalFrame } from "../../shared/public/modal-frame";
import {
  DistributionError, protocolMultiplierUnits,
  type DistributionErrorCode, type DistributionSnapshot, type ProtocolRatingPolicy, type ProtocolRatingSnapshot, type SubscriptionDistributionClient
} from "./subscription-distribution-client";

const PROTOCOLS = [
  { id: "vless", label: "VLESS" },
  { id: "hy2", label: "Hysteria2" },
  { id: "tuic", label: "TUIC" }
] as const;

function savedMultipliers(status: ProtocolRatingSnapshot) {
  return status.pending?.multipliers ?? status.active?.multipliers ?? { vless: "1.0", hy2: "1.0", tuic: "1.0" };
}

function stateLabel(status: ProtocolRatingSnapshot, failed: boolean) {
  if (failed) return "失败";
  if (!status.installed || !status.revision) return "需要重新读取";
  if (status.pending) return "待生效";
  if (status.active) return "已生效";
  return "已保存";
}

export const RATING_FAILURE_COPY: Record<DistributionErrorCode, string> = {
  session: "Admin 登录已失效，请重新登录。",
  permission: "当前账户没有协议倍率管理权限。",
  unavailable: "协议倍率暂不可用。请重新读取。不会自动提交，也不会暂停或恢复供流。",
  stale: "协议倍率版本已经变化。请重新读取后再保存。本次不会覆盖最新倍率，也不会暂停或恢复供流。",
  invalid: "协议倍率输入或返回数据不符合要求。请重新读取后再保存。不会暂停或恢复供流。",
  network: "协议倍率保存结果未确认。请先重新读取，不会自动再次提交，也不会暂停或恢复供流。",
  timeout: "协议倍率保存超时，结果未确认。请先重新读取，不会自动再次提交，也不会暂停或恢复供流。"
};

function policyLine(policy: ProtocolRatingPolicy | null, empty: string) {
  if (!policy) return empty;
  const values = policy.multipliers;
  return `VLESS ${values.vless}，Hysteria2 ${values.hy2}，TUIC ${values.tuic}。策略边界 ${policy.effectiveNotBefore}。`;
}

export function ProtocolRatingControls({ status, client, disabled, onDirty, onSaved, onFailed }: {
  status: ProtocolRatingSnapshot;
  client: SubscriptionDistributionClient;
  disabled: boolean;
  onDirty: (dirty: boolean) => void;
  onSaved: (snapshot: DistributionSnapshot) => void;
  onFailed: (code: DistributionError["code"]) => void;
}) {
  const source = savedMultipliers(status);
  const [draft, setDraft] = useState(source);
  const [confirming, setConfirming] = useState(false);
  const [failureCode, setFailureCode] = useState<DistributionErrorCode | null>(null);
  const titleId = useId();
  useEffect(() => {
    setDraft(savedMultipliers(status));
    setFailureCode(null);
  }, [status]);
  const dirty = PROTOCOLS.some((item) => protocolMultiplierUnits(draft[item.id]) !== protocolMultiplierUnits(source[item.id]));
  useEffect(() => { onDirty(dirty); return () => onDirty(false); }, [dirty, onDirty]);
  const valid = PROTOCOLS.every((item) => protocolMultiplierUnits(draft[item.id]) !== null);
  async function save() {
    if (!status.revision || !client.saveProtocolRating || !valid) return;
    try {
      const result = await client.saveProtocolRating({ ratingRevision: status.revision, vless: draft.vless, hy2: draft.hy2, tuic: draft.tuic });
      setConfirming(false);
      setFailureCode(null);
      onSaved(result);
    } catch (error) {
      const code = error instanceof DistributionError ? error.code : "network";
      setConfirming(false);
      setFailureCode(code);
      onFailed(code);
    }
  }
  return (
    <section className="subscription-distribution-rating" aria-label="协议用量倍率">
      <h4>协议用量倍率</h4>
      <p>状态：{stateLabel(status, failureCode !== null)}。{failureCode ? "需要重新读取。不会自动再次提交。" : "保存后进入待生效，只计入之后的新用量。"}</p>
      <p>已生效倍率：{policyLine(status.active, "尚未有已生效倍率。")}</p>
      <p>待生效倍率：{policyLine(status.pending, "没有待生效倍率。")}</p>
      <p>已入账用量保持不变。不会暂停或恢复供流。输入范围 0.1 到 10，步长 0.1，不是已批准的商业上限。</p>
      {PROTOCOLS.map((item) => <label key={item.id}><span>{item.label}（{item.id}）</span>
        <input aria-label={`${item.id} 用量倍率`} type="number" inputMode="decimal" min="0.1" max="10" step="0.1" value={draft[item.id]} disabled={disabled || confirming} onChange={(event) => setDraft((current) => ({ ...current, [item.id]: event.target.value }))} />
        <input aria-label={`${item.id} 用量倍率滑块`} type="range" min="0.1" max="10" step="0.1" value={protocolMultiplierUnits(draft[item.id]) === null ? "1.0" : draft[item.id]} disabled={disabled || confirming} onChange={(event) => setDraft((current) => ({ ...current, [item.id]: Number(event.target.value).toFixed(1) }))} />
      </label>)}
      <button type="button" disabled={disabled || confirming || !dirty || !valid} onClick={() => setConfirming(true)}>保存协议倍率</button>
      {confirming ? <ModalFrame titleId={titleId} title="确认保存协议用量倍率" onClose={() => setConfirming(false)} closeLabel="取消" footer={
        <button type="button" onClick={() => void save()}>确认保存</button>
      }><p>确认后只保存待生效倍率，只影响之后的新用量。不会改写已入账用量，也不会暂停或恢复供流。</p></ModalFrame> : null}
    </section>
  );
}
