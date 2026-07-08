import { type ReactNode } from "react";
import { ADMIN_UI_CONTRACT } from "../../app/admin-ui-contract";
import { cn } from "../../lib/utils";

export type WorkspaceSidebarBrand = {
  mark: ReactNode;
  name: string;
  subtitle: string;
};

export type WorkspaceSidebarPinnedRoute = {
  active?: boolean;
  icon: ReactNode;
  id: string;
  label: string;
  onClick: () => void;
  tone?: string;
};

export type WorkspaceSidebarPinnedRouteGroup = {
  id: string;
  items: WorkspaceSidebarPinnedRoute[];
  label: string;
  routeSuffix?: string;
};

export type WorkspaceSidebarProps = {
  ariaLabel?: string;
  brand: WorkspaceSidebarBrand;
  className?: string;
  pinnedApps: WorkspaceSidebarPinnedRoute[];
  pinnedAppGroups?: WorkspaceSidebarPinnedRouteGroup[];
  plannedRoutesAriaLabel?: string;
  primaryRoutesAriaLabel?: string;
  plannedRoutes?: ReactNode;
  safetyGate?: ReactNode;
};

export function WorkspaceSidebar({
  ariaLabel = "Workspace sidebar",
  brand,
  className,
  pinnedAppGroups,
  pinnedApps,
  plannedRoutesAriaLabel = "Planned workspace routes",
  primaryRoutesAriaLabel = "Primary workspace routes",
  plannedRoutes,
  safetyGate
}: WorkspaceSidebarProps) {
  const hasPinnedAppGroups = pinnedAppGroups && pinnedAppGroups.length > 0;

  const renderPinnedRoute = (app: WorkspaceSidebarPinnedRoute) => (
    <button
      aria-current={app.active ? "page" : undefined}
      className={cn("nav-item", app.active && "nav-item-active")}
      key={app.id}
      onClick={app.onClick}
      title={app.label}
      type="button"
    >
      <span className={cn("nav-item-icon nav-app-icon nav-route-icon", app.tone)} aria-hidden="true">
        {app.icon}
      </span>
      <span className="nav-item-copy">{app.label}</span>
    </button>
  );

  return (
    <aside
      className={cn("app-sidebar workspace-sidebar", className)}
      aria-label={ariaLabel}
      data-density={ADMIN_UI_CONTRACT.appShell.density}
      data-figma-component="SidebarNavigation"
      data-ui-contract={ADMIN_UI_CONTRACT.appShell.contractId}
      data-ui-surface="workspace-sidebar"
    >
      <div className="brand">
        <div className="brand-mark">{brand.mark}</div>
        <div>
          <div className="brand-name">{brand.name}</div>
          <div className="brand-subtitle">{brand.subtitle}</div>
        </div>
      </div>

      <nav className="nav-list">
        <div className="nav-primary-list" aria-label={primaryRoutesAriaLabel}>
          {hasPinnedAppGroups ? pinnedAppGroups.map((group) => (
            <section
              aria-label={`${group.label} ${group.routeSuffix ?? "routes"}`}
              className="nav-section"
              key={group.id}
            >
              <div className="nav-section-heading">
                <div className="nav-section-label">{group.label}</div>
              </div>
              <div className="nav-section-items">
                {group.items.map(renderPinnedRoute)}
              </div>
            </section>
          )) : pinnedApps.map(renderPinnedRoute)}
        </div>

        {plannedRoutes ? (
          <div className="nav-planned-sidebar-list" aria-label={plannedRoutesAriaLabel}>
            {plannedRoutes}
          </div>
        ) : null}
      </nav>

      {safetyGate}
    </aside>
  );
}
