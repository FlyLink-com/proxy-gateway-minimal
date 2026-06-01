# Aliyun Server Project Import Read-Only Inventory

Date: 2026-06-01, Asia/Shanghai.

Risk:

```text
A / read-only server project import inventory
```

Approval phrase:

```text
Approve read-only server project import inventory. Allow inspecting the live server project directory, service unit files, Nginx config files, release metadata, process working directories, and safe file hashes for redacted import planning only. No .env value copy, no SQLite copy, no logs copy, no handoff copy, no token or subscription URL output, no customer data, no file mutation, no service restart, no Nginx reload, no DNS change, no firewall change, no deploy, and rollback is not required because no mutation is allowed.
```

## Scope

Approved:

```text
inspect live server project directory shape
inspect service unit metadata and safe hashes
inspect Nginx config paths and safe hashes
inspect release/current symlink posture
inspect process working directories
inspect safe package/template file hashes
inspect loopback health summaries
```

Explicitly not approved and not performed:

```text
no .env value copy
no SQLite copy
no SQLite row dump
no raw log copy
no handoff copy
no token output
no subscription URL output
no customer data output
no file mutation
no service restart
no Nginx reload
no DNS change
no firewall change
no deploy
```

Rollback was not required because no mutation was approved or performed.

## Access Path

The target Aliyun SWAS instance remained:

```text
instance id: 3e9253d3fb044463b876edacf6af8784
public role: Aliyun subscription public boundary
```

Cloud Assistant status was checked with:

```text
aliyun swas-open describe-cloud-assistant-status --region us-west-1 --biz-region-id us-west-1 --instance-ids 3e9253d3fb044463b876edacf6af8784
```

Result:

```text
Cloud Assistant status: available
```

Cloud Assistant invocation handles retained for provider-side audit:

```text
output calibration: t-usw6mmalt0y12bk
base64 calibration: t-usw6mmatq6399mo
main redacted inventory: t-usw6mmb2x6pcq2o
candidate release posture: t-usw6mmbbrcd9ips
candidate realpath layout: t-usw6mmbdvmpmqdc
candidate clean hashes: t-usw6mmbmi9ujke8
candidate sensitive file counts: t-usw6mmbvbl76ups
```

One early multi-line command invocation completed with empty stdout and was not
used as evidence. Subsequent evidence used base64-wrapped read-only shell
commands so stdout capture could be verified. Raw command bodies and raw command
output are not recorded here.

## Host Summary

Safe host facts:

```text
hostname: iZrj92lvcxgfwxsyrupgfkZ
OS: Ubuntu 24.04.2 LTS
kernel: Linux 6.8.0-63-generic x86_64
Node.js: v22.22.2
npm: 10.9.7
git: 2.43.0
curl: 8.5.0
```

## Service Summary

Observed systemd state:

```text
proxy-gateway-candidate: active / running / enabled / result success / NRestarts 0
nginx: active / running / enabled / result success / NRestarts 0
certbot.timer: active / waiting / enabled
proxy-gateway-console: not-found / inactive
proxy-gateway-ss: not-found / inactive
```

Observed process working directories:

```text
proxy-gateway-candidate: /opt/proxy-gateway-minimal-candidate/releases/da33de295cb0
nginx: /
```

Service unit hashes:

```text
proxy-gateway-candidate.service: 514f01bfbaa36b4e1e64ebe01475367ec528e0218510624585f9bad19d739fe0
nginx.service: 6c759c229d4dacf65c1f98c1733646f8b979d3e75e13a98bfbcfe26f8a2f793c
```

The candidate unit contains `EnvironmentFile` and `Environment` directives, but
their values were not printed or copied.

## Release Layout

The live server runtime is not the historical `/opt/proxy-gateway-minimal`
directory. The active candidate release posture is:

```text
base: /opt/proxy-gateway-minimal-candidate
current: /opt/proxy-gateway-minimal-candidate/releases/da33de295cb0
release directories observed: 2
recent release labels observed: bfe6f89b723a, da33de295cb0
current release is a packaged directory, not a Git checkout
```

The label `da33de295cb0` resolves to a local Git commit prefix
`da33de295cb02d1035419af59b1c52e9a3a51ce3`, but the live release directory is
not itself a Git working tree.

Top-level release shape includes the expected current project areas:

```text
admin/
agent/
bin/
config/
docs/
ops/
project-state/
public/
scripts/
server/
README.md
README_EN.md
AGENTS.md
candidate-start.mjs
daemon.mjs
package.json
package-lock.json
```

The directory-shape inspection excluded `.env`, SQLite files, handoff
directories, logs, backups, `.git`, and `node_modules`.

Sensitive file count summary under the active release, excluding `node_modules`:

```text
SQLite file count: 0
.env file count: 0
handoff directory count: 0
logs directory count: 0
```

No `.env` values, SQLite data, logs, handoff files, subscription URLs, tokens, or
customer data were copied.

## Safe File Hash Comparison

Live server current release hashes:

```text
package.json: d494d9e8ef918e5bac266d6c0e87bf18943f1c0d255b46f420dbea968035a451
package-lock.json: b22c4249623e15bdb8219b8cf6c39fdf617a067e29ee05a65a5c58ce224b23ff
.env.example: 64cb9a4b5e409f66838fc21db149832e715188b545a5e1b7e48d62eed56cb722
.env.payment.example: missing
admin/package.json: 805588ee8ac5a04f3f1f65477208410badf727be078433a9a717377f88dd0b3a
admin/package-lock.json: cc68d05a800ab6aabe4a1affc6590a56fda6b3369018464cba0e4edb11f145de
ops/systemd/proxy-gateway-console.service: 2d01b747ab9b78efbd6d5d7e2dc05720bce0cfbb79254ed5e38f9eb59411adf7
ops/systemd/proxy-gateway-ss.service: 9a87c0c29810c87ada47dbb578b7e33b3900b39ebd340f7c964a75b3fe85a2c1
ops/nginx/proxy-gateway-public.conf: f7885637a1ea30021d3b56ba004678cc0f28d1ce894bcea326e3bf3c7f48fa9c
```

Local checkout hashes at the time of inventory:

```text
package.json: f3ba2453eb2a59c4096576a1ee962ef13724572e2c0b0fb83ad1608c5fd844fb
package-lock.json: b22c4249623e15bdb8219b8cf6c39fdf617a067e29ee05a65a5c58ce224b23ff
.env.example: d83c1360314aa6e1551d75aef287b800183d49eb8d49ba7d878156559f3ae245
.env.payment.example: 4248b4d9924f5dca87b8274f267b5f2eb89832b9343a4bc86262bccdd00b6edf
ops/systemd/proxy-gateway-console.service: 2d01b747ab9b78efbd6d5d7e2dc05720bce0cfbb79254ed5e38f9eb59411adf7
ops/systemd/proxy-gateway-ss.service: 9a87c0c29810c87ada47dbb578b7e33b3900b39ebd340f7c964a75b3fe85a2c1
ops/nginx/proxy-gateway-public.conf: f7885637a1ea30021d3b56ba004678cc0f28d1ce894bcea326e3bf3c7f48fa9c
```

Interpretation:

```text
package-lock.json matches local checkout
ops/systemd/proxy-gateway-console.service matches local checkout
ops/systemd/proxy-gateway-ss.service matches local checkout
ops/nginx/proxy-gateway-public.conf matches local checkout
package.json differs from current local checkout
.env.example differs from current local checkout
.env.payment.example exists locally but is absent from live current release
```

## Nginx And Listener Summary

Nginx:

```text
nginx -t: ok
request_uri references in /etc/nginx: 4
proxy_pass references in /etc/nginx: 18
```

Nginx config file hashes were collected without copying raw config contents.

Observed host listeners:

```text
0.0.0.0:22
0.0.0.0:80
0.0.0.0:443
127.0.0.1:3456
127.0.0.1:18080
```

No host-internal listener was observed on `51820` in this sample.

Loopback health:

```text
http://127.0.0.1/api/health -> 200
http://127.0.0.1:3456/api/health -> 200
http://127.0.0.1:18080/api/health -> 200
```

## Import Planning Assessment

Confirmed:

```text
live server is running packaged release layout under /opt/proxy-gateway-minimal-candidate
candidate release label is da33de295cb0
candidate app and Nginx are active and healthy on loopback
local repository already has matching service templates and Nginx public-boundary template
package-lock identity matches local checkout
```

Needs follow-up before any import or refactor claim:

```text
do not assume package.json matches current local checkout
do not assume .env.example matches current local checkout
do not treat the live release directory as a Git checkout
review why /etc/nginx now has 4 request_uri references before making log-redaction claims
do not copy raw live service units, raw Nginx configs, .env, SQLite, logs, handoff, or customer data
```

Recommended next B/C repo work:

```text
create a redacted server import manifest from this inventory only
compare local template hashes against live template hashes in a docs-only table
decide whether package.json drift is expected from later local changes or needs a release metadata note
keep all production mutations behind a separate exact A-tier approval
```

## Not Performed

```text
no file changed on the server
no service restarted
no Nginx reloaded
no DNS changed
no firewall changed
no deployment performed
no SQLite copied or queried for rows
no .env value copied
no raw logs copied
no handoff copied
no token, subscription URL, credential, private key, or customer data output
```
