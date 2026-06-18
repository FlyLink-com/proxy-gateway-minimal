import { describe, expect, test } from "vitest";
import {
  displayModeLayoutState,
  hideModuleLayoutState,
  moveModuleBefore,
  mergeModuleLayoutState,
  restoreModuleLayoutState
} from "../app/plugin-workspace-engine";

describe("plugin workspace engine", () => {
  test("restores and hides plugins through one layout contract", () => {
    expect(restoreModuleLayoutState({ height: "tall", size: "large", visible: false })).toEqual({
      height: "medium",
      size: "medium",
      visible: true
    });

    expect(hideModuleLayoutState({ height: "short", size: "small", visible: true })).toEqual({
      height: "short",
      size: "small",
      visible: false
    });
  });

  test("normalizes explicit size changes as visible plugin state", () => {
    expect(mergeModuleLayoutState(
      { height: "short", size: "small", visible: false },
      { height: "tall", size: "large" }
    )).toEqual({
      height: "tall",
      size: "large",
      visible: true
    });

    expect(mergeModuleLayoutState(
      { height: "short", size: "small", visible: true },
      { visible: false }
    )).toEqual({
      height: "short",
      size: "small",
      visible: false
    });
  });

  test("maps display modes to system-owned layout presets", () => {
    expect(displayModeLayoutState("large")).toEqual({
      height: "tall",
      size: "large",
      visible: true
    });
    expect(displayModeLayoutState("medium")).toEqual({
      height: "medium",
      size: "medium",
      visible: true
    });
    expect(displayModeLayoutState("small")).toEqual({
      height: "short",
      size: "small",
      visible: true
    });
  });

  test("reorders plugins without dropping unknown or duplicate targets", () => {
    expect(moveModuleBefore(["health", "risk", "actions"], "actions", "health")).toEqual([
      "actions",
      "health",
      "risk"
    ]);
    expect(moveModuleBefore(["health", "risk", "actions"], "missing", "health")).toEqual([
      "health",
      "risk",
      "actions"
    ]);
    expect(moveModuleBefore(["health", "risk", "actions"], "risk", "risk")).toEqual([
      "health",
      "risk",
      "actions"
    ]);
  });
});
