# User Portal Auth Boundary

Last updated: 2026-05-31, Asia/Shanghai.

This document defines the customer-portal authentication boundary for the
Aliyun-first subscription-control platform. It is a repository design contract
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
| Portal session | Short-lived authenticated browser session. | Store session ref, account ref, expiry, status, and audit metadata. | No. |
| Subscription artifact token | Fetches rendered subscription output. | Existing artifact model; never reuse as portal auth. | Only through artifact route rules. |
| External identity | Future Google/OAuth/email identity binding. | Store provider subject hash/ref and account binding. | No. |

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

An operator-only CLI wrapper exists at
`scripts/platform-issue-portal-entry.mjs` / `npm run
platform:issue-portal-entry`. It can write a dynamic entry row to the
subscription-control database and write visible-once entry material to an
operator handoff file. Running that command against production data remains
A-tier; the repository implementation itself grants no production authority.

Required behavior:

- operator-approved account and entitlement exist before issuing an entry;
- entry token is opaque, random, visible once, and stored only by hash;
- entry token has `expiresAt`, `maxUses`, `usedAt`, `revokedAt`, and audit
  metadata;
- first successful entry can enroll a TOTP authenticator;
- TOTP verification has rate limits, attempt counters, replay window controls,
  and audit events;
- successful verification creates a short-lived portal session;
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
- requesting a refresh-ready decision for an existing active issued link;
- requesting renewal, support, or operator review;
- copying a subscription URL only when a separate artifact-access policy allows
  it.

The session must not authorize:

- Admin APIs;
- production issuance mutation;
- operator CLI invocation;
- payment provider mutation;
- edge/node mutation;
- DNS, Nginx, firewall, or runtime changes;
- broader artifact issuance or legacy query-token retirement.

The repository now includes `server/services/platform/user-portal-subscriptions.mjs`
for local user-scoped subscription summary and refresh-decision behavior. The
service validates an active portal session, reads only that account's control
summary, returns safe entitlement/issued-link/quota metadata, and can record an
audit-only refresh request for an existing active issued link. It does not
return raw subscription URLs, create runtime tenants or artifacts, call CLI,
perform issuance, activate payment, or deploy a public portal route.

`server/routes/user-portal.mjs` can expose the matching local adapter endpoints
only when `state.platform.userPortalAuth`, `state.platform.userPortalSubscriptions`,
and `state.platform.userPortalRoutesEnabled === true` are provided by the
caller. The default application state still exposes no portal route.

## Phase 3: External Identity Providers

Google Login, GitHub OAuth, Microsoft OAuth, Apple Sign In, email magic links,
Passkeys/WebAuthn, or Telegram Login Widget can be added later as convenience
and account-recovery mechanisms.

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
| Repository-only user subscription summary / refresh decision service and tests | B | Active portal-session scope, safe metadata only, audit-only refresh row, no CLI call, no runtime tenant/artifact mutation, no raw subscription URL. |
| Explicitly-enabled local portal subscription summary / refresh HTTP adapter | B | Default-off mounting, no production route, no cookies, no Admin API, no subscription issuance, no payment activation, no raw URL echo. |
| Local user-portal UI prototype using mocked client data | B | No public deployment, no real auth provider, no artifact URL exposure. |
| Real portal DB migration | A | Migration runbook, backup, rollback, validation. |
| Public portal DNS / Nginx route | A | Public-boundary runbook, approval, validation, rollback. |
| Google/OAuth provider integration | A or B | B if local contract only; A if public callback, provider secrets, or production cookies are involved. |
| Payment-driven entitlement activation | A | Payment provider, webhook, balance, entitlement, and rollback gates. |

## Current Status

```text
Public company site: active on Aliyun root
Public lead intake: active on Aliyun boundary
Public Admin: blocked
User portal shell: repository-only / local reference
Dynamic portal entry: repo-only internal service, operator CLI, and default-off
local HTTP adapter; no production public route
TOTP: repo-only internal service; injected verifier only
User subscription summary / refresh decision: repo-only internal service and
default-off local HTTP adapter; no raw subscription URL, no CLI invocation, no
runtime tenant/artifact mutation, no payment activation
Google/OAuth login: future convenience login only
Payment-driven entitlement: not active
Automatic subscription issuance: not active
```
