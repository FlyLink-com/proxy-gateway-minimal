import { useState } from "react";
import {
  type AdminUsageLedgerSummary,
  type UsageLedgerClient,
  type UsageLedgerSampleState,
  type UsageLedgerWindow,
  type UsageLedgerWindowId
} from "../app/admin-usage-ledger-client";
import { useAdminUsageLedger, type UsageLedgerHookError } from "../app/use-admin-usage-ledger";
import "./admin-usage-ledger-workspace.styles.css";

const ERR: Record<UsageLedgerHookError, string> = {
  session: "登录已失效，请重新登录后再试。",
  permission: "当前账号没有权限读取此数据。",
  unavailable: "暂时无法读取用量台账，请稍后重试。",
  invalid: "返回数据未通过校验，请稍后重试。",
  network: "网络异常，请稍后重试。",
  timeout: "请求超时，请稍后重试。"
};

const WINDOW_LABEL: Record<UsageLedgerWindowId, string> = {
  all_time: "累计已记录",
  last_24h: "近 24 小时",
  last_7d: "近 7 天",
  month_to_date: "本 UTC 月"
};

const SOURCE_LABEL: Record<UsageLedgerWindow["sources"][number]["category"], string> = {
  local_vless: "本地 VLESS（已存储分类）",
  local_hy2: "本地 Hysteria2（已存储分类）",
  local_tuic: "本地 TUIC（已存储分类）",
  sgp_vless: "新加坡 VLESS（已存储分类）",
  sgp_hy2: "新加坡 Hysteria2（已存储分类）",
  other_sources: "其他已存储来源"
};

const STATE_LABEL: Record<UsageLedgerSampleState, string> = {
  not_collected: "尚无样本（未知，不是零用量）",
  measured_zero: "已采样，记录用量为 0",
  measured: "已记录用量"
};

function formatUtc(value: string | null | undefined): string {
  if (!value) return "—";
  return value.replace("T", " ").replace(/\.\d{3}Z$/, " UTC").replace(/Z$/, " UTC");
}

function formatBinaryUnits(raw: bigint): string {
  const sign = raw < 0n ? "-" : "";
  const abs = raw < 0n ? -raw : raw;
  if (abs < 1024n) return `${sign}${abs} B`;
  const units = ["KiB", "MiB", "GiB", "TiB", "PiB", "EiB"] as const;
  let unit = 0;
  let divisor = 1024n;
  while (unit < units.length - 1 && abs >= divisor * 1024n) {
    divisor *= 1024n;
    unit += 1;
  }
  const whole = abs / divisor;
  if (whole >= 100n) return `${sign}${whole} ${units[unit]}`;
  if (whole >= 10n) {
    const tenths = (abs * 10n) / divisor % 10n;
    return `${sign}${whole}.${tenths} ${units[unit]}`;
  }
  const hundredths = (abs * 100n) / divisor % 100n;
  return `${sign}${whole}.${hundredths.toString().padStart(2, "0")} ${units[unit]}`;
}

function BytesView({ value, state }: { value: string; state?: UsageLedgerSampleState }) {
  if (state === "not_collected") return <span aria-label="用量未知">—</span>;
  const parsed = BigInt(value);
  return (
    <span className="aul-bytes" aria-label={`${value} 字节`}>
      <span className="aul-bytes-fmt">{formatBinaryUnits(parsed)}</span>
      <span className="aul-bytes-exact">{value} 字节</span>
    </span>
  );
}

function windowOf(data: AdminUsageLedgerSummary, id: UsageLedgerWindowId): UsageLedgerWindow {
  return data.windows.find((window) => window.id === id) ?? data.windows[0]!;
}

export function AdminUsageLedgerWorkspace({
  createClient,
  userManagementHref = "#/admin/userManagement"
}: {
  createClient?: () => UsageLedgerClient;
  userManagementHref?: string;
} = {}) {
  const ledger = useAdminUsageLedger(createClient);
  const [selectedId, setSelectedId] = useState<UsageLedgerWindowId>("all_time");
  const selected = ledger.data ? windowOf(ledger.data, selectedId) : null;
  const emptyLedger = Boolean(
    ledger.data
    && ledger.data.windows.every((window) => window.state === "not_collected")
    && ledger.data.reconciliation.samples.sampleCount === 0
  );
  const busy = ledger.phase === "loading";

  return (
    <div className="admin-usage-ledger">
      <section className="aul-section" aria-label="用量台账">
        <div className="aul-section-head">
          <h2>用量台账汇总</h2>
          <div className="aul-toolbar">
            <button
              type="button"
              className="aul-primary"
              disabled={busy}
              onClick={() => ledger.refresh()}
            >
              {ledger.phase === "idle" ? "读取用量台账" : "重新读取"}
            </button>
            <a className="aul-link" href={userManagementHref}>前往用户管理查看账户明细</a>
          </div>
        </div>
        <p className="aul-lede">只读合计。此处不录入账户，也不自动轮询全库。</p>
        <ul className="aul-caveats">
          <li>覆盖全部已记录账户，无法区分测试账户与真实客户。</li>
          <li>第三方未计量流量不在此台账。</li>
          <li>缺失时间段视为未知，不等于零用量。</li>
          <li>合计对账不是归因证明，也不表示采集器健康。</li>
          <li>来源标签描述已存储的来源分类，不证明当前节点在线或正在采集。</li>
        </ul>
        {ledger.phase === "idle" ? (
          <p className="aul-empty" role="status">尚未读取。空台账表示尚无样本或未知，不是已证实的零用量。</p>
        ) : null}
        {ledger.phase === "loading" ? (
          <p className="aul-muted" role="status" aria-busy="true">正在读取用量台账</p>
        ) : null}
        {ledger.phase === "error" ? (
          <p className="aul-error" role="alert">{ledger.error ? ERR[ledger.error] : "暂时无法读取用量台账。"}</p>
        ) : null}
        {ledger.data && ledger.phase === "ready" ? (
          <>
            <p className="aul-note">
              截止时刻 {formatUtc(ledger.data.cutoff)}
              {ledger.fetchedAt ? ` · 本次读取 ${formatUtc(ledger.fetchedAt)}` : ""}
              。窗口为 UTC 半开区间 [起始, 截止)。
            </p>
            {emptyLedger ? (
              <p className="aul-empty" role="status">当前截止时刻前没有样本。这表示尚未采集或未知，不是已证实的零用量。</p>
            ) : null}
            <div className="aul-cards">
              {ledger.data.windows.map((window) => (
                <button
                  key={window.id}
                  type="button"
                  className="aul-card"
                  aria-pressed={window.id === selectedId}
                  onClick={() => setSelectedId(window.id)}
                >
                  <span className="aul-card-label">{WINDOW_LABEL[window.id]}</span>
                  <span className="aul-card-value">
                    {window.state === "not_collected" ? "尚无样本" : <BytesView value={window.totalBytes} />}
                  </span>
                  <span className="aul-muted">{STATE_LABEL[window.state]}</span>
                  <span className="aul-muted">样本 {window.sampleCount} · 有记录用量的账户 {window.positiveAccountCount}</span>
                  <span className="aul-muted">最近观测（观测时刻，不是提交时间） {formatUtc(window.latestObservedAt)}</span>
                </button>
              ))}
            </div>
          </>
        ) : null}
      </section>
      {selected && ledger.phase === "ready" ? (
        <section className="aul-section" aria-label="选定窗口来源">
          <div className="aul-section-head">
            <h2>{WINDOW_LABEL[selected.id]}来源分类</h2>
          </div>
          <p className="aul-note">
            {selected.from ? formatUtc(selected.from) : "起始（无下界）"} → {formatUtc(selected.to)}
            。来源按已存储分类汇总，不是当前节点活性证明。
          </p>
          {selected.state === "not_collected" ? (
            <p className="aul-empty" role="status">该窗口尚无样本，用量未知，不是零。</p>
          ) : null}
          {selected.state === "measured_zero" ? (
            <p className="aul-empty" role="status">该窗口已采样，记录用量为 0。</p>
          ) : null}
          <div className="aul-stats">
            <div className="aul-stat"><span>上行</span><strong><BytesView value={selected.uploadBytes} state={selected.state} /></strong></div>
            <div className="aul-stat"><span>下行</span><strong><BytesView value={selected.downloadBytes} state={selected.state} /></strong></div>
            <div className="aul-stat"><span>合计</span><strong><BytesView value={selected.totalBytes} state={selected.state} /></strong></div>
            <div className="aul-stat"><span>有记录用量的账户数</span><strong>{selected.positiveAccountCount}</strong></div>
            <div className="aul-stat"><span>样本数</span><strong>{selected.sampleCount}</strong></div>
            <div className="aul-stat"><span>最近观测时间（观测时刻，不是提交时间）</span><strong>{formatUtc(selected.latestObservedAt)}</strong></div>
          </div>
          <div className="aul-table-wrap" tabIndex={0} role="region" aria-label="来源分类横向滚动表格">
            <table className="aul-table">
              <caption className="aul-muted">选定窗口的已存储来源分类</caption>
              <thead>
                <tr>
                  <th scope="col">来源分类</th>
                  <th scope="col">状态</th>
                  <th scope="col" className="aul-num">上行</th>
                  <th scope="col" className="aul-num">下行</th>
                  <th scope="col" className="aul-num">合计</th>
                  <th scope="col" className="aul-num">有记录用量的账户</th>
                  <th scope="col" className="aul-num">样本</th>
                  <th scope="col">最近观测</th>
                </tr>
              </thead>
              <tbody>
                {selected.sources.map((source) => (
                  <tr key={source.category}>
                    <td>{SOURCE_LABEL[source.category]}</td>
                    <td><span className="aul-pill">{STATE_LABEL[source.state]}</span></td>
                    <td className="aul-num"><BytesView value={source.uploadBytes} state={source.state} /></td>
                    <td className="aul-num"><BytesView value={source.downloadBytes} state={source.state} /></td>
                    <td className="aul-num"><BytesView value={source.totalBytes} state={source.state} /></td>
                    <td className="aul-num">{source.positiveAccountCount}</td>
                    <td className="aul-num">{source.sampleCount}</td>
                    <td>{formatUtc(source.latestObservedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
      {ledger.data && ledger.phase === "ready" ? (
        <section className="aul-section" aria-label="合计对账">
          <div className="aul-section-head">
            <h2>样本与汇总合计对账</h2>
          </div>
          {ledger.data.reconciliation.state === "totals_match" ? (
            <p className="aul-recon-match">
              样本合计与汇总合计一致。这只是整库合计对账，不是采集健康或归因证明。
            </p>
          ) : (
            <p className="aul-recon-mismatch" role="status">
              样本合计与汇总合计不一致。差额是有符号字节差，不能把样本与汇总相加。
            </p>
          )}
          <div className="aul-table-wrap" tabIndex={0} role="region" aria-label="对账横向滚动表格">
            <table className="aul-table">
              <caption className="aul-muted">整库快照对账（含截止时刻及之后的样本，不对某一窗口）</caption>
              <thead>
                <tr>
                  <th scope="col">项目</th>
                  <th scope="col" className="aul-num">行数</th>
                  <th scope="col" className="aul-num">上行</th>
                  <th scope="col" className="aul-num">下行</th>
                  <th scope="col" className="aul-num">合计</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <th scope="row">样本</th>
                  <td className="aul-num">{ledger.data.reconciliation.samples.sampleCount}</td>
                  <td className="aul-num"><BytesView value={ledger.data.reconciliation.samples.uploadBytes} /></td>
                  <td className="aul-num"><BytesView value={ledger.data.reconciliation.samples.downloadBytes} /></td>
                  <td className="aul-num"><BytesView value={ledger.data.reconciliation.samples.totalBytes} /></td>
                </tr>
                <tr>
                  <th scope="row">汇总</th>
                  <td className="aul-num">{ledger.data.reconciliation.rollups.rollupCount}</td>
                  <td className="aul-num"><BytesView value={ledger.data.reconciliation.rollups.uploadBytes} /></td>
                  <td className="aul-num"><BytesView value={ledger.data.reconciliation.rollups.downloadBytes} /></td>
                  <td className="aul-num"><BytesView value={ledger.data.reconciliation.rollups.totalBytes} /></td>
                </tr>
                <tr>
                  <th scope="row">差额（样本 − 汇总）</th>
                  <td className="aul-num">—</td>
                  <td className="aul-num"><BytesView value={ledger.data.reconciliation.differenceBytes.uploadBytes} /></td>
                  <td className="aul-num"><BytesView value={ledger.data.reconciliation.differenceBytes.downloadBytes} /></td>
                  <td className="aul-num"><BytesView value={ledger.data.reconciliation.differenceBytes.totalBytes} /></td>
                </tr>
              </tbody>
            </table>
          </div>
          <div className="aul-stats">
            <div className="aul-stat"><span>样本中的孤儿账户数</span><strong>{ledger.data.reconciliation.orphanSampleAccountCount}</strong></div>
            <div className="aul-stat"><span>汇总中的孤儿账户数</span><strong>{ledger.data.reconciliation.orphanRollupAccountCount}</strong></div>
            <div className="aul-stat"><span>截止时刻之后的样本</span><strong>{ledger.data.reconciliation.futureSampleCount}</strong></div>
            <div className="aul-stat"><span>恰好位于截止时刻的样本</span><strong>{ledger.data.reconciliation.atCutoffSampleCount}</strong></div>
          </div>
        </section>
      ) : null}
    </div>
  );
}
