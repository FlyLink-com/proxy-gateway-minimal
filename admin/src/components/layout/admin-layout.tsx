import { type ReactNode } from "react";
import { type AdminPage } from "../../app/navigation";
import { AppSidebar } from "./app-sidebar";
import { TopBar } from "./top-bar";

type AdminLayoutProps = {
  activePage: AdminPage;
  search: string;
  onSearchChange: (value: string) => void;
  onNavigate: (page: AdminPage) => void;
  children: ReactNode;
};

export function AdminLayout({
  activePage,
  search,
  onSearchChange,
  onNavigate,
  children
}: AdminLayoutProps) {
  return (
    <div className="admin-shell">
      <AppSidebar activePage={activePage} onNavigate={onNavigate} />
      <div className="admin-main">
        <TopBar
          activePage={activePage}
          search={search}
          onSearchChange={onSearchChange}
        />
        <section className="admin-content">{children}</section>
      </div>
    </div>
  );
}
