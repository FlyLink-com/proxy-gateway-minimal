# Opaque Artifact Issuance And Legacy Query-Token Retirement Runbook

Date: 2026-05-27
Timezone: Asia/Shanghai

## Status

```text
Type: Risk A runbook
Scope: subscription access model migration gates
Execution authority: none by this document
Production impact: none by this document
```

This runbook defines the next subscription-access migration gates after the
Aliyun subscription-distribution promotion. It does not issue artifacts, rotate
tokens, retire legacy access, change DNS, change Nginx, expose Admin, activate
edge traffic, mutate AWS, copy historical state, or record any secret value.

## Agent / Task Routing

```text
Lead agent: Codex
Primary unit: Subscription Access Control
Secondary units: Production Operations, Aliyun Control Platform
Follow-up agent suitability:
  - Subscription Control Foundation Agent: primary execution owner
  - Production Ops Gatekeeper: required reviewer before any A-tier execution
  - Validation / CI Agent: optional for repo-only checks and HP ci-full if code changes later
Not suitable for:
  - Channel Technical MVP Agent unless subscription output starts carrying edge protocol changes
```

## Current Documented Facts

The current documented baseline is:

```text
sub.globalcirclecat.com:
  promoted to the Aliyun public subscription-distribution boundary

Public Admin:
  blocked

No-token legacy refresh:
  rejected

Edge traffic:
  not activated

Historical AWS state copy:
  not performed

Broader opaque artifact issuance:
  not approved

Legacy query-token retirement:
  not approved
```

The earlier AWS Singapore canary proved repository and production capability
for a single opaque artifact path, but that historical canary state was not
copied into the Aliyun clean-start authority. The Aliyun promotion used a
disabled smoke tenant and must be treated as a clean-start public boundary
until a fresh live inventory proves otherwise.

## Gate Separation

Do not combine these gates.

```text
Gate A1:
  broader opaque artifact issuance for explicitly approved tenants/devices

Gate A2:
  legacy query-token retirement after artifact issuance and observation

Future gate:
  legacy route removal or compatibility shutdown
```

Gate A1 is about giving users safer refresh artifacts. Gate A2 is about draining
old query-token access. Future route removal is more disruptive and remains
out of scope for both gates.

## Sensitive Output Rules

Do not paste, commit, log, or write any of these values:

```text
raw artifact URL
raw artifact secret
raw subscription URL
raw tenant token
raw temporary token
customer email
customer organization
production .env value
SQLite row dump containing sensitive columns
cloud credential
private key
```

Allowed evidence is limited to counts, statuses, boolean checks, redacted
prefixes, and operator-safe summaries.

Repository helper:

```text
docs/ACCESS_MODEL_INVENTORY_SUMMARY.md
server/services/platform/access-model-inventory-summary.mjs
scripts/access-model-inventory-summary.mjs
```

This helper can normalize safe operator-provided inventory JSON into a redacted
preflight summary for review. It does not query production, read SQLite, issue
artifacts, retire legacy tokens, mutate runtime state, or replace the exact
approval phrases below.

## Common Read-Only Preflight

Before either execution gate, perform a fresh read-only inventory and record
only safe summaries:

```text
Repository:
  current branch / commit
  open PR status
  project-state check status

Aliyun runtime:
  proxy-gateway candidate service status
  Nginx status
  UFW status summary
  SQLite integrity check result

Public boundary:
  health endpoint status
  public Admin blocked status
  no-token legacy refresh rejection status
  3456 and 18080 not publicly reachable

Access model:
  enabled tenant count
  disabled tenant count
  active artifact count
  revoked/rotated artifact count
  legacy token support route status
  temporary-link count summary if safely queryable

Logging posture:
  Nginx artifact-path log redaction configuration present or absent
  application logs do not print raw artifact paths
  execution record contains no raw URL/token values
```

Hard stop if the inventory requires exposing raw tokens, raw artifacts, raw
customer data, or full subscription URLs in the terminal transcript, docs, PR,
or chat.

## Gate A1: Broader Opaque Artifact Issuance

### Exact Approval Phrase

Execution requires this exact phrase:

```text
Approve broader opaque artifact issuance. Allow approved-tenant artifact issuance, visible-once handoff metadata, and private/public refresh validation on the Aliyun subscription boundary. No legacy query-token route removal, no DNS change, no public Admin, no edge traffic, no AWS mutation, no historical state copy, and no raw subscription URLs or artifact secrets recorded.
```

Short confirmations such as `ok`, `go`, `continue`, `start`, or `同意` do not
authorize this gate.

### Allowed Actions

After exact approval, this gate may:

```text
issue opaque artifacts only for explicitly approved tenant/device scopes
return visible-once artifact material only through the approved operator handoff path
record non-secret artifact summaries
validate refresh behavior through the Aliyun subscription boundary
validate public Admin remains blocked
validate no-token legacy refresh remains rejected
revoke or rotate only artifacts created during this execution if rollback is needed
```

### Not Allowed

This gate may not:

```text
remove or disable the legacy query-token route
rotate legacy tenant tokens
expire legacy temporary links
change DNS
change Nginx public routing except a separately approved log-redaction fix if preflight hard-stops
expose public Admin
activate edge traffic
change subscription output to point at a new edge node
copy historical AWS state
mutate AWS
disable tenants outside the approved smoke or rollback scope
record raw artifact URLs or secrets
```

### Validation

Minimum validation evidence:

```text
created_artifact_count:
  equals approved scope

artifact_list_summary:
  shows non-secret metadata only

public_refresh:
  authorized artifact refresh returns expected subscription renderer response

public_admin:
  remains blocked

legacy_no_token:
  remains rejected

legacy_query_token_route:
  still exists unless separately approved later

logs:
  no raw artifact path recorded in execution evidence

rollback:
  created artifact revocation/rotation path verified or documented
```

## Gate A2: Legacy Query-Token Retirement

### Exact Approval Phrase

Execution requires this exact phrase:

```text
Approve legacy query-token retirement. Allow approved legacy token drain/rotation after opaque artifact validation. No /sub/clash.yaml route removal, no DNS change, no public Admin, no edge traffic, no AWS mutation, no tenant disablement outside approved scope, and no raw tokens or subscription URLs recorded.
```

Short confirmations such as `ok`, `go`, `continue`, `start`, or `同意` do not
authorize this gate.

### Preconditions

All of these must be true before Gate A2:

```text
Gate A1 execution record exists
approved tenants/devices have working artifacts
artifact refresh has an observation window or operator waiver
support path for lost-device / reissue is documented
rollback path is documented
legacy query-token route remains available for rollback unless a future route-removal gate exists
```

### Allowed Actions

After exact approval, this gate may:

```text
rotate approved tenant legacy tokens
expire approved temporary legacy links
validate artifact refresh still works
validate no-token legacy refresh remains rejected
validate public Admin remains blocked
record only safe aggregate counts and statuses
```

### Not Allowed

This gate may not:

```text
remove the /sub/clash.yaml route
disable tenants outside approved scope
change DNS
change Nginx
expose public Admin
activate edge traffic
mutate AWS
copy historical state
record raw tokens or subscription URLs
```

### Validation

Minimum validation evidence:

```text
approved_legacy_tokens_rotated_or_drained:
  safe count only

approved_temp_links_expired:
  safe count only

artifact_refresh_after_retirement:
  still passes for approved artifacts

legacy_old_token_behavior:
  rejected, described without raw token value

legacy_route_presence:
  route still exists for compatibility unless future route-removal gate is approved

public_admin:
  remains blocked

logs:
  no raw token, raw URL, or raw artifact value recorded
```

## Hard Stops

Stop immediately if:

```text
public Admin becomes reachable
health endpoint changes unexpectedly
Nginx starts logging raw artifact paths
application logs print raw tokens or artifact values
artifact refresh fails for an approved migrated device
legacy route behavior changes before Gate A2 approval
DNS differs from the approved subscription-boundary state
edge traffic is needed to validate this gate
rollback requires AWS rollback-start or clean edge activation
any command would dump sensitive SQLite rows or secrets into logs
```

## Rollback Posture

Gate A1 rollback:

```text
revoke or rotate artifacts created during the execution
leave legacy query-token route unchanged
leave DNS, Nginx, AWS, and edge traffic unchanged
```

Gate A2 rollback:

```text
prefer artifact reissue / rotation for affected devices
use legacy compatibility only if the route still exists and operator approves a scoped recovery
do not re-enable unknown historical tokens
do not start stopped AWS nodes without rollback-start approval
```

## Execution Records

Use these templates only after the matching exact approval phrase:

```text
docs/production-replacement-records/templates/opaque-artifact-issuance-execution-template.md
docs/production-replacement-records/templates/legacy-query-token-retirement-execution-template.md
```

Execution records must include:

```text
approval phrase received
preflight evidence
allowed actions actually performed
validation evidence
rollback / cleanup evidence
not-performed boundary
sensitive-output audit
```

## Decision

The next safe migration sequence is:

```text
1. Perform live read-only access-model inventory.
2. Execute broader opaque artifact issuance only after exact approval.
3. Observe artifact refresh behavior.
4. Execute legacy query-token retirement only after a second exact approval.
5. Treat route removal as a future, separate compatibility gate.
```

This document is repo-only gate material. It performs no production mutation.
