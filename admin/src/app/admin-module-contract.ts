import { type WorkbenchCategory } from "../components/primitives";
import {
  type AdminContentContainmentStrategy,
  type BlueprintPage
} from "./admin-ui-projection";
import {
  getAdminAppMap,
  type AdminAppManifest,
  type AdminAppMap,
  type AdminAppSourceContract
} from "./admin-app-manifest";
import {
  type AdminPage,
  type PageSubNavigationMode,
  type PageWorkbenchRole,
  pageSubNavigation,
  pageWorkbenchContracts
} from "./navigation";

export type AdminModuleContract = {
  page: AdminPage;
  pageRole: PageWorkbenchRole;
  navId: string;
  targetId: string;
  label: string;
  owner: string;
  ownerMode: PageSubNavigationMode;
  category: WorkbenchCategory;
  containmentStrategy: AdminContentContainmentStrategy;
  manifestId: string;
  paginationStandardNodeId?: "157:2";
  sourceContract: AdminAppSourceContract;
};

export type AdminModuleContractIssueCode =
  | "duplicate-blueprint-nav-id"
  | "missing-blueprint-module"
  | "missing-navigation-module"
  | "missing-manifest-plugin"
  | "manifest-target-mismatch"
  | "manifest-owner-mode-mismatch"
  | "manifest-category-mismatch"
  | "missing-source-contract"
  | "missing-containment-strategy";

export type AdminModuleContractIssue = {
  code: AdminModuleContractIssueCode;
  page: AdminPage;
  navId: string;
  message: string;
};

export function createAdminModuleContracts(
  blueprints: readonly BlueprintPage[],
  appMap: AdminAppMap = getAdminAppMap()
): AdminModuleContract[] {
  const pluginsByPageAndNavId = createPluginIndex(appMap.plugins);
  const contracts: AdminModuleContract[] = [];

  blueprints.forEach((blueprint) => {
    const pageNavigation = pageSubNavigation[blueprint.page];
    const pageContract = pageWorkbenchContracts[blueprint.page];

    blueprint.modules.forEach((module) => {
      const navItem = pageNavigation.find((item) => item.id === module.navId);
      const plugin = pluginsByPageAndNavId.get(moduleKey(blueprint.page, module.navId));

      if (!navItem || !plugin?.route.targetId || !plugin.catalog.sourceContract) {
        return;
      }

      contracts.push({
        category: module.container.category,
        containmentStrategy: module.containmentStrategy,
        label: navItem.label,
        manifestId: plugin.id,
        navId: module.navId,
        owner: navItem.owner,
        ownerMode: navItem.mode,
        paginationStandardNodeId: module.containmentStrategy === "not-applicable" ? undefined : "157:2",
        page: blueprint.page,
        pageRole: pageContract.role,
        sourceContract: plugin.catalog.sourceContract,
        targetId: navItem.targetId
      });
    });
  });

  return contracts;
}

export function findAdminModuleContractIssues(
  blueprints: readonly BlueprintPage[],
  appMap: AdminAppMap = getAdminAppMap()
): AdminModuleContractIssue[] {
  const pluginsByPageAndNavId = createPluginIndex(appMap.plugins);
  const issues: AdminModuleContractIssue[] = [];

  blueprints.forEach((blueprint) => {
    const pageNavigation = pageSubNavigation[blueprint.page];
    const pageContract = pageWorkbenchContracts[blueprint.page];
    const blueprintNavIds = blueprint.modules.map((module) => module.navId);
    const uniqueBlueprintNavIds = new Set<string>();

    blueprint.modules.forEach((module) => {
      if (uniqueBlueprintNavIds.has(module.navId)) {
        issues.push(issue("duplicate-blueprint-nav-id", blueprint.page, module.navId, "Blueprint module navId is duplicated."));
      }
      uniqueBlueprintNavIds.add(module.navId);

      const navItem = pageNavigation.find((item) => item.id === module.navId);
      if (!navItem || !pageContract.sectionIds.includes(module.navId)) {
        issues.push(issue("missing-navigation-module", blueprint.page, module.navId, "Blueprint module is not registered in pageSubNavigation/pageWorkbenchContracts."));
        return;
      }

      if (!module.containmentStrategy) {
        issues.push(issue("missing-containment-strategy", blueprint.page, module.navId, "Blueprint module must declare pagination, route-split, bounded internal scroll, or not-applicable."));
      }

      const plugin = pluginsByPageAndNavId.get(moduleKey(blueprint.page, module.navId));
      if (!plugin) {
        issues.push(issue("missing-manifest-plugin", blueprint.page, module.navId, "Navigation module does not have a matching plugin manifest entry."));
        return;
      }

      if (plugin.route.targetId !== navItem.targetId) {
        issues.push(issue("manifest-target-mismatch", blueprint.page, module.navId, "Plugin targetId does not match pageSubNavigation targetId."));
      }

      if (plugin.plugin?.ownerMode !== navItem.mode) {
        issues.push(issue("manifest-owner-mode-mismatch", blueprint.page, module.navId, "Plugin ownerMode does not match pageSubNavigation mode."));
      }

      if (plugin.category !== module.container.category || plugin.catalog.category !== module.container.category) {
        issues.push(issue("manifest-category-mismatch", blueprint.page, module.navId, "Plugin category does not match the blueprint container category."));
      }

      if (
        !plugin.catalog.sourceContract.dataSourceRefs.length ||
        !plugin.catalog.sourceContract.drilldownTargets.length ||
        !plugin.catalog.sourceContract.evidenceRoutes.length ||
        plugin.catalog.sourceContract.transformBoundary !== "display-only"
      ) {
        issues.push(issue("missing-source-contract", blueprint.page, module.navId, "Plugin sourceContract is incomplete."));
      }
    });

    pageNavigation.forEach((navItem) => {
      if (!blueprintNavIds.includes(navItem.id)) {
        issues.push(issue("missing-blueprint-module", blueprint.page, navItem.id, "pageSubNavigation item is missing from the page blueprint."));
      }
    });

    appMap.pluginsByPage[blueprint.page].forEach((plugin) => {
      const navId = plugin.plugin?.navId ?? plugin.id;
      if (!blueprintNavIds.includes(navId)) {
        issues.push(issue("missing-blueprint-module", blueprint.page, navId, "Plugin manifest entry is missing from the page blueprint."));
      }
    });
  });

  return issues;
}

function createPluginIndex(plugins: readonly AdminAppManifest[]) {
  return new Map(
    plugins.flatMap((plugin) => {
      if (!plugin.route.page || !plugin.plugin?.navId) {
        return [];
      }
      return [[moduleKey(plugin.route.page, plugin.plugin.navId), plugin] as const];
    })
  );
}

function moduleKey(page: AdminPage, navId: string) {
  return `${page}:${navId}`;
}

function issue(
  code: AdminModuleContractIssueCode,
  page: AdminPage,
  navId: string,
  message: string
): AdminModuleContractIssue {
  return {
    code,
    message,
    navId,
    page
  };
}
