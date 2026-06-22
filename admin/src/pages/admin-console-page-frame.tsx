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
  WORKSPACE_MODULE_VISIBLE_SIZE_PRESETS,
  type ModuleLayoutMap,
  type WorkspaceModuleVisibleSizePreset
} from "../app/plugin-layout-store";
import {
  hideModuleLayoutState,
  restoreModuleLayoutState,
  setModuleSizePresetLayoutState
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

export function AdminConsolePageFrame({
  blueprint,
  fixturePreviewEnabled = false
}: {
  blueprint: BlueprintPage;
  fixturePreviewEnabled?: boolean;
}) {
  const subNavigation = pageSubNavigation[blueprint.page];
  const pageContract = getAdminPageContract(blueprint.page);
  const subPages = blueprint.subPages ?? [];
  const hasSubPages = subPages.length > 0;
  const moduleNavSignature = blueprint.modules.map((module) => module.navId).join("|");
  const defaultModuleLayout = useMemo(
    () => createDefaultModuleLayout(blueprint.page, blueprint.modules),
    [blueprint.page, moduleNavSignature]
  );
  const initialWorkspaceLayout = useMemo(
    () => loadWorkspaceLayout(blueprint.page, blueprint.modules, defaultModuleLayout),
    [blueprint.page, defaultModuleLayout, moduleNavSignature]
  );
  const [moduleLayout, setModuleLayout] = useState<ModuleLayoutMap>(() => initialWorkspaceLayout.moduleLayout);
  const [activeSubPageId, setActiveSubPageId] = useState(() => subPages[0]?.id ?? "");

  useEffect(() => {
    const nextLayout = loadWorkspaceLayout(blueprint.page, blueprint.modules, defaultModuleLayout);
    setModuleLayout(nextLayout.moduleLayout);
  }, [blueprint.page, defaultModuleLayout, moduleNavSignature]);

  useEffect(() => {
    if (!hasSubPages) {
      if (activeSubPageId) {
        setActiveSubPageId("");
      }
      return;
    }
    if (!subPages.some((subPage) => subPage.id === activeSubPageId)) {
      setActiveSubPageId(subPages[0]?.id ?? "");
    }
  }, [activeSubPageId, hasSubPages, subPages]);

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
        current[navId] ?? defaultModuleLayout[navId] ?? defaultModuleLayoutState(blueprint.page, { navId })
      )
    }));
  };

  const setModuleSizePreset = (navId: string, sizePreset: WorkspaceModuleVisibleSizePreset) => {
    setModuleLayout((current) => ({
      ...current,
      [navId]: setModuleSizePresetLayoutState(
        current[navId] ?? defaultModuleLayout[navId] ?? defaultModuleLayoutState(blueprint.page, { navId }),
        sizePreset
      )
    }));
  };

  const activeSubPage = hasSubPages
    ? subPages.find((subPage) => subPage.id === activeSubPageId) ?? subPages[0]
    : undefined;
  const activeSubPageModuleIds = useMemo(
    () => activeSubPage ? new Set(activeSubPage.moduleNavIds) : undefined,
    [activeSubPage]
  );
  const scopedBlueprint = useMemo(
    () => activeSubPageModuleIds
      ? {
        ...blueprint,
        modules: blueprint.modules.filter((module) => activeSubPageModuleIds.has(module.navId))
      }
      : blueprint,
    [activeSubPageModuleIds, blueprint]
  );

  const moduleRestoreTargets = useMemo(() => blueprint.modules.map((module) => {
    const navItem = subNavigation.find((item) => item.id === module.navId);
    const subPage = subPages.find((candidate) => candidate.moduleNavIds.includes(module.navId));
    return {
      navId: module.navId,
      subPageId: subPage?.id,
      targetId: navItem?.targetId ?? module.navId
    };
  }), [blueprint.modules, subNavigation, subPages]);

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
      if (match.subPageId) {
        setActiveSubPageId(match.subPageId);
      }
      setModuleLayout((current) => ({
        ...current,
        [match.navId]: restoreModuleLayoutState(
          current[match.navId] ?? defaultModuleLayout[match.navId] ?? defaultModuleLayoutState(blueprint.page, { navId: match.navId })
        )
      }));
    };

    window.addEventListener("admin-open-module", handleOpenModule);
    return () => window.removeEventListener("admin-open-module", handleOpenModule);
  }, [blueprint.page, defaultModuleLayout, moduleRestoreTargets]);

  const panelViewModels = projectBlueprintPanelViewModels({
    blueprint: scopedBlueprint,
    defaultModuleLayout,
    fixturePreviewEnabled,
    moduleLayout,
    subNavigation
  });

  return (
    <div
      className="page-stack admin-blueprint-page"
      data-density={pageContract.density}
      data-layout={pageContract.layout}
      data-mobile-standard-status={pageContract.mobileStandardStatus}
      data-responsive-standard="desktop-tablet"
      data-active-subpage={activeSubPage?.id}
      data-page={blueprint.page}
      data-page-id={pageContract.page}
      data-required-blocks={pageContract.requiredBlocks.join(" ")}
      data-subpage-mode={hasSubPages ? "true" : "false"}
      data-ui-contract={ADMIN_UI_CONTRACT.pageFrame.contractId}
      data-ui-role="workspace"
    >
      <header className="admin-blueprint-page-hero" aria-label={blueprint.ariaLabel}>
        <p>{blueprint.kicker}</p>
        <h1>{blueprint.title}</h1>
      </header>

      {hasSubPages && activeSubPage ? (
        <>
          <nav className="admin-blueprint-subpage-nav" aria-label={`${blueprint.title} subpages`}>
            <div className="admin-blueprint-subpage-list" role="list">
              {subPages.map((subPage) => (
                <button
                  aria-label={`Open ${subPage.label} subpage`}
                  aria-pressed={subPage.id === activeSubPage.id}
                  className="admin-blueprint-subpage-button"
                  data-active={subPage.id === activeSubPage.id ? "true" : undefined}
                  key={subPage.id}
                  onClick={() => setActiveSubPageId(subPage.id)}
                  type="button"
                >
                  <span className="admin-blueprint-subpage-title">{subPage.label}</span>
                  <span className="admin-blueprint-subpage-meta">{subPage.owner} · {subPage.moduleNavIds.length} modules</span>
                  <span className="admin-blueprint-subpage-description">{subPage.description}</span>
                </button>
              ))}
            </div>
          </nav>
        </>
      ) : null}

      <div className="admin-blueprint-module-board" aria-label={`${blueprint.title} module layout`}>
        {panelViewModels.length > 0 ? panelViewModels.map((panel) => (
          <PanelFrame
            actions={panel.actions}
            ariaLabel={panel.ariaLabel}
            category={panel.category}
            chrome={panel.chrome}
            className={panel.className}
            containerLabel={panel.containerLabel}
            dataContainmentStrategy={panel.containmentStrategy}
            dataModuleNavId={panel.navId}
            dataPaginationStandardNodeId={panel.paginationStandardNodeId}
            dataUiSurfaceRole={panel.uiSurface}
            fieldLabels={panel.fieldLabels}
            fixturePreview={panel.fixturePreview}
            id={panel.targetId}
            key={panel.navId}
            allowedSizePresets={[...WORKSPACE_MODULE_VISIBLE_SIZE_PRESETS]}
            onHide={() => hideModuleLayout(panel.navId)}
            onSizePresetChange={(sizePreset) => setModuleSizePreset(panel.navId, sizePreset)}
            ownerMode={panel.ownerMode}
            sizePreset={panel.sizePreset}
            title={panel.title}
          >
            {panel.content}
          </PanelFrame>
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
