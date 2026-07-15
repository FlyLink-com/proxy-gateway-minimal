# Validation / CI Unit

Last updated: 2026-05-26, Asia/Shanghai.

> Status:
> - Type: Active unit design
> - Risk: C for this document
> - Execution authority: Does not authorize CI host startup, staging, deploy,
>   production, AWS, DNS, Nginx, systemd, node, tenant, artifact, SQLite,
>   secret, or cutover changes
> - Production impact: None
> - Source of truth for: repository validation evidence boundaries and CI
>   fallback responsibility

## Purpose

The Validation / CI Unit owns repository-quality evidence.

It answers:

```text
Did the repository change pass the required checks for its risk tier and touched
surface?
```

It does not answer:

```text
Is staging approved?
Is production approved?
Should a node be promoted?
Should AWS, DNS, Nginx, systemd, tenant, artifact, or SQLite state change?
```

The current GitHub Actions billing or spending-limit blocker is a validation
boundary and runner availability issue, not a code failure by itself.

## Responsibilities

```text
local focused test selection
npm test baseline validation
Admin UI test and build validation
GitHub Actions CI when available
local Linux manual CI target while GitHub-hosted Actions is blocked
historical Aliyun manual CI fallback until the local Linux transition is
  validated
HP local-ci-a lane selection: ci-smoke, ci-full, ci-visual
clean-environment validation evidence when required
validation records for PRs or handoffs
failure logs with secrets redacted
validation command matrix documentation
```

Validation evidence should record:

```text
what command ran
where it ran
which commit or branch was validated
whether it passed or failed
whether GitHub-hosted CI was blocked before job execution
whether manual CI fallback was used
which HP lane was selected when HP manual CI was used
whether cleanup was completed for manual validation hosts
```

## Explicit Non-Responsibilities

```text
staging approval
production approval
deploy permission
cutover permission
AWS, DNS, Nginx, systemd, or security-group mutation
tenant mutation
artifact issuance or promotion
SQLite backup, restore, migration, or inspection authority
node promotion or lifecycle changes
commercial entitlement decisions
product scope decisions
```

Passing validation is required evidence for many changes, but it is not
deployment approval. Manual CI fallback is not staging, not production, and not
a self-hosted runner assumption. The current target is to move routine manual
CI to local Linux so the Aliyun server can be evaluated separately as the
production subscription control-plane candidate.

HP lane selection is a validation-scope decision, not an infrastructure
promotion decision. `ci-smoke` is local confidence, `ci-full` is clean-host
archive validation, and `ci-visual` is browser/rendering evidence. None of
those lanes authorizes staging, deploy, production traffic, node promotion, or
subscription artifact mutation.

## Inputs

```text
risk tier classification
changed file list
PR branch or commit SHA
repository validation baseline
focused test requirements from touched modules
Admin UI surface-change information
GitHub Actions availability state
manual CI fallback request when clean-environment evidence is required
```

## Outputs

```text
local validation result summaries
GitHub Actions result summaries when available
manual CI-equivalent validation records when needed
redacted failure summaries
validation waiver notes when GitHub-hosted Actions cannot start
recommended next validation action
```

Validation output should distinguish:

```text
test failure
build failure
diff whitespace failure
runner unavailable before job execution
manual CI fallback passed
manual CI fallback failed
validation not run
```

## Interfaces With Other Units

```text
Product Business:
  provides repository-quality evidence for product-facing changes

Commercial / Entitlement:
  validates entitlement code or docs when they exist
  does not approve billing, plans, renewals, or customer state

Subscription Access Control:
  validates routes, token handling, opaque artifact behavior, and renderer
  behavior
  does not approve production tenant mutation or artifact issuance

Edge / Node Capacity:
  validates repository code/docs that describe node behavior
  does not approve node promotion or live edge mutation

Local Client:
  validates local-agent prototype code and fail-closed diagnostics behavior
  does not approve production client activation

Operator Lab:
  may validate lab tooling when it is repository work
  does not convert lab evidence into staging or production authority

Production Operations:
  provides evidence consumed by A-tier gates
  does not replace read-only inventory, approval, rollback plan, or live
  validation
```

## Current Repository Anchors

```text
docs/DOMAIN_UNIT_BOUNDARIES.md
docs/VALIDATION_BASELINE.md
docs/CI_MANUAL_VALIDATION.md
docs/LIGHTWEIGHT_OPERATING_DEV_ENVIRONMENT.md
docs/GITHUB_DEPLOYMENT_RUNBOOK.md
.github/workflows/ci.yml
package.json
admin/package.json
server/tests/*.mjs
admin/src/test/*
```

Current command families:

```text
git diff --check origin/master...HEAD
npm test
npm run admin:test
npm run admin:build
npm run project-state:check
```

## Risk And Validation

```text
Default risk:
  C for validation docs, runbooks, command matrix text, and records
  B for test, build, Admin UI, server, local-agent, or validation tooling changes
  A for validation processes that mutate cloud resources, production resources,
    tenants, artifacts, nodes, DNS, Nginx, systemd, SQLite, deploy state, or
    cutover state

Docs-only validation:
  git diff --check origin/master...HEAD
```

Baseline selection:

```text
docs only -> git diff --check
project-state JSON -> project-state:check + diff check
server/shared code -> npm test + diff check
Admin UI -> admin:test + admin:build + npm test + diff check
local-agent prototype -> npm test + diff check
production/cloud/node/runtime -> runbook-specific A-tier gate
```

## Next Tasks

```text
keep validation records separate from production execution records
keep GitHub Actions billing/spending-limit blockers framed as runner
  availability issues
add validation records only where they affect PR review, handoff, or current
  project state
keep local Linux manual CI aligned with GitHub Actions command sequence
keep HP lane selection explicit so docs-only, implementation, and visual PRs do
  not all escalate to full clean-host runs by default
keep historical Aliyun manual CI evidence available while moving routine CI off
  the future production control-plane candidate
ensure manual CI cleanup remains part of every manual validation record
avoid treating validation success as staging, deploy, production, or node
  promotion approval
```

## Paused / Blocked Items

```text
GitHub-hosted Actions as the only validation path while billing blockers remain
self-hosted runner registration
manual CI host mutation outside the approved validation boundary
using manual CI as staging
continuing routine CI on the future production subscription control-plane
  candidate after local Linux CI is validated
using manual CI as production approval
deploy or cutover based only on repository validation
copying production secrets, subscription URLs, SQLite data, or customer data
  into validation hosts
changing AWS, DNS, Nginx, systemd, tenant, artifact, or node state from
  validation tasks
```
