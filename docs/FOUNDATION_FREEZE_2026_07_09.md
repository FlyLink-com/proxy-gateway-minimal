# Foundation Freeze - 2026-07-09

> Status:
> - Type: Phase foundation freeze
> - Risk: C
> - Production impact: None
> - Execution authority: Does not authorize production, Vultr, DNS, Nginx,
>   systemd, firewall, SQLite, runtime config, deploy, rollback, credential,
>   token, subscription material, payment-provider, AppsFlyer live, or
>   customer-data actions.

## Purpose

This document freezes the early-phase foundation before the next development
phase starts. It prevents future work from reopening stale carrier branches,
redefining the current source baseline, or mixing lifecycle, attribution,
frontend, runtime, and release-management decisions in one PR.

This is a repository and process freeze, not a production freeze. Drift-prone
production facts still require live verification before any Risk A action.

## Frozen Baseline

The frozen source baseline is:

- Repository: `gaoyi1020-web/proxy-gateway-minimal`
- Local checkout: `D:\Projects\proxy-gateway-minimal`
- Base branch: `master`
- Baseline commit before this freeze PR: `a00830ea docs: record mobile cta deploy`
- Current Git closeout index:
  `docs/GIT_DOCS_ARCHIVE_CLOSEOUT_2026_07_09.md`
- Historical carrier branches #364 and #381: closed, superseded, and not merge
  vehicles.

After this freeze PR merges, new work should start from the merged `master`
head, not from local worktrees, closed carriers, old artifacts, or July 8
queue documents.

## Frozen Engineering Ground Rules

- `master` is the only current source baseline.
- GitHub open PR count should be checked before starting each new work lane.
- Closed carrier branches are historical evidence only.
- Production execution records stay immutable audit evidence; do not bulk
  delete them during current-phase work.
- `package.json` remains `0.1.0`; no formal semver/version bump is declared by
  this freeze.
- Production deployment traceability continues to use `source_commit`,
  `artifact_or_release`, `artifact_sha256` where available, `release_unit`, and
  `Deploy Note`.
- Formal project versioning must be defined in a separate C-tier versioning PR
  before any future `v0.2.0` or GitHub Release is claimed.

## Frozen Product/Runtime Boundaries

The project is frozen as a modular monolith with controlled adapters:

- Control plane owns accounts, orders, entitlements, subscription artifacts,
  delivery generations, credential references, desired-state notifications,
  render gates, usage ledgers, and quota decisions.
- Data-plane nodes own protocol runtime capacity only.
- User Portal, protected Admin/Operator, CLI, and public site are adapters over
  shared domain services.
- Admin `app/plugin` wording currently means static manifest and page-owned
  modules, not an enterprise runtime plugin platform.
- Runtime upload, third-party plugin execution, App Registry publication,
  provider live activation, schema migration, and public Admin exposure remain
  out of scope until separate gates exist.

## Next Phase Work Lanes

### Operating Lifecycle

Allowed as focused B/C PRs before any production activation:

- account, entitlement, order, delivery-generation, refresh, suspend, resume,
  and audit model hardening;
- traffic quota lifecycle and redacted Admin/User Portal status surfacing;
- collector observability and failure-state reporting;
- user-facing lifecycle UX that consumes safe backend summaries.

Requires separate Risk A approval:

- production schema migration;
- production runtime mutation or service restart;
- live order creation/smoke;
- legacy query-token retirement;
- quota enforcement activation that changes live traffic supply.

### AppsFlyer And Attribution Scale-Up

Allowed as focused B/C PRs before live activation:

- provider-neutral attribution touch model;
- campaign/partner source evidence and settlement-candidate records;
- AppsFlyer disabled/dry-run adapter hardening;
- privacy, redaction, fraud/anomaly, and Admin reporting contracts.

Requires separate Risk A approval:

- AppsFlyer live credentials;
- live Web/S2S event activation;
- public campaign launch;
- provider postbacks;
- partner payout or settlement execution;
- production schema migration.

## Explicitly Not Frozen As Complete

The following are not complete just because this foundation is frozen:

- enterprise plugin platform;
- formal semver release line;
- broad SGP future-order rollout;
- legacy query-token retirement;
- payment/Niuniu live activation;
- AppsFlyer live activation;
- public Admin exposure;
- production lifecycle/quota auto-enforcement beyond already recorded gates.

## Change Control

Use the following rule for next-phase work:

- C: docs, runbooks, issue/PR indexing, release/version rules.
- B: repo-only source/tests for lifecycle, Admin/User Portal UX, attribution,
  payment adapters, and safe summaries.
- A: production, runtime, provider, schema, credential, DNS/Nginx/firewall,
  live payment, live attribution, live order, subscription material, or
  customer-data changes.

Any PR that weakens this freeze must say so explicitly in its PR body and
include validation plus the next gate.

## Validation

For this foundation freeze:

```powershell
git diff --check origin/master...HEAD
npm run project-state:check
```

No production validation or live endpoint checks are required for this C-tier
freeze record.
