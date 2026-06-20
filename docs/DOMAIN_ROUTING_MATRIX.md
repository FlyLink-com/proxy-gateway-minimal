# Domain Routing Matrix

> Status:
> - Type: Active planning document
> - Risk: C for this document only; DNS/runtime execution remains Risk A
> - Execution authority: Does not authorize Vercel project changes, DNS
>   mutation, Nginx changes, HTTPS issuance, production config changes, API
>   exposure, Admin exposure, runtime service restart, deploy, cutover, secret
>   access, subscription URL output, SQLite access, or customer-data access
> - Production impact: None
> - Source of truth for: Planned domain naming, platform ownership, migration
>   sequencing, and approval boundaries for the future unified domain

Last updated: 2026-06-17, America/Los_Angeles.

This document maps the future unified brand domain purchased through Vercel to
project surfaces. It is intentionally a planning matrix. It must be read with:

- `docs/DOMAIN_ABSTRACTION_PLAN.md`
- `docs/DOMAIN_IMPLEMENTATION_RUNBOOK.md`
- `docs/NETWORK_FORWARDING.md`
- `docs/ENVIRONMENT_TOPOLOGY.md`
- `docs/CONFIGURATION_OWNERSHIP_MATRIX.md`

## Boundary

The operator has stated that a domain purchased on Vercel should become the
future common domain family for this project. The exact root domain is not
recorded here to avoid guessing or leaking private account context.

Use this placeholder until the operator supplies the final name in an approved
planning update:

```text
<new-root-domain>
```

Any command that changes DNS records, Vercel production aliases, production
backend base URLs, Nginx server names, certificates, runtime config, or public
Admin exposure is Risk A. A short confirmation such as `同意` is not sufficient
execution approval for those changes.

## Platform Role Split

| Platform | Intended ownership | Must not own |
| --- | --- | --- |
| Vercel | Public website, marketing pages, docs/help pages, Admin/User Portal preview deployments, protected visual review links, lightweight frontend delivery. | Core Express/SQLite control plane, subscription issuance authority, usage ledger authority, long-running collectors, edge-agent state, TCP/UDP data plane, production secrets. |
| Vultr Japan control plane | Accounts, orders, subscription artifacts, credential refs, desired-state notifications, receipt-gated rendering, usage ledger, protected Admin/operator API, User Portal API. | Public marketing site ownership, raw static design-preview delivery, independent data-plane capacity beyond its assigned runtime role. |
| Vultr Japan/Singapore data plane | Protocol runtime capacity and receipt-producing data-plane application. | Account/order authority, package limits, payment, customer portal state, public Admin. |
| DNS authority for `<new-root-domain>` | To be decided after read-only registrar/DNS inventory. Vercel can act as registrar and DNS host, or DNS can be delegated elsewhere. | Any implicit production cutover without an explicit DNS execution gate. |

## Target Hostname Matrix

| Surface | Planned hostname | Primary platform | Risk to activate | Purpose | Notes |
| --- | --- | --- | --- | --- | --- |
| Public website | `<new-root-domain>` and `www.<new-root-domain>` | Vercel | A if DNS is changed; otherwise B for repo-only static build setup | Brand homepage, product positioning, public entry point. | This is the safest first public use of the new domain, but DNS still requires an approved gate. |
| Documentation/help | `docs.<new-root-domain>` | Vercel or static docs host | A if DNS is changed | Public help center, onboarding, policy pages. | No secrets, no runtime status, no customer data. |
| User portal frontend | `portal.<new-root-domain>` or `app.<new-root-domain>` | Vercel frontend or Vultr-served portal | A | Customer login, order visibility, safe subscription lifecycle actions. | Frontend may be Vercel, but API authority stays with the control plane. |
| User portal API | `api.<new-root-domain>` or same-origin portal API path | Vultr Japan control plane | A | Authenticated portal API. | Must preserve CORS/session/auth boundaries. Do not expose Admin routes. |
| Subscription gateway | `sub.<new-root-domain>` | Vultr Japan control plane through public gateway | A | Subscription artifact delivery and health boundary. | Keep existing production domain in parallel until migration is validated and rollback window closes. |
| Admin/operator console frontend | `console.<new-root-domain>` or `admin.<new-root-domain>` | Protected Vercel preview or private operator route | A | Operator-only Admin shell. | Public Admin remains forbidden. Must have access protection plus backend auth; not a public product surface. |
| Admin/operator API | `ops-api.<new-root-domain>` or private same-origin API | Vultr Japan control plane/private access | A | Protected operator API. | Should remain private or strongly access-controlled. Never expose `/api/admin/*` through a public gateway. |
| Status page | `status.<new-root-domain>` | Vercel/static status provider | A if DNS is changed | Public uptime/status communication. | Must not reveal sensitive infrastructure details. |
| Preview deployments | Vercel preview domains, optionally `preview.<new-root-domain>` | Vercel | B for preview-only, A for custom DNS | Design QA, PR review, protected stakeholder links. | Prefer Vercel-generated preview URLs until custom preview DNS is justified. |
| Assets/CDN | `assets.<new-root-domain>` | Vercel/CDN | A if DNS is changed | Static images, public UI assets, docs assets. | No runtime config, no customer artifacts, no subscription material. |
| Data-plane node hostnames | Region/protocol-specific names under a separate node namespace if needed | Data-plane provider DNS target | A | Protocol client connection targets. | Do not merge node hostnames with public website or Admin hostnames. Keep generated subscription output redacted during validation. |

## Current-to-Future Compatibility Matrix

These names are current documented examples from project state and historical
records. They must be live-verified before any future action.

| Current documented surface | Future planned surface | Migration posture |
| --- | --- | --- |
| `sub.globalcirclecat.cloud` | `sub.<new-root-domain>` | High-risk production subscription migration. Keep old and new domains parallel until subscription refresh, client import, and rollback are proven. |
| `portal.globalcirclecat.cloud` | `portal.<new-root-domain>` or `app.<new-root-domain>` | High-risk portal migration. Validate login/session/CORS/cookie behavior before any customer-facing switch. |
| Existing protected/local Admin workflow | `console.<new-root-domain>` only if access-protected | Do not make Admin public. Use Vercel Deployment Protection or private network/access controls plus backend bearer/session auth. |
| Local Vite/Admin dev URL | unchanged local development URL | No production migration. Local development continues to use local backend or dev proxy. |

## Recommended Migration Phases

### Phase 0: Planning Only

Risk: C.

- Record the exact Vercel-purchased root domain after the operator provides it.
- Decide whether Vercel DNS will be authoritative or whether the domain will be
  delegated to another DNS provider.
- Confirm naming: `portal` versus `app`, `console` versus `admin`, and whether
  `api` is same-origin or split by subdomain.
- Do not change DNS, Vercel aliases, backend config, Nginx, or production
  services.

### Phase 1: Public Website And Docs

Risk: A for DNS, B/C for repo-only static build setup.

- Connect only public, non-sensitive surfaces first.
- Validate HTTPS, cache behavior, redirect behavior, and fallback pages.
- Keep production control plane and subscription gateway unchanged.
- Roll back by removing or repointing only the public-site DNS records.

### Phase 2: Preview And Review Workflow

Risk: B for protected preview workflow, A for custom preview DNS.

- Use Vercel preview deployments for Admin/User Portal visual review.
- Keep previews protected when they show operator UI shapes.
- Do not connect preview UI to production APIs unless an explicit read-only
  observation gate exists.

### Phase 3: User Portal Frontend

Risk: A.

- Decide whether the portal frontend is Vercel-hosted or control-plane-hosted.
- Validate auth, cookies, CORS, API base URL, session expiry, and safe error
  display.
- Keep existing portal domain serving during migration.
- Do not expose subscription URLs, tokens, credentials, or customer data in
  screenshots, logs, or PR comments.

### Phase 4: Subscription Gateway

Risk: A.

- Run read-only DNS/current endpoint inventory first.
- Lower TTL according to the selected DNS provider limits.
- Validate `sub.<new-root-domain>` health and unauthenticated subscription
  rejection before updating runtime base URL.
- Keep the old subscription domain serving during a migration window.
- Validate one authorized subscription refresh without recording the raw URL or
  token.

### Phase 5: Protected Admin/Operator Console

Risk: A.

- Treat `console.<new-root-domain>` as operator-only.
- Require access protection before the first public DNS alias is attached.
- Preserve backend authorization and Admin route allowlist behavior.
- Public `/api/admin/*` must remain blocked from the subscription/public
  gateway.

## DNS Inventory Required Before Execution

Before any Risk A DNS action, create an execution record with at least:

```text
Root domain:
Registrar:
Authoritative nameservers:
DNS provider:
Existing records:
Selected target records:
Current production domains:
Current production endpoint health:
Rollback records:
TTL policy:
Operator approval phrase:
Secrets/customer data recorded: no
Subscription URLs recorded: no
```

Do not paste raw registrar account data, tokens, API keys, subscription URLs,
or customer data into the record.

## Configuration Ownership

| Setting | Owner | Mutation gate |
| --- | --- | --- |
| Vercel project linkage | Vercel project settings | B for preview-only; A if production domain alias or DNS is changed |
| Apex/www domain records | DNS provider | A |
| Portal frontend base URL | Frontend deployment config | A when customer-facing |
| Portal API base URL / CORS | Control plane runtime config | A |
| Public subscription base URL | Protected production env/config | A |
| Admin console public alias | Vercel/DNS/access-protection config | A |
| Admin API exposure | Nginx/control-plane route boundary | A; default is blocked/private |
| Data-plane node hostnames | DNS/provider/runtime config | A |

## Acceptance Checks

For any future execution, the record must show only redacted pass/fail evidence
for the relevant surface:

- DNS resolves to the intended target.
- HTTPS certificate is valid for the selected hostname.
- Public website returns expected public content.
- Portal unauthenticated and authenticated flows behave as designed.
- Subscription gateway returns `401` without subscription authorization.
- Authorized subscription refresh works without recording the raw URL or token.
- Public Admin routes remain unavailable unless the exact gate intentionally
  exposes a protected console.
- Backend Admin API still requires authorization.
- Old domain rollback path is still available until the migration window closes.

## Hard Stops

Stop before execution if:

- The exact new root domain is not confirmed by the operator.
- DNS authority is unclear.
- Current production domain behavior has not been live-verified.
- The rollback target is unknown.
- The planned change would expose Admin UI or `/api/admin/*` publicly.
- The change requires copying production `.env`, tokens, subscription URLs,
  SQLite rows, runtime configs, credentials, or customer data into Git, chat,
  CI, or a preview deployment.
- There is no explicit Risk A approval for DNS/runtime mutation.

## Non-Goals

This document does not:

- Configure Vercel.
- Deploy a site.
- Change DNS.
- Change Nginx.
- Issue certificates.
- Change production runtime config.
- Migrate subscription base URLs.
- Expose Admin UI.
- Create or rotate accounts, orders, tokens, or subscription artifacts.
- Define payment-provider or customer-billing behavior.
