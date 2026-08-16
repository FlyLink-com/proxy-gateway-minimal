# Edge-Agent Future-Order Live Smoke Approval Packet


```yaml
document_metadata:
  doc_type: evidence
  lifecycle: historical
  authority_scope: edge_agent_future_order_live_smoke_approval_packet
  superseded_by: null
  last_verified_at: 2026-06-11
  production_authority: false
```


Date: 2026-06-11, Asia/Shanghai.

Risk tier: A production live-order and data-plane apply validation.

Targets:

- Vultr Japan control plane: `45.76.222.52`
- Vultr Singapore data plane: `45.76.158.201`

This packet is a planning and approval packet. It is not itself production
approval. It does not contain raw environment values, raw runtime config, raw
logs, SQLite rows, account credentials, subscription URLs, tokens, passwords,
private keys, runtime credential material, or customer data.

## Reason

The previous approved `002` runtime/schema production retry moved the Japan
control plane to `edge-agent-future-order-runtime-20260611-002-worktree` and
created `platform_edge_desired_state_notifications` in the real control DB.
Singapore validation was read-only and showed the edge-agent and the three
Singapore protocol runtimes/listeners were active.

The remaining production question is not package startup anymore. It is the
future-order loop:

1. a new order is delivered by the Japan control plane;
2. Singapore channel desired-state notifications are recorded for that order;
3. the Singapore edge-agent pulls and applies the desired state;
4. Singapore posts fresh redacted applied receipts;
5. subscription rendering includes Singapore channels only after matching
   applied receipts exist.

This gate validates that loop with exactly one controlled test order.

## Current Production Anchor

The current documented Japan production release is:

`edge-agent-future-order-runtime-20260611-002-worktree`

Treat this as the rollback release unless a fresh read-only inventory
immediately before execution proves a different current release.

## Scope Allowed After Exact Approval

Japan control-plane actions:

1. Read-only inventory to re-confirm current release, public/private boundary
   posture, schema presence, and Singapore edge-agent route posture.
2. Back up current symlink, protected environment, protected proxy config,
   control DB, and subscription DB if configured.
3. Create exactly one controlled test user-portal order:
   - duration: 7 days;
   - quantity: 1;
   - client profile: Clash/Mihomo;
   - use only an already approved test account/session or protected operator
     test path;
   - do not output account credentials or subscription material.
4. Observe the resulting order lifecycle using redacted refs only.
5. Verify that pending desired-state notifications are created for Singapore
   channels tied to the new order.
6. Trigger or wait for one Singapore edge-agent pull/apply cycle through the
   existing private path.
7. Validate that fresh Singapore applied receipts exist for the new order before
   subscription rendering includes Singapore channels.

Singapore data-plane actions:

1. Back up protected edge-agent metadata and approved runtime configs before
   apply validation.
2. Allow the Singapore edge-agent to pull the new desired-state through the
   existing private route.
3. Allow the Singapore edge-agent to config-test and apply only the new
   controlled order credentials.
4. Restart only approved Singapore data-plane services when required by the
   controlled edge-agent apply path and only after config-test:
   - `xray-vless-reality.service`;
   - `hysteria2.service`;
   - `mihomo-tuic.service`;
   - `gccgw-edge-agent.service` if required for the apply loop.

## Forbidden Actions

- DNS mutation;
- Nginx config mutation or reload;
- provider firewall mutation;
- public Admin exposure;
- payment mutation;
- account or password generation;
- more than one live test order;
- passkey enablement;
- subscription URL, token, password, private key, credential value, raw
  environment, raw config, raw log, SQLite row, or customer-data output;
- copying protected runtime config into Git;
- unrelated service restarts;
- changing non-Singapore data-plane runtime state.

## Validation

The live smoke validation must prove, without dumping sensitive values:

- Japan service is active;
- Japan `/api/health` returns HTTP 200;
- portal root returns HTTP 200;
- subscription/public health returns HTTP 200;
- public Admin remains blocked;
- public internal data-plane agent route remains blocked;
- no-session portal APIs reject;
- `tcp/3456` remains loopback-only;
- unauthenticated internal agent route rejects;
- `platform_edge_desired_state_notifications` exists;
- exactly one controlled test order was created;
- the order is delivered or in the expected controlled lifecycle state;
- desired-state notification count for the new order is non-zero for Singapore
  channels;
- Singapore edge-agent is active after the apply cycle;
- Singapore TCP 8443, UDP 10443, and UDP 443 listeners are active;
- Singapore traffic stats remain loopback-only;
- fresh applied receipts exist for Singapore channels for the new order;
- subscription render proof for the new order includes Singapore channels only
  after fresh applied receipts exist;
- no raw credential, subscription URL, token, password, private key, raw config,
  raw log, raw environment, SQLite row, or customer data is output.

## Rollback

If validation fails:

1. Restore Japan protected environment, proxy config, control DB, and
   subscription DB backups as needed.
2. Restore Singapore edge-agent metadata and runtime config backups as needed.
3. Restart only affected approved services after config-test.
4. Preserve the failed smoke order refs as redacted evidence in the execution
   record; do not dump rows or secret material.
5. Revalidate Japan health, public boundary posture, no-session rejection,
   `tcp/3456` loopback-only posture, and Singapore listener/service posture.

## Exact Approval Template

```text
批准执行 Vultr Japan/SGP edge-agent future-order live smoke：
target=Vultr Japan control plane 45.76.222.52 + SGP data plane 45.76.158.201 only；
current_release=edge-agent-future-order-runtime-20260611-002-worktree；
scope=read-only inventory; backup Japan current symlink/protected env/proxy config/control DB/subscription DB and SGP edge-agent metadata/runtime configs; create exactly one controlled 7-day quantity-1 Clash/Mihomo test order using approved test account/session or protected operator test path; verify desired-state notifications for SGP channels; trigger or wait for one SGP edge-agent pull/apply cycle through the existing private path; config-test and restart only approved SGP data-plane services if required by the controlled apply path; verify fresh applied receipts and redacted subscription render proof；
validation=Japan health 200, portal/sub public 200, Admin blocked, public internal agent route blocked, no-session portal APIs reject, tcp3456 loopback-only, unauthenticated internal route rejects, platform_edge_desired_state_notifications exists, exactly one controlled test order created, SGP desired-state notifications nonzero for the new order, SGP agent active, SGP TCP8443/UDP10443/UDP443 active, stats loopback-only, fresh applied receipts exist, subscription render proof includes SGP channels only after matching applied receipts, no sensitive output；
rollback=restore Japan protected env/proxy config/control DB/subscription DB and SGP edge-agent/runtime config backups as needed, restart only affected approved services after config-test, preserve redacted failed smoke refs only；
forbidden=DNS,Nginx config/reload,provider firewall,public Admin,payment,account/password generation,more than one live order,passkey enablement,subscription URL/token/password/private key/credential output,SQLite row dump,raw env/log/config output,copying protected runtime config into Git,unrelated service restart,non-SGP data-plane runtime mutation。
```

## Next Gate After Success

If the live smoke passes, the next closeout gate should update the production
records and project state to mark the future-order SGP edge-agent loop as
runtime-validated. Broader quota enforcement, live usage collection, and
additional data-plane expansion remain separate gates.
