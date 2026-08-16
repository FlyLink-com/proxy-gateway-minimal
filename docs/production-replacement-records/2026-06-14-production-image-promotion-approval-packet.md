# Production Image Promotion Approval Packet


```yaml
document_metadata:
  doc_type: evidence
  lifecycle: historical
  authority_scope: production_image_promotion_approval_packet
  superseded_by: null
  last_verified_at: 2026-06-14
  production_authority: false
```


Date: 2026-06-14, Asia/Shanghai.

## Status

- Type: approval packet
- Risk: A for any provider, production, runtime, or control-plane execution
- Related lane: GCC-16
- Production impact: none from this document alone

This document does not authorize provider image creation, host provisioning,
DNS, Nginx, provider firewall, security-group, systemd, runtime config,
database, account, order, payment, subscription output, or protected-material
mutation. Short confirmations such as `同意` do not authorize this gate.

## Context

The production-node image factory lane has already separated the no-secret
image boundary from production activation:

- The image/runbook closeout is recorded in
  `docs/production-replacement-records/2026-06-14-production-node-image-factory-closeout.md`.
- The acceptance matrix is recorded in
  `docs/production-replacement-records/2026-06-14-production-node-image-factory-acceptance-matrix.md`.
- The latest AWS staging proof is recorded in
  `docs/production-replacement-records/2026-06-14-aws-staging-node-image-readiness-validation.md`.

Those records validate the no-secret image readiness and first-boot packet
helper path with synthetic safe input. They do not register a production node,
inject protected material, activate traffic, create live orders, or unlock
subscription rendering.

## Boundary

Production image promotion is only the provider/image step that prepares a
repeatable no-secret node baseline. It must not become a shortcut around the
control-plane node-registration and data-plane receipt gates.

The image may contain:

- reviewed source/runtime package;
- base OS packages and runtime binaries;
- service unit templates;
- directory layout and ownership templates;
- no-secret bootstrap helpers;
- validation helpers for image readiness and first-boot packet shape.

The image must not contain:

- subscription URLs, tokens, passwords, private keys, provider credentials, or
  customer data;
- production `.env` values or protected runtime material;
- SQLite rows or copied production databases;
- live order material;
- public Admin exposure;
- provider-specific firewall shortcuts that bypass the later approval gate.

## Required Exact Approval Fields

The execution approval must fill every field below before any provider or
production mutation occurs:

- `release`
- `artifact`
- `archive_sha256`
- `target_provider`
- `target_region`
- `target_image_name_or_ref`
- `target_base_instance_or_builder`
- `current_release`
- `image_manifest`
- `first_boot_packet_ref`
- `channel_plan`
- `protected_material_handoff_plan`
- `validation`
- `rollback`
- complete `forbidden` list

The approval must also state whether the gate is image creation only, image
creation plus first-boot validation, or image creation plus a separately scoped
node-registration dry-run. If that scope is omitted, the allowed scope is image
creation only.

## Required Preflight

Before execution, perform a read-only inventory and stop if any item is missing:

- Current repo release and artifact hash are known and match local package
  evidence.
- Provider target, region, image name/ref, and rollback target are explicit.
- The image manifest proves no-secret image contents.
- First-boot packet input is reviewed and safe.
- Control-plane registration remains a separate gate unless explicitly included.
- Protected material handoff remains by key/digest only.
- Receipt-gated rendering remains fail-closed.
- Public Admin and public internal routes remain blocked.
- Rollback can remove or ignore the promoted image without deleting orders or
  dumping sensitive material.

## Allowed Scope After Exact Approval

Allowed only after a separate exact production approval:

- read-only provider and host inventory;
- protected backups for any touched host metadata;
- verify artifact hash and remote hash;
- prepare provider image/snapshot/AMI from the reviewed no-secret baseline;
- run image readiness helper with safe facts;
- run first-boot packet helper with reviewed safe input;
- record redacted evidence only;
- leave production traffic and subscription rendering unchanged unless a later
  gate explicitly authorizes node registration, material handoff, apply receipt,
  and render activation.

## Validation

The gate must prove, without sensitive output:

- artifact hash and remote hash match;
- package install/build step succeeds where applicable;
- image manifest contains no protected material;
- image readiness helper passes;
- first-boot packet helper passes with safe input;
- no production secrets, customer data, SQLite rows, subscription URLs, tokens,
  passwords, private keys, or raw config/log/env values are output;
- public Admin remains blocked if any host is booted for validation;
- internal control ports remain loopback-only;
- no live order is created;
- no subscription rendering is unlocked by image promotion alone.

## Rollback

Rollback must be able to:

- discard or delete the promoted provider image/snapshot/AMI;
- restore any touched host metadata;
- leave existing production runtime, orders, subscriptions, and data-plane
  services unchanged;
- document redacted rollback evidence without dumping sensitive material.

## Exact Approval Template

```text
批准执行 production node image promotion：
release=<exact release>；
artifact=<local artifact path>；
archive_sha256=<exact sha256>；
target_provider=<provider>；
target_region=<region>；
target_image_name_or_ref=<image name/ref>；
target_base_instance_or_builder=<builder host/ref>；
current_release=<read-only inventory current release>；
image_manifest=<reviewed no-secret image manifest path/ref>；
first_boot_packet_ref=<reviewed safe first-boot packet ref>；
channel_plan=<reviewed channel plan ref>；
protected_material_handoff_plan=<reviewed handoff plan ref>；
scope=read-only inventory; protected backups for touched metadata; verify artifact hash and remote hash; build or promote no-secret provider image only; run image readiness helper and first-boot packet helper with safe input only; record redacted evidence; do not register production node or unlock rendering unless separately approved；
validation=artifact hash ok, remote sha ok, image manifest no-secret ok, image readiness helper ok, first-boot packet helper ok, public Admin blocked if a host is booted, internal control ports loopback-only, no live order creation, no subscription rendering unlocked by image promotion alone；
rollback=delete or discard promoted provider image/snapshot/AMI and restore touched host metadata; leave existing production runtime/orders/subscriptions/data-plane services unchanged；
forbidden=DNS,Nginx config/reload,provider firewall/security group mutation unless explicitly included,public Admin,payment,account/password generation,live order creation,passkey enablement,subscription URL/token/password/private-key/credential output,SQLite row dump,raw env/log/config output,copying protected runtime config into Git,node registration,protected material handoff,receipt-gated render activation,unrelated service restart。
```

## Handoff

After this packet is reviewed, the next executable gate is still provider- and
target-specific. Any successful production image promotion only unlocks the
separate control-plane node-registration, protected-material handoff,
edge-agent apply/receipt, and render-proof gates. It does not prove that a new
node is ready for user traffic.
