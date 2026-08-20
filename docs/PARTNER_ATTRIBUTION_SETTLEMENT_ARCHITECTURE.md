# Partner Attribution and Settlement Architecture

Last updated: 2026-07-07, America/Los_Angeles.

```yaml
document_metadata:
  doc_type: canonical
  lifecycle: active
  authority_scope: partner_attribution_settlement_architecture
  superseded_by: null
  last_verified_at: 2026-07-07
  production_authority: false
```


> Status:
> - Type: Active architecture and task-line baseline
> - Risk: C for this document
> - Execution authority: Does not authorize code changes, AppsFlyer
>   credentials, provider postbacks, Web SDK activation, S2S events, payment
>   mutation, production schema migration, partner payout, live settlement,
>   public campaign launch, DNS, Nginx, systemd, runtime, SQLite, secret,
>   token, subscription URL, credential, or customer-data actions
> - Production impact: None
> - Source of truth for: Partner attribution vocabulary, settlement ownership,
>   provider-adapter boundaries, privacy rules, and implementation task lines

## Purpose

This document defines the long-term attribution and partner settlement
foundation for `proxy-gateway-minimal`.

It intentionally avoids a one-off AppsFlyer integration. AppsFlyer is only the
first attribution provider adapter. Settlement truth must remain in the
platform's own backend facts:

```text
account registration
  -> order creation
  -> payment success
  -> entitlement delivery
  -> refund / reversal / risk review
  -> settlement candidate
  -> reviewed payout decision
```

Attribution providers supply evidence about where a user came from. They do not
decide whether a partner is payable.

## Current Product Stage

Current stage:

```text
controlled acquisition and attribution instrumentation
```

This means the project should start recording partner/campaign source evidence
and preparing settlement ledgers before paid acquisition expands.

It does **not** mean:

- scaled paid acquisition is approved;
- affiliate payouts are approved;
- AppsFlyer production keys may be installed;
- live AppsFlyer Web SDK or S2S events may be enabled;
- settlement candidates may become automatic payouts;
- production schema migration is approved;
- customer/private/subscription/runtime material may be sent to a provider.

## Core Decision

Build a provider-agnostic platform context inside the current monolith first.

```text
Partner / campaign setup
  -> acquisition link / provider evidence
  -> attribution touch ledger
  -> account and order attribution binding
  -> backend-confirmed commercial events
  -> settlement candidate engine
  -> protected Admin reconciliation
  -> separate A-tier production activation
```

Do not start with:

- a separate repository;
- a separate database;
- a queue or event bus;
- a microservice;
- AppsFlyer-specific settlement logic;
- client-side-only payable state.

Extraction can be reconsidered later if event volume, finance ownership, or
multi-product separation justifies it.

## Domain Ownership

### Product Business

Owns:

- partner-facing product promises;
- acquisition experiment scope;
- acceptable customer journey;
- conversion funnel vocabulary.

Does not own:

- payment truth;
- settlement truth;
- runtime access;
- provider credentials.

### Commercial / Entitlement

Owns:

- package entitlement;
- order state;
- payment state;
- refund/reversal state;
- commercial eligibility for settlement.

Produces facts consumed by settlement:

```text
payment_success
entitlement_delivered
refund
chargeback
risk_rejected
```

### Partner Attribution

Owns:

- partner and campaign identity;
- first-touch, last-touch, and session-touch evidence;
- provider-normalized attribution metadata;
- account/order attribution binding.

Does not own:

- payment success;
- entitlement delivery;
- payout approval.

### Partner Settlement

Owns:

- settlement policy interpretation;
- payable candidate generation;
- freeze-period transitions;
- reversals;
- safe Admin reconciliation views.

Does not own:

- automatic finance transfer;
- provider attribution truth;
- runtime access.

### Provider Adapters

Own:

- mapping external provider signals into the platform attribution model;
- redaction and payload safety;
- disabled/dry-run behavior;
- provider-specific validation and evidence summaries.

Adapters must not decide payout eligibility.

## Canonical Entities

### Partner

Represents a promoter, agency, affiliate, private channel, or internal campaign
owner.

Recommended fields:

```text
partner_ref
status
risk_tier
default_attribution_window
default_payout_policy_ref
safe_display_name
created_at
updated_at
```

Rules:

- `partner_ref` is the public-safe internal identifier.
- Legal name, contract terms, payment account details, and private contact
  details do not belong in provider payloads or routine Admin summaries.
- A disabled partner may keep historical attribution but cannot generate new
  payable candidates.

### Campaign

Represents a partner-owned acquisition lane.

Recommended fields:

```text
campaign_ref
partner_ref
status
provider
provider_campaign_id
landing_route
allowed_params
attribution_window
created_at
updated_at
```

Rules:

- Campaign source parameters must be normalized into safe fields.
- Unknown parameters can be retained only as redacted diagnostics if they pass
  the privacy boundary.
- Campaign status controls whether new touches are accepted.

### Attribution Touch

Represents one normalized acquisition source observation.

Recommended fields:

```text
touch_ref
provider
partner_ref
campaign_ref
visitor_ref
session_ref
provider_click_ref
source
medium
landing_route
touch_type
observed_at
expires_at
idempotency_key
metadata_summary
```

Allowed `touch_type` values:

```text
first_touch
last_touch
session_touch
provider_callback
manual_adjustment
```

Rules:

- `visitor_ref` and `session_ref` must be platform-safe identifiers.
- Provider click IDs are evidence, not settlement truth.
- Raw provider payloads should not be stored unless a provider-specific review
  proves they contain no sensitive data.

### Attribution Binding

Links attribution evidence to backend facts.

Recommended bindings:

```text
account_ref -> first_touch_ref / last_touch_ref
order_ref -> selected_touch_ref / account_ref
payment_ref -> order_ref
entitlement_ref -> order_ref
```

Rules:

- Account registration may bind first-touch and last-touch evidence.
- Order creation may snapshot the selected attribution touch.
- Payment and entitlement events should not accept client-supplied partner
  claims.
- Backfills require a separate reviewed policy.

### Event Ledger Entry

Append-only normalized event record used by reporting and settlement.

Recommended fields:

```text
event_ref
event_type
source
account_ref
order_ref
payment_ref
entitlement_ref
partner_ref
campaign_ref
touch_ref
occurred_at
recorded_at
idempotency_key
status
metadata_summary
```

Rules:

- Events are append-only.
- Duplicate inputs must collapse by idempotency key.
- Unsafe metadata is rejected or reduced to a redacted summary.
- Event ledger entries do not themselves execute payouts.

### Settlement Policy

Defines how backend-confirmed facts become payable candidates.

Policy vocabulary:

```text
cpa_registration
cpa_first_payment
cps_first_payment_percent
cps_renewal_percent
flat_entitlement_delivery
tiered_revenue_share
manual_review_only
```

Rules:

- Registration-only payout should be disabled by default because it is easier
  to abuse.
- Production settlement should prefer payment plus entitlement delivery.
- Policy changes need audit history.

### Settlement Candidate

Reviewable payable unit generated from backend facts.

Recommended fields:

```text
candidate_ref
partner_ref
campaign_ref
account_ref
order_ref
payment_ref
entitlement_ref
policy_ref
gross_amount
currency
candidate_amount
status
freeze_until
created_from_event_ref
idempotency_key
created_at
updated_at
```

Allowed statuses:

```text
pending_freeze
review_required
payable
held
reversed
rejected
paid_externally
```

Rules:

- Candidate creation must be idempotent.
- Candidate status must be reversible.
- `paid_externally` records a reviewed finance action; it must not execute
  money movement by itself.

### Reversal

Records a settlement-impacting negative event.

Sources:

```text
refund
chargeback
duplicate_payment
entitlement_rollback
risk_rejected
manual_adjustment
```

Rules:

- Reversals should link to the original candidate when possible.
- If payout was already marked `paid_externally`, the reversal becomes a
  payable-negative or manual reconciliation item.

## Attribution Rules

### First Touch

First touch answers:

```text
Which accepted partner/campaign first introduced this visitor or account?
```

Use for:

- acquisition source reporting;
- partner influence diagnostics;
- long-window conversion analysis.

Do not use first touch alone as payout truth unless a policy explicitly says
so.

### Last Touch

Last touch answers:

```text
Which accepted partner/campaign most recently influenced registration or order?
```

Use for:

- default campaign reporting;
- payment conversion reporting;
- settlement candidate attribution when no better policy exists.

### Session Touch

Session touch answers:

```text
Which source drove the current browser/session action?
```

Use for:

- checkout-start reporting;
- landing-page experiment analysis;
- short-window conversion analysis.

### Conflict Resolution

Recommended default:

```text
1. If an order has an explicit selected_touch_ref, use it.
2. Else use account last_touch if within the campaign attribution window.
3. Else use account first_touch if within the campaign attribution window.
4. Else mark unattributed.
```

Manual override is allowed only through a protected Admin/operator review path
and must emit an audit event.

### Attribution Windows

Default windows should be policy data, not hard-coded.

Initial defaults:

```text
visit to registration: 30 days
registration to payment: 30 days
payment to entitlement: same order lifecycle
renewal attribution: explicit policy required
```

## Event Catalog

| Event type | Source of truth | Settlement role | Provider upload |
| --- | --- | --- | --- |
| `visit` | Portal attribution capture | Reporting only | Optional Web SDK |
| `registration_success` | Portal registration service | Lead quality, normally non-payable | Optional |
| `checkout_started` | Portal checkout route | Funnel reporting only | Optional |
| `payment_success` | Verified payment/backend state | Candidate prerequisite | S2S candidate evidence |
| `entitlement_delivered` | Backend entitlement/delivery state | Default final candidate trigger | S2S candidate evidence |
| `refund` | Payment/backend state | Reversal | Optional S2S negative event |
| `chargeback` | Payment/backend state | Reversal / risk | Optional S2S negative event |
| `risk_rejected` | Operator/risk review | Reversal or candidate rejection | Usually no |
| `settlement_candidate_created` | Settlement service | Audit/reporting | No |
| `settlement_reversed` | Settlement service | Audit/reporting | No |

Default payable trigger:

```text
payment_success
  + entitlement_delivered
  + no refund / chargeback / risk_rejected
  + freeze period elapsed
```

## Provider Adapter Contract

Each provider adapter should expose a narrow seam:

```ts
type AttributionProviderAdapter = {
  provider: string;
  normalizeLandingParams(input): NormalizedAttributionEvidence;
  buildBrowserEvent?(input): SafeProviderEvent;
  buildServerEvent?(input): SafeProviderEvent;
  summarizeConfig(input): SafeProviderConfigSummary;
};
```

Adapter rules:

- provider-specific IDs stay in adapter metadata;
- core settlement logic receives normalized safe refs;
- adapters default to disabled/dry-run unless explicitly enabled;
- adapters must provide safe config summaries without returning secret values;
- adapters must reject or redact forbidden data.

## AppsFlyer Adapter Boundary

AppsFlyer should be the first adapter because it can support campaign links,
Web attribution, and backend S2S reporting.

Current repo status:

- `server/services/platform/appsflyer-attribution-adapter.mjs` implements the
  disabled/dry-run adapter boundary.
- `APPSFLYER_ATTRIBUTION_MODE=disabled` is the default placeholder mode.
- The adapter can normalize safe OneLink/Web attribution parameters.
- The adapter can build redacted dry-run pilot partner-link plans for approved
  portal landing routes without creating AppsFlyer links or calling provider
  APIs.
- The adapter can build redacted dry-run Web SDK and Web-S2S event plans.
- The dry-run Web-S2S plan follows the current safe shape for
  `POST https://webs2s.appsflyer.com/v1/{bundleId}/event`: `eventType` is
  fixed to `EVENT`, `eventName` is explicit, `webDevKey` is represented only as
  a redacted credential field, and at least one safe user identifier
  (`customerUserId` or `afUserId`) is required.
- Live dispatch is blocked unless a separate production gate explicitly allows
  it.

Allowed in repo-only work:

- normalize OneLink or Web attribution parameters;
- build pilot partner-link plans using safe relative portal paths and reviewed
  query parameters;
- define event-name mapping;
- build dry-run Web SDK event plans;
- build dry-run S2S payload summaries;
- add placeholder env names and disabled-mode config checks;
- test that no secret or subscription/runtime material is emitted.

Not allowed without separate A-tier approval:

- install real AppsFlyer keys;
- enable live Web SDK tracking;
- send live S2S events;
- configure provider postbacks;
- accept provider reports as settlement truth;
- upload customer-private data, subscription URLs, tokens, node credentials, raw
  runtime config, SQLite rows, or passwords.

Suggested event mapping:

| Platform event | AppsFlyer-facing event intent | Notes |
| --- | --- | --- |
| `visit` | landing/session event | Optional; no payout |
| `registration_success` | registration conversion | Lead quality only |
| `checkout_started` | checkout initiation | Funnel only |
| `payment_success` | purchase/payment evidence | Backend S2S only |
| `entitlement_delivered` | subscription/service activation | Preferred settlement evidence |
| `refund` / `chargeback` | revenue reversal | Backend S2S only after policy review |

## Pilot Partner-Link Dry-Run Baseline

The first controlled promotion slice should use platform-owned Web links, not
OneLink templates or branded-domain creation.

Current repo-only helper:

```text
createAppsFlyerAttributionAdapter().planPilotLink(...)
```

It returns:

- a relative `landingPath` only, such as an approved `/portal/...` path with
  query parameters;
- safe `queryParams` and `queryParamKeys`;
- stripped parameter names when unsafe or unexpected values are supplied;
- `dryRun: true`, `dispatchBlocked: true`, and `productionGateRequired: true`.

It does not:

- create an AppsFlyer link;
- create a OneLink template;
- create or mutate a branded domain;
- send Web SDK or Web-S2S events;
- store credentials or output provider keys.

Initial parameter contract:

| Parameter | Meaning | Owner |
| --- | --- | --- |
| `pid` | AppsFlyer media source / partner ref | Adapter |
| `c` | AppsFlyer campaign ref | Adapter |
| `partner_ref` | Platform partner ref for portal capture | Platform |
| `campaign_ref` | Platform campaign ref for portal capture | Platform |
| `af_channel` | Safe channel class, initially `partner` | Adapter |
| `af_sub1` | Platform-safe partner ref duplicate for provider evidence | Adapter |
| `af_sub2` | Optional creative or placement ref | Operator |
| `utm_source` | Partner ref for non-provider analytics | Adapter |
| `utm_medium` | Medium, initially `partner` | Adapter |
| `utm_campaign` | Campaign ref for non-provider analytics | Adapter |
| `utm_content` | Optional creative or placement ref | Operator |

Approved initial landing routes:

```text
/portal/register
/portal
```

The first pilot should issue only reviewed links for named partners and
campaigns already registered in the platform attribution store. Settlement
remains manual review only until a separate A-tier activation record approves
live provider dispatch and payable settlement handling.

Current local closed-loop fixture:

```text
createPartnerAttributionPilotFixture().runClosedLoopProof(...)
```

It uses one in-memory SQLite database to seed a safe partner, campaign, and
settlement policy; generate a dry-run AppsFlyer pilot link; capture Portal
attribution; bind registration, checkout, payment success, and entitlement
delivery; create a settlement candidate; and return a protected Admin report
summary. It returns only safe refs, counts, reconciliation status, stripped
parameter names, and guardrail summaries.

It does not install AppsFlyer credentials, call provider APIs, enable Web SDK
or S2S dispatch, create OneLink assets, mutate production data, approve a
payout, or return customer-private, subscription, credential, runtime, or raw
provider payload values.

Current pilot package preview helper:

```text
buildPartnerAttributionPilotPackagePreview(...)
```

It prepares a reviewable promotion package for approved partner, campaign, and
creative refs. The preview contains safe relative landing links, dry-run Web
SDK and Web-S2S event plans, stripped parameter names, stripped event-value
keys, and a protected Admin-facing summary of required reviews. It is intended
to let operators review the exact link and event surface before any A-tier
production activation.

It does not create provider-side links, send AppsFlyer events, install or
return credentials, create OneLink or branded-domain assets, mutate platform
state, approve payout eligibility, or expose raw customer/private material.

## Portal Capture Boundary

Portal may capture attribution parameters on approved public/customer routes:

```text
/portal/register
/portal
future approved landing pages
```

Allowed parameters:

```text
partner_ref
campaign_ref
pid
c
af_sub1
af_sub2
utm_source
utm_medium
utm_campaign
utm_content
utm_term
```

Rules:

- normalize parameters immediately;
- reject unexpected executable/control parameters;
- bind safe attribution to visitor/session/account/order refs;
- never trust client-supplied payment, entitlement, or settlement claims;
- do not store raw query strings if they may contain private or secret values.

## Settlement Engine Boundary

The settlement engine consumes event ledger entries and backend state. It does
not call payment providers, attribution providers, or finance systems directly.

Allowed:

- create pending settlement candidates;
- mark candidates held/rejected/reversed;
- expose safe review summaries;
- produce manual finance export previews behind a later gate.

Not allowed:

- execute payouts;
- mutate payment records;
- mutate entitlement records;
- contact AppsFlyer as a source of payable truth;
- bypass freeze periods or review gates.

## Admin Reporting Boundary

Protected Admin may show:

- partner/campaign funnel counts;
- attribution source summaries;
- payment and entitlement conversion counts;
- candidate statuses;
- guardrail reconciliation status and blocker codes;
- reversal summaries;
- reconciliation warnings.

Protected Admin must not show:

- subscription URLs;
- raw artifact material;
- tokens;
- credential material;
- raw runtime config;
- raw provider payloads with private data;
- SQLite row dumps;
- passwords;
- payout account details.

Admin reports should label evidence clearly:

```text
provider attribution evidence
backend payment fact
backend entitlement fact
settlement candidate status
manual review status
guardrail reconciliation status
```

## Privacy Boundary

Forbidden everywhere in provider payloads, Linear issues, docs, logs, Admin
tables, and routine test snapshots:

- secrets;
- tokens;
- subscription URLs;
- opaque artifact material;
- protocol credentials;
- raw runtime config;
- raw logs that include credentials or customer-private details;
- SQLite rows or dumps;
- passwords;
- private payment account details;
- customer-private contact data.

Allowed:

- safe refs;
- counts;
- status labels;
- timestamps;
- redacted metadata summaries;
- currency and amount where a payment policy approves reporting.

Current repo-only guardrail baseline:

- `server/services/platform/partner-attribution-guardrails.mjs` centralizes the
  forbidden-data scanner, fraud/abuse signal summary, and settlement
  reconciliation review.
- The scanner returns finding labels, paths, and blocker codes only; it must not
  return raw matched values.
- Admin attribution reporting includes candidate-level reconciliation status,
  manual-review booleans, matched evidence labels, and blocker codes.
- Missing provider evidence may require manual review, but it is not by itself a
  production enforcement switch.
- Backend payment and entitlement facts remain mandatory before a candidate can
  be surfaced as payable-review allowed.

## Storage Boundary

Initial implementation should live inside the current monolith:

```text
server/services/platform/partner-attribution/*
server/services/platform/partner-settlement/*
server/routes/admin-*.mjs for protected Admin summaries when needed
admin/src/* for protected Admin reporting only
```

Schema or durable storage work remains B/A boundary:

- B for repo-only tests, fixtures, and model helpers;
- A for production SQLite migration, data backfill, or live settlement state.

## Risk Gates

| Work | Risk | Required validation |
| --- | --- | --- |
| Architecture/docs baseline | C | `git diff --check origin/master...HEAD` |
| Repo-only services and tests | B | focused tests plus `npm test` |
| Admin reporting with backend DTOs | B | `npm run admin:test`, `npm run admin:build`, `npm test` |
| Privacy/fraud/reconciliation guardrail baseline | B | guardrail tests, Admin report tests, `npm run admin:test`, `npm run admin:build`, `npm test` |
| Placeholder env names / disabled adapter | B | redaction tests plus `npm test` |
| Production credentials | A | exact approval, secret-location review, rollback |
| Live AppsFlyer Web/S2S | A | dry-run payload review, controlled activation, reconciliation |
| Production schema migration | A | migration plan, backup, validation, rollback |
| Payable settlement pilot | A | controlled partner scope, manual review, reversal plan |
| Automatic payout | A+ / future | separate finance/security/legal gate |

## Implementation Task Lines

Linear project: `Partner Attribution & Settlement Platform`.

Initial task map:

- `GCC-145` - platform baseline and task-line owner.
- `GCC-146` - architecture and contract baseline.
- `GCC-147` - partner, campaign, and attribution persistence model.
- `GCC-148` - attribution event ledger and idempotency service.
- `GCC-149` - Portal attribution capture and backend fact binding.
- `GCC-150` - settlement candidate engine, freeze period, refunds, and
  reversals.
- `GCC-151` - AppsFlyer adapter in disabled/dry-run mode. Initial repo-only
  adapter is implemented with redaction tests; live AppsFlyer Web/S2S remains
  gated.
- `GCC-152` - protected Admin attribution and settlement review reporting.
- `GCC-153` - privacy, fraud, abuse, and reconciliation guardrails. Repo-only
  baseline adds reusable forbidden-data scanning, fraud signal summary,
  provider/backend settlement reconciliation, and safe Admin guardrail summary.
  It does not activate production enforcement, live provider calls, partner
  payouts, or customer-private exports.
- `GCC-154` - production activation gate.
  First repo-only slice adds dry-run pilot-link planning for approved portal
  routes and keeps all live AppsFlyer credentials, provider dispatch, OneLink
  creation, branded-domain setup, broad promotion, and payable settlement
  execution behind the production gate. The production activation gate package
  is recorded in
  `docs/production-replacement-records/2026-07-08-appsflyer-production-activation-gate.md`;
  it is an approval packet only and does not authorize production mutation.

Recommended order:

```text
GCC-146
  -> GCC-147 + GCC-148
  -> GCC-149
  -> GCC-150
  -> GCC-151
  -> GCC-152
  -> GCC-153 cross-check
  -> GCC-154 only after clean validation
```

## Open Questions

These should be answered before production activation, not before repo-only
architecture work:

1. What is the default attribution window for each partner type?
2. Which events are visible to partners versus internal Admin only?
3. Should registration-only payout ever be allowed, or always manual review?
4. What freeze period is required before `payable` status?
5. Which partner risk signals are safe and appropriate to collect?
6. What finance export format is acceptable if payouts remain manual?
7. How should renewals attribute when a user returns through a different
   campaign?

## Hard Stops

Stop and open a separate A-tier gate if work requires any of the following:

- real AppsFlyer credentials;
- live provider postback/S2S configuration;
- production schema migration;
- production data backfill;
- payment mutation;
- automatic entitlement changes;
- live settlement or payout;
- broad paid acquisition launch;
- any customer-private or subscription/runtime material crossing provider,
  docs, Linear, log, or Admin boundaries.
