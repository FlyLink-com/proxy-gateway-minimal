# Production Node Image Factory Acceptance Matrix

Date: 2026-06-14, Asia/Shanghai.

## Status

- Type: acceptance matrix
- Risk of this record: C, repo-only documentation/status update
- Production impact: none
- Related Linear lanes: GCC-5, GCC-13, GCC-14, GCC-15, GCC-16

This matrix turns the node-image factory closeout into explicit execution
gates. It does not create a provider image, provision a host, inject protected
runtime material, register a production node, activate traffic, mutate DNS,
Nginx, provider firewall, systemd, SQLite, or runtime config, or create live
orders.

## Hard Boundary

- The base image must stay no-secret.
- First-boot packet generation is a repo-only helper until an exact Risk A gate
  approves production ingestion.
- Protected material handoff must happen after first boot through the approved
  control-plane path; it must not be baked into an image.
- Receipt-gated rendering remains mandatory before a node is exposed in
  subscription output.
- No status report, PR body, Slack update, Linear update, or execution record
  may output subscription URLs, tokens, passwords, private keys, provider
  credentials, raw runtime config, raw logs, SQLite rows, or customer data.

## Gate Matrix

| Gate | Risk | Entry Evidence | Required Validation | Output | Unlocks | Stop If |
| --- | --- | --- | --- | --- | --- | --- |
| GCC-13: acceptance matrix and docs alignment | C | `docs/NODE_IMAGE_PROVISIONING_RUNBOOK.md`, the image-factory closeout record, AWS staging evidence, and current project state all exist. | `git diff --check origin/master...HEAD`. | This matrix and updated navigation/context references. | GCC-14 fixture/CLI closure. | Documentation claims image creation, protected material injection, node activation, live order creation, or production approval. |
| GCC-14: first-boot packet CLI and fixture closure | B | Helper CLIs and tests exist for image readiness summary and first-boot packet generation. | Targeted node-image helper tests, then `npm test` if touched code requires full server validation. | Sanitized CLI fixture evidence proving unsupported raw fields and sensitive-looking values are rejected without echoing values. | GCC-15 AWS staging node-image validation. | The helper accepts raw host material, secrets, URLs, credentials, SQLite data, raw config, or unsupported fields. |
| GCC-15: AWS staging node-image startup proof | A, staging only | Approved staging artifact, synthetic safe inputs, no production env/material, and rollback plan. | Artifact hash, `npm ci`, health, public Admin blocked, no-session APIs reject, internal port loopback-only, image readiness helper ok, first-boot packet helper ok, and synthetic control/data-plane proof as approved. | Staging execution record with redacted evidence only. | GCC-16 production promotion packet. | Any production secret, customer data, real subscription material, DNS/Nginx/security-group mutation outside approval, or live order appears. |
| GCC-16: production image promotion approval packet | A, approval only | GCC-13 through GCC-15 evidence, image manifest, release/artifact/SHA, target provider/region/node ref, channel plan, validation plan, and rollback plan. | `git diff --check`; packet review; exact operator approval required before execution. | Filled approval packet ready for provider-specific production mutation. | GCC-6 control-plane node registration gate. | Packet lacks exact target, release/hash, rollback, forbidden list, or no-secret proof. |
| GCC-6 and follow-on node registration/material handoff | A, production | A reviewed first-boot packet or reviewed existing node plus protected material refs. | Separate Risk A process: read-only inventory, backups, dry-run, staging/validation when applicable, controlled apply, config-test, applied receipts, render proof, and rollback evidence. | Durable safe node registration, protected material handoff evidence, receipt-gated render readiness. | Future node pool growth and data-plane replacement. | Execution tries to make image readiness itself a production authority, outputs sensitive material, or renders channels without matching receipts. |

## PR Readiness Checklist

Before the image-factory closeout PR is marked ready:

- The PR body names GCC-5 and GCC-13.
- This acceptance matrix is linked from the runbook, closeout record, docs
  index, and project context.
- The PR says clearly that no provider image, production node registration,
  protected material injection, traffic activation, or live order is performed.
- `git diff --check origin/master...HEAD` passes.
- Any follow-up code/test work is tracked in GCC-14 or later, not implied as
  already complete by this C-tier record.

## Handoff To Next Issues

- GCC-14 owns CLI/fixture closure for readiness summary and first-boot packet
  helper behavior.
- GCC-15 owns AWS staging validation for image startup/readiness with synthetic
  safe input only.
- GCC-16 owns the production promotion approval packet, not production mutation
  itself.
- GCC-6, GCC-7, and GCC-8 remain the follow-on production gates for node
  registration, protected material handoff, apply receipts, and render proof.

