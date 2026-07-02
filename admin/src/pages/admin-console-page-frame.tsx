import { useEffect, useState } from "react";
import { ADMIN_UI_CONTRACT, getAdminPageContract } from "../app/admin-ui-contract";
import { useOptionalAdminLocale } from "../app/admin-locale";
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
  const adminLocale = useOptionalAdminLocale();
  const pageFrameCopy = adminLocale?.copy.pageFrame;
  const localizedTitle = adminLocale?.copy.topBar.pageTitles[blueprint.page] ?? blueprint.title;
  const localizedContext = adminLocale?.copy.topBar.contexts[blueprint.page];
  const localizedKicker = adminLocale ? `${localizedTitle} / ${localizedContext}` : blueprint.kicker;
  const localizedDescription = pageFrameCopy?.pageDescriptions[blueprint.page] ?? blueprint.description;
  const localizedHeaderAriaLabel = pageFrameCopy?.pageHeaderAriaLabels[blueprint.page] ?? blueprint.ariaLabel;
  const localizedSubNavigation = subNavigation.map((item) => ({
    ...item,
    ...(pageFrameCopy?.sections[blueprint.page]?.[item.id] ?? {})
  }));
  const overviewModuleIds = blueprint.overviewModuleIds ?? [];
  const workspaceModuleIds = blueprint.workspaceModuleIds ?? overviewModuleIds;
  const usesOverviewModules = overviewModuleIds.length > 0 || workspaceModuleIds.length > 0;
  const usesRoutedModules = blueprint.page !== "dashboard" && !usesOverviewModules;
  const moduleNavSignature = blueprint.modules.map((module) => module.navId).join("|");
  const firstModuleNavId = localizedSubNavigation[0]?.id ?? blueprint.modules[0]?.navId ?? "";
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

  const panelViewModels = projectBlueprintPanelViewModels({
    blueprint,
    fixturePreviewEnabled,
    subNavigation: localizedSubNavigation
  });
  const hasExplicitSectionRoute = controlledActiveModuleNavId !== undefined && usesRoutedModules;
  const showsFocusedSection = hasExplicitSectionRoute;
  const routedPanelViewModels = hasExplicitSectionRoute
    ? panelViewModels.filter((panel) => panel.navId === activeModuleNavId)
    : usesRoutedModules
    ? panelViewModels.filter((panel) => panel.navId === activeModuleNavId)
    : usesOverviewModules
      ? panelViewModels.filter((panel) => workspaceModuleIds.includes(panel.navId))
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
      <header className="admin-blueprint-page-hero" aria-label={localizedHeaderAriaLabel}>
        <p>{localizedKicker}</p>
        <h1>{localizedTitle}</h1>
        {blueprint.page === "dashboard" ? <p>{localizedDescription}</p> : null}
      </header>

      {blueprint.summary && !showsFocusedSection ? (
        <section className="admin-blueprint-page-summary" aria-label={`${localizedTitle} ${pageFrameCopy?.summaryMetricsSuffix ?? "summary metrics"}`}>
          {blueprint.summary}
        </section>
      ) : null}

      {usesRoutedModules && !showsFocusedSection ? (
        <PageSubNav
          activeId={activeModuleNavId}
          ariaLabel={`${localizedTitle} ${pageFrameCopy?.sectionsSuffix ?? "sections"}`}
          items={localizedSubNavigation}
          modeLabels={pageFrameCopy?.modeLabels}
          onSelect={(item) => setActiveModuleNavId(item.id)}
        />
      ) : null}

      <div className="admin-blueprint-module-board" aria-label={`${localizedTitle} ${pageFrameCopy?.moduleLayoutSuffix ?? "module layout"}`}>
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
          description={pageFrameCopy?.emptyWorkbenchDescription ?? "System search can route to available page-owned sections after the page contract exposes them."}
          role="status"
          title={pageFrameCopy?.emptyWorkbenchTitle ?? "No page panels are available."}
        />
      )}
      </div>

      {blueprint.evidence && !showsFocusedSection ? (
        <section className="admin-blueprint-lower-evidence-grid" aria-label={`${localizedTitle} ${pageFrameCopy?.evidenceSurfacesSuffix ?? "evidence surfaces"}`}>
          {blueprint.evidence}
        </section>
      ) : null}
    </div>
  );
}
