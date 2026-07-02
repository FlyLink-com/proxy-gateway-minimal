import { ChevronDown, Search, ShieldCheck } from "lucide-react";
import { getWorkspacePageApp } from "../../app/admin-app-manifest";
import { ADMIN_SHELL_COPY, type AdminLocale, type AdminShellCopy } from "../../app/admin-locale";
import { pageContexts, pageTitles, type AdminPage } from "../../app/navigation";
import { cn } from "../../lib/utils";

type TopBarProps = {
  activePage: AdminPage;
  locale?: AdminLocale;
  shellCopy?: AdminShellCopy["topBar"];
  onLocaleChange?: (locale: AdminLocale) => void;
  search: string;
  onSearchChange: (value: string) => void;
};

export function TopBar({
  activePage,
  locale = "en",
  shellCopy = ADMIN_SHELL_COPY.en.topBar,
  onLocaleChange,
  search,
  onSearchChange
}: TopBarProps) {
  const pageContext = pageContexts[activePage];
  const pageApp = getWorkspacePageApp(activePage);
  const PageIcon = pageApp?.icon;
  const searchActive = search.trim().length > 0;
  const pageTitle = shellCopy.pageTitles[activePage] ?? pageTitles[activePage];
  const pageEyebrow = shellCopy.contexts[activePage] ?? pageContext.eyebrow;

  return (
    <header className="top-bar" data-figma-component="TopBar" data-ui-surface="top-bar">
      <div className="top-bar-heading">
        {PageIcon ? (
          <span className={cn("top-bar-app-icon nav-app-icon", pageApp?.tone)} aria-hidden="true">
            <PageIcon />
          </span>
        ) : null}
        <div>
          <p className="top-bar-context">{pageEyebrow}</p>
          <strong className="top-bar-page-title">{pageTitle}</strong>
        </div>
      </div>
      <form
        className={cn("top-bar-search", searchActive ? "top-bar-search-active" : "")}
        aria-label={shellCopy.searchAriaLabel}
        data-search-state={searchActive ? "active" : "idle"}
        data-search-scope="system"
        role="search"
        onSubmit={(event) => event.preventDefault()}
      >
        <Search aria-hidden="true" />
        <label className="sr-only" htmlFor="top-bar-system-search">{shellCopy.searchLabel}</label>
        <input
          id="top-bar-system-search"
          aria-label={shellCopy.searchLabel}
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder={shellCopy.searchPlaceholders[activePage]}
          value={search}
        />
      </form>
      <div className="top-bar-actions" role="group" aria-label={shellCopy.accountControlsLabel}>
        <span className="dashboard-status-badge dashboard-status-success">{shellCopy.production}</span>
        <span
          className="top-bar-notification-indicator"
          aria-label={shellCopy.riskGateLabel}
          data-state="gated-readonly"
          title={shellCopy.riskGateTitle}
        >
          <span aria-hidden="true" className="top-bar-notification-dot" />
        </span>
        <details className="operator-account-menu">
          <summary className="operator-account-summary" aria-label={shellCopy.accountAriaLabel}>
            <span className="operator-account-avatar" aria-hidden="true">
              <ShieldCheck />
            </span>
            <span className="operator-account-copy">
              <strong>{shellCopy.accountName}</strong>
              <small>{shellCopy.accountRole}</small>
            </span>
            <ChevronDown aria-hidden="true" />
          </summary>
          <div className="top-menu-popover operator-account-popover">
            <strong>{shellCopy.accountName}</strong>
            <span>{shellCopy.accountPopoverDescription}</span>
            <span>{shellCopy.accountPopoverGate}</span>
            {onLocaleChange ? (
              <div className="operator-language-row" aria-label={shellCopy.languageLabel}>
                <span>{shellCopy.languageLabel}</span>
                <div className="operator-language-options">
                  {(["zh", "en"] satisfies AdminLocale[]).map((option) => (
                    <button
                      aria-label={shellCopy.languageOptions[option].ariaLabel}
                      aria-pressed={locale === option}
                      className={cn("operator-language-button", locale === option && "operator-language-button-active")}
                      key={option}
                      onClick={() => onLocaleChange(option)}
                      type="button"
                    >
                      {shellCopy.languageOptions[option].label}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        </details>
        <span className="dashboard-status-badge dashboard-status-info">{shellCopy.pageStatus[activePage]}</span>
      </div>
    </header>
  );
}
