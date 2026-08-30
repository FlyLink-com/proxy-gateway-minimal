# Project State Workspace

This file is a responsibility and navigation entrypoint. It does not establish
global, release, deployment, runtime, or production authority.

## Responsibility

`project-state/` owns compact, versioned coordination artifacts that complement
the canonical documentation: dated compatibility snapshots, reviewed lane
definitions, and historical task constraints. It is not a live work queue.

## Entry Points

- [current.json](current.json) records dated product, evidence, blocker-hint,
  and validation boundaries for compatibility consumers.
- [lanes.json](lanes.json) records reviewed lane definitions and safety
  boundaries; Project #1's `Lane` field supplies mutable membership for
  navigation only.
- [tasks.json](tasks.json) records dated historical task IDs and reviewed risk,
  file-scope, validation, and approval constraints. It must not select the next
  task.
- [docs/PROJECT_CONTROL_PLANE.md](../docs/PROJECT_CONTROL_PLANE.md) explains the
  coordination model and precedence rules.

## Development

Update these JSON files only when the corresponding reviewed compatibility
contract, lane taxonomy, or canonical source document changes. Preserve their
redacted, portable shape, observation cutoff, and explicit live-read boundary.
Do not copy live Issue/PR counts, Project status, queues, branches, deployments,
provider state, or runtime state into these files.

The complete reviewed contents of `current.json`, `lanes.json`, and
`tasks.json` are SHA-256 pinned in `scripts/check-project-state.mjs`. The hash
normalizes only checkout-level `CRLF` to `LF`; all other byte changes are
material. An intentional JSON change must update the matching checker digest in
the same B-tier PR, explain why the compatibility contract changed, and receive
the same review as the new bytes. Do not refresh a digest merely to make CI
green.

## Validation

Run `npm run project-state:check`, the focused checker/brief/handoff tests, and
then `git diff --check origin/master...HEAD` for any project-state change.
Confirm the changed JSON is the intended reviewed input before calculating its
new digest.

## Boundary

These files do not override `docs/CURRENT_RELEASE_STATE.md`,
`RELEASE_MANIFEST.md`, native Issue/PR records, live GitHub state, deployment
evidence, or fresh runtime inventory. Project #1 remains a mutable navigation
projection. Neither Project fields nor these files authorize external action,
Risk A work, deletion, or production claims, and they must contain no
credentials, subscription material, raw runtime data, or customer data.
