# Governance State Reconciliation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reconcile the repository-backed governance snapshot with `master@2413c101724df45579ebf4b9e0f306d32d9bb1af` after PRs #482 and #483 merged and Issue #437 was restored.

**Architecture:** Keep this change documentation- and project-state-only. The three authoritative entry documents, the documentation index, the four derived project-state views, and the three machine-readable JSON files must describe one consistent source snapshot while preserving the dated production evidence boundary.

**Tech Stack:** Markdown, JSON, Node.js project-state validator, GitHub read-only inventory.

## Global Constraints

- Risk is C and production/AWS impact is none.
- Modify only the eleven files listed in Task 1 plus this implementation plan.
- Record source and GitHub facts only; do not refresh or infer provider, runtime, deployment, credential, customer, or production state.
- Preserve `production/runtime evidence cutoff: 2026-07-11T13:03:40Z` and label it as dated evidence.
- Treat PR merge, CI success, artifacts, previews, and dry-runs as source/build evidence only.
- Do not authorize PR #479 mutation, Ready, merge, artifact publication, GitHub settings mutation, provider access, deployment, promotion, rollback, or production alignment.
- Never record secrets, tokens, subscription URLs, account credentials, raw runtime configuration, SQLite rows, logs, or customer data.

---

### Task 1: Reconcile the current governance snapshot

**Files:**

- Modify: `RELEASE_MANIFEST.md`
- Modify: `docs/CURRENT_RELEASE_STATE.md`
- Modify: `docs/PROJECT_CONTEXT.md`
- Modify: `docs/README.md`
- Modify: `docs/project-state/BLOCKERS.md`
- Modify: `docs/project-state/CURRENT_STATE.md`
- Modify: `docs/project-state/DECISIONS.md`
- Modify: `docs/project-state/MILESTONES.md`
- Modify: `project-state/current.json`
- Modify: `project-state/lanes.json`
- Modify: `project-state/tasks.json`

**Interfaces:**

- Consumes: live GitHub inventory and repository source identity at `2413c101724df45579ebf4b9e0f306d32d9bb1af`.
- Produces: one internally consistent, machine-validated governance snapshot for subsequent #479 and machine-governance Gates.

- [x] **Step 1: Replace the source inventory identity and repository counts**

  Use these exact current facts throughout all eleven files:

  ```yaml
  source_snapshot: 2413c101724df45579ebf4b9e0f306d32d9bb1af
  source_inventory_date: 2026-07-14
  open_pr_count: 5
  open_issue_count: 5
  remote_branch_count: 18
  merged_prs:
    482: 06d69b2da07a50322a260bd08f160febaf7b6a7d
    483: 2413c101724df45579ebf4b9e0f306d32d9bb1af
  open_draft_prs:
    - 476
    - 479
  open_non_draft_prs:
    - 486
    - 487
    - 488
  open_issues:
    - 437
    - 438
    - 439
    - 440
    - 475
  ```

- [x] **Step 2: Record the #437 reconciliation and #479 boundary**

  State that #437 was reopened by the Risk C reconciliation receipt `issuecomment-4976074286` because PR #482 was recorded as its closer despite the PR body explicitly denying resolution. Preserve the canonical #479 facts:

  ```yaml
  PR_479:
    state: open_draft
    head: 03d744556be6785ac8c97dae2bc4fb79ae9e246f
    merge_state: behind
    unresolved_non_outdated_threads: 3
    predecessor_terminal_receipt: issuecomment-4966594034
    predecessor_result: blocked
    predecessor_approval: consumed
    durable_successor_gate: absent
    production_state: not_deployed
  ```

  Do not rewrite the blocked predecessor as successful and do not treat the old four green checks as current-master integration evidence.

- [x] **Step 3: Record merged CI governance without overstating enforcement**

  Record that #483 introduced docs-only/code lane routing and always-run diff checking while retaining one stable required `Validate` context. Use these exact current master run identities:

  ```yaml
  CI: 29381367549 success
  Release_Artifact: 29381367545 success
  CodeQL: 29381507931 success
  Cloudflare_Workflow: 29381367553 success_build_verify_dry_run_deploy_skipped
  ```

  Preserve the live settings boundary: ruleset `18935716` requires strict `Validate`, zero approvals, and no review-thread-resolution; six environments exist, only `artifact-publication` has a branch policy, and none has reviewer enforcement.

- [x] **Step 4: Preserve dated security and production evidence boundaries**

  Keep the live source-security counts as `39` code-scanning alerts (`2 critical`, `36 high`, `1 medium`), `3` Dependabot alerts (`2 high`, `1 low`), and `0` secret-scanning alerts. State that successful CodeQL execution does not resolve alerts or prove exploitability.

  Keep all release-unit and runtime identities at their existing dated cutoff. Do not claim a new production inventory or production change.

- [x] **Step 5: Update the next-action queue**

  The queue must be ordered as follows:

  1. establish a durable successor Gate on #437 for PR #479;
  2. complete PR #479 source remediation, current-master integration, exact-head checks, formal review, Ready, and merge through independent approvals;
  3. finish Gate ledger/validator, stable CI contexts plus settings Gate, durable artifact retention/binding, and the minimal organization/runtime-evidence model through separate PRs;
  4. only then establish independent Artifact and Risk A production-alignment Gates.

- [x] **Step 6: Run the project-state validator**

  Run:

  ```powershell
  npm run project-state:check
  ```

  Expected: exit `0` and `validated project-state from .`.

- [x] **Step 7: Run the C-tier diff validation**

  Run:

  ```powershell
  git diff --check origin/master...HEAD
  ```

  Expected: exit `0` with no output.

- [x] **Step 8: Commit the reviewed implementation candidate**

  Commit only the twelve scoped files with:

  ```text
  docs: reconcile governance state after CI split
  ```

  Do not push or open a PR during implementation. After the task-level and whole-branch reviews are clean, the controller will finish the branch, push `docs/governance-state-reconciliation-20260714` normally, and open one Draft PR against `master`. The PR body must include the Risk C classification, exact source baseline, validation evidence, #437 reconciliation receipt, and explicit non-authority for Ready, merge, artifact, settings, provider, runtime, or production actions.
