import { type ReactNode } from "react";
import {
  type AdminPage,
  type PageSubNavigationItem
} from "./navigation";
import { type AdminUiSurfaceKey } from "./admin-ui-reference-model";
import {
  getAdminFixturePreviewPanel,
  type AdminFixturePreviewPanel
} from "./admin-fixture-preview";
import {
  defaultModuleLayoutState,
  type ModuleLayoutMap,
  type WorkspaceModuleVisibleSizePreset
} from "./plugin-layout-store";
import {
  type MetricTone,
  type WorkbenchCategory,
  type WorkbenchContainerSpec
} from "../components/primitives";

export type BlueprintModule = {
  navId: string;
  container: WorkbenchContainerSpec;
  content?: ReactNode;
  containmentStrategy: AdminContentContainmentStrategy;
  purpose: string;
  contentFields: string[];
  states: string[];
  ownership: string;
  boundaries: string[];
  nextStep: string;
  actions?: ReactNode;
  uiSurface: AdminUiSurfaceKey;
};

export type AdminContentContainmentStrategy =
  | "not-applicable"
  | "pagination"
  | "route-split"
  | "bounded-internal-scroll";

export type BlueprintSubPage = {
  id: string;
  label: string;
  owner: string;
  description: string;
  moduleNavIds: string[];
};

export type BlueprintPage = {
  page: AdminPage;
  ariaLabel: string;
  kicker: string;
  title: string;
  description: string;
  statusLabel: string;
  statusTone: MetricTone;
  modules: BlueprintModule[];
  subPages?: BlueprintSubPage[];
};

export type BlueprintPanelViewModel = {
  actions?: ReactNode;
  ariaLabel: string;
  category: WorkbenchCategory;
  chrome: "draft" | "operator";
  className: string;
  content?: ReactNode;
  containmentStrategy: BlueprintModule["containmentStrategy"];
  containerLabel: string;
  fieldLabels: string[];
  fixturePreview?: AdminFixturePreviewPanel;
  navId: string;
  ownerMode: "preview" | "owner";
  paginationStandardNodeId?: "157:2";
  sizePreset: WorkspaceModuleVisibleSizePreset;
  targetId: string;
  title: string;
  uiSurface: AdminUiSurfaceKey;
};

export type BlueprintPanelProjectionInput = {
  blueprint: BlueprintPage;
  defaultModuleLayout: ModuleLayoutMap;
  fixturePreviewEnabled?: boolean;
  moduleLayout: ModuleLayoutMap;
  subNavigation: PageSubNavigationItem[];
};

const CATEGORY_LABEL: Record<WorkbenchCategory, string> = {
  monitoring: "Monitoring",
  management: "Management",
  configuration: "Configuration",
  "audit-workflow": "Audit / Workflow",
  "platform-tools": "Platform Tools"
};

export function projectBlueprintPanelViewModels({
  blueprint,
  defaultModuleLayout,
  fixturePreviewEnabled = false,
  moduleLayout,
  subNavigation
}: BlueprintPanelProjectionInput): BlueprintPanelViewModel[] {
  const chrome: BlueprintPanelViewModel["chrome"] = blueprint.page === "dashboard" ? "operator" : "draft";

  return blueprint.modules.flatMap((module) => {
    const navItem = subNavigation.find((item) => item.id === module.navId);
    const layout = moduleLayout[module.navId] ?? defaultModuleLayout[module.navId] ?? defaultModuleLayoutState(blueprint.page, module);
    if (!layout.visible || layout.sizePreset === "hidden") {
      return [];
    }

    const basePanel: BlueprintPanelViewModel = {
      actions: module.actions,
      ariaLabel: `${CATEGORY_LABEL[module.container.category]} panel`,
      category: module.container.category,
      chrome,
      className: "",
      content: module.content,
      containmentStrategy: module.containmentStrategy,
      containerLabel: module.container.container,
      fieldLabels: module.contentFields,
      navId: module.navId,
      ownerMode: navItem?.mode === "preview" ? "preview" : "owner",
      paginationStandardNodeId: module.containmentStrategy === "not-applicable" ? undefined : "157:2",
      sizePreset: layout.sizePreset,
      targetId: navItem?.targetId ?? module.navId,
      title: navItem?.label ?? module.navId,
      uiSurface: module.uiSurface
    };

    const fixturePreview = fixturePreviewEnabled && chrome === "draft"
      ? getAdminFixturePreviewPanel(blueprint.page, module.navId)
      : undefined;

    return fixturePreview ? [{ ...basePanel, fixturePreview }] : [basePanel];
  });
}
