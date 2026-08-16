# Production Node Image Factory Closeout


```yaml
document_metadata:
  doc_type: evidence
  lifecycle: historical
  authority_scope: production_node_image_factory_closeout
  superseded_by: null
  last_verified_at: 2026-06-14
  production_authority: false
```


Date: 2026-06-14, Asia/Shanghai.

## Status

- Type: closeout record
- Risk of this closeout: C, repo-only documentation/status update
- Production impact: none
- Related Linear lane: GCC-5, production node image factory

This record closes the current repo-only production-node image factory lane.
It does not create a provider image, provision a node, inject protected
material, register a production node, activate traffic, mutate DNS, Nginx,
provider firewall, systemd, SQLite, or runtime config, or create live orders.

## Source Assets

The image factory lane is currently represented by these source assets:

- `docs/NODE_IMAGE_PROVISIONING_RUNBOOK.md`
- `scripts/node-image-provisioning-readiness-summary.mjs`
- `scripts/node-image-first-boot-packet.mjs`
- `server/services/node-image-provisioning-readiness-summary.mjs`
- `server/services/node-image-first-boot-packet.mjs`
- `server/services/edge/node-registration-ingestion.mjs`
- `server/services/edge/material-handoff-preflight.mjs`
- `server/tests/node-image-provisioning-readiness-summary.test.mjs`
- `server/tests/node-image-first-boot-packet.test.mjs`
- `server/tests/edge-node-registration-ingestion.test.mjs`
- `server/tests/edge-material-handoff-preflight.test.mjs`
- `docs/production-replacement-records/2026-06-13-aws-staging-node-image-readiness-validation.md`
- `docs/production-replacement-records/2026-06-13-aws-staging-control-data-plane-integration-validation.md`
- `docs/production-replacement-records/2026-06-14-production-node-image-factory-acceptance-matrix.md`
- `docs/CONTROL_PLANE_NODE_REGISTRATION_CLOSEOUT.md`

## What Is Complete

- The provider-neutral no-secret image boundary is documented.
- Image contents are separated into allowed non-secret build materials and
  forbidden protected runtime material.
- Repo-only readiness summary CLI is available through
  `gccgw node image-readiness-summary`.
- Repo-only first-boot packet CLI is available through
  `gccgw node image-first-boot-packet`.
- Both helpers reject unsupported raw fields and sensitive-looking values
  without echoing those values.
- First-boot packet ingestion into safe durable node registration source is
  implemented in repository code.
- Protected material handoff preflight is implemented as a dry-run operator
  check and keeps runtime material out of output.
- AWS staging validated the no-secret image readiness and first-boot helper path
  using synthetic safe input only.
- AWS staging also validated the broader synthetic control/data-plane path that
  follows image readiness: safe node registration, desired-state, material
  routing, edge-agent receipt, render gating, and usage/lifecycle smoke.

## What Is Not Complete

- No reusable production Vultr snapshot, AWS AMI, Aliyun image, or other
  provider image is created by this record.
- No provider firewall, DNS, Nginx, systemd, or runtime service has been
  changed by this record.
- No production first-boot packet has been ingested by this record.
- No protected runtime material has been injected into a new node by this
  record.
- No new node is eligible for subscription rendering merely because this
  closeout exists.
- Live order smoke, traffic activation, and broad receipt-gated render
  activation still require separate Risk A gates.

## Acceptance Boundary

The staged gate order for this boundary is now explicit in
`docs/production-replacement-records/2026-06-14-production-node-image-factory-acceptance-matrix.md`.
Use that matrix to keep GCC-13, GCC-14, GCC-15, GCC-16, and the follow-on
control-plane registration gates separate.

The image factory lane is complete enough to support the next exact gate when
an operator wants to create or clone a node:

1. Build or select a no-secret image from the approved release skeleton.
2. Run `gccgw node image-readiness-summary` on safe reviewed facts.
3. Run `gccgw node image-first-boot-packet` on safe reviewed refs.
4. Submit a separate Risk A approval for provider mutation and first-boot
   activation.
5. Register the node, inject protected material outside the image, run
   config-tests, start approved services, collect fresh receipts, and render
   channels only after the receipt gate passes.

## Next Gate

The next task lane is control-plane node registration and protected material
handoff, not another image-readiness helper:

- use the approved first-boot packet or one reviewed existing node;
- bind protected material refs without outputting values;
- generate desired-state for exactly one controlled order or reviewed order;
- run edge-agent dry-run/apply;
- require config-test, applied receipts, render proof, validation, and rollback.

Use `docs/CONTROL_PLANE_NODE_REGISTRATION_CLOSEOUT.md` and the corresponding
approval packet before any production mutation.
