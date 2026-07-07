import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import {
  ADMIN_FIXTURE_PREVIEW_DATA,
  isAdminFixturePreviewEnabled
} from "./app/admin-fixture-preview";
import {
  formatAdminRouteHash,
  isPageSectionRouteEnabled,
  parseAdminRouteHash,
  usesAdminShellTopBar,
  type AdminPage
} from "./app/navigation";
import { AdminLayout } from "./components/layout/admin-layout";
import {
  clearAdminSession,
  loadAdminSession
} from "./features/subscriptions/admin-session";
import { AdminApiError, createAdminApiClient } from "./features/subscriptions/api-client";
import type {
  AdminListPageInfo,
  AdminPaymentOrderSummary,
  NodeBandwidthSummary,
  PlatformAccountSummary,
  PlatformEntitlementSummary,
  PortalAccessRequestSummary,
  SubscriptionUsageMonitor,
  SubscriptionUsageMonitorRow
} from "./features/subscriptions/types";
import { CompanySitePage } from "./features/company-site/company-site-page";
import { createAdminProtectedAuthClient } from "./features/admin-auth/admin-auth-client";
import { AdminProtectedAuthShell } from "./features/admin-auth/admin-protected-auth-shell";
import { AdminSetupPage } from "./pages/admin-setup-page";
import {
  AdminSafeReadPage,
  type OrderManagementLifecycleHandlers,
  type UserManagementLifecycleHandlers
} from "./pages/admin-safe-read-page";
import { AdminSearchResultsPage } from "./pages/admin-search-results-page";
import { DashboardPage } from "./pages/dashboard-page";
import { PortalRequestsPage } from "./pages/portal-requests-page";
import { SubscriptionUsageMonitorPage } from "./pages/subscription-usage-monitor-page";

type AppRoute = "admin" | "portal" | "portalRegister" | "site";

type UserManagementSourceData = {
  accounts: PlatformAccountSummary[];
  entitlements: PlatformEntitlementSummary[];
  usageRows: SubscriptionUsageMonitorRow[];
};

type UserManagementDataState = {
  description: string;
  title: string;
  tone: "error" | "loading";
};

type UserManagementReadModel = {
  accounts?: PlatformAccountSummary[];
  entitlements?: PlatformEntitlementSummary[];
  state?: UserManagementDataState;
  usageRows?: SubscriptionUsageMonitorRow[];
};

type OrderManagementSourceData = {
  pageInfo?: AdminListPageInfo;
  payments?: AdminPaymentOrderSummary[];
  requests: PortalAccessRequestSummary[];
  usageMonitor?: SubscriptionUsageMonitor;
};

const ORDER_MANAGEMENT_PAGE_SIZE = 20;
const USER_MANAGEMENT_LOADING_STATE: UserManagementDataState = {
  description: "Loading protected account summaries from the Admin API.",
  title: "Loading user accounts",
  tone: "loading"
};
const UserPortalRoute = lazy(async () => {
  const module = await import("./features/user-portal/user-portal-route");
  return { default: module.UserPortalRoute };
});

export function resolveUserManagementReadModel({
  data,
  dataState,
  liveMode
}: {
  data: UserManagementSourceData | null;
  dataState: UserManagementDataState | null;
  liveMode: boolean;
}): UserManagementReadModel {
  if (!liveMode) {
    return {
      accounts: dataState ? [] : data?.accounts,
      entitlements: dataState ? [] : data?.entitlements,
      state: dataState ?? undefined,
      usageRows: dataState ? [] : data?.usageRows
    };
  }

  if (dataState) {
    return {
      accounts: [],
      entitlements: [],
      state: dataState,
      usageRows: []
    };
  }

  if (!data) {
    return {
      accounts: [],
      entitlements: [],
      state: USER_MANAGEMENT_LOADING_STATE,
      usageRows: []
    };
  }

  return {
    accounts: data.accounts,
    entitlements: data.entitlements,
    usageRows: data.usageRows
  };
}

function routeFromLocation(): AppRoute {
  const normalizedPath = window.location.pathname.replace(/\/+$/, "") || "/";
  if (normalizedPath === "/portal/register") {
    return "portalRegister";
  }
  if (normalizedPath === "/portal" || window.location.hash === "#/portal") {
    return "portal";
  }
  if (window.location.hash === "#/site") {
    return "site";
  }
  return "admin";
}

export function App() {
  const initialAdminRoute = parseAdminRouteHash(window.location.hash);
  const [route, setRoute] = useState<AppRoute>(() => routeFromLocation());
  const [activePage, setActivePage] = useState<AdminPage>(initialAdminRoute?.page ?? "dashboard");
  const [activeSectionByPage, setActiveSectionByPage] = useState<Partial<Record<AdminPage, string>>>(() => (
    initialAdminRoute?.navId ? { [initialAdminRoute.page]: initialAdminRoute.navId } : {}
  ));
  const [search, setSearch] = useState("");
  const [riskNotificationCount, setRiskNotificationCount] = useState(0);
  const [adminSession, setAdminSession] = useState(() => loadAdminSession());
  const [userManagementData, setUserManagementData] = useState<UserManagementSourceData | null>(null);
  const [userManagementDataState, setUserManagementDataState] = useState<UserManagementDataState | null>(null);
  const [userManagementRefreshVersion, setUserManagementRefreshVersion] = useState(0);
  const [orderManagementData, setOrderManagementData] = useState<OrderManagementSourceData | null>(null);
  const [orderManagementRefreshVersion, setOrderManagementRefreshVersion] = useState(0);
  const [nodeBandwidthData, setNodeBandwidthData] = useState<NodeBandwidthSummary | null>(null);
  const [usageMonitorData, setUsageMonitorData] = useState<SubscriptionUsageMonitor | null>(null);
  const fixturePreviewEnabled = isAdminFixturePreviewEnabled();
  const adminApiConfigured = fixturePreviewEnabled
    || adminSession.authMode === "protectedSession";
  const adminProtectedAuthClient = useMemo(() => createAdminProtectedAuthClient(), []);

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
        setActiveSectionByPage((current) => {
          const next = { ...current };
          if (nextAdminRoute.navId) {
            next[nextAdminRoute.page] = nextAdminRoute.navId;
          } else {
            delete next[nextAdminRoute.page];
          }
          return next;
        });
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

  useEffect(() => {
    if (activePage !== "userManagement" || fixturePreviewEnabled || !adminApiConfigured) {
      return;
    }

    let cancelled = false;
    const client = createAdminApiClient(adminSession);
    setUserManagementDataState({
      description: "Loading protected account summaries from the Admin API.",
      title: "Loading user accounts",
      tone: "loading"
    });

    client.listPlatformAccounts().then(async (accounts) => {
      const [entitlementsResult, usageMonitorResult] = await Promise.allSettled([
        client.listPlatformEntitlements(),
        client.listSubscriptionUsageMonitor()
      ]);
      if (!cancelled) {
        setUserManagementData({
          accounts,
          entitlements: entitlementsResult.status === "fulfilled" ? entitlementsResult.value : [],
          usageRows: usageMonitorResult.status === "fulfilled" ? usageMonitorResult.value.items : []
        });
        setUserManagementDataState(null);
      }
    }).catch((caught) => {
      if (!cancelled) {
        if (caught instanceof AdminApiError && caught.status === 401) {
          setUserManagementData({
            accounts: [],
            entitlements: [],
            usageRows: []
          });
          setUserManagementDataState({
            description: "Sign in again or restart the local Admin dev server with its protected API bridge.",
            title: "Admin session required",
            tone: "error"
          });
          setAdminSession(clearAdminSession({ blockLocalInspection: true }));
          return;
        }
        setUserManagementData({
          accounts: [],
          entitlements: [],
          usageRows: []
        });
        setUserManagementDataState({
          description: caught instanceof Error
            ? caught.message
            : "Protected account summaries could not be loaded.",
          title: "User Management API unavailable",
          tone: "error"
        });
      }
    });

    return () => {
      cancelled = true;
    };
  }, [
    activePage,
    adminApiConfigured,
    adminSession,
    fixturePreviewEnabled,
    userManagementRefreshVersion
  ]);

  useEffect(() => {
    if (activePage !== "usageMonitor" || fixturePreviewEnabled || !adminApiConfigured) {
      return;
    }

    let cancelled = false;
    const client = createAdminApiClient(adminSession);
    setUsageMonitorData(null);

    client.listSubscriptionUsageMonitor().then((monitor) => {
      if (!cancelled) {
        setUsageMonitorData(monitor);
      }
    }).catch(() => {
      if (!cancelled) {
        setUsageMonitorData(null);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [
    activePage,
    adminApiConfigured,
    adminSession,
    fixturePreviewEnabled
  ]);

  useEffect(() => {
    if (activePage !== "nodeBandwidth" || fixturePreviewEnabled || !adminApiConfigured) {
      return;
    }

    let cancelled = false;
    const client = createAdminApiClient(adminSession);
    setNodeBandwidthData(null);

    client.listNodeBandwidthSummary().then((summary) => {
      if (!cancelled) {
        setNodeBandwidthData(summary);
      }
    }).catch(() => {
      if (!cancelled) {
        setNodeBandwidthData(null);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [
    activePage,
    adminApiConfigured,
    adminSession,
    fixturePreviewEnabled
  ]);

  useEffect(() => {
    if (activePage !== "orderManagement" || fixturePreviewEnabled || !adminApiConfigured) {
      return;
    }

    let cancelled = false;
    const client = createAdminApiClient(adminSession);
    setOrderManagementData(null);

    async function loadOrderManagementWithUsage() {
      const usageResult = client.listSubscriptionUsageMonitor();
      const paymentsResult = client.listPaymentOrders().catch(() => undefined);
      try {
        const [page, usageMonitor, payments] = await Promise.all([
          client.listPortalAccessRequestPage({
            limit: ORDER_MANAGEMENT_PAGE_SIZE,
            offset: 0
          }),
          usageResult.catch(() => undefined),
          paymentsResult
        ]);
        if (!cancelled) {
          setOrderManagementData({
            pageInfo: page.pageInfo,
            payments: payments?.orders ?? [],
            requests: page.items,
            usageMonitor
          });
          setUsageMonitorData(usageMonitor ?? null);
        }
      } catch {
        try {
          const [requests, usageMonitor, payments] = await Promise.all([
            client.listPortalAccessRequests(),
            usageResult.catch(() => undefined),
            paymentsResult
          ]);
          if (!cancelled) {
            setOrderManagementData({
              pageInfo: {
                limit: ORDER_MANAGEMENT_PAGE_SIZE,
                nextOffset: null,
                offset: 0,
                previousOffset: null,
                returnedRows: requests.length,
                totalRows: requests.length
              },
              payments: payments?.orders ?? [],
              requests,
              usageMonitor
            });
            setUsageMonitorData(usageMonitor ?? null);
          }
        } catch {
          if (!cancelled) {
            setOrderManagementData(null);
          }
        }
      }
    }

    void loadOrderManagementWithUsage();

    return () => {
      cancelled = true;
    };
  }, [
    activePage,
    adminApiConfigured,
    adminSession,
    fixturePreviewEnabled,
    orderManagementRefreshVersion
  ]);

  function openSite() {
    window.location.hash = "/site";
    setRoute("site");
  }

  function navigateAdminPage(page: AdminPage, navId?: string) {
    const routeNavId = navId && isPageSectionRouteEnabled(page, navId) ? navId : undefined;
    setActivePage(page);
    setActiveSectionByPage((current) => {
      const next = { ...current };
      if (routeNavId) {
        next[page] = routeNavId;
      } else {
        delete next[page];
      }
      return next;
    });
    setSearch("");
    window.location.hash = formatAdminRouteHash(page, routeNavId);
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

  const protectedAuthPanel = (
    <AdminProtectedAuthShell
      client={adminProtectedAuthClient}
      onAuthenticated={setAdminSession}
    />
  );

  if (!adminApiConfigured) {
    return (
      <AdminSetupPage
        onOpenSite={openSite}
        protectedAuthPanel={protectedAuthPanel}
      />
    );
  }

  function refreshUserManagementData() {
    setUserManagementRefreshVersion((version) => version + 1);
  }

  const userManagementLifecycle: UserManagementLifecycleHandlers | undefined = fixturePreviewEnabled
    || userManagementData === null
    || userManagementDataState?.tone === "error"
    ? undefined
    : {
      create: async (input) => {
        const client = createAdminApiClient(adminSession);
        const result = await client.createPlatformAccount(input);
        refreshUserManagementData();
        return result;
      },
      createEntitlement: async (userId, input) => {
        const client = createAdminApiClient(adminSession);
        const result = await client.createPlatformEntitlement(userId, input);
        refreshUserManagementData();
        return result;
      },
      disable: async (userId, input) => {
        const client = createAdminApiClient(adminSession);
        await client.disablePlatformAccount(userId, input);
        refreshUserManagementData();
      },
      previewDelete: async (userId, input) => {
        const client = createAdminApiClient(adminSession);
        return client.previewPlatformAccountDeletion(userId, input);
      },
      update: async (userId, input) => {
        const client = createAdminApiClient(adminSession);
        await client.updatePlatformAccount(userId, input);
        refreshUserManagementData();
      }
    };

  function refreshOrderManagementData() {
    setOrderManagementRefreshVersion((version) => version + 1);
  }

  async function loadOrderManagementPage(page: number) {
    const offset = Math.max(0, page - 1) * ORDER_MANAGEMENT_PAGE_SIZE;
    const client = createAdminApiClient(adminSession);
    const nextPage = await client.listPortalAccessRequestPage({
      limit: ORDER_MANAGEMENT_PAGE_SIZE,
      offset
    });
    setOrderManagementData((current) => ({
      pageInfo: nextPage.pageInfo,
      payments: current?.payments,
      requests: nextPage.items,
      usageMonitor: current?.usageMonitor
    }));
  }

  const orderManagementLifecycle: OrderManagementLifecycleHandlers | undefined = fixturePreviewEnabled || orderManagementData === null
    ? undefined
    : {
      previewApproval: async (requestRef, input) => {
        const client = createAdminApiClient(adminSession);
        return client.previewPortalAccessRequestApproval(requestRef, input);
      },
      updateTrafficLimit: async (requestRef, input) => {
        const client = createAdminApiClient(adminSession);
        const update = await client.updatePortalAccessRequestTrafficLimit(requestRef, input);
        refreshOrderManagementData();
        return update;
      },
      quoteRefund: async (orderRef, input) => {
        const client = createAdminApiClient(adminSession);
        return client.quotePaymentRefund(orderRef, input);
      },
      approveRefund: async (orderRef, input) => {
        const client = createAdminApiClient(adminSession);
        const refund = await client.approvePaymentRefund(orderRef, input);
        refreshOrderManagementData();
        return refund;
      }
    };
  const userManagementReadModel = resolveUserManagementReadModel({
    data: userManagementData,
    dataState: userManagementDataState,
    liveMode: adminApiConfigured && !fixturePreviewEnabled
  });

  return (
    <AdminLayout
      activePage={activePage}
      showTopBar={usesAdminShellTopBar(activePage)}
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
      ) : renderPage(
        activePage,
        navigateAdminPage,
        setRiskNotificationCount,
        fixturePreviewEnabled,
        userManagementReadModel,
        orderManagementData,
        nodeBandwidthData,
        usageMonitorData,
        userManagementLifecycle,
        orderManagementLifecycle,
        fixturePreviewEnabled || orderManagementData === null ? undefined : loadOrderManagementPage,
        activeSectionByPage[activePage] && isPageSectionRouteEnabled(activePage, activeSectionByPage[activePage])
          ? activeSectionByPage[activePage]
          : undefined,
        (navId) => {
          if (!isPageSectionRouteEnabled(activePage, navId)) {
            return;
          }
          setActiveSectionByPage((current) => ({
            ...current,
            [activePage]: navId
          }));
          window.location.hash = formatAdminRouteHash(activePage, navId);
        }
      )}
    </AdminLayout>
  );
}

function renderPage(
  activePage: AdminPage,
  onNavigate: (page: AdminPage, navId?: string) => void,
  onRiskCountChange: (count: number) => void,
  fixturePreviewEnabled: boolean,
  userManagementReadModel: UserManagementReadModel,
  orderManagementData: OrderManagementSourceData | null,
  nodeBandwidthData: NodeBandwidthSummary | null,
  usageMonitorData: SubscriptionUsageMonitor | null,
  userManagementLifecycle?: UserManagementLifecycleHandlers,
  orderManagementLifecycle?: OrderManagementLifecycleHandlers,
  onOrderManagementPageChange?: (page: number) => void | Promise<void>,
  activeModuleNavId?: string,
  onActiveModuleNavIdChange?: (navId: string) => void
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
      return (
        <PortalRequestsPage
          activeModuleNavId={activeModuleNavId}
          fixturePreviewEnabled={fixturePreviewEnabled}
          onActiveModuleNavIdChange={onActiveModuleNavIdChange}
        />
      );
    case "usageMonitor":
      return (
        <SubscriptionUsageMonitorPage
          activeModuleNavId={activeModuleNavId}
          fixturePreviewEnabled={fixturePreviewEnabled}
          monitor={usageMonitorData ?? undefined}
          onActiveModuleNavIdChange={onActiveModuleNavIdChange}
        />
      );
    case "userManagement":
      return (
        <AdminSafeReadPage
          page={activePage}
          userManagementAccounts={userManagementReadModel.accounts}
          userManagementEntitlements={userManagementReadModel.entitlements}
          userManagementState={userManagementReadModel.state}
          userManagementLifecycle={userManagementLifecycle}
          userManagementUsageRows={userManagementReadModel.usageRows}
        />
      );
    case "orderManagement":
      return (
        <AdminSafeReadPage
          page={activePage}
          orderManagementLifecycle={orderManagementLifecycle}
          orderManagementPageInfo={orderManagementData?.pageInfo}
          onOrderManagementPageChange={onOrderManagementPageChange}
          orderManagementPayments={orderManagementData?.payments && orderManagementData.payments.length > 0
            ? orderManagementData.payments
            : undefined}
          orderManagementRequests={orderManagementData?.requests}
          orderManagementUsageMonitor={orderManagementData?.usageMonitor ?? usageMonitorData ?? undefined}
        />
      );
    case "userAccessLogs":
    case "userOperationLogs":
    case "nodeHealth":
    case "nodeLogs":
    case "nodeBandwidth":
      return <AdminSafeReadPage page={activePage} nodeBandwidthSummary={nodeBandwidthData ?? undefined} />;
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

function PortalRouteFallback() {
  return <main className="portal-auth-shell" aria-busy="true" aria-label="Loading user portal" />;
}
