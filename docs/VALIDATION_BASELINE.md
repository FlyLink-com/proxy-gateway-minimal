# Validation Baseline

Last updated: 2026-05-25, Asia/Shanghai.

> Status:
> - Type: Active validation entrypoint
> - Risk: C
> - Execution authority: Does not authorize CI host startup, staging,
>   production, AWS, DNS, Nginx, HTTPS, systemd, node, tenant, SQLite, secret,
>   artifact, deploy, or cutover changes
> - Production impact: None
> - Source of truth for: Which validation commands to run for current repo work

## Purpose

Use this file to choose the current validation commands for a PR. Keep pass
counts and one-off historical validation evidence in PR bodies, execution
records, or `docs/PROJECT_CONTEXT.md` only when they change current state.

This file answers:

```text
What should I run for this risk tier and touched surface?
```

It does not answer:

```text
What passed on every historical PR?
Is production healthy right now?
Is a deploy, cutover, or CI host run approved?
```

## Baseline Commands

### C: Docs Only

Run:

```powershell
git diff --check origin/master...HEAD
```

Use for:

- README and docs navigation changes.
- Runbook text changes with no execution.
- Current-state or handoff updates.
- Architecture docs that do not change code or external state.

Do not run app tests by default for C-tier docs-only work unless the doc change
updates command contracts, generated examples, or validation tooling.

### C/B: Project-State JSON Or State Tooling

Run:

```powershell
npm run project-state:check
git diff --check origin/master...HEAD
```

Also run `npm test` when changing the checker implementation or its tests.

Use for:

- `project-state/*.json`
- `docs/PROJECT_CONTROL_PLANE.md`
- `scripts/check-project-state.mjs`
- `server/tests/project-state-check.test.mjs`

### B: Server Or Shared Runtime Code

Run:

```powershell
git diff --check origin/master...HEAD
npm test
```

Add a focused targeted test first when changing a narrow route, service, parser,
store, renderer, middleware, or helper.

Use for:

- `server/**/*.mjs`
- root runtime entrypoints
- subscription renderer and store behavior
- route/auth/rate-limit/logging behavior
- local agent code when no Admin UI is touched

### B: Admin UI

Run:

```powershell
git diff --check origin/master...HEAD
npm run admin:test
npm run admin:build
npm test
```

Use for:

- `admin/src/**/*`
- Admin connection/auth UX
- operator workflow changes
- UI state, visible-once URL handling, confirmation flows, or layout changes

### B: Local Edge Agent Prototype

Run:

```powershell
git diff --check origin/master...HEAD
npm test
```

Also run a local smoke check only when the changed code affects the foreground
agent process, listener binding, local generated YAML, diagnostics, or SOCKS5
adapter behavior.

The Local Edge Agent remains loopback-only unless a separate gate approves
otherwise.

### A: Production, Cloud, Node, Or Runtime Mutation

No generic command list is enough for A-tier work. Use the relevant runbook and
execution record template.

Required shape:

```text
read-only inventory
dry-run or explicit no-op check
operator approval
backup or rollback plan
mutation
endpoint/service/data validation
rollback evidence or rollback-ready state
execution record
```

A-tier work includes:

- AWS or Aliyun resource mutation.
- DNS, Nginx, HTTPS, systemd, security-group, node, tenant, SQLite, artifact, or
  deploy/cutover changes.
- Production subscription output or runtime config changes.
- WireGuard install, keys, UDP ingress, service start, or live mesh validation.
- Legacy query-token retirement or broader opaque artifact issuance.

## Manual CI Fallback

GitHub-hosted Actions have previously been blocked by account billing or
spending-limit state. When manual CI is needed, follow
`docs/CI_MANUAL_VALIDATION.md`.

The target manual CI host is local Linux after bootstrap and validation. The
historical Aliyun validation host remains a fallback record, but it should not
stay the routine CI host if that Aliyun server is being prepared as production
subscription control plane.

Manual CI fallback is:

- A validation workaround.
- Not staging.
- Not production.
- Not a self-hosted runner assumption.
- Not deploy approval.

Do not start a manual CI host or copy archives to it unless the task explicitly
requires that validation level.

## Historical Evidence

Historical pass counts belong in:

- The PR body for that PR.
- Execution records under `docs/*-records/`.
- `docs/PROJECT_CONTEXT.md` only when the result changes current state,
  blockers, or next actions.

Do not keep growing current handoff docs with old pass-count lists.

## Quick Selection

```text
docs only -> git diff --check
project-state JSON -> project-state:check + diff check
server/shared code -> npm test + diff check
Admin UI -> admin:test + admin:build + npm test + diff check
production/cloud/node/runtime -> runbook-specific A-tier gate
```
