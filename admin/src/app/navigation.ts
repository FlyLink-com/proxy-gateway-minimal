import { Activity, LayoutDashboard, Users, type LucideIcon } from "lucide-react";

export type AdminPage =
  | "dashboard"
  | "portalRequests"
  | "usageMonitor";

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
  owner: "Overview" | "User Operations" | "Platform Monitoring";
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

export type ConsoleSectionStatus = "active" | "planned";

export type ConsoleSection = NavSection & {
  status: ConsoleSectionStatus;
  responsibility: string;
  entryGate: string;
};

export const consoleSections: ConsoleSection[] = [
  {
    id: "overview",
    label: "Overview",
    description: "Platform health and risk",
    status: "active",
    responsibility: "First-screen operator overview for platform health, risk, and recent safe activity.",
    entryGate: "Operations Overview page and safe summary sources are available.",
    items: [
      { id: "dashboard", label: "Operations Overview", icon: LayoutDashboard }
    ]
  },
  {
    id: "user-supervision",
    label: "User Operations",
    description: "Accounts, resources, and quotas",
    status: "active",
    responsibility: "Supervise accounts, resources, orders, subscription artifacts, and traffic quotas.",
    entryGate: "Accounts & Resources page exists and only displays safe refs and redacted states.",
    items: [
      { id: "portalRequests", label: "Accounts & Resources", icon: Users }
    ]
  },
  {
    id: "platform-monitoring",
    label: "Platform Monitoring",
    description: "Usage collection and channels",
    status: "active",
    responsibility: "Supervise usage accounting trust, collection freshness, channel health, receipts, and data-anomaly evidence.",
    entryGate: "Usage & Channels page exists and does not expose tokens, URLs, or credentials.",
    items: [
      { id: "usageMonitor", label: "Usage & Channels", icon: Activity }
    ]
  },
  {
    id: "audit-workflow",
    label: "Audit & Cases",
    description: "Cases, history, and audit",
    status: "planned",
    responsibility: "Own durable cases, object history, audit notes, close reasons, and review workflow.",
    entryGate: "Waiting for the GCC-55 durable Case/history backend contract.",
    items: []
  },
  {
    id: "platform-development",
    label: "Platform Development",
    description: "Channels, nodes, and tools",
    status: "planned",
    responsibility: "Own channel experiments, node onboarding, strategy recommendations, and platform extension tools.",
    entryGate: "Waiting for real platform tools with object models, data sources, safety boundaries, and tests.",
    items: []
  },
  {
    id: "system-settings",
    label: "System Settings",
    description: "Private operator settings",
    status: "planned",
    responsibility: "Own private operator preferences and local console configuration.",
    entryGate: "Waiting for a private settings boundary, explicit non-goals, and validation.",
    items: []
  }
];

export const navSections: NavSection[] = consoleSections.filter((section) => section.status === "active");

export const navItems: NavItem[] = navSections.flatMap((section) => section.items);

export const pageTitles: Record<AdminPage, string> = {
  dashboard: "Operations Overview",
  portalRequests: "Accounts & Resources",
  usageMonitor: "Usage & Channels"
};

export const pageContexts: Record<AdminPage, { eyebrow: string; description: string }> = {
  dashboard: {
    eyebrow: "Overview",
    description: "Platform health, risk summary, and recent activity"
  },
  portalRequests: {
    eyebrow: "User Operations",
    description: "Accounts, resources, orders, and traffic quotas"
  },
  usageMonitor: {
    eyebrow: "Platform Monitoring",
    description: "Collection trust, channel health, and data anomalies"
  }
};

export const pageSubNavigation: Record<AdminPage, PageSubNavigationItem[]> = {
  dashboard: [
    {
      id: "health-summary",
      label: "Health Summary",
      description: "Dashboard summary for platform health, risk, freshness, and channel coverage.",
      mode: "preview",
      owner: "Overview",
      targetId: "dashboard-health-summary"
    },
    {
      id: "risk-queue",
      label: "Risk Queue",
      description: "Cross-account, order, usage, and channel review entry.",
      mode: "preview",
      owner: "Overview",
      targetId: "dashboard-risk-queue"
    },
    {
      id: "next-actions",
      label: "Next Actions",
      description: "Route operators to the page that owns the detailed collection.",
      mode: "preview",
      owner: "Overview",
      targetId: "dashboard-next-actions"
    }
  ],
  portalRequests: [
    {
      id: "account-overview",
      label: "Account Directory",
      description: "Safe account refs, resource counts, risk state, and recent activity.",
      mode: "owner",
      owner: "User Operations",
      targetId: "user-supervision-account-overview"
    },
    {
      id: "resource-orders",
      label: "Resources & Orders",
      description: "Orders, resources, entitlements, subscription artifacts, and delivery lifecycle.",
      mode: "owner",
      owner: "User Operations",
      targetId: "user-supervision-resource-orders"
    },
    {
      id: "quota-usage",
      label: "Quota & Usage",
      description: "Default quota, edited quota, total usage, collection coverage, quota risk, and audit state.",
      mode: "owner",
      owner: "User Operations",
      targetId: "user-supervision-quota-usage"
    },
    {
      id: "lifecycle",
      label: "Lifecycle",
      description: "Account disablement, order pause, expiry, revocation, and archive candidates.",
      mode: "owner",
      owner: "User Operations",
      targetId: "user-supervision-lifecycle"
    },
    {
      id: "history-events",
      label: "History & Events",
      description: "Object history, case candidates, and future audit-event entry.",
      mode: "owner",
      owner: "User Operations",
      targetId: "user-supervision-history-events"
    }
  ],
  usageMonitor: [
    {
      id: "freshness",
      label: "Collection Freshness",
      description: "Generated time, delay threshold, unknown states, and collection trust.",
      mode: "owner",
      owner: "Platform Monitoring",
      targetId: "platform-monitoring-freshness"
    },
    {
      id: "channel-coverage",
      label: "Channel Coverage",
      description: "Issued channels, measured channels, missing channels, and receipt blockers.",
      mode: "owner",
      owner: "Platform Monitoring",
      targetId: "platform-monitoring-channel-coverage"
    },
    {
      id: "usage-ledger",
      label: "Usage Ledger",
      description: "Safe ledger for accounts, orders, channels, and measured usage.",
      mode: "owner",
      owner: "Platform Monitoring",
      targetId: "platform-monitoring-usage-ledger"
    },
    {
      id: "collection-anomalies",
      label: "Collection Anomalies",
      description: "Collection delay, true zero usage, not collected, disabled collector, and missing receipt candidates.",
      mode: "owner",
      owner: "Platform Monitoring",
      targetId: "platform-monitoring-anomalies"
    },
    {
      id: "receipts-collectors",
      label: "Receipts & Collectors",
      description: "Receipt state, collector availability, and future safe diagnostics entry.",
      mode: "owner",
      owner: "Platform Monitoring",
      targetId: "platform-monitoring-receipts-collectors"
    }
  ]
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
  }
};
