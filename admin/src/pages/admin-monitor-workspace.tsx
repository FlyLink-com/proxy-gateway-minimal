import { useMemo, useState, type ReactNode } from "react";
import type {
  MonitorAccount,
  MonitorCollector,
  MonitorEntitlement,
  MonitorPoint,
  MonitorQuery,
  MonitorUsageRow,
} from "../app/admin-monitor-read-client";
import {
  formatAdminProductionBaselinePreviewHash,
  type AdminProductionBaselinePageId,
} from "../app/admin-production-baseline";
import {
  useAdminMonitor,
  type MonitorClient,
  type SourceKey,
} from "../app/use-admin-monitor";

const TZ = Intl.DateTimeFormat().resolvedOptions().timeZone;
const PAGE_SIZE = 20;
const GIB = 1024 ** 3;
const RANGE_MS = 31 * 24 * 60 * 60 * 1000;
const FALLBACK = new Set<AdminProductionBaselinePageId>([
  "orderRecords",
  "userAccessLogs",
  "userOperationLogs",
]);
const ERR = {
  session: "会话已失效",
  permission: "权限不足",
  unavailable: "来源不可用",
  invalid: "查询无效",
  network: "网络异常",
  timeout: "请求超时",
} as const;
const ST: Record<string, string> = {
  active: "活跃",
  expired: "已过期",
  pending: "待处理",
  suspended: "已暂停",
  revoked: "已吊销",
  disabled: "已停用",
  measured: "已计量",
  measured_zero: "计量为零",
  not_collected: "未采集",
  collector_disabled: "采集器已停用",
  stale: "观测陈旧",
  locked: "已锁定",
  pending_review: "审核中",
  blocked: "已限制",
  not_configured: "未配置",
  not_observed: "尚无观测",
  invalid_observation: "观测无效",
  healthy: "健康",
  degraded: "降级",
  failed: "失败",
  available: "可读取",
  unknown: "未知",
};
const PH = { idle: "未开始", loading: "读取中", ready: "已返回", error: "读取失败" } as const;
const REASON: Record<string, string> = {
  ok: "正常",
  idle_no_user_traffic: "空闲无用户流量",
  sidecar_idle: "边车空闲",
  config_error: "配置错误",
  auth_error: "鉴权错误",
  authentication_failed: "认证失败",
  collector_exception: "采集异常",
  controller_error: "控制器错误",
  controller_forbidden: "控制器拒绝访问",
  controller_unauthorized: "控制器未授权",
  credential_binding_missing: "缺少凭证绑定",
  mapping_unresolved: "映射未解析",
  missing_stats: "缺少统计",
  node_aggregate_only: "仅节点汇总",
  per_credential_usage_entries_required: "需要按凭证用量条目",
  runtime_down: "运行时不可用",
  runtime_fetch_failed: "运行时读取失败",
  traffic_stats_forbidden: "流量统计拒绝访问",
  traffic_stats_unauthorized: "流量统计未授权",
  unresolved_binding: "绑定未解析",
  validation_error: "校验错误",
  xray_stats_query_failed: "Xray 统计查询失败",
  timeout: "采集超时",
  network: "网络异常",
  permission: "权限不足",
  unavailable: "来源不可用",
  stale: "观测已过期",
  disabled: "采集器已停用",
  missing: "缺少观测",
  failed: "采集失败",
  degraded: "采集降级",
};
const SOURCES: { key: SourceKey; label: string; retry: string }[] = [
  { key: "accounts", label: "账户来源", retry: "重试账户" },
  { key: "entitlements", label: "权益来源", retry: "重试权益" },
  { key: "usage", label: "用量来源", retry: "重试用量" },
  { key: "collectors", label: "采集器来源", retry: "重试采集器" },
];

type ErrKey = keyof typeof ERR;
type Slice<T> = {
  phase: "idle" | "loading" | "ready" | "error";
  data: T | null;
  error: ErrKey | null;
  fetchedAt: string | null;
};

function st(v: string | null | undefined): string {
  return v && ST[v] ? ST[v] : "未知";
}
function statusTone(v: string | null | undefined): "danger" | "info" | "neutral" | "warning" {
  if (!v || !ST[v] || v === "unknown") return "neutral";
  if (v === "failed" || v === "invalid_observation") return "danger";
  if (
    v === "active" ||
    v === "available" ||
    v === "healthy" ||
    v === "measured" ||
    v === "measured_zero" ||
    v === "not_collected" ||
    v === "pending" ||
    v === "pending_review"
  ) {
    return "info";
  }
  return "warning";
}
function StatusBadge({ value }: { value: string | null | undefined }) {
  const tone = statusTone(value);
  return (
    <span
      className={`admin-monitor-status admin-monitor-status-${tone}`}
      data-status={value && ST[value] ? value : "unknown"}
      data-tone={tone}
    >
      {st(value)}
    </span>
  );
}
function reasonOf(code: string): string {
  return /^[a-z][a-z0-9_]*$/i.test(code) && REASON[code] ? REASON[code] : "未分类诊断";
}
function fmtTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).format(d);
}
function fmtGib(bytes: number | null | undefined): string {
  if (bytes == null || !Number.isFinite(bytes) || bytes < 0) return "—";
  if (bytes === 0) return "0";
  const g = bytes / GIB;
  if (g > 0 && g < 0.000001) return "<0.000001";
  return g.toFixed(6).replace(/(\.\d*?)0+$/, "$1").replace(/\.$/, "");
}
function aged(iso: string | null | undefined): boolean {
  if (!iso) return true;
  const t = new Date(iso).getTime();
  return Number.isNaN(t) || Date.now() - t > 120000;
}
function hit(q: string, parts: Array<string | null | undefined>): boolean {
  const n = q.trim().toLowerCase();
  return !n || parts.some((p) => (p ?? "").toLowerCase().includes(n));
}
function listEmpty(phase: Slice<unknown>["phase"], raw: number, filtered: number, fail: string): string {
  if (phase === "error") return fail;
  if (phase === "loading") return "读取中";
  if (phase !== "ready") return "尚未开始只读监控";
  if (raw === 0) return "无返回记录";
  if (filtered === 0) return "无匹配记录";
  return "无返回记录";
}
function fetchLabel(slice: Slice<unknown>): string {
  if (slice.phase === "error") return "非最新";
  if (slice.phase !== "ready") return "";
  return aged(slice.fetchedAt) ? "查询结果已过期" : `查询完成 ${fmtTime(slice.fetchedAt)}`;
}
function isoLocal(v: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(v);
  if (!m) return null;
  const y = +m[1],
    mo = +m[2],
    d = +m[3],
    h = +m[4],
    mi = +m[5],
    s = +(m[6] ?? 0);
  const dt = new Date(y, mo - 1, d, h, mi, s);
  if (dt.getFullYear() !== y || dt.getMonth() !== mo - 1 || dt.getDate() !== d || dt.getHours() !== h || dt.getMinutes() !== mi) {
    return null;
  }
  return dt;
}
function accountRef(
  accountId: string | null | undefined,
  map: Map<string, MonitorAccount>,
  join: boolean,
): string {
  if (!accountId) return "无账户引用";
  if (join && !map.has(accountId)) return `未匹配 ${accountId}`;
  return accountId;
}

function Pager({ page, pages, onPage }: { page: number; pages: number; onPage: (n: number) => void }) {
  return (
    <div className="admin-monitor-pager">
      <button type="button" disabled={page <= 1} onClick={() => onPage(page - 1)}>
        上一页
      </button>
      <span>
        {page}/{pages}
      </span>
      <button type="button" disabled={page >= pages} onClick={() => onPage(page + 1)}>
        下一页
      </button>
    </div>
  );
}

function DataTable({
  columns,
  rowKeys,
  cells,
  empty,
}: {
  columns: string[];
  rowKeys: string[];
  cells: ReactNode[][];
  empty: string;
}) {
  return (
    <div className="admin-monitor-table-wrap">
      <table className="admin-monitor-table">
        <thead>
          <tr>
            {columns.map((c) => (
              <th key={c}>{c}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {cells.length === 0 ? (
            <tr>
              <td className="admin-monitor-cell admin-monitor-empty" colSpan={columns.length}>
                {empty}
              </td>
            </tr>
          ) : (
            cells.map((row, i) => (
              <tr key={rowKeys[i]}>
                {row.map((cell, j) => (
                  <td key={j} className="admin-monitor-cell">
                    {cell}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

function SafeDetails({ rows }: { rows: Array<[string, string]> }) {
  return (
    <details className="admin-monitor-details">
      <summary className="admin-monitor-details-summary" tabIndex={0}>
        详情
      </summary>
      <dl className="admin-monitor-dl">
        {rows.map(([k, v]) => (
          <div key={k}>
            <dt>{k}</dt>
            <dd>{v}</dd>
          </div>
        ))}
      </dl>
    </details>
  );
}

function PointBars({ points }: { points: MonitorPoint[] }) {
  const max = points.reduce((m, p) => (typeof p.totalBytes === "number" && p.totalBytes > m ? p.totalBytes : m), 0);
  return (
    <div className="admin-monitor-bars" role="img" aria-label="本次返回的用量采样柱">
      {points.map((p, i) => {
        const v = p.totalBytes;
        const nullish = v == null;
        const h = nullish || max <= 0 ? 0 : Math.round((Math.max(0, v) / max) * 48);
        return (
          <span
            key={`${i}:${p.at ?? "na"}`}
            className={nullish ? "admin-monitor-bar admin-monitor-bar-null" : "admin-monitor-bar"}
            style={nullish ? undefined : { height: h }}
          />
        );
      })}
    </div>
  );
}

export function AdminMonitorWorkspace({
  pageId,
  createClient,
  children,
  formatPageHref = formatAdminProductionBaselinePreviewHash,
}: {
  pageId: AdminProductionBaselinePageId;
  createClient?: () => MonitorClient;
  children?: ReactNode;
  formatPageHref?: (pageId: AdminProductionBaselinePageId) => string;
}) {
  const mon = useAdminMonitor(createClient);
  const { connected, intervalSeconds, setIntervalSeconds, sources, query, fixedRange, start, stop, refresh, retry, applyQuery } =
    mon;
  const [preset, setPreset] = useState<"24h" | "7d" | "custom">("24h");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [bucket, setBucket] = useState<"hour" | "day">(query.bucket === "day" ? "day" : "hour");
  const [nodeRef, setNodeRef] = useState(query.nodeId ?? "");
  const [rangeHint, setRangeHint] = useState("");
  const [searchMap, setSearchMap] = useState<Record<string, string>>({});
  const [statusMap, setStatusMap] = useState<Record<string, string>>({});
  const [pageMap, setPageMap] = useState<Record<string, number>>({});

  const space =
    pageId === "userManagement"
      ? "accounts"
      : pageId === "portalRequests"
        ? "entitlements"
        : pageId === "usageMonitor"
          ? "usage"
          : pageId === "nodeBandwidth"
            ? "bandwidth"
            : pageId === "nodeHealth" || pageId === "nodeLogs"
              ? "collectors"
              : pageId;
  const search = searchMap[space] ?? "";
  const statusSel = statusMap[space] ?? "";
  const pageNo = pageMap[space] ?? 1;
  const setSearch = (v: string) => {
    setSearchMap((m) => ({ ...m, [space]: v }));
    setPageMap((m) => ({ ...m, [space]: 1 }));
  };
  const setStatus = (v: string) => {
    setStatusMap((m) => ({ ...m, [space]: v }));
    setPageMap((m) => ({ ...m, [space]: 1 }));
  };
  const setPage = (n: number) => setPageMap((m) => ({ ...m, [space]: n }));

  const accounts = Array.isArray(sources.accounts.data) ? sources.accounts.data : [];
  const entitlements = Array.isArray(sources.entitlements.data) ? sources.entitlements.data : [];
  const usage = sources.usage.data;
  const items = usage?.items ?? [];
  const points = usage?.points ?? [];
  const colWrap = sources.collectors.data;
  const collectors = colWrap?.collectors ?? [];
  const joinOn = sources.accounts.phase === "ready";
  const accountMap = useMemo(() => {
    const m = new Map<string, MonitorAccount>();
    if (!joinOn) return m;
    for (const a of accounts) if (a.id) m.set(a.id, a);
    return m;
  }, [accounts, joinOn]);

  const sliceOf = (key: SourceKey): Slice<unknown> =>
    key === "accounts"
      ? sources.accounts
      : key === "entitlements"
        ? sources.entitlements
        : key === "usage"
          ? sources.usage
          : sources.collectors;

  function applyRange() {
    if (nodeRef !== "") {
      if (/[\s,]/.test(nodeRef) || /:\/\//.test(nodeRef) || !/^[A-Za-z0-9._:-]{1,128}$/.test(nodeRef.trim())) {
        setRangeHint("节点范围无效：不可含空格、逗号或 URL，仅允许字母、数字与 . _ : -，最长 128 字符。");
        return;
      }
    }
    let from: Date | null;
    let to: Date | null;
    if (preset === "custom") {
      from = isoLocal(customFrom);
      to = isoLocal(customTo);
    } else {
      to = new Date();
      from = new Date(to.getTime() - (preset === "7d" ? 7 : 1) * 86400000);
    }
    const span = from && to ? to.getTime() - from.getTime() : NaN;
    if (!from || !to || span <= 0 || span > RANGE_MS) {
      setRangeHint("时间范围无效：开始时间须早于结束时间，且不超过 31 天。");
      return;
    }
    setRangeHint("");
    const next: MonitorQuery = { from: from.toISOString(), to: to.toISOString(), bucket };
    const id = nodeRef.trim();
    if (id) next.nodeId = id;
    setPageMap((m) => ({ ...m, [`${space}:history`]: 1 }));
    applyQuery(next, preset === "custom");
  }

  function filterBar(options: string[]) {
    const opts = statusSel && !options.includes(statusSel) ? [...options, statusSel] : options;
    return (
      <div className="admin-monitor-filters">
        <label className="admin-monitor-filter-keyword">
          <span>名称或关键词</span>
          <input
            aria-label="筛选当前结果"
            placeholder="输入名称或关键词"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
        <label className="admin-monitor-filter-status">
          <span>状态</span>
          <select aria-label="状态筛选" value={statusSel} onChange={(e) => setStatus(e.target.value)}>
            <option value="">全部</option>
            {opts.map((s) => (
              <option key={s} value={s}>
                {st(s)}
              </option>
            ))}
          </select>
        </label>
      </div>
    );
  }

  function paged<T>(rows: T[]): { rows: T[]; page: number; pages: number } {
    const pages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
    const page = Math.min(Math.max(1, pageNo), pages);
    return { rows: rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE), page, pages };
  }

  function historyBlock() {
    const histSpace = `${space}:history`;
    const histPageNo = pageMap[histSpace] ?? 1;
    const ready = sources.usage.phase === "ready";
    const err = sources.usage.phase === "error";
    const histPages = Math.max(1, Math.ceil(points.length / PAGE_SIZE));
    const histPage = Math.min(Math.max(1, histPageNo), histPages);
    const pagePoints = ready ? points.slice((histPage - 1) * PAGE_SIZE, histPage * PAGE_SIZE) : [];
    return (
      <div className="admin-monitor-history">
        <h3>历史流量</h3>
        <div className="admin-monitor-history-controls">
          <label>
            时间范围
            <select value={preset} onChange={(e) => setPreset(e.target.value as "24h" | "7d" | "custom")}>
              <option value="24h">近24小时</option>
              <option value="7d">近7天</option>
              <option value="custom">自定义</option>
            </select>
          </label>
          {preset === "custom" ? (
            <>
              <label>
                开始时间
                <input type="datetime-local" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} />
              </label>
              <label>
                结束时间
                <input type="datetime-local" value={customTo} onChange={(e) => setCustomTo(e.target.value)} />
              </label>
            </>
          ) : null}
          <label>
            粒度
            <select value={bucket} onChange={(e) => setBucket(e.target.value === "day" ? "day" : "hour")}>
              <option value="hour">按小时</option>
              <option value="day">按天</option>
            </select>
          </label>
          <label>
            匹配节点的资源范围
            <input value={nodeRef} onChange={(e) => setNodeRef(e.target.value)} />
          </label>
          <button type="button" className="admin-monitor-btn-primary" onClick={applyRange}>
            应用时间范围
          </button>
        </div>
        {rangeHint ? (
          <p className="admin-monitor-hint" role="alert">
            {rangeHint}
          </p>
        ) : null}
        <p className="admin-monitor-hint">
          历史窗口仅用于对照采样，不改写当前资源行。匹配节点的资源范围可能包含其他通道。
        </p>
        <p className="admin-monitor-hint">
          {fixedRange ? "已固定时间范围，自动窗口滚动已停止。" : ""}
          {`已应用范围 ${fmtTime(query.from ?? null)} ~ ${fmtTime(query.to ?? null)} · 粒度 ${query.bucket === "day" ? "按天" : query.bucket === "hour" ? "按小时" : "—"} · 节点 ${query.nodeId || "未指定"}`}
          {usage?.generatedAt ? ` · 响应生成时间 ${fmtTime(usage.generatedAt)}` : ""}
        </p>
        {err ? (
          <p className="admin-monitor-notice admin-monitor-notice-error">用量来源不可用</p>
        ) : ready && points.length ? (
          <>
            <p className="admin-monitor-hint">当前页采样（GiB）</p>
            <PointBars points={pagePoints} />
            <DataTable
              columns={["时间", "上行 GiB", "下行 GiB", "合计 GiB"]}
              rowKeys={pagePoints.map((p, i) => `${(histPage - 1) * PAGE_SIZE + i}:${p.at ?? "na"}`)}
              cells={pagePoints.map((p) => [fmtTime(p.at), fmtGib(p.uploadBytes), fmtGib(p.downloadBytes), fmtGib(p.totalBytes)])}
              empty="无匹配记录"
            />
            <Pager page={histPage} pages={histPages} onPage={(n) => setPageMap((m) => ({ ...m, [histSpace]: n }))} />
          </>
        ) : (
          <p className="admin-monitor-notice">{listEmpty(sources.usage.phase, points.length, points.length, "用量来源不可用")}</p>
        )}
      </div>
    );
  }

  function body() {
    if (FALLBACK.has(pageId)) {
      return (
        <>
          <p className="admin-monitor-notice">此页尚未接入只读监控（订单 / 访问日志 / 操作日志），以下仅为布局基线。</p>
          {children}
        </>
      );
    }
    if (pageId === "dashboard") {
      const card = (title: string, href: string, slice: Slice<unknown>, count: number, extra: string) => {
        const ready = slice.phase === "ready" && slice.data != null;
        return (
          <a className="admin-monitor-card" href={href}>
            <h3>{title}</h3>
            <p className="admin-monitor-card-value">{ready ? count : "—"}</p>
            <p className="admin-monitor-card-caption">{ready ? "本次返回记录" : "尚无可用摘要"}</p>
            {extra ? <p className="admin-monitor-card-extra">{extra}</p> : null}
          </a>
        );
      };
      const colState = colWrap?.state ? st(colWrap.state) : "无返回记录";
      const colObs = colWrap?.observedAt ? fmtTime(colWrap.observedAt) : "尚无采样";
      const colFresh = sources.collectors.phase === "error" ? "非最新" : `观测时间 ${colObs}${colWrap?.observedAt && aged(colWrap.observedAt) ? " · 观测已过期" : ""}`;
      return (
        <>
          <div className="admin-monitor-cards">
            {card("账户", formatPageHref("userManagement"), sources.accounts, accounts.length, fetchLabel(sources.accounts))}
            {card("权益", formatPageHref("portalRequests"), sources.entitlements, entitlements.length, fetchLabel(sources.entitlements))}
            {card("用量", formatPageHref("usageMonitor"), sources.usage, items.length, fetchLabel(sources.usage))}
            {card("采集器", formatPageHref("nodeHealth"), sources.collectors, collectors.length, `快照${colState} · ${colFresh} · ${fetchLabel(sources.collectors)}`)}
          </div>
          {children}
        </>
      );
    }
    if (pageId === "userManagement") {
      if (sources.accounts.phase === "error") return <p className="admin-monitor-notice admin-monitor-notice-error">账户来源不可用</p>;
      const entFail = sources.entitlements.phase === "error";
      const opts = [...new Set(accounts.map((a) => a.status).filter(Boolean))];
      const filtered = accounts.filter(
        (a) => (!statusSel || a.status === statusSel) && hit(search, [a.id, a.status, st(a.status)]),
      );
      const pg = paged(filtered);
      const countText = (n: number | null) => (entFail ? "权益来源不可用" : n == null ? "—" : String(n));
      return (
        <>
          {filterBar(opts)}
          <DataTable
            columns={["账户", "状态", "权益数", "可用权益", "详情"]}
            rowKeys={pg.rows.map((a, i) => `${i}:${a.id}`)}
            cells={pg.rows.map((a) => [
              a.id,
              <StatusBadge value={a.status} />,
              countText(a.entitlementCount),
              countText(a.usableEntitlementCount),
              <SafeDetails
                rows={[
                  ["账户", a.id],
                  ["状态", st(a.status)],
                  ["权益数", countText(a.entitlementCount)],
                  ["可用权益", countText(a.usableEntitlementCount)],
                ]}
              />,
            ])}
            empty={listEmpty(sources.accounts.phase, accounts.length, filtered.length, "账户来源不可用")}
          />
          <Pager page={pg.page} pages={pg.pages} onPage={setPage} />
        </>
      );
    }
    if (pageId === "portalRequests") {
      if (sources.entitlements.phase === "error") return <p className="admin-monitor-notice admin-monitor-notice-error">权益来源不可用</p>;
      const opts = [...new Set(entitlements.map((e) => e.status).filter(Boolean))];
      const filtered = entitlements.filter((e) => {
        const acc = accountRef(e.accountId, accountMap, joinOn);
        return (!statusSel || e.status === statusSel) && hit(search, [e.id, e.accountId, acc, e.plan, e.status, st(e.status)]);
      });
      const pg = paged(filtered);
      return (
        <>
          {filterBar(opts)}
          <DataTable
            columns={["账户", "套餐", "状态", "到期", "可用", "详情"]}
            rowKeys={pg.rows.map((e, i) => `${i}:${e.id}:${e.accountId || "none"}`)}
            cells={pg.rows.map((e) => {
              const acc = accountRef(e.accountId, accountMap, joinOn);
              const usable = e.usable == null ? "—" : e.usable ? "可用" : "不可用";
              return [
                acc,
                e.plan || "—",
                <StatusBadge value={e.status} />,
                fmtTime(e.validUntil),
                usable,
                <SafeDetails
                  rows={[
                    ["权益", e.id],
                    ["账户", acc],
                    ["套餐", e.plan || "—"],
                    ["状态", st(e.status)],
                    ["到期", fmtTime(e.validUntil)],
                    ["可用", usable],
                  ]}
                />,
              ];
            })}
            empty={listEmpty(sources.entitlements.phase, entitlements.length, filtered.length, "权益来源不可用")}
          />
          <Pager page={pg.page} pages={pg.pages} onPage={setPage} />
        </>
      );
    }
    if (pageId === "usageMonitor") {
      const opts = [...new Set(items.map((r) => r.status).filter(Boolean))];
      const filtered = items.filter((r) => {
        const acc = accountRef(r.accountId, accountMap, joinOn);
        return (!statusSel || r.status === statusSel) && hit(search, [r.accountId, r.entitlementId, acc, r.plan, r.status, st(r.status)]);
      });
      const pg = paged(filtered);
      return (
        <>
          {filterBar(opts)}
          <DataTable
            columns={["账户", "套餐", "已记录用量 GiB", "观测时间", "状态", "详情"]}
            rowKeys={pg.rows.map((r, i) => `${i}:${r.accountId}:${r.entitlementId || "none"}`)}
            cells={pg.rows.map((r: MonitorUsageRow) => {
              const acc = accountRef(r.accountId, accountMap, joinOn);
              const when = r.observedAt ? fmtTime(r.observedAt) : "尚无采样";
              return [
                acc,
                r.plan || "—",
                fmtGib(r.usedBytes),
                when === "—" ? "尚无采样" : when,
                <StatusBadge value={r.status} />,
                <SafeDetails
                  rows={[
                    ["账户", acc],
                    ["套餐", r.plan || "—"],
                    ["已记录用量 GiB", fmtGib(r.usedBytes)],
                    ["观测时间", r.observedAt ? fmtTime(r.observedAt) : "尚无采样"],
                    ["状态", st(r.status)],
                  ]}
                />,
              ];
            })}
            empty={listEmpty(sources.usage.phase, items.length, filtered.length, "用量来源不可用")}
          />
          <Pager page={pg.page} pages={pg.pages} onPage={setPage} />
          {historyBlock()}
        </>
      );
    }
    if (pageId === "nodeBandwidth") return historyBlock();
    const opts = [...new Set(collectors.map((c) => c.state).filter(Boolean))];
    const filtered = collectors.filter(
      (c) =>
        (!statusSel || c.state === statusSel) &&
        hit(search, [c.name, c.state, st(c.state), ...(c.reasons ?? []).flatMap((r) => [r, reasonOf(r)])]),
    );
    const pg = paged(filtered);
    return (
      <>
        <p className="admin-monitor-notice">
          {pageId === "nodeLogs"
            ? "采集诊断摘要，不是原始运行日志"
            : "此处仅展示采集器观测，不代表节点全部服务健康"}
        </p>
        <p className="admin-monitor-notice">
          快照{colWrap?.state ? st(colWrap.state) : "无返回记录"} · 观测时间 {colWrap?.observedAt ? fmtTime(colWrap.observedAt) : "尚无采样"}
          {colWrap?.observedAt && aged(colWrap.observedAt) ? " · 观测已过期" : ""}
        </p>
        {filterBar(opts)}
        <DataTable
          columns={["名称", "状态", "观测时间", "时效", "诊断"]}
          rowKeys={pg.rows.map((c, i) => `${i}:${c.name}`)}
          cells={pg.rows.map((c: MonitorCollector) => {
            const fresh =
              sources.collectors.phase === "error"
                ? "非最新"
                : !c.observedAt
                  ? "无观测时间"
                  : aged(c.observedAt)
                    ? "观测已过期"
                    : "观测未过期";
            const reasons = (c.reasons ?? []).map(reasonOf).join("、") || "—";
            return [c.name, <StatusBadge value={c.state} />, c.observedAt ? fmtTime(c.observedAt) : "尚无采样", fresh, reasons];
          })}
          empty={listEmpty(sources.collectors.phase, collectors.length, filtered.length, "采集器来源不可用")}
        />
        <Pager page={pg.page} pages={pg.pages} onPage={setPage} />
      </>
    );
  }

  const intervals = [0, 10, 30, 60].includes(intervalSeconds) ? [0, 10, 30, 60] : [0, 10, 30, 60, intervalSeconds];

  return (
    <div className="admin-monitor">
      <div className="admin-monitor-toolbar">
        <div className="admin-monitor-toolbar-actions">
          {connected ? (
            <button type="button" className="admin-monitor-btn-primary" onClick={stop}>
              停止监控
            </button>
          ) : (
            <button type="button" className="admin-monitor-btn-primary" onClick={start}>
              开始只读监控
            </button>
          )}
          {connected ? (
            <button type="button" onClick={refresh}>
              更新数据
            </button>
          ) : null}
        </div>
        <label className="admin-monitor-toolbar-refresh">
          自动更新
          <select
            aria-label="自动更新"
            value={String(intervalSeconds)}
            onChange={(e) => setIntervalSeconds(Number(e.target.value))}
          >
            {intervals.map((n) => (
              <option key={n} value={n}>
                {n === 0 ? "暂停" : `${n}秒`}
              </option>
            ))}
          </select>
        </label>
        <div className="admin-monitor-toolbar-meta">
          <span>时区：{TZ}</span>
          <span>筛选和分页仅针对本次返回记录</span>
        </div>
      </div>
      <div className="admin-monitor-sources admin-monitor-source-strip">
        {SOURCES.map((s) => {
          const slice = sliceOf(s.key);
          const fresh = fetchLabel(slice);
          return (
            <div key={s.key} className="admin-monitor-source" aria-label={s.label} data-phase={slice.phase}>
              <span className="admin-monitor-source-name">{s.label}</span>
              <span className="admin-monitor-source-phase">{PH[slice.phase]}</span>
              {fresh ? <span className="admin-monitor-source-fresh">{fresh}</span> : null}
              {slice.phase === "error" && slice.error ? <span className="admin-monitor-source-error">{ERR[slice.error]}</span> : null}
              {slice.phase === "error" ? (
                <button type="button" onClick={() => retry(s.key)}>
                  {s.retry}
                </button>
              ) : null}
            </div>
          );
        })}
      </div>
      <div className="admin-monitor-main">{body()}</div>
    </div>
  );
}
