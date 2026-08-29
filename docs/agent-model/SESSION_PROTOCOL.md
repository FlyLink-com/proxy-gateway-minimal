# AI Engineering Session Protocol

Last verified: 2026-07-14, America/Los_Angeles.

```yaml
document_metadata:
  doc_type: canonical
  lifecycle: active
  authority_scope: agent_model_session_protocol
  superseded_by: null
  last_verified_at: 2026-08-29
  production_authority: false
```


> Status:
> - Type: Session recovery, scope, handoff, and completion protocol
> - Risk: C
> - Execution authority: Does not authorize code, production, runtime,
>   provider, deployment, promotion, rollback, schema, auth, credential, or
>   customer-data actions
> - Production impact: None
> - Authority: Derived session checklist only; `AGENTS.md`, current project
>   context, and risk-specific runbooks govern conflicts
> - Index scope: How AI engineering sessions recover context, verify facts,
>   avoid conflicts, hand off work, and declare completion

## 1. Session Header

Start every task with:

```text
Risk: A/B/C
Process: <tier-appropriate workflow>
Expected PR count: <number>
Validation: <exact commands/gates>
Production/AWS impact: <none/read-only/mutation gated>
Issue/PR: <current identifiers or none>
Allowed files/actions: <scope>
Forbidden files/actions: <scope>
```

## 2. Context Recovery

For `proxy-gateway-minimal`, read and verify in this order:

`AGENTS.md` always applies; it defines the repository task rules but does not
replace the current-state reads below.

1. `docs/CURRENT_RELEASE_STATE.md` completely;
2. `RELEASE_MANIFEST.md` completely;
3. `docs/PROJECT_CONTEXT.md` completely;
4. `git status --short --branch`, current branch/HEAD, `origin/master`, and
   remote/worktree context;
5. `docs/README.md` and the relevant subsystem, workflow, or runbook;
6. native Issue and PR records for current state, scope, declared risk, done
   criteria, review evidence, and sequencing; use Project #1 only as a mutable
   navigation projection;
7. `project-state/current.json`, `lanes.json`, and `tasks.json` only when dated
   compatibility evidence, reviewed lane definitions, or historical task
   constraints are relevant;
8. fresh live inventory only when the risk and authority require it.

Treat JSON snapshots and docs as dated where their headers say so. Neither
Project fields nor snapshot-derived brief output can replace a native Issue/PR
read, authorize Risk A, or prove production. A session must not replace current
checks with memory or a previous handoff.

## 3. Fact Ledger

Keep four categories distinct:

| Category | Meaning | Allowed language |
| --- | --- | --- |
| Known fact | Direct current file, Git, GitHub, test, or approved live evidence. | `verified`, with source/cutoff. |
| Dated fact | Valid evidence at an earlier cutoff. | `documented as of ...`; not current live proof. |
| Reasonable inference | Conclusion supported by facts but not directly observed. | `inference`, with assumptions. |
| Information gap | Evidence is absent, inaccessible, conflicting, or outside authority. | `unknown` / `not verified`; name the next evidence gate. |

Never turn an inference or information gap into current status.

## 4. Task Boundary

- Bind work to one Issue/PR/branch and one primary lane.
- List include and exclude scope before editing.
- Confirm existing user changes and do not revert them.
- Do not modify another open PR or Issue unless explicitly authorized.
- Do not let Engineering Enablement become production governance execution.
- Stop when an action requires new authority, a different risk tier, or a
  materially different design choice.

## 5. Concurrent Work And Conflict Avoidance

- One controller owns final integration, validation, GitHub writes, and
  user-facing claims.
- Assign one writer per high-conflict source-of-truth file at a time.
- Before editing or handing off, re-run `git status --short --branch` and
  inspect the exact diff.
- Check open PR file lists before touching active shared state/docs.
- Parallel work is allowed only for independent files and no shared external
  mutation. Production/provider mutation is serialized.
- A conflict is not resolved by silently choosing one agent's version. Return
  to the controller with both evidence sets and the affected files.

## 6. Sensitive Information

Do not output, store, commit, or place in task packets:

- secrets, tokens, passwords, private keys, or provider credentials;
- subscription URLs or protected subscription material;
- raw environment/configuration, controller payloads, logs, or database rows;
- customer identity, account, order, billing, usage, or other private data.

Record only presence, safe logical location, redacted aggregate state, and the
required rotation/escalation action. If exposed, replace the value with
`[REDACTED_SECRET]` and recommend rotation without repeating it.

## 7. Handoff Packet

```text
Scope handled:
Issue / PR / branch:
Base and exact head:
Changed files:
Known facts:
Dated facts:
Inferences:
Information gaps:
Commands run and exact results:
Sensitive-data check:
Production/runtime impact:
Remaining gates:
Recommended next owner:
```

The receiver verifies the head and diff instead of trusting a completion
claim.

## 8. Completion Conditions

A session may report its assigned scope complete only when:

- the intended files/actions are present and no unauthorized files changed;
- required validation ran fresh against the final head/diff and results were
  read;
- Issue/PR metadata records intent, scope, non-goals, evidence, impact,
  rollback, and remaining gates;
- sensitive information is absent;
- Draft/Ready/merge/release state is reported accurately; and
- completion of one task is not overstated as phase, branch, repository,
  production, or runtime completion.

As a dated historical example, Issue #484 originally defined completion as one
validated Draft PR that remained unmerged/not Ready at that cutoff. Its later
native Issue/PR lifecycle supersedes that snapshot; neither the example nor its
completion implied Issue #437, Phase 2, or production completion.

## 9. Machine Interface Reservation

This protocol is documentation only. `project-state/lanes.json` retains the
reviewed lane taxonomy, while `current.json` and `tasks.json` are dated
compatibility snapshots; none is current-work coordination authority.
`npm run project-state:check` validates their structure and fresh-native-read
boundary, not the truth of mutable work or production state. Future automation
must first prove that these repository-local contracts and checks are
insufficient, then extend them in a separate reviewed B-tier change.
Do not add a second YAML state file, service, CI workflow, dashboard, provider,
or external dependency from this protocol.
