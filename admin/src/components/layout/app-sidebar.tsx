import { Lock } from "lucide-react";
import {
  DEFAULT_ADMIN_CAPABILITY_CONTEXT,
  getCapabilityScopedAdminAppMap,
  type AdminCapabilityContext
} from "../../app/admin-app-manifest";
import { ADMIN_SHELL_COPY, type AdminShellCopy } from "../../app/admin-locale";
import { type AdminPage } from "../../app/navigation";
import { cn } from "../../lib/utils";
import { PrivilegedGate, WorkspaceSidebar } from "../primitives";

type AppSidebarProps = {
  activePage: AdminPage;
  onNavigate: (page: AdminPage) => void;
  capabilityContext?: AdminCapabilityContext;
  shellCopy?: AdminShellCopy["sidebar"];
};

export function AppSidebar({
  activePage,
  onNavigate,
  capabilityContext = DEFAULT_ADMIN_CAPABILITY_CONTEXT,
  shellCopy = ADMIN_SHELL_COPY.en.sidebar
}: AppSidebarProps) {
  const appMap = getCapabilityScopedAdminAppMap(capabilityContext);

  const pinnedApps = appMap.workspacePages.map((app) => {
    const Icon = app.icon;
    const page = app.route.page;
    return {
      active: page === activePage,
      icon: <Icon />,
      id: app.id,
      label: page ? shellCopy.routes[page] : app.label,
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
        aria-label={`${app.label} ${shellCopy.plannedGateAriaSuffix}`}
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
        <span className="nav-item-gate-pill">{shellCopy.plannedGateLabel}</span>
      </button>
    );
  });

  return (
    <WorkspaceSidebar
      ariaLabel={shellCopy.workspaceAriaLabel}
      brand={{
        mark: "GC",
        name: "GlobalCircle AI",
        subtitle: shellCopy.brandSubtitle
      }}
      pinnedApps={pinnedApps}
      plannedRoutes={plannedSidebarRoutes}
      safetyGate={(
        <PrivilegedGate
          description={shellCopy.safetyDescription}
          detail={shellCopy.safetyDetail}
          title={shellCopy.safetyTitle}
        />
      )}
    />
  );
}
