import {
  createAdminSafeReadProjections,
  findAdminSafeReadProjectionIssues,
  type AdminSafeReadProjection
} from "./admin-safe-read-projection";
import {
  createAdminTableQueryState,
  findAdminTableQueryStateIssues,
  projectAdminTableResultWindow,
  type AdminTableQueryState,
  type AdminTableResultWindow
} from "./admin-table-query-state";
import { type BlueprintPage } from "./admin-ui-projection";
import { type AdminPage } from "./navigation";
import { type MetricTone } from "../components/primitives";

export const ACCOUNTS_RESOURCES_OWNER_MODEL_SCHEMA = "accounts-resources-owner-model/v1";

export type AccountsResourceOwnerRow = {
  actionLabel: string;
  detail: string;
  label: string;
  meta: string;
  statusLabel: string;
  tone: MetricTone;
};

export type AccountsResourceOwnerSection = {
  navId: string;
  targetId: string;
  title: string;
  footer: string;
  query: AdminTableQueryState;
  resultWindow: AdminTableResultWindow;
  rows: AccountsResourceOwnerRow[];
  subtitle: string;
};

export type AccountsResourceDeferredSection = {
  navId: string;
  targetId: string;
  title: string;
};

export type AccountsResourcesOwnerPageModel = {
  schemaVersion: typeof ACCOUNTS_RESOURCES_OWNER_MODEL_SCHEMA;
  page: AdminPage;
  visibleSections: AccountsResourceOwnerSection[];
  deferredSections: AccountsResourceDeferredSection[];
};

export type AccountsResourcesOwnerPageModelIssue = {
  code: "unsafe-row-text" | "unsafe-query-state" | "unsafe-projection";
  message: string;
  navId: string;
};

const ACCOUNTS_RESOURCE_ROWS: Record<string, {
  footer: string;
  rows: AccountsResourceOwnerRow[];
  subtitle: string;
}> = {
  "account-overview": {
    footer: "Directory",
    rows: [
      {
        actionLabel: "Open",
        detail: "Order ord_2048 · Plan standard",
        label: "user_001",
        meta: "Risk Med",
        statusLabel: "Active",
        tone: "info"
      },
      {
        actionLabel: "Open",
        detail: "Order ord_2047 · Plan trial",
        label: "user_002",
        meta: "Risk Low",
        statusLabel: "Active",
        tone: "success"
      }
    ],
    subtitle: "Users and account-level resources"
  },
  "resource-orders": {
    footer: "Resource list",
    rows: [
      {
        actionLabel: "Open",
        detail: "Sub sub_8192 · Channel hk-01",
        label: "ord_2048",
        meta: "State Live",
        statusLabel: "Synced",
        tone: "success"
      },
      {
        actionLabel: "Open",
        detail: "Sub sub_8191 · Channel sg-01",
        label: "ord_2047",
        meta: "State Pending",
        statusLabel: "Watch",
        tone: "warning"
      }
    ],
    subtitle: "Order to subscription mapping"
  },
  lifecycle: {
    footer: "Lifecycle subpage",
    rows: [
      {
        actionLabel: "Open",
        detail: "Account user_002 · Order ord_2047",
        label: "pause_check",
        meta: "When Now",
        statusLabel: "Review",
        tone: "warning"
      },
      {
        actionLabel: "Open",
        detail: "Account user_003 · Order ord_2046",
        label: "archive_due",
        meta: "When 2d",
        statusLabel: "Due",
        tone: "neutral"
      }
    ],
    subtitle: "Page-local lifecycle status"
  }
};

const UNSAFE_ACCOUNTS_OWNER_TEXT_PATTERN =
  /https?:\/\/|subscriptionUrl|subscription\s*url|token|secret|password|credential|edgecred_|raw\s*logs?|sqlite/i;

export function createAccountsResourcesOwnerPageModel(
  blueprint: BlueprintPage
): AccountsResourcesOwnerPageModel {
  const projections = createAdminSafeReadProjections([blueprint]);
  const projectionsByNavId = new Map(projections.map((projection) => [projection.navId, projection]));
  const visibleNavIds = blueprint.overviewModuleIds ?? blueprint.modules.map((module) => module.navId);
  const visibleSections = visibleNavIds.flatMap((navId) => {
    const projection = projectionsByNavId.get(navId);
    const rowSet = ACCOUNTS_RESOURCE_ROWS[navId];
    if (!projection || !rowSet) {
      return [];
    }
    return [createAccountsOwnerSection(projection, rowSet)];
  });
  const deferredSections = blueprint.modules
    .filter((module) => !visibleNavIds.includes(module.navId))
    .flatMap((module) => {
      const projection = projectionsByNavId.get(module.navId);
      return projection ? [{
        navId: projection.navId,
        targetId: projection.targetId,
        title: projection.label
      }] : [];
    });

  return {
    deferredSections,
    page: blueprint.page,
    schemaVersion: ACCOUNTS_RESOURCES_OWNER_MODEL_SCHEMA,
    visibleSections
  };
}

export function findAccountsResourcesOwnerPageModelIssues(
  model: AccountsResourcesOwnerPageModel
): AccountsResourcesOwnerPageModelIssue[] {
  const queryIssues = model.visibleSections.flatMap((section) => (
    findAdminTableQueryStateIssues([section.query]).map((queryIssue) => ({
      code: "unsafe-query-state" as const,
      message: queryIssue.message,
      navId: section.navId
    }))
  ));
  const rowIssues = model.visibleSections.flatMap((section) => (
    section.rows.flatMap((row) => {
      const rowText = [
        row.actionLabel,
        row.detail,
        row.label,
        row.meta,
        row.statusLabel
      ].join(" ");
      return UNSAFE_ACCOUNTS_OWNER_TEXT_PATTERN.test(rowText) ? [{
        code: "unsafe-row-text" as const,
        message: "Accounts owner rows must not render secrets, credentials, subscription URLs, raw logs, or SQLite labels.",
        navId: section.navId
      }] : [];
    })
  ));

  return [
    ...queryIssues,
    ...rowIssues
  ];
}

export function findAccountsResourcesProjectionIssues(blueprint: BlueprintPage) {
  return findAdminSafeReadProjectionIssues(createAdminSafeReadProjections([blueprint])).map((projectionIssue) => ({
    code: "unsafe-projection" as const,
    message: projectionIssue.message,
    navId: projectionIssue.navId
  }));
}

function createAccountsOwnerSection(
  projection: AdminSafeReadProjection,
  rowSet: {
    footer: string;
    rows: AccountsResourceOwnerRow[];
    subtitle: string;
  }
): AccountsResourceOwnerSection {
  const query = createAdminTableQueryState(projection);
  return {
    footer: rowSet.footer,
    navId: projection.navId,
    query,
    resultWindow: projectAdminTableResultWindow(query, rowSet.rows.length),
    rows: [...rowSet.rows],
    subtitle: rowSet.subtitle,
    targetId: projection.targetId,
    title: projection.label
  };
}
