import assert from "node:assert/strict";
import test from "node:test";
import {
  compareNormalizedText,
  inspectProductionArtifactBoundary
} from "../services/platform/production-artifact-boundary.mjs";

test("production artifact boundary accepts a clean runtime source manifest", () => {
  const report = inspectProductionArtifactBoundary({
    paths: [
      "package.json",
      "index.mjs",
      "server/app.mjs",
      "server/services/platform/subscription-control-db.mjs",
      "admin/dist-portal/index.html",
      "docs/PROJECT_CONTEXT.md",
      "config/proxy-servers.json"
    ]
  });

  assert.equal(report.ok, true);
  assert.equal(report.blockers.length, 0);
  assert.deepEqual(report.reviewRequired.map((item) => item.path), [
    "config/proxy-servers.json"
  ]);
});

test("production artifact boundary blocks development residue and sensitive runtime files", () => {
  const report = inspectProductionArtifactBoundary({
    paths: [
      ".worktrees/multi-channel-node-guard/server/app.mjs",
      ".codex-artifacts/aliyun-local-edge-desired-state.template.json",
      ".codex-runtime/portal-cloudlike-preview.cjs",
      ".claude/settings.local.json",
      "docs/.claude/settings.local.json",
      ".proxy-gateway/console-token",
      ".env",
      "control.sqlite",
      "server/services/clash-subscription.mjs.bak-20260609T085348Z",
      "protected/operator.key",
      "logs/proxy.log",
      "server/app.mjs"
    ]
  });

  assert.equal(report.ok, false);
  assert.deepEqual(report.blockers.map((item) => item.path), [
    ".worktrees/multi-channel-node-guard/server/app.mjs",
    ".codex-artifacts/aliyun-local-edge-desired-state.template.json",
    ".codex-runtime/portal-cloudlike-preview.cjs",
    ".claude/settings.local.json",
    "docs/.claude/settings.local.json",
    ".proxy-gateway/console-token",
    ".env",
    "control.sqlite",
    "server/services/clash-subscription.mjs.bak-20260609T085348Z",
    "protected/operator.key",
    "logs/proxy.log"
  ]);
  assert.ok(report.blockers.every((item) => item.severity === "blocker"));
  assert.doesNotMatch(JSON.stringify(report), /secret|token-value|subscriptionUrl/i);
});

test("production artifact boundary ignores harmless slash and line-ending noise", () => {
  const report = inspectProductionArtifactBoundary({
    paths: [
      "\\server\\app.mjs",
      "admin\\dist-portal\\index.html",
      "./docs/PROJECT_CONTEXT.md"
    ]
  });

  assert.equal(report.ok, true);
  assert.equal(report.blockers.length, 0);

  const comparison = compareNormalizedText({
    left: "export const value = 1;\r\nexport const name = \"gccgw\";\r\n",
    right: "export const value = 1;\nexport const name = \"gccgw\";\n"
  });
  assert.equal(comparison.equal, true);
  assert.equal(comparison.leftHash, comparison.rightHash);
});
