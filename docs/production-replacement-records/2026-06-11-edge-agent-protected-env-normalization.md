# Edge-Agent Protected Env Normalization


```yaml
document_metadata:
  doc_type: evidence
  lifecycle: historical
  authority_scope: edge_agent_protected_env_normalization
  superseded_by: null
  last_verified_at: 2026-06-11
  production_authority: false
```


Date: 2026-06-11

Risk: A

Target:

- Vultr Japan control plane `45.76.222.52`

Approved current release:

- `edge-agent-production-activation-20260610-005-worktree`

Candidate release checked:

- `edge-agent-future-order-runtime-20260611-001`

## Outcome

No protected environment rewrite was required.

The gate backed up the Japan protected environment, proxy config, control DB,
and subscription DB, then performed a redacted systemd-style environment parse.
That parse found `EDGE_DATA_PLANE_AGENT_NODES_JSON` already resolves to a JSON
array when interpreted from the EnvironmentFile content.

Because no environment value changed, `proxy-gateway-candidate.service` was not
restarted and no `current` symlink switch was performed.

No DNS, Nginx, provider firewall, SGP runtime, payment, account/password,
subscription URL/token/password, private key, credential, SQLite row, raw
environment, raw config, or raw log output was changed or disclosed.

## Redacted Evidence

Backups:

- Protected environment files backed up: 2
- Protected proxy config backed up: 1
- Protected control DB backed up: 1
- Protected subscription DB backed up: 1

Japan boundary validation:

- Current release remained
  `edge-agent-production-activation-20260610-005-worktree`
- Candidate release directory was present.
- `EDGE_DATA_PLANE_AGENT_NODES_JSON` effective type: array
- Environment changed: no
- Restart performed: no
- `proxy-gateway-candidate.service`: active
- Local health: `200`
- Portal public: `200`
- Subscription health public: `200`
- Public Admin route: blocked
- Public internal agent route: blocked
- No-session portal API: rejected
- `tcp/3456`: loopback-only
- Unauthenticated loopback internal route: rejected

Candidate temp-start proof:

- The candidate was started only on an alternate loopback port with temporary
  copies of the control and subscription DBs.
- The process was launched through a root wrapper that reads EnvironmentFiles
  and drops privileges to `proxy-gateway`, matching systemd's environment-file
  authority model more closely than shell-sourcing.
- Candidate temp health reached `200`.
- The temporary control DB contained
  `platform_edge_desired_state_notifications`.
- No missing module, syntax, SQLite, permission, runtime validation,
  channel-ref mismatch, or agent-node JSON error was observed in the redacted
  classification.

## Correction To Prior Diagnostic

The earlier rollback record used shell-sourcing for a temporary-start
diagnostic. That was not a faithful model for systemd EnvironmentFile parsing
and produced a false `EDGE_DATA_PLANE_AGENT_NODES_JSON` invalid-JSON
classification.

The authoritative result from this gate is:

- the protected EnvironmentFile material is already parseable as a JSON array;
- no normalization mutation is needed;
- `edge-agent-future-order-runtime-20260611-001` can start successfully in the
  temp-start proof with temporary DB copies.

## Current State

- Japan production remains on
  `edge-agent-production-activation-20260610-005-worktree`.
- `edge-agent-future-order-runtime-20260611-001` remains an inactive candidate
  release on disk.
- The real production control DB was not migrated by this gate.
- Singapore runtime was not mutated or restarted.

## Next Gate

The next gate may retry the Japan runtime/schema upgrade for
`edge-agent-future-order-runtime-20260611-001` under a separate exact Risk A
approval. That gate still needs protected backups, current symlink switch,
service restart, idempotent schema migration, boundary validation, rollback, and
the same sensitive-output restrictions.
