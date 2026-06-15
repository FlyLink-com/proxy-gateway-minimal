import { Search, Settings } from "lucide-react";
import { type ReactNode } from "react";
import { pageContexts, pageTitles, type AdminPage } from "../../app/navigation";

type TopBarProps = {
  activePage: AdminPage;
  search: string;
  onSearchChange: (value: string) => void;
  onOpenPortal: () => void;
  onOpenSite: () => void;
  connectionPanel?: ReactNode;
  connectionConfigured?: boolean;
};

export function TopBar({
  activePage,
  search,
  onSearchChange,
  onOpenPortal,
  onOpenSite,
  connectionPanel,
  connectionConfigured = false
}: TopBarProps) {
  const searchPlaceholder = searchPlaceholderForPage(activePage);
  const pageContext = pageContexts[activePage];
  return (
    <header className="top-bar">
      <div className="top-bar-heading">
        <p className="eyebrow">{pageContext.eyebrow}</p>
        <h1>{pageTitles[activePage]}</h1>
        <p className="top-bar-description">{pageContext.description}</p>
      </div>
      <div className="top-bar-actions">
        <a
          className="ghost-button top-bar-link"
          href="#/site"
          onClick={(event) => {
            event.preventDefault();
            onOpenSite();
          }}
        >
          预览网站
        </a>
        <a
          className="ghost-button top-bar-link"
          href="#/portal"
          onClick={(event) => {
            event.preventDefault();
            onOpenPortal();
          }}
        >
          打开用户面板
        </a>
        {searchPlaceholder ? (
          <label className="search-box">
            <Search aria-hidden="true" />
            <span className="sr-only">{searchPlaceholder.label}</span>
            <input
              value={search}
              onChange={(event) => onSearchChange(event.target.value)}
              placeholder={searchPlaceholder.placeholder}
            />
          </label>
        ) : null}
        {connectionPanel ? (
          <details className="connection-widget">
            <summary className="connection-widget-summary" aria-label="Admin API connection settings">
              <span
                className={connectionConfigured ? "connection-dot connection-dot-ready" : "connection-dot connection-dot-warning"}
                aria-hidden="true"
              />
              <span className="connection-widget-copy">
                <span>管理员 API</span>
                <strong>{connectionConfigured ? "已配置" : "配置"}</strong>
              </span>
              <Settings aria-hidden="true" />
            </summary>
            <div className="connection-widget-popover">
              {connectionPanel}
            </div>
          </details>
        ) : null}
      </div>
    </header>
  );
}

function searchPlaceholderForPage(activePage: AdminPage) {
  switch (activePage) {
    case "portalRequests":
      return { label: "搜索账号与资源", placeholder: "搜索账号或资源..." };
    case "usageMonitor":
      return { label: "搜索流量与通道", placeholder: "搜索账号、通道或状态..." };
    default:
      return null;
  }
}
