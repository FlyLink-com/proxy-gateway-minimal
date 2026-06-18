import {
  defaultModuleLayoutState,
  type ModuleDisplaySize,
  type ModuleLayoutState
} from "./plugin-layout-store";

export const PLUGIN_DISPLAY_SIZES: ModuleDisplaySize[] = ["small", "medium", "large"];
export const PLUGIN_DISPLAY_MODE_LAYOUT: Record<ModuleDisplaySize, Pick<ModuleLayoutState, "height" | "size">> = {
  large: { height: "tall", size: "large" },
  medium: { height: "medium", size: "medium" },
  small: { height: "short", size: "small" }
};

export function restoreModuleLayoutState(baseLayout?: Partial<ModuleLayoutState>): ModuleLayoutState {
  return {
    ...defaultModuleLayoutState(),
    ...baseLayout,
    height: "medium",
    size: "medium",
    visible: true
  };
}

export function hideModuleLayoutState(baseLayout?: Partial<ModuleLayoutState>): ModuleLayoutState {
  return {
    ...defaultModuleLayoutState(),
    ...baseLayout,
    visible: false
  };
}

export function mergeModuleLayoutState(
  baseLayout: ModuleLayoutState,
  nextLayout: Partial<ModuleLayoutState>
): ModuleLayoutState {
  return {
    ...baseLayout,
    ...nextLayout,
    visible: nextLayout.visible ?? true
  };
}

export function displayModeLayoutState(displaySize: ModuleDisplaySize): Pick<ModuleLayoutState, "height" | "size" | "visible"> {
  return {
    ...PLUGIN_DISPLAY_MODE_LAYOUT[displaySize],
    visible: true
  };
}

export function moveModuleBefore(moduleOrder: string[], sourceNavId: string, targetNavId: string) {
  if (!sourceNavId || !targetNavId || sourceNavId === targetNavId) {
    return moduleOrder;
  }
  if (!moduleOrder.includes(sourceNavId) || !moduleOrder.includes(targetNavId)) {
    return moduleOrder;
  }
  const nextOrder = moduleOrder.filter((navId) => navId !== sourceNavId);
  const targetIndex = nextOrder.indexOf(targetNavId);
  if (targetIndex < 0) {
    return moduleOrder;
  }
  nextOrder.splice(targetIndex, 0, sourceNavId);
  return nextOrder;
}
