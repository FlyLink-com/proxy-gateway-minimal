import { EyeOff } from "lucide-react";
import { type ReactNode } from "react";
import { type AdminFixturePreviewPanel } from "../../app/admin-fixture-preview";
import { ADMIN_UI_CONTRACT, type AdminUiDensity } from "../../app/admin-ui-contract";
import { type WorkspaceModuleVisibleSizePreset } from "../../app/plugin-layout-store";
import { cn } from "../../lib/utils";
import { type MetricTone } from "./metric-card";
import { StatusChip } from "./status-chip";
import { type WorkbenchCategory } from "./workbench-container";

export type PanelFrameProps = {
  actions?: ReactNode;
  allowedSizePresets?: WorkspaceModuleVisibleSizePreset[];
  ariaLabel: string;
  category: WorkbenchCategory;
  children?: ReactNode;
  chrome?: "draft" | "operator";
  className?: string;
  containerLabel: string;
  dataContainmentStrategy?: string;
  dataModuleNavId?: string;
  dataPaginationStandardNodeId?: string;
  dataUiSurfaceRole?: string;
  density?: AdminUiDensity;
  fieldLabels: string[];
  fixturePreview?: AdminFixturePreviewPanel;
  id?: string;
  notes?: ReactNode;
  onHide?: () => void;
  onSizePresetChange?: (sizePreset: WorkspaceModuleVisibleSizePreset) => void;
  ownerMode: "preview" | "owner";
  showDesignMetadata?: boolean;
  sizePreset?: WorkspaceModuleVisibleSizePreset;
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
  allowedSizePresets,
  ariaLabel,
  category,
  children,
  chrome = "draft",
  className,
  containerLabel,
  dataContainmentStrategy,
  dataModuleNavId,
  dataPaginationStandardNodeId,
  dataUiSurfaceRole,
  density = ADMIN_UI_CONTRACT.pluginFrame.density,
  fieldLabels,
  fixturePreview,
  id,
  notes,
  onHide,
  onSizePresetChange,
  ownerMode,
  showDesignMetadata = false,
  sizePreset,
  title,
  tone = ownerMode === "preview" ? "neutral" : "info"
}: PanelFrameProps) {
  const showDraftChrome = chrome === "draft";
  const showFixturePreview = showDraftChrome && fixturePreview;
  const layoutPresetControls = onSizePresetChange && sizePreset && allowedSizePresets?.length ? (
    <div className="admin-blueprint-panel-preset-controls" aria-label={`${title} layout preset controls`}>
      {allowedSizePresets.map((preset) => (
        <button
          aria-label={`${title} ${preset} layout`}
          aria-pressed={preset === sizePreset}
          className="admin-blueprint-panel-preset-button"
          key={preset}
          onClick={() => onSizePresetChange(preset)}
          type="button"
        >
          {presetLabel(preset)}
        </button>
      ))}
    </div>
  ) : null;
  const hideControl = onHide ? (
    <button
      aria-label={`${title} hide module`}
      className={cn(
        "admin-blueprint-panel-tool-trigger",
        !showDraftChrome && "admin-blueprint-panel-tool-trigger-floating"
      )}
      onClick={onHide}
      title={`${title} hide module`}
      type="button"
    >
      <EyeOff aria-hidden="true" />
    </button>
  ) : null;

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
      data-chrome={chrome}
      data-containment-strategy={dataContainmentStrategy}
      data-figma-component="PanelFrame"
      data-module-nav-id={dataModuleNavId}
      data-owner-mode={ownerMode}
      data-pagination-standard-node-id={dataPaginationStandardNodeId}
      data-size-preset={sizePreset}
      data-ui-role="panel"
      data-ui-surface="panel-frame"
      data-ui-surface-role={dataUiSurfaceRole}
      data-ui-contract={ADMIN_UI_CONTRACT.pluginFrame.contractId}
      data-workbench-category={category}
      id={id}
    >
      {showDraftChrome ? (
        <div className="admin-blueprint-module-panel-head">
          <div className="admin-blueprint-module-title">
            <span className="workbench-category-pill">{CATEGORY_LABEL[category]}</span>
            <div>
              <h3>{title}</h3>
              {showDesignMetadata ? <small>{containerLabel}</small> : null}
            </div>
          </div>
          <div className="admin-blueprint-module-panel-meta">
            {showDesignMetadata ? (
              <>
                <span className="admin-blueprint-panel-field-count" aria-label={`${fieldLabels.length} primary fields`}>
                  {fieldLabels.length}
                </span>
                <StatusChip label={ownerMode === "preview" ? "Preview" : "Owner"} tone={tone} />
              </>
            ) : null}
            {layoutPresetControls}
            {hideControl}
          </div>
        </div>
      ) : (
        <>
          <span className="sr-only">{title}</span>
          {layoutPresetControls}
          {hideControl}
        </>
      )}
      {showFixturePreview ? (
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

function presetLabel(preset: WorkspaceModuleVisibleSizePreset) {
  if (preset === "compact") return "Compact";
  if (preset === "wide") return "Wide";
  if (preset === "full") return "Full";
  return "Standard";
}
