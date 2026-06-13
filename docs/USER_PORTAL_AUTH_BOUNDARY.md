# User Portal Auth Boundary

Last updated: 2026-06-03, Asia/Shanghai.

This document defines the customer-portal authentication boundary for the
provider-neutral subscription-control platform, currently documented toward the Vultr Japan control-plane direction. It is a repository design contract
only. It does not deploy a portal, expose a public login endpoint, create DNS or
Nginx routes, issue real portal entries, migrate SQLite data, activate payment,
or authorize subscription issuance.

## Purpose

The user portal must stay separate from:

- the public company site;
- public lead intake;
- public Admin or operator console;
- subscription artifact URLs;
- payment-provider checkout and webhook flows.

The target model is:

```text
operator / payment / approved lead
  -> account and entitlement
  -> operator-issued dynamic portal entry
  -> TOTP enrollment or verification
  -> short-lived portal session
  -> user-scoped subscription, balance, quota, and usage view
```

Login identity is not subscription authority. A user can authenticate only to a
portal session; account entitlement, balance, plan status, revocation state, and
artifact access remain server-side authorization decisions.

## CLI / Portal Separation

CLI and user portal are separate adapters over the same domain services:

```text
operator CLI
  -> domain services
  -> control/runtime state

user portal
  -> user-scoped portal APIs
  -> domain services
  -> control/runtime state
```

Rules:

- the user portal must not shell out to CLI commands;
- CLI commands are operator/ops tools, not user-facing product workflows;
- normal user self-service actions, such as viewing account state or refreshing
  an allowed subscription artifact, should call user-scoped services directly;
- operator CLI remains for provisioning, override, revoke, audit, emergency
  recovery, and controlled handoff;
- both adapters must share the same authorization, entitlement, quota, audit,
  and secret-redaction rules at the service layer.

## Credential Layers

| Layer | Purpose | Storage posture | May expose subscription URL? |
| --- | --- | --- | --- |
| Dynamic entry token | First controlled portal entry or account binding. | Store only token hash, status, expiry, use count, and safe refs. | No. |
| TOTP secret | Authenticator app binding for subsequent portal logins. | Store encrypted secret; recovery codes are hash-only. | No. |
| Passkey | Future user-enabled account security factor. | Current Personal Center account-level preview state only; real WebAuthn registration is not active. | No. |
| Email code challenge | Retired / not planned. | Current client contract remains hidden and fail-closed only to preserve compatibility while it is removed from the product direction. | No. |
| Password credential | Future convenience login factor. | Current repository UI/client contract only; real hash storage is not active. | No. |
| Portal session | Short-lived authenticated browser session. | Store session ref, account ref, expiry, status, and audit metadata. | No. |
| Subscription artifact token | Fetches rendered subscription output. | Existing artifact model; never reuse as portal auth. | Only through artifact route rules. |
| External identity | Future OAuth identity binding if separately approved. | Store provider subject hash/ref and account binding. | No. |

The dynamic entry token is a door key, not the subscription itself. The TOTP
code proves possession of a bound authenticator. The portal session only scopes
read/write access to user-portal functions.

## Phase 1: Operator-Issued Entry + TOTP

Initial implementation avoids third-party login providers and avoids public
self-service registration as the source of authority. The repository now has a
repo-only internal service at `server/services/platform/user-portal-auth.mjs`
for issuing dynamic entries, enrolling TOTP credentials, and creating scoped
portal sessions against the subscription-control database. It is not exposed
through HTTP and it does not issue subscriptions.

The repository also includes a guarded local HTTP adapter at
`server/routes/user-portal.mjs`. It is mounted by `createApp()` only when a
caller explicitly injects `state.platform.userPortalAuth` and sets
`state.platform.userPortalRoutesEnabled === true`. The default application
state does not expose these routes. This adapter is for local/repository
validation of entry consumption and session creation; production exposure,
Nginx/DNS routing, cookie policy, CSRF posture, and public portal activation
remain separate Risk A gates.

The Admin/Portal frontend now keeps the normal login surface as a single
account-login form: account ID, password, generated local anti-bot math
challenge, and hidden bot trap. That math challenge is not an email code or TOTP
dynamic credential. The local `#/portal-preview` client includes a small
repository-only batch of issued preview accounts for browser validation. Those
initial accounts authenticate with the configured preview password only; unknown
accounts or wrong passwords fail before a session is created. On first login,
preview accounts that still require setup show an account-security initialization
dialog and cannot dismiss it until both account factors are completed:
authenticator binding and passkey export. Authenticator setup and passkey export
also remain available in Personal Center security settings after login.
Authenticator setup is a local TOTP enrollment preview: it generates an
`otpauth://` binding URI, renders a scannable QR code for Google
Authenticator-compatible apps, shows a manual key, and marks the factor bound
only after a valid 6-digit TOTP code. Passkey export writes a local preview JSON
backup package and marks the account factor enabled/exported; it is not a
WebAuthn private key export. The local preview client then stores the
account-level security factors in memory and makes the next password login
return a `second_factor_required` challenge instead of a portal session.
Completing that challenge with the bound TOTP code or by submitting the exported
passkey preview JSON package creates the session. The passkey path must parse
the submitted package and match its safe account and passkey refs against the
in-memory account record; a fixed button click or fixed proof string is not a
valid verification. This is a UI/client state-machine preview only: the
default HTTP client keeps authenticator enrollment, passkey export/enrollment,
password login, and second-factor completion fail-closed until reviewed backend
secret generation, storage, WebAuthn, recovery, rate-limit, and session services
are approved. These controls are not separate login-page tabs. Operator-issued
entry Token activation remains an
admin-controlled first-bind boundary; the HTTP portal client still supports the
default-off `/api/portal/entry/enroll` -> `/api/portal/session` seam for
repository validation, but this is not exposed as a normal customer login
choice. The default HTTP password client keeps password authentication
fail-closed; real password hash storage, reset flows, and production password
authentication remain separate gates. Email-code login and real mail issuance
are no longer part of the product direction. The current email-code client
contract stays hidden and fail-closed only as a compatibility stub; it must not
be promoted into a future implementation without a new explicit product
decision. In the Admin Vite shell, `#/portal` remains the real same-origin
HTTP route; `#/portal-preview` uses only the safe local preview client for
repository-local browser validation. The old public email/password signup shell
is not the active auth model.

An operator-only CLI wrapper exists at
`scripts/platform-issue-portal-entry.mjs` / `npm run
platform:issue-portal-entry`. It can write a dynamic entry row to the
subscription-control database and write visible-once entry material to an
operator handoff file. Running that command against production data remains
A-tier; the repository implementation itself grants no production authority.

The production password/passkey/account-credential work is tracked separately in
`docs/USER_PORTAL_PRODUCTION_AUTH_PLAN.md`. That plan is the current A-tier
implementation gate for durable password credentials, backend human challenges,
second-factor challenges, WebAuthn passkeys, and operator-issued initial
accounts. It does not authorize production migration or public portal exposure.

Required behavior:

- operator-approved account and entitlement exist before issuing an entry;
- entry token is opaque, random, visible once, and stored only by hash;
- entry token has `expiresAt`, `maxUses`, `usedAt`, `revokedAt`, and audit
  metadata;
- first successful entry can enroll a TOTP authenticator;
- TOTP verification has rate limits, attempt counters, replay window controls,
  and audit events;
- successful verification creates a short-lived portal session;
- authenticator and passkey enrollment controls belong in the user
  account/security center, not as normal login-page alternatives;
- repository-local preview may include issued initial accounts that force a
  first-login security-initialization dialog, but this must not be treated as
  public self-service registration or production account provisioning;
- once an account has a local-preview authenticator or passkey enabled, password
  login must produce a second-factor challenge and must not create a session
  until one enabled factor verifies;
- local-preview passkey second factor must require the exported preview package
  content and match account/passkey refs; it must not accept a fixed proof
  string or button click as verification;
- email-code login must stay hidden and fail-closed; real mail issuance,
  email-code delivery, and email magic links are no longer planned;
- password login must stay fail-closed unless a reviewed credential store,
  hashing policy, reset policy, and abuse controls are approved;
- generated local human checks can block obvious scripted submissions, but they
  are not dynamic login credentials; third-party CAPTCHA/Turnstile or production
  abuse controls are separate provider gates;
- backend human challenges must be server-issued, expiring, one-time checks
  before they are treated as a security boundary; see
  `docs/USER_PORTAL_HUMAN_CHALLENGE_DESIGN.md`;
- portal session can see only the bound account, entitlement, balance, quota,
  subscription-access state, and safe delivery metadata;
- raw subscription URLs remain outside public docs, chat, logs, and normal
  database rows.

Non-goals:

- public fixed `/login` or `/portal` links on the company site;
- public Admin exposure;
- Google OAuth or any third-party login dependency;
- payment activation;
- automatic entitlement or subscription issuance;
- direct subscription artifact fetch from the portal-entry token.

## Phase 2: User-Scoped Portal Session

The portal session should be the only browser credential used after dynamic
entry or TOTP verification.

The session can authorize:

- viewing plan and entitlement status;
- viewing balance and traffic quota summaries;
- viewing safe subscription-access metadata;
- requesting renewal, support, or operator review;
- copying a subscription URL only when a separate artifact-access policy allows
  it.

The session must not authorize:

- Admin APIs;
- production issuance mutation;
- payment provider mutation;
- edge/node mutation;
- DNS, Nginx, firewall, or runtime changes;
- broader artifact issuance or legacy query-token retirement.

## Phase 3: External Identity Providers

Google Login, GitHub OAuth, Microsoft OAuth, Apple Sign In, Passkeys/WebAuthn,
or Telegram Login Widget can be added later as convenience and account-recovery
mechanisms. Email-code login and email magic links are explicitly out of scope.

They must map through an internal identity binding:

```text
external identity
  -> externalIdentityRef
  -> accountRef
  -> entitlement / balance / access decisions
```

Rules:

- external login success is not subscription authorization;
- external provider email is not a billing or entitlement source by itself;
- provider subject IDs should be stored as safe refs or hashes;
- third-party login must not bypass TOTP, risk review, revocation, or device
  controls unless a later approved policy explicitly changes that;
- OAuth callbacks, cookies, CSRF state, redirect URIs, and session lifetimes are
  security-sensitive and require a separate Risk A/B design depending on
  deployment scope.

## Suggested Data Shapes

These are model shapes only, not a migration.

```text
portal_entries
  entryRef
  tokenHash
  accountRef
  entitlementRef
  status
  expiresAt
  maxUses
  usedAt
  revokedAt
  issuedBy
  approvalRef
  createdAt

portal_totp_credentials
  credentialRef
  accountRef
  encryptedTotpSecret
  status
  enrolledAt
  lastVerifiedAt
  failureCount
  lockedUntil
  rotatedAt
  revokedAt

portal_sessions
  sessionRef
  accountRef
  entryRef
  authMethod
  issuedAt
  expiresAt
  revokedAt

external_identities
  identityRef
  provider
  providerSubjectHash
  accountRef
  status
  linkedAt
  lastLoginAt
```

Sensitive notes:

- `encryptedTotpSecret` requires a server-side encryption key outside the
  repository.
- dynamic entry tokens and recovery codes should be stored hash-only.
- raw portal URLs, subscription URLs, tokens, credentials, provider secrets,
  customer PII, and handoff material must not be written to repository files or
  normal operator logs.

## Risk Gates

| Work item | Risk | Required boundary |
| --- | --- | --- |
| Repository-only dynamic entry / TOTP / session service and tests | B | No production DB migration execution, no public route, no subscription issuance, no secrets in summaries. |
| Explicitly-enabled local portal entry/session HTTP adapter | B | Default-off app mounting, no production route, no cookies, no subscription issuance, no raw token or TOTP echo. |
| Retired email-code client compatibility stub | C | Hidden and fail-closed only; no real email delivery, no challenge table, no public route, no provider CAPTCHA secret. |
| Local password-login UI/client contract, account-level second-factor preview, and anti-bot form checks | B | HTTP password and second-factor paths fail-closed, no password hash storage, no WebAuthn registration, no public route, no provider CAPTCHA secret. |
| Repository-only backend human challenge service | B | In-memory or injected store only, default-off portal seam, no provider secret, no production DB migration, no public route activation. |
| Local user-portal UI prototype using mocked client data | B | No public deployment, no real auth provider, no artifact URL exposure. |
| Real portal DB migration | A | Migration runbook, backup, rollback, validation. |
| Real password credential storage or public CAPTCHA provider integration | A | Credential/hash policy, provider secrets, deployment gate, abuse controls, validation, and rollback. |
| Real email-code delivery or email magic links | Not planned | Retired product path; requires a new explicit product decision before any design or implementation work. |
| Public portal DNS / Nginx route | A | Public-boundary runbook, approval, validation, rollback. |
| Google/OAuth provider integration | A or B | B if local contract only; A if public callback, provider secrets, or production cookies are involved. |
| Payment-driven entitlement activation | A | Payment provider, webhook, balance, entitlement, and rollback gates. |

## Current Status

```text
Public company site: historical Aliyun root record; verify the current public-site topology live
Public lead intake: historical Aliyun boundary record; verify the current public route live
Public Admin: blocked
User portal shell: repository-only / local reference
Dynamic portal entry: repo-only internal service, operator CLI, and default-off
local HTTP adapter; no production public route
TOTP: repo-only internal service; injected verifier only
Local preview account factors: in-memory only; next password login requires
second-factor verification after authenticator/passkey enablement
Password login: local UI/client contract only; default HTTP client fail-closed
Anti-bot check: local math check plus honeypot only; no production CAPTCHA
Email-code / magic-link login: retired; hidden compatibility stubs fail closed
Google/OAuth login: future convenience login only
Payment-driven entitlement: not active
Automatic subscription issuance: not active
```
