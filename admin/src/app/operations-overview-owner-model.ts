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

export const OPERATIONS_OVERVIEW_OWNER_MODEL_SCHEMA = "operations-overview-owner-model/v1";

export type OperationsOverviewMetric = {
  body: string;
  statusLabel: string;
  statusTone: MetricTone;
  title: string;
  tone: MetricTone;
  trend: number[];
  value: string;
};

export type OperationsOverviewRow = {
  actionLabel: string;
  detail: string;
  label: string;
  meta: string;
  statusLabel: string;
  target?: AdminPage;
  tone: MetricTone;
};

export type OperationsOverviewSection = {
  navId: string;
  targetId: string;
  title: string;
  footer: string;
  metrics: OperationsOverviewMetric[];
  query?: AdminTableQueryState;
  resultWindow?: AdminTableResultWindow;
  rows: OperationsOverviewRow[];
  subtitle: string;
};

export type OperationsOverviewDeferredSection = {
  navId: string;
  targetId: string;
  title: string;
};

export type OperationsOverviewOwnerPageModel = {
  schemaVersion: typeof OPERATIONS_OVERVIEW_OWNER_MODEL_SCHEMA;
  page: AdminPage;
  visibleSections: OperationsOverviewSection[];
  deferredSections: OperationsOverviewDeferredSection[];
};

export type OperationsOverviewOwnerPageModelIssue = {
  code: "unsafe-row-text" | "unsafe-query-state" | "unsafe-projection";
  message: string;
  navId: string;
};

const OPERATIONS_OVERVIEW_SECTIONS: Record<string, {
  footer: string;
  metrics?: OperationsOverviewMetric[];
  rows?: OperationsOverviewRow[];
  subtitle: string;
}> = {
  "health-summary": {
    footer: "Health lane",
    metrics: [
      {
        body: "Ready for review",
        statusLabel: "Good",
        statusTone: "success",
        title: "Platform health",
        tone: "success",
        trend: [72, 74, 73, 76, 77, 79, 81],
        value: "Good"
      },
      {
        body: "High 4 · Med 9",
        statusLabel: "Review",
        statusTone: "danger",
        title: "Risk cases",
        tone: "danger",
        trend: [6, 8, 7, 10, 12, 15, 18],
        value: "18"
      },
      {
        body: "P95 sample age",
        statusLabel: "Good",
        statusTone: "info",
        title: "Freshness",
        tone: "info",
        trend: [180, 172, 160, 148, 140, 136, 134],
        value: "2m 14s"
      },
      {
        body: "Available share",
        statusLabel: "Good",
        statusTone: "success",
        title: "Coverage",
        tone: "success",
        trend: [96, 97, 97.4, 98, 98.2, 98.5, 98.6],
        value: "98.6%"
      }
    ],
    subtitle: "Safe first-screen platform health metrics"
  },
  "risk-queue": {
    footer: "Queue actions",
    rows: [
      {
        actionLabel: "Open",
        detail: "Order ord_2048 · Owner Usage",
        label: "case_012",
        meta: "SLA 4m",
        statusLabel: "Open",
        tone: "info"
      },
      {
        actionLabel: "Open",
        detail: "Order ord_2047 · Owner Accounts",
        label: "case_017",
        meta: "SLA 12m",
        statusLabel: "Review",
        tone: "warning"
      }
    ],
    subtitle: "Cases ranked by owner route"
  },
  "next-actions": {
    footer: "Action lane",
    rows: [
      {
        actionLabel: "Open",
        detail: "Route Accounts · Owner Operator",
        label: "handoff",
        meta: "Due Now",
        statusLabel: "Ready",
        target: "portalRequests",
        tone: "success"
      },
      {
        actionLabel: "Open",
        detail: "Route Usage · Owner Collector",
        label: "refresh",
        meta: "Due 8m",
        statusLabel: "Queued",
        target: "usageMonitor",
        tone: "info"
      }
    ],
    subtitle: "Route handoff for reviewers"
  },
  "review-candidates": {
    footer: "Candidate list",
    rows: [
      {
        actionLabel: "Open",
        detail: "Issue delay · Signal P95",
        label: "ord_2048",
        meta: "Age 14m",
        statusLabel: "Review",
        target: "usageMonitor",
        tone: "warning"
      },
      {
        actionLabel: "Open",
        detail: "Issue quota · Signal 90%",
        label: "acct_002",
        meta: "Age 1h",
        statusLabel: "Watch",
        target: "portalRequests",
        tone: "warning"
      }
    ],
    subtitle: "Items requiring operator check"
  }
};

const UNSAFE_OPERATIONS_OWNER_TEXT_PATTERN =
  /https?:\/\/|subscriptionUrl|subscription\s*url|token|secret|password|credential|edgecred_|raw\s*logs?|sqlite/i;

export function createOperationsOverviewOwnerPageModel(
  blueprintFactory: () => BlueprintPage
): OperationsOverviewOwnerPageModel;
export function createOperationsOverviewOwnerPageModel(
  blueprint: BlueprintPage
): OperationsOverviewOwnerPageModel;
export function createOperationsOverviewOwnerPageModel(
  blueprintOrFactory: BlueprintPage | (() => BlueprintPage)
): OperationsOverviewOwnerPageModel {
  const blueprint = typeof blueprintOrFactory === "function" ? blueprintOrFactory() : blueprintOrFactory;
  const projections = createAdminSafeReadProjections([blueprint]);
  const projectionsByNavId = new Map(projections.map((projection) => [projection.navId, projection]));
  const visibleNavIds = blueprint.overviewModuleIds ?? blueprint.modules.map((module) => module.navId);
  const visibleSections = visibleNavIds.flatMap((navId) => {
    const projection = projectionsByNavId.get(navId);
    const section = OPERATIONS_OVERVIEW_SECTIONS[navId];
    if (!projection || !section) {
      return [];
    }
    return [createOperationsSection(projection, section)];
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
    schemaVersion: OPERATIONS_OVERVIEW_OWNER_MODEL_SCHEMA,
    visibleSections
  };
}

export function findOperationsOverviewOwnerPageModelIssues(
  model: OperationsOverviewOwnerPageModel
): OperationsOverviewOwnerPageModelIssue[] {
  const queryIssues = model.visibleSections.flatMap((section) => (
    section.query
      ? findAdminTableQueryStateIssues([section.query]).map((queryIssue) => ({
        code: "unsafe-query-state" as const,
        message: queryIssue.message,
        navId: section.navId
      }))
      : []
  ));
  const contentIssues = model.visibleSections.flatMap((section) => {
    const sectionText = [
      section.footer,
      section.subtitle,
      section.title,
      ...section.metrics.flatMap((metric) => [
        metric.body,
        metric.statusLabel,
        metric.title,
        metric.value
      ]),
      ...section.rows.flatMap((row) => [
        row.actionLabel,
        row.detail,
        row.label,
        row.meta,
        row.statusLabel
      ])
    ].join(" ");

    return UNSAFE_OPERATIONS_OWNER_TEXT_PATTERN.test(sectionText) ? [{
      code: "unsafe-row-text" as const,
      message: "Operations Overview rows and metrics must not render secrets, credentials, subscription URLs, raw logs, or SQLite labels.",
      navId: section.navId
    }] : [];
  });

  return [
    ...queryIssues,
    ...contentIssues
  ];
}

export function findOperationsOverviewProjectionIssues(blueprint: BlueprintPage) {
  return findAdminSafeReadProjectionIssues(createAdminSafeReadProjections([blueprint])).map((projectionIssue) => ({
    code: "unsafe-projection" as const,
    message: projectionIssue.message,
    navId: projectionIssue.navId
  }));
}

function createOperationsSection(
  projection: AdminSafeReadProjection,
  section: {
    footer: string;
    metrics?: OperationsOverviewMetric[];
    rows?: OperationsOverviewRow[];
    subtitle: string;
  }
): OperationsOverviewSection {
  const rows = section.rows ?? [];
  const query = projection.query.pagination.required
    ? createAdminTableQueryState(projection)
    : undefined;

  return {
    footer: section.footer,
    metrics: section.metrics ?? [],
    navId: projection.navId,
    query,
    resultWindow: query ? projectAdminTableResultWindow(query, rows.length) : undefined,
    rows: [...rows],
    subtitle: section.subtitle,
    targetId: projection.targetId,
    title: projection.label
  };
}
