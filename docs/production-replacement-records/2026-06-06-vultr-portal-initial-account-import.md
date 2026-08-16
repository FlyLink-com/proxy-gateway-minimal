# Vultr Portal Initial Account Import Record


```yaml
document_metadata:
  doc_type: evidence
  lifecycle: historical
  authority_scope: vultr_portal_initial_account_import
  superseded_by: null
  last_verified_at: 2026-06-06
  production_authority: false
```


Date: 2026-06-06

## Scope

This record captures the controlled import of the local initial-account handoff
workbook into the Vultr candidate control database for
`portal.globalcirclecat.cloud`.

This record intentionally excludes account IDs, passwords, password hashes,
session references, subscription URLs, raw environment values, raw SQLite rows,
and raw runtime configuration.

## Input

- Source workbook: `D:\testuser-key\portal-initial-accounts-2026-06-04.xlsx`
- Sheet used: `初始账号`
- Parsed data rows: 20
- Required fields present: account ID, initial password, owner reference
- Duplicate account IDs detected before import: 0

## Import Behavior

The import treated the workbook passwords as one-time operator handoff input:

- The remote control database stores only password hashes.
- Plaintext workbook passwords were not printed by the import command.
- Existing accounts are validated before mutation.
- Existing active accounts must match the workbook owner reference.
- Existing latest active password credentials are checked in process; matching
  credentials are not reissued.
- Missing accounts are created as active portal accounts.
- Missing or non-matching latest credentials receive a new latest active
  initial-password credential with `mustRotate=true`.

## Result

- Input rows processed: 20
- Accounts created: 20
- Existing accounts reused: 0
- Password credentials issued: 20
- Password credentials unchanged: 0
- Latest active credential matched the workbook input after import: 20
- Owner-reference mismatches: 0
- Inactive existing accounts: 0
- Control database backup: created before mutation
- Control database integrity before import: ok
- Control database integrity after import: ok

## Validation

Public portal login validation:

- Human challenges issued: 20
- Password login attempts: 20
- Successful password sessions: 20
- Second-factor challenges required: 0
- Error count: 0

Public and service boundary validation:

- `https://portal.globalcirclecat.cloud/`: HTTP 200
- `https://sub.globalcirclecat.cloud/api/health`: HTTP 200
- Public Admin API boundary: HTTP 404
- No-session portal order API boundary: HTTP 401
- `proxy-gateway-candidate.service`: active
- `mihomo-tuic.service`: active
- `nginx`: active
- UDP 443 listener: present
- Control database integrity after validation: ok

## Rollback Notes

The import created a protected remote control-database backup before mutation.
Rollback is a database restore operation only: stop the candidate service,
restore the pre-import backup, restart `proxy-gateway-candidate.service`, and
repeat the public portal/auth boundary checks.

No DNS, Nginx configuration, firewall, payment, passkey, subscription URL, or
Mihomo configuration changes were made for this import.
