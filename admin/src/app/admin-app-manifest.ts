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
export type AdminAppEntryType = "workspace-app" | "plugin-module" | "planned-app" | "system-action";
export type AdminAppLayoutSize = "large" | "medium" | "compact" | "icon-only" | "hidden";
export type AdminAppRuntimeState = "normal" | "warning" | "blocked" | "readonly" | "planned" | "needs-config";
export type AdminAppVisibility = "pinned" | "library" | "hidden" | "locked";
export type AdminAppDataBoundary = "safe-summary-only";
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

export type AdminAppCatalogEntry = {
  appId: string;
  zhName: string;
  enName: string;
  category: WorkbenchCategory;
  primaryObjects: string[];
  coreViews: string[];
  searchableFields: string[];
  safetyBoundary: string;
  followUpTask: string;
};

export type AdminAppLayoutDefaults = {
  allowedSizes: AdminAppLayoutSize[];
  defaultPinned: boolean;
  size: AdminAppLayoutSize;
  visibility: AdminAppVisibility;
};

export type AdminAppAuthoringRoute = {
  action: AdminAppRouteAction;
  page?: AdminPage;
  routeTarget: string;
  targetId?: string;
};

export type AdminAppAuthoringManifest = {
  appId: string;
  title: string;
  subtitle: string;
  icon: string;
  entryType: AdminAppEntryType;
  category: WorkbenchCategory;
  primaryObject: string;
  capabilities: AdminAppCapability[];
  routes: AdminAppAuthoringRoute[];
  searchFields: string[];
  layoutDefaults: AdminAppLayoutDefaults;
  visibility: AdminAppVisibility;
  riskTier: AdminAppRiskTier;
  dataBoundary: AdminAppDataBoundary;
  state: AdminAppRuntimeState;
  forbiddenFields: string[];
};

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
  catalog: AdminAppCatalogEntry;
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
  searchableFields: string[];
  state: AdminAppStatus;
  capabilities: AdminAppCapability[];
  riskTier: AdminAppRiskTier;
  entryGateSummary: string;
  routeTarget: string;
  searchText: string;
};

export type AppLibrarySearchDocument = {
  appId: string;
  label: string;
  zhName: string;
  aliases: string[];
  safeDescription: string;
  category: WorkbenchCategory;
  ownerArea: string;
  routeTarget: string;
  capabilities: AdminAppCapability[];
  searchableFields: string[];
  libraryGroup: AdminAppLibraryGroup;
  status: AdminAppStatus;
};

export type AdminAppMap = {
  byId: Readonly<Record<string, AdminAppManifest>>;
  workspacePages: readonly AdminAppManifest[];
  plugins: readonly AdminAppManifest[];
  pluginsByPage: Readonly<Record<AdminPage, readonly AdminAppManifest[]>>;
  utilities: readonly AdminAppManifest[];
  plannedApps: readonly AdminAppManifest[];
  searchIndex: readonly AdminAppSearchIndexEntry[];
};

export const ADMIN_APP_AUTHORING_STANDARD = Object.freeze({
  requiredFields: [
    "appId",
    "title",
    "subtitle",
    "icon",
    "entryType",
    "category",
    "primaryObject",
    "capabilities",
    "routes",
    "searchFields",
    "layoutDefaults",
    "visibility",
    "riskTier",
    "dataBoundary",
    "state",
    "forbiddenFields"
  ],
  entryTypes: ["workspace-app", "plugin-module", "planned-app", "system-action"],
  layoutSizes: ["large", "medium", "compact", "icon-only", "hidden"],
  states: ["normal", "warning", "blocked", "readonly", "planned", "needs-config"],
  forbiddenFields: forbiddenSearchFieldLabels()
} satisfies {
  entryTypes: AdminAppEntryType[];
  forbiddenFields: string[];
  layoutSizes: AdminAppLayoutSize[];
  requiredFields: Array<keyof Pick<AdminAppAuthoringManifest,
    | "appId"
    | "title"
    | "subtitle"
    | "icon"
    | "entryType"
    | "category"
    | "primaryObject"
    | "capabilities"
    | "routes"
    | "searchFields"
    | "layoutDefaults"
    | "visibility"
    | "riskTier"
    | "dataBoundary"
    | "state"
    | "forbiddenFields"
  >>;
  states: AdminAppRuntimeState[];
});

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
  zhName: string;
  aliases: string[];
  primaryObjects: string[];
  coreViews: string[];
  searchableFields: string[];
  capabilities: AdminAppCapability[];
}> = {
  dashboard: {
    aliases: ["overview", "health", "risk", "operator cockpit"],
    appId: "operations-overview",
    capabilities: ["view", "inspect", "suggest-action"],
    category: "monitoring",
    coreViews: ["health summary", "risk queue", "next action routing"],
    iconKey: "grid",
    primaryObjects: ["platform health", "risk case", "activity event", "channel summary"],
    role: "overview",
    searchableFields: ["overview", "health", "risk", "freshness", "channel coverage", "next action"],
    zhName: "运营概览",
    tone: "nav-app-tone-blue"
  },
  portalRequests: {
    aliases: ["accounts", "resources", "orders", "quota", "lifecycle"],
    appId: "accounts-resources",
    capabilities: ["view", "inspect", "comment", "suggest-action", "dry-run"],
    category: "management",
    coreViews: ["account directory", "resources and orders", "quota and usage", "lifecycle", "history and events"],
    iconKey: "users",
    primaryObjects: ["user account", "resource", "order", "subscription artifact", "quota policy"],
    role: "decision-owner",
    searchableFields: ["account", "resource", "order", "artifact", "quota", "lifecycle"],
    zhName: "账号与资源",
    tone: "nav-app-tone-emerald"
  },
  usageMonitor: {
    aliases: ["usage", "channels", "collector", "receipts", "freshness"],
    appId: "usage-channels",
    capabilities: ["view", "inspect", "suggest-action", "dry-run"],
    category: "monitoring",
    coreViews: ["collection freshness", "channel coverage", "usage ledger", "collection anomalies", "receipts and collectors"],
    iconKey: "activity",
    primaryObjects: ["usage sample", "channel", "collector", "receipt", "safe edge reference"],
    role: "evidence-owner",
    searchableFields: ["usage", "channel", "collector", "receipt", "freshness", "anomaly"],
    zhName: "使用情况和渠道",
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

const PLUGIN_ZH_NAMES: Record<string, string> = {
  "account-overview": "账户目录",
  "channel-coverage": "通道覆盖范围",
  "collection-anomalies": "采集异常",
  freshness: "采集新鲜度",
  "health-summary": "健康概况",
  "history-events": "历史与事件",
  lifecycle: "生命周期",
  "next-actions": "后续行动",
  "quota-usage": "配额与使用情况",
  "receipts-collectors": "收据和采集器",
  "resource-orders": "资源与订单",
  "risk-queue": "风险队列",
  "usage-ledger": "使用情况账簿"
};

const PLUGIN_PRIMARY_OBJECTS: Record<string, string[]> = {
  "account-overview": ["user account", "resource count", "risk state", "recent activity"],
  "channel-coverage": ["issued channel", "measured channel", "receipt blocker"],
  "collection-anomalies": ["collector state", "delay signal", "zero usage candidate", "missing receipt candidate"],
  freshness: ["collection timestamp", "delay threshold", "trust state"],
  "health-summary": ["platform health", "risk count", "freshness", "channel coverage"],
  "history-events": ["object history", "case candidate", "audit event"],
  lifecycle: ["account lifecycle", "order pause", "expiry", "archive candidate"],
  "next-actions": ["review route", "owner page", "operator action"],
  "quota-usage": ["quota policy", "edited limit", "total usage", "quota risk"],
  "receipts-collectors": ["receipt state", "collector availability", "safe diagnostic"],
  "resource-orders": ["order", "resource", "entitlement", "subscription artifact"],
  "risk-queue": ["risk case", "account", "order", "usage", "channel"],
  "usage-ledger": ["account", "order", "channel", "measured usage"]
};

const PLANNED_APP_DEFINITIONS: Record<string, {
  iconKey: string;
  tone: string;
  category: WorkbenchCategory;
  zhName: string;
  aliases: string[];
  primaryObjects: string[];
  coreViews: string[];
  searchableFields: string[];
  capabilities: AdminAppCapability[];
}> = {
  "audit-workflow": {
    aliases: ["cases", "audit", "history", "workflow"],
    capabilities: ["view", "inspect", "comment"],
    category: "audit-workflow",
    coreViews: ["case inbox", "audit trail", "object timeline", "work-order routing"],
    iconKey: "clipboard",
    primaryObjects: ["case", "audit event", "object history", "work order"],
    searchableFields: ["case", "audit", "history", "workflow"],
    zhName: "审计与案例",
    tone: "nav-app-tone-amber"
  },
  "platform-development": {
    aliases: ["platform", "channels", "nodes", "tools", "diagnostics"],
    capabilities: ["view", "develop", "dry-run"],
    category: "platform-tools",
    coreViews: ["channel lab", "node readiness", "strategy tool", "safe diagnostics"],
    iconKey: "code",
    primaryObjects: ["node", "channel candidate", "dry-run packet", "diagnostic tool"],
    searchableFields: ["platform", "channel", "node", "tool", "diagnostic"],
    zhName: "平台开发",
    tone: "nav-app-tone-indigo"
  },
  "system-settings": {
    aliases: ["settings", "permissions", "safety", "operator preferences"],
    capabilities: ["view", "configure", "administer"],
    category: "configuration",
    coreViews: ["operator preferences", "permission policy", "refresh policy", "local console settings"],
    iconKey: "sliders",
    primaryObjects: ["operator setting", "environment profile", "permission", "safety policy"],
    searchableFields: ["settings", "permission", "safety", "operator preference"],
    zhName: "系统设置",
    tone: "nav-app-tone-slate"
  }
};

const UTILITY_APPS: AdminAppManifest[] = [
  createUtilityApp({
    aliases: ["alerts", "risk", "notification count"],
    capabilities: ["view"],
    coreViews: ["risk notification badge", "operations overview route"],
    description: "Risk notifications route back to the Operations Overview app.",
    iconKey: "bell",
    id: "utility.risk-notifications",
    label: "Risk notifications",
    order: 10,
    primaryObjects: ["risk notification", "operator route"],
    searchableFields: ["risk", "notification", "alert"],
    zhName: "风险通知",
    tone: "nav-app-tone-red"
  }),
  createUtilityApp({
    aliases: ["production", "read-only", "environment", "risk gate"],
    capabilities: ["view", "inspect"],
    coreViews: ["environment status", "Risk A gate reminder"],
    description: "Current environment status. Production actions require a Risk A gate.",
    iconKey: "shield",
    id: "utility.environment",
    label: "Production",
    order: 20,
    primaryObjects: ["environment profile", "production gate"],
    searchableFields: ["production", "environment", "read-only", "risk gate"],
    zhName: "生产环境",
    tone: "nav-app-tone-emerald"
  }),
  createUtilityApp({
    aliases: ["preview", "website", "public shell"],
    capabilities: ["view"],
    coreViews: ["public preview launcher"],
    description: "Open the public preview shell.",
    iconKey: "external",
    id: "utility.preview-site",
    label: "Preview site",
    order: 30,
    primaryObjects: ["public site", "preview route"],
    searchableFields: ["preview", "website", "public shell"],
    zhName: "预览网站",
    tone: "nav-app-tone-blue"
  }),
  createUtilityApp({
    aliases: ["user portal", "portal", "user view"],
    capabilities: ["view"],
    coreViews: ["user portal launcher"],
    description: "Open the user-facing portal view.",
    iconKey: "external",
    id: "utility.user-portal",
    label: "Open user portal",
    order: 40,
    primaryObjects: ["user portal", "customer view"],
    searchableFields: ["user portal", "portal", "user view"],
    zhName: "打开用户门户",
    tone: "nav-app-tone-cyan"
  }),
  createUtilityApp({
    aliases: ["connection", "admin api", "configured", "local settings"],
    capabilities: ["view", "configure"],
    coreViews: ["Admin API connection widget", "local console settings"],
    description: "Private Admin API connection status and local console settings.",
    iconKey: "settings",
    id: "utility.admin-api",
    label: "Admin API",
    order: 50,
    primaryObjects: ["Admin API connection", "local console setting"],
    searchableFields: ["admin api", "connection", "configured", "local settings"],
    zhName: "管理员 API"
  })
];

export const adminAppManifest = Object.freeze([
  ...createWorkspacePageApps(),
  ...createPluginApps(),
  ...UTILITY_APPS,
  ...createPlannedApps()
]);

export const adminAppMap = createAdminAppMap(adminAppManifest);

export const adminAppAuthoringManifest = createAdminAppAuthoringManifest(adminAppManifest);

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

export function getAdminAppMap(apps: readonly AdminAppManifest[] = adminAppManifest): AdminAppMap {
  if (apps === adminAppManifest) {
    return adminAppMap;
  }

  return createAdminAppMap(apps);
}

export function getAdminAppAuthoringManifest(apps: readonly AdminAppManifest[] = adminAppManifest): AdminAppAuthoringManifest[] {
  if (apps === adminAppManifest) {
    return adminAppAuthoringManifest;
  }

  return createAdminAppAuthoringManifest(apps);
}

export function createAppLibrarySearchIndex(apps: readonly AdminAppManifest[] = adminAppManifest): AdminAppSearchIndexEntry[] {
  return apps.map((app) => {
    const searchDocument = createAppLibrarySearchDocument(app);
    const searchableParts = [
      searchDocument.appId,
      searchDocument.label,
      searchDocument.zhName,
      ...searchDocument.aliases,
      searchDocument.ownerArea,
      searchDocument.category,
      searchDocument.safeDescription,
      ...searchDocument.searchableFields,
      searchDocument.status,
      ...searchDocument.capabilities,
      searchDocument.libraryGroup,
      searchDocument.routeTarget
    ];
    return {
      aliases: searchDocument.aliases,
      appId: searchDocument.appId,
      capabilities: searchDocument.capabilities,
      entryGateSummary: app.status === "planned" || app.status === "locked"
        ? searchDocument.safeDescription
        : "Available in the protected console workspace.",
      moduleNavId: app.plugin?.navId,
      ownerArea: app.owner.area,
      pageId: app.route.page,
      resultType: app.kind,
      riskTier: app.safety.riskTier,
      routeTarget: searchDocument.routeTarget,
      safeSummary: searchDocument.safeDescription,
      searchableFields: searchDocument.searchableFields,
      searchText: normalizeAppSearchText(searchableParts.join(" ")),
      state: app.status,
      targetId: app.route.targetId ? sanitizeSafeSearchText(app.route.targetId) : undefined,
      title: searchDocument.label
    };
  });
}

export function createAppLibrarySearchDocument(app: AdminAppManifest): AppLibrarySearchDocument {
  return {
    aliases: app.aliases.map(sanitizeSafeSearchText),
    appId: sanitizeSafeSearchText(app.id),
    capabilities: app.safety.capabilities.map(sanitizeSafeSearchText) as AdminAppCapability[],
    category: sanitizeSafeSearchText(app.category) as WorkbenchCategory,
    label: sanitizeSafeSearchText(app.label),
    libraryGroup: sanitizeSafeSearchText(app.library.group) as AdminAppLibraryGroup,
    ownerArea: sanitizeSafeSearchText(app.owner.area),
    routeTarget: sanitizeSafeSearchText(routeTargetForApp(app)),
    safeDescription: sanitizeSafeSearchText(app.description),
    searchableFields: safeSearchableFieldsForApp(app),
    status: sanitizeSafeSearchText(app.status) as AdminAppStatus,
    zhName: sanitizeSafeSearchText(app.catalog.zhName)
  };
}

export function normalizeAppSearchText(value: string) {
  return value.trim().toLocaleLowerCase();
}

export function matchesAppSearch(entry: Pick<AdminAppSearchIndexEntry, "searchText">, query: string) {
  const normalizedQuery = normalizeAppSearchText(query);
  return !normalizedQuery || entry.searchText.includes(normalizedQuery);
}

function createAdminAppMap(apps: readonly AdminAppManifest[]): AdminAppMap {
  const byId = Object.fromEntries(apps.map((app) => [app.id, app])) as Record<string, AdminAppManifest>;
  const byGroup = (group: AdminAppLibraryGroup) => (
    apps
      .filter((app) => app.library.group === group)
      .sort((a, b) => a.library.order - b.library.order)
  );
  const plugins = byGroup("plugins");
  const pluginsByPage = (Object.keys(pageSubNavigation) as AdminPage[]).reduce<Record<AdminPage, AdminAppManifest[]>>((acc, page) => {
    acc[page] = plugins.filter((app) => app.route.page === page);
    return acc;
  }, {
    dashboard: [],
    portalRequests: [],
    usageMonitor: []
  });

  return {
    byId,
    plannedApps: byGroup("planned-apps"),
    plugins,
    pluginsByPage,
    searchIndex: createAppLibrarySearchIndex(apps),
    utilities: byGroup("console-settings"),
    workspacePages: byGroup("workspace-pages")
  };
}

function createCatalogEntry(entry: AdminAppCatalogEntry): AdminAppCatalogEntry {
  return {
    ...entry,
    coreViews: [...entry.coreViews],
    primaryObjects: [...entry.primaryObjects],
    searchableFields: [...entry.searchableFields]
  };
}

function createAdminAppAuthoringManifest(apps: readonly AdminAppManifest[]): AdminAppAuthoringManifest[] {
  return apps.map((app) => ({
    appId: app.id,
    capabilities: [...app.safety.capabilities],
    category: app.category,
    dataBoundary: app.safety.redaction,
    entryType: entryTypeForApp(app.kind),
    forbiddenFields: [...app.safety.forbiddenFields],
    icon: app.iconKey,
    layoutDefaults: layoutDefaultsForApp(app),
    primaryObject: app.catalog.primaryObjects[0],
    riskTier: app.safety.riskTier,
    routes: [{
      action: app.route.action,
      page: app.route.page,
      routeTarget: routeTargetForApp(app),
      targetId: app.route.targetId
    }],
    searchFields: safeSearchableFieldsForApp(app),
    state: runtimeStateForApp(app),
    subtitle: app.catalog.zhName,
    title: app.catalog.enName,
    visibility: visibilityForApp(app)
  }));
}

function createWorkspacePageApps(): AdminAppManifest[] {
  return consoleSections.flatMap((section, sectionIndex) => (
    section.items.map((item, itemIndex) => {
      const definition = PAGE_APP_DEFINITIONS[item.id];
      return {
        aliases: definition.aliases,
        catalog: createCatalogEntry({
          appId: definition.appId,
          category: definition.category,
          coreViews: definition.coreViews,
          enName: item.label,
          followUpTask: "GCC-75 App Manifest and app authoring standard",
          primaryObjects: definition.primaryObjects,
          safetyBoundary: "Safe summary only; page owns supervision context without production mutation.",
          searchableFields: definition.searchableFields,
          zhName: definition.zhName
        }),
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
        catalog: createCatalogEntry({
          appId: `plugin.${module.id}`,
          category: pluginCategoryForModule(module),
          coreViews: [
            module.label,
            `${pageTitles[adminPage]} plugin restore route`,
            "local display controls"
          ],
          enName: module.label,
          followUpTask: "GCC-76 plugin container template and GCC-78 workspace engine",
          primaryObjects: PLUGIN_PRIMARY_OBJECTS[module.id] ?? [module.owner, module.label],
          safetyBoundary: "Safe summary only; plugin controls affect local layout, not runtime state.",
          searchableFields: [
            module.id,
            module.label,
            module.owner,
            module.mode,
            pageTitles[adminPage],
            ...module.description.split(/[, ]+/).filter(Boolean).slice(0, 8)
          ],
          zhName: PLUGIN_ZH_NAMES[module.id] ?? module.label
        }),
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
        catalog: createCatalogEntry({
          appId: `planned.${section.id}`,
          category: definition.category,
          coreViews: definition.coreViews,
          enName: section.label,
          followUpTask: "GCC-79 permission capability matrix before unlock",
          primaryObjects: definition.primaryObjects,
          safetyBoundary: "Locked planned app; requires explicit future backend and safety boundary before activation.",
          searchableFields: definition.searchableFields,
          zhName: definition.zhName
        }),
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
  coreViews,
  description,
  iconKey,
  id,
  label,
  order,
  primaryObjects,
  searchableFields,
  tone,
  zhName
}: {
  aliases: string[];
  capabilities: AdminAppCapability[];
  coreViews: string[];
  description: string;
  iconKey: string;
  id: string;
  label: string;
  order: number;
  primaryObjects: string[];
  searchableFields: string[];
  tone?: string;
  zhName: string;
}): AdminAppManifest {
  return {
    aliases,
    catalog: createCatalogEntry({
      appId: id,
      category: "configuration",
      coreViews,
      enName: label,
      followUpTask: "GCC-77 App Library search and safe indexing",
      primaryObjects,
      safetyBoundary: "Console utility only; no business-object ownership or production mutation.",
      searchableFields,
      zhName
    }),
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

function entryTypeForApp(kind: AdminAppKind): AdminAppEntryType {
  if (kind === "page") return "workspace-app";
  if (kind === "plugin") return "plugin-module";
  if (kind === "planned") return "planned-app";
  return "system-action";
}

function layoutDefaultsForApp(app: AdminAppManifest): AdminAppLayoutDefaults {
  if (app.kind === "page") {
    return {
      allowedSizes: ["large", "compact", "icon-only"],
      defaultPinned: true,
      size: "large",
      visibility: "pinned"
    };
  }

  if (app.kind === "plugin") {
    return {
      allowedSizes: ["large", "medium", "compact", "hidden"],
      defaultPinned: false,
      size: "medium",
      visibility: "library"
    };
  }

  if (app.kind === "planned") {
    return {
      allowedSizes: ["icon-only"],
      defaultPinned: false,
      size: "icon-only",
      visibility: "locked"
    };
  }

  return {
    allowedSizes: ["icon-only", "hidden"],
    defaultPinned: false,
    size: "icon-only",
    visibility: "library"
  };
}

function runtimeStateForApp(app: AdminAppManifest): AdminAppRuntimeState {
  if (app.kind === "planned" || app.status === "planned") return "planned";
  if (app.id === "utility.environment") return "readonly";
  if (app.id === "utility.admin-api") return "needs-config";
  return "normal";
}

function visibilityForApp(app: AdminAppManifest): AdminAppVisibility {
  if (app.kind === "planned") return "locked";
  if (app.library.defaultPinned) return "pinned";
  return "library";
}

function safeSearchableFieldsForApp(app: AdminAppManifest) {
  return app.catalog.searchableFields.map(sanitizeSafeSearchText);
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
