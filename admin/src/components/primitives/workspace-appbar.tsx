import { Grid2X2, Search } from "lucide-react";
import { type ReactNode, type Ref, type ToggleEvent } from "react";
import { ADMIN_UI_CONTRACT } from "../../app/admin-ui-contract";
import { cn } from "../../lib/utils";

export type WorkspaceAppbarBrand = {
  mark: ReactNode;
  name: string;
  subtitle: string;
};

export type WorkspaceAppbarPinnedApp = {
  active?: boolean;
  icon: ReactNode;
  id: string;
  label: string;
  onClick: () => void;
  tone?: string;
};

export type WorkspaceAppbarProps = {
  appLibrary: ReactNode;
  ariaLabel?: string;
  brand: WorkspaceAppbarBrand;
  className?: string;
  pinnedApps: WorkspaceAppbarPinnedApp[];
  safetyGate?: ReactNode;
};

export type AppLibraryProps = {
  emptyState?: ReactNode;
  menuRef?: Ref<HTMLDetailsElement>;
  onSearchChange: (value: string) => void;
  onToggle?: (event: ToggleEvent<HTMLDetailsElement>) => void;
  open?: boolean;
  plannedApps?: ReactNode;
  plugins?: ReactNode;
  resultCount: number;
  search: string;
  searchInputRef?: Ref<HTMLInputElement>;
  totalCount: number;
  utilities?: ReactNode;
  workspacePages?: ReactNode;
};

export function WorkspaceAppbar({
  appLibrary,
  ariaLabel = "Workspace appbar",
  brand,
  className,
  pinnedApps,
  safetyGate
}: WorkspaceAppbarProps) {
  return (
    <aside
      className={cn("app-sidebar workspace-appbar", className)}
      aria-label={ariaLabel}
      data-density={ADMIN_UI_CONTRACT.appShell.density}
      data-ui-contract={ADMIN_UI_CONTRACT.appShell.contractId}
      data-ui-surface="workspace-appbar"
    >
      <div className="brand">
        <div className="brand-mark">{brand.mark}</div>
        <div>
          <div className="brand-name">{brand.name}</div>
          <div className="brand-subtitle">{brand.subtitle}</div>
        </div>
      </div>

      <nav className="nav-list">
        <div className="nav-primary-list" aria-label="Pinned workspace apps">
          {pinnedApps.map((app) => (
            <button
              aria-current={app.active ? "page" : undefined}
              className={cn("nav-item", app.active && "nav-item-active")}
              key={app.id}
              onClick={app.onClick}
              title={app.label}
              type="button"
            >
              <span className={cn("nav-item-icon nav-app-icon nav-app-icon-dock", app.tone)} aria-hidden="true">
                {app.icon}
              </span>
              <span className="nav-item-copy">{app.label}</span>
            </button>
          ))}
        </div>

        {appLibrary}
      </nav>

      {safetyGate}
    </aside>
  );
}

export function AppLibrary({
  emptyState,
  menuRef,
  onSearchChange,
  onToggle,
  open = false,
  plannedApps,
  plugins,
  resultCount,
  search,
  searchInputRef,
  totalCount,
  utilities,
  workspacePages
}: AppLibraryProps) {
  return (
    <details
      className="nav-planned-menu"
      data-density={ADMIN_UI_CONTRACT.appShell.density}
      data-ui-contract={ADMIN_UI_CONTRACT.appShell.contractId}
      data-ui-surface="app-library"
      onToggle={onToggle}
      open={open}
      ref={menuRef}
    >
      <summary
        aria-expanded={open}
        aria-label="Open app library"
        className="nav-planned-summary"
      >
        <Grid2X2 aria-hidden="true" />
        <span>App library</span>
        <span className="nav-planned-count" aria-label={`${totalCount} app library entries`}>
          {totalCount}
        </span>
      </summary>
      <div className="nav-planned-list">
        <div className="nav-library-toolbar">
          <label className="nav-library-search">
            <Search aria-hidden="true" />
            <span className="sr-only">Search app library</span>
            <input
              aria-label="Search app library"
              onChange={(event) => onSearchChange(event.target.value)}
              placeholder="Search apps, plugins, settings..."
              ref={searchInputRef}
              value={search}
            />
          </label>
          <span className="nav-library-result-count" aria-label={`${resultCount} app library results`}>
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

        {plugins ? (
          <div className="nav-library-group nav-library-card-apps" aria-label="Plugins">
            <strong className="nav-library-heading">Plugins</strong>
            <div className="nav-library-grid nav-library-grid-modules">
              {plugins}
            </div>
          </div>
        ) : null}

        {plannedApps ? (
          <div className="nav-library-group nav-library-planned-apps" aria-label="Planned apps">
            <strong className="nav-library-heading">Planned apps</strong>
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
