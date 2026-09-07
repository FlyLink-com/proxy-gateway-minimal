# Portal login persistence: local implementation gate

```yaml
document_metadata:
  doc_type: operational
  lifecycle: active
  authority_scope: source_only_portal_session_persistence
  superseded_by: null
  last_verified_at: 2026-09-07
  production_authority: false
```

## Status and scope

- Risk: A (authentication/session model). Process: approved local implementation,
  targeted TDD, independent source review and disposable browser validation.
  The operator approved local implementation on 2026-09-06. Expected PR count:
  one; no PR or production readiness is implied by the dirty candidate.
- Local source: `986318c475f5d6ecd932cd1d5aba0d95d11ab4bf`, branch
  `codex/portal-wallet-checkout-layout`, with task-owned uncommitted Wallet work.
- Intended release surfaces: `portal-static` and `control-plane-app`;
  `frontend_surface: portal`; `production_state: not_deployed`.
- No production, provider, real-account, schema, or deployment mutation
  is authorized by this document. Disposable local test sessions are permitted.
  The independent Wallet copy/refresh changes are retained; session-specific
  implementation and validation are recorded separately below.

## Pre-implementation read-only findings (2026-09-06)

- `admin/src/features/user-portal/user-portal-page.tsx` keeps ordinary login in
  React state. Its restore effect consumes only one-time registration/payment
  return state; a normal reload starts without a session.
- The existing remember checkbox updates local component state only. The
  authenticate request does not carry that preference.
- `server/services/platform/user-portal-auth.mjs` creates an ordinary session
  with a default absolute lifetime of 1800 seconds and validates expiry,
  revocation, and account status. The runtime composition in `server/state.mjs`
  does not override that default. This is source evidence, not live production
  configuration verification.
- `server/routes/user-portal.mjs` and the dedicated commercial routes use
  explicit session references rather than Portal Cookie authentication.
- Current frontend logout clears frontend state but does not revoke the server
  session. The existing session schema has expiry/revocation fields, but a
  supported Portal logout/revocation operation must be added.

## Approved user-visible behavior

1. Reloading the browser restores a still-valid login through server
   verification, then freshly reads the current page's data. Do not render a
   cached wallet as fresh or replay creation/payment requests on reload.
2. Without remember-me, retain the ordinary 30-minute absolute session limit;
   browser refresh is not logout and does not extend server expiry. A session
   cookie is not a guaranteed browser-close logout because browsers may restore
   sessions; expiry and explicit logout remain server-enforced.
3. With remember-me, the approved absolute maximum is **7 days**. The preference
   is bound to the initial password login and its existing MFA policy.
4. Explicit logout, session revocation, account disablement, or expiry prevents
   restoration. Transient network errors show a retryable connection state
   instead of treating an unavailable server as proof of invalid credentials.

## Security and implementation boundary

- Portal-only, host-scoped `HttpOnly; Secure; SameSite` Cookie transport with
  explicit same-origin/CSRF protection and no shared Admin principal.
- Complete required human verification/MFA before establishing remembered
  login. Do not change the MFA policy or make remember-me bypass it.
- Do not persist passwords or bearer credentials in localStorage, JS-readable
  long-lived cookies, or logging. A bootstrap response must not return the
  long-lived cookie credential to JavaScript.
- Use Cookie-based authentication across Portal, wallet, commerce and recharge.
  A random 256-bit Cookie credential maps to a private hash-based session ID.
  JSON exposes only a non-credential, per-session context and expiry. Every
  protected Cookie request binds that context to the actual Cookie session;
  a stale tab cannot silently operate a different account after another login.
  Legacy header/body/query paths cannot authenticate either private browser
  session IDs or public contexts. Provider callbacks retain their existing
  independent authentication and are not browser-session endpoints.
- Conversion is internal to completed authentication routes, never a public
  endpoint. A bounded, 60-second one-use in-memory capability registered during
  fresh session creation permits transactional replacement and revocation of
  the temporary legacy session. Expiry remains anchored to original issuedAt.
  MFA preference is versioned inside existing allowed_factors_json, with old
  array records read as rememberMe=false. No DDL change is needed.
- Trust only an explicitly configured Portal origin, never the subscription
  base URL or forwarded headers. Production Cookie mode requires HTTPS and a
  __Host- cookie. A separate explicit loopback-only development option uses a
  separate cookie name; local HTTP is not evidence of production HTTPS security.
- Require browser-v1 custom headers, same-origin checks, Fetch Metadata and
  strict duplicate/conflicting credential rejection. Bootstrap never renews or
  clears a Cookie. Logout requires matching context before revocation/clearance.
- After those request checks, a single malformed Cookie is treated as absent
  only for explicitly listed bootstrap/fresh-authentication endpoints. Protected
  APIs and logout still reject it. Explicit successful authentication can replace
  it; duplicate, mixed, foreign-origin and wrong-method requests remain rejected.
- Browser writes have actual AbortController deadlines covering headers/body and
  bounded Web Locks acquisition. Pending logout never means server revocation is
  confirmed: a failure offers retry or explicit reauthentication without silently
  restoring another tab's session. Two obsolete credential handoff keys are
  removed even while automatic restoration is blocked.
- Prefer reuse of supported existing session schema where it preserves the
  approved expiry/revocation/security properties. If separate credential
  storage or any versioned migration is required, stop for explicit migration
  scope approval; do not add it as an incidental frontend change.
## Frozen source boundary

- Backend: server/services/platform/{user-portal-auth,subscription-control-db,
  portal-browser-session-transport}.mjs; server/routes/{user-portal,
  portal-coin-wallet,portal-coin-commerce,portal-coin-recharge}.mjs;
  server/app.mjs and server/state.mjs (explicit source configuration only).
- Frontend: admin/src/features/user-portal/{user-portal-types,
  user-portal-parsers,user-portal-http,user-portal-page,portal-browser-session,
  user-registration-page}.{ts,tsx} as applicable, and
  recharge/use-portal-recharge.ts for read-only reload recovery.
- Tests: focused browser-session transport/auth/store/frontend tests and
  directly affected existing Portal/registration/recharge tests. Local harness:
  scripts/start-local-coin-commerce-validation.mjs. This plan and design-qa.md
  record the approved scope and actual validation results.
- Existing task-owned Wallet layout/refresh changes are retained. No backend
  commerce semantics, prices, resource assignment, payment callback, real data,
  production environment, merge or deployment changes are part of this gate.

## Validation / dry-run checklist

- Use only marker-owned disposable data and loopback browser validation.
- TDD: checked/unchecked preference, reload without repeat login, correct
  server expiry, no implicit expiry extension, disabled account, malformed or
  expired cookie, logout/replay rejection, and stale-response suppression.
- Verify ordinary and wallet-first account paths and all affected commercial
  APIs. No duplicate data bootstrap or mutation on reload; no duplicate payment.
- Negative tests: required MFA, cross-origin writes, missing/invalid CSRF,
  conflicting credentials, credential leakage in JSON/logs/web storage, and
  refresh/logout races including multiple tabs.
- Run focused backend/frontend tests, full frontend tests, Portal build and
  verifier, relevant root regressions, and diff checks. Source review is a
  separate gate from production validation.

## Rollback and next gate

Before merge, this source-only change can be reverted without touching active
sessions. Any future production rollout requires exact source/artifacts, fresh
target inventory, backup/rollback compatibility, operator approval, and endpoint
validation. Cookie rejection/clearance and server revocation behavior must be
specified for rollback; do not assume an old frontend alone can safely undo an
authentication change. No deployment or rollback is performed by this plan.

Cookie mode is fail-closed when `PLATFORM_PORTAL_BROWSER_ORIGIN` is absent. A
future release must coordinate the backend transport, trusted HTTPS origin and
Portal frontend; this is not a static-only rollout. Local builds with empty
payment-adapter configuration must not be reused as production payment builds.

Production inventory must verify that the reverse proxy preserves the exact
public Host, Origin and Fetch Metadata headers expected by the transport. An
absent origin yields 503; a mismatching upstream Host yields 403. Activate and
verify the compatible backend before exposing the new Portal frontend.

No DDL does not mean the old binary understands every new record: pending MFA
challenges now use a versioned object in the existing TEXT field. The old reader
treats that object as an empty factor list, so an interrupted challenge requires
fresh login after a coordinated rollback. The ordinary challenge lifetime is
five minutes. A static-only rollback while retaining the new Cookie backend is
invalid: old clients with a Cookie but no browser marker are rejected. Freeze and
validate a coordinated backend/Portal recovery plan before production approval;
retain the currently compatible base release, not a predecessor that predates
the separately completed delivered-order confirmation extension.

## Existing source gap outside this authentication change

The legacy frontend hydration still requests `/api/portal/payments/current`.
HEAD and this candidate have no server handler for it; the global Console guard
returns 401. The existing payment-provider source-boundary test deliberately
excludes these removed legacy payment routes. Hydration catches that failure;
Coins consumption, recharge and service records use their separate sources.
Do not interpret this 401 as failed Cookie restoration or add a public payment
handler to mask it. Removal of legacy frontend payment calls is separate work.

## Local acceptance evidence (2026-09-07)

- Implementation and local browser acceptance completed, not merged or deployed.
  Exact base SHA remains the one above; evidence applies to the task-owned dirty
  candidate, not to an immutable release artifact.
- Node v22.23.1: three new backend session files pass 52 tests, zero failures or
  skips. Full frontend: 60 files, 968 passed, zero failures or skips. Admin build,
  Portal build (including TypeScript) and Portal verifier pass. Bundle-size
  warnings remain; verifier payment-adapter configuration is empty/local only.
- Root regression: 4467 tests, 4400 passed, 11 failed, 56 skipped. Failures concern
  release workflow/source contracts and checkout/tool path normalization. No
  clean-baseline comparison was performed; full-root success and confirmed
  pre-existing classification are not claimed.
- Release-preparation read-only attribution against the exact base compared 22
  implicated files: after checkout-only CRLF normalization they match the base
  Git blobs byte-for-byte. Five failures are LF-sensitive assertions, two are
  repeated CRLF fixture conversion, and four are cross-platform path fixtures.
  Non-mutating counterfactual probes reproduced each mechanism. This attributes
  the local failures without changing or exempting tests; an exact candidate's
  clean Linux CI must still pass before merge readiness can be established.
- Independent backend review found no P0/P1 in the reviewed dirty scope. Its
  malformed-cookie recovery P2 was reproduced and fixed with red/green tests.
  Final browser QA found a same-page BroadcastChannel self-invalidation race:
  password login established a Cookie but the page invalidated its own hydration.
  Two realistic asynchronous channel tests reproduced it (30 pass / 2 fail),
  and sharing the sending/subscribing page instance fixed it (32 pass / 0 fail).
  Cross-tab invalidation remains active; messages contain no identity data.
- In-app browser, `http://127.0.0.1:5175/`: final ordinary login directly opens
  Wallet, without requiring a reload. Its public response has an 1800-second
  lifetime. Reload restores the same public context and unchanged expiry,
  retains `#portal=wallet`, issues one bootstrap and zero Portal mutation calls.
  Wallet summary/ledger and recharge offer/order reads return 200. The separate
  pre-existing legacy payment read still returns 401 as documented above.
- Remembered login has a 604800-second lifetime and a persistent HttpOnly/Lax
  local Cookie whose expiry matches the server. A second tab restores it. Logout
  removes the Cookie, invalidates both tabs, and a subsequent reload stays on the
  login page. No Cookie credential is JavaScript-readable or stored in web storage.
  Local HTTP intentionally lacks Secure; these observations do not prove
  production HTTPS or seven days of elapsed wall-clock behavior.
- Wallet remains four regions with six offers and the marked repeated copy
  removed; actual desktop DOM and screenshots were inspected. No mobile redesign
  or new payment/order action was performed. Browser JavaScript error log was empty.
- Final preview was stopped Vite-first, backend-second. The owned harness emitted
  its successful stopped receipt; cleanup checks absence of its exact marker-owned
  temporary root. Ports 5175/3457 have no listeners. Temporary viewport emulation
  was cleared. No customer or production data was used.

## References

- [MDN secure cookie configuration](https://developer.mozilla.org/en-US/docs/Web/Security/Practical_implementation_guides/Cookies)
- [OWASP session management](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html)
