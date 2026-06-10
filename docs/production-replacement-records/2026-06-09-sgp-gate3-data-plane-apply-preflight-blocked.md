# SGP Gate 3 Data-Plane Apply Preflight Blocked

Date: 2026-06-09, Asia/Shanghai.

Risk tier: A production data-plane apply preflight.

Targets:

- Vultr Japan control plane: `45.76.222.52`
- Vultr Singapore data plane: `45.76.158.201`

This record contains only redacted operational facts. It does not contain raw
environment values, raw runtime config, raw logs, SQLite rows, account
credentials, subscription URLs, tokens, passwords, private keys, or customer
data.

## Scope Executed

Allowed and executed as read-only preflight:

- verified local Git/worktree orientation;
- reviewed the SGP closeout gate records;
- verified Japan control-plane service and public boundary health;
- verified Japan-to-SGP SSH still works through the configured apply identity;
- checked the protected data-plane handoff queue count without reading handoff
  contents;
- verified SGP service and listener posture;
- checked redacted runtime credential shape and config-test compatibility;
- ran a redacted six-channel render proof using the Japan control-plane
  protected config and protected environment shape.

Not executed:

- no SGP runtime config mutation;
- no handoff item consumption;
- no service restart;
- no DNS, Nginx, provider firewall, or systemd mutation;
- no database mutation or SQLite row dump;
- no live order creation;
- no raw subscription or credential output.

## Read-Only Results

Japan control plane:

- current release:
  `vultr-japan-sgp-gate2-20260609-505eed9-static`;
- `proxy-gateway-candidate.service`: active;
- local health endpoint on the actual loopback application port: HTTP 200;
- local Admin route required authentication;
- public portal: HTTP 200;
- public health: HTTP 200;
- public Admin: HTTP 404;
- `tcp3456`: loopback-only;
- Japan-to-SGP SSH: ok;
- redacted node policy check:
  - ok: true;
  - nodeCount: 6;
  - blockers: 0;
  - warnings: 0.

Singapore data plane:

- current release: `sgp-hy2-replacement-20260608-001`;
- `proxy-gateway-candidate.service`: active;
- `xray-vless-reality.service`: active;
- `hysteria2.service`: active;
- `mihomo-tuic.service`: active;
- local health endpoint on the actual loopback application port: HTTP 200;
- public portal: HTTP 200;
- public health: HTTP 200;
- public Admin: HTTP 404;
- listener inventory included:
  - TCP 8443;
  - UDP 10443;
  - UDP 443;
  - loopback-only TCP 26080 stats.

Config-test compatibility:

- Xray config-test must use `xray run -test -config ...`; the older
  `xray test` subcommand is not supported by the deployed Xray build.
- Xray config-test with the supported command returned configuration ok.
- Mihomo config-test returned ok.
- Hysteria2 did not expose a safe standalone config-test command in this
  inventory; service active state, listener state, and loopback-only stats
  remain the safe validation anchors until a reviewed test wrapper exists.

## Blocker

Gate 3 is blocked before runtime apply.

The Japan control-plane handoff directory currently has zero pending handoff
JSON items, so there is nothing reviewed for Gate 3 to consume.

The redacted six-channel render proof also showed that Japan's protected
control-plane environment resolves Vultr channel placeholders, but does not
resolve the SGP channel credential placeholders:

- `channel-sgp-a-vless-reality-tcp`: missing runtime values for `uuid`,
  `realityOpts.publicKey`, and `realityOpts.shortId`;
- `channel-sgp-a-hy2`: missing runtime value for `password`;
- `channel-sgp-a-tuic`: missing runtime values for `uuid` and `password`.

This is a control-plane material registration gap. SGP services are active, but
the Japan control plane cannot currently prove or render the SGP channels from
its own protected environment without reading raw SGP runtime config.

## Decision

Do not execute Gate 3 runtime apply yet.

Safe current statement:

- Gate 2 clean Japan control-plane upgrade is complete.
- Japan-to-SGP SSH apply identity works.
- SGP data-plane services and listeners are active.
- Gate 3 protected data-plane apply is blocked because Japan has no pending
  handoff items and lacks SGP credential placeholder bindings in its protected
  environment.

## Next Gate

Prepare a separate exact Risk A gate to register or regenerate SGP channel
credential material through the protected handoff path, without printing raw
material. After that gate:

1. rerun the redacted six-channel render proof;
2. verify SGP credential counts by channel;
3. config-test Xray and Mihomo with supported commands;
4. validate Hysteria2 by reviewed safe anchors;
5. only then consume or archive handoff items and mark Gate 3 complete.
