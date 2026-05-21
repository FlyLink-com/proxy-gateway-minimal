import { useState } from "react";
import { type AdminPage } from "./app/navigation";
import { AdminLayout } from "./components/layout/admin-layout";
import { SubscriptionsPage } from "./features/subscriptions/subscriptions-page";
import { ApiPlaygroundPage } from "./pages/api-playground-page";
import { DiagnosticsPage } from "./pages/diagnostics-page";
import { NodesPage } from "./pages/nodes-page";
import { OverviewPage } from "./pages/overview-page";
import { SettingsPage } from "./pages/settings-page";

export function App() {
  const [activePage, setActivePage] = useState<AdminPage>("subscriptions");
  const [search, setSearch] = useState("");

  return (
    <AdminLayout
      activePage={activePage}
      search={search}
      onSearchChange={setSearch}
      onNavigate={setActivePage}
    >
      {renderPage(activePage, search)}
    </AdminLayout>
  );
}

function renderPage(activePage: AdminPage, search: string) {
  switch (activePage) {
    case "overview":
      return <OverviewPage />;
    case "subscriptions":
      return <SubscriptionsPage search={search} />;
    case "nodes":
      return <NodesPage />;
    case "diagnostics":
      return <DiagnosticsPage />;
    case "api-playground":
      return <ApiPlaygroundPage />;
    case "settings":
      return <SettingsPage />;
  }
}
