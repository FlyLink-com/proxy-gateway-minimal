import { navSections, type AdminPage } from "../../app/navigation";
import { cn } from "../../lib/utils";

type AppSidebarProps = {
  activePage: AdminPage;
  onNavigate: (page: AdminPage) => void;
};

export function AppSidebar({ activePage, onNavigate }: AppSidebarProps) {
  return (
    <aside className="app-sidebar" aria-label="Admin navigation">
      <div className="brand">
        <div className="brand-mark">GC</div>
        <div>
          <div className="brand-name">GlobalCircle AI</div>
          <div className="brand-subtitle">运营与平台控制台</div>
        </div>
      </div>

      <nav className="nav-list">
        {navSections.map((section) => (
          <div className="nav-section" key={section.id}>
            <div className="nav-section-heading">
              <div className="nav-section-label">{section.label}</div>
              <div className="nav-section-description">{section.description}</div>
            </div>
            <div className="nav-section-items">
              {section.items.map((item) => {
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
            </div>
          </div>
        ))}
      </nav>
    </aside>
  );
}
