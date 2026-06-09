# Vultr Japan + Singapore Multichannel Runtime Closeout

Date: 2026-06-09, Asia/Shanghai.

Risk tier: A.

Target: Vultr Japan control plane and Vultr Singapore data plane.

Production impact: limited to the already approved Vultr/Singapore
multichannel production lane. No DNS, Nginx, provider firewall, payment,
account/password generation, live order creation, public Admin exposure,
subscription URL/token/password output, SQLite row dump, raw environment values,
raw runtime config, or raw logs were changed or disclosed by this closeout
record.

## Scope

This record captures the local/project closeout for the runtime issue where
Singapore channels were rendered into subscriptions but failed on desktop
clients while phone testing could still appear healthy through other selected
channels or client behavior.

The closeout covered:

- single-control-plane / multi-data-plane handoff from the Japan control plane
  to the Singapore data-plane host;
- Singapore VLESS Reality, Hysteria2, and TUIC runtime application;
- client subscription template protection against controlled-domain fake-IP
  self-routing;
- Hysteria2 runtime config compatibility with the deployed Hysteria2 binary;
- protected runtime config ownership for services running as the
  `proxy-gateway` user.

## Root Causes

1. The Singapore host was partially connected: the Japan control plane had
   redacted handoff artifacts for SGP channels, but the SGP data-plane runtime
   had not fully applied the corresponding credential material.
2. The SGP runtime adapter wrote active config files with root ownership and
   `0600` permissions. The Xray, Hysteria2, and Mihomo/TUIC services run as
   `proxy-gateway`, so the services could not read their active configs after
   apply.
3. The Hysteria2 adapter rendered `outbounds` using an object-like shape that
   the deployed Hysteria2 runtime rejected. The runtime expects `outbounds` as a
   list of named outbound entries.
4. The subscription template needed controlled-domain DNS/fake-IP protection so
   desktop Clash/Mihomo clients do not proxy the platform's own node domains
   back through the subscription path.

## Code Closeout

Local repository changes now include:

- `server/services/clash-subscription.mjs`
  - adds controlled node-domain DNS/fake-IP protection and DIRECT rules for
    GlobalCircle-owned node domains;
- `server/services/edge/hysteria2-runtime-adapter.mjs`
  - renders Hysteria2 `outbounds` as a named list entry;
  - preserves existing active-config file ownership when replacing configs;
- `server/services/edge/xray-vless-reality-runtime-adapter.mjs`
  - preserves existing active-config file ownership when replacing configs;
- `server/services/edge/mihomo-tuic-host-runtime-adapter.mjs`
  - preserves existing active-config file ownership when replacing configs;
- `server/tests/clash-subscription.test.mjs`
  - covers controlled-domain fake-IP/self-routing protection;
- `server/tests/edge-vless-hy2-runtime-adapters.test.mjs`
  - covers production Hysteria2 sniff, IPv4-only outbound, trafficStats, and
    the corrected `outbounds` schema;
- `server/tests/state.test.mjs`
  - aligns the multi-channel state assertion with the corrected Hysteria2
    schema.

## Production Validation Summary

Redacted production validation recorded during the gate:

- Japan control plane service was active.
- Japan `/api/health` returned HTTP 200.
- Japan public portal returned HTTP 200.
- Japan public subscription root returned HTTP 404.
- Japan public Admin path returned HTTP 404.
- No-session portal API returned HTTP 401.
- Japan effective channel refs included all six production channels:
  - `channel-vultr-a-vless-reality-tcp`
  - `channel-vultr-a-hy2`
  - `channel-vultr-a-tuic`
  - `channel-sgp-a-vless-reality-tcp`
  - `channel-sgp-a-hy2`
  - `channel-sgp-a-tuic`
- The six production channels shared one subscription bundle.
- SGP Xray, Hysteria2, and Mihomo/TUIC services were active.
- SGP TCP 8443, UDP 10443, and UDP 443 listeners were present.
- SGP Hysteria2 traffic stats listener was loopback-only.
- SGP Hysteria2 sniff and IPv4-only outbound policy were present.
- SGP protected active config ownership was aligned to the service user.
- Temporary SGP credential material used for the controlled handoff apply was
  removed after successful apply.

No raw subscription URL, token, password, credential material, raw config,
SQLite row, raw environment value, or customer data is recorded here.

## Local Validation

Targeted local validation:

```powershell
node --test server\tests\clash-subscription.test.mjs --test-name-pattern "fake-ip self-routing"
node --test server\tests\clash-subscription.test.mjs server\tests\vultr-tuic-template.test.mjs
node --test server\tests\edge-vless-hy2-runtime-adapters.test.mjs
node --test --test-concurrency=1 server\tests\state.test.mjs --test-name-pattern "Hysteria2|multi-channel|remote|handoff|channel"
```

Observed results:

- the focused Clash subscription and runtime-adapter tests passed;
- the targeted `state.test.mjs` business assertions passed, but four tests still
  reported Windows temp-directory cleanup `EPERM` failures during `rmSync`;
  those failures are local cleanup behavior and were not caused by the
  Hysteria2 schema or config ownership fix.

## Boundaries

This record does not claim:

- full user-device compatibility across every Clash/Mihomo build;
- production quota auto-disable enablement;
- complete per-order usage display in Admin/User Portal;
- automated recurring remote data-plane apply without operator gate;
- DNS, Nginx, or provider firewall changes.

## Follow-Up

Next safe actions:

1. Package the local adapter/template fixes into the next formal Vultr runtime
   release so future deploys do not overwrite the hotfixed SGP files.
2. Run a new-order end-to-end smoke from at least one desktop and one phone:
   create order, refresh subscription, import into client, and test Vultr plus
   SGP channel groups.
3. Convert the temporary SGP handoff apply path into a reviewed, repeatable
   data-plane apply command that preserves ownership and never prints raw
   material.
4. Continue the usage-monitor lane by binding Hy2 usage facts to
   `edgeCredentialRef` and surfacing order-owned usage in the Admin panel.
