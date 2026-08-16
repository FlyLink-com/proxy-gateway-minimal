# AppsFlyer Production Activation Gate Package


```yaml
document_metadata:
  doc_type: evidence
  lifecycle: historical
  authority_scope: appsflyer_production_activation_gate
  superseded_by: null
  last_verified_at: 2026-07-08
  production_authority: false
```


Date: 2026-07-08, Asia/Shanghai.

## Status

- Type: production activation gate package
- Related Linear lane: GCC-154
- Source baseline: `392756b2274f04f4f85587618a196ec5f1d46d5c`
- Risk: A for any production credential, provider, runtime, data, settlement,
  or campaign execution
- Production impact from this document: none

This package prepares the first AppsFlyer production activation gate for the
partner attribution and settlement platform. It is an approval packet and
runbook boundary only. It does not authorize production mutation, AppsFlyer
credential installation, Web SDK activation, Web-S2S dispatch, OneLink or
branded-domain creation, provider postback configuration, schema migration,
payment or entitlement mutation, partner payout, campaign launch, deploy,
DNS, Nginx, systemd, firewall, secret output, subscription material output, or
customer-data output.

Short confirmations, informal consent, or a generic "start" instruction do
not authorize this gate. The operator must provide the exact approval fields
below before any production execution.

## Entry Evidence

Use these records and source facts as the entry evidence for this package:

- `docs/PARTNER_ATTRIBUTION_SETTLEMENT_ARCHITECTURE.md` defines the
  provider-agnostic attribution, settlement, privacy, and AppsFlyer adapter
  boundaries.
- PR #378 added the disabled/dry-run AppsFlyer adapter and pilot link planning
  boundary.
- PR #379 added the local in-memory pilot fixture proof for partner,
  campaign, Portal attribution capture, backend facts, settlement candidate,
  and protected Admin summary.
- PR #380 added `buildPartnerAttributionPilotPackagePreview(...)`, a dry-run
  review package for safe landing links plus redacted Web SDK and Web-S2S
  event plans.
- Current source baseline `392756b2274f04f4f85587618a196ec5f1d46d5c` includes
  the PR #378, PR #379, and PR #380 repo-only baseline.

These records prove only repo-local readiness for review packages. They do not
prove live AppsFlyer integration, provider-side link creation, production
credential installation, production event delivery, payable settlement
approval, or broad promotion readiness.

## Boundary

GCC-154 owns production activation preparation for a controlled AppsFlyer
pilot. The platform remains the source of settlement truth. AppsFlyer may
provide provider attribution evidence only after this gate approves the exact
credential location, event surface, partner scope, and rollback path.

Allowed preparation before exact approval:

- inspect repo source and dry-run helpers;
- list required environment variable names without values;
- confirm whether approved secret locations exist using booleans only;
- review partner, campaign, creative, and landing-route refs;
- generate dry-run pilot package previews with safe refs;
- review redacted Web SDK and Web-S2S event plans;
- review privacy, fraud, and reconciliation guardrail summaries;
- prepare validation and rollback checklists.

Forbidden before exact approval:

- installing or printing real AppsFlyer keys;
- enabling live Web SDK tracking;
- sending live Web-S2S events;
- creating OneLink templates or branded domains;
- configuring AppsFlyer postbacks;
- accepting provider data as payable settlement truth;
- launching broad paid acquisition;
- mutating production schema, payment, entitlement, account, DNS, Nginx,
  systemd, firewall, node, runtime, or deploy state;
- outputting customer-private, subscription, credential, runtime, raw provider
  payload, raw log, raw env, or SQLite-row material.

## Required Approval Fields

Before execution, the operator approval must fill:

- `source_baseline`
- `target_environment`
- `appsflyer_app_ref`
- `secret_store_ref`
- `web_dev_key_secret_ref`
- `partner_refs`
- `campaign_refs`
- `creative_refs`
- `landing_routes`
- `event_names`
- `sdk_surface`
- `s2s_surface`
- `activation_mode`
- `test_click_scope`
- `validation`
- `rollback`
- complete `forbidden` list

`activation_mode` must be one of:

- `read_only_inventory_only`
- `install_credentials_disabled_mode_only`
- `activate_one_controlled_test_click`

If `activation_mode` is omitted, the allowed mode is
`read_only_inventory_only`.

## Read-Only Preflight

Stop before execution unless the preflight confirms, without sensitive output:

- Git source baseline matches the approved SHA.
- Worktree and candidate diff are clean except for the approved gate or
  activation change.
- AppsFlyer app is identified by safe app ref only.
- Required secret destination is approved by ref only; key values are not read
  or printed.
- Required environment variable names are known and absent/present status is
  recorded as booleans only.
- The pilot partner and campaign refs already exist or have an approved
  creation path in the platform attribution store.
- The pilot landing routes are approved relative Portal routes.
- Dry-run package preview passes with no stripped required fields and no
  forbidden private values.
- Web SDK event plan is limited to approved funnel events and redacted
  credential state.
- Web-S2S event plan requires a safe user identifier and records redacted
  credential state only.
- Protected Admin attribution report and guardrail summaries expose only safe
  refs, counts, labels, timestamps, and blocker codes.
- Rollback can disable provider dispatch and leave platform settlement in
  manual-review mode.

## Event Surface

Initial event names must be reviewed before activation:

| Platform event | AppsFlyer-facing intent | Activation rule |
| --- | --- | --- |
| `registration_success` | registration conversion | Optional pilot event |
| `checkout_started` | checkout initiation | Optional pilot event |
| `payment_success` | backend payment evidence | S2S only after approval |
| `entitlement_delivered` | delivered service evidence | Preferred S2S proof |
| `refund` / `chargeback` | reversal evidence | Separate policy review |

The first activation must not approve automatic payout eligibility. Provider
evidence can only help manual reconciliation. Backend payment and entitlement
facts remain mandatory for payable review.

## Allowed Scope After Exact Approval

For `read_only_inventory_only`:

- run read-only repo, AppsFlyer dashboard, secret destination, and platform
  route inventory;
- generate dry-run package previews;
- record booleans, safe refs, counts, timestamps, and hashes only.

For `install_credentials_disabled_mode_only`:

- perform the read-only inventory scope;
- install credentials only in the approved secret store;
- keep `APPSFLYER_ATTRIBUTION_MODE=disabled` or equivalent non-dispatch mode;
- restart or deploy only if the approval names the target and rollback;
- validate that live provider dispatch remains blocked.

For `activate_one_controlled_test_click`:

- perform the read-only inventory scope;
- use the approved secret store only;
- enable only the scoped SDK/S2S surface;
- issue exactly one reviewed safe test link or click path for the named pilot
  partner and campaign;
- validate Portal capture, backend event binding, provider-observable counts,
  protected Admin report, and guardrail reconciliation;
- keep settlement candidates in manual review;
- stop immediately if any private value, raw provider payload, customer data,
  subscription material, token, credential, or unexpected route is observed in
  logs, docs, Linear, Admin, or provider payload review.

## Validation

Minimum validation for any execution must prove:

- approved source baseline and activation artifact match;
- no unapproved worktree changes are included;
- secret values are not printed, committed, or copied into docs;
- public Admin remains blocked;
- Portal routes accept only approved attribution parameters;
- dry-run package preview remains privacy-safe;
- AppsFlyer adapter configuration summary redacts credential state;
- live dispatch is disabled unless the exact approval selected
  `activate_one_controlled_test_click`;
- protected Admin attribution report contains only safe summaries;
- settlement candidates remain manual-review only;
- no subscription URLs, tokens, credentials, runtime config, raw logs, raw
  provider payloads, SQLite rows, customer-private data, or payout details are
  emitted.

If one controlled test click is approved, validation must also prove:

- exactly one scoped test click path was used;
- provider-observable counts match the expected controlled event count or the
  mismatch is recorded as a blocker;
- Portal capture and backend event binding produced safe refs only;
- provider evidence does not override backend payment or entitlement truth;
- rollback disables further provider dispatch.

## Rollback

Rollback must be able to:

- restore prior runtime or deploy artifact if a deploy occurred;
- remove or disable AppsFlyer dispatch mode;
- remove, rotate, or mark inactive AppsFlyer secrets through the approved
  secret store if they were installed;
- disable or pause any provider-side pilot link or template if one was created
  under exact approval;
- leave platform attribution and settlement data in manual-review mode;
- confirm no further provider events are emitted after rollback;
- record only safe refs, counts, timestamps, status labels, and hashes.

Rollback must not delete unrelated partners, campaigns, orders, payment facts,
entitlement facts, or historical review evidence.

## Exact Approval Template

```text
Approve AppsFlyer production activation gate:
source_baseline=<exact git sha>;
target_environment=<approved production or controlled validation environment>;
appsflyer_app_ref=<safe app ref only>;
secret_store_ref=<approved secret destination ref only>;
web_dev_key_secret_ref=<secret key ref only, no value>;
partner_refs=<reviewed partner refs>;
campaign_refs=<reviewed campaign refs>;
creative_refs=<reviewed creative or placement refs>;
landing_routes=<approved relative Portal routes>;
event_names=<approved event names>;
sdk_surface=<none|approved Web SDK events>;
s2s_surface=<none|approved Web-S2S events>;
activation_mode=<read_only_inventory_only|install_credentials_disabled_mode_only|activate_one_controlled_test_click>;
test_click_scope=<none or exactly one reviewed partner/campaign/link path>;
scope=read-only inventory; dry-run pilot package preview; redacted SDK/S2S event review; approved secret-store presence checks; if activation_mode permits, install credentials only by secret ref, keep disabled mode unless one controlled test click is explicitly approved, and activate only the scoped event surface;
validation=source baseline ok, worktree clean except approved change, secret values not printed or committed, public Admin blocked, Portal params approved, dry-run preview safe, provider dispatch disabled unless explicitly approved, protected Admin report safe, settlement manual-review only, no forbidden sensitive output; if one test click approved, exactly one scoped click/event path observed and rollback disables further dispatch;
rollback=restore prior runtime/deploy if touched, disable AppsFlyer dispatch mode, remove/rotate/mark inactive secrets through approved store if installed, pause provider-side pilot assets if created, preserve manual-review settlement state, confirm no further provider events;
forbidden=DNS,Nginx,systemd,firewall,node/runtime mutation unless separately named,public Admin,broad paid acquisition,automatic payout,payment mutation,entitlement mutation,production schema migration,production data backfill,subscription URL/token/password/private-key/credential output,raw provider payload output,raw env/log/config output,SQLite row dump,customer-private data output,copying protected material into Git/docs/Linear.
```

## Handoff

After this package is reviewed, the next executable step is still an exact
Risk A approval with live read-only inventory. A successful first activation
unlocks only controlled provider attribution evidence for the scoped partner
and campaign. Broad campaign launch, payable settlement pilot, provider
postbacks, production migration/backfill, and automatic payout remain separate
gates.
