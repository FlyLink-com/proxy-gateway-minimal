import { type ReactNode } from "react";
import { AdminLocaleProvider, useAdminLocale } from "../../app/admin-locale";
import { ADMIN_UI_CONTRACT } from "../../app/admin-ui-contract";
import { type AdminPage } from "../../app/navigation";
import { AppSidebar } from "./app-sidebar";
import { TopBar } from "./top-bar";

type AdminLayoutProps = {
  activePage: AdminPage;
  showTopBar?: boolean;
  search: string;
  onSearchChange: (value: string) => void;
  onNavigate: (page: AdminPage) => void;
  children: ReactNode;
};

export function AdminLayout({
  activePage,
  showTopBar = true,
  search,
  onSearchChange,
  onNavigate,
  children
}: AdminLayoutProps) {
  return (
    <AdminLocaleProvider>
      <AdminLayoutShell
        activePage={activePage}
        showTopBar={showTopBar}
        search={search}
        onSearchChange={onSearchChange}
        onNavigate={onNavigate}
      >
        {children}
      </AdminLayoutShell>
    </AdminLocaleProvider>
  );
}

function AdminLayoutShell({
  activePage,
  showTopBar = true,
  search,
  onSearchChange,
  onNavigate,
  children
}: AdminLayoutProps) {
  const { copy, locale, setLocale } = useAdminLocale();

  return (
    <div
      className="admin-shell"
      data-density={ADMIN_UI_CONTRACT.appShell.density}
      data-shell-topbar={showTopBar ? "enabled" : "disabled"}
      data-ui-contract={ADMIN_UI_CONTRACT.appShell.contractId}
      data-ui-role="system"
    >
      <AppSidebar
        activePage={activePage}
        shellCopy={copy.sidebar}
        onNavigate={onNavigate}
      />
      <div className="admin-main">
        {showTopBar ? (
          <TopBar
            activePage={activePage}
            locale={locale}
            shellCopy={copy.topBar}
            onLocaleChange={setLocale}
            search={search}
            onSearchChange={onSearchChange}
          />
        ) : null}
        <section className="admin-content">{children}</section>
      </div>
    </div>
  );
}
