# Aliyun Candidate Runtime Upgrade Blocked

Date: 2026-06-02, Asia/Shanghai.

## Status

```text
Risk: A
Process: exact-approved Aliyun candidate runtime upgrade
Expected PR count: 0 for production execution record; local docs remain uncommitted
Validation: partial preflight and blocked-state validation only
Production/AWS impact: Aliyun archive upload only; no release switch, no service restart, no Nginx reload, no DNS/firewall/provider mutation
```

## Approval

The operator approved upgrading the Aliyun candidate runtime to exact commit
`b781f3dc818ac8da335d191f4784e4f3970398fc`, preserving existing `.env`,
SQLite, handoff, Nginx, firewall, DNS, provider firewall, and public boundary
configuration, switching only the `current` symlink, and restarting only
`proxy-gateway-candidate.service` if the gate remained safe.

The approval also accepted the pre-existing failed `aegis.service` state and
the pre-existing `127.0.0.1:35435` loopback listener as out-of-scope
observations for this gate.

## Completed Before Block

Local exact-commit archive was created from
`b781f3dc818ac8da335d191f4784e4f3970398fc`.

```text
local archive commit id: b781f3dc818ac8da335d191f4784e4f3970398fc
local archive sha256: 17db12b6229910b88dbc16394c9e4a9a9527bbce3b95a0c233c79b583a7eb715
local archive bytes: 5109760
```

The archive was uploaded to Aliyun:

```text
remote archive path: /tmp/proxy-gateway-b781f3dc818a.tar
remote archive sha256: 17db12b6229910b88dbc16394c9e4a9a9527bbce3b95a0c233c79b583a7eb715
```

No `.env` value, SQLite row, log content, handoff content, token,
subscription URL, credential, or customer data was copied or printed.

## Blocker

The live systemd service uses this startup entry shape:

```text
WorkingDirectory: /opt/proxy-gateway-minimal-candidate/current
ExecStart entry token: candidate-start.mjs
```

The live current release has a small `candidate-start.mjs` startup shim:

```text
candidate-start.mjs sha256: e198f0e34109bb81b8e5fe21e5378fcb09e5b0e266b19b39643be37243afd9fe
candidate-start.mjs bytes: 236
candidate-start.mjs refs: dotenv, server/start.mjs
```

However, `candidate-start.mjs` is not present in Git at either the current
live release ancestry commit `da33de295cb02d1035419af59b1c52e9a3a51ce3` or the
approved candidate commit `b781f3dc818ac8da335d191f4784e4f3970398fc`.

Because the approved gate required an exact Git archive and preserving the
existing service configuration, switching `current` to the exact candidate
archive would make the service restart look for an entry file that the archive
does not contain. The execution was therefore stopped before unpacking,
running `npm ci`, switching the symlink, or restarting the service.

## Blocked-State Validation

After stopping the gate, read-only validation found:

```text
current_link: /opt/proxy-gateway-minimal-candidate/releases/da33de295cb0
new_release_exists: no
proxy-gateway-candidate.service: active
nginx: active
public /api/health: 200
public /api/admin/subscriptions without auth: 404
public /sub/clash.yaml without token: 401
private 127.0.0.1:3456 /api/health: 200
private 127.0.0.1:3456 /api/admin/subscriptions without auth: 401
private 127.0.0.1:3456 /sub/clash.yaml without token: 401
```

Rollback was not performed because no release symlink switch or service restart
occurred. The rollback target release remains present at
`/opt/proxy-gateway-minimal-candidate/releases/da33de295cb0`.

## Not Performed

```text
new release directory creation: not performed
archive unpack: not performed
npm ci on Aliyun release: not performed
current symlink switch: not performed
proxy-gateway-candidate restart: not performed
Nginx reload/config mutation: not performed
DNS mutation: not performed
UFW/provider firewall mutation: not performed
systemd unit mutation: not performed
.env mutation or value output: not performed
SQLite row dump/copy/import/restore: not performed
handoff/log copy: not performed
token/subscription URL/customer data output: not performed
tenant/artifact/subscription output mutation: not performed
edge traffic activation: not performed
```

## Next Gate Options

Use one of these separately approved paths before retrying Aliyun mutation:

```text
Option A: add a versioned candidate-start.mjs compatibility shim to the repo,
validate it locally/HP, then approve a new exact commit upgrade.

Option B: approve a systemd ExecStart migration from candidate-start.mjs to the
versioned server entrypoint, with rollback to the previous unit content and
release.

Option C: approve copying or symlinking a compatibility startup shim into the
new release during the upgrade gate, explicitly accepting that the deployed
release is no longer only the exact Git archive contents.
```

Option A is the cleanest release-management path because it makes the startup
entry versioned and repeatable.

## Local Follow-Up

After this production gate was stopped, a local repository follow-up added a
versioned `candidate-start.mjs` compatibility shim and package-entry regression
coverage. That local fix was not deployed to Aliyun in this gate. A future
runtime upgrade must be built from a new exact committed revision that includes
the shim, not from the previously approved `b781f3d` archive.
