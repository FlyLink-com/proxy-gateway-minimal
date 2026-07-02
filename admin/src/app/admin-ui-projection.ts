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

export type BlueprintPage = {
  page: AdminPage;
  ariaLabel: string;
  kicker: string;
  title: string;
  description: string;
  statusLabel: string;
  statusTone: MetricTone;
  summary?: ReactNode;
  evidence?: ReactNode;
  overviewModuleIds?: string[];
  workspaceModuleIds?: string[];
  modules: BlueprintModule[];
};

export type BlueprintPanelViewModel = {
  actions?: ReactNode;
  ariaLabel: string;
  category: WorkbenchCategory;
  chrome: "draft" | "operator";
  className: string;
  content?: ReactNode;
  containerLabel: string;
  fieldLabels: string[];
  fixturePreview?: AdminFixturePreviewPanel;
  navId: string;
  ownerMode: "preview" | "owner";
  targetId: string;
  title: string;
  uiSurface: AdminUiSurfaceKey;
};

export type BlueprintPanelProjectionInput = {
  blueprint: BlueprintPage;
  fixturePreviewEnabled?: boolean;
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
  fixturePreviewEnabled = false,
  subNavigation
}: BlueprintPanelProjectionInput): BlueprintPanelViewModel[] {
  const chrome: BlueprintPanelViewModel["chrome"] = blueprint.page === "dashboard" ? "operator" : "draft";

  return blueprint.modules.flatMap((module) => {
    const navItem = subNavigation.find((item) => item.id === module.navId);

    const basePanel: BlueprintPanelViewModel = {
      actions: module.actions,
      ariaLabel: `${CATEGORY_LABEL[module.container.category]} panel`,
      category: module.container.category,
      chrome,
      className: "",
      content: module.content,
      containerLabel: module.container.container,
      fieldLabels: module.contentFields,
      navId: module.navId,
      ownerMode: navItem?.mode === "preview" ? "preview" : "owner",
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
