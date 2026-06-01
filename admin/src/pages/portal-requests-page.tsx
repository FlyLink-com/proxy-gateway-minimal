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
  { value: "pending_admin_review", label: "待审核" },
  { value: "approved_pending_delivery", label: "待发放" },
  { value: "delivered", label: "已发放" },
  { value: "rejected", label: "已拒绝" },
  { value: "cancelled", label: "已取消" },
  { value: "expired", label: "已过期" },
  { value: "revoked", label: "已撤销" }
];

const STATUS_LABELS: Record<PortalAccessRequestStatus, string> = {
  pending_admin_review: "待审核",
  approved_pending_delivery: "待发放",
  delivered: "已发放",
  rejected: "已拒绝",
  cancelled: "已取消",
  expired: "已过期",
  revoked: "已撤销"
};

const NEXT_ACTION_LABELS: Record<PortalAccessRequestStatus, string> = {
  pending_admin_review: "审核申请",
  approved_pending_delivery: "准备发放",
  delivered: "查看档案",
  rejected: "无需处理",
  cancelled: "无需处理",
  expired: "复核过期",
  revoked: "查看撤销"
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

function previewField(preview: PortalAccessApprovalPreview, key: string) {
  const value = preview.issuanceInput[key];
  return typeof value === "string" || typeof value === "number" ? value : "未记录";
}

export function PortalRequestsPage({ apiClient }: { apiClient: AdminApiClient }) {
  const [items, setItems] = useState<PortalAccessRequestSummary[]>([]);
  const [selectedRef, setSelectedRef] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [approvalRef, setApprovalRef] = useState("");
  const [reviewedByRef, setReviewedByRef] = useState("operator_safe_ref");
  const [nodeId, setNodeId] = useState("channel-lab-b-tuic");
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
          setError(errorMessage(requestError, "Portal request load failed."));
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
      setError(errorMessage(requestError, "Approval preview failed."));
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="page-stack">
      <div className="page-heading">
        <div>
          <h2>订阅申请运营台</h2>
          <p className="muted">处理用户套餐申请、审核状态和发放预览。真实发放仍需单独执行门禁。</p>
        </div>
      </div>

      {error ? <div className="alert alert-error">{error}</div> : null}

      <section className="gate-review-card" aria-label="申请概览">
        <div className="page-heading">
          <div>
            <h3>申请概览</h3>
            <p className="muted">这里只做审核视图和安全预览，不创建订阅、不发放 artifact、不修改运行环境。</p>
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
            <span>全部申请</span>
            <strong>{statusSummary.total}</strong>
          </div>
          <div className="metric-card">
            <span>待审核</span>
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

      <section className="gate-review-card" aria-label="申请队列">
        <div>
          <h3>申请队列</h3>
          <p className="muted">按状态查看待处理申请，选择一行后在下方复核详情。</p>
        </div>
        {filteredItems.length === 0 ? (
          <div className="alert">当前状态下没有匹配的申请。</div>
        ) : null}
        <div className="table-wrapper">
          <table>
            <thead>
              <tr>
                <th>申请编号</th>
                <th>套餐</th>
                <th>状态</th>
                <th>有效期</th>
                <th>用户标识</th>
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
                  <td>{item.planLabel}</td>
                  <td>{statusLabel(item.status)}</td>
                  <td>{durationLabel(item.durationDays)}</td>
                  <td>{item.portalUserRef}</td>
                  <td>{nextActionLabel(item.status)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {selectedRequest ? (
        <section className="gate-review-card" aria-label="申请详情">
          <div>
            <h3>申请详情</h3>
            <p className="muted">展示可审计的安全引用，不展示客户联系方式、订阅链接或原始交付材料。</p>
          </div>
          <dl className="detail-grid">
            <div>
              <dt>申请编号</dt>
              <dd>{selectedRequest.id}</dd>
            </div>
            <div>
              <dt>用户标识</dt>
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
              <dd>{safeValue(selectedRequest.priorTrialState)}</dd>
            </div>
            <div>
              <dt>审核人</dt>
              <dd>{safeValue(selectedRequest.reviewedByRef)}</dd>
            </div>
            <div>
              <dt>原因</dt>
              <dd>{safeValue(selectedRequest.safeReasonCode)}</dd>
            </div>
            <div>
              <dt>权益记录</dt>
              <dd>{safeValue(selectedRequest.entitlementRef)}</dd>
            </div>
            <div>
              <dt>发放记录</dt>
              <dd>{safeValue(selectedRequest.accessGrantRef)}</dd>
            </div>
            <div>
              <dt>更新时间</dt>
              <dd>{selectedRequest.updatedAt}</dd>
            </div>
          </dl>
        </section>
      ) : null}

      <section className="gate-review-card" aria-label="发放预览">
        <div>
          <h3>发放预览</h3>
          <p className="muted">只生成安全预览，不会创建订阅、artifact 或修改运行环境。</p>
        </div>
        <form className="form-stack" onSubmit={submitPreview}>
          <label>
            <span>申请编号</span>
            <select
              value={selectedRequest?.id ?? ""}
              onChange={(event) => setSelectedRef(event.target.value)}
              required
            >
              {selectedRequest ? null : <option value="">未选择申请</option>}
              {items.map((item) => (
                <option key={item.id} value={item.id}>{item.id}</option>
              ))}
            </select>
          </label>
          <label>
            <span>审批编号</span>
            <input value={approvalRef} onChange={(event) => setApprovalRef(event.target.value)} required />
          </label>
          <label>
            <span>操作员</span>
            <input value={reviewedByRef} onChange={(event) => setReviewedByRef(event.target.value)} required />
          </label>
          <label>
            <span>目标通道节点</span>
            <input value={nodeId} onChange={(event) => setNodeId(event.target.value)} required />
          </label>
          <button className="primary-button" type="submit" disabled={pending || !selectedRequest}>
            {pending ? "生成中" : "生成发放预览"}
          </button>
        </form>
      </section>

      {preview ? (
        <section className="gate-review-card" aria-label="发放预览结果">
          <div>
            <h3>发放预览结果</h3>
            <p className="muted">预览结果用于管理员复核，真实发放仍需要受控执行路径。</p>
          </div>
          <div className="metric-grid">
            <div className="metric-card">
              <span>结果状态</span>
              <strong>{statusLabel(preview.status)}</strong>
            </div>
            <div className="metric-card">
              <span>审批编号</span>
              <strong>{preview.approvalRef}</strong>
            </div>
            <div className="metric-card">
              <span>计划套餐</span>
              <strong>{selectedRequest?.planLabel ?? safeValue(previewField(preview, "plan"))}</strong>
            </div>
            <div className="metric-card">
              <span>目标节点</span>
              <strong>{safeValue(previewField(preview, "nodeId"))}</strong>
            </div>
          </div>
          <div className="alert">
            预览完成。真实发放仍需要管理员通过受控执行路径完成。
          </div>
        </section>
      ) : null}
    </div>
  );
}
