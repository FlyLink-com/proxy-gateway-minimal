# Commercial Feature Integration Gate

```yaml
document_metadata:
  doc_type: canonical
  lifecycle: active
  authority_scope: commercial_feature_integration
  superseded_by: null
  last_verified_at: 2026-07-22
  production_authority: false
```

> Status:
> - Risk: C for this governance contract
> - Production authority: None
> - Applies to: Coins, Subscription, Billing, Referral, Marketplace, and future commercial features

## Purpose

This gate prevents agents and contributors from choosing the easiest
buildable frontend instead of the system currently serving users and
operators.

The mandatory order is:

```text
Production identity
  -> business flow mapping
  -> domain and policy contract
  -> UI integration
  -> production-like validation
  -> release gate
```

No later stage can substitute for an earlier one.

## Stage 0: Production Surface Discovery

**Code changes are prohibited.**

Required inputs:

- production URLs for every affected frontend surface;
- read-only HTTP and browser access;
- current release/artifact records;
- exact candidate source head.

Required output:

- `docs/PRODUCTION_SURFACE_REPORT.md` for affected production surfaces;
- `docs/ACTIVE_FRONTEND_MAP.md`;
- an explicit reason for each Portal, Admin, or other surface marked
  `not_applicable`.

Pass criteria for each affected surface:

```text
URL
  -> deployment/current pointer
  -> immutable artifact + SHA-256
  -> Git commit
  -> build entry
  -> source path
```

Also record:

- authenticated information architecture;
- navigation owner;
- current user/operator path;
- archive, legacy compatibility, preview, and experiment exclusions;
- previous artifact and rollback identity.

If any identity link is missing:

```text
stage_0: blocked
frontend_edits: prohibited
```

## Stage 1: Existing Business Journey Mapping

The question is not “where should the new page go?”

The required questions are:

- Which existing production screens does a user traverse to complete one
  purchase?
- Which existing production screens does an operator traverse to review and
  resolve one exception?
- Which object owns each step?
- Which current route, role, permission, and navigation group owns it?

Required output:

- user journey from login through order, entitlement, and delivery;
- operator journey from payment evidence through reconciliation and exception
  handling;
- object ownership and API/read-model map;
- explicit gaps and non-goals.

Pass criteria:

- no second Portal or Admin shell;
- no duplicated navigation;
- every new capability has one existing owner or an explicitly approved new
  owner;
- authenticated and authorization boundaries are recorded.

## Stage 2: Domain And Commercial Policy Contract

Required checks:

- domain model and current commercial-policy authority agree;
- recharge, purchase, refund/reversal, settlement, and fulfillment meanings are
  separated;
- idempotency and uncertainty behavior are explicit;
- durable versus in-memory behavior is explicit;
- source-only versus production-live flags are explicit;
- provider, schema, webhook, payout, and runtime boundaries are classified.

Pass criteria:

- unresolved policy conflicts are blocked, not silently resolved in UI code;
- DTOs are provider-neutral and fail closed;
- no frontend owns ledger, pricing, routing, settlement, or entitlement
  decisions;
- production gaps have named future gates.

## Stage 3: UI Integration

Implementation may start only after Stages 0-2 pass.

Required rules:

- extend the existing affected production Portal/Admin source;
- reuse the existing shell, navigation, routes, design tokens, permissions, and
  responsive conventions;
- replace or migrate old content explicitly instead of rendering two
  workspaces together;
- keep fixtures and previews explicit and non-production;
- preserve safe-summary and read-only boundaries.

Prohibited:

- new Portal shell;
- new Admin dashboard;
- second navigation;
- archive or legacy compatibility integration;
- demo workspace as production entry;
- fixture-derived production structure;
- source-string or JSDOM-only integration acceptance.

## Stage 4: Production-Like Validation

Required evidence:

- real built artifacts for every affected frontend surface;
- authenticated browser journeys with synthetic/non-private data;
- same-state, same-viewport comparison with production baselines;
- desktop, tablet, and mobile checks;
- one primary workspace and no duplicated main content;
- keyboard, focus, loading, empty, error, uncertainty, and retry boundaries;
- non-empty Wallet, Store, Recharge, Orders, Referral, Payment Logs, and
  exception fixtures where applicable;
- console and network-error review;
- security and redaction tests;
- exact-head full regression.

Unit tests, JSDOM, string searches, CI, and screenshots are supporting evidence.
None alone proves production integration.

## Stage 5: Release Gate

Stage 5 delegates to the existing Source, Merge, Artifact, and Production Gates
in `RELEASE_MANIFEST.md`; it does not redefine or weaken them.

Required evidence:

- exact reviewed source head;
- immutable artifact manifests and SHA-256 for every affected frontend surface;
- durable artifact retrievability;
- target deployment and previous artifact;
- business, visual, security, and accessibility-risk validation;
- Deploy Note and rollback plan;
- separate Risk A operator approval for production promotion.

A merge or green CI run does not pass Stage 5.

## Gate State Contract

Use these values:

```text
blocked_identity
identity_confirmed
journey_mapped
contract_ready
ui_integrated
production_like_validated
release_candidate
deployed
```

State advances only with recorded evidence. A later failure moves the feature
back to the earliest failed gate.

Recommended PR metadata:

```yaml
commercial_feature: <stable name>
foundation_state: <not_started|partial|source_complete>
production_surfaces:
  portal: <confirmed|blocked|not_applicable>
  admin: <confirmed|blocked|not_applicable>
  not_applicable_reasons: []
journey_state: <not_mapped|mapped>
domain_contract_state: <blocked|ready>
ui_integration_state: <not_started|blocked|integrated>
production_like_validation: <not_run|failed|passed>
production_state: not_deployed
```

## Current PR #526 Gate Result

| Gate | Result | Meaning |
| --- | --- | --- |
| Production identity | `FAILED/BLOCKED` | Portal and Admin live assets are not bound to deployment, artifact, commit, and source. |
| Business journey | `NOT_COMPLETED` | Existing production purchase and exception-handling paths are not fully mapped. |
| Domain contract | `PARTIAL` | Source foundation is healthy; production durability and policy alignment remain open. |
| UI integration | `REJECTED` | Existing frontend acceptance did not prove production integration. |
| Production-like validation | `NOT_COMPLETED` | CI and component tests do not replace real production-baseline validation. |
| Release | `BLOCKED` | Task 11 cannot close the Draft. |

Allowed current action:

```text
preserve_backend_foundation
perform_read_only_surface_discovery
map_existing_journeys
```

Forbidden current action:

```text
continue_frontend_implementation
mark_tasks_8_to_10_production_accepted
mark_source_complete
ready_or_merge
deploy
```

## Validation

For docs-only gate changes:

```powershell
npm run docs:authority:check
git diff --check origin/master...HEAD
```

Any code, schema, provider, deployment, or production work must be reclassified
under `AGENTS.md`.
