# Lightweight Operating Development Environment

Last updated: 2026-06-01, Asia/Shanghai.

> Status:
> - Type: Active environment boundary
> - Risk: C
> - Execution authority: Does not authorize code behavior changes, CI-host
>   mutation, AWS, Aliyun, DNS, Nginx, HTTPS, production config, node, tenant,
>   secret, SQLite, deploy, rollback, or cutover changes
> - Production impact: None
> - Source of truth for: The minimal local operator/developer environment and
>   the boundary between local work, manual validation, production observation,
>   and production mutation

## Purpose

This project should run as a small subscription-control and operator workflow
application. The default environment should stay lightweight:

- one real local checkout;
- one Node.js app process for local backend work;
- one Vite Admin/User Portal dev process when UI work is needed;
- local SQLite/test fixtures for development;
- CLI-first operator previews and safe handoff files;
- production treated as a separately gated runtime, not as the development
  workspace.

Do not add Redis, queues, Kubernetes, microservices, GitOps platforms, public
Admin panels, or cloud CI hosts unless a specific future requirement proves the
extra operational weight is necessary.

## Environment Roles

| Role | Location | Purpose | Not for |
| --- | --- | --- | --- |
| Local development | `D:\Projects\proxy-gateway-minimal` | Source edits, tests, local backend, Admin/User Portal dev UI, safe operator CLI previews | Production authority, customer data, cloud state |
| Local runtime data | ignored `.proxy-gateway/` and test fixtures | Local SQLite/dev state only | Git commits, production data, raw subscription material |
| Manual validation | HP/local Linux lane when required | Archive-based repo validation without production secrets | Staging, deploy approval, production mutation |
| Aliyun production | Current public subscription boundary | Real runtime for approved production service behavior | Development workspace, routine CI, public Admin |
| Archive | External archive or marked archive index | Old plans, stale workspaces, historical agent artifacts | Current source of truth |

## Minimal Local Setup

Required locally:

```powershell
cd D:\Projects\proxy-gateway-minimal
git status --short --branch
npm install
npm run server
```

For Admin/User Portal UI work:

```powershell
npm run admin:dev
```

For validation:

```powershell
git diff --check origin/master...HEAD
npm test
npm run admin:test
npm run admin:build
```

Use only the checks required by the touched surface. Docs-only work normally
needs only `git diff --check`. Admin UI work needs the Admin checks. Server
behavior changes need `npm test`.

## Daily Workflow

1. Start from the real checkout:

   ```powershell
   cd D:\Projects\proxy-gateway-minimal
   git status --short --branch
   ```

2. Use a short branch for the task:

   ```powershell
   git switch master
   git pull --ff-only origin master
   git switch -c docs/<topic>
   ```

   Use `fix/<topic>`, `test/<topic>`, or `refactor/<topic>` for code work.

3. Keep the working surface narrow:

   - docs-only changes stay in docs and indexes;
   - server changes include focused tests;
   - Admin UI changes include Admin tests/build;
   - production-adjacent changes stop at runbook, inventory, or dry-run until
     explicit Risk A approval exists.

4. Before reporting completion, run the validation command from
   `docs/VALIDATION_BASELINE.md`.

## Local Operator Mode

Local operator work should use repository scripts and safe input files. The
normal shape is:

```text
safe input JSON
  -> npm run platform:* or npm run channel:*
  -> redacted summary / preview / handoff metadata
  -> no production mutation unless a separate Risk A gate is approved
```

Local operator mode may create ignored handoff files on the operator machine,
but it must not print or commit raw subscription URLs, tokens, credentials,
customer data, production `.env` values, SQLite contents, or raw host secrets.

## Production Observation Mode

Default production checks should be read-only and small:

```text
public health endpoint
public Admin blocked
no-token subscription rejection
documented DNS / public-boundary posture
```

Host-internal Aliyun, AWS, Nginx, systemd, SQLite, tenant, artifact, firewall,
or node checks remain Risk A inventory work. Read-only inventory still does not
authorize mutation.

## Release Mode

The live server does not need to be a Git checkout. A lightweight release model
is enough:

```text
GitHub master commit
  -> archive/build artifact
  -> server releases/<commit-or-label>
  -> RELEASE.json
  -> current symlink
  -> systemd runs current
  -> validation record
```

Future tooling should first add release manifests and read-only status checks.
It should not introduce a heavy deployment platform by default.

## What Not To Run As Routine Dev

Do not make these part of the normal development environment:

- Aliyun as a routine CI host;
- production SQLite copied to local development;
- public Admin exposure;
- local checkout treated as production authority;
- HP treated as staging;
- AWS/Aliyun mutation for ordinary code review;
- Redis, queues, Kubernetes, service mesh, or multi-service decomposition;
- on-host `git pull` as the primary production deploy mechanism;
- archive folders in the active source-reading path.

## Target Shape

The target lightweight model is:

```text
local Windows checkout
  edits, tests, Admin dev UI, operator previews

GitHub master
  stable source and release baseline

HP/local Linux
  optional manual CI lane only when needed

Aliyun
  production subscription boundary, observed read-only by default

archive
  old workspaces, old plans, historical evidence after indexing
```

This keeps the project small enough that agents can orient quickly and operators
can tell whether a task is local development, safe operator preview, production
observation, or production mutation.
