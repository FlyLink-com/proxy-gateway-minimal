# Edge-Agent 002 Read-Only Preflight


```yaml
document_metadata:
  doc_type: evidence
  lifecycle: historical
  authority_scope: edge_agent_002_readonly_preflight
  superseded_by: null
  last_verified_at: 2026-06-11
  production_authority: false
```


Date: 2026-06-11

Risk: A read-only production preflight

Scope:

- Read-only checks against Vultr Japan control plane.
- Local candidate package and public boundary checks.
- No artifact upload, release switch, service restart, schema migration,
  Singapore runtime mutation, live order creation, DNS/Nginx/firewall/systemd
  change, or protected material output.
- No environment values, subscription URLs, tokens, private keys, credentials,
  raw logs, raw configs, or SQLite rows were output or recorded.

## Candidate

```text
release=edge-agent-future-order-runtime-20260611-002-worktree
artifact=D:\Projects\proxy-gateway-minimal\.codex-artifacts\edge-agent-future-order-runtime-20260611-002-worktree\proxy-gateway-edge-agent-future-order-runtime-20260611-002-worktree.zip
archive_sha256=08E4EF8438CABF641E29CEE1B1121A890B04C8514E263F5D58784AF203A32920
```

## Findings

The `002` candidate's local proxy config contains the expected Singapore
placeholder set only:

- `SGP_HY2_STATIC_PASSWORD`;
- `SGP_TUIC_STATIC_PASSWORD`;
- `SGP_TUIC_STATIC_UUID`;
- `SGP_VLESS_STATIC_UUID`;
- `SGP_XRAY_VLESS_REALITY_PUBLIC_KEY`;
- `SGP_XRAY_VLESS_REALITY_SHORT_ID`.

The Japan production service remains on
`edge-agent-production-activation-20260610-005-worktree` and is active.

Read-only protected environment key-presence validation found:

- environment file count: 2;
- checked candidate placeholders: 18;
- missing placeholder keys: 0;
- missing SGP placeholder keys: 0.

This preflight confirms the previous SGP placeholder namespace blocker is
cleared for the `002` candidate. It does not prove candidate temp-start,
production service restart, schema migration, or future live-order behavior.

## Public Boundary Check

Observed status classes:

- portal static: `200`;
- subscription health: `200`;
- public Admin route: blocked (`404`);
- no-session portal orders route: rejected (`401`);
- public internal edge-agent route: blocked (`404`).

## Next Gate

The next production gate may use the `002` package, but it must still prove the
candidate with temporary DB paths and an alternate loopback port before any
production symlink switch or real control DB migration.
