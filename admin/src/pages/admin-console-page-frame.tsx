import { useEffect, useMemo, useState } from "react";
import { ADMIN_UI_CONTRACT, getAdminPageContract } from "../app/admin-ui-contract";
import {
  type AdminPage,
  pageSubNavigation
} from "../app/navigation";
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
  activeModuleNavId: controlledActiveModuleNavId,
  blueprint,
  fixturePreviewEnabled = false,
  onActiveModuleNavIdChange
}: {
  activeModuleNavId?: string;
  blueprint: BlueprintPage;
  fixturePreviewEnabled?: boolean;
  onActiveModuleNavIdChange?: (navId: string) => void;
}) {
  const subNavigation = pageSubNavigation[blueprint.page];
  const pageContract = getAdminPageContract(blueprint.page);
  const overviewModuleIds = blueprint.overviewModuleIds ?? [];
  const usesOverviewModules = overviewModuleIds.length > 0;
  const usesRoutedModules = blueprint.page !== "dashboard" && !usesOverviewModules;
  const moduleNavSignature = blueprint.modules.map((module) => module.navId).join("|");
  const firstModuleNavId = subNavigation[0]?.id ?? blueprint.modules[0]?.navId ?? "";
  const [uncontrolledActiveModuleNavId, setUncontrolledActiveModuleNavId] = useState(firstModuleNavId);
  const activeModuleNavId = controlledActiveModuleNavId ?? uncontrolledActiveModuleNavId;

  function setActiveModuleNavId(navId: string) {
    setUncontrolledActiveModuleNavId(navId);
    onActiveModuleNavIdChange?.(navId);
  }

  useEffect(() => {
    if (controlledActiveModuleNavId === undefined) {
      setUncontrolledActiveModuleNavId(firstModuleNavId);
    }
  }, [blueprint.page, controlledActiveModuleNavId, firstModuleNavId, moduleNavSignature]);

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
      setActiveModuleNavId(match.navId);
    };

    window.addEventListener("admin-open-module", handleOpenModule);
    return () => window.removeEventListener("admin-open-module", handleOpenModule);
  }, [blueprint.page, moduleRestoreTargets]);

  const panelViewModels = projectBlueprintPanelViewModels({
    blueprint,
    fixturePreviewEnabled,
    subNavigation
  });
  const hasExplicitSectionRoute = controlledActiveModuleNavId !== undefined;
  const opensRoutedSection = usesOverviewModules && !overviewModuleIds.includes(activeModuleNavId);
  const routedPanelViewModels = hasExplicitSectionRoute
    ? panelViewModels.filter((panel) => panel.navId === activeModuleNavId)
    : opensRoutedSection
    ? panelViewModels.filter((panel) => panel.navId === activeModuleNavId)
    : usesRoutedModules
    ? panelViewModels.filter((panel) => panel.navId === activeModuleNavId)
    : usesOverviewModules
      ? panelViewModels.filter((panel) => overviewModuleIds.includes(panel.navId))
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

      {usesRoutedModules || hasExplicitSectionRoute || opensRoutedSection ? (
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
            ownerMode={panel.ownerMode}
            title={panel.title}
          >
            {panel.content}
          </PanelFrame>
        )) : (
        <EmptyState
          className="admin-blueprint-empty-workbench"
          description="System search can route to available page-owned sections after the page contract exposes them."
          role="status"
          title="No page panels are available."
        />
      )}
      </div>

      {blueprint.evidence ? (
        <section className="admin-blueprint-lower-evidence-grid" aria-label={`${blueprint.title} evidence surfaces`}>
          {blueprint.evidence}
        </section>
      ) : null}
    </div>
  );
}
