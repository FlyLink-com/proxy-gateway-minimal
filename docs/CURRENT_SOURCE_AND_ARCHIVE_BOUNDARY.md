# Current Source And Archive Boundary

Last updated: 2026-06-09, America/Los_Angeles.

> Status:
> - Type: Active repository hygiene and local archive boundary
> - Risk: C
> - Execution authority: Does not authorize code behavior changes, production,
>   AWS, Vultr, Aliyun, DNS, Nginx, systemd, SQLite, node, tenant, artifact,
>   payment, deploy, rollback, or subscription mutation
> - Production impact: None
> - Source of truth for: Which local paths are current source, which are archive,
>   and how README files should prevent old material from entering new work

## Purpose

This project now has several historical checkouts, generated local runtime
folders, execution records, and archived plans. They are useful for archaeology,
but they must not compete with the current codebase.

Use this document as the local boundary before importing files, copying old
templates, updating README files, or reviving a previous implementation.

## Current Source Path

The active local source checkout is:

```text
D:\Projects\proxy-gateway-minimal
```

Current work starts from:

1. `AGENTS.md`
2. `README.md`
3. `docs/PROJECT_CONTEXT.md`
4. `docs/README.md`
5. The active subsystem doc or runbook named by `docs/README.md`

If another checkout, worktree, archive directory, exported package, or local
artifact disagrees with the active source path above, treat the active source
path and current docs as authoritative until the old material is explicitly
reviewed and re-imported.

## Local Archive And Historical Paths

These paths are not current source:

| Path | Classification | Use rule |
| --- | --- | --- |
| `C:\Users\g\OneDrive\文档\订阅管理` | Legacy local shell | Do not use as source or project state. |
| `C:\Users\g\Projects\订阅管理\proxy-gateway-minimal` | Pre-D-drive checkout | Archaeology only. Compare exact files before copying anything. |
| `C:\Users\g\WorkBuddy\2026-05-20-18-07-31\proxy-gateway-minimal` | Historical checkout | Archaeology only. Not a build, deploy, or docs baseline. |
| `D:\Projects\proxy-gateway-minimal\.worktrees\*` | Temporary local worktrees | Use only for exact diff archaeology. Never assume they are newer than the active checkout. |
| `D:\Projects\proxy-gateway-minimal-local-artifacts\*` | Local generated-artifact archive | Safe for retained generated outputs and old local logs; not source, not deploy input. |
| `docs/archive\*` | In-repo historical archive | Background and audit only. Does not override active docs, code, tests, or live verification. |

## Generated Local Runtime Paths

The following paths are local runtime or generated-output areas. They should be
ignored by Git and should not become source-of-truth material:

```text
.codex-runtime/
.codex-artifacts/
.playwright-cli/
.tmp-node/
.proxy-gateway/
admin/dist/
admin/dist-portal/
admin/dist-site/
coverage/
output/
test-results/
handoff/
```

If a generated file is needed for review, write a redacted summary or a safe
hash/manifest into `docs/` instead of committing raw output.

## README Update Rule

Every active README should answer four questions:

```text
What is current here?
What is historical or archive-only here?
What is forbidden to copy into Git?
Where should the reader go next?
```

When a README points to old plans, old nodes, old protocol templates, or old
deployment notes, mark them as `Historical` or move the pointer to
`docs/archive/README.md`. Do not leave old material beside active runbooks
without an explicit status.

## Re-Import Rule

Do not copy files from archive, `.worktrees`, old checkouts, exported packages,
or generated folders into the active source tree unless all of these are true:

1. The target subsystem is identified.
2. The old file is compared against current code/docs.
3. The new diff is limited to the intended task.
4. The relevant tests or docs checks are run.
5. Any production, runtime, auth, schema, DNS, Nginx, systemd, cloud, node,
   tenant, subscription, payment, or credential effect is reclassified as Risk A
   before execution.

## Stop Conditions

Stop and ask for a separate gate if cleanup would:

- move current source code or active tests into archive;
- delete evidence without an index;
- copy raw `.env`, SQLite, logs, subscription URLs, tokens, passwords,
  credentials, cloud keys, private keys, or customer data;
- change deployment, runtime, Nginx, DNS, systemd, firewall, node, tenant,
  subscription, payment, or database behavior;
- make a historical checkout or archived package the current baseline.

## Validation

For docs-only archive/index updates:

```powershell
git diff --check
```

If structured project-state files are touched:

```powershell
npm run project-state:check
```

If source, tests, package scripts, Admin UI, server behavior, or runtime
templates are touched, use the validation matrix in `docs/VALIDATION_BASELINE.md`.
