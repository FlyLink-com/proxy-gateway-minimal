import { type AdminPage } from "./navigation";

export const WORKSPACE_MODULE_VISIBLE_SIZE_PRESETS = ["compact", "standard", "wide", "full"] as const;
export type WorkspaceModuleVisibleSizePreset = typeof WORKSPACE_MODULE_VISIBLE_SIZE_PRESETS[number];
export type WorkspaceModuleSizePreset = WorkspaceModuleVisibleSizePreset | "hidden";

export type ModuleLayoutState = {
  appId: string;
  moduleId: string;
  order: number;
  pinned: boolean;
  sizePreset: WorkspaceModuleSizePreset;
  updatedAt: string;
  visible: boolean;
  workspaceId: AdminPage;
};

export type ModuleLayoutMap = Record<string, ModuleLayoutState>;

export type WorkspaceLayoutSnapshot = {
  moduleLayout: ModuleLayoutMap;
};

type ModuleWithNavId = {
  appId?: string;
  navId: string;
};

type StoredPageLayout = {
  version?: unknown;
  moduleLayout?: unknown;
};

export const WORKSPACE_LAYOUT_STORAGE_KEY = "globalcircle-admin-workspace-layout-v1";
export const WORKSPACE_LAYOUT_VERSION = 5;
export const WORKSPACE_LAYOUT_DEFAULT_UPDATED_AT = "system-default";

export function defaultModuleLayoutState(
  workspaceId: AdminPage,
  module: ModuleWithNavId,
  order = 0
): ModuleLayoutState {
  return {
    appId: module.appId ?? `plugin.${module.navId}`,
    moduleId: module.navId,
    order,
    pinned: false,
    sizePreset: "standard",
    updatedAt: WORKSPACE_LAYOUT_DEFAULT_UPDATED_AT,
    visible: true,
    workspaceId
  };
}

export function createDefaultModuleLayout(workspaceId: AdminPage, modules: ModuleWithNavId[]): ModuleLayoutMap {
  return Object.fromEntries(
    modules.map((module, order) => [module.navId, defaultModuleLayoutState(workspaceId, module, order)])
  );
}

export function loadWorkspaceLayout(
  page: AdminPage,
  modules: ModuleWithNavId[],
  defaultLayout: ModuleLayoutMap
): WorkspaceLayoutSnapshot {
  const storedPageLayout = readWorkspaceLayoutStore()[page] as StoredPageLayout | undefined;
  if (!isPlainObject(storedPageLayout) || storedPageLayout.version !== WORKSPACE_LAYOUT_VERSION) {
    return {
      moduleLayout: defaultLayout
    };
  }

  return {
    moduleLayout: mergeStoredModuleLayout(page, storedPageLayout.moduleLayout, modules, defaultLayout)
  };
}

export function persistWorkspaceLayout(page: AdminPage, snapshot: WorkspaceLayoutSnapshot) {
  const store = readWorkspaceLayoutStore();
  store[page] = {
    version: WORKSPACE_LAYOUT_VERSION,
    moduleLayout: snapshot.moduleLayout
  };
  writeWorkspaceLayoutStore(store);
}

export function isWorkspaceLayoutForModules(snapshot: WorkspaceLayoutSnapshot, modules: ModuleWithNavId[]) {
  const moduleNavIds = modules.map((module) => module.navId);
  return (
    Object.keys(snapshot.moduleLayout).length === moduleNavIds.length &&
    moduleNavIds.every((navId) => snapshot.moduleLayout[navId])
  );
}

function mergeStoredModuleLayout(
  workspaceId: AdminPage,
  storedLayout: unknown,
  modules: ModuleWithNavId[],
  defaultLayout: ModuleLayoutMap
): ModuleLayoutMap {
  const storedLayoutMap = isPlainObject(storedLayout) ? storedLayout : {};
  return Object.fromEntries(modules.map((module, order) => {
    const baseLayout = defaultLayout[module.navId] ?? defaultModuleLayoutState(workspaceId, module, order);
    const storedState = storedLayoutMap[module.navId];
    if (!isPlainObject(storedState)) {
      return [module.navId, baseLayout];
    }
    const storedVisible = typeof storedState.visible === "boolean" ? storedState.visible : baseLayout.visible;
    const storedSizePreset = normalizeStoredSizePreset(storedState.sizePreset, baseLayout.sizePreset);
    const visible = storedSizePreset === "hidden" ? false : storedVisible;
    const sizePreset = visible ? (storedSizePreset === "hidden" ? "standard" : storedSizePreset) : "hidden";

    return [
      module.navId,
      {
        ...baseLayout,
        order: isSafeOrder(storedState.order) ? storedState.order : baseLayout.order,
        pinned: typeof storedState.pinned === "boolean" ? storedState.pinned : baseLayout.pinned,
        sizePreset,
        updatedAt: typeof storedState.updatedAt === "string" && storedState.updatedAt.trim()
          ? storedState.updatedAt
          : baseLayout.updatedAt,
        visible
      }
    ];
  }));
}

function normalizeStoredSizePreset(value: unknown, fallback: WorkspaceModuleSizePreset): WorkspaceModuleSizePreset {
  if (value === "hidden") {
    return "hidden";
  }
  if (WORKSPACE_MODULE_VISIBLE_SIZE_PRESETS.includes(value as WorkspaceModuleVisibleSizePreset)) {
    return value as WorkspaceModuleVisibleSizePreset;
  }
  return fallback;
}

function isSafeOrder(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 && value < 1000;
}

function readWorkspaceLayoutStore(): Record<string, unknown> {
  if (!canUseLocalStorage()) {
    return {};
  }
  try {
    const storedValue = window.localStorage.getItem(WORKSPACE_LAYOUT_STORAGE_KEY);
    if (!storedValue) {
      return {};
    }
    const parsedValue: unknown = JSON.parse(storedValue);
    return isPlainObject(parsedValue) ? parsedValue : {};
  } catch {
    return {};
  }
}

function writeWorkspaceLayoutStore(store: Record<string, unknown>) {
  if (!canUseLocalStorage()) {
    return;
  }
  try {
    window.localStorage.setItem(WORKSPACE_LAYOUT_STORAGE_KEY, JSON.stringify(store));
  } catch {
    // Layout preferences are nice-to-have UI state; storage failures should not block the console.
  }
}

function canUseLocalStorage() {
  try {
    return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
  } catch {
    return false;
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === "object" && !Array.isArray(value);
}
