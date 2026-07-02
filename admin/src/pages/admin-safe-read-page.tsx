import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import {
  applyUserManagementSafeReadQuery,
  createUserManagementPageConfigFromAccountSummaries,
  USER_MANAGEMENT_ACTION_GATES,
  type PlatformAccountSummary,
  type PlatformEntitlementSummary,
  type SubscriptionUsageMonitorRow,
  type UserManagementActionGate,
  type UserManagementSafeReadQuery
} from "../app/admin-user-management-safe-read";
import { pageContexts, pageTitles, type AdminPage } from "../app/navigation";
import type {
  AdminListPageInfo,
  NodeBandwidthSummary,
  NodeBandwidthSummaryRow,
  NodeBandwidthUtilizationState,
  PlatformAccountMutationResult,
  PortalAccessApprovalPreview,
  PortalAccessApprovalPreviewInput,
  PortalAccessRequestSummary,
  PortalAccessTrafficLimitUpdate,
  PortalAccessTrafficLimitUpdateInput,
  SubscriptionUsageMonitor
} from "../features/subscriptions/types";
import {
  DataTable,
  PrivilegedGate,
  StatusChip,
  type DataTableColumn,
  type DataTableState,
  type MetricTone
} from "../components/primitives";

type SafeReadMetric = {
  label: string;
  meta: string;
  tone: "good" | "info" | "warning" | "danger" | "neutral";
  value: string;
};

type SafeReadTable = {
  columns: string[];
  rows: string[][];
};

type SafeReadPanel = {
  detail: string;
  label: string;
  status: string;
  tone: SafeReadMetric["tone"];
};

const SAFE_READ_TABLE_FIXED_ROW_COUNT = 20;

type SafeReadPageConfig = {
  figmaNodeId: string;
  queryPlaceholder: string;
  primaryActionLabel?: string;
  metrics: SafeReadMetric[];
  table: SafeReadTable;
  panels: SafeReadPanel[];
};

type AuditLogRow = {
  id: string;
  timestamp: string;
  actor: string;
  eventType: string;
  eventTone?: MetricTone;
  targetRef: string;
  result: string;
  resultTone: MetricTone;
  risk: string;
  riskTone: MetricTone;
  note: string;
  detail: {
    title: string;
    summary: string;
    fields: Array<{
      label: string;
      value: string;
    }>;
    protectedTrace: string[];
  };
};

type AuditLogPageConfig = {
  actionLabel: string;
  detailAriaLabel: string;
  exportLabel: string;
  figmaNodeId: string;
  filters: string[];
  pagination: {
    displayTotalRows?: number;
    nextLabel?: string;
    pageSize: number;
    previousLabel?: string;
    showPageSummary?: boolean;
    showWhenSinglePage?: boolean;
  };
  queryPlaceholder?: string;
  rows: AuditLogRow[];
  tableAriaLabel: string;
  tableMode: "access" | "operation";
};

type NodeHealthField = {
  label: string;
  tone?: MetricTone;
  value: string;
};

type NodeHealthRow = {
  detail: {
    fields: NodeHealthField[];
    performance: Array<{
      label: string;
      value: string;
    }>;
  };
  id: string;
  lastPing: string;
  nodeId: string;
  region: string;
  status: string;
  statusTone: MetricTone;
  type: string;
  typeTone: MetricTone;
  uptime: string;
};

type NodeHealthPageConfig = {
  actionLabel: string;
  detailAriaLabel: string;
  exportLabel: string;
  figmaNodeId: string;
  filters: string[];
  pagination: {
    displayTotalRows?: number;
    pageSize: number;
    showPageSummary: boolean;
    showWhenSinglePage: boolean;
  };
  queryPlaceholder: string;
  rows: NodeHealthRow[];
  tableAriaLabel: string;
};

type NodeLogRow = {
  detail: {
    fields: NodeHealthField[];
    systemNote: string;
  };
  eventTone: MetricTone;
  eventType: string;
  id: string;
  message: string;
  nodeId: string;
  severity: string;
  severityTone: MetricTone;
  status: string;
  statusTone: MetricTone;
  timestamp: string;
};

type NodeLogsPageConfig = {
  actionLabel: string;
  detailAriaLabel: string;
  exportLabel: string;
  figmaNodeId: string;
  filters: string[];
  pagination: {
    displayTotalRows?: number;
    nextLabel: string;
    pageSize: number;
    previousLabel: string;
    showPageSummary: boolean;
    showWhenSinglePage: boolean;
  };
  queryPlaceholder: string;
  rows: NodeLogRow[];
  tableAriaLabel: string;
};

type NodeBandwidthRow = {
  avgLatency: string;
  detail: {
    fields: NodeHealthField[];
    trafficWindow: Array<{
      label: string;
      value: string;
    }>;
  };
  id: string;
  inbound: string;
  nodeId: string;
  outbound: string;
  packetLoss: string;
  peakBps: string;
  region: string;
  type: string;
  utilization: string;
  utilizationPercent: number;
  utilizationTone: MetricTone;
};

type NodeBandwidthPageConfig = {
  actionLabel: string;
  detailAriaLabel: string;
  exportLabel: string;
  figmaNodeId: string;
  filters: string[];
  pagination: {
    displayTotalRows?: number;
    nextLabel: string;
    pageSize: number;
    previousLabel: string;
    showPageSummary: boolean;
    showWhenSinglePage: boolean;
  };
  queryPlaceholder: string;
  rows: NodeBandwidthRow[];
  tableAriaLabel: string;
};

type UserManagementRow = {
  createdDate: string;
  detail: {
    fields: NodeHealthField[];
  };
  displayName: string;
  email: string;
  id: string;
  lastAccess: string;
  plan: string;
  planTone: MetricTone;
  risk: string;
  riskTone: MetricTone;
  status: string;
  statusTone: MetricTone;
  userId: string;
};

type UserManagementPageConfig = {
  actionLabel: string;
  actionGates: readonly UserManagementActionGate[];
  detailAriaLabel: string;
  figmaNodeId: string;
  filters: string[];
  pagination: {
    displayTotalRows?: number;
    nextLabel: string;
    pageSize: number;
    previousLabel: string;
    showPageSummary: boolean;
    showWhenSinglePage: boolean;
  };
  queryPlaceholder: string;
  rows: UserManagementRow[];
  tableAriaLabel: string;
};

type UserManagementLifecycleOperation = "create" | "update" | "disable" | "delete";

type UserManagementLifecycleMutationInput = {
  approvalRef: string;
  displayName?: string;
  email?: string;
  operatorRef: string;
  organization?: string;
  reason?: string;
  status?: string;
};

type UserManagementDeletePreviewInput = {
  approvalRef: string;
  operatorRef: string;
  reason?: string;
};

type UserManagementDeletionPreview = {
  accountId: string;
  hardDeleteAvailable: boolean;
  nextAction: string;
  safety: {
    accountDeleted: boolean;
    entitlementsDeleted: boolean;
    runtimeMutation: boolean;
  };
  state: string;
};

export type UserManagementLifecycleHandlers = {
  create: (
    input: UserManagementLifecycleMutationInput & {
      displayName: string;
      email: string;
      organization: string;
    }
  ) => Promise<PlatformAccountMutationResult>;
  update: (userId: string, input: UserManagementLifecycleMutationInput) => Promise<void>;
  disable: (userId: string, input: UserManagementDeletePreviewInput) => Promise<void>;
  previewDelete: (userId: string, input: UserManagementDeletePreviewInput) => Promise<UserManagementDeletionPreview>;
};

type OrderManagementRow = {
  accountRef: string;
  assignedQuota: string;
  delivery: string;
  deliveryTone: MetricTone;
  detail: {
    fields: NodeHealthField[];
  };
  id: string;
  lifecycle: string;
  lifecycleTone: MetricTone;
  orderId: string;
  planLevel: string;
  status: string;
  statusTone: MetricTone;
  usageEvidence: OrderManagementUsageEvidence;
};

type OrderManagementPageConfig = {
  actionLabel: string;
  detailAriaLabel: string;
  figmaNodeId: string;
  filters: string[];
  pagination: {
    currentPage?: number;
    displayTotalRows?: number;
    nextLabel: string;
    onPageChange?: (page: number) => void | Promise<void>;
    pageSize: number;
    previousLabel: string;
    showPageSummary: boolean;
    showWhenSinglePage: boolean;
    totalRows?: number;
  };
  queryPlaceholder: string;
  rows: OrderManagementRow[];
  tableAriaLabel: string;
  usageSummary: OrderManagementUsageSummary;
};

type OrderManagementUsageEvidence = {
  collectionLabel: string;
  collectionTone: MetricTone;
  lastObservedLabel: string;
  orderCountLabel: string;
  sourceLabel: string;
  uploadDownloadLabel: string;
  usageRatioLabel: string;
  userTotalLabel: string;
  usedLimitLabel: string;
};

type OrderManagementUsageSummary = {
  measuredOrders: number;
  pendingOrders: number;
  sourceLabel: string;
  totalOrders: number;
  totalUsedLabel: string;
  userAggregateCount: number;
};

export type OrderManagementLifecycleHandlers = {
  previewApproval: (
    requestRef: string,
    input: PortalAccessApprovalPreviewInput
  ) => Promise<PortalAccessApprovalPreview>;
  updateTrafficLimit: (
    requestRef: string,
    input: PortalAccessTrafficLimitUpdateInput
  ) => Promise<PortalAccessTrafficLimitUpdate>;
};

type OrderManagementOperation = "approval-preview" | "traffic-limit";

const SAFE_READ_PAGE_CONFIGS: Partial<Record<AdminPage, SafeReadPageConfig>> = {
  userManagement: {
    figmaNodeId: "59:4",
    primaryActionLabel: "Create User",
    queryPlaceholder: "Search User ID, name, email...",
    metrics: [
      { label: "Users", value: "5", meta: "Enabled 3 · Review 1 · Disabled 1", tone: "good" },
      { label: "Plans", value: "3", meta: "Standard, trial, enterprise", tone: "info" },
      { label: "Risk", value: "1", meta: "Requires account review", tone: "warning" },
      { label: "Access", value: "24h", meta: "Recent safe access window", tone: "neutral" }
    ],
    table: {
      columns: ["User ID", "Display Name", "Email", "Plan", "Status", "Risk", "Last Access", "Actions"],
      rows: [
        ["user_001", "Global Operator", "redacted", "standard", "Enabled", "Low", "13:42", "View"],
        ["user_002", "Review Account", "redacted", "trial", "Review", "Watch", "12:10", "View"],
        ["user_003", "Disabled Account", "redacted", "standard", "Disabled", "Locked", "Yesterday", "View"]
      ]
    },
    panels: [
      { label: "Mutation gate", status: "Read-only", detail: "Create, edit, and disable controls remain gated until API and permission contracts are reviewed.", tone: "warning" },
      { label: "Search boundary", status: "Safe refs", detail: "Only user refs, plan labels, states, and redacted contact markers are visible.", tone: "good" }
    ]
  },
  orderManagement: {
    figmaNodeId: "58:4",
    primaryActionLabel: "Create Order",
    queryPlaceholder: "Search order ID, account ref, plan...",
    metrics: [
      { label: "Total Orders", value: "1,248", meta: "Registry volume", tone: "good" },
      { label: "Pending Actions", value: "18", meta: "Review delivery or lifecycle", tone: "warning" },
      { label: "Suspended", value: "4", meta: "Paused or blocked", tone: "danger" },
      { label: "Delivery", value: "97%", meta: "Visible safe state only", tone: "info" }
    ],
    table: {
      columns: ["Order ID", "Account Ref", "Plan", "Quota", "Status", "Lifecycle", "Delivery", "Actions"],
      rows: [
        ["ord_2048", "acct_001", "standard", "42.8GB", "Delivered", "Active", "Synced", "View"],
        ["ord_2047", "acct_002", "trial", "18.6GB", "Pending", "Review", "Queued", "View"],
        ["ord_2046", "acct_003", "standard", "0GB", "Suspended", "Paused", "Locked", "View"]
      ]
    },
    panels: [
      { label: "Order mutations", status: "Locked", detail: "Order create, pause, archive, and subscription artifact changes need a reviewed backend task.", tone: "warning" },
      { label: "Safe projection", status: "Ready", detail: "Rows carry account/order refs and delivery state only.", tone: "good" }
    ]
  },
  userAccessLogs: {
    figmaNodeId: "57:4",
    queryPlaceholder: "Search user ref or event type...",
    metrics: [
      { label: "Events", value: "128", meta: "Last 24 hours", tone: "info" },
      { label: "Success", value: "121", meta: "Safe access events", tone: "good" },
      { label: "Review", value: "7", meta: "Needs audit attention", tone: "warning" },
      { label: "Exports", value: "Gate", meta: "CSV remains disabled", tone: "neutral" }
    ],
    table: {
      columns: ["Time", "User Ref", "Event Type", "Result", "Region", "Detail"],
      rows: [
        ["13:44", "user_001", "login", "success", "APAC", "MFA accepted"],
        ["12:18", "user_002", "portal access", "review", "US", "Unusual timing"],
        ["11:52", "user_003", "session end", "safe", "EU", "Normal logout"]
      ]
    },
    panels: [
      { label: "Detail panel", status: "Redacted", detail: "Detail views must not expose raw identity, token, IP, or session material.", tone: "good" },
      { label: "Case handoff", status: "Planned", detail: "Durable case creation is a future Audit & Cases backend task.", tone: "neutral" }
    ]
  },
  userOperationLogs: {
    figmaNodeId: "64:4",
    queryPlaceholder: "Search operator, object ID, or action...",
    metrics: [
      { label: "Actions", value: "84", meta: "Last 24 hours", tone: "info" },
      { label: "Safe", value: "79", meta: "No blocked operation", tone: "good" },
      { label: "Review", value: "5", meta: "Operator check needed", tone: "warning" },
      { label: "Export", value: "Gate", meta: "Requires audit permission", tone: "neutral" }
    ],
    table: {
      columns: ["Time", "Actor", "Action", "Object Ref", "Result", "Detail"],
      rows: [
        ["13:40", "operator", "quota review", "ord_2048", "safe", "Routed to owner page"],
        ["12:26", "operator", "order state reviewed", "ord_2047", "safe", "No mutation"],
        ["11:52", "system", "lifecycle gate locked", "acct_002", "review", "Manual approval required"]
      ]
    },
    panels: [
      { label: "Audit boundary", status: "Read-only", detail: "This page records operation evidence; it does not authorize mutations.", tone: "good" },
      { label: "Object refs", status: "Safe", detail: "Only safe account, order, and operator refs are searchable.", tone: "info" }
    ]
  },
  nodeHealth: {
    figmaNodeId: "61:4",
    queryPlaceholder: "Search node ID, region, protocol...",
    metrics: [
      { label: "Total Nodes", value: "256", meta: "Global distributed", tone: "info" },
      { label: "Healthy", value: "234", meta: "Passing SLO", tone: "good" },
      { label: "Degraded", value: "18", meta: "Latency warning", tone: "warning" },
      { label: "Offline", value: "4", meta: "Immediate check", tone: "danger" }
    ],
    table: {
      columns: ["Node ID", "Region", "Protocol", "Heartbeat", "Health", "Action"],
      rows: [
        ["edge-va-042", "US-East", "v2.4.1", "2s ago", "Healthy", "Diagnostic"],
        ["edge-va-043", "US-East", "v2.4.1", "5s ago", "Degraded", "Diagnostic"],
        ["edge-sg-011", "APAC", "v2.4.1", "18s ago", "Watch", "Diagnostic"]
      ]
    },
    panels: [
      { label: "Runtime apply", status: "Blocked", detail: "Node health is evidence only; runtime apply remains outside this UI phase.", tone: "warning" },
      { label: "Diagnostic route", status: "Ready", detail: "Operators can inspect safe summaries before opening future node diagnostics.", tone: "good" }
    ]
  },
  nodeLogs: {
    figmaNodeId: "62:4",
    queryPlaceholder: "Search redacted logs...",
    metrics: [
      { label: "Events", value: "412", meta: "Last 1 hour", tone: "info" },
      { label: "Warnings", value: "18", meta: "Latency or retry", tone: "warning" },
      { label: "Errors", value: "4", meta: "Needs investigation", tone: "danger" },
      { label: "Export", value: "Gate", meta: "CSV disabled", tone: "neutral" }
    ],
    table: {
      columns: ["Timestamp", "Node", "Severity", "Redacted Message", "Log ID"],
      rows: [
        ["13:42:08", "hk-01", "INFO", "Outbound proxy established to redacted channel", "LOG-9281"],
        ["13:40:42", "sg-02", "WARN", "Latency surge detected on egress node", "LOG-9275"],
        ["13:38:11", "us-east-04", "ERROR", "Auth handshake failed for redacted client ref", "LOG-9264"]
      ]
    },
    panels: [
      { label: "Raw material", status: "Forbidden", detail: "No raw logs, tokens, credentials, runtime config, or customer network data are exposed.", tone: "danger" },
      { label: "Severity filters", status: "Ready", detail: "Severity and node filters are safe read-only query inputs.", tone: "good" }
    ]
  },
  nodeBandwidth: {
    figmaNodeId: "63:4",
    queryPlaceholder: "Search node bandwidth, channel, anomaly...",
    metrics: [
      { label: "Total Traffic", value: "42.8GB", meta: "Ingested last 1h", tone: "info" },
      { label: "Upload", value: "18.6GB", meta: "Avg 4.2 Mbps", tone: "good" },
      { label: "Download", value: "24.2GB", meta: "Avg 5.4 Mbps", tone: "warning" },
      { label: "Peak", value: "1.2Gbps", meta: "Logged at 13:42", tone: "danger" }
    ],
    table: {
      columns: ["Time", "Node", "Upload", "Download", "State", "Detail"],
      rows: [
        ["13:44", "hk-production-01", "4.2Mbps", "5.4Mbps", "Normal", "Traffic within lane"],
        ["13:35", "sg-production-02", "6.8Mbps", "9.1Mbps", "Elevated", "Watch throughput"],
        ["13:28", "us-edge-04", "0.6Mbps", "1.2Mbps", "Normal", "Low traffic"]
      ]
    },
    panels: [
      { label: "Trend chart", status: "Static", detail: "Current chart is a safe fixture projection; live telemetry API is a later task.", tone: "info" },
      { label: "Anomaly lane", status: "Review", detail: "Bandwidth anomalies can be listed without exposing raw runtime material.", tone: "warning" }
    ]
  }
};

const USER_MANAGEMENT_PAGE_CONFIG: UserManagementPageConfig = {
  actionLabel: "Create User · Gated",
  actionGates: USER_MANAGEMENT_ACTION_GATES,
  detailAriaLabel: "User Management redacted detail panel",
  figmaNodeId: "59:4",
  filters: ["Status All", "Risk All", "Plan All", "Created Time Last 24h"],
  pagination: {
    nextLabel: "Next",
    pageSize: SAFE_READ_TABLE_FIXED_ROW_COUNT,
    previousLabel: "Prev",
    showPageSummary: false,
    showWhenSinglePage: true
  },
  queryPlaceholder: "Search User ID, name, email...",
  tableAriaLabel: "User Management redacted table",
  rows: [
    createUserManagementRow({
      createdDate: "2026-01-18",
      displayName: "User Alpha",
      id: "user_management_001",
      lastAccess: "2026-01-18 13:42",
      plan: "Pro",
      risk: "Low",
      riskTone: "info",
      status: "Active",
      statusTone: "success",
      userId: "user_001"
    }),
    createUserManagementRow({
      createdDate: "2026-01-18",
      displayName: "User Beta",
      id: "user_management_002",
      lastAccess: "2026-01-18 13:21",
      plan: "Team",
      risk: "Medium",
      riskTone: "warning",
      status: "Pending",
      statusTone: "warning",
      userId: "user_002"
    }),
    createUserManagementRow({
      createdDate: "2026-01-18",
      displayName: "User Gamma",
      id: "user_management_003",
      lastAccess: "2026-01-18 12:58",
      plan: "Pro",
      risk: "Low",
      riskTone: "info",
      status: "Active",
      statusTone: "success",
      userId: "user_003"
    }),
    createUserManagementRow({
      createdDate: "2026-01-18",
      displayName: "User Delta",
      id: "user_management_004",
      lastAccess: "2026-01-18 12:20",
      plan: "Team",
      risk: "Medium",
      riskTone: "warning",
      status: "Pending",
      statusTone: "warning",
      userId: "user_004"
    }),
    createUserManagementRow({
      createdDate: "2026-01-18",
      displayName: "User Epsilon",
      id: "user_management_005",
      lastAccess: "2026-01-18 11:44",
      plan: "Pro",
      risk: "Low",
      riskTone: "info",
      status: "Active",
      statusTone: "success",
      userId: "user_005"
    }),
    createUserManagementRow({
      createdDate: "2026-01-18",
      displayName: "User Zeta",
      id: "user_management_006",
      lastAccess: "2026-01-18 11:12",
      plan: "Team",
      risk: "Medium",
      riskTone: "warning",
      status: "Active",
      statusTone: "success",
      userId: "user_006"
    }),
    createUserManagementRow({
      createdDate: "2026-01-18",
      displayName: "User Eta",
      id: "user_management_007",
      lastAccess: "2026-01-18 10:58",
      plan: "Pro",
      risk: "Low",
      riskTone: "info",
      status: "Active",
      statusTone: "success",
      userId: "user_007"
    }),
    createUserManagementRow({
      createdDate: "2026-01-18",
      displayName: "User Theta",
      id: "user_management_008",
      lastAccess: "2026-01-18 10:31",
      plan: "Team",
      risk: "Medium",
      riskTone: "warning",
      status: "Pending",
      statusTone: "warning",
      userId: "user_008"
    })
  ]
};

const ORDER_MANAGEMENT_PAGE_CONFIG: OrderManagementPageConfig = {
  actionLabel: "Create Order · Gated",
  detailAriaLabel: "Order Management redacted detail panel",
  figmaNodeId: "58:4",
  filters: ["Status", "Plan", "Lifecycle", "Delivery"],
  pagination: {
    nextLabel: "Next",
    pageSize: SAFE_READ_TABLE_FIXED_ROW_COUNT,
    previousLabel: "Prev",
    showPageSummary: false,
    showWhenSinglePage: true
  },
  queryPlaceholder: "Search ID, account ref, or lifecycle…",
  tableAriaLabel: "Order Management redacted table",
  usageSummary: {
    measuredOrders: 0,
    pendingOrders: 4,
    sourceLabel: "Fixture order ledger",
    totalOrders: 4,
    totalUsedLabel: "Not observed",
    userAggregateCount: 0
  },
  rows: [
    createOrderManagementRow({
      accountRef: "enterprise_alpha_01",
      assignedQuota: "120 / 1d",
      delivery: "Delivered",
      deliveryTone: "success",
      id: "order_management_4029",
      lifecycle: "Active",
      lifecycleTone: "success",
      orderId: "ORD-4029",
      planLevel: "Tier 3 / Pro",
      status: "Active",
      statusTone: "success"
    }),
    createOrderManagementRow({
      accountRef: "enterprise_alpha_01",
      assignedQuota: "120 / 1d",
      delivery: "Pending",
      deliveryTone: "warning",
      id: "order_management_4030",
      lifecycle: "Trial",
      lifecycleTone: "warning",
      orderId: "ORD-4030",
      planLevel: "Tier 3 / Pro",
      status: "Paused",
      statusTone: "warning"
    }),
    createOrderManagementRow({
      accountRef: "enterprise_alpha_01",
      assignedQuota: "120 / 1d",
      delivery: "Blocked",
      deliveryTone: "danger",
      id: "order_management_4031",
      lifecycle: "Suspended",
      lifecycleTone: "danger",
      orderId: "ORD-4031",
      planLevel: "Tier 3 / Pro",
      status: "Disabled",
      statusTone: "danger"
    }),
    createOrderManagementRow({
      accountRef: "enterprise_alpha_01",
      assignedQuota: "120 / 1d",
      delivery: "Delivered",
      deliveryTone: "success",
      id: "order_management_4032",
      lifecycle: "Expiring",
      lifecycleTone: "warning",
      orderId: "ORD-4032",
      planLevel: "Tier 3 / Pro",
      status: "Active",
      statusTone: "success"
    })
  ]
};

const AUDIT_LOG_PAGE_CONFIGS: Partial<Record<AdminPage, AuditLogPageConfig>> = {
  userAccessLogs: {
    actionLabel: "Operator Console",
    detailAriaLabel: "User Access Logs redacted detail panel",
    exportLabel: "Export CSV",
    figmaNodeId: "57:4",
    filters: ["All Results", "Last 24 Hours", "All Methods", "All Risk"],
    pagination: {
      nextLabel: "Next",
      pageSize: SAFE_READ_TABLE_FIXED_ROW_COUNT,
      previousLabel: "Previous",
      showPageSummary: false,
      showWhenSinglePage: true
    },
    queryPlaceholder: "Search user ID, session, activity...",
    tableAriaLabel: "User Access Logs redacted table",
    tableMode: "access",
    rows: [
      {
        actor: "usr_2847",
        detail: {
          fields: [
            { label: "User ID", value: "usr_2847" },
            { label: "Session ID", value: "session_ref_18" },
            { label: "Event Type", value: "Login" },
            { label: "Result", value: "Success" },
            { label: "Risk Level", value: "Low" },
            { label: "IP Address", value: "Redacted" },
            { label: "User Agent", value: "Redacted" },
            { label: "Timestamp", value: "2026-01-18 13:42" },
            { label: "Session Duration", value: "4m 12s" }
          ],
          protectedTrace: [
            "User agent marker redacted",
            "Network marker redacted",
            "Session material unavailable in this console"
          ],
          summary: "Successful login with fresh MFA evidence and no unsafe fields exposed.",
          title: "Login event selected"
        },
        eventType: "Login",
        eventTone: "info",
        id: "evt_access_001",
        note: "MFA accepted",
        result: "Success",
        resultTone: "success",
        risk: "Low",
        riskTone: "success",
        targetRef: "portal",
        timestamp: "2026-01-18 13:42"
      },
      {
        actor: "usr_2847",
        detail: {
          fields: [
            { label: "User ID", value: "usr_2847" },
            { label: "Session ID", value: "api_ref_39" },
            { label: "Event Type", value: "API Call" },
            { label: "Result", value: "Success" },
            { label: "Risk Level", value: "Medium" },
            { label: "IP Address", value: "Redacted" },
            { label: "User Agent", value: "Redacted" },
            { label: "Timestamp", value: "2026-01-18 13:39" },
            { label: "Session Duration", value: "Safe summary only" }
          ],
          protectedTrace: [
            "Identity details redacted",
            "Request source redacted",
            "Durable case handoff remains planned"
          ],
          summary: "API activity is visible as a bounded access event without exposing request payloads.",
          title: "API event selected"
        },
        eventType: "API Call",
        eventTone: "info",
        id: "evt_access_002",
        note: "API access",
        result: "Success",
        resultTone: "success",
        risk: "Medium",
        riskTone: "warning",
        targetRef: "api",
        timestamp: "2026-01-18 13:39"
      },
      {
        actor: "usr_2847",
        detail: {
          fields: [
            { label: "User ID", value: "usr_2847" },
            { label: "Session ID", value: "export_ref_37" },
            { label: "Event Type", value: "Export" },
            { label: "Result", value: "Success" },
            { label: "Risk Level", value: "Low" },
            { label: "IP Address", value: "Redacted" },
            { label: "User Agent", value: "Redacted" },
            { label: "Timestamp", value: "2026-01-18 13:37" },
            { label: "Session Duration", value: "Safe summary only" }
          ],
          protectedTrace: [
            "Export payload redacted",
            "CSV material unavailable in this frontend phase",
            "Only approval evidence is retained"
          ],
          summary: "Export activity is shown as an access event while privileged CSV contents remain gated.",
          title: "Export event selected"
        },
        eventType: "Export",
        eventTone: "neutral",
        id: "evt_access_003",
        note: "Export request",
        result: "Success",
        resultTone: "success",
        risk: "Low",
        riskTone: "success",
        targetRef: "export",
        timestamp: "2026-01-18 13:37"
      },
      {
        actor: "usr_2847",
        detail: {
          fields: [
            { label: "User ID", value: "usr_2847" },
            { label: "Session ID", value: "delete_ref_31" },
            { label: "Event Type", value: "Delete" },
            { label: "Result", value: "Blocked" },
            { label: "Risk Level", value: "High" },
            { label: "IP Address", value: "Redacted" },
            { label: "User Agent", value: "Redacted" },
            { label: "Timestamp", value: "2026-01-18 13:31" },
            { label: "Session Duration", value: "Blocked before mutation" }
          ],
          protectedTrace: [
            "Authentication payload redacted",
            "Network marker redacted",
            "Operator mutation controls unavailable"
          ],
          summary: "Delete attempt was blocked and retained only as redacted access evidence.",
          title: "Blocked event selected"
        },
        eventType: "Delete",
        eventTone: "danger",
        id: "evt_access_004",
        note: "Mutation blocked",
        result: "Blocked",
        resultTone: "warning",
        risk: "High",
        riskTone: "danger",
        targetRef: "account",
        timestamp: "2026-01-18 13:31"
      },
      {
        actor: "usr_2847",
        detail: {
          fields: [
            { label: "User ID", value: "usr_2847" },
            { label: "Session ID", value: "logout_ref_28" },
            { label: "Event Type", value: "Logout" },
            { label: "Result", value: "Success" },
            { label: "Risk Level", value: "Low" },
            { label: "IP Address", value: "Redacted" },
            { label: "User Agent", value: "Redacted" },
            { label: "Timestamp", value: "2026-01-18 13:28" },
            { label: "Session Duration", value: "18m 04s" }
          ],
          protectedTrace: [
            "Session identifier redacted",
            "Browser fingerprint unavailable",
            "Only audit-safe lifecycle marker retained"
          ],
          summary: "Normal logout was recorded without customer-private material.",
          title: "Logout event selected"
        },
        eventType: "Logout",
        eventTone: "info",
        id: "evt_access_005",
        note: "Session ended",
        result: "Success",
        resultTone: "success",
        risk: "Low",
        riskTone: "success",
        targetRef: "portal",
        timestamp: "2026-01-18 13:28"
      },
      {
        actor: "usr_2847",
        detail: {
          fields: [
            { label: "User ID", value: "usr_2847" },
            { label: "Session ID", value: "session_ref_24" },
            { label: "Event Type", value: "Login" },
            { label: "Result", value: "Failed" },
            { label: "Risk Level", value: "Medium" },
            { label: "IP Address", value: "Redacted" },
            { label: "User Agent", value: "Redacted" },
            { label: "Timestamp", value: "2026-01-18 13:24" },
            { label: "Session Duration", value: "Failed before session start" }
          ],
          protectedTrace: [
            "Authentication payload redacted",
            "Failure reason summarized only",
            "No raw identity material is exposed"
          ],
          summary: "Failed login is visible for review without exposing protected request material.",
          title: "Failed event selected"
        },
        eventType: "Login",
        eventTone: "info",
        id: "evt_access_006",
        note: "Login failed",
        result: "Failed",
        resultTone: "danger",
        risk: "Medium",
        riskTone: "warning",
        targetRef: "portal",
        timestamp: "2026-01-18 13:24"
      },
      {
        actor: "usr_2847",
        detail: {
          fields: [
            { label: "User ID", value: "usr_2847" },
            { label: "Session ID", value: "api_ref_19" },
            { label: "Event Type", value: "API Call" },
            { label: "Result", value: "Success" },
            { label: "Risk Level", value: "Low" },
            { label: "IP Address", value: "Redacted" },
            { label: "User Agent", value: "Redacted" },
            { label: "Timestamp", value: "2026-01-18 13:19" },
            { label: "Session Duration", value: "Safe summary only" }
          ],
          protectedTrace: [
            "API route marker redacted",
            "Request body unavailable",
            "Only safe access outcome retained"
          ],
          summary: "API call succeeded and remains represented only by safe refs.",
          title: "API event selected"
        },
        eventType: "API Call",
        eventTone: "info",
        id: "evt_access_007",
        note: "API access",
        result: "Success",
        resultTone: "success",
        risk: "Low",
        riskTone: "success",
        targetRef: "api",
        timestamp: "2026-01-18 13:19"
      },
      {
        actor: "usr_2847",
        detail: {
          fields: [
            { label: "User ID", value: "usr_2847" },
            { label: "Session ID", value: "export_ref_14" },
            { label: "Event Type", value: "Export" },
            { label: "Result", value: "Success" },
            { label: "Risk Level", value: "Medium" },
            { label: "IP Address", value: "Redacted" },
            { label: "User Agent", value: "Redacted" },
            { label: "Timestamp", value: "2026-01-18 13:14" },
            { label: "Session Duration", value: "Safe summary only" }
          ],
          protectedTrace: [
            "Export payload redacted",
            "CSV artifact unavailable",
            "Approval context summarized only"
          ],
          summary: "Export activity was retained as redacted evidence only.",
          title: "Export event selected"
        },
        eventType: "Export",
        eventTone: "neutral",
        id: "evt_access_008",
        note: "Export request",
        result: "Success",
        resultTone: "success",
        risk: "Medium",
        riskTone: "warning",
        targetRef: "export",
        timestamp: "2026-01-18 13:14"
      }
    ]
  },
  userOperationLogs: {
    actionLabel: "Operator Console",
    detailAriaLabel: "User Operation Logs redacted detail panel",
    exportLabel: "Export CSV",
    figmaNodeId: "64:4",
    filters: ["All Operators", "Any ID", "All Actions", "All Results", "Last 24 Hours", "Reset"],
    pagination: {
      pageSize: SAFE_READ_TABLE_FIXED_ROW_COUNT,
      showPageSummary: false,
      showWhenSinglePage: true
    },
    tableAriaLabel: "User Operation Logs redacted table",
    tableMode: "operation",
    rows: [
      {
        actor: "op_001",
        detail: {
          fields: [
            { label: "Actor ID", value: "op_001" },
            { label: "Target Resource", value: "acct_001" },
            { label: "Request Context", value: "POST /v1/accounts/[REDACTED] - body masked" },
            { label: "Source IP", value: "[REDACTED]" },
            { label: "Action Outcome", value: "Success" },
            { label: "System Note", value: "Quota limit updated successfully. No source errors detected." }
          ],
          protectedTrace: [],
          summary: "Quota limit updated successfully. No source errors detected.",
          title: "Log details"
        },
        eventType: "Update",
        eventTone: "info",
        id: "op_evt_001",
        note: "Updated quota limit",
        result: "Success",
        resultTone: "success",
        risk: "Low",
        riskTone: "success",
        targetRef: "acct_001",
        timestamp: "13:42:08"
      },
      {
        actor: "op_002",
        detail: {
          fields: [
            { label: "Actor ID", value: "op_002" },
            { label: "Target Resource", value: "ord_2048" },
            { label: "Request Context", value: "GET /v1/orders/[REDACTED] - summary only" },
            { label: "Source IP", value: "[REDACTED]" },
            { label: "Action Outcome", value: "Pending" },
            { label: "System Note", value: "Risk candidate flagged for backend review." }
          ],
          protectedTrace: [],
          summary: "Risk candidate flagged for backend review.",
          title: "Log details"
        },
        eventType: "Review",
        eventTone: "info",
        id: "op_evt_002",
        note: "Risk candidate flagged",
        result: "Pending",
        resultTone: "warning",
        risk: "Watch",
        riskTone: "warning",
        targetRef: "ord_2048",
        timestamp: "13:39:51"
      },
      {
        actor: "op_003",
        detail: {
          fields: [
            { label: "Actor ID", value: "op_003" },
            { label: "Target Resource", value: "case_012" },
            { label: "Request Context", value: "PATCH /v1/cases/[REDACTED] - assignee only" },
            { label: "Source IP", value: "[REDACTED]" },
            { label: "Action Outcome", value: "Success" },
            { label: "System Note", value: "Assigned to reviewed operator queue." }
          ],
          protectedTrace: [],
          summary: "Assigned to reviewed operator queue.",
          title: "Log details"
        },
        eventType: "Assign",
        eventTone: "info",
        id: "op_evt_003",
        note: "Assigned to operator",
        result: "Success",
        resultTone: "success",
        risk: "Low",
        riskTone: "success",
        targetRef: "case_012",
        timestamp: "13:37:28"
      },
      {
        actor: "op_004",
        detail: {
          fields: [
            { label: "Actor ID", value: "op_004" },
            { label: "Target Resource", value: "sub_8192" },
            { label: "Request Context", value: "POST /v1/subscriptions/[REDACTED] - body masked" },
            { label: "Source IP", value: "[REDACTED]" },
            { label: "Action Outcome", value: "Pending" },
            { label: "System Note", value: "Expiry review required before backend lifecycle gate." }
          ],
          protectedTrace: [],
          summary: "Expiry review required before backend lifecycle gate.",
          title: "Log details"
        },
        eventType: "Suspend",
        eventTone: "warning",
        id: "op_evt_004",
        note: "Expiry review required",
        result: "Pending",
        resultTone: "warning",
        risk: "Medium",
        riskTone: "warning",
        targetRef: "sub_8192",
        timestamp: "13:31:05"
      },
      {
        actor: "op_005",
        detail: {
          fields: [
            { label: "Actor ID", value: "op_005" },
            { label: "Target Resource", value: "hk-01" },
            { label: "Request Context", value: "POST /v1/nodes/[REDACTED] - operation marker" },
            { label: "Source IP", value: "[REDACTED]" },
            { label: "Action Outcome", value: "Success" },
            { label: "System Note", value: "Collection resumed after diagnostic review." }
          ],
          protectedTrace: [],
          summary: "Collection resumed after diagnostic review.",
          title: "Log details"
        },
        eventType: "Resume",
        eventTone: "info",
        id: "op_evt_005",
        note: "Collection resumed",
        result: "Success",
        resultTone: "success",
        risk: "Low",
        riskTone: "success",
        targetRef: "hk-01",
        timestamp: "12:26:22"
      },
      {
        actor: "op_006",
        detail: {
          fields: [
            { label: "Actor ID", value: "op_006" },
            { label: "Target Resource", value: "acct_002" },
            { label: "Request Context", value: "GET /v1/exports/[REDACTED] - metadata only" },
            { label: "Source IP", value: "[REDACTED]" },
            { label: "Action Outcome", value: "Success" },
            { label: "System Note", value: "Exported usage ledger as gated evidence metadata only." }
          ],
          protectedTrace: [],
          summary: "Exported usage ledger as gated evidence metadata only.",
          title: "Log details"
        },
        eventType: "Export",
        eventTone: "info",
        id: "op_evt_006",
        note: "Exported usage ledger",
        result: "Success",
        resultTone: "success",
        risk: "Low",
        riskTone: "success",
        targetRef: "acct_002",
        timestamp: "12:03:11"
      },
      {
        actor: "op_007",
        detail: {
          fields: [
            { label: "Actor ID", value: "op_007" },
            { label: "Target Resource", value: "case_017" },
            { label: "Request Context", value: "PATCH /v1/cases/[REDACTED] - close marker" },
            { label: "Source IP", value: "[REDACTED]" },
            { label: "Action Outcome", value: "Success" },
            { label: "System Note", value: "Case closed after safe evidence review." }
          ],
          protectedTrace: [],
          summary: "Case closed after safe evidence review.",
          title: "Log details"
        },
        eventType: "Close",
        eventTone: "info",
        id: "op_evt_007",
        note: "Case closed",
        result: "Success",
        resultTone: "success",
        risk: "Low",
        riskTone: "success",
        targetRef: "case_017",
        timestamp: "11:58:03"
      },
      {
        actor: "op_008",
        detail: {
          fields: [
            { label: "Actor ID", value: "op_008" },
            { label: "Target Resource", value: "sg-02" },
            { label: "Request Context", value: "GET /v1/routes/[REDACTED] - summary only" },
            { label: "Source IP", value: "[REDACTED]" },
            { label: "Action Outcome", value: "Pending" },
            { label: "System Note", value: "Coverage gap detected and queued for platform review." }
          ],
          protectedTrace: [],
          summary: "Coverage gap detected and queued for platform review.",
          title: "Log details"
        },
        eventType: "Check",
        eventTone: "info",
        id: "op_evt_008",
        note: "Coverage gap detected",
        result: "Pending",
        resultTone: "warning",
        risk: "Watch",
        riskTone: "warning",
        targetRef: "sg-02",
        timestamp: "11:44:55"
      }
    ]
  }
};

const NODE_HEALTH_PAGE_CONFIG: NodeHealthPageConfig = {
  actionLabel: "Node Console",
  detailAriaLabel: "Node Health redacted detail panel",
  exportLabel: "Export CSV",
  figmaNodeId: "61:4",
  filters: ["All Regions", "All Status", "All Types", "Apply Filters"],
  pagination: {
    pageSize: SAFE_READ_TABLE_FIXED_ROW_COUNT,
    showPageSummary: false,
    showWhenSinglePage: true
  },
  queryPlaceholder: "Search node ID or region...",
  tableAriaLabel: "Node Health redacted table",
  rows: [
    {
      detail: {
        fields: [
          { label: "Node ID", value: "node_gw_01" },
          { label: "Region", value: "us-east-1" },
          { label: "Type", tone: "info", value: "Gateway" },
          { label: "Status", tone: "success", value: "Online" },
          { label: "Uptime", value: "99.98%" },
          { label: "Last Ping", value: "142ms" },
          { label: "IP Address", value: "[REDACTED_IP]" },
          { label: "Version", value: "v2.4.1" }
        ],
        performance: [
          { label: "CPU Load", value: "12%" },
          { label: "Memory", value: "4.2 GB / 16 GB" },
          { label: "Bandwidth", value: "1.2 Gbps" }
        ]
      },
      id: "node_health_001",
      lastPing: "142ms",
      nodeId: "node_gw_01",
      region: "us-east-1",
      status: "Online",
      statusTone: "success",
      type: "Gateway",
      typeTone: "info",
      uptime: "99.98%"
    },
    {
      detail: {
        fields: [
          { label: "Node ID", value: "node_pr_02" },
          { label: "Region", value: "eu-west-2" },
          { label: "Type", tone: "info", value: "Proxy" },
          { label: "Status", tone: "warning", value: "Degraded" },
          { label: "Uptime", value: "87.2%" },
          { label: "Last Ping", value: "2s ago" },
          { label: "IP Address", value: "[REDACTED_IP]" },
          { label: "Version", value: "v2.4.1" }
        ],
        performance: [
          { label: "CPU Load", value: "68%" },
          { label: "Memory", value: "11.4 GB / 16 GB" },
          { label: "Bandwidth", value: "840 Mbps" }
        ]
      },
      id: "node_health_002",
      lastPing: "2s ago",
      nodeId: "node_pr_02",
      region: "eu-west-2",
      status: "Degraded",
      statusTone: "warning",
      type: "Proxy",
      typeTone: "info",
      uptime: "87.2%"
    },
    {
      detail: {
        fields: [
          { label: "Node ID", value: "node_ed_03" },
          { label: "Region", value: "ap-south-1" },
          { label: "Type", tone: "info", value: "Edge" },
          { label: "Status", tone: "danger", value: "Offline" },
          { label: "Uptime", value: "0.00%" },
          { label: "Last Ping", value: "-" },
          { label: "IP Address", value: "[REDACTED_IP]" },
          { label: "Version", value: "v2.4.1" }
        ],
        performance: [
          { label: "CPU Load", value: "0%" },
          { label: "Memory", value: "Unavailable" },
          { label: "Bandwidth", value: "0 Mbps" }
        ]
      },
      id: "node_health_003",
      lastPing: "-",
      nodeId: "node_ed_03",
      region: "ap-south-1",
      status: "Offline",
      statusTone: "danger",
      type: "Edge",
      typeTone: "info",
      uptime: "0.00%"
    },
    {
      detail: {
        fields: [
          { label: "Node ID", value: "node_gw_04" },
          { label: "Region", value: "us-east-1" },
          { label: "Type", tone: "info", value: "Gateway" },
          { label: "Status", tone: "success", value: "Online" },
          { label: "Uptime", value: "99.99%" },
          { label: "Last Ping", value: "118ms" },
          { label: "IP Address", value: "[REDACTED_IP]" },
          { label: "Version", value: "v2.4.1" }
        ],
        performance: [
          { label: "CPU Load", value: "9%" },
          { label: "Memory", value: "3.8 GB / 16 GB" },
          { label: "Bandwidth", value: "980 Mbps" }
        ]
      },
      id: "node_health_004",
      lastPing: "118ms",
      nodeId: "node_gw_04",
      region: "us-east-1",
      status: "Online",
      statusTone: "success",
      type: "Gateway",
      typeTone: "info",
      uptime: "99.99%"
    },
    {
      detail: {
        fields: [
          { label: "Node ID", value: "node_pr_05" },
          { label: "Region", value: "eu-west-2" },
          { label: "Type", tone: "info", value: "Proxy" },
          { label: "Status", tone: "success", value: "Online" },
          { label: "Uptime", value: "99.94%" },
          { label: "Last Ping", value: "156ms" },
          { label: "IP Address", value: "[REDACTED_IP]" },
          { label: "Version", value: "v2.4.1" }
        ],
        performance: [
          { label: "CPU Load", value: "18%" },
          { label: "Memory", value: "5.1 GB / 16 GB" },
          { label: "Bandwidth", value: "760 Mbps" }
        ]
      },
      id: "node_health_005",
      lastPing: "156ms",
      nodeId: "node_pr_05",
      region: "eu-west-2",
      status: "Online",
      statusTone: "success",
      type: "Proxy",
      typeTone: "info",
      uptime: "99.94%"
    },
    {
      detail: {
        fields: [
          { label: "Node ID", value: "node_ed_06" },
          { label: "Region", value: "ap-south-1" },
          { label: "Type", tone: "info", value: "Edge" },
          { label: "Status", tone: "warning", value: "Degraded" },
          { label: "Uptime", value: "91.1%" },
          { label: "Last Ping", value: "1.2s ago" },
          { label: "IP Address", value: "[REDACTED_IP]" },
          { label: "Version", value: "v2.4.1" }
        ],
        performance: [
          { label: "CPU Load", value: "74%" },
          { label: "Memory", value: "12.2 GB / 16 GB" },
          { label: "Bandwidth", value: "610 Mbps" }
        ]
      },
      id: "node_health_006",
      lastPing: "1.2s ago",
      nodeId: "node_ed_06",
      region: "ap-south-1",
      status: "Degraded",
      statusTone: "warning",
      type: "Edge",
      typeTone: "info",
      uptime: "91.1%"
    },
    {
      detail: {
        fields: [
          { label: "Node ID", value: "node_gw_07" },
          { label: "Region", value: "us-east-1" },
          { label: "Type", tone: "info", value: "Gateway" },
          { label: "Status", tone: "danger", value: "Offline" },
          { label: "Uptime", value: "0.00%" },
          { label: "Last Ping", value: "-" },
          { label: "IP Address", value: "[REDACTED_IP]" },
          { label: "Version", value: "v2.4.1" }
        ],
        performance: [
          { label: "CPU Load", value: "0%" },
          { label: "Memory", value: "Unavailable" },
          { label: "Bandwidth", value: "0 Mbps" }
        ]
      },
      id: "node_health_007",
      lastPing: "-",
      nodeId: "node_gw_07",
      region: "us-east-1",
      status: "Offline",
      statusTone: "danger",
      type: "Gateway",
      typeTone: "info",
      uptime: "0.00%"
    },
    {
      detail: {
        fields: [
          { label: "Node ID", value: "node_pr_08" },
          { label: "Region", value: "eu-west-2" },
          { label: "Type", tone: "info", value: "Proxy" },
          { label: "Status", tone: "success", value: "Online" },
          { label: "Uptime", value: "99.97%" },
          { label: "Last Ping", value: "104ms" },
          { label: "IP Address", value: "[REDACTED_IP]" },
          { label: "Version", value: "v2.4.1" }
        ],
        performance: [
          { label: "CPU Load", value: "14%" },
          { label: "Memory", value: "4.7 GB / 16 GB" },
          { label: "Bandwidth", value: "1.1 Gbps" }
        ]
      },
      id: "node_health_008",
      lastPing: "104ms",
      nodeId: "node_pr_08",
      region: "eu-west-2",
      status: "Online",
      statusTone: "success",
      type: "Proxy",
      typeTone: "info",
      uptime: "99.97%"
    }
  ]
};

const NODE_LOGS_PAGE_CONFIG: NodeLogsPageConfig = {
  actionLabel: "Node Console",
  detailAriaLabel: "Node Logs redacted detail panel",
  exportLabel: "Export CSV",
  figmaNodeId: "62:4",
  filters: ["All Nodes", "Last 24 Hours", "All Events", "All Status", "Apply Filters"],
  pagination: {
    nextLabel: "Next",
    pageSize: SAFE_READ_TABLE_FIXED_ROW_COUNT,
    previousLabel: "Prev",
    showPageSummary: false,
    showWhenSinglePage: true
  },
  queryPlaceholder: "Search node ID, event type...",
  tableAriaLabel: "Node Logs redacted table",
  rows: [
    {
      detail: {
        fields: [
          { label: "Node ID", value: "node_gw_01" },
          { label: "Event Type", tone: "info", value: "Protected Change" },
          { label: "Status", tone: "success", value: "Online" },
          { label: "Severity", tone: "info", value: "INFO" },
          { label: "Timestamp", value: "2026-01-18 13:42:08" },
          { label: "Region", value: "us-east-1" },
          { label: "IP Address", value: "[REDACTED_IP]" },
          { label: "Duration", value: "142ms" }
        ],
        systemNote: "Protected update completed. Source errors not detected."
      },
      eventTone: "info",
      eventType: "Protected Change",
      id: "node_log_001",
      message: "Protected update",
      nodeId: "node_gw_01",
      severity: "INFO",
      severityTone: "info",
      status: "Online",
      statusTone: "success",
      timestamp: "2026-01-18 13:42"
    },
    {
      detail: {
        fields: [
          { label: "Node ID", value: "node_gw_02" },
          { label: "Event Type", tone: "warning", value: "Shutdown" },
          { label: "Status", tone: "warning", value: "Degraded" },
          { label: "Severity", tone: "warning", value: "WARN" },
          { label: "Timestamp", value: "2026-01-18 13:39:51" },
          { label: "Region", value: "eu-west-2" },
          { label: "IP Address", value: "[REDACTED_IP]" },
          { label: "Duration", value: "188ms" }
        ],
        systemNote: "Graceful shutdown initiated by a safe maintenance workflow."
      },
      eventTone: "warning",
      eventType: "Shutdown",
      id: "node_log_002",
      message: "Graceful shutdown initiated",
      nodeId: "node_gw_02",
      severity: "WARN",
      severityTone: "warning",
      status: "Degraded",
      statusTone: "warning",
      timestamp: "2026-01-18 13:39"
    },
    {
      detail: {
        fields: [
          { label: "Node ID", value: "node_gw_03" },
          { label: "Event Type", tone: "danger", value: "Error" },
          { label: "Status", tone: "danger", value: "Offline" },
          { label: "Severity", tone: "danger", value: "ERROR" },
          { label: "Timestamp", value: "2026-01-18 13:37:24" },
          { label: "Region", value: "ap-south-1" },
          { label: "IP Address", value: "[REDACTED_IP]" },
          { label: "Duration", value: "312ms" }
        ],
        systemNote: "Database connection timeout was recorded with protected material redacted."
      },
      eventTone: "danger",
      eventType: "Error",
      id: "node_log_003",
      message: "Database connection timeout",
      nodeId: "node_gw_03",
      severity: "ERROR",
      severityTone: "danger",
      status: "Offline",
      statusTone: "danger",
      timestamp: "2026-01-18 13:37"
    },
    {
      detail: {
        fields: [
          { label: "Node ID", value: "node_gw_01" },
          { label: "Event Type", tone: "info", value: "Health Check" },
          { label: "Status", tone: "success", value: "Online" },
          { label: "Severity", tone: "info", value: "INFO" },
          { label: "Timestamp", value: "2026-01-18 13:31:09" },
          { label: "Region", value: "us-east-1" },
          { label: "IP Address", value: "[REDACTED_IP]" },
          { label: "Duration", value: "96ms" }
        ],
        systemNote: "CPU warning threshold summary is visible without raw runtime counters."
      },
      eventTone: "info",
      eventType: "Health Check",
      id: "node_log_004",
      message: "CPU usage 92% (threshold 90%)",
      nodeId: "node_gw_01",
      severity: "INFO",
      severityTone: "info",
      status: "Online",
      statusTone: "success",
      timestamp: "2026-01-18 13:31"
    },
    {
      detail: {
        fields: [
          { label: "Node ID", value: "node_gw_02" },
          { label: "Event Type", tone: "info", value: "Startup" },
          { label: "Status", tone: "success", value: "Online" },
          { label: "Severity", tone: "info", value: "INFO" },
          { label: "Timestamp", value: "2026-01-18 13:28:45" },
          { label: "Region", value: "eu-west-2" },
          { label: "IP Address", value: "[REDACTED_IP]" },
          { label: "Duration", value: "121ms" }
        ],
        systemNote: "Node startup completed and exposes only the operator-safe summary."
      },
      eventTone: "info",
      eventType: "Startup",
      id: "node_log_005",
      message: "Node booted successfully",
      nodeId: "node_gw_02",
      severity: "INFO",
      severityTone: "info",
      status: "Online",
      statusTone: "success",
      timestamp: "2026-01-18 13:28"
    },
    {
      detail: {
        fields: [
          { label: "Node ID", value: "node_gw_03" },
          { label: "Event Type", tone: "warning", value: "Shutdown" },
          { label: "Status", tone: "warning", value: "Degraded" },
          { label: "Severity", tone: "warning", value: "WARN" },
          { label: "Timestamp", value: "2026-01-18 13:24:06" },
          { label: "Region", value: "ap-south-1" },
          { label: "IP Address", value: "[REDACTED_IP]" },
          { label: "Duration", value: "204ms" }
        ],
        systemNote: "Maintenance window summary remains visible; mutation controls remain unavailable."
      },
      eventTone: "warning",
      eventType: "Shutdown",
      id: "node_log_006",
      message: "Maintenance window started",
      nodeId: "node_gw_03",
      severity: "WARN",
      severityTone: "warning",
      status: "Degraded",
      statusTone: "warning",
      timestamp: "2026-01-18 13:24"
    },
    {
      detail: {
        fields: [
          { label: "Node ID", value: "node_gw_01" },
          { label: "Event Type", tone: "danger", value: "Error" },
          { label: "Status", tone: "danger", value: "Offline" },
          { label: "Severity", tone: "danger", value: "ERROR" },
          { label: "Timestamp", value: "2026-01-18 13:19:55" },
          { label: "Region", value: "us-east-1" },
          { label: "IP Address", value: "[REDACTED_IP]" },
          { label: "Duration", value: "418ms" }
        ],
        systemNote: "Auth service unavailable marker is shown without credentials, URLs, or raw traces."
      },
      eventTone: "danger",
      eventType: "Error",
      id: "node_log_007",
      message: "Auth service unavailable",
      nodeId: "node_gw_01",
      severity: "ERROR",
      severityTone: "danger",
      status: "Offline",
      statusTone: "danger",
      timestamp: "2026-01-18 13:19"
    },
    {
      detail: {
        fields: [
          { label: "Node ID", value: "node_gw_02" },
          { label: "Event Type", tone: "info", value: "Health Check" },
          { label: "Status", tone: "success", value: "Online" },
          { label: "Severity", tone: "info", value: "INFO" },
          { label: "Timestamp", value: "2026-01-18 13:14:12" },
          { label: "Region", value: "eu-west-2" },
          { label: "IP Address", value: "[REDACTED_IP]" },
          { label: "Duration", value: "136ms" }
        ],
        systemNote: "Disk space warning is summarized without exposing runtime filesystem paths."
      },
      eventTone: "info",
      eventType: "Health Check",
      id: "node_log_008",
      message: "Disk space 85% (warning)",
      nodeId: "node_gw_02",
      severity: "INFO",
      severityTone: "info",
      status: "Online",
      statusTone: "success",
      timestamp: "2026-01-18 13:14"
    }
  ]
};

const NODE_BANDWIDTH_PAGE_CONFIG: NodeBandwidthPageConfig = {
  actionLabel: "Node Console",
  detailAriaLabel: "Node Bandwidth redacted detail panel",
  exportLabel: "Export CSV",
  figmaNodeId: "63:4",
  filters: ["All Nodes", "Last 1h", "All Regions", "All Types", "Apply"],
  pagination: {
    nextLabel: "Next",
    pageSize: SAFE_READ_TABLE_FIXED_ROW_COUNT,
    previousLabel: "Prev",
    showPageSummary: false,
    showWhenSinglePage: true
  },
  queryPlaceholder: "Search node ID or region...",
  tableAriaLabel: "Node Bandwidth redacted table",
  rows: [
    {
      avgLatency: "12ms",
      detail: {
        fields: [
          { label: "Node ID", value: "node_gw_01" },
          { label: "Region", value: "us-east-1" },
          { label: "Type", value: "Gateway" },
          { label: "Current Inbound", value: "1.2 Gbps" },
          { label: "Current Outbound", value: "0.8 Gbps" },
          { label: "Peak BPS", value: "2.4 Gbps" },
          { label: "Avg Latency", value: "12ms" },
          { label: "Packet Loss", value: "0.01%" }
        ],
        trafficWindow: [
          { label: "Last 1h", value: "1.2 Gbps" },
          { label: "Last 24h", value: "1.1 Gbps" },
          { label: "Last 7d", value: "0.9 Gbps" }
        ]
      },
      id: "node_bandwidth_001",
      inbound: "1.2 Gbps",
      nodeId: "node_gw_01",
      outbound: "0.8 Gbps",
      packetLoss: "0.01%",
      peakBps: "2.4 Gbps",
      region: "us-east-1",
      type: "Gateway",
      utilization: "34%",
      utilizationPercent: 34,
      utilizationTone: "success"
    },
    {
      avgLatency: "18ms",
      detail: {
        fields: [
          { label: "Node ID", value: "node_gw_02" },
          { label: "Region", value: "eu-west-2" },
          { label: "Type", value: "Gateway" },
          { label: "Current Inbound", value: "0.9 Gbps" },
          { label: "Current Outbound", value: "0.6 Gbps" },
          { label: "Peak BPS", value: "1.8 Gbps" },
          { label: "Avg Latency", value: "18ms" },
          { label: "Packet Loss", value: "0.02%" }
        ],
        trafficWindow: [
          { label: "Last 1h", value: "0.9 Gbps" },
          { label: "Last 24h", value: "0.8 Gbps" },
          { label: "Last 7d", value: "0.7 Gbps" }
        ]
      },
      id: "node_bandwidth_002",
      inbound: "0.9 Gbps",
      nodeId: "node_gw_02",
      outbound: "0.6 Gbps",
      packetLoss: "0.02%",
      peakBps: "1.8 Gbps",
      region: "eu-west-2",
      type: "Gateway",
      utilization: "41%",
      utilizationPercent: 41,
      utilizationTone: "success"
    },
    {
      avgLatency: "26ms",
      detail: {
        fields: [
          { label: "Node ID", value: "node_edge_03" },
          { label: "Region", value: "ap-south-1" },
          { label: "Type", value: "Edge" },
          { label: "Current Inbound", value: "2.1 Gbps" },
          { label: "Current Outbound", value: "1.4 Gbps" },
          { label: "Peak BPS", value: "3.6 Gbps" },
          { label: "Avg Latency", value: "26ms" },
          { label: "Packet Loss", value: "0.04%" }
        ],
        trafficWindow: [
          { label: "Last 1h", value: "2.1 Gbps" },
          { label: "Last 24h", value: "1.9 Gbps" },
          { label: "Last 7d", value: "1.6 Gbps" }
        ]
      },
      id: "node_bandwidth_003",
      inbound: "2.1 Gbps",
      nodeId: "node_edge_03",
      outbound: "1.4 Gbps",
      packetLoss: "0.04%",
      peakBps: "3.6 Gbps",
      region: "ap-south-1",
      type: "Edge",
      utilization: "67%",
      utilizationPercent: 67,
      utilizationTone: "warning"
    },
    {
      avgLatency: "14ms",
      detail: {
        fields: [
          { label: "Node ID", value: "node_gw_04" },
          { label: "Region", value: "us-east-1" },
          { label: "Type", value: "Gateway" },
          { label: "Current Inbound", value: "0.7 Gbps" },
          { label: "Current Outbound", value: "0.5 Gbps" },
          { label: "Peak BPS", value: "1.2 Gbps" },
          { label: "Avg Latency", value: "14ms" },
          { label: "Packet Loss", value: "0.01%" }
        ],
        trafficWindow: [
          { label: "Last 1h", value: "0.7 Gbps" },
          { label: "Last 24h", value: "0.7 Gbps" },
          { label: "Last 7d", value: "0.6 Gbps" }
        ]
      },
      id: "node_bandwidth_004",
      inbound: "0.7 Gbps",
      nodeId: "node_gw_04",
      outbound: "0.5 Gbps",
      packetLoss: "0.01%",
      peakBps: "1.2 Gbps",
      region: "us-east-1",
      type: "Gateway",
      utilization: "28%",
      utilizationPercent: 28,
      utilizationTone: "success"
    },
    {
      avgLatency: "31ms",
      detail: {
        fields: [
          { label: "Node ID", value: "node_edge_05" },
          { label: "Region", value: "eu-west-2" },
          { label: "Type", value: "Edge" },
          { label: "Current Inbound", value: "3.8 Gbps" },
          { label: "Current Outbound", value: "2.6 Gbps" },
          { label: "Peak BPS", value: "6.0 Gbps" },
          { label: "Avg Latency", value: "31ms" },
          { label: "Packet Loss", value: "0.06%" }
        ],
        trafficWindow: [
          { label: "Last 1h", value: "3.8 Gbps" },
          { label: "Last 24h", value: "3.4 Gbps" },
          { label: "Last 7d", value: "2.8 Gbps" }
        ]
      },
      id: "node_bandwidth_005",
      inbound: "3.8 Gbps",
      nodeId: "node_edge_05",
      outbound: "2.6 Gbps",
      packetLoss: "0.06%",
      peakBps: "6.0 Gbps",
      region: "eu-west-2",
      type: "Edge",
      utilization: "79%",
      utilizationPercent: 79,
      utilizationTone: "warning"
    },
    {
      avgLatency: "22ms",
      detail: {
        fields: [
          { label: "Node ID", value: "node_gw_06" },
          { label: "Region", value: "ap-south-1" },
          { label: "Type", value: "Gateway" },
          { label: "Current Inbound", value: "1.5 Gbps" },
          { label: "Current Outbound", value: "1.0 Gbps" },
          { label: "Peak BPS", value: "2.8 Gbps" },
          { label: "Avg Latency", value: "22ms" },
          { label: "Packet Loss", value: "0.03%" }
        ],
        trafficWindow: [
          { label: "Last 1h", value: "1.5 Gbps" },
          { label: "Last 24h", value: "1.4 Gbps" },
          { label: "Last 7d", value: "1.1 Gbps" }
        ]
      },
      id: "node_bandwidth_006",
      inbound: "1.5 Gbps",
      nodeId: "node_gw_06",
      outbound: "1.0 Gbps",
      packetLoss: "0.03%",
      peakBps: "2.8 Gbps",
      region: "ap-south-1",
      type: "Gateway",
      utilization: "52%",
      utilizationPercent: 52,
      utilizationTone: "success"
    },
    {
      avgLatency: "38ms",
      detail: {
        fields: [
          { label: "Node ID", value: "node_edge_07" },
          { label: "Region", value: "us-east-1" },
          { label: "Type", value: "Edge" },
          { label: "Current Inbound", value: "4.2 Gbps" },
          { label: "Current Outbound", value: "3.1 Gbps" },
          { label: "Peak BPS", value: "7.2 Gbps" },
          { label: "Avg Latency", value: "38ms" },
          { label: "Packet Loss", value: "0.08%" }
        ],
        trafficWindow: [
          { label: "Last 1h", value: "4.2 Gbps" },
          { label: "Last 24h", value: "3.7 Gbps" },
          { label: "Last 7d", value: "3.1 Gbps" }
        ]
      },
      id: "node_bandwidth_007",
      inbound: "4.2 Gbps",
      nodeId: "node_edge_07",
      outbound: "3.1 Gbps",
      packetLoss: "0.08%",
      peakBps: "7.2 Gbps",
      region: "us-east-1",
      type: "Edge",
      utilization: "91%",
      utilizationPercent: 91,
      utilizationTone: "danger"
    },
    {
      avgLatency: "16ms",
      detail: {
        fields: [
          { label: "Node ID", value: "node_gw_08" },
          { label: "Region", value: "eu-west-2" },
          { label: "Type", value: "Gateway" },
          { label: "Current Inbound", value: "0.4 Gbps" },
          { label: "Current Outbound", value: "0.3 Gbps" },
          { label: "Peak BPS", value: "0.8 Gbps" },
          { label: "Avg Latency", value: "16ms" },
          { label: "Packet Loss", value: "0.01%" }
        ],
        trafficWindow: [
          { label: "Last 1h", value: "0.4 Gbps" },
          { label: "Last 24h", value: "0.4 Gbps" },
          { label: "Last 7d", value: "0.3 Gbps" }
        ]
      },
      id: "node_bandwidth_008",
      inbound: "0.4 Gbps",
      nodeId: "node_gw_08",
      outbound: "0.3 Gbps",
      packetLoss: "0.01%",
      peakBps: "0.8 Gbps",
      region: "eu-west-2",
      type: "Gateway",
      utilization: "19%",
      utilizationPercent: 19,
      utilizationTone: "success"
    }
  ]
};

export function isSafeReadAdminPage(page: AdminPage) {
  return page in SAFE_READ_PAGE_CONFIGS;
}

export function AdminSafeReadPage({
  nodeBandwidthSummary,
  page,
  orderManagementLifecycle,
  orderManagementPageInfo,
  onOrderManagementPageChange,
  orderManagementRequests,
  orderManagementUsageMonitor,
  userManagementAccounts,
  userManagementEntitlements = [],
  userManagementLifecycle,
  userManagementState,
  userManagementUsageRows = []
}: {
  page: AdminPage;
  orderManagementLifecycle?: OrderManagementLifecycleHandlers;
  orderManagementPageInfo?: AdminListPageInfo;
  orderManagementUsageMonitor?: SubscriptionUsageMonitor;
  nodeBandwidthSummary?: NodeBandwidthSummary;
  onOrderManagementPageChange?: (page: number) => void | Promise<void>;
  orderManagementRequests?: PortalAccessRequestSummary[];
  userManagementAccounts?: PlatformAccountSummary[];
  userManagementEntitlements?: PlatformEntitlementSummary[];
  userManagementLifecycle?: UserManagementLifecycleHandlers;
  userManagementState?: DataTableState;
  userManagementUsageRows?: SubscriptionUsageMonitorRow[];
}) {
  const [userManagementQuery, setUserManagementQuery] = useState<UserManagementSafeReadQuery>({});
  const config = SAFE_READ_PAGE_CONFIGS[page];
  if (!config) {
    return null;
  }

  if (page === "userManagement") {
    const userManagementConfig = userManagementAccounts !== undefined
      ? createUserManagementPageConfigFromAccountSummaries({
        accounts: userManagementAccounts,
        entitlements: userManagementEntitlements,
        usageRows: userManagementUsageRows
      })
      : USER_MANAGEMENT_PAGE_CONFIG;
    return (
      <AdminUserManagementReadPage
        config={userManagementConfig}
        lifecycle={userManagementLifecycle}
        query={userManagementQuery}
        onQueryChange={setUserManagementQuery}
        tableState={userManagementState}
      />
    );
  }

  if (page === "orderManagement") {
    const orderManagementConfig = orderManagementRequests !== undefined
      ? createOrderManagementPageConfigFromPortalAccessRequests(
        orderManagementRequests,
        orderManagementPageInfo,
        onOrderManagementPageChange,
        orderManagementUsageMonitor
      )
      : ORDER_MANAGEMENT_PAGE_CONFIG;
    return <AdminOrderManagementReadPage config={orderManagementConfig} lifecycle={orderManagementLifecycle} />;
  }

  if (isAuditLogPage(page)) {
    return <AdminAuditLogReadPage config={AUDIT_LOG_PAGE_CONFIGS[page]} page={page} />;
  }

  if (page === "nodeHealth") {
    return <AdminNodeHealthReadPage config={NODE_HEALTH_PAGE_CONFIG} />;
  }

  if (page === "nodeLogs") {
    return <AdminNodeLogsReadPage config={NODE_LOGS_PAGE_CONFIG} />;
  }

  if (page === "nodeBandwidth") {
    const nodeBandwidthConfig = nodeBandwidthSummary
      ? createNodeBandwidthPageConfigFromSummary(nodeBandwidthSummary)
      : NODE_BANDWIDTH_PAGE_CONFIG;
    return <AdminNodeBandwidthReadPage config={nodeBandwidthConfig} />;
  }

  const context = pageContexts[page];
  const title = pageTitles[page];

  return (
    <div
      className="page-stack admin-blueprint-page admin-safe-read-page"
      data-figma-node-id={config.figmaNodeId}
      data-page={page}
      data-safe-read-state="readonly"
      data-ui-role="safe-read-page"
    >
      <header className="admin-blueprint-page-hero" aria-label={`${title} header`}>
        <p>{context.eyebrow}</p>
        <h1>{title}</h1>
      </header>

      <section className="admin-safe-read-toolbar" aria-label={`${title} query controls`}>
        <label>
          <span className="sr-only">{title} search</span>
          <input disabled value={config.queryPlaceholder} readOnly />
        </label>
        {config.primaryActionLabel ? (
          <button disabled type="button">{config.primaryActionLabel}</button>
        ) : null}
        <span>Read-only fixture projection</span>
      </section>

      <section className="admin-safe-read-metrics" aria-label={`${title} safe metrics`}>
        {config.metrics.map((metric) => (
          <article className="ops-metric-card" data-tone={metric.tone} key={metric.label}>
            <span>{metric.label}</span>
            <strong>{metric.value}</strong>
            <small>{metric.meta}</small>
          </article>
        ))}
      </section>

      <section className="admin-safe-read-workspace" aria-label={`${title} safe query workspace`}>
        <article className="admin-safe-read-table-card">
          <header>
            <h2>{title} Table</h2>
            <p>Safe refs only; no raw identity, token, credential, URL, runtime config, or SQLite row.</p>
          </header>
          <div className="new-console-table-shell">
            <table className="new-console-table">
              <thead>
                <tr>
                  {config.table.columns.map((column) => <th key={column}>{column}</th>)}
                </tr>
              </thead>
              <tbody>
                {config.table.rows.map((row) => (
                  <tr key={row.join("|")}>
                    {row.map((cell, index) => <td key={`${cell}-${index}`}>{cell}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </article>

        <aside className="admin-safe-read-side-panels" aria-label={`${title} safety panels`}>
          {config.panels.map((panel) => (
            <article className="admin-safe-read-side-panel" data-tone={panel.tone} key={panel.label}>
              <span>{panel.status}</span>
              <h2>{panel.label}</h2>
              <p>{panel.detail}</p>
            </article>
          ))}
        </aside>
      </section>
    </div>
  );
}

function isAuditLogPage(page: AdminPage): page is "userAccessLogs" | "userOperationLogs" {
  return page === "userAccessLogs" || page === "userOperationLogs";
}

function createUserManagementRow(input: {
  createdDate: string;
  displayName: string;
  id: string;
  lastAccess: string;
  plan: string;
  risk: string;
  riskTone: MetricTone;
  status: string;
  statusTone: MetricTone;
  userId: string;
}): UserManagementRow {
  const row: UserManagementRow = {
    ...input,
    detail: { fields: [] },
    email: "[REDACTED_EMAIL]",
    planTone: "info"
  };

  row.detail.fields = [
    { label: "User ID", value: row.userId },
    { label: "Display Name", value: row.displayName },
    { label: "Email", value: row.email },
    { label: "Plan", value: row.plan },
    { label: "Status", tone: row.statusTone, value: row.status },
    { label: "Risk Level", tone: row.riskTone, value: row.risk },
    { label: "Created Date", value: row.createdDate },
    { label: "Last Access", value: row.lastAccess }
  ];

  return row;
}

function createOrderManagementRow(input: {
  accountRef: string;
  assignedQuota: string;
  delivery: string;
  deliveryTone: MetricTone;
  id: string;
  lifecycle: string;
  lifecycleTone: MetricTone;
  orderId: string;
  planLevel: string;
  status: string;
  statusTone: MetricTone;
  usageEvidence?: OrderManagementUsageEvidence;
}): OrderManagementRow {
  const row: OrderManagementRow = {
    ...input,
    detail: { fields: [] },
    usageEvidence: input.usageEvidence ?? defaultOrderManagementUsageEvidence(input.assignedQuota)
  };

  row.detail.fields = [
    { label: "Order ID", value: row.orderId },
    { label: "Account Ref", value: row.accountRef },
    { label: "Plan Level", value: row.planLevel },
    { label: "Assigned Quota", value: row.assignedQuota },
    { label: "Used Traffic", value: row.usageEvidence.usedLimitLabel },
    { label: "Usage Collection", tone: row.usageEvidence.collectionTone, value: row.usageEvidence.collectionLabel },
    { label: "Last Usage", value: row.usageEvidence.lastObservedLabel },
    { label: "Lifecycle", tone: row.lifecycleTone, value: row.lifecycle },
    { label: "Delivery", tone: row.deliveryTone, value: row.delivery }
  ];

  return row;
}

function defaultOrderManagementUsageEvidence(assignedQuota: string): OrderManagementUsageEvidence {
  return {
    collectionLabel: "Not connected",
    collectionTone: "neutral",
    lastObservedLabel: "Not observed",
    orderCountLabel: "1 order · 0 measured",
    sourceLabel: "Order management fixture",
    uploadDownloadLabel: "0 B up / 0 B down",
    usageRatioLabel: "No measured usage",
    userTotalLabel: "No user aggregate",
    usedLimitLabel: `Not observed / ${assignedQuota}`
  };
}

function createNodeBandwidthPageConfigFromSummary(
  summary: NodeBandwidthSummary
): NodeBandwidthPageConfig {
  return {
    ...NODE_BANDWIDTH_PAGE_CONFIG,
    pagination: {
      ...NODE_BANDWIDTH_PAGE_CONFIG.pagination,
      displayTotalRows: summary.aggregates.totalNodes,
      pageSize: SAFE_READ_TABLE_FIXED_ROW_COUNT
    },
    rows: summary.items.map(createNodeBandwidthRowFromSummary)
  };
}

function createNodeBandwidthRowFromSummary(row: NodeBandwidthSummaryRow): NodeBandwidthRow {
  const inbound = formatNodeBandwidthBps(row.currentDownloadBps);
  const outbound = formatNodeBandwidthBps(row.currentUploadBps);
  const peakBps = formatNodeBandwidthBps(row.peakTotalBps);
  const utilizationPercent = clampPercent(row.utilizationPercent);
  const utilization = `${utilizationPercent}%`;
  const type = row.protocol ? titleCaseSafe(row.protocol) : titleCaseSafe(row.runtimeAdapter);
  const collectionStatus = titleCaseSafe(row.collectionStatus);
  const lastObserved = formatNodeObservedAt(row.lastObservedAt);
  const warningSummary = row.warnings.length > 0 ? row.warnings.map(titleCaseSafe).join(", ") : "None";

  return {
    avgLatency: "n/a",
    detail: {
      fields: [
        { label: "Node ID", value: row.nodeId },
        { label: "Region", value: row.region || "Unknown" },
        { label: "Type", value: type || "Node" },
        { label: "Current Inbound", value: inbound },
        { label: "Current Outbound", value: outbound },
        { label: "Peak BPS", value: peakBps },
        { label: "Collection", value: collectionStatus },
        { label: "Last Observed", value: lastObserved }
      ],
      trafficWindow: [
        { label: "Upload", value: formatNodeBandwidthBytes(row.uploadBytes) },
        { label: "Download", value: formatNodeBandwidthBytes(row.downloadBytes) },
        { label: "Total", value: formatNodeBandwidthBytes(row.totalBytes) },
        { label: "Samples", value: String(row.sampleCount) },
        { label: "Warnings", value: warningSummary }
      ]
    },
    id: row.nodeId,
    inbound,
    nodeId: row.nodeId,
    outbound,
    packetLoss: "n/a",
    peakBps,
    region: row.region || "Unknown",
    type: type || "Node",
    utilization,
    utilizationPercent,
    utilizationTone: nodeBandwidthUtilizationTone(row.utilizationState)
  };
}

function nodeBandwidthUtilizationTone(state: NodeBandwidthUtilizationState): MetricTone {
  if (state === "critical") return "danger";
  if (state === "warning") return "warning";
  if (state === "normal") return "success";
  return "info";
}

function formatNodeBandwidthBps(value: number) {
  if (!Number.isFinite(value) || value <= 0) {
    return "0 bps";
  }

  const units = ["bps", "Kbps", "Mbps", "Gbps", "Tbps"];
  let scaled = value;
  let unitIndex = 0;
  while (scaled >= 1000 && unitIndex < units.length - 1) {
    scaled /= 1000;
    unitIndex += 1;
  }

  return `${formatCompactNumber(scaled)} ${units[unitIndex]}`;
}

function formatNodeBandwidthBytes(value: number) {
  if (!Number.isFinite(value) || value <= 0) {
    return "0 B";
  }

  const units = ["B", "KB", "MB", "GB", "TB"];
  let scaled = value;
  let unitIndex = 0;
  while (scaled >= 1024 && unitIndex < units.length - 1) {
    scaled /= 1024;
    unitIndex += 1;
  }

  return `${formatCompactNumber(scaled)} ${units[unitIndex]}`;
}

function formatCompactNumber(value: number) {
  if (value >= 100 || Number.isInteger(value)) {
    return value.toFixed(0);
  }
  if (value >= 10) {
    return value.toFixed(1);
  }
  return value.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
}

function clampPercent(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value)));
}

function formatNodeObservedAt(value: string | null) {
  if (!value) return "Not observed";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toISOString().replace("T", " ").slice(0, 16);
}

function createOrderManagementPageConfigFromPortalAccessRequests(
  requests: readonly PortalAccessRequestSummary[],
  pageInfo?: AdminListPageInfo,
  onPageChange?: (page: number) => void | Promise<void>,
  usageMonitor?: SubscriptionUsageMonitor
): OrderManagementPageConfig {
  const pageSize = pageInfo?.limit ?? ORDER_MANAGEMENT_PAGE_CONFIG.pagination.pageSize;
  const currentPage = pageInfo ? Math.floor(pageInfo.offset / Math.max(1, pageSize)) + 1 : undefined;
  return {
    ...ORDER_MANAGEMENT_PAGE_CONFIG,
    pagination: {
      ...ORDER_MANAGEMENT_PAGE_CONFIG.pagination,
      currentPage,
      displayTotalRows: pageInfo?.totalRows ?? requests.length,
      onPageChange,
      pageSize,
      totalRows: pageInfo?.totalRows
    },
    usageSummary: orderManagementUsageSummary(requests, usageMonitor),
    rows: requests.map((request) => {
      const status = portalAccessRequestStatusLabel(request.status);
      const lifecycle = portalAccessRequestLifecycleLabel(request.nextAction);
      const delivery = portalAccessRequestDeliveryLabel(request.status);
      return createOrderManagementRow({
        accountRef: request.portalUserRef,
        assignedQuota: portalAccessRequestQuotaLabel(request),
        delivery,
        deliveryTone: portalAccessRequestDeliveryTone(request.status),
        id: request.id,
        lifecycle,
        lifecycleTone: portalAccessRequestLifecycleTone(request.nextAction),
        orderId: request.id,
        planLevel: request.planLabel,
        status,
        statusTone: portalAccessRequestStatusTone(request.status),
        usageEvidence: orderManagementUsageEvidenceForRequest(request, usageMonitor)
      });
    })
  };
}

function orderManagementUsageSummary(
  requests: readonly PortalAccessRequestSummary[],
  usageMonitor?: SubscriptionUsageMonitor
): OrderManagementUsageSummary {
  const monitorUsage = usageMonitor?.aggregates.usage;
  const totalUsedBytes = typeof monitorUsage?.totalUsedBytes === "number"
    ? monitorUsage.totalUsedBytes
    : requests.reduce((sum, request) => sum + safeUsageBytes(request.usage?.usedBytes), 0);
  const measuredOrders = typeof monitorUsage?.measuredOrders === "number"
    ? monitorUsage.measuredOrders
    : requests.filter((request) => request.usage?.collectionStatus === "measured").length;
  const totalOrders = pageSafeTotal(requests, usageMonitor);
  return {
    measuredOrders,
    pendingOrders: Math.max(0, totalOrders - measuredOrders),
    sourceLabel: usageMonitor?.safety.userAggregatedRows
      ? "Billing orders + user usage aggregates"
      : "Billing orders",
    totalOrders,
    totalUsedLabel: formatOrderBytes(totalUsedBytes),
    userAggregateCount: usageMonitor?.userAggregates?.length ?? 0
  };
}

function pageSafeTotal(
  requests: readonly PortalAccessRequestSummary[],
  usageMonitor?: SubscriptionUsageMonitor
) {
  if (typeof usageMonitor?.aggregates.total === "number" && usageMonitor.aggregates.total > 0) {
    return usageMonitor.aggregates.total;
  }
  return requests.length;
}

function orderManagementUsageEvidenceForRequest(
  request: PortalAccessRequestSummary,
  usageMonitor?: SubscriptionUsageMonitor
): OrderManagementUsageEvidence {
  const usageRow = usageMonitor?.items.find((item) => (
    item.issuanceRequestId === request.id ||
    item.portalUserRef === request.portalUserRef ||
    item.accountId === request.portalUserRef
  ));
  const userAggregate = usageMonitor?.userAggregates?.find((aggregate) => (
    aggregate.portalUserRef === request.portalUserRef ||
    aggregate.accountId === request.portalUserRef ||
    aggregate.accountId === usageRow?.accountId ||
    aggregate.portalUserRef === usageRow?.portalUserRef
  ));
  const usedBytes = safeUsageBytes(usageRow?.usedBytes ?? request.usage?.usedBytes);
  const uploadBytes = safeUsageBytes(usageRow?.uploadBytes ?? request.usage?.uploadBytes);
  const downloadBytes = safeUsageBytes(usageRow?.downloadBytes ?? request.usage?.downloadBytes);
  const limitBytes = safeUsageBytes(usageRow?.trafficLimitBytes ?? request.trafficLimitBytes ?? request.usage?.totalBytes);
  const collectionStatus = usageRow?.collectionStatus ?? request.usage?.collectionStatus ?? "not_collected";
  const lastObservedAt = usageRow?.lastUsageObservedAt ?? request.usage?.updatedAt ?? userAggregate?.lastUsageObservedAt ?? null;
  const ratio = usageRatioLabel(usedBytes, limitBytes, request.usage?.usageRatio);

  return {
    collectionLabel: titleCaseSafe(collectionStatus),
    collectionTone: usageCollectionTone(collectionStatus),
    lastObservedLabel: formatOrderUsageDate(lastObservedAt),
    orderCountLabel: userAggregate
      ? `${userAggregate.orderCount} orders · ${userAggregate.measuredOrders} measured`
      : "1 order",
    sourceLabel: usageRow
      ? "Usage monitor order row"
      : userAggregate
        ? "User aggregate fallback"
        : request.usage
          ? "Order usage summary"
          : "No usage evidence",
    uploadDownloadLabel: `${formatOrderBytes(uploadBytes)} up / ${formatOrderBytes(downloadBytes)} down`,
    usageRatioLabel: ratio,
    userTotalLabel: userAggregate
      ? `${formatOrderBytes(userAggregate.usedBytes)} user total`
      : "No user aggregate",
    usedLimitLabel: limitBytes > 0
      ? `${formatOrderBytes(usedBytes)} / ${formatOrderBytes(limitBytes)}`
      : `${formatOrderBytes(usedBytes)} / unmetered`
  };
}

function portalAccessRequestStatusLabel(status: PortalAccessRequestSummary["status"]) {
  switch (status) {
    case "pending_admin_review":
      return "Pending";
    case "approved_pending_delivery":
      return "Approved";
    case "delivered":
      return "Delivered";
    case "rejected":
      return "Rejected";
    case "cancelled":
      return "Cancelled";
    case "expired":
      return "Expired";
    case "revoked":
      return "Revoked";
    default:
      return titleCaseSafe(status);
  }
}

function portalAccessRequestStatusTone(status: PortalAccessRequestSummary["status"]): MetricTone {
  if (status === "delivered") return "success";
  if (status === "pending_admin_review" || status === "approved_pending_delivery") return "warning";
  return "danger";
}

function portalAccessRequestLifecycleLabel(nextAction: string) {
  switch (nextAction) {
    case "admin_review_required":
      return "Admin Review";
    case "admin_delivery_required":
      return "Delivery";
    case "user_can_use_access":
      return "Active";
    case "request_closed":
      return "Closed";
    default:
      return titleCaseSafe(nextAction);
  }
}

function portalAccessRequestLifecycleTone(nextAction: string): MetricTone {
  if (nextAction === "user_can_use_access") return "success";
  if (nextAction === "request_closed") return "danger";
  return "warning";
}

function portalAccessRequestDeliveryLabel(status: PortalAccessRequestSummary["status"]) {
  switch (status) {
    case "delivered":
      return "Delivered";
    case "approved_pending_delivery":
      return "Queued";
    case "pending_admin_review":
      return "Not Delivered";
    default:
      return "Blocked";
  }
}

function portalAccessRequestDeliveryTone(status: PortalAccessRequestSummary["status"]): MetricTone {
  if (status === "delivered") return "success";
  if (status === "approved_pending_delivery" || status === "pending_admin_review") return "warning";
  return "danger";
}

function portalAccessRequestQuotaLabel(request: PortalAccessRequestSummary) {
  const byteLimit = request.trafficLimitBytes ?? request.usage?.totalBytes;
  if (typeof byteLimit === "number" && Number.isFinite(byteLimit) && byteLimit > 0) {
    return formatOrderBytes(byteLimit);
  }
  return `${request.durationDays} days`;
}

function safeUsageBytes(value: unknown) {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : 0;
}

function usageRatioLabel(usedBytes: number, limitBytes: number, sourceRatio?: number) {
  if (limitBytes > 0) {
    return `${clampPercent((usedBytes / limitBytes) * 100)}% of limit`;
  }
  if (typeof sourceRatio === "number" && Number.isFinite(sourceRatio) && sourceRatio > 0) {
    return `${clampPercent(sourceRatio * 100)}% reported`;
  }
  if (usedBytes > 0) {
    return "Measured unmetered";
  }
  return "No measured usage";
}

function usageCollectionTone(status: string): MetricTone {
  if (status === "measured") return "success";
  if (status === "measured_zero") return "info";
  if (status === "stale") return "warning";
  if (status === "collector_disabled" || status === "not_collected") return "warning";
  return "neutral";
}

function formatOrderUsageDate(value: string | null | undefined) {
  if (!value) return "Not observed";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toISOString().replace("T", " ").slice(0, 16);
}

function formatOrderBytes(bytes: number) {
  const gib = bytes / 1024 / 1024 / 1024;
  if (gib >= 1) {
    return `${Number.isInteger(gib) ? gib.toFixed(0) : gib.toFixed(1)} GB`;
  }
  const mib = bytes / 1024 / 1024;
  if (mib >= 1) {
    return `${Number.isInteger(mib) ? mib.toFixed(0) : mib.toFixed(1)} MB`;
  }
  return `${bytes} B`;
}

function titleCaseSafe(value: string) {
  return value
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

function AdminUserManagementReadPage({
  config,
  lifecycle,
  onQueryChange,
  query,
  tableState
}: {
  config: UserManagementPageConfig;
  lifecycle?: UserManagementLifecycleHandlers;
  onQueryChange: (query: UserManagementSafeReadQuery) => void;
  query: UserManagementSafeReadQuery;
  tableState?: DataTableState;
}) {
  const title = pageTitles.userManagement;
  const visibleRows = applyUserManagementSafeReadQuery(config.rows, query);
  const activeQuery = hasActiveUserManagementQuery(query);
  const visibleConfig: UserManagementPageConfig = {
    ...config,
    pagination: {
      ...config.pagination,
      displayTotalRows: activeQuery ? visibleRows.length : config.pagination.displayTotalRows
    },
    rows: visibleRows
  };
  const hasRows = visibleRows.length > 0;
  const [selectedRowId, setSelectedRowId] = useState<string>(config.rows[0]?.id ?? "");
  const [activeLifecycleOperation, setActiveLifecycleOperation] = useState<UserManagementLifecycleOperation | null>(null);
  const [inlineEditDisplayName, setInlineEditDisplayName] = useState("");
  const [inlineEditError, setInlineEditError] = useState("");
  const [inlineEditState, setInlineEditState] = useState<"idle" | "submitting" | "submitted" | "error">("idle");
  const [inlineEditStatus, setInlineEditStatus] = useState("active");
  const creatingUser = activeLifecycleOperation === "create";
  const selectedRow = creatingUser ? null : visibleRows.find((row) => row.id === selectedRowId) ?? visibleRows[0];
  const statusOptions = orderedFilterOptions(config.rows.map((row) => row.status), ["Active", "Pending", "Disabled", "Locked", "Review"]);
  const riskOptions = orderedFilterOptions(config.rows.map((row) => row.risk), ["Low", "Medium", "High"]);
  const planOptions = orderedFilterOptions(config.rows.map((row) => row.plan), ["Pilot", "Pro", "Team", "No Plan"]);
  const accountActionGates = config.actionGates.filter(isUserManagementDryRunAction);
  const inlineEditing = Boolean(activeLifecycleOperation === "update" && selectedRow);

  useEffect(() => {
    if (visibleRows.length > 0 && !visibleRows.some((row) => row.id === selectedRowId)) {
      setSelectedRowId(visibleRows[0].id);
    }
  }, [selectedRowId, visibleRows]);

  useEffect(() => {
    if (activeLifecycleOperation !== "update" || !selectedRow) {
      setInlineEditState("idle");
      setInlineEditError("");
      return;
    }
    setInlineEditDisplayName(selectedRow.displayName);
    setInlineEditStatus(userManagementLifecycleStatusValue(selectedRow.status));
    setInlineEditState("idle");
    setInlineEditError("");
  }, [
    activeLifecycleOperation,
    selectedRow?.displayName,
    selectedRow?.status,
    selectedRow?.userId
  ]);

  async function submitInlineEdit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedRow) {
      return;
    }
    if (!lifecycle) {
      setInlineEditState("submitted");
      return;
    }

    setInlineEditState("submitting");
    setInlineEditError("");
    try {
      await lifecycle.update(selectedRow.userId, {
        approvalRef: "approval_local_user_lifecycle",
        displayName: inlineEditDisplayName,
        operatorRef: "operator_local_admin",
        reason: "local_admin_user_lifecycle",
        status: inlineEditStatus
      });
      setInlineEditState("submitted");
    } catch (caught) {
      setInlineEditState("error");
      setInlineEditError(caught instanceof Error ? caught.message : "Lifecycle request failed");
    }
  }

  function renderUserManagementDetailField(field: NodeHealthField) {
    if (inlineEditing && field.label === "Display Name") {
      return (
        <input
          aria-label="Display Name"
          autoComplete="off"
          onChange={(event) => setInlineEditDisplayName(event.target.value)}
          required
          value={inlineEditDisplayName}
        />
      );
    }
    if (inlineEditing && field.label === "Status") {
      return (
        <select
          aria-label="Status"
          onChange={(event) => setInlineEditStatus(event.target.value)}
          value={inlineEditStatus}
        >
          <option value="active">active</option>
          <option value="pending_review">pending_review</option>
          <option value="suspended">suspended</option>
          <option value="disabled">disabled</option>
        </select>
      );
    }
    return renderUserManagementValue(field);
  }

  function renderUserManagementDetailFields() {
    return (
      <dl>
        {selectedRow?.detail.fields.map((field) => (
          <div className="admin-audit-read-detail-field" key={field.label}>
            <dt>{field.label}</dt>
            <dd>{renderUserManagementDetailField(field)}</dd>
          </div>
        ))}
      </dl>
    );
  }

  function openLifecycleOperation(operation: UserManagementLifecycleOperation) {
    if (operation === "create") {
      setSelectedRowId("");
    }
    setActiveLifecycleOperation(operation);
  }

  function openAccountAction(gate: UserManagementActionGate) {
    if (isUserManagementLifecycleOperation(gate.operation)) {
      openLifecycleOperation(gate.operation);
    }
  }

  return (
    <div
      className="page-stack admin-blueprint-page admin-safe-read-page admin-audit-read-page admin-user-management-read-page"
      data-figma-node-id={config.figmaNodeId}
      data-page="userManagement"
      data-safe-read-state="readonly"
      data-ui-role="user-management-safe-read-page"
    >
      <header className="admin-audit-read-header" aria-label={`${title} header`}>
        <nav className="admin-audit-read-breadcrumb" aria-label={`${title} breadcrumb`}>
          <span>Home</span>
          <span aria-hidden="true">&gt;</span>
          <span>{title}</span>
        </nav>
        <div className="admin-audit-read-actions" aria-label={`${title} gated actions`}>
          <button
            disabled={!lifecycle}
            onClick={() => openLifecycleOperation("create")}
            type="button"
          >
            {lifecycle ? "Create User" : config.actionLabel}
          </button>
        </div>
      </header>

      <section className="admin-audit-read-filter-row" aria-label={`${title} query controls`}>
        <label>
          <span className="sr-only">{title} search</span>
          <input
            autoComplete="off"
            onChange={(event) => onQueryChange({ ...query, search: event.target.value })}
            placeholder={config.queryPlaceholder}
            value={query.search ?? ""}
          />
        </label>
        <button
          onClick={() => onQueryChange({ ...query, status: nextFilterValue(query.status, statusOptions) })}
          type="button"
        >
          {filterButtonLabel("Status", query.status)}
        </button>
        <button
          onClick={() => onQueryChange({ ...query, risk: nextFilterValue(query.risk, riskOptions) })}
          type="button"
        >
          {filterButtonLabel("Risk", query.risk)}
        </button>
        <button
          onClick={() => onQueryChange({ ...query, plan: nextFilterValue(query.plan, planOptions) })}
          type="button"
        >
          {filterButtonLabel("Plan", query.plan)}
        </button>
        <button disabled type="button">Created Time Last 24h</button>
      </section>

      <section className="admin-audit-read-body" aria-label={`${title} table and detail split`}>
        <article
          className="admin-audit-read-table-card admin-user-management-table"
          data-figma-component="UserManagementTableCard"
          data-ui-surface="user-management-table-card"
        >
          <DataTable<UserManagementRow>
            ariaLabel={config.tableAriaLabel}
            className="admin-user-management-read-table"
            columns={userManagementColumns()}
            fixedRowCount={SAFE_READ_TABLE_FIXED_ROW_COUNT}
            getRowKey={(row) => row.id}
            getRowLabel={(row) => `${row.id} ${row.userId} ${row.displayName} ${row.status} ${row.risk}`}
            onRowSelect={(row) => {
              setSelectedRowId(row.id);
              setActiveLifecycleOperation(null);
            }}
            pagination={visibleConfig.pagination}
            rows={visibleConfig.rows}
            state={!hasRows ? {
              description: tableState?.description ?? "No safe account summaries matched this read-only query state.",
              title: tableState?.title ?? "No user accounts available",
              tone: tableState?.tone ?? "empty"
            } : undefined}
            selectedRowKey={selectedRow?.id ?? null}
          />
        </article>

        <aside
          aria-label={config.detailAriaLabel}
          className="admin-audit-read-detail-panel admin-user-management-detail-panel"
          data-figma-component="DetailPanel"
          data-ui-surface="user-management-detail-panel"
        >
          <header>
            <h2>{creatingUser ? "Create user" : selectedRow ? "User Details" : "No user selected"}</h2>
          </header>
          {creatingUser && lifecycle ? (
            <UserManagementLifecyclePanel
              lifecycle={lifecycle}
              onClose={() => setActiveLifecycleOperation(null)}
              operation="create"
              row={null}
            />
          ) : selectedRow ? (
            <>
              {inlineEditing ? (
                <form
                  aria-label="User Management inline edit form"
                  className="admin-user-management-inline-edit-form"
                  onSubmit={submitInlineEdit}
                >
                  {renderUserManagementDetailFields()}
                  {inlineEditState === "submitted" ? (
                    <p className="admin-user-management-lifecycle-state">
                      {lifecycle ? "Local lifecycle submitted." : "Preview only. Backend submit is locked."}
                    </p>
                  ) : null}
                  {inlineEditState === "error" ? (
                    <p className="admin-user-management-lifecycle-state" data-tone="danger">{inlineEditError}</p>
                  ) : null}
                  <div className="admin-user-management-dry-run-actions">
                    <button disabled={inlineEditState === "submitting"} type="submit">
                      {lifecycle ? "Submit edit" : "Preview edit"}
                    </button>
                    <button onClick={() => setActiveLifecycleOperation(null)} type="button">Close</button>
                  </div>
                </form>
              ) : renderUserManagementDetailFields()}
              <section className="admin-user-management-crud-gates" aria-label="Selected user account dry-run actions">
                <h3>Account Actions</h3>
                {accountActionGates.map((gate) => (
                  <button
                    className="admin-user-management-crud-action"
                    data-operation={gate.operation}
                    key={gate.id}
                    onClick={() => openAccountAction(gate)}
                    type="button"
                  >
                    {userManagementAccountActionLabel(gate)}
                  </button>
                ))}
              </section>
              {!lifecycle && activeLifecycleOperation && activeLifecycleOperation !== "update" ? (
                <section className="admin-user-management-inline-action-state" aria-label="User Management inline action state">
                  <strong>{userManagementLifecycleTitle(activeLifecycleOperation)}</strong>
                  <span>{selectedRow.userId}</span>
                  <span>Preview only. Backend submit is locked.</span>
                  <button onClick={() => setActiveLifecycleOperation(null)} type="button">Close</button>
                </section>
              ) : null}
            </>
          ) : (
            <p>{tableState?.description ?? "No safe account summary is available for this page state."}</p>
          )}
          {lifecycle && activeLifecycleOperation && !creatingUser ? (
            activeLifecycleOperation === "update" ? null : (
              <UserManagementLifecyclePanel
                lifecycle={lifecycle}
                onClose={() => setActiveLifecycleOperation(null)}
                operation={activeLifecycleOperation}
                row={selectedRow ?? null}
              />
            )
          ) : null}
        </aside>
      </section>
    </div>
  );
}

function UserManagementLifecyclePanel({
  lifecycle,
  onClose,
  operation,
  row
}: {
  lifecycle: UserManagementLifecycleHandlers;
  onClose: () => void;
  operation: UserManagementLifecycleOperation;
  row: UserManagementRow | null;
}) {
  const [organization, setOrganization] = useState("");
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [status, setStatus] = useState("active");
  const [submitState, setSubmitState] = useState<"idle" | "submitting" | "submitted" | "error">("idle");
  const [error, setError] = useState("");
  const [createResult, setCreateResult] = useState<PlatformAccountMutationResult | null>(null);
  const [deletePreview, setDeletePreview] = useState<UserManagementDeletionPreview | null>(null);
  const approvalRef = "approval_local_user_lifecycle";
  const needsSelectedRow = operation !== "create";
  const operatorRef = "operator_local_admin";
  const reason = "local_admin_user_lifecycle";

  useEffect(() => {
    setOrganization("");
    setEmail("");
    setDisplayName(operation === "create" ? "" : row?.displayName ?? "");
    setStatus(operation === "create" ? "active" : userManagementLifecycleStatusValue(row?.status));
    setSubmitState("idle");
    setError("");
    setCreateResult(null);
    setDeletePreview(null);
  }, [operation, row?.displayName, row?.status, row?.userId]);

  async function submitLifecycle(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (needsSelectedRow && !row) {
      setSubmitState("error");
      setError("No user selected");
      return;
    }

    setSubmitState("submitting");
    setError("");
    try {
      if (operation === "create") {
        const result = await lifecycle.create({
          approvalRef,
          displayName,
          email,
          operatorRef,
          organization,
          reason,
          status
        });
        setCreateResult(result);
      } else if (operation === "update" && row) {
        await lifecycle.update(row.userId, {
          approvalRef,
          displayName,
          operatorRef,
          reason,
          status
        });
      } else if (operation === "disable" && row) {
        await lifecycle.disable(row.userId, {
          approvalRef,
          operatorRef,
          reason
        });
      } else if (operation === "delete" && row) {
        const preview = await lifecycle.previewDelete(row.userId, {
          approvalRef,
          operatorRef,
          reason
        });
        setDeletePreview(preview);
      }
      setSubmitState("submitted");
    } catch (caught) {
      setSubmitState("error");
      setError(caught instanceof Error ? caught.message : "Lifecycle request failed");
    }
  }

  return (
    <form
      aria-label="User Management lifecycle panel"
      className="admin-user-management-dry-run-panel admin-user-management-lifecycle-panel"
      onSubmit={submitLifecycle}
    >
      <header>
        <h3>{userManagementLifecycleTitle(operation)}</h3>
        <StatusChip label={operation === "delete" ? "Preview" : "Local"} tone={operation === "delete" ? "warning" : "info"} />
      </header>
      {operation === "create" && createResult?.initialCredential ? (
        <section className="admin-user-management-lifecycle-preview" aria-label="User Management initial credential handoff">
          <strong>Initial password</strong>
          <code>{createResult.initialCredential.initialPassword}</code>
          <span>Visible once for this local admin-created test user.</span>
          <span>{createResult.initialCredential.accountId}</span>
        </section>
      ) : null}
      {needsSelectedRow && !row ? <p>No user selected</p> : null}
      <div className="admin-user-management-lifecycle-fields">
        {operation === "create" ? (
          <>
            <label>
              <span>Organization</span>
              <input
                autoComplete="off"
                onChange={(event) => setOrganization(event.target.value)}
                required
                value={organization}
              />
            </label>
            <label>
              <span>Email</span>
              <input
                autoComplete="off"
                onChange={(event) => setEmail(event.target.value)}
                required
                type="email"
                value={email}
              />
            </label>
          </>
        ) : null}
        {operation === "create" || operation === "update" ? (
          <>
            <label>
              <span>Display Name</span>
              <input
                autoComplete="off"
                onChange={(event) => setDisplayName(event.target.value)}
                required
                value={displayName}
              />
            </label>
            <label>
              <span>Status</span>
              <select onChange={(event) => setStatus(event.target.value)} value={status}>
                <option value="active">active</option>
                <option value="pending_review">pending_review</option>
                <option value="suspended">suspended</option>
                <option value="disabled">disabled</option>
              </select>
            </label>
          </>
        ) : null}
      </div>
      {deletePreview ? (
        <section className="admin-user-management-lifecycle-preview" aria-label="User Management delete preview">
          <strong>Physical delete blocked</strong>
          <span>{deletePreview.nextAction}</span>
        </section>
      ) : null}
      {submitState === "submitted" && !deletePreview ? (
        <p className="admin-user-management-lifecycle-state">Local lifecycle submitted.</p>
      ) : null}
      {submitState === "error" ? (
        <p className="admin-user-management-lifecycle-state" data-tone="danger">{error}</p>
      ) : null}
      <div className="admin-user-management-dry-run-actions">
        <button disabled={submitState === "submitting" || (needsSelectedRow && !row)} type="submit">
          {userManagementLifecycleSubmitLabel(operation)}
        </button>
        <button onClick={onClose} type="button">Close</button>
      </div>
    </form>
  );
}

function AdminOrderManagementReadPage({
  config,
  lifecycle
}: {
  config: OrderManagementPageConfig;
  lifecycle?: OrderManagementLifecycleHandlers;
}) {
  const title = pageTitles.orderManagement;
  const [selectedRowId, setSelectedRowId] = useState<string>(config.rows[0]?.id ?? "");
  const [activeOperation, setActiveOperation] = useState<OrderManagementOperation | null>(null);
  const selectedRow = config.rows.find((row) => row.id === selectedRowId) ?? config.rows[0];

  useEffect(() => {
    setActiveOperation(null);
  }, [selectedRowId]);

  return (
    <div
      className="page-stack admin-blueprint-page admin-safe-read-page admin-audit-read-page admin-order-management-read-page"
      data-figma-node-id={config.figmaNodeId}
      data-page="orderManagement"
      data-safe-read-state="readonly"
      data-ui-role="order-management-safe-read-page"
    >
      <header className="admin-audit-read-header" aria-label={`${title} header`}>
        <nav className="admin-audit-read-breadcrumb" aria-label={`${title} breadcrumb`}>
          <span>Home</span>
          <span aria-hidden="true">&gt;</span>
          <span>{title}</span>
        </nav>
        <div className="admin-audit-read-actions" aria-label={`${title} gated actions`}>
          <button disabled type="button">{config.actionLabel}</button>
        </div>
      </header>

      <section className="admin-audit-read-filter-row" aria-label={`${title} query controls`}>
        <label>
          <span className="sr-only">{title} search</span>
          <input disabled readOnly value={config.queryPlaceholder} />
        </label>
        {config.filters.map((filter) => (
          <button disabled key={filter} type="button">{filter}</button>
        ))}
      </section>

      <section className="admin-audit-read-body" aria-label={`${title} table and detail split`}>
        <article
          className="admin-audit-read-table-card admin-order-management-table"
          data-figma-component="OrderManagementTableCard"
          data-ui-surface="order-management-table-card"
        >
          <DataTable<OrderManagementRow>
            ariaLabel={config.tableAriaLabel}
            className="admin-order-management-read-table"
            columns={orderManagementColumns()}
            fixedRowCount={SAFE_READ_TABLE_FIXED_ROW_COUNT}
            getRowKey={(row) => row.id}
            getRowLabel={(row) => `${row.id} ${row.orderId} ${row.accountRef} ${row.status} ${row.lifecycle} ${row.delivery}`}
            onRowSelect={(row) => setSelectedRowId(row.id)}
            pagination={config.pagination}
            rows={config.rows}
            selectedRowKey={selectedRow?.id ?? null}
          />
        </article>

        <aside
          aria-label={config.detailAriaLabel}
          className="admin-audit-read-detail-panel admin-order-management-detail-panel"
          data-figma-component="DetailPanel"
          data-ui-surface="order-management-detail-panel"
        >
          <header>
            <h2>Order Details</h2>
          </header>
          <dl>
            {selectedRow.detail.fields.map((field) => (
              <div className="admin-audit-read-detail-field" key={field.label}>
                <dt>{field.label}</dt>
                <dd>{renderOrderManagementValue(field)}</dd>
              </div>
            ))}
          </dl>
          <section className="admin-order-management-actions" aria-label="Order Management gated evidence handoffs">
            <button
              disabled={!lifecycle || !selectedRow}
              onClick={() => setActiveOperation("approval-preview")}
              type="button"
            >
              Approve Preview
            </button>
            <button
              disabled={!lifecycle || !selectedRow || selectedRow?.delivery !== "Delivered"}
              onClick={() => setActiveOperation("traffic-limit")}
              type="button"
            >
              Set Traffic Limit
            </button>
            <button disabled type="button">Delivery Handoff · Gated</button>
            <button disabled type="button">View Quota Architecture</button>
          </section>
          {selectedRow ? (
            <OrderManagementUsageEvidencePanel
              summary={config.usageSummary}
              usageEvidence={selectedRow.usageEvidence}
            />
          ) : null}
          {activeOperation && selectedRow && lifecycle ? (
            <AdminOrderManagementOperationPanel
              lifecycle={lifecycle}
              operation={activeOperation}
              row={selectedRow}
              onClose={() => setActiveOperation(null)}
            />
          ) : null}
        </aside>
      </section>
    </div>
  );
}

function OrderManagementUsageEvidencePanel({
  summary,
  usageEvidence
}: {
  summary: OrderManagementUsageSummary;
  usageEvidence: OrderManagementUsageEvidence;
}) {
  return (
    <section
      aria-label="Order Management usage evidence"
      className="admin-order-management-usage-evidence"
      data-ui-surface="order-management-usage-evidence"
    >
      <header>
        <h3>Usage & Billing Evidence</h3>
        <StatusChip label={usageEvidence.collectionLabel} tone={usageEvidence.collectionTone} />
      </header>
      <dl>
        <div>
          <dt>Order Usage</dt>
          <dd>{usageEvidence.usedLimitLabel}</dd>
        </div>
        <div>
          <dt>Upload / Download</dt>
          <dd>{usageEvidence.uploadDownloadLabel}</dd>
        </div>
        <div>
          <dt>Usage Ratio</dt>
          <dd>{usageEvidence.usageRatioLabel}</dd>
        </div>
        <div>
          <dt>User Aggregate</dt>
          <dd>{usageEvidence.userTotalLabel}</dd>
        </div>
        <div>
          <dt>Orders</dt>
          <dd>{usageEvidence.orderCountLabel}</dd>
        </div>
        <div>
          <dt>Last Observed</dt>
          <dd>{usageEvidence.lastObservedLabel}</dd>
        </div>
        <div>
          <dt>Evidence Source</dt>
          <dd>{usageEvidence.sourceLabel}</dd>
        </div>
        <div>
          <dt>Ledger Summary</dt>
          <dd>{summary.measuredOrders}/{summary.totalOrders} measured · {summary.totalUsedLabel}</dd>
        </div>
        <div>
          <dt>User Rows</dt>
          <dd>{summary.userAggregateCount} aggregates · {summary.sourceLabel}</dd>
        </div>
      </dl>
    </section>
  );
}

function AdminOrderManagementOperationPanel({
  lifecycle,
  operation,
  onClose,
  row
}: {
  lifecycle: OrderManagementLifecycleHandlers;
  operation: OrderManagementOperation;
  onClose: () => void;
  row: OrderManagementRow;
}) {
  const [approvalRef, setApprovalRef] = useState("approval_local_order_lifecycle");
  const [nodeId, setNodeId] = useState("channel-lab-b-tuic");
  const [operatorRef, setOperatorRef] = useState("operator_local_admin");
  const [reasonCode, setReasonCode] = useState("local_order_quota_review");
  const [submitState, setSubmitState] = useState<"idle" | "submitting" | "submitted" | "error">("idle");
  const [trafficLimitGb, setTrafficLimitGb] = useState(defaultTrafficLimitGb(row.assignedQuota));
  const [statusMessage, setStatusMessage] = useState("");

  useEffect(() => {
    setApprovalRef("approval_local_order_lifecycle");
    setNodeId("channel-lab-b-tuic");
    setOperatorRef("operator_local_admin");
    setReasonCode("local_order_quota_review");
    setSubmitState("idle");
    setTrafficLimitGb(defaultTrafficLimitGb(row.assignedQuota));
    setStatusMessage("");
  }, [operation, row.assignedQuota, row.orderId]);

  async function submitOrderOperation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitState("submitting");
    setStatusMessage("");

    try {
      if (operation === "approval-preview") {
        await lifecycle.previewApproval(row.orderId, {
          approvalRef,
          nodeId,
          reviewedByRef: operatorRef
        });
        setStatusMessage("Approval preview ready.");
      } else {
        await lifecycle.updateTrafficLimit(row.orderId, {
          reasonCode,
          reviewedByRef: operatorRef,
          trafficLimitBytes: trafficLimitBytesFromGb(trafficLimitGb)
        });
        setStatusMessage("Traffic limit submitted.");
      }
      setSubmitState("submitted");
    } catch (caught) {
      setSubmitState("error");
      setStatusMessage(caught instanceof Error ? caught.message : "Order operation failed");
    }
  }

  const approvalPreview = operation === "approval-preview";

  return (
    <form
      aria-label="Order Management operation panel"
      className="admin-user-management-dry-run-panel admin-order-management-operation-panel"
      onSubmit={submitOrderOperation}
    >
      <header>
        <h3>{approvalPreview ? "Approval preview" : "Traffic limit"}</h3>
        <StatusChip label={approvalPreview ? "Preview" : "Local"} tone={approvalPreview ? "warning" : "info"} />
      </header>
      <div className="admin-user-management-lifecycle-fields">
        <label>
          <span>Operator Ref</span>
          <input
            autoComplete="off"
            onChange={(event) => setOperatorRef(event.target.value)}
            required
            value={operatorRef}
          />
        </label>
        {approvalPreview ? (
          <>
            <label>
              <span>Approval Ref</span>
              <input
                autoComplete="off"
                onChange={(event) => setApprovalRef(event.target.value)}
                required
                value={approvalRef}
              />
            </label>
            <label>
              <span>Node Ref</span>
              <input
                autoComplete="off"
                onChange={(event) => setNodeId(event.target.value)}
                required
                value={nodeId}
              />
            </label>
          </>
        ) : (
          <>
            <label>
              <span>Traffic Limit GB</span>
              <input
                min="0"
                onChange={(event) => setTrafficLimitGb(event.target.value)}
                required
                type="number"
                value={trafficLimitGb}
              />
            </label>
            <label>
              <span>Reason Code</span>
              <input
                autoComplete="off"
                onChange={(event) => setReasonCode(event.target.value)}
                required
                value={reasonCode}
              />
            </label>
          </>
        )}
      </div>
      {statusMessage ? (
        <p className="admin-user-management-lifecycle-state" data-tone={submitState === "error" ? "danger" : "info"}>
          {statusMessage}
        </p>
      ) : null}
      <div className="admin-user-management-dry-run-actions">
        <button disabled={submitState === "submitting"} type="submit">
          {approvalPreview ? "Run approval preview" : "Submit traffic limit"}
        </button>
        <button onClick={onClose} type="button">Close</button>
      </div>
    </form>
  );
}

function defaultTrafficLimitGb(assignedQuota: string) {
  const match = assignedQuota.match(/(\d+(?:\.\d+)?)\s*GB/i);
  return match?.[1] ?? "20";
}

function trafficLimitBytesFromGb(value: string) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error("Traffic limit must be a non-negative number");
  }
  return Math.round(parsed * 1024 * 1024 * 1024);
}

function AdminNodeHealthReadPage({
  config
}: {
  config: NodeHealthPageConfig;
}) {
  const title = pageTitles.nodeHealth;
  const [selectedRowId, setSelectedRowId] = useState<string>(config.rows[0]?.id ?? "");
  const selectedRow = config.rows.find((row) => row.id === selectedRowId) ?? config.rows[0];

  return (
    <div
      className="page-stack admin-blueprint-page admin-safe-read-page admin-audit-read-page admin-node-health-read-page"
      data-figma-node-id={config.figmaNodeId}
      data-page="nodeHealth"
      data-safe-read-state="readonly"
      data-ui-role="node-health-safe-read-page"
    >
      <header className="admin-audit-read-header" aria-label={`${title} header`}>
        <nav className="admin-audit-read-breadcrumb" aria-label={`${title} breadcrumb`}>
          <span>Home</span>
          <span aria-hidden="true">&gt;</span>
          <span>{title}</span>
        </nav>
        <div className="admin-audit-read-actions" aria-label={`${title} gated actions`}>
          <button disabled type="button">{config.actionLabel}</button>
          <button disabled type="button">{config.exportLabel}</button>
        </div>
      </header>

      <section className="admin-audit-read-filter-row" aria-label={`${title} query controls`}>
        <label>
          <span className="sr-only">{title} search</span>
          <input disabled readOnly value={config.queryPlaceholder} />
        </label>
        {config.filters.map((filter) => (
          <button disabled key={filter} type="button">{filter}</button>
        ))}
      </section>

      <section className="admin-audit-read-body" aria-label={`${title} table and detail split`}>
        <article
          className="admin-audit-read-table-card admin-node-health-table"
          data-figma-component="HealthTableCard"
          data-ui-surface="node-health-table-card"
        >
          <DataTable<NodeHealthRow>
            ariaLabel={config.tableAriaLabel}
            className="admin-node-health-read-table"
            columns={nodeHealthColumns()}
            fixedRowCount={SAFE_READ_TABLE_FIXED_ROW_COUNT}
            getRowKey={(row) => row.id}
            getRowLabel={(row) => `${row.id} ${row.nodeId} ${row.region} ${row.status}`}
            onRowSelect={(row) => setSelectedRowId(row.id)}
            pagination={config.pagination}
            rows={config.rows}
            selectedRowKey={selectedRow?.id ?? null}
          />
        </article>

        <aside
          aria-label={config.detailAriaLabel}
          className="admin-audit-read-detail-panel admin-node-health-detail-panel"
          data-figma-component="DetailPanel"
          data-ui-surface="node-health-detail-panel"
        >
          <header>
            <h2>Node Details</h2>
          </header>
          <dl>
            {selectedRow.detail.fields.map((field) => (
              <div className="admin-audit-read-detail-field" key={field.label}>
                <dt>{field.label}</dt>
                <dd>{renderNodeHealthValue(field)}</dd>
              </div>
            ))}
          </dl>
          <section aria-label="Node Health performance summary">
            <h3>Performance</h3>
            <dl className="admin-node-health-performance-list">
              {selectedRow.detail.performance.map((metric) => (
                <div className="admin-audit-read-detail-field" key={metric.label}>
                  <dt>{metric.label}</dt>
                  <dd>{metric.value}</dd>
                </div>
              ))}
            </dl>
          </section>
          <section aria-label="Node Health gated actions">
            <h3>Actions</h3>
            <div className="admin-node-health-actions">
              <button disabled type="button">View Node Logs</button>
              <button disabled type="button">Diagnostics · Gated</button>
            </div>
          </section>
        </aside>
      </section>
    </div>
  );
}

function AdminNodeLogsReadPage({
  config
}: {
  config: NodeLogsPageConfig;
}) {
  const title = pageTitles.nodeLogs;
  const [selectedRowId, setSelectedRowId] = useState<string>(config.rows[0]?.id ?? "");
  const selectedRow = config.rows.find((row) => row.id === selectedRowId) ?? config.rows[0];

  return (
    <div
      className="page-stack admin-blueprint-page admin-safe-read-page admin-audit-read-page admin-node-logs-read-page"
      data-figma-node-id={config.figmaNodeId}
      data-page="nodeLogs"
      data-safe-read-state="readonly"
      data-ui-role="node-logs-safe-read-page"
    >
      <header className="admin-audit-read-header" aria-label={`${title} header`}>
        <nav className="admin-audit-read-breadcrumb" aria-label={`${title} breadcrumb`}>
          <span>Home</span>
          <span aria-hidden="true">&gt;</span>
          <span>{title}</span>
        </nav>
        <div className="admin-audit-read-actions" aria-label={`${title} gated actions`}>
          <button disabled type="button">{config.actionLabel}</button>
          <button disabled type="button">{config.exportLabel}</button>
        </div>
      </header>

      <section className="admin-audit-read-filter-row" aria-label={`${title} query controls`}>
        <label>
          <span className="sr-only">{title} search</span>
          <input disabled readOnly value={config.queryPlaceholder} />
        </label>
        {config.filters.map((filter) => (
          <button disabled key={filter} type="button">{filter}</button>
        ))}
      </section>

      <section className="admin-audit-read-body" aria-label={`${title} table and detail split`}>
        <article
          className="admin-audit-read-table-card admin-node-logs-table"
          data-figma-component="LogTableCard"
          data-ui-surface="node-logs-table-card"
        >
          <DataTable<NodeLogRow>
            ariaLabel={config.tableAriaLabel}
            className="admin-node-logs-read-table"
            columns={nodeLogColumns()}
            fixedRowCount={SAFE_READ_TABLE_FIXED_ROW_COUNT}
            getRowKey={(row) => row.id}
            getRowLabel={(row) => `${row.id} ${row.nodeId} ${row.eventType} ${row.status} ${row.severity}`}
            onRowSelect={(row) => setSelectedRowId(row.id)}
            pagination={config.pagination}
            rows={config.rows}
            selectedRowKey={selectedRow?.id ?? null}
          />
        </article>

        <aside
          aria-label={config.detailAriaLabel}
          className="admin-audit-read-detail-panel admin-node-logs-detail-panel"
          data-figma-component="DetailPanel"
          data-ui-surface="node-logs-detail-panel"
        >
          <header>
            <h2>Log Details</h2>
          </header>
          <dl>
            {selectedRow.detail.fields.map((field) => (
              <div className="admin-audit-read-detail-field" key={field.label}>
                <dt>{field.label}</dt>
                <dd>{renderNodeLogDetailValue(field)}</dd>
              </div>
            ))}
          </dl>
          <section className="admin-node-log-system-note" aria-label="Node Logs system note">
            <h3>System Note</h3>
            <p>{selectedRow.detail.systemNote}</p>
          </section>
        </aside>
      </section>
    </div>
  );
}

function AdminNodeBandwidthReadPage({
  config
}: {
  config: NodeBandwidthPageConfig;
}) {
  const title = pageTitles.nodeBandwidth;
  const [selectedRowId, setSelectedRowId] = useState<string>(config.rows[0]?.id ?? "");
  const selectedRow = config.rows.find((row) => row.id === selectedRowId) ?? config.rows[0];
  const utilizationWidth = selectedRow ? `${selectedRow.utilizationPercent}%` : "0%";

  return (
    <div
      className="page-stack admin-blueprint-page admin-safe-read-page admin-audit-read-page admin-node-bandwidth-read-page"
      data-figma-node-id={config.figmaNodeId}
      data-page="nodeBandwidth"
      data-safe-read-state="readonly"
      data-ui-role="node-bandwidth-safe-read-page"
    >
      <header className="admin-audit-read-header" aria-label={`${title} header`}>
        <nav className="admin-audit-read-breadcrumb" aria-label={`${title} breadcrumb`}>
          <span>Home</span>
          <span aria-hidden="true">&gt;</span>
          <span>{title}</span>
        </nav>
        <div className="admin-audit-read-actions" aria-label={`${title} gated actions`}>
          <button disabled type="button">{config.actionLabel}</button>
          <button disabled type="button">{config.exportLabel}</button>
        </div>
      </header>

      <section className="admin-audit-read-filter-row" aria-label={`${title} query controls`}>
        <label>
          <span className="sr-only">{title} search</span>
          <input disabled readOnly value={config.queryPlaceholder} />
        </label>
        {config.filters.map((filter) => (
          <button disabled key={filter} type="button">{filter}</button>
        ))}
      </section>

      <section className="admin-audit-read-body" aria-label={`${title} table and detail split`}>
        <article
          className="admin-audit-read-table-card admin-node-bandwidth-table"
          data-figma-component="BandwidthTableCard"
          data-ui-surface="node-bandwidth-table-card"
        >
          <DataTable<NodeBandwidthRow>
            ariaLabel={config.tableAriaLabel}
            className="admin-node-bandwidth-read-table"
            columns={nodeBandwidthColumns()}
            fixedRowCount={SAFE_READ_TABLE_FIXED_ROW_COUNT}
            getRowKey={(row) => row.id}
            getRowLabel={(row) => `${row.id} ${row.nodeId} ${row.region} ${row.utilization}`}
            onRowSelect={(row) => setSelectedRowId(row.id)}
            pagination={config.pagination}
            rows={config.rows}
            selectedRowKey={selectedRow?.id ?? null}
          />
        </article>

        <aside
          aria-label={config.detailAriaLabel}
          className="admin-audit-read-detail-panel admin-node-bandwidth-detail-panel"
          data-figma-component="DetailPanel"
          data-ui-surface="node-bandwidth-detail-panel"
        >
          <header>
            <h2>Bandwidth Detail</h2>
            <p>{selectedRow?.nodeId ?? "No node selected"}</p>
          </header>
          {selectedRow ? (
            <dl>
              {selectedRow.detail.fields.map((field) => (
                <div className="admin-audit-read-detail-field" key={field.label}>
                  <dt>{field.label}</dt>
                  <dd>{field.value}</dd>
                </div>
              ))}
            </dl>
          ) : (
            <p>No safe node bandwidth summary is available.</p>
          )}
          <section className="admin-node-bandwidth-util-section" aria-label="Node Bandwidth utilization summary">
            <h3>Utilization</h3>
            <div className="admin-node-bandwidth-util-track" aria-hidden="true">
              <span
                className="admin-node-bandwidth-util-fill"
                data-state-tone={selectedRow?.utilizationTone ?? "neutral"}
                style={{ width: utilizationWidth }}
              />
            </div>
            <p>{selectedRow?.utilization ?? "0%"}</p>
          </section>
          {selectedRow ? (
            <section className="admin-node-bandwidth-traffic-window" aria-label="Node Bandwidth traffic window">
              <h3>Traffic Window</h3>
              <dl>
                {selectedRow.detail.trafficWindow.map((item) => (
                  <div className="admin-audit-read-detail-field" key={item.label}>
                    <dt>{item.label}</dt>
                    <dd>{item.value}</dd>
                  </div>
                ))}
              </dl>
            </section>
          ) : null}
        </aside>
      </section>
    </div>
  );
}

function AdminAuditLogReadPage({
  config,
  page
}: {
  config: AuditLogPageConfig | undefined;
  page: "userAccessLogs" | "userOperationLogs";
}) {
  if (!config) {
    return null;
  }
  const title = pageTitles[page];
  const context = pageContexts[page];
  const usesAccessRules = page === "userAccessLogs";
  const usesOperationRules = page === "userOperationLogs";
  const usesSourceRuleHeader = usesAccessRules || usesOperationRules;
  const [selectedRowId, setSelectedRowId] = useState<string | null>(usesAccessRules ? null : config.rows[0]?.id ?? null);
  const selectedRow = selectedRowId === null
    ? null
    : config.rows.find((row) => row.id === selectedRowId) ?? config.rows[0] ?? null;

  useEffect(() => {
    if (usesAccessRules) {
      setSelectedRowId(null);
      return;
    }

    setSelectedRowId((currentRowId) => {
      if (currentRowId && config.rows.some((row) => row.id === currentRowId)) {
        return currentRowId;
      }

      return config.rows[0]?.id ?? null;
    });
  }, [config.rows, usesAccessRules]);

  return (
    <div
      className="page-stack admin-blueprint-page admin-safe-read-page admin-audit-read-page"
      data-figma-node-id={config.figmaNodeId}
      data-page={page}
      data-safe-read-state="readonly"
      data-ui-role="audit-safe-read-page"
    >
      <header className="admin-audit-read-header" aria-label={`${title} header`}>
        {usesSourceRuleHeader ? (
          <nav className="admin-audit-read-breadcrumb" aria-label={`${title} breadcrumb`}>
            <span>Home</span>
            <span aria-hidden="true">&gt;</span>
            <span>{title}</span>
          </nav>
        ) : (
          <div className="admin-audit-read-title">
            <p>{context.eyebrow}</p>
            <h1>{title}</h1>
          </div>
        )}
        <div className="admin-audit-read-actions" aria-label={`${title} gated actions`}>
          <button disabled type="button">{config.actionLabel}</button>
          <button disabled type="button">{config.exportLabel}</button>
        </div>
      </header>

      <section className="admin-audit-read-filter-row" aria-label={`${title} query controls`}>
        {config.queryPlaceholder ? (
          <label>
            <span className="sr-only">{title} search</span>
            <input disabled readOnly value={config.queryPlaceholder} />
          </label>
        ) : null}
        {config.filters.map((filter) => (
          <button disabled key={filter} type="button">{filter}</button>
        ))}
      </section>

      <section className="admin-audit-read-body" aria-label={`${title} table and detail split`}>
        <article
          className={`admin-audit-read-table-card admin-audit-table-${config.tableMode}`}
          data-figma-component="AuditTableCard"
          data-ui-surface="audit-table-card"
        >
          {usesSourceRuleHeader ? null : (
            <header>
              <h2>{title}</h2>
              <p>Table + Detail split. Rows carry safe refs and redacted evidence summaries only.</p>
            </header>
          )}
          <DataTable<AuditLogRow>
            ariaLabel={config.tableAriaLabel}
            className={`admin-audit-read-table admin-audit-read-table-${config.tableMode}`}
            columns={auditLogColumns(config.tableMode)}
            fixedRowCount={SAFE_READ_TABLE_FIXED_ROW_COUNT}
            getRowKey={(row) => row.id}
            getRowLabel={(row) => `${row.id} ${row.actor} ${row.eventType} ${row.result}`}
            onRowSelect={(row) => setSelectedRowId(row.id)}
            pagination={config.pagination}
            rows={config.rows}
            selectedRowKey={selectedRow?.id ?? null}
          />
        </article>

        {selectedRow || usesAccessRules ? (
          <aside
            aria-label={config.detailAriaLabel}
            className="admin-audit-read-detail-panel"
            data-figma-component="DetailPanel"
            data-ui-surface="audit-detail-panel"
          >
            {selectedRow ? (
              <>
                <header>
                  {usesSourceRuleHeader ? null : <span>Selected event</span>}
                  <h2>{usesOperationRules ? "Log Details" : "Event Detail"}</h2>
                  {usesAccessRules ? <p>{selectedRow.detail.title}</p> : null}
                  {!usesSourceRuleHeader ? <StatusChip label={selectedRow.result} tone={selectedRow.resultTone} /> : null}
                </header>
                {usesOperationRules ? null : <p>{selectedRow.detail.summary}</p>}
                <dl>
                  {selectedRow.detail.fields.map((field) => (
                    <div className="admin-audit-read-detail-field" key={field.label}>
                      <dt>{field.label}</dt>
                      <dd>{field.value}</dd>
                    </div>
                  ))}
                </dl>
                {usesSourceRuleHeader ? null : (
                  <section aria-label={`${title} protected trace summary`}>
                    <h3>Protected Trace</h3>
                    <ul>
                      {selectedRow.detail.protectedTrace.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  </section>
                )}
                {usesSourceRuleHeader ? null : (
                  <PrivilegedGate
                    ariaLabel={`${title} export and privileged detail gate`}
                    className="admin-audit-read-gate"
                    description="Privileged detail and CSV export stay unavailable in this frontend phase."
                    detail={<p>Future access needs a reviewed backend contract, explicit permission gate, and redaction test coverage.</p>}
                    state="unavailable"
                    title="Privileged detail gated"
                  />
                )}
              </>
            ) : (
              <>
                <header>
                  <h2>Event Detail</h2>
                  <p>Select a row to view details</p>
                </header>
                <dl>
                  {["User ID", "Session ID", "Event Type", "Result", "Risk Level", "IP Address", "User Agent", "Timestamp", "Session Duration"].map((label) => (
                    <div className="admin-audit-read-detail-field" key={label}>
                      <dt>{label}</dt>
                      <dd>-</dd>
                    </div>
                  ))}
                </dl>
              </>
            )}
          </aside>
        ) : null}
      </section>
    </div>
  );
}

function nodeHealthColumns(): Array<DataTableColumn<NodeHealthRow>> {
  return [
    { header: "NODE ID", key: "nodeId", render: (row) => <SafeAuditRef>{row.nodeId}</SafeAuditRef> },
    { header: "REGION", key: "region", render: (row) => row.region },
    { header: "TYPE", key: "type", render: (row) => <StatusChip label={row.type} tone={row.typeTone} /> },
    { header: "STATUS", key: "status", render: (row) => <StatusChip label={row.status} tone={row.statusTone} /> },
    { header: "UPTIME", key: "uptime", render: (row) => row.uptime },
    { header: "LAST PING", key: "lastPing", render: (row) => row.lastPing }
  ];
}

function nodeLogColumns(): Array<DataTableColumn<NodeLogRow>> {
  return [
    { header: "TIMESTAMP", key: "timestamp", render: (row) => row.timestamp },
    { header: "NODE ID", key: "nodeId", render: (row) => <SafeAuditRef>{row.nodeId}</SafeAuditRef> },
    { header: "EVENT TYPE", key: "eventType", render: (row) => <StatusChip label={row.eventType} tone={row.eventTone} /> },
    { header: "STATUS", key: "status", render: (row) => <StatusChip label={row.status} tone={row.statusTone} /> },
    { header: "SEVERITY", key: "severity", render: (row) => <StatusChip label={row.severity} tone={row.severityTone} /> },
    { header: "MESSAGE", key: "message", render: (row) => <span className="admin-node-log-message">{row.message}</span> }
  ];
}

function nodeBandwidthColumns(): Array<DataTableColumn<NodeBandwidthRow>> {
  return [
    { header: "NODE ID", key: "nodeId", render: (row) => <SafeAuditRef>{row.nodeId}</SafeAuditRef> },
    { header: "REGION", key: "region", render: (row) => row.region },
    { header: "INBOUND", key: "inbound", render: (row) => row.inbound },
    { header: "OUTBOUND", key: "outbound", render: (row) => row.outbound },
    { header: "PEAK BPS", key: "peakBps", render: (row) => <SafeAuditRef>{row.peakBps}</SafeAuditRef> },
    { header: "UTILIZATION", key: "utilization", render: (row) => <StatusChip label={row.utilization} tone={row.utilizationTone} /> }
  ];
}

function userManagementColumns(): Array<DataTableColumn<UserManagementRow>> {
  return [
    { header: "USER ID", key: "userId", render: (row) => <SafeAuditRef>{row.userId}</SafeAuditRef> },
    { header: "DISPLAY NAME", key: "displayName", render: (row) => row.displayName },
    { header: "EMAIL", key: "email", render: (row) => row.email },
    { header: "PLAN", key: "plan", render: (row) => <StatusChip label={row.plan} tone={row.planTone} /> },
    { header: "STATUS", key: "status", render: (row) => <StatusChip label={row.status} tone={row.statusTone} /> },
    { header: "RISK", key: "risk", render: (row) => <StatusChip label={row.risk} tone={row.riskTone} /> }
  ];
}

function orderManagementColumns(): Array<DataTableColumn<OrderManagementRow>> {
  return [
    { header: "ORDER ID", key: "orderId", render: (row) => <SafeAuditRef>{row.orderId}</SafeAuditRef> },
    { header: "ACCOUNT REF", key: "accountRef", render: (row) => row.accountRef },
    { header: "PLAN", key: "planLevel", render: (row) => row.planLevel },
    { header: "STATUS", key: "status", render: (row) => <StatusChip label={row.status} tone={row.statusTone} /> },
    { header: "LIFECYCLE", key: "lifecycle", render: (row) => <StatusChip label={row.lifecycle} tone={row.lifecycleTone} /> },
    { header: "DELIVERY", key: "delivery", render: (row) => <StatusChip label={row.delivery} tone={row.deliveryTone} /> }
  ];
}

function renderNodeHealthValue(field: NodeHealthField): ReactNode {
  if (field.tone) {
    return <StatusChip label={field.value} tone={field.tone} />;
  }

  return field.value;
}

function renderNodeLogDetailValue(field: NodeHealthField): ReactNode {
  return field.value;
}

function renderUserManagementValue(field: NodeHealthField): ReactNode {
  if (field.tone) {
    return <StatusChip label={field.value} tone={field.tone} />;
  }

  return field.value;
}

function isUserManagementDryRunAction(gate: UserManagementActionGate) {
  return gate.state === "dry-run" && (
    gate.operation === "update" ||
    gate.operation === "delete"
  );
}

function userManagementAccountActionLabel(gate: UserManagementActionGate) {
  if (gate.operation === "update") return "Edit";
  if (gate.operation === "disable") return "Disable";
  if (gate.operation === "delete") return "Delete";
  return gate.label;
}

function isUserManagementLifecycleOperation(
  operation: UserManagementActionGate["operation"]
): operation is UserManagementLifecycleOperation {
  return operation === "create" ||
    operation === "update" ||
    operation === "disable" ||
    operation === "delete";
}

function userManagementLifecycleTitle(operation: UserManagementLifecycleOperation) {
  if (operation === "create") return "Create user";
  if (operation === "update") return "Edit user";
  if (operation === "disable") return "Disable user";
  return "Delete preview";
}

function userManagementLifecycleSubmitLabel(operation: UserManagementLifecycleOperation) {
  if (operation === "create") return "Submit create";
  if (operation === "update") return "Submit edit";
  if (operation === "disable") return "Disable user";
  return "Preview delete";
}

function userManagementLifecycleStatusValue(status: string | undefined) {
  const normalized = status?.trim().toLowerCase() ?? "";
  if (normalized === "active") return "active";
  if (normalized === "pending" || normalized === "review") return "pending_review";
  if (normalized === "disabled") return "disabled";
  if (normalized === "locked" || normalized === "suspended") return "suspended";
  return "active";
}

function filterButtonLabel(label: string, value: string | undefined) {
  const normalizedValue = value?.trim();
  return `${label} ${normalizedValue ? normalizedValue : "All"}`;
}

function hasActiveUserManagementQuery(query: UserManagementSafeReadQuery) {
  return Boolean(query.search?.trim() || query.status?.trim() || query.risk?.trim() || query.plan?.trim());
}

function nextFilterValue(current: string | undefined, options: string[]) {
  if (options.length === 0) {
    return "";
  }

  const currentIndex = options.findIndex((option) => option.toLowerCase() === current?.trim().toLowerCase());
  if (currentIndex < 0) {
    return options[0];
  }

  return options[currentIndex + 1] ?? "";
}

function orderedFilterOptions(values: string[], preferredOrder: string[]) {
  const uniqueValues = new Map(values.map((value) => [value.toLowerCase(), value]));
  const orderedValues = preferredOrder.filter((value) => uniqueValues.has(value.toLowerCase()));
  const trailingValues = [...uniqueValues.values()].filter((value) => (
    !preferredOrder.some((preferred) => preferred.toLowerCase() === value.toLowerCase())
  ));

  return [...orderedValues, ...trailingValues];
}

function renderOrderManagementValue(field: NodeHealthField): ReactNode {
  if (field.tone) {
    return <StatusChip label={field.value} tone={field.tone} />;
  }

  return field.value;
}

function auditLogColumns(mode: AuditLogPageConfig["tableMode"]): Array<DataTableColumn<AuditLogRow>> {
  if (mode === "access") {
    return [
      { header: "TIMESTAMP", key: "timestamp", render: (row) => row.timestamp },
      { header: "USER REF", key: "actor", render: (row) => <SafeAuditRef>{row.actor}</SafeAuditRef> },
      { header: "EVENT TYPE", key: "eventType", render: (row) => <StatusChip label={row.eventType} tone={row.eventTone ?? "info"} /> },
      { header: "RESULT", key: "result", render: (row) => <StatusChip label={row.result} tone={row.resultTone} /> },
      { header: "RISK LEVEL", key: "risk", render: (row) => <StatusChip label={row.risk} tone={row.riskTone} /> }
    ];
  }

  return [
    { header: "TIMESTAMP", key: "timestamp", render: (row) => row.timestamp },
    { header: "ACTOR REF", key: "actor", render: (row) => <SafeAuditRef>{row.actor}</SafeAuditRef> },
    { header: "TARGET REF", key: "targetRef", render: (row) => <SafeAuditRef>{row.targetRef}</SafeAuditRef> },
    { header: "ACTION", key: "eventType", render: (row) => <StatusChip label={row.eventType} tone={row.eventTone ?? "info"} /> },
    { header: "RESULT", key: "result", render: (row) => <StatusChip label={row.result} tone={row.resultTone} /> },
    { header: "NOTES", key: "note", render: (row) => row.note }
  ];
}

function SafeAuditRef({ children }: { children: string }) {
  return <span className="admin-audit-read-ref">{children}</span>;
}
