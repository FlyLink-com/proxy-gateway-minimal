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
      sourceDocs: ["docs/current.md"]
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
  writeFileSync(join(rootDir, "docs", "current.md"), "token=raw-secret-value\n");

  const result = checkProjectState({ rootDir });

  assert.equal(result.ok, false);
  assert.match(result.errors.join("\n"), /docs\/missing\.md/);
  assert.match(result.errors.join("\n"), /bad-task/);
  assert.match(result.errors.join("\n"), /raw secret pattern/);
});
