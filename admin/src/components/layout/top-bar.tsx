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
  dashboard: "Operations",
  portalRequests: "Accounts",
  usageMonitor: "Usage"
};

const SYSTEM_SEARCH_LABEL = "Search users, orders, channels, cases, or events";

const PAGE_SEARCH_PLACEHOLDER: Record<AdminPage, string> = {
  dashboard: "Search users, orders, channels...",
  portalRequests: "Search accounts, orders, lifecycle...",
  usageMonitor: "Search usage, channels, receipts..."
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
        <label className="sr-only" htmlFor="top-bar-system-search">{SYSTEM_SEARCH_LABEL}</label>
        <input
          id="top-bar-system-search"
          aria-label={SYSTEM_SEARCH_LABEL}
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder={PAGE_SEARCH_PLACEHOLDER[activePage]}
          value={search}
        />
      </form>
      <div className="top-bar-actions" role="group" aria-label="Operator account controls">
        <span className="dashboard-status-badge dashboard-status-success">Production</span>
        <span
          className="top-bar-notification-indicator"
          aria-label="Risk A gate status"
          data-state="gated-readonly"
          title="Risk A gated"
        >
          <span aria-hidden="true" className="top-bar-notification-dot" />
        </span>
        <details className="operator-account-menu">
          <summary className="operator-account-summary" aria-label="Operator account">
            <span className="operator-account-avatar" aria-hidden="true">
              <ShieldCheck />
            </span>
            <span className="operator-account-copy">
              <strong>Operator</strong>
              <small>Safe review</small>
            </span>
            <ChevronDown aria-hidden="true" />
          </summary>
          <div className="top-menu-popover operator-account-popover">
            <strong>Operator</strong>
            <span>Production supervision only.</span>
            <span>Runtime changes require a Risk A gate.</span>
          </div>
        </details>
        <span className="dashboard-status-badge dashboard-status-info">{PAGE_STATUS_LABEL[activePage]}</span>
      </div>
    </header>
  );
}
