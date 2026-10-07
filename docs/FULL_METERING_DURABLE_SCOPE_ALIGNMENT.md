# Full-metering durable scope alignment

```yaml
document_metadata:
  doc_type: operational
  lifecycle: active
  authority_scope: full_metering_durable_scope_alignment
  superseded_by: null
  last_verified_at: 2026-10-07
  production_authority: false
```

Risk: B source core / A production envelope. One minimal implementation PR,
related to #437 and the runtime authority established by #742.
`release_unit: control-plane-app`; `identity_impact: true`;
`identity_gate: pending`. This is a repair procedure, not a deployment receipt.

## Fault and bounded repair

The October 7 JP VLESS readonly trace found 32 collector-eligible identities but
30 loaded identities. Both missing identities were legacy primary records whose
requests already had a nonempty durable credential list on other channels.
The trace proved current composition, not who changed it or whether its original
cause was migration or explicit removal. Source and runtime receipts do not
contain member-level historical evidence sufficient to decide that intent.

Portal runtime desired state uses the nonempty durable list exclusively. Full
metering previously also required the old primary to be loaded. Account and
entitlement activity alone do not authorize every historical channel.

The repair changes full-metering classification, its driver and the read fence:

- After all existing ownership, global resolver, material and resource-link
  checks, classify a legacy primary with any same-request durable credentials as
  retained, with reason `portal_durable_scope_supersedes_primary`. This includes
  durable channels outside the five-source collection scope.
- Keep the old reference, material digest and evidence. Do not delete database
  rows, protected material, usage samples, cursors or checkpoint history.
- If that superseded identity is still loaded in runtime, fail with
  `full_metering_superseded_identity_running`. Retention must not create an
  unbilled live channel. Do not automatically remove runtime configuration.
- Bind this runtime-absence policy in the before/after inventory comparison,
  including changes to a previously expired retained identity while sources are
  being read. This adds no field to the persistent checkpoint format.
- Truly legacy requests with no durable list still require their verified
  primary in runtime. Durable primary mirrors remain eligible. Missing active
  identities, unknown runtime identities and material changes still block.
- Leave the separately gated historical VLESS v3 recovery policy, Portal desired
  state, subscription rendering, billing windows, database schema and commercial
  entitlements unchanged. Do not re-enable an old collector.

## Validation boundary

Fixtures use synthetic accounts, real SQLite, the actual binding resolver,
source driver, collector, journal and sample writer. Native process/statistics
responses are injected; these are not production protocol or client tests.

Before repair, new binding/driver tests reproduced five failures (two invalid
eligible inclusions and three missing runtime-present refusals). The focused
post-repair test result and full-suite outcome belong to the exact PR head.
Run the changed suites, existing `edge-durable-binding-authority` and
`traffic-vless-recovery-baseline` suites, then the server Source baseline in
`VALIDATION_BASELINE.md`. Preserve the old v3 compatibility tests.

October 7 source verification: 375 affected tests passed (including material and
billing-window continuations). Independent security-focused peer review found
the retained-policy read-fence gap, reproduced it with a failing test, then
confirmed its fix with 64 affected tests and no remaining P1/P2 findings in that
review scope. Source-environment, syntax, document-authority and diff checks
passed. These results do not replace the full-suite/CI outcome recorded in the
PR, nor any live recovery check. The peer review is not a specialized hosted
security-scanner result.

## Manual production sequence (not yet authorized or executed here)

Keep each step observable; do not replace them with a replay of an old recovery
packet. Bind exact source/dependencies and current target before changing files.

1. Read only the current collector entrypoint, unit metadata and fixed dependency
   hashes. Confirm the timer has no concurrent writer. Reuse stable evidence;
   do not re-inventory unrelated services or the entire project.
2. Privately compare the corrected binding projection against loaded identities,
   then compare the existing checkpoint and pending intent against that same
   projection. Return counts/categories only. The ordinary `--preflight` does
   **not** read the existing checkpoint. `--collect` is **not readonly**: it can
   replay a pending intent before examining fresh runtime state.
3. Existing scope reconciliation can retire a previously eligible identity while
   retaining its accepted usage, counters and ownership. A retained reference
   absent from the checkpoint, changed material, an attempted reactivation or
   an uncommitted pending sample with incompatible ownership must stop this
   sequence. Do not broaden reconciliation, erase pending or initialize over
   the old checkpoint to bypass that result.
4. Establish the accounting boundary explicitly. A same-generation ordinary
   collection takes a delta from the old cursor and may include the stopped
   interval. `historicalDebits: false` in a summary is not proof that the interval
   was excluded. Preserve the old evidence and require an approved, implemented
   continuation/baseline boundary before resuming when stopped usage is unknown.
   Do not fabricate a process generation, material change or billing-window
   change to invoke an unrelated continuation mode.
5. After the above read-only results, bind the exact collector-only installation,
   host-local fresh backups and rollback. No full backend deployment, protocol
   restart, identity issuance, DNS/Nginx edit or historical debit is implied.
   Obtain approval for those concrete writes; install without overwriting the
   retained old release. Stop on dependency/input drift.
6. Apply the approved accounting boundary and resume only the intended timer.
   Check multiple distinct natural runs, pending/checkpoint progress and newly
   attributable sample increments. If a failure occurs, stop the affected
   schedule and retain ledger/checkpoint evidence; never roll back a database
   over committed usage. Roll back code only if compatible with current state.
7. Add a Deploy Note with time, exact source/artifact, target, backup, before/after
   aggregate identity gate, retention state and natural collection results.
   Retained map entries are not cleanup permission or an `identity healthy`
   claim. SGP client connectivity requires separate actual client evidence.

This source repair does not by itself restore production metering or complete
the independent traffic-pack release. No production mutation is recorded here.
