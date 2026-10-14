import { useCallback, useEffect, useMemo, useState } from "react";
import { Ban, Download } from "lucide-react";
import type {
  ResidentialRelayAdminClient, ResidentialRelayCoupon, ResidentialRelayCouponStatus, ResidentialRelayCoupons,
  ResidentialRelayQuote, ResidentialRelaySku
} from "./residential-relay-admin-client";

type Common = { busy: boolean; client: ResidentialRelayAdminClient; onError: (err: unknown) => void; setBusy: (value: boolean) => void };

const STATUS_LABEL: Record<ResidentialRelayCouponStatus, string> = {
  issued: "未兑换", redeemed: "已兑换", consumed: "已消耗", voided: "已作废", expired: "已过期"
};

// Percent is entered as e.g. 15 or 12.5 and stored as basis points.
function adjustmentValue(kind: string, raw: string) {
  const number = Number(raw);
  if (!Number.isFinite(number)) return NaN;
  return kind === "percent" ? Math.round(number * 100) : number;
}
function fmt(value: string | null) {
  if (!value) return "—";
  const d = new Date(value);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
const percentOf = (c: ResidentialRelayCoupon) => (c.kind === "percent" ? `${c.value / 100}%` : "—");
const amountOf = (c: ResidentialRelayCoupon) =>
  c.consumedAmount !== null ? `${c.consumedAmount} Coins` : c.kind === "fixed" ? `${c.value} Coins` : "—";

// eslint-disable-next-line react-refresh/only-export-components -- pure CSV helper shared with tests
export function couponsToCsv(items: ResidentialRelayCoupon[]) {
  const head = ["coupon_ref", "code", "status", "issued_at", "percent", "deduction_coins", "issued_by", "issuer", "recipient", "redeemed_by", "redeemed_at",
    "consumed_by", "order_ref", "consumed_at", "expires_at", "usable_until", "voided_by", "voided_at", "skus", "batch_id"];
  const cell = (v: unknown) => {
    const text = v === null || v === undefined ? "" : String(v);
    // Neutralise spreadsheet formulas and quote everything.
    const safe = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
    return `"${safe.replace(/"/g, '""')}"`;
  };
  const rows = items.map((c) => [c.ref, c.code, c.status, c.issuedAt, c.kind === "percent" ? c.value / 100 : "",
    c.consumedAmount ?? (c.kind === "fixed" ? c.value : ""), c.issuedBy, c.issuer, c.recipientRef, c.redeemedBy, c.redeemedAt, c.consumedBy,
    c.consumedOrderRef, c.consumedAt, c.expiresAt, c.usableUntil, c.voidedBy, c.voidedAt,
    c.allSkus ? "ALL" : c.skus.map((s) => s.sizeCode).join(" "), c.batchId].map(cell).join(","));
  return [head.join(","), ...rows].join("\r\n") + "\r\n";
}

export function ResidentialRelayCouponsPanel({ skus, ...common }: Common & { skus: ResidentialRelaySku[] }) {
  const { busy, client, onError, setBusy } = common;
  const [state, setState] = useState<ResidentialRelayCoupons | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [lastBatch, setLastBatch] = useState<string[]>([]);
  const [form, setForm] = useState({ count: "1", kind: "percent", value: "", allSkus: true, skuIds: [] as string[], issuer: "", recipientRef: "" });
  const [issuerTouched, setIssuerTouched] = useState(false);
  const [statusFilter, setStatusFilter] = useState<"" | ResidentialRelayCouponStatus>("");
  const [search, setSearch] = useState("");
  const [quoteSku, setQuoteSku] = useState("");
  const [quoteCode, setQuoteCode] = useState("");
  const [quote, setQuote] = useState<ResidentialRelayQuote | null>(null);

  const load = useCallback(async () => {
    try { setState(await client.listCoupons()); setSelected([]); } catch (err) { onError(err); }
  }, [client, onError]);
  useEffect(() => { void load(); }, [load]);
  // Issuer defaults to the signed-in admin until the operator edits it.
  useEffect(() => {
    if (!issuerTouched && state?.actor) setForm((f) => ({ ...f, issuer: state.actor as string }));
  }, [state?.actor, issuerTouched]);

  const configured = skus.filter((item) => item.id);
  const visible = useMemo(() => {
    const needle = search.trim().toUpperCase().replace(/[\s-]/g, "");
    return (state?.items ?? []).filter((c) => (!statusFilter || c.status === statusFilter) && (!needle
      || [c.code.replace(/-/g, ""), c.ref, c.issuedBy, c.issuer, c.recipientRef, c.redeemedBy, c.consumedBy, c.consumedOrderRef]
        .some((v) => v && v.toUpperCase().replace(/-/g, "").includes(needle))));
  }, [state, statusFilter, search]);

  async function run(action: () => Promise<void>) {
    setBusy(true);
    try { await action(); await load(); } catch (err) { onError(err); } finally { setBusy(false); }
  }
  function exportCsv() {
    const blob = new Blob(["\ufeff", couponsToCsv(visible)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `residential-redeem-codes-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }
  const voidable = (id: string) => state?.items.find((c) => c.id === id)?.status === "issued";

  return (
    <section className="resi-admin-panel" aria-label="兑换码">
      <h3>兑换码</h3>
      <div className="resi-admin-grid">
        <label>数量<input inputMode="numeric" value={form.count} disabled={busy} onChange={(e) => setForm((f) => ({ ...f, count: e.target.value }))} /></label>
        <label>类型
          <select value={form.kind} disabled={busy} onChange={(e) => setForm((f) => ({ ...f, kind: e.target.value }))}>
            <option value="percent">比例</option><option value="fixed">固定 Coins</option>
          </select>
        </label>
        <label>{form.kind === "percent" ? "比例（%，≤20）" : "抵扣（Coins）"}
          <input inputMode="decimal" value={form.value} disabled={busy} onChange={(e) => setForm((f) => ({ ...f, value: e.target.value }))} />
        </label>
        <label>发放人<input value={form.issuer} disabled={busy} maxLength={128}
          onChange={(e) => { setIssuerTouched(true); setForm((f) => ({ ...f, issuer: e.target.value })); }} /></label>
        <label>领取人（可选）<input value={form.recipientRef} disabled={busy} maxLength={128} placeholder="不填则任何账户可兑换"
          onChange={(e) => setForm((f) => ({ ...f, recipientRef: e.target.value }))} /></label>
        <label>有效期<input value="30 天（固定）" title="未兑换的兑换码签发后 30 天过期；兑换后的优惠券 30 天内可用" readOnly aria-readonly="true" /></label>
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
        <button type="button" disabled={busy || !form.value.trim() || !form.issuer.trim()} onClick={() => void run(async () => {
          const out = await client.generateCoupons({
            count: Number(form.count), kind: form.kind as "percent" | "fixed", value: adjustmentValue(form.kind, form.value),
            allSkus: form.allSkus, skuIds: form.allSkus ? [] : form.skuIds,
            issuer: form.issuer.trim(), ...(form.recipientRef.trim() ? { recipientRef: form.recipientRef.trim() } : {}),
          });
          setLastBatch(out.items.map((c) => c.code));
        })}>生成兑换码</button>
        <button type="button" disabled={busy || selected.length === 0 || !selected.every(voidable)}
          onClick={() => void run(() => client.voidCoupons(selected))}><Ban aria-hidden="true" size={14} /> 作废所选</button>
        <button type="button" disabled={!state || visible.length === 0} onClick={exportCsv}><Download aria-hidden="true" size={14} /> 导出 CSV</button>
      </div>
      {lastBatch.length ? <p className="resi-admin-meta" aria-label="新生成的兑换码">新生成 {lastBatch.length} 个：{lastBatch.join("、")}</p> : null}
      <div className="resi-admin-grid">
        <label>状态
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as "" | ResidentialRelayCouponStatus)}>
            <option value="">全部</option>
            {(Object.keys(STATUS_LABEL) as ResidentialRelayCouponStatus[]).map((k) => <option key={k} value={k}>{STATUS_LABEL[k]}</option>)}
          </select>
        </label>
        <label>搜索（码 / 券号 / 账户 / 订单）<input value={search} onChange={(e) => setSearch(e.target.value)} /></label>
      </div>
      {!state ? null : visible.length === 0 ? <p>暂无兑换码。</p> : (
        <div className="resi-admin-scroll">
          <table className="resi-admin-table" aria-label="兑换码列表">
            <thead><tr>
              <th scope="col"><input aria-label="全选兑换码" type="checkbox" checked={selected.length > 0 && selected.length === visible.length}
                onChange={(e) => setSelected(e.target.checked ? visible.map((c) => c.id) : [])} /></th>
              <th scope="col">兑换码</th><th scope="col">状态</th><th scope="col">签发时间</th><th scope="col">折扣比例</th>
              <th scope="col">抵扣金额</th><th scope="col">生成账户</th><th scope="col">发放人</th><th scope="col">领取人</th><th scope="col">兑换账户</th><th scope="col">消耗账户</th>
              <th scope="col">过期时间</th><th scope="col">适用</th>
            </tr></thead>
            <tbody>{visible.map((c) => (
              <tr key={c.id} data-status={c.status}>
                <td><input aria-label={`选择兑换码 ${c.code}`} type="checkbox" checked={selected.includes(c.id)}
                  onChange={(e) => setSelected((prev) => e.target.checked ? [...prev, c.id] : prev.filter((id) => id !== c.id))} /></td>
                <td className="resi-admin-mono">{c.code}<br /><small>{c.ref}</small></td>
                <td>{STATUS_LABEL[c.status]}{c.voidedBy ? <small> · {c.voidedBy}</small> : null}</td>
                <td>{fmt(c.issuedAt)}</td><td>{percentOf(c)}</td><td>{amountOf(c)}</td><td>{c.issuedBy}</td>
                <td>{c.issuer}</td><td>{c.recipientRef ?? "任何人"}</td>
                <td>{c.redeemedBy ? <>{c.redeemedBy}<br /><small>{fmt(c.redeemedAt)}</small></> : "—"}</td>
                <td>{c.consumedBy ? <>{c.consumedBy}<br /><small>{c.consumedOrderRef} · {fmt(c.consumedAt)}</small></> : "—"}</td>
                <td>{fmt(c.usableUntil ?? c.expiresAt)}{c.usableUntil ? <><br /><small>兑换后可用至</small></> : null}</td>
                <td>{c.allSkus ? "全部" : c.skus.map((s) => s.sizeCode).join(", ")}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
      <h3>报价预览</h3>
      <div className="resi-admin-grid">
        <label>SKU
          <select value={quoteSku} disabled={busy} onChange={(e) => setQuoteSku(e.target.value)}>
            <option value="">选择 SKU</option>
            {configured.map((item) => <option key={item.id} value={item.id as string}>{item.sizeCode}</option>)}
          </select>
        </label>
        <label>兑换码（可选）<input value={quoteCode} disabled={busy} onChange={(e) => setQuoteCode(e.target.value.toUpperCase())} /></label>
      </div>
      <div className="resi-admin-actions">
        <button type="button" disabled={busy || !quoteSku} onClick={() => void (async () => {
          setBusy(true);
          try { setQuote(await client.quote(quoteSku, quoteCode.trim() || undefined)); } catch (err) { setQuote(null); onError(err); } finally { setBusy(false); }
        })()}>计算报价</button>
      </div>
      {quote ? <p className="resi-admin-meta" aria-label="报价结果">
        原价 {quote.listPrice}{quote.coupon ? ` → 券 ${quote.coupon.ref} 抵扣 ${quote.deduction}${quote.coupon.capped ? "（已按 20% 封顶）" : ""}` : ""} → 应付 <strong>{quote.finalPrice}</strong> Coins
        {quote.purchasable ? "" : "（此 SKU 当前不可售）"}
      </p> : null}
    </section>
  );
}
