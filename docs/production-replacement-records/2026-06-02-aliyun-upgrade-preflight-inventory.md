# Aliyun Upgrade Preflight Inventory

Date: 2026-06-02, Asia/Shanghai.

## Status

```text
Type: Risk A read-only execution record
Gate: Aliyun upgrade preflight inventory
Execution state: passed with upgrade-gate blockers
Production impact: none
Aliyun impact: read-only inventory only
AWS impact: none
DNS impact: none
Traffic impact: none
```

## Approval

Exact operator approval phrase received:

```text
Approve Aliyun read-only upgrade preflight inventory. Allow inspecting the Aliyun live server release posture, service status, Nginx status, safe file hashes, listener summary, SQLite integrity metadata, backup presence metadata, and public/private boundary health for upgrade planning only. No .env value copy, no SQLite row dump or copy, no logs copy, no handoff copy, no token or subscription URL output, no customer data, no file mutation, no service restart, no Nginx reload, no DNS change, no firewall change, no deploy, and rollback is not required because no mutation is allowed.
```

## Scope

Allowed and performed:

```text
inspect Aliyun SWAS instance metadata
confirm Cloud Assistant availability
inspect safe host identity and toolchain metadata
inspect service status with systemctl show safe properties only
inspect release/current symlink posture
inspect safe file hashes
inspect Nginx syntax status
inspect listener summary
inspect SQLite file presence, sizes, and integrity_check metadata only
inspect backup file names, sizes, and timestamps only
check private and public boundary HTTP status codes
```

Not authorized and not performed:

```text
no .env value copy
no SQLite row dump or copy
no raw logs copy
no handoff copy
no token or subscription URL output
no customer data
no file mutation
no service restart
no Nginx reload
no DNS change
no firewall change
no deploy
no tenant/artifact mutation
no subscription-output mutation
```

Rollback was not required because no mutation was approved or performed.

## Local Candidate Context

```text
operator branch: feat/install-config-wizard
candidate commit: b781f3dc818ac8da335d191f4784e4f3970398fc
candidate short label: b781f3d
candidate local status before Aliyun inventory: dirty docs-only README.md and docs/README.md changes
origin/master: 8cd649e
candidate commits beyond origin/master:
  b781f3d Force shell scripts to LF
  f1f5959 Converge install config to env surface
  3b2fb25 docs: design local deployment console
```

Previous live release commit recorded in the 2026-06-01 import inventory:

```text
da33de295cb02d1035419af59b1c52e9a3a51ce3
```

Local Git confirms that the previous live release commit is an ancestor of the
candidate commit. The upgrade is a forward upgrade, not a rollback. The working
tree must be cleaned or the candidate artifact must be built explicitly from
`b781f3d`; the uncommitted README/docs changes must not be included in the
production upgrade package unless separately approved.

## Local Dry-Run Evidence

No mutation was performed.

```text
gccgw install plan: passed
gccgw install configure --dry-run --domain https://sub.globalcirclecat.com --install-dir /opt/proxy-gateway-minimal-candidate --management-source 203.0.113.10/32 --json: ok true
gccgw package inspect deployments/production-template --json: ok true
gccgw package import deployments/production-template --dry-run --json: ok true
```

The management source CIDR above is a documentation placeholder. A real Aliyun
upgrade gate must replace it with the approved operator management source.

## Public Boundary Preflight

Operator-device public checks:

```text
DoH A sub.globalcirclecat.com: 47.251.178.125
https://sub.globalcirclecat.com/api/health: 200
https://sub.globalcirclecat.com/api/admin/subscriptions: 404
https://sub.globalcirclecat.com/sub/clash.yaml without token: 401
https://sub.globalcirclecat.com/sub/a/preproduction-nonexistent.yaml: 404
https://sub.globalcirclecat.com/: 200 text/html
```

The root path now serves HTML. This is current public-site behavior and is not
a blocker by itself, but it differs from older promotion records that expected
root to be 404.

## Aliyun Cloud Metadata

Safe cloud-side read-only facts:

```text
instance id: 3e9253d3fb044463b876edacf6af8784
public IP: 47.251.178.125
status: Running
OS image: Ubuntu 24.04
resource shape: 2 CPU / 2 GiB / 40 GiB ESSD
Cloud Assistant: available
```

## Host And Service Inventory

Safe host facts:

```text
hostname: iZrj92lvcxgfwxsyrupgfkZ
OS: Ubuntu 24.04.2 LTS
kernel: Linux 6.8.0-63-generic x86_64
Node.js: v22.22.2
npm: 10.9.7
```

Systemd safe properties:

```text
proxy-gateway-candidate: loaded / active / running / enabled / result success / NRestarts 0
nginx: loaded / active / running / enabled / result success / NRestarts 0
certbot.timer: loaded / active / waiting / enabled / result success
ufw: loaded / active / exited / enabled / result success
aegis.service: loaded / failed / failed / enabled / result signal
```

`aegis.service` remains failed. This is a known host-maintenance side effect
from earlier records and is not repaired by this inventory.

## Release Posture

```text
base: /opt/proxy-gateway-minimal-candidate
current: /opt/proxy-gateway-minimal-candidate/releases/da33de295cb0
current label: da33de295cb0
recent release labels:
  bfe6f89b723a
  da33de295cb0
```

The live release is a packaged release directory, not a Git checkout.

Top-level safe shape includes:

```text
admin
agent
bin
config
docs
ops
project-state
public
scripts
server
README.md
README_EN.md
AGENTS.md
candidate-start.mjs
daemon.mjs
index.mjs
package.json
package-lock.json
```

## Safe Hash Comparison

Live current release safe hashes:

```text
package.json: d494d9e8ef918e5bac266d6c0e87bf18943f1c0d255b46f420dbea968035a451
package-lock.json: b22c4249623e15bdb8219b8cf6c39fdf617a067e29ee05a65a5c58ce224b23ff
.env.example: 64cb9a4b5e409f66838fc21db149832e715188b545a5e1b7e48d62eed56cb722
.gitattributes: missing
admin/package.json: 805588ee8ac5a04f3f1f65477208410badf727be078433a9a717377f88dd0b3a
admin/package-lock.json: cc68d05a800ab6aabe4a1affc6590a56fda6b3369018464cba0e4edb11f145de
bin/gccgw.mjs: missing
server/services/cli/router.mjs: missing
server/tests/cli-router.test.mjs: missing
deployments/production-template/package-manifest.json: missing
deployments/production-template/env.required.json: missing
ops/edge-node/bootstrap.sh: 4cdf469a0ae5eee66af5e2154a39fe3445c75563186d95b7682b7cdc397fb1a7
ops/edge-node/templates/env.example: 72faf5398fca94637488f332fade37502592d044167d48435efe1ef8851885a1
ops/systemd/proxy-gateway-console.service: 2d01b747ab9b78efbd6d5d7e2dc05720bce0cfbb79254ed5e38f9eb59411adf7
ops/systemd/proxy-gateway-ss.service: 9a87c0c29810c87ada47dbb578b7e33b3900b39ebd340f7c964a75b3fe85a2c1
ops/nginx/proxy-gateway-public.conf: f7885637a1ea30021d3b56ba004678cc0f28d1ce894bcea326e3bf3c7f48fa9c
```

Candidate `b781f3d` archive safe hashes:

```text
package.json: d5cd127949778acac11bac9db65ba1b396a55f4c416c1b7c4657996e64efd4f2
package-lock.json: b22c4249623e15bdb8219b8cf6c39fdf617a067e29ee05a65a5c58ce224b23ff
.env.example: 579cd2475ce1371e6d315415233b0a59fa41b4b843faa3a58486593eb61698fd
.gitattributes: 1df84947e0d933c53fe759123bcf4074fcb674edacd7d3d6de0958311c1e7d4b
admin/package.json: 69445942546658e3bdfe735baf6f1ace835779712172c40a0cd24d8f28accc3b
admin/package-lock.json: cc68d05a800ab6aabe4a1affc6590a56fda6b3369018464cba0e4edb11f145de
bin/gccgw.mjs: 5aa83f87c1ba4f4b7fc3ea2dec25606dbd8a0c5a578fe24a16275caca25b3949
server/services/cli/router.mjs: 4b95de2eac39053024d8c061a60a101c1423c5ac98722fbfc89e299b6feefd5a
server/tests/cli-router.test.mjs: 99760d5a2297d0f9bc2abbb604fade8309a0bbc3a37b73d455b58b827a7f7cb8
deployments/production-template/package-manifest.json: 077e0a23c4285f13c2bb9dbdfb7595c6e444020395250c5876048e3844b92188
deployments/production-template/env.required.json: b7a6328c3051baf24ccb44b1095bb3fe2eb59e16e96e1f17dd919b33651deb2d
ops/edge-node/bootstrap.sh: 6ca90007bba0effce47ff03a4e7351d77ac434dc77785c5963bfd105de2a19df
ops/edge-node/templates/env.example: 7f0ca29ea32c907ee139c992051dbc42747648b9d8a64be2f9e0d4d76cc46c6b
ops/systemd/proxy-gateway-console.service: 2d01b747ab9b78efbd6d5d7e2dc05720bce0cfbb79254ed5e38f9eb59411adf7
ops/systemd/proxy-gateway-ss.service: 9a87c0c29810c87ada47dbb578b7e33b3900b39ebd340f7c964a75b3fe85a2c1
ops/nginx/proxy-gateway-public.conf: f7885637a1ea30021d3b56ba004678cc0f28d1ce894bcea326e3bf3c7f48fa9c
```

Interpretation:

```text
service and Nginx templates are unchanged in the candidate archive
package-lock and admin package-lock are unchanged in the candidate archive
candidate adds gccgw/package tooling that is absent from the live current release
candidate updates package metadata, env templates, edge bootstrap, and production-template files
candidate archive keeps ops/edge-node/bootstrap.sh LF through .gitattributes
```

## Nginx, Listeners, And Boundaries

Nginx:

```text
nginx -t: ok
nginx service: active
```

Listener summary:

```text
tcp 0.0.0.0:22
tcp 0.0.0.0:80
tcp 0.0.0.0:443
tcp 127.0.0.1:18080
tcp 127.0.0.1:3456
tcp 127.0.0.1:35435
tcp 127.0.0.53%lo:53
tcp 127.0.0.54:53
tcp [::]:22
udp 0.0.0.0:51820
udp [::]:51820
udp 127.0.0.1:323
udp [::1]:323
udp 127.0.0.53%lo:53
udp 127.0.0.54:53
udp 172.18.54.13%eth0:68
```

The `127.0.0.1:35435` listener needs explanation in the next read-only or
execution gate before any mutation. No public listener was observed on 3456,
18080, 1080, 18180, or 18388.

Private boundary health:

```text
127.0.0.1:3456 /api/health: 200
127.0.0.1:3456 /api/admin/subscriptions without auth: 401
127.0.0.1:3456 /sub/clash.yaml without token: 401
127.0.0.1:18080 /api/health: 200
127.0.0.1:18080 /api/admin/subscriptions: 404
127.0.0.1:18080 /sub/clash.yaml: 404
127.0.0.1 /api/health: 200
127.0.0.1 /api/admin/subscriptions: 404
127.0.0.1 /sub/clash.yaml without token: 401
```

The loopback-only candidate Nginx on `18080` returns 404 for
`/sub/clash.yaml`, while public Nginx on `80/443` returns 401 for the same
credential-required endpoint. Treat this as current boundary shape to preserve
or intentionally change only under a later approval.

## SQLite And Backup Metadata

SQLite files observed under the candidate tree:

```text
<candidate>/state/subscriptions.sqlite size=73728 integrity=ok
<candidate>/state/proxy-gateway.sqlite size=0 integrity=ok
```

Candidate backup SQLite files:

```text
subscriptions-before-runtime-refresh-20260527T083223Z-da33de295cb0.sqlite size=73728 integrity=ok
subscriptions-before-batch_20260528_preproduction_canary_001-20260528T122140Z.sqlite size=73728 integrity=ok
subscriptions-before-tuic-access-20260528T104754928Z.sqlite size=73728 integrity=ok
subscriptions-before-tuic-activation-20260528T112400Z.sqlite size=73728 integrity=ok
subscriptions-before-tuic-binding-20260528T112503Z.sqlite size=73728 integrity=ok
```

Backup presence metadata also includes non-SQLite config backup filenames:

```text
env-before-tuic-activation-20260528T112400Z
proxy-servers-before-tuic-activation-20260528T112400Z.json
```

Backup contents were not copied or printed.

## Upgrade Gate Assessment

Ready for next approval gate:

```text
public boundary currently healthy
private app and Nginx health currently healthy
candidate is a forward upgrade from recorded live release ancestry
local HP ci-full for b781f3d passed before this inventory
local install/package dry-runs passed
rollback candidate release da33de295cb0 remains present
```

Blockers before mutation:

```text
working tree contains uncommitted README.md and docs/README.md changes
target artifact must be built from exact commit b781f3d, not from dirty working tree
real management-source CIDR must replace the documentation placeholder
127.0.0.1:35435 listener should be identified or accepted as non-blocking
aegis.service remains failed and should be explicitly accepted as out of scope or repaired by a separate gate
```

Recommended next gate:

```text
Risk A mutation gate for candidate runtime upgrade to b781f3d.
Allowed mutation should be limited to archive transfer into a new release
directory, npm ci/build in that release, current symlink switch, candidate
service restart, post-upgrade validation, and rollback by switching current
back to da33de295cb0 and restarting proxy-gateway-candidate.
```

## Not Performed

```text
DNS change: not performed
provider firewall mutation: not performed
UFW mutation: not performed
Nginx config mutation: not performed
Nginx reload: not performed
proxy-gateway restart: not performed
certbot mutation: not performed
public Admin exposure: not performed
edge traffic activation: not performed
AWS mutation: not performed
state copy: not performed
SQLite restore/import/copy/row dump: not performed
tenant/artifact mutation: not performed
subscription output mutation: not performed
package reinstall on live release: not performed
host reboot: not performed
secret/token/subscription URL/customer data output: not performed
```
