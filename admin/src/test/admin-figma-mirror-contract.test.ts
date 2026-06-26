import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, test } from "vitest";
import { ADMIN_UI_CONTRACT } from "../app/admin-ui-contract";
import {
  navItems,
  pageSubNavigation,
  pageTitles
} from "../app/navigation";
import {
  ADMIN_FIGMA_ARCHIVE_FILE_KEY,
  ADMIN_FIGMA_ARCHIVE_SOURCE_URL,
  ADMIN_FIGMA_COMPONENT_MIRROR_STATUS,
  ADMIN_FIGMA_FILE_KEY,
  ADMIN_FIGMA_MIRROR_CONTRACT_VERSION,
  ADMIN_FIGMA_MIRROR_PAGES,
  ADMIN_FIGMA_REQUIRED_PAGE_NAMES,
  ADMIN_FIGMA_SOURCE_URL,
  ADMIN_FIGMA_WRITE_ACCESS_CHECK,
  ADMIN_VISUAL_QA_AXES
} from "../design/figma-mirror";
import {
  ADMIN_FIGMA_REACT_PARITY_CONTRACT_VERSION,
  ADMIN_FIGMA_REACT_PARITY_MATRIX,
  ADMIN_FIGMA_REACT_PARITY_READY_GATE,
  ADMIN_FIGMA_REACT_PARITY_REQUIRED_COMPONENTS
} from "../design/figma-parity";

const tokenCss = readFileSync(resolve("src/styles/tokens.css"), "utf8").replace(/\r\n?/g, "\n");

const runtimeSourceRoots = [
  "src/app",
  "src/components",
  "src/pages"
] as const;

function listSourceFiles(directory: string): string[] {
  return readdirSync(resolve(directory)).flatMap((entry) => {
    const entryPath = `${directory}/${entry}`;
    const stats = statSync(resolve(entryPath));
    if (stats.isDirectory()) {
      return listSourceFiles(entryPath);
    }
    return /\.(?:ts|tsx)$/.test(entry) ? [entryPath] : [];
  });
}

function surfacePath(surface: string) {
  return surface.split("#")[0];
}

describe("admin Figma mirror contract", () => {
  test("keeps Figma mirror metadata out of runtime Admin source", () => {
    const offendingImports = runtimeSourceRoots
      .flatMap((root) => listSourceFiles(root))
      .flatMap((filePath) => {
        const source = readFileSync(resolve(filePath), "utf8").replace(/\r\n?/g, "\n");
        return source.match(/from\s+["'][^"']*design\/figma-(?:mirror|parity)["']/)
          ? [filePath]
          : [];
      });

    expect(offendingImports).toEqual([]);
  });

  test("declares the current Figma source and required mirror frames", () => {
    expect(ADMIN_FIGMA_MIRROR_CONTRACT_VERSION).toBe("admin-figma-mirror/v1");
    expect(ADMIN_FIGMA_FILE_KEY).toBe("NefQiIMOPIBU28TIYcwQFE");
    expect(ADMIN_FIGMA_SOURCE_URL).toBe("https://www.figma.com/design/NefQiIMOPIBU28TIYcwQFE");
    expect(ADMIN_FIGMA_ARCHIVE_FILE_KEY).toBe("oZuKNtGPhP6oOQ0MSzpfvn");
    expect(ADMIN_FIGMA_ARCHIVE_SOURCE_URL).toBe("https://www.figma.com/design/oZuKNtGPhP6oOQ0MSzpfvn");
    expect(ADMIN_FIGMA_REQUIRED_PAGE_NAMES).toEqual([
      "00 Index & Project Map",
      "01 Design Rules V1-Polish",
      "02 Component Contract",
      "Product Baseline / Operations Overview",
      "Product Baseline / Accounts & Resources",
      "Product Baseline / Usage & Channels",
      "04 Figma-to-React Mapping",
      "90 Evidence Gates",
      "99 Archive / Source Handoff"
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
      expect(matchingMirror[0].nodeId).toMatch(/^24:/);
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
    expect(ADMIN_FIGMA_WRITE_ACCESS_CHECK.checkedAt).toBe("2026-06-25");
    expect(ADMIN_FIGMA_WRITE_ACCESS_CHECK.attemptedOperation).toContain("new clean baseline");
    expect(ADMIN_FIGMA_WRITE_ACCESS_CHECK.connectorReportedSeat).toBe("Dev / developer");
    expect(ADMIN_FIGMA_WRITE_ACCESS_CHECK.userReportedAccess).toMatch(/reported Full access/i);
    expect(ADMIN_FIGMA_WRITE_ACCESS_CHECK.desktopEvidence).toMatch(/clean GlobalCircle AI Admin UI Baseline/i);
    expect(ADMIN_FIGMA_WRITE_ACCESS_CHECK.sourceFileMismatch).toMatch(/archive lineage/i);
    expect(ADMIN_FIGMA_WRITE_ACCESS_CHECK.sourceFileMismatch).toContain(ADMIN_FIGMA_FILE_KEY);
    expect(ADMIN_FIGMA_WRITE_ACCESS_CHECK.diagnosticResult).toContain("all seven baseline pages");
    expect(ADMIN_FIGMA_WRITE_ACCESS_CHECK.connectorMessage).toMatch(/use_figma succeeded/i);
    expect(ADMIN_FIGMA_WRITE_ACCESS_CHECK.nextStep).toMatch(/clean baseline file/i);
    expect(ADMIN_FIGMA_WRITE_ACCESS_CHECK.nextStep).toMatch(/archive or lineage only/i);
  });

  test("records current clean-baseline component contract progress", () => {
    expect(ADMIN_FIGMA_COMPONENT_MIRROR_STATUS.sourceFile).toBe(ADMIN_FIGMA_FILE_KEY);
    expect(ADMIN_FIGMA_COMPONENT_MIRROR_STATUS.archiveFile).toBe(ADMIN_FIGMA_ARCHIVE_FILE_KEY);
    expect(ADMIN_FIGMA_COMPONENT_MIRROR_STATUS.pageLevelHandoff).toBe("current-clean-baseline");
    expect(ADMIN_FIGMA_COMPONENT_MIRROR_STATUS.componentSystemMirror).toBe("contract-baseline");
    expect(ADMIN_FIGMA_COMPONENT_MIRROR_STATUS.observedTopLevelPage).toBe("00 Index & Project Map");
    expect(ADMIN_FIGMA_COMPONENT_MIRROR_STATUS.observedComponentMirrorPage).toBe("02 Component Contract");
    expect(ADMIN_FIGMA_COMPONENT_MIRROR_STATUS.checkedAt).toBe("2026-06-25");
    expect(ADMIN_FIGMA_COMPONENT_MIRROR_STATUS.observedVisualSourcePage).toBe("03 Product Baseline Frames");
    expect(ADMIN_FIGMA_COMPONENT_MIRROR_STATUS.observedVisualSourceNodes).toEqual([
      "24:5",
      "24:35",
      "24:65"
    ]);
    expect(ADMIN_FIGMA_COMPONENT_MIRROR_STATUS.observedFrames).toContain("Product Baseline / Operations Overview");
    expect(ADMIN_FIGMA_COMPONENT_MIRROR_STATUS.observedFrames).toContain("90 Evidence Gates");
    expect(ADMIN_FIGMA_COMPONENT_MIRROR_STATUS.observedLocalComponentSetCount).toBe(0);
    expect(ADMIN_FIGMA_COMPONENT_MIRROR_STATUS.observedLocalComponentNodeCount).toBe(0);
    expect(ADMIN_FIGMA_COMPONENT_MIRROR_STATUS.observedLocalVariantCount).toBe(0);
    expect(ADMIN_FIGMA_COMPONENT_MIRROR_STATUS.observedLocalVariableCollectionCount).toBe(0);
    expect(ADMIN_FIGMA_COMPONENT_MIRROR_STATUS.observedLocalVariableCount).toBe(0);
    expect(ADMIN_FIGMA_COMPONENT_MIRROR_STATUS.observedLocalTextStyleCount).toBe(0);
    expect(ADMIN_FIGMA_COMPONENT_MIRROR_STATUS.observedLocalPaintStyleCount).toBe(0);
    expect(ADMIN_FIGMA_COMPONENT_MIRROR_STATUS.observedLocalEffectStyleCount).toBe(0);
    expect(ADMIN_FIGMA_COMPONENT_MIRROR_STATUS.observedComponentSets).toEqual([
      {
        name: "ShellRail",
        nodeId: "23:5",
        variantCount: 0
      },
      {
        name: "TopBar",
        nodeId: "23:11",
        variantCount: 0
      },
      {
        name: "MetricCard",
        nodeId: "23:17",
        variantCount: 0
      },
      {
        name: "StatusChip",
        nodeId: "23:23",
        variantCount: 0
      },
      {
        name: "PanelFrame",
        nodeId: "23:29",
        variantCount: 0
      },
      {
        name: "DataRowCompact",
        nodeId: "23:35",
        variantCount: 0
      },
      {
        name: "EvidenceSurface",
        nodeId: "23:41",
        variantCount: 0
      },
      {
        name: "StateFeedback",
        nodeId: "23:47",
        variantCount: 0
      },
      {
        name: "PrivilegedGate",
        nodeId: "23:53",
        variantCount: 0
      },
      {
        name: "Deprecated / SidebarNavigation",
        nodeId: "23:59",
        variantCount: 0
      }
    ]);
    expect(ADMIN_FIGMA_COMPONENT_MIRROR_STATUS.requiredComponentMirrors).toEqual([
      "ShellRail",
      "TopBar",
      "MetricCard",
      "StatusChip",
      "PanelFrame",
      "DataRowCompact",
      "EvidenceSurface",
      "PrivilegedGate",
      "StateFeedback"
    ]);
    expect(ADMIN_FIGMA_COMPONENT_MIRROR_STATUS.completedComponentMirrors).toEqual([
      "ShellRail",
      "TopBar",
      "MetricCard",
      "StatusChip",
      "PanelFrame",
      "DataRowCompact",
      "EvidenceSurface",
      "PrivilegedGate",
      "StateFeedback"
    ]);
    expect(ADMIN_FIGMA_COMPONENT_MIRROR_STATUS.pendingComponentMirrors).toEqual([]);
    expect(ADMIN_FIGMA_COMPONENT_MIRROR_STATUS.requiredVariantGroups).toContain("semantic-status");
    expect(ADMIN_FIGMA_COMPONENT_MIRROR_STATUS.figmaValidationEvidence).toEqual([
      "use_figma populated the clean baseline Index, Design Rules, Component Contract, Product Baseline Frames, Mapping, Evidence Gates, and Archive pages.",
      "Read-back inventory reported all seven pages populated.",
      "Light layout scan found no card text overflow.",
      "No stale Source file: oZuKNtGPhP6oOQ0MSzpfvn source-of-truth wording remains."
    ]);
    expect(ADMIN_FIGMA_COMPONENT_MIRROR_STATUS.nextTaskLine).toBe("Admin React/CSS source-boundary cleanup and browser visual QA against the clean baseline");
  });

  test("maps every mirrored component to React surfaces, grammar roles, tokens, and QA evidence", () => {
    expect(ADMIN_FIGMA_REACT_PARITY_CONTRACT_VERSION).toBe("admin-figma-react-parity/v1");
    expect(ADMIN_FIGMA_REACT_PARITY_REQUIRED_COMPONENTS).toEqual([
      "StatusChip",
      "MetricCard",
      "PanelFrame",
      "DataRow",
      "TopBar",
      "ShellRail",
      "PrivilegedGate",
      "StateFeedback"
    ]);
    expect(ADMIN_FIGMA_COMPONENT_MIRROR_STATUS.observedComponentSets.map((componentSet) => componentSet.name)).toContain(
      "Deprecated / SidebarNavigation"
    );
    expect(ADMIN_FIGMA_REACT_PARITY_MATRIX.map((entry) => entry.figmaComponentSet)).toEqual(
      ADMIN_FIGMA_REACT_PARITY_REQUIRED_COMPONENTS
    );

    ADMIN_FIGMA_REACT_PARITY_MATRIX.forEach((entry) => {
      expect(entry.figmaVariantProperties.length).toBeGreaterThan(0);
      expect(entry.figmaVariableCollections.length).toBeGreaterThan(0);
      expect(entry.grammarRoles.length).toBeGreaterThan(0);
      expect(entry.hierarchyRoles.length).toBeGreaterThan(0);
      expect(entry.react.propContract.length).toBeGreaterThan(0);
      expect(entry.react.propValues.length).toBeGreaterThan(0);
      expect(entry.stateSemantics.length).toBeGreaterThan(0);
      expect(entry.responsiveRules.length).toBeGreaterThan(0);
      expect(entry.a11yRules.length).toBeGreaterThan(0);
      expect(entry.qaEvidence).toEqual([
        "docs/ADMIN_CONSOLE_VISUAL_QA_LEDGER.md#Current Figma Mirror Evidence",
        "docs/ADMIN_CONSOLE_VISUAL_QA_LEDGER.md#Current Browser Evidence"
      ]);
      expect(entry.nextLinearIssue).toBe("GCC-119");

      [
        entry.react.primarySurface,
        ...entry.react.supportingSurfaces
      ].forEach((surface) => {
        expect(existsSync(resolve(surfacePath(surface))), surface).toBe(true);
      });

      entry.cssTokens.forEach((token) => {
        expect(token).toMatch(/^--admin-/);
        expect(tokenCss, `${entry.figmaComponentSet} missing token ${token}`).toContain(token);
      });
    });
  });

  test("declares the PR 355 ready gate dependency chain from parity to implementation and QA", () => {
    expect(ADMIN_FIGMA_REACT_PARITY_READY_GATE.source).toBe("GCC-118");
    expect(ADMIN_FIGMA_REACT_PARITY_READY_GATE.blocks).toEqual([
      "GCC-119",
      "GCC-120",
      "GCC-117",
      "PR #355 Ready review"
    ]);
    expect(ADMIN_FIGMA_REACT_PARITY_READY_GATE.requiredEvidence).toEqual([
      "all required component sets have matrix entries",
      "every matrix entry maps to an existing React or contract surface",
      "every entry declares CSS semantic or layout tokens",
      "every entry declares responsive and accessibility rules",
      "every entry points to visual QA evidence"
    ]);
  });

  test("defines the complete visual QA evidence axes", () => {
    expect(ADMIN_VISUAL_QA_AXES).toEqual([
      "figma-baseline",
      "dom-contract",
      "browser-desktop",
      "browser-responsive",
      "style-token-regression",
      "safe-data-boundary"
    ]);
  });
});
