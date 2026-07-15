# Project State Workspace

This file is a responsibility and navigation entrypoint. It does not establish
global, release, deployment, runtime, or production authority.

## Responsibility

`project-state/` owns the compact machine-readable coordination view that
complements the canonical documentation: the current repository snapshot,
active work lanes, and the governed task queue.

## Entry Points

- [current.json](current.json) records the dated repository and project-state
  snapshot.
- [lanes.json](lanes.json) records work-lane ownership and boundaries.
- [tasks.json](tasks.json) records governed task states and validation intent.
- [docs/PROJECT_CONTROL_PLANE.md](../docs/PROJECT_CONTROL_PLANE.md) explains the
  coordination model and precedence rules.

## Development

Update these JSON files only when the corresponding reviewed repository facts
or canonical source documents change. Preserve their redacted, portable shape
and keep dated observations distinguishable from current live state.

## Validation

Run `npm run project-state:check`, then
`git diff --check origin/master...HEAD` for any project-state change.

## Boundary

These files do not override `docs/CURRENT_RELEASE_STATE.md`,
`RELEASE_MANIFEST.md`, live GitHub state, deployment evidence, or fresh runtime
inventory. They authorize no external action and must contain no credentials,
subscription material, raw runtime data, or customer data.
