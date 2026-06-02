# Local Deployment Console Design

Last updated: 2026-06-02, Asia/Shanghai.

## Status

```text
Risk: B for local UI/package generation design
Risk A for any SSH mutation, DNS, Nginx, systemd, firewall, SQLite write, real
subscription issuance, production traffic, or cloud mutation
Production impact: none
```

This design defines the local browser console that prepares deployment topology
and handoff packages for `gccgw`. It does not authorize production execution.

## Goal

Turn the current install configuration page into a local deployment console:

```text
local browser console
  -> edit central control node and production node facts
  -> derive DNS and runtime paths
  -> generate a deployment input package
  -> run local checks through gccgw
  -> send the reviewed package over SSH only after an explicit gate
```

The browser is an editor and visual review surface. `gccgw` remains the
validator, execution shell, risk gate, and audit boundary.

## Surfaces

### Central Node

The central node is the subscription-control platform host.

Inputs:

- control-plane domain
- control-plane server IP
- SSH user
- SSH key path reference
- node role, defaulting to `subscription-control`
- yearly package policy

Derived:

- public base URL
- install slot
- install directory
- runtime SQLite path
- business-control SQLite path
- handoff directory
- env skeleton path

### Production Nodes

Production nodes are replaceable data-plane hosts.

Each node record has:

- node name, such as `prod-edge-a`, `prod-edge-b`, `prod-edge-c`
- region label
- server IP
- SSH user
- SSH key path reference
- protocol label
- pool, such as `stable`, `canary`, or `recovery`
- secret prepared status
- subscription output eligibility

The console may edit safe node metadata. It must not collect raw protocol
secrets, subscription URLs, private keys, customer data, or SQLite rows.

### DNS Matrix

The console renders expected DNS records:

```text
control domain -> central node IP
node domain -> production node IP
```

The matrix can show `pending`, `matches`, `mismatch`, or `not checked`.

DNS mutation is out of scope. Any real DNS update remains a separate Risk A
approval.

### Package And Preflight

The console can generate:

```text
.gccgw/deployments/<deployment-id>/
  deployment-input.json
  install-plan.json
  node-plan.json
  env.skeleton
  nginx.plan.json
  systemd.plan.json
  validation-plan.json
```

Package files may include non-secret intent and local key-path references. They
must not include:

- SSH private-key contents
- console token values
- node or protocol password values
- subscription URLs
- artifact secrets
- SQLite data
- customer data

## Flow

```text
1. Edit topology
2. Generate deployment input
3. Run local package validation
4. Run SSH reachability check
5. Run remote dry-run
6. Show approval text for Risk A apply
7. Apply only through gccgw after approval
8. Run health checks and rollback checks
```

The console must keep `apply` disabled until a reviewed plan exists and the
operator supplies the required approval gate.

## Error Handling

- Missing domain/IP/node facts block package generation.
- Missing SSH key path blocks send/preflight but not local editing.
- Missing secret-prepared status blocks apply planning.
- DNS mismatch blocks promotion but does not block local package generation.
- Failed SSH check stops before remote copy.
- Failed remote dry-run stops before apply.

## Testing

Frontend tests should verify:

- the legacy Admin navigation does not expose the deployment console;
- `/install/` renders as a standalone local console;
- topology edits update derived DNS/runtime facts;
- package previews redact all secret values;
- production apply controls are disabled or approval-gated.

Server/CLI tests should verify:

- deployment input validation rejects missing central/node facts;
- package generation never serializes raw secrets;
- SSH key content is never read by package generation;
- `gccgw` dry-run remains non-mutating;
- apply commands require explicit Risk A flags and approval gates.

## Non-Goals

- No public Admin exposure.
- No public customer portal integration.
- No real DNS update.
- No Nginx/systemd/firewall mutation.
- No cloud instance creation.
- No production SQLite/customer data access.
- No real subscription issuance.
- No raw secret, token, SSH private key, or subscription URL storage.
