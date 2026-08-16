# Edge-Agent Future-Order Runtime Upgrade Approval Packet


```yaml
document_metadata:
  doc_type: evidence
  lifecycle: historical
  authority_scope: edge_agent_future_order_runtime_upgrade_approval_packet
  superseded_by: null
  last_verified_at: 2026-06-11
  production_authority: false
```


Date: 2026-06-11, Asia/Shanghai.

Risk tier: A production runtime upgrade and schema migration.

Target:

- Vultr Japan control plane: `45.76.222.52`
- Vultr Singapore data plane: read-only validation only

This packet is a planning and approval packet. It is not itself production
approval. It does not contain raw environment values, raw runtime config, raw
logs, SQLite rows, account credentials, subscription URLs, tokens, passwords,
private keys, runtime credential material, or customer data.

## Reason

The approved read-only preflight found that Japan and Singapore runtime
boundaries are healthy, but Japan production is still running the previous
`005` runtime and the control DB does not yet have the future-order
notification table:

- `platform_edge_desired_state_notifications`: missing;
- SGP edge-agent, Xray, Hysteria2, and TUIC are active;
- SGP TCP 8443, UDP 10443, and UDP 443 listeners are present;
- public Admin and public internal agent routes remain blocked.

The next production step is a runtime upgrade on the Japan control plane only,
with an idempotent control DB migration that creates the notification table.
This gate must not create a live order. A live-order smoke test remains a
separate approval after the no-live-order deployment validates cleanly.

## Source Candidate

- Branch: `codex/edge-agent-source-absorption`
- Runtime source commit packaged: `ff6c35a95b2c72a537c9c995204c88566709fd88`
- Runtime release:
  `edge-agent-future-order-runtime-20260611-001`
- Artifact:
  `D:\Projects\proxy-gateway-minimal\.codex-artifacts\edge-agent-future-order-runtime-20260611-001\proxy-gateway-edge-agent-future-order-runtime-20260611-001.zip`
- SHA256:
  `57D65811BE0D907C931C2BDE4B361DFE212EC90A10549879172EE80B47AD6020`

The runtime source commit includes the future-order desired-state notification
source changes and the read-only preflight record. The behavior-relevant source
change was introduced earlier on this lane; this package is the exact archive
intended for the production upgrade gate.

The local package inspection confirmed these required runtime files are present
in the archive:

- `candidate-start.mjs`
- `package.json`
- `package-lock.json`
- `server/state.mjs`
- `server/routes/data-plane-agent.mjs`
- `server/services/edge/data-plane-desired-state-notifier.mjs`
- `server/services/platform/subscription-control-db.mjs`
- `server/services/platform/portal-access-requests.mjs`
- `public/index.html`

## Current Production Anchor

The read-only preflight found the current Japan production release as:

`edge-agent-production-activation-20260610-005-worktree`

This must be treated as the rollback release unless a fresh read-only inventory
immediately before execution proves a different current release.

## Scope Allowed After Exact Approval

Japan control-plane actions:

1. Read-only inventory to re-confirm the current release and public/private
   boundary posture.
2. Back up current symlink, protected environment, protected proxy config,
   control DB, and subscription DB if configured.
3. Upload the verified artifact named in this packet.
4. Verify artifact SHA256 on host.
5. Unpack to the approved release directory.
6. Run `npm ci` in the release directory.
7. Switch the Japan `current` symlink to the approved release.
8. Restart only `proxy-gateway-candidate.service`.
9. Run the idempotent control DB migration that creates
   `platform_edge_desired_state_notifications`.

Singapore data-plane actions:

- read-only validation only:
  - Japan-to-SGP SSH connectivity;
  - `gccgw-edge-agent.service` status;
  - Xray, Hysteria2, and TUIC status;
  - TCP 8443, UDP 10443, and UDP 443 listener presence;
  - traffic-stats loopback-only posture.

## Forbidden Actions

- DNS mutation;
- Nginx config mutation or reload;
- provider firewall mutation;
- SGP runtime config mutation;
- SGP service restart;
- Xray, Hysteria2, TUIC, Mihomo, or edge-agent restart on SGP;
- payment mutation;
- account or password generation;
- live order creation;
- passkey enablement;
- subscription URL, token, password, private key, credential value, raw
  environment, raw config, raw log, SQLite row, or customer-data output;
- copying protected runtime config into Git.

## Validation

The no-live-order runtime upgrade validation must prove:

- artifact hash matches this packet;
- `npm ci` succeeds;
- `proxy-gateway-candidate.service` is active;
- Japan `/api/health` returns HTTP 200;
- portal root returns HTTP 200;
- subscription/public health returns HTTP 200;
- public Admin remains blocked;
- public internal data-plane agent route remains blocked;
- no-session portal APIs reject;
- `tcp/3456` remains loopback-only;
- unauthenticated internal agent route rejects;
- `platform_edge_desired_state_notifications` exists after migration;
- no live order was created during deployment validation;
- SGP read-only status confirms agent and channel listeners remain active.

Validation may report table/column presence and aggregate safe status facts only.
It must not dump SQLite rows.

## Rollback

If validation fails:

1. Restore the previous Japan `current` symlink to
   `edge-agent-production-activation-20260610-005-worktree`.
2. Restore protected environment, proxy config, control DB, and subscription DB
   backups as needed.
3. Restart only `proxy-gateway-candidate.service`.
4. Revalidate health, public boundary posture, no-session rejection, and
   loopback-only Admin/internal route posture.
5. Do not mutate Singapore runtime as part of this rollback gate.

## Exact Approval Template

```text
批准执行 Vultr Japan edge-agent future-order runtime/schema 升级：
release=edge-agent-future-order-runtime-20260611-001；
artifact=D:\Projects\proxy-gateway-minimal\.codex-artifacts\edge-agent-future-order-runtime-20260611-001\proxy-gateway-edge-agent-future-order-runtime-20260611-001.zip；
archive_sha256=57D65811BE0D907C931C2BDE4B361DFE212EC90A10549879172EE80B47AD6020；
target=Vultr Japan control plane 45.76.222.52 only, with SGP 45.76.158.201 read-only validation only；
current_release=edge-agent-production-activation-20260610-005-worktree；
scope=read-only inventory, backup current symlink/protected env/proxy config/control DB/subscription DB, upload verified artifact, npm ci, switch current, restart proxy-gateway-candidate.service only, run idempotent schema migration for platform_edge_desired_state_notifications, SGP read-only agent/listener validation only, no live order creation；
validation=artifact hash ok, npm ci ok, service active, Japan health 200, portal/sub public 200, Admin blocked, public internal agent route blocked, no-session portal APIs reject, tcp3456 loopback-only, unauthenticated internal route rejects, platform_edge_desired_state_notifications exists, SGP agent/listeners read-only ok, no live order creation；
rollback=restore current symlink to edge-agent-production-activation-20260610-005-worktree + protected env/proxy config/control DB/subscription DB backups + restart proxy-gateway-candidate.service only；
forbidden=DNS,Nginx config/reload,provider firewall,SGP runtime config mutation/restart,Xray/Hy2/TUIC/Mihomo/agent restart on SGP,payment,account/password generation,live order creation,passkey enablement,subscription URL/token/password/private key/credential output,SQLite row dump,raw env/log/config output,copying protected runtime config into Git。
```

## Next Gate After Success

After this runtime/schema upgrade validates, the next separate approval can run
a controlled live-order smoke to prove:

- a new order records pending desired-state notifications for SGP channels;
- SGP edge-agent pulls/applies the desired state;
- SGP posts fresh applied receipts;
- subscription rendering includes SGP channels only after matching fresh
  receipts exist.
