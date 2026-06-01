# Production Cutover Strategy Decision

> Status:
> - Type: Active decision record
> - Risk: A
> - Execution authority: Does not authorize mutation by itself
> - Production impact: None unless separately approved
> - Source of truth for: Production cutover strategy selection before green creation

Last updated: 2026-05-24, Asia/Shanghai.

This document records the cutover strategy decision that must be made before
requesting a green production replacement candidate. It is a decision record
only. It does not authorize AWS mutation, DNS changes, Nginx changes, HTTPS
issuance, production secret copying, green creation, or traffic cutover.

## Context

Current production remains a single blue node:

```text
Node name: aws-singapore-blue
Instance ID: i-004ab1c6c71d06bca
Public IP: 47.129.247.102
Security group: sg-04a165ec77f430ee8
Runtime path: /opt/proxy-gateway-minimal
```

The read-only production replacement preflight concluded:

```text
Ready to create green now: no
Ready to cut over now: no
Ready to request the next planning decision: yes
```

Known blockers:

- `47.129.247.102` returned `InvalidAddress.NotFound` from
  `describe-addresses`, so it is not confirmed as an Elastic IP.
- Current tracked node config and subscription base URL remain IP-pinned to
  `47.129.247.102`.
- Domain HTTPS remains paused.
- A fresh blue SQLite backup is still required immediately before any approved
  green restore or cutover.

## Decision Summary

Recommended strategy:

```text
Short-term: do not create green yet.
Medium-term preferred: DNS/domain abstraction.
Not now: direct node-config update, unless an incident forces it.
EIP: evaluate only as an explicitly allocated EIP strategy; do not rely on current 47.129.247.102.
```

Rationale:

- DNS/domain abstraction is the cleanest long-term way to move subscription and
  node targets without tying clients to one EC2 public IP.
- Current public IP cannot be assumed movable.
- Directly changing generated subscription/node config to a new raw IP has the
  largest client impact and weakest rollback properties.
- Creating green before choosing cutover and rollback strategy risks producing
  a validated server that still cannot receive traffic safely.

## Strategy Options

### Option 1: Elastic IP Strategy

Status:

```text
Not selected for current 47.129.247.102.
Potential future option only if a new EIP strategy is explicitly approved.
```

What it solves:

- Provides a movable public IP that can be reassociated between blue and green.
- Avoids changing client-facing subscription or node hostnames if all clients
  already target that EIP.

Current blocker:

- `47.129.247.102` is not confirmed as an Elastic IP allocation.
- Existing clients are already pinned to a non-confirmed public IP.

Required before choosing this option:

- Decide whether to allocate a new Elastic IP and migrate clients to it first.
- Define EIP association and rollback commands.
- Confirm whether reassociation affects both Nginx subscription traffic and
  Shadowsocks node traffic.
- Define how long blue and green run in parallel during EIP migration.
- Confirm security group and network interface targets.

Risks:

- A new EIP still requires client or DNS migration unless it can replace the
  current IP transparently, which is not currently proven.
- EIP reassociation is AWS mutation and must be executed under Risk A gates.
- Without DNS abstraction, future moves remain IP-centric.

Decision:

```text
Do not proceed with green creation based on EIP until an explicit EIP migration plan exists.
```

### Option 2: DNS / Domain Strategy

Status:

```text
Preferred medium-term strategy.
Not yet approved for execution.
```

What it solves:

- Decouples clients from a single EC2 public IP.
- Allows future blue-green replacement by changing DNS records instead of
  requiring clients to track raw IP changes.
- Provides a path to HTTPS for subscription delivery.
- Makes rollback a DNS change if TTL and validation are planned correctly.

Required before choosing this option:

- Resume and update the historical `docs/archive/DOMAIN_HTTPS.md` only if the
  old AWS Singapore HTTPS plan is explicitly reactivated; otherwise use
  `docs/DOMAIN_IMPLEMENTATION_RUNBOOK.md`.
- Decide final public names, for example:
  - subscription base URL host, such as `sub.<domain>`;
  - Shadowsocks node host, such as `ss-node.<domain>` or equivalent.
- Confirm DNS provider and record ownership.
- Define TTL strategy before cutover.
- Define Nginx HTTP/HTTPS behavior.
- Define certificate issuance/renewal path.
- Update `PUBLIC_SUBSCRIPTION_BASE_URL` only under an approved production
  runbook.
- Update `config/proxy-servers.json` node host only under an approved
  production runbook.
- Validate Clash/Mihomo client behavior after DNS and HTTPS changes.

Risks:

- Opens a larger A-risk surface: DNS, Nginx, HTTPS, subscription base URL,
  node host, and client behavior.
- Requires careful staged rollout so existing clients do not lose service.
- Requires rollback rules for DNS, Nginx, and app runtime config.

Decision:

```text
Use DNS/domain abstraction as the preferred medium-term cutover strategy, but do not execute it until a separate Risk A domain cutover plan is approved.
```

### Option 3: Subscription / Node Config Update Strategy

Status:

```text
Avoid as the default strategy.
Reserve for incident response or an explicitly scheduled client migration window.
```

What it solves:

- Directly points generated subscription YAML or subscription base URL at a new
  green IP or node.
- Does not require DNS readiness.

Current blocker:

- Current clients and generated config are IP-pinned to `47.129.247.102`.
- Moving to a new raw IP requires clients to refresh subscriptions or accept a
  node target change.

Required before choosing this option:

- Decide whether blue and green are both listed during a transition window.
- Define how existing clients discover the new node.
- Define whether tenant links or primary tokens must be regenerated.
- Define rollback to old node config.
- Define expected client refresh behavior and support window.
- Create a fresh SQLite backup immediately before any production config change.

Risks:

- Highest client impact.
- Weakest rollback if clients cache or pin old node metadata.
- Can create mixed client states if some clients refresh and others do not.

Decision:

```text
Do not use direct subscription/node config update as the planned replacement strategy unless DNS/EIP options are unavailable or an incident requires it.
```

## Recommended Path

Proceed in this order:

1. Keep blue serving.
2. Do not create green yet.
3. Choose whether to resume DNS/domain abstraction as the preferred cutover
   path.
4. If DNS/domain is accepted, create a separate Risk A plan covering DNS,
   HTTPS, Nginx, `PUBLIC_SUBSCRIPTION_BASE_URL`, `config/proxy-servers.json`,
   client validation, and rollback.
5. Only after cutover strategy is approved, request explicit approval to create
   a green production replacement candidate.
6. Immediately before any approved green restore or cutover, create a fresh
   blue SQLite backup and rerun integrity checks.

## Green Creation Gate

Do not request green production replacement candidate creation until this gate
is satisfied:

- Cutover strategy selected: EIP, DNS/domain, or node-config migration.
- Rollback strategy documented.
- Client impact documented.
- Fresh backup requirement accepted.
- Production secret/data handling boundary accepted.
- Operator approval phrase ready for green creation.

Recommended green creation approval phrase remains:

```text
Create a green production replacement candidate for aws-singapore-blue.
```

This approval is separate from cutover approval.

## Cutover Gate

Do not request cutover approval until:

- Green exists and has passed local and public validation.
- The chosen cutover strategy has a tested rollback path.
- A fresh blue SQLite backup exists and passes `pragma integrity_check`.
- The Admin API remains private.
- Public gateway behavior is verified.
- Valid subscription and Shadowsocks client behavior is verified without
  exposing secrets or subscription URLs.

Recommended cutover approval phrase remains:

```text
Cut over production traffic from blue to green.
```

## Non-Goals

This decision record does not implement or authorize:

- AWS resource creation.
- Elastic IP allocation or reassociation.
- DNS record changes.
- HTTPS certificate issuance.
- Nginx mutation.
- `.env`, SQLite, `SS_PASSWORD`, or `CONSOLE_TOKEN` copying.
- `config/proxy-servers.json` production mutation.
- Green candidate creation.
- Traffic cutover.
- Automatic failover or active-active production.
