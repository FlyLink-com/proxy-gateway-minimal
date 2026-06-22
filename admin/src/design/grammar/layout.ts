export const ADMIN_LAYOUT_ARCHETYPES = [
  "dashboard",
  "workspace",
  "table",
  "detail"
] as const;

export type AdminLayoutArchetype = (typeof ADMIN_LAYOUT_ARCHETYPES)[number];

export type AdminShellModel = "standard" | "immersive";
export type AdminContentFlow = "stack" | "split" | "grid";
export type AdminMobileStandardStatus = "pending-dedicated-standard";

export type AdminLayoutSpec = {
  id: AdminLayoutArchetype;
  shell: AdminShellModel;
  contentFlow: AdminContentFlow;
  maxPrimaryColumns: 1 | 2 | 3;
  mobileStandardStatus: AdminMobileStandardStatus;
  requiredMetadata: readonly [
    "data-page-id",
    "data-layout",
    "data-density",
    "data-ui-role"
  ];
};

export const ADMIN_LAYOUT_SPECS: Record<AdminLayoutArchetype, AdminLayoutSpec> = {
  dashboard: {
    id: "dashboard",
    shell: "standard",
    contentFlow: "stack",
    maxPrimaryColumns: 2,
    mobileStandardStatus: "pending-dedicated-standard",
    requiredMetadata: [
      "data-page-id",
      "data-layout",
      "data-density",
      "data-ui-role"
    ]
  },
  workspace: {
    id: "workspace",
    shell: "immersive",
    contentFlow: "split",
    maxPrimaryColumns: 2,
    mobileStandardStatus: "pending-dedicated-standard",
    requiredMetadata: [
      "data-page-id",
      "data-layout",
      "data-density",
      "data-ui-role"
    ]
  },
  table: {
    id: "table",
    shell: "standard",
    contentFlow: "stack",
    maxPrimaryColumns: 1,
    mobileStandardStatus: "pending-dedicated-standard",
    requiredMetadata: [
      "data-page-id",
      "data-layout",
      "data-density",
      "data-ui-role"
    ]
  },
  detail: {
    id: "detail",
    shell: "standard",
    contentFlow: "stack",
    maxPrimaryColumns: 1,
    mobileStandardStatus: "pending-dedicated-standard",
    requiredMetadata: [
      "data-page-id",
      "data-layout",
      "data-density",
      "data-ui-role"
    ]
  }
} as const;
