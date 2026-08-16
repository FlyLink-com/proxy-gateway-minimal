# Control Plane Node Registration Closeout

Last updated: 2026-06-13, Asia/Shanghai.

```yaml
document_metadata:
  doc_type: canonical
  lifecycle: active
  authority_scope: control_plane_node_registration_closeout
  superseded_by: null
  last_verified_at: 2026-06-13
  production_authority: false
```


## Status

- Type: current closeout plan
- Risk: A for runtime/production activation; this document is C-tier repo-only
- Production impact: none
- Scope: control-plane work needed after node-image readiness validation
- Repo-only progress: first-boot packet to durable node registration ingestion is
  implemented in `server/services/edge/node-registration-ingestion.mjs`, backed
  by the `platform_edge_registered_nodes` control DB table and tests. Protected
  material handoff preflight is implemented in
  `server/services/edge/material-handoff-preflight.mjs`; it checks registered
  nodes, current desired-state, and material digest readiness without returning
  protected material. The operator CLI dry-run entry
  `gccgw edge material-handoff preflight --dry-run` now exposes that check
  through a read-only control DB adapter and a protected material file reader,
  while keeping material out of stdout. This is not production activation.

This document closes the design boundary between production-node image readiness
and control-plane activation. It does not authorize DNS, Nginx, provider
firewall, systemd, runtime config, database mutation, account/password
generation, live order creation, or subscription output changes.

## Current Fact

`docs/production-replacement-records/2026-06-13-aws-staging-node-image-readiness-validation.md`
validated the no-secret node-image readiness and first-boot packet helper path
on AWS staging with synthetic safe input.

That proof means the image and first-boot helper shape is ready to feed a
production gate. It does not mean a new node is registered, trusted, supplied
with protected material, included in desired-state, or rendered to users.

## Correct Control/Data-Plane Split

Order creation is an issuance action:

```text
user/admin action
  -> control plane validates account, quota, package, and order policy
  -> control plane creates durable order and credential refs
  -> control plane publishes desired-state notifications for eligible channels
  -> subscription renderer includes only channels with valid applied receipts
```

Agent pull/apply is a lifecycle and runtime-application action:

```text
edge agent
  -> authenticates as a registered node
  -> pulls node-scoped desired-state
  -> pulls protected material scoped to the desired-state digest
  -> applies local runtime config after config-test
  -> posts redacted receipts
  -> later repeats for expiry, disable, rotate, reconcile, and usage/lifecycle
     closure
```

The agent must not decide business issuance. It only proves that a node applied
the control plane's desired runtime state.

## Control Plane Closeout Tasks

1. **Node registry ingestion**
   - Accept a reviewed first-boot registration packet.
   - Persist safe node facts: `nodeRef`, role, region, provider, channel refs,
     lifecycle, pool, release/image manifest refs, and public-boundary refs.
   - Store protected endpoint/material refs only by key or digest.
   - Reject raw secrets, subscription URLs, private keys, raw IP inventories,
     and customer data.
   - Repo-only implementation now persists the safe registration subset and
     rejects unapproved first-boot apply packets; production ingestion still
     requires the Risk A gate below.

2. **Protected material handoff**
   - Bind registered node refs to protected material namespaces.
   - Verify material presence by digest/key only.
   - Keep material retrieval private, node-scoped, current-desired-state scoped,
     and non-logging.
   - Repo-only preflight now summarizes readiness by registered node, channel,
     desired-state, credential ref, and digest; missing or mismatched material
     fails closed and output remains redacted.
   - Repo-only CLI support now runs the same preflight with `--dry-run` only
     and opens the control DB in read-only mode, so operators can validate
     handoff readiness before any production material handoff gate.

3. **Desired-state generation**
   - On order issuance, generate credential refs and desired-state
     notifications for eligible channels.
   - On disable, expiry, rotate, or quota action, generate lifecycle
     desired-state updates.
   - Keep desired-state payloads redacted: refs, generations, channel refs, and
     material fingerprints only.

4. **Receipt-gated rendering**
   - Require current desired-state generation plus matching applied receipt for
     remote data-plane channels.
   - Never unlock a full channel from a scoped smoke receipt.
   - Keep local/legacy already-eligible channels available when a new node is
     not yet receipted.

5. **Operator/Admin visibility**
   - Show node registration status, material readiness, desired-state pending
     count, applied receipt freshness, and render eligibility.
   - Separate platform channel health from per-order/order-owned usage.
   - Do not expose raw material, subscription URLs, tokens, or SQLite rows.

6. **Activation gate**
   - Run read-only inventory first.
   - Use a single controlled test order or existing reviewed test order.
   - Validate desired-state -> material pull -> agent apply -> receipt -> render
     proof.
   - Keep rollback as "withhold channel by config/receipt gate" before any
     traffic expansion.

## Acceptance Criteria

Control-plane closeout is complete only when all of these are true:

- The first-boot packet can be ingested without writing secrets into Git or docs.
- The node registry records safe node facts and lifecycle/pool eligibility.
- Protected material lookups and preflight checks resolve by key/digest without
  outputting values.
- New order issuance creates desired-state notifications for the registered
  node's eligible channels.
- The data-plane agent can apply the desired-state and post redacted receipts.
- Subscription rendering includes the node's channels only after matching fresh
  receipts.
- Admin/Operator status distinguishes:
  - platform channel readiness;
  - per-order credential/render state;
  - usage collection/accounting state.
- Rollback can withhold or disable node channels without deleting orders.

## Next Risk A Gate

The next production gate should approve:

```text
read-only inventory;
backup protected control-plane env/proxy config/control DB/subscription DB;
ingest one reviewed first-boot packet or use an existing reviewed node;
bind protected material refs without outputting values;
generate desired-state for one controlled order or reviewed existing order;
run edge-agent dry-run/apply;
config-test and restart only required approved data-plane services;
post redacted receipts;
run render proof without subscription URL/token/YAML output;
rollback by restoring backups and withholding the node from rendering.
```

Do not combine this gate with DNS, Nginx, provider firewall, public Admin,
payment, account/password generation, or broad live-order rollout.

The current GCC-6 production gate package is
`docs/production-replacement-records/2026-06-14-control-plane-node-registration-production-gate-package.md`.
It must be filled with exact release, artifact, SHA-256, current release,
registration mode, target node, and protected-ref details before execution. The
older 2026-06-13 approval packet remains retained for auditability only.
