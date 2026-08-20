# Agent Onboarding

Last updated: 2026-06-15, America/Los_Angeles.

```yaml
document_metadata:
  doc_type: canonical
  lifecycle: active
  authority_scope: agent_onboarding
  superseded_by: null
  last_verified_at: 2026-06-15
  production_authority: false
```


> Status:
> - Type: Active agent onboarding guide
> - Risk: C
> - Execution authority: Does not authorize code behavior changes, production,
>   AWS, Vultr, Aliyun, DNS, Nginx, systemd, firewall, SQLite, node, tenant,
>   artifact, payment, deploy, rollback, secret, token, subscription URL,
>   credential, or customer-data actions
> - Production impact: None
> - Source of truth for: First-pass agent reading order, common mistakes, and
>   PR-start checklist for `proxy-gateway-minimal`

## Purpose

Use this file when a new AI agent, reviewer, or operator first enters this
repository. It is a short entry guide, not a replacement for the current source
of truth.

This file answers:

```text
What should an agent read first?
What should an agent never infer from old docs or local folders?
What checklist must be satisfied before opening or finishing a PR?
```

It does not answer:

```text
Is production healthy right now?
Is any Risk A operation approved?
Which historical execution record proves a specific runtime fact?
```

## First Reading Path

Read these in order before doing project work:

1. `AGENTS.md` - workflow rules, A/B/C risk tiers, validation expectations, and
   safety boundaries.
2. `docs/PROJECT_CONTEXT.md` - current handoff, active blockers, current
   architecture view, and latest documented production snapshot.
3. `docs/BRANCH_AND_SERVICE_OPERATING_MODEL.md` - branch roles, service lanes,
   and the difference between planned, coded, tested, deployed, merged, and
   archived.
4. `docs/VALIDATION_BASELINE.md` - validation commands by risk tier and touched
   surface.
5. `docs/VULTR_JAPAN_CONTROL_DATA_PLANE_STATUS.md` - current Vultr Japan
   control-plane plus Vultr Japan/Singapore data-plane direction.
6. `docs/RUNTIME_LANE_AUTHORITY.md` - current versus staging versus historical
   runtime-lane authority, especially before using Aliyun, AWS, canary,
   retired-node, or generated-runtime records.

For routine docs or repo-only code work, continue from the subsystem document in
`docs/README.md`. For production, cloud, DNS, Nginx, systemd, node, runtime,
auth, schema, tenant, deploy, rollback, or live endpoint work, stop and read the
relevant Risk A runbook plus latest execution record. Runbooks describe gates;
they do not grant approval.

## Header Semantics

Most active documents start with a metadata block. Treat it as the first safety
check.

| Header | How to interpret it |
| --- | --- |
| `Status: Active` | Current guidance for the named scope, subject to live verification for drift-prone facts. |
| `Status: Historical` | Background or audit evidence only. Do not use it as current authority. |
| `Status: Superseded` | Kept for traceability. Find and use the replacement document. |
| `Risk: C` | Docs or coordination only unless a later section explicitly names B/A work. |
| `Risk: B` | Repo-only code, test, UI, or tooling work. Run the relevant tests. |
| `Risk: A` | Production, cloud, node, network, auth, schema, deploy, rollback, tenant, or runtime boundary. Requires strict gates. |
| `Execution authority: Does not authorize ...` | The document is not approval to mutate anything listed there. |
| `Production impact: None` | The document itself does not change production. It does not prove production state. |

## Risk Tiers

Classify the task before changing files:

| Tier | Examples | Required process | Validation |
| --- | --- | --- | --- |
| C | README, docs index, runbook wording, status records, PR template | Minimal docs change in one PR | `git diff --check origin/master...HEAD` |
| B | Server tests, small refactors, Admin UI local changes, repo-only CLI/tooling | Intent, code, tests, and necessary docs in one PR | Relevant targeted tests plus `npm test`; Admin UI also needs `npm run admin:test` and `npm run admin:build` |
| A | Production, AWS, Vultr, Aliyun, DNS, Nginx, systemd, firewall, schema/migration, auth model, deploy/rollback, live order, tenant/artifact mutation | Read-only inventory, dry-run, exact operator approval, backup, implementation, validation, rollback plan, execution record | Runbook-specific checks only |

Short confirmations such as `ok`, `go`, `继续`, `开始`, or `同意` do not
authorize Risk A mutation. Risk A approval must match the relevant runbook or
approval packet exactly.

## Workspace Boundaries

The active local checkout is:

```text
D:\Projects\proxy-gateway-minimal
```

Do not treat these as current source:

| Path or area | Rule |
| --- | --- |
| `C:\Users\g\Projects\订阅管理\proxy-gateway-minimal` | Pre-D-drive checkout. Archaeology only. |
| `C:\Users\g\OneDrive\文档\订阅管理` | Legacy local shell. Do not use as source or project state. |
| `C:\Users\g\WorkBuddy\2026-05-20-18-07-31\proxy-gateway-minimal` | Historical checkout. Not a build, deploy, or docs baseline. |
| `.worktrees/` | Temporary local worktrees. Use only for exact diff archaeology. |
| `.codex-runtime/`, `.codex-artifacts/`, `.codex-tmp/`, `.playwright-cli/`, `.proxy-gateway/`, `coverage/`, `output/`, `test-results/` | Generated or runtime material. Do not promote to source of truth. |
| `docs/archive/` | Historical reference only unless an active document explicitly re-imports it. |

When local paths, old docs, generated artifacts, runtime-lane records, and
current source disagree, prefer `D:\Projects\proxy-gateway-minimal`,
`docs/PROJECT_CONTEXT.md`, `docs/README.md`,
`docs/RUNTIME_LANE_AUTHORITY.md`, and live verification.

## Common Agent Mistakes

Avoid these failure modes:

1. Treating old Aliyun, AWS, canary, retired-node, or generated-runtime records
   as the current platform direction.
2. Treating `docs/archive/`, `.worktrees/`, generated output, or old local
   checkouts as current source.
3. Treating "I read `docs/PROJECT_CONTEXT.md`" as permission to touch
   production.
4. Reporting completion before the required validation command actually ran.
5. Mixing planned, coded, tested, deployed, runtime-validated, merged, and
   archived states.
6. Adding public Admin exposure or public runtime ports while doing unrelated
   work.
7. Copying secrets, tokens, subscription URLs, credentials, raw env, raw config,
   SQLite rows, private keys, or customer data into docs, Linear, PRs, logs, or
   chat.
8. Describing CLI automation as direct node mutation. Keep CLI on
   operator-facing plan, preview, and approval boundaries unless a runbook says
   otherwise.

## Before Editing

Run or inspect these before changing files:

```powershell
git status --short --branch
npm run agent:brief
npm run precommit:check -- --dry-run
```

Then confirm:

- The task risk tier is stated.
- The touched surface is scoped.
- Existing user changes are identified and will not be reverted.
- The relevant subsystem document or runbook has been read.
- The expected validation command is known.
- The precommit check plan matches the touched surface; it is guidance, not
  proof that validation has already passed.
- No task requires production, cloud, network, auth, schema, deploy, tenant, or
  runtime mutation unless it is explicitly Risk A and gated.

## PR Checklist

Every PR must make its scope auditable:

- Summary states what changed in one to three sentences.
- Issue / Index Card section links the tracking issue when required by
  `docs/GITHUB_ISSUE_PR_WORKFLOW.md`; otherwise it explains why the PR is
  standalone.
- Risk section names `A`, `B`, or `C`.
- Production, AWS, Aliyun, runtime, DNS, node, traffic, and customer-data impact
  are stated explicitly.
- Agent / Task Routing section is present, even for a single-agent PR.
- Execution section lists the actual changed files or behavior.
- Validation section lists commands that were actually run and their results.
- Remaining Gates section separates future work from this PR's completed scope.
- Spec-only, runbook-only, or inventory-only PRs clearly say no runtime mutation
  was performed and name the next approval gate.

## Safe Completion Language

When reporting work, separate:

- Known facts from files, commands, tests, or Linear/GitHub state.
- Reasonable inferences from those facts.
- Risks or blockers.
- Next actions.

If a command was not run, say so. If validation failed because of unrelated
dirty worktree changes, identify the file or command without reverting those
changes.
