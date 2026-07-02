import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, test } from "vitest";
import {
  type AdminPage,
  navItems,
  pageSubNavigation,
  pageTitles
} from "../app/navigation";
import {
  ADMIN_FIGMA_ARCHIVE_FILE_KEY,
  ADMIN_FIGMA_ARCHIVE_SOURCE_URL,
  ADMIN_FIGMA_BASELINE_FREEZE,
  ADMIN_FIGMA_BASELINE_LAYOUT,
  ADMIN_FIGMA_COMPONENT_MIRROR_STATUS,
  ADMIN_FIGMA_FEATURE_ROUTE_COMPONENT_GAPS,
  ADMIN_FIGMA_FILE_KEY,
  ADMIN_FIGMA_MIRROR_CONTRACT_VERSION,
  ADMIN_FIGMA_MIRROR_PAGES,
  ADMIN_FIGMA_PLANNED_FEATURE_FRAMES,
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

const expectedBaselineNodes: Record<AdminPage, string> = {
  dashboard: "2:92",
  portalRequests: "2:262",
  usageMonitor: "2:432",
  userManagement: "59:4",
  orderManagement: "58:4",
  userAccessLogs: "57:4",
  userOperationLogs: "64:4",
  nodeHealth: "61:4",
  nodeLogs: "62:4",
  nodeBandwidth: "63:4"
};

const expectedBaselineFrameNames: Record<AdminPage, string> = {
  dashboard: "Operations Overview / Baseline / 1600x908",
  portalRequests: "Accounts & Resources / Baseline / 1600x908",
  usageMonitor: "Usage & Channels / Baseline / 1600x908",
  userManagement: "user-management",
  orderManagement: "order-management",
  userAccessLogs: "user-access-logs",
  userOperationLogs: "user-operation-logs",
  nodeHealth: "node-health",
  nodeLogs: "node-logs",
  nodeBandwidth: "Node Bandwidth Inspector / Baseline / 1600x908"
};

const expectedBaselineFrameSizes: Record<AdminPage, string> = {
  dashboard: "1600x908",
  portalRequests: "1600x908",
  usageMonitor: "1600x908",
  userManagement: "1600x1055",
  orderManagement: "1600x908",
  userAccessLogs: "1600x908",
  userOperationLogs: "1600x908",
  nodeHealth: "1600x908",
  nodeLogs: "1600x1076",
  nodeBandwidth: "1600x908"
};

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
      "Product Baseline / User Management",
      "Product Baseline / Order Management",
      "Product Baseline / User Access Logs",
      "Product Baseline / User Operation Logs",
      "Product Baseline / Node Health",
      "Product Baseline / Node Logs",
      "Product Baseline / Node Bandwidth",
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
      expect(matchingMirror[0].frameName).toBe(expectedBaselineFrameNames[navItem.id]);
      expect(matchingMirror[0].frameSize).toBe(expectedBaselineFrameSizes[navItem.id]);
      expect(matchingMirror[0].nodeId).toBe(expectedBaselineNodes[navItem.id]);
      expect(matchingMirror[0].status).toBe("current");
    });
  });

  test("freezes the accepted baseline source boundary and rejects retired route anchors", () => {
    expect(ADMIN_FIGMA_BASELINE_FREEZE).toMatchObject({
      activeFile: ADMIN_FIGMA_FILE_KEY,
      activeRouteFrameSize: "1600x908-plus-safe-read-variants",
      archivedFile: ADMIN_FIGMA_ARCHIVE_FILE_KEY,
      checkedAt: "2026-06-27",
      status: "phase-2-route-shell-complete-component-gap-open"
    });
    expect(ADMIN_FIGMA_BASELINE_FREEZE.activeRouteFrames).toEqual(expectedBaselineNodes);
    expect(ADMIN_FIGMA_BASELINE_FREEZE.frozenSurfaces).toEqual(expect.arrayContaining([
      "Active Figma source boundary",
      "Ten active route baseline frame IDs",
      "System Search replaces AppLibrary and NavigationLibrary",
      "Legacy page section deep links normalize to the owning page until section contracts are designed"
    ]));
    expect(ADMIN_FIGMA_BASELINE_FREEZE.notFrozen).toEqual(expect.arrayContaining([
      "Backend DTO/API integration",
      "Mobile layouts below 1024px",
      "Full reusable Figma component-set library",
      "Feature-specific table, filter, chart, log, and detail components for the seven safe-read route shells",
      "Feature-page DTO/API adapters for user, order, log, node health, node log, and bandwidth pages",
      "Runtime, auth model, schema, deployment, or production operations"
    ]));

    const currentDesignContractSource = [
      "src/design/figma-mirror.ts",
      "src/app/admin-evidence-contract.ts"
    ].map((filePath) => readFileSync(resolve(filePath), "utf8").replace(/\r\n?/g, "\n")).join("\n");
    expect(currentDesignContractSource).not.toMatch(/24:(?:5|35|65)|373:(?:716|866|1016)|99:(?:2|23)|104:(?:2|226)/);
  });

  test("freezes the local implementation geometry from the clean baseline", () => {
    expect(ADMIN_FIGMA_BASELINE_LAYOUT.source).toBe("GlobalCircle AI Admin UI Baseline 2026 06 25");
    expect(ADMIN_FIGMA_BASELINE_LAYOUT.sourceFile).toBe(ADMIN_FIGMA_FILE_KEY);
    expect(ADMIN_FIGMA_BASELINE_LAYOUT.frame).toEqual({
      height: 908,
      width: 1600
    });
    expect(ADMIN_FIGMA_BASELINE_LAYOUT.shellRail).toEqual({
      height: 908,
      width: 224,
      x: 0,
      y: 0
    });
    expect(ADMIN_FIGMA_BASELINE_LAYOUT.content).toEqual({
      width: 1296,
      x: 252
    });
    expect(ADMIN_FIGMA_BASELINE_LAYOUT.topBar).toMatchObject({
      height: 58,
      width: 1296,
      x: 252,
      y: 24
    });
    expect(ADMIN_FIGMA_BASELINE_LAYOUT.topBar.search).toEqual({
      maxWidth: 340,
      minGapFromRightCluster: 24,
      overflow: "ellipsis",
      role: "system-search"
    });
    expect(ADMIN_FIGMA_BASELINE_LAYOUT.metricGrid).toEqual({
      card: { height: 150, width: 300 },
      columns: 4,
      gap: 16,
      x: [276, 592, 908, 1224],
      y: 102
    });
    expect(ADMIN_FIGMA_BASELINE_LAYOUT.panelGrid).toEqual({
      card: { height: 260, width: 416 },
      columns: 3,
      gap: 24,
      x: [252, 692, 1132],
      y: 300
    });
    expect(ADMIN_FIGMA_BASELINE_LAYOUT.evidenceGrid).toEqual({
      card: { height: 280, width: 628 },
      columns: 2,
      gap: 40,
      x: [252, 920],
      y: 596
    });
    expect(ADMIN_FIGMA_BASELINE_LAYOUT.legacyResidueForbidden).toEqual([
      "AppLibrary",
      "NavigationLibrary",
      "hidden-module-restore",
      "drag-resize-windowing",
      "floating-section-subnav",
      "page-level-scroll-wall"
    ]);
    expect(ADMIN_FIGMA_BASELINE_LAYOUT.allowedCurrentInteractions).toEqual([
      "primary-route-switch",
      "system-search",
      "owner-page-safe-jump",
      "card-local-readonly-query"
    ]);
  });

  test("promotes the seven Figma safe-read query pages into route baselines", () => {
    expect(ADMIN_FIGMA_PLANNED_FEATURE_FRAMES).toHaveLength(7);
    expect(ADMIN_FIGMA_PLANNED_FEATURE_FRAMES.map((frame) => frame.manifestId)).toEqual([
      "user-management",
      "order-management",
      "user-access-logs",
      "user-operation-logs",
      "node-health",
      "node-logs",
      "node-bandwidth"
    ]);
    ADMIN_FIGMA_PLANNED_FEATURE_FRAMES.forEach((frame) => {
      expect(frame.implementationStatus).toBe("route-shell-only-component-gap-open");
      expect(frame.acceptanceGate).toMatch(/Read-only|read-only/);
    });
  });

  test("keeps the seven safe-read route shells separate from feature component completion", () => {
    expect(ADMIN_FIGMA_FEATURE_ROUTE_COMPONENT_GAPS).toHaveLength(7);
    expect(ADMIN_FIGMA_FEATURE_ROUTE_COMPONENT_GAPS.map((gap) => gap.manifestId)).toEqual(
      ADMIN_FIGMA_PLANNED_FEATURE_FRAMES.map((frame) => frame.manifestId)
    );

    ADMIN_FIGMA_FEATURE_ROUTE_COMPONENT_GAPS.forEach((gap) => {
      expect(gap.routeShellStatus).toBe("implemented");
      if (gap.manifestId === "user-access-logs" || gap.manifestId === "user-operation-logs") {
        expect(gap.localRenderer).toBe("audit-table-detail-page");
      } else {
        expect(gap.localRenderer).toBe("generic-safe-read-page");
      }
      expect(gap.missingComponentContracts.length).toBeGreaterThanOrEqual(4);
      expect(gap.missingDataContracts.length).toBeGreaterThanOrEqual(3);
      expect(gap.nextOwnerTask).toMatch(/^GCC-\d+$/);
    });
  });

  test("maps page mirrors to page-local module ownership", () => {
    ADMIN_FIGMA_MIRROR_PAGES
      .filter((page) => page.role === "page-mirror")
      .forEach((page) => {
        const adminPage = page.mapsToPages[0];
        const sectionLabels = pageSubNavigation[adminPage].map((section) => section.label);
        if (["dashboard", "portalRequests", "usageMonitor"].includes(adminPage)) {
          expect(sectionLabels.length).toBeGreaterThanOrEqual(3);
        } else {
          expect(sectionLabels).toEqual([]);
        }

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
    expect(ADMIN_FIGMA_WRITE_ACCESS_CHECK.diagnosticResult).toContain("product query frames");
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
      "2:92",
      "2:262",
      "2:432",
      "59:4",
      "58:4",
      "57:4",
      "64:4",
      "61:4",
      "62:4",
      "63:4"
    ]);
    expect(ADMIN_FIGMA_COMPONENT_MIRROR_STATUS.observedFrames).toContain("Operations Overview / Baseline / 1600x908");
    expect(ADMIN_FIGMA_COMPONENT_MIRROR_STATUS.observedFrames).toContain("Accounts & Resources / Baseline / 1600x908");
    expect(ADMIN_FIGMA_COMPONENT_MIRROR_STATUS.observedFrames).toContain("Usage & Channels / Baseline / 1600x908");
    expect(ADMIN_FIGMA_COMPONENT_MIRROR_STATUS.observedFrames).toContain("user-management");
    expect(ADMIN_FIGMA_COMPONENT_MIRROR_STATUS.observedFrames).toContain("node-health");
    expect(ADMIN_FIGMA_COMPONENT_MIRROR_STATUS.observedFrames).toContain("Node Bandwidth Inspector / Baseline / 1600x908");
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
      "Read-back inventory reports three owner pages plus seven safe-read query pages in Product Baseline Frames.",
      "The safe-read query pages are current baseline frames for route, manifest, and System Search carrying.",
      "Light layout scan found no card text overflow.",
      "No stale Source file: oZuKNtGPhP6oOQ0MSzpfvn source-of-truth wording remains."
    ]);
    expect(ADMIN_FIGMA_COMPONENT_MIRROR_STATUS.nextTaskLine).toBe("Admin React/CSS browser visual QA and ten-page baseline parity filtering against the clean baseline");
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
