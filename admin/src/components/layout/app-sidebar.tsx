import {
  Bell,
  ChevronUp,
  ExternalLink,
  Lock,
  PanelTopOpen,
  Settings,
  ShieldCheck,
} from "lucide-react";
import { useEffect, useRef, useState, type ReactNode, type ToggleEvent } from "react";
import {
  createAppLibrarySearchIndex,
  getPlannedApp,
  getPluginApp,
  getUtilityApps,
  getWorkspacePageApp,
  matchesAppSearch,
  normalizeAppSearchText
} from "../../app/admin-app-manifest";
import { consoleSections, pageSubNavigation, pageTitles, type AdminPage } from "../../app/navigation";
import { cn } from "../../lib/utils";
import { AppLibrary, WorkspaceAppbar } from "../primitives";

type AppSidebarProps = {
  activePage: AdminPage;
  search: string;
  onSearchChange: (value: string) => void;
  onNavigate: (page: AdminPage) => void;
  onOpenPortal: () => void;
  onOpenSite: () => void;
  riskNotificationCount?: number;
  connectionPanel?: ReactNode;
  connectionConfigured?: boolean;
};

export function AppSidebar({
  activePage,
  search,
  onSearchChange,
  onNavigate,
  onOpenPortal,
  onOpenSite,
  riskNotificationCount = 0,
  connectionPanel,
  connectionConfigured = false
}: AppSidebarProps) {
  const [appLibraryOpen, setAppLibraryOpen] = useState(false);
  const appLibraryRef = useRef<HTMLDetailsElement>(null);
  const appLibrarySearchRef = useRef<HTMLInputElement>(null);
  const activeSections = consoleSections.filter((section) => section.items.length > 0);
  const plannedSections = consoleSections.filter((section) => section.items.length === 0);
  const moduleEntries = activeSections.flatMap((section) => section.items.flatMap((item) => (
    pageSubNavigation[item.id].map((module) => ({
      module,
      page: item.id,
      pageLabel: pageTitles[item.id],
      sectionLabel: section.label
    }))
  )));
  const appSearchEntries = createAppLibrarySearchIndex();
  const appSearchEntriesById = new Map(appSearchEntries.map((entry) => [entry.appId, entry]));
  const normalizedSearch = normalizeAppSearchText(search);
  const matchesLibrarySearch = (...values: Array<string | undefined>) => (
    !normalizedSearch || normalizeAppSearchText(values.filter(Boolean).join(" ")).includes(normalizedSearch)
  );
  const matchesManifestEntry = (appId?: string, ...fallbackValues: Array<string | undefined>) => {
    const searchEntry = appId ? appSearchEntriesById.get(appId) : undefined;
    if (searchEntry) {
      return matchesAppSearch(searchEntry, normalizedSearch);
    }
    return matchesLibrarySearch(...fallbackValues);
  };
  const visibleUtilityApps = getUtilityApps().filter((app) => (
    matchesManifestEntry(app.id, app.label, app.description, ...app.aliases)
  ));
  const visibleUtilityAppById = new Map(visibleUtilityApps.map((app) => [app.id, app]));
  const pageEntries = activeSections.flatMap((section) => section.items.map((item) => ({
    item,
    section
  }))).filter((entry) => matchesManifestEntry(
    getWorkspacePageApp(entry.item.id)?.id,
    entry.item.label,
    pageTitles[entry.item.id],
    entry.section.label,
    entry.section.description,
    entry.section.responsibility
  ));
  const visibleModuleEntries = moduleEntries.filter((entry) => matchesManifestEntry(
    getPluginApp(entry.module.id, entry.page)?.id,
    entry.module.label,
    entry.module.description,
    entry.module.owner,
    entry.pageLabel,
    entry.sectionLabel
  ));
  const visiblePlannedSections = plannedSections.filter((section) => matchesManifestEntry(
    getPlannedApp(section.id)?.id,
    section.label,
    section.description,
    section.responsibility,
    section.entryGate
  ));
  const visibleUtilityCount = visibleUtilityApps.length;
  const resultCount = pageEntries.length + visibleModuleEntries.length + visiblePlannedSections.length + visibleUtilityCount;

  useEffect(() => {
    if (!appLibraryOpen) {
      return;
    }

    const focusSearch = () => appLibrarySearchRef.current?.focus();
    if (typeof window.requestAnimationFrame === "function") {
      const animationFrame = window.requestAnimationFrame(focusSearch);
      return () => window.cancelAnimationFrame(animationFrame);
    }

    const timer = window.setTimeout(focusSearch, 0);
    return () => window.clearTimeout(timer);
  }, [appLibraryOpen]);

  useEffect(() => {
    if (!appLibraryOpen) {
      return;
    }

    const handlePointerDown = (event: globalThis.PointerEvent) => {
      const target = event.target;
      if (target instanceof Node && appLibraryRef.current?.contains(target)) {
        return;
      }
      onSearchChange("");
      setAppLibraryOpen(false);
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") {
        return;
      }
      event.preventDefault();
      onSearchChange("");
      setAppLibraryOpen(false);
    };

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [appLibraryOpen, onSearchChange]);

  const closeAppLibrary = () => {
    onSearchChange("");
    setAppLibraryOpen(false);
  };

  const handleAppLibraryToggle = (event: ToggleEvent<HTMLDetailsElement>) => {
    const nextOpen = event.currentTarget.open;
    if (!nextOpen) {
      onSearchChange("");
    }
    setAppLibraryOpen(nextOpen);
  };

  const clearSearchAndNavigate = (page: AdminPage) => {
    onSearchChange("");
    onNavigate(page);
  };

  const openModuleApp = (page: AdminPage, targetId: string) => {
    onSearchChange("");
    onNavigate(page);
    const emitOpenModule = () => {
      window.dispatchEvent(new CustomEvent("admin-open-module", {
        detail: {
          page,
          targetId
        }
      }));
    };
    emitOpenModule();
    const scrollToTarget = () => {
      emitOpenModule();
      document.getElementById(targetId)?.scrollIntoView?.({
        behavior: "smooth",
        block: "start"
      });
    };
    if (typeof window.requestAnimationFrame === "function") {
      window.requestAnimationFrame(() => window.requestAnimationFrame(scrollToTarget));
      return;
    }
    window.setTimeout(scrollToTarget, 0);
  };

  const pinnedApps = activeSections.flatMap((section) => section.items.map((item) => {
    const pageApp = getWorkspacePageApp(item.id);
    const Icon = pageApp?.icon ?? item.icon;
    return {
      active: item.id === activePage,
      icon: <Icon />,
      id: item.id,
      label: item.label,
      onClick: () => clearSearchAndNavigate(item.id),
      tone: pageApp?.tone
    };
  }));

  const utilityApps = visibleUtilityCount ? (
    <>
      {visibleUtilityAppById.has("utility.risk-notifications") ? (
        <button
          className={cn("nav-library-utility", visibleUtilityAppById.get("utility.risk-notifications")?.tone)}
          type="button"
          onClick={() => {
            closeAppLibrary();
            clearSearchAndNavigate("dashboard");
          }}
        >
          <Bell aria-hidden="true" />
          <span>Risk notifications</span>
          <small>{formatNotificationCount(riskNotificationCount)}</small>
        </button>
      ) : null}
      {visibleUtilityAppById.has("utility.environment") ? (
        <details className={cn("nav-library-utility nav-library-environment", visibleUtilityAppById.get("utility.environment")?.tone)}>
          <summary aria-label="Environment status">
            <span className="environment-dot" aria-hidden="true" />
            <span>Production</span>
            <small>Read-only</small>
          </summary>
          <div className="nav-library-utility-detail">
            <strong>Production read-only supervision</strong>
            <span>Production actions require a Risk A gate.</span>
          </div>
        </details>
      ) : null}
      {visibleUtilityAppById.has("utility.preview-site") ? (
        <button
          className={cn("nav-library-utility", visibleUtilityAppById.get("utility.preview-site")?.tone)}
          type="button"
          onClick={() => {
            closeAppLibrary();
            onSearchChange("");
            onOpenSite();
          }}
        >
          <ExternalLink aria-hidden="true" />
          <span>Preview site</span>
          <small>Public shell</small>
        </button>
      ) : null}
      {visibleUtilityAppById.has("utility.user-portal") ? (
        <button
          className={cn("nav-library-utility", visibleUtilityAppById.get("utility.user-portal")?.tone)}
          type="button"
          onClick={() => {
            closeAppLibrary();
            onSearchChange("");
            onOpenPortal();
          }}
        >
          <ExternalLink aria-hidden="true" />
          <span>Open user portal</span>
          <small>User view</small>
        </button>
      ) : null}
      {connectionPanel && visibleUtilityAppById.has("utility.admin-api") ? (
        <details className={cn("connection-widget nav-library-connection", visibleUtilityAppById.get("utility.admin-api")?.tone)}>
          <summary className="connection-widget-summary" aria-label="Admin API connection settings">
            <span
              className={connectionConfigured ? "connection-dot connection-dot-ready" : "connection-dot connection-dot-warning"}
              aria-hidden="true"
            />
            <span className="connection-widget-copy">
              <span>Admin API</span>
              <strong>{connectionConfigured ? "Configured" : "Configure"}</strong>
            </span>
            <Settings aria-hidden="true" />
          </summary>
          <div className="connection-widget-popover">
            {connectionPanel}
          </div>
        </details>
      ) : null}
    </>
  ) : undefined;

  const workspacePages = pageEntries.map(({ item }) => {
    const pageApp = getWorkspacePageApp(item.id);
    const Icon = pageApp?.icon ?? item.icon;
    const active = item.id === activePage;
    return (
      <button
        aria-current={active ? "page" : undefined}
        className={cn("nav-planned-item nav-planned-item-active", active && "nav-planned-item-current")}
        key={item.id}
        onClick={() => {
          closeAppLibrary();
          clearSearchAndNavigate(item.id);
        }}
        type="button"
      >
        <span className={cn("nav-app-icon", pageApp?.tone)} aria-hidden="true">
          <Icon />
        </span>
        <span>{item.label}</span>
        <small>{active ? "Open" : "App"}</small>
      </button>
    );
  });

  const pluginApps = visibleModuleEntries.map((entry) => {
    const pluginApp = getPluginApp(entry.module.id, entry.page);
    const pageApp = getWorkspacePageApp(entry.page);
    const ModuleIcon = pluginApp?.icon ?? PanelTopOpen;
    return (
      <button
        className="nav-planned-item nav-planned-item-active nav-planned-item-module"
        key={`${entry.page}-${entry.module.id}`}
        onClick={() => {
          closeAppLibrary();
          openModuleApp(entry.page, entry.module.targetId);
        }}
        type="button"
      >
        <span className={cn("nav-app-icon", pluginApp?.tone ?? pageApp?.tone)} aria-hidden="true">
          <ModuleIcon />
        </span>
        <span>{entry.module.label}</span>
        <small>{entry.pageLabel}</small>
      </button>
    );
  });

  const plannedApps = visiblePlannedSections.map((section) => {
    const plannedApp = getPlannedApp(section.id);
    const PlannedIcon = plannedApp?.icon ?? Lock;
    return (
      <div
        aria-label={`${section.label} planned`}
        className="nav-planned-item nav-planned-item-planned"
        key={section.id}
        title={section.entryGate}
      >
        <span className={cn("nav-app-icon", plannedApp?.tone ?? "nav-app-tone-slate")} aria-hidden="true">
          <PlannedIcon />
        </span>
        <span>{section.label}</span>
        <small>Planned</small>
      </div>
    );
  });

  return (
    <WorkspaceAppbar
      brand={{
        mark: "GC",
        name: "GlobalCircle AI",
        subtitle: "Proxy Gateway"
      }}
      appLibrary={(
        <AppLibrary
          emptyState="No matching apps, plugins, or settings."
          menuRef={appLibraryRef}
          open={appLibraryOpen}
          plannedApps={plannedApps}
          plugins={pluginApps}
          resultCount={resultCount}
          search={search}
          searchInputRef={appLibrarySearchRef}
          totalCount={appSearchEntries.length}
          utilities={utilityApps}
          workspacePages={workspacePages}
          onSearchChange={onSearchChange}
          onToggle={handleAppLibraryToggle}
        />
      )}
      pinnedApps={pinnedApps}
      safetyGate={(
        <details className="sidebar-safety-footer">
          <summary className="sidebar-safety-summary" aria-label="Production action guard">
            <ShieldCheck aria-hidden="true" />
            <strong>Risk A gated</strong>
            <ChevronUp aria-hidden="true" />
          </summary>
          <div className="sidebar-safety-detail">
            Production actions require an approved runbook.
          </div>
        </details>
      )}
    />
  );
}

function formatNotificationCount(value: number) {
  if (value > 99) return "99+";
  return String(Math.max(0, value));
}
