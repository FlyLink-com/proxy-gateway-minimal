import { type AdminComponentRoleGroup } from "./grammar/components";
import { type AdminHierarchyRole } from "./grammar/hierarchy";

export const ADMIN_FIGMA_REACT_PARITY_CONTRACT_VERSION = "admin-figma-react-parity/v1";

export const ADMIN_FIGMA_REACT_PARITY_REQUIRED_COMPONENTS = [
  "StatusChip",
  "MetricCard",
  "PanelFrame",
  "DataRow",
  "TopBar",
  "SidebarNavigation",
  "PrivilegedGate",
  "StateFeedback"
] as const;

export type AdminFigmaReactParityComponent =
  (typeof ADMIN_FIGMA_REACT_PARITY_REQUIRED_COMPONENTS)[number];

export type AdminFigmaReactParityEntry = {
  figmaComponentSet: AdminFigmaReactParityComponent;
  figmaVariantProperties: readonly string[];
  figmaVariableCollections: readonly string[];
  grammarRoles: readonly AdminComponentRoleGroup[];
  hierarchyRoles: readonly AdminHierarchyRole[];
  react: {
    primarySurface: string;
    supportingSurfaces: readonly string[];
    propContract: readonly string[];
    propValues: readonly string[];
  };
  cssTokens: readonly string[];
  stateSemantics: readonly string[];
  responsiveRules: readonly string[];
  a11yRules: readonly string[];
  qaEvidence: readonly string[];
  openGaps: readonly string[];
  nextLinearIssue: "GCC-119" | "GCC-120";
};

export const ADMIN_FIGMA_REACT_PARITY_MATRIX = [
  {
    a11yRules: [
      "Visible text label is required; color cannot be the only state signal.",
      "Chip contrast follows semantic foreground/background/border token pairs."
    ],
    cssTokens: [
      "--admin-success-bg",
      "--admin-success-fg",
      "--admin-success-border",
      "--admin-info-bg",
      "--admin-info-fg",
      "--admin-info-border",
      "--admin-warning-bg",
      "--admin-warning-fg",
      "--admin-warning-border",
      "--admin-danger-bg",
      "--admin-danger-fg",
      "--admin-danger-border",
      "--admin-neutral-bg",
      "--admin-neutral-fg",
      "--admin-radius-pill"
    ],
    figmaComponentSet: "StatusChip",
    figmaVariableCollections: ["semantic-color", "radius"],
    figmaVariantProperties: ["tone=success|info|warning|danger|neutral", "label=text"],
    grammarRoles: ["state", "content"],
    hierarchyRoles: ["state"],
    nextLinearIssue: "GCC-119",
    openGaps: [
      "Confirm whether stale stays a warning copy variant or becomes an explicit React tone."
    ],
    qaEvidence: [
      "docs/ADMIN_CONSOLE_VISUAL_QA_LEDGER.md#Current Figma Mirror Evidence",
      "docs/ADMIN_CONSOLE_VISUAL_QA_LEDGER.md#Current Browser Evidence"
    ],
    react: {
      primarySurface: "src/components/primitives/status-chip.tsx#StatusChip",
      propContract: ["label", "tone"],
      propValues: ["success", "info", "warning", "danger", "neutral"],
      supportingSurfaces: [
        "src/components/primitives/metric-card.tsx#MetricTone",
        "src/components/primitives/panel-frame.tsx#StatusChip usage"
      ]
    },
    responsiveRules: [
      "Chip text must remain visible at narrow widths.",
      "Chip wrapping is allowed only inside the owning row or panel, not the shell."
    ],
    stateSemantics: [
      "success means safe or healthy",
      "info means neutral evidence or current route context",
      "warning means delayed, gated, or attention required",
      "danger means blocked, unsafe, or unavailable",
      "neutral means readonly, disabled, or informational"
    ]
  },
  {
    a11yRules: [
      "Trend sparkline has role img and a text aria label.",
      "Metric value is text-first and does not rely on chart color alone."
    ],
    cssTokens: [
      "--admin-radius-card",
      "--admin-shadow-card",
      "--admin-density-normal-card-padding",
      "--admin-success-bg",
      "--admin-info-bg",
      "--admin-warning-bg",
      "--admin-danger-bg",
      "--admin-neutral-bg"
    ],
    figmaComponentSet: "MetricCard",
    figmaVariableCollections: ["semantic-color", "density", "radius", "effect"],
    figmaVariantProperties: ["tone=success|info|warning|danger|neutral", "trend=on|off"],
    grammarRoles: ["content", "state"],
    hierarchyRoles: ["metric", "context", "state"],
    nextLinearIssue: "GCC-119",
    openGaps: [
      "Normalize overview-specific metric card markup with the shared primitive where possible."
    ],
    qaEvidence: [
      "docs/ADMIN_CONSOLE_VISUAL_QA_LEDGER.md#Current Figma Mirror Evidence",
      "docs/ADMIN_CONSOLE_VISUAL_QA_LEDGER.md#Current Browser Evidence"
    ],
    react: {
      primarySurface: "src/components/primitives/metric-card.tsx#MetricCard",
      propContract: ["label", "value", "detail", "tone", "icon", "trend"],
      propValues: ["success", "info", "warning", "danger", "neutral"],
      supportingSurfaces: [
        "src/pages/dashboard-page.tsx#OverviewMetricCard"
      ]
    },
    responsiveRules: [
      "Metric card width must be governed by panel or grid ownership.",
      "Sparkline must not force horizontal overflow on mobile."
    ],
    stateSemantics: [
      "Metric tone expresses risk or trust status, not a decorative color.",
      "Trend is supporting evidence and cannot replace the text detail."
    ]
  },
  {
    a11yRules: [
      "Panel section must keep a stable aria-label.",
      "Hide action must remain named when present."
    ],
    cssTokens: [
      "--admin-radius-panel",
      "--admin-shadow-panel",
      "--admin-plugin-padding",
      "--admin-plugin-header-gap",
      "--admin-plugin-gap",
      "--admin-density-normal-card-padding",
      "--admin-touch-target-min"
    ],
    figmaComponentSet: "PanelFrame",
    figmaVariableCollections: ["density", "radius", "effect"],
    figmaVariantProperties: [
      "chrome=draft|operator",
      "ownerMode=preview|owner",
      "state=default|loading|empty|stale|error"
    ],
    grammarRoles: ["container", "state"],
    hierarchyRoles: ["context", "state", "evidence", "action"],
    nextLinearIssue: "GCC-119",
    openGaps: [
      "Move any page-level panel chrome overrides back to the shared panel frame."
    ],
    qaEvidence: [
      "docs/ADMIN_CONSOLE_VISUAL_QA_LEDGER.md#Current Figma Mirror Evidence",
      "docs/ADMIN_CONSOLE_VISUAL_QA_LEDGER.md#Current Browser Evidence"
    ],
    react: {
      primarySurface: "src/components/primitives/panel-frame.tsx#PanelFrame",
      propContract: [
        "ariaLabel",
        "category",
        "chrome",
        "density",
        "ownerMode",
        "tone",
        "fixturePreview",
        "onHide"
      ],
      propValues: ["draft", "operator", "preview", "owner", "normal"],
      supportingSurfaces: [
        "src/pages/admin-console-page-frame.tsx#PanelFrame usage"
      ]
    },
    responsiveRules: [
      "Panel chrome owns border, radius, shadow, header, and state chrome.",
      "Panel content must not introduce outer chrome or resize controls."
    ],
    stateSemantics: [
      "preview is design evidence, not production authority",
      "owner marks page-owned content",
      "draft chrome may show fixture rows; operator chrome suppresses draft-only rows"
    ]
  },
  {
    a11yRules: [
      "Rows keep role row and cells keep role cell or columnheader.",
      "Selectable rows must provide aria-selected and keyboard activation."
    ],
    cssTokens: [
      "--admin-touch-target-min",
      "--admin-row-gap",
      "--admin-border",
      "--admin-border-hairline",
      "--admin-surface",
      "--admin-surface-muted",
      "--admin-hover-surface",
      "--admin-selected-surface"
    ],
    figmaComponentSet: "DataRow",
    figmaVariableCollections: ["density", "semantic-color", "radius"],
    figmaVariantProperties: ["interaction=default|hover|selected|disabled|flagged", "state=empty|loading|error"],
    grammarRoles: ["content", "state"],
    hierarchyRoles: ["context", "state", "evidence", "detail"],
    nextLinearIssue: "GCC-119",
    openGaps: [
      "Choose one mobile table strategy for safe refs: local horizontal scroll or stacked row."
    ],
    qaEvidence: [
      "docs/ADMIN_CONSOLE_VISUAL_QA_LEDGER.md#Current Figma Mirror Evidence",
      "docs/ADMIN_CONSOLE_VISUAL_QA_LEDGER.md#Current Browser Evidence"
    ],
    react: {
      primarySurface: "src/components/primitives/data-table.tsx#DataTable",
      propContract: ["ariaLabel", "columns", "rows", "state", "selectedRowKey", "onRowSelect"],
      propValues: ["empty", "loading", "stale", "error", "selected"],
      supportingSurfaces: [
        "src/components/primitives/safe-ref.tsx#SafeRef",
        "src/pages/portal-requests-page.tsx#DataTable usage",
        "src/pages/subscription-usage-monitor-page.tsx#DataTable usage"
      ]
    },
    responsiveRules: [
      "Long safe refs must not create body-level horizontal overflow.",
      "Mobile row strategy must be shared, not page-specific."
    ],
    stateSemantics: [
      "empty means no rows without implying zero production facts",
      "loading means data is pending",
      "error means controlled unavailable state without raw failure details",
      "selected means current local UI focus"
    ]
  },
  {
    a11yRules: [
      "Search input has an explicit aria-label.",
      "Operator account summary has a named disclosure control."
    ],
    cssTokens: [
      "--admin-statusbar-height",
      "--admin-statusbar-surface",
      "--admin-statusbar-border",
      "--admin-statusbar-shadow",
      "--admin-control-height",
      "--admin-focus-ring",
      "--admin-topbar-bg"
    ],
    figmaComponentSet: "TopBar",
    figmaVariableCollections: ["shell", "density", "semantic-color", "effect"],
    figmaVariantProperties: ["page=dashboard|portalRequests|usageMonitor", "search=expanded|compact", "environment=readonly"],
    grammarRoles: ["system", "control", "state"],
    hierarchyRoles: ["context", "state", "action"],
    nextLinearIssue: "GCC-119",
    openGaps: [
      "Confirm compact-search behavior is represented by tokens instead of page-local CSS."
    ],
    qaEvidence: [
      "docs/ADMIN_CONSOLE_VISUAL_QA_LEDGER.md#Current Figma Mirror Evidence",
      "docs/ADMIN_CONSOLE_VISUAL_QA_LEDGER.md#Current Browser Evidence"
    ],
    react: {
      primarySurface: "src/components/layout/top-bar.tsx#TopBar",
      propContract: ["activePage", "search", "onSearchChange"],
      propValues: ["dashboard", "portalRequests", "usageMonitor"],
      supportingSurfaces: [
        "src/components/layout/admin-layout.tsx#TopBar usage"
      ]
    },
    responsiveRules: [
      "Top bar height and control sizing are shell-owned tokens.",
      "Search and account controls must collapse without overlapping page title."
    ],
    stateSemantics: [
      "page status chips describe page ownership",
      "Risk A gate chip is a safety state, not an execution affordance",
      "operator account is read-only production supervision"
    ]
  },
  {
    a11yRules: [
      "Pinned route buttons expose aria-current when active.",
      "Navigation library trigger and search input have explicit names."
    ],
    cssTokens: [
      "--admin-sidebar-width",
      "--admin-sidebar-route-icon-size",
      "--admin-library-width",
      "--admin-library-top",
      "--admin-library-max-height",
      "--admin-library-padding",
      "--admin-library-gap",
      "--admin-library-cell-width",
      "--admin-library-tile-height",
      "--admin-library-icon-size",
      "--admin-mobile-nav-height"
    ],
    figmaComponentSet: "SidebarNavigation",
    figmaVariableCollections: ["shell", "density", "semantic-color", "radius"],
    figmaVariantProperties: ["route=active|inactive|planned", "library=open|closed", "viewport=desktop|mobile"],
    grammarRoles: ["system", "control"],
    hierarchyRoles: ["context", "action"],
    nextLinearIssue: "GCC-119",
    openGaps: [
      "Lock tablet behavior for navigation library before PR #355 moves to Ready."
    ],
    qaEvidence: [
      "docs/ADMIN_CONSOLE_VISUAL_QA_LEDGER.md#Current Figma Mirror Evidence",
      "docs/ADMIN_CONSOLE_VISUAL_QA_LEDGER.md#Current Browser Evidence"
    ],
    react: {
      primarySurface: "src/components/primitives/workspace-sidebar.tsx#WorkspaceSidebar",
      propContract: ["brand", "pinnedApps", "navigationLibrary", "plannedRoutes", "safetyGate"],
      propValues: ["active", "planned", "open", "closed"],
      supportingSurfaces: [
        "src/components/primitives/workspace-sidebar.tsx#NavigationLibrary",
        "src/components/layout/app-sidebar.tsx#AppSidebar"
      ]
    },
    responsiveRules: [
      "Sidebar owns desktop navigation; mobile navigation stays a separate projection.",
      "Navigation library scrolling is local and must not scroll the body horizontally."
    ],
    stateSemantics: [
      "active marks the current owner page",
      "planned marks unavailable future routes",
      "library search filters route, panel, and utility entries"
    ]
  },
  {
    a11yRules: [
      "Gate text must state why the action is unavailable.",
      "Color cannot be the only signal for gated, unavailable, or fresh-MFA-required states."
    ],
    cssTokens: [
      "--admin-warning-bg",
      "--admin-warning-fg",
      "--admin-danger-bg",
      "--admin-danger-fg",
      "--admin-neutral-bg",
      "--admin-neutral-fg",
      "--admin-focus-ring",
      "--admin-touch-target-min"
    ],
    figmaComponentSet: "PrivilegedGate",
    figmaVariableCollections: ["semantic-color", "density"],
    figmaVariantProperties: ["state=hidden|gated|fresh-mfa-required|unavailable", "capability=readonly|super-admin"],
    grammarRoles: ["control", "state"],
    hierarchyRoles: ["state", "action", "evidence"],
    nextLinearIssue: "GCC-119",
    openGaps: [
      "Decide whether to extract a first-class PrivilegedGate primitive from current manifest and shell surfaces."
    ],
    qaEvidence: [
      "docs/ADMIN_CONSOLE_VISUAL_QA_LEDGER.md#Current Figma Mirror Evidence",
      "docs/ADMIN_CONSOLE_VISUAL_QA_LEDGER.md#Current Browser Evidence"
    ],
    react: {
      primarySurface: "src/app/admin-ui-contract.ts#ADMIN_PRIVILEGED_SURFACE_IDS",
      propContract: ["capabilityContext", "freshMfa", "allowedCapabilities", "entryGateSummary"],
      propValues: ["hidden", "gated", "fresh-mfa-required", "unavailable", "readonly", "super-admin"],
      supportingSurfaces: [
        "src/app/admin-app-manifest.ts#AdminCapabilityContext",
        "src/components/layout/app-sidebar.tsx#safetyGate",
        "src/components/layout/top-bar.tsx#Risk A gated chip"
      ]
    },
    responsiveRules: [
      "Privileged gates must remain visible or intentionally hidden by capability contract.",
      "Gate detail may collapse responsively but cannot create overflow."
    ],
    stateSemantics: [
      "hidden means unavailable to the current capability context",
      "gated means visible but blocked by a workflow gate",
      "fresh-mfa-required means detail access requires recent verification",
      "unavailable means backend or authority is not present"
    ]
  },
  {
    a11yRules: [
      "State feedback uses role status or alert when appropriate.",
      "Error and stale states must avoid raw backend or runtime details."
    ],
    cssTokens: [
      "--admin-info-bg",
      "--admin-info-fg",
      "--admin-warning-bg",
      "--admin-warning-fg",
      "--admin-danger-bg",
      "--admin-danger-fg",
      "--admin-neutral-bg",
      "--admin-neutral-fg",
      "--admin-radius-card",
      "--admin-density-normal-card-padding"
    ],
    figmaComponentSet: "StateFeedback",
    figmaVariableCollections: ["semantic-color", "density", "radius"],
    figmaVariantProperties: ["state=loading|empty|stale|error", "role=status|alert"],
    grammarRoles: ["state", "content"],
    hierarchyRoles: ["state", "evidence"],
    nextLinearIssue: "GCC-119",
    openGaps: [
      "Consolidate EmptyState and DataTable state rows into an explicit StateFeedback mapping."
    ],
    qaEvidence: [
      "docs/ADMIN_CONSOLE_VISUAL_QA_LEDGER.md#Current Figma Mirror Evidence",
      "docs/ADMIN_CONSOLE_VISUAL_QA_LEDGER.md#Current Browser Evidence"
    ],
    react: {
      primarySurface: "src/components/primitives/state-feedback.tsx#StateFeedback",
      propContract: ["title", "description", "chrome", "role", "tone", "checklist"],
      propValues: ["workstream", "case", "table", "none", "status", "alert", "empty", "loading", "stale", "error"],
      supportingSurfaces: [
        "src/components/primitives/empty-state.tsx#EmptyState",
        "src/components/primitives/data-table.tsx#DataTableState",
        "src/pages/admin-console-page-frame.tsx#EmptyState usage"
      ]
    },
    responsiveRules: [
      "State feedback must fit inside the owning panel or table row.",
      "State copy wraps locally and must not push shell controls out of view."
    ],
    stateSemantics: [
      "loading means pending safe data",
      "empty means no fixture or no result without implying production truth",
      "stale means evidence is old or trust-limited",
      "error means controlled unavailable state with redacted detail"
    ]
  }
] as const satisfies readonly AdminFigmaReactParityEntry[];

export const ADMIN_FIGMA_REACT_PARITY_READY_GATE = {
  source: "GCC-118",
  blocks: ["GCC-119", "GCC-120", "GCC-117", "PR #355 Ready review"],
  requiredEvidence: [
    "all required component sets have matrix entries",
    "every matrix entry maps to an existing React or contract surface",
    "every entry declares CSS semantic or layout tokens",
    "every entry declares responsive and accessibility rules",
    "every entry points to visual QA evidence"
  ]
} as const;
