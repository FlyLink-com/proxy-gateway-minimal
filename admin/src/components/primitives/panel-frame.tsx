import { EyeOff } from "lucide-react";
import { type ReactNode } from "react";
import { ADMIN_UI_CONTRACT, type AdminUiDensity } from "../../app/admin-ui-contract";
import { cn } from "../../lib/utils";
import { type MetricTone } from "./metric-card";
import { StatusChip } from "./status-chip";
import { type WorkbenchCategory } from "./workbench-container";

export type PanelFrameProps = {
  actions?: ReactNode;
  ariaLabel: string;
  category: WorkbenchCategory;
  children?: ReactNode;
  className?: string;
  containerLabel: string;
  dataModuleNavId?: string;
  dataUiSurfaceRole?: string;
  density?: AdminUiDensity;
  fieldLabels: string[];
  id?: string;
  notes?: ReactNode;
  onHide?: () => void;
  ownerMode: "preview" | "owner";
  title: string;
  tone?: MetricTone;
};

const CATEGORY_LABEL: Record<WorkbenchCategory, string> = {
  monitoring: "Monitoring",
  management: "Management",
  configuration: "Configuration",
  "audit-workflow": "Audit / Workflow",
  "platform-tools": "Platform Tools"
};

export function PanelFrame({
  actions,
  ariaLabel,
  category,
  children,
  className,
  containerLabel,
  dataModuleNavId,
  dataUiSurfaceRole,
  density = ADMIN_UI_CONTRACT.pluginFrame.density,
  fieldLabels,
  id,
  notes,
  onHide,
  ownerMode,
  title,
  tone = ownerMode === "preview" ? "neutral" : "info"
}: PanelFrameProps) {
  return (
    <section
      aria-label={ariaLabel}
      className={cn(
        "page-anchor-group",
        "admin-blueprint-module-panel",
        `workbench-category-${category}`,
        className
      )}
      data-density={density}
      data-module-nav-id={dataModuleNavId}
      data-ui-surface-role={dataUiSurfaceRole}
      data-ui-contract={ADMIN_UI_CONTRACT.pluginFrame.contractId}
      id={id}
    >
      <div className="admin-blueprint-module-panel-head">
        <div className="admin-blueprint-module-title">
          <span className="workbench-category-pill">{CATEGORY_LABEL[category]}</span>
          <div>
            <h3>{title}</h3>
            <small>{containerLabel}</small>
          </div>
        </div>
        <div className="admin-blueprint-module-panel-meta">
          <span className="admin-blueprint-panel-field-count" aria-label={`${fieldLabels.length} primary fields`}>
            {fieldLabels.length}
          </span>
          <StatusChip label={ownerMode === "preview" ? "Preview" : "Owner"} tone={tone} />
          {onHide ? (
            <button
              aria-label={`${title} hide module`}
              className="admin-blueprint-panel-tool-trigger"
              onClick={onHide}
              title={`${title} hide module`}
              type="button"
            >
              <EyeOff aria-hidden="true" />
            </button>
          ) : null}
        </div>
      </div>
      <ul className="admin-blueprint-panel-fields" aria-label={`${title} primary fields`}>
        {fieldLabels.map((field) => (
          <li key={field}>{field}</li>
        ))}
      </ul>
      {actions ? <div className="admin-blueprint-actions">{actions}</div> : null}
      {children}
      {notes}
    </section>
  );
}
