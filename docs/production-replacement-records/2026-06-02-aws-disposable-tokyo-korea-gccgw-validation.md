# AWS Disposable Tokyo/Korea gccgw Validation

Date: 2026-06-02, Asia/Shanghai.

Risk: A / disposable cloud validation.

Scope: Validate the current `gccgw` package deployment flow on two disposable
Ubuntu hosts in separate AWS regions. This record is validation evidence only.
It does not grant production deployment authority.

## Approval

Operator approval allowed:

- one temporary Ubuntu Linux test instance in `ap-northeast-1`
- one temporary Ubuntu Linux test instance in `ap-northeast-2`
- temporary security groups restricted to SSH from the current operator source
- temporary key pairs
- dependency installation from the repository lockfile
- isolated repository checkouts
- `gccgw` self checks, command inventory, install preflight, install configure,
  package inspect/import/apply with `--execute-production-mutation --apply`
  on the disposable hosts only
- synthetic test `.env` and test SQLite data only
- loopback/private health and subscription-boundary validation over SSH

Rollback required:

- stop test services
- terminate both temporary instances
- delete both temporary security groups
- delete both temporary key pairs
- delete local temporary key/material files

## Not Performed Boundary

This validation did not perform:

- DNS change
- production traffic
- Aliyun mutation
- production Nginx boundary change
- production systemd mutation
- production SQLite or customer-data access
- real subscription issuance
- AWS production node mutation
- public Admin exposure
- inbound public HTTP/HTTPS/TUIC/SS business-port security-group rule
- customer data or subscription URL output

## Preflight Facts

Repository branch:

```text
codex/gccgw-package-apply-gate
```

Candidate head:

```text
47f356e fix: make gccgw Linux install validation pass
```

Pull request:

```text
PR #296
state: Draft
mergeable: MERGEABLE
```

Target regions:

```text
ap-northeast-1: opt-in-not-required
ap-northeast-2: opt-in-not-required
```

The earlier Hong Kong target was not used because AWS `ap-east-1` was
`not-opted-in` for the account. Region opt-in was not authorized and was not
performed.

## Disposable Host Setup

Two temporary Ubuntu 24.04 hosts were created:

| Label | Region | Boundary |
| --- | --- | --- |
| Tokyo | `ap-northeast-1` | temporary SSH-only security group |
| Korea | `ap-northeast-2` | temporary SSH-only security group |

Both hosts used temporary key pairs and isolated checkouts created from a Git
bundle of the candidate branch. No local `.env`, SQLite, handoff, token,
subscription URL, credential, customer data, or private runtime data was copied
to either host.

## Commands Validated

On each host, the validation executed the same package flow:

```text
npm ci
sudo npm link
gccgw self check
gccgw commands --json
gccgw install preflight --json
gccgw package inspect deployments/production-template --json
gccgw package import deployments/production-template --dry-run --json
gccgw install configure --dry-run --domain https://sub.example.invalid ...
gccgw package apply deployments/production-template \
  --import-plan reviewed-package-import-plan.json \
  --config-plan reviewed-install-configure-plan.json \
  --execute-production-mutation --apply --json
npm run project-state:check
npm test
git diff --check origin/master...HEAD
```

`gccgw package apply` created only synthetic validation material on the
disposable hosts:

- test `.env` skeleton
- test runtime subscription SQLite
- test business-control SQLite
- test handoff directory
- package apply metadata

## Validation Results

Both disposable hosts passed the same result set.

| Check | Tokyo | Korea |
| --- | --- | --- |
| Node.js runtime | `v22.22.2` | `v22.22.2` |
| `gccgw self check` | passed | passed |
| bare `gccgw` after `npm link` | passed | passed |
| `gccgw install preflight` | passed | passed |
| `gccgw package inspect` | passed | passed |
| `gccgw package import --dry-run` | passed | passed |
| `gccgw install configure --dry-run` | passed | passed |
| `gccgw package apply` | passed | passed |
| production authority | `false` | `false` |
| runtime SQLite tables | 4 | 4 |
| control SQLite tables | 11 | 11 |
| `npm run project-state:check` | passed | passed |
| `npm test` | `511 pass / 0 fail` | `511 pass / 0 fail` |
| `git diff --check origin/master...HEAD` | passed | passed |

Loopback/private boundary validation on both hosts:

| Endpoint | Expected | Result |
| --- | --- | --- |
| `GET /api/health` | health JSON | passed |
| `GET /api/admin/subscriptions` without token | `403` | passed |
| `GET /sub/clash.yaml` without token | `401` | passed |
| `GET /sub/a/test-only` unknown artifact | `404` | passed |

After validation, the loopback test service was stopped on both hosts.

## Rollback And Cleanup

Rollback was executed after validation.

| Resource | Tokyo | Korea |
| --- | --- | --- |
| disposable instance | terminated | terminated |
| temporary security group | deleted; `InvalidGroup.NotFound` after deletion | deleted; `InvalidGroup.NotFound` after deletion |
| temporary key pair | deleted; `InvalidKeyPair.NotFound` after deletion | deleted; `InvalidKeyPair.NotFound` after deletion |
| local temporary key/material directory | deleted | deleted |

## Conclusion

The `gccgw` package deployment flow is validated on two disposable Ubuntu AWS
hosts in separate regions. This proves repeatable per-host package initialization
and private subscription-boundary checks for the current PR candidate.

This does not yet prove centralized multi-node registration, shared inventory
orchestration, production traffic movement, DNS cutover, public listener
exposure, or production subscription issuance.

The next safe repository work is to define and test the multi-node inventory
registration path, for example:

```text
gccgw node inspect
gccgw node register
gccgw node validate
gccgw node disable
```

Those commands should remain separate from cloud creation, DNS, public-port
exposure, and real subscription issuance gates.
