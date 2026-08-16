# Control Plane Node Registration Production Gate Package


```yaml
document_metadata:
  doc_type: evidence
  lifecycle: historical
  authority_scope: control_plane_node_registration_production_gate_package
  superseded_by: null
  last_verified_at: 2026-06-14
  production_authority: false
```


Date: 2026-06-14, Asia/Shanghai.

## Status

- Type: production gate package
- Related Linear lane: GCC-6
- Risk: A for any runtime, production, database, or node-registration execution
- Production impact from this document: none

This package prepares the next control-plane node-registration gate after the
node-image factory lane. It does not authorize production mutation, provider
mutation, DNS, Nginx, provider firewall, systemd, runtime config, database
mutation, account/password generation, live order creation, subscription
rendering changes, protected material handoff, or data-plane restarts.

Short confirmations such as `同意` do not authorize this gate. The operator
must provide the exact approval fields below before any execution.

## Entry Evidence

Use these records as the entry evidence for this package:

- `docs/production-replacement-records/2026-06-14-aws-staging-node-image-readiness-validation.md`
  proves the no-secret image readiness and first-boot packet helper path on
  AWS staging with synthetic safe input.
- `docs/production-replacement-records/2026-06-14-production-node-image-factory-closeout.md`
  closes the image factory repo lane and hands production work to this
  control-plane registration gate.
- `docs/production-replacement-records/2026-06-14-production-node-image-factory-acceptance-matrix.md`
  separates GCC-16 image promotion from the follow-on GCC-6/GCC-7/GCC-8
  registration, material handoff, and receipt gates.
- `docs/production-replacement-records/2026-06-14-production-image-promotion-approval-packet.md`
  is the provider image promotion approval packet. Image promotion alone must
  not register a node or unlock rendering.
- `docs/production-replacement-records/2026-06-14-control-plane-node-registration-closeout-execution.md`
  records the latest production closeout snapshot and the current runtime
  baseline that must be live-verified before any new Risk A execution.

## Boundary

GCC-6 owns durable control-plane node registration. It may ingest one reviewed
first-boot packet or use one reviewed existing node registration record. It
must persist only safe node facts:

- `nodeRef`
- role
- provider and region refs
- channel refs
- lifecycle and pool labels
- release or image manifest refs
- public-boundary refs
- protected endpoint/material refs by key or digest only

GCC-6 must reject or redact:

- raw secrets
- subscription URLs
- tokens or passwords
- private keys
- raw runtime config
- raw logs
- raw IP inventories beyond reviewed safe node facts
- SQLite rows
- customer data

Protected material handoff, edge-agent controlled apply, and receipt-gated
render activation are follow-on gates. They may be included only when the exact
approval explicitly expands scope to GCC-7/GCC-8-style proof. If omitted, this
package authorizes registration preparation only.

Order issuance remains a control-plane action. The edge-agent pull/apply path
is lifecycle reconciliation and runtime confirmation after durable issuance
intent exists. Do not treat polling as the order issuance mechanism.

## Required Approval Fields

Before execution, the operator approval must fill:

- `release`
- `artifact`
- `archive_sha256`
- `target_control_plane`
- `target_data_plane_node`
- `current_release`
- `registration_mode`
- `first_boot_packet_ref` or `existing_node_ref`
- `safe_node_fact_refs`
- `protected_material_ref_set`
- `channel_refs`
- `validation`
- `rollback`
- complete `forbidden` list

`registration_mode` must be one of:

- `register_first_boot_packet_only`
- `bind_existing_reviewed_node_only`
- `register_and_run_one_controlled_receipt_proof`

If `registration_mode` is omitted, the allowed mode is
`register_first_boot_packet_only`.

## Read-Only Preflight

Stop before execution unless the preflight confirms, without sensitive output:

- Current control-plane release is live-read and matches the expected baseline.
- Candidate artifact hash is known and matches local package evidence.
- `platform_edge_registered_nodes` migration path exists.
- The first-boot packet or existing node ref is reviewed and safe.
- The node is not already registered under a conflicting role, region, pool, or
  lifecycle.
- Protected material refs are present by key/digest only; values are not read
  or printed.
- Public Admin and public internal data-plane routes remain blocked.
- Internal control port remains loopback-only.
- Rollback can withhold the node from rendering without deleting orders.

## Allowed Scope After Exact Approval

Control plane:

- read-only inventory;
- protected backups of env, proxy config, control DB, subscription DB, and
  service metadata;
- verified artifact upload;
- runtime switch only after artifact and env preflight pass;
- idempotent schema migration for safe node registration state if required;
- ingest exactly one reviewed first-boot packet or bind exactly one reviewed
  existing node record;
- store protected material refs by key/digest only;
- produce a redacted registration result and readiness summary.

Optional proof only if explicitly included by `registration_mode`:

- generate desired-state for exactly one controlled order or one reviewed
  existing order;
- run edge-agent dry-run/apply for the scoped node/channel/order set;
- config-test affected runtimes before any restart;
- restart only required approved data-plane services after config-test;
- post redacted receipts;
- run render proof without outputting subscription URL, token, YAML, raw
  runtime material, raw config, raw logs, or SQLite rows.

## Validation

The minimum registration gate must prove:

- artifact hash and remote hash match;
- `npm ci` passes if a runtime switch is performed;
- control-plane service is active and health returns `200`;
- portal/sub public surfaces return expected healthy responses;
- public Admin remains blocked;
- public internal routes remain blocked;
- no-session portal APIs reject unauthenticated requests;
- internal control port is loopback-only;
- safe node registration facts exist for the reviewed node;
- protected refs are recorded by key/digest only;
- no secret-like value is printed or copied into Git/docs.

If controlled proof is included, it must also prove:

- desired-state notifications exist only for the scoped order/node/channel set;
- fresh applied receipts exist after the data-plane apply;
- subscription rendering includes the node channels only after matching fresh
  receipts;
- unrelated orders are not unlocked by scoped receipts;
- no more than one controlled order is created.

## Rollback

Rollback must be able to restore:

- previous control-plane runtime symlink;
- protected env/proxy config backups;
- control DB and subscription DB backups;
- data-plane agent/runtime backups only when optional proof touched them;
- prior service state for only affected approved services.

Rollback may also withhold node channels by config or receipt gate. It must not
delete unrelated orders, dump SQLite rows, or print protected material.

## Exact Approval Template

```text
批准执行 Vultr control-plane node registration production gate:
release=<exact release>;
artifact=<local artifact path>;
archive_sha256=<exact sha256>;
target_control_plane=Vultr Japan control plane 45.76.222.52 only;
target_data_plane_node=<approved data-plane node ref/host>;
current_release=<read-only inventory current release>;
registration_mode=<register_first_boot_packet_only|bind_existing_reviewed_node_only|register_and_run_one_controlled_receipt_proof>;
first_boot_packet_ref=<reviewed safe packet ref or omitted if existing node>;
existing_node_ref=<reviewed existing node ref or omitted if first-boot packet>;
safe_node_fact_refs=<reviewed refs only>;
protected_material_ref_set=<key/digest refs only>;
channel_refs=<reviewed channel refs>;
scope=read-only inventory; protected backups; verified artifact upload; npm ci if switching runtime; switch current only after preflight; run idempotent node registry migration if required; ingest exactly one reviewed first-boot packet or bind exactly one reviewed existing node; persist safe node facts and protected refs only; if registration_mode includes controlled proof, generate desired-state for exactly one controlled order or reviewed existing order, run edge-agent dry-run/apply, config-test affected runtimes, restart only required approved services after config-test, post redacted receipts, and run render proof without subscription URL/token/YAML output;
validation=artifact hash ok, remote sha ok, npm ci ok if applicable, control-plane health 200, portal/sub public ok, Admin blocked, public internal route blocked, no-session APIs reject, internal control port loopback-only, node registry safe facts present, protected material key/digest presence ok, no sensitive output; if controlled proof included, desired-state notifications present, fresh applied receipts present, render proof includes node channels only after matching receipts, unrelated orders not affected;
rollback=restore previous runtime symlink/protected env/proxy config/control DB/subscription DB/data-plane backups if touched and restart only affected approved services after config-test;
forbidden=DNS,Nginx config/reload,provider firewall,public Admin,payment,account/password generation,more than one live order,passkey enablement,subscription URL/token/password/private-key/credential output,SQLite row dump,raw env/log/config output,copying protected runtime config into Git,unrelated service restart.
```

## Handoff

After this GCC-6 package is reviewed, the next executable step is still an
exact Risk A approval with live inventory. A successful registration gate
unlocks only safe node presence in the control plane. Protected material
handoff, broad desired-state fan-out, runtime apply receipts, render activation,
usage/quota activation, and traffic expansion remain separate gates unless the
exact approval explicitly scopes them into a controlled one-order proof.
