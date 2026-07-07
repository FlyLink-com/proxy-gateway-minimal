# Admin Protected Preview Production Deploy Gate

Date: 2026-06-30 America/Los_Angeles / 2026-07-01 UTC.

Risk: A production deployment gate.

## Scope

This gate prepares a production deployment decision for the protected Admin
preview. It does not itself authorize upload, Nginx change/reload, systemd
restart, DNS change, firewall mutation, SQLite migration, payment callback,
public Admin exposure, token rotation, or customer-data access.

No secrets, tokens, subscription URLs, credentials, raw environment values, raw
runtime config, SQLite rows, raw logs, or customer data are recorded here.

## Current Local Artifact

| Field | Value |
| --- | --- |
| Artifact label | `admin-preview-20260701-001` |
| Archive | `.codex-artifacts/admin-preview-20260701-001/globalcircle-admin-preview-20260701-001.zip` |
| Archive SHA-256 | `BDF614926E12207248587F601460C54DC35624B2D5EDC2EA6D4FB0DA0180659E` |
| Frozen static path | `.codex-artifacts/admin-preview-20260701-001/stage/admin-dist` |
| Manifest | `.codex-artifacts/admin-preview-20260701-001/manifest.json` |
| Source branch | `codex/admin-figma-mirror-visual-qa` |
| Source worktree | dirty candidate worktree |

Important boundary:

- The frozen Admin static artifact is usable for protected preview testing.
- The source worktree is still broad and dirty, so this is not a clean release
  promotion.
- The public-site Vercel/Wrangler lanes publish `admin/dist-site`, not this
  protected Admin artifact.

## Current Remote Inventory

Target: `vul1` / `gccgw-vultr-candidate`.

| Check | Result |
| --- | --- |
| Remote user | `root` |
| Service | `proxy-gateway-candidate.service` active/running |
| Nginx | active, config test successful |
| Service working directory | `/opt/proxy-gateway-minimal-candidate/current` |
| Current release | `/opt/proxy-gateway-minimal-candidate/releases/japan-sgp-vless-host-unify-20260622-001` |
| App listener | `127.0.0.1:3456` only |
| Public listeners | Nginx on `0.0.0.0:80` and `0.0.0.0:443` |
| Remote Admin static in current release | missing `admin/dist/index.html` |
| Remote portal/static build in current release | missing `admin/dist-portal/index.html` and `admin/dist-site/index.html` |
| Disk space | about 146 GiB available on `/` |

Recent rollback release candidates:

- `sgp-protocol-tuning-20260622-001`
- `japan-edge-agent-receipt-desiredstate-hotfix-20260616-001`
- `japan-render-proof-config-alias-hotfix-20260614-001`
- `control-plane-node-registration-closeout-20260614-001`

## Current Nginx Boundary

Read-only Nginx summary:

- `portal.globalcirclecat.cloud` currently returns `410`.
- `portal.gccwebos.com` serves the portal route and proxies only selected
  portal/API health paths.
- `globalcirclecat.cloud`, `sub.globalcirclecat.cloud`, and `sub.gccwebos.com`
  keep public root/static paths blocked and proxy only selected subscription,
  portal, and health paths.
- Public `^~ /api/admin/` is explicitly `404`.
- No active Admin static route was found.
- No active `5176`, `5177`, or `5187` Nginx route was found.

This confirms the current safe public posture: public Admin remains blocked.

## Deployment Decision

The only deployable production step that fits the current safety boundary is
remote artifact staging without public exposure:

1. Upload the frozen Admin preview archive to a new remote staging directory:
   `/opt/proxy-gateway-minimal-candidate/admin-preview/releases/admin-preview-20260701-001`.
2. Verify the archive SHA-256 on the remote host.
3. Extract into that staging directory.
4. Verify `index.html` and the six frozen static files exist with expected
   hashes.
5. Do not change `/opt/proxy-gateway-minimal-candidate/current`.
6. Do not change Nginx, DNS, systemd, firewall, or provider firewall.
7. Do not expose `admin.globalcirclecat.cloud`.

This is a production-host artifact staging gate, not a public Admin launch.

## Blocked Public Admin Launch

A public or hostname-based Admin preview remains blocked in this gate because:

- the current Nginx config has no Admin static route;
- public `/api/admin/` is intentionally blocked with `404`;
- `admin.globalcirclecat.cloud` is not currently a usable protected preview
  endpoint in the recorded TLS/routing posture;
- one-account Google Authenticator/TOTP operator login is not yet a completed
  Admin production auth gate;
- exposing Admin before the auth/IP allowlist gate would violate the protected
  Admin boundary.

## Validation Plan

Pre-mutation validation:

```powershell
git diff --check origin/master...HEAD
node --test server/tests/local-admin-bridge.test.mjs
```

Post-staging validation:

```text
remote archive SHA-256 matches BDF614926E12207248587F601460C54DC35624B2D5EDC2EA6D4FB0DA0180659E
remote staged index.html exists
remote staged file count is 6
current symlink unchanged
proxy-gateway-candidate.service still active
nginx still active and nginx -t successful
public /api/admin remains blocked
public 3456/5176/5177/5187 remain unavailable
```

## Rollback Plan

Because the proposed mutation is staging-only:

1. Remove the staged directory
   `/opt/proxy-gateway-minimal-candidate/admin-preview/releases/admin-preview-20260701-001`.
2. Remove the uploaded archive if stored outside that directory.
3. Confirm `/opt/proxy-gateway-minimal-candidate/current` still points to
   `japan-sgp-vless-host-unify-20260622-001`.
4. Confirm Nginx and `proxy-gateway-candidate.service` remain active.

No service restart should be required for rollback because the proposed staging
step does not touch the running release, service unit, Nginx, DNS, or firewall.

## Required Operator Approval

Short confirmations are not enough for mutation.

Exact approval phrase required before remote staging:

```text
批准执行 Admin protected preview production artifact staging：target=vul1/gccgw-vultr-candidate；artifact=admin-preview-20260701-001 sha256=BDF614926E12207248587F601460C54DC35624B2D5EDC2EA6D4FB0DA0180659E；scope=upload and extract only to /opt/proxy-gateway-minimal-candidate/admin-preview/releases/admin-preview-20260701-001, no current symlink change, no Nginx, no systemd, no DNS, no firewall, no public Admin；rollback=remove staged directory only.
```

## Execution Result

The exact approval phrase above was provided by the operator.

Executed scope:

- created remote staging directory:
  `/opt/proxy-gateway-minimal-candidate/admin-preview/releases/admin-preview-20260701-001`;
- uploaded
  `.codex-artifacts/admin-preview-20260701-001/globalcircle-admin-preview-20260701-001.zip`
  into that staging directory;
- verified remote archive SHA-256 before extraction;
- extracted only into the approved staging directory;
- verified the six frozen Admin static files and their per-file SHA-256 values.

No out-of-scope action was performed:

- no `/opt/proxy-gateway-minimal-candidate/current` symlink change;
- no Nginx config change or reload;
- no systemd service restart;
- no DNS change;
- no firewall or provider firewall change;
- no public Admin exposure;
- no SQLite migration;
- no token rotation;
- no payment callback or payment-provider action.

Remote staging validation:

| Check | Result |
| --- | --- |
| Archive SHA-256 | `BDF614926E12207248587F601460C54DC35624B2D5EDC2EA6D4FB0DA0180659E` matched |
| Staged static file count | 6 |
| `admin-dist/index.html` | present |
| `admin-dist/favicon.svg` | present |
| `admin-dist/assets/browser-aX09LNhx.js` | hash matched `BD15B26FD18B675DE75023E96E09EAA0540859D87489828B65ADA43E3D09D482` |
| `admin-dist/assets/index-D0Rx35Pw.css` | hash matched `D5CE333103F214F0324FF1DC293114DB8A81E3CDC0F3FF124354FDB9FB387AE3` |
| `admin-dist/assets/index-D4WdWNAR.js` | hash matched `0095B2081F27243C24E1CFDB67B0FD873B1959137D15799F3F35ECE55DD01AB3` |
| `admin-dist/assets/user-portal-route-DcvkV_Dc.js` | hash matched `0820D7BA745159DD7534EB6F19C6154D0D63E63244C00844B46EB555C5599FA8` |
| `admin-dist/favicon.svg` | hash matched `73C41817D9A2D51AF2FC3EFC35541452A89A2A9E89132E6CD3EF9284BEF055B4` |
| `admin-dist/index.html` | hash matched `E7CF008FC626E11376301F8F9258F44E1F40EA19FB2BD66370185FCBB13BB544` |

Post-staging runtime validation:

| Check | Result |
| --- | --- |
| Current release symlink | still `/opt/proxy-gateway-minimal-candidate/releases/japan-sgp-vless-host-unify-20260622-001` |
| `proxy-gateway-candidate.service` | active; `MainPID=282029`; `ActiveEnterTimestamp=Mon 2026-06-22 09:39:18 UTC` |
| `nginx` | active; `nginx -t` successful |
| Public Admin API on apex | `https://globalcirclecat.cloud/api/admin/subscriptions` returned 404 |
| Public Admin API on subdomain | `https://sub.globalcirclecat.cloud/api/admin/subscriptions` returned 404 |
| Public Admin path on apex | `https://globalcirclecat.cloud/admin` returned 404 |
| Public Admin path on subdomain | `https://sub.globalcirclecat.cloud/admin` returned 404 |
| Public health on apex | `https://globalcirclecat.cloud/api/health` returned 200 |
| Public health on subdomain | `https://sub.globalcirclecat.cloud/api/health` returned 200 |
| Public TCP 3456 | not reachable |
| Public TCP 5176 | not reachable |
| Public TCP 5177 | not reachable |
| Public TCP 5187 | not reachable |

Gate result:

- Production artifact staging completed.
- Public Admin launch remains blocked.
- The staged artifact is available on the production host only as a remote
  staging payload; it is not served by Nginx and is not part of the running
  release.
