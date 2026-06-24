import { useEffect, useMemo, useState } from "react";
import { ADMIN_UI_CONTRACT, getAdminPageContract } from "../app/admin-ui-contract";
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
  PageSubNav,
  PanelFrame
} from "../components/primitives";

export type { BlueprintModule, BlueprintPage } from "../app/admin-ui-projection";

type OpenModuleEventDetail = {
  navId?: string;
  page?: AdminPage;
  targetId?: string;
};

export function AdminConsolePageFrame({
  blueprint,
  fixturePreviewEnabled = false
}: {
  blueprint: BlueprintPage;
  fixturePreviewEnabled?: boolean;
}) {
  const subNavigation = pageSubNavigation[blueprint.page];
  const pageContract = getAdminPageContract(blueprint.page);
  const usesRoutedModules = blueprint.page !== "dashboard";
  const moduleNavSignature = blueprint.modules.map((module) => module.navId).join("|");
  const firstModuleNavId = subNavigation[0]?.id ?? blueprint.modules[0]?.navId ?? "";
  const defaultModuleLayout = useMemo(() => createDefaultModuleLayout(blueprint.modules), [moduleNavSignature]);
  const initialWorkspaceLayout = useMemo(
    () => loadWorkspaceLayout(blueprint.page, blueprint.modules, defaultModuleLayout),
    [blueprint.page, defaultModuleLayout, moduleNavSignature]
  );
  const [moduleLayout, setModuleLayout] = useState<ModuleLayoutMap>(() => initialWorkspaceLayout.moduleLayout);
  const [activeModuleNavId, setActiveModuleNavId] = useState(firstModuleNavId);

  useEffect(() => {
    const nextLayout = loadWorkspaceLayout(blueprint.page, blueprint.modules, defaultModuleLayout);
    setModuleLayout(nextLayout.moduleLayout);
    setActiveModuleNavId(firstModuleNavId);
  }, [blueprint.page, defaultModuleLayout, firstModuleNavId, moduleNavSignature]);

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
      setActiveModuleNavId(match.navId);
    };

    window.addEventListener("admin-open-module", handleOpenModule);
    return () => window.removeEventListener("admin-open-module", handleOpenModule);
  }, [blueprint.page, defaultModuleLayout, moduleRestoreTargets]);

  const panelViewModels = projectBlueprintPanelViewModels({
    blueprint,
    defaultModuleLayout,
    fixturePreviewEnabled,
    moduleLayout,
    subNavigation
  });
  const routedPanelViewModels = usesRoutedModules
    ? panelViewModels.filter((panel) => panel.navId === activeModuleNavId)
    : panelViewModels;

  return (
    <div
      className="page-stack admin-blueprint-page"
      data-density={pageContract.density}
      data-layout={pageContract.layout}
      data-mobile-projection={pageContract.mobileProjection}
      data-page={blueprint.page}
      data-page-id={pageContract.page}
      data-required-blocks={pageContract.requiredBlocks.join(" ")}
      data-ui-contract={ADMIN_UI_CONTRACT.pageFrame.contractId}
      data-ui-role="workspace"
    >
      <header className="admin-blueprint-page-hero" aria-label={blueprint.ariaLabel}>
        <p>{blueprint.kicker}</p>
        <h1>{blueprint.title}</h1>
        {blueprint.page === "dashboard" ? <p>{blueprint.description}</p> : null}
      </header>

      {blueprint.summary ? (
        <section className="admin-blueprint-page-summary" aria-label={`${blueprint.title} summary metrics`}>
          {blueprint.summary}
        </section>
      ) : null}

      {usesRoutedModules ? (
        <PageSubNav
          activeId={activeModuleNavId}
          ariaLabel={`${blueprint.title} sections`}
          items={subNavigation}
          onSelect={(item) => setActiveModuleNavId(item.id)}
        />
      ) : null}

      <div className="admin-blueprint-module-board" aria-label={`${blueprint.title} module layout`}>
        {routedPanelViewModels.length > 0 ? routedPanelViewModels.map((panel) => (
          <PanelFrame
            actions={panel.actions}
            ariaLabel={panel.ariaLabel}
            category={panel.category}
            chrome={panel.chrome}
            className={panel.className}
            containerLabel={panel.containerLabel}
            dataModuleNavId={panel.navId}
            dataUiSurfaceRole={panel.uiSurface}
            fieldLabels={panel.fieldLabels}
            fixturePreview={panel.fixturePreview}
            id={panel.targetId}
            key={panel.navId}
            onHide={() => hideModuleLayout(panel.navId)}
            ownerMode={panel.ownerMode}
            title={panel.title}
          >
            {panel.content}
          </PanelFrame>
        )) : (
        <EmptyState
          className="admin-blueprint-empty-workbench"
          description="Use system search or page controls to restore a module."
          role="status"
          title="No modules are visible."
        />
      )}
      </div>
    </div>
  );
}
