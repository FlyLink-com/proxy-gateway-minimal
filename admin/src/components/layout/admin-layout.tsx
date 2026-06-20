import { type ReactNode } from "react";
import { ADMIN_UI_CONTRACT } from "../../app/admin-ui-contract";
import { type AdminPage } from "../../app/navigation";
import { AppSidebar } from "./app-sidebar";
import { TopBar } from "./top-bar";

type AdminLayoutProps = {
  activePage: AdminPage;
  search: string;
  onSearchChange: (value: string) => void;
  onNavigate: (page: AdminPage) => void;
  onOpenPortal: () => void;
  onOpenSite: () => void;
  riskNotificationCount?: number;
  connectionPanel?: ReactNode;
  connectionConfigured?: boolean;
  children: ReactNode;
};

export function AdminLayout({
  activePage,
  search,
  onSearchChange,
  onNavigate,
  onOpenPortal,
  onOpenSite,
  riskNotificationCount = 0,
  connectionPanel,
  connectionConfigured = false,
  children
}: AdminLayoutProps) {
  return (
    <div
      className="admin-shell"
      data-density={ADMIN_UI_CONTRACT.appShell.density}
      data-ui-contract={ADMIN_UI_CONTRACT.appShell.contractId}
      data-ui-role="system"
    >
      <AppSidebar
        activePage={activePage}
        search={search}
        onSearchChange={onSearchChange}
        onNavigate={onNavigate}
        onOpenPortal={onOpenPortal}
        onOpenSite={onOpenSite}
        riskNotificationCount={riskNotificationCount}
        connectionPanel={connectionPanel}
        connectionConfigured={connectionConfigured}
      />
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
