# Portal Test Account TOTP Reset - 2026-06-05


```yaml
document_metadata:
  doc_type: evidence
  lifecycle: historical
  authority_scope: portal_test_account_totp_reset
  superseded_by: null
  last_verified_at: 2026-06-05
  production_authority: false
```


## Scope

Risk tier: A.

Approved target:

```text
Aliyun candidate control DB only
```

Approved scope:

```text
revoke active TOTP credentials for initial-account Excel rows 1-2 only
```

Forbidden changes observed:

- no account or password generation;
- no password changes;
- no token, password, subscription URL, credential, or SQLite row output;
- no DNS, Nginx, firewall, or payment mutation;
- no service restart.

## Preflight

The local Excel handoff file was read only to select rows 1-2. Account IDs and
passwords were not printed.

Remote preflight produced this redacted summary:

- target account count: 2;
- active TOTP matches: 2;
- active password matches: 2.

## Backup

Control DB backup was created before mutation:

```text
/opt/proxy-gateway-minimal-candidate/backups/totp-reset-20260604T170828Z
```

The backup file contents were not printed.

## Mutation

Only active TOTP credentials for the two approved target accounts were updated:

- `status`: `revoked`;
- `revoked_at`: set to the mutation timestamp;
- `updated_at`: set to the mutation timestamp.

Mutation summary:

- revoked TOTP count: 2;
- active TOTP after mutation for the target accounts: 0;
- active passwords after mutation for the target accounts: 2;
- restart required: false.

No password credential was changed.

## Validation

Password login matrix for initial-account Excel rows 1-3:

| Excel row | Human challenge | Password login | Session | Second factor |
| --- | --- | --- | --- | --- |
| 1 | 201 | 200 | yes | no |
| 2 | 201 | 200 | yes | no |
| 3 | 201 | 200 | yes | no |

Other checks:

- `proxy-gateway-candidate.service`: active.
- Loopback health: `ok=true`, `authRequired=true`.
- Portal static entry: HTTP 200.
- Portal-domain Admin API check: HTTP 404.
- Login error log safety scan: no new `invalid_login`, `internal_error`,
  `validation_error`, or server exception entries after the reset validation.

Aggregate auth summary after reset:

- active password credentials: 20;
- active TOTP credentials: 0;
- initial-account active password credentials: 20;
- initial-account active TOTP credentials: 0.

No account ID, password, token, session, subscription URL, credential secret, or
SQLite row was recorded.

## Result

The two approved test accounts now use password-only login until the user binds
a new authenticator from the personal center. Their previous Google
Authenticator entries are no longer valid for portal login.
