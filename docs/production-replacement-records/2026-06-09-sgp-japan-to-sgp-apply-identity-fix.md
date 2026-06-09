# SGP Japan-To-SGP Apply Identity Fix

Date: 2026-06-09, Asia/Shanghai.

Risk tier: A targeted production access-path fix.

Target:

- Vultr Japan control plane: `45.76.222.52`
- Vultr Singapore data plane: `45.76.158.201`

This record contains only redacted operational facts. It does not contain raw
private keys, public key material, raw environment values, raw runtime config,
raw logs, SQLite rows, account credentials, subscription URLs, tokens,
passwords, or customer data.

## Reason

The SGP final closeout Gate 1 inventory found:

- direct operator SSH to SGP worked;
- Japan-to-SGP TCP 22 connectivity worked;
- Japan-to-SGP SSH failed with authentication failure;
- SGP runtime services and listeners were otherwise active.

This blocked SGP Gate 3 because remote data-plane handoff apply requires the
Japan control plane to reach SGP through a reviewed apply identity.

## Preflight

Read-only preflight confirmed:

- Japan `/root/.ssh/config` did not exist.
- Japan already had an existing SGP apply key pair.
- Specifying that key from Japan to SGP succeeded.
- Default Japan-to-SGP SSH failed because the default SSH client did not select
  the apply key.
- SGP root SSH directory and authorized keys file had restrictive permissions.
- SGP `sshd` was active.
- Japan-to-SGP TCP 22 connectivity succeeded.

No raw key contents were read or printed.

## Change Executed

On the Japan control-plane host only:

- created `/root/.ssh/config`;
- added a Host entry for `45.76.158.201` and `gccgw-sgp-data-plane`;
- configured that Host entry to use the existing SGP apply identity;
- set `IdentitiesOnly yes`;
- set `BatchMode yes`;
- kept host key checking non-interactive with `accept-new`;
- set the SSH client config mode to `0600`.

No SGP `authorized_keys` change was required. No SGP service restart was
performed. No application runtime config was changed.

## Validation

Post-change validation:

- Japan default SSH to `45.76.158.201` succeeded.
- Japan SSH to alias `gccgw-sgp-data-plane` succeeded.
- Japan SSH client selected the SGP apply identity by config.
- Japan SSH client had `IdentitiesOnly yes`.
- Japan redacted `gccgw node policy-check --json` remained ok:
  - ok: true
  - nodeCount: 6
  - blockers: 0
  - warnings: 0
  - nextAction: `stable_pool_policy_ok`
  - mutation: false
  - productionAuthority: false
  - redacted: true
- Public boundary checks remained healthy:
  - `https://portal.globalcirclecat.cloud/` returned HTTP 200.
  - `https://sub.globalcirclecat.cloud/api/health` returned HTTP 200.
  - `https://sub.globalcirclecat.cloud/api/admin/platform` returned HTTP 404.
  - `https://portal.globalcirclecat.icu/` returned HTTP 200.
  - `https://portal.globalcirclecat.icu/api/health` returned HTTP 200.
  - `https://portal.globalcirclecat.icu/api/admin/platform` returned HTTP 404.
- SGP services remained active:
  - `proxy-gateway-candidate.service`
  - `xray-vless-reality.service`
  - `hysteria2.service`
  - `mihomo-tuic.service`
- SGP listener inventory still included:
  - TCP 8443
  - UDP 10443
  - UDP 443
  - loopback-only TCP 26080 stats

## Rollback

Rollback for this targeted fix:

1. On Japan, remove `/root/.ssh/config` if it was created only for this gate, or
   restore the backed-up config if a prior config exists.
2. Re-run Japan-to-SGP SSH check and confirm it fails only because the apply
   identity was intentionally removed.
3. Confirm public portal/sub/Admin boundaries remain unchanged.

## Decision

The specific Gate 1 blocker is resolved:

- Japan can now reach SGP through the configured apply identity.
- SGP is still not fully closed because Gate 2 clean Japan control-plane
  artifact promotion and Gate 3 protected SGP data-plane apply have not been
  executed by this record.

Next safe gate:

- prepare Gate 2 if the goal is to promote the current reviewed GitHub source
  into Japan through a clean artifact; or
- prepare Gate 3 only if the existing Japan control-plane runtime is accepted
  for the next protected SGP data-plane apply.
