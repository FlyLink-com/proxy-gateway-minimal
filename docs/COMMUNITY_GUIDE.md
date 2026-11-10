# Community & Developer Guide

Last updated: 2026-11-09 UTC.

```yaml
document_metadata:
  doc_type: operational
  lifecycle: active
  authority_scope: community_guide
  superseded_by: null
  last_verified_at: 2026-11-09
  production_authority: false
```

This guide helps external developers understand the repository and find the right entrypoint. It is an onboarding aid, not a substitute for the canonical architecture, release, validation, or security documents.

## Start here

1. Read the [project landing page](../README.md) for the product scope and quick start.
2. Review the [project context](PROJECT_CONTEXT.md) for domain boundaries and the documented source architecture.
3. Use the [documentation index](README.md) to find the owning document for a subsystem.
4. Read the subsystem README before changing that part of the codebase.
5. Check the current GitHub Issue / Pull Request before assuming work is active or complete.

## Repository map

| Directory | What belongs here | Start with |
| --- | --- | --- |
| bin/ | gccgw CLI routing and compatibility entrypoints | [CLI Workspace](../bin/README.md) |
| server/ | Express app, routes, domain services, persistence adapters, and server tests | [Server Workspace](../server/README.md) |
| admin/ | React / Vite source for Admin, User Portal, and company site | [Admin Workspace](../admin/README.md) |
| agent/ | Local Edge Agent and data-plane Agent runners / adapters | [Edge Agent Workspace](../agent/README.md) |
| workers/control-plane/ | Local Workers + D1 synthetic validation slice | [Worker README](../workers/control-plane/README.md) |
| schemas/ | Shared, versioned data-shape contracts | [Schemas README](../schemas/README.md) |
| docs/ | Architecture, API compatibility, development, validation, and governance references | [Documentation Index](README.md) |

## Development setup

### Requirements

Use a Node.js version allowed by the root package.json engines field (20.x from 20.10.0 onward and below 21.0.0, or 22.x–26.x), npm, and Git. The Worker workspace separately requires Node.js 22 or newer.

### Install dependencies

```bash
npm ci
```

The Admin workspace has its own lockfile. Install its dependencies when working on the frontend:

```bash
npm ci --prefix admin
```

### Safe first commands

```bash
# Read-only capability discovery
npm run cli -- capabilities

# Read-only command listing
npm run cli -- commands

# Root server-source tests
npm test

# Admin UI development (loopback only)
npm run admin:dev
```

For backend development, read [Server Workspace](../server/README.md) and [Lightweight Operating Development Environment](LIGHTWEIGHT_OPERATING_DEV_ENVIRONMENT.md) before starting the local service. Use isolated local configuration and disposable fixtures. Never use production databases, production environment files, customer records, subscription URLs, or node credentials as development fixtures.

### Worker slice

The Worker workspace is a local synthetic validation project, not the deployed control plane. If you are changing it, use its own package and test instructions:

```bash
cd workers/control-plane
npm ci
npm test
```

The Worker README documents the local Miniflare boundary. Do not add remote Cloudflare resources, secrets, bindings, routes, or deployments as part of ordinary local development.

## Validation by change type

| Change | Baseline |
| --- | --- |
| Documentation only | npm run docs:authority:check, npm run docs:authority:strict, and git diff --check |
| Server behavior | Focused server tests, then npm test |
| Admin UI | npm run admin:test and the relevant build / verification command |
| Worker slice | cd workers/control-plane, npm ci, npm test |
| Production, provider, node, database, credential, or deployment behavior | Stop at source / documentation work until the separate Risk A process and exact approval apply |

The authoritative command selection and stop conditions live in [Validation Baseline](VALIDATION_BASELINE.md). Do not run every test suite by default; validate the boundary you changed.

## Where to find contracts

- [API Compatibility](API_COMPATIBILITY.md) — documented HTTP compatibility surface.
- [Project Context](PROJECT_CONTEXT.md) — current source model, domain boundaries, and future target separation.
- [Validation Baseline](VALIDATION_BASELINE.md) — validation ownership and risk-tier commands.
- [Security Policy](../SECURITY.md) — private vulnerability reporting.
- [Contributing](../CONTRIBUTING.md) — pull-request expectations and safe development rules.

## Important project boundaries

- The current source control plane is Node.js / Express with SQLite.
- Cloudflare Workers + D1 is a future migration direction. The checked-in Worker slice runs locally with synthetic data and is not deployed or authoritative.
- A source module or passing test does not establish production deployment or runtime health.
- Admin is a protected surface; do not expose it publicly.
- Production data, credentials, subscription material, provider settings, and node operations are outside ordinary community development.

## Ask questions and report issues

Use GitHub Issues for reproducible bugs, documentation gaps, and feature proposals. Include the affected commit, relevant module, expected behavior, actual behavior, and a minimal redacted reproduction.

Do not put tokens, passwords, private keys, raw subscription URLs, customer data, or vulnerability details in public Issues or Pull Requests. Use the private process in [SECURITY.md](../SECURITY.md) for vulnerabilities.

## License status

The repository currently has no root LICENSE file. Public visibility alone does not grant permission to reuse, redistribute, or commercially use the code. Review the license status in the [project README](../README.md) before proposing substantial code contributions.
