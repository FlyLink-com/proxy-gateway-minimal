import {
  Activity,
  ClipboardList,
  FileText,
  Gauge,
  History,
  LayoutDashboard,
  Server,
  UserCog,
  Users,
  type LucideIcon
} from "lucide-react";

export type AdminPage =
  | "dashboard"
  | "portalRequests"
  | "usageMonitor"
  | "userManagement"
  | "orderManagement"
  | "userAccessLogs"
  | "userOperationLogs"
  | "nodeHealth"
  | "nodeLogs"
  | "nodeBandwidth";

export type AdminPageRouteTarget = {
  page: AdminPage;
  navId?: string;
};

export type NavItem = {
  id: AdminPage;
  label: string;
  icon: LucideIcon;
};

export type NavSection = {
  id: string;
  label: string;
  description: string;
  items: NavItem[];
};

export type PageSubNavigationMode = "preview" | "owner";

export type PageSubNavigationItem = {
  id: string;
  label: string;
  description: string;
  mode: PageSubNavigationMode;
  owner: "Operations Overview" | "Accounts & Resources" | "Usage & Channels" | "Management" | "Logs & Audit";
  targetId: string;
};

export type PageWorkbenchRole = "overview" | "decision-owner" | "evidence-owner";

export type PageDecisionKey =
  | "next_review_target"
  | "account_create_disable"
  | "account_lifecycle"
  | "resource_order_lifecycle"
  | "subscription_artifact_lifecycle"
  | "quota_policy"
  | "order_pause_archive"
  | "usage_collection_trust"
  | "channel_coverage"
  | "receipt_coverage"
  | "collection_anomalies"
  | "runtime_apply"
  | "platform_tooling"
  | "operator_settings";

export type PageWorkbenchContract = {
  role: PageWorkbenchRole;
  primaryQuestion: string;
  sectionIds: string[];
  ownsDecisions: PageDecisionKey[];
  previewOnly: PageDecisionKey[];
  evidenceOnly: PageDecisionKey[];
  forbiddenDecisions: PageDecisionKey[];
};

export type ConsoleSectionStatus = "active" | "planned" | "reserved";

export type ConsoleSection = NavSection & {
  status: ConsoleSectionStatus;
  responsibility: string;
  entryGate: string;
};

export const consoleSections: ConsoleSection[] = [
  {
    id: "monitoring",
    label: "Monitoring",
    description: "Overview, accounts, usage, and channels",
    status: "active",
    responsibility: "First-screen monitoring surfaces for platform status, account/resource summaries, usage, and channel evidence.",
    entryGate: "Monitoring pages only show safe summary sources and route handoffs.",
    items: [
      { id: "dashboard", label: "Operations Overview", icon: LayoutDashboard },
      { id: "portalRequests", label: "Accounts & Resources", icon: Users },
      { id: "usageMonitor", label: "Usage & Channels", icon: Activity }
    ]
  },
  {
    id: "management",
    label: "Management",
    description: "Users, order records, nodes, and bandwidth",
    status: "active",
    responsibility: "Own dedicated management query pages for users, order records, node health, and node bandwidth supervision.",
    entryGate: "Management pages expose safe refs, redacted states, and gated lifecycle shells only.",
    items: [
      { id: "userManagement", label: "User Management", icon: UserCog },
      { id: "orderManagement", label: "Order Records", icon: ClipboardList },
      { id: "nodeHealth", label: "Node Health", icon: Server },
      { id: "nodeBandwidth", label: "Node Bandwidth", icon: Gauge }
    ]
  },
  {
    id: "logs-audit",
    label: "Logs & Audit",
    description: "User and node evidence logs",
    status: "active",
    responsibility: "Own safe read-only log and audit evidence surfaces after monitoring and management pages.",
    entryGate: "Log pages expose redacted rows and safe evidence summaries only.",
    items: [
      { id: "userAccessLogs", label: "User Access Logs", icon: FileText },
      { id: "userOperationLogs", label: "User Operation Logs", icon: History },
      { id: "nodeLogs", label: "Node Logs", icon: FileText }
    ]
  },
  {
    id: "system-settings",
    label: "System Settings",
    description: "Private operator settings",
    status: "reserved",
    responsibility: "Own future private console configuration gates, permissions, and safety policies.",
    entryGate: "No active business management routes belong to System Settings in this phase.",
    items: []
  }
];

export const navSections: NavSection[] = consoleSections.filter((section) => section.status === "active");

export const navItems: NavItem[] = navSections.flatMap((section) => section.items);

export const pageTitles: Record<AdminPage, string> = {
  dashboard: "Operations Overview",
  portalRequests: "Accounts & Resources",
  usageMonitor: "Usage & Channels",
  userManagement: "User Management",
  orderManagement: "Order Records",
  nodeHealth: "Node Health",
  nodeBandwidth: "Node Bandwidth",
  userAccessLogs: "User Access Logs",
  userOperationLogs: "User Operation Logs",
  nodeLogs: "Node Logs",
};

export const adminPageRouteSlugs: Record<AdminPage, string> = {
  dashboard: "operations",
  portalRequests: "accounts",
  usageMonitor: "usage",
  userManagement: "user-management",
  orderManagement: "order-management",
  nodeHealth: "node-health",
  nodeBandwidth: "node-bandwidth",
  userAccessLogs: "user-access-logs",
  userOperationLogs: "user-operation-logs",
  nodeLogs: "node-logs",
};

const adminTopBarPages = new Set<AdminPage>(["dashboard", "portalRequests", "usageMonitor"]);

const adminPageByRouteSlug = Object.fromEntries(
  Object.entries(adminPageRouteSlugs).map(([page, slug]) => [slug, page])
) as Record<string, AdminPage>;

const enabledPageSectionRoutes: Partial<Record<AdminPage, Set<string>>> = {};

export function parseAdminRouteHash(hash: string): AdminPageRouteTarget | null {
  const normalizedHash = hash.trim();
  if (!normalizedHash.startsWith("#/admin")) {
    return null;
  }

  const [pageSegment, navSegment] = normalizedHash
    .replace(/^#\/admin\/?/, "")
    .split("/")
    .map((segment) => decodeURIComponent(segment.trim()))
    .filter(Boolean);

  const page = pageFromRouteSegment(pageSegment);
  if (!page) {
    return { page: "dashboard" };
  }

  const navId = navSegment && isPageSectionRouteEnabled(page, navSegment)
    ? navSegment
    : undefined;

  return { navId, page };
}

export function formatAdminRouteHash(page: AdminPage, navId?: string) {
  const pageSlug = adminPageRouteSlugs[page];
  const sectionSuffix = navId && isPageSectionRouteEnabled(page, navId)
    ? `/${encodeURIComponent(navId)}`
    : "";

  return `#/admin/${pageSlug}${sectionSuffix}`;
}

export function isPageSubNavigationId(page: AdminPage, navId: string) {
  return pageSubNavigation[page].some((item) => item.id === navId);
}

export function isPageSectionRouteEnabled(page: AdminPage, navId: string) {
  // Page modules stay catalogued. Only explicitly designed subpage contracts get URL routes.
  return enabledPageSectionRoutes[page]?.has(navId) ?? false;
}

export function usesAdminShellTopBar(page: AdminPage) {
  return adminTopBarPages.has(page);
}

function pageFromRouteSegment(segment?: string): AdminPage | undefined {
  if (!segment) {
    return undefined;
  }
  if (segment === "dashboard" || segment === "portalRequests" || segment === "usageMonitor") {
    return segment as AdminPage;
  }
  return adminPageByRouteSlug[segment];
}

export const pageContexts: Record<AdminPage, { eyebrow: string; description: string }> = {
  dashboard: {
    eyebrow: "Monitoring",
    description: "Platform health, risk summary, and recent activity"
  },
  portalRequests: {
    eyebrow: "Monitoring",
    description: "Accounts, resources, orders, and traffic quotas"
  },
  usageMonitor: {
    eyebrow: "Monitoring",
    description: "Collection trust, channel health, and data anomalies"
  },
  userManagement: {
    eyebrow: "Management",
    description: "User account query and lifecycle supervision"
  },
  orderManagement: {
    eyebrow: "Management",
    description: "Payment and order record query for billing reconciliation"
  },
  nodeHealth: {
    eyebrow: "Management",
    description: "Node health query, heartbeat state, and diagnostic routing"
  },
  nodeBandwidth: {
    eyebrow: "Management",
    description: "Node bandwidth query, trend inspection, and anomaly review"
  },
  userAccessLogs: {
    eyebrow: "Logs & Audit",
    description: "User access log query with safe references only"
  },
  userOperationLogs: {
    eyebrow: "Logs & Audit",
    description: "Operator and user operation log query with redacted event context"
  },
  nodeLogs: {
    eyebrow: "Logs & Audit",
    description: "Redacted node log query and severity filtering"
  }
};

export const pageSubNavigation: Record<AdminPage, PageSubNavigationItem[]> = {
  dashboard: [
    {
      id: "health-summary",
      label: "Health Summary",
      description: "Dashboard summary for platform health, risk, freshness, and channel coverage.",
      mode: "preview",
      owner: "Operations Overview",
      targetId: "dashboard-health-summary"
    },
    {
      id: "risk-queue",
      label: "Risk Queue",
      description: "Cross-account, order, usage, and channel review entry.",
      mode: "preview",
      owner: "Operations Overview",
      targetId: "dashboard-risk-queue"
    },
    {
      id: "next-actions",
      label: "Next Actions",
      description: "Route operators to the page that owns the detailed collection.",
      mode: "preview",
      owner: "Operations Overview",
      targetId: "dashboard-next-actions"
    },
    {
      id: "review-candidates",
      label: "Review Candidates",
      description: "Bounded review candidates with owner-route signals and safe refs.",
      mode: "preview",
      owner: "Operations Overview",
      targetId: "dashboard-review-candidates"
    }
  ],
  portalRequests: [
    {
      id: "account-overview",
      label: "Account Directory",
      description: "Safe account refs, resource counts, risk state, and recent activity.",
      mode: "owner",
      owner: "Accounts & Resources",
      targetId: "user-supervision-account-overview"
    },
    {
      id: "resource-orders",
      label: "Resources & Orders",
      description: "Orders, resources, entitlements, subscription artifacts, and delivery lifecycle.",
      mode: "owner",
      owner: "Accounts & Resources",
      targetId: "user-supervision-resource-orders"
    },
    {
      id: "quota-usage",
      label: "Quota & Usage",
      description: "Default quota, edited quota, total usage, collection coverage, quota risk, and review state.",
      mode: "owner",
      owner: "Accounts & Resources",
      targetId: "user-supervision-quota-usage"
    },
    {
      id: "lifecycle",
      label: "Lifecycle",
      description: "Account disablement, order pause, expiry, revocation, and archive candidates.",
      mode: "owner",
      owner: "Accounts & Resources",
      targetId: "user-supervision-lifecycle"
    },
    {
      id: "history-events",
      label: "History & Events",
      description: "Object history, case candidates, and future restricted-event entry.",
      mode: "owner",
      owner: "Accounts & Resources",
      targetId: "user-supervision-history-events"
    }
  ],
  userManagement: [],
  orderManagement: [],
  usageMonitor: [
    {
      id: "freshness",
      label: "Collection Freshness",
      description: "Generated time, delay threshold, unknown states, and collection trust.",
      mode: "owner",
      owner: "Usage & Channels",
      targetId: "platform-monitoring-freshness"
    },
    {
      id: "channel-coverage",
      label: "Channel Coverage",
      description: "Issued channels, measured channels, missing channels, and receipt blockers.",
      mode: "owner",
      owner: "Usage & Channels",
      targetId: "platform-monitoring-channel-coverage"
    },
    {
      id: "usage-ledger",
      label: "Usage Ledger",
      description: "Safe ledger for accounts, orders, channels, and measured usage.",
      mode: "owner",
      owner: "Usage & Channels",
      targetId: "platform-monitoring-usage-ledger"
    },
    {
      id: "collection-anomalies",
      label: "Collection Anomalies",
      description: "Collection delay, true zero usage, not collected, disabled collector, and missing receipt candidates.",
      mode: "owner",
      owner: "Usage & Channels",
      targetId: "platform-monitoring-anomalies"
    },
    {
      id: "receipts-collectors",
      label: "Receipts & Collectors",
      description: "Receipt state, collector availability, and future safe diagnostics entry.",
      mode: "owner",
      owner: "Usage & Channels",
      targetId: "platform-monitoring-receipts-collectors"
    }
  ],
  userAccessLogs: [],
  userOperationLogs: [],
  nodeHealth: [],
  nodeLogs: [],
  nodeBandwidth: []
};

export const pageWorkbenchContracts: Record<AdminPage, PageWorkbenchContract> = {
  dashboard: {
    role: "overview",
    primaryQuestion: "What needs attention, and where should the operator go next?",
    sectionIds: pageSubNavigation.dashboard.map((item) => item.id),
    ownsDecisions: ["next_review_target"],
    previewOnly: [
      "account_lifecycle",
      "resource_order_lifecycle",
      "quota_policy",
      "usage_collection_trust",
      "channel_coverage",
      "receipt_coverage",
      "collection_anomalies"
    ],
    evidenceOnly: [],
    forbiddenDecisions: [
      "account_create_disable",
      "order_pause_archive",
      "runtime_apply",
      "platform_tooling",
      "operator_settings"
    ]
  },
  portalRequests: {
    role: "decision-owner",
    primaryQuestion: "Which account owns which resources, and what quota or lifecycle decision is needed?",
    sectionIds: pageSubNavigation.portalRequests.map((item) => item.id),
    ownsDecisions: [
      "account_create_disable",
      "account_lifecycle",
      "resource_order_lifecycle",
      "subscription_artifact_lifecycle",
      "quota_policy",
      "order_pause_archive"
    ],
    previewOnly: [],
    evidenceOnly: [
      "usage_collection_trust",
      "channel_coverage",
      "receipt_coverage",
      "collection_anomalies"
    ],
    forbiddenDecisions: [
      "runtime_apply",
      "platform_tooling",
      "operator_settings"
    ]
  },
  userManagement: {
    role: "decision-owner",
    primaryQuestion: "Which user account needs review, creation, disablement, or lifecycle follow-up?",
    sectionIds: [],
    ownsDecisions: ["account_create_disable", "account_lifecycle"],
    previewOnly: [],
    evidenceOnly: ["usage_collection_trust", "receipt_coverage"],
    forbiddenDecisions: ["runtime_apply", "platform_tooling", "operator_settings"]
  },
  orderManagement: {
    role: "decision-owner",
    primaryQuestion: "Which payment or order record needs billing reconciliation or refund review?",
    sectionIds: [],
    ownsDecisions: ["resource_order_lifecycle", "subscription_artifact_lifecycle", "order_pause_archive"],
    previewOnly: [],
    evidenceOnly: ["usage_collection_trust", "channel_coverage", "receipt_coverage"],
    forbiddenDecisions: ["runtime_apply", "platform_tooling", "operator_settings"]
  },
  usageMonitor: {
    role: "evidence-owner",
    primaryQuestion: "Are usage collection, channels, and receipts trustworthy?",
    sectionIds: pageSubNavigation.usageMonitor.map((item) => item.id),
    ownsDecisions: [
      "usage_collection_trust",
      "channel_coverage",
      "receipt_coverage",
      "collection_anomalies"
    ],
    previewOnly: [],
    evidenceOnly: [
      "account_lifecycle",
      "resource_order_lifecycle",
      "quota_policy"
    ],
    forbiddenDecisions: [
      "account_create_disable",
      "order_pause_archive",
      "subscription_artifact_lifecycle",
      "runtime_apply",
      "platform_tooling",
      "operator_settings"
    ]
  },
  userAccessLogs: {
    role: "evidence-owner",
    primaryQuestion: "Which user access events need audit review without exposing raw identity material?",
    sectionIds: [],
    ownsDecisions: [],
    previewOnly: [],
    evidenceOnly: ["account_lifecycle", "resource_order_lifecycle"],
    forbiddenDecisions: ["account_create_disable", "order_pause_archive", "runtime_apply", "platform_tooling", "operator_settings"]
  },
  userOperationLogs: {
    role: "evidence-owner",
    primaryQuestion: "Which operator or user action events need audit review?",
    sectionIds: [],
    ownsDecisions: [],
    previewOnly: [],
    evidenceOnly: ["account_lifecycle", "resource_order_lifecycle", "operator_settings"],
    forbiddenDecisions: ["account_create_disable", "order_pause_archive", "runtime_apply", "platform_tooling"]
  },
  nodeHealth: {
    role: "evidence-owner",
    primaryQuestion: "Which nodes are healthy, degraded, or offline?",
    sectionIds: [],
    ownsDecisions: ["platform_tooling"],
    previewOnly: [],
    evidenceOnly: ["runtime_apply", "channel_coverage"],
    forbiddenDecisions: ["account_create_disable", "order_pause_archive", "operator_settings"]
  },
  nodeLogs: {
    role: "evidence-owner",
    primaryQuestion: "Which redacted node log events need platform investigation?",
    sectionIds: [],
    ownsDecisions: [],
    previewOnly: [],
    evidenceOnly: ["platform_tooling", "runtime_apply", "channel_coverage"],
    forbiddenDecisions: ["account_create_disable", "order_pause_archive", "operator_settings"]
  },
  nodeBandwidth: {
    role: "evidence-owner",
    primaryQuestion: "Which node bandwidth signals or anomalies need platform review?",
    sectionIds: [],
    ownsDecisions: [],
    previewOnly: [],
    evidenceOnly: ["platform_tooling", "runtime_apply", "channel_coverage", "usage_collection_trust"],
    forbiddenDecisions: ["account_create_disable", "order_pause_archive", "operator_settings"]
  }
};
