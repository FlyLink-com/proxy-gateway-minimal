import type {
  CaseCandidate,
  CaseReasonCode,
  CaseSeverity,
  LinkedObject,
  ObjectTimelineEvent
} from "./types";

const SEVERITY_LABELS: Record<CaseSeverity, string> = {
  critical: "高",
  warning: "中",
  info: "提示",
  neutral: "低"
};

const REASON_LABELS: Record<CaseReasonCode, string> = {
  over_limit: "超额",
  near_limit: "接近上限",
  usage_zero: "零用量",
  usage_stale: "采集延迟",
  collector_disabled: "采集器未启用",
  not_collected: "尚未采集",
  receipt_missing: "回执待确认",
  expiry_candidate: "到期待复核",
  archive_candidate: "待归档复核",
  order_pending_review: "等待复核",
  order_pending_delivery: "等待受控发放"
};

const SOURCE_LABELS: Record<CaseCandidate["source"], string> = {
  portal_access_requests: "账号与资源",
  subscription_usage_monitor: "流量与通道",
  dashboard_summary: "运营总览"
};

export function CaseQueue({
  title,
  description,
  cases,
  selectedCaseRef,
  onSelect
}: {
  title: string;
  description: string;
  cases: CaseCandidate[];
  selectedCaseRef?: string | null;
  onSelect?: (caseRef: string) => void;
}) {
  return (
    <section className="case-workbench-card" aria-label={title}>
      <div className="case-section-heading">
        <div>
          <h3>{title}</h3>
          <p className="muted">{description}</p>
        </div>
        <span className="case-count" aria-label={`监管案件数量 ${cases.length}`}>
          {cases.length}
        </span>
      </div>
      {cases.length === 0 ? (
        <EmptyState title="暂无监管案件" description="当前筛选条件下没有活跃候选。" />
      ) : (
        <div className="case-queue-list">
          {cases.map((caseItem) => (
            onSelect ? (
              <button
                aria-pressed={caseItem.caseRef === selectedCaseRef}
                className={caseItem.caseRef === selectedCaseRef ? "case-row case-row-active" : "case-row"}
                key={caseItem.caseRef}
                type="button"
                onClick={() => onSelect(caseItem.caseRef)}
              >
                <CaseRowContent caseItem={caseItem} />
              </button>
            ) : (
              <article className="case-row case-row-readonly" key={caseItem.caseRef}>
                <CaseRowContent caseItem={caseItem} />
              </article>
            )
          ))}
        </div>
      )}
    </section>
  );
}

function CaseRowContent({ caseItem }: { caseItem: CaseCandidate }) {
  return (
    <>
      <span className={`case-severity case-severity-${caseItem.severity}`}>
        {severityLabel(caseItem.severity)}
      </span>
      <span className="case-row-main">
        <strong>{caseItem.title}</strong>
        <small>
          <span>{caseItem.objectType}</span>
          <span> · </span>
          <span>{caseItem.objectRef}</span>
        </small>
      </span>
      <span className="case-reason">{reasonLabel(caseItem.reasonCode)}</span>
    </>
  );
}

export function CaseDetailPanel({ caseItem }: { caseItem: CaseCandidate | null }) {
  if (caseItem === null) {
    return (
      <section className="case-detail-panel" aria-label="监管案件详情">
        <EmptyState title="选择一个监管案件" description="从队列选择候选后查看证据和对象历史。" />
      </section>
    );
  }

  return (
    <section className="case-detail-panel" aria-label="监管案件详情">
      <div className="case-detail-heading">
        <div>
          <p className="case-eyebrow">{caseItem.status}</p>
          <h3>{caseItem.title}</h3>
          <p className="muted">
            {caseItem.objectType} · {caseItem.objectRef}
          </p>
        </div>
        <span className={`case-severity case-severity-${caseItem.severity}`}>
          {severityLabel(caseItem.severity)}
        </span>
      </div>
      <div className="case-key-grid">
        <KeyValue label="来源" value={sourceLabel(caseItem.source)} />
        <KeyValue label="原因" value={reasonLabel(caseItem.reasonCode)} />
        <KeyValue label="门禁" value={caseItem.gateRequired ? "需要单独门禁" : "只读复核"} />
        <KeyValue label="更新时间" value={formatDateTime(caseItem.updatedAt)} />
      </div>
      <LinkedObjects objects={caseItem.linkedObjects} />
      <ObjectTimeline events={caseItem.timeline} />
      <div className="case-audit-note" aria-label="只读审计说明">
        <strong>审计备注</strong>
        <p className="muted">阶段一只读展示候选和证据；关闭、误报、归档和备注写入等待后端 Case 契约。</p>
      </div>
    </section>
  );
}

export function LinkedObjects({ objects }: { objects: LinkedObject[] }) {
  return (
    <section className="case-linked-objects" aria-label="关联对象">
      <h4>关联对象</h4>
      {objects.length === 0 ? (
        <p className="muted">暂无关联对象。</p>
      ) : (
        <div className="case-linked-list">
          {objects.map((object) => (
            <div className="case-linked-item" key={`${object.relationType}:${object.objectType}:${object.objectRef}`}>
              <span>{object.label}</span>
              <strong>{object.objectRef}</strong>
              <small>
                {object.relationType} · {object.objectType}
              </small>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

export function ObjectTimeline({ events }: { events: ObjectTimelineEvent[] }) {
  return (
    <section className="case-timeline" aria-label="对象时间线">
      <h4>对象时间线</h4>
      {events.length === 0 ? (
        <p className="muted">暂无对象事件。</p>
      ) : (
        <div className="case-timeline-list">
          {events.map((event) => (
            <article className="case-timeline-event" key={event.eventRef}>
              <span className={`case-timeline-dot case-severity-${event.severity}`} aria-hidden="true" />
              <div>
                <strong>{event.summary}</strong>
                <p className="muted">
                  {actionLabel(event.action)} · {event.objectType} · {event.objectRef}
                </p>
                <p className="muted">
                  {timelineSourceLabel(event.source)} · {formatDateTime(event.occurredAt)}
                </p>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

export function EmptyState({ title, description }: { title: string; description: string }) {
  return (
    <div className="case-state case-empty-state">
      <strong>{title}</strong>
      <p className="muted">{description}</p>
    </div>
  );
}

export function ErrorState({ title, message }: { title: string; message: string }) {
  return (
    <div className="case-state case-error-state" role="alert">
      <strong>{title}</strong>
      <p className="muted">{message}</p>
    </div>
  );
}

export function LoadingSkeleton({ label, rows = 3 }: { label: string; rows?: number }) {
  return (
    <div className="case-loading-skeleton" aria-busy="true" aria-label={label}>
      {Array.from({ length: Math.max(0, rows) }, (_, index) => (
        <div className="case-skeleton-row" key={index} />
      ))}
    </div>
  );
}

function KeyValue({ label, value }: { label: string; value: string }) {
  return (
    <div className="case-key-value">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function severityLabel(severity: CaseSeverity): string {
  return SEVERITY_LABELS[severity];
}

function reasonLabel(reasonCode: CaseReasonCode): string {
  return REASON_LABELS[reasonCode];
}

function sourceLabel(source: CaseCandidate["source"]): string {
  return SOURCE_LABELS[source];
}

function timelineSourceLabel(source: string): string {
  const labels: Record<string, string> = {
    portal_access_requests: "账号与资源",
    subscription_usage_monitor: "流量与通道",
    dashboard_summary: "运营总览"
  };
  return labels[source] ?? source;
}

function actionLabel(action: string): string {
  const labels: Record<string, string> = {
    pending_admin_review: "待处理",
    approved_pending_delivery: "待发放",
    delivered: "已发放",
    rejected: "已拒绝",
    cancelled: "已取消",
    expired: "已过期",
    revoked: "已撤销",
    measured: "已采集",
    measured_zero: "零用量",
    stale: "采集延迟",
    not_collected: "未采集",
    collector_disabled: "采集器未启用",
    over_limit: "超额",
    near_limit: "接近上限",
    usage_zero: "零用量",
    usage_stale: "采集延迟",
    receipt_missing: "回执待确认",
    binding_present: "绑定已记录",
    unknown: "未知状态"
  };
  return labels[action] ?? action;
}

function formatDateTime(value: string | null): string {
  if (value === null) return "未记录";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "未记录";
  return value.slice(0, 16).replace("T", " ").replaceAll("-", "/");
}
