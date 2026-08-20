# Control Plane Node Registration Closeout Approval Packet


```yaml
document_metadata:
  doc_type: evidence
  lifecycle: historical
  authority_scope: control_plane_node_registration_closeout_approval_packet
  superseded_by: null
  last_verified_at: 2026-06-13
  production_authority: false
```


Date: 2026-06-13, Asia/Shanghai.

Risk: A for any production/runtime execution.

Status: planning and approval packet only. This document does not authorize
production mutation, DNS/Nginx/firewall changes, runtime restarts, database
mutation, account/password generation, live order creation, or subscription
output changes.

## Context

The AWS staging node-image validation proved only the no-secret image readiness
and first-boot packet helper path. It did not complete production node
registration, protected material handoff, desired-state generation, or
receipt-gated rendering.

The control-plane closeout plan is recorded in
`docs/CONTROL_PLANE_NODE_REGISTRATION_CLOSEOUT.md`.

## Correct Business Boundary

Order creation and automatic issuance are control-plane actions:

1. The User Portal or Admin/Operator adapter submits an order request.
2. The control plane validates account, package, quota, limits, and policy.
3. The control plane creates the durable order and edge credential refs.
4. The control plane publishes desired-state notifications for eligible
   channels as part of the issuance path.
5. The subscription renderer includes only channels whose required applied
   receipts match the current desired-state generation.

The edge agent pull/apply path is not the issuer. It is lifecycle and
reconciliation:

1. The edge agent authenticates as a registered node.
2. It pulls node-scoped desired-state.
3. It pulls protected material scoped to that desired-state and credential
   digest.
4. It applies runtime config after config-test.
5. It posts redacted receipts.
6. It repeats later for expiry, disable, rotate, reconcile, usage collection,
   and rollback.

Do not treat polling as the order-issuance mechanism. Polling/pull is the
runtime application and lifecycle confirmation mechanism after the control
plane has already created durable issuance intent.

## Required Preflight Before Any Execution

- Confirm the current production release by read-only inventory.
- Confirm the candidate release/artifact/SHA-256 from a clean local package.
- Confirm node registry schema readiness.
- Confirm protected material namespaces exist by key/digest only.
- Confirm desired-state notification schema is present.
- Confirm existing receipt-gated render behavior is fail-closed.
- Confirm public Admin and public internal agent routes remain blocked.
- Confirm rollback can withhold the node from rendering without deleting
  orders.

## Allowed Scope After Exact Approval

Control plane:

- Read-only inventory.
- Protected backups of env, proxy config, control DB, subscription DB, and
  service metadata.
- Upload and verify a reviewed candidate artifact.
- Switch the control-plane runtime only after artifact and env preflight pass.
- Ingest exactly one reviewed first-boot packet or use one reviewed existing
  node registration record.
- Bind node refs to protected material refs by key/digest only.
- Generate desired-state for exactly one controlled order or reviewed existing
  order.
- Run render proof without outputting subscription URL, token, YAML, runtime
  material, or SQLite rows.

Data plane:

- Run the registered node agent dry-run/apply for the scoped desired-state.
- Pull material only over the private authenticated route.
- Config-test affected runtime adapters before any restart.
- Restart only approved data-plane services if the controlled apply path
  requires it and config-test passes.
- Post redacted receipts.

## Validation

The gate must prove, without sensitive output:

- Candidate artifact hash and remote hash match.
- `npm ci` passes if a runtime switch is performed.
- Control-plane health returns `200`.
- Portal/subscription public surfaces return expected healthy responses.
- Public Admin remains blocked.
- Public internal data-plane agent route remains blocked.
- No-session portal APIs reject unauthenticated requests.
- Admin/internal control port remains loopback-only.
- Node registry contains safe node facts for the reviewed node.
- Protected material lookup resolves by key/digest without printing values.
- Desired-state notifications exist for the scoped order/node/channel set.
- The data-plane agent posts fresh applied receipts.
- Subscription rendering includes the node channels only after matching fresh
  receipts.
- Unrelated orders are not unlocked by scoped receipts.
- No more than one controlled order is created, if order creation is approved.

## Rollback

Rollback must be able to restore:

- previous control-plane runtime symlink;
- protected env/proxy config backups;
- control DB and subscription DB backups;
- affected data-plane agent/runtime configs;
- previous service state for only the affected services.

Rollback may also withhold node channels by config or receipt gate. It must not
delete unrelated orders or dump sensitive rows/material.

## Exact Approval Template

Fill the release, artifact, SHA-256, current release, target node, and whether
the gate uses an existing reviewed order or exactly one new controlled order
after the final candidate is packaged.

```text
批准执行 Vultr control-plane node registration closeout gate:
release=<exact release>;
artifact=<local artifact path>;
archive_sha256=<exact sha256>;
target=Vultr Japan control plane 45.76.222.52 + approved data-plane node only;
current_release=<read-only inventory current release>;
scope=read-only inventory; protected backups; verified artifact upload; npm ci if switching runtime; switch current only after preflight; ingest one reviewed first-boot packet or use one reviewed existing node; bind protected material refs without outputting values; generate desired-state for exactly one controlled order or one reviewed existing order; run edge-agent dry-run/apply; config-test affected runtimes; restart only required approved services after config-test; post redacted receipts; run render proof without subscription URL/token/YAML output;
validation=artifact hash ok, remote sha ok, npm ci ok if applicable, control-plane health 200, portal/sub public ok, Admin blocked, public internal route blocked, no-session APIs reject, internal control port loopback-only, node registry safe facts present, protected material key/digest presence ok, desired-state notifications present, fresh applied receipts present, render proof includes node channels only after matching receipts, unrelated orders not affected, no sensitive output;
rollback=restore previous runtime symlink/protected env/proxy config/control DB/subscription DB/data-plane backups and restart only affected approved services after config-test;
forbidden=DNS,Nginx config/reload,provider firewall,public Admin,payment,account/password generation,more than one live order,passkey enablement,subscription URL/token/password/private-key/credential output,SQLite row dump,raw env/log/config output,copying protected runtime config into Git,unrelated service restart.
```

## Non-Goals

- No public data-plane agent API.
- No Redis, queue, cluster, or external state dependency.
- No broad live-order rollout.
- No usage quota auto-disable activation.
- No Cloudflare/AWS/Aliyun/Vultr firewall or DNS mutation in the same gate.
- No migration of control-plane authority away from Vultr Japan.
