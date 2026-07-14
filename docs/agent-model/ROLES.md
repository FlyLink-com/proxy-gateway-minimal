# Engineering Orchestration Roles

Last verified: 2026-07-14, America/Los_Angeles.

> Status:
> - Type: Role and handoff contract
> - Risk: C
> - Execution authority: Does not authorize code, production, runtime,
>   provider, deployment, promotion, rollback, schema, auth, credential, or
>   customer-data actions
> - Production impact: None
> - Source of truth for: Planner, Architect, Engineer, and Reviewer role
>   boundaries within the existing lead-agent operating model

## Compatibility With Existing Roles

This document does not create autonomous runtime agents or replace
`docs/MULTI_AGENT_OPERATING_MODEL.md`.

| Orchestration role | Existing model alignment |
| --- | --- |
| Planner | A planning function under the Lead Agent/controller. |
| Architect | Aligns with the existing Architecture Agent scope. |
| Engineer | Aligns with Code Agent or Documentation Agent for the assigned files. |
| Reviewer | Aligns with read-only semantic, Validation, and Security review functions. |

The Lead Agent/controller remains responsible for risk classification, scope,
file ownership, integration, final validation, GitHub writes, and user-facing
claims. A role never lowers Risk A/B/C or bypasses approval.

## Planner

**Responsibilities**

- Restore current context from required docs, Git, GitHub, and applicable live
  evidence.
- Classify Risk A/B/C and state process, expected PR count, validation, and
  production impact.
- Define the Issue goal, include/exclude scope, dependencies, information gaps,
  acceptance criteria, and next gate.
- Keep the task on one primary lane and identify high-conflict files.

**Forbidden**

- Treating a plan, Issue, or runbook as execution approval.
- Inventing current status, owners, dependencies, or runtime facts.
- Expanding a C/B task into production, provider, auth, schema, or runtime work.
- Marking implementation, validation, Ready, merge, or release complete.

**Handoff boundary**

Hands an evidence-backed task packet to the Architect when boundaries need
design clarification, or directly to the Engineer when the current design is
already explicit and approved.

## Architect

**Responsibilities**

- Map logical planes, module responsibilities, interfaces, dependencies,
  consumers, non-goals, and failure/rollback boundaries.
- Reconcile proposed structure with current code and active architecture docs.
- Prefer the modular-monolith and existing project-state mechanisms unless
  measured evidence supports a change.
- Identify which statements are current facts, dated evidence, inferences, or
  information gaps.

**Forbidden**

- Declaring live production architecture from repository diagrams alone.
- Creating a new source of truth, service, database, queue, dashboard, or
  external dependency without explicit scope.
- Designing around secrets or copying protected material into a task packet.
- Implementing or approving its own design unless separately assigned that
  role and validation remains independent.

**Handoff boundary**

Hands the Engineer a bounded design with allowed files, contracts,
acceptance criteria, risk, and required checks. Unresolved decisions return to
the Planner/controller instead of becoming implementation guesses.

## Engineer

**Responsibilities**

- Confirm branch, status, allowed files, and existing user changes before
  editing.
- Implement the smallest change satisfying the approved task packet.
- Preserve current contracts and keep non-goals out of the diff.
- Run scoped implementation checks and report exact commands/results.
- Return changed files, known limitations, and remaining gates to the
  controller/reviewer.

**Forbidden**

- Editing files or external state outside the assigned boundary.
- Reverting user changes, modifying existing PRs/Issues without authority, or
  silently resolving concurrent conflicts.
- Claiming production/runtime success from local tests or source changes.
- Marking Ready, merging, deploying, promoting, or rolling back unless that
  exact action is separately authorized and role-owned.

**Handoff boundary**

Hands a concrete diff and scoped validation receipt to the Reviewer/controller.
Failures, skipped checks, and information gaps remain explicit.

## Reviewer

**Responsibilities**

- Review semantic alignment, scope, risk, dependency accuracy, sensitive-data
  boundaries, and acceptance criteria.
- Verify the exact diff and run or independently inspect required final checks.
- Confirm that Draft/Ready, merge, artifact, deployment, and runtime claims are
  not collapsed.
- Return actionable findings with severity and evidence, or record that no
  blocking finding was found for the reviewed scope.

**Forbidden**

- Mutating implementation or external state by default. Review is read-only
  unless a separate authorization assigns implementation.
- Approving a different head, scope, target, or gate than the one reviewed.
- Treating absence of a finding as proof of live production health.
- Marking Ready, merging, or releasing when required evidence is incomplete.

**Handoff boundary**

Returns findings to the Engineer, or returns a validation receipt to the
controller. Only the controller performs final GitHub integration.

## Handoff Matrix

| From | To | Required packet |
| --- | --- | --- |
| Planner | Architect | Goal, risk, include/exclude, verified facts, gaps, dependencies, acceptance, next gate. |
| Architect | Engineer | Module/interface map, allowed files, non-goals, failure boundaries, validation expectations. |
| Engineer | Reviewer | Exact head, diff/files, implementation summary, scoped checks, failures/skips, remaining gates. |
| Reviewer | Controller | Findings by severity, exact reviewed head, commands/results, acceptance status, unresolved risk. |
| Controller | User/operator | Known facts, completed scope, risks/gaps, validation result, and exact next gate. |

## Single-Agent Use

One person or AI session may perform multiple roles for a small C/B task, but
must keep the handoff evidence distinct. Self-review does not remove the need
for fresh final validation, and a single session cannot self-authorize Risk A
mutation.
