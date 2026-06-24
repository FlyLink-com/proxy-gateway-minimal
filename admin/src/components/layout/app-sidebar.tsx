import { Lock } from "lucide-react";
import {
  DEFAULT_ADMIN_CAPABILITY_CONTEXT,
  getCapabilityScopedAdminAppMap,
  type AdminCapabilityContext
} from "../../app/admin-app-manifest";
import { type AdminPage } from "../../app/navigation";
import { cn } from "../../lib/utils";
import { PrivilegedGate, WorkspaceSidebar } from "../primitives";

type AppSidebarProps = {
  activePage: AdminPage;
  onNavigate: (page: AdminPage) => void;
  capabilityContext?: AdminCapabilityContext;
};

export function AppSidebar({
  activePage,
  onNavigate,
  capabilityContext = DEFAULT_ADMIN_CAPABILITY_CONTEXT
}: AppSidebarProps) {
  const appMap = getCapabilityScopedAdminAppMap(capabilityContext);

  const pinnedApps = appMap.workspacePages.map((app) => {
    const Icon = app.icon;
    const page = app.route.page;
    return {
      active: page === activePage,
      icon: <Icon />,
      id: app.id,
      label: app.label,
      onClick: () => {
        if (page) {
          onNavigate(page);
        }
      },
      tone: app.tone
    };
  });

  const plannedSidebarRoutes = appMap.plannedApps.map((app) => {
    const PlannedIcon = app.icon ?? Lock;
    return (
      <button
        aria-label={`${app.label} planned gate`}
        className="nav-item nav-item-planned nav-item-sidebar-planned"
        disabled
        key={app.id}
        title={app.description}
        type="button"
      >
        <span className={cn("nav-item-icon nav-app-icon nav-route-icon", app.tone ?? "nav-app-tone-slate")} aria-hidden="true">
          <PlannedIcon />
        </span>
        <span className="nav-item-copy">{app.label}</span>
        <span className="nav-item-gate-pill">Gate</span>
      </button>
    );
  });

  return (
    <WorkspaceSidebar
      brand={{
        mark: "GC",
        name: "GlobalCircle AI",
        subtitle: "Proxy Gateway Admin"
      }}
      pinnedApps={pinnedApps}
      plannedRoutes={plannedSidebarRoutes}
      safetyGate={(
        <PrivilegedGate
          description="No token, URL, credential, runtime config, or raw customer data in Admin UI fixtures."
          detail="Production actions require an approved runbook."
          title="Risk A gated"
        />
      )}
    />
  );
}
