export type AdminUiDensity = "compact" | "normal" | "spacious";

export type AdminUiContract = {
  appShell: {
    contractId: "app-shell";
    owns: readonly [
      "topbar",
      "workspace-sidebar",
      "navigation-library",
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
  pluginFrame: {
    contractId: "panel-frame";
    owns: readonly [
      "panel-surface",
      "panel-header",
      "panel-toolbar",
      "hide-action",
      "panel-state-chrome"
    ];
    forbiddenPluginResponsibilities: readonly [
      "outer-panel-border",
      "outer-panel-radius",
      "outer-panel-shadow",
      "panel-header-layout",
      "panel-resize-controls",
      "panel-hide-controls",
      "loading-error-empty-chrome"
    ];
    density: AdminUiDensity;
  };
  density: {
    buttonMdHeight: "36px";
    inputHeight: "36px";
    tableRowHeight: "44px";
    panelPadding: "20px";
    pluginHeaderMinHeight: "48px";
    pageGap: "20px";
    sectionGap: "24px";
  };
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
      "navigation-library",
      "operator-account",
      "content-canvas"
    ]
  },
  density: {
    buttonMdHeight: "36px",
    inputHeight: "36px",
    panelPadding: "20px",
    pageGap: "20px",
    pluginHeaderMinHeight: "48px",
    sectionGap: "24px",
    tableRowHeight: "44px"
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
  pluginFrame: {
    contractId: "panel-frame",
    density: "normal",
    forbiddenPluginResponsibilities: [
      "outer-panel-border",
      "outer-panel-radius",
      "outer-panel-shadow",
      "panel-header-layout",
      "panel-resize-controls",
      "panel-hide-controls",
      "loading-error-empty-chrome"
    ],
    owns: [
      "panel-surface",
      "panel-header",
      "panel-toolbar",
      "hide-action",
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
