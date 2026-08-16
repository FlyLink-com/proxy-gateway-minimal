# Edge-Agent Source Deployment Approval Packet


```yaml
document_metadata:
  doc_type: evidence
  lifecycle: historical
  authority_scope: edge_agent_source_deployment_approval_packet
  superseded_by: null
  last_verified_at: 2026-06-11
  production_authority: false
```


Date: 2026-06-11, America/Los_Angeles.

Risk tier: A production runtime and Singapore data-plane agent activation.

Target:

- Vultr Japan control plane: `45.76.222.52`
- Vultr Singapore data plane: `45.76.158.201`

This packet is a planning and approval packet. It is not itself production
approval. It does not contain raw environment values, raw runtime config, raw
logs, SQLite rows, account credentials, subscription URLs, tokens, passwords,
private keys, runtime credential material, or customer data.

## Reason

The future-order live-smoke path proved the Japan control plane can create
Singapore desired-state notifications, but Singapore did not produce fresh
applied receipts for the newly delivered order. The repository now includes the
missing production data-plane agent source and source-tracked systemd launcher.

This gate deploys the corrected source package and proves the SGP agent can
pull, apply, and receipt desired-state through the private path. It must not be
treated as complete until fresh SGP applied receipts and render-proof gating are
validated.

## Source Candidate

- Branch: `codex/edge-agent-source-absorption`
- Runtime release:
  `edge-agent-source-absorption-20260611-001-worktree`
- Artifact:
  `D:\Projects\proxy-gateway-minimal\.codex-artifacts\edge-agent-source-absorption-20260611-001-worktree\proxy-gateway-edge-agent-source-absorption-20260611-001-worktree.zip`
- SHA256:
  `CD211BC23CB7759C7F9C73CA69D26BFFFB183E7B03D1BCFA503ED3284B6999F7`

The local package preflight confirmed these source-tracked files are included
in the archive:

- `agent/production-edge-agent.mjs`
- `scripts/edge-agent-once.sh`
- `ops/edge-node/systemd/gccgw-edge-agent.service`
- `server/tests/production-edge-agent.test.mjs`
- `docs/production-replacement-records/2026-06-11-edge-agent-source-absorption.md`

The package excludes `.git`, `node_modules`, `.codex-artifacts`,
`.codex-runtime`, `data`, `.proxy-gateway`, and `test-results`.

## Current Production Anchor

The current production release must be verified by read-only inventory at
execution time. The latest documented Japan runtime release before this packet
is:

`edge-agent-future-order-runtime-20260611-002-worktree`

Treat any mismatch as a stop-and-report condition unless the operator supplies
an updated approval with the live current release.

## Scope Allowed After Exact Approval

Japan control-plane actions:

1. Read-only inventory to re-confirm current release and public/private
   boundary posture.
2. Back up current symlink, protected environment, protected proxy config,
   control DB, and subscription DB if configured.
3. Upload the verified artifact named in this packet.
4. Verify artifact SHA256 on host.
5. Unpack to the approved release directory.
6. Run `npm ci` in the release directory.
7. Switch the Japan `current` symlink to the approved release.
8. Restart only `proxy-gateway-candidate.service`.
9. Validate public boundaries and internal agent route rejection.

Singapore data-plane actions:

1. Back up SGP edge-agent metadata and approved runtime configs.
2. Install or update the source-tracked `gccgw-edge-agent.service` and
   `scripts/edge-agent-once.sh` path from the reviewed package.
3. Validate protected agent environment key presence by key name only.
4. Run SGP edge-agent dry-run once.
5. Run controlled apply for exactly one existing approved test order or exactly
   one newly approved 7-day quantity-1 test order.
6. Config-test SGP Xray, Hysteria2, and TUIC.
7. Restart only approved SGP data-plane services if required by the controlled
   apply path and only after config-test passes.
8. Post redacted dry-run and applied receipts.
9. Validate subscription render proof only includes SGP channels after matching
   fresh applied receipts.

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
- unrelated service restart.

## Validation

Validation must prove:

- artifact hash matches this packet;
- `npm ci` succeeds;
- Japan `proxy-gateway-candidate.service` is active;
- Japan `/api/health` returns HTTP 200;
- portal and subscription public roots remain HTTP 200;
- public Admin remains blocked;
- public internal data-plane agent route remains blocked;
- no-session portal APIs reject;
- `tcp/3456` remains loopback-only;
- unauthenticated internal agent route rejects;
- SGP agent is active after the controlled apply gate;
- SGP TCP 8443, UDP 10443, and UDP 443 listeners are active;
- SGP traffic-stats endpoint is loopback-only;
- dry-run receipt is recorded;
- fresh applied receipt is recorded for the controlled order;
- render proof requires a matching fresh applied receipt before including SGP
  channels;
- no sensitive output is recorded.

Validation may report table/column presence and aggregate safe status facts
only. It must not dump SQLite rows.

## Rollback

If validation fails:

1. Restore the previous Japan `current` symlink.
2. Restore Japan protected environment, proxy config, control DB, and
   subscription DB backups as needed.
3. Restore SGP edge-agent and runtime config backups as needed.
4. Restart only affected approved services after config-test.
5. Revalidate Japan health, public boundary posture, no-session rejection, and
   loopback-only Admin/internal route posture.
6. Preserve redacted failed smoke references only.

## Exact Approval Template

```text
批准执行 Vultr Japan/SGP edge-agent source deployment + future-order live smoke：
release=edge-agent-source-absorption-20260611-001-worktree；
artifact=D:\Projects\proxy-gateway-minimal\.codex-artifacts\edge-agent-source-absorption-20260611-001-worktree\proxy-gateway-edge-agent-source-absorption-20260611-001-worktree.zip；
archive_sha256=CD211BC23CB7759C7F9C73CA69D26BFFFB183E7B03D1BCFA503ED3284B6999F7；
target=Vultr Japan control plane 45.76.222.52 + SGP data plane 45.76.158.201 only；
current_release=edge-agent-future-order-runtime-20260611-002-worktree；
scope=read-only inventory; protected backups; upload verified artifact; npm ci; switch Japan current; restart Japan proxy-gateway-candidate.service only; install/update SGP gccgw-edge-agent source/service from reviewed package; validate protected agent env key presence by key name only; dry-run SGP agent once; controlled apply for exactly one existing approved test order or exactly one newly approved 7-day quantity-1 test order; config-test SGP Xray/Hy2/TUIC; restart only approved SGP data-plane services if required after config-test; post redacted receipts; render proof；
validation=artifact hash ok, npm ci ok, Japan service active, Japan health 200, portal/sub public 200, Admin blocked, public internal route blocked, no-session APIs reject, tcp3456 loopback-only, unauthenticated internal route rejects, SGP agent active, SGP TCP8443/UDP10443/UDP443 active, stats loopback-only, dry-run receipt ok, fresh applied receipt ok, subscription render proof includes SGP channels only after matching fresh receipt, no sensitive output；
rollback=restore Japan/SGP protected backups and previous agent/runtime state, restart only affected approved services after config-test；
forbidden=DNS,Nginx config/reload,provider firewall,public Admin,payment,account/password generation,more than one live order,passkey enablement,subscription URL/token/password/private key/credential output,SQLite row dump,raw env/log/config output,copying protected runtime config into Git,unrelated service restart。
```
