# Edge-Agent Private Tunnel Production Activation

Date: 2026-06-11, Asia/Shanghai.

Risk tier: A production control-plane/data-plane activation.

Targets:

- Vultr Japan control plane: `45.76.222.52`
- Vultr Singapore data plane: `45.76.158.201`

This record contains only redacted operational facts. It does not contain raw
environment values, raw runtime config, raw logs, SQLite rows, account
credentials, subscription URLs, tokens, passwords, private keys, runtime
credential material, or customer data.

## Approval

The operator approved the `005` edge-agent production activation package:

- release:
  `edge-agent-production-activation-20260610-005-worktree`;
- artifact:
  `.codex-artifacts/edge-agent-production-activation-20260610-005-worktree/proxy-gateway-edge-agent-production-activation-20260610-005-worktree.zip`;
- archive SHA256:
  `BB17E8E218E63A403041F5B5059BCBDE1DCDF199C7B5B82329E1CB4908343D5E`.

The operator also approved a private SGP edge-agent reverse SSH tunnel:

- create or update a Japan systemd tunnel unit;
- bind the Singapore loopback private port to the Japan internal agent route on
  `127.0.0.1:3456`;
- keep the internal route private;
- validate that unauthenticated internal-agent requests are rejected and public
  `/api/internal/*` remains blocked.

Forbidden during this gate:

- DNS, Nginx, provider firewall, public Admin, payment, account/password, or
  live-order mutation;
- subscription URL, token, password, private key, runtime credential material,
  SQLite row, raw environment, raw config, or raw log output;
- copying protected runtime config into Git;
- unrelated service restarts.

## Scope Executed

Executed on the Japan control plane:

- verified the approved `005` artifact SHA256;
- deployed release
  `edge-agent-production-activation-20260610-005-worktree`;
- preserved the previous deployed release for rollback;
- installed a private systemd tunnel unit for the Singapore edge-agent path;
- repaired the restricted Singapore SSH authorized key options to permit only
  the reviewed loopback listener needed by the tunnel;
- enabled the internal data-plane agent route in the protected runtime
  environment;
- restarted only `proxy-gateway-candidate.service` after the runtime switch and
  protected environment update;
- created reviewed desired-state records for the existing delivered,
  unexpired, material-backed Singapore channel credentials;
- did not create live orders.

Executed on the Singapore data plane:

- installed the `005` edge-agent runtime under the protected edge-agent release
  path;
- installed the edge-agent wrapper and systemd unit;
- configured the agent to pull desired-state through the private loopback
  tunnel;
- synchronized only the protected material subset needed by existing delivered
  Singapore credentials;
- ran a dry-run pull/apply proof;
- ran a controlled apply proof;
- enabled `gccgw-edge-agent.service`;
- repaired the edge-agent systemd sandbox so it can write only the approved
  runtime config and backup paths;
- restarted only `gccgw-edge-agent.service` and the approved Singapore
  data-plane services required by controlled apply.

Not executed:

- no DNS, Nginx, provider firewall, payment, account/password, or live-order
  mutation;
- no public Admin exposure;
- no subscription URL, token, password, private key, raw environment, raw
  config, raw log, SQLite row, runtime credential material, or customer-data
  output.

## Backup

Japan protected backup references:

- edge-agent tunnel unit backup:
  `edge-agent-tunnel-20260611T074417Z`;
- edge-agent tunnel fix backup:
  `edge-agent-tunnel-fix-20260611T074620Z`;
- Singapore authorized-key backup:
  `gccgw-authorized-keys-backups/20260611T074952Z`;
- edge-agent route enable backup:
  `edge-agent-routes-enable-20260611T082145Z`;
- desired-state seed backup:
  `edge-agent-desired-state-seed-20260611T084130Z`.

Singapore protected backup references:

- edge-agent install/update backup:
  `agent-005-20260611T080027Z`;
- edge-agent material merge backup:
  `edge-agent-material-2026_06_11T08_45_07_780Z`;
- edge-agent service enable backup:
  `edge-agent-service-enable-20260611T084843Z`;
- edge-agent systemd sandbox backup:
  `edge-agent-unit-readwritepaths-20260611T085824Z`.

## Apply Results

Private tunnel:

- Singapore loopback private port reached Japan internal agent route;
- unauthenticated request through the private tunnel returned HTTP 401;
- public `/api/internal/*` remained HTTP 404;
- Japan `tcp/3456` remained loopback-only.

Desired-state and receipt results:

- `channel-sgp-a-vless-reality-tcp` desired-state: active;
- `channel-sgp-a-hy2` desired-state: active;
- `channel-sgp-a-tuic` desired-state: active;
- latest receipt for all three Singapore channels: `applied`;
- latest receipt reason for all three Singapore channels:
  `runtime_apply_ok`;
- latest receipt matched the corresponding desired-state for all three
  Singapore channels;
- config-test, service-active, and listener-recorded checks passed for all
  three Singapore channels.

Redacted Singapore credential-count validation:

- `channel-sgp-a-vless-reality-tcp`: 26 credentials;
- `channel-sgp-a-hy2`: 33 credentials;
- `channel-sgp-a-tuic`: 26 credentials.

## Validation

Japan control-plane validation:

- deployed release:
  `edge-agent-production-activation-20260610-005-worktree`;
- public subscription health: HTTP 200;
- public portal: HTTP 200;
- public Admin route: HTTP 404;
- no-session portal API: HTTP 401;
- public internal agent route: HTTP 404;
- `tcp/3456`: loopback-only.

Singapore data-plane validation:

- `gccgw-edge-agent.service`: active and enabled;
- `xray-vless-reality.service`: active;
- `hysteria2.service`: active;
- `mihomo-tuic.service`: active;
- TCP 8443 listener: present;
- UDP 10443 listener: present;
- UDP 443 listener: present;
- edge-agent private tunnel listener: loopback-only;
- traffic stats listener: loopback-only;
- public traffic stats exposure: not present;
- local health: HTTP 200.

Local validation:

- `git diff --check`: passed.

## Result

The private edge-agent pull/apply/receipt path is active for Singapore.

The Japan control plane now has active desired-state and fresh applied receipts
for the three Singapore channels. The Singapore edge-agent can pull through the
private loopback tunnel, apply the reviewed runtime state, and report redacted
receipts back to the Japan control plane.

This gate did not create a live order. It also did not promote a generic
future-order desired-state publisher. The current activation seeded
desired-state from existing delivered, unexpired, material-backed Singapore
credentials. Future orders still need a follow-up code/runtime gate that
publishes desired-state automatically as part of order issuance, refresh, or
reconcile.

## Rollback

If rollback is required:

1. Restore the previous Japan `current` symlink and protected environment,
   proxy config, control DB, and subscription DB backups.
2. Stop and remove the Japan private tunnel unit if reverting the tunnel path.
3. Restore the Singapore authorized key backup if reverting the tunnel
   permission change.
4. Restore the Singapore edge-agent runtime, protected material file, agent
   environment, and systemd unit backups as applicable.
5. Restore the Singapore runtime config backups and restart only affected
   approved services after config validation.
6. Re-run Japan public-boundary, Singapore service/listener, private tunnel,
   and redacted receipt validation.
