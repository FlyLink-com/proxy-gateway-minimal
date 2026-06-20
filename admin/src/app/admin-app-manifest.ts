import {
  Activity,
  Bell,
  Boxes,
  ClipboardList,
  Code2,
  ExternalLink,
  Gauge,
  Grid2X2,
  HeartPulse,
  History,
  Lock,
  PackageCheck,
  PanelTopOpen,
  Radar,
  RefreshCw,
  Route,
  Settings,
  ShieldAlert,
  ShieldCheck,
  SlidersHorizontal,
  UsersRound,
  type LucideIcon
} from "lucide-react";
import {
  consoleSections,
  pageSubNavigation,
  pageTitles,
  type AdminPage,
  type PageSubNavigationItem,
  type PageWorkbenchRole
} from "./navigation";
import { type WorkbenchCategory } from "../components/primitives";

export type AdminAppKind = "page" | "plugin" | "utility" | "planned";
export type AdminAppStatus = "active" | "planned" | "locked";
export type AdminAppLibraryGroup =
  | "workspace-pages"
  | "plugins"
  | "console-settings"
  | "planned-apps";
export type AdminAppRouteAction = "navigate" | "openPlugin" | "openUtility" | "locked";
export type AdminAppRiskTier = "A" | "B" | "C";
export type AdminAppProductionImpact = "none" | "read-only" | "gated";
export type AdminAppCapability =
  | "view"
  | "inspect"
  | "comment"
  | "suggest-action"
  | "dry-run"
  | "execute"
  | "configure"
  | "develop"
  | "administer";

export type AdminAppManifest = {
  id: string;
  kind: AdminAppKind;
  label: string;
  description: string;
  icon: LucideIcon;
  iconKey: string;
  tone: string;
  status: AdminAppStatus;
  category: WorkbenchCategory;
  aliases: string[];
  owner: {
    page?: AdminPage;
    sectionId?: string;
    area: "Overview" | "User Operations" | "Platform Monitoring" | "System Settings";
    role: PageWorkbenchRole | "utility" | "planned";
  };
  route: {
    page?: AdminPage;
    targetId?: string;
    action: AdminAppRouteAction;
  };
  library: {
    group: AdminAppLibraryGroup;
    order: number;
    defaultPinned: boolean;
    searchableText: string[];
  };
  plugin?: {
    navId: string;
    ownerMode: PageSubNavigationItem["mode"];
    settingsEntry: "inline" | "appLibrary" | "both" | "none";
    allowedControls: Array<"hide" | "pin" | "resize" | "reorder" | "compact" | "expand" | "reset">;
    states: string[];
    boundaries: string[];
  };
  safety: {
    capabilities: AdminAppCapability[];
    riskTier: AdminAppRiskTier;
    productionImpact: AdminAppProductionImpact;
    redaction: "safe-summary-only";
    forbiddenFields: string[];
  };
};

export type AdminAppSearchIndexEntry = {
  resultType: AdminAppKind;
  appId: string;
  title: string;
  aliases: string[];
  ownerArea: string;
  pageId?: AdminPage;
  moduleNavId?: string;
  targetId?: string;
  safeSummary: string;
  state: AdminAppStatus;
  capabilities: AdminAppCapability[];
  riskTier: AdminAppRiskTier;
  entryGateSummary: string;
  routeTarget: string;
  searchText: string;
};

const FORBIDDEN_SEARCH_FIELD_PATTERNS = [
  /token/i,
  /secret/i,
  /credential/i,
  /subscription\s*url/i,
  /subscriptionUrl/i,
  /auth\s*header/i,
  /bearer/i,
  /password/i,
  /sqlite/i,
  /raw\s*(session|env|config|log|db|runtime|error|operator|subscription|material)/i
];

const PAGE_APP_DEFINITIONS: Record<AdminPage, {
  appId: string;
  iconKey: string;
  tone: string;
  category: WorkbenchCategory;
  role: PageWorkbenchRole;
  aliases: string[];
  capabilities: AdminAppCapability[];
}> = {
  dashboard: {
    aliases: ["overview", "health", "risk", "operator cockpit"],
    appId: "operations-overview",
    capabilities: ["view", "inspect", "suggest-action"],
    category: "monitoring",
    iconKey: "grid",
    role: "overview",
    tone: "nav-app-tone-blue"
  },
  portalRequests: {
    aliases: ["accounts", "resources", "orders", "quota", "lifecycle"],
    appId: "accounts-resources",
    capabilities: ["view", "inspect", "comment", "suggest-action", "dry-run"],
    category: "management",
    iconKey: "users",
    role: "decision-owner",
    tone: "nav-app-tone-emerald"
  },
  usageMonitor: {
    aliases: ["usage", "channels", "collector", "receipts", "freshness"],
    appId: "usage-channels",
    capabilities: ["view", "inspect", "suggest-action", "dry-run"],
    category: "monitoring",
    iconKey: "activity",
    role: "evidence-owner",
    tone: "nav-app-tone-cyan"
  }
};

const ICONS: Record<string, LucideIcon> = {
  activity: Activity,
  bell: Bell,
  boxes: Boxes,
  clipboard: ClipboardList,
  code: Code2,
  external: ExternalLink,
  gauge: Gauge,
  grid: Grid2X2,
  heart: HeartPulse,
  history: History,
  lock: Lock,
  package: PackageCheck,
  panel: PanelTopOpen,
  radar: Radar,
  refresh: RefreshCw,
  route: Route,
  settings: Settings,
  shield: ShieldCheck,
  shieldAlert: ShieldAlert,
  sliders: SlidersHorizontal,
  users: UsersRound
};

const PLUGIN_ICON_KEYS: Record<string, string> = {
  "account-overview": "users",
  "channel-coverage": "activity",
  "collection-anomalies": "bell",
  freshness: "radar",
  "health-summary": "heart",
  "history-events": "history",
  lifecycle: "refresh",
  "next-actions": "route",
  "quota-usage": "gauge",
  "receipts-collectors": "package",
  "resource-orders": "boxes",
  "risk-queue": "shieldAlert",
  "usage-ledger": "clipboard"
};

const PLUGIN_TONES: Record<string, string> = {
  "account-overview": "nav-app-tone-emerald",
  "channel-coverage": "nav-app-tone-cyan",
  "collection-anomalies": "nav-app-tone-red",
  freshness: "nav-app-tone-blue",
  "health-summary": "nav-app-tone-blue",
  "history-events": "nav-app-tone-slate",
  lifecycle: "nav-app-tone-violet",
  "next-actions": "nav-app-tone-indigo",
  "quota-usage": "nav-app-tone-lime",
  "receipts-collectors": "nav-app-tone-teal",
  "resource-orders": "nav-app-tone-teal",
  "risk-queue": "nav-app-tone-amber",
  "usage-ledger": "nav-app-tone-indigo"
};

const PLANNED_APP_DEFINITIONS: Record<string, {
  iconKey: string;
  tone: string;
  category: WorkbenchCategory;
  aliases: string[];
  capabilities: AdminAppCapability[];
}> = {
  "audit-workflow": {
    aliases: ["cases", "audit", "history", "workflow"],
    capabilities: ["view", "inspect", "comment"],
    category: "audit-workflow",
    iconKey: "clipboard",
    tone: "nav-app-tone-amber"
  },
  "platform-development": {
    aliases: ["platform", "channels", "nodes", "tools", "diagnostics"],
    capabilities: ["view", "develop", "dry-run"],
    category: "platform-tools",
    iconKey: "code",
    tone: "nav-app-tone-indigo"
  },
  "system-settings": {
    aliases: ["settings", "permissions", "safety", "operator preferences"],
    capabilities: ["view", "configure", "administer"],
    category: "configuration",
    iconKey: "sliders",
    tone: "nav-app-tone-slate"
  }
};

const UTILITY_APPS: AdminAppManifest[] = [
  createUtilityApp({
    aliases: ["alerts", "risk", "notification count"],
    capabilities: ["view"],
    description: "Risk notifications route back to the Operations Overview app.",
    iconKey: "bell",
    id: "utility.risk-notifications",
    label: "Risk notifications",
    order: 10,
    tone: "nav-app-tone-red"
  }),
  createUtilityApp({
    aliases: ["production", "read-only", "environment", "risk gate"],
    capabilities: ["view", "inspect"],
    description: "Current environment status. Production actions require a Risk A gate.",
    iconKey: "shield",
    id: "utility.environment",
    label: "Production",
    order: 20,
    tone: "nav-app-tone-emerald"
  }),
  createUtilityApp({
    aliases: ["preview", "website", "public shell"],
    capabilities: ["view"],
    description: "Open the public preview shell.",
    iconKey: "external",
    id: "utility.preview-site",
    label: "Preview site",
    order: 30,
    tone: "nav-app-tone-blue"
  }),
  createUtilityApp({
    aliases: ["user portal", "portal", "user view"],
    capabilities: ["view"],
    description: "Open the user-facing portal view.",
    iconKey: "external",
    id: "utility.user-portal",
    label: "Open user portal",
    order: 40,
    tone: "nav-app-tone-cyan"
  }),
  createUtilityApp({
    aliases: ["connection", "admin api", "configured", "local settings"],
    capabilities: ["view", "configure"],
    description: "Private Admin API connection status and local console settings.",
    iconKey: "settings",
    id: "utility.admin-api",
    label: "Admin API",
    order: 50
  })
];

export const adminAppManifest = Object.freeze([
  ...createWorkspacePageApps(),
  ...createPluginApps(),
  ...UTILITY_APPS,
  ...createPlannedApps()
]);

export function getWorkspacePageApps() {
  return adminAppManifest.filter((app) => app.library.group === "workspace-pages");
}

export function getPluginApps() {
  return adminAppManifest.filter((app) => app.library.group === "plugins");
}

export function getPlannedApps() {
  return adminAppManifest.filter((app) => app.library.group === "planned-apps");
}

export function getUtilityApps() {
  return adminAppManifest.filter((app) => app.library.group === "console-settings");
}

export function getWorkspacePageApp(page: AdminPage) {
  return getWorkspacePageApps().find((app) => app.route.page === page);
}

export function getPluginApp(navId: string, page?: AdminPage) {
  return getPluginApps().find((app) => (
    app.plugin?.navId === navId &&
    (!page || app.route.page === page)
  ));
}

export function getPlannedApp(sectionId: string) {
  return getPlannedApps().find((app) => app.owner.sectionId === sectionId);
}

export function createAppLibrarySearchIndex(apps: readonly AdminAppManifest[] = adminAppManifest): AdminAppSearchIndexEntry[] {
  return apps.map((app) => {
    const safeSummary = sanitizeSafeSearchText(app.description);
    const routeTarget = routeTargetForApp(app);
    const searchableParts = [
      app.label,
      ...app.aliases,
      app.owner.area,
      app.category,
      safeSummary,
      app.status,
      ...app.safety.capabilities,
      app.library.group,
      ...app.library.searchableText,
      routeTarget
    ];
    return {
      aliases: app.aliases,
      appId: app.id,
      capabilities: app.safety.capabilities,
      entryGateSummary: app.status === "planned" || app.status === "locked"
        ? safeSummary
        : "Available in the protected console workspace.",
      moduleNavId: app.plugin?.navId,
      ownerArea: app.owner.area,
      pageId: app.route.page,
      resultType: app.kind,
      riskTier: app.safety.riskTier,
      routeTarget,
      safeSummary,
      searchText: normalizeAppSearchText(searchableParts.join(" ")),
      state: app.status,
      targetId: app.route.targetId,
      title: app.label
    };
  });
}

export function normalizeAppSearchText(value: string) {
  return value.trim().toLocaleLowerCase();
}

export function matchesAppSearch(entry: Pick<AdminAppSearchIndexEntry, "searchText">, query: string) {
  const normalizedQuery = normalizeAppSearchText(query);
  return !normalizedQuery || entry.searchText.includes(normalizedQuery);
}

function createWorkspacePageApps(): AdminAppManifest[] {
  return consoleSections.flatMap((section, sectionIndex) => (
    section.items.map((item, itemIndex) => {
      const definition = PAGE_APP_DEFINITIONS[item.id];
      return {
        aliases: definition.aliases,
        category: definition.category,
        description: section.responsibility,
        icon: item.icon,
        iconKey: definition.iconKey,
        id: definition.appId,
        kind: "page",
        label: item.label,
        library: {
          defaultPinned: true,
          group: "workspace-pages",
          order: sectionIndex * 10 + itemIndex,
          searchableText: [
            section.label,
            section.description,
            section.responsibility,
            pageTitles[item.id]
          ]
        },
        owner: {
          area: pageOwnerArea(item.id),
          page: item.id,
          role: definition.role,
          sectionId: section.id
        },
        route: {
          action: "navigate",
          page: item.id
        },
        safety: {
          capabilities: definition.capabilities,
          forbiddenFields: forbiddenSearchFieldLabels(),
          productionImpact: "read-only",
          redaction: "safe-summary-only",
          riskTier: "B"
        },
        status: "active",
        tone: definition.tone
      } satisfies AdminAppManifest;
    })
  ));
}

function createPluginApps(): AdminAppManifest[] {
  return Object.entries(pageSubNavigation).flatMap(([page, modules]) => {
    const adminPage = page as AdminPage;
    return modules.map((module, index) => {
      const pageDefinition = PAGE_APP_DEFINITIONS[adminPage];
      const iconKey = PLUGIN_ICON_KEYS[module.id] ?? "panel";
      return {
        aliases: [
          module.id,
          module.owner,
          module.mode,
          pageTitles[adminPage],
          ...module.description.split(/[, ]+/).filter(Boolean).slice(0, 6)
        ],
        category: pluginCategoryForModule(module),
        description: module.description,
        icon: ICONS[iconKey] ?? PanelTopOpen,
        iconKey,
        id: `plugin.${module.id}`,
        kind: "plugin",
        label: module.label,
        library: {
          defaultPinned: false,
          group: "plugins",
          order: pageOrder(adminPage) * 100 + index,
          searchableText: [
            module.id,
            module.owner,
            module.mode,
            pageTitles[adminPage],
            module.description
          ]
        },
        owner: {
          area: module.owner,
          page: adminPage,
          role: pageDefinition.role
        },
        plugin: {
          allowedControls: ["hide", "resize", "reorder", "compact", "expand", "reset"],
          boundaries: [
            "safe-summary-only",
            "no production mutation",
            "no token, subscription URL, credential, or raw runtime data"
          ],
          navId: module.id,
          ownerMode: module.mode,
          settingsEntry: "both",
          states: ["visible", "hidden", "compact", "standard", "expanded"]
        },
        route: {
          action: "openPlugin",
          page: adminPage,
          targetId: module.targetId
        },
        safety: {
          capabilities: ["view", "inspect", "suggest-action"],
          forbiddenFields: forbiddenSearchFieldLabels(),
          productionImpact: "read-only",
          redaction: "safe-summary-only",
          riskTier: "B"
        },
        status: "active",
        tone: PLUGIN_TONES[module.id] ?? pageDefinition.tone
      } satisfies AdminAppManifest;
    });
  });
}

function createPlannedApps(): AdminAppManifest[] {
  return consoleSections
    .filter((section) => section.status === "planned")
    .map((section, index) => {
      const definition = PLANNED_APP_DEFINITIONS[section.id] ?? PLANNED_APP_DEFINITIONS["system-settings"];
      return {
        aliases: definition.aliases,
        category: definition.category,
        description: section.entryGate,
        icon: ICONS[definition.iconKey] ?? Lock,
        iconKey: definition.iconKey,
        id: `planned.${section.id}`,
        kind: "planned",
        label: section.label,
        library: {
          defaultPinned: false,
          group: "planned-apps",
          order: index,
          searchableText: [
            section.label,
            section.description,
            section.responsibility,
            section.entryGate
          ]
        },
        owner: {
          area: "System Settings",
          role: "planned",
          sectionId: section.id
        },
        route: {
          action: "locked"
        },
        safety: {
          capabilities: definition.capabilities,
          forbiddenFields: forbiddenSearchFieldLabels(),
          productionImpact: "gated",
          redaction: "safe-summary-only",
          riskTier: "A"
        },
        status: "planned",
        tone: definition.tone
      } satisfies AdminAppManifest;
    });
}

function createUtilityApp({
  aliases,
  capabilities,
  description,
  iconKey,
  id,
  label,
  order,
  tone
}: {
  aliases: string[];
  capabilities: AdminAppCapability[];
  description: string;
  iconKey: string;
  id: string;
  label: string;
  order: number;
  tone?: string;
}): AdminAppManifest {
  return {
    aliases,
    category: "configuration",
    description,
    icon: ICONS[iconKey] ?? Settings,
    iconKey,
    id,
    kind: "utility",
    label,
    library: {
      defaultPinned: false,
      group: "console-settings",
      order,
      searchableText: [
        label,
        description,
        ...aliases
      ]
    },
    owner: {
      area: "System Settings",
      role: "utility"
    },
    route: {
      action: "openUtility"
    },
    safety: {
      capabilities,
      forbiddenFields: forbiddenSearchFieldLabels(),
      productionImpact: "none",
      redaction: "safe-summary-only",
      riskTier: "B"
    },
    status: "active",
    tone: tone ?? (iconKey === "shield" ? "nav-app-tone-emerald" : "nav-app-tone-slate")
  };
}

function pageOwnerArea(page: AdminPage) {
  if (page === "dashboard") return "Overview";
  if (page === "portalRequests") return "User Operations";
  return "Platform Monitoring";
}

function pageOrder(page: AdminPage) {
  const pages: AdminPage[] = ["dashboard", "portalRequests", "usageMonitor"];
  return pages.indexOf(page);
}

function pluginCategoryForModule(module: PageSubNavigationItem): WorkbenchCategory {
  if (module.id === "risk-queue" || module.id === "next-actions") {
    return "audit-workflow";
  }
  if (module.owner === "User Operations") {
    return "management";
  }
  return "monitoring";
}

function routeTargetForApp(app: AdminAppManifest) {
  if (app.route.page && app.route.targetId) {
    return `${app.route.page}#${app.route.targetId}`;
  }
  if (app.route.page) {
    return app.route.page;
  }
  return app.id;
}

function sanitizeSafeSearchText(value: string) {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (FORBIDDEN_SEARCH_FIELD_PATTERNS.some((pattern) => pattern.test(normalized))) {
    return "[redacted unsafe search text]";
  }
  return normalized;
}

function forbiddenSearchFieldLabels() {
  return [
    "token",
    "secret",
    "credential",
    "subscription URL",
    "auth header",
    "raw session/env/config/log",
    "SQLite row",
    "raw runtime endpoint",
    "raw subscription material",
    "customer private identity/contact",
    "raw operator notes",
    "raw error stack",
    "unredacted case evidence"
  ];
}
