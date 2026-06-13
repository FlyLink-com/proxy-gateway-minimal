import { useEffect, useMemo, useState, type FormEvent } from "react";
import type { AdminApiClient } from "../features/subscriptions/api-client";
import type {
  PortalAccessApprovalPreview,
  PortalAccessRequestStatus,
  PortalAccessRequestSummary
} from "../features/subscriptions/types";
import { errorMessage } from "../lib/errors";

type StatusFilter = "all" | PortalAccessRequestStatus;

const STATUS_FILTERS: Array<{ value: StatusFilter; label: string }> = [
  { value: "all", label: "全部状态" },
  { value: "pending_admin_review", label: "待处理" },
  { value: "approved_pending_delivery", label: "待交付" },
  { value: "delivered", label: "已交付" },
  { value: "rejected", label: "已拒绝" },
  { value: "cancelled", label: "已取消" },
  { value: "expired", label: "已过期" },
  { value: "revoked", label: "已撤销" }
];

const STATUS_LABELS: Record<PortalAccessRequestStatus, string> = {
  pending_admin_review: "待处理",
  approved_pending_delivery: "待交付",
  delivered: "已交付",
  rejected: "已拒绝",
  cancelled: "已取消",
  expired: "已过期",
  revoked: "已撤销"
};

const NEXT_ACTION_LABELS: Record<PortalAccessRequestStatus, string> = {
  pending_admin_review: "处理订单",
  approved_pending_delivery: "执行交付",
  delivered: "查看记录",
  rejected: "无需处理",
  cancelled: "无需处理",
  expired: "复核过期",
  revoked: "查看撤销"
};

const DELIVERY_CHANNEL_OPTIONS = [
  { value: "stable-node-a", label: "默认交付通道" }
];

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

  const statusSummary = useMemo(() => ({
    total: items.length,
    pending: countStatus(items, "pending_admin_review"),
    pendingDelivery: countStatus(items, "approved_pending_delivery"),
    delivered: countStatus(items, "delivered"),
    rejected: countStatus(items, "rejected")
  }), [items]);

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
      setError(errorMessage(requestError, "交付预览失败。"));
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="page-stack">
      <div className="page-heading">
        <div>
          <h2>订单运营</h2>
          <p className="muted">按订单状态处理用户申请，所有交付动作只做受控预览。</p>
        </div>
      </div>

      {error ? <div className="alert alert-error">{error}</div> : null}

      <section className="gate-review-card" aria-label="订单概览">
        <div className="page-heading">
          <div>
            <h3>订单概览</h3>
            <p className="muted">这里只做订单复核和交付预览，不创建订阅、不修改运行环境。</p>
          </div>
          <label className="inline-filter">
            <span>状态筛选</span>
            <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as StatusFilter)}>
              {STATUS_FILTERS.map((filter) => (
                <option key={filter.value} value={filter.value}>{filter.label}</option>
              ))}
            </select>
          </label>
        </div>
        <div className="metric-grid">
          <div className="metric-card">
            <span>全部订单</span>
            <strong>{statusSummary.total}</strong>
          </div>
          <div className="metric-card">
            <span>待处理</span>
            <strong>{statusSummary.pending}</strong>
          </div>
          <div className="metric-card">
            <span>待交付</span>
            <strong>{statusSummary.pendingDelivery}</strong>
          </div>
          <div className="metric-card">
            <span>已交付</span>
            <strong>{statusSummary.delivered}</strong>
          </div>
          <div className="metric-card">
            <span>已拒绝</span>
            <strong>{statusSummary.rejected}</strong>
          </div>
        </div>
      </section>

      <section className="gate-review-card" aria-label="订单列表">
        <div>
          <h3>订单列表</h3>
          <p className="muted">按状态查看待处理订单，选择一行后在下方复核详情。</p>
        </div>
        {filteredItems.length === 0 ? (
          <div className="alert">当前状态下没有匹配的订单。</div>
        ) : null}
        <div className="table-wrapper">
          <table>
            <thead>
              <tr>
                <th>订单编号</th>
                <th>账号</th>
                <th>套餐</th>
                <th>状态</th>
                <th>时长</th>
                <th>下一步</th>
              </tr>
            </thead>
            <tbody>
              {filteredItems.map((item) => (
                <tr key={item.id}>
                  <td>
                    <button className="link-button" type="button" onClick={() => setSelectedRef(item.id)}>
                      {item.id}
                    </button>
                  </td>
                  <td>{item.portalUserRef}</td>
                  <td>{item.planLabel}</td>
                  <td>{statusLabel(item.status)}</td>
                  <td>{durationLabel(item.durationDays)}</td>
                  <td>{nextActionLabel(item.status)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {selectedRequest ? (
        <section className="gate-review-card" aria-label="订单详情">
          <div>
            <h3>订单详情</h3>
            <p className="muted">展示订单状态和必要审计状态，不展示客户联系方式、订阅链接或原始交付材料。</p>
          </div>
          <dl className="detail-grid">
            <div>
              <dt>订单编号</dt>
              <dd>{selectedRequest.id}</dd>
            </div>
            <div>
              <dt>账号</dt>
              <dd>{selectedRequest.portalUserRef}</dd>
            </div>
            <div>
              <dt>套餐</dt>
              <dd>{selectedRequest.planLabel}</dd>
            </div>
            <div>
              <dt>审核状态</dt>
              <dd>{statusLabel(selectedRequest.status)}</dd>
            </div>
            <div>
              <dt>下一步动作</dt>
              <dd>{nextActionLabel(selectedRequest.status)}</dd>
            </div>
            <div>
              <dt>试用记录</dt>
              <dd>{trialStateLabel(selectedRequest.priorTrialState)}</dd>
            </div>
            <div>
              <dt>审核人</dt>
              <dd>{auditRecordLabel(selectedRequest.reviewedByRef)}</dd>
            </div>
            <div>
              <dt>原因</dt>
              <dd>{reasonLabel(selectedRequest.safeReasonCode)}</dd>
            </div>
            <div>
              <dt>权益记录</dt>
              <dd>{deliveryRecordLabel(selectedRequest.entitlementRef)}</dd>
            </div>
            <div>
              <dt>交付记录</dt>
              <dd>{deliveryRecordLabel(selectedRequest.accessGrantRef)}</dd>
            </div>
            <div>
              <dt>更新时间</dt>
              <dd>{formatDateTime(selectedRequest.updatedAt)}</dd>
            </div>
          </dl>
        </section>
      ) : null}

      <section className="gate-review-card" aria-label="交付预览">
        <div>
          <h3>交付预览</h3>
          <p className="muted">只生成安全预览，不会创建订阅或修改运行环境。</p>
        </div>
        <form className="form-stack" onSubmit={submitPreview}>
          <label>
            <span>订单编号</span>
            <select
              value={selectedRequest?.id ?? ""}
              onChange={(event) => setSelectedRef(event.target.value)}
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
              onChange={(event) => setApprovalRef(event.target.value)}
              placeholder="输入审批编号"
              required
            />
          </label>
          <label>
            <span>操作员</span>
            <input
              value={reviewedByRef}
              onChange={(event) => setReviewedByRef(event.target.value)}
              placeholder="输入操作员编号"
              required
            />
          </label>
          <label>
            <span>交付通道</span>
            <select value={nodeId} onChange={(event) => setNodeId(event.target.value)} required>
              {DELIVERY_CHANNEL_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </label>
          <button className="primary-button" type="submit" disabled={pending || !selectedRequest}>
            {pending ? "生成中" : "生成交付预览"}
          </button>
        </form>
      </section>

      {preview ? (
        <section className="gate-review-card" aria-label="交付预览结果">
          <div>
            <h3>交付预览结果</h3>
            <p className="muted">预览结果用于管理员复核，真实交付仍需要受控执行路径。</p>
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
              <span>套餐</span>
              <strong>{selectedRequest?.planLabel ?? safeValue(previewField(preview, "plan"))}</strong>
            </div>
            <div className="metric-card">
              <span>交付通道</span>
              <strong>{deliveryChannelLabel(previewField(preview, "nodeId"))}</strong>
            </div>
          </div>
          <div className="alert">
            预览完成。真实交付仍需要通过受控执行路径完成。
          </div>
        </section>
      ) : null}
    </div>
  );
}
