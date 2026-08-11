import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const REPOSITORY_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

const RETIRED_WORKFLOW_PATHS = [
  ".github/workflows/japan-runtime-config-additive-repair.yml",
  ".github/workflows/japan-runtime-config-bootstrap-probe.yml"
];

const OPERATING_DOCUMENT_PATHS = [
  "docs/CURRENT_RELEASE_STATE.md",
  "docs/GITHUB_DEPLOYMENT_RUNBOOK.md",
  "docs/PROJECT_CONTEXT.md"
];

const HISTORICAL_RECORD_PATHS = [
  "docs/production-replacement-records/2026-07-24-japan-tuic-bootstrap-probe-gate.md",
  "docs/production-replacement-records/2026-07-24-japan-tuic-additive-repair-execution-gate.md"
];

test("retired Japan production workflows stay absent", () => {
  for (const relativePath of RETIRED_WORKFLOW_PATHS) {
    assert.equal(
      existsSync(resolve(REPOSITORY_ROOT, relativePath)),
      false,
      `${relativePath} must remain retired`
    );
  }
});

test("operating docs and dated records deny dispatch authority", () => {
  for (const relativePath of OPERATING_DOCUMENT_PATHS) {
    const document = readFileSync(resolve(REPOSITORY_ROOT, relativePath), "utf8");
    assert.match(document, /retired/i);
    assert.match(document, /does not authorize dispatch/i);
    assert.match(document, /new exact\s+Risk A approval/i);
    assert.doesNotMatch(
      document,
      /retains one active source-only authorization contract|narrower active source-only authorization contract|defines a manual,\s*source-only production capability/i
    );
  }

  for (const relativePath of HISTORICAL_RECORD_PATHS) {
    const document = readFileSync(resolve(REPOSITORY_ROOT, relativePath), "utf8");
    assert.match(document, /lifecycle:\s*historical/i);
    assert.match(document, /no longer authorizes workflow dispatch or retry/i);
  }

  const runbook = readFileSync(
    resolve(REPOSITORY_ROOT, "docs/GITHUB_DEPLOYMENT_RUNBOOK.md"),
    "utf8"
  );
  assert.match(runbook, /does\s+not cancel or disable historical run reruns/i);
  assert.match(runbook, /read-only historical-run inventory/i);
});
