import {
  createAdminSafeReadProjections,
  findAdminSafeReadProjectionIssues,
  type AdminSafeReadProjection
} from "./admin-safe-read-projection";
import {
  createAdminSafeReadPageModel,
  type AdminSafeReadPageModel
} from "./admin-safe-read-page-model";
import {
  createAdminTableQueryState,
  findAdminTableQueryStateIssues,
  projectAdminTableResultWindow,
  type AdminTableQueryState,
  type AdminTableResultWindow
} from "./admin-table-query-state";
import {
  type BlueprintPage
} from "./admin-ui-projection";
import { type AdminPage } from "./navigation";
import { type MetricTone } from "../components/primitives";

export const USAGE_CHANNELS_OWNER_MODEL_SCHEMA = "usage-channels-owner-model/v1";

export type UsageOwnerRow = {
  actionLabel: string;
  label: string;
  meta: string;
  rightMeta: string;
  statusLabel: string;
  tone: MetricTone;
};

export type UsageOwnerSection = {
  navId: string;
  targetId: string;
  title: string;
  footer: string;
  query: AdminTableQueryState;
  resultWindow: AdminTableResultWindow;
  rows: UsageOwnerRow[];
  subtitle: string;
};

export type UsageDeferredSection = {
  navId: string;
  targetId: string;
  title: string;
};

export type UsageChannelsOwnerPageModel = {
  schemaVersion: typeof USAGE_CHANNELS_OWNER_MODEL_SCHEMA;
  page: AdminPage;
  safeReadModel: AdminSafeReadPageModel;
  visibleSections: UsageOwnerSection[];
  deferredSections: UsageDeferredSection[];
};

export type UsageChannelsOwnerPageModelIssue = {
  code: "unsafe-row-text" | "unsafe-query-state" | "unsafe-projection" | "missing-visible-section";
  message: string;
  navId: string;
};

const USAGE_OWNER_ROWS: Record<string, {
  footer: string;
  rows: UsageOwnerRow[];
  subtitle: string;
}> = {
  freshness: {
    footer: "Freshness lane",
    rows: [
      {
        actionLabel: "Open",
        label: "hk-01",
        meta: "Age 2m 14s · SLO 5m",
        rightMeta: "State OK",
        statusLabel: "Fresh",
        tone: "success"
      },
      {
        actionLabel: "Open",
        label: "hk-02",
        meta: "Age 4m 10s · SLO 5m",
        rightMeta: "State OK",
        statusLabel: "Fresh",
        tone: "success"
      }
    ],
    subtitle: "Usage collection age and SLO"
  },
  "channel-coverage": {
    footer: "Coverage lane",
    rows: [
      {
        actionLabel: "Open",
        label: "hk-01",
        meta: "Measured Yes · Gap None",
        rightMeta: "State OK",
        statusLabel: "Covered",
        tone: "success"
      },
      {
        actionLabel: "Open",
        label: "sg-02",
        meta: "Measured Yes · Gap None",
        rightMeta: "State OK",
        statusLabel: "Covered",
        tone: "success"
      }
    ],
    subtitle: "Measured channels and gaps"
  },
  "usage-ledger": {
    footer: "Ledger",
    rows: [
      {
        actionLabel: "Open",
        label: "acct_001",
        meta: "42.8GB locked",
        rightMeta: "",
        statusLabel: "Locked",
        tone: "info"
      },
      {
        actionLabel: "Open",
        label: "acct_002",
        meta: "18.6GB",
        rightMeta: "",
        statusLabel: "Measured",
        tone: "info"
      }
    ],
    subtitle: "User traffic ledger"
  }
};

const UNSAFE_USAGE_OWNER_TEXT_PATTERN =
  /https?:\/\/|subscriptionUrl|subscription\s*url|token|secret|password|credential|edgecred_|raw\s*logs?|sqlite/i;

export function createUsageChannelsOwnerPageModel(blueprint: BlueprintPage): UsageChannelsOwnerPageModel {
  const safeReadModel = createAdminSafeReadPageModel(blueprint);
  const projections = createAdminSafeReadProjections([blueprint]);
  const projectionsByNavId = new Map(projections.map((projection) => [projection.navId, projection]));
  const visibleNavIds = safeReadModel.visibleSectionIds;
  const visibleSections = visibleNavIds.flatMap((navId) => {
    const projection = projectionsByNavId.get(navId);
    const rowSet = USAGE_OWNER_ROWS[navId];
    if (!projection || !rowSet) {
      return [];
    }
    return [createUsageOwnerSection(projection, rowSet)];
  });
  const deferredSections = blueprint.modules
    .filter((module) => safeReadModel.deferredSectionIds.includes(module.navId))
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
    safeReadModel,
    schemaVersion: USAGE_CHANNELS_OWNER_MODEL_SCHEMA,
    visibleSections
  };
}

export function findUsageChannelsOwnerPageModelIssues(
  model: UsageChannelsOwnerPageModel
): UsageChannelsOwnerPageModelIssue[] {
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
        row.label,
        row.meta,
        row.rightMeta,
        row.statusLabel
      ].join(" ");
      return UNSAFE_USAGE_OWNER_TEXT_PATTERN.test(rowText) ? [{
        code: "unsafe-row-text" as const,
        message: "Usage owner rows must not render secrets, credentials, subscription URLs, raw logs, or SQLite labels.",
        navId: section.navId
      }] : [];
    })
  ));

  return [
    ...queryIssues,
    ...rowIssues
  ];
}

export function findUsageChannelsProjectionIssues(blueprint: BlueprintPage) {
  return findAdminSafeReadProjectionIssues(createAdminSafeReadProjections([blueprint])).map((projectionIssue) => ({
    code: "unsafe-projection" as const,
    message: projectionIssue.message,
    navId: projectionIssue.navId
  }));
}

function createUsageOwnerSection(
  projection: AdminSafeReadProjection,
  rowSet: {
    footer: string;
    rows: UsageOwnerRow[];
    subtitle: string;
  }
): UsageOwnerSection {
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
