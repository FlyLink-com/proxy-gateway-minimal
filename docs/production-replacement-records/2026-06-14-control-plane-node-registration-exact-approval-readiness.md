# Control Plane Node Registration Exact Approval Readiness

Date: 2026-06-14, Asia/Shanghai.

## Status

- Type: exact-approval readiness checklist
- Related Linear lane: GCC-6
- Risk: C for this document; A for any execution based on it
- Production impact from this document: none

This document turns the GCC-6 production gate package into a fillable execution
readiness sheet. It does not authorize production mutation, provider mutation,
DNS, Nginx, provider firewall, systemd, runtime config, database mutation,
account/password generation, live order creation, subscription rendering
changes, protected material handoff, data-plane apply, or service restarts.

Short confirmations such as `同意` still do not authorize execution.

## Entry Package

Use this document together with:

- `docs/production-replacement-records/2026-06-14-control-plane-node-registration-production-gate-package.md`
- `docs/production-replacement-records/2026-06-14-control-plane-node-registration-closeout-execution.md`
- `docs/production-replacement-records/2026-06-14-production-node-image-factory-closeout.md`
- `docs/production-replacement-records/2026-06-14-production-node-image-factory-acceptance-matrix.md`

The current local candidate package evidence is:

```text
release=control-plane-node-registration-closeout-20260614-001
artifact=D:\Projects\proxy-gateway-minimal\.codex-artifacts\control-plane-node-registration-closeout-20260614-001\proxy-gateway-control-plane-node-registration-closeout-20260614-001.zip
archive_sha256=53817EEE613D82A3DB0732F17A17BA227499BD8133AD78F9A1AB720BA886C8E7
source_commit=251767302adfb911cae39b50b1bf83e5dd156c6e
```

These values are local package evidence only. They are not a live production
inventory and do not prove the current deployed release.

## Fields Still Required From Live Inventory Or Operator Review

Execution must stop until every item below is filled from live read-only
inventory or reviewed operator material:

| Field | Required source | Stop condition |
| --- | --- | --- |
| `current_release` | Live control-plane inventory | Missing, stale, or differs from expected baseline without explicit approval |
| `target_control_plane` | Live target identity | Target is ambiguous or not the approved control plane |
| `target_data_plane_node` | Reviewed node ref or host ref | Node not reviewed or node role/region/pool is unclear |
| `registration_mode` | Operator approval | Omitted or not one of the allowed modes |
| `first_boot_packet_ref` | Reviewed safe packet | Required for `register_first_boot_packet_only` |
| `existing_node_ref` | Reviewed registered/safe node ref | Required for `bind_existing_reviewed_node_only` |
| `safe_node_fact_refs` | Reviewed safe refs only | Any raw endpoint/IP inventory, raw port, customer data, or runtime config appears |
| `protected_material_ref_set` | Key/digest refs only | Any value, token, password, private key, or raw material appears |
| `channel_refs` | Reviewed channel refs | Channels are not in the approved node/channel plan |
| `rollback` | Concrete rollback plan | Cannot withhold the node from rendering without deleting unrelated orders |

## Recommended First Execution Mode

Use the smallest executable scope first:

```text
registration_mode=bind_existing_reviewed_node_only
```

Use this mode only if the reviewed node already exists as a safe registration
candidate. This proves durable control-plane node registration or binding
without producing desired-state, running edge-agent apply, restarting data-plane
services, or unlocking subscription rendering.

Use `register_and_run_one_controlled_receipt_proof` only after a separate
decision says the same gate should include GCC-7/GCC-8-style material handoff,
edge-agent apply, redacted receipt, and render proof for exactly one controlled
order or reviewed existing order.

## Hard Stops Before Execution

Stop before any production action if:

- live current release is not verified;
- the reviewed packet or node ref cannot be tied to safe node facts;
- protected material refs are not key/digest-only;
- the plan would output subscription URLs, tokens, passwords, private keys,
  raw env, raw logs, raw config, or SQLite rows;
- the plan would restart data-plane services while using a registration-only
  mode;
- the plan would create more than one live order;
- the plan would expose public Admin or internal agent routes;
- rollback would require deleting unrelated orders or dumping runtime material.

## Approval Skeleton

Copy and fill this only after read-only inventory has supplied the missing
runtime facts.

```text
批准执行 Vultr control-plane node registration production gate:
release=control-plane-node-registration-closeout-20260614-001;
artifact=D:\Projects\proxy-gateway-minimal\.codex-artifacts\control-plane-node-registration-closeout-20260614-001\proxy-gateway-control-plane-node-registration-closeout-20260614-001.zip;
archive_sha256=53817EEE613D82A3DB0732F17A17BA227499BD8133AD78F9A1AB720BA886C8E7;
target_control_plane=<live-verified approved control-plane target only>;
target_data_plane_node=<reviewed data-plane node ref/host>;
current_release=<read-only inventory current release>;
registration_mode=<bind_existing_reviewed_node_only|register_first_boot_packet_only|register_and_run_one_controlled_receipt_proof>;
first_boot_packet_ref=<reviewed safe packet ref or omitted if existing node>;
existing_node_ref=<reviewed existing node ref or omitted if first-boot packet>;
safe_node_fact_refs=<reviewed safe refs only>;
protected_material_ref_set=<key/digest refs only>;
channel_refs=<reviewed channel refs>;
scope=read-only inventory; protected backups; verified artifact upload; verify remote sha; npm ci if switching runtime; switch current only after preflight; run idempotent node registry migration if required; ingest exactly one reviewed first-boot packet or bind exactly one reviewed existing node; persist safe node facts and protected refs only; do not generate desired-state, run data-plane apply, restart data-plane services, or unlock rendering unless registration_mode explicitly includes one controlled receipt proof;
validation=artifact hash ok, remote sha ok, npm ci ok if applicable, control-plane health 200, portal/sub public ok, Admin blocked, public internal route blocked, no-session APIs reject, internal control port loopback-only, node registry safe facts present, protected material key/digest presence ok, no sensitive output; if controlled proof is explicitly included, desired-state notifications present, fresh applied receipts present, render proof includes node channels only after matching receipts, unrelated orders not affected;
rollback=restore previous runtime symlink/protected env/proxy config/control DB/subscription DB/data-plane backups if touched and restart only affected approved services after config-test;
forbidden=DNS,Nginx config/reload,provider firewall,public Admin,payment,account/password generation,more than one live order,passkey enablement,subscription URL/token/password/private-key/credential output,SQLite row dump,raw env/log/config output,copying protected runtime config into Git,unrelated service restart.
```

## Validation Before Marking GCC-6 Done

GCC-6 can move beyond `In Progress` only when one of these is true:

- The operator explicitly accepts this as a package-only / readiness-only
  milestone, and the Linear issue says production registration is not executed.
- Or an exact Risk A execution succeeds and records redacted evidence that one
  reviewed node was registered or bound with safe facts and protected refs only.

It must not be marked complete because image readiness passed. Image readiness
is a prerequisite; safe control-plane registration is the GCC-6 outcome.
