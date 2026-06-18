import { ChevronDown, ShieldCheck } from "lucide-react";
import { getWorkspacePageApp } from "../../app/admin-app-manifest";
import { pageContexts, pageTitles, type AdminPage } from "../../app/navigation";
import { cn } from "../../lib/utils";

type TopBarProps = {
  activePage: AdminPage;
};

export function TopBar({ activePage }: TopBarProps) {
  const pageContext = pageContexts[activePage];
  const pageApp = getWorkspacePageApp(activePage);
  const PageIcon = pageApp?.icon;
  return (
    <header className="top-bar">
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
      <div className="top-bar-actions" role="group" aria-label="Operator account controls">
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
