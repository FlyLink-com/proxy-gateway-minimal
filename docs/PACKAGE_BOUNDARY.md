# Project Package Boundary

Last updated: 2026-06-02, Asia/Shanghai.

This document defines the two package lanes used by this repository:

```text
Full Project Package
Node Package
```

It is a repository boundary document only. It does not authorize production,
AWS, Aliyun, DNS, Nginx, systemd, firewall, SQLite, customer-data, credential,
subscription-output, or traffic changes.

## Why This Boundary Exists

The project has one simple product goal:

```text
produce and distribute controlled proxy subscriptions
```

The implementation must stay split so the subscription factory does not get
mixed with data-plane host bootstrap work.

## Full Project Package

The full project package is the subscription control and delivery system.

Typical files and directories:

```text
server/
bin/gccgw.mjs
scripts/
config/
admin/
public/
project-state/
docs/
deployments/production-template/
README.md
README_EN.md
```

Responsibilities:

```text
subscription control plane
user / package / entitlement workflow
opaque artifact creation and refresh
subscription YAML rendering
node selection and pool policy
protected Admin preview / request APIs
operator CLI orchestration through gccgw
project-state checks and validation gates
production input package templates
execution records and runbooks
```

The full project package may describe edge nodes, but it must not store raw
edge runtime secrets, customer data, raw subscription URLs, cloud credentials,
private keys, or production SQLite data.

## Node Package

The node package is the provider-neutral data-plane host build material.

Typical files and directories:

```text
ops/edge-node/
```

Responsibilities:

```text
prepare a clean Linux edge host
install runtime dependencies
place reviewed systemd templates
place reviewed Nginx templates
prepare Shadowsocks runtime config examples
prepare proxy-servers config examples
document local host validation commands
support future prod-edge-c recovery or standby builds
```

The node package must stay generic. It must not contain provider-specific
instance IDs, public IPs, production `.env` values, SQLite files, customer
data, raw subscription URLs, TUIC credentials, cloud credentials, private keys,
or generated client YAML.

## Connection Contract

The full project package and node package connect through explicit runtime
facts, not through hidden assumptions.

| Interface | Owner | Notes |
| --- | --- | --- |
| `deployments/production-template/package-manifest.json` | Full project package | Top-level import manifest; declares component files, phases, registration policy, and hard stops. |
| `deployments/production-template/nodes.json` | Full project package | Desired slot and pool model; no runtime secrets. |
| `config/proxy-servers.json` | Runtime config | Renderable node inventory for subscription output; protected in production. |
| `ops/edge-node/templates/proxy-servers.json.example` | Node package | Example only; not production inventory. |
| `SUBSCRIPTION_DB_PATH` | Runtime environment | Points to subscription runtime SQLite outside Git. |
| `SUBSCRIPTION_CONTROL_DB_PATH` | Runtime environment | Points to business-control SQLite outside Git. |
| `PUBLIC_SUBSCRIPTION_BASE_URL` | Runtime environment | Public subscription control base URL. |
| `SS_PASSWORD` / protocol credentials | Protected environment | Never stored in Git, docs, PRs, chat, or logs. |

## Task Classification

Use this split when choosing work:

| Task | Package lane | Risk shape |
| --- | --- | --- |
| user portal lifecycle, packages, profile, support handoff | Full project package | B unless production/auth/schema migration is involved |
| subscription issuance, revoke, artifact refresh, tenant state | Full project package | B for repo code; A for real production issuance/mutation |
| `gccgw` commands, docs binding, project checks | Full project package | B or C depending on code/docs |
| production input templates | Full project package | C unless filled with real deployment facts |
| edge bootstrap templates | Node package | C/B for repo templates; A for host mutation |
| new `prod-edge-a/b/c` host creation | Node package + cloud provider | A |
| DNS, Nginx public boundary, firewall, systemd service activation | Node package / deployment boundary | A |
| adding TUIC/VLESS/Hysteria runtime material | Node package + full project runtime config | A for runtime activation; B/C for repo-only planning/tests |

## Hard Stops

Do not mix these into a normal package-boundary or template PR:

```text
real production host mutation
real `.env` values
SQLite copy, restore, or row dump
raw subscription URL or artifact secret
customer data
DNS mutation
Nginx reload or config activation
systemd enable/start/restart
security group or firewall mutation
cloud instance creation/termination
all-user rollout or production traffic movement
```

Any of the above requires a separate Risk A runbook, exact approval, validation
plan, and rollback model.

## Current Direction

Future work should stay on one of these tracks:

```text
Full Project Package track:
  tighten gccgw
  finalize subscription factory
  finalize user portal lifecycle
  wire protected operator preview/request flows
  prepare production input packages and import manifests

Node Package track:
  make edge-node bootstrap repeatable
  prepare prod-edge-a/b/c host inputs
  validate systemd/Nginx/runtime templates
  add node registration and health facts
```

This keeps the project simple:

```text
control plane produces subscriptions
node package runs data-plane capacity
gccgw coordinates checks, plans, and gated execution
```
