import { type AdminPage } from "./navigation";
import {
  type AdminDensityMode
} from "../design/grammar/density";
import {
  type AdminHierarchyRole
} from "../design/grammar/hierarchy";
import {
  type AdminLayoutArchetype,
  type AdminMobileProjection
} from "../design/grammar/layout";

export type AdminUiDensity = AdminDensityMode;

export const ADMIN_PRIVILEGED_SURFACE_IDS = [
  "key-management",
  "audit-center",
  "log-access"
] as const;

export type AdminPrivilegedSurfaceId = (typeof ADMIN_PRIVILEGED_SURFACE_IDS)[number];

export type AdminPageRequiredBlock =
  | "page-title"
  | "page-context"
  | "summary"
  | "primary-panel"
  | "status-chip"
  | "state-preview"
  | "owner-action"
  | "evidence-row";

export type AdminPageContract = {
  page: AdminPage;
  layout: AdminLayoutArchetype;
  density: AdminUiDensity;
  hierarchy: readonly AdminHierarchyRole[];
  requiredBlocks: readonly AdminPageRequiredBlock[];
  mobileProjection: AdminMobileProjection;
  forbiddenSurfaces: readonly AdminPrivilegedSurfaceId[];
};

export type AdminUiContract = {
  appShell: {
    contractId: "app-shell";
    owns: readonly [
      "topbar",
      "workspace-sidebar",
      "system-search",
      "operator-account",
      "content-canvas"
    ];
    density: AdminUiDensity;
  };
  pageFrame: {
    contractId: "page-frame";
    owns: readonly [
      "page-title",
      "page-description",
      "page-actions",
      "section-gap",
      "empty-state",
      "loading-state",
      "error-state"
    ];
    density: AdminUiDensity;
  };
  panelFrame: {
    contractId: "panel-frame";
    owns: readonly [
      "panel-surface",
      "panel-header",
      "panel-toolbar",
      "panel-state-chrome"
    ];
    forbiddenPanelResponsibilities: readonly [
      "outer-panel-border",
      "outer-panel-radius",
      "outer-panel-shadow",
      "panel-header-layout",
      "freeform-window-controls",
      "hide-restore-module-controls",
      "loading-error-empty-chrome"
    ];
    density: AdminUiDensity;
  };
  density: {
    buttonMdHeight: "44px";
    inputHeight: "44px";
    tableRowHeight: "44px";
    panelPadding: "20px";
    pluginHeaderMinHeight: "48px";
    pageGap: "20px";
    sectionGap: "24px";
  };
  viewportTargets: {
    desktopWorkbench: {
      contractId: "desktop-workbench";
      frame: "1600x1024";
      layoutModel: "multi-column-workbench";
      implementationMode: "primary-web-design";
    };
    mobileReview: {
      contractId: "mobile-review";
      frame: "390x844";
      layoutModel: "single-column-review-flow";
      implementationMode: "separate-mobile-projection";
      forbiddenLayoutReuse: readonly [
        "desktop-column-map",
        "desktop-plugin-grid",
        "desktop-card-density",
        "desktop-page-scroll-plan"
      ];
    };
  };
  pageContracts: Readonly<Record<AdminPage, AdminPageContract>>;
  styleLayers: readonly [
    "tokens",
    "base",
    "chrome",
    "components",
    "workspace",
    "pages",
    "utilities"
  ];
};

export const ADMIN_UI_CONTRACT: AdminUiContract = {
  appShell: {
    contractId: "app-shell",
    density: "normal",
    owns: [
      "topbar",
      "workspace-sidebar",
      "system-search",
      "operator-account",
      "content-canvas"
    ]
  },
  density: {
    buttonMdHeight: "44px",
    inputHeight: "44px",
    panelPadding: "20px",
    pageGap: "20px",
    pluginHeaderMinHeight: "48px",
    sectionGap: "24px",
    tableRowHeight: "44px"
  },
  viewportTargets: {
    desktopWorkbench: {
      contractId: "desktop-workbench",
      frame: "1600x1024",
      implementationMode: "primary-web-design",
      layoutModel: "multi-column-workbench"
    },
    mobileReview: {
      contractId: "mobile-review",
      forbiddenLayoutReuse: [
        "desktop-column-map",
        "desktop-plugin-grid",
        "desktop-card-density",
        "desktop-page-scroll-plan"
      ],
      frame: "390x844",
      implementationMode: "separate-mobile-projection",
      layoutModel: "single-column-review-flow"
    }
  },
  pageContracts: {
    dashboard: {
      density: "normal",
      forbiddenSurfaces: ADMIN_PRIVILEGED_SURFACE_IDS,
      hierarchy: ["metric", "context", "state", "action", "evidence"],
      layout: "dashboard",
      mobileProjection: "single-column-review-flow",
      page: "dashboard",
      requiredBlocks: [
        "page-title",
        "page-context",
        "summary",
        "primary-panel",
        "status-chip",
        "state-preview",
        "owner-action"
      ]
    },
    portalRequests: {
      density: "normal",
      forbiddenSurfaces: ADMIN_PRIVILEGED_SURFACE_IDS,
      hierarchy: ["context", "state", "evidence", "action", "detail"],
      layout: "table",
      mobileProjection: "single-column-review-flow",
      page: "portalRequests",
      requiredBlocks: [
        "page-title",
        "page-context",
        "primary-panel",
        "status-chip",
        "state-preview",
        "evidence-row",
        "owner-action"
      ]
    },
    usageMonitor: {
      density: "normal",
      forbiddenSurfaces: ADMIN_PRIVILEGED_SURFACE_IDS,
      hierarchy: ["metric", "context", "state", "evidence", "detail"],
      layout: "dashboard",
      mobileProjection: "single-column-review-flow",
      page: "usageMonitor",
      requiredBlocks: [
        "page-title",
        "page-context",
        "summary",
        "primary-panel",
        "status-chip",
        "state-preview",
        "evidence-row"
      ]
    }
  },
  pageFrame: {
    contractId: "page-frame",
    density: "normal",
    owns: [
      "page-title",
      "page-description",
      "page-actions",
      "section-gap",
      "empty-state",
      "loading-state",
      "error-state"
    ]
  },
  panelFrame: {
    contractId: "panel-frame",
    density: "normal",
    forbiddenPanelResponsibilities: [
      "outer-panel-border",
      "outer-panel-radius",
      "outer-panel-shadow",
      "panel-header-layout",
      "freeform-window-controls",
      "hide-restore-module-controls",
      "loading-error-empty-chrome"
    ],
    owns: [
      "panel-surface",
      "panel-header",
      "panel-toolbar",
      "panel-state-chrome"
    ]
  },
  styleLayers: [
    "tokens",
    "base",
    "chrome",
    "components",
    "workspace",
    "pages",
    "utilities"
  ]
} as const;

export function getAdminPageContract(page: AdminPage): AdminPageContract {
  return ADMIN_UI_CONTRACT.pageContracts[page];
}
