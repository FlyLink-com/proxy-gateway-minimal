import {
  type AdminContentContainmentStrategy,
  type BlueprintPage
} from "./admin-ui-projection";
import {
  getAdminFixturePreviewPanel
} from "./admin-fixture-preview";
import {
  getAdminAppMap,
  type AdminAppDataBoundary,
  type AdminAppMap,
  type AdminAppProductionImpact
} from "./admin-app-manifest";
import {
  createAdminModuleContracts,
  type AdminModuleContract
} from "./admin-module-contract";
import {
  type AdminPage,
  type PageSubNavigationMode,
  type PageWorkbenchRole
} from "./navigation";
import { type AdminUiSurfaceKey } from "./admin-ui-reference-model";
import { ADMIN_PAGINATION_STANDARD } from "./admin-ui-standards";

export const ADMIN_SAFE_READ_PROJECTION_SCHEMA = "admin-safe-read-projection/v1";

export type AdminSafeReadProjectionSchema = typeof ADMIN_SAFE_READ_PROJECTION_SCHEMA;

export type AdminSafeReadMutationPolicy = "read-only-no-mutation";

export type AdminSafeReadPagination = {
  defaultPageSize: 10;
  maxPageSize: 100;
  required: boolean;
  standardId?: typeof ADMIN_PAGINATION_STANDARD.id;
};

export type AdminSafeReadQueryModel = {
  boundedScrollRequired: boolean;
  filterKeys: readonly ["state", "tone", "owner", "route"];
  pagination: AdminSafeReadPagination;
  routeSplitRequired: boolean;
  sortKeys: readonly ["updatedAt", "state", "safeRef"];
};

export type AdminSafeReadFixtureSnapshot = {
  chipCount: number;
  rowCount: number;
  safetyNotes: string[];
  summary: string;
};

export type AdminSafeReadProjection = {
  schemaVersion: AdminSafeReadProjectionSchema;
  page: AdminPage;
  pageRole: PageWorkbenchRole;
  navId: string;
  targetId: string;
  label: string;
  owner: string;
  ownerMode: PageSubNavigationMode;
  uiSurface: AdminUiSurfaceKey;
  category: AdminModuleContract["category"];
  containmentStrategy: AdminContentContainmentStrategy;
  dataBoundary: AdminAppDataBoundary;
  drilldownTargets: string[];
  evidenceRoutes: string[];
  fixtureSnapshot?: AdminSafeReadFixtureSnapshot;
  allowedDisplayFields: string[];
  forbiddenFields: string[];
  manifestId: string;
  mutationPolicy: AdminSafeReadMutationPolicy;
  ownership: {
    boundaries: string[];
    nextStep: string;
    summary: string;
  };
  productionImpact: AdminAppProductionImpact;
  query: AdminSafeReadQueryModel;
  sourceRefs: string[];
  transformBoundary: "display-only";
};

export type AdminSafeReadProjectionIssueCode =
  | "missing-app-manifest"
  | "unsafe-display-field"
  | "unsafe-source-ref"
  | "unsafe-evidence-route"
  | "unsafe-drilldown-target"
  | "unsafe-mutation-capability"
  | "missing-pagination-standard";

export type AdminSafeReadProjectionIssue = {
  code: AdminSafeReadProjectionIssueCode;
  page: AdminPage;
  navId: string;
  message: string;
};

const UNSAFE_SAFE_READ_TEXT_PATTERN =
  /https?:\/\/|subscription\s*url|subscriptionUrl|token|secret|credential|password|raw\s*(?:session|env|config|logs?|db|sqlite|runtime|operator|subscription|material)|sqlite\s*row|private\s*key|auth\s*header|bearer/i;

export function createAdminSafeReadProjections(
  blueprints: readonly BlueprintPage[],
  appMap: AdminAppMap = getAdminAppMap()
): AdminSafeReadProjection[] {
  const moduleContracts = createAdminModuleContracts(blueprints, appMap);
  const modulesByKey = createBlueprintModuleIndex(blueprints);

  return moduleContracts.flatMap((contract) => {
    const app = appMap.byId[contract.manifestId];
    const module = modulesByKey.get(moduleKey(contract.page, contract.navId));
    if (!app || !module) {
      return [];
    }
    const fixturePanel = getAdminFixturePreviewPanel(contract.page, contract.navId);

    return [{
      allowedDisplayFields: normalizeAllowedDisplayFields(contract.page, contract.navId, module.contentFields),
      category: contract.category,
      containmentStrategy: contract.containmentStrategy,
      dataBoundary: app.safety.redaction,
      drilldownTargets: [...contract.sourceContract.drilldownTargets],
      evidenceRoutes: [...contract.sourceContract.evidenceRoutes],
      fixtureSnapshot: fixturePanel ? {
        chipCount: fixturePanel.chips.length,
        rowCount: fixturePanel.rows.length,
        safetyNotes: [...fixturePanel.safetyNotes],
        summary: fixturePanel.summary
      } : createFallbackFixtureSnapshot(contract.label),
      forbiddenFields: [...app.safety.forbiddenFields],
      label: contract.label,
      manifestId: contract.manifestId,
      mutationPolicy: "read-only-no-mutation",
      navId: contract.navId,
      owner: contract.owner,
      ownerMode: contract.ownerMode,
      ownership: {
        boundaries: [...module.boundaries],
        nextStep: module.nextStep,
        summary: module.ownership
      },
      page: contract.page,
      pageRole: contract.pageRole,
      productionImpact: app.safety.productionImpact,
      query: createQueryModel(contract.containmentStrategy),
      schemaVersion: ADMIN_SAFE_READ_PROJECTION_SCHEMA,
      sourceRefs: [...contract.sourceContract.dataSourceRefs],
      targetId: contract.targetId,
      transformBoundary: contract.sourceContract.transformBoundary,
      uiSurface: module.uiSurface
    }];
  });
}

export function findAdminSafeReadProjectionIssues(
  projections: readonly AdminSafeReadProjection[]
): AdminSafeReadProjectionIssue[] {
  return projections.flatMap((projection) => {
    const issues: AdminSafeReadProjectionIssue[] = [];

    projection.allowedDisplayFields.forEach((field) => {
      if (isUnsafeSafeReadText(field)) {
        issues.push(issue(
          "unsafe-display-field",
          projection,
          "Allowed display fields must not include raw, secret, credential, token, URL, or SQLite labels."
        ));
      }
    });

    projection.sourceRefs.forEach((sourceRef) => {
      if (isUnsafeSafeReadText(sourceRef)) {
        issues.push(issue(
          "unsafe-source-ref",
          projection,
          "Data source refs must describe redacted summary sources only."
        ));
      }
    });

    projection.evidenceRoutes.forEach((route) => {
      if (isUnsafeSafeReadText(route)) {
        issues.push(issue(
          "unsafe-evidence-route",
          projection,
          "Evidence routes must not point to raw logs, secrets, credentials, or subscription output."
        ));
      }
    });

    projection.drilldownTargets.forEach((target) => {
      if (isUnsafeSafeReadText(target)) {
        issues.push(issue(
          "unsafe-drilldown-target",
          projection,
          "Drilldown targets must stay inside safe Admin page anchors."
        ));
      }
    });

    if (projection.productionImpact !== "none" && projection.productionImpact !== "read-only") {
      issues.push(issue(
        "unsafe-mutation-capability",
        projection,
        "Phase 2 read projections must remain read-only and cannot expose gated execution as active UI."
      ));
    }

    if (projection.query.pagination.required && projection.query.pagination.standardId !== ADMIN_PAGINATION_STANDARD.id) {
      issues.push(issue(
        "missing-pagination-standard",
        projection,
        "Long or split modules must be attached to the Admin pagination standard."
      ));
    }

    return issues;
  });
}

function createQueryModel(containmentStrategy: AdminContentContainmentStrategy): AdminSafeReadQueryModel {
  const requiresContainedData = containmentStrategy !== "not-applicable";

  return {
    boundedScrollRequired: containmentStrategy === "bounded-internal-scroll",
    filterKeys: ["state", "tone", "owner", "route"],
    pagination: {
      defaultPageSize: ADMIN_PAGINATION_STANDARD.defaultPageSize,
      maxPageSize: ADMIN_PAGINATION_STANDARD.maxPageSize,
      required: requiresContainedData,
      standardId: requiresContainedData ? ADMIN_PAGINATION_STANDARD.id : undefined
    },
    routeSplitRequired: containmentStrategy === "route-split",
    sortKeys: ["updatedAt", "state", "safeRef"]
  };
}

function createBlueprintModuleIndex(blueprints: readonly BlueprintPage[]) {
  return new Map(blueprints.flatMap((blueprint) => (
    blueprint.modules.map((module) => [moduleKey(blueprint.page, module.navId), module] as const)
  )));
}

function createFallbackFixtureSnapshot(label: string): AdminSafeReadFixtureSnapshot {
  return {
    chipCount: 0,
    rowCount: 0,
    safetyNotes: [
      `${label} has no synthetic fixture rows in this source snapshot.`,
      "Safe read projection remains display-only and excludes protected material."
    ],
    summary: `${label} safe read projection is defined without fixture rows.`
  };
}

function normalizeAllowedDisplayFields(
  page: AdminPage,
  navId: string,
  contentFields: readonly string[]
) {
  if (page === "usageMonitor" && navId === "usage-ledger") {
    return [
      "User/account · safe ref",
      "Order count · measured / pending",
      "Channel · safe ref",
      "Traffic · upload / download / total",
      "Collected · timestamp"
    ];
  }

  return [...contentFields];
}

function isUnsafeSafeReadText(value: string) {
  return UNSAFE_SAFE_READ_TEXT_PATTERN.test(value);
}

function moduleKey(page: AdminPage, navId: string) {
  return `${page}:${navId}`;
}

function issue(
  code: AdminSafeReadProjectionIssueCode,
  projection: AdminSafeReadProjection,
  message: string
): AdminSafeReadProjectionIssue {
  return {
    code,
    message,
    navId: projection.navId,
    page: projection.page
  };
}
