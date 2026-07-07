import { type AdminPage } from "../app/navigation";
import { ADMIN_PAGINATION_STANDARD } from "../app/admin-ui-standards";

export const ADMIN_FIGMA_MIRROR_CONTRACT_VERSION = "admin-figma-mirror/v1";

export const ADMIN_FIGMA_FILE_KEY = "NefQiIMOPIBU28TIYcwQFE";

export const ADMIN_FIGMA_ARCHIVE_FILE_KEY = "oZuKNtGPhP6oOQ0MSzpfvn";

export const ADMIN_FIGMA_SOURCE_URL = `https://www.figma.com/design/${ADMIN_FIGMA_FILE_KEY}`;

export const ADMIN_FIGMA_ARCHIVE_SOURCE_URL = `https://www.figma.com/design/${ADMIN_FIGMA_ARCHIVE_FILE_KEY}`;

export const ADMIN_FIGMA_BASELINE_FREEZE = {
  checkedAt: "2026-06-27",
  status: "phase-2-route-shell-complete-component-gap-open",
  reason: "Use the current Figma baseline file as the source for the three owner pages plus seven safe-read route shells; the seven feature pages are not feature-component complete and must not revive old handoff, AppLibrary, NavigationLibrary, dock, drag-resize, or hidden-widget restore behavior.",
  activeFile: ADMIN_FIGMA_FILE_KEY,
  archivedFile: ADMIN_FIGMA_ARCHIVE_FILE_KEY,
  activeRouteFrameSize: "1600x908-plus-safe-read-variants",
  activeRouteFrames: {
    dashboard: "2:92",
    portalRequests: "2:262",
    usageMonitor: "2:432",
    userManagement: "59:4",
    orderManagement: "58:4",
    userAccessLogs: "57:4",
    userOperationLogs: "64:4",
    nodeHealth: "61:4",
    nodeLogs: "62:4",
    nodeBandwidth: "63:4"
  },
  activeRouteFrameSizes: {
    dashboard: "1600x908",
    portalRequests: "1600x908",
    usageMonitor: "1600x908",
    userManagement: "1600x1055",
    orderManagement: "1600x908",
    userAccessLogs: "1600x908",
    userOperationLogs: "1600x908",
    nodeHealth: "1600x908",
    nodeLogs: "1600x1076",
    nodeBandwidth: "1600x908"
  },
  frozenSurfaces: [
    "Active Figma source boundary",
    "Ten active route baseline frame IDs",
    "ShellRail + TopBar + page workspace structure",
    "System Search replaces AppLibrary and NavigationLibrary",
    "Operations Overview renders health metrics as summary plus three workspace panels",
    "Accounts and Usage first screens render three workspace panels plus lower evidence surfaces",
    "User Management, Order Records, User Access Logs, User Operation Logs, Node Health, Node Logs, and Node Bandwidth are active safe-read route shells",
    "Legacy page section deep links normalize to the owning page until section contracts are designed",
    "Retired AppLibrary, hidden module restore, dock/appbar, drag/resize, and OS windowing behavior"
  ],
  notFrozen: [
    "Backend DTO/API integration",
    "Real production data wiring",
    "Mobile layouts below 1024px",
    "Full reusable Figma component-set library",
    "Feature-specific table, filter, chart, log, and detail components for the seven safe-read route shells",
    "Feature-page DTO/API adapters for user, order, log, node health, node log, and bandwidth pages",
    "Privileged log detail sessions and mutation APIs",
    "Runtime, auth model, schema, deployment, or production operations"
  ]
} as const;

export const ADMIN_FIGMA_BASELINE_LAYOUT = {
  source: "GlobalCircle AI Admin UI Baseline 2026 06 25",
  sourceFile: ADMIN_FIGMA_FILE_KEY,
  pageNodeId: "2:4",
  frame: {
    height: 908,
    width: 1600
  },
  shellRail: {
    height: 908,
    width: 224,
    x: 0,
    y: 0
  },
  content: {
    width: 1296,
    x: 252
  },
  topBar: {
    height: 58,
    width: 1296,
    x: 252,
    y: 24,
    search: {
      maxWidth: 340,
      minGapFromRightCluster: 24,
      overflow: "ellipsis",
      role: "system-search"
    }
  },
  metricGrid: {
    card: {
      height: 150,
      width: 300
    },
    columns: 4,
    gap: 16,
    x: [276, 592, 908, 1224],
    y: 102
  },
  panelGrid: {
    card: {
      height: 260,
      width: 416
    },
    columns: 3,
    gap: 24,
    x: [252, 692, 1132],
    y: 300
  },
  evidenceGrid: {
    card: {
      height: 280,
      width: 628
    },
    columns: 2,
    gap: 40,
    x: [252, 920],
    y: 596
  },
  legacyResidueForbidden: [
    "AppLibrary",
    "NavigationLibrary",
    "hidden-module-restore",
    "drag-resize-windowing",
    "floating-section-subnav",
    "page-level-scroll-wall"
  ],
  allowedCurrentInteractions: [
    "primary-route-switch",
    "system-search",
    "owner-page-safe-jump",
    "card-local-readonly-query"
  ]
} as const;

export type AdminFigmaFeatureRouteFrame = {
  name: string;
  nodeId: string;
  frameSize: "1600x908" | "1600x1055" | "1600x1076";
  manifestId: string;
  mapsToPage: AdminPage;
  ownerArea: "Audit & Cases" | "Platform Development" | "System Settings";
  implementationStatus: "route-shell-only-component-gap-open";
  acceptanceGate: string;
};

export const ADMIN_FIGMA_ROUTE_SHELL_FRAMES: readonly AdminFigmaFeatureRouteFrame[] = [
  {
    acceptanceGate: "Read-only user account query page; create, edit, and disable actions stay gated until backend and permission contracts are reviewed.",
    frameSize: "1600x1055",
    implementationStatus: "route-shell-only-component-gap-open",
    manifestId: "user-management",
    mapsToPage: "userManagement",
    name: "user-management",
    nodeId: "59:4",
    ownerArea: "System Settings"
  },
  {
    acceptanceGate: "Read-only order registry query page; create, pause, archive, and artifact mutation actions stay gated.",
    frameSize: "1600x908",
    implementationStatus: "route-shell-only-component-gap-open",
    manifestId: "order-management",
    mapsToPage: "orderManagement",
    name: "order-management",
    nodeId: "58:4",
    ownerArea: "System Settings"
  },
  {
    acceptanceGate: "Read-only user access log query page with redacted event detail only.",
    frameSize: "1600x908",
    implementationStatus: "route-shell-only-component-gap-open",
    manifestId: "user-access-logs",
    mapsToPage: "userAccessLogs",
    name: "user-access-logs",
    nodeId: "57:4",
    ownerArea: "Audit & Cases"
  },
  {
    acceptanceGate: "Read-only user and operator operation log query page with safe object refs only.",
    frameSize: "1600x908",
    implementationStatus: "route-shell-only-component-gap-open",
    manifestId: "user-operation-logs",
    mapsToPage: "userOperationLogs",
    name: "user-operation-logs",
    nodeId: "64:4",
    ownerArea: "Audit & Cases"
  },
  {
    acceptanceGate: "Read-only node health query page; runtime apply and diagnostics remain gated.",
    frameSize: "1600x908",
    implementationStatus: "route-shell-only-component-gap-open",
    manifestId: "node-health",
    mapsToPage: "nodeHealth",
    name: "node-health",
    nodeId: "61:4",
    ownerArea: "Platform Development"
  },
  {
    acceptanceGate: "Read-only redacted node log query page; raw logs and runtime material remain forbidden.",
    frameSize: "1600x1076",
    implementationStatus: "route-shell-only-component-gap-open",
    manifestId: "node-logs",
    mapsToPage: "nodeLogs",
    name: "node-logs",
    nodeId: "62:4",
    ownerArea: "Platform Development"
  },
  {
    acceptanceGate: "Read-only node bandwidth inspector; live telemetry API and remediation actions remain later tasks.",
    frameSize: "1600x908",
    implementationStatus: "route-shell-only-component-gap-open",
    manifestId: "node-bandwidth",
    mapsToPage: "nodeBandwidth",
    name: "Node Bandwidth Inspector / Baseline / 1600x908",
    nodeId: "63:4",
    ownerArea: "Platform Development"
  }
] as const;

export const ADMIN_FIGMA_FEATURE_ROUTE_FRAMES = ADMIN_FIGMA_ROUTE_SHELL_FRAMES;

export const ADMIN_FIGMA_PLANNED_FEATURE_FRAMES = ADMIN_FIGMA_ROUTE_SHELL_FRAMES;

export type AdminFigmaFeatureRouteComponentGap = {
  manifestId: AdminFigmaFeatureRouteFrame["manifestId"];
  routeShellStatus: "implemented";
  localRenderer: "generic-safe-read-page" | "audit-table-detail-page";
  missingComponentContracts: readonly string[];
  missingDataContracts: readonly string[];
  nextOwnerTask: string;
};

export const ADMIN_FIGMA_FEATURE_ROUTE_COMPONENT_GAPS: readonly AdminFigmaFeatureRouteComponentGap[] = [
  {
    localRenderer: "generic-safe-read-page",
    manifestId: "user-management",
    missingComponentContracts: [
      "user-query-toolbar",
      "user-status-filter-bar",
      "user-management-table",
      "user-readonly-detail-panel",
      "account-action-gate"
    ],
    missingDataContracts: [
      "accountManagementSummary.safeSearch",
      "accountManagementSummary.tableRows",
      "accountManagementSummary.detail"
    ],
    nextOwnerTask: "GCC-131",
    routeShellStatus: "implemented"
  },
  {
    localRenderer: "generic-safe-read-page",
    manifestId: "order-management",
    missingComponentContracts: [
      "order-query-toolbar",
      "order-state-filter-bar",
      "order-management-table",
      "order-quota-summary-panel",
      "order-action-gate"
    ],
    missingDataContracts: [
      "orderManagementSummary.safeSearch",
      "orderManagementSummary.tableRows",
      "orderQuotaUsageSummary"
    ],
    nextOwnerTask: "GCC-132",
    routeShellStatus: "implemented"
  },
  {
    localRenderer: "audit-table-detail-page",
    manifestId: "user-access-logs",
    missingComponentContracts: [
      "backend-backed-access-query-state",
      "case-handoff-entry-gate",
      "privileged-export-approval-gate",
      "access-log-responsive-breakpoint-frames"
    ],
    missingDataContracts: [
      "userAccessLogSummary.safeSearch",
      "userAccessLogSummary.tableRows",
      "userAccessLogSummary.redactedDetail"
    ],
    nextOwnerTask: "GCC-134",
    routeShellStatus: "implemented"
  },
  {
    localRenderer: "audit-table-detail-page",
    manifestId: "user-operation-logs",
    missingComponentContracts: [
      "backend-backed-operation-query-state",
      "durable-audit-context-handoff",
      "privileged-export-approval-gate",
      "operation-log-responsive-breakpoint-frames"
    ],
    missingDataContracts: [
      "operatorLogSummary.safeSearch",
      "operatorLogSummary.tableRows",
      "operatorLogSummary.redactedDetail"
    ],
    nextOwnerTask: "GCC-134",
    routeShellStatus: "implemented"
  },
  {
    localRenderer: "generic-safe-read-page",
    manifestId: "node-health",
    missingComponentContracts: [
      "node-health-metric-row",
      "node-health-table",
      "heartbeat-status-panel",
      "diagnostic-route-preview"
    ],
    missingDataContracts: [
      "nodeHealthSummary.safeSearch",
      "nodeHealthSummary.tableRows",
      "nodeHealthSummary.diagnosticPreview"
    ],
    nextOwnerTask: "GCC-133",
    routeShellStatus: "implemented"
  },
  {
    localRenderer: "generic-safe-read-page",
    manifestId: "node-logs",
    missingComponentContracts: [
      "node-log-query-toolbar",
      "node-log-severity-filter",
      "node-log-table",
      "privileged-redaction-gate"
    ],
    missingDataContracts: [
      "nodeLogSessionSummary.safeSearch",
      "nodeLogSessionSummary.redactedRows",
      "nodeLogSessionSummary.accessGate"
    ],
    nextOwnerTask: "GCC-134",
    routeShellStatus: "implemented"
  },
  {
    localRenderer: "generic-safe-read-page",
    manifestId: "node-bandwidth",
    missingComponentContracts: [
      "node-bandwidth-metric-row",
      "bandwidth-trend-chart",
      "channel-breakdown-table",
      "node-activity-event-log"
    ],
    missingDataContracts: [
      "nodeBandwidthSummary.safeSearch",
      "nodeBandwidthSummary.series",
      "nodeBandwidthSummary.channelRows",
      "nodeBandwidthSummary.activityEvents"
    ],
    nextOwnerTask: "GCC-133",
    routeShellStatus: "implemented"
  }
] as const;

export type AdminFigmaMirrorPageStatus =
  | "current"
  | "required"
  | "blocked"
  | "archive";

export type AdminFigmaMirrorPage = {
  name: string;
  status: AdminFigmaMirrorPageStatus;
  role:
    | "requirements-map"
    | "design-rules"
    | "component-contract"
    | "page-mirror"
    | "implementation-map"
    | "visual-qa-ledger"
    | "archive";
  frameName: string;
  frameSize: "1600x1024" | "1600x908" | "1600x1055" | "1600x1076";
  nodeId?: string;
  mapsToPages: AdminPage[];
  acceptance: string[];
};

export const ADMIN_FIGMA_MIRROR_PAGES: readonly AdminFigmaMirrorPage[] = [
  {
    name: "00 Index & Project Map",
    status: "current",
    role: "requirements-map",
    frameName: "00 Index & Project Map",
    frameSize: "1600x1024",
    nodeId: "0:1",
    mapsToPages: ["dashboard", "portalRequests", "usageMonitor"],
    acceptance: [
      "Names NefQiIMOPIBU28TIYcwQFE as the active baseline",
      "Marks the old handoff file as archive and lineage only",
      "Defines the review order from rules to evidence gates"
    ]
  },
  {
    name: "01 Design Rules V1-Polish",
    status: "current",
    role: "design-rules",
    frameName: "01 Design Rules V1-Polish",
    frameSize: "1600x1024",
    nodeId: "2:2",
    mapsToPages: ["dashboard", "portalRequests", "usageMonitor"],
    acceptance: [
      "Defines source boundary, ShellRail, TopBar, breakpoints, surface rules, System Search, evidence slots, and forbidden legacy residue",
      "Does not authorize backend, runtime, production, or sensitive-data work"
    ]
  },
  {
    name: "02 Component Contract",
    status: "current",
    role: "component-contract",
    frameName: "02 Component Contract",
    frameSize: "1600x1024",
    nodeId: "2:3",
    mapsToPages: ["dashboard", "portalRequests", "usageMonitor"],
    acceptance: [
      "Defines ShellRail, TopBar, MetricCard, StatusChip, PanelFrame, DataRowCompact, EvidenceSurface, StateFeedback, and PrivilegedGate responsibilities",
      "Keeps SidebarNavigation, AppLibrary, NavigationLibrary, dock, drag-resize, and hidden-widget restore deprecated"
    ]
  },
  {
    name: "Product Baseline / Operations Overview",
    status: "current",
    role: "page-mirror",
    frameName: "Operations Overview / Baseline / 1600x908",
    frameSize: "1600x908",
    nodeId: "2:92",
    mapsToPages: ["dashboard"],
    acceptance: [
      "Owns the Operations Overview first screen",
      "Defines four summary metrics, Risk Queue, Next Actions, Review Candidates, and lower Operations evidence",
      "Routes to owner pages and does not own account/resource ledgers, usage ledgers, or runtime actions"
    ]
  },
  {
    name: "Product Baseline / Accounts & Resources",
    status: "current",
    role: "page-mirror",
    frameName: "Accounts & Resources / Baseline / 1600x908",
    frameSize: "1600x908",
    nodeId: "2:262",
    mapsToPages: ["portalRequests"],
    acceptance: [
      "Owns the Accounts & Resources first screen",
      "Defines account/resource metrics, Account Directory, Resources & Orders, Lifecycle, and lower account evidence",
      "Shows safe refs only and no executable account, order, quota, or lifecycle mutation controls"
    ]
  },
  {
    name: "Product Baseline / Usage & Channels",
    status: "current",
    role: "page-mirror",
    frameName: "Usage & Channels / Baseline / 1600x908",
    frameSize: "1600x908",
    nodeId: "2:432",
    mapsToPages: ["usageMonitor"],
    acceptance: [
      "Owns the Usage & Channels first screen",
      "Defines freshness, coverage, usage, anomaly metrics, Collection Freshness, Channel Coverage, Usage Ledger, and lower usage evidence",
      "Does not own quota edits, order pause/archive, subscription artifact lifecycle, or runtime apply"
    ]
  },
  {
    name: "Product Baseline / User Management",
    status: "current",
    role: "page-mirror",
    frameName: "user-management",
    frameSize: "1600x1055",
    nodeId: "59:4",
    mapsToPages: ["userManagement"],
    acceptance: [
      "Owns the User Management safe-read query page",
      "Defines user table, status filters, safe detail review, and gated create/disable actions",
      "Does not authorize account mutation until backend API and permission contracts are reviewed"
    ]
  },
  {
    name: "Product Baseline / Order Records",
    status: "current",
    role: "page-mirror",
    frameName: "order-management",
    frameSize: "1600x908",
    nodeId: "58:4",
    mapsToPages: ["orderManagement"],
    acceptance: [
      "Owns the Order Records safe-read query page",
      "Defines order record table, payment-state filters, billing summary, and gated export action",
      "Does not authorize order pause, archive, artifact generation, or delivery mutation"
    ]
  },
  {
    name: "Product Baseline / User Access Logs",
    status: "current",
    role: "page-mirror",
    frameName: "user-access-logs",
    frameSize: "1600x908",
    nodeId: "57:4",
    mapsToPages: ["userAccessLogs"],
    acceptance: [
      "Owns the User Access Logs safe-read query page",
      "Defines access log filters, result table, and redacted detail panel",
      "Does not expose raw identity, session, token, credential, or customer-private material"
    ]
  },
  {
    name: "Product Baseline / User Operation Logs",
    status: "current",
    role: "page-mirror",
    frameName: "user-operation-logs",
    frameSize: "1600x908",
    nodeId: "64:4",
    mapsToPages: ["userOperationLogs"],
    acceptance: [
      "Owns the User Operation Logs safe-read query page",
      "Defines operation filters, redacted action table, and safe audit context",
      "Does not authorize mutation or export until audit backend and permission contracts are reviewed"
    ]
  },
  {
    name: "Product Baseline / Node Health",
    status: "current",
    role: "page-mirror",
    frameName: "node-health",
    frameSize: "1600x908",
    nodeId: "61:4",
    mapsToPages: ["nodeHealth"],
    acceptance: [
      "Owns the Node Health safe-read query page",
      "Defines node metrics, heartbeat table, health states, and diagnostic route preview",
      "Does not authorize runtime apply, node remediation, or production operation"
    ]
  },
  {
    name: "Product Baseline / Node Logs",
    status: "current",
    role: "page-mirror",
    frameName: "node-logs",
    frameSize: "1600x1076",
    nodeId: "62:4",
    mapsToPages: ["nodeLogs"],
    acceptance: [
      "Owns the Node Logs safe-read query page",
      "Defines node, time range, severity, and redacted-message query surfaces",
      "Does not expose raw logs, runtime config, tokens, credentials, or customer network material"
    ]
  },
  {
    name: "Product Baseline / Node Bandwidth",
    status: "current",
    role: "page-mirror",
    frameName: "Node Bandwidth Inspector / Baseline / 1600x908",
    frameSize: "1600x908",
    nodeId: "63:4",
    mapsToPages: ["nodeBandwidth"],
    acceptance: [
      "Owns the Node Bandwidth Inspector safe-read query page",
      "Defines node traffic metrics, trend chart, anomaly lane, and node activity context",
      "Does not authorize live telemetry mutation, remediation, runtime apply, or production operation"
    ]
  },
  {
    name: "04 Figma-to-React Mapping",
    status: "current",
    role: "implementation-map",
    frameName: "04 Figma-to-React Mapping",
    frameSize: "1600x1024",
    nodeId: "2:5",
    mapsToPages: ["dashboard", "portalRequests", "usageMonitor"],
    acceptance: [
      "Maps routes, components, tokens, CSS ownership, and QA hooks to React implementation surfaces",
      "Prevents old handoff, AppLibrary, and OS/windowing behavior from re-entering code as current standard"
    ]
  },
  {
    name: "90 Evidence Gates",
    status: "current",
    role: "visual-qa-ledger",
    frameName: "90 Evidence Gates",
    frameSize: "1600x1024",
    nodeId: "2:6",
    mapsToPages: ["dashboard", "portalRequests", "usageMonitor"],
    acceptance: [
      "Records Figma, runtime screenshot, viewport, System Search, no-legacy-residue, and safe-data gates",
      "Keeps PR readiness blocked until browser visual QA and page-subroute parity filtering pass"
    ]
  },
  {
    name: "99 Archive / Source Handoff",
    status: "archive",
    role: "archive",
    frameName: "99 Archive / Source Handoff",
    frameSize: "1600x1024",
    nodeId: "2:7",
    mapsToPages: ["dashboard", "portalRequests", "usageMonitor"],
    acceptance: [
      "Records the old handoff file and superseded OS/AppLibrary concepts as archive only",
      "Requires any reused old rule to be copied into the active baseline before implementation"
    ]
  }
];

export const ADMIN_FIGMA_REQUIRED_PAGE_NAMES = ADMIN_FIGMA_MIRROR_PAGES.map((page) => page.name);

export const ADMIN_FIGMA_PAGINATION_STANDARD = {
  ...ADMIN_PAGINATION_STANDARD,
  frameSize: "1600x1024",
  nodeId: "157:2",
  name: "19 GCC-122 Pagination Standard / 1600x1024",
  role: "implementation-gate",
  status: "archive-lineage"
} as const;

export const ADMIN_FIGMA_WRITE_ACCESS_CHECK = {
  checkedAt: "2026-06-25",
  status: "ready",
  attemptedOperation: "Read the new clean baseline metadata, update the Index source boundary, and populate the planned baseline pages with use_figma.",
  connectorReportedSeat: "Dev / developer",
  userReportedAccess: "User reported Full access in Figma UI.",
  desktopEvidence: "Figma Desktop and connector access can read and update the clean GlobalCircle AI Admin UI Baseline file.",
  sourceFileMismatch: "The previous canonical handoff file is now archive lineage; the active source boundary is NefQiIMOPIBU28TIYcwQFE.",
  diagnosticResult: "use_figma populated the active baseline pages and a read-back scan confirmed product query frames are present.",
  connectorMessage: "use_figma succeeded on Index, Design Rules, Component Contract, Product Baseline Frames, Mapping, Evidence Gates, and Archive pages.",
  nextStep: "Use the clean baseline file for future Figma mirror and visual QA work. Treat the old handoff file as archive or lineage only."
} as const;

export const ADMIN_FIGMA_COMPONENT_MIRROR_STATUS = {
  checkedAt: "2026-06-25",
  sourceFile: ADMIN_FIGMA_FILE_KEY,
  archiveFile: ADMIN_FIGMA_ARCHIVE_FILE_KEY,
  pageLevelHandoff: "current-clean-baseline",
  componentSystemMirror: "contract-baseline",
  observedTopLevelPage: "00 Index & Project Map",
  observedComponentMirrorPage: "02 Component Contract",
  observedVisualSourcePage: "03 Product Baseline Frames",
  observedVisualSourceNodes: [
    "2:92",
    "2:262",
    "2:432",
    "59:4",
    "58:4",
    "57:4",
    "64:4",
    "61:4",
    "62:4",
    "63:4"
  ],
  observedFrames: [
    "00 Index & Project Map",
    "01 Design Rules V1-Polish",
    "02 Component Contract",
    "Operations Overview / Baseline / 1600x908",
    "Accounts & Resources / Baseline / 1600x908",
    "Usage & Channels / Baseline / 1600x908",
    "user-management",
    "order-management",
    "user-access-logs",
    "user-operation-logs",
    "node-health",
    "node-logs",
    "Node Bandwidth Inspector / Baseline / 1600x908",
    "04 Figma-to-React Mapping",
    "90 Evidence Gates",
    "99 Archive / Source Handoff"
  ],
  observedLocalComponentSetCount: 0,
  observedLocalComponentNodeCount: 0,
  observedLocalVariantCount: 0,
  observedLocalVariableCollectionCount: 0,
  observedLocalVariableCount: 0,
  observedLocalTextStyleCount: 0,
  observedLocalPaintStyleCount: 0,
  observedLocalEffectStyleCount: 0,
  observedComponentSets: [
    {
      name: "ShellRail",
      nodeId: "23:5",
      variantCount: 0
    },
    {
      name: "TopBar",
      nodeId: "23:11",
      variantCount: 0
    },
    {
      name: "MetricCard",
      nodeId: "23:17",
      variantCount: 0
    },
    {
      name: "StatusChip",
      nodeId: "23:23",
      variantCount: 0
    },
    {
      name: "PanelFrame",
      nodeId: "23:29",
      variantCount: 0
    },
    {
      name: "DataRowCompact",
      nodeId: "23:35",
      variantCount: 0
    },
    {
      name: "EvidenceSurface",
      nodeId: "23:41",
      variantCount: 0
    },
    {
      name: "StateFeedback",
      nodeId: "23:47",
      variantCount: 0
    },
    {
      name: "PrivilegedGate",
      nodeId: "23:53",
      variantCount: 0
    },
    {
      name: "Deprecated / SidebarNavigation",
      nodeId: "23:59",
      variantCount: 0
    }
  ],
  requiredComponentMirrors: [
    "ShellRail",
    "TopBar",
    "MetricCard",
    "StatusChip",
    "PanelFrame",
    "DataRowCompact",
    "EvidenceSurface",
    "PrivilegedGate",
    "StateFeedback"
  ],
  completedComponentMirrors: [
    "ShellRail",
    "TopBar",
    "MetricCard",
    "StatusChip",
    "PanelFrame",
    "DataRowCompact",
    "EvidenceSurface",
    "PrivilegedGate",
    "StateFeedback"
  ],
  pendingComponentMirrors: [],
  requiredVariantGroups: [
    "semantic-status",
    "panel-state",
    "metric-priority",
    "data-row-interaction",
    "privileged-gate-state"
  ],
  figmaValidationEvidence: [
    "use_figma populated the clean baseline Index, Design Rules, Component Contract, Product Baseline Frames, Mapping, Evidence Gates, and Archive pages.",
    "Read-back inventory reports three owner pages plus seven safe-read query pages in Product Baseline Frames.",
    "The safe-read query pages are current baseline frames for route, manifest, and System Search carrying.",
    "Light layout scan found no card text overflow.",
    "No stale Source file: oZuKNtGPhP6oOQ0MSzpfvn source-of-truth wording remains."
  ],
  nextTaskLine: "Admin React/CSS browser visual QA and ten-page baseline parity filtering against the clean baseline"
} as const;

export const ADMIN_VISUAL_QA_AXES = [
  "figma-baseline",
  "dom-contract",
  "browser-desktop",
  "browser-responsive",
  "style-token-regression",
  "safe-data-boundary"
] as const;
