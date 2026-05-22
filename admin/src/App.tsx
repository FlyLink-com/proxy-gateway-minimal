import { useMemo, useState } from "react";
import { type AdminPage } from "./app/navigation";
import { AdminLayout } from "./components/layout/admin-layout";
import { createAdminApiClient, type AdminApiClient } from "./features/subscriptions/api-client";
import {
  loadAdminSession,
  type AdminSession
} from "./features/subscriptions/admin-session";
import { ConnectionPanel } from "./features/subscriptions/connection-panel";
import { SubscriptionsPage } from "./features/subscriptions/subscriptions-page";
import { ApiPlaygroundPage } from "./pages/api-playground-page";
import { DiagnosticsPage } from "./pages/diagnostics-page";
import { NodesPage } from "./pages/nodes-page";
import { OverviewPage } from "./pages/overview-page";
import { SettingsPage } from "./pages/settings-page";

export function App() {
  const [activePage, setActivePage] = useState<AdminPage>("subscriptions");
  const [search, setSearch] = useState("");
  const [adminSession, setAdminSession] = useState(() => loadAdminSession());
  const apiClient = useMemo(
    () => createAdminApiClient(adminSession),
    [adminSession.baseUrl, adminSession.consoleToken]
  );

  return (
    <AdminLayout
      activePage={activePage}
      search={search}
      onSearchChange={setSearch}
      onNavigate={setActivePage}
    >
      <ConnectionPanel session={adminSession} onSave={setAdminSession} />
      {renderPage(activePage, search, apiClient, adminSession)}
    </AdminLayout>
  );
}

function renderPage(
  activePage: AdminPage,
  search: string,
  apiClient: AdminApiClient,
  adminSession: AdminSession
) {
  switch (activePage) {
    case "overview":
      return <OverviewPage apiClient={apiClient} />;
    case "subscriptions":
      return <SubscriptionsPage search={search} apiClient={apiClient} />;
    case "nodes":
      return <NodesPage apiClient={apiClient} />;
    case "diagnostics":
      return <DiagnosticsPage />;
    case "api-playground":
      return <ApiPlaygroundPage />;
    case "settings":
      return <SettingsPage session={adminSession} />;
  }
}
