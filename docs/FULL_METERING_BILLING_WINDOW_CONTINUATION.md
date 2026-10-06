# Controlled billing-window metering continuation

```yaml
document_metadata:
  doc_type: operational
  lifecycle: active
  authority_scope: full_metering_billing_window_continuation
  superseded_by: null
  last_verified_at: 2026-10-06
  production_authority: false
```

Risk: B for this isolated source implementation; A for any production recovery.
This document authorizes no host read, timer start, collection, or identity change.

## Why this is separate

Ordinary `--collect` rejects any binding digest change. `--continue-material`
accepts only a material-digest change with identical ownership and billing
period. A later `billingBinding.validUntil`, with every other identity field
unchanged, is neither of those. It must not be hashed into a material approval,
and restarting the timer does not admit it.

A 2026-10-06 read-only comparison found the stopped five-source lane blocked on
five such end-time extensions, one on each fixed channel. That observation is
not an approval and is not embedded in this source.

## Admission

The Linux CLI adds exactly:

```text
--continue-billing-window --config <existing-private-config-path> --config-sha256 <sha256>
  --billing-window-approval <private-approval-path> --billing-window-approval-sha256 <sha256>
```

The approval has the same custody and field shape as a material approval.
`changes` must be the exact set of active checkpoint identities whose only
difference is `validUntil` moving strictly later. An earlier end, an equal end,
a material change, or any ownership, plan, source, request, entitlement, or
`validFrom` change fails even if its hash is included. The window is at most
24 hours. The approval binds the current activation, context, sequence, and
checkpoint digest. It cannot be replayed, and a pending intent blocks it.

Affected identities are baselined at the current real counters. Their already
accepted usage is carried. The stopped interval is unknown (`unassignedBytes:
null`), never zero and never a historical debit. Unaffected identities continue
ordinary increments. A later ordinary collect uses the new end time and records
only usage after that baseline.

The old checkpoint is archived as private
`billing-window-before-<checkpoint-digest>.json` before the new intent. This is
evidence, not permission to roll accounting back. Do not restore an older
database over samples committed after the stop.
