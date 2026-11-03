import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const PIPELINE_PATH = resolve(ROOT, "ops/node-provisioning/pipeline.yml");
const pipeline = readFileSync(PIPELINE_PATH, "utf8").replace(/\r\n/g, "\n");

const STAGE_IDS = ["T2", "T3", "M0", "C1", "C2", "C3", "C4", "C5", "C6"];
const REQUIRED_STAGE_KEYS = [
  "name",
  "purpose",
  "prerequisites",
  "inputs",
  "steps",
  "success_criteria",
  "failure_blocks",
  "evidence_outputs",
  "rollback",
  "human_approval",
  "side_effects",
  "current_status"
];

function stageBlocks(source) {
  const matches = [...source.matchAll(/^  - id: ([A-Z0-9]+)$/gm)];
  return matches.map((match, index) => ({
    id: match[1],
    body: source.slice(match.index, matches[index + 1]?.index ?? source.length)
  }));
}

test("pipeline defines exactly the T2-T3-M0-C1-C6 stages in order and grants no authority", () => {
  assert.match(pipeline, /^schema: node-provisioning-pipeline\/v1$/m);
  assert.match(pipeline, /^node: node-vultr-jp-01$/m);
  assert.match(pipeline, /^production_authority: false$/m);
  assert.match(pipeline, /^status_as_of: "\d{4}-\d{2}-\d{2}"$/m);
  assert.deepEqual(
    stageBlocks(pipeline).map(({ id }) => id),
    STAGE_IDS
  );
});

test("every stage carries the full orchestration contract", () => {
  for (const { id, body } of stageBlocks(pipeline)) {
    for (const key of REQUIRED_STAGE_KEYS) {
      assert.match(body, new RegExp(`^    ${key}:`, "m"), `${id} is missing ${key}`);
    }
    assert.match(body, /^      required: (?:true|false)$/m, `${id} human_approval.required`);
  }
});

test("stage prerequisites only reference earlier stages", () => {
  const seen = new Set();
  for (const { id, body } of stageBlocks(pipeline)) {
    const prereqLine = body.match(/^    prerequisites: \[(.*)\]$/m);
    assert.ok(prereqLine, `${id} prerequisites must be an inline list`);
    const prereqs = prereqLine[1].split(",").map((value) => value.trim()).filter(Boolean);
    for (const prereq of prereqs) {
      assert.ok(seen.has(prereq), `${id} prerequisite ${prereq} is not an earlier stage`);
    }
    seen.add(id);
  }
});

test("production-writing stages require human approval and C1 is bound to its Environment", () => {
  for (const { id, body } of stageBlocks(pipeline)) {
    if (/^    side_effects: production-write/m.test(body)) {
      assert.match(body, /^      required: true$/m, `${id} writes production without approval`);
    }
  }
  const c1 = stageBlocks(pipeline).find(({ id }) => id === "C1");
  assert.match(c1.body, /^      environment: jp01-c1-production$/m);
  assert.match(c1.body, /JP01 Vultr API Preflight passing run/);
  assert.match(c1.body, /never authorizes instance creation/);
});

test("pipeline references the JP-01 profile instead of duplicating measured identities", () => {
  assert.match(pipeline, /ops\/node-provisioning\/profiles\/jp-01\.json/);
  // The C0 artifact digest lives only in profiles/jp-01.json (PR #824); the
  // pipeline must point at it, never copy it.
  assert.doesNotMatch(pipeline, /693d9f5afdfbc440870ecb7ec84bee8cc2af644574496f564f2c92ab59946442/);
  assert.doesNotMatch(pipeline, /VULTR_API_KEY\s*[:=]\s*\S+/);
});
