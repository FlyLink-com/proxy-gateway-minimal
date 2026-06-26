import { type AdminPage } from "../app/navigation";
import { ADMIN_PAGINATION_STANDARD } from "../app/admin-ui-standards";

export const ADMIN_FIGMA_MIRROR_CONTRACT_VERSION = "admin-figma-mirror/v1";

export const ADMIN_FIGMA_FILE_KEY = "NefQiIMOPIBU28TIYcwQFE";

export const ADMIN_FIGMA_ARCHIVE_FILE_KEY = "oZuKNtGPhP6oOQ0MSzpfvn";

export const ADMIN_FIGMA_SOURCE_URL = `https://www.figma.com/design/${ADMIN_FIGMA_FILE_KEY}`;

export const ADMIN_FIGMA_ARCHIVE_SOURCE_URL = `https://www.figma.com/design/${ADMIN_FIGMA_ARCHIVE_FILE_KEY}`;

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
  frameSize: "1600x1024";
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
    frameName: "Product Baseline / Operations Overview",
    frameSize: "1600x1024",
    nodeId: "24:5",
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
    frameName: "Product Baseline / Accounts & Resources",
    frameSize: "1600x1024",
    nodeId: "24:35",
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
    frameName: "Product Baseline / Usage & Channels",
    frameSize: "1600x1024",
    nodeId: "24:65",
    mapsToPages: ["usageMonitor"],
    acceptance: [
      "Owns the Usage & Channels first screen",
      "Defines freshness, coverage, usage, anomaly metrics, Collection Freshness, Channel Coverage, Usage Ledger, and lower usage evidence",
      "Does not own quota edits, order pause/archive, subscription artifact lifecycle, or runtime apply"
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
      "Keeps PR readiness blocked until browser visual QA and source-boundary cleanup pass"
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
  diagnosticResult: "use_figma populated all seven baseline pages and a read-back scan confirmed every page contains content.",
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
  observedVisualSourceNodes: ["24:5", "24:35", "24:65"],
  observedFrames: [
    "00 Index & Project Map",
    "01 Design Rules V1-Polish",
    "02 Component Contract",
    "Product Baseline / Operations Overview",
    "Product Baseline / Accounts & Resources",
    "Product Baseline / Usage & Channels",
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
    "Read-back inventory reported all seven pages populated.",
    "Light layout scan found no card text overflow.",
    "No stale Source file: oZuKNtGPhP6oOQ0MSzpfvn source-of-truth wording remains."
  ],
  nextTaskLine: "Admin React/CSS source-boundary cleanup and browser visual QA against the clean baseline"
} as const;

export const ADMIN_VISUAL_QA_AXES = [
  "figma-baseline",
  "dom-contract",
  "browser-desktop",
  "browser-responsive",
  "style-token-regression",
  "safe-data-boundary"
] as const;
