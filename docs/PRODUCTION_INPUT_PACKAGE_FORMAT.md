# Production Input Package Format

Last updated: 2026-06-02, Asia/Shanghai.

This document defines the non-secret import format for deploying this project
as a full subscription-control package plus optional edge-node package inputs.
It is a template contract only. It does not authorize production deployment,
DNS, Nginx, systemd, firewall, cloud, SQLite, customer-data, credential,
subscription-output, or traffic changes.

For the broader question of which surface owns each setting, read
`docs/CONFIGURATION_OWNERSHIP_MATRIX.md`. This document only defines the safe
Git package shape.

## Package Shape

Use one directory per candidate deployment package:

```text
deployments/<package-name>/
  package-manifest.json
  topology.json
  public-boundary.json
  plans.json
  nodes.json
  env.required.json
  runbook.md
```

The package is safe to keep in Git only when it contains references and policy
facts, not secrets or runtime data.

## Import Phases

| Phase | Risk | Purpose | Mutation |
| --- | --- | --- | --- |
| inspect | C | Verify file presence, schema names, forbidden raw fields, and package intent. | None |
| dry-run | B | Build a redacted deployment summary and planned runtime wiring. | None |
| apply | A | Write approved host files, restore approved data, start or reload services. | Separate exact approval required |

Current package commands:

```bash
gccgw package inspect deployments/production-template --json
gccgw package import deployments/production-template --dry-run --json
```

`gccgw package inspect` operates only on the C phase. `gccgw package import
--dry-run` operates only on the B phase and returns a redacted plan for
environment requirements, public-boundary checks, plan registration, and node
slot wiring. It does not write files, read real environment values, copy
SQLite, reload services, issue subscriptions, or mutate hosts. Any `--apply`
path remains Risk A.

## Required Files

### `package-manifest.json`

The manifest ties the package together. It declares package kind, environment,
intended target role, component files, import phases, and hard-stop rules.

Required fields:

```text
schema
metadata.name
metadata.packageKind
metadata.environment
metadata.secretsInGit
components[]
importPhases[]
hardStops[]
```

### `topology.json`

Defines control-plane and data-plane roles:

```text
controlPlane.id
controlPlane.runtimePath
controlPlane.publicBaseUrl
controlPlane.publicRoutes
controlPlane.protectedRoutes
controlPlane.databaseRefs
dataPlane.defaultPool
dataPlane.nodeConfigSource
operatorAccess.publicAdmin
```

### `public-boundary.json`

Defines public route expectations that must remain true after deployment:

```text
/api/health -> public 200
/api/admin/* -> public blocked
/sub/clash.yaml -> public but credential-required
/sub/a/* -> public but opaque-artifact-required
```

### `plans.json`

Defines simple package products:

```text
monthly -> 30 days
annual -> 365 days
```

This project currently uses package subscriptions, not recharge/deduct
balances. Payment provider facts may confirm purchase later, but payment
secrets and provider payloads do not belong in this package.

### `nodes.json`

Defines desired node slots and pools without runtime secrets:

```text
prod-edge-a / prod-edge-b / prod-edge-c
stable / canary / recovery pools
protocol list
hostRef
credentialRefs
subscriptionEligible
bootstrapAuthority
```

`hostRef` and `credentialRefs` must be references such as `env:*`,
`runtime:*`, or `protected-env:*`. They must not be raw host credentials,
private keys, passwords, UUIDs, subscription URLs, or artifact secrets.

### `env.required.json`

Defines the names and storage locations of required environment variables.
Secret values are never filled here.

### `runbook.md`

Defines the approval and validation sequence for turning a safe package into a
deployment candidate.

## Registration / Portal Inputs

Public registration should not store raw contact or customer data in this
package. The import package may define only policy-level facts:

```text
portal registration mode
available package ids
whether requests start as pending
whether approval is operator-controlled
support handoff channel labels
```

Concrete users, dynamic portal entries, TOTP state, customer identifiers,
subscription artifacts, purchase records, and delivery records live in the
runtime/control databases or operator-only handoff files, not in Git.

## Forbidden Fields

Reject any package that contains:

```text
raw subscription URL
raw opaque artifact secret
raw console token
raw payment token, AK, or SK
cloud access key
private key or PEM file
SQLite file or row dump
customer email, phone, Telegram, or real name
production-only raw IP inventory without approval for Git
generated Clash/Mihomo YAML
runtime logs
handoff files
```

## Import Order

Recommended operator order:

```text
1. Inspect package files and schemas.
2. Check forbidden-field scan.
3. Check topology and public-boundary consistency.
4. Check plan ids and node pool references.
5. Run gccgw install preflight on target host.
6. Request separate Risk A approval for bootstrap or data import.
7. Apply host bootstrap only after approval.
8. Inject approved env, SQLite, and node runtime data outside Git.
9. Run service status and loopback validation.
10. Start canary issuance or rollback by separate gate.
```

## Minimal Valid Package

The tracked template at `deployments/production-template/` is the canonical
minimal safe package. It is intentionally non-secret and not production
authority.
