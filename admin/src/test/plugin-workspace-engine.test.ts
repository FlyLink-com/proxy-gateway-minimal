import { describe, expect, test } from "vitest";
import { createDefaultModuleLayout } from "../app/plugin-layout-store";
import {
  hideModuleLayoutState,
  mergeModuleLayoutState,
  restoreModuleLayoutState,
  setModuleSizePresetLayoutState
} from "../app/plugin-workspace-engine";

describe("plugin workspace engine", () => {
  test("creates the workspace layout state required by the module visibility recovery contract", () => {
    const layout = createDefaultModuleLayout("dashboard", [
      { appId: "plugin.risk-queue", navId: "risk-queue" },
      { appId: "plugin.next-actions", navId: "next-actions" }
    ]);

    expect(layout["risk-queue"]).toEqual({
      appId: "plugin.risk-queue",
      moduleId: "risk-queue",
      order: 0,
      pinned: false,
      sizePreset: "standard",
      updatedAt: "system-default",
      visible: true,
      workspaceId: "dashboard"
    });
    expect(layout["next-actions"]?.order).toBe(1);
  });

  test("restores and hides modules through one visibility contract", () => {
    const baseLayout = createDefaultModuleLayout("dashboard", [
      { appId: "plugin.risk-queue", navId: "risk-queue" }
    ])["risk-queue"];

    expect(hideModuleLayoutState(baseLayout, { updatedAt: "2026-06-21T12:00:00.000Z" })).toEqual({
      ...baseLayout,
      sizePreset: "hidden",
      updatedAt: "2026-06-21T12:00:00.000Z",
      visible: false
    });

    expect(restoreModuleLayoutState({
      ...baseLayout,
      sizePreset: "hidden",
      visible: false
    }, { updatedAt: "2026-06-21T12:01:00.000Z" })).toEqual({
      ...baseLayout,
      sizePreset: "standard",
      updatedAt: "2026-06-21T12:01:00.000Z",
      visible: true
    });
  });

  test("normalizes explicit panel changes as visible preset state", () => {
    const baseLayout = createDefaultModuleLayout("dashboard", [
      { appId: "plugin.risk-queue", navId: "risk-queue" }
    ])["risk-queue"];

    expect(setModuleSizePresetLayoutState(baseLayout, "wide", { updatedAt: "2026-06-21T12:02:00.000Z" })).toEqual({
      ...baseLayout,
      sizePreset: "wide",
      updatedAt: "2026-06-21T12:02:00.000Z",
      visible: true
    });

    expect(mergeModuleLayoutState(
      {
        ...baseLayout,
        sizePreset: "hidden",
        visible: false
      },
      {},
      { updatedAt: "2026-06-21T12:03:00.000Z" }
    )).toEqual({
      ...baseLayout,
      sizePreset: "standard",
      updatedAt: "2026-06-21T12:03:00.000Z",
      visible: true
    });

    expect(mergeModuleLayoutState(
      baseLayout,
      { sizePreset: "hidden" },
      { updatedAt: "2026-06-21T12:04:00.000Z" }
    )).toEqual({
      ...baseLayout,
      sizePreset: "hidden",
      updatedAt: "2026-06-21T12:04:00.000Z",
      visible: false
    });
  });
});
