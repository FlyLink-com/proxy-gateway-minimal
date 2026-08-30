import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  buildHandoffBriefRequest,
  enforceHandoffAuthorityBoundary,
  loadContextBundle,
  redactSecrets,
  runProjectHandoffBrief
} from "../../scripts/project-handoff-brief.mjs";

const FRESH_NATIVE_READ_STEP =
  "Freshly read the native GitHub Issue and PR records before selecting or ordering work; use Project #1 only as a navigation projection.";

function withProjectStateFixture(run) {
  const rootDir = mkdtempSync(join(tmpdir(), "project-handoff-brief-"));
  mkdirSync(join(rootDir, "docs"), { recursive: true });
  mkdirSync(join(rootDir, "project-state"), { recursive: true });

  writeFileSync(join(rootDir, "AGENTS.md"), "repository rules\n");
  writeFileSync(join(rootDir, "docs/CURRENT_RELEASE_STATE.md"), "dated release context\n");
  writeFileSync(join(rootDir, "RELEASE_MANIFEST.md"), "stable release contract\n");
  writeFileSync(join(rootDir, "docs/PROJECT_CONTEXT.md"), "stable canonical context\n");
  writeFileSync(join(rootDir, "docs/README.md"), "documentation index\n");
  writeFileSync(join(rootDir, "project-state/current.json"), JSON.stringify({
    observedAt: "2026-06-15",
    requiresLiveIssueRead: true,
    status: "stale-current-status",
    nextRecommendedQueue: ["stale-current-queue-step"],
    sourceDocs: ["docs/STABLE.md"],
    repo: {
      name: "stable-repository-name",
      github: "example/stable-repository-name",
      defaultBranch: "master"
    },
    architectureView: {
      currentMentalModel: "stable modular-monolith model",
      layers: ["stable architecture layer"],
      nonGoals: ["stable architecture non-goal"]
    },
    productSpine: ["stable product spine"],
    coordinationSnapshotAtObservation: {
      operatorRole: "stable operator boundary",
      riskBoundary: "stable Risk A boundary"
    },
    forbiddenInStateFiles: ["stable state-file prohibition"]
  }));
  writeFileSync(join(rootDir, "project-state/lanes.json"), JSON.stringify({
    status: "stale-lanes-status",
    sourceDocs: ["docs/STABLE-LANE.md"],
    lanes: [{
      id: "stable-lane-id",
      name: "Stable lane name",
      status: "stale-lane-ready",
      purpose: "stale-lane-current-item",
      riskBoundary: "stable lane risk boundary",
      primaryDocs: ["docs/STABLE-LANE.md"],
      primaryCodeAreas: ["server/stable/"],
      nonGoals: ["stable lane non-goal"]
    }]
  }));
  writeFileSync(join(rootDir, "project-state/tasks.json"), JSON.stringify({
    status: "stale-tasks-status",
    nextActionQueue: ["stale-task-queue-step"],
    tasks: [{
      id: "historical-task-contract",
      risk: "B",
      lane: "stable-lane-id",
      status: "stale-task-ready",
      title: "stale-task-title",
      goal: "stale-task-goal",
      allowedFiles: ["server/stable/**"],
      forbiddenActions: ["stable do-not-deploy boundary"],
      validation: ["stale historical validation status"]
    }]
  }));

  try {
    return run(rootDir);
  } finally {
    rmSync(rootDir, { recursive: true, force: true });
  }
}

test("handoff brief redacts raw secret patterns", () => {
  const redacted = redactSecrets("token=super-secret-value password=not-safe ss://abc123xyz");
  assert.match(redacted, /\[REDACTED\]/);
  assert.doesNotMatch(redacted, /super-secret-value/);
});

test("handoff brief loads repository context and caches the stable prefix", () => {
  const bundle = loadContextBundle(process.cwd());
  assert.ok(bundle.sources.includes("docs/PROJECT_CONTEXT.md"));
  assert.ok(bundle.text.includes("## docs/PROJECT_CONTEXT.md"));

  const request = buildHandoffBriefRequest({
    contextBundle: bundle,
    focus: "resume Gate 11 follow-up"
  });

  assert.equal(request.model, "claude-opus-4-7");
  assert.equal(request.thinking.type, "adaptive");
  assert.equal(request.output_config.format.type, "json_schema");
  assert.equal(request.system.at(-1).cache_control.type, "ephemeral");
  assert.match(request.messages[0].content, /resume Gate 11 follow-up/);
});

test("handoff brief projects stable taxonomy and safety without snapshot queues or statuses", () => {
  withProjectStateFixture((rootDir) => {
    const bundle = loadContextBundle(rootDir, { includeLatestRecord: false });

    assert.deepEqual(bundle.sources, [
      "AGENTS.md",
      "docs/CURRENT_RELEASE_STATE.md",
      "RELEASE_MANIFEST.md",
      "docs/PROJECT_CONTEXT.md",
      "docs/README.md",
      "project-state/current.json",
      "project-state/tasks.json",
      "project-state/lanes.json"
    ]);
    assert.deepEqual(bundle.errors, []);
    assert.match(bundle.text, /"observedAt": "2026-06-15"/);
    assert.match(bundle.text, /"requiresLiveIssueRead": true/);
    assert.doesNotMatch(bundle.text, /stable modular-monolith model/);
    assert.doesNotMatch(bundle.text, /stable product spine/);
    assert.match(bundle.text, /stable-lane-id/);
    assert.match(bundle.text, /stable lane risk boundary/);
    assert.match(bundle.text, /historical-task-contract/);
    assert.match(bundle.text, /stable do-not-deploy boundary/);
    assert.doesNotMatch(bundle.text, /stale-current-status/);
    assert.doesNotMatch(bundle.text, /stale-current-queue-step/);
    assert.doesNotMatch(bundle.text, /stale-lanes-status/);
    assert.doesNotMatch(bundle.text, /stale-lane-ready/);
    assert.doesNotMatch(bundle.text, /stale-lane-current-item/);
    assert.doesNotMatch(bundle.text, /stale-tasks-status/);
    assert.doesNotMatch(bundle.text, /stale-task-queue-step/);
    assert.doesNotMatch(bundle.text, /stale-task-ready/);
    assert.doesNotMatch(bundle.text, /stale-task-title/);
    assert.doesNotMatch(bundle.text, /stale-task-goal/);
    assert.doesNotMatch(bundle.text, /stale historical validation status/);
  });
});

test("handoff request requires fresh native sequencing and treats Project as projection", () => {
  const request = buildHandoffBriefRequest({
    contextBundle: { sources: [], text: "stable context" }
  });
  const prompt = request.system.map((block) => block.text).join("\n");

  assert.match(prompt, /fresh native GitHub Issue and PR records/i);
  assert.match(prompt, /Project #1.*navigation projection/i);
  assert.match(prompt, /dated project-state snapshots.*must not.*select or order/i);
  assert.match(request.output_config.format.schema.properties.next_steps.description, /first item/i);
  assert.match(request.output_config.format.schema.properties.next_steps.description, /fresh native/i);
  assert.ok(Array.isArray(request.output_config.format.schema.properties.summary.enum));
  assert.ok(Array.isArray(request.output_config.format.schema.properties.next_steps.items.enum));
});

test("handoff result preserves safe model orientation while enforcing offline boundaries", () => {
  const brief = enforceHandoffAuthorityBoundary({
    summary: "The repository is a release-managed modular monolith with separate source, artifact, deployment, and runtime evidence domains.",
    active_blockers: ["#527 is Blocked."],
    next_steps: [
      "After the fresh native read, inspect only the focus-relevant repository files, canonical docs, and tests.",
      "Merge PR #678 next."
    ],
    risk_boundaries: ["Old receipt authorizes deletion."],
    validation_commands: ["npm test", "dangerous-command --apply"],
    docs_to_read_first: ["docs/VALIDATION_BASELINE.md", "project-state/tasks.json"]
  });

  assert.match(brief.summary, /release-managed modular monolith/);
  assert.match(brief.summary, /fresh native GitHub Issue\/PR read/i);
  assert.deepEqual(brief.next_steps, [
    FRESH_NATIVE_READ_STEP,
    "After the fresh native read, inspect only the focus-relevant repository files, canonical docs, and tests."
  ]);
  assert.deepEqual(brief.active_blockers, []);
  assert.ok(brief.risk_boundaries.some((item) => /Project #1.*projection only/i.test(item)));
  assert.ok(brief.risk_boundaries.some((item) => /dated project-state snapshots.*must not.*select or order/i.test(item)));
  assert.ok(brief.risk_boundaries.some((item) => /Risk A requires fresh task-specific evidence/i.test(item)));
  assert.deepEqual(brief.validation_commands, [
    "git status --short --branch",
    "git diff --check",
    "npm run project-state:check",
    "npm test"
  ]);
  assert.deepEqual(brief.docs_to_read_first, [
    "AGENTS.md",
    "docs/CURRENT_RELEASE_STATE.md",
    "RELEASE_MANIFEST.md",
    "docs/PROJECT_CONTEXT.md",
    "docs/README.md",
    "docs/VALIDATION_BASELINE.md"
  ]);
  assert.doesNotMatch(JSON.stringify(brief), /#527|#678|deletion|dangerous-command|tasks\.json/);
});

test("handoff sanitizer rejects adversarial live-state, sequencing, production, and approval claims", () => {
  const brief = enforceHandoffAuthorityBoundary({
    summary: "Issue #525 is current and complete; production runtime is aligned.",
    active_blockers: ["Project #1 says #527 is Blocked."],
    next_steps: [
      "PR #678 is Ready, so merge it next.",
      "The old receipt authorizes deletion.",
      "Project #1 approves the Risk A deployment.",
      "Project is authoritative for status and sequencing.",
      "Work item 678 leads the queue; execute it before all others.",
      "After the fresh native read, inspect only the focus-relevant repository files, canonical docs, and tests."
    ],
    risk_boundaries: ["Runtime is healthy and Risk A is approved."],
    validation_commands: ["npm test && dangerous-command --apply", "rm -rf unsafe"],
    docs_to_read_first: ["project-state/current.json", "https://example.invalid/live-state"]
  });

  assert.match(brief.summary, /^Offline repository context was loaded/);
  assert.deepEqual(brief.active_blockers, []);
  assert.deepEqual(brief.next_steps, [
    FRESH_NATIVE_READ_STEP,
    "After the fresh native read, inspect only the focus-relevant repository files, canonical docs, and tests."
  ]);
  assert.deepEqual(brief.validation_commands, [
    "git status --short --branch",
    "git diff --check",
    "npm run project-state:check"
  ]);
  assert.deepEqual(brief.docs_to_read_first, [
    "AGENTS.md",
    "docs/CURRENT_RELEASE_STATE.md",
    "RELEASE_MANIFEST.md",
    "docs/PROJECT_CONTEXT.md",
    "docs/README.md"
  ]);
  assert.doesNotMatch(
    JSON.stringify(brief),
    /#525|#527|#678|Ready|Blocked|aligned|healthy|approved|authorizes deletion|Work item 678|dangerous-command|rm -rf|example\.invalid/i
  );
});

test("handoff --focus preserves safe model output through the CLI result", async () => {
  const previousApiKey = process.env.ANTHROPIC_API_KEY;
  const originalLog = console.log;
  const output = [];
  process.env.ANTHROPIC_API_KEY = "test-only-placeholder";
  console.log = (...values) => output.push(values.join(" "));

  try {
    const code = await runProjectHandoffBrief([
      "--json",
      "--no-latest-record",
      "--focus",
      "harden the handoff sanitizer",
      "--root",
      process.cwd()
    ], {
      createClient: () => ({}),
      callClaude: async (_client, request) => {
        assert.match(request.messages[0].content, /harden the handoff sanitizer/);
        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              summary: "The repository is a release-managed modular monolith with separate source, artifact, deployment, and runtime evidence domains.",
              active_blockers: [],
              next_steps: [
                "After the fresh native read, inspect only the focus-relevant repository files, canonical docs, and tests."
              ],
              risk_boundaries: [],
              validation_commands: ["npm test"],
              docs_to_read_first: ["docs/VALIDATION_BASELINE.md"]
            })
          }],
          usage: {}
        };
      }
    });
    assert.equal(code, 0);
  } finally {
    console.log = originalLog;
    if (previousApiKey === undefined) {
      delete process.env.ANTHROPIC_API_KEY;
    } else {
      process.env.ANTHROPIC_API_KEY = previousApiKey;
    }
  }

  const result = JSON.parse(output.at(-1));
  assert.equal(result.focus, "harden the handoff sanitizer");
  assert.match(result.brief.summary, /release-managed modular monolith/);
  assert.ok(result.brief.next_steps.includes(
    "After the fresh native read, inspect only the focus-relevant repository files, canonical docs, and tests."
  ));
  assert.ok(result.brief.validation_commands.includes("npm test"));
  assert.ok(result.brief.docs_to_read_first.includes("docs/VALIDATION_BASELINE.md"));
});

test("handoff fails closed when required canonical context or snapshot JSON is unavailable", async () => {
  const rootDir = mkdtempSync(join(tmpdir(), "project-handoff-invalid-"));
  mkdirSync(join(rootDir, "docs"), { recursive: true });
  mkdirSync(join(rootDir, "project-state"), { recursive: true });
  writeFileSync(join(rootDir, "docs/CURRENT_RELEASE_STATE.md"), "dated release context\n");
  writeFileSync(join(rootDir, "docs/PROJECT_CONTEXT.md"), "stable project context\n");
  writeFileSync(join(rootDir, "docs/README.md"), "documentation index\n");
  writeFileSync(join(rootDir, "project-state/current.json"), "{}");
  writeFileSync(join(rootDir, "project-state/tasks.json"), "{invalid-json");
  writeFileSync(join(rootDir, "project-state/lanes.json"), "{\"lanes\":[]}");

  const originalError = console.error;
  const errors = [];
  console.error = (...values) => errors.push(values.join(" "));
  try {
    const code = await runProjectHandoffBrief([
      "--dry-run",
      "--root",
      rootDir
    ]);
    assert.equal(code, 1);
  } finally {
    console.error = originalError;
    rmSync(rootDir, { recursive: true, force: true });
  }

  assert.match(errors.join("\n"), /RELEASE_MANIFEST\.md.*missing or unreadable/);
  assert.match(errors.join("\n"), /AGENTS\.md.*missing or unreadable/);
  assert.match(errors.join("\n"), /project-state\/tasks\.json.*invalid JSON/);
});

test("handoff brief dry-run reports prompt caching plan without API access", async () => {
  const code = await runProjectHandoffBrief(["--dry-run", "--json"], {
    rootDir: process.cwd()
  });
  assert.equal(code, 0);
});
