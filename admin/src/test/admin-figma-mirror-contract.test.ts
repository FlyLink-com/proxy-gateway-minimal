import { describe, expect, test } from "vitest";
import { ADMIN_UI_CONTRACT } from "../app/admin-ui-contract";
import {
  navItems,
  pageSubNavigation,
  pageTitles
} from "../app/navigation";
import {
  ADMIN_FIGMA_FILE_KEY,
  ADMIN_FIGMA_MIRROR_CONTRACT_VERSION,
  ADMIN_FIGMA_MIRROR_PAGES,
  ADMIN_FIGMA_REQUIRED_PAGE_NAMES,
  ADMIN_FIGMA_SOURCE_URL,
  ADMIN_FIGMA_WRITE_ACCESS_CHECK,
  ADMIN_VISUAL_QA_AXES
} from "../design/figma-mirror";

describe("admin Figma mirror contract", () => {
  test("declares the current Figma source and required mirror pages", () => {
    expect(ADMIN_FIGMA_MIRROR_CONTRACT_VERSION).toBe("admin-figma-mirror/v1");
    expect(ADMIN_FIGMA_FILE_KEY).toBe("EvQXTtJ2XnRfcGxRLTRt0B");
    expect(ADMIN_FIGMA_SOURCE_URL).toBe("https://www.figma.com/design/EvQXTtJ2XnRfcGxRLTRt0B");
    expect(ADMIN_FIGMA_REQUIRED_PAGE_NAMES).toEqual([
      "00 Requirements Map",
      "01 Design Tokens / Components",
      "02 Operations Overview / 1600x1024",
      "03 Accounts & Resources / 1600x1024",
      "04 Usage & Channels / 1600x1024",
      "05 Visual QA / Ledger"
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
      expect(matchingMirror[0].status).toBe("required");
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

  test("records the current Figma write blocker until edit access is granted", () => {
    expect(ADMIN_FIGMA_WRITE_ACCESS_CHECK.status).toBe("blocked");
    expect(ADMIN_FIGMA_WRITE_ACCESS_CHECK.checkedAt).toBe("2026-06-21");
    expect(ADMIN_FIGMA_WRITE_ACCESS_CHECK.attemptedOperation).toContain("create mirror pages");
    expect(ADMIN_FIGMA_WRITE_ACCESS_CHECK.authenticatedSeat).toBe("Dev / developer");
    expect(ADMIN_FIGMA_WRITE_ACCESS_CHECK.diagnosticResult).toContain("get_metadata can read");
    expect(ADMIN_FIGMA_WRITE_ACCESS_CHECK.diagnosticResult).toContain("use_figma read-only execution is denied");
    expect(ADMIN_FIGMA_WRITE_ACCESS_CHECK.connectorMessage).toMatch(/permission|view/i);
    expect(ADMIN_FIGMA_WRITE_ACCESS_CHECK.nextStep).toMatch(/Full Figma Design seat/i);
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
