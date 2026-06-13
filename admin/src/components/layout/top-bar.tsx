import { Search, Settings } from "lucide-react";
import { type ReactNode } from "react";
import { pageTitles, type AdminPage } from "../../app/navigation";

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
  return (
    <header className="top-bar">
      <div>
        <p className="eyebrow">管理控制台</p>
        <h1>{pageTitles[activePage]}</h1>
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
      return { label: "搜索订单", placeholder: "搜索订单..." };
    case "usageMonitor":
      return { label: "搜索活动", placeholder: "搜索活动..." };
    default:
      return null;
  }
}
