import {
  Activity,
  Settings,
  ShieldCheck,
  Users,
  Wrench,
  type LucideIcon
} from "lucide-react";

export type WorkbenchCategory =
  | "monitoring"
  | "management"
  | "configuration"
  | "audit-workflow"
  | "platform-tools";

export type WorkbenchContainerSpec = {
  category: WorkbenchCategory;
  container: string;
  dataAdapter: string;
  layoutPolicy: string;
  performanceBoundary: string;
  interactionModel: string;
};

export type WorkbenchLayer = {
  label: string;
  description: string;
};

const CATEGORY_LABEL: Record<WorkbenchCategory, string> = {
  monitoring: "Monitoring",
  management: "Management",
  configuration: "Configuration",
  "audit-workflow": "Audit / Workflow",
  "platform-tools": "Platform Tools"
};

const CATEGORY_DESCRIPTION: Record<WorkbenchCategory, string> = {
  monitoring: "Read-only health, freshness, usage, channel, and anomaly evidence.",
  management: "Account, resource, order, artifact, quota, and lifecycle supervision.",
  configuration: "Defaults, thresholds, policy, and private operator preferences.",
  "audit-workflow": "Review candidates, routing, history preview, and future durable cases.",
  "platform-tools": "No-secret diagnostics, safe tools, and future platform development entries."
};

const CATEGORY_ICON: Record<WorkbenchCategory, LucideIcon> = {
  monitoring: Activity,
  management: Users,
  configuration: Settings,
  "audit-workflow": ShieldCheck,
  "platform-tools": Wrench
};

export function WorkbenchLayerMap({ layers }: { layers: WorkbenchLayer[] }) {
  return (
    <div className="workbench-layer-map">
      {layers.map((layer, index) => (
        <div className="workbench-layer-item" key={layer.label}>
          <span className="workbench-layer-index">{index + 1}</span>
          <div>
            <strong>{layer.label}</strong>
            <small>{layer.description}</small>
          </div>
        </div>
      ))}
    </div>
  );
}

export function WorkbenchContainerCard({ spec }: { spec: WorkbenchContainerSpec }) {
  const CategoryIcon = CATEGORY_ICON[spec.category];

  return (
    <aside className={`workbench-container-card workbench-category-${spec.category}`} aria-label={`${CATEGORY_LABEL[spec.category]} container contract`}>
      <div className="workbench-container-card-heading">
        <div className="workbench-container-title">
          <span className="workbench-category-pill">
            <CategoryIcon aria-hidden="true" size={16} strokeWidth={2} />
            <span>{CATEGORY_LABEL[spec.category]}</span>
          </span>
          <strong>{spec.container}</strong>
        </div>
        <span className="workbench-container-stage">Design adapter</span>
      </div>
      <p className="workbench-container-summary">{CATEGORY_DESCRIPTION[spec.category]}</p>
      <div className="workbench-container-connector" aria-hidden="true">
        <span />
        <span />
        <span />
      </div>
      <details className="workbench-container-details">
        <summary>Container contract</summary>
        <dl className="workbench-container-meta">
          <div>
            <dt>Data adapter</dt>
            <dd>{spec.dataAdapter}</dd>
          </div>
          <div>
            <dt>Layout policy</dt>
            <dd>{spec.layoutPolicy}</dd>
          </div>
          <div>
            <dt>Performance boundary</dt>
            <dd>{spec.performanceBoundary}</dd>
          </div>
          <div>
            <dt>Interaction model</dt>
            <dd>{spec.interactionModel}</dd>
          </div>
        </dl>
      </details>
    </aside>
  );
}
