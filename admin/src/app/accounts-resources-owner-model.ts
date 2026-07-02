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

export type AccountsResourceTableRow = {
  account?: string;
  actionLabel: string;
  activity: string;
  caseLabel?: string;
  channel?: string;
  label: string;
  objectRef?: string;
  order?: string;
  resourceCount?: string;
  risk?: string;
  source?: string;
  state: string;
  subscription?: string;
  tone: MetricTone;
  usage?: string;
  window?: string;
};

export type AccountsResourceTableModel = {
  ariaLabel: string;
  columns: string[];
  pageSize: number;
  rows: AccountsResourceTableRow[];
};

export type AccountsResourceDetailDrawer = {
  ariaLabel: string;
  description: string;
  fields: Array<{
    label: string;
    value: string;
  }>;
  title: string;
  tone: MetricTone;
};

export type AccountsResourceOwnerSection = {
  navId: string;
  targetId: string;
  title: string;
  detailDrawer?: AccountsResourceDetailDrawer;
  footer: string;
  query: AdminTableQueryState;
  resultWindow: AdminTableResultWindow;
  rows: AccountsResourceOwnerRow[];
  subtitle: string;
  table?: AccountsResourceTableModel;
};

export type AccountsResourceDeferredSection = {
  navId: string;
  targetId: string;
  title: string;
};

export type AccountsResourcesOwnerPageModel = {
  schemaVersion: typeof ACCOUNTS_RESOURCES_OWNER_MODEL_SCHEMA;
  page: AdminPage;
  safeReadModel: AdminSafeReadPageModel;
  allSections: AccountsResourceOwnerSection[];
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
        detail: "Enabled",
        label: "acct_001",
        meta: "",
        statusLabel: "Good",
        tone: "success"
      },
      {
        actionLabel: "Open",
        detail: "Quota review",
        label: "acct_002",
        meta: "",
        statusLabel: "Watch",
        tone: "warning"
      }
    ],
    subtitle: "Account state and resource links"
  },
  "resource-orders": {
    footer: "Resource list",
    rows: [
      {
        actionLabel: "Open",
        detail: "Pending review",
        label: "ord_2048",
        meta: "",
        statusLabel: "Open",
        tone: "info"
      },
      {
        actionLabel: "Open",
        detail: "Active",
        label: "ord_2047",
        meta: "",
        statusLabel: "Good",
        tone: "success"
      }
    ],
    subtitle: "Resource and order ownership"
  },
  "quota-usage": {
    footer: "Quota policy",
    rows: [
      {
        actionLabel: "Open",
        detail: "Account user_001 · Order ord_2048",
        label: "quota_policy",
        meta: "Usage 82%",
        statusLabel: "Near quota",
        tone: "warning"
      },
      {
        actionLabel: "Open",
        detail: "Account user_001 · Order ord_2048",
        label: "coverage_gate",
        meta: "Measured 3/3 channels",
        statusLabel: "Measured",
        tone: "success"
      }
    ],
    subtitle: "Quota policy and usage evidence"
  },
  lifecycle: {
    footer: "Lifecycle subpage",
    rows: [
      {
        actionLabel: "Open",
        detail: "Trial ending",
        label: "sub_8192",
        meta: "",
        statusLabel: "Review",
        tone: "warning"
      },
      {
        actionLabel: "Open",
        detail: "Archive queued",
        label: "acct_005",
        meta: "",
        statusLabel: "Watch",
        tone: "warning"
      }
    ],
    subtitle: "Expiry and suspension routing"
  },
  "history-events": {
    footer: "Computed history",
    rows: [
      {
        actionLabel: "Open",
        detail: "Object ord_safe_101 · Source Usage & Channels",
        label: "quota_evidence_updated",
        meta: "Case Quota review",
        statusLabel: "Context available",
        tone: "info"
      },
      {
        actionLabel: "Open",
        detail: "Object artifact_safe_pending · Source Resources & Orders",
        label: "receipt_pending",
        meta: "Case Receipt evidence",
        statusLabel: "Case backend locked",
        tone: "warning"
      }
    ],
    subtitle: "Computed events and case candidates"
  }
};

const UNSAFE_ACCOUNTS_OWNER_TEXT_PATTERN =
  /https?:\/\/|subscriptionUrl|subscription\s*url|token|secret|password|credential|edgecred_|raw\s*logs?|sqlite/i;

export function createAccountsResourcesOwnerPageModel(
  blueprint: BlueprintPage
): AccountsResourcesOwnerPageModel {
  const safeReadModel = createAdminSafeReadPageModel(blueprint);
  const projections = createAdminSafeReadProjections([blueprint]);
  const projectionsByNavId = new Map(projections.map((projection) => [projection.navId, projection]));
  const visibleNavIds = safeReadModel.visibleSectionIds;
  const allSections = blueprint.modules.flatMap((module) => {
    const projection = projectionsByNavId.get(module.navId);
    const rowSet = ACCOUNTS_RESOURCE_ROWS[module.navId];
    if (!projection || !rowSet) {
      return [];
    }
    return [createAccountsOwnerSection(projection, rowSet)];
  });
  const allSectionsByNavId = new Map(allSections.map((section) => [section.navId, section]));
  const visibleSections = visibleNavIds.flatMap((navId) => {
    const projection = projectionsByNavId.get(navId);
    const section = allSectionsByNavId.get(navId);
    if (!projection || !section) {
      return [];
    }
    return [section];
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
    allSections,
    deferredSections,
    page: blueprint.page,
    safeReadModel,
    schemaVersion: ACCOUNTS_RESOURCES_OWNER_MODEL_SCHEMA,
    visibleSections
  };
}

export function findAccountsResourcesOwnerPageModelIssues(
  model: AccountsResourcesOwnerPageModel
): AccountsResourcesOwnerPageModelIssue[] {
  const queryIssues = model.allSections.flatMap((section) => (
    findAdminTableQueryStateIssues([section.query]).map((queryIssue) => ({
      code: "unsafe-query-state" as const,
      message: queryIssue.message,
      navId: section.navId
    }))
  ));
  const rowIssues = model.allSections.flatMap((section) => (
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
  const sectionExtensions = createAccountsSectionExtensions(projection.navId, rowSet.rows);
  return {
    ...sectionExtensions,
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

function createAccountsSectionExtensions(
  navId: string,
  rows: readonly AccountsResourceOwnerRow[]
): Pick<AccountsResourceOwnerSection, "detailDrawer" | "table"> {
  if (navId === "resource-orders") {
    const tableRows: AccountsResourceTableRow[] = rows.map((row) => {
      const subscription = firstMatch(row.detail, /Sub\s+([A-Za-z0-9_-]+)/) ?? "Unknown";
      const channel = firstMatch(row.detail, /Channel\s+([A-Za-z0-9_-]+)/) ?? "Unknown";
      return {
        actionLabel: row.actionLabel,
        activity: row.meta,
        channel,
        label: row.label,
        state: row.statusLabel,
        subscription,
        tone: row.tone
      };
    });
    const selectedRow = tableRows[0];

    return {
      detailDrawer: selectedRow ? {
        ariaLabel: "Resources & Orders detail drawer",
        description: "Read-only order, subscription, and channel context for safe review planning.",
        fields: [
          { label: "Order", value: selectedRow.label },
          { label: "Subscription", value: selectedRow.subscription ?? "Unknown" },
          { label: "Channel", value: selectedRow.channel ?? "Unknown" },
          { label: "State", value: selectedRow.state }
        ],
        title: selectedRow.label,
        tone: selectedRow.tone
      } : undefined,
      table: {
        ariaLabel: "Resources & Orders table",
        columns: ["Order", "Subscription", "Channel", "State", "Activity"],
        pageSize: 2,
        rows: tableRows
      }
    };
  }

  if (navId === "lifecycle") {
    const tableRows: AccountsResourceTableRow[] = rows.map((row) => {
      const account = firstMatch(row.detail, /Account\s+([A-Za-z0-9_-]+)/) ?? "Unknown";
      const order = firstMatch(row.detail, /Order\s+([A-Za-z0-9_-]+)/) ?? "Unknown";
      const window = firstMatch(row.meta, /When\s+(.+)/) ?? "Unknown";
      return {
        account,
        actionLabel: row.actionLabel,
        activity: row.meta,
        label: row.label,
        order,
        state: row.statusLabel,
        tone: row.tone,
        window
      };
    });
    const selectedRow = tableRows[0];

    return {
      detailDrawer: selectedRow ? {
        ariaLabel: "Lifecycle detail drawer",
        description: "Read-only lifecycle decision context for safe review planning.",
        fields: [
          { label: "Decision", value: selectedRow.label },
          { label: "Account", value: selectedRow.account ?? "Unknown" },
          { label: "Order", value: selectedRow.order ?? "Unknown" },
          { label: "State", value: selectedRow.state }
        ],
        title: selectedRow.label,
        tone: selectedRow.tone
      } : undefined,
      table: {
        ariaLabel: "Lifecycle table",
        columns: ["Decision", "Account", "Order", "Window", "State"],
        pageSize: 2,
        rows: tableRows
      }
    };
  }

  if (navId === "quota-usage") {
    const tableRows: AccountsResourceTableRow[] = rows.map((row) => {
      const account = firstMatch(row.detail, /Account\s+([A-Za-z0-9_-]+)/) ?? "Unknown";
      const order = firstMatch(row.detail, /Order\s+([A-Za-z0-9_-]+)/) ?? "Unknown";
      const measuredUsage = /Measured\s+(\d+)\/(\d+)/.exec(row.meta);
      const usage = firstMatch(row.meta, /Usage\s+(.+)/) ?? (measuredUsage ? `${measuredUsage[1]} / ${measuredUsage[2]}` : row.meta);
      return {
        account,
        actionLabel: row.actionLabel,
        activity: row.meta,
        label: row.label,
        order,
        state: row.statusLabel,
        tone: row.tone,
        usage
      };
    });
    const selectedRow = tableRows[0];

    return {
      detailDrawer: selectedRow ? {
        ariaLabel: "Quota & Usage detail drawer",
        description: "Read-only quota policy and usage evidence context for safe review planning.",
        fields: [
          { label: "Policy", value: selectedRow.label },
          { label: "Account", value: selectedRow.account ?? "Unknown" },
          { label: "Order", value: selectedRow.order ?? "Unknown" },
          { label: "State", value: selectedRow.state }
        ],
        title: selectedRow.label,
        tone: selectedRow.tone
      } : undefined,
      table: {
        ariaLabel: "Quota & Usage table",
        columns: ["Policy", "Account", "Order", "Usage", "State"],
        pageSize: 2,
        rows: tableRows
      }
    };
  }

  if (navId === "history-events") {
    const tableRows: AccountsResourceTableRow[] = rows.map((row) => {
      const objectRef = firstMatch(row.detail, /Object\s+([A-Za-z0-9_-]+)/) ?? "Unknown";
      const source = firstMatch(row.detail, /Source\s+(.+)/) ?? "Unknown";
      const caseLabel = firstMatch(row.meta, /Case\s+(.+)/) ?? "Review";
      return {
        actionLabel: row.actionLabel,
        activity: row.label === "receipt_pending" ? "Receipt context" : "Computed event",
        caseLabel,
        label: row.label,
        objectRef,
        source,
        state: row.statusLabel,
        tone: row.tone
      };
    });
    const selectedRow = tableRows[0];

    return {
      detailDrawer: selectedRow ? {
        ariaLabel: "History & Events detail drawer",
        description: "Read-only computed history context; durable case history remains gated.",
        fields: [
          { label: "Event", value: selectedRow.label },
          { label: "Object", value: selectedRow.objectRef ?? "Unknown" },
          { label: "Source", value: selectedRow.source ?? "Unknown" },
          { label: "State", value: selectedRow.state }
        ],
        title: selectedRow.label,
        tone: selectedRow.tone
      } : undefined,
      table: {
        ariaLabel: "History & Events table",
        columns: ["Event", "Object", "Source", "Case", "State"],
        pageSize: 2,
        rows: tableRows
      }
    };
  }

  if (navId !== "account-overview") {
    return {};
  }

  const tableRows: AccountsResourceTableRow[] = rows.map((row) => ({
    actionLabel: row.actionLabel,
    activity: row.detail,
    label: row.label,
    resourceCount: row.label === "user_001" ? "3" : "2",
    risk: row.meta,
    state: row.statusLabel,
    tone: row.tone
  }));
  const selectedRow = tableRows[0];

  return {
    detailDrawer: selectedRow ? {
      ariaLabel: "Account Directory detail drawer",
      description: "Read-only account context for safe review planning.",
      fields: [
        { label: "Account", value: selectedRow.label },
        { label: "State", value: selectedRow.state },
        { label: "Resources", value: selectedRow.resourceCount ?? "Unknown" },
        { label: "Risk", value: selectedRow.risk || "Unknown" }
      ],
      title: selectedRow.label,
      tone: selectedRow.tone
    } : undefined,
    table: {
      ariaLabel: "Account Directory table",
      columns: ["Account", "State", "Resources", "Risk", "Activity"],
      pageSize: 2,
      rows: tableRows
    }
  };
}

function firstMatch(value: string, pattern: RegExp) {
  return pattern.exec(value)?.[1];
}
