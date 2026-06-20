import { useEffect, useMemo, useState, type FormEvent } from "react";
import type { AdminApiClient } from "../features/subscriptions/api-client";
import type {
  PortalAccessApprovalPreview,
  PortalAccessRequestStatus,
  PortalAccessRequestSummary
} from "../features/subscriptions/types";
import {
  buildPortalRequestCaseCandidates,
  topCaseCandidates
} from "../features/admin-case-workbench/case-candidates";
import {
  CaseDetailPanel,
  CaseQueue
} from "../features/admin-case-workbench/case-workbench";
import { errorMessage } from "../lib/errors";

type StatusFilter = "all" | PortalAccessRequestStatus;
type StatusSummary = {
  total: number;
  pending: number;
  pendingDelivery: number;
  delivered: number;
  rejected: number;
};

const STATUS_FILTERS: Array<{ value: StatusFilter; label: string }> = [
  { value: "all", label: "全部状态" },
  { value: "pending_admin_review", label: "待处理" },
  { value: "approved_pending_delivery", label: "待发放" },
  { value: "delivered", label: "已发放" },
  { value: "rejected", label: "已拒绝" },
  { value: "cancelled", label: "已取消" },
  { value: "expired", label: "已过期" },
  { value: "revoked", label: "已撤销" }
];

const STATUS_LABELS: Record<PortalAccessRequestStatus, string> = {
  pending_admin_review: "待处理",
  approved_pending_delivery: "待发放",
  delivered: "已发放",
  rejected: "已拒绝",
  cancelled: "已取消",
  expired: "已过期",
  revoked: "已撤销"
};

const NEXT_ACTION_LABELS: Record<PortalAccessRequestStatus, string> = {
  pending_admin_review: "处理申请",
  approved_pending_delivery: "执行发放",
  delivered: "监管资源",
  rejected: "无需处理",
  cancelled: "无需处理",
  expired: "复核过期",
  revoked: "查看撤销"
};

const DELIVERY_CHANNEL_OPTIONS = [
  { value: "stable-node-a", label: "默认资源通道" }
];
const BYTES_PER_GB = 1024 * 1024 * 1024;

type AccountSupervisionRow = {
  portalUserRef: string;
  resourceCount: number;
  pendingCount: number;
  deliveredCount: number;
  quotaRisk: string;
  lastUpdatedAt: string | null;
};

function countStatus(items: PortalAccessRequestSummary[], status: PortalAccessRequestStatus) {
  return items.filter((item) => item.status === status).length;
}

function safeValue(value: string | number | null | undefined) {
  if (value === null || value === undefined || value === "") {
    return "未记录";
  }
  return value;
}

function statusLabel(status: string) {
  return STATUS_LABELS[status as PortalAccessRequestStatus] ?? "未知状态";
}

function nextActionLabel(status: string) {
  return NEXT_ACTION_LABELS[status as PortalAccessRequestStatus] ?? "人工复核";
}

function durationLabel(days: number) {
  return `${days} 天`;
}

function formatTrafficBytes(bytes: number | null | undefined) {
  const safeBytes = Number.isFinite(bytes) && Number(bytes) > 0 ? Number(bytes) : 0;
  if (safeBytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = safeBytes;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  const formatted = unitIndex === 0 || value >= 10
    ? Math.round(value).toString()
    : value.toFixed(1).replace(/\.0$/, "");
  return `${formatted} ${units[unitIndex]}`;
}

function formatTrafficLimitBytes(bytes: number | null | undefined) {
  const safeBytes = Number.isFinite(bytes) && Number(bytes) > 0 ? Number(bytes) : 0;
  return safeBytes > 0 ? formatTrafficBytes(safeBytes) : "不限量";
}

function trafficLimitBytesForRequest(request: PortalAccessRequestSummary | null) {
  if (!request) return 0;
  return request.trafficLimitBytes ?? request.usage?.totalBytes ?? 0;
}

function trafficLimitSourceLabel(request: PortalAccessRequestSummary) {
  if (Number.isFinite(request.trafficLimitBytes) && Number(request.trafficLimitBytes) > 0) {
    return "订单覆盖";
  }
  if (Number.isFinite(request.usage?.totalBytes) && Number(request.usage?.totalBytes) > 0) {
    return "采集默认";
  }
  return "未设置";
}

function usageTotalLabel(request: PortalAccessRequestSummary) {
  if (!request.usage) return "未采集";
  return `${formatTrafficBytes(request.usage.usedBytes)} / ${formatTrafficLimitBytes(trafficLimitBytesForRequest(request))}`;
}

function usageCoverageLabel(request: PortalAccessRequestSummary) {
  const usage = request.usage;
  if (!usage) return "未采集";
  return `已计量 ${usage.measuredChannelCount}/${usage.channelCount} 通道`;
}

function usageStatusLabel(request: PortalAccessRequestSummary) {
  const usage = request.usage;
  if (!usage) return "未采集";
  if (usage.status === "over_limit") return "超额";
  if (usage.status === "within_limit") return "正常";
  if (usage.status === "unmetered") return "未限额";
  return "需复核";
}

function collectionStatusLabel(request: PortalAccessRequestSummary) {
  const status = request.usage?.collectionStatus;
  if (!status) return "未采集";
  const labels: Record<string, string> = {
    measured: "采集正常",
    measured_zero: "零用量",
    stale: "延迟",
    not_collected: "未采集",
    collector_disabled: "采集关闭"
  };
  return labels[status] ?? "需复核";
}

function accountLifecycleLabel() {
  return "待接入账号状态";
}

function resourceCountLabel(count: number) {
  return `${count} 个资源`;
}

function accountQuotaRiskLabel(items: PortalAccessRequestSummary[]) {
  if (items.some((item) => item.usage?.status === "over_limit")) return "存在超额";
  if (items.some((item) => ["stale", "not_collected", "collector_disabled"].includes(item.usage?.collectionStatus ?? ""))) {
    return "采集异常";
  }
  return "正常";
}

function buildAccountRows(items: PortalAccessRequestSummary[]): AccountSupervisionRow[] {
  const rows = new Map<string, PortalAccessRequestSummary[]>();
  for (const item of items) {
    const current = rows.get(item.portalUserRef) ?? [];
    current.push(item);
    rows.set(item.portalUserRef, current);
  }
  return Array.from(rows.entries()).map(([portalUserRef, accountItems]) => ({
    portalUserRef,
    resourceCount: accountItems.length,
    pendingCount: accountItems.filter((item) => (
      item.status === "pending_admin_review" || item.status === "approved_pending_delivery"
    )).length,
    deliveredCount: accountItems.filter((item) => item.status === "delivered").length,
    quotaRisk: accountQuotaRiskLabel(accountItems),
    lastUpdatedAt: accountItems.reduce<string | null>((latest, item) => {
      if (!latest) return item.updatedAt;
      return new Date(item.updatedAt).getTime() > new Date(latest).getTime() ? item.updatedAt : latest;
    }, null)
  }));
}

function quotaInputValue(bytes: number | null | undefined) {
  const safeBytes = Number.isFinite(bytes) && Number(bytes) > 0 ? Number(bytes) : 0;
  if (safeBytes === 0) return "0";
  const gb = safeBytes / BYTES_PER_GB;
  return Number.isInteger(gb) ? String(gb) : gb.toFixed(2).replace(/\.?0+$/, "");
}

function deliveryRecordLabel(value: string | null | undefined) {
  return value ? "已有记录" : "未生成";
}

function auditRecordLabel(value: string | null | undefined) {
  return value ? "已记录" : "未记录";
}

function reasonLabel(value: string | null | undefined) {
  if (!value) return "未记录";
  const normalized = value.trim().toLowerCase();
  const labels: Record<string, string> = {
    approved: "已通过",
    rejected: "已拒绝",
    trial_already_used: "试用已使用",
    admin_review_required: "需要处理"
  };
  return labels[normalized] ?? "已记录";
}

function trialStateLabel(value: string | null | undefined) {
  if (!value) return "未记录";
  const normalized = value.trim().toLowerCase();
  const labels: Record<string, string> = {
    unused: "未使用",
    used: "已使用",
    consumed: "已使用",
    unknown: "未记录"
  };
  return labels[normalized] ?? "已记录";
}

function deliveryChannelLabel(value: string | number | null | undefined) {
  const normalized = String(value ?? "").trim();
  return DELIVERY_CHANNEL_OPTIONS.find((option) => option.value === normalized)?.label ?? "已选择通道";
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return "未记录";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "未记录";
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
}

function previewField(preview: PortalAccessApprovalPreview, key: string) {
  const value = preview.issuanceInput[key];
  return typeof value === "string" || typeof value === "number" ? value : "未记录";
}

type TrafficLimitFormState = {
  limitGb: string;
  reviewedByRef: string;
  reasonCode: string;
  message: string;
  pending: boolean;
  setLimitGb: (value: string) => void;
  setReviewedByRef: (value: string) => void;
  setReasonCode: (value: string) => void;
  submit: (event: FormEvent<HTMLFormElement>) => Promise<void>;
};

function useTrafficLimitForm({
  apiClient,
  selectedRequest,
  onRequestUpdated,
  onError
}: {
  apiClient: AdminApiClient;
  selectedRequest: PortalAccessRequestSummary | null;
  onRequestUpdated: (request: PortalAccessRequestSummary) => void;
  onError: (message: string) => void;
}): TrafficLimitFormState {
  const [limitGb, setLimitGb] = useState("0");
  const [reviewedByRef, setReviewedByRef] = useState("");
  const [reasonCode, setReasonCode] = useState("plan_change");
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);

  useEffect(() => {
    setLimitGb(quotaInputValue(trafficLimitBytesForRequest(selectedRequest)));
    setMessage("");
  }, [selectedRequest?.id, selectedRequest?.trafficLimitBytes, selectedRequest?.usage?.totalBytes]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedRequest) return;
    const parsedGb = Number(limitGb);
    if (!Number.isFinite(parsedGb) || parsedGb < 0) {
      onError("额度必须是非负数字。");
      return;
    }
    setPending(true);
    onError("");
    setMessage("");
    try {
      const trafficLimitBytes = Math.round(parsedGb * BYTES_PER_GB);
      const update = await apiClient.updatePortalAccessRequestTrafficLimit(selectedRequest.id, {
        trafficLimitBytes,
        reviewedByRef: reviewedByRef.trim(),
        reasonCode: reasonCode.trim()
      });
      onRequestUpdated({
        ...selectedRequest,
        ...update.request,
        id: selectedRequest.id
      });
      setLimitGb(quotaInputValue(update.quota.trafficLimitBytes));
      setMessage("额度已更新");
    } catch (requestError) {
      onError(errorMessage(requestError, "额度更新失败。"));
    } finally {
      setPending(false);
    }
  }

  return {
    limitGb,
    reviewedByRef,
    reasonCode,
    message,
    pending,
    setLimitGb,
    setReviewedByRef,
    setReasonCode,
    submit
  };
}

function TrafficLimitSection({
  request,
  form
}: {
  request: PortalAccessRequestSummary;
  form: TrafficLimitFormState;
}) {
  return (
    <section className="gate-review-card" aria-label="流量额度">
      <div>
        <h3>流量额度</h3>
        <p className="muted">额度调整只更新控制面记录；超额、延迟和零用量由用量采集事实驱动。</p>
      </div>
      <div className="metric-grid">
        <div className="metric-card">
          <span>额度来源</span>
          <strong>{trafficLimitSourceLabel(request)}</strong>
        </div>
        <div className="metric-card">
          <span>当前额度</span>
          <strong>{formatTrafficLimitBytes(trafficLimitBytesForRequest(request))}</strong>
        </div>
        <div className="metric-card">
          <span>已用/总量</span>
          <strong>{usageTotalLabel(request)}</strong>
        </div>
        <div className="metric-card">
          <span>采集覆盖</span>
          <strong>{usageCoverageLabel(request)}</strong>
        </div>
      </div>
      <div className="warning-chip-list" aria-label="额度状态">
        <span className="warning-chip">{usageStatusLabel(request)}</span>
        <span className="warning-chip">{collectionStatusLabel(request)}</span>
        <span className="warning-chip">采集时间 {formatDateTime(request.usage?.updatedAt)}</span>
      </div>
      {form.message ? <div className="alert">{form.message}</div> : null}
      <form className="form-stack" onSubmit={form.submit}>
        <label>
          <span>额度 GB</span>
          <input
            type="number"
            min="0"
            step="0.1"
            value={form.limitGb}
            onChange={(event) => form.setLimitGb(event.target.value)}
            required
          />
        </label>
        <label>
          <span>额度操作员</span>
          <input
            value={form.reviewedByRef}
            onChange={(event) => form.setReviewedByRef(event.target.value)}
            placeholder="operator_safe_ref"
            required
          />
        </label>
        <label>
          <span>原因代码</span>
          <input
            value={form.reasonCode}
            onChange={(event) => form.setReasonCode(event.target.value)}
            placeholder="plan_change"
            required
          />
        </label>
        <button className="primary-button" type="submit" disabled={form.pending}>
          {form.pending ? "保存中" : "保存额度"}
        </button>
      </form>
    </section>
  );
}

function OrderOverviewSection({
  statusFilter,
  statusSummary,
  onStatusFilterChange
}: {
  statusFilter: StatusFilter;
  statusSummary: StatusSummary;
  onStatusFilterChange: (value: StatusFilter) => void;
}) {
  return (
    <section className="gate-review-card" aria-label="监管概览">
      <div className="page-heading">
        <div>
          <h3>监管概览</h3>
          <p className="muted">按用户账号汇总访问资源状态，只做监管和异常处置。</p>
        </div>
        <label className="inline-filter">
          <span>状态筛选</span>
          <select value={statusFilter} onChange={(event) => onStatusFilterChange(event.target.value as StatusFilter)}>
            {STATUS_FILTERS.map((filter) => (
              <option key={filter.value} value={filter.value}>{filter.label}</option>
            ))}
          </select>
        </label>
      </div>
      <div className="metric-grid">
        <div className="metric-card">
          <span>全部资源订单</span>
          <strong>{statusSummary.total}</strong>
        </div>
        <div className="metric-card">
          <span>待处理</span>
          <strong>{statusSummary.pending}</strong>
        </div>
        <div className="metric-card">
          <span>待发放</span>
          <strong>{statusSummary.pendingDelivery}</strong>
        </div>
        <div className="metric-card">
          <span>已发放</span>
          <strong>{statusSummary.delivered}</strong>
        </div>
        <div className="metric-card">
          <span>已拒绝</span>
          <strong>{statusSummary.rejected}</strong>
        </div>
      </div>
    </section>
  );
}

function AccountSupervisionSection({
  rows
}: {
  rows: AccountSupervisionRow[];
}) {
  return (
    <section className="gate-review-card" aria-label="用户账号监管">
      <div>
        <h3>用户账号监管</h3>
        <p className="muted">账号创建、启用和禁用属于后端账号模型；这里先按账号汇总资源与额度风险。</p>
      </div>
      {rows.length === 0 ? (
        <div className="alert">当前没有可监管的用户账号。</div>
      ) : null}
      <div className="table-wrapper">
        <table>
          <thead>
            <tr>
              <th>用户账号</th>
              <th>账号生命周期</th>
              <th>资源订单</th>
              <th>待处理资源</th>
              <th>已发放资源</th>
              <th>额度风险</th>
              <th>最近更新</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.portalUserRef}>
                <td>{row.portalUserRef}</td>
                <td>{accountLifecycleLabel()}</td>
                <td>{resourceCountLabel(row.resourceCount)}</td>
                <td>{row.pendingCount}</td>
                <td>{row.deliveredCount}</td>
                <td>{row.quotaRisk}</td>
                <td>{formatDateTime(row.lastUpdatedAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function OrderListSection({
  items,
  onSelect
}: {
  items: PortalAccessRequestSummary[];
  onSelect: (requestId: string) => void;
}) {
  return (
    <section className="gate-review-card" aria-label="用户资源列表">
      <div>
        <h3>用户资源列表</h3>
        <p className="muted">按用户账号查看访问资源，选择一行后复核权益、订阅产物和用量状态。</p>
      </div>
      {items.length === 0 ? (
        <div className="alert">当前状态下没有匹配的用户资源。</div>
      ) : null}
      <div className="table-wrapper">
        <table>
          <thead>
            <tr>
              <th>资源/订单编号</th>
              <th>用户账号</th>
              <th>资源方案</th>
              <th>资源/订单生命周期</th>
              <th>流量额度</th>
              <th>采集状态</th>
              <th>有效期</th>
              <th>监管动作</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id}>
                <td>
                  <button className="link-button" type="button" onClick={() => onSelect(item.id)}>
                    {item.id}
                  </button>
                </td>
                <td>{item.portalUserRef}</td>
                <td>{item.planLabel}</td>
                <td>{statusLabel(item.status)}</td>
                <td>{formatTrafficLimitBytes(trafficLimitBytesForRequest(item))}</td>
                <td>{collectionStatusLabel(item)}</td>
                <td>{durationLabel(item.durationDays)}</td>
                <td>{nextActionLabel(item.status)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function OrderDetailsSection({
  request,
  accountResourceCount
}: {
  request: PortalAccessRequestSummary;
  accountResourceCount: number;
}) {
  return (
    <section className="gate-review-card" aria-label="用户资源详情">
      <div>
        <h3>用户资源详情</h3>
        <p className="muted">展示账号、访问权益、订阅产物和监管状态，不展示客户联系方式、订阅链接或原始交付材料。</p>
      </div>
      <h4>账号生命周期</h4>
      <dl className="detail-grid">
        <div>
          <dt>用户账号</dt>
          <dd>{request.portalUserRef}</dd>
        </div>
        <div>
          <dt>账号状态</dt>
          <dd>{accountLifecycleLabel()}</dd>
        </div>
        <div>
          <dt>账号禁用</dt>
          <dd>待后端账号模型接入</dd>
        </div>
        <div>
          <dt>资源订单</dt>
          <dd>{resourceCountLabel(accountResourceCount)}</dd>
        </div>
        <div>
          <dt>试用记录</dt>
          <dd>{trialStateLabel(request.priorTrialState)}</dd>
        </div>
      </dl>

      <h4>资源/订单生命周期</h4>
      <dl className="detail-grid">
        <div>
          <dt>资源/订单编号</dt>
          <dd>{request.id}</dd>
        </div>
        <div>
          <dt>资源方案</dt>
          <dd>{request.planLabel}</dd>
        </div>
        <div>
          <dt>资源状态</dt>
          <dd>{statusLabel(request.status)}</dd>
        </div>
        <div>
          <dt>监管动作</dt>
          <dd>{nextActionLabel(request.status)}</dd>
        </div>
        <div>
          <dt>流量额度</dt>
          <dd>{formatTrafficLimitBytes(trafficLimitBytesForRequest(request))}</dd>
        </div>
        <div>
          <dt>已用/总量</dt>
          <dd>{usageTotalLabel(request)}</dd>
        </div>
        <div>
          <dt>采集覆盖</dt>
          <dd>{usageCoverageLabel(request)}</dd>
        </div>
        <div>
          <dt>审核人</dt>
          <dd>{auditRecordLabel(request.reviewedByRef)}</dd>
        </div>
        <div>
          <dt>原因</dt>
          <dd>{reasonLabel(request.safeReasonCode)}</dd>
        </div>
        <div>
          <dt>访问权益</dt>
          <dd>{deliveryRecordLabel(request.entitlementRef)}</dd>
        </div>
        <div>
          <dt>订阅产物</dt>
          <dd>{deliveryRecordLabel(request.accessGrantRef)}</dd>
        </div>
        <div>
          <dt>更新时间</dt>
          <dd>{formatDateTime(request.updatedAt)}</dd>
        </div>
      </dl>
    </section>
  );
}

function DeliveryPreviewSection({
  items,
  selectedRequest,
  approvalRef,
  reviewedByRef,
  nodeId,
  pending,
  onApprovalRefChange,
  onReviewedByRefChange,
  onNodeIdChange,
  onSelectedRequestChange,
  onSubmit
}: {
  items: PortalAccessRequestSummary[];
  selectedRequest: PortalAccessRequestSummary | null;
  approvalRef: string;
  reviewedByRef: string;
  nodeId: string;
  pending: boolean;
  onApprovalRefChange: (value: string) => void;
  onReviewedByRefChange: (value: string) => void;
  onNodeIdChange: (value: string) => void;
  onSelectedRequestChange: (value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => Promise<void>;
}) {
  return (
    <section className="gate-review-card" aria-label="受控发放预览">
      <div>
        <h3>受控发放预览</h3>
        <p className="muted">只生成安全预览，不创建孤立订阅、不修改运行环境。</p>
      </div>
      <form className="form-stack" onSubmit={onSubmit}>
        <label>
          <span>资源/订单编号</span>
          <select
            value={selectedRequest?.id ?? ""}
            onChange={(event) => onSelectedRequestChange(event.target.value)}
            required
          >
            {selectedRequest ? null : <option value="">未选择订单</option>}
            {items.map((item) => (
              <option key={item.id} value={item.id}>{item.id}</option>
            ))}
          </select>
        </label>
        <label>
          <span>审批编号</span>
          <input
            value={approvalRef}
            onChange={(event) => onApprovalRefChange(event.target.value)}
            placeholder="输入审批编号"
            required
          />
        </label>
        <label>
          <span>操作员</span>
          <input
            value={reviewedByRef}
            onChange={(event) => onReviewedByRefChange(event.target.value)}
            placeholder="输入操作员编号"
            required
          />
        </label>
        <label>
          <span>资源通道</span>
          <select value={nodeId} onChange={(event) => onNodeIdChange(event.target.value)} required>
            {DELIVERY_CHANNEL_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </label>
        <button className="primary-button" type="submit" disabled={pending || !selectedRequest}>
          {pending ? "生成中" : "生成发放预览"}
        </button>
      </form>
    </section>
  );
}

function PreviewResultSection({
  preview,
  selectedRequest
}: {
  preview: PortalAccessApprovalPreview;
  selectedRequest: PortalAccessRequestSummary | null;
}) {
  return (
    <section className="gate-review-card" aria-label="受控发放预览结果">
      <div>
        <h3>受控发放预览结果</h3>
        <p className="muted">预览结果用于管理员复核，真实资源发放仍需要受控执行路径。</p>
      </div>
      <div className="metric-grid">
        <div className="metric-card">
          <span>结果状态</span>
          <strong>{statusLabel(preview.status)}</strong>
        </div>
        <div className="metric-card">
          <span>审批编号</span>
          <strong>{auditRecordLabel(preview.approvalRef)}</strong>
        </div>
        <div className="metric-card">
          <span>资源方案</span>
          <strong>{selectedRequest?.planLabel ?? safeValue(previewField(preview, "plan"))}</strong>
        </div>
        <div className="metric-card">
          <span>资源通道</span>
          <strong>{deliveryChannelLabel(previewField(preview, "nodeId"))}</strong>
        </div>
      </div>
      <div className="alert">
        预览完成。真实资源发放仍需要通过受控执行路径完成。
      </div>
    </section>
  );
}

export function PortalRequestsPage({ apiClient }: { apiClient: AdminApiClient }) {
  const [items, setItems] = useState<PortalAccessRequestSummary[]>([]);
  const [selectedRef, setSelectedRef] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [approvalRef, setApprovalRef] = useState("");
  const [reviewedByRef, setReviewedByRef] = useState("");
  const [nodeId, setNodeId] = useState(DELIVERY_CHANNEL_OPTIONS[0]?.value ?? "");
  const [preview, setPreview] = useState<PortalAccessApprovalPreview | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [selectedCaseRef, setSelectedCaseRef] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void apiClient.listPortalAccessRequests()
      .then((requests) => {
        if (cancelled) return;
        setItems(requests);
        setSelectedRef(requests[0]?.id ?? "");
      })
      .catch((requestError) => {
        if (!cancelled) {
          setError(errorMessage(requestError, "订单加载失败。"));
        }
      });
    return () => {
      cancelled = true;
    };
  }, [apiClient]);

  const filteredItems = useMemo(() => {
    if (statusFilter === "all") {
      return items;
    }
    return items.filter((item) => item.status === statusFilter);
  }, [items, statusFilter]);

  const selectedRequest = useMemo(() => {
    return filteredItems.find((item) => item.id === selectedRef) ?? filteredItems[0] ?? null;
  }, [filteredItems, selectedRef]);

  const accountRows = useMemo(() => buildAccountRows(items), [items]);
  const caseCandidates = useMemo(() => buildPortalRequestCaseCandidates(items), [items]);
  const visibleCaseCandidates = useMemo(() => topCaseCandidates(caseCandidates, 6), [caseCandidates]);
  const selectedCase = useMemo(() => (
    visibleCaseCandidates.find((item) => item.caseRef === selectedCaseRef)
      ?? visibleCaseCandidates[0]
      ?? null
  ), [selectedCaseRef, visibleCaseCandidates]);

  useEffect(() => {
    if (visibleCaseCandidates.length === 0) {
      setSelectedCaseRef(null);
      return;
    }
    setSelectedCaseRef((current) => (
      current && visibleCaseCandidates.some((item) => item.caseRef === current)
        ? current
        : visibleCaseCandidates[0].caseRef
    ));
  }, [visibleCaseCandidates]);

  const selectedAccountResourceCount = useMemo(() => {
    if (!selectedRequest) return 0;
    return items.filter((item) => item.portalUserRef === selectedRequest.portalUserRef).length;
  }, [items, selectedRequest]);

  const statusSummary = useMemo(() => ({
    total: items.length,
    pending: countStatus(items, "pending_admin_review"),
    pendingDelivery: countStatus(items, "approved_pending_delivery"),
    delivered: countStatus(items, "delivered"),
    rejected: countStatus(items, "rejected")
  }), [items]);

  function updateRequest(updatedRequest: PortalAccessRequestSummary) {
    setItems((current) => current.map((item) => (
      item.id === updatedRequest.id
        ? { ...item, ...updatedRequest }
        : item
    )));
  }

  const trafficLimitForm = useTrafficLimitForm({
    apiClient,
    selectedRequest,
    onRequestUpdated: updateRequest,
    onError: setError
  });

  async function submitPreview(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedRequest) return;
    setPending(true);
    setError("");
    setPreview(null);
    try {
      setPreview(await apiClient.previewPortalAccessRequestApproval(selectedRequest.id, {
        approvalRef: approvalRef.trim(),
        reviewedByRef: reviewedByRef.trim(),
        nodeId: nodeId.trim()
      }));
    } catch (requestError) {
      setError(errorMessage(requestError, "发放预览失败。"));
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="page-stack">
      <div className="page-heading">
        <div>
          <h2>用户资源监管</h2>
          <p className="muted">按用户账号监管访问资源、用量和异常处置，不作为独立订阅创建入口。</p>
        </div>
      </div>

      {error ? <div className="alert alert-error">{error}</div> : null}

      <OrderOverviewSection
        statusFilter={statusFilter}
        statusSummary={statusSummary}
        onStatusFilterChange={setStatusFilter}
      />

      <div className="case-workbench-layout">
        <CaseQueue
          title="账号与资源监管案件"
          description="从账号、订单、额度和采集状态派生的只读监管候选。"
          cases={visibleCaseCandidates}
          selectedCaseRef={selectedCase?.caseRef ?? null}
          onSelect={setSelectedCaseRef}
        />
        <CaseDetailPanel caseItem={selectedCase} />
      </div>

      <AccountSupervisionSection rows={accountRows} />

      <OrderListSection items={filteredItems} onSelect={setSelectedRef} />

      {selectedRequest ? (
        <OrderDetailsSection request={selectedRequest} accountResourceCount={selectedAccountResourceCount} />
      ) : null}

      {selectedRequest?.entitlementRef ? (
        <TrafficLimitSection request={selectedRequest} form={trafficLimitForm} />
      ) : null}

      <DeliveryPreviewSection
        items={items}
        selectedRequest={selectedRequest}
        approvalRef={approvalRef}
        reviewedByRef={reviewedByRef}
        nodeId={nodeId}
        pending={pending}
        onApprovalRefChange={setApprovalRef}
        onReviewedByRefChange={setReviewedByRef}
        onNodeIdChange={setNodeId}
        onSelectedRequestChange={setSelectedRef}
        onSubmit={submitPreview}
      />

      {preview ? (
        <PreviewResultSection preview={preview} selectedRequest={selectedRequest} />
      ) : null}
    </div>
  );
}
