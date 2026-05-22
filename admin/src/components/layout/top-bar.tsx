import { Search } from "lucide-react";
import { pageTitles, type AdminPage } from "../../app/navigation";

type TopBarProps = {
  activePage: AdminPage;
  search: string;
  onSearchChange: (value: string) => void;
};

export function TopBar({ activePage, search, onSearchChange }: TopBarProps) {
  return (
    <header className="top-bar">
      <div>
        <p className="eyebrow">Admin Console</p>
        <h1>{pageTitles[activePage]}</h1>
      </div>
      <label className="search-box">
        <Search aria-hidden="true" />
        <span className="sr-only">Search subscriptions</span>
        <input
          value={search}
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder="Search subscriptions..."
        />
      </label>
    </header>
  );
}
