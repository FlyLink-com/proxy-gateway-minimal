# Operator Provisioning Form Contract

Last updated: 2026-05-29, Asia/Shanghai.

```yaml
document_metadata:
  doc_type: canonical
  lifecycle: active
  authority_scope: operator_provisioning_form_contract
  superseded_by: null
  last_verified_at: 2026-05-29
  production_authority: false
```


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
plan, expiry, node selection, and approval reference. It submits only form
facts; the service layer owns handoff posture, artifact creation policy,
quantity policy, blocker generation, and CLI issuance input construction. It
must not become a public write surface.

## Inputs

The input shape is intentionally small. See
`scripts/provisioning-form-input.example.json`.

Required facts:

- `approvalRef`: approval or PR reference for the intended issuance gate.
- `customerLabel`, `customerEmail`, `customerChannel`: form-only customer
  facts used only to derive a hashed customer reference.
- `subscriptionLabel`: operator-safe subscription label.
- `expiresAt`: date or ISO timestamp normalized by the service layer.
- `nodeId`: explicit target node, such as `channel-lab-b-tuic`.
- `plan` and `note`: optional operator facts.

The form input must not contain execution controls such as `quantity`,
`artifact`, `handoff`, database path, handoff path, approval phrase, or execute
flags. Current service policy enforces quantity `1`, artifact creation `true`,
and handoff delivery `operator_visible_once` when it builds the safe preview.

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

## Local Admin Preview Surface

The same contract can be reviewed from the protected local Admin `Provisioning`
page through:

```text
POST /api/admin/platform/provisioning-form/preview
```

This route returns the same safe preview shape as the CLI adapter. It is
protected by the Admin API boundary, does not write SQLite rows, does not create
handoff files, does not submit approvals, does not expose public Admin, and does
not execute subscription issuance. The Admin page posts only form facts; it does
not construct downstream issuance policy fields.

## Validation

Repository implementation must cover:

- valid form facts produce `status: ready_for_cli_dry_run`;
- missing approval reference, invalid expiry, or missing node fails closed;
- client-submitted `quantity`, `artifact`, or `handoff` fields cannot override
  service-layer policy;
- CLI stdout omits raw customer data, URLs, tokens, and credentials.

Risk classification:

```text
B-tier: repository adapter, tests, docs, local CLI preview.
A-tier: any real subscription issuance, SQLite mutation, handoff generation,
        Aliyun mutation, public boundary change, or edge traffic activation.
```
