import { FormEvent, useEffect, useRef, useState } from "react";
import {
  isUserMonitorAccountId,
  parseUserMonitorRange,
  parseUserMonitorUtcInput,
  type UserMonitorAccountStatus,
  type UserMonitorClient,
} from "../app/admin-user-monitor-client";
import { useAdminUserMonitor } from "../app/use-admin-user-monitor";
import "./admin-user-monitor-workspace.styles.css";

type Monitor = ReturnType<typeof useAdminUserMonitor>;
type Source = { phase: "idle" | "loading" | "ready" | "error"; error: null | "session" | "permission" | "unavailable" | "invalid" | "network" | "timeout"; fetchedAt: string | null };
const ERR: Record<Exclude<Source["error"], null>, string> = {
  session: "登录已失效，请重新登录后再试。",
  permission: "当前账号没有权限读取此数据。",
  unavailable: "暂时无法读取用户监控数据，请稍后重试。",
  invalid: "返回数据未通过校验，请稍后重试。",
  network: "网络异常，请稍后重试。",
  timeout: "请求超时，请稍后重试。",
};

function utcInput(iso: string) {
  return iso.replace(/\.\d+Z$/, "Z").replace(/Z$/, "").slice(0, 16);
}

function SourceStatus({ source: s, label, onRetry, disabled }: { source: Source; label: string; onRetry: () => void; disabled: boolean }) {
  if (s.phase === "idle") return <p className="aum-status">未开始</p>;
  if (s.phase === "loading") return <p className="aum-status">正在更新</p>;
  if (s.phase === "error") {
    return <p className="aum-error">{s.error ? ERR[s.error] : "暂时无法读取该数据。"}<button type="button" disabled={disabled} onClick={onRetry}>{label}</button></p>;
  }
  return <p className="aum-status">更新于 {s.fetchedAt} UTC</p>;
}

function Chart({ points, from, to, label, unit = "账户" }: { points: { at: string; value: number; other?: number }[]; from: string; to: string; label: string; unit?: string }) {
  const W = 640, H = 160, L = 42, R = 10, T = 16, B = 24;
  const t0 = Date.parse(from), span = Math.max(Date.parse(to) - t0, 1);
  const peak = Math.max(0, ...points.map((p) => p.value + (p.other ?? 0)));
  const max = peak > 0 ? peak : 1;
  const x = (at: string) => L + ((Math.max(Date.parse(at), t0) - t0) / span) * (W - L - R);
  const y = (v: number) => T + (1 - v / max) * (H - T - B);
  const bw = Math.max(3, Math.min(14, (W - L - R) / Math.max(points.length * 2.2, 6)));
  return (
    <svg className="aum-chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label}>
      <text x={2} y={12}>{unit}</text><text x={2} y={T + 8}>{max}</text><text x={2} y={H - B}>0</text>
      <text x={L} y={H - 6}>{from.slice(0, 16).replace("T", " ")} UTC</text>
      <text x={W - 130} y={H - 6}>{to.slice(0, 16).replace("T", " ")} UTC</text>
      <line x1={L} y1={T} x2={L} y2={H - B} /><line x1={L} y1={H - B} x2={W - R} y2={H - B} />
      {points.map((p) => {
        const cx = x(p.at), y0 = y(0), y1 = y(p.value), y2 = y(p.value + (p.other ?? 0));
        return (
          <g key={p.at}>
            <rect x={cx - bw / 2} y={y1} width={bw} height={Math.max(0, y0 - y1)} />
            {p.other ? <rect x={cx - bw / 2} y={y2} width={bw} height={Math.max(0, y1 - y2)} opacity={0.4} /> : null}
          </g>
        );
      })}
    </svg>
  );
}

function formatUtc(value: string | null | undefined): string {
  if (!value) return "—";
  return value.replace("T", " ").replace(/Z$/, " UTC");
}

function formatBytes(value: number | null | undefined): string {
  if (value == null) return "—";
  const sign = value < 0 ? "-" : "";
  let n = Math.abs(value);
  const units = ["B", "KiB", "MiB", "GiB", "TiB"] as const;
  let i = 0;
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024;
    i += 1;
  }
  const text = i === 0 ? `${Math.round(n)}` : n >= 100 ? n.toFixed(0) : n >= 10 ? n.toFixed(1) : n.toFixed(2);
  return `${sign}${text} ${units[i]}`;
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="aum-stat">
      <span>{label}</span>
      <strong className="aum-number">{value}</strong>
    </div>
  );
}

const WALLET_STATUS: Record<string, string> = { not_created: "尚未创建钱包", active: "正常", frozen: "已冻结", closed: "已关闭" };
const COIN_CATEGORY: Record<string, string> = {
  credit: "入账", pending_to_reversed: "待确认撤回", available_to_reversed: "可用额度撤回", pending_to_available: "奖励确认",
  available_to_held: "订单预留", held_to_available: "预留释放", held_to_consumed: "消费完成", held_to_expired: "预留到期", available_to_expired: "额度到期",
};
const COIN_TYPE: Record<string, string> = { paid_coins: "已购 Coins", bonus_coins: "赠送 Coins", reward_coins: "奖励 Coins" };

function SelectedUserPanels({ monitor }: { monitor: Monitor }) {
  const coins = monitor.sources.coins;
  const traffic = monitor.sources.traffic;
  const coinsData = coins.phase === "ready" && coins.data ? coins.data : null;
  const trafficData = traffic.phase === "ready" && traffic.data ? traffic.data : null;
  const wallet = coinsData?.wallet;
  const walletReady = Boolean(wallet && wallet.status !== "not_created");
  const coinBusy = coins.phase === "loading";
  const coinNum = (value: number | undefined) => (walletReady && value != null ? value : "—");
  const trafficTotal = (value: number | null | undefined) => {
    if (!trafficData || trafficData.state === "not_collected") return "—";
    if (trafficData.state === "measured_zero") return formatBytes(0);
    return formatBytes(value);
  };
  const chartPoints = trafficData && trafficData.state !== "not_collected"
    ? trafficData.points.filter((point) => point.totalBytes != null).map((point) => ({ at: point.at, value: Number(point.totalBytes) / 1048576 }))
    : [];
  return (
    <div className="aum-grid">
      <section className="aum-section" aria-label="Coins 监控">
        <div className="aum-section-head">
          <h2>Coins 监控</h2>
          <SourceStatus source={coins} label="重试 Coins" onRetry={() => monitor.retry("coins")} disabled={!monitor.connected} />
        </div>
        {coinsData && wallet ? (
          <>
            <p className="aum-muted">生成时间 {formatUtc(coinsData.generatedAt)}</p>
            <p className="aum-status">钱包状态 {WALLET_STATUS[wallet.status] ?? "—"}</p>
            <div className="aum-stats">
              <Stat label="当前余额（不随日期筛选）" value={coinNum(wallet.spendableUnits)} />
              <Stat label="已购可用" value={coinNum(wallet.balances.paidCoins)} />
              <Stat label="赠送可用" value={coinNum(wallet.balances.bonusCoins)} />
              <Stat label="奖励可用" value={coinNum(wallet.balances.rewardCoins)} />
              <Stat label="订单预留" value={coinNum(wallet.heldUnits)} />
              <Stat label="待确认奖励" value={coinNum(wallet.pendingUnits)} />
            </div>
            <p className="aum-ledger-note">订单预留不是实际消费；近期账变不代表所选时段的总支出。</p>
            {coinsData.entries.length ? (
              <div className="aum-table-wrap">
                <table className="aum-table">
                  <thead>
                    <tr><th scope="col">日期</th><th scope="col">类别</th><th scope="col">币种</th><th scope="col">数额</th><th scope="col">合计变动</th></tr>
                  </thead>
                  <tbody>
                    {coinsData.entries.map((entry) => (
                      <tr key={entry.entryRef}>
                        <td>{formatUtc(entry.occurredAt)}</td>
                        <td>{COIN_CATEGORY[entry.category] ?? "—"}</td>
                        <td>{COIN_TYPE[entry.coinType] ?? "—"}</td>
                        <td className="aum-number">{entry.amountUnits}</td>
                        <td className="aum-number">{entry.totalDeltaUnits > 0 ? `+${entry.totalDeltaUnits}` : `${entry.totalDeltaUnits}`}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="aum-empty">暂无近期账变</p>
            )}
            <div className="aum-actions">
              <button type="button" disabled={!monitor.connected || coinBusy || !monitor.coinsHasPrev} onClick={() => monitor.pageCoins("prev")}>上一页账变</button>
              <button type="button" disabled={!monitor.connected || coinBusy || !coinsData.nextCursor} onClick={() => monitor.pageCoins("next")}>下一页账变</button>
            </div>
          </>
        ) : coins.phase === "loading" ? (
          <p className="aum-muted">正在加载 Coins</p>
        ) : coins.phase === "error" ? (
          <p className="aum-empty">Coins 暂不可用</p>
        ) : (
          <p className="aum-empty">暂无 Coins 数据</p>
        )}
      </section>
      <section className="aum-section" aria-label="流量计量">
        <div className="aum-section-head">
          <h2>流量计量</h2>
          <SourceStatus source={traffic} label="重试流量计量" onRetry={() => monitor.retry("traffic")} disabled={!monitor.connected} />
        </div>
        <label>
          流量粒度
          <select value={monitor.bucket} onChange={(event) => monitor.setBucket(event.target.value as "hour" | "day")} disabled={!monitor.connected}>
            <option value="day">按日</option>
            <option value="hour">按小时</option>
          </select>
        </label>
        {trafficData ? (
          <>
            <p className="aum-muted">{trafficData.state === "not_collected" ? "尚无计量样本" : trafficData.state === "measured_zero" ? "已采样，区间用量为 0" : "区间"}</p>
            <p className="aum-muted">{formatUtc(trafficData.from)} → {formatUtc(trafficData.to)}{" · 样本 "}{trafficData.sampleCount}{" · 最近观测 "}{formatUtc(trafficData.lastObservedAt)}</p>
            <p className="aum-ledger-note">以下为已存储的观测用量，不是带宽、采集健康或配额。</p>
            <div className="aum-stats">
              <Stat label="总量" value={trafficTotal(trafficData.totalBytes)} />
              <Stat label="上行" value={trafficTotal(trafficData.uploadBytes)} />
              <Stat label="下行" value={trafficTotal(trafficData.downloadBytes)} />
            </div>
            {trafficData.state !== "not_collected" && chartPoints.length ? (
              <Chart points={chartPoints} from={trafficData.from} to={trafficData.to} label="流量计量" unit="MiB" />
            ) : null}
            {trafficData.points.length ? (
              <details>
                <summary>查看流量数据</summary>
                <div className="aum-table-wrap">
                  <table className="aum-table">
                    <thead>
                      <tr><th scope="col">时间</th><th scope="col">样本</th><th scope="col">上行</th><th scope="col">下行</th><th scope="col">总量</th></tr>
                    </thead>
                    <tbody>
                      {trafficData.points.map((point) => (
                        <tr key={point.at}>
                          <td>{formatUtc(point.at)}</td>
                          <td className="aum-number">{point.sampleCount}</td>
                          <td className="aum-number">{formatBytes(point.uploadBytes)}</td>
                          <td className="aum-number">{formatBytes(point.downloadBytes)}</td>
                          <td className="aum-number">{formatBytes(point.totalBytes)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </details>
            ) : null}
          </>
        ) : traffic.phase === "loading" ? (
          <p className="aum-muted">正在加载流量计量</p>
        ) : traffic.phase === "error" ? (
          <p className="aum-empty">流量计量暂不可用</p>
        ) : (
          <p className="aum-empty">暂无流量计量数据</p>
        )}
      </section>
    </div>
  );
}

export function AdminUserMonitorWorkspace({ createClient }: { createClient?: () => UserMonitorClient }) {
  const monitor = useAdminUserMonitor(createClient);
  const { connected, intervalSeconds, setIntervalSeconds, sources, query, setBucket, directory, selectedAccountId, start, stop, refresh, retry, applyRange, applyDirectory, selectAccount } = monitor;
  const { growth, accounts } = sources;
  const [fromDraft, setFromDraft] = useState(() => utcInput(query.from));
  const [toDraft, setToDraft] = useState(() => utcInput(query.to));
  const [rangeError, setRangeError] = useState("");
  const [idDraft, setIdDraft] = useState(directory.accountId ?? "");
  const [statusDraft, setStatusDraft] = useState(directory.status ?? "");
  const [dirError, setDirError] = useState("");
  const [pageDepth, setPageDepth] = useState(0);
  const stack = useRef<Array<string | undefined>>([]);
  const busy = useRef(false);
  const pending = useRef<"push" | "pop" | null>(null);
  const pushCursor = useRef<string | undefined>(undefined);

  useEffect(() => {
    if (accounts.phase !== "ready") return;
    if (pending.current === "push") { stack.current.push(pushCursor.current); setPageDepth((n) => n + 1); }
    if (pending.current === "pop") { stack.current.pop(); setPageDepth((n) => Math.max(0, n - 1)); }
    pending.current = null;
    busy.current = false;
  }, [accounts.phase]);

  function applyPreset(hours: number) {
    const to = Date.now();
    const range = { from: new Date(to - hours * 3600000).toISOString(), to: new Date(to).toISOString() };
    setFromDraft(utcInput(range.from)); setToDraft(utcInput(range.to)); setRangeError("");
    setBucket(hours <= 24 ? "hour" : "day");
    applyRange(range, false);
  }

  function onApplyRange() {
    const from = parseUserMonitorUtcInput(fromDraft);
    const to = parseUserMonitorUtcInput(toDraft);
  const range = from && to ? parseUserMonitorRange(from, to) : null;
    if (!range?.from || !range.to || Date.parse(range.to) <= Date.parse(range.from) || Date.parse(range.to) - Date.parse(range.from) > 31 * 86400000) {
      setRangeError("时间范围无效，且不能超过 31 天。");
      return;
    }
    setRangeError("");
    applyRange(range, true);
  }

  function onFilter(event: FormEvent) {
    event.preventDefault();
    const id = idDraft.trim();
    if (id && !isUserMonitorAccountId(id)) { setDirError("账户 ID 无效。"); return; }
    setDirError(""); stack.current = []; busy.current = false; pending.current = null; setPageDepth(0);
    selectAccount(null);
    applyDirectory({ accountId: id || undefined, status: (statusDraft || undefined) as UserMonitorAccountStatus | undefined, cursor: undefined, limit: 20 });
  }

  function pageDir(dir: "next" | "prev") {
    if (!connected || accounts.phase === "loading" || busy.current || pending.current) return;
    if (dir === "next") {
      if (!accounts.data?.nextCursor) return;
      busy.current = true; pending.current = "push"; pushCursor.current = directory.cursor;
      applyDirectory({ accountId: directory.accountId, status: directory.status, cursor: accounts.data.nextCursor, limit: 20 });
      return;
    }
    if (!stack.current.length) return;
    busy.current = true; pending.current = "pop";
    applyDirectory({ accountId: directory.accountId, status: directory.status, cursor: stack.current[stack.current.length - 1], limit: 20 });
  }

  const g = growth.data;
  const items = accounts.data?.items ?? [];
  return (
    <div className="admin-user-monitor">
      <div className="aum-toolbar">
        <div className="aum-actions">
          <button type="button" className="aum-primary" disabled={connected} onClick={() => { stack.current = []; pending.current = null; busy.current = false; setPageDepth(0); applyDirectory({ ...directory, cursor: undefined, limit: 20 }); start(); }}>开始只读监控</button>
          <button type="button" disabled={!connected} onClick={refresh}>更新数据</button>
          <button type="button" disabled={!connected} onClick={() => { selectAccount(null); stop(); }}>停止监控</button>
          <label>自动更新
            <select disabled={!connected} value={intervalSeconds} onChange={(e) => setIntervalSeconds(Number(e.target.value) as 0 | 30 | 60)}>
              <option value={0}>暂停</option><option value={30}>30秒</option><option value={60}>60秒</option>
            </select>
          </label>
        </div>
      </div>
      <form className="aum-range" onSubmit={(e) => { e.preventDefault(); onApplyRange(); }}>
        <div className="aum-actions">
          <button type="button" disabled={!connected} onClick={() => applyPreset(24)}>近24小时</button>
          <button type="button" disabled={!connected} onClick={() => applyPreset(168)}>近7天</button>
          <button type="button" disabled={!connected} onClick={() => applyPreset(720)}>近30天</button>
        </div>
        <label>开始时间（UTC）<input type="datetime-local" disabled={!connected} value={fromDraft} onChange={(e) => setFromDraft(e.target.value)} /></label>
        <label>结束时间（UTC）<input type="datetime-local" disabled={!connected} value={toDraft} onChange={(e) => setToDraft(e.target.value)} /></label>
        <button type="submit" disabled={!connected}>应用时间范围</button>
        {rangeError ? <p className="aum-error" role="alert">{rangeError}</p> : null}
        <p className="aum-ledger-note">时间范围为 UTC 半开区间 [开始, 结束)，仅用于注册增长和已选用户流量，不影响账户目录。</p>
      </form>
      <div className="aum-grid">
        <section className="aum-section" aria-label="注册增长">
          <div className="aum-section-head"><h2>注册增长</h2><SourceStatus source={growth} label="重试注册增长" onRetry={() => retry("growth")} disabled={!connected} /></div>
          {g ? (
            <>
              <div className="aum-stats">
                <div className="aum-stat"><span>新注册用户</span><strong className="aum-number">{g.registeredCount ?? "—"}</strong><small className="aum-muted">self_service_portal 自助注册</small></div>
                <div className="aum-stat"><span>其他新增账户</span><strong className="aum-number">{g.otherCreatedCount ?? "—"}</strong><small className="aum-muted">other 其他来源</small></div>
              </div>
              {g.registeredCount === 0 && g.otherCreatedCount === 0 ? <p className="aum-empty">所选时段暂无新增账户</p> : null}
              <Chart points={g.points.map((p) => ({ at: p.at, value: p.registeredCount, other: p.otherCreatedCount }))} from={g.from} to={g.to} label="注册增长" />
              <p className="aum-muted">实心为自助注册，浅色为其他新增；横轴 UTC 时间，纵轴账户数；UTC 日桶为 0 表示已确认无新增，不是缺失。</p>
              <details><summary>查看每日数据</summary>
                <div className="aum-table-wrap"><table className="aum-table"><thead><tr><th>日期（UTC）</th><th>新注册</th><th>其他新增</th></tr></thead>
                  <tbody>{g.points.map((p) => <tr key={p.at}><td>{p.at}</td><td className="aum-number">{p.registeredCount}</td><td className="aum-number">{p.otherCreatedCount}</td></tr>)}</tbody>
                </table></div>
              </details>
            </>
          ) : (
            <div className="aum-stats">
              <div className="aum-stat"><span>新注册用户</span><strong className="aum-number">—</strong><small className="aum-muted">self_service_portal 自助注册</small></div>
              <div className="aum-stat"><span>其他新增账户</span><strong className="aum-number">—</strong><small className="aum-muted">other 其他来源</small></div>
            </div>
          )}
        </section>
        <section className="aum-section" aria-label="账户目录">
          <div className="aum-section-head"><h2>账户目录</h2><SourceStatus source={accounts} label="重试账户目录" onRetry={() => retry("accounts")} disabled={!connected} /></div>
          <form className="aum-filters" onSubmit={onFilter}>
            <label>账户 ID<input value={idDraft} disabled={!connected} onChange={(e) => setIdDraft(e.target.value)} autoComplete="off" /></label>
            <label>账户状态
              <select value={statusDraft} disabled={!connected} onChange={(e) => setStatusDraft(e.target.value)}>
                <option value="">全部</option><option value="active">正常</option><option value="suspended">已暂停</option><option value="disabled">已停用</option>
              </select>
            </label>
            <button type="submit" disabled={!connected}>筛选账户</button>
            {dirError ? <p className="aum-error" role="alert">{dirError}</p> : null}
          </form>
          {accounts.phase === "ready" && !items.length ? <p className="aum-empty">暂无匹配账户</p> : null}
          {items.length ? (
            <div className="aum-table-wrap"><table className="aum-table">
              <thead><tr><th>账户 ID</th><th>创建时间（UTC）</th><th>来源</th><th>状态</th><th /></tr></thead>
              <tbody>{items.map((row) => (
                <tr key={row.id} className={row.id === selectedAccountId ? "aum-selected" : undefined}>
                  <td className="aum-id">{row.id}</td><td>{row.createdAt}</td>
                  <td>{row.registrationSource === "self_service_portal" ? "自助注册" : "其他"}</td>
                  <td><span className="aum-pill">{row.status === "active" ? "正常" : row.status === "suspended" ? "已暂停" : "已停用"}</span></td>
                  <td><button type="button" disabled={!connected} onClick={() => selectAccount(row.id)}>查看</button></td>
                </tr>
              ))}</tbody>
            </table></div>
          ) : null}
          <div className="aum-actions">
            <button type="button" disabled={!connected || accounts.phase !== "ready" || pageDepth === 0} onClick={() => pageDir("prev")}>上一页账户</button>
            <button type="button" disabled={!connected || accounts.phase !== "ready" || !accounts.data?.nextCursor} onClick={() => pageDir("next")}>下一页账户</button>
          </div>
        </section>
      </div>
      {selectedAccountId ? (
        <section className="aum-section">
          <div className="aum-detail-header">
            <h2>用户详情 <span className="aum-id">{selectedAccountId}</span></h2>
            <button type="button" onClick={() => selectAccount(null)}>关闭用户详情</button>
          </div>
          <SelectedUserPanels monitor={monitor} />
        </section>
      ) : null}
    </div>
  );
}
