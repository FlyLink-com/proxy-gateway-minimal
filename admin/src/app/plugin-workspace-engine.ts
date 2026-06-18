import {
  defaultModuleLayoutState,
  type ModuleDisplayHeight,
  type ModuleDisplaySize,
  type ModuleLayoutState
} from "./plugin-layout-store";

export type PluginResizeDirection = "n" | "e" | "s" | "w" | "ne" | "nw" | "se" | "sw";

export const PLUGIN_DISPLAY_SIZES: ModuleDisplaySize[] = ["small", "medium", "large"];
export const PLUGIN_DISPLAY_HEIGHTS: ModuleDisplayHeight[] = ["short", "medium", "tall"];
export const PLUGIN_RESIZE_DIRECTIONS: PluginResizeDirection[] = ["n", "e", "s", "w", "ne", "nw", "se", "sw"];
export const PLUGIN_RESIZE_HORIZONTAL_STEP = 170;
export const PLUGIN_RESIZE_VERTICAL_STEP = 110;

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

export function resizeModuleLayoutState(
  baseLayout: ModuleLayoutState,
  nextLayout: Partial<ModuleLayoutState>
): ModuleLayoutState {
  return {
    ...baseLayout,
    ...nextLayout,
    visible: nextLayout.visible ?? true
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

export function layoutFromResizeDrag(
  startSize: ModuleDisplaySize,
  startHeight: ModuleDisplayHeight,
  direction: PluginResizeDirection,
  deltaX: number,
  deltaY: number
): Pick<ModuleLayoutState, "height" | "size"> {
  const safeDeltaX = Number.isFinite(deltaX) ? deltaX : 0;
  const safeDeltaY = Number.isFinite(deltaY) ? deltaY : 0;
  const horizontalDelta = direction.includes("w")
    ? -safeDeltaX
    : direction.includes("e")
      ? safeDeltaX
      : 0;
  const verticalDelta = direction.includes("n")
    ? -safeDeltaY
    : direction.includes("s")
      ? safeDeltaY
      : 0;
  const horizontalSteps = direction.includes("e") || direction.includes("w")
    ? resizeStepFromDelta(horizontalDelta, PLUGIN_RESIZE_HORIZONTAL_STEP)
    : 0;
  const verticalSteps = direction.includes("n") || direction.includes("s")
    ? resizeStepFromDelta(verticalDelta, PLUGIN_RESIZE_VERTICAL_STEP)
    : 0;

  return {
    height: resizeDiscreteValue(PLUGIN_DISPLAY_HEIGHTS, startHeight, verticalSteps),
    size: resizeDiscreteValue(PLUGIN_DISPLAY_SIZES, startSize, horizontalSteps)
  };
}

function resizeStepFromDelta(delta: number, stepSize: number) {
  if (!Number.isFinite(delta) || !Number.isFinite(stepSize) || stepSize <= 0) {
    return 0;
  }
  return Math.round(delta / stepSize);
}

function resizeDiscreteValue<T extends string>(order: T[], startValue: T, steps: number): T {
  const startIndex = order.indexOf(startValue);
  const nextIndex = Math.min(
    order.length - 1,
    Math.max(0, Math.max(0, startIndex) + steps)
  );
  return order[nextIndex];
}
