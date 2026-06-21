import { describe, expect, test } from "vitest";
import { ADMIN_UI_CONTRACT } from "../app/admin-ui-contract";
import {
  navItems,
  pageSubNavigation,
  pageTitles
} from "../app/navigation";
import {
  ADMIN_FIGMA_COMPONENT_MIRROR_STATUS,
  ADMIN_FIGMA_FILE_KEY,
  ADMIN_FIGMA_MIRROR_CONTRACT_VERSION,
  ADMIN_FIGMA_MIRROR_PAGES,
  ADMIN_FIGMA_REQUIRED_PAGE_NAMES,
  ADMIN_FIGMA_SOURCE_URL,
  ADMIN_FIGMA_WRITE_ACCESS_CHECK,
  ADMIN_VISUAL_QA_AXES
} from "../design/figma-mirror";

describe("admin Figma mirror contract", () => {
  test("declares the current Figma source and required mirror frames", () => {
    expect(ADMIN_FIGMA_MIRROR_CONTRACT_VERSION).toBe("admin-figma-mirror/v1");
    expect(ADMIN_FIGMA_FILE_KEY).toBe("oZuKNtGPhP6oOQ0MSzpfvn");
    expect(ADMIN_FIGMA_SOURCE_URL).toBe("https://www.figma.com/design/oZuKNtGPhP6oOQ0MSzpfvn");
    expect(ADMIN_FIGMA_REQUIRED_PAGE_NAMES).toEqual([
      "00 Contract & Build Order",
      "01 Operations Overview / 1600x1024",
      "02 Accounts & Resources / 1600x1024",
      "03 Usage & Channels / 1600x1024",
      "04 State & Safety Matrix",
      "05 GCC-103 Review Addendum / 1600x1024"
    ]);
    expect(new Set(ADMIN_FIGMA_REQUIRED_PAGE_NAMES).size).toBe(ADMIN_FIGMA_REQUIRED_PAGE_NAMES.length);
  });

  test("keeps one page mirror target for each active Admin route", () => {
    const pageMirrors = ADMIN_FIGMA_MIRROR_PAGES.filter((page) => page.role === "page-mirror");

    expect(pageMirrors).toHaveLength(navItems.length);

    navItems.forEach((navItem) => {
      const matchingMirror = pageMirrors.filter((page) => page.mapsToPages.includes(navItem.id));
      expect(matchingMirror).toHaveLength(1);
      expect(matchingMirror[0].name).toContain(pageTitles[navItem.id]);
      expect(matchingMirror[0].frameSize).toBe(ADMIN_UI_CONTRACT.viewportTargets.desktopWorkbench.frame);
      expect(matchingMirror[0].status).toBe("current");
    });
  });

  test("maps page mirrors to page-local module ownership", () => {
    ADMIN_FIGMA_MIRROR_PAGES
      .filter((page) => page.role === "page-mirror")
      .forEach((page) => {
        const adminPage = page.mapsToPages[0];
        const sectionLabels = pageSubNavigation[adminPage].map((section) => section.label);
        expect(sectionLabels.length).toBeGreaterThanOrEqual(3);

        page.acceptance.forEach((acceptanceItem) => {
          expect(acceptanceItem).not.toMatch(/raw token|subscription url|raw credential/i);
        });
      });
  });

  test("records the current Figma connector write path and remaining Share prompt guard", () => {
    expect(ADMIN_FIGMA_WRITE_ACCESS_CHECK.status).toBe("ready");
    expect(ADMIN_FIGMA_WRITE_ACCESS_CHECK.checkedAt).toBe("2026-06-21");
    expect(ADMIN_FIGMA_WRITE_ACCESS_CHECK.attemptedOperation).toContain("shared-plugin-data probe");
    expect(ADMIN_FIGMA_WRITE_ACCESS_CHECK.connectorReportedSeat).toBe("Dev / developer");
    expect(ADMIN_FIGMA_WRITE_ACCESS_CHECK.userReportedAccess).toMatch(/reported Full access/i);
    expect(ADMIN_FIGMA_WRITE_ACCESS_CHECK.desktopEvidence).toMatch(/canonical multi-page/i);
    expect(ADMIN_FIGMA_WRITE_ACCESS_CHECK.desktopEvidence).toMatch(/Full-seat upgrade prompt/i);
    expect(ADMIN_FIGMA_WRITE_ACCESS_CHECK.sourceFileMismatch).toMatch(/Previous recorded file key/i);
    expect(ADMIN_FIGMA_WRITE_ACCESS_CHECK.sourceFileMismatch).toContain(ADMIN_FIGMA_FILE_KEY);
    expect(ADMIN_FIGMA_WRITE_ACCESS_CHECK.diagnosticResult).toContain("get_metadata");
    expect(ADMIN_FIGMA_WRITE_ACCESS_CHECK.diagnosticResult).toContain("use_figma can execute");
    expect(ADMIN_FIGMA_WRITE_ACCESS_CHECK.diagnosticResult).toContain("write probe succeeded");
    expect(ADMIN_FIGMA_WRITE_ACCESS_CHECK.connectorMessage).toMatch(/use_figma succeeded/i);
    expect(ADMIN_FIGMA_WRITE_ACCESS_CHECK.nextStep).toMatch(/canonical handoff file/i);
    expect(ADMIN_FIGMA_WRITE_ACCESS_CHECK.nextStep).toMatch(/seat\/billing prompts/i);
  });

  test("separates current page-level handoff from the required component mirror line", () => {
    expect(ADMIN_FIGMA_COMPONENT_MIRROR_STATUS.sourceFile).toBe(ADMIN_FIGMA_FILE_KEY);
    expect(ADMIN_FIGMA_COMPONENT_MIRROR_STATUS.pageLevelHandoff).toBe("current");
    expect(ADMIN_FIGMA_COMPONENT_MIRROR_STATUS.componentSystemMirror).toBe("required");
    expect(ADMIN_FIGMA_COMPONENT_MIRROR_STATUS.observedTopLevelPage).toBe("Admin UI Handoff");
    expect(ADMIN_FIGMA_COMPONENT_MIRROR_STATUS.observedFrames).toContain("01 Operations Overview / 1600x1024");
    expect(ADMIN_FIGMA_COMPONENT_MIRROR_STATUS.observedFrames).toContain("08 Current Implementation / Usage & Channels / 1600w full-content capture");
    expect(ADMIN_FIGMA_COMPONENT_MIRROR_STATUS.observedLocalComponentCount).toBe(0);
    expect(ADMIN_FIGMA_COMPONENT_MIRROR_STATUS.observedLocalVariableCollectionCount).toBe(0);
    expect(ADMIN_FIGMA_COMPONENT_MIRROR_STATUS.observedLocalTextStyleCount).toBe(0);
    expect(ADMIN_FIGMA_COMPONENT_MIRROR_STATUS.observedLocalPaintStyleCount).toBe(0);
    expect(ADMIN_FIGMA_COMPONENT_MIRROR_STATUS.requiredComponentMirrors).toEqual([
      "PanelFrame",
      "MetricCard",
      "StatusChip",
      "DataTable / DataRow",
      "TopBar",
      "Sidebar / Navigation Library",
      "PrivilegedGate",
      "EmptyState / Loading / Stale / Error"
    ]);
    expect(ADMIN_FIGMA_COMPONENT_MIRROR_STATUS.requiredVariantGroups).toContain("semantic-status");
    expect(ADMIN_FIGMA_COMPONENT_MIRROR_STATUS.nextTaskLine).toBe("Admin Figma Component Mirror v1");
  });

  test("defines the complete visual QA evidence axes", () => {
    expect(ADMIN_VISUAL_QA_AXES).toEqual([
      "figma-mirror",
      "dom-contract",
      "browser-desktop",
      "browser-mobile",
      "style-token-regression",
      "safe-data-boundary"
    ]);
  });
});
