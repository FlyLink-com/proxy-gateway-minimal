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

export type WorkspaceSidebarProps = {
  ariaLabel?: string;
  brand: WorkspaceSidebarBrand;
  className?: string;
  pinnedApps: WorkspaceSidebarPinnedRoute[];
  plannedRoutes?: ReactNode;
  safetyGate?: ReactNode;
};

export function WorkspaceSidebar({
  ariaLabel = "Workspace sidebar",
  brand,
  className,
  pinnedApps,
  plannedRoutes,
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
        aria-label="Workspace navigation"
        className="nav-list"
        data-ui-role="workspace-navigation-scrollport"
        onKeyDown={handleWorkspaceNavigationKeyDown}
        tabIndex={0}
      >
        <div className="nav-primary-list" aria-label="Primary workspace routes">
          {pinnedApps.map((app) => (
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
          ))}
        </div>

        {plannedRoutes ? (
          <div className="nav-planned-sidebar-list" aria-label="Planned workspace routes">
            {plannedRoutes}
          </div>
        ) : null}
      </nav>

      {safetyGate}
    </aside>
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
