import { describe, expect, test } from "vitest";
import {
  ADMIN_FIXTURE_PREVIEW_DATA,
  getAdminFixturePreviewPanel,
  isAdminFixturePreviewEnabled,
  isAdminFixturePreviewHash
} from "../app/admin-fixture-preview";

const forbiddenFixtureTextPattern = /https?:\/\/|subscriptionUrl|token=|raw token|secret-value|password|private key|sqlite-row-value|edgecred_/i;

describe("admin fixture preview", () => {
  test("enables preview from explicit env values or fixture hash", () => {
    expect(isAdminFixturePreviewEnabled({ VITE_ADMIN_FIXTURE_PREVIEW: "true" }, "")).toBe(true);
    expect(isAdminFixturePreviewEnabled({ VITE_ADMIN_FIXTURE_PREVIEW: "1" }, "")).toBe(true);
    expect(isAdminFixturePreviewEnabled({ VITE_ADMIN_FIXTURE_PREVIEW: true }, "")).toBe(true);
    expect(isAdminFixturePreviewEnabled({ VITE_ADMIN_FIXTURE_PREVIEW: "false" }, "")).toBe(false);
    expect(isAdminFixturePreviewEnabled({}, "#/fixture-preview")).toBe(true);
    expect(isAdminFixturePreviewHash("#/fixture-preview/usage")).toBe(true);
    expect(isAdminFixturePreviewHash("#/portal-preview")).toBe(false);
  });

  test("keeps fixture preview data bounded and safe to render", () => {
    expect(ADMIN_FIXTURE_PREVIEW_DATA.schemaVersion).toBe("admin-fixture-preview/v1");
    expect(ADMIN_FIXTURE_PREVIEW_DATA.riskNotificationCount).toBe(2);

    const dashboardRiskQueue = getAdminFixturePreviewPanel("dashboard", "risk-queue");
    expect(dashboardRiskQueue.rows.map((row) => row.value)).toEqual([
      "acct_demo_02",
      "ord_demo_108"
    ]);

    const moduleCount = Object.values(ADMIN_FIXTURE_PREVIEW_DATA.modules)
      .flatMap((modules) => Object.values(modules))
      .length;
    expect(moduleCount).toBe(13);
    expect(JSON.stringify(ADMIN_FIXTURE_PREVIEW_DATA)).not.toMatch(forbiddenFixtureTextPattern);
  });
});
