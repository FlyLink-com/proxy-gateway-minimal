import { lazy, Suspense, useEffect, useMemo, useState } from "react";
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
  createLocalUserPortalClient
} from "./features/user-portal/user-portal-client";
import { AdminSetupPage } from "./pages/admin-setup-page";
import { AdminSearchResultsPage } from "./pages/admin-search-results-page";
import { DashboardPage } from "./pages/dashboard-page";
import { PortalRequestsPage } from "./pages/portal-requests-page";
import { SubscriptionUsageMonitorPage } from "./pages/subscription-usage-monitor-page";

type AppRoute = "admin" | "portal" | "portalPreview" | "portalRegister" | "site";

const UserPortalRoute = lazy(async () => {
  const module = await import("./features/user-portal/user-portal-route");
  return { default: module.UserPortalRoute };
});

function routeFromLocation(): AppRoute {
  const normalizedPath = window.location.pathname.replace(/\/+$/, "") || "/";
  if (normalizedPath === "/portal/register") {
    return "portalRegister";
  }
  if (normalizedPath === "/portal") {
    return "portal";
  }
  if (window.location.hash === "#/site") {
    return "site";
  }
  if (window.location.hash === "#/portal-preview") {
    return "portalPreview";
  }
  return window.location.hash === "#/portal" ? "portal" : "admin";
}

export function App() {
  const [route, setRoute] = useState<AppRoute>(() => routeFromLocation());
  const [activePage, setActivePage] = useState<AdminPage>("dashboard");
  const [search, setSearch] = useState("");
  const [riskNotificationCount, setRiskNotificationCount] = useState(0);
  const [adminSession, setAdminSession] = useState(() => loadAdminSession());
  const fixturePreviewEnabled = isAdminFixturePreviewEnabled();
  const adminApiConfigured = fixturePreviewEnabled || adminSession.consoleToken.trim().length > 0;
  const localUserPortalClient = useMemo(() => createLocalUserPortalClient({
    demoSubscriptionUrl: "https://sub.example.test/import/local-preview-visible-once"
  }), []);

  useEffect(() => {
    function syncRoute() {
      setRoute(routeFromLocation());
    }
    window.addEventListener("hashchange", syncRoute);
    window.addEventListener("popstate", syncRoute);
    return () => {
      window.removeEventListener("hashchange", syncRoute);
      window.removeEventListener("popstate", syncRoute);
    };
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

  if (route === "portalRegister") {
    return (
      <Suspense fallback={<PortalRouteFallback />}>
        <UserPortalRoute mode="register" />
      </Suspense>
    );
  }

  if (route === "portal") {
    return (
      <Suspense fallback={<PortalRouteFallback />}>
        <UserPortalRoute mode="login" />
      </Suspense>
    );
  }

  if (route === "portalPreview") {
    return (
      <UserPortalPage
        portalClient={localUserPortalClient}
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
        <strong>Fixture preview</strong>
        <span>{ADMIN_FIXTURE_PREVIEW_DATA.generatedLabel}</span>
      </div>
      <p>Safe synthetic data only. No production Admin API is connected, and mutation workflows remain locked.</p>
    </aside>
  );
}

function PortalRouteFallback() {
  return (
    <main className="portal-auth-shell">
      <section className="portal-auth-card" aria-label="User portal loading">
        <div className="portal-auth-header">
          <h1>GCC WebOS</h1>
          <p>Loading user portal...</p>
        </div>
      </section>
    </main>
  );
}
