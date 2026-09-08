# Portal referral distribution release

```yaml
document_metadata:
  doc_type: operational
  lifecycle: active
  authority_scope: portal_referral_distribution_release
  superseded_by: null
  last_verified_at: 2026-09-08
  production_authority: false
```

Risk: A. Process: finish the existing PR #722, reuse unchanged source evidence,
validate the new distribution-only boundary, then perform one approved release.
Expected PR count: 1. Release units: `control-plane-app`, `portal-static`.
`frontend_surface: portal`; `identity_impact: false`.

## Approved distribution scope

The operator requested completion of user-facing referral distribution followed
by production release on 2026-09-08. This slice makes a stable referral link,
copy/QR sharing and registration attribution usable without opening the reward
program. It does not publish a reward rate, start reward settlement, adjust
balances, or change orders, entitlements or runtime identities.

The operator selected a 60-day registration-attribution window after reviewing
the Exa comparison. This is an explicit business decision, not a value inferred
from test fixtures or an industry-default claim. A later operator decision
approved a 20% first-recharge reward, seven-day delay, downward rounding and
automatic verification/settlement. That added reward activation scope is
tracked in `PORTAL_REFERRAL_REWARD_RELEASE.md`; it does not turn the earlier
distribution-only acceptance into evidence that rewards can already be released.

## Configuration contract

- `PLATFORM_PORTAL_REFERRALS_ENABLED=true` admits link distribution and
  registration attribution only after the existing prerequisites and explicit
  referral schema validation pass.
- `PLATFORM_PORTAL_REFERRAL_ATTRIBUTION_DAYS` is an explicitly selected integer
  from 1 to 365 for distribution-only mode. Missing or invalid input fails
  startup admission; there is no production fallback. The selected value is 60.
- `PLATFORM_PORTAL_REFERRAL_REWARDS_ENABLED=false` is the default and the only
  allowed production value for this slice. It must prevent recharge reward
  hooks, reconciliation scans and reward confirmation, even if a policy exists.
- A later separately enabled reward program uses its reviewed immutable policy
  and original first-recharge time. A first recharge whose original timestamp
  has no policy remains ineligible; a later policy or second recharge must not
  replace that original eligibility decision.

The user page shows actual attributed registrations and the sharing controls in
distribution mode. It does not show invented zero first-recharge performance or
promise rewards while the reward program is closed. Old three-field profile
responses remain readable; new responses carry the effective attribution window.

## Existing release evidence to reuse, not replay

The local completed-event records for #719, #721 and #723 identify the release
pattern and affected units. They do not prove current host state:

- #719 recorded a coordinated backend/Portal release with backup and code/static
  rollback. Its bound execution and continuation packets have been consumed.
- #721 recorded a later backend replacement while preserving the Portal.
- #723 added a separate full-metering collector and kept the Singapore TUIC
  sidecar. A later database write boundary must include
  `gccgw-full-metering-collect.timer/service`, not only the older main collector
  and sidecar names from the #719 packet.

The existing backend/static exchange engine assumes unchanged schema. Referral
schema application is an explicit added step; do not bypass its schema check or
pretend the old engine already performs this migration.

## Execution checklist

1. Freeze the reviewed source and verify current PR checks. Reuse the valid
   unchanged tests; run targeted new distribution tests and the affected build
   checks. Keep the real Portal entry and payment configuration binding.
2. Read current app and static pointers, service/process identity, protected
   origin configuration, database location/schema, all database writers and
   available backup/rollback releases. Export safe status and hashes only.
3. Verify how the actual Portal vhost routes `/r/:code`, `/portal/register` and
   `/api/portal/referral/*`. Landing must reach the backend, retain the exact
   Host, and return a no-store 303 plus the secure host-only attribution cookie.
   Registration must serve the real Portal app. Inspect proxy behavior instead
   of inferring it from the local Vite `/api` proxy. Any required Nginx change
   must be explicitly included in the target mutation boundary before execution.
4. Build the exact merged source and immutable Portal output with the active
   payment-origin binding, not the default-empty CI payment configuration.
   Verify and retain artifacts and the previous compatible release.
5. Bind the approved attribution-days value, exact target, source, artifacts,
   writer set and migration ID/checksum to this release. Do not replay consumed
   execution or continuation packets from earlier deployments.
6. Quiesce the enumerated writers, confirm no unowned writer remains, create
   and verify a new protected snapshot on the target, and perform the referral
   migration dry-run against an in-memory snapshot. Do not copy production
   environment files or databases to the workstation or validation host.
7. Apply the exact additive referral migration once, install the distribution
   settings with rewards disabled, switch the compatible backend and Portal,
   and check health, static/config hashes, route ownership and feature readback.
   Restore each timer/service to its recorded prior state, not an assumed one.
8. Record the final status and a compact Deploy Note in #722. A transport timeout
   is an unknown execution result: read back the owned receipt before taking any
   next action, and do not repeat a consumed Apply.

## Validation and rollback boundary

Use synthetic local fixtures to prove stable links, attribution window edges,
same-origin/Host checks, cookie preservation, same-transaction registration,
account isolation, no financial writes and no automatic reward timer when
rewards are disabled. Retain the existing reward-mode regressions with explicit
enablement. Local fixtures do not establish browser or production behavior.

On a confirmed application/static failure, disable distribution/rewards and use
the verified compatible code/static rollback path. Keep the additive schema and
all registration/financial history. Database restore is a separate decision,
never the default way to roll back application code. A failed or uncertain
migration/cutover stops dependent execution and retains its safe receipt.

Production execution and signed-in browser acceptance have not been performed
by this document. Record their actual results in the PR instead of changing this
runbook into a second current-production state registry.
