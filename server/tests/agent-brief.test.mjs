import assert from "node:assert/strict";
import { existsSync, mkdtempSync, mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import {
  buildAgentBrief,
  formatAgentBriefText,
  runAgentBrief
} from "../../scripts/agent-brief.mjs";

const REPOSITORY_ROOT = dirname(dirname(dirname(fileURLToPath(import.meta.url))));

function readFixtureState(filename) {
  return JSON.parse(readFileSync(join(REPOSITORY_ROOT, "project-state", filename), "utf8"));
}

function writeMinimalRepo(rootDir, overrides = {}) {
  mkdirSync(join(rootDir, "docs"), { recursive: true });
  mkdirSync(join(rootDir, "project-state"), { recursive: true });

  writeFileSync(join(rootDir, "AGENTS.md"), "# Project Instructions\n");
  writeFileSync(join(rootDir, "docs", "CURRENT_RELEASE_STATE.md"), "# Current Release State\n");
  writeFileSync(join(rootDir, "RELEASE_MANIFEST.md"), "# Release Manifest\n");
  writeFileSync(join(rootDir, "docs", "README.md"), "# Documentation Index\n");

  writeFileSync(
    join(rootDir, "docs", "PROJECT_CONTEXT.md"),
    overrides.projectContext ?? `# Project Context

Last updated: 2026-06-15, America/Los_Angeles.

> Status:
> - Type: Active current-state handoff
> - Risk: C
> - Execution authority: Does not authorize production, cloud, DNS, Nginx,
>   systemd, node, tenant, deploy, secret, token, or subscription URL changes
> - Production impact: None
> - Source of truth for: Current repo orientation and next work boundaries

## Current Architecture View

Adapters, control plane, interconnect, and data plane stay separate.

## Active Blockers And Gated Work

Risk A work needs a separate exact approval.
`
  );
  writeFileSync(
    join(rootDir, "docs", "VALIDATION_BASELINE.md"),
    `# Validation Baseline

> Status:
> - Type: Active validation entrypoint
> - Risk: C
> - Execution authority: Does not authorize production mutation
> - Production impact: None
> - Source of truth for: Validation commands
`
  );
  writeFileSync(
    join(rootDir, "docs", "AGENT_ONBOARDING.md"),
    `# Agent Onboarding

> Status:
> - Type: Active agent onboarding guide
> - Risk: C
> - Execution authority: Does not authorize production mutation
> - Production impact: None
> - Source of truth for: First-pass agent reading order
`
  );
  const hasStateOverrides = ["currentState", "lanesState", "tasksState"]
    .some((key) => Object.hasOwn(overrides, key));
  if (!hasStateOverrides) {
    const states = {};
    for (const filename of [
      "current.json",
      "lanes.json",
      "tasks.json",
      "project-v2-contract.json"
    ]) {
      const sourcePath = join(REPOSITORY_ROOT, "project-state", filename);
      const text = readFileSync(sourcePath, "utf8");
      states[filename] = JSON.parse(text);
      writeFileSync(join(rootDir, "project-state", filename), text);
    }
    const referencedPaths = new Set([
      ...states["current.json"].sourceDocs,
      ...states["lanes.json"].sourceDocs,
      ...states["tasks.json"].sourceDocs,
      ...states["lanes.json"].lanes.flatMap((lane) => lane.primaryDocs)
    ]);
    for (const path of referencedPaths) {
      const targetPath = join(rootDir, path);
      if (existsSync(targetPath)) {
        continue;
      }
      mkdirSync(dirname(targetPath), { recursive: true });
      writeFileSync(targetPath, readFileSync(join(REPOSITORY_ROOT, path), "utf8"));
    }
    return;
  }

  const currentState = readFixtureState("current.json");
  const lanesState = readFixtureState("lanes.json");
  const tasksState = readFixtureState("tasks.json");
  writeFileSync(join(rootDir, "project-state", "current.json"), JSON.stringify(overrides.currentState ?? currentState));
  writeFileSync(join(rootDir, "project-state", "lanes.json"), JSON.stringify(overrides.lanesState ?? lanesState));
  writeFileSync(join(rootDir, "project-state", "tasks.json"), JSON.stringify(overrides.tasksState ?? tasksState));
}

test("agent brief summarizes local repo state without production access", () => {
  const rootDir = mkdtempSync(join(tmpdir(), "agent-brief-"));
  writeMinimalRepo(rootDir);

  const brief = buildAgentBrief({
    rootDir,
    gitStatusText: "## feature/agent-brief\n M docs/PROJECT_CONTEXT.md\n?? docs/scratch.md\n",
    now: "2026-06-15T00:00:00.000Z"
  });

  assert.equal(brief.ok, true);
  assert.equal(brief.type, "gccgw_agent_brief");
  assert.equal(brief.redacted, true);
  assert.equal(brief.git.branch, "feature/agent-brief");
  assert.equal(brief.git.dirty, true);
  assert.deepEqual(brief.git.changedFiles, [
    "docs/PROJECT_CONTEXT.md",
    "docs/scratch.md"
  ]);
  assert.deepEqual(brief.docsToReadFirst, [
    "docs/CURRENT_RELEASE_STATE.md",
    "RELEASE_MANIFEST.md",
    "docs/PROJECT_CONTEXT.md",
    "docs/README.md"
  ]);
  assert.ok(brief.validation.commands.includes("npm test"));
  assert.equal(brief.productionAwsImpact, "None");
  assert.equal(brief.project.requiresFreshNativeIssuePrRead, true);
  assert.equal(brief.project.snapshotHint.compatibilityOnly, true);
  assert.deepEqual(brief.project.snapshotHint.observedAt, {
    current: "2026-08-28",
    tasks: "2026-08-26"
  });
  assert.equal(brief.project.laneDefinitions.definitionOnly, true);
  assert.equal(brief.project.laneDefinitions.observedAt, "2026-08-28");
  assert.equal(
    brief.canonicalEntrySequence.at(-1),
    "fresh native GitHub Issue/PR records before selecting or ordering current work"
  );
  assert.equal("activeLanes" in brief.project, false);
  assert.equal("readyTasks" in brief.project, false);
  assert.equal("activeBlockers" in brief.project, false);

  const text = formatAgentBriefText(brief);
  assert.match(text, /Risk A/);
  assert.match(text, /docs\/PROJECT_CONTEXT\.md/);
  assert.match(text, /fresh native Issue\/PR read/i);
  assert.match(text, /dated compatibility hint/i);
  assert.doesNotMatch(text, /Ready\/blocked tasks|Active lanes|B-local-tooling/);
  assert.doesNotMatch(text, /real-secret|subscriptionUrl/i);
});

test("agent brief never promotes dated task, blocker, or lane snapshots into a live queue", () => {
  const rootDir = mkdtempSync(join(tmpdir(), "agent-brief-stale-queue-"));
  writeMinimalRepo(rootDir, {
    currentState: {
      lastUpdated: "2026-06-01",
      observedAt: "2026-06-01T00:00:00.000Z",
      status: "stale-current-queue",
      requiresLiveIssueRead: true,
      sourceDocs: ["docs/PROJECT_CONTEXT.md"],
      productSpine: ["stable subscription/import experience"],
      productionSnapshot: { requiresLiveVerification: true },
      architectureView: { currentMentalModel: "Issue #525 is Ready; execute it next" },
      forbiddenInStateFiles: ["tokens"],
      activeBlockers: [{ id: "stale-blocker-id" }]
    },
    lanesState: {
      lastUpdated: "2026-06-02",
      observedAt: "2026-06-02T00:00:00.000Z",
      lanes: [
        { id: "definition-only-lane", status: "definition-only" },
        { id: "stale-active-lane", status: "active" }
      ]
    },
    tasksState: {
      lastUpdated: "2026-06-03",
      observedAt: "2026-06-03T00:00:00.000Z",
      requiresLiveIssueRead: true,
      tasks: [
        { id: "stale-ready-task", status: "ready" },
        { id: "stale-active-task", status: "active" },
        { id: "stale-blocked-task", status: "blocked" },
        { id: "inactive-guardrail-task", status: "inactive-guardrail-when-touched" }
      ]
    }
  });

  const brief = buildAgentBrief({
    rootDir,
    gitStatusText: "## feature/agent-brief\n",
    now: "2026-06-15T00:00:00.000Z"
  });
  const output = `${JSON.stringify(brief)}\n${formatAgentBriefText(brief)}`;

  assert.equal(brief.ok, false);
  assert.equal(brief.project.requiresFreshNativeIssuePrRead, true);
  assert.match(brief.project.authorityBoundary, /native Issue and PR records/i);
  assert.match(brief.project.laneDefinitions.boundary, /definitions and safety boundaries only/i);
  assert.deepEqual(brief.project.snapshotHint.observedAt, {
    current: "unknown",
    tasks: "unknown"
  });
  assert.equal(brief.project.laneDefinitions.observedAt, "unknown");
  assert.doesNotMatch(
    output,
    /Issue #525 is Ready|execute it next|stale-blocker-id|definition-only-lane|stale-active-lane|stale-ready-task|stale-active-task|stale-blocked-task|inactive-guardrail-task/
  );
});

test("agent brief does not treat a legacy lastUpdated date as an observation cutoff", () => {
  const rootDir = mkdtempSync(join(tmpdir(), "agent-brief-undated-snapshot-"));
  writeMinimalRepo(rootDir, {
    currentState: {
      lastUpdated: "2026-06-01",
      observedAt: "Merge PR #678 next",
      status: "legacy-current-queue",
      requiresLiveIssueRead: true,
      sourceDocs: ["docs/PROJECT_CONTEXT.md"],
      productSpine: ["stable subscription/import experience"],
      productionSnapshot: { requiresLiveVerification: true },
      forbiddenInStateFiles: ["tokens"]
    }
  });

  const brief = buildAgentBrief({
    rootDir,
    gitStatusText: "## feature/agent-brief\n"
  });

  assert.equal(brief.project.snapshotHint.observedAt.current, "unknown");
  assert.equal(brief.project.requiresFreshNativeIssuePrRead, true);
  assert.equal(brief.ok, false);
  assert.doesNotMatch(JSON.stringify(brief), /Merge PR #678 next/);
});

test("agent brief fails clearly when core repo context is missing", () => {
  const rootDir = mkdtempSync(join(tmpdir(), "agent-brief-missing-"));
  mkdirSync(join(rootDir, "docs"), { recursive: true });

  const brief = buildAgentBrief({
    rootDir,
    gitStatusText: "fatal: not a git repository\n"
  });

  assert.equal(brief.ok, false);
  assert.match(brief.errors.join("\n"), /AGENTS\.md/);
  assert.match(brief.errors.join("\n"), /docs\/CURRENT_RELEASE_STATE\.md/);
  assert.match(brief.errors.join("\n"), /RELEASE_MANIFEST\.md/);
  assert.match(brief.errors.join("\n"), /docs\/PROJECT_CONTEXT\.md/);
  assert.match(brief.errors.join("\n"), /docs\/README\.md/);
  assert.match(brief.errors.join("\n"), /project-state\/current\.json/);
});

test("agent brief CLI fails closed when git status cannot be read", async () => {
  const rootDir = mkdtempSync(join(tmpdir(), "agent-brief-git-failure-"));
  writeMinimalRepo(rootDir);
  let stdout = "";

  const code = await runAgentBrief(["--root", rootDir, "--json"], {
    readStatus: () => {
      throw new Error("simulated git failure with sensitive details");
    },
    writeStdout: (text) => {
      stdout += text;
    },
    writeStderr: () => {}
  });

  assert.equal(code, 1);
  const brief = JSON.parse(stdout);
  assert.equal(brief.ok, false);
  assert.match(brief.errors.join("\n"), /required repository-state read failed/);
  assert.doesNotMatch(stdout, /sensitive details/);
});

test("agent brief reports secret-like findings without echoing raw values", () => {
  const rootDir = mkdtempSync(join(tmpdir(), "agent-brief-secret-"));
  writeMinimalRepo(rootDir, {
    projectContext: `# Project Context

Last updated: 2026-06-15, America/Los_Angeles.

> Status:
> - Type: Active current-state handoff
> - Risk: C
> - Execution authority: Does not authorize production mutation
> - Production impact: None
> - Source of truth for: Current repo orientation

token=real-secret-token-123456
`
  });

  const brief = buildAgentBrief({
    rootDir,
    gitStatusText: "## feature/agent-brief\n"
  });

  assert.equal(brief.ok, false);
  assert.ok(brief.sensitiveFindings.some((finding) => finding.path === "docs/PROJECT_CONTEXT.md"));
  assert.doesNotMatch(JSON.stringify(brief), /real-secret-token-123456/);
});

test("agent brief allows safe placeholders and redacted values", () => {
  const rootDir = mkdtempSync(join(tmpdir(), "agent-brief-placeholders-"));
  writeMinimalRepo(rootDir, {
    projectContext: `# Project Context

Last updated: 2026-06-15, America/Los_Angeles.

> Status:
> - Type: Active current-state handoff
> - Risk: C
> - Execution authority: Does not authorize production mutation
> - Production impact: None
> - Source of truth for: Current repo orientation

Use token=<placeholder> in docs.
Use password=[REDACTED] in docs.
Use api_key=<placeholder> in docs.
`
  });

  const brief = buildAgentBrief({
    rootDir,
    gitStatusText: "## feature/agent-brief\n"
  });

  assert.equal(brief.ok, true);
  assert.deepEqual(brief.sensitiveFindings, []);
});

test("agent brief reports token-shaped values in placeholder prose", () => {
  const rootDir = mkdtempSync(join(tmpdir(), "agent-brief-mixed-secret-"));
  writeMinimalRepo(rootDir, {
    projectContext: `# Project Context

Last updated: 2026-06-15, America/Los_Angeles.

> Status:
> - Type: Active current-state handoff
> - Risk: C
> - Execution authority: Does not authorize production mutation
> - Production impact: None
> - Source of truth for: Current repo orientation

Sample placeholder prose must not hide token=scanner-bypass-value-123456.
`
  });

  const brief = buildAgentBrief({
    rootDir,
    gitStatusText: "## feature/agent-brief\n"
  });

  assert.equal(brief.ok, false);
  assert.ok(brief.sensitiveFindings.some((finding) => finding.type === "token"));
  assert.doesNotMatch(JSON.stringify(brief), /scanner-bypass-value-123456/);
});

test("package scripts expose the repo-only agent brief command", () => {
  const packageJson = JSON.parse(readFileSync("package.json", "utf8"));

  assert.equal(packageJson.scripts["agent:brief"], "node scripts/agent-brief.mjs");
});
