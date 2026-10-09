# Native session renewal

```yaml
document_metadata:
  doc_type: operational
  lifecycle: active
  authority_scope: source_only_native_session_renewal
  superseded_by: null
  last_verified_at: 2026-10-06
  production_authority: false
```

Risk A: authentication and an additive SQLite migration. This work is one backend
implementation PR, coordinated with the Android client PR. The user's request
authorizes local implementation and synthetic validation. It does not authorize
production migration, configuration activation, deployment, or rollback.

The read-only inventory used `origin/master@2a166a7d7f5bcf8ba0b7e1dc7ef2a9a804533adf`.
Existing native password/MFA access sessions last 1,800 seconds; `rememberMe`
only affects the separate browser cookie conversion. Browser bootstrap does not
renew native credentials. Existing browser, registration, subscription, and
commerce contracts remain unchanged. No production database or environment was read.

## Wire contract

The feature is disabled unless `PLATFORM_PORTAL_NATIVE_SESSION_ENABLED=true`.
Disabled endpoints return 404, including on databases without the new schema.
Enabled but incomplete or altered schema returns 503, without a schema write.

* `POST /api/portal/native-session`: exact JSON `{}` and one `X-Portal-Session`
  header containing the just-issued password/MFA access session. Authentication
  must have completed in the same service instance within 60 seconds. Exchange
  consumes the same one-use authorization as browser conversion. Registration
  setup and standalone entry/TOTP sessions cannot acquire a refresh grant.
* `POST /api/portal/native-session/refresh`: exact JSON `{refreshToken}`; no
  access header. Atomically consumes the grant and returns a new short session
  and a new refresh token. No automatic HTTP retry is permitted.
* `POST /api/portal/native-session/logout`: exact JSON `{refreshToken}`; no
  access header. Revokes the recognized family and its access sessions. Unknown,
  expired, or already-consumed correctly formed credentials have the same 200
  `{loggedOut:true}` response. This is logout for that login family, not every device.

Exchange and refresh return `{session,refreshGrant}`. `session` retains the
existing native DTO including `accountId`. `refreshGrant` has exactly
`refreshToken`, `issuedAt`, `expiresAt`. The token is `pnr1_` followed by the
canonical unpadded base64url encoding of 32 random bytes (48 characters total).
The unchanged native session object contains `sessionRef`, `accountId`,
`authMethod` (`password` or `totp`), `status` (`active`), `issuedAt`, `expiresAt`,
and `safety`. Its four safety booleans (`totpCodeReturned`,
`encryptedTotpSecretReturned`, `rawEntryTokenReturned`, `runtimeDbMutated`) are
all false. Rotation preserves the completed login's authentication method.
All timestamps use UTC ISO strings with milliseconds. Grant timestamps always
refer to the original successful authentication; expiry is an absolute seven
days later. Refresh cannot slide this deadline. New access expiry is the smaller
of now plus 30 minutes and the family's absolute expiry. Refresh-issued access
does not receive browser or native conversion eligibility.

Invalid, consumed, revoked, expired, or account/credential-invalid grants return
401 `invalid_refresh_grant`. Invalid fresh exchange returns 401 `invalid_session`.
Malformed or mixed transports return 400 (the existing browser boundary can
reject earlier with 403/503). Storage/schema failures return 503
`native_session_unavailable`. All native endpoint responses use `no-store`.
No cookies, browser context, query credentials, Authorization header, or unrelated
body keys are accepted. Only 404/405 indicates an old-server compatibility path;
other failures never imply a refresh grant exists.

## Persistence and revocation

Refresh credentials are stored only as SHA-256 digests in a dedicated table;
they never appear in legacy `platform_portal_sessions`. Consumed generations
are retained so reuse can revoke the entire family; no cleanup job is introduced.
The same additive migration creates a small account-epoch table. Credential or
account revocation increases its monotonic counter, included in the native
credential binding. This also invalidates a fresh 60-second exchange permission
when a password is changed back to its former value or an account is reenabled,
without revoking unrelated legacy/browser sessions. There are 17 expected schema
objects: two tables, three indexes and twelve triggers; inspection binds their
exact definitions to the returned DDL SHA-256.
An immediate SQLite transaction owns consume, replacement insert and access
creation. A detected reuse commits revocation before the service throws 401.
Explicit access revocation, account disable/delete, or password/MFA credential
replacement/revocation invalidates associated grants. Revocation survives later
account reactivation. Ordinary verification timestamps and passkey counters do
not revoke sessions. The migration adds narrowly scoped revocation triggers so
direct credential/account updates cannot silently revive native grants.
Setting or changing a credential lock advances the epoch; successful validation
clearing an already-expired lock does not revoke its own fresh authentication.
Clearing a lock never restores families revoked when the lock was established.

When native renewal is enabled and its schema is ready, the existing private
MFA `challenge_hash` stores a versioned digest of the account, challenge creation
time, allowed factors and first-factor credential binding. Completion verifies
that binding again, including inside the commit transaction. No new public MFA
field is introduced. Native revocation triggers lock only active challenges
whose private hash starts with the exact `portalnative_mfa_v1_` version prefix.
Native challenges survive process restart; historical challenges retain their
short-login behavior and cannot acquire a native grant. A disabled feature or
missing schema creates only the historical short-login challenge format.

Previous short access sessions retain their original deadline during rotation;
no existing delivery receipt is rebound to a new access session. Clients must
single-flight renewal while protected operations are idle, invalidate previous
owners/quotes, atomically persist the returned pair, and revalidate protected
reads. A pending unacknowledged delivery remains bound to its original session;
renewal does not replay setup, acknowledgement, purchase, or other writes.
If a rotation commits but its response is lost, this minimal hash-only protocol
cannot recover that token: the client must fail closed and authenticate again.
Offline or transient failures do not imply that an otherwise-valid saved login
or refresh grant was revoked. No background service or automatic VPN action is introduced.

## Validation and operator gates

Local source gate: synthetic temporary SQLite only, service/route/migration
boundary tests, existing browser/auth regression tests, repository server suite,
and `git diff --check`. Record exact commands and results before marking the PR ready.
These results do not attest to production behavior.

Before staging or production: identify the exact artifact and deployed schema,
take and restore-test an operator-approved database backup, inspect migration
without writes, confirm complete schema/trigger definitions, and review expiry,
rotation, replay, logout and account/credential revocation in an isolated copy.
The source service never auto-applies this migration. Applying it and setting the
enable flag require separate explicit approval and an execution receipt.

The explicit migration API is `applyNativeSessionMigration({database})` in
`server/services/platform/native-session-store.mjs`; its caller supplies the
already-approved SQLite connection. `inspectNativeSessionSchema({database})`
checks every expected table/index/trigger definition and returns the migration
identity and DDL SHA-256 without rows or credentials. Partial or altered schema
is rejected rather than repaired. `dryRunNativeSessionMigration({database})`
serializes a consistent SQLite image into an isolated in-memory database,
applies there, and checks that the source bytes remain unchanged. It neither
opens a production path itself nor emits the serialized database. Operators
must choose a validation environment sized for that in-memory snapshot; this
does not create or replace the separately required durable backup.

Rollback first disables the feature and verifies 404 with old short-login and
browser paths intact. Revoke native families before a binary rollback; keep the
additive table and triggers for revocation evidence. Do not drop data or restore
an old database over newer business writes. Any destructive schema rollback or
production restoration needs its own approved plan. Production activation and
client end-to-end renewal remain unperformed by this source change.

The enable flag is an endpoint gate, not a revocation action: disabling and then
reenabling it can resume an otherwise valid saved grant before its absolute
expiry. A rollback that must prevent resumption therefore explicitly revokes
all native families and their access sessions in the approved SQLite transaction
before changing binaries. That operator step is not performed by local tests.

## Local validation recorded 2026-10-06

The 55 new service/schema, HTTP and runtime-flag tests pass with zero skips.
Focused regressions cover existing browser transport and password/TOTP sessions.
Two independent SQLite connections exercise same-token rotation: one succeeds,
the replay is rejected, and revocation of the family and access sessions commits.
Independent source review identified the MFA credential-change and expired-lock
boundaries; failing tests were added before fixing them, together with the
fresh-authentication change-and-restore window and account-delete cascade.

`npm test` on Windows / Node 24.16.0 completed with 5,360 tests: 5,291 passed,
13 failed, 56 skipped. It is not a full-suite green result. A clean detached
checkout of the inventoried base commit reproduced the same 13 failing case
names with no source changes. Those cases cover existing CRLF/source-text,
Windows path/mode and privileged-wrapper fixture assumptions. The three
source-closure/workflow cases additionally passed against six exact Git LF blobs
exported into an isolated fixture; their candidate source bytes match those Git
blobs after checkout-only CRLF normalization. No custody allowlist was expanded.
Linux CI and its privileged synthetic gates remain required before merge.

Document authority validation checked 412 metadata blocks successfully;
`git diff --check` passed. The precommit planner's generic B classification does
not override this task's Risk A authentication/schema classification. The first
full-suite run was deliberately interrupted for the lock-boundary fix; only the
completed final run is counted above. No real-account, production migration,
feature activation, delivery rebind or protected business write was performed.
