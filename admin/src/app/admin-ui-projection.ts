import { type ReactNode } from "react";
import {
  type AdminPage,
  type PageSubNavigationItem
} from "./navigation";
import { type AdminUiSurfaceKey } from "./admin-ui-reference-model";
import {
  defaultModuleLayoutState,
  type ModuleLayoutMap
} from "./plugin-layout-store";
import {
  type MetricTone,
  type WorkbenchCategory,
  type WorkbenchContainerSpec
} from "../components/primitives";

export type BlueprintModule = {
  navId: string;
  container: WorkbenchContainerSpec;
  purpose: string;
  contentFields: string[];
  states: string[];
  ownership: string;
  boundaries: string[];
  nextStep: string;
  actions?: ReactNode;
  uiSurface: AdminUiSurfaceKey;
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
};

export type BlueprintPanelViewModel = {
  actions?: ReactNode;
  ariaLabel: string;
  category: WorkbenchCategory;
  className: string;
  containerLabel: string;
  fieldLabels: string[];
  navId: string;
  ownerMode: "preview" | "owner";
  targetId: string;
  title: string;
  uiSurface: AdminUiSurfaceKey;
};

export type BlueprintPanelProjectionInput = {
  blueprint: BlueprintPage;
  defaultModuleLayout: ModuleLayoutMap;
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
  moduleLayout,
  subNavigation
}: BlueprintPanelProjectionInput): BlueprintPanelViewModel[] {
  return blueprint.modules.flatMap((module) => {
    const navItem = subNavigation.find((item) => item.id === module.navId);
    const layout = moduleLayout[module.navId] ?? defaultModuleLayout[module.navId] ?? defaultModuleLayoutState();
    if (!layout.visible) {
      return [];
    }

    return [{
      actions: module.actions,
      ariaLabel: `${CATEGORY_LABEL[module.container.category]} panel`,
      category: module.container.category,
      className: "",
      containerLabel: module.container.container,
      fieldLabels: module.contentFields,
      navId: module.navId,
      ownerMode: navItem?.mode === "preview" ? "preview" : "owner",
      targetId: navItem?.targetId ?? module.navId,
      title: navItem?.label ?? module.navId,
      uiSurface: module.uiSurface
    }];
  });
}
