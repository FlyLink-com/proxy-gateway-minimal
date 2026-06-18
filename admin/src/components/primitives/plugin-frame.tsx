import { EyeOff, Maximize2, Minimize2, PanelTopOpen, Settings, type LucideIcon } from "lucide-react";
import { type ReactNode } from "react";
import { ADMIN_UI_CONTRACT, type AdminUiDensity } from "../../app/admin-ui-contract";
import { type ModuleDisplayHeight, type ModuleDisplaySize, type ModuleLayoutState } from "../../app/plugin-layout-store";
import { displayModeLayoutState, PLUGIN_DISPLAY_SIZES } from "../../app/plugin-workspace-engine";
import { cn } from "../../lib/utils";
import { type MetricTone } from "./metric-card";
import { StatusChip } from "./status-chip";
import { type WorkbenchCategory } from "./workbench-container";

export type PluginFrameProps = {
  actions?: ReactNode;
  ariaLabel: string;
  category: WorkbenchCategory;
  children?: ReactNode;
  className?: string;
  containerLabel: string;
  dataModuleNavId?: string;
  density?: AdminUiDensity;
  dragHandle?: ReactNode;
  fieldLabels: string[];
  height: ModuleDisplayHeight;
  id?: string;
  notes?: ReactNode;
  onHide?: () => void;
  onLayoutChange?: (layout: Partial<ModuleLayoutState>) => void;
  ownerMode: "preview" | "owner";
  settingsOpen: boolean;
  settingsTrigger?: ReactNode;
  size: ModuleDisplaySize;
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

const SIZE_LABEL: Record<ModuleDisplaySize, string> = {
  large: "Large",
  medium: "Medium",
  small: "Small"
};

const SIZE_ICONS: Record<ModuleDisplaySize, LucideIcon> = {
  large: Maximize2,
  medium: PanelTopOpen,
  small: Minimize2
};

export function PluginFrame({
  actions,
  ariaLabel,
  category,
  children,
  className,
  containerLabel,
  dataModuleNavId,
  density = ADMIN_UI_CONTRACT.pluginFrame.density,
  dragHandle,
  fieldLabels,
  height,
  id,
  notes,
  onHide,
  onLayoutChange,
  ownerMode,
  settingsOpen,
  settingsTrigger,
  size,
  title,
  tone = ownerMode === "preview" ? "neutral" : "info"
}: PluginFrameProps) {
  return (
    <section
      aria-label={ariaLabel}
      aria-roledescription="draggable plugin"
      className={cn(
        "page-anchor-group",
        "admin-blueprint-module-card",
        `admin-blueprint-module-card-${size}`,
        `admin-blueprint-module-card-height-${height}`,
        `workbench-category-${category}`,
        className
      )}
      draggable={false}
      data-density={density}
      data-height={height}
      data-module-nav-id={dataModuleNavId}
      data-size={size}
      data-ui-contract={ADMIN_UI_CONTRACT.pluginFrame.contractId}
      id={id}
    >
      <div className="admin-blueprint-module-card-head">
        <div className="admin-blueprint-module-title">
          {dragHandle}
          <span className="workbench-category-pill">{CATEGORY_LABEL[category]}</span>
          <div>
            <h3>{title}</h3>
            <small>{containerLabel}</small>
          </div>
        </div>
        <div className="admin-blueprint-module-card-meta">
          <div className="admin-blueprint-card-menu">
            {settingsTrigger ?? (
              <button
                aria-expanded={settingsOpen}
                aria-label={`${title} plugin settings`}
                className="admin-blueprint-card-tool-trigger"
                title={`${title} plugin settings`}
                type="button"
              >
                <Settings aria-hidden="true" />
              </button>
            )}
            {settingsOpen ? (
              <div className="admin-blueprint-card-inline-tools" aria-label={`${title} plugin display controls`}>
                <StatusChip label={ownerMode === "preview" ? "Preview" : "Owner"} tone={tone} />
                {[...PLUGIN_DISPLAY_SIZES].reverse().map((displaySize) => {
                  const SizeIcon = SIZE_ICONS[displaySize];
                  return (
                    <LayoutIconButton
                      ariaLabel={`${title} ${SIZE_LABEL[displaySize].replace(" height", "")} plugin display`}
                      key={displaySize}
                      label={`${SIZE_LABEL[displaySize]} plugin display`}
                      onClick={() => onLayoutChange?.(displayModeLayoutState(displaySize))}
                      pressed={size === displaySize}
                    >
                      <SizeIcon aria-hidden="true" />
                    </LayoutIconButton>
                  );
                })}
                <LayoutIconButton
                  ariaLabel={`${title} Hide plugin`}
                  label="Hide plugin"
                  onClick={onHide ?? (() => onLayoutChange?.({ visible: false }))}
                  pressed={false}
                >
                  <EyeOff aria-hidden="true" />
                </LayoutIconButton>
              </div>
            ) : null}
          </div>
        </div>
      </div>
      <ul className="admin-blueprint-card-fields" aria-label={`${title} primary fields`}>
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

function LayoutIconButton({
  ariaLabel,
  children,
  label,
  onClick,
  pressed
}: {
  ariaLabel: string;
  children: ReactNode;
  label: string;
  onClick: () => void;
  pressed: boolean;
}) {
  return (
    <button
      aria-label={ariaLabel}
      aria-pressed={pressed}
      className="admin-blueprint-icon-switch"
      onClick={onClick}
      title={label}
      type="button"
    >
      {children}
    </button>
  );
}
