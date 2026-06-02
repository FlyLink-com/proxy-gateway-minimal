# AWS Tokyo/Korea Production-Candidate Private Validation

Date: 2026-06-02

Risk: A

Scope: exact-approved AWS Tokyo and Korea production-candidate edge-node private validation.

## Approval Boundary

The operator approved creating one temporary Ubuntu production-candidate instance
in each of:

- `ap-northeast-1` for Tokyo.
- `ap-northeast-2` for Korea.

Allowed actions were limited to SSH-only temporary AWS setup, isolated checkout
deployment from current `master`, dependency installation from the lockfile,
`gccgw` read-only/dry-run validation, synthetic test `.env`/SQLite data when
needed, and private loopback validation only.

## Created Temporary AWS Resources

| Region | Instance | Security group | Key pair | Boundary |
| --- | --- | --- | --- | --- |
| `ap-northeast-1` | `i-08973ca1a91923f74` | `sg-0f9ecf5de0d1149b8` | `gccgw-prod-candidate-20260602-20260602151640-tokyo-key` | SSH-only from current operator source |
| `ap-northeast-2` | `i-0b6ad64518e115407` | `sg-06b3149ff8f60d825` | `gccgw-prod-candidate-20260602-20260602151640-korea-key` | SSH-only from current operator source |

The security groups authorized only TCP/22 from the current operator `/32`.
No inbound HTTP, HTTPS, TUIC, Shadowsocks, Admin, or other business-port rule was
created.

## Repository Baseline

The deployed checkout was a git bundle made from current `master`:

```text
8cd649e63f26
```

Both hosts checked out the same commit in isolated directories and installed
repository dependencies with `npm ci`.

## Validation Commands

Both hosts ran the approved private validation command set:

```text
gccgw self check
gccgw commands --json
gccgw node inspect --json
gccgw node validate --package deployments/production-template --json
gccgw install preflight --json
gccgw install configure --dry-run --domain https://candidate.example.invalid --install-dir <isolated-checkout> --management-source <operator-cidr> --json
gccgw package inspect deployments/production-template --json
gccgw package import deployments/production-template --dry-run --json
npm run project-state:check
npm test
```

No `gccgw package apply`, `gccgw install bootstrap`, subscription issuance, DNS
mutation, Nginx reload, systemd mutation, firewall mutation, or public listener
setup was run.

## Private Loopback Validation

Synthetic private validation data was created only inside each isolated
checkout. The app was started on loopback only and then stopped during cleanup.

| Region | Runtime | Health | Admin without token | Subscription without token | Artifact without secret | Listener |
| --- | --- | --- | --- | --- | --- | --- |
| `ap-northeast-1` | Node `v22.22.2`, npm `10.9.7` | `200` | `401` | `401` | `404` | `127.0.0.1:3457` only |
| `ap-northeast-2` | Node `v22.22.2`, npm `10.9.7` | `200` | `401` | `401` | `404` | `127.0.0.1:3457` only |

Both hosts also completed the full server test suite:

```text
516 pass / 0 fail
```

## Rollback And Cleanup

Rollback was completed after validation:

- Both temporary instances were terminated and observed as `terminated`.
- Both temporary security groups were deleted and later returned
  `InvalidGroup.NotFound`.
- Both temporary key pairs were deleted and later returned
  `InvalidKeyPair.NotFound`.
- Local temporary key, bundle, and helper-script material under the run-specific
  temp directory was deleted.

## Not Performed Boundary

This record did not perform:

- DNS change.
- Production traffic activation.
- Aliyun mutation.
- Production Nginx boundary change.
- Production systemd mutation.
- Production SQLite or customer-data access/copy.
- Real subscription issuance.
- AWS production node mutation.
- Public Admin exposure.
- Public HTTP/HTTPS/TUIC/Shadowsocks business-port exposure.
- Subscription URL output.
- Adding either node to default subscription output.

## Sensitive Output Boundary

No raw token, secret, subscription URL, customer record, SQLite content, or
handoff material is recorded here. Public IPs and local temporary key material
are intentionally omitted.

## Outcome

Tokyo and Korea passed production-candidate private validation as disposable
candidate hosts for the `gccgw` package flow. This proves the current master can
bootstrap and validate privately on fresh Ubuntu hosts in both regions.

It does not prove public edge service readiness, DNS cutover readiness,
multi-node production registration, real subscription issuance, customer traffic
readiness, or long-running production operations.
