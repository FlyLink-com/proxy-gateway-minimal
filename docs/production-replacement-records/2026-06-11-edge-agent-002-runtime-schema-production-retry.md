# Edge-Agent 002 Runtime/Schema Production Retry


```yaml
document_metadata:
  doc_type: evidence
  lifecycle: historical
  authority_scope: edge_agent_002_runtime_schema_production_retry
  superseded_by: null
  last_verified_at: 2026-06-11
  production_authority: false
```


Date: 2026-06-11, Asia/Shanghai.

Risk: A production control-plane runtime/schema gate.

Targets:

- Vultr Japan control plane: `45.76.222.52`
- Vultr Singapore data plane: `45.76.158.201` read-only validation only

This record contains only redacted operational facts. It does not contain raw
environment values, raw runtime config, raw logs, SQLite rows, account
credentials, subscription URLs, tokens, passwords, private keys, runtime
credential material, or customer data.

## Approval

The operator approved the `002` edge-agent future-order runtime/schema retry:

```text
release=edge-agent-future-order-runtime-20260611-002-worktree
artifact=D:\Projects\proxy-gateway-minimal\.codex-artifacts\edge-agent-future-order-runtime-20260611-002-worktree\proxy-gateway-edge-agent-future-order-runtime-20260611-002-worktree.zip
archive_sha256=08E4EF8438CABF641E29CEE1B1121A890B04C8514E263F5D58784AF203A32920
rollback_release=edge-agent-production-activation-20260610-005-worktree
```

Approved scope:

- read-only inventory;
- protected backup;
- verified artifact upload;
- remote SHA verification;
- candidate release preparation and dependency install;
- release-local envfile materialization from protected server material without
  outputting values;
- candidate temp-start using temporary DB copies and an alternate loopback port;
- production current switch only after temp-start proof;
- `proxy-gateway-candidate.service` restart only;
- idempotent schema migration for
  `platform_edge_desired_state_notifications`;
- Singapore read-only agent/listener validation only.

Forbidden during this gate:

- DNS, Nginx, provider firewall, Singapore runtime mutation/restart, Xray/Hy2/
  TUIC/Mihomo/agent restart on Singapore, payment, account/password generation,
  live order creation, passkey enablement, subscription URL/token/password/
  private-key/credential output, SQLite row dump, raw environment, raw log, raw
  config output, or copying protected runtime config into Git.

## Execution

Read-only inventory and backup:

- confirmed Japan service active before mutation;
- confirmed current production release was
  `edge-agent-production-activation-20260610-005-worktree`;
- created protected backup:
  `/var/backups/gccgw-edge/edge-agent-002-retry-20260611-155415`;
- fixed the env backup index so multiple service envfiles are preserved without
  overwriting by basename.

Artifact and release preparation:

- uploaded the approved artifact to Japan;
- remote SHA-256 matched
  `08E4EF8438CABF641E29CEE1B1121A890B04C8514E263F5D58784AF203A32920`;
- unpacked the candidate into the release directory;
- materialized one candidate release-local `.env` from existing protected
  server material without outputting values;
- ran production dependency install successfully.

Candidate temp-start:

- initial raw `candidate-start.mjs` temp-start was rejected before switching
  production because it attempted to start the local HTTP bridge and collided
  with the active runtime bridge port;
- the final accepted temp-start used the same candidate runtime code with
  `autoStartHttpProxy:false`, temporary DB copies, a temporary override
  EnvironmentFile, and an alternate loopback port;
- candidate placeholder missing count: `0`;
- candidate temp health: HTTP `200`;
- temporary control DB contained
  `platform_edge_desired_state_notifications`;
- temporary systemd unit was cleaned up.

Production switch:

- created an additional pre-switch backup of the current symlink target and
  configured DB files;
- switched Japan `current` to
  `edge-agent-future-order-runtime-20260611-002-worktree`;
- restarted only `proxy-gateway-candidate.service`;
- no rollback was required.

## Validation

Japan local validation after switch:

- deployed release:
  `edge-agent-future-order-runtime-20260611-002-worktree`;
- service state: active;
- local health: HTTP `200`;
- `platform_edge_desired_state_notifications` exists in the real control DB;
- `tcp/3456`: loopback-only;
- unauthenticated internal data-plane agent request: HTTP `401`.

Public boundary validation:

- portal static: HTTP `200`;
- subscription health: HTTP `200`;
- public Admin route: blocked (`404`);
- public internal data-plane agent route: blocked (`404`);
- no-session portal orders route: rejected (`401`).

Singapore read-only validation:

- `gccgw-edge-agent.service`: active;
- `xray-vless-reality.service`: active;
- `hysteria2.service`: active;
- `mihomo-tuic.service`: active;
- TCP `8443` listener: present;
- UDP `10443` listener: present;
- UDP `443` listener: present;
- traffic stats listener: loopback-only.

## Result

The Japan control plane is now running
`edge-agent-future-order-runtime-20260611-002-worktree`, and the real control DB
has the future-order desired-state notification schema.

This gate did not create live orders and did not mutate Singapore runtime state.
Future live-order smoke, agent apply validation for newly issued orders, and
any Singapore runtime apply/restart remain separate Risk A gates.

## Rollback

If rollback is required:

1. Restore Japan `current` to
   `edge-agent-production-activation-20260610-005-worktree`.
2. Restore the protected env, proxy config, subscription DB, control DB, and
   systemd metadata backups from the execution backup directory.
3. Restart only `proxy-gateway-candidate.service`.
4. Re-run Japan local health, public portal/sub/Admin/internal-agent boundary,
   and SGP read-only listener validation.
