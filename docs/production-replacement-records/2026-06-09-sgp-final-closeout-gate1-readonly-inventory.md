# SGP Final Closeout Gate 1 Read-Only Inventory

Date: 2026-06-09, Asia/Shanghai.

Risk tier: A read-only production inventory.

Target:

- Vultr Japan control plane: `45.76.222.52`
- Vultr Singapore data plane: `45.76.158.201`

This record contains only redacted operational facts. It does not contain raw
environment values, raw runtime config, raw logs, SQLite rows, account
credentials, subscription URLs, tokens, passwords, private keys, or customer
data.

## Scope Executed

Allowed and executed:

- verified Git/worktree orientation before production observation;
- verified public portal/sub/Admin boundaries;
- verified direct operator SSH to Japan and SGP;
- verified Vultr instance status through CLI inventory;
- inspected current release ids, service status, loopback-only boundaries, and
  listener presence;
- ran redacted `gccgw node policy-check --json` on the Japan control-plane
  current release;
- checked Japan protected handoff queue count without reading handoff content;
- checked whether Japan can SSH to SGP for future remote data-plane apply.

Not executed:

- no artifact upload;
- no service restart;
- no runtime config mutation;
- no DNS, Nginx, provider firewall, or systemd mutation;
- no database mutation or SQLite row dump;
- no live order creation;
- no raw subscription or credential output.

## Results

### Source And Worktree

- Local branch: `feat/install-config-wizard`.
- Local worktree was clean before inventory.
- Current repo context points to the SGP final closeout gate and production
  artifact boundary requirements.

### Public Boundary

Observed:

- `https://portal.globalcirclecat.cloud/` returned HTTP 200.
- `https://sub.globalcirclecat.cloud/api/health` returned HTTP 200.
- `https://sub.globalcirclecat.cloud/api/admin/platform` returned HTTP 404.
- `https://portal.globalcirclecat.icu/` returned HTTP 200.
- `https://portal.globalcirclecat.icu/api/health` returned HTTP 200.
- `https://portal.globalcirclecat.icu/api/admin/platform` returned HTTP 404.

Interpretation:

- Public portal and health boundaries are reachable.
- Public Admin remains blocked on checked public paths.

### Vultr Inventory

Observed through Vultr CLI inventory:

- Japan control plane instance label: `gccgw-vultr-candidate`.
- Japan region: `nrt`.
- Japan status: active/running.
- SGP instance label: `gccgw-sgp-small-portal-20260608-002`.
- SGP region: `sgp`.
- SGP status: active/running.

### Japan Control Plane

Observed through read-only SSH:

- Current release: `vultr-order-response-channel-hotfix-20260608-001`.
- `proxy-gateway-candidate.service`: active.
- Local `tcp3456` listener: `127.0.0.1:3456`.
- Local health endpoint returned HTTP 200.
- Local Admin route required authentication.
- Protected release directory exists.
- General backup directory exists.
- Redacted `gccgw node policy-check --json`:
  - ok: true
  - nodeCount: 6
  - blockers: 0
  - warnings: 0
  - nextAction: `stable_pool_policy_ok`
  - mutation: false
  - productionAuthority: false
  - redacted: true
- Protected data-plane handoff queue JSON file count: 0.

### Singapore Data Plane

Observed through read-only SSH:

- Current release: `sgp-hy2-replacement-20260608-001`.
- `proxy-gateway-candidate.service`: active.
- `xray-vless-reality.service`: loaded/active/running.
- `hysteria2.service`: loaded/active/running.
- `mihomo-tuic.service`: loaded/active/running.
- Xray, Hysteria2, and Mihomo/TUIC restart counts were 0 at inspection time.
- Listener inventory found:
  - TCP 443
  - TCP 8443
  - UDP 10443
  - UDP 443
  - TCP `127.0.0.1:26080` for loopback-only stats
- Protected runtime paths exist for Xray, Hysteria2, Mihomo, and application
  protected material.
- General backup directory exists.

Interpretation:

- SGP runtime services and expected listener families are present.
- Hysteria2 stats surface is loopback-only in the checked listener inventory.

## Blocker

Japan to SGP SSH failed during this Gate 1 inventory.

This is a blocker for the final production closeout because Gate 3 requires the
Japan control plane to apply or dispatch reviewed SGP handoff material through a
restricted data-plane apply path. Direct operator SSH from the local machine to
SGP works, but that does not prove the Japan-to-SGP remote apply path.

## Decision

SGP is not fully closed yet.

Safe current statement:

- SGP services are running and public boundaries look healthy in this
  read-only inventory.
- The Japan control-plane policy check sees six nodes and no policy blockers.
- The remote data-plane handoff/apply path is not ready because Japan cannot
  SSH to SGP in the checked route.

## Next Gate

Before Gate 3 can execute, prepare a reviewed fix for the restricted
Japan-to-SGP apply identity. That fix is production-impacting and must be a
separate Risk A gate because it changes SSH/apply capability between production
hosts.

Gate 2 also remains required before final closeout if the intent is to promote
the current GitHub source into Japan through a clean artifact.
