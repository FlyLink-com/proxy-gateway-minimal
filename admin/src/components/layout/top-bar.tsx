import { Search } from "lucide-react";
import { pageTitles, type AdminPage } from "../../app/navigation";

type TopBarProps = {
  activePage: AdminPage;
  search: string;
  onSearchChange: (value: string) => void;
  onOpenPortal: () => void;
  onOpenSite: () => void;
};

export function TopBar({ activePage, search, onSearchChange, onOpenPortal, onOpenSite }: TopBarProps) {
  return (
    <header className="top-bar">
      <div>
        <p className="eyebrow">Admin Console</p>
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
          Preview site
        </a>
        <a
          className="ghost-button top-bar-link"
          href="#/portal"
          onClick={(event) => {
            event.preventDefault();
            onOpenPortal();
          }}
        >
          Open user portal
        </a>
        <label className="search-box">
          <Search aria-hidden="true" />
          <span className="sr-only">Search subscriptions</span>
          <input
            value={search}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder="Search subscriptions..."
          />
        </label>
      </div>
    </header>
  );
}
