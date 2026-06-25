import { useEffect, useMemo, useState } from "react";
import {
  ADMIN_FIXTURE_PREVIEW_DATA,
  isAdminFixturePreviewEnabled
} from "./app/admin-fixture-preview";
import { type AdminPage } from "./app/navigation";
import { AdminLayout } from "./components/layout/admin-layout";
import {
  loadAdminSession
} from "./features/subscriptions/admin-session";
import { ConnectionPanel } from "./features/subscriptions/connection-panel";
import { CompanySitePage } from "./features/company-site/company-site-page";
import { UserPortalPage } from "./features/user-portal/user-portal-page";
import {
  createHttpUserPortalClient,
  createLocalUserPortalClient
} from "./features/user-portal/user-portal-client";
import { AdminSetupPage } from "./pages/admin-setup-page";
import { AdminSearchResultsPage } from "./pages/admin-search-results-page";
import { DashboardPage } from "./pages/dashboard-page";
import { PortalRequestsPage } from "./pages/portal-requests-page";
import { SubscriptionUsageMonitorPage } from "./pages/subscription-usage-monitor-page";

type AppRoute = "admin" | "portal" | "portalPreview" | "site";

function routeFromHash(): AppRoute {
  if (window.location.hash === "#/site") {
    return "site";
  }
  if (window.location.hash === "#/portal-preview") {
    return "portalPreview";
  }
  return window.location.hash === "#/portal" ? "portal" : "admin";
}

export function App() {
  const [route, setRoute] = useState<AppRoute>(() => routeFromHash());
  const [activePage, setActivePage] = useState<AdminPage>("dashboard");
  const [search, setSearch] = useState("");
  const [riskNotificationCount, setRiskNotificationCount] = useState(0);
  const [adminSession, setAdminSession] = useState(() => loadAdminSession());
  const fixturePreviewEnabled = isAdminFixturePreviewEnabled();
  const adminApiConfigured = fixturePreviewEnabled || adminSession.consoleToken.trim().length > 0;
  const httpUserPortalClient = useMemo(() => createHttpUserPortalClient(), []);
  const localUserPortalClient = useMemo(() => createLocalUserPortalClient({
    demoSubscriptionUrl: "https://sub.example.test/import/local-preview-visible-once"
  }), []);

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

  function navigateAdminPage(page: AdminPage) {
    setActivePage(page);
    setSearch("");
  }

  if (route === "site") {
    return <CompanySitePage />;
  }

  if (route === "portal" || route === "portalPreview") {
    return (
      <UserPortalPage
        portalClient={route === "portalPreview" ? localUserPortalClient : httpUserPortalClient}
        onBackToAdmin={openAdmin}
      />
    );
  }

  const connectionPanel = <ConnectionPanel session={adminSession} onSave={setAdminSession} />;

  if (!adminApiConfigured) {
    return (
      <AdminSetupPage
        connectionPanel={connectionPanel}
        onOpenPortal={openPortal}
        onOpenSite={openSite}
      />
    );
  }

  return (
    <AdminLayout
      activePage={activePage}
      search={search}
      onSearchChange={setSearch}
      onNavigate={navigateAdminPage}
    >
      {fixturePreviewEnabled ? <FixturePreviewBanner /> : null}
      {search.trim() ? (
        <AdminSearchResultsPage
          searchQuery={search}
          onNavigate={navigateAdminPage}
        />
      ) : renderPage(activePage, navigateAdminPage, setRiskNotificationCount, fixturePreviewEnabled)}
    </AdminLayout>
  );
}

function renderPage(
  activePage: AdminPage,
  onNavigate: (page: AdminPage) => void,
  onRiskCountChange: (count: number) => void,
  fixturePreviewEnabled: boolean
) {
  switch (activePage) {
    case "dashboard":
      return (
        <DashboardPage
          fixturePreviewEnabled={fixturePreviewEnabled}
          onNavigate={onNavigate}
          onRiskCountChange={onRiskCountChange}
        />
      );
    case "portalRequests":
      return <PortalRequestsPage fixturePreviewEnabled={fixturePreviewEnabled} />;
    case "usageMonitor":
      return <SubscriptionUsageMonitorPage fixturePreviewEnabled={fixturePreviewEnabled} />;
  }
}

function FixturePreviewBanner() {
  return (
    <aside className="admin-fixture-preview-banner" aria-label="Admin fixture preview status">
      <div>
        <strong>Preview data</strong>
        <span>{ADMIN_FIXTURE_PREVIEW_DATA.generatedLabel}</span>
      </div>
      <p>Synthetic data only · production mutations locked.</p>
    </aside>
  );
}
