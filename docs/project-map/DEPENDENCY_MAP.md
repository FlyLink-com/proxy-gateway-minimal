# Dependency Map

Evidence cutoff: 2026-07-14, America/Los_Angeles.

```yaml
document_metadata:
  doc_type: canonical
  lifecycle: active
  authority_scope: dependency_map
  superseded_by: null
  last_verified_at: 2026-08-29
  production_authority: false
```

> Status:
> - Type: Project dependency expression standard
> - Risk: C
> - Execution authority: Does not authorize source implementation,
>   production, runtime, provider, deployment, promotion, rollback, or
>   customer-data actions
> - Production impact: None
> - Authority: Derived relationship convention only; every edge defers to its
>   cited Issue, PR, artifact, release, or runtime evidence
> - Index scope: Express Feature -> Issue -> PR -> Artifact -> Runtime
>   relationships without collapsing evidence domains

## Core Chain

```text
Feature -> Issue -> PR -> Artifact -> Runtime
```

| Node | Required question | Minimum evidence |
| --- | --- | --- |
| Feature | Why does this capability exist and who consumes it? | Goal, producer, consumer, non-goals. |
| Issue | Which durable index card owns scope, dependencies, blockers, and done criteria? | Current Issue number/state and explicit in/out scope. |
| PR | Which exact reviewed diff implements or documents the slice? | PR number, exact head/base, risk, files, validation, remaining gates. |
| Artifact | Which immutable output can be promoted or restored? | Release unit, exact source, artifact identity and checksum, or `none` for docs/governance. |
| Runtime | What is actually deployed or serving? | Fresh target inventory and validation appropriate to Risk A, or `not_applicable`/`not_verified`. |

An edge may be recorded only when evidence supports it. Missing edges stay
`unknown`, `not_applicable`, or `not_verified`; they are never filled by
inference.

## Relationship Record

The following is a documentation schema, not a new machine-readable state
file:

```yaml
id: <stable-relationship-id>
feature: <feature id and goal>
reason: <verified user/operator outcome>
issue: <number and current state>
pull_requests:
  - <number, state, source commit, capability>
artifact:
  release_unit: <fixed release unit or none>
  identity: <verified immutable identity or unknown>
runtime:
  target: <safe logical target or not_applicable>
  state: <verified, documented_dated, not_verified, or not_applicable>
depends_on: []
blocks: []
blocked_by: []
evidence: []
evidence_cutoff: <timestamp>
```

If repository-local compatibility automation is later justified, it may extend
the reviewed lane taxonomy or dated snapshot contracts in
`project-state/*.json` and `scripts/check-project-state.mjs` through a separate
reviewed change. Automation for current work must read native Issue/PR records
and keep Project #1 as navigation only. Do not copy this sketch into
`project-state.yaml` or create another queue.

## Required Queries

A complete record should answer:

1. **Task reason:** Which verified outcome or risk created the feature?
2. **Blocking object:** What exact Issue, PR, evidence gap, or gate prevents
   progress?
3. **Dependencies:** Which source contract, artifact, runtime surface, or
   prior decision must exist first?
4. **Downstream consumers:** What will consume the output now or later?
5. **Proof boundary:** Which link is current, which is dated, and which is not
   verified?

## Verified Boundary Example: Issue #437

This is a deliberately partial evidence example, not an execution plan or a
complete current ledger.

| Node | Verified relationship | Evidence boundary |
| --- | --- | --- |
| Feature | Traffic Accounting collector state, safe provenance, protected projection, and status producers. | `docs/CURRENT_RELEASE_STATE.md` and `project-state/tasks.json`, dated 2026-07-11. |
| Issue | Issue #437 is the Traffic Accounting Epic and was observed open on 2026-07-14; current state requires a fresh native Issue read. | Live GitHub Issue inventory on 2026-07-14. |
| PR | PRs #441, #459, #460, and #464 are recorded as reviewed source capabilities in the documented chain. | `RELEASE_MANIFEST.md`, `docs/CURRENT_RELEASE_STATE.md`, and Git history. This example does not claim they are the complete current PR set. |
| Artifact | Those documented capabilities are mapped to the `control-plane-app` release recorded as `phase2-control-plane-artifact-alignment-20260710-001`, source `9bc03b41`. | Repository release snapshot; dated evidence, not artifact retrievability proof at this cutoff. |
| Runtime | The repository snapshot records an observation-only Traffic Evidence Runtime and separates it from offline Runtime Config Identity. | Dated source record only; no live runtime inventory was performed by Issue #484. |

### Isolation Rule

Issue #484 and its documentation PR:

- do not execute, modify, block, reprioritize, or close Issue #437;
- do not modify any Issue #437 PR, artifact, release, runtime, or gate;
- use Issue #437 only to demonstrate how evidence-domain boundaries are
  written when relationships are already verified; and
- must not use `Refs #437`, `Closes #437`, or an equivalent execution claim in
  the PR body.

## Historical Issue #484 Chain (2026-07-14 Cutoff)

This table records the relationship observed at that cutoff; `Draft` is not a
current PR-state claim. Read the native Issue/PR records for current state.

| Node | State |
| --- | --- |
| Feature | Project Knowledge Graph / AI Engineering Orchestration Layer. |
| Issue | #484, independent Engineering Infrastructure index card. |
| PR | Draft PR #485 from `docs/project-intelligence-layer` to `master`. |
| Artifact | `none`; docs/governance only. |
| Runtime | `not_applicable`; no production or runtime change. |

## Anti-Collapse Rules

- A merged PR is not an artifact.
- An artifact is not a deployment.
- A deployment record is not fresh runtime health.
- A dated runtime record is not current live inventory.
- A dependency does not imply execution authority.
- A cross-reference does not make one Issue an execution item for another.
