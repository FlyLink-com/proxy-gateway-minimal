# Master And Archive Boundary

Last updated: 2026-06-01, Asia/Shanghai.

> Status:
> - Type: Active repository hygiene policy
> - Risk: C
> - Execution authority: Does not authorize code, CI host, AWS, DNS, Nginx,
>   HTTPS, production config, node, tenant, secret, SQLite, deploy, rollback, or
>   cutover changes
> - Production impact: None
> - Source of truth for: What belongs on `master`, what belongs in archive, and
>   how agents should avoid treating old material as the current workspace

## Purpose

`master` is the current source baseline, not a general archive. The repository
still needs Git version management, but the main branch should stay focused on
current source, active runbooks, active validation rules, and compact current
state. Historical evidence remains valuable, but it should be reachable through
indexes and archive locations instead of competing with active work.

This document defines the boundary before any large move or deletion happens.
It does not move files by itself.

## Keep On Master

Keep files on `master` when they are needed for current development,
operations, validation, or release decisions:

- current source code, tests, scripts, and package metadata;
- active runbooks and validation entrypoints;
- compact current-state handoff and structured project-state files;
- active architecture boundary docs;
- active production safety docs and execution-record indexes;
- immutable execution records that are still directly referenced by active
  runbooks or current-state docs;
- small archive indexes that point to moved historical material.

`master` should answer:

```text
What is the current source baseline?
What is safe to run locally?
Which production gates are active?
Which docs are authoritative today?
Where is historical evidence located?
```

## Move To Archive

Move or mirror material outside the active reading path when it is no longer
needed for current execution:

- stale PR plans, spec drafts, and implementation checklists that are not
  referenced by active runbooks;
- old execution packages after their current-state facts have been summarized
  and indexed;
- historical agent handoff notes that duplicate current docs;
- personal, marketing, media, Telegram, or decorative website drafts;
- old local workspace notes from OneDrive, WorkBuddy, or pre-D-drive checkouts;
- superseded topology diagrams, duplicated closeouts, and overlong narrative
  reports after the useful facts are indexed.

Archive material may live in a separate archive repository, an external archive
path such as `D:\Archives\...`, or a clearly marked in-repo archive index during
transition. It must not contain secrets, tokens, subscription URLs, credentials,
SQLite data, customer data, private keys, or unredacted production logs.

## Never Use Archive As Authority

Archived material is evidence, not authority. Agents must not use it to:

- infer current production state;
- infer current DNS, Nginx, systemd, SQLite, tenant, artifact, or node state;
- approve production mutation;
- decide that an old branch, worktree, or release package is the active
  workspace;
- copy old approval phrases into a new gate without checking the active runbook.

Any drift-prone production fact must be live-verified before Risk A work.

## Server Runtime Boundary

Server runtime state does not belong on `master`:

- `.env` values;
- SQLite databases and backups;
- handoff files;
- raw subscription or artifact material;
- systemd live state;
- Nginx live state;
- host-specific release directories;
- cloud credentials or provider-side inventory output.

The repository may keep templates, redacted examples, release-manifest schemas,
and safe execution records. Real runtime material must stay outside Git unless
it is explicitly redacted and documented as safe.

## Release Boundary

Production releases should be traceable to a Git commit, but the live server
directory does not need to be a Git checkout. The intended lightweight model is:

```text
GitHub master commit
  -> build or archive package
  -> server releases/<commit-or-label>
  -> RELEASE.json manifest
  -> current symlink
  -> systemd runs current
  -> validation record and rollback pointer
```

A future release-management PR may add tooling for release manifests and
read-only release status checks. That tooling would still not grant production
deploy authority by itself.

## Cleanup Sequence

Use small, reviewable steps:

1. Add or update archive indexes before moving files.
2. Classify files as active, reference, archive, or forbidden-to-copy.
3. Verify active docs do not depend on files that will be moved.
4. Move historical material only after the active current-state summary and
   index pointers exist.
5. Run the relevant validation command for the touched surface.

For docs-only boundary work, use:

```powershell
git diff --check origin/master...HEAD
```

For project-state changes, also run:

```powershell
npm run project-state:check
```

## Stop Conditions

Stop and reclassify the task if cleanup would:

- delete evidence without an index or replacement pointer;
- change a runbook approval phrase;
- change production semantics;
- move current source code or active tests;
- expose secrets, customer data, raw tokens, subscription URLs, or credentials;
- require live AWS, Aliyun, DNS, Nginx, systemd, SQLite, node, tenant, artifact,
  deploy, or rollback mutation.
