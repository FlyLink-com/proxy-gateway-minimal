import { useCallback, useEffect, useState } from "react";
import { Pause, Play, Trash2 } from "lucide-react";
import type {
  ResidentialRelayAdminClient, ResidentialRelayCoupons, ResidentialRelayQuote, ResidentialRelaySku
} from "./residential-relay-admin-client";

type Common = { busy: boolean; client: ResidentialRelayAdminClient; onError: (err: unknown) => void; setBusy: (value: boolean) => void };

function isoOrNull(value: string) {
  if (!value.trim()) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "invalid" : date.toISOString();
}
function adjustmentValue(kind: string, raw: string) {
  const number = Number(raw);
  if (!Number.isFinite(number)) return NaN;
  // Percent is entered as e.g. 15 or 12.5 and stored as basis points.
  return kind === "percent" ? Math.round(number * 100) : number;
}
function describe(kind: string, value: number) {
  return kind === "percent" ? `${value / 100}%` : `${value} Coins`;
}

export function ResidentialRelayCouponsPanel({ skus, ...common }: Common & { skus: ResidentialRelaySku[] }) {
  const { busy, client, onError, setBusy } = common;
  const [state, setState] = useState<ResidentialRelayCoupons | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [form, setForm] = useState({ code: "", kind: "percent", value: "", allSkus: true, skuIds: [] as string[],
    startsAt: "", endsAt: "", totalLimit: "", perUserLimit: "" });
  const [quoteSku, setQuoteSku] = useState("");
  const [quoteCode, setQuoteCode] = useState("");
  const [quote, setQuote] = useState<ResidentialRelayQuote | null>(null);

  const load = useCallback(async () => {
    try { setState(await client.listCoupons()); setSelected([]); } catch (err) { onError(err); }
  }, [client, onError]);
  useEffect(() => { void load(); }, [load]);

  async function mutate(action: (revision: string) => Promise<ResidentialRelayCoupons>) {
    if (!state) return;
    setBusy(true);
    try { setState(await action(state.revision)); setSelected([]); } catch (err) { onError(err); } finally { setBusy(false); }
  }
  const limit = (raw: string) => raw.trim() ? Number(raw) : null;
  const sizeOf = (id: string) => skus.find((item) => item.id === id)?.sizeCode ?? id;
  const configured = skus.filter((item) => item.id);

  return (
    <section className="resi-admin-panel" aria-label="优惠码">
      <h3>优惠码</h3>
      <p className="resi-admin-note">计价：原价 → 优惠码（唯一的促销方式），四舍五入为整数 Coins，最低 0。</p>
      <div className="resi-admin-grid">
        <label>优惠码<input value={form.code} disabled={busy} onChange={(e) => setForm((f) => ({ ...f, code: e.target.value.toUpperCase() }))} /></label>
        <label>类型
          <select value={form.kind} disabled={busy} onChange={(e) => setForm((f) => ({ ...f, kind: e.target.value }))}>
            <option value="percent">百分比</option><option value="fixed">固定 Coins</option>
          </select>
        </label>
        <label>{form.kind === "percent" ? "减免比例（%）" : "减免（Coins）"}
          <input inputMode="decimal" value={form.value} disabled={busy} onChange={(e) => setForm((f) => ({ ...f, value: e.target.value }))} />
        </label>
        <label>开始时间（可选）<input type="datetime-local" value={form.startsAt} disabled={busy} onChange={(e) => setForm((f) => ({ ...f, startsAt: e.target.value }))} /></label>
        <label>结束时间（可选）<input type="datetime-local" value={form.endsAt} disabled={busy} onChange={(e) => setForm((f) => ({ ...f, endsAt: e.target.value }))} /></label>
        <label>总次数上限（可选）<input inputMode="numeric" value={form.totalLimit} disabled={busy} onChange={(e) => setForm((f) => ({ ...f, totalLimit: e.target.value }))} /></label>
        <label>每用户上限（可选）<input inputMode="numeric" value={form.perUserLimit} disabled={busy} onChange={(e) => setForm((f) => ({ ...f, perUserLimit: e.target.value }))} /></label>
        <label className="resi-admin-check"><input type="checkbox" checked={form.allSkus} disabled={busy}
          onChange={(e) => setForm((f) => ({ ...f, allSkus: e.target.checked }))} />适用全部 SKU</label>
      </div>
      {!form.allSkus ? <fieldset className="resi-admin-skus"><legend>适用 SKU</legend>
        {configured.map((item) => (
          <label key={item.id} className="resi-admin-check"><input type="checkbox" checked={form.skuIds.includes(item.id as string)} disabled={busy}
            onChange={(e) => setForm((f) => ({ ...f, skuIds: e.target.checked ? [...f.skuIds, item.id as string] : f.skuIds.filter((id) => id !== item.id) }))} />
            {item.sizeCode}</label>
        ))}
      </fieldset> : null}
      <div className="resi-admin-actions">
        <button type="button" disabled={busy || !state || !form.code.trim() || !form.value.trim()} onClick={() => void mutate((revision) => {
          const start = isoOrNull(form.startsAt), end = isoOrNull(form.endsAt);
          return client.createCoupon(revision, {
            code: form.code.trim(), kind: form.kind as "percent" | "fixed", value: adjustmentValue(form.kind, form.value),
            allSkus: form.allSkus, skuIds: form.allSkus ? [] : form.skuIds,
            startsAt: start === "invalid" ? "invalid" : start, endsAt: end === "invalid" ? "invalid" : end,
            totalLimit: limit(form.totalLimit), perUserLimit: limit(form.perUserLimit)
          });
        })}>创建优惠码（默认停用）</button>
        <button type="button" disabled={busy || selected.length === 0} onClick={() => void mutate((r) => client.setCouponsEnabled(r, selected, true))}>
          <Play aria-hidden="true" size={14} /> 启用所选</button>
        <button type="button" disabled={busy || selected.length === 0} onClick={() => void mutate((r) => client.setCouponsEnabled(r, selected, false))}>
          <Pause aria-hidden="true" size={14} /> 停用所选</button>
        <button type="button" disabled={busy || selected.length === 0 || selected.some((id) => state?.items.find((c) => c.id === id)?.enabled)}
          onClick={() => void mutate((r) => client.deleteCoupons(r, selected))}><Trash2 aria-hidden="true" size={14} /> 删除所选</button>
      </div>
      {!state ? null : state.items.length === 0 ? <p>暂无优惠码。</p> : (
        <table className="resi-admin-table" aria-label="优惠码列表">
          <thead><tr>
            <th scope="col"><input aria-label="全选优惠码" type="checkbox" checked={selected.length === state.items.length}
              onChange={(e) => setSelected(e.target.checked ? state.items.map((c) => c.id) : [])} /></th>
            <th scope="col">代码</th><th scope="col">优惠</th><th scope="col">适用</th><th scope="col">有效期</th>
            <th scope="col">已用 / 上限</th><th scope="col">每用户</th><th scope="col">状态</th>
          </tr></thead>
          <tbody>{state.items.map((c) => (
            <tr key={c.id}>
              <td><input aria-label={`选择优惠码 ${c.code}`} type="checkbox" checked={selected.includes(c.id)}
                onChange={(e) => setSelected((prev) => e.target.checked ? [...prev, c.id] : prev.filter((id) => id !== c.id))} /></td>
              <td>{c.code}</td><td>{describe(c.kind, c.value)}</td>
              <td>{c.allSkus ? "全部" : c.skuIds.map(sizeOf).join(", ")}</td>
              <td>{c.startsAt ?? "不限"} – {c.endsAt ?? "不限"}</td>
              <td>{c.redemptionCount} / {c.totalLimit ?? "不限"}</td><td>{c.perUserLimit ?? "不限"}</td>
              <td>{c.enabled ? "已启用" : "已停用"}</td>
            </tr>
          ))}</tbody>
        </table>
      )}
      <h3>报价预览</h3>
      <div className="resi-admin-grid">
        <label>SKU
          <select value={quoteSku} disabled={busy} onChange={(e) => setQuoteSku(e.target.value)}>
            <option value="">选择 SKU</option>
            {configured.map((item) => <option key={item.id} value={item.id as string}>{item.sizeCode}</option>)}
          </select>
        </label>
        <label>优惠码（可选）<input value={quoteCode} disabled={busy} onChange={(e) => setQuoteCode(e.target.value.toUpperCase())} /></label>
      </div>
      <div className="resi-admin-actions">
        <button type="button" disabled={busy || !quoteSku} onClick={() => void (async () => {
          setBusy(true);
          try { setQuote(await client.quote(quoteSku, quoteCode.trim() || undefined)); } catch (err) { setQuote(null); onError(err); } finally { setBusy(false); }
        })()}>计算报价</button>
      </div>
      {quote ? <p className="resi-admin-meta" aria-label="报价结果">
        原价 {quote.listPrice}
        {quote.coupon ? ` → 优惠码 ${quote.coupon.code}${quote.coupon.applied ? "" : "（未采用）"}` : ""} → 应付 <strong>{quote.finalPrice}</strong> Coins
        {quote.purchasable ? "" : "（此 SKU 当前不可售）"}
      </p> : null}
    </section>
  );
}
