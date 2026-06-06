# Aliyun Candidate Runtime Upgrade Rollback

Date: 2026-06-02, Asia/Shanghai.

## Status

```text
Risk: A
Process: exact-approved Aliyun candidate runtime upgrade to 3e1c9a79ec85
Expected PR count: 0 for production execution record; local docs remain uncommitted
Validation: upgrade attempted, failed active-service validation, rollback executed
Production/AWS impact: Aliyun candidate runtime only; no AWS mutation
```

## Approval

The operator approved upgrading the Aliyun candidate runtime to exact commit
`3e1c9a79ec852e3ca5a4f013a42e3aabf7c97185`, preserving existing `.env`,
SQLite, handoff, Nginx, systemd unit, firewall, DNS, provider firewall, and
public boundary configuration, switching only the `current` symlink, restarting
only `proxy-gateway-candidate.service`, and rolling back by switching
`current` back to `da33de295cb0` if validation failed.

The approval also accepted the pre-existing failed `aegis.service` state and
the pre-existing `127.0.0.1:35435` loopback listener as out-of-scope
observations for this gate.

## Preflight

```text
local HEAD: 3e1c9a79ec852e3ca5a4f013a42e3aabf7c97185
approved commit: 3e1c9a79ec852e3ca5a4f013a42e3aabf7c97185
dirty working tree excluded from archive: README.md only
current before switch: /opt/proxy-gateway-minimal-candidate/releases/da33de295cb0
target release: /opt/proxy-gateway-minimal-candidate/releases/3e1c9a79ec85
rollback release present: yes
systemd WorkingDirectory: /opt/proxy-gateway-minimal-candidate/current
systemd entry token: candidate-start.mjs
systemd EnvironmentFile: /opt/proxy-gateway-minimal-candidate/.env
base .env present: yes
current release .env present: no
proxy-gateway-candidate.service: active
nginx: active
```

No `.env` value, SQLite row, log content, handoff content, token,
subscription URL, credential, or customer data was copied or printed.

## Archive And Release Preparation

Local exact-commit archive:

```text
commit id in archive: 3e1c9a79ec852e3ca5a4f013a42e3aabf7c97185
archive bytes: 5130240
archive sha256: 3bfc9057c4bea46a068f9215f9152913492a28b3b12c52faa047c30f2383fed3
```

Remote archive:

```text
path: /tmp/proxy-gateway-3e1c9a79ec85.tar
bytes: 5130240
sha256: 3bfc9057c4bea46a068f9215f9152913492a28b3b12c52faa047c30f2383fed3
```

New release preparation:

```text
release_created: /opt/proxy-gateway-minimal-candidate/releases/3e1c9a79ec85
candidate-start.mjs present: yes
candidate-start.mjs sha256: 692a87a428dab1eafaa9916737a337365304ed32a3bfbc4547c293e8be4e9c4a
package.json sha256: 87c00c10fa603a2cd9f20c328e6dce085dac722e6c8991d4c5b2d5d3cbe29d4e
package-lock.json sha256: b22c4249623e15bdb8219b8cf6c39fdf617a067e29ee05a65a5c58ce224b23ff
npm ci: ok
npm audit result during npm ci: found 0 vulnerabilities
node_modules present: yes
```

## Switch Attempt And Rollback

The `current` symlink was switched from the rollback release to the new release
and only `proxy-gateway-candidate.service` was restarted.

```text
old_current: /opt/proxy-gateway-minimal-candidate/releases/da33de295cb0
current_after_switch: /opt/proxy-gateway-minimal-candidate/releases/3e1c9a79ec85
post_restart_active_validation: failed
rollback_action: switch current back to da33de295cb0 and restart proxy-gateway-candidate.service
rollback_result: service active on rollback release
```

No Nginx reload, systemd unit mutation, DNS change, firewall change, provider
firewall change, `.env` mutation, SQLite import/restore/copy, tenant/artifact
mutation, subscription output mutation, public Admin exposure, or edge traffic
activation was performed.

## Final State

```text
current_link: /opt/proxy-gateway-minimal-candidate/releases/da33de295cb0
proxy-gateway-candidate.service: active
nginx: active
public /api/health: 200
public /api/admin/subscriptions without auth: 404
public /sub/clash.yaml without token: 401
private 127.0.0.1:3456 /api/health: 200
private 127.0.0.1:3456 /api/admin/subscriptions without auth: 401
private 127.0.0.1:3456 /sub/clash.yaml without token: 401
subscriptions.sqlite integrity: ok
proxy-gateway.sqlite integrity: ok
aegis.service: failed, accepted as pre-existing out-of-scope observation
```

The new release directory remains prepared on disk, but it is not active.

## Safe Root-Cause Assessment

No service logs were copied or printed. Based on safe file/service metadata,
the likely blocker is the new runtime's subscription-control database default
path:

```text
service user: proxy-gateway-candidate
new release owner/mode: root:root 755
state directory owner/mode: proxy-gateway-candidate:proxy-gateway-candidate 700
base .env has SUBSCRIPTION_DB_PATH: yes
base .env has CONTROL_DB_PATH or SUBSCRIPTION_CONTROL_DB_PATH: no
new release .proxy-gateway directory after failed start: missing
```

The new code defaults the control database to a release-local
`.proxy-gateway/control.sqlite` path when no explicit control DB path is set.
Because the prepared release directory is owned by root, the service user is
not expected to be able to create that release-local runtime directory. Treat
this as a likely cause, not a log-confirmed diagnosis.

## Next Gate

The next upgrade attempt requires a separate Risk A approval that explicitly
allows adding a non-secret protected environment setting such as a control DB
path under the existing service-owned state directory and allows the new
runtime to initialize that control SQLite file. Do not retry the runtime switch
under the previous approval because it explicitly preserved `.env` and SQLite
state.
