import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { checkProjectState } from "../../scripts/check-project-state.mjs";

test("project-state check validates the current repository state", () => {
  const result = checkProjectState();

  assert.equal(result.ok, true);
  assert.deepEqual(result.errors, []);
  assert.match(result.summary, /validated project-state/);
});

test("project-state check reports missing lane docs, incomplete tasks, and raw secret patterns", () => {
  const rootDir = mkdtempSync(join(tmpdir(), "project-state-check-"));
  mkdirSync(join(rootDir, "project-state"));
  mkdirSync(join(rootDir, "docs"));

  writeFileSync(
    join(rootDir, "project-state", "lanes.json"),
    JSON.stringify({
      lanes: [
        {
          id: "bad-lane",
          name: "Bad Lane",
          status: "active",
          riskBoundary: "C",
          purpose: "exercise checker",
          primaryDocs: ["docs/missing.md"],
          primaryCodeAreas: [],
          nonGoals: []
        }
      ]
    })
  );
  writeFileSync(
    join(rootDir, "project-state", "current.json"),
    JSON.stringify({
      status: "active-snapshot",
      sourceDocs: ["docs/PROJECT_CONTEXT.md"]
    })
  );
  writeFileSync(
    join(rootDir, "project-state", "tasks.json"),
    JSON.stringify({
      tasks: [
        {
          id: "bad-task",
          risk: "A",
          status: "ready",
          lane: "bad-lane",
          title: "Bad task",
          goal: "exercise checker",
          allowedFiles: [],
          forbiddenActions: [],
          validation: []
        }
      ]
    })
  );
  writeFileSync(
    join(rootDir, "docs", "PROJECT_CONTEXT.md"),
    [
      "# Current",
      "",
      "token=raw-secret-value",
      "Historical Aliyun records are current authority."
    ].join("\n")
  );

  const result = checkProjectState({ rootDir });

  assert.equal(result.ok, false);
  assert.match(result.errors.join("\n"), /docs\/missing\.md/);
  assert.match(result.errors.join("\n"), /bad-task/);
  assert.match(result.errors.join("\n"), /raw secret pattern/);
  assert.match(result.errors.join("\n"), /metadata header/);
  assert.match(result.errors.join("\n"), /authority drift/);
  assert.doesNotMatch(result.errors.join("\n"), /raw-secret-value/);
});

test("project-state check accepts metadata headers and placeholder-only examples", () => {
  const rootDir = mkdtempSync(join(tmpdir(), "project-state-check-valid-"));
  mkdirSync(join(rootDir, "project-state"));
  mkdirSync(join(rootDir, "docs"));

  const activeDoc = [
    "# Current",
    "",
    "> Status:",
    "> - Type: Active current-state handoff",
    "> - Risk: C",
    "> - Execution authority: Does not authorize production mutation",
    "> - Production impact: None",
    "> - Source of truth for: Test fixture",
    "",
    "Use token=<placeholder> only in examples."
  ].join("\n");
  writeFileSync(join(rootDir, "docs", "PROJECT_CONTEXT.md"), activeDoc);

  writeFileSync(
    join(rootDir, "project-state", "lanes.json"),
    JSON.stringify({
      sourceDocs: ["docs/PROJECT_CONTEXT.md"],
      lanes: [
        {
          id: "validation-ci",
          name: "Validation And CI",
          status: "active",
          riskBoundary: "B",
          purpose: "exercise checker",
          primaryDocs: ["docs/PROJECT_CONTEXT.md"],
          primaryCodeAreas: [],
          nonGoals: ["production mutation"]
        }
      ]
    })
  );
  writeFileSync(
    join(rootDir, "project-state", "current.json"),
    JSON.stringify({
      status: "active-snapshot",
      sourceDocs: ["docs/PROJECT_CONTEXT.md"],
      productSpine: ["validation"],
      productionSnapshot: {
        requiresLiveVerification: true
      },
      forbiddenInStateFiles: ["tokens"]
    })
  );
  writeFileSync(
    join(rootDir, "project-state", "tasks.json"),
    JSON.stringify({
      sourceDocs: ["docs/PROJECT_CONTEXT.md"],
      tasks: [
        {
          id: "B-validation",
          risk: "B",
          status: "ready",
          lane: "validation-ci",
          title: "Validation",
          goal: "exercise checker",
          allowedFiles: ["scripts/*"],
          forbiddenActions: ["mutate production"],
          validation: ["npm test"]
        }
      ]
    })
  );

  const result = checkProjectState({ rootDir });

  assert.equal(result.ok, true);
  assert.deepEqual(result.errors, []);
});
