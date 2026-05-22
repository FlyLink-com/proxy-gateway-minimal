import { navItems, type AdminPage } from "../../app/navigation";
import { cn } from "../../lib/utils";

type AppSidebarProps = {
  activePage: AdminPage;
  onNavigate: (page: AdminPage) => void;
};

export function AppSidebar({ activePage, onNavigate }: AppSidebarProps) {
  return (
    <aside className="app-sidebar" aria-label="Admin navigation">
      <div className="brand">
        <div className="brand-mark">PG</div>
        <div>
          <div className="brand-name">Proxy Gateway</div>
          <div className="brand-subtitle">Subscription Admin</div>
        </div>
      </div>

      <nav className="nav-list">
        {navItems.map((item) => {
          const Icon = item.icon;
          const active = item.id === activePage;
          return (
            <button
              key={item.id}
              className={cn("nav-item", active && "nav-item-active")}
              type="button"
              aria-current={active ? "page" : undefined}
              onClick={() => onNavigate(item.id)}
            >
              <Icon aria-hidden="true" />
              <span>{item.label}</span>
            </button>
          );
        })}
      </nav>
    </aside>
  );
}
