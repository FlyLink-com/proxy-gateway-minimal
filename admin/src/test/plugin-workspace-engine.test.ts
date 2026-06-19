import { describe, expect, test } from "vitest";
import {
  hideModuleLayoutState,
  mergeModuleLayoutState,
  restoreModuleLayoutState
} from "../app/plugin-workspace-engine";

describe("plugin workspace engine", () => {
  test("restores and hides modules through one visibility contract", () => {
    expect(restoreModuleLayoutState({ visible: false })).toEqual({
      visible: true
    });

    expect(hideModuleLayoutState({ visible: true })).toEqual({
      visible: false
    });
  });

  test("normalizes explicit panel changes as visible module state", () => {
    expect(mergeModuleLayoutState(
      { visible: false },
      {}
    )).toEqual({
      visible: true
    });

    expect(mergeModuleLayoutState(
      { visible: true },
      { visible: false }
    )).toEqual({
      visible: false
    });
  });
});
