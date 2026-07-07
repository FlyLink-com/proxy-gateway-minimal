# Admin Protected Preview Read-Only Inventory

Date: 2026-06-30 America/Los_Angeles / 2026-07-01 UTC.

Risk: A read-only inventory.

## Scope

This record captures a read-only preflight for a possible half-finished Admin
protected preview. It does not authorize deployment, upload, DNS change, Nginx
change/reload, systemd restart, firewall mutation, SQLite migration, payment,
public Admin exposure, token rotation, or customer-data access.

No secrets, tokens, subscription URLs, credentials, raw environment values, raw
runtime config, logs, SQLite rows, or customer data were printed or copied.

## Local Candidate State

The local checkout is a broad in-progress Admin/Figma/user-portal candidate, not
a frozen production release boundary.

Observed local validation:

| Command | Result |
| --- | --- |
| `git diff --check origin/master...HEAD` | Passed |
| `npm run admin:test` | Passed: 36 files, 339 tests |
| `npm run admin:build` | Passed, with the existing large-chunk warning |
| `npm run admin:portal:build` | Passed |
| `npm run admin:portal:verify` | Passed |
| `npm run admin:site:build` | Passed |
| `npm run admin:site:verify` | Passed |
| `npm test` | Passed: 836 tests |
| `npm run project-state:check` | Passed |

Current deploy config boundary:

- `vercel.json` builds and publishes `admin/dist-site`.
- `wrangler.jsonc` builds and publishes `admin/dist-site`.
- These existing lanes are public-site lanes, not protected Admin preview lanes.
- Publishing through either lane would not publish the Admin candidate UI.

## Frozen Admin Preview Artifact

The protected Admin preview candidate was frozen locally as a static artifact.

| Field | Value |
| --- | --- |
| Artifact label | `admin-preview-20260701-001` |
| Source branch | `codex/admin-figma-mirror-visual-qa` |
| Source HEAD | `af6759f5749ed8cee9eb34713cf80e5b685872de` |
| Source worktree | dirty worktree candidate |
| Build input | `admin/dist` |
| Local artifact directory | `.codex-artifacts/admin-preview-20260701-001` |
| Local frozen static path | `.codex-artifacts/admin-preview-20260701-001/stage/admin-dist` |
| Archive | `.codex-artifacts/admin-preview-20260701-001/globalcircle-admin-preview-20260701-001.zip` |
| Archive SHA-256 | `BDF614926E12207248587F601460C54DC35624B2D5EDC2EA6D4FB0DA0180659E` |
| Manifest | `.codex-artifacts/admin-preview-20260701-001/manifest.json` |
| Frozen file count | 6 |

Artifact verification:

- SHA-256 sidecar matched the computed archive hash.
- Frozen `index.html` exists under the staged Admin static path.
- The artifact manifest records per-file hashes for every frozen static file.
- No remote upload, Nginx change, systemd restart, DNS change, firewall change,
  SQLite migration, or public Admin exposure was performed.

## Protected Install Path Decision

Decision for this preview gate: use a local-only protected Admin preview path.

The preview should be served from the frozen local static directory through the
existing local Admin bridge:

```powershell
powershell -ExecutionPolicy Bypass -File ops\local-admin-bridge\start-admin-panel-local-proxy.ps1 -SshHost vul1 -AdminDist "D:\Projects\proxy-gateway-minimal\.codex-artifacts\admin-preview-20260701-001\stage\admin-dist"
```

Dry-run result:

| Field | Value |
| --- | --- |
| Local panel URL | `http://127.0.0.1:5177/` |
| Local API tunnel | `127.0.0.1:5176 -> vul1:127.0.0.1:3456` |
| SSH target | `root@vul1` |
| Admin dist | `D:\Projects\proxy-gateway-minimal\.codex-artifacts\admin-preview-20260701-001\stage\admin-dist` |
| Auth mode | one-time bootstrap plus HttpOnly SameSite session cookie |
| Direct route mode | `False` |

Rejected install paths for this gate:

- Do not upload this artifact into the current remote release directory.
- Do not add an Nginx public, private, or hostname route for Admin in this gate.
- Do not use Vercel or Wrangler for this preview because those lanes publish
  `admin/dist-site`, not the protected Admin console.
- Do not expose Admin through `admin.globalcirclecat.cloud` in its current
  TLS/routing posture.

## Local Protected Preview Start

The local-only protected Admin preview was started from the frozen artifact.

Start command:

```powershell
powershell -ExecutionPolicy Bypass -File ops\local-admin-bridge\start-admin-panel-local-proxy.ps1 -SshHost vul1 -AdminDist "D:\Projects\proxy-gateway-minimal\.codex-artifacts\admin-preview-20260701-001\stage\admin-dist"
```

Observed startup result:

| Check | Result |
| --- | --- |
| SSH tunnel listener | `127.0.0.1:5176`, owned by local `ssh` |
| Local Admin proxy listener | `127.0.0.1:5177`, owned by local `node` |
| Tunnel health | `GET http://127.0.0.1:5176/api/health` returned 200 |
| Unauthenticated local panel/status probe | 401, expected without local browser session cookie |
| Browser bootstrap | opened by the local start script |

Local bridge implementation note:

- During startup, the PowerShell bridge script exposed a Windows native-command
  quoting/newline issue while reading the remote console token through SSH.
- The first local script fix still allowed PowerShell/OpenSSH argument splitting
  to make the remote shell run `set` instead of the intended script, which
  returned shell variable output rather than the console token.
- The local script was fixed to base64-encode the remote read script and pipe it
  through `base64 -d | sh` on the remote host.
- The local proxy now trims the console token before constructing the upstream
  Authorization header.
- The token remained loaded only into the local proxy process environment and
  was not printed, copied into the browser, written into this record, or added
  to the repository.
- This fix changed only the local bridge script and did not mutate the remote
  host.
- The local preview was restarted after the fix.

Post-fix checks:

| Check | Result |
| --- | --- |
| Remote token read shape | one line, no invalid header characters observed |
| SSH tunnel listener | `127.0.0.1:5176`, owned by local `ssh` |
| Local Admin proxy listener | `127.0.0.1:5177`, owned by local `node` |
| Tunnel health | `GET http://127.0.0.1:5176/api/health` returned 200 |

Playwright CLI smoke test from a temporary local proxy on `127.0.0.1:5187`:

| Route | Result |
| --- | --- |
| `/#/admin/operations-overview` | loaded `GlobalCircle AI - Operator Console` |
| `/#/admin/accounts` | loaded `GlobalCircle AI - Operator Console` |
| `/#/admin/usage` | loaded `GlobalCircle AI - Operator Console` |
| `/#/admin/user-management` | loaded `GlobalCircle AI - Operator Console` |
| `/#/admin/order-management` | loaded `GlobalCircle AI - Operator Console` |
| `/#/admin/node-health` | loaded `GlobalCircle AI - Operator Console` |
| `/#/admin/node-bandwidth` | loaded `GlobalCircle AI - Operator Console` |
| `/#/admin/user-access-logs` | loaded `GlobalCircle AI - Operator Console` |
| `/#/admin/user-operation-logs` | loaded `GlobalCircle AI - Operator Console` |
| `/#/admin/node-logs` | loaded `GlobalCircle AI - Operator Console` |

Smoke evidence:

- Playwright console summary: 0 errors, 0 warnings.
- Playwright request summary: no failed dynamic requests reported.
- Temporary smoke proxy was stopped after the test.
- The main local preview on `127.0.0.1:5177` remained the active protected
  preview surface.

## Public Boundary Checks

DNS observed:

- `globalcirclecat.cloud`, `portal.globalcirclecat.cloud`, and
  `sub.globalcirclecat.cloud` resolve to the Vultr Japan lane.
- `admin.globalcirclecat.cloud` is a CNAME to the apex name, but its HTTPS
  certificate does not currently match that hostname.

External TCP checks from the local workstation:

| Port | Result |
| --- | --- |
| 22 | Not reachable |
| 80 | Reachable |
| 443 | Reachable |
| 3456 | Not reachable |
| 18080 | Not reachable |

External HTTPS checks:

| Surface | Result |
| --- | --- |
| Apex `/` | 404 |
| Apex `/api/health` | 200 |
| Apex `/api/admin/subscriptions` | 404 |
| Apex `/api/portal/access-requests/current` | 401 |
| Subdomain `/` | 404 |
| Subdomain `/api/health` | 200 |
| Subdomain `/api/admin/subscriptions` | 404 |
| Subdomain `/api/portal/access-requests/current` | 401 |
| Portal hostname paths | 410 |
| Admin hostname HTTPS | TLS hostname mismatch; with verification disabled, paths return 410 |

Interpretation:

- Public Admin remains blocked on the apex/subscription hostnames checked.
- No-session portal current-request remains rejected.
- Public 3456 and 18080 are not reachable from the local workstation.
- `admin.globalcirclecat.cloud` is not a usable protected preview entry in its
  current TLS/routing posture.

## Host-Internal Inventory Status

Host-internal inventory was not completed.

Attempted read-only SSH reachability to the Vultr Japan target timed out from
the local workstation. The HP validation host alias also timed out from the
local workstation, so HP could not be used as a second vantage point in this
gate.

Follow-up access-path checks after operator confirmation:

- local SSH config did not contain a current Vultr Japan alias;
- local `known_hosts` contains a previous host-key record for the Vultr Japan
  target, so this workstation has historical awareness of that host;
- no `VULTR`, `JAPAN`, `DEPLOY`, `SSH`, `PROXY_GATEWAY`, `GCC`, or `CONTROL`
  environment variable was available as a protected access hint;
- the local workstation is on the expected private LAN, but the `hp-server`
  alias was not reachable over SSH during this gate;
- domain-level TCP checks kept `443` reachable while `22`, `3456`, and `18080`
  were not reachable for the checked Vultr Japan hostnames;
- `/admin` and hash-routed Admin paths returned `404` on the apex and
  subscription hostnames.

SSH recovery:

- restored local SSH aliases:
  `vul1`, `vultr-japan`, `vultr-japan-control`, `sub-control-a`, and
  `globalcirclecat-cloud`;
- mapped those aliases to `45.76.222.52`, user `root`, and the existing
  operator key path;
- direct TCP/22 remained unavailable from the local workstation;
- using the local operator proxy through OpenSSH `ProxyCommand` restored SSH
  access;
- read-only `ssh vul1` returned host `gccgw-vultr-candidate` as `root`.

Host-internal read-only inventory after SSH recovery:

| Check | Result |
| --- | --- |
| Current release | `japan-sgp-vless-host-unify-20260622-001` |
| `proxy-gateway-candidate.service` | active |
| `nginx` | active |
| Nginx config test | ok |
| Service unit path | `/etc/systemd/system/proxy-gateway-candidate.service` |
| `tcp/3456` | `127.0.0.1:3456` only |
| `tcp/80` | public listener present |
| `tcp/443` | public listener present |
| Local `/api/health` | 200 |
| Local `/api/admin/subscriptions` without token | 401 |
| Local `/api/portal/access-requests/current` without session | 401 |
| Current release `admin/dist/index.html` | missing |
| Current release `admin/dist-portal/index.html` | missing |
| Current release `admin/dist-site/index.html` | missing |
| Release directories | 37 |
| Recent rollback candidates | `sgp-protocol-tuning-20260622-001`, `japan-edge-agent-receipt-desiredstate-hotfix-20260616-001`, `japan-render-proof-config-alias-hotfix-20260614-001`, `control-plane-node-registration-closeout-20260614-001` |

Not verified in this run:

- Nginx active config contents;
- protected environment key presence by key name;
- any remote static Admin preview install path.

## Gate Result

Do not deploy the Admin candidate to the remote host yet.

The local candidate builds and tests cleanly, and the public/host-internal
boundary checks are compatible with the intended "no public Admin" posture.
The protected Admin preview artifact is now frozen locally, and this gate
selects the local-only protected preview path above. The current remote release
still does not contain Admin, portal, or site static build artifacts under the
release directory, and this record does not authorize adding them.

Next required gate:

1. start the local-only Admin bridge from the frozen artifact if operator access
   testing is needed;
2. keep the preview bound to loopback-only local ports unless a later Risk A
   runbook approves a remote protected route;
3. inspect Nginx active config read-only before any future Nginx change;
4. obtain explicit operator approval naming target, artifact, scope,
   validation, and rollback before any remote mutation.
