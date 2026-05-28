# CLI Gate Contract

Last updated: 2026-05-28, Asia/Shanghai.

This document defines the first repository-local CLI gate contract. It is a
local tooling contract only. It does not grant production authority, does not
submit approval phrases, does not expose public Admin, and does not execute
DNS, Nginx, systemd, firewall, cloud, node, runtime, traffic, tenant, artifact,
or subscription-output changes.

## Purpose

The CLI is becoming the deterministic operator surface for resource packages,
diagnostic summaries, and execution handoff material. The current
`platform:resource-package` command is the first concrete delivery unit, and
this gate contract is the shared registry that keeps that CLI-first direction
from turning into arbitrary shell access. Commands must be registered and
evaluated through a closed manifest before any future implementation can run
them.

The current contract is intentionally small:

- no shell passthrough
- default `dry-run`
- command IDs must exist in the manifest
- actor type must be allowed by the command
- sensitive input fields are rejected without echoing values
- A-tier commands can produce handoff or approval-readiness material, but
  execution authority remains `not_granted`
- customer-facing commands are separate from operator-only commands

## Command Manifest

The repository helper lives in:

```text
server/services/cli-gate-contract.mjs
```

The local script is:

```powershell
npm run cli:gate-contract -- manifest
npm run cli:gate-contract -- evaluate <request.json>
```

The manifest exposes only safe metadata:

```text
commandId
riskTier
allowedActors
allowedModes
defaultMode
sideEffectClass
executionAuthority
requiredNextAction
produces
forbiddenInputKeys
forbiddenTruthyKeys
```

It does not expose shell commands, raw hosts, raw ports, subscription URLs,
tokens, credentials, approval phrases, customer data, or runtime secrets.

## Initial Command Families

Operator commands:

```text
platform.resource-package
platform.access-inventory.summary
platform.clean-edge.readiness
channel.runtime.handoff
channel.subscription.activation-package
```

Customer-facing skeleton commands:

```text
customer.network.diagnose
customer.subscription.status
```

The customer commands are only contract skeletons in this PR. They do not
create a public portal, issue customer AK/SK credentials, run public web
terminal sessions, or activate user self-service.

## Gate Outcomes

Allowed local output:

```text
safe JSON summaries
redacted diagnostic summaries
approval-readiness packets
activation request packages
local artifacts produced by explicit future command implementations
```

Blocked or not implemented:

```text
arbitrary shell commands
SSH passthrough
approval submission
approval phrase echo/storage
runtime deployment
DNS/Nginx/systemd/firewall/cloud mutation
edge-node contact
traffic movement
real subscription-output activation
public Admin exposure
customer portal activation
production tenant/artifact mutation
```

## Future Split

The next safe expansion is to keep one shared gate core while splitting surfaces:

```text
operator CLI -> full operator manifest, still A-tier handoff-only for production
protected Admin -> review/evidence only, no execution controls
customer CLI -> narrow customer manifest, diagnostics/status/config only
web terminal -> customer CLI wrapper, never a real shell
agent dialog -> intent-to-command JSON, never direct execution
```

Any production customer AK/SK issuance, public web terminal, public customer
self-service, billing, quota enforcement, or live subscription-output activation
remains separate work and requires the appropriate risk gate.
