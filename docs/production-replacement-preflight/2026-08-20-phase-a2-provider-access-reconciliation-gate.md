# Phase A2 Provider-Access Audit Reconciliation Gate

```yaml
document_metadata:
  doc_type: operational
  lifecycle: active
  authority_scope: phase_a2_provider_access_audit_reconciliation
  superseded_by: null
  last_verified_at: 2026-08-20
  production_authority: false
```

> Status:
> - Change risk: C, docs-only
> - Inherited provider boundary: Risk A
> - Tracking Issue: #634
> - Parent Epic: #632
> - Replay receipt PR: #633
> - Execution mode: evidence-only reconciliation
> - Provider-access authority: None
> - Production authority: None

## Purpose

This Gate determines whether the completed Phase A2 verify-only replay is
eligible for formal audit closeout. It evaluates only already-retained,
independently resolvable, redacted evidence for:

1. the operator authorization that preceded provider access; and
2. the credential provenance and local before/after boundary used by that
   execution.

It does not replay the workload, access Aliyun, inspect credential values, or
rewrite the historical execution result. The predecessor replay and cleanup
remain `PASS`; formal A2 audit closeout remains `BLOCKED` unless this Gate
produces an `eligible` terminal receipt.

## Gate Identity And Predecessor Binding

```yaml
gate:
  id: phase-a2-provider-access-audit-reconciliation-2026-08-20
  tracking_issue: 634
  parent_issue: 632
  receipt_pr: 633
  risk: C
  inherited_provider_risk: A
  mode: evidence_only
  state: proposed
  provider_access_authority: false
  production_authority: false

predecessor:
  source_master: f2e4095661b8e5b1a15e5be5326cc67c2c3abfff
  replay_receipt_path: docs/production-replacement-preflight/2026-08-20-phase-a2-dependency-artifact-consumer-replay.md
  replay_receipt_sha256: f792cc09abf49c9df3822ede16cff5c4c4a147cb7f22e9c3ae57abcd15ad342c
  replay_status: PASS
  cleanup_status: PASS
  audit_closeout_status: BLOCKED
  production_promotion_status: NOT_AUTHORIZED
```

The terminal reconciliation must bind the exact predecessor receipt bytes and
SHA-256. A later receipt edit requires a fresh reconciliation decision; it must
not silently inherit an earlier result.

## Allowed Evidence Sources

Only exact, already-retained references are admissible:

- a GitHub Issue comment or PR review/comment in
  `gccwebos-com/proxy-gateway-minimal`, addressed by stable URL or numeric ID;
- a repository file at an exact Git commit and canonical repository path; or
- a prior redacted execution record that itself contains an exact upstream
  reference and SHA-256.

The controller may read only the named reference and its minimal provenance
metadata. Broad provider, account, Issue, comment, workstation, filesystem, or
credential discovery is outside this Gate. Conversation memory, an internal
label, reconstructed prose, or an unreferenced statement is not durable
evidence.

## Operator-Authorization Evidence Contract

An authorization record is `verified` only when one durable source proves all
of the following fields as they existed before execution:

```yaml
approval_record:
  evidence_ref: <stable-github-url-or-exact-git-reference>
  evidence_sha256: <sha256-of-exact-evidence-bytes>
  authored_at: <utc-timestamp>
  author_principal: <identity-from-the-durable-source>
  gate_id: phase-a2-non-production-dependency-artifact-consumer-replay
  source_master: f2e4095661b8e5b1a15e5be5326cc67c2c3abfff
  provider: aliyun-swas
  target_identity_sha256: <redacted-exact-target-identity>
  allowed_actions: []
  allowed_command_families: []
  forbidden_actions: []
  approved_at: <utc-timestamp>
  expires_at: <utc-timestamp>
  consumed_at: <utc-timestamp>
```

Acceptance requires:

- the author identity and timestamp come from the durable source rather than
  from new explanatory text;
- the evidence predates the first provider operation;
- Gate, source, provider, redacted target, action, command, mutation, forbidden,
  and time-window boundaries match the executed receipt exactly;
- `consumed_at` is inside the approved time window; and
- the evidence does not expose a secret, credential, private key, raw config,
  environment value, customer data, or unrelated provider inventory.

Missing fields, an opaque label, postdated evidence, a different target or
scope, or a newly reconstructed approval yields `missing_or_invalid`. This
Gate cannot backdate or manufacture approval.

## Credential-Provenance Evidence Contract

Credential provenance is `verified` only when execution-time evidence proves:

```yaml
credential_provenance:
  evidence_refs: []
  logical_id_sha256: <redacted-logical-credential-identity>
  privilege: verified_scope | unverified_assume_full_access
  local_source: process_only | approved_one_time_handoff
  process_environment_before: absent
  process_environment_after: absent
  user_environment_before: absent
  user_environment_after: absent
  machine_environment_before: absent
  machine_environment_after: absent
  cli_config_before: absent
  cli_config_after: absent
  handoff_before: absent | approved_present
  handoff_deleted_before_first_provider_call: true
  handoff_after: absent
  provider_credential_status: revoked | expired | unverified_assume_valid
```

Each evidence reference must be independently resolvable and bind the safe
field values to the replay execution window. The Gate must never read or record
the raw credential, CLI configuration value, environment value, private key,
token, or sensitive log.

`configured-cli-opaque`, an uninspected CLI config, a missing execution-time
before state, a post-hoc assertion, or incomplete cleanup evidence is
`missing_or_invalid`. A current workstation readback cannot prove the historical
before state and cannot upgrade it to `verified`.

## Evidence-Only Procedure

1. Recompute and bind the predecessor receipt SHA-256.
2. Resolve only the exact authorization evidence reference named for this
   Gate and verify its source identity, author, timestamp, digest, and complete
   boundary.
3. Resolve only the exact credential-provenance evidence references and verify
   all required safe before/after fields.
4. Reject any evidence that is postdated, reconstructed, ambiguous,
   scope-mismatched, sensitive, or independently unreadable.
5. Produce one terminal receipt with `eligible` only when both evidence classes
   are `verified`; otherwise produce `blocked` with aggregate reasons.
6. Link the terminal receipt to Issues #634 and #632 and PR #633. Do not change
   production or begin Phase A3.

## Allowed Commands

The execution approval for this reconciliation may allow only exact,
read-only commands against named GitHub/repository references:

- `git show`, `git cat-file`, and SHA-256 calculation for the exact predecessor
  and named repository evidence;
- `gh issue view`, `gh pr view`, or `gh api` for an exact repository object or
  comment ID already named by the Gate; and
- the documentation validation commands listed below.

It must not allow discovery searches, credential/config inspection, provider
CLI/API calls, SSH, Cloud Assistant, browser fallback, or unrelated repository
reads.

## Stop Conditions

Stop and return `blocked` when any of these is true:

- an evidence reference is missing, opaque, ambiguous, postdated, modified,
  or independently unreadable;
- approval does not bind the exact Gate, source, provider, redacted target,
  commands, mutation boundary, forbidden actions, and execution window;
- credential provenance does not prove an allowed local source and complete
  execution-time before/after state;
- the predecessor receipt SHA-256 differs;
- a step would require reading sensitive material, querying Aliyun, accessing
  the host, rerunning replay, or mutating GitHub/production state; or
- the output would reveal secrets, credential material, raw config, private
  infrastructure data, or customer data.

No blocked result is retried under the same Gate. New evidence or a changed
scope requires a new proposed Gate and operator decision.

## Terminal Receipt Contract

```yaml
reconciliation_receipt:
  gate_id: phase-a2-provider-access-audit-reconciliation-2026-08-20
  predecessor_receipt_sha256: <exact-sha256>
  approval_evidence:
    state: verified | missing_or_invalid
    evidence_ref: <safe-reference-or-null>
    evidence_sha256: <safe-sha256-or-null>
  credential_provenance:
    state: verified | missing_or_invalid
    evidence_refs: []
  provider_access_performed: false
  credential_content_read: false
  replay_performed: false
  provider_mutation: none
  production_mutation: none
  result: eligible | blocked
  conclusion: <aggregate-safe-summary>
  next_gate: <owner-review-or-remain-blocked>
```

`eligible` requires both evidence states to be `verified`. Every other
combination is `blocked`. A terminal `eligible` receipt makes A2 eligible for a
fresh owner review; it does not itself merge PR #633, close Issue #632, create
Phase A3, or authorize production promotion.

## Validation

```powershell
git diff --check origin/master...HEAD
npm run docs:authority:strict
npm run governance:check
```

## Explicit Non-Goals

- no Aliyun API/CLI, SSH, Cloud Assistant, host, key, firewall, or package
  operation;
- no replay, artifact download, extraction, native smoke, or cleanup rerun;
- no credential inspection, creation, rotation, revocation, persistence, or
  provider-side status claim;
- no production inventory, deployment, migration, rollback, service, database,
  feature-flag, Welcome Coins, or customer-data action; and
- no retroactive rewrite of the completed replay or cleanup facts.

This Gate is governed by `docs/INFRASTRUCTURE_ACCESS_RULE.md` and
`docs/GITHUB_ISSUE_PR_WORKFLOW.md`.
