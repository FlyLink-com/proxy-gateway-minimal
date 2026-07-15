# Engineering Workflow

Last verified: 2026-07-14, America/Los_Angeles.

> Status:
> - Type: Issue-to-release workflow contract
> - Risk: C
> - Execution authority: Does not authorize code, production, runtime,
>   provider, deployment, promotion, rollback, schema, auth, credential, or
>   customer-data actions
> - Production impact: None
> - Authority: Derived workflow index only; `AGENTS.md`, release governance,
>   and Issue/PR workflow rules govern conflicts
> - Index scope: Align Issue -> Planning -> Design -> Implementation -> Review
>   -> Merge -> Release with repository gates

## Workflow

```text
Issue -> Planning -> Design -> Implementation -> Review -> Merge -> Release
```

| Stage | Required evidence | Exit condition | Hard stop |
| --- | --- | --- | --- |
| Issue | Goal, Risk, include/exclude, dependencies, done criteria, production posture. | Durable owner/index exists when required; small B/C work may use the PR alone. | Scope or authority is ambiguous. |
| Planning | Current docs/Git/GitHub facts, information gaps, branch/PR strategy, validation and rollback expectations. | Bounded task packet and next gate. | A drift-prone fact is guessed or Risk A boundary lacks exact approval flow. |
| Design | Current source boundaries, interfaces, consumers, non-goals, acceptance criteria. | Design is explicit enough to implement without inventing behavior. | Design creates a competing truth source or crosses scope. |
| Implementation | Exact branch/diff, approved files, code/docs/tests or approved inventory. | Assigned change is present and scoped checks are recorded. | Unexpected files, user changes, target, identity, or mutation boundary. |
| Review | Semantic review, security/privacy boundary, exact-head validation, remaining gates. | No blocking finding for the reviewed head and PR loop is complete. | Validation fails, reviewed head changes, or evidence is incomplete. |
| Merge | Ready transition, reviews/checks, exact reviewed head. | Reviewed source is integrated into `master`. | Draft, stale review, missing checks, or unresolved required finding. |
| Release | Artifact and Production Gates as applicable. | Exact artifact/release is validated on the exact target with rollback evidence. | No durable artifact, no exact approval, no backup, or target validation fails. |

## Risk-Tier Application

| Risk | Workflow weight | Required validation | Release boundary |
| --- | --- | --- | --- |
| C | One focused docs/governance PR; no separate spec/plan PR. | `git diff --check origin/master...HEAD`; project-state checker only when `project-state/` or its checker changes. | Normally `release_unit: none`; no Deploy Note beyond `Not deployed`. |
| B | One PR containing intent, implementation, tests, and necessary docs. | Touched-surface checks plus `npm test`; Admin changes also require Admin tests/build. | Source merge is not production; later deployment remains a separate gate. |
| A | Runbook/spec, read-only inventory, dry-run/no-op proof, exact operator approval, backup, serialized execution, validation, rollback evidence. | Runbook-specific checks for the exact target and head. | Production Gate is always separate and exact; approval is consumed on execution. |

## Draft, Ready, Merge, And Release

- **Draft:** Default while intent, execution, validation, review, or remaining
  gates are incomplete. Draft is the required state for Issue #484's PR.
- **Ready:** Allowed only after the PR's complete loop is evidenced for the
  exact head. Issue #484 does not authorize this transition.
- **Merge:** Integrates reviewed source only. It does not create an artifact,
  deployment, or live runtime claim.
- **Release:** Requires the applicable Artifact and Production Gates. A
  docs-only governance PR has no production release action.

## PR Evidence Contract

Every PR records:

- linked Issue or reason for standalone work;
- lead/supporting roles and task routing;
- Risk, process, expected PR count, and production/runtime/auth/schema impact;
- exact files or behavior changed;
- commands actually run and actual results;
- `identity_impact` and release unit posture;
- Deploy Note only after a real deployment/rollback/static replacement;
- remaining gates and non-goals.

Use `Refs #<issue>` for partial contribution and `Closes #<issue>` only when
the Issue done criteria are fully satisfied. The Issue #484 PR may close #484
only after review/merge if its done criteria are complete; it must not reference
Issue #437 as an execution item.

## Validation Rules

- Validation evidence belongs to the exact current head.
- A command not run is `not_run`, not passed.
- A failed command stays failed until the full required command is rerun and
  passes.
- Build evidence does not substitute for semantic review, production
  inventory, or deployment validation.
- After any change made in response to review, rerun the applicable checks.

## Deploy Note Rules

A Deploy Note is required only after a production deployment, rollback, or
static replacement actually occurs. It records the fixed `release_unit`, exact
source/artifact, target, backup, validation, and identity evidence when
applicable. For this Engineering Enablement task:

```yaml
release_unit: none
production_state: not_applicable
identity_impact: false
deploy_note: Not deployed
```

## Issue #484 Path

```text
Issue #484
  -> verified repository/GitHub inventory
  -> docs/project-intelligence-layer
  -> documentation implementation
  -> exact diff and scope review
  -> Draft PR
  -> later human review gate
```

There is no Ready, merge, artifact, deployment, provider, or runtime action in
the authorized scope.
