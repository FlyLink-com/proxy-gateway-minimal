# Subscription display names

```yaml
document_metadata:
  doc_type: operational
  lifecycle: active
  authority_scope: subscription_display_alias_source_and_promotion
  superseded_by: null
  last_verified_at: 2026-10-09
  production_authority: false
```

Risk: B source change inside a Risk A production envelope.
Capability: subscription-output-display-alias.
Release units: `subscription-rendering`, `control-plane-app` (backend-hosted renderer).
Production state: not_deployed. Identity impact: false for subscriptionDisplayName-only changes.

## Contract

Optional `servers[].subscriptionDisplayName` is an output label, never an identity.
Existing `displayName` catalog metadata does not opt into this behavior.
Internal `name/id`, node/channel references and material keys remain unchanged.
Clash inline, Mihomo inline, proxy-provider YAML and subscription summaries
consume the same label; generated group references follow it. Provider wrappers
use their provider's YAML. No sing-box JSON or URI renderer is claimed.

Absent, null or blank aliases retain legacy names. Non-string, over-128 UTF-16
code-unit, control/bidi/invisible-character values fail validation without
echoing the value. Explicit aliases are trimmed and YAML quoted. When aliases
are used, effective names must be unique and must not shadow built-in proxies
or generated groups. No-alias behavior stays compatible.

The operator's BWH request adds only these display properties:

| Internal catalog name, retained | subscriptionDisplayName |
| --- | --- |
| channel-vultr-a-vless-reality-tcp | US-专线优化-vless |
| channel-vultr-a-tuic | US-专线优化-tuic |
| channel-vultr-a-hy2 | US-专线优化-hy2 |

These are operator-specified labels, not independent performance verification.
SGP stays unchanged. This patch does not activate any tracked default catalog.

## Validation

Run `server/tests/subscription-display-name.test.mjs` and
`server/tests/subscription-display-name-identity.test.mjs`, `npm test`, and the
diff check. The focused tests cover three renderers, group-reference parity,
source immutability, SGP preservation, malformed/colliding aliases and the real
subscription core's personalized token/artifact paths with synthetic SQLite
and credentials. They do not access production.

## BWH promotion checklist — not execution authority

1. Bind the reviewed merged source and artifact. Do not mix unmerged
   #753/#755 changes into this task. Reuse valid migration evidence but freshly
   identify the BWH release and protected catalog.
2. Read only the intended catalog's digest and safe name/protocol metadata.
   Confirm the three internal names occur once each and already target BWH.
   Do not emit credentials, raw configuration, database rows or real YAML.
3. Prepare a private candidate adding only these three `subscriptionDisplayName` values.
   Server-side comparison must prove every other field, ordering, SGP entry,
   internal name, endpoint and credential unchanged. Validate renderer/config
   and native client parsing using synthetic material and reference closure.
4. Bind a fresh catalog backup, previous backend artifact, exact restoration
   path and operator approval. Runtime config is loaded at startup; this is
   not a hot-reload feature. Activation needs a bounded backend restart, not
   protocol/collector restarts or database/identity/metering migration.
5. Apply step by step, read back source/catalog/health and anonymous denial,
   then prove aliases without exporting any user's subscription. Operator
   refreshes an existing subscription and tests the client. Record natural
   collector execution separately from actual positive usage evidence.
6. On failure restore only the approved previous catalog/backend artifact
   and validate. Never rename internal identities, replay checkpoints, reset
   usage, restore stale databases, unfreeze JP or backcharge. Record an actual
   Deploy Note after production execution. JP SSH verification is separate.

Source tests and PR status do not mean the labels are live.
