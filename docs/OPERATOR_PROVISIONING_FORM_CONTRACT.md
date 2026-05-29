# Operator Provisioning Form Contract

Last updated: 2026-05-29, Asia/Shanghai.

This document defines the repository-only contract for turning operator form
facts into a safe CLI issuance input preview. It does not create subscriptions,
write SQLite rows, generate handoff material, expose public Admin, deploy to
Aliyun, change DNS/Nginx/firewall, activate edge traffic, or authorize any
production mutation.

## Position

Subscription creation should be structured around a form, but the form is not
the execution authority.

```text
operator form facts
  -> provisioning-form adapter
  -> safe issuance input preview
  -> CLI dry-run
  -> exact Risk A approval
  -> issuance CLI / approved operator tooling
  -> 0600 visible-once handoff
  -> execution record
```

The form layer exists to reduce operator mistakes around customer identity,
plan, expiry, node selection, approval reference, and handoff posture. It must
not become a public write surface.

## Inputs

The input shape is intentionally small. See
`scripts/provisioning-form-input.example.json`.

Required facts:

- `approvalRef`: approval or PR reference for the intended issuance gate.
- `customer.label`, `customer.email`, `customer.channel`: form-only customer
  facts used only to derive a hashed customer reference.
- `subscription.displayName`: operator-safe subscription label.
- `subscription.expiresAt`: ISO timestamp.
- `subscription.nodeId`: explicit target node, such as `channel-lab-b-tuic`.
- `subscription.quantity`: must be `1` for this contract.
- `artifact.create`: must be `true`; opaque artifact issuance is mandatory.

## Output

The adapter returns:

- `customerRef`: hashed customer reference only.
- `issuanceInput`: the minimal JSON shape expected by downstream issuance
  tooling.
- `execution`: next-action metadata showing that real execution remains Risk A.
- `safety`: no-secret, no-DB-mutation, no-public-admin flags.

The adapter must not return:

- raw customer email, organization, or channel text;
- raw subscription URL or artifact secret;
- token, credential, YAML, host, port, or SQLite row content;
- an execution approval phrase;
- a handoff file path or contents.

## CLI

Preview a form package locally:

```powershell
npm run platform:provisioning-form -- scripts/provisioning-form-input.example.json
```

This command prints only safe JSON. It does not write to SQLite and does not
create a handoff file.

## Validation

Repository implementation must cover:

- valid form facts produce `status: ready_for_cli_dry_run`;
- missing approval reference, invalid expiry, or missing node fails closed;
- `quantity` other than `1` fails closed;
- `artifact.create !== true` fails closed;
- CLI stdout omits raw customer data, URLs, tokens, and credentials.

Risk classification:

```text
B-tier: repository adapter, tests, docs, local CLI preview.
A-tier: any real subscription issuance, SQLite mutation, handoff generation,
        Aliyun mutation, public boundary change, or edge traffic activation.
```
