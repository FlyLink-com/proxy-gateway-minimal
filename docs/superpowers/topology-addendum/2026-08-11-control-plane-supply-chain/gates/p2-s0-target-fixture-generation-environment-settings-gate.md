# P2-S0-FX2-E Gate: Route B Protected Environment Settings

```yaml
phase: P2-S0-FX2-E preparation
previous_phase: P2-S0-FX2 design publication
status: docs-only Gate preparation current / Settings execution not started
risk_class: A
risk_state: controlled_docs_only
record_state: repository_gate_definition_draft
gate_decision: not_granted
current_output: BLOCKED_INPUT
source_revision: a413f636267a3b0fcfc65f7b911fa50f6cd95ea4
source_tree: 488dfff3ee29e5e70b9b23c1cf226119d06f063f
target_environment: p2-s0-route-b-fixture-generation
target_environment_state: absent
settings_authority: false
execution_authority: false
production_authority: false
```

## Decision

PR #609 published the
[P2-S0-FX2 Route B generation-design Gate](p2-s0-target-fixture-generation-gate.md)
at merge `a413f636267a3b0fcfc65f7b911fa50f6cd95ea4`. Publication fixed the
serial Environment, source, generation, retirement, and custody design; it did
not grant the FX2 Gate, create an Environment, select an Action, add a workflow,
or authorize fixture generation.

This child Gate defines the exact fail-closed contract for a later, separately
approved GitHub Settings operation. The current authorization covers this
docs-only Gate package only. It does **not** authorize the Settings operation
described below. The dedicated Environment remains absent, the exact operator /
reviewer / independent-human receipt is not bound, and this Gate is not yet a
published repository definition. Its current output is therefore
`BLOCKED_INPUT`.

The positive future output is limited to
`ENVIRONMENT_READY_FOR_SEPARATE_ROUTE_B_SOURCE_GATE`. It means only that one
dedicated Environment was created and independently read back with the exact
policy below. It does not authorize producer source, workflow permissions,
dispatch, generation, custody, P2-S, Release, Deployment, staging, host, or
production work. Option 1 remains the active hard stop.

## Evidence And Exact Baseline

The read-only inventory completed at `2026-08-11T20:03:23Z` established:

| Input | Exact observation |
| --- | --- |
| Repository | private organization repository; organization plan `enterprise` |
| Remote master | commit `a413f636267a3b0fcfc65f7b911fa50f6cd95ea4`; tree `488dfff3ee29e5e70b9b23c1cf226119d06f063f` |
| Workflow tree | `1a95a55d23f6e7b2d5e60556b9934027b0974b09`; nine tracked workflows |
| Target Environment | exact and case-folded match count `0`; direct GET returned `404` |
| Existing Environments | six; normalized name-set SHA-256 `fabc78eebd9c9a12ad067f5b37b25227245a86b6ae5d2e17999d4901accdf179` |
| Current producer surface | three static Environment bindings, zero dynamic/caller-controlled Environment selectors, zero target-Environment references, zero `id-token: write`, zero `attestations: write`, zero `actions/attest` references |
| Master protection | active `master-governance-single-owner` ruleset on the default branch, zero bypass actors, strict required `Validate` check |
| Actions artifact/log retention | `days=90`; `maximum_allowed_days=90` |
| GitHub changes in inventory | none |

The Environment-name-set digest uses API-returned names normalized to Unicode
NFC, preserves case, sorts by ordinal Unicode scalar order, serializes one
compact JSON string array as UTF-8 without BOM or trailing LF, and SHA-256 hashes
those bytes. The six captured names are ASCII, so scalar/code-unit order is
identical. Collision detection is separate: normalize to NFKC, invariant-
case-fold, and require the target to have zero matches.

Two repository-admin User accounts were observed, so an account-distinct pair
is available. This does not prove that the accounts are controlled by different
humans. The future execution approval must bind the exact Settings operator /
future dispatch actor and one independent-human Environment reviewer / after-
readback reviewer. The reviewer must not perform the Settings mutation and must
be account- and human-distinct from both the Settings operator and future
dispatch actor. The repository receipt may retain only SHA-256 digests of
canonical identity records and the redacted independence declaration; it must
not record tokens, credentials, IP addresses, raw audit payloads, or other
private account data.

Official GitHub contracts used by this Gate:

- [Environment REST API](https://docs.github.com/en/rest/deployments/environments?apiVersion=2026-03-10)
  supports reviewer, self-review, wait-timer, and deployment-branch-policy
  fields, but does not document `can_admins_bypass` as a request field.
- [Managing Environments](https://docs.github.com/en/actions/how-tos/deploy/configure-and-manage-deployments/manage-environments)
  documents disabling administrator bypass in GitHub Settings.
- [Deployment branch policy REST API](https://docs.github.com/en/rest/deployments/branch-policies?apiVersion=2026-03-10)
  provides the separate exact branch-policy write/read surface.
- [Controlling deployments](https://docs.github.com/en/actions/how-tos/deploy/configure-and-manage-deployments/control-deployments)
  documents that future `deployment: false` jobs retain required review while
  creating no Deployment object and are incompatible with custom protection
  Apps.
- [Actions retention REST API](https://docs.github.com/en/rest/actions/permissions?apiVersion=2026-03-10#get-artifact-and-log-retention-settings-for-a-repository)
  provides the repository artifact/log-retention readback. This Gate does not
  change it.

These contracts are drift-prone. A future execution must refresh them and the
live baseline before the first write.

## Required Selector Closure

The separate execution approval is not requestable until one bounded packet
fills all selectors below:

1. exact remote master commit/tree and this published Gate commit/tree/blob;
2. exact workflow tree and ordered nine-path workflow manifest, with every
   existing static Environment binding enumerated and zero dynamic or caller-
   controlled Environment selectors, target-Environment references, OIDC,
   attestation-permission, and `actions/attest` references;
3. exact target Environment name, direct `404`, and zero case-insensitive or
   Unicode-normalized name collisions;
4. exact Settings operator User ID/login canonical-record digest, active
   organization membership, and repository-admin readback;
5. exact future dispatch-actor User ID/login canonical-record digest;
6. exact reviewer/after-readback User ID/login canonical-record digest,
   repository read access, account inequality with the Settings operator and
   future dispatch actor, and a redacted declaration that all required
   independent-human relationships hold;
7. exact desired-state JSON, request body digest, Settings UI instruction
   digest, branch-policy request digest, and approved execution window;
8. a normalized before digest for all existing Environments plus the exact
   post-create queries that must prove zero target secrets, variables, custom
   rules, and Deployments;
9. repository Actions artifact/log retention and maximum readback;
10. exact read-only after-query set, normalization rules, audit-event selector,
    redaction policy, timeouts, and no-blind-retry rule;
11. exact allowed external-write list and an approval-consumption receipt; and
12. an inert partial-state plan plus a separate destructive-remediation boundary.

Missing, ambiguous, stale, or internally inconsistent selectors return
`BLOCKED_INPUT` before any write. Account inequality without the independent-
human declaration is insufficient.

## Exact Desired Environment Contract

The only acceptable normalized target state is:

```yaml
name: p2-s0-route-b-fixture-generation
can_admins_bypass: false
normalized_wait_timer_minutes: 0
wait_timer_protection_rule_count: 0
required_reviewers:
  count: 1
  type: User
  identity: exact_digest_bound
  prevent_self_review: true
deployment_branch_policy:
  protected_branches: false
  custom_branch_policies: true
custom_branch_policies:
  total_count: 1
  exact:
    name: master
    type: branch
environment_secrets: 0
environment_variables: 0
enabled_custom_deployment_protection_apps: 0
environment_deployments: 0
```

`protected_branches=true` is forbidden. It would authorize every protected
branch and can expand as repository protection changes; if no branch is
protected it may permit every branch. The custom policy must contain exactly
one `type=branch,name=master` item, with no tag, wildcard, or second policy.
Master must also remain independently protected by the active repository
ruleset.

The future producer's attestation job must later bind this Environment with
`deployment: false`. That workflow requirement is not an Environment setting
and is not authorized here. Zero Environment secrets/variables also does not
prove the absence of repository/organization secrets, variables, `GITHUB_TOKEN`,
or OIDC capabilities; FX2-S must enforce those source boundaries separately.

## Allowed Future Mutation

Only a new, separate, exact Risk A execution approval may permit the following
three external writes, in this order:

1. one REST `PUT` for the exact Environment with complete input:

   ```json
   {"wait_timer":0,"prevent_self_review":true,"reviewers":[{"type":"User","id":123456789}],"deployment_branch_policy":{"protected_branches":false,"custom_branch_policies":true}}
   ```

   Here `123456789` is a numeric illustration only. The execution packet must
   substitute the exact approved integer User ID and hash the final exact body.

2. one GitHub Settings UI change on that exact Environment to clear **Allow
   administrators to bypass configured protection rules**, followed immediately
   by GET readback of `can_admins_bypass=false`; and
3. one branch-policy `POST` with exact body
   `{"name":"master","type":"branch"}`.

The first external write consumes the approval even if the response is lost,
times out, or returns an ambiguous error. No write may be blindly retried.
After ambiguity, the operator must stop, perform only the approved GET/audit
queries, classify the actual state, and obtain a fresh approval before another
write unless the original request is proven to have landed exactly and the
remaining already-approved sequence is still unambiguous.

The Gate does not authorize changes to Actions retention, repository rulesets,
other Environments, Environment secrets/variables, custom protection Apps,
workflows, source, permissions, packages, lockfiles, Releases, Deployments,
attestations, artifacts, or production/provider state. It also does not
authorize deleting the Environment.

## Execution Order And Fail-Closed Checks

### Before the approval is consumed

Re-read all selectors. Stop with `BLOCKED_INPUT` if master/tree, Gate blob,
workflow tree/list, complete static/dynamic Environment-binding inventory,
target absence, existing-Environment digest, identity/access receipts, ruleset,
plan/visibility, retention, official request fields, or open PR classification
has drifted. An open #594 at its captured head is not an
FX2-E Settings blocker, but it remains a hard FX2-S blocker and must never be
merged as Route B source. Any open PR merged before execution requires a full
rebind.

### After Environment creation

The initial PUT creates custom-policy mode before any matching policy exists.
No target or dynamic/caller-controlled producer binding may exist, so this
intermediate state has no authorized consumer. Read back the Environment
ID/name/timestamps, required reviewer,
self-review flag, and branch-policy mode. Any extra rule, reviewer, secret,
variable, custom App, Deployment, or target workflow reference is
`NO_GO_OPTION1`.

### After administrator-bypass closure

The public REST request contract does not expose a supported
`can_admins_bypass` write field. The operator must use only the approved
Settings UI control and then require `can_admins_bypass=false` from Environment
GET. A positive output also requires at least one filtered, platform-issued
`environment.update_protection_rule` audit receipt bound to the expected actor,
target, and execution window and carrying a non-null administrator-bypass
transition field, or a separately approved equivalent immutable platform
receipt. A generic reviewer/PUT protection-rule event cannot satisfy this
selector; final Environment GET must independently return
`can_admins_bypass=false`. Audit-log delay before the exact approved timeout yields
`ENVIRONMENT_PENDING_AUDIT_RECEIPT` and cannot produce a positive output; expiry
without the receipt returns `NO_GO_OPTION1`. A contradictory event, wrong actor/
target, or later mutation is a hard stop.

### After exact-master policy creation

Perform the complete independent readback. The branch-policy create response
must be the first successful creation; a duplicate/competition response is not
positive evidence. Never add a broader policy to repair a mismatch.

## Independent After Readback

The exact digest-bound reviewer, who must not have performed the Settings
mutation and must be account- and human-distinct from its operator, must verify
all of:

- exact Environment ID/name and creation/update timestamps within the approved
  window;
- exact normalized desired state above;
- protection-rule type set exactly `required_reviewers` plus `branch_policy`;
- exact reviewer ID/login digest and `prevent_self_review=true`;
- exact one custom branch policy `master/type=branch`;
- `can_admins_bypass=false` from Environment GET;
- target secret count `0`, variable count `0`, enabled custom-rule count `0`,
  and Deployment count `0` from their separate APIs;
- repository retention still exactly `90/90` or the freshly approved rebind;
- master remains protected by the exact active ruleset;
- the complete workflow Environment-binding inventory still contains only the
  three approved static bindings and zero dynamic/caller-controlled selectors or
  target references;
- no target workflow run, check, artifact, attestation, Release, Deployment, or
  deployment-status object was created;
- all six pre-existing Environments have unchanged normalized digests; and
- at least one expected actor/target/window administrator-bypass-specific
  platform audit receipt exists and filtered audit events contain no
  contradictory mutation.

The receipt must hash canonical redacted JSON and record query/API versions and
normalization. It must not retain variable values, credentials, audit tokens,
IP/location, user-agent, or raw private payloads.

## Failure, Recovery, And Persistent State

The safe rollback for this Gate is a hard stop, not an automatic deletion.
GitHub documents that deleting an Environment deletes its protection rules and
secrets and fails waiting jobs; there is no object-restore operation. If any
post-write check fails, classify partial state as inert only if readback proves
custom-policy mode remains enabled with zero matching policies, the exact
reviewer/self-review rule remains present, and there are zero target or dynamic
workflow bindings, secrets, variables, custom Apps, Deployments, runs, and other
unexpected writes. Keep all Route B source/dispatch authority false and require
a new Settings Gate for remediation or a separately approved destructive
deletion. A null/broad branch policy, extra/missing reviewer or policy, any
dynamic selector, any unauthorized consumer/write, or inability to prove the
fail-closed subset returns `NO_GO_OPTION1`; it must not be labeled inert.

Do not weaken review, enable administrator bypass, add branches, add secrets, or
create a workflow to make a partial Environment appear usable. Any unexpected
run/Deployment/attestation/Release, nonzero secret/variable/custom App, change to
another Environment, identity leak, response ambiguity that cannot be closed,
or unapproved write returns `NO_GO_OPTION1`. A clean pre-write drift returns
`BLOCKED_INPUT` without consuming approval.

## Outputs And Downstream Boundary

This docs-only Gate definition may return only:

| Output | Meaning |
| --- | --- |
| `READY_FOR_SEPARATE_FX2E_EXECUTION_APPROVAL` | Published Gate and all pre-write selectors are complete; requestable, not executable authority |
| `BLOCKED_INPUT` | One or more required selectors are absent, stale, or ambiguous |
| `REDESIGN_ENVIRONMENT_CONTROL` | Official platform behavior cannot provide the exact policy safely |
| `NO_GO_OPTION1` | Safety invariant failed or an unauthorized/ambiguous external change occurred |

A separately approved execution may additionally record
`ENVIRONMENT_READY_FOR_SEPARATE_ROUTE_B_SOURCE_GATE` only after the complete
independent after-readback. A partial state is
`PARTIAL_ENVIRONMENT_INERT_REQUIRES_SEPARATE_SETTINGS_GATE`; it is never a
positive output. A desired-state configuration waiting inside its exact audit
timeout is `ENVIRONMENT_PENDING_AUDIT_RECEIPT`; it grants no downstream
authority and becomes `NO_GO_OPTION1` if the timeout expires unclosed.

Forbidden outputs include `SOURCE_AUTHORIZED`, `WORKFLOW_AUTHORIZED`,
`DISPATCH_AUTHORIZED`, `GENERATED_FIXTURE_PENDING_MANDATORY_SOURCE_RETIREMENT`,
`GENERATED_FIXTURE_READY_FOR_SEPARATE_CUSTODY_HANDOFF`,
`FIXTURE_INPUT_READY_FOR_P2S0_REEVALUATION`,
`READY_FOR_SEPARATE_P2S_APPROVAL`, `P2_GREEN`,
`IMPLEMENTATION_AUTHORIZED`, and `PUBLICATION_AUTHORIZED`.

After a positive FX2-E execution receipt, FX2-S still requires a separate
source Gate, closure of PR #594 without merge, fresh master/workflow/package/
lock/conflict bindings, independent immutable Action-pin review, and exact
source/retirement automation contracts. Nothing in FX2-E fills any of the
parent P2-S0 eight input classes.
