# Authenticated public Admin ingress

```yaml
document_metadata:
  doc_type: operational
  lifecycle: active
  authority_scope: admin_public_login_hardening
  superseded_by: null
  last_verified_at: 2026-10-13
  production_authority: false
```

Risk: A. Process: narrow source hardening, synthetic validation, independent
review, then a separate exact artifact/config promotion. Expected PR count: 1.
Release units: `control-plane-app`, `admin-static`; frontend_surface: `admin`.
identity_impact: false (no proxy/runtime principal or collector change).
Production impact of this source change: none until explicitly deployed/enabled.

## Intent and source contract

The operator approved making the existing BWH Admin domain reachable without
visitor-IP restrictions, while retaining the existing fixed administrator,
password, TOTP and protected management APIs. This is not anonymous Admin,
general API exposure, a new account, or a public backend port.

- `ADMIN_PUBLIC_LOGIN_ENABLED` defaults to false. The existing Admin IP
  allowlist remains in effect in the default mode.
- Opt-in requires enabled Admin cookie auth and `ADMIN_BROWSER_ORIGIN`, an
  exact serialized HTTPS origin (no credentials/path/query/hash/trailing slash).
  Startup rejects a partial configuration. Existing fixed account/session
  secret requirements remain unchanged.
- Only the two Admin namespaces lose visitor-IP restriction in opt-in mode;
  the cookie gateway still discards external Authorization and requires a
  valid Admin session. Other APIs, Portal, subscriptions and agent allowlists
  are unchanged. Public bootstrap and TOTP enrollment return an error without
  invoking setup; initializing MFA remains a restricted maintenance operation.
- Anonymous session status never contains the fixed internal account reference.
  Public mode also hides setup state. The frontend submits only the password;
  the server selects its preconfigured account. An explicit wrong operator
  reference is still rejected. Password alone never grants a session.
- Admin unsafe methods require the exact configured Origin in public mode.
  Missing/null/sibling origins are rejected. Host and forwarding headers do not
  define the expected origin; Fetch Metadata cannot substitute for Origin.
  No CORS widening or global Express `trust proxy` change is made.
- Login/TOTP/setup attempts use the existing verified client-IP resolver,
  with IPv6 subnet grouping. Each endpoint retains a 10-attempt/minute budget.
  Unknown or malformed client identity fails closed. The local in-memory rate
  limiter is defense in depth, not a distributed brute-force/DDoS guarantee.
- Admin responses, including errors, are no-store. Parser errors do not echo
  submitted credentials. Malformed encoding or duplicate Cookie names fail
  closed as anonymous, not a default HTML exception page. Cookies keep
  HttpOnly/Secure/SameSite=Strict.

## Synthetic source acceptance

Run the focused Admin public ingress, attempt-limit, auth service/routes,
allowlist, IP resolver and runtime-state tests, then the required `npm test`,
`npm run admin:test`, `npm run admin:build`, and diff checks. Use synthetic
accounts/SQLite only; no production credentials, cookies or databases.
Cover negative auth, trusted/untrusted forwarding, separate visitor buckets,
IPv6 cycling, cross-origin writes before mutation, public setup rejection,
password then TOTP then cookie access, logout/expired cookies, and missing
startup prerequisites. Build validation is not browser or production evidence.

## Deployment dry-run and rollback checklist (not execution authority)

1. Bind reviewed source and both frontend/backend artifacts. Record the exact
   deployed mixed release, retained rollback pointers and Nginx site hash fresh.
   No third-party schema reapply, key regeneration or database restore.
2. Validate the candidate in an isolated synthetic process with public mode on
   and off; prove anonymous APIs remain denied and approved-origin password/TOTP
   login succeeds. Review the production delta, not a whole-master replacement.
3. Before writes, back up current app/Admin pointers, Admin Nginx site and only
   the affected protected environment/drop-in. Verify rollback remains usable.
4. Keep Nginx visitor ACL in place while installing paired backend/frontend.
   New frontend with old backend cannot perform password-only login; old
   frontend depends on the removed anonymous account field. Treat these as a
   paired release. Restart invalidates in-memory sessions; operator logs in again.
5. Bind explicit public flag and HTTPS origin without modifying the existing
   fixed account, secrets, TRUSTED_PROXY_CIDRS or other service environments.
   Retain ADMIN_ALLOWED_CIDRS for private-mode rollback; do not replace it with
   broad CIDRs or forge forwarding headers. No raw IP/backend-port login URL.
6. Validate restricted candidate login/negative tests, then remove only the
   approved Admin HTTPS visitor ACL. Keep TLS, external Authorization clearing,
   same-origin routing and the existing non-Admin API denials. Run `nginx -t`
   before reload. Block bootstrap/enrollment at the public proxy as additional
   defense in depth. Do not enable wide CORS or expose 3456/18180/1080.
7. Read back source/artifact/config identity, anonymous session projection,
   missing/invalid-cookie 401, cross-origin write rejection, setup rejection,
   no-store, operator password/TOTP login and authenticated third-party
   summary/source reads. Do not import or enable a real source for login testing.
8. On failure, restore Nginx restrictions FIRST and verify them, disable the
   public flag, restore paired app/Admin pointers/environment, validate/reload
   the old site and restart only the app if needed. Preserve business DBs,
   protocol services, collector, credentials and the new independent third-party
   DB/key. Do not roll back only the app while leaving public ingress exposed.
9. Record a concise Deploy Note for each actual release unit, with backups and
   endpoint/service results. Do not claim production open before those results.

## Status

Source validation completed on 2026-10-13 for implementation commit
`01fbedb96067d16f03d09742915ae320edf41e68`:

- Windows Node24.16.0 full server baseline: 5934 total, 5877 pass, zero fail,
  57 existing platform skips; focused authentication boundary: 49/49 pass.
- Local WSL Node22.23.1, clean source archive and fresh lockfile-based `npm ci`:
  207/207 focused auth/state/third-party tests pass. This is additional local
  Linux validation, not a complete hosted-CI run or production staging.
- Admin baseline: 94 files /1573 pass; TypeScript/Vite build and 13-file safety
  check pass. Local browser visual inspection shows the password-only first
  step, without the internal account field; it used a synthetic anonymous
  response, not a real administrator login.
- Independent safety-oriented source review found one malformed-cookie P2;
  a red-to-green repair and incremental independent review closed it. No open
  P1/P2 findings in that scope. The dedicated Security Review tool was not
  available; this is ordinary independent review, not that tool's result.
- Hosted CI run 38391176252 has a current budget-blocking annotation and no
  started validation steps; it is not recorded as a pass. No ruleset bypass,
  merge or production mutation was performed in this source phase.

The first full run caught a missing metadata block and the old assertion that
Admin lookalike paths were not no-store. Both were corrected to the new common
Admin response contract and the final full baseline was rerun successfully.
Later evidence-only documentation changes do not change the tested source.

Production ingress remains unchanged by this work. #771's earlier backend
migration/cutover receipts remain valid and are not being repeated. Paired
artifact preparation, exact production delta review and real operator login
acceptance remain separate, uncompleted steps.
