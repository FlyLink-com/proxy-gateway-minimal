import { EyeOff } from "lucide-react";
import { type ReactNode } from "react";
import { type AdminFixturePreviewPanel } from "../../app/admin-fixture-preview";
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
  fixturePreview?: AdminFixturePreviewPanel;
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
  fixturePreview,
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
      data-ui-role="panel"
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
      {fixturePreview ? (
        <div
          aria-label={`${title} fixture preview`}
          className="admin-fixture-preview"
          data-fixture-schema="admin-fixture-preview/v1"
        >
          <div className="admin-fixture-preview-chips" aria-label={`${title} fixture states`}>
            {fixturePreview.chips.map((chip) => (
              <StatusChip key={chip.label} label={chip.label} tone={chip.tone} />
            ))}
          </div>
          <dl className="admin-fixture-preview-rows" aria-label={`${title} fixture rows`}>
            {fixturePreview.rows.map((row) => (
              <div className="admin-fixture-preview-row" key={`${row.label}:${row.value}`}>
                <dt>{row.label}</dt>
                <dd>
                  <strong>{row.value}</strong>
                  {row.meta ? <span>{row.meta}</span> : null}
                  {row.tone ? <StatusChip label={row.tone} tone={row.tone} /> : null}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      ) : null}
      {actions ? <div className="admin-blueprint-actions">{actions}</div> : null}
      {children}
      {notes}
    </section>
  );
}
