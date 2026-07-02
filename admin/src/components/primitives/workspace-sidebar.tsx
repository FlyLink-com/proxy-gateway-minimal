import { type KeyboardEvent, type ReactNode } from "react";
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

export type WorkspaceSidebarPinnedGroup = {
  id: string;
  items: WorkspaceSidebarPinnedRoute[];
  label: string;
  routeSuffix?: string;
};

export type WorkspaceSidebarProps = {
  ariaLabel?: string;
  brand: WorkspaceSidebarBrand;
  className?: string;
  navigationAriaLabel?: string;
  pinnedAppGroups?: WorkspaceSidebarPinnedGroup[];
  pinnedApps: WorkspaceSidebarPinnedRoute[];
  plannedRoutes?: ReactNode;
  plannedRoutesAriaLabel?: string;
  primaryRoutesAriaLabel?: string;
  safetyGate?: ReactNode;
};

export function WorkspaceSidebar({
  ariaLabel = "Workspace sidebar",
  brand,
  className,
  navigationAriaLabel = "Workspace navigation",
  pinnedAppGroups,
  pinnedApps,
  plannedRoutes,
  plannedRoutesAriaLabel = "Planned workspace routes",
  primaryRoutesAriaLabel = "Primary workspace routes",
  safetyGate
}: WorkspaceSidebarProps) {
  return (
    <aside
      className={cn("app-sidebar workspace-sidebar", className)}
      aria-label={ariaLabel}
      data-density={ADMIN_UI_CONTRACT.appShell.density}
      data-figma-component="ShellRail"
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

      <nav
        aria-label={navigationAriaLabel}
        className="nav-list"
        data-ui-role="workspace-navigation-scrollport"
        onKeyDown={handleWorkspaceNavigationKeyDown}
        tabIndex={0}
      >
        <div className="nav-primary-list" aria-label={primaryRoutesAriaLabel}>
          {pinnedAppGroups && pinnedAppGroups.length > 0
            ? pinnedAppGroups.map((group) => renderPinnedGroup(group))
            : pinnedApps.map((app) => renderPinnedRoute(app))}
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

function renderPinnedGroup(group: WorkspaceSidebarPinnedGroup) {
  const routeSuffix = group.routeSuffix ?? "routes";
  return (
    <section
      aria-label={`${group.label} ${routeSuffix}`}
      className="nav-section nav-sidebar-group"
      data-nav-section-id={group.id}
      key={group.id}
    >
      <div className="nav-section-heading">
        <span className="nav-section-label">{group.label}</span>
      </div>
      <div className="nav-section-items">
        {group.items.map((app) => renderPinnedRoute(app, `${group.id}-${app.id}`, true))}
      </div>
    </section>
  );
}

function renderPinnedRoute(app: WorkspaceSidebarPinnedRoute, key = app.id, nested = false) {
  return (
    <button
      aria-current={app.active ? "page" : undefined}
      className={cn("nav-item", nested && "nav-item-subitem", app.active && "nav-item-active")}
      key={key}
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
}

function handleWorkspaceNavigationKeyDown(event: KeyboardEvent<HTMLElement>) {
  if (event.altKey || event.ctrlKey || event.defaultPrevented || event.metaKey) {
    return;
  }

  const scrollport = event.currentTarget;
  const pageStep = Math.max(scrollport.clientHeight - 24, 48);

  if (event.key === "PageDown") {
    event.preventDefault();
    scrollport.scrollBy({ top: pageStep, behavior: "auto" });
    return;
  }

  if (event.key === "PageUp") {
    event.preventDefault();
    scrollport.scrollBy({ top: -pageStep, behavior: "auto" });
    return;
  }

  if (event.key === "ArrowDown") {
    event.preventDefault();
    scrollport.scrollBy({ top: 34, behavior: "auto" });
    return;
  }

  if (event.key === "ArrowUp") {
    event.preventDefault();
    scrollport.scrollBy({ top: -34, behavior: "auto" });
    return;
  }

  if (event.key === "Home") {
    event.preventDefault();
    scrollport.scrollTo({ top: 0, behavior: "auto" });
    return;
  }

  if (event.key === "End") {
    event.preventDefault();
    scrollport.scrollTo({ top: scrollport.scrollHeight, behavior: "auto" });
  }
}
