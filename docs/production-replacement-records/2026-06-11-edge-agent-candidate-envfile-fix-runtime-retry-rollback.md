# Edge-Agent Candidate Envfile Fix Runtime Retry Rollback


```yaml
document_metadata:
  doc_type: evidence
  lifecycle: historical
  authority_scope: edge_agent_candidate_envfile_fix_runtime_retry_rollback
  superseded_by: null
  last_verified_at: 2026-06-11
  production_authority: false
```


Date: 2026-06-11

Risk: A

Target:

- Vultr Japan control plane `45.76.222.52`
- Vultr Singapore data plane `45.76.158.201` read-only validation only

Approved release:

- `edge-agent-future-order-runtime-20260611-001`

## Outcome

The approved retry did not complete. The gate confirmed the previously found
current-bound `EnvironmentFile` issue, materialized the missing candidate
release-local env file from existing protected server material, verified that
the candidate no longer missed that file, ran `npm ci`, switched `current` to
the candidate release, and restarted only
`proxy-gateway-candidate.service`.

The service still did not become active under the candidate release, so the
gate immediately rolled back to
`edge-agent-production-activation-20260610-005-worktree`, restored DB backups,
removed the newly materialized candidate env file, and restarted the previous
service successfully.

No DNS, Nginx, provider firewall, Singapore runtime, payment,
account/password, live order, subscription URL/token/password, private key,
credential, SQLite row, raw environment, raw config, or raw log output was
changed or disclosed.

## Redacted Evidence

Preflight:

- Japan current release matched
  `edge-agent-production-activation-20260610-005-worktree`.
- Candidate release existed.
- Japan health returned `200`.
- One service `EnvironmentFile` was bound through `current`.
- The candidate lacked the corresponding release-local env file.
- The source env file existed in the current production release.
- Japan-to-SGP SSH succeeded.

Execution:

- Created protected backups for the current symlink, protected
  env/config surfaces, systemd metadata, and discoverable DB files.
- Materialized exactly one missing candidate release-local env file.
- Verified zero current-bound candidate env files remained missing.
- Ran `npm ci` successfully in the candidate release.
- Switched `current` to `edge-agent-future-order-runtime-20260611-001`.
- Restarted only `proxy-gateway-candidate.service`.
- The service did not become active under the candidate release.
- Rollback ran immediately.

Rollback validation:

- Japan `current` returned to
  `edge-agent-production-activation-20260610-005-worktree`.
- `proxy-gateway-candidate.service` was active.
- Local health returned `200`.
- Portal public returned `200`.
- Subscription health public returned `200`.
- Public Admin and public internal agent routes remained blocked.
- No-session portal API and unauthenticated internal loopback route were
  rejected.
- `tcp/3456` remained loopback-only.

## Redacted Diagnostic

After rollback, a redacted journal classifier was run without outputting raw
logs. It found no module, syntax, SQLite, permission, or port-in-use class. It
did find environment-file and configuration/validation class matches in the
recent service window.

The environment-file matches may include the earlier failed attempts, so they
must not be treated as the final root cause by themselves. The important new
fact from this gate is narrower:

- The known missing release-local env file can be materialized successfully.
- Once that boundary is crossed, the candidate still fails to stay active under
  the real systemd service path.

## Current State

- Japan production remains on
  `edge-agent-production-activation-20260610-005-worktree`.
- The real production control DB was not migrated.
- The candidate release remains inactive.
- The candidate release-local env file created during the failed retry was
  removed by rollback.
- Singapore runtime was only read and was not mutated or restarted.

## Next Gate

Do not continue retrying production restarts until a separate exact Risk A
diagnostic gate isolates the candidate's real systemd startup failure after the
envfile boundary is fixed. The next diagnostic should use protected backups and
redacted output only, and should avoid live order creation or Singapore runtime
mutation.

Acceptable next diagnostic directions:

1. Recreate the candidate envfile boundary in a temp-start proof that also
   mirrors systemd working directory and ExecStart behavior on an alternate
   loopback port.
2. Run a redacted, pattern-based startup failure classifier constrained to the
   candidate restart window, without printing raw log lines.
3. If the failure is configuration validation, produce a redacted validation
   packet naming the failing config family only, not the raw values.
