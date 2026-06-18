import { describe, expect, test } from "vitest";
import {
  hideModuleLayoutState,
  layoutFromResizeDrag,
  moveModuleBefore,
  resizeModuleLayoutState,
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
    expect(resizeModuleLayoutState(
      { height: "short", size: "small", visible: false },
      { size: "large" }
    )).toEqual({
      height: "short",
      size: "large",
      visible: true
    });

    expect(resizeModuleLayoutState(
      { height: "short", size: "small", visible: true },
      { visible: false }
    )).toEqual({
      height: "short",
      size: "small",
      visible: false
    });
  });

  test("turns edge drag distance into discrete width and height states", () => {
    expect(layoutFromResizeDrag("medium", "medium", "e", 90, 0)).toEqual({
      height: "medium",
      size: "large"
    });
    expect(layoutFromResizeDrag("medium", "medium", "w", 90, 0)).toEqual({
      height: "medium",
      size: "small"
    });
    expect(layoutFromResizeDrag("medium", "medium", "s", 0, 60)).toEqual({
      height: "tall",
      size: "medium"
    });
    expect(layoutFromResizeDrag("medium", "medium", "n", 0, 60)).toEqual({
      height: "short",
      size: "medium"
    });
    expect(layoutFromResizeDrag("medium", "medium", "e", 40, 40)).toEqual({
      height: "medium",
      size: "medium"
    });
    expect(layoutFromResizeDrag("medium", "medium", "se", 190, 130)).toEqual({
      height: "tall",
      size: "large"
    });
    expect(layoutFromResizeDrag("medium", "medium", "nw", 190, 130)).toEqual({
      height: "short",
      size: "small"
    });
    expect(layoutFromResizeDrag("small", "short", "nw", 999, 999)).toEqual({
      height: "short",
      size: "small"
    });
    expect(layoutFromResizeDrag("large", "tall", "se", 999, 999)).toEqual({
      height: "tall",
      size: "large"
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
