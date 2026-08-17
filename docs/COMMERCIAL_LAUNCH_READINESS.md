# Commercial Launch Readiness

Last opened: 2026-08-17, America/Los_Angeles.

```yaml
document_metadata:
  doc_type: operational
  lifecycle: active
  authority_scope: commercial_launch_readiness
  superseded_by: null
  last_verified_at: 2026-08-17
  production_authority: "false"
```

> Status:
> - Type: Operational readiness tracker for taking the project from
>   "agent-self-use runtime" to "shippable commercial product"
> - Risk: C for this document; Risk B/A for any action item it tracks
> - Source of truth for: the live gap inventory between the existing
>   commercial-model skeleton and the artefacts required to sell it to
>   paying customers
> - Not a source of truth for: live prices, currencies, taxes, payment
>   provider credentials, refund policy text, SLA numbers, or legal opinion
> - Execution authority: None. This document tracks; it does not authorize
>   provider activation, deployment, DNS, Nginx, firewall, schema migration,
>   payment-provider key rotation, or production customer-data handling

## Why this document exists

The repository already carries a complete commercial-model skeleton in source:

| Existing artefact | Authoritative scope |
| --- | --- |
| `docs/COMMERCIAL_MODEL_V1.md` | Time-bounded entitlement with traffic allowance; trial / monthly / yearly; commercial state semantics |
| `docs/BILLING_RECHARGE_CONTRACT.md` | Wallet-first recharge / payment / commerce separation |
| `docs/ACCOUNT_RESOURCE_DELIVERY_LIFECYCLE.md` | Account-resource as primary delivery unit; reissue semantics |
| `docs/COINS_WALLET_SCHEMA_GATE.md` | Coin Wallet + immutable Coin Ledger boundary |
| `docs/COINS_COMMERCE_SCHEMA_GATE.md` | Offer -> Checkout Quote -> Commerce Order -> Fulfillment Command |
| `docs/PAYMENT_PROVIDER_ADAPTER_TEMPLATE.md` | Provider-neutral payment adapter contract |
| `docs/USER_PORTAL_FLOW.md` | Customer portal lifecycle (operator-issued entry today) |
| `admin/site/` + `wrangler.jsonc` | Cloudflare Workers company-site surface (marketing layer) |

The skeleton is not enough to sell. The gaps below turn it into a shippable
product. Each row carries its own risk tier; this document never lowers a
row's risk, only records it.

## Gap Inventory

Status legend: `open` | `blocked` | `in_progress` | `done` | `dropped`.

| # | Gap | Current state | Next concrete action | Owner | Risk | Status |
| --- | --- | --- | --- | --- | --- | --- |
| G1 | Public company-site pricing page | `admin/site/` exists; pricing/legal/refund/SLA routes not yet authored | Add `admin/site/src/pages/{pricing,legal,refund,sla}.tsx` (or `.astro` once stack is picked) with static copy; CTA -> `portal/?from=site&plan=trial|monthly|yearly` | operator-decision | B | open |
| G2 | Commercial configuration file (template) | Repository must not invent live prices per `docs/COMMERCIAL_MODEL_V1.md` | Author `config/commercial/pricing.example.json` with explicit `schema` field and zero-filling placeholder bytes; document in `config/commercial/README.md` | this PR | C | in_progress |
| G3 | Self-service signup | `docs/USER_PORTAL_FLOW.md` Boundary forbids public email/password self-service today | Decide between (a) invite-code + email double-factor, (b) email magic-link, (c) Passkey-first; update `docs/USER_PORTAL_FLOW.md` Boundary first, then implement | operator-decision | B | open |
| G4 | Live payment-provider activation | Source adapters exist (PayPal sandbox, XSD, ChaoJiPay) per `docs/PAYMENT_PROVIDER_ADAPTER_TEMPLATE.md`; wallet-first payment path is `not_activated` | Pick at least one provider (Stripe recommended for international; PayPal live for USD), drive through `npm run platform:*` and `npm test`, then run a Risk A gate to switch wallet-first default | operator-decision | A | blocked |
| G5 | Multi-tenant isolation | Single operator (`gccgw`), single brand; `tenant_id` not in schema | Introduce `tenant_id` column family on account / order / commerce / authority tables; update Portal + Admin render path; keep `project-state/*.json` coordination layer intact | operator-decision | B | open |
| G6 | Legal artefacts | `docs/PRIVACY.md`, `docs/TERMS.md`, `docs/DPA.md`, `docs/REFUND_POLICY.md` do not exist | Engage counsel; commit drafts with `document_metadata` blocks; link from `admin/site` footer and Portal consent screen | operator-decision + counsel | C | open |

## Stage Plan

The gaps above map to four stages. Each stage lands behind its own PR
boundary so that no single merge confuses scope. Earlier stages must not
publish artefacts that depend on later stages.

```text
Stage 1 - Commercial surface skeleton (this PR + follow-ups)
  G2 commercial config template
  G1 stub pricing/legal/SLA routes on admin/site (static copy only)

Stage 2 - Self-service + first live payment (Risk B -> Risk A)
  G3 self-service signup
  G4 first live payment provider activation

Stage 3 - Multi-tenant + multi-brand (Risk B)
  G5 tenant_id introduction
  G5 Portal + Admin tenant-aware render
  G5 safe per-tenant read projections

Stage 4 - Data-plane replicable delivery (Risk A)
  node image factory on Aliyun/AWS/Vultr
  docs/NODE_IMAGE_PROVISIONING_RUNBOOK.md alignment
  multi-region fleet onboarding runbook
```

## Hard Constraints (do not relax for productization)

Pulled from `docs/PACKAGE_BOUNDARY.md` Hard Stops and
`RELEASE_MANIFEST.md` Four Release Gates; restated here because
productization pressure tends to suggest "just this once" shortcuts:

- Prices, currencies, taxes, discounts, paid-package byte amounts are
  business configuration. The repository MUST NOT invent or publish them
  without an operator-approved decision. The
  `config/commercial/pricing.example.json` file in this PR is a template
  with placeholder zeros; it is not live pricing.
- Real `.env`, SQLite snapshots, customer data, raw subscription URLs,
  protocol credentials, and cloud keys MUST NEVER enter Git, PRs,
  documents, chat, or logs.
- Source availability, a passing artifact run, and even a successful
  `Validate` check do not authorize live payment activation. The
  wallet-first / Authority / runtime lane all sit behind a separate
  exact Risk A gate.
- Any change that touches runtime principal, protected usage map,
  material binding, or collector identity resolution MUST declare
  `identity_impact: true` and capture aggregate-only Identity Gate
  before/after evidence per `docs/IDENTITY_LIFECYCLE.md`.

## Validation Commands

Run locally before requesting review of any readiness PR:

```text
git diff --check origin/master...HEAD
npm run docs:authority:check
npm run docs:authority:strict         # when the PR adds any new in-scope markdown
npm test                              # when the PR touches server source
npm run admin:test                    # when the PR touches admin SPA
npm run admin:build                   # when the PR touches admin SPA
npm run cloudflare:site:dry-run       # when the PR touches admin/site
```

CI-hosted equivalents live in `.github/workflows/`; hosted CI is currently
billing-blocked, so manual validation per `docs/CI_MANUAL_VALIDATION.md`
is the binding source of evidence.

## Out of Scope (recorded to prevent drift)

- Refund / dispute SLA numbers (lawyer + ops)
- Tax residency, VAT, GST handling (depends on counsel)
- SLA uptime percentages (depends on infra capacity)
- Affiliate / referral cash payouts (already a portal feature; commercial
  settlement policy remains separately governed)
- Mobile native apps (`docs/USER_PORTAL_FLOW.md` records mobile as
  deferred)

## Evidence Trail

- `docs/COMMERCIAL_MODEL_V1.md`
- `docs/BILLING_RECHARGE_CONTRACT.md`
- `docs/ACCOUNT_RESOURCE_DELIVERY_LIFECYCLE.md`
- `docs/PAYMENT_PROVIDER_ADAPTER_TEMPLATE.md`
- `docs/USER_PORTAL_FLOW.md`
- `docs/PROJECT_CONTEXT.md` (current architecture and release units)
- `docs/CURRENT_RELEASE_STATE.md` (current release unit state)
- `docs/PACKAGE_BOUNDARY.md` (hard stops)
- `docs/IDENTITY_LIFECYCLE.md` (identity-impact coupling)