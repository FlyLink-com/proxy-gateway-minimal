# Operator CLI Platform Boundary

Last updated: 2026-05-31, Asia/Shanghai.

```yaml
document_metadata:
  doc_type: canonical
  lifecycle: active
  authority_scope: operator_cli_platform_boundary
  superseded_by: null
  last_verified_at: 2026-05-31
  production_authority: false
```


This document defines the current product boundary for platform operations:
the production platform exposes only explicitly approved public/customer
interfaces, while administrative and operator work is performed through
operator-controlled CLI tooling and local/private consoles.

It does not authorize deployment, DNS, Nginx, firewall, tenant, artifact,
subscription-output, edge traffic, or production state changes.

## Decision

The platform product direction is CLI-first for operators:

- Public surfaces are for brand, lead intake, health checks, and subscription
  refresh only.
- Administrative workflows are not a public web product surface.
- Operator workflows should be implemented as CLI tools, safe resource
  packages, local/private consoles, and execution records.
- Any future browser console is an operator workstation surface, not a public
  Admin endpoint and not a customer portal.
- CLI is not the user product surface. User portals must call user-scoped
  domain services directly and must not shell out to, wrap, or depend on CLI
  commands for normal self-service flows.

## Public Interface Allowlist

The public boundary should stay small and explicit:

```text
GET  /
GET  /api/health
POST /api/public/leads
GET  /sub/clash.yaml
GET  /sub/a/*
```

Any new public route requires a separate design, risk classification, tests,
and production gate if deployed.

The following remain out of scope for public exposure:

```text
/api/admin/*
raw subscription URLs
raw artifact secrets
operator approval phrases
node hosts / raw ports / credentials
SQLite rows or backups
customer private data
runtime mutation controls
```

## Operator Surfaces

Operator work should converge on these surfaces:

```text
CLI tools:
  npm run platform:*
  npm run channel:*

Operator form adapters:
  reviewed form facts -> safe CLI input preview

Operator-only handoff files:
  0600 / current-user-only material outside the repository

Local/private console:
  review, evidence, diagnostics, and readonly summaries only

Execution records:
  docs/production-replacement-records/*
```

The CLI platform is allowed to create safe plans, summaries, validation
records, and handoff metadata. It must not print or persist raw secrets,
subscription URLs, artifact values, credentials, node private details, or
customer data in repository files, PRs, docs, logs, chat, or terminal summaries.

## Production Mutation Rule

Production-affecting actions remain Risk A even if wrapped by a CLI:

```text
tenant creation
artifact issuance
artifact revocation
tenant disablement
subscription-output binding
Nginx / DNS / firewall mutation
edge traffic activation
runtime deployment or cleanup
```

The required flow is:

```text
readonly inventory
dry-run / plan
exact operator approval phrase
execution
validation
rollback evidence
execution record
```

Short confirmations such as `ok`, `go`, `continue`, or `同意` are not enough
for Risk A execution.

## Admin UI Posture

Existing protected Admin UI work remains useful as a local/private operator
review surface. It should not grow into a public management product.

Preferred evolution:

- keep protected review/evidence panels only when they reduce operator error;
- move repeatable operational actions into CLI commands;
- make browser surfaces consume safe summaries, not raw execution material;
- avoid complex execution buttons in the web UI;
- keep public Nginx blocking for Admin routes.

## Customer / User Posture

Customers should not need a public Admin surface and should not interact with
CLI tools. The operator delivery model is:

```text
lead or customer request
  -> operator review
  -> provisioning form facts
  -> safe CLI input preview
  -> entitlement / access decision
  -> CLI-generated safe resource package
  -> visible-once out-of-band handoff
  -> subscription refresh through approved public subscription routes
```

The customer portal model is separate:

```text
portal session
  -> user-scoped service request
  -> entitlement / balance / quota / artifact policy
  -> safe user result
```

Normal customer self-service, such as viewing account state or refreshing an
allowed subscription artifact, belongs to the portal/service path, not the CLI
path. Operator CLI remains for provisioning, override, revoke, audit, emergency
recovery, and controlled handoff.

Future customer portals or dynamic entries remain separate product work and
must not be hard-linked from the public company site unless explicitly
approved.

## Validation Expectations

Repository-only changes to this boundary are C-tier and normally require:

```text
git diff --check origin/master...HEAD
```

Code or CLI implementation work is B-tier unless it can mutate production or
credentials. Production mutation remains A-tier regardless of how small the CLI
command appears.
