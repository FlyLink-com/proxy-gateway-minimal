import { Grid2X2, Search } from "lucide-react";
import { type ReactNode, type Ref, type ToggleEvent } from "react";
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
  navigationLibrary: ReactNode;
  pinnedApps: WorkspaceSidebarPinnedRoute[];
  plannedRoutes?: ReactNode;
  safetyGate?: ReactNode;
};

export type NavigationLibraryProps = {
  emptyState?: ReactNode;
  menuRef?: Ref<HTMLDetailsElement>;
  onSearchChange: (value: string) => void;
  onToggle?: (event: ToggleEvent<HTMLDetailsElement>) => void;
  open?: boolean;
  plannedApps?: ReactNode;
  panels?: ReactNode;
  resultCount: number;
  search: string;
  searchInputRef?: Ref<HTMLInputElement>;
  totalCount: number;
  utilities?: ReactNode;
  workspacePages?: ReactNode;
};

export function WorkspaceSidebar({
  ariaLabel = "Workspace sidebar",
  brand,
  className,
  navigationLibrary,
  pinnedApps,
  plannedRoutes,
  safetyGate
}: WorkspaceSidebarProps) {
  return (
    <aside
      className={cn("app-sidebar workspace-sidebar", className)}
      aria-label={ariaLabel}
      data-density={ADMIN_UI_CONTRACT.appShell.density}
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

        {navigationLibrary}
      </nav>

      {safetyGate}
    </aside>
  );
}

export function NavigationLibrary({
  emptyState,
  menuRef,
  onSearchChange,
  onToggle,
  open = false,
  plannedApps,
  panels,
  resultCount,
  search,
  searchInputRef,
  totalCount,
  utilities,
  workspacePages
}: NavigationLibraryProps) {
  return (
    <details
      className="nav-planned-menu"
      data-density={ADMIN_UI_CONTRACT.appShell.density}
      data-ui-contract={ADMIN_UI_CONTRACT.appShell.contractId}
      data-ui-surface="navigation-library"
      onToggle={onToggle}
      open={open}
      ref={menuRef}
    >
      <summary
        aria-expanded={open}
        aria-label="Open navigation library"
        className="nav-planned-summary"
      >
        <Grid2X2 aria-hidden="true" />
        <span>Navigation library</span>
        <span className="nav-planned-count" aria-label={`${totalCount} navigation library entries`}>
          {totalCount}
        </span>
      </summary>
      <div className="nav-planned-list">
        <div className="nav-library-toolbar">
          <label className="nav-library-search">
            <Search aria-hidden="true" />
            <span className="sr-only">Search navigation library</span>
            <input
              aria-label="Search navigation library"
              onChange={(event) => onSearchChange(event.target.value)}
              placeholder="Search pages, panels, settings..."
              ref={searchInputRef}
              value={search}
            />
          </label>
          <span className="nav-library-result-count" aria-label={`${resultCount} navigation library results`}>
            {resultCount}
          </span>
        </div>

        {utilities ? (
          <div className="nav-library-group nav-library-utilities" aria-label="Console settings">
            <strong className="nav-library-heading">Console settings</strong>
            <div className="nav-library-utility-grid">
              {utilities}
            </div>
          </div>
        ) : null}

        {workspacePages ? (
          <div className="nav-library-group nav-library-pages" aria-label="Workspace pages">
            <strong className="nav-library-heading">Workspace pages</strong>
            <div className="nav-library-grid">
              {workspacePages}
            </div>
          </div>
        ) : null}

        {panels ? (
          <div className="nav-library-group nav-library-panel-apps" aria-label="Panels">
            <strong className="nav-library-heading">Panels</strong>
            <div className="nav-library-grid nav-library-grid-modules">
              {panels}
            </div>
          </div>
        ) : null}

        {plannedApps ? (
          <div className="nav-library-group nav-library-planned-apps" aria-label="Planned routes">
            <strong className="nav-library-heading">Planned routes</strong>
            <div className="nav-library-grid">
              {plannedApps}
            </div>
          </div>
        ) : null}

        {resultCount === 0 && emptyState ? (
          <div className="nav-library-empty" role="status">
            {emptyState}
          </div>
        ) : null}
      </div>
    </details>
  );
}
