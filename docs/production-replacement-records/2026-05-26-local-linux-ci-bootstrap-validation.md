# Local Linux Manual CI Bootstrap And Validation

Date: 2026-05-26, Asia/Shanghai.

> Status:
> - Type: Approved execution record
> - Risk: A-adjacent local validation-host mutation
> - Approval: `Approve local Linux manual CI bootstrap. No production secrets,
>   no production data, no deploy, no staging.`
> - Production impact: None
> - Source of truth for: first successful HP local Linux manual CI bootstrap
>   and archive-based repository validation

## Scope

This record follows:

- `docs/ALIYUN_CONTROL_LOCAL_CI_REBUILD_PLAN.md`
- `docs/CI_MANUAL_VALIDATION.md`
- `docs/production-replacement-records/2026-05-26-local-linux-ci-readonly-inventory.md`

Allowed by the approval:

```text
Install or prepare local Node.js/npm tooling on HP for manual CI.
Transfer a repository archive for validation.
Run repository CI-equivalent commands.
Clean run-specific workspace, archive, caches, and temporary repo credentials.
```

Not allowed and not performed:

```text
production secrets
production data
production .env
production SQLite
subscription URLs
cloud credentials
deploy
staging
Aliyun mutation
AWS mutation
DNS mutation
Nginx mutation
systemd mutation
node traffic mutation
```

## Target

```text
Host: hp-server
Candidate role: local-ci-a
Access path: g@192.168.10.250 using the approved local SSH key
Validation target commit: 4dacd1edf0b179cea38654de4cda2fd845c6d922
Validation source: git archive generated from PR #127 branch
```

## Bootstrap

`sudo -n true` was checked first and returned `sudo_nopasswd=no`, so the host
does not support non-interactive passwordless sudo from the operator session.
To avoid requiring password handling and to keep the system-level OS state
smaller, Node.js was bootstrapped as a user-local toolchain under:

```text
~/.local/ci-node/
```

Observed toolchain after bootstrap:

```text
node: v22.22.3
npm: 10.9.8
git: 2.43.0
```

No system package install, service change, or sudo package mutation was
performed.

## Archive Transfer

The Windows operator checkout created a clean Git archive from the validation
commit and copied it to HP:

```text
Local archive: %TEMP%\proxy-gateway-ci-4dacd1edf0b179cea38654de4cda2fd845c6d922.tar
Remote archive: /tmp/proxy-gateway-ci-4dacd1edf0b179cea38654de4cda2fd845c6d922.tar
Remote workspace: /home/g/proxy-gateway-manual-ci/20260526T033217Z-4dacd1edf0b179cea38654de4cda2fd845c6d922
```

The archive came from Git and did not include ignored local secrets, `.env`
files, `.proxy-gateway/`, SQLite data, node credentials, or customer data.

## CI-Equivalent Validation

Environment:

```text
manual_ci_host=hp-server
sha=4dacd1edf0b179cea38654de4cda2fd845c6d922
node=v22.22.3
npm=10.9.8
```

Results:

```text
npm ci: passed
npm ci --prefix admin: passed
npm test: passed, 180/180
npm run admin:test: passed, 25/25
npm run admin:build: passed
```

Notes:

```text
npm printed dependency deprecation warnings for third-party packages.
No validation command failed.
```

## Cleanup

Cleanup was run after validation.

Verified cleanup result:

```text
workspace=removed
archives=removed
npm_cache=removed
gh_config=absent
git_credentials=absent
```

The user-local Node.js 22 toolchain was intentionally retained under
`~/.local/ci-node/` as the local manual CI bootstrap result.

## Decision

```text
Decision: HP local Linux manual CI bootstrap passed
Validated role: local-ci-a
Manual CI status: usable for archive-based repository validation
Manual CI is staging: false
Manual CI is deploy approval: false
Manual CI is production approval: false
Production touched: no
Secrets copied: none
Cleanup completed: yes
```

Recommended next gate:

```text
Retire Aliyun from the manual CI lane only after a separate Aliyun CI cleanup
inventory and explicit cleanup approval.
```
