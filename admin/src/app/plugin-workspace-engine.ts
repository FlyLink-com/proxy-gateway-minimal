import {
  defaultModuleLayoutState,
  type ModuleLayoutState
} from "./plugin-layout-store";

export function restoreModuleLayoutState(baseLayout?: Partial<ModuleLayoutState>): ModuleLayoutState {
  return {
    ...defaultModuleLayoutState(),
    ...baseLayout,
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
