import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import {
  ADMIN_FIXTURE_PREVIEW_DATA,
  isAdminFixturePreviewEnabled
} from "./app/admin-fixture-preview";
import {
  formatAdminRouteHash,
  parseAdminRouteHash,
  type AdminPage
} from "./app/navigation";
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
  const initialAdminRoute = parseAdminRouteHash(window.location.hash);
  const [route, setRoute] = useState<AppRoute>(() => routeFromLocation());
  const [activePage, setActivePage] = useState<AdminPage>(initialAdminRoute?.page ?? "dashboard");
  const [search, setSearch] = useState("");
  const [, setRiskNotificationCount] = useState(0);
  const [adminSession, setAdminSession] = useState(() => loadAdminSession());
  const fixturePreviewEnabled = isAdminFixturePreviewEnabled();
  const adminApiConfigured = fixturePreviewEnabled || adminSession.consoleToken.trim().length > 0;

  useEffect(() => {
    function syncRoute() {
      const nextRoute = routeFromLocation();
      const nextAdminRoute = parseAdminRouteHash(window.location.hash);
      setRoute(nextRoute);
      if (nextRoute === "admin" && nextAdminRoute) {
        const canonicalHash = formatAdminRouteHash(nextAdminRoute.page, nextAdminRoute.navId);
        if (window.location.hash !== canonicalHash) {
          window.history.replaceState(null, "", canonicalHash);
        }
        setActivePage(nextAdminRoute.page);
        setSearch("");
      } else if (nextRoute !== "admin") {
        setSearch("");
      }
    }
    syncRoute();
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
    const nextHash = formatAdminRouteHash(page);
    if (window.location.hash !== nextHash) {
      window.location.hash = nextHash;
    }
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
      <PortalPreviewRoute onBackToAdmin={openAdmin} />
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

function PortalPreviewRoute({
  onBackToAdmin
}: {
  onBackToAdmin: () => void;
}) {
  const localUserPortalClient = useMemo(() => createLocalUserPortalClient({
    demoSubscriptionUrl: "https://sub.example.test/import/local-preview-visible-once"
  }), []);

  return (
    <UserPortalPage
      portalClient={localUserPortalClient}
      onBackToAdmin={onBackToAdmin}
    />
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
