import { Activity, Clock3, RadioTower, ShieldAlert } from "lucide-react";
import { type ReactNode, lazy, Suspense, useCallback, useEffect, useMemo, useState } from "react";
import {
  ADMIN_PRODUCTION_BASELINE_GROUPS,
  ADMIN_PRODUCTION_BASELINE_PAGES,
  type AdminProductionBaselinePage,
  type AdminProductionBaselinePageId
} from "../app/admin-production-baseline";
import { createAdminMonitorReadClient } from "../app/admin-monitor-read-client";
import { createAdminUsageLedgerClient } from "../app/admin-usage-ledger-client";
import { createAdminUserMonitorClient } from "../app/admin-user-monitor-client";
import {
  DataTable,
  EmptyState,
  MetricCard,
  PageHeader,
  PrivilegedGate,
  SectionPanel
} from "../components/primitives";
import "./admin-operations-shell.styles.css";
import { AdminMonitorWorkspace } from "./admin-monitor-workspace";
import { AdminUsageLedgerWorkspace } from "./admin-usage-ledger-workspace";
import { AdminUserMonitorWorkspace } from "./admin-user-monitor-workspace";

const PAGE_IDS = new Set<string>(Object.keys(ADMIN_PRODUCTION_BASELINE_PAGES));
type AdminOperationsPageId = AdminProductionBaselinePageId | "thirdPartyNodes";
const ThirdPartyAdminWorkspace = lazy(async () => {
  const module = await import("../features/third-party-node-names/third-party-admin-workspace");
  return { default: module.ThirdPartyAdminWorkspace };
});

function formatFormalHash(pageId: AdminOperationsPageId): string {
  return `#/admin/${pageId}`;
}

function formatPreviewHash(pageId: AdminOperationsPageId): string {
  return `#/admin-baseline/${pageId}`;
}

function parseHash(hash: string, preview: boolean): AdminOperationsPageId {
  const raw = hash.startsWith("#") ? hash.slice(1) : hash;
  const prefix = preview ? "/admin-baseline/" : "/admin/";
  try {
    const decoded = decodeURIComponent(raw);
    if (decoded === "/portal" || decoded.startsWith("/portal=") || decoded === "start") {
      return "dashboard";
    }
    if (!decoded.startsWith(prefix)) {
      return "dashboard";
    }
    const id = decoded.slice(prefix.length).split(/[/?#]/)[0] ?? "";
    if (!preview && id === "thirdPartyNodes") return "thirdPartyNodes";
    if (PAGE_IDS.has(id)) {
      return id as AdminProductionBaselinePageId;
    }
  } catch {
    return "dashboard";
  }
  return "dashboard";
}

function guardedFetch(onSessionExpired?: () => void): typeof fetch {
  return async (input, init) => {
    const response = await fetch(input, init);
    if (response.status === 401 && !init?.signal?.aborted) {
      onSessionExpired?.();
    }
    return response;
  };
}

export function AdminOperationsShell({
  onSessionExpired,
  preview
}: {
  onSessionExpired?: () => void;
  preview?: { title: string; banner: ReactNode; navLabel: string };
} = {}) {
  const isPreview = Boolean(preview);
  const formatPageHref = useCallback(
    (pageId: AdminOperationsPageId) => (isPreview ? formatPreviewHash(pageId) : formatFormalHash(pageId)),
    [isPreview]
  );

  function pageFromLocation(): AdminOperationsPageId {
    return parseHash(window.location.hash, isPreview);
  }

  const [requestedPageId, setPageId] = useState(pageFromLocation);
  // The baseline preview is deliberately limited to its existing read-only ten
  // pages, including if the shell mode changes while this route is mounted.
  const pageId = isPreview && requestedPageId === "thirdPartyNodes" ? "dashboard" : requestedPageId;
  const page = ADMIN_PRODUCTION_BASELINE_PAGES[pageId === "thirdPartyNodes" ? "dashboard" : pageId];
  const pageLabel = pageId === "thirdPartyNodes" ? "第三方节点" : page.label;

  useEffect(() => {
    function syncPage() {
      setPageId(pageFromLocation());
    }
    window.addEventListener("hashchange", syncPage);
    window.addEventListener("popstate", syncPage);
    return () => {
      window.removeEventListener("hashchange", syncPage);
      window.removeEventListener("popstate", syncPage);
    };
  }, [isPreview]);

  function navigate(nextPageId: AdminOperationsPageId) {
    if (isPreview && nextPageId === "thirdPartyNodes") return;
    const nextHash = formatPageHref(nextPageId);
    if (window.location.hash !== nextHash) {
      window.location.hash = nextHash;
    }
    setPageId(nextPageId);
  }

  const createMonitorClient = useMemo(
    () => () => createAdminMonitorReadClient({ fetcher: guardedFetch(onSessionExpired) }),
    [onSessionExpired]
  );
  const createUserClient = useMemo(
    () => () => createAdminUserMonitorClient({ fetcher: guardedFetch(onSessionExpired) }),
    [onSessionExpired]
  );
  const createUsageLedgerClient = useMemo(
    () => () => createAdminUsageLedgerClient({ fetcher: guardedFetch(onSessionExpired) }),
    [onSessionExpired]
  );

  return (
    <div className="admin-baseline-preview">
      <aside className="admin-baseline-preview-sidebar">
        <nav className="admin-baseline-preview-nav" aria-label={preview?.navLabel ?? "Admin 导航"}>
          {ADMIN_PRODUCTION_BASELINE_GROUPS.map((group) => (
            <div className="admin-baseline-preview-nav-group" key={group.id}>
              <p className="admin-baseline-preview-group">{group.label}</p>
              {group.pageIds.map((itemId) => (
                <button
                  aria-current={itemId === pageId ? "page" : undefined}
                  className={itemId === pageId ? "nav-item admin-baseline-preview-nav-item-active" : "nav-item"}
                  key={itemId}
                  onClick={() => navigate(itemId)}
                  type="button"
                >
                  <span className="nav-item-copy">{ADMIN_PRODUCTION_BASELINE_PAGES[itemId].label}</span>
                </button>
              ))}
            </div>
          ))}
          {!isPreview ? <div className="admin-baseline-preview-nav-group">
            <p className="admin-baseline-preview-group">订阅分发</p>
            <button
              aria-current={pageId === "thirdPartyNodes" ? "page" : undefined}
              className={pageId === "thirdPartyNodes" ? "nav-item admin-baseline-preview-nav-item-active" : "nav-item"}
              onClick={() => navigate("thirdPartyNodes")}
              type="button"
            ><span className="nav-item-copy">第三方节点</span></button>
          </div> : null}
        </nav>
      </aside>
      <main className="admin-baseline-preview-main">
        <div className="admin-baseline-preview-header">
          <PageHeader
            ariaLabel="Operator console title"
            description={isPreview ? "服务观测与资源只读诊断。" : "服务观测、资源诊断与授权订阅管理。"}
            title={preview?.title ?? "GCC WebOS · Admin Console"}
          />
        </div>
        {preview?.banner}
        <section aria-label={pageLabel} className="admin-baseline-preview-page">
          <h2>{pageLabel}</h2>
          {pageId === "thirdPartyNodes" ? (
            <Suspense fallback={<p role="status" aria-busy="true">正在加载第三方节点管理…</p>}>
              <ThirdPartyAdminWorkspace onSessionExpired={onSessionExpired} />
            </Suspense>
          ) : pageId === "userManagement" ? (
            <AdminUserMonitorWorkspace createClient={createUserClient} />
          ) : (
            <>
              {!isPreview && pageId === "usageMonitor" ? (
                <AdminUsageLedgerWorkspace
                  createClient={createUsageLedgerClient}
                  userManagementHref={formatPageHref("userManagement")}
                />
              ) : null}
              <AdminMonitorWorkspace createClient={createMonitorClient} formatPageHref={formatPageHref} pageId={pageId}>
                {pageId === "dashboard" ? <OverviewPanels /> : <InventoryPage page={page} />}
              </AdminMonitorWorkspace>
            </>
          )}
        </section>
      </main>
    </div>
  );
}

function OverviewPanels() {
  return (
    <>
      <div className="admin-baseline-preview-metrics">
        <MetricCard detail="未连接" icon={<Activity aria-hidden="true" />} label="Platform health" tone="neutral" value="未连接" />
        <MetricCard detail="未连接" icon={<ShieldAlert aria-hidden="true" />} label="Risk" tone="neutral" value="未连接" />
        <MetricCard detail="未连接" icon={<Clock3 aria-hidden="true" />} label="Freshness" tone="neutral" value="未连接" />
        <MetricCard detail="未连接" icon={<RadioTower aria-hidden="true" />} label="Coverage" tone="neutral" value="未连接" />
      </div>
      <SectionPanel title="Risk Queue"><p>未连接</p></SectionPanel>
      <SectionPanel title="Owner Routing"><p>未连接</p></SectionPanel>
      <SectionPanel title="Review"><p>未连接</p></SectionPanel>
      <SectionPanel title="Platform Metrics"><p>未连接</p></SectionPanel>
      <SectionPanel title="Platform Event Log"><p>未连接</p></SectionPanel>
    </>
  );
}

function InventoryPage({ page }: { page: AdminProductionBaselinePage }) {
  const fields = page.tableFields ?? [];

  return (
    <>
      {page.privileged ? (
        <PrivilegedGate
          capability="super-admin"
          description="安全授权数据尚未连接"
          state="unavailable"
          title="特权日志"
        />
      ) : (
        <EmptyState description="此功能尚未接入业务数据。" title="未连接" />
      )}
      <DataTable
        ariaLabel={`${page.label} layout inventory`}
        columns={fields.map((field) => ({
          header: field,
          key: field,
          render: () => null
        }))}
        getRowKey={() => "none"}
        rows={[]}
      />
    </>
  );
}
