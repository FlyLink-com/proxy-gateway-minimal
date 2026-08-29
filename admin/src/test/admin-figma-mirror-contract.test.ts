import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import * as ts from "typescript";
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
  ADMIN_FIGMA_PAGINATION_STANDARD,
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

function collectBindingIdentifiers(name: ts.BindingName, identifiers: Set<string>) {
  if (ts.isIdentifier(name)) {
    identifiers.add(name.text);
    return;
  }

  name.elements.forEach((element) => {
    if (ts.isBindingElement(element)) {
      collectBindingIdentifiers(element.name, identifiers);
    }
  });
}

function explicitExportNames(sourceFile: ts.SourceFile) {
  const identifiers = new Set<string>();

  sourceFile.statements.forEach((statement) => {
    if (ts.isExportAssignment(statement)) {
      if (!statement.isExportEquals) {
        identifiers.add("default");
      }
      return;
    }

    if (ts.isExportDeclaration(statement)) {
      if (statement.exportClause && ts.isNamedExports(statement.exportClause)) {
        statement.exportClause.elements.forEach((element) => identifiers.add(element.name.text));
      } else if (statement.exportClause && ts.isNamespaceExport(statement.exportClause)) {
        identifiers.add(statement.exportClause.name.text);
      }
      return;
    }

    const modifiers = ts.canHaveModifiers(statement) ? ts.getModifiers(statement) : undefined;
    if (!modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword)) {
      return;
    }

    if (modifiers.some((modifier) => modifier.kind === ts.SyntaxKind.DefaultKeyword)) {
      identifiers.add("default");
      return;
    }

    if (ts.isVariableStatement(statement)) {
      statement.declarationList.declarations.forEach((declaration) => {
        collectBindingIdentifiers(declaration.name, identifiers);
      });
      return;
    }

    if (
      ts.isFunctionDeclaration(statement) ||
      ts.isClassDeclaration(statement) ||
      ts.isInterfaceDeclaration(statement) ||
      ts.isTypeAliasDeclaration(statement) ||
      ts.isEnumDeclaration(statement)
    ) {
      if (statement.name) {
        identifiers.add(statement.name.text);
      }
    }
  });

  return identifiers;
}

function sourceUsesIdentifier(sourceFile: ts.SourceFile, identifier: string) {
  let found = false;

  function visit(node: ts.Node) {
    if (
      ts.isImportDeclaration(node) ||
      ts.isImportEqualsDeclaration(node) ||
      ts.isExportDeclaration(node)
    ) {
      return;
    }

    if (ts.isIdentifier(node) && node.text === identifier) {
      found = true;
      return;
    }

    if (!found) {
      ts.forEachChild(node, visit);
    }
  }

  visit(sourceFile);
  return found;
}

function readSurfaceSource(surfacePath: string) {
  const resolvedPath = resolve(surfacePath);
  const scriptKind = surfacePath.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const source = readFileSync(resolvedPath, "utf8");

  return {
    resolvedPath,
    sourceFile: ts.createSourceFile(surfacePath, source, ts.ScriptTarget.Latest, true, scriptKind)
  };
}

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
    expect(ADMIN_FIGMA_WRITE_ACCESS_CHECK.desktopEvidence).toMatch(/^Archival evidence:/);
    expect(ADMIN_FIGMA_WRITE_ACCESS_CHECK.desktopEvidence).toContain("GlobalCircle AI Admin UI Handoff");
    expect(ADMIN_FIGMA_WRITE_ACCESS_CHECK.desktopEvidence).toMatch(/Full-seat upgrade prompt/i);
    expect(ADMIN_FIGMA_WRITE_ACCESS_CHECK.sourceFileMismatch).toMatch(/Previous recorded file key/i);
    expect(ADMIN_FIGMA_WRITE_ACCESS_CHECK.sourceFileMismatch).toContain(ADMIN_FIGMA_FILE_KEY);
    expect(ADMIN_FIGMA_WRITE_ACCESS_CHECK.diagnosticResult).toContain("get_metadata");
    expect(ADMIN_FIGMA_WRITE_ACCESS_CHECK.diagnosticResult).toContain("use_figma can execute");
    expect(ADMIN_FIGMA_WRITE_ACCESS_CHECK.diagnosticResult).toContain("write probe succeeded");
    expect(ADMIN_FIGMA_WRITE_ACCESS_CHECK.connectorMessage).toMatch(/use_figma succeeded/i);
    expect(ADMIN_FIGMA_WRITE_ACCESS_CHECK.authorityBoundary).toMatch(/dated design evidence only/i);
    expect(ADMIN_FIGMA_WRITE_ACCESS_CHECK.authorityBoundary).toMatch(/not the current product identity/i);
    expect(ADMIN_FIGMA_WRITE_ACCESS_CHECK.authorityBoundary).toMatch(/production authority/i);
    expect(ADMIN_FIGMA_WRITE_ACCESS_CHECK.nextStep).toMatch(/dated design reference/i);
    expect(ADMIN_FIGMA_WRITE_ACCESS_CHECK.nextStep).toMatch(/seat\/billing prompts/i);
  });

  test("records current component mirror progress and closes the Figma component gap", () => {
    expect(ADMIN_FIGMA_COMPONENT_MIRROR_STATUS.sourceFile).toBe(ADMIN_FIGMA_FILE_KEY);
    expect(ADMIN_FIGMA_COMPONENT_MIRROR_STATUS.pageLevelHandoff).toBe("current");
    expect(ADMIN_FIGMA_COMPONENT_MIRROR_STATUS.componentSystemMirror).toBe("current");
    expect(ADMIN_FIGMA_COMPONENT_MIRROR_STATUS.observedTopLevelPage).toBe("Admin UI Handoff");
    expect(ADMIN_FIGMA_COMPONENT_MIRROR_STATUS.observedComponentMirrorPage).toBe("Admin Component Mirror v1");
    expect(ADMIN_FIGMA_COMPONENT_MIRROR_STATUS.observedFrames).toContain("01 Operations Overview / 1600x1024");
    expect(ADMIN_FIGMA_COMPONENT_MIRROR_STATUS.observedFrames).toContain("08 Current Implementation / Usage & Channels / 1600w full-content capture");
    expect(ADMIN_FIGMA_COMPONENT_MIRROR_STATUS.observedLocalComponentSetCount).toBe(8);
    expect(ADMIN_FIGMA_COMPONENT_MIRROR_STATUS.observedLocalComponentNodeCount).toBe(41);
    expect(ADMIN_FIGMA_COMPONENT_MIRROR_STATUS.observedLocalVariantCount).toBe(41);
    expect(ADMIN_FIGMA_COMPONENT_MIRROR_STATUS.observedLocalVariableCollectionCount).toBe(4);
    expect(ADMIN_FIGMA_COMPONENT_MIRROR_STATUS.observedLocalVariableCount).toBe(57);
    expect(ADMIN_FIGMA_COMPONENT_MIRROR_STATUS.observedLocalTextStyleCount).toBe(6);
    expect(ADMIN_FIGMA_COMPONENT_MIRROR_STATUS.observedLocalPaintStyleCount).toBe(0);
    expect(ADMIN_FIGMA_COMPONENT_MIRROR_STATUS.observedLocalEffectStyleCount).toBe(3);
    expect(ADMIN_FIGMA_COMPONENT_MIRROR_STATUS.observedComponentSets).toEqual([
      {
        name: "StatusChip",
        nodeId: "69:20",
        variantCount: 5
      },
      {
        name: "MetricCard",
        nodeId: "73:42",
        variantCount: 5
      },
      {
        name: "PanelFrame",
        nodeId: "74:178",
        variantCount: 8
      },
      {
        name: "DataRow",
        nodeId: "75:107",
        variantCount: 5
      },
      {
        name: "TopBar",
        nodeId: "79:88",
        variantCount: 4
      },
      {
        name: "SidebarNavigation",
        nodeId: "82:212",
        variantCount: 6
      },
      {
        name: "PrivilegedGate",
        nodeId: "83:62",
        variantCount: 4
      },
      {
        name: "StateFeedback",
        nodeId: "84:73",
        variantCount: 4
      }
    ]);
    expect(ADMIN_FIGMA_COMPONENT_MIRROR_STATUS.requiredComponentMirrors).toEqual([
      "PanelFrame",
      "MetricCard",
      "StatusChip",
      "DataTable / DataRow",
      "TopBar / System Search",
      "Sidebar / Primary Routes",
      "PrivilegedGate",
      "EmptyState / Loading / Stale / Error"
    ]);
    expect(ADMIN_FIGMA_COMPONENT_MIRROR_STATUS.completedComponentMirrors).toEqual([
      "PanelFrame",
      "MetricCard",
      "StatusChip",
      "DataTable / DataRow",
      "TopBar / System Search",
      "Sidebar / Primary Routes",
      "PrivilegedGate",
      "EmptyState / Loading / Stale / Error"
    ]);
    expect(ADMIN_FIGMA_COMPONENT_MIRROR_STATUS.pendingComponentMirrors).toEqual([]);
    expect(ADMIN_FIGMA_COMPONENT_MIRROR_STATUS.requiredVariantGroups).toContain("semantic-status");
    expect(ADMIN_FIGMA_COMPONENT_MIRROR_STATUS.figmaValidationEvidence).toEqual([
      "use_figma created MetricCard, PanelFrame, and DataRow component sets on Admin Component Mirror v1.",
      "use_figma created TopBar, SidebarNavigation, PrivilegedGate, and StateFeedback component sets on Admin Component Mirror v1.",
      "Final Figma inventory reported 8 component sets, 41 component nodes, 41 variants, 4 variable collections, 57 variables, 6 text styles, and 3 effect styles.",
      "Figma screenshot checks covered TopBar, SidebarNavigation, PrivilegedGate, and StateFeedback; SidebarNavigation, PrivilegedGate, and StateFeedback variant grids were resized after overlap detection."
    ]);
    expect(ADMIN_FIGMA_COMPONENT_MIRROR_STATUS.nextTaskLine).toBe("Admin React/CSS grammar alignment from Figma Component Mirror v1");
  });


  test("distinguishes public exports from internal and usage-only identifiers", () => {
    const fixture = ts.createSourceFile(
      "surface.ts",
      `
        import { ImportOnly } from "./dependency";
        const Internal = 1;
        type Shape = {};
        export { Internal as Public };
        export type { Shape as PublicShape };
        export const Direct = 2;
        export default function NamedDefault() {}
        void Internal;
      `,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TS
    );
    const exports = explicitExportNames(fixture);

    expect([...exports].sort()).toEqual(["Direct", "Public", "PublicShape", "default"]);
    expect(exports.has("Internal")).toBe(false);
    expect(exports.has("NamedDefault")).toBe(false);
    expect(sourceUsesIdentifier(fixture, "ImportOnly")).toBe(false);
    expect(sourceUsesIdentifier(fixture, "Internal")).toBe(true);

    const expressionDefault = ts.createSourceFile(
      "default-expression.ts",
      "export default 42;",
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TS
    );
    expect(explicitExportNames(expressionDefault)).toEqual(new Set(["default"]));
  });

  test("maps every mirrored component to React surfaces, grammar roles, tokens, and QA evidence", () => {
    expect(ADMIN_FIGMA_REACT_PARITY_CONTRACT_VERSION).toBe("admin-figma-react-parity/v2");
    expect(ADMIN_FIGMA_REACT_PARITY_REQUIRED_COMPONENTS).toEqual(
      ADMIN_FIGMA_COMPONENT_MIRROR_STATUS.observedComponentSets.map((componentSet) => componentSet.name)
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
        expect(surface.path).toMatch(/^src\/.+\.[cm]?[jt]sx?$/);
        expect(surface.symbol).toMatch(/^[A-Za-z_$][A-Za-z0-9_$]*$/);

        const resolvedSurfacePath = resolve(surface.path);
        expect(existsSync(resolvedSurfacePath), `${surface.kind}:${surface.path}#${surface.symbol}`).toBe(true);

        const { sourceFile } = readSurfaceSource(surface.path);
        if (surface.kind === "export") {
          expect(
            explicitExportNames(sourceFile).has(surface.symbol),
            `${surface.path} does not export "${surface.symbol}"`
          ).toBe(true);
        } else {
          expect(
            sourceUsesIdentifier(sourceFile, surface.symbol),
            `${surface.path} does not use "${surface.symbol}" outside imports or exports`
          ).toBe(true);
        }
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
      "figma-mirror",
      "dom-contract",
      "browser-desktop",
      "browser-tablet",
      "mobile-standard-pending",
      "pagination-containment",
      "style-token-regression",
      "safe-data-boundary"
    ]);
  });

  test("records the GCC-122 pagination and route-split gate from Figma", () => {
    expect(ADMIN_FIGMA_PAGINATION_STANDARD).toMatchObject({
      nodeId: "157:2",
      name: "19 GCC-122 Pagination Standard / 1600x1024",
      status: "current",
      frameSize: "1600x1024",
      mobileStatus: "pending-dedicated-standard",
      role: "implementation-gate"
    });
    expect(ADMIN_FIGMA_PAGINATION_STANDARD.requiredViewports).toEqual([
      "1600",
      "1280",
      "1024",
      "768"
    ]);
    expect(ADMIN_FIGMA_PAGINATION_STANDARD.containmentStrategies).toEqual([
      "pagination",
      "route-split",
      "bounded-internal-scroll"
    ]);
    expect(ADMIN_FIGMA_PAGINATION_STANDARD.usePaginationFor).toEqual(expect.arrayContaining([
      "users",
      "orders",
      "usage-ledgers",
      "audit-events",
      "candidate-queues"
    ]));
    expect(ADMIN_FIGMA_PAGINATION_STANDARD.doNotPaginate).toEqual(expect.arrayContaining([
      "health-cards",
      "kpi-summaries",
      "system-search",
      "action-chips"
    ]));
    expect(ADMIN_FIGMA_PAGINATION_STANDARD.compositionLimits).toEqual({
      maxOverviewModulesWithoutSubpages: 3,
      maxOwnerModulesPerSubpage: 2,
      ownerPagesRequireSubpages: true
    });
    expect(ADMIN_FIGMA_PAGINATION_STANDARD.acceptance).toEqual(expect.arrayContaining([
      "Each long card names pagination, route split, or bounded internal scroll before implementation.",
      "Mobile is not accepted from desktop reuse until a dedicated mobile standard frame is approved."
    ]));
  });
});
