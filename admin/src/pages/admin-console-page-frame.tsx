import { useEffect, useMemo, useState } from "react";
import { ADMIN_UI_CONTRACT } from "../app/admin-ui-contract";
import {
  type AdminPage,
  pageSubNavigation
} from "../app/navigation";
import {
  createDefaultModuleLayout,
  defaultModuleLayoutState,
  isWorkspaceLayoutForModules,
  loadWorkspaceLayout,
  persistWorkspaceLayout,
  type ModuleLayoutMap
} from "../app/plugin-layout-store";
import {
  hideModuleLayoutState,
  restoreModuleLayoutState
} from "../app/plugin-workspace-engine";
import {
  projectBlueprintPanelViewModels,
  type BlueprintPage
} from "../app/admin-ui-projection";
import {
  EmptyState,
  PanelFrame
} from "../components/primitives";

export type { BlueprintModule, BlueprintPage } from "../app/admin-ui-projection";

type OpenModuleEventDetail = {
  navId?: string;
  page?: AdminPage;
  targetId?: string;
};

export function AdminConsolePageFrame({ blueprint }: { blueprint: BlueprintPage }) {
  const subNavigation = pageSubNavigation[blueprint.page];
  const moduleNavSignature = blueprint.modules.map((module) => module.navId).join("|");
  const defaultModuleLayout = useMemo(() => createDefaultModuleLayout(blueprint.modules), [moduleNavSignature]);
  const initialWorkspaceLayout = useMemo(
    () => loadWorkspaceLayout(blueprint.page, blueprint.modules, defaultModuleLayout),
    [blueprint.page, defaultModuleLayout, moduleNavSignature]
  );
  const [moduleLayout, setModuleLayout] = useState<ModuleLayoutMap>(() => initialWorkspaceLayout.moduleLayout);

  useEffect(() => {
    const nextLayout = loadWorkspaceLayout(blueprint.page, blueprint.modules, defaultModuleLayout);
    setModuleLayout(nextLayout.moduleLayout);
  }, [blueprint.page, defaultModuleLayout, moduleNavSignature]);

  useEffect(() => {
    const snapshot = { moduleLayout };
    if (!isWorkspaceLayoutForModules(snapshot, blueprint.modules)) {
      return;
    }
    persistWorkspaceLayout(blueprint.page, snapshot);
  }, [blueprint.page, moduleLayout, moduleNavSignature]);

  const hideModuleLayout = (navId: string) => {
    setModuleLayout((current) => ({
      ...current,
      [navId]: hideModuleLayoutState(
        current[navId] ?? defaultModuleLayout[navId] ?? defaultModuleLayoutState()
      )
    }));
  };

  const moduleRestoreTargets = useMemo(() => blueprint.modules.map((module) => {
    const navItem = subNavigation.find((item) => item.id === module.navId);
    return {
      navId: module.navId,
      targetId: navItem?.targetId ?? module.navId
    };
  }), [blueprint.modules, subNavigation]);

  useEffect(() => {
    const handleOpenModule = (event: Event) => {
      const detail = (event as CustomEvent<OpenModuleEventDetail>).detail;
      if (detail?.page !== blueprint.page) {
        return;
      }
      const match = moduleRestoreTargets.find((target) => (
        target.navId === detail.navId ||
        target.navId === detail.targetId ||
        target.targetId === detail.targetId
      ));
      if (!match) {
        return;
      }
      setModuleLayout((current) => ({
        ...current,
        [match.navId]: restoreModuleLayoutState(
          current[match.navId] ?? defaultModuleLayout[match.navId] ?? defaultModuleLayoutState()
        )
      }));
    };

    window.addEventListener("admin-open-module", handleOpenModule);
    return () => window.removeEventListener("admin-open-module", handleOpenModule);
  }, [blueprint.page, defaultModuleLayout, moduleRestoreTargets]);

  const panelViewModels = projectBlueprintPanelViewModels({
    blueprint,
    defaultModuleLayout,
    moduleLayout,
    subNavigation
  });

  return (
    <div
      className="page-stack admin-blueprint-page"
      data-density={ADMIN_UI_CONTRACT.pageFrame.density}
      data-page={blueprint.page}
      data-ui-contract={ADMIN_UI_CONTRACT.pageFrame.contractId}
    >
      <header className="sr-only" aria-label={blueprint.ariaLabel}>
        <p>{blueprint.kicker}</p>
        <h2>{blueprint.title}</h2>
        <p>{blueprint.description}</p>
      </header>

      <div className="admin-blueprint-module-board" aria-label={`${blueprint.title} module layout`}>
        {panelViewModels.length > 0 ? panelViewModels.map((panel) => (
          <PanelFrame
            actions={panel.actions}
            ariaLabel={panel.ariaLabel}
            category={panel.category}
            className={panel.className}
            containerLabel={panel.containerLabel}
            dataModuleNavId={panel.navId}
            dataUiSurfaceRole={panel.uiSurface}
            fieldLabels={panel.fieldLabels}
            id={panel.targetId}
            key={panel.navId}
            onHide={() => hideModuleLayout(panel.navId)}
            ownerMode={panel.ownerMode}
            title={panel.title}
          />
        )) : (
          <EmptyState
            className="admin-blueprint-empty-workbench"
            description="Open Navigation Library to restore modules."
            role="status"
            title="All plugins are hidden."
          />
        )}
      </div>
    </div>
  );
}
