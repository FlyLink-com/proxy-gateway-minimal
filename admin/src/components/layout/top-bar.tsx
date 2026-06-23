import { ChevronDown, Search, ShieldCheck } from "lucide-react";
import { getWorkspacePageApp } from "../../app/admin-app-manifest";
import { pageContexts, pageTitles, type AdminPage } from "../../app/navigation";
import { cn } from "../../lib/utils";

type TopBarProps = {
  activePage: AdminPage;
  search: string;
  onSearchChange: (value: string) => void;
};

const PAGE_STATUS_LABEL: Record<AdminPage, string> = {
  dashboard: "Summary and routing",
  portalRequests: "Decision owner",
  usageMonitor: "Evidence owner"
};

export function TopBar({ activePage, search, onSearchChange }: TopBarProps) {
  const pageContext = pageContexts[activePage];
  const pageApp = getWorkspacePageApp(activePage);
  const PageIcon = pageApp?.icon;
  const searchActive = search.trim().length > 0;

  return (
    <header className="top-bar" data-figma-component="TopBar" data-ui-surface="top-bar">
      <div className="top-bar-heading">
        {PageIcon ? (
          <span className={cn("top-bar-app-icon nav-app-icon", pageApp?.tone)} aria-hidden="true">
            <PageIcon />
          </span>
        ) : null}
        <div>
          <p className="top-bar-context">{pageContext.eyebrow}</p>
          <strong className="top-bar-page-title">{pageTitles[activePage]}</strong>
        </div>
      </div>
      <form
        className={cn("top-bar-search", searchActive ? "top-bar-search-active" : "")}
        aria-label="Search Admin Console"
        data-search-state={searchActive ? "active" : "idle"}
        data-search-scope="system"
        role="search"
        onSubmit={(event) => event.preventDefault()}
      >
        <Search aria-hidden="true" />
        <label className="sr-only" htmlFor="top-bar-system-search">Search accounts, orders, channels, cases</label>
        <input
          id="top-bar-system-search"
          aria-label="Search accounts, orders, channels, cases"
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder="Search accounts, orders, channels, cases"
          value={search}
        />
      </form>
      <div className="top-bar-actions" role="group" aria-label="Operator account controls">
        <span className="dashboard-status-badge dashboard-status-info">{PAGE_STATUS_LABEL[activePage]}</span>
        <span className="dashboard-status-badge dashboard-status-warning">Risk A gated</span>
        <details className="operator-account-menu">
          <summary className="operator-account-summary" aria-label="Operator account">
            <span className="operator-account-avatar" aria-hidden="true">
              <ShieldCheck />
            </span>
            <span className="operator-account-copy">
              <strong>operator</strong>
              <small>Production read-only</small>
            </span>
            <ChevronDown aria-hidden="true" />
          </summary>
          <div className="top-menu-popover operator-account-popover">
            <strong>operator</strong>
            <span>Production supervision only.</span>
            <span>Runtime changes require a Risk A gate.</span>
          </div>
        </details>
      </div>
    </header>
  );
}
