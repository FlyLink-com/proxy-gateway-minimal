import { type AdminPage } from "./navigation";

export type ModuleLayoutState = {
  visible: boolean;
};

export type ModuleLayoutMap = Record<string, ModuleLayoutState>;

export type WorkspaceLayoutSnapshot = {
  moduleLayout: ModuleLayoutMap;
};

type ModuleWithNavId = {
  navId: string;
};

type StoredPageLayout = {
  version?: unknown;
  moduleLayout?: unknown;
};

export const WORKSPACE_LAYOUT_STORAGE_KEY = "globalcircle-admin-workspace-layout-v1";
export const WORKSPACE_LAYOUT_VERSION = 4;

export function defaultModuleLayoutState(): ModuleLayoutState {
  return {
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
      moduleLayout: defaultLayout
    };
  }

  return {
    moduleLayout: mergeStoredModuleLayout(storedPageLayout.moduleLayout, modules, defaultLayout)
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
