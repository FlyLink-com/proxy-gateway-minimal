import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, test } from "vitest";

const adminCopyFiles = [
  "index.html",
  "src/components/primitives/case-workflow.tsx",
  "src/components/primitives/metric-card.tsx",
  "src/components/primitives/safe-ref.tsx",
  "src/components/primitives/workbench-container.tsx",
  "src/features/admin-case-workbench/case-candidates.ts",
  "src/features/admin-case-workbench/case-workbench.tsx",
  "src/features/admin-case-workbench/types.ts",
  "src/pages/dashboard-page.tsx",
  "src/pages/portal-requests-page.tsx",
  "src/pages/subscription-usage-monitor-page.tsx"
];

describe("Admin English copy contract", () => {
  test.each(adminCopyFiles)("%s uses English canonical operator-console copy", async (relativePath) => {
    const source = await readFile(join(process.cwd(), relativePath), "utf8");
    const chineseFragments = Array.from(source.matchAll(/[\p{Script=Han}]+/gu), (match) => match[0]);

    expect(chineseFragments).toEqual([]);
    expect(source).not.toContain("zh-CN");
    expect(source).not.toContain("：");
  });
});
