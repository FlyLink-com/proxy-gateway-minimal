import { type AdminPage } from "./navigation";

export type ModuleDisplaySize = "large" | "medium" | "small";
export type ModuleDisplayHeight = "short" | "medium" | "tall";

export type ModuleLayoutState = {
  visible: boolean;
  size: ModuleDisplaySize;
  height: ModuleDisplayHeight;
};

export type ModuleLayoutMap = Record<string, ModuleLayoutState>;

export type WorkspaceLayoutSnapshot = {
  moduleLayout: ModuleLayoutMap;
  moduleOrder: string[];
};

type ModuleWithNavId = {
  navId: string;
};

type StoredPageLayout = {
  version?: unknown;
  moduleLayout?: unknown;
  moduleOrder?: unknown;
};

export const WORKSPACE_LAYOUT_STORAGE_KEY = "globalcircle-admin-workspace-layout-v1";
export const WORKSPACE_LAYOUT_VERSION = 1;

export function defaultModuleLayoutState(): ModuleLayoutState {
  return {
    height: "medium",
    size: "medium",
    visible: true
  };
}

export function createDefaultModuleLayout(modules: ModuleWithNavId[]): ModuleLayoutMap {
  return Object.fromEntries(
    modules.map((module) => [module.navId, defaultModuleLayoutState()])
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
      moduleLayout: defaultLayout,
      moduleOrder: modules.map((module) => module.navId)
    };
  }

  return {
    moduleLayout: mergeStoredModuleLayout(storedPageLayout.moduleLayout, modules, defaultLayout),
    moduleOrder: mergeStoredModuleOrder(storedPageLayout.moduleOrder, modules)
  };
}

export function persistWorkspaceLayout(page: AdminPage, snapshot: WorkspaceLayoutSnapshot) {
  const store = readWorkspaceLayoutStore();
  store[page] = {
    version: WORKSPACE_LAYOUT_VERSION,
    moduleLayout: snapshot.moduleLayout,
    moduleOrder: snapshot.moduleOrder
  };
  writeWorkspaceLayoutStore(store);
}

export function isWorkspaceLayoutForModules(snapshot: WorkspaceLayoutSnapshot, modules: ModuleWithNavId[]) {
  const moduleNavIds = modules.map((module) => module.navId);
  const moduleNavIdSet = new Set(moduleNavIds);
  const orderedNavIdSet = new Set(snapshot.moduleOrder);
  return (
    moduleNavIdSet.size === snapshot.moduleOrder.length &&
    orderedNavIdSet.size === snapshot.moduleOrder.length &&
    moduleNavIds.every((navId) => (
      orderedNavIdSet.has(navId) &&
      snapshot.moduleLayout[navId]
    ))
  );
}

function mergeStoredModuleOrder(storedOrder: unknown, modules: ModuleWithNavId[]) {
  const defaultOrder = modules.map((module) => module.navId);
  const validNavIds = new Set(defaultOrder);
  const restoredOrder = Array.isArray(storedOrder)
    ? storedOrder.filter((navId): navId is string => (
      typeof navId === "string" &&
      validNavIds.has(navId)
    ))
    : [];
  const uniqueRestoredOrder = Array.from(new Set(restoredOrder));
  return [
    ...uniqueRestoredOrder,
    ...defaultOrder.filter((navId) => !uniqueRestoredOrder.includes(navId))
  ];
}

function mergeStoredModuleLayout(
  storedLayout: unknown,
  modules: ModuleWithNavId[],
  defaultLayout: ModuleLayoutMap
): ModuleLayoutMap {
  const storedLayoutMap = isPlainObject(storedLayout) ? storedLayout : {};
  return Object.fromEntries(modules.map((module) => {
    const baseLayout = defaultLayout[module.navId] ?? defaultModuleLayoutState();
    const storedState = storedLayoutMap[module.navId];
    if (!isPlainObject(storedState)) {
      return [module.navId, baseLayout];
    }
    return [
      module.navId,
      {
        height: isModuleDisplayHeight(storedState.height) ? storedState.height : baseLayout.height,
        size: isModuleDisplaySize(storedState.size) ? storedState.size : baseLayout.size,
        visible: typeof storedState.visible === "boolean" ? storedState.visible : baseLayout.visible
      }
    ];
  }));
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

function isModuleDisplaySize(value: unknown): value is ModuleDisplaySize {
  return value === "large" || value === "medium" || value === "small";
}

function isModuleDisplayHeight(value: unknown): value is ModuleDisplayHeight {
  return value === "short" || value === "medium" || value === "tall";
}
