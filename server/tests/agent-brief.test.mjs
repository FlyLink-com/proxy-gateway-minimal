import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  buildAgentBrief,
  formatAgentBriefText
} from "../../scripts/agent-brief.mjs";

function writeMinimalRepo(rootDir, overrides = {}) {
  mkdirSync(join(rootDir, "docs"), { recursive: true });
  mkdirSync(join(rootDir, "project-state"), { recursive: true });

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
  writeFileSync(
    join(rootDir, "project-state", "current.json"),
    JSON.stringify({
      status: "active-snapshot",
      sourceDocs: ["docs/PROJECT_CONTEXT.md"],
      productSpine: ["stable subscription/import experience"],
      productionSnapshot: {
        requiresLiveVerification: true
      },
      forbiddenInStateFiles: ["tokens", "subscription URLs"]
    })
  );
  writeFileSync(
    join(rootDir, "project-state", "lanes.json"),
    JSON.stringify({
      lanes: [
        {
          id: "validation-ci",
          name: "Validation And CI",
          status: "active",
          riskBoundary: "B",
          purpose: "local validation",
          primaryDocs: ["docs/VALIDATION_BASELINE.md"],
          primaryCodeAreas: ["server/tests/*"],
          nonGoals: ["production approval"]
        }
      ]
    })
  );
  writeFileSync(
    join(rootDir, "project-state", "tasks.json"),
    JSON.stringify({
      tasks: [
        {
          id: "B-local-tooling",
          risk: "B",
          status: "ready",
          lane: "validation-ci",
          title: "Local tooling",
          goal: "exercise agent brief",
          allowedFiles: ["scripts/*"],
          forbiddenActions: ["mutate production"],
          validation: ["npm test"]
        }
      ]
    })
  );
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
  assert.ok(brief.docsToReadFirst.includes("docs/AGENT_ONBOARDING.md"));
  assert.ok(brief.validation.commands.includes("npm test"));
  assert.equal(brief.productionAwsImpact, "None");

  const text = formatAgentBriefText(brief);
  assert.match(text, /Risk A/);
  assert.match(text, /docs\/PROJECT_CONTEXT\.md/);
  assert.doesNotMatch(text, /real-secret|subscriptionUrl/i);
});

test("agent brief fails clearly when core repo context is missing", () => {
  const rootDir = mkdtempSync(join(tmpdir(), "agent-brief-missing-"));
  mkdirSync(join(rootDir, "docs"), { recursive: true });

  const brief = buildAgentBrief({
    rootDir,
    gitStatusText: "fatal: not a git repository\n"
  });

  assert.equal(brief.ok, false);
  assert.match(brief.errors.join("\n"), /docs\/PROJECT_CONTEXT\.md/);
  assert.match(brief.errors.join("\n"), /project-state\/current\.json/);
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

test("package scripts expose the repo-only agent brief command", () => {
  const packageJson = JSON.parse(readFileSync("package.json", "utf8"));

  assert.equal(packageJson.scripts["agent:brief"], "node scripts/agent-brief.mjs");
});
