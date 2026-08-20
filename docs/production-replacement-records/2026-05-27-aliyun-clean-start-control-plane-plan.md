# Aliyun Clean-Start Control Plane Plan


```yaml
document_metadata:
  doc_type: evidence
  lifecycle: historical
  authority_scope: aliyun_clean_start_control_plane_plan
  superseded_by: null
  last_verified_at: 2026-05-27
  production_authority: false
```


Date: 2026-05-27, Asia/Shanghai.

Risk: C for this repository planning record; A for any future Aliyun, AWS, HP,
DNS, Nginx, systemd, UFW, WireGuard, provider-firewall, security-group,
SQLite, tenant, artifact, public listener, production authority, edge traffic,
or customer-facing mutation.

Branch: `codex/aliyun-clean-start-control-plane-plan`

Operator decision:

```text
同意
```

## Boundary

This record accepts the Gate B recommended default direction as a repository
planning decision:

```text
Aliyun should be planned as a clean-start subscription control plane unless the
operator later explicitly requires historical subscription state preservation.
```

Performed:

```text
reviewed the current project handoff, Aliyun runbook, and Gate B plan
defined what clean-start means for Aliyun subscription authority
defined the control-plane MVP units that must be initialized or validated
defined repo-only follow-up implementation scope
defined later Risk A gates for runtime initialization, firewall hardening,
private rendering validation, public-boundary dry run, and DNS promotion
updated repository source-of-truth docs and project-state orientation
```

Not performed:

```text
no Aliyun command execution
no AWS command execution
no HP command execution
no DNS change
no Nginx, systemd, UFW, WireGuard, provider-firewall, or security-group mutation
no service restart, start, stop, reload, or reboot
no AWS start, stop, reboot, termination, snapshot, volume attach, or volume detach
no state copy, SQLite restore, source rescue, tenant mutation, or artifact mutation
no public listener exposure
no public Admin exposure
no edge traffic activation
no production authority transfer
no secret, token, subscription URL, private key, SQLite row, .env value, or
customer data readout
```

## Agent / Task Routing

Lead agent:

```text
Codex
```

Primary unit:

```text
Subscription Control Platform Agent
```

Supporting units:

```text
Production Operations Agent for later Aliyun runtime, firewall, and promotion gates
Subscription Access Control Agent for grant/artifact/renderer authority design
Validation / CI Agent for repo and HP manual-CI evidence when required
Product Business Agent for account, lead, package, and operator workflow shape
Commercial Entitlement Agent for package/entitlement boundaries
Edge / Node Capacity Agent for later clean edge rebuild or rollback-start planning
```

Follow-up agent suitability:

```text
Subscription Control Platform Agent:
  owns the next repo-only clean-start implementation package

Production Operations Agent:
  owns any future Aliyun candidate-state initialization, firewall hardening,
  public-boundary dry run, and DNS promotion approval records

Validation / CI Agent:
  owns local and HP manual-CI validation evidence when code changes exceed C tier

Edge / Node Capacity Agent:
  owns clean forwarding edge rebuild and AWS rollback-start paths, not Aliyun
  platform authority
```

Recommended next owner:

```text
Subscription Control Platform Agent, with Production Operations Agent review
before any runtime or public-boundary approval phrase is requested.
```

## Inputs

Primary input records:

```text
docs/PROJECT_CONTEXT.md
docs/ALIYUN_USER_SUBSCRIPTION_DISTRIBUTION_RUNBOOK.md
docs/production-replacement-records/2026-05-27-aliyun-gate-b-source-firewall-plan.md
docs/production-replacement-records/2026-05-27-aliyun-gate-a-live-inventory.md
docs/production-replacement-records/2026-05-26-aliyun-sub-control-candidate-preparation.md
docs/production-replacement-records/2026-05-26-singapore-prod-edge-stop.md
```

Repository-only platform components already available:

```text
server/services/platform/control-plane-contract.mjs
server/services/platform/lead-review-queue.mjs
server/services/platform/account-entitlement-shell.mjs
server/services/platform/subscription-access-shell.mjs
server/routes/admin-platform.mjs
```

## Clean-Start Definition

Clean-start means:

```text
Aliyun becomes a new subscription-control authority without copying historical
AWS SQLite, opaque artifact, legacy query-token, or subscription-output state.
```

Clean-start does not mean:

```text
automatic preservation of old user links
automatic import of historical tenants or artifacts
public registration approval
public payment approval
public Admin exposure
edge data-plane activation
DNS promotion
runtime deployment approval
```

Operational implication:

```text
new accounts, entitlements, subscription-access grants, artifacts, and
subscription outputs must be issued from the Aliyun control plane after the
relevant private validation gates pass.
```

Business implication:

```text
old subscription continuity is intentionally not the default dependency for
the next MVP; if the business later requires continuity for historical users,
that becomes a separate state-preserving source-rescue gate.
```

## Clean-Start MVP Authority Units

The smallest useful Aliyun control-plane authority should be split into these
units:

```text
lead review:
  accept validated public lead intake and allow protected operator review

account authority:
  convert approved leads into operator-safe account summaries

entitlement authority:
  create usable package/entitlement summaries from account state and validity
  windows

subscription-access authority:
  issue operator-safe visible-once or dynamic-entry grant summaries without
  exposing raw portal URLs or raw artifact references

artifact authority:
  issue opaque artifacts only after a separate private rendering and artifact
  validation gate

subscription rendering:
  render Subscription V2 output from clean-start state privately before any
  public-boundary dry run

public distribution boundary:
  expose only approved subscription refresh/import endpoints after Gate D/E,
  never public Admin
```

## Repo-Only Implementation Package

Recommended next repo-only package:

```text
clean-start initialization shapes and tests
operator-safe clean-start decision summary
private rendering dry-run helper that redacts sensitive material
Admin UI affordance only if it stays protected and repository-only
project-state/docs synchronization
```

Required properties:

```text
no production state dependency
no SQLite migration unless separately approved as B/A depending on scope
no raw portal URL, artifact reference, token, or subscription URL in responses,
tests, fixtures, logs, or docs
fail-closed entitlement usability from status and validity windows
operator-safe summaries only
```

Suggested validation for a B-tier repo implementation package:

```text
git diff --check origin/master...HEAD
npm test
```

If Admin UI changes are included:

```text
git diff --check origin/master...HEAD
npm run admin:test
npm run admin:build
npm test
```

HP `ci-full` should be used only when the PR scope needs clean manual-CI
evidence beyond local validation.

## Later Runtime Gates

### Gate C-Start: Clean-Start Private Validation

Purpose:

```text
Prove the Aliyun candidate can initialize or hold clean-start control-plane
state and privately render subscription output without public traffic.
```

Required approval phrase:

```text
Approve Aliyun clean-start private validation. Allow candidate-only clean-start state initialization and private rendering checks on Aliyun. No DNS change, no public listener exposure, no public Admin, no edge traffic, no AWS mutation, and no historical state copy.
```

Allowed only after approval:

```text
candidate-only clean-start state initialization
candidate backup before and after validation
private loopback or tunnel validation of app health, Admin auth boundary, and
subscription rendering
candidate SQLite integrity checks without row dumps
```

Forbidden:

```text
historical AWS state copy
DNS change
public 80/443 promotion
public Admin exposure
edge traffic activation
customer-facing announcement or rollout
```

Required evidence:

```text
candidate backup metadata without data rows
candidate SQLite integrity_check result
private app health
private Admin auth boundary
private subscription rendering result with sensitive material redacted
rollback or cleanup decision for candidate-only state
```

### Provider-Firewall Hardening

The Gate B provider-firewall hardening path remains required before any public
boundary dry run. Clean-start does not weaken that requirement.

Required approval phrase is unchanged:

```text
Approve Aliyun provider firewall hardening. Restrict inbound to documented management and approved public-boundary ports only. No DNS change, no Nginx public promotion, no production authority transfer, no state copy, no user traffic, no edge traffic, and rollback by restoring the recorded provider firewall rules.
```

### Gate D/E/F

Clean-start still requires the existing promotion sequence:

```text
Gate D public-boundary dry run
Gate E DNS and production distribution promotion
Gate F observation, rollback, and cleanup decision
```

Do not combine these gates with:

```text
provider-firewall hardening
state initialization
edge rebuild
AWS rollback-start
AWS termination
legacy query-token retirement
```

## Risks And Controls

Risk:

```text
historical users lose old subscription continuity
```

Control:

```text
require explicit business acceptance before public activation; reissue
accounts/grants/artifacts through clean-start authority instead of depending
on stale AWS state
```

Risk:

```text
tracked repository config still references stopped AWS nodes
```

Control:

```text
clean-start private rendering must prove current output policy before DNS or
public distribution promotion
```

Risk:

```text
Aliyun provider firewall remains too broad
```

Control:

```text
provider-firewall hardening is a separate prerequisite before public-boundary
dry run
```

Risk:

```text
wg-home lab path remains undecided
```

Control:

```text
explicitly keep, scope, or remove wg-home before promotion decision
```

Risk:

```text
legacy query-token route still exists
```

Control:

```text
do not bundle retirement into clean-start; keep it as a separate A-tier access
model change
```

## Recommendation

Recommended sequence after this planning record:

```text
1. Build the repo-only clean-start implementation package.
2. Validate it locally, and use HP ci-full only if the implementation scope
   needs clean manual-CI evidence.
3. Request Aliyun clean-start private validation only after repo evidence is
   complete.
4. Request Aliyun provider-firewall hardening separately before any public
   boundary dry run.
5. Keep edge rebuild and AWS rollback-start as separate A-tier tracks.
```

Recommended next approval for repository implementation:

```text
Approve Aliyun clean-start control-plane repo implementation package. Repository-only code/docs/tests. No Aliyun deployment, no DNS change, no public listener, no state copy, no production traffic, no public Admin, no edge traffic, and no AWS mutation.
```

Recommended later approval for candidate runtime validation:

```text
Approve Aliyun clean-start private validation. Allow candidate-only clean-start state initialization and private rendering checks on Aliyun. No DNS change, no public listener exposure, no public Admin, no edge traffic, no AWS mutation, and no historical state copy.
```

## Validation

Repository validation for this planning record:

```text
npm run project-state:check
git diff --check origin/master...HEAD
```

Runtime validation is not performed by this record.
