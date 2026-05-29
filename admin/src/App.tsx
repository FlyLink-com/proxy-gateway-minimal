import { useEffect, useMemo, useState } from "react";
import { type AdminPage } from "./app/navigation";
import { AdminLayout } from "./components/layout/admin-layout";
import { createAdminApiClient, type AdminApiClient } from "./features/subscriptions/api-client";
import {
  loadAdminSession
} from "./features/subscriptions/admin-session";
import { ConnectionPanel } from "./features/subscriptions/connection-panel";
import { SubscriptionsPage } from "./features/subscriptions/subscriptions-page";
import { CompanySitePage } from "./features/company-site/company-site-page";
import { UserPortalPage } from "./features/user-portal/user-portal-page";
import { createLocalUserPortalClient } from "./features/user-portal/user-portal-client";
import { NodesPage } from "./pages/nodes-page";
import { OverviewPage } from "./pages/overview-page";
import { ProvisioningPage } from "./pages/provisioning-page";

type AppRoute = "admin" | "portal" | "site";

function routeFromHash(): AppRoute {
  if (window.location.hash === "#/site") {
    return "site";
  }
  return window.location.hash === "#/portal" ? "portal" : "admin";
}

export function App() {
  const [route, setRoute] = useState<AppRoute>(() => routeFromHash());
  const [activePage, setActivePage] = useState<AdminPage>("subscriptions");
  const [search, setSearch] = useState("");
  const [adminSession, setAdminSession] = useState(() => loadAdminSession());
  const apiClient = useMemo(
    () => createAdminApiClient(adminSession),
    [adminSession.baseUrl, adminSession.consoleToken]
  );
  const userPortalClient = useMemo(() => createLocalUserPortalClient(), []);

  useEffect(() => {
    function syncRoute() {
      setRoute(routeFromHash());
    }
    window.addEventListener("hashchange", syncRoute);
    return () => window.removeEventListener("hashchange", syncRoute);
  }, []);

  function openPortal() {
    window.location.hash = "/portal";
    setRoute("portal");
  }

  function openSite() {
    window.location.hash = "/site";
    setRoute("site");
  }

  function openAdmin() {
    window.location.hash = "";
    setRoute("admin");
  }

  if (route === "site") {
    return <CompanySitePage />;
  }

  if (route === "portal") {
    return <UserPortalPage portalClient={userPortalClient} onBackToAdmin={openAdmin} />;
  }

  return (
    <AdminLayout
      activePage={activePage}
      search={search}
      onSearchChange={setSearch}
      onNavigate={setActivePage}
      onOpenPortal={openPortal}
      onOpenSite={openSite}
    >
      <ConnectionPanel session={adminSession} onSave={setAdminSession} />
      {renderPage(activePage, search, apiClient)}
    </AdminLayout>
  );
}

function renderPage(
  activePage: AdminPage,
  search: string,
  apiClient: AdminApiClient
) {
  switch (activePage) {
    case "overview":
      return <OverviewPage apiClient={apiClient} />;
    case "provisioning":
      return <ProvisioningPage apiClient={apiClient} />;
    case "subscriptions":
      return <SubscriptionsPage search={search} apiClient={apiClient} />;
    case "nodes":
      return <NodesPage apiClient={apiClient} />;
  }
}
