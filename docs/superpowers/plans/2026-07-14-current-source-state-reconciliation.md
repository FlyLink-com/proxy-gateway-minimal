# Current Source State Reconciliation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reconcile the three repository entry documents and `project-state` with the exact GitHub source state at `master@ab8b0ec2034cc92a84bcea738c0a254afbd60213` without changing or reinterpreting production/runtime evidence.

**Architecture:** Treat GitHub source state and dated production evidence as separate domains. Update repository, PR, Issue, CI, artifact-build, and queue facts from the 2026-07-14 read-only inventory while freezing every production pointer, provider identity, runtime aggregate, and deployment conclusion at its existing evidence cutoff.

**Tech Stack:** Markdown, JSON, the existing dependency-free `project-state` checker, GitHub read-only evidence.

## Global Constraints

- Risk: C.
- Process: one docs/state reconciliation PR from exact `master@ab8b0ec2034cc92a84bcea738c0a254afbd60213`.
- Expected PR count: 1.
- Production/AWS/provider/runtime impact: none.
- The PR must remain Draft; Ready, merge, provider access, artifact download, deployment, promotion, rollback, and production alignment are not authorized.
- Source inventory facts are current through 2026-07-14; production/runtime evidence remains frozen at `2026-07-11T13:03:40Z` and requires fresh Risk A inventory before use.
- Current source facts: two open Draft PRs (`#476`, `#479`), five open Issues (`#437`, `#438`, `#439`, `#440`, `#475`), CI run `29328012647` success, Release Artifact run `29328012651` success, and Deploy Cloudflare Site run `29153679412` as the last observed run for that workflow.
- Recent merged PR order is `#469`, `#470`, `#472`, `#471`, `#473`, `#474`, `#477`, `#478`, `#481`, `#480`.
- `#476` remains Draft/source-schema-only and not deployed. `#479` remains Draft/not deployed with identity gate pending; terminal receipt `issuecomment-4966594034` is blocked and its approval is consumed.
- Keep the documented production control-plane pointer, Vercel aliases/deployments, Cloudflare active version, release-unit states, runtime counts (`62/60/2/19/0/0`), `identitySync: degraded`, `accountingCompleteness: risk_not_quantified`, `mapApply: not_started`, and disabled automation unchanged.
- Do not output or record credentials, tokens, subscription material, raw config, environment values, database rows, raw logs, or customer data.
- Validation is exactly `npm run project-state:check` and `git diff --check origin/master...HEAD`; full application tests are not required for this C-tier docs/state PR.

---

### Task 1: Reconcile current source evidence without changing production claims

**Files:**
- Modify: `docs/CURRENT_RELEASE_STATE.md`
- Modify: `RELEASE_MANIFEST.md`
- Modify: `docs/PROJECT_CONTEXT.md`
- Modify: `project-state/current.json`
- Modify: `project-state/lanes.json`
- Modify: `project-state/tasks.json`
- Create: `docs/superpowers/plans/2026-07-14-current-source-state-reconciliation.md`

**Interfaces:**
- Consumes: exact GitHub source inventory at `ab8b0ec2034cc92a84bcea738c0a254afbd60213` and the existing dated production snapshot.
- Produces: one internally consistent Markdown/JSON handoff whose source facts match GitHub and whose production fields remain explicitly dated.

- [ ] **Step 1: Reconcile `docs/CURRENT_RELEASE_STATE.md`**

  Set the source baseline and source evidence cutoff to `ab8b0ec2034cc92a84bcea738c0a254afbd60213`; set the update date to 2026-07-14; replace the latest build proof with Release Artifact run `29328012651`; add the recent source-only/none/test changes through `#480/#481`; record `#476/#479` as open Draft work and Issue `#475` as open. Keep all production identities and runtime aggregates unchanged and explicitly say no fresh live production inventory was performed.

- [ ] **Step 2: Reconcile `RELEASE_MANIFEST.md`**

  Set the source inventory baseline to `ab8b0ec2`, replace the latest verified master artifact proof with run `29328012651`, replace the ten-PR mapping with `#469/#470/#472/#471/#473/#474/#477/#478/#481/#480`, and add an open-source-candidates note for Draft PRs `#476/#479`. Preserve the four-Gate policy, durable-retention requirement, production pointers, and the conclusion that no new release is `ready` or `deployed`.

- [ ] **Step 3: Reconcile `docs/PROJECT_CONTEXT.md`**

  Set the update date and repository snapshot to 2026-07-14; record exact master, 12 observed remote branches, two open Draft PRs, five open Issues, and the latest CI/artifact runs. Add Issue `#475` and Draft PR `#476` as a separate operations-foundation source/schema lane; keep `#437` primary and record Draft PR `#479` as blocked pending a new exact successor Gate. Preserve every deployment/runtime statement as dated evidence.

- [ ] **Step 4: Reconcile `project-state/current.json`**

  Bump `schemaVersion` to `2026-07-14.1`, set `lastUpdated` to `2026-07-14`, update branch/source counts, the exact 12-branch observation, recent merged PRs, validation run IDs, source directions, and the open `#475/#476` plus blocked `#437/#479` facts. Do not change `productionSnapshot.evidenceCutoff`, release-unit identities, traffic aggregates, access boundaries, or production blockers.

- [ ] **Step 5: Reconcile `project-state/lanes.json` and `project-state/tasks.json`**

  Bump both files to `2026-07-14.1`; update version-management, traffic-accounting, and commercial source progress; add an operations-foundation lane for open Issue `#475` / Draft PR `#476`; add compact source receipts through `#480/#481` plus explicit open-Draft records for `#476/#479`. Do not reclassify any source-only work as deployed, Ready, production healthy, or approved for runtime mutation.

- [ ] **Step 6: Run the C-tier validators**

  Run: `npm run project-state:check`

  Expected: exit 0 with `validated project-state from .`.

  Run: `git diff --check origin/master...HEAD`

  Expected: exit 0 with no whitespace errors.

- [ ] **Step 7: Review scope and create one commit**

  Run: `git status --short` and `git diff --stat origin/master...HEAD`.

  Expected: only the seven files listed above are changed. Review the complete diff for accidental production/runtime fact changes, then create one commit with message `docs: reconcile current source governance state`.

- [ ] **Step 8: Publish as Draft only**

  Push `docs/current-source-state-reconciliation` normally and create one Draft PR. The PR body must record Risk C, exact source baseline, validation evidence, production impact none, and the remaining independent Ready/merge/machine-enforcement/provider/production gates.
