import { useCallback, useEffect, useMemo, useState } from "react";
import { Pause, Play, Trash2 } from "lucide-react";
import {
  createResidentialRelayAdminClient, ResidentialRelayAdminError,
  type ResidentialRelayAdminClient, type ResidentialRelayAdminErrorCode,
  type ResidentialRelaySku, type ResidentialRelaySnapshot
} from "./residential-relay-admin-client";
import { ResidentialRelayCouponsPanel, ResidentialRelayDiscountPanel } from "./residential-relay-pricing-panels";
import "./residential-relay-admin-workspace.styles.css";

const ERROR_COPY: Record<ResidentialRelayAdminErrorCode, string> = {
  session: "Admin 登录已失效，请重新登录。",
  permission: "当前账户没有此操作的 Admin 权限。",
  unavailable: "住宅流量包管理尚未启用或服务暂不可用。",
  network: "请求未确认，请检查连接后重新读取。",
  invalid: "请求或响应不符合接口要求。",
  not_found: "SKU 不存在或已被删除。",
  revision_conflict: "SKU 已被其他操作更新，请重新读取后再改。",
  no_enabled_upstream: "请先启用至少一条上游线路，再启用此 SKU。",
  upstream_enabled: "请先停用上游线路，再删除。",
  invalid_yaml: "YAML 无法导入，请检查格式与协议。",
  invalid_sku_size: "包规格无效。",
  invalid_price: "价格必须是正整数 Coins。",
  invalid_duration: "时长必须是正整数天数。",
  invalid_quota: "额度必须是正整数字节。",
  invalid_buyer_protocol: "买家凭证协议只能是 VLESS 或 Hy2。",
  upstream_limit: "此 SKU 上游数已达上限。",
  sku_price_unset: "请先设置价格，再启用或报价此 SKU。",
  invalid_discount: "折扣设置无效（百分比 0–100%，固定 Coins 为正整数，结束时间需晚于开始时间）。",
  invalid_coupon: "优惠码设置无效。",
  duplicate_coupon_code: "优惠码已存在。",
  coupon_enabled: "请先停用优惠码，再编辑或删除。",
  coupon_not_found: "优惠码不存在。",
  coupon_inactive: "优惠码已停用或不在有效期内。",
  coupon_not_applicable: "优惠码不适用于此 SKU。",
  coupon_exhausted: "优惠码总次数已用完。",
  coupon_user_limit: "此用户已达优惠码使用上限。"
};

const GiB = 1024 ** 3;
function formatQuota(bytes: number) {
  if (bytes % (1024 * GiB) === 0) return `${bytes / (1024 * GiB)} TB`;
  if (bytes % GiB === 0) return `${bytes / GiB} GB`;
  return `${bytes} B`;
}

export function ResidentialRelayAdminWorkspace({ client: supplied, onSessionExpired }: {
  client?: ResidentialRelayAdminClient; onSessionExpired?: () => void;
}) {
  const [client] = useState(() => supplied ?? createResidentialRelayAdminClient());
  const [skus, setSkus] = useState<ResidentialRelaySku[]>([]);
  const [selectedSize, setSelectedSize] = useState("100G");
  const [snapshot, setSnapshot] = useState<ResidentialRelaySnapshot | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [yaml, setYaml] = useState("");
  const [form, setForm] = useState({ buyerProtocol: "vless", durationDays: "30", quotaGb: "100", baseCoinUnits: "30" });

  const report = useCallback((err: unknown) => {
    if (err instanceof ResidentialRelayAdminError) {
      if (err.code === "session") onSessionExpired?.();
      setError(ERROR_COPY[err.code]);
      return;
    }
    setError("操作失败，请重新读取。");
  }, [onSessionExpired]);

  const refresh = useCallback(async () => {
    setBusy(true); setError(null);
    try {
      const list = await client.listSkus();
      setSkus(list);
      const current = list.find((item) => item.sizeCode === selectedSize) ?? list[0];
      if (current?.id) {
        const next = await client.getSku(current.id);
        setSnapshot(next);
        setForm({
          buyerProtocol: next.sku.buyerProtocol ?? "vless",
          durationDays: String(next.sku.durationDays ?? 30),
          quotaGb: String((next.sku.quotaBytes ?? GiB) / GiB),
          baseCoinUnits: next.sku.baseCoinUnits === null ? "" : String(next.sku.baseCoinUnits)
        });
        setSelected([]);
      } else {
        setSnapshot(null);
        const defaults: Record<string, string> = { "100G": "100", "200G": "200", "500G": "500", "1TB": "1024" };
        setForm({ buyerProtocol: "vless", durationDays: "30", quotaGb: defaults[selectedSize] ?? "100", baseCoinUnits: "30" });
      }
    } catch (err) { report(err); }
    finally { setBusy(false); }
  }, [client, report, selectedSize]);

  useEffect(() => { void refresh(); }, [refresh]);

  const selectedSku = useMemo(() => skus.find((item) => item.sizeCode === selectedSize) ?? null, [skus, selectedSize]);

  async function saveSku(enabled?: boolean) {
    setBusy(true); setError(null);
    try {
      const durationDays = Number(form.durationDays);
      const quotaGb = Number(form.quotaGb);
      const baseCoinUnits = form.baseCoinUnits.trim() === "" ? null : Number(form.baseCoinUnits);
      if (!Number.isSafeInteger(durationDays) || !Number.isSafeInteger(quotaGb) || (baseCoinUnits !== null && !Number.isSafeInteger(baseCoinUnits))) {
        setError(ERROR_COPY.invalid); return;
      }
      const next = await client.saveSku({
        sizeCode: selectedSize, buyerProtocol: form.buyerProtocol, durationDays,
        quotaBytes: quotaGb * GiB, baseCoinUnits, enabled, revision: snapshot?.revision
      });
      setSnapshot(next);
      setSkus(await client.listSkus());
      setSelected([]);
    } catch (err) { report(err); }
    finally { setBusy(false); }
  }

  async function withSelection(action: (ids: string[], revision: string) => Promise<ResidentialRelaySnapshot>) {
    if (!snapshot || selected.length === 0) return;
    setBusy(true); setError(null);
    try {
      const next = await action(selected, snapshot.revision);
      setSnapshot(next);
      setSkus(await client.listSkus());
      setSelected([]);
    } catch (err) { report(err); }
    finally { setBusy(false); }
  }

  return (
    <div className="resi-admin">
      <p className="resi-admin-note">
        一次性购买：到期或额度用完即停用凭证。不续费、不退款、不结转。买家只拿到中继地址和独立凭证，看不到上游住宅节点。
      </p>
      {error ? <p className="resi-admin-error" role="alert">{error}</p> : null}
      <div className="resi-admin-sizes" role="tablist" aria-label="包规格">
        {skus.map((item) => (
          <button key={item.sizeCode} type="button" role="tab" aria-selected={item.sizeCode === selectedSize}
            className={item.sizeCode === selectedSize ? "resi-admin-size active" : "resi-admin-size"}
            disabled={busy} onClick={() => setSelectedSize(item.sizeCode)}>
            {item.sizeCode}
            <span>{item.purchasable ? "可售" : item.configured ? (item.enabled ? "已启用" : "未启用") : "未配置"}</span>
          </button>
        ))}
      </div>

      <section className="resi-admin-panel" aria-label="SKU 配置">
        <h3>{selectedSize} 配置</h3>
        <div className="resi-admin-grid">
          <label>买家协议
            <select value={form.buyerProtocol} disabled={busy}
              onChange={(event) => setForm((prev) => ({ ...prev, buyerProtocol: event.target.value }))}>
              <option value="vless">VLESS</option>
              <option value="hysteria2">Hy2</option>
            </select>
          </label>
          <label>时长（天）
            <input inputMode="numeric" value={form.durationDays} disabled={busy}
              onChange={(event) => setForm((prev) => ({ ...prev, durationDays: event.target.value }))} />
          </label>
          <label>额度（GB）
            <input inputMode="numeric" value={form.quotaGb} disabled={busy}
              onChange={(event) => setForm((prev) => ({ ...prev, quotaGb: event.target.value }))} />
          </label>
          <label>价格（Coins）
            <input inputMode="numeric" value={form.baseCoinUnits} disabled={busy}
              onChange={(event) => setForm((prev) => ({ ...prev, baseCoinUnits: event.target.value }))} />
          </label>
        </div>
        <div className="resi-admin-actions">
          <button type="button" disabled={busy} onClick={() => void saveSku()}>保存配置</button>
          {snapshot?.sku.enabled
            ? <button type="button" disabled={busy} onClick={() => void saveSku(false)}>停用 SKU</button>
            : <button type="button" disabled={busy || !snapshot || (snapshot.sku.enabledUpstreamCount ?? 0) < 1}
              onClick={() => void saveSku(true)}>启用 SKU</button>}
          <button type="button" disabled={busy} onClick={() => void refresh()}>重新读取</button>
        </div>
        {selectedSku ? <p className="resi-admin-meta">
          额度 {formatQuota(selectedSku.quotaBytes)} · 上游 {selectedSku.enabledUpstreamCount}/{selectedSku.upstreamCount} 已启用
          {selectedSku.purchasable ? " · 当前可售" : " · 当前不可售"}
          {selectedSku.displayPrice ? (selectedSku.displayPrice.discountActive
            ? <> · 原价 <s>{selectedSku.displayPrice.listPrice}</s> → 折后 <strong>{selectedSku.displayPrice.discountedPrice}</strong> Coins</>
            : <> · 价格 {selectedSku.displayPrice.listPrice} Coins</>) : " · 未定价"}
        </p> : null}
      </section>

      {snapshot ? <ResidentialRelayDiscountPanel busy={busy} client={client} snapshot={snapshot} onError={report}
        onChange={async (next) => { setSnapshot(next); setSkus(await client.listSkus()); }} setBusy={setBusy} /> : null}

      <section className="resi-admin-panel" aria-label="上游线路">
        <h3>上游住宅线路</h3>
        <p className="resi-admin-note">导入格式与第三方节点 YAML 相同。导入后默认停用；启用后才会进入该 SKU 的中继出站池。</p>
        <textarea aria-label="上游 YAML" rows={8} value={yaml} disabled={busy || !snapshot}
          onChange={(event) => setYaml(event.target.value)} placeholder={"proxies:\n  - { name: US 1, type: ss, server: ..., port: 8388, cipher: aes-256-gcm, password: ... }"} />
        <div className="resi-admin-actions">
          <button type="button" disabled={busy || !snapshot || !yaml.trim()}
            onClick={() => void (async () => {
              if (!snapshot) return;
              setBusy(true); setError(null);
              try {
                const next = await client.importUpstreams(snapshot.sku.id, snapshot.revision, yaml);
                setSnapshot(next); setSkus(await client.listSkus()); setYaml(""); setSelected([]);
              } catch (err) { report(err); }
              finally { setBusy(false); }
            })()}>导入到当前 SKU</button>
          <button type="button" disabled={busy || selected.length === 0}
            onClick={() => void withSelection((ids, revision) => client.setUpstreamsEnabled(snapshot!.sku.id, revision, ids, true))}>
            <Play aria-hidden="true" size={14} /> 启用所选
          </button>
          <button type="button" disabled={busy || selected.length === 0}
            onClick={() => void withSelection((ids, revision) => client.setUpstreamsEnabled(snapshot!.sku.id, revision, ids, false))}>
            <Pause aria-hidden="true" size={14} /> 停用所选
          </button>
          <button type="button" disabled={busy || selected.length === 0
            || selected.some((id) => snapshot?.items.find((item) => item.id === id)?.enabled)}
            onClick={() => void withSelection((ids, revision) => client.deleteUpstreams(snapshot!.sku.id, revision, ids))}>
            <Trash2 aria-hidden="true" size={14} /> 删除所选
          </button>
        </div>
        {!snapshot ? <p>先保存此规格的 SKU，再导入上游。</p> : snapshot.items.length === 0 ? <p>暂无上游线路。</p> : (
          <table className="resi-admin-table">
            <thead><tr>
              <th scope="col"><input aria-label="全选" type="checkbox" checked={selected.length === snapshot.items.length}
                onChange={(event) => setSelected(event.target.checked ? snapshot.items.map((item) => item.id) : [])} /></th>
              <th scope="col">名称</th><th scope="col">国家</th><th scope="col">协议</th><th scope="col">状态</th>
            </tr></thead>
            <tbody>
              {snapshot.items.map((item) => (
                <tr key={item.id}>
                  <td><input aria-label={`选择 ${item.displayName}`} type="checkbox" checked={selected.includes(item.id)}
                    onChange={(event) => setSelected((prev) => event.target.checked
                      ? [...prev, item.id] : prev.filter((id) => id !== item.id))} /></td>
                  <td>{item.displayName}</td><td>{item.countryCode}</td><td>{item.protocol}</td>
                  <td>{item.enabled ? "已启用" : "已停用"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <ResidentialRelayCouponsPanel busy={busy} client={client} skus={skus} onError={report} setBusy={setBusy} />
    </div>
  );
}
