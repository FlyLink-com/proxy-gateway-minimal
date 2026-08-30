# proxy-gateway-minimal / gccgw

[![CI](https://github.com/gccwebos-com/proxy-gateway-minimal/actions/workflows/ci.yml/badge.svg?branch=master&event=push)](https://github.com/gccwebos-com/proxy-gateway-minimal/actions/workflows/ci.yml?query=branch%3Amaster+event%3Apush)
[![Docs](https://img.shields.io/badge/docs-docs%2FCONVENTIONS-blue)](docs/CONVENTIONS.md)

[中文](README.md) | [Documentation Index](docs/README.md)

> The CI badge reflects the workflow that ran on the last push to
> `master`. Markdown-only pushes are classified as the **docs-only lane**
> by `scripts/ci-change-classifier.mjs` and skip dependency install,
> server tests, admin tests, admin / public-site builds, and site
> verify / dry-run; only `git diff --check`, `npm run docs:authority:strict`,
> and the `Governance evidence` step run. A "green" badge in that lane
> means the documentation and governance gates passed, not that
> application tests or builds were executed. See
> [`docs/VALIDATION_BASELINE.md`](docs/VALIDATION_BASELINE.md) for the
> full lane contract.

`proxy-gateway-minimal` is a subscription control and delivery project. Its
mainline is not "another proxy panel." It brings subscription production,
issuance, audit, revocation, installation configuration, and node packages into
a verifiable engineering foundation.

## Authoritative Reading Order

When entering the repository for the first time or resuming work, establish the
current facts in this order:

1. [`docs/CURRENT_RELEASE_STATE.md`](docs/CURRENT_RELEASE_STATE.md): the currently documented release and production reconciliation state.
2. [`RELEASE_MANIFEST.md`](RELEASE_MANIFEST.md): the identity boundary between source, artifacts, releases, deployments, and runtime state.
3. [`docs/PROJECT_CONTEXT.md`](docs/PROJECT_CONTEXT.md): project positioning, documented boundaries, the native current-work read path, and risk boundaries.
4. `git status --short --branch`: the path, branch, and worktree state of the current checkout.
5. [`docs/README.md`](docs/README.md): the complete documentation index, authority scopes, and lifecycle navigation.
6. The subsystem README relevant to the task: read its responsibility and validation boundary before working in that module.
7. Native GitHub Issue/PR records: freshly read state, scope, risk, done criteria, and review evidence before selecting, ordering, or declaring current work; Project #1 is navigation only.

`AGENTS.md` defines repository task rules and always applies, but it does not
replace the current-state reading order above.

The current control plane is `gccgw`:

```bash
node bin/gccgw.mjs capabilities
node bin/gccgw.mjs commands
node bin/gccgw.mjs docs list
node bin/gccgw.mjs project check
```

It organizes project capabilities into these workflows:

```text
project / install / node / package / subscription / channel / config / site-admin / operations
```

## Documented Project Phase (Fresh Production Read Required)

The project is in **Phase 2 Operational Reliability**. It is completing runtime
reliability and release reconciliation on top of a controlled platform
foundation; it is not a finished project in a final acceptance phase.

```yaml
project_status:
  phase: Phase 2 Operational Reliability
  maturity: controlled platform foundation
  source_model: release-managed monorepo
  production: dated evidence exists; current state requires fresh inventory
```

Stable and dated boundaries:

- The core architecture is a monolithic Node/Express service, SQLite business
  state, and the `gccgw` operator CLI.
- The documented architecture uses one subscription control plane to manage
  accounts, orders, subscription artifacts, credential lifecycles, and usage
  ledgers. Vultr Japan and Singapore have dated role evidence as replaceable
  data-plane channels; current role, capacity, and health require fresh
  task-specific inventory.
- `.env` is the configuration closure point on a target host.
- `deployments/production-template/` is a non-sensitive production input
  package template.
- `deployments/production-template/OPERATOR_NOTEPAD.md` is a human checklist,
  not a machine-import file.
- Admin/Web is a protected review or local operator surface, not a public Admin
  product.
- User Portal, payment, node expansion, production deployment, DNS, Nginx, and
  systemd remain gated.
- The historical Shadowsocks local proxy path remains for compatibility. New
  user delivery uses the VLESS Reality, Hysteria2, and TUIC multi-channel
  strategy in Clash/Mihomo subscriptions.

Do not interpret a local test or HP manual-CI success as production readiness.
Production, cloud, node, Nginx, systemd, DNS, SQLite, real-user, or subscription
material changes remain Risk A and require a runbook, dry run, explicit
approval, validation, and rollback.

## Current Engineering Controls

This README provides navigation only. Protocol details and state conclusions
belong to the linked authority documents.

| Control | Authority entrypoint | Current boundary |
| --- | --- | --- |
| Execution Contract v1 | [`docs/EXECUTION_CONTRACT_V1.md`](docs/EXECUTION_CONTRACT_V1.md) | Source-level execution contract; not connected to a production executor or real Gate. |
| Authority Metadata Validation | [`docs/README.md`](docs/README.md#document-metadata-contract) | Validates declared canonical authority and lifecycle metadata. |
| Documentation Lane Governance | [`docs/PROJECT_OPERATING_MODEL.md`](docs/PROJECT_OPERATING_MODEL.md) | Non-blocking documentation lane; does not create a new approval state machine. |
| Release Artifact Identity | [`RELEASE_MANIFEST.md`](RELEASE_MANIFEST.md#artifact-manifest-v1) | Links source to immutable artifact identity; does not establish deployment or production state. |
| Runtime Evidence Collection | [`docs/CURRENT_RELEASE_STATE.md`](docs/CURRENT_RELEASE_STATE.md) and [`docs/RUNTIME_LANE_AUTHORITY.md`](docs/RUNTIME_LANE_AUTHORITY.md) | Records controlled runtime evidence; production decisions still require live Release Flow evidence. |

## Current Source and Archive Boundary

The fixed local source checkout is:

```text
D:\Projects\proxy-gateway-minimal
```

After completing the authoritative reading order above, read
[`docs/CURRENT_SOURCE_AND_ARCHIVE_BOUNDARY.md`](docs/CURRENT_SOURCE_AND_ARCHIVE_BOUNDARY.md)
before using an old checkout, archive, or generated material.

Do not treat these locations as the current project:

- `C:\Users\g\OneDrive\文档\订阅管理`
- `C:\Users\g\Projects\订阅管理\proxy-gateway-minimal`
- `C:\Users\g\WorkBuddy\2026-05-20-18-07-31\proxy-gateway-minimal`
- old temporary worktrees under `.worktrees/`
- historical material under `docs/archive/`
- generated output such as `.codex-runtime/`, `.codex-artifacts/`,
  `.playwright-cli/`, `.tmp-node/`, `test-results/`, and `admin/dist*`

Old checkouts, historical worktrees, archived documents, and generated output
are comparison or archaeology surfaces only. Before reusing code or templates,
diff them against current source and run the relevant validation. Production,
node, account, subscription, payment, DNS, Nginx, systemd, SQLite, or cloud
changes require a fresh Risk A gate.

## Runtime Requirements

| Item | Requirement |
| --- | --- |
| Node.js | Follow `package.json` `engines.node`; Node 20 support starts at `20.10.0`, alongside the listed `22.x` through `26.x` versions. |
| Package manager | Use `npm` and the repository `package-lock.json`; prefer `npm ci` for a clean install. |
| Admin dependencies | Install the Admin workspace separately with `npm ci --prefix admin`. |
| Operating system | Windows supports local development, preview, and diagnostics. A real Linux target must run its own target-host preflight. |

## Quick Validation

```bash
npm ci
npm ci --prefix admin

node bin/gccgw.mjs self check
node bin/gccgw.mjs project check
npm test
npm run admin:test
npm run admin:build
```

Common scripts:

```bash
npm run cli              # gccgw
npm run server           # local service
npm run daemon           # local daemon start
npm run project-state:check
npm run project:verify -- --with-admin
```

## Configuration Closure

Runtime configuration is closed through `.env` on the target host. Start from
the template:

```bash
cp .env.example .env
```

Core keys:

```text
NODE_ENV
CONSOLE_PORT
CONSOLE_TOKEN
SS_PASSWORD
SUBSCRIPTION_DB_PATH
SUBSCRIPTION_CONTROL_DB_PATH
HANDOFF_DIR
PUBLIC_SUBSCRIPTION_BASE_URL
ADMIN_ALLOWED_CIDRS
TRUSTED_PROXY_CIDRS
EDGE_DATA_PLANE_AGENT_ALLOWED_CIDRS
USER_PORTAL_TOTP_SECRET_KEY
SUB_RATE_LIMIT_WINDOW_MS
SUB_RATE_LIMIT_MAX
SUBSCRIPTION_TEMP_LINK_TTL_MINUTES
```

Rules:

- `.env.example` contains placeholders and safe default shapes only.
- Admin and data-plane agent allowlists default to loopback. Production private
  networks or fixed operator sources must be written explicitly on the target
  host.
- `TRUSTED_PROXY_CIDRS` is empty by default. Only `X-Forwarded-For` received
  from an explicitly trusted proxy participates in client-address resolution,
  and IPv4-mapped IPv6 addresses are normalized first. If any address in the
  forwarded chain is invalid, resolution fails closed to a non-matching result
  so the trusted proxy's direct address is not mistaken for the originating
  client address.
- `USER_PORTAL_TOTP_SECRET_KEY` is target-host only. It must encode a 32-byte
  key as hex, base64, or base64url and protects new TOTP credentials at rest.
- Real tokens, passwords, node credentials, subscription URLs, SQLite files,
  and customer data stay only in the target `.env`, protected runtime files, or
  operator-only handoff.
- Never write a real `.env`, subscription URL, customer record, private key,
  cloud access key, or SQLite content into Git, a README, PR, chat, or log.
- JSON packages describe only non-sensitive structure and required environment
  variable names; they do not carry real runtime values.

## Database and Storage Boundary

The project uses SQLite files, not SQL Server, RDS, or another directly
connectable cloud database service.

Default local paths:

```text
.proxy-gateway/subscriptions.sqlite
.proxy-gateway/control.sqlite
```

Target servers normally override them through `.env`:

```text
SUBSCRIPTION_DB_PATH
SUBSCRIPTION_CONTROL_DB_PATH
```

Rules:

- Project processes or `gccgw` access SQLite files; SQL Server tools such as
  SSMS cannot connect to them directly.
- EBS, cloud disks, or server data disks are storage layers that may hold a
  SQLite file; they are not database services.
- Production SQLite does not enter Git, README files, chats, or ordinary
  desktop-file transfer flows.
- Moving to PostgreSQL, SQL Server, RDS, or another cloud database is a Risk A
  architecture change requiring schema mapping, an adapter, migration, backup,
  staging validation, and rollback.

## gccgw Control Plane

Common entrypoints:

```bash
node bin/gccgw.mjs capabilities
node bin/gccgw.mjs commands
node bin/gccgw.mjs architecture
node bin/gccgw.mjs docs command "platform issue-subscription"
node bin/gccgw.mjs docs domain package
```

Configuration profiles:

```bash
node bin/gccgw.mjs config list
node bin/gccgw.mjs config show local
node bin/gccgw.mjs config validate --profile vultr-japan-prod
```

Project validation:

```bash
node bin/gccgw.mjs env check
node bin/gccgw.mjs self check
node bin/gccgw.mjs project check
node bin/gccgw.mjs project verify --with-admin
```

## Installation and New Server Flow

The installation flow in this README covers read-only, dry-run, and gated
shapes only. It does not authorize production.

### 1. Place the Project and Install the CLI

```bash
git clone <repo-url> /opt/proxy-gateway-minimal
cd /opt/proxy-gateway-minimal
npm ci
npm link
gccgw self check
```

A Windows checkout can preview and dry-run. A real Linux target must rerun
preflight on that target.

### 2. Read-only Installation Plan

```bash
gccgw install plan
gccgw install preflight --json
```

`install plan` does not install, deploy, copy `.env`, restore SQLite, start a
service, modify Nginx/DNS/firewall, or issue subscriptions.

### 3. Generate an Installation Configuration Plan

```bash
gccgw install configure --dry-run \
  --domain https://control.example.invalid \
  --install-dir /opt/proxy-gateway-minimal \
  --management-source 203.0.113.10/32 \
  --json > reviewed-install-configure-plan.json
```

The output must be a redacted plan. Real `CONSOLE_TOKEN`, `SS_PASSWORD`, node
credentials, and customer data do not enter the plan file.

### 4. Inspect the Production Input Package

Human notepad:

```text
deployments/production-template/OPERATOR_NOTEPAD.md
```

Machine-import files:

```text
deployments/production-template/package-manifest.json
deployments/production-template/topology.json
deployments/production-template/public-boundary.json
deployments/production-template/plans.json
deployments/production-template/nodes.json
deployments/production-template/env.required.json
deployments/production-template/runbook.md
```

Inspection and dry-run:

```bash
gccgw package inspect deployments/production-template --json
gccgw package import deployments/production-template --dry-run --json \
  > reviewed-package-import-plan.json
```

### 5. Risk A Execution Gate

Only after the runbook, dry-run evidence, target-host preflight, explicit
operator approval, and rollback plan are complete may an operator run:

```bash
gccgw install bootstrap \
  --config-plan reviewed-install-configure-plan.json \
  --execute-production-mutation \
  --apply

gccgw package apply deployments/production-template \
  --import-plan reviewed-package-import-plan.json \
  --config-plan reviewed-install-configure-plan.json \
  --execute-production-mutation \
  --apply
```

These are not quick-start commands.

## Node Package

Node-side material lives under:

```text
ops/edge-node/
```

It provides provider-neutral edge-host bootstrap, systemd, Nginx, and template
material. It contains no real secrets, SQLite, customer data, subscription
material, or production authorization.

Common checks:

```bash
gccgw node inspect --json
gccgw node validate --package deployments/production-template --json
gccgw node register --dry-run safe-node-facts.json --json
gccgw node disable --dry-run prod-edge-a --reason maintenance --json
```

Real node creation, bootstrap, systemd/Nginx, DNS, firewall, traffic cutover,
or subscription-output changes are Risk A.

## Subscription Factory

The current mainline is controlled issuance:

```text
operator input
-> provisioning form
-> resource package / dry-run
-> explicit approval
-> issue subscription or portal entry
-> operator-only handoff
-> audit / revoke
```

Common commands:

```bash
gccgw platform provisioning-form <input.json>
gccgw platform resource-package <input.json>
gccgw platform issue-subscription --dry-run <input.json>
gccgw platform issue-portal-entry --dry-run <input.json>
gccgw platform revoke-access <tenant-ref> --dry-run
```

Real issuance, entry signing, revocation, or handoff writes without `--dry-run`
must follow the relevant gate. Never expose raw subscription material in a
README, PR, or chat.

## Admin, User Portal, and Public Site

The Admin app lives under `admin/`. It supports protected operator review,
local validation, and public-site builds; it is not a public Admin product.

```bash
npm ci --prefix admin
npm run admin:dev
npm run admin:test
npm run admin:build
npm run admin:site:build
npm run admin:site:verify
```

Admin fixture preview supports frontend implementation and Vercel preview. It
does not connect to a production Admin API or enable orders, receipt apply,
collector activation, DNS/Nginx/provider firewall, or real runtime mutation.
The default Admin entry still requires local connection configuration. For a
local read-only preview, run:

```bash
npm run admin:dev
```

Then open `http://127.0.0.1:5173/#/fixture-preview`. Root `vercel.json` builds
Vercel Preview into `admin/dist` and sets `VITE_ADMIN_FIXTURE_PREVIEW=true` at
build time, so the preview displays the safe fixture Admin shell. It is for UI
acceptance and implementation handoff only; it is not a public Admin product.

User Portal routes are not mounted by default. They enter the public allowlist
only when runtime state explicitly enables
`state.platform.userPortalRoutesEnabled === true` and injects the corresponding
auth and service capabilities. Production Portal, payment, automatic
entitlement, and real subscription issuance remain separately gated.

The repository contains a default-off seven-day customer self-service
subscription capability. When `state.platform.portalSelfServiceSubscriptions`
is injected, a signed-in durable account may use the `trial` policy to activate
seven days, refresh visible-once subscription material, or disable the current
subscription. User Portal does not delete order or subscription records.
Monthly and annual plans remain request flows. Payment, public production
Portal, and automatic issuance remain disabled by default in repository source.
This document does not establish their current production-runtime state; that
requires fresh Risk A inventory.

## Legacy Clash/Mihomo Compatibility

`/sub/clash.yaml` remains as a historical compatibility and test-coverage
entrypoint:

```text
GET /sub/clash.yaml?token=<legacy-or-visible-once-token>
```

It is not the current new-user onboarding mainline. Current onboarding uses
plan requests, operator review, opaque artifacts, the operator CLI, and
protected handoff.

Never paste real tokens, subscription URLs, YAML, node passwords, or customer
information into a README, PR, log, or chat.

## Windows Local Proxy Capability

The legacy Windows local proxy chain remains for local adaptation and
diagnostics:

```text
Windows app
-> 127.0.0.1:18180 HTTP bridge
-> 127.0.0.1:1080 ss-local
-> remote Shadowsocks server
```

Scripts:

```powershell
npm run proxy:on
npm run proxy:pac
npm run proxy:off
npm run proxy:status
npm run network:status
npm run network:repair
npm run network:reset
```

`CONSOLE_PORT` affects only the Node runtime. Windows proxy scripts still use
local ports `3456 / 1080 / 18180` by default. Changing `.env` does not
automatically change PAC or Windows proxy scripts.

## Documentation Entry Points

Use the authoritative reading order at the top when restoring project context.
The following table is additional navigation only.

Important current documents:

| Document | Purpose |
| --- | --- |
| `docs/CURRENT_RELEASE_STATE.md` | Currently documented release and production reconciliation state |
| `RELEASE_MANIFEST.md` | Source, artifact, release, deployment, and runtime-state identity model |
| `docs/PROJECT_CONTEXT.md` | Project positioning, risk boundaries, and the native Issue/PR entrypoint for current work |
| `docs/VALIDATION_BASELINE.md` | Validation command matrix |
| `docs/CONFIGURATION_OWNERSHIP_MATRIX.md` | Configuration ownership |
| `docs/PRODUCTION_INPUT_PACKAGE_FORMAT.md` | Production input package format |
| `deployments/production-template/README.md` | Production package template |
| `docs/OPERATOR_CLI_PLATFORM_BOUNDARY.md` | CLI-first operating boundary |
| `docs/NETWORK_FORWARDING.md` | Network-path boundary |
| `docs/CI_MANUAL_VALIDATION.md` | HP and local-Linux manual-CI boundary |
| `docs/HP_PORTAL_VALIDATION_RUNBOOK.md` | HP private-validation boundary |

## Code Structure

```text
.
├── bin/
│   ├── gccgw.mjs              # current operator CLI
│   └── proxy-gateway.mjs      # compatibility CLI
├── server/                    # Express app, routes, services, tests
├── admin/                     # Vite React Admin, Portal, and public-site surfaces
├── agent/                     # local edge / data-plane agent surfaces
├── schemas/                   # portable versioned data contracts
├── config/                    # redacted local configuration templates
├── deployments/
│   └── production-template/   # non-secret production input package template
├── docs/                      # current docs, runbooks, records, archive index
├── ops/
│   └── edge-node/             # provider-neutral edge-node package material
├── scripts/                   # Windows helpers, backup/restore, diagnostics
├── public/                    # local console and static assets
├── project-state/             # machine-checkable lane taxonomy and dated compatibility snapshots
├── .env.example               # runtime environment template
└── .gitattributes             # keeps shell scripts LF for Linux archive runs
```

## Risk Tiers

| Risk | Scope | Default validation |
| --- | --- | --- |
| C | Docs, README, indexes, and read-only checks | `git diff --check` |
| B | Local code, tests, Admin UI, and dry-run CLI | Focused tests plus `npm test` or Admin checks |
| A | Production, cloud, nodes, Nginx, systemd, DNS, auth, schema, deploy, rollback, and real subscriptions | Inventory, dry run, approval, validation, and rollback |

This README grants no production authority. Every Risk A action must read the
relevant runbook and receive explicit operator approval.
