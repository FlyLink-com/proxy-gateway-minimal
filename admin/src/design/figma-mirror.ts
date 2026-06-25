import { type AdminPage } from "../app/navigation";

export const ADMIN_FIGMA_MIRROR_CONTRACT_VERSION = "admin-figma-mirror/v1";

export const ADMIN_FIGMA_FILE_KEY = "oZuKNtGPhP6oOQ0MSzpfvn";

export const ADMIN_FIGMA_SOURCE_URL = `https://www.figma.com/design/${ADMIN_FIGMA_FILE_KEY}`;

export type AdminFigmaMirrorPageStatus =
  | "current"
  | "required"
  | "blocked";

export type AdminFigmaMirrorPage = {
  name: string;
  status: AdminFigmaMirrorPageStatus;
  role: "requirements-map" | "page-mirror" | "visual-qa-ledger";
  frameName: string;
  frameSize: "1600x1024";
  nodeId?: string;
  visibleFrameSize?: "1600x908";
  mapsToPages: AdminPage[];
  acceptance: string[];
};

export const ADMIN_FIGMA_MIRROR_PAGES: readonly AdminFigmaMirrorPage[] = [
  {
    name: "00 Contract & Build Order",
    status: "current",
    role: "requirements-map",
    frameName: "00 Contract & Build Order",
    frameSize: "1600x1024",
    mapsToPages: ["dashboard", "portalRequests", "usageMonitor"],
    acceptance: [
      "Defines the build order, current risk posture, and safe-data boundary",
      "Does not override React page ownership or production authority"
    ]
  },
  {
    name: "AI Candidate V1 / Operations Overview / Visual Polish / 1600x1024",
    status: "current",
    role: "page-mirror",
    frameName: "AI Candidate V1 / Operations Overview / Visual Polish / 1600x1024",
    frameSize: "1600x1024",
    nodeId: "373:716",
    visibleFrameSize: "1600x908",
    mapsToPages: ["dashboard"],
    acceptance: [
      "Uses the accepted 2026-06-24 Visual Polish desktop geometry",
      "Mirrors summary-and-routing only",
      "Does not mirror account/resource ledgers, object timelines, or channel ledgers as Overview-owned content"
    ]
  },
  {
    name: "AI Candidate V1 / Accounts & Resources / Visual Polish / 1600x1024",
    status: "current",
    role: "page-mirror",
    frameName: "AI Candidate V1 / Accounts & Resources / Visual Polish / 1600x1024",
    frameSize: "1600x1024",
    nodeId: "373:866",
    visibleFrameSize: "1600x908",
    mapsToPages: ["portalRequests"],
    acceptance: [
      "Uses the accepted 2026-06-24 Visual Polish desktop geometry",
      "Owns account, resource, order, quota, lifecycle, and history-entry panels",
      "Shows safe refs only and no executable account/order mutation controls"
    ]
  },
  {
    name: "AI Candidate V1 / Usage & Channels / Visual Polish / 1600x1024",
    status: "current",
    role: "page-mirror",
    frameName: "AI Candidate V1 / Usage & Channels / Visual Polish / 1600x1024",
    frameSize: "1600x1024",
    nodeId: "373:1016",
    visibleFrameSize: "1600x908",
    mapsToPages: ["usageMonitor"],
    acceptance: [
      "Uses the accepted 2026-06-24 Visual Polish desktop geometry",
      "Owns collection freshness, channel coverage, usage ledger, anomalies, and receipt panels",
      "Does not own quota edits, order pause/archive, subscription artifact lifecycle, or runtime apply"
    ]
  },
  {
    name: "04 State & Safety Matrix",
    status: "current",
    role: "visual-qa-ledger",
    frameName: "04 State & Safety Matrix",
    frameSize: "1600x1024",
    mapsToPages: ["dashboard", "portalRequests", "usageMonitor"],
    acceptance: [
      "Records risk boundaries and safe-data rules",
      "Keeps production and credential hard stops visible"
    ]
  },
  {
    name: "05 GCC-103 Review Addendum / 1600x1024",
    status: "current",
    role: "visual-qa-ledger",
    frameName: "05 GCC-103 Review Addendum / 1600x1024",
    frameSize: "1600x1024",
    mapsToPages: ["dashboard", "portalRequests", "usageMonitor"],
    acceptance: [
      "Records Figma mirror, DOM contract, Browser viewport, and validation-command evidence",
      "Keeps review deltas visible until resolved"
    ]
  }
];

export const ADMIN_FIGMA_REQUIRED_PAGE_NAMES = ADMIN_FIGMA_MIRROR_PAGES.map((page) => page.name);

export const ADMIN_FIGMA_PAGINATION_STANDARD = {
  nodeId: "157:2",
  name: "19 GCC-122 Pagination Standard / 1600x1024",
  status: "current",
  frameSize: "1600x1024",
  role: "implementation-gate",
  requiredViewports: [
    "1600",
    "1280",
    "1024",
    "768"
  ],
  mobileStatus: "pending-dedicated-standard",
  containmentStrategies: [
    "pagination",
    "route-split",
    "bounded-internal-scroll"
  ],
  prohibitedStrategies: [
    "page-level-scroll-wall",
    "floating-page-level-pager",
    "duplicated-header-pagination"
  ],
  usePaginationFor: [
    "users",
    "orders",
    "subscriptions",
    "channel-tables",
    "usage-ledgers",
    "audit-events",
    "receipts",
    "candidate-queues"
  ],
  splitRouteFor: [
    "details",
    "diagnosis",
    "drill-down",
    "resolver-flows",
    "high-context-review"
  ],
  doNotPaginate: [
    "health-cards",
    "kpi-summaries",
    "tiny-status-groups",
    "system-search",
    "action-chips"
  ],
  requiredStates: [
    "default",
    "current",
    "disabled",
    "loading",
    "empty",
    "error",
    "unknown-total",
    "filtered-reset"
  ],
  acceptance: [
    "Each long card names pagination, route split, or bounded internal scroll before implementation.",
    "Pagination stays inside the data card; no floating page-level pager or duplicated header controls.",
    "If a page exceeds the standard viewport, move content to a subpage or paginated list.",
    "Mobile is not accepted from desktop reuse until a dedicated mobile standard frame is approved."
  ]
} as const;

export const ADMIN_FIGMA_WRITE_ACCESS_CHECK = {
  checkedAt: "2026-06-21",
  status: "ready",
  attemptedOperation: "Read canonical handoff metadata, execute use_figma, and write a shared-plugin-data probe",
  connectorReportedSeat: "Dev / developer",
  userReportedAccess: "User reported Full access in Figma UI.",
  desktopEvidence: "Figma Desktop opens the canonical multi-page GlobalCircle AI Admin UI Handoff file; Share shows a Full-seat upgrade prompt and must not be continued by automation.",
  sourceFileMismatch: "Previous recorded file key resolved to a one-page Requirements Map; the canonical handoff file is the multi-frame oZuKNtGPhP6oOQ0MSzpfvn file.",
  diagnosticResult: "get_metadata can read the canonical handoff file, use_figma can execute, and a shared plugin data write probe succeeded.",
  connectorMessage: "use_figma succeeded on page 0:1 with adminos.mcpWriteProbe.",
  nextStep: "Use the canonical handoff file for future Figma mirror and visual QA work. Avoid Share or seat/billing prompts unless the operator explicitly approves that action."
} as const;

export const ADMIN_FIGMA_COMPONENT_MIRROR_STATUS = {
  checkedAt: "2026-06-24",
  sourceFile: ADMIN_FIGMA_FILE_KEY,
  pageLevelHandoff: "current",
  componentSystemMirror: "current",
  observedTopLevelPage: "Admin UI Handoff",
  observedComponentMirrorPage: "Admin Component Mirror v1",
  observedVisualSourcePage: "06 AI Exploration",
  observedVisualSourceNodes: ["373:716", "373:866", "373:1016"],
  observedFrames: [
    "00 Contract & Build Order",
    "AI Candidate V1 / Operations Overview / Visual Polish / 1600x1024",
    "AI Candidate V1 / Accounts & Resources / Visual Polish / 1600x1024",
    "AI Candidate V1 / Usage & Channels / Visual Polish / 1600x1024",
    "04 State & Safety Matrix",
    "05 GCC-103 Review Addendum / 1600x1024",
    "01 Operations Overview / 1600x1024",
    "02 Accounts & Resources / 1600x1024",
    "03 Usage & Channels / 1600x1024",
    "06 Current Implementation / Operations Overview / 1600w full-content capture",
    "07 Current Implementation / Accounts & Resources / 1600w full-content capture",
    "08 Current Implementation / Usage & Channels / 1600w full-content capture"
  ],
  observedLocalComponentSetCount: 8,
  observedLocalComponentNodeCount: 41,
  observedLocalVariantCount: 41,
  observedLocalVariableCollectionCount: 4,
  observedLocalVariableCount: 57,
  observedLocalTextStyleCount: 6,
  observedLocalPaintStyleCount: 0,
  observedLocalEffectStyleCount: 3,
  observedComponentSets: [
    {
      name: "StatusChip",
      nodeId: "69:20",
      variantCount: 5
    },
    {
      name: "MetricCard",
      nodeId: "73:42",
      variantCount: 5
    },
    {
      name: "PanelFrame",
      nodeId: "74:178",
      variantCount: 8
    },
    {
      name: "DataRow",
      nodeId: "75:107",
      variantCount: 5
    },
    {
      name: "TopBar",
      nodeId: "79:88",
      variantCount: 4
    },
    {
      name: "SidebarNavigation",
      nodeId: "82:212",
      variantCount: 6
    },
    {
      name: "PrivilegedGate",
      nodeId: "83:62",
      variantCount: 4
    },
    {
      name: "StateFeedback",
      nodeId: "84:73",
      variantCount: 4
    }
  ],
  requiredComponentMirrors: [
    "PanelFrame",
    "MetricCard",
    "StatusChip",
    "DataTable / DataRow",
    "TopBar",
    "ShellRail / Primary Routes",
    "PrivilegedGate",
    "EmptyState / Loading / Stale / Error"
  ],
  completedComponentMirrors: [
    "PanelFrame",
    "MetricCard",
    "StatusChip",
    "DataTable / DataRow",
    "TopBar",
    "ShellRail / Primary Routes",
    "PrivilegedGate",
    "EmptyState / Loading / Stale / Error"
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
    "use_figma created MetricCard, PanelFrame, and DataRow component sets on Admin Component Mirror v1.",
    "use_figma created TopBar, SidebarNavigation, PrivilegedGate, and StateFeedback component sets on Admin Component Mirror v1.",
    "Final Figma inventory reported 8 component sets, 41 component nodes, 41 variants, 4 variable collections, 57 variables, 6 text styles, and 3 effect styles.",
    "Figma screenshot checks covered TopBar, SidebarNavigation, PrivilegedGate, and StateFeedback; SidebarNavigation, PrivilegedGate, and StateFeedback variant grids were resized after overlap detection."
  ],
  nextTaskLine: "Admin React/CSS grammar alignment from Figma Component Mirror v1"
} as const;

export const ADMIN_VISUAL_QA_AXES = [
  "figma-mirror",
  "dom-contract",
  "browser-desktop",
  "browser-mobile",
  "style-token-regression",
  "safe-data-boundary"
] as const;
