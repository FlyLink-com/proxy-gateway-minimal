import { type AdminPage } from "./navigation";

export type AdminUiReferenceKey =
  | "shadcn-ui"
  | "tremor"
  | "arco-design-pro"
  | "ant-design-pro"
  | "vben-admin";

export type AdminUiIntegrationMode =
  | "adopt-primitives-after-tailwind"
  | "port-patterns"
  | "study-layout-system"
  | "study-architecture-only";

export type AdminUiSurfaceKey =
  | "navigation-command"
  | "operations-health"
  | "operations-risk"
  | "operations-routing"
  | "account-directory"
  | "resource-orders"
  | "quota-usage"
  | "lifecycle-review"
  | "history-events"
  | "usage-freshness"
  | "channel-coverage"
  | "usage-ledger"
  | "collection-anomalies"
  | "receipts-collectors";

export type AdminUiReferenceSource = {
  key: AdminUiReferenceKey;
  label: string;
  sourceUrl: string;
  integrationMode: AdminUiIntegrationMode;
  directDependencyNow: boolean;
  stackFit: "native-react" | "react-pattern" | "template-pattern" | "vue-reference";
  useFor: string[];
  boundary: string;
};

export type AdminUiSurfaceReference = {
  key: AdminUiSurfaceKey;
  page?: AdminPage | "shell";
  label: string;
  primaryReference: AdminUiReferenceKey;
  supportingReferences: AdminUiReferenceKey[];
  implementationTarget: string;
};

export const ADMIN_UI_REFERENCE_SOURCES: AdminUiReferenceSource[] = [
  {
    boundary: "No direct install until Tailwind/shadcn config is bootstrapped and reviewed.",
    directDependencyNow: false,
    integrationMode: "adopt-primitives-after-tailwind",
    key: "shadcn-ui",
    label: "shadcn/ui",
    sourceUrl: "https://ui.shadcn.com/docs/installation/vite",
    stackFit: "native-react",
    useFor: [
      "navigation command library",
      "buttons and badges",
      "dialogs, sheets, popovers",
      "forms, tables, tabs, empty states"
    ]
  },
  {
    boundary: "Use dashboard patterns first; package adoption needs a React 19 compatibility review.",
    directDependencyNow: false,
    integrationMode: "port-patterns",
    key: "tremor",
    label: "Tremor",
    sourceUrl: "https://tremor.so/",
    stackFit: "react-pattern",
    useFor: [
      "platform health KPIs",
      "risk counters and sparklines",
      "usage ledger summaries",
      "traffic and channel monitoring charts"
    ]
  },
  {
    boundary: "Do not import the full template; use it for enterprise navigation and page-density rules.",
    directDependencyNow: false,
    integrationMode: "study-layout-system",
    key: "arco-design-pro",
    label: "Arco Design Pro",
    sourceUrl: "https://github.com/arco-design/arco-design-pro",
    stackFit: "template-pattern",
    useFor: [
      "enterprise console layout",
      "deep navigation structure",
      "account/resource management pages",
      "permission-aware future pages"
    ]
  },
  {
    boundary: "Do not import the full template; use it for mature admin interaction conventions.",
    directDependencyNow: false,
    integrationMode: "study-layout-system",
    key: "ant-design-pro",
    label: "Ant Design Pro",
    sourceUrl: "https://github.com/ant-design/ant-design-pro",
    stackFit: "template-pattern",
    useFor: [
      "data-heavy account operations",
      "table and filter workflows",
      "audit and case workflows",
      "enterprise status and permission patterns"
    ]
  },
  {
    boundary: "Vue-only reference for architecture ideas; never import into the React admin bundle.",
    directDependencyNow: false,
    integrationMode: "study-architecture-only",
    key: "vben-admin",
    label: "Vben Admin",
    sourceUrl: "https://github.com/vbenjs/vue-vben-admin",
    stackFit: "vue-reference",
    useFor: [
      "dynamic route and menu model",
      "theme preference architecture",
      "permission and role segmentation",
      "large admin workspace organization"
    ]
  }
];

export const ADMIN_UI_SURFACE_REFERENCES: AdminUiSurfaceReference[] = [
  {
    implementationTarget: "WorkspaceSidebar + system search command surface",
    key: "navigation-command",
    label: "Navigation command library",
    page: "shell",
    primaryReference: "shadcn-ui",
    supportingReferences: ["arco-design-pro", "ant-design-pro"]
  },
  {
    implementationTarget: "Operations Overview health summary panel and metric strip",
    key: "operations-health",
    label: "Operations health",
    page: "dashboard",
    primaryReference: "tremor",
    supportingReferences: ["shadcn-ui"]
  },
  {
    implementationTarget: "Operations Overview risk queue panel",
    key: "operations-risk",
    label: "Operations risk queue",
    page: "dashboard",
    primaryReference: "tremor",
    supportingReferences: ["ant-design-pro"]
  },
  {
    implementationTarget: "Operations Overview owner-route panel",
    key: "operations-routing",
    label: "Operations routing",
    page: "dashboard",
    primaryReference: "shadcn-ui",
    supportingReferences: ["arco-design-pro"]
  },
  {
    implementationTarget: "Accounts & Resources account directory",
    key: "account-directory",
    label: "Account directory",
    page: "portalRequests",
    primaryReference: "ant-design-pro",
    supportingReferences: ["arco-design-pro", "shadcn-ui"]
  },
  {
    implementationTarget: "Accounts & Resources resource/order table",
    key: "resource-orders",
    label: "Resources and orders",
    page: "portalRequests",
    primaryReference: "ant-design-pro",
    supportingReferences: ["arco-design-pro"]
  },
  {
    implementationTarget: "Quota policy and usage evidence panel",
    key: "quota-usage",
    label: "Quota and usage",
    page: "portalRequests",
    primaryReference: "tremor",
    supportingReferences: ["ant-design-pro"]
  },
  {
    implementationTarget: "Account/order lifecycle review lanes",
    key: "lifecycle-review",
    label: "Lifecycle review",
    page: "portalRequests",
    primaryReference: "ant-design-pro",
    supportingReferences: ["vben-admin"]
  },
  {
    implementationTarget: "Safe history and event timeline",
    key: "history-events",
    label: "History and events",
    page: "portalRequests",
    primaryReference: "ant-design-pro",
    supportingReferences: ["vben-admin"]
  },
  {
    implementationTarget: "Usage collection freshness panel",
    key: "usage-freshness",
    label: "Usage freshness",
    page: "usageMonitor",
    primaryReference: "tremor",
    supportingReferences: ["shadcn-ui"]
  },
  {
    implementationTarget: "Channel coverage monitor",
    key: "channel-coverage",
    label: "Channel coverage",
    page: "usageMonitor",
    primaryReference: "tremor",
    supportingReferences: ["arco-design-pro"]
  },
  {
    implementationTarget: "Usage ledger table and traffic summaries",
    key: "usage-ledger",
    label: "Usage ledger",
    page: "usageMonitor",
    primaryReference: "tremor",
    supportingReferences: ["ant-design-pro"]
  },
  {
    implementationTarget: "Collection anomaly queue",
    key: "collection-anomalies",
    label: "Collection anomalies",
    page: "usageMonitor",
    primaryReference: "tremor",
    supportingReferences: ["ant-design-pro"]
  },
  {
    implementationTarget: "Receipts and collectors diagnostics entry",
    key: "receipts-collectors",
    label: "Receipts and collectors",
    page: "usageMonitor",
    primaryReference: "arco-design-pro",
    supportingReferences: ["vben-admin"]
  }
];

export function getAdminUiReferenceSource(key: AdminUiReferenceKey) {
  return ADMIN_UI_REFERENCE_SOURCES.find((source) => source.key === key);
}

export function getAdminUiSurfaceReference(key: AdminUiSurfaceKey) {
  return ADMIN_UI_SURFACE_REFERENCES.find((surface) => surface.key === key);
}
