export type AdminUiDensity = "compact" | "normal" | "spacious";

export type AdminUiContract = {
  appShell: {
    contractId: "app-shell";
    owns: readonly [
      "topbar",
      "workspace-appbar",
      "app-library",
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
    contractId: "plugin-frame";
    owns: readonly [
      "plugin-card-surface",
      "plugin-header",
      "plugin-toolbar",
      "drag-handle",
      "display-mode-controls",
      "hide-action",
      "plugin-state-chrome"
    ];
    forbiddenPluginResponsibilities: readonly [
      "outer-card-border",
      "outer-card-radius",
      "outer-card-shadow",
      "plugin-header-layout",
      "plugin-resize-controls",
      "plugin-hide-controls",
      "loading-error-empty-chrome"
    ];
    density: AdminUiDensity;
  };
  density: {
    buttonMdHeight: "36px";
    inputHeight: "36px";
    tableRowHeight: "44px";
    cardPadding: "20px";
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
      "workspace-appbar",
      "app-library",
      "operator-account",
      "content-canvas"
    ]
  },
  density: {
    buttonMdHeight: "36px",
    cardPadding: "20px",
    inputHeight: "36px",
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
    contractId: "plugin-frame",
    density: "normal",
    forbiddenPluginResponsibilities: [
      "outer-card-border",
      "outer-card-radius",
      "outer-card-shadow",
      "plugin-header-layout",
      "plugin-resize-controls",
      "plugin-hide-controls",
      "loading-error-empty-chrome"
    ],
    owns: [
      "plugin-card-surface",
      "plugin-header",
      "plugin-toolbar",
      "drag-handle",
      "display-mode-controls",
      "hide-action",
      "plugin-state-chrome"
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
