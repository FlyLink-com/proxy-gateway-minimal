import {
  WORKSPACE_MODULE_VISIBLE_SIZE_PRESETS,
  type ModuleLayoutState,
  type WorkspaceModuleSizePreset,
  type WorkspaceModuleVisibleSizePreset
} from "./plugin-layout-store";

type WorkspaceLayoutMutationOptions = {
  updatedAt?: string;
};

export function restoreModuleLayoutState(
  baseLayout: ModuleLayoutState,
  options: WorkspaceLayoutMutationOptions = {}
): ModuleLayoutState {
  return {
    ...baseLayout,
    sizePreset: baseLayout.sizePreset === "hidden" ? "standard" : normalizeVisibleSizePreset(baseLayout.sizePreset),
    updatedAt: mutationTimestamp(options),
    visible: true
  };
}

export function hideModuleLayoutState(
  baseLayout: ModuleLayoutState,
  options: WorkspaceLayoutMutationOptions = {}
): ModuleLayoutState {
  return {
    ...baseLayout,
    sizePreset: "hidden",
    updatedAt: mutationTimestamp(options),
    visible: false
  };
}

export function setModuleSizePresetLayoutState(
  baseLayout: ModuleLayoutState,
  sizePreset: WorkspaceModuleSizePreset,
  options: WorkspaceLayoutMutationOptions = {}
): ModuleLayoutState {
  if (sizePreset === "hidden") {
    return hideModuleLayoutState(baseLayout, options);
  }
  return {
    ...baseLayout,
    sizePreset,
    updatedAt: mutationTimestamp(options),
    visible: true
  };
}

export function mergeModuleLayoutState(
  baseLayout: ModuleLayoutState,
  nextLayout: Partial<ModuleLayoutState>,
  options: WorkspaceLayoutMutationOptions = {}
): ModuleLayoutState {
  if (nextLayout.visible === false || nextLayout.sizePreset === "hidden") {
    return hideModuleLayoutState({ ...baseLayout, ...nextLayout }, options);
  }
  const nextSizePreset = nextLayout.sizePreset ?? (
    baseLayout.sizePreset === "hidden" ? "standard" : baseLayout.sizePreset
  );

  return {
    ...baseLayout,
    ...nextLayout,
    sizePreset: normalizeVisibleSizePreset(nextSizePreset),
    updatedAt: mutationTimestamp(options),
    visible: true
  };
}

function normalizeVisibleSizePreset(sizePreset: WorkspaceModuleSizePreset): WorkspaceModuleVisibleSizePreset {
  if (WORKSPACE_MODULE_VISIBLE_SIZE_PRESETS.includes(sizePreset as WorkspaceModuleVisibleSizePreset)) {
    return sizePreset as WorkspaceModuleVisibleSizePreset;
  }
  return "standard";
}

function mutationTimestamp(options: WorkspaceLayoutMutationOptions) {
  return options.updatedAt ?? new Date().toISOString();
}
