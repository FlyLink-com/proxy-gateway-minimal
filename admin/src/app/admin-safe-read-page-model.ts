import {
  ADMIN_SAFE_READ_PROJECTION_SCHEMA,
  createAdminSafeReadProjections,
  findAdminSafeReadProjectionIssues,
  type AdminSafeReadFixtureSnapshot,
  type AdminSafeReadMutationPolicy,
  type AdminSafeReadProjection,
  type AdminSafeReadQueryModel
} from "./admin-safe-read-projection";
import { type BlueprintPage } from "./admin-ui-projection";
import {
  type AdminPage,
  type PageWorkbenchRole
} from "./navigation";
import {
  type AdminAppDataBoundary,
  type AdminAppProductionImpact
} from "./admin-app-manifest";
import { type AdminUiSurfaceKey } from "./admin-ui-reference-model";

export const ADMIN_SAFE_READ_PAGE_MODEL_SCHEMA = "admin-safe-read-page-model/v1";

export const ADMIN_SAFE_READ_PAGE_STATE_CONTRACT = [
  "ready",
  "stale",
  "partial",
  "readonly",
  "locked",
  "error"
] as const;

export type AdminSafeReadPageModelSchema = typeof ADMIN_SAFE_READ_PAGE_MODEL_SCHEMA;

export type AdminSafeReadPageState = typeof ADMIN_SAFE_READ_PAGE_STATE_CONTRACT[number];

export type AdminSafeReadSectionModel = {
  displayFields: string[];
  displayState: AdminSafeReadPageState;
  fixtureProjection: AdminSafeReadFixtureSnapshot;
  label: string;
  manifestId: string;
  navId: string;
  productionImpact: AdminAppProductionImpact;
  projectionSchemaVersion: typeof ADMIN_SAFE_READ_PROJECTION_SCHEMA;
  query: AdminSafeReadQueryModel;
  targetId: string;
  uiSurface: AdminUiSurfaceKey;
};

export type AdminSafeReadPageFixtureSummary = {
  chipCount: number;
  deferredSections: number;
  rowCount: number;
  totalSections: number;
  visibleSections: number;
};

export type AdminSafeReadPageModel = {
  dataBoundary: AdminAppDataBoundary;
  deferredSectionIds: string[];
  fixtureSummary: AdminSafeReadPageFixtureSummary;
  mutationPolicy: AdminSafeReadMutationPolicy;
  page: AdminPage;
  pageRole: PageWorkbenchRole;
  routeHash: string;
  schemaVersion: AdminSafeReadPageModelSchema;
  sections: AdminSafeReadSectionModel[];
  stateContract: readonly AdminSafeReadPageState[];
  visibleSectionIds: string[];
};

export type AdminSafeReadPageModelIssueCode =
  | "missing-fixture-projection"
  | "unsafe-page-text"
  | "unsafe-production-impact"
  | "unsafe-projection";

export type AdminSafeReadPageModelIssue = {
  code: AdminSafeReadPageModelIssueCode;
  message: string;
  navId?: string;
  page: AdminPage;
};

const UNSAFE_SAFE_READ_PAGE_TEXT_PATTERN =
  /https?:\/\/|subscription\s*url|subscriptionUrl|token|secret|credential|password|raw\s*(?:session|env|config|logs?|db|sqlite|runtime|operator|subscription|material)|sqlite\s*row|private\s*key|auth\s*header|bearer/i;

const ADMIN_SAFE_READ_PAGE_ROUTE_SLUGS: Record<AdminPage, string> = {
  dashboard: "operations",
  portalRequests: "accounts",
  usageMonitor: "usage"
};

const ADMIN_SAFE_READ_VISIBLE_SECTION_IDS: Record<AdminPage, string[]> = {
  dashboard: [
    "health-summary",
    "risk-queue",
    "next-actions"
  ],
  portalRequests: [
    "account-overview",
    "resource-orders",
    "lifecycle"
  ],
  usageMonitor: [
    "freshness",
    "channel-coverage",
    "usage-ledger"
  ]
};

export function createAdminSafeReadPageModels(
  blueprints: readonly BlueprintPage[]
): AdminSafeReadPageModel[] {
  return blueprints.map((blueprint) => createAdminSafeReadPageModel(blueprint));
}

export function createAdminSafeReadPageModel(
  blueprint: BlueprintPage
): AdminSafeReadPageModel {
  const projections = createAdminSafeReadProjections([blueprint]);
  const visibleSectionIds = selectVisibleSectionIds(blueprint);
  const deferredSectionIds = blueprint.modules
    .map((module) => module.navId)
    .filter((navId) => !visibleSectionIds.includes(navId));
  const sections = projections.map((projection) => createSectionModel(
    projection,
    visibleSectionIds.includes(projection.navId)
  ));

  return {
    dataBoundary: "safe-summary-only",
    deferredSectionIds,
    fixtureSummary: summarizeFixtureProjection(sections, visibleSectionIds, deferredSectionIds),
    mutationPolicy: "read-only-no-mutation",
    page: blueprint.page,
    pageRole: projections[0]?.pageRole ?? "overview",
    routeHash: formatAdminSafeReadRouteHash(blueprint.page),
    schemaVersion: ADMIN_SAFE_READ_PAGE_MODEL_SCHEMA,
    sections,
    stateContract: ADMIN_SAFE_READ_PAGE_STATE_CONTRACT,
    visibleSectionIds
  };
}

export function findAdminSafeReadPageModelIssues(
  models: readonly AdminSafeReadPageModel[]
): AdminSafeReadPageModelIssue[] {
  return models.flatMap((model) => {
    const issues: AdminSafeReadPageModelIssue[] = [];

    model.sections.forEach((section) => {
      if (!section.fixtureProjection.safetyNotes.length) {
        issues.push(issue(
          "missing-fixture-projection",
          model.page,
          "Safe read page sections must include fixture safety notes.",
          section.navId
        ));
      }

      if (section.productionImpact !== "none" && section.productionImpact !== "read-only") {
        issues.push(issue(
          "unsafe-production-impact",
          model.page,
          "Safe read page sections must stay read-only and cannot expose mutation surfaces.",
          section.navId
        ));
      }
    });

    if (isUnsafeSafeReadPageText(JSON.stringify(model))) {
      issues.push(issue(
        "unsafe-page-text",
        model.page,
        "Safe read page models must not carry raw URLs, secrets, credentials, tokens, SQLite labels, logs, or runtime material."
      ));
    }

    return issues;
  });
}

export function findAdminSafeReadPageProjectionIssues(
  blueprints: readonly BlueprintPage[]
): AdminSafeReadPageModelIssue[] {
  return findAdminSafeReadProjectionIssues(createAdminSafeReadProjections(blueprints)).map((projectionIssue) => ({
    code: "unsafe-projection",
    message: projectionIssue.message,
    navId: projectionIssue.navId,
    page: projectionIssue.page
  }));
}

function createSectionModel(
  projection: AdminSafeReadProjection,
  visible: boolean
): AdminSafeReadSectionModel {
  return {
    displayFields: [...projection.allowedDisplayFields],
    displayState: visible ? "readonly" : "locked",
    fixtureProjection: sanitizeFixtureSnapshot(projection.fixtureSnapshot) ?? {
      chipCount: 0,
      rowCount: 0,
      safetyNotes: [],
      summary: ""
    },
    label: projection.label,
    manifestId: projection.manifestId,
    navId: projection.navId,
    productionImpact: projection.productionImpact,
    projectionSchemaVersion: projection.schemaVersion,
    query: projection.query,
    targetId: projection.targetId,
    uiSurface: projection.uiSurface
  };
}

function summarizeFixtureProjection(
  sections: readonly AdminSafeReadSectionModel[],
  visibleSectionIds: readonly string[],
  deferredSectionIds: readonly string[]
): AdminSafeReadPageFixtureSummary {
  return {
    chipCount: sections.reduce((sum, section) => sum + section.fixtureProjection.chipCount, 0),
    deferredSections: deferredSectionIds.length,
    rowCount: sections.reduce((sum, section) => sum + section.fixtureProjection.rowCount, 0),
    totalSections: sections.length,
    visibleSections: visibleSectionIds.length
  };
}

function selectVisibleSectionIds(blueprint: BlueprintPage) {
  const moduleIds = new Set(blueprint.modules.map((module) => module.navId));
  const visibleSectionIds = ADMIN_SAFE_READ_VISIBLE_SECTION_IDS[blueprint.page]
    .filter((navId) => moduleIds.has(navId));

  return visibleSectionIds.length
    ? visibleSectionIds
    : blueprint.modules.map((module) => module.navId);
}

function sanitizeFixtureSnapshot(
  fixtureSnapshot: AdminSafeReadFixtureSnapshot | undefined
): AdminSafeReadFixtureSnapshot | undefined {
  if (!fixtureSnapshot) {
    return undefined;
  }

  return {
    chipCount: fixtureSnapshot.chipCount,
    rowCount: fixtureSnapshot.rowCount,
    safetyNotes: fixtureSnapshot.safetyNotes.map((note) => (
      isUnsafeSafeReadPageText(note)
        ? "Protected data remains outside this read model."
        : note
    )),
    summary: isUnsafeSafeReadPageText(fixtureSnapshot.summary)
      ? "Safe fixture summary is available."
      : fixtureSnapshot.summary
  };
}

function isUnsafeSafeReadPageText(value: string) {
  return UNSAFE_SAFE_READ_PAGE_TEXT_PATTERN.test(value);
}

function formatAdminSafeReadRouteHash(page: AdminPage) {
  return `#/admin/${ADMIN_SAFE_READ_PAGE_ROUTE_SLUGS[page]}`;
}

function issue(
  code: AdminSafeReadPageModelIssueCode,
  page: AdminPage,
  message: string,
  navId?: string
): AdminSafeReadPageModelIssue {
  return {
    code,
    message,
    navId,
    page
  };
}
