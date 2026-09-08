# Referral company-site landing

```yaml
document_metadata:
  doc_type: operational
  lifecycle: active
  authority_scope: portal_referral_company_site_landing_release
  superseded_by: null
  last_verified_at: 2026-09-08
  production_authority: false
```

Risk: A envelope / B source core. Process: one focused source PR with TDD,
then the separately authorized website-first, backend-only release.
Expected PR count: 1 for this backend change (the company-site change is in its
own repository). Validation: focused referral/registration tests, source
environment preflight, `npm test`, diff checks, and exact deployed-route readback.
Production/AWS impact: this document performs no mutation; the later
`control-plane-app` release changes only the referral redirect destination.
`identity_impact: false`.

## Intent and unchanged boundaries

After an ordinary valid referral GET, keep capturing the opaque attribution
credential on Portal and redirect to `https://gccwebos.com/#new-user`. The
company site describes the welcome benefit, products and referral rules before
the visitor follows its existing link to
`https://portal.gccwebos.com/portal/register/`.

The target is a fixed HTTPS constant. Request parameters and Host/Origin headers
cannot choose a target. `portalBrowserOrigin` retains its authentication and
Host/Origin-validation role; it is not changed to the company-site origin.
No new configuration, API, schema, cookie scope, registration input, rewards,
balances, package entitlement, payment configuration or Portal static build is
introduced. The `__Host-PortalReferral` cookie remains host-only, Secure,
HttpOnly, SameSite=Lax and subject to its existing expiry. No referral code or
credential is forwarded to the company-site URL or browser-readable storage.

Invalid/expired referrals still receive the same fixed redirect without a new
cookie. HEAD and both supported prefetch headers receive that redirect without
capture. Wrong Host remains rejected. `no-store` and `no-referrer` remain in
effect. Website access does not itself register a user or settle a reward.

## Release and rollback checklist

1. Verify the authorized company-site source and its actual production public
   page, not merely a successful preview deployment. `#new-user` must exist and
   its registration CTA must point to the existing Portal registration page.
   Publish and verify the website before switching the backend.
2. Freeze the reviewed backend source/artifact. Read the current backend release,
   service state and rollback release; preserve current configuration, schema,
   policies and Portal static identity. Follow the existing backend release
   runbook for writer coordination, a fresh verified backup and health checks.
3. Switch only `control-plane-app` under the approved production gate. Do not
   replay earlier release packets or apply a migration. Verify app health and
   `GET /r/invalid` plus HEAD/prefetch return a no-store/no-referrer 303 to the
   exact target, without setting attribution cookies. Do not create a real
   account, payment or reward merely to check the redirect.
4. Record the final release identity and public-route results in a Deploy Note.
   If switching fails, use the verified previous backend release and retain the
   website plus all database history. Code rollback restores the old direct
   registration landing; it does not require database restore, reward reversal,
   cookie clearing or a previous static-site version.

Source tests validate fixed redirects, scanner no-capture behavior, Host/API
checks and cookie-based registration attribution using synthetic data. They do
not claim real-browser cross-host behavior or production publication; record
those checks separately at their actual execution boundary.
