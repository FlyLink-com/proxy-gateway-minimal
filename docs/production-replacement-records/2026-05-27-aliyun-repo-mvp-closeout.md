# Aliyun Subscription Control Platform Repo MVP Closeout

Date: 2026-05-27, Asia/Shanghai.

Risk: C documentation closeout.

Scope:

```text
Close out the repository-only B/C phase of the Aliyun Subscription Control
Platform MVP.
No Aliyun deployment, DNS change, firewall change, runtime mutation, state
copy, public listener exposure, user traffic, edge traffic, or production
authority transfer is authorized by this record.
```

## Agent / Task Routing

Lead agent:

```text
Codex
```

Primary unit:

```text
Subscription Control Platform
```

Supporting units:

```text
Admin UI Agent
Validation / CI Agent
Production Operations Agent
```

Recommended next owner:

```text
Production Operations Agent for exact-phrase Aliyun A-tier execution gates.
Codex should keep global coordination, project-state hygiene, and no-secrets
review.
```

## Repo MVP Scope Completed

The repository now has a complete B/C-only implementation path for the Aliyun
subscription-control candidate:

```text
public site lead intake
  -> protected lead review queue
  -> in-memory account shell
  -> in-memory entitlement shell
  -> in-memory subscription access grant shell
  -> clean-start readiness and private rendering dry-run metadata
  -> protected Aliyun gate decision packet
  -> protected Aliyun gate evidence shell
  -> Admin Overview gate review UI
  -> exact-phrase approval policy metadata
```

This proves repository contracts, operator-safe summaries, Admin review
surfaces, and validation boundaries. It does not prove Aliyun production
activation.

## Completed Repo Packages

```text
1. Goal document and project-state orientation.
2. Platform lead queue behind public lead intake.
3. Account and entitlement shell contracts.
4. Subscription access grant shell.
5. Aliyun promotion runbook and Gate A/B planning.
6. Clean-start control-plane repo package.
7. Protected Aliyun gate decision packet.
8. Protected Aliyun gate evidence shell.
9. Admin Overview Aliyun gate review surface.
10. Next A-tier execution handoff packet.
11. Execution-record templates for the next two A-tier gates.
12. Exact Aliyun approval phrase policy helper and tests.
13. Gate packet approval policy metadata.
14. Admin Overview approval policy metadata rendering.
```

## Current Protected Surfaces

The repo-only control-plane support is intentionally operator-safe:

```text
Admin API routes are protected.
Admin Overview shows gate status, blockers, not-authorized boundaries, and
approval policy metadata.
Provider-firewall evidence can be recorded only as booleans.
Gate policy metadata shows exact-phrase, gate-bound, short-confirmation
rejection, no-submission-route, and no-execution-control facts.
```

The protected surfaces do not expose:

```text
raw approval phrase text in the UI
approval submission routes
execution controls
raw firewall rules
management-source labels
wg-home decision text
notes
portal URLs
artifact references
subscription URLs
node hosts
node credentials
tokens
customer data
```

## Validation Evidence

The repo-only MVP phase has current local validation from the latest PR window:

```text
npm run admin:test -- subscriptions.test.ts
npm run admin:test
npm run admin:build
npm test
npm run project-state:check
git diff --check origin/master...HEAD
```

GitHub-hosted Actions still fails before executing validation steps in the
current account state, so PRs record manual validation evidence when needed.

## Remaining A-Tier Gates

The next work is no longer a repo-only implementation task. It is A-tier
production-operations work and needs the exact approval phrase from the
matching runbook:

```text
Aliyun clean-start private validation:
  docs/production-replacement-records/2026-05-27-aliyun-clean-start-private-validation-runbook.md
  docs/production-replacement-records/templates/aliyun-clean-start-private-validation-execution-template.md

Aliyun provider-firewall hardening:
  docs/production-replacement-records/2026-05-27-aliyun-provider-firewall-hardening-runbook.md
  docs/production-replacement-records/templates/aliyun-provider-firewall-hardening-execution-template.md
```

Short confirmations such as `同意`, `继续`, `开始`, `ok`, or `go` are not
execution approvals.

## Not Performed

This closeout does not perform:

```text
Aliyun SSH or cloud command execution
Aliyun deployment
provider firewall or UFW mutation
DNS change
Nginx / HTTPS / systemd mutation
SQLite persistence migration
production state copy
public listener exposure
public Admin exposure
edge node rebuild
AWS start, stop, termination, or security-group mutation
user traffic movement
edge traffic movement
secret, token, subscription URL, private key, .env value, SQLite row, or
customer data recording
```

## Closeout Decision

Repository-only Aliyun Subscription Control Platform MVP support is ready for
the next A-tier decision gate.

Execution remains blocked until the operator provides the exact approval
phrase for one of the named gates and the corresponding dated execution record
is created from the matching template.
