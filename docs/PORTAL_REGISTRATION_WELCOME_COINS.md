# Portal Registration Welcome Coins

```yaml
document_metadata:
  doc_type: operational
  lifecycle: active
  authority_scope: portal_registration_welcome_coins
  superseded_by: null
  last_verified_at: 2026-09-04
  production_authority: false
```

## Status and Boundary

This is a source-only contract for a narrow new-registration promotion. It does
not authorize a production schema apply, feature-flag change, deployment,
payment, Wallet write, Commerce order, fulfillment, runtime mutation, or
customer-data action. A source artifact, migration, test result, or Portal
build is not evidence that the promotion is enabled in production.

The promotion is not wallet-first. It is deliberately separate from
`docs/FUTURE_ACCOUNT_WALLET_FIRST_MODEL.md` and must not be used to activate a
shared node, deferred runtime, Account Resource Authority, escrow/setup
delivery, payment path, or resource effect. This source release keeps deferred
runtime and node composition dormant.

## Configuration Contract

The following protected runtime settings control admission:

| Setting | Required value | Meaning |
| --- | --- | --- |
| `USER_PORTAL_REGISTRATION_WELCOME_COINS_ENABLED` | `true` | Permits admission to the new-registration promotion. The default is `false`. |
| `USER_PORTAL_REGISTRATION_WELCOME_COINS_AUDIENCE` | `canary` or `all_new_registrations` | Selects one exact canary email or every eligible new registration. An absent key retains the historical `canary` behavior; a present empty or unknown value fails closed. |
| `USER_PORTAL_REGISTRATION_WELCOME_COINS_CANARY_EMAIL_HASHES` | Exactly one lowercase SHA-256 digest in `canary`; completely absent in `all_new_registrations` | Selects the one approved registration email after trim-and-lowercase normalization. |

The admission flag requires Portal registration, Coins Wallet, ordinary Coins
Commerce, and the welcome-grant schema to be ready. If the admission flag is
true and any one of those prerequisites is unavailable, composition fails
closed. When the flag is false, new registrations remain on the legacy trial
path; a missing welcome-grant schema does not itself start a worker or block
that legacy path. When Coins Wallet, ordinary Coins Commerce, and the schema
are ready, the internal coordinator may drain or expire durable grants that
already exist, even after admission is disabled; that drain behavior does not
admit a new registration or introduce another environment flag.

Only an enabled admission flag reads the audience or canary setting. In
`canary` mode, the canary must be exactly one 64-character lowercase
hexadecimal SHA-256 digest. A missing audience key is interpreted as `canary`
only for compatibility with an existing exact digest. In
`all_new_registrations` mode, the canary key must be completely absent; leaving
it present with an empty value is an ambiguous configuration and fails closed.
A present empty audience, unknown audience (including `all_active`), raw email,
duplicate or multiple digests, and any non-canonical digest also fail closed
before database access. The digest is pseudonymous rather than anonymous: it
belongs only in protected runtime configuration and must not be committed,
returned by the Portal, or printed in logs or deployment evidence.

`USER_PORTAL_WALLET_FIRST_MODEL_ENABLED` is deprecated. It must remain false;
setting it true fails closed. It neither enables this promotion nor activates
wallet-first, a deferred runtime, or any other capability.

## New-registration Contract

For a matching canary, or any **new** registration under
`all_new_registrations`, while the admission flag is enabled, the source
contract is:

1. create the normal Portal account and credentials/session records;
2. omit `commercialModel` from persistent account metadata, including
   `wallet_first_unique_v1`;
3. create no legacy trial entitlement and no Portal access request;
4. record one durable, idempotent welcome-grant intent; and
5. credit exactly 10 available `bonus_coins` once the normal Wallet grant path
   processes that intent.

The source contract gives the welcome Coins a seven-day expiry measured from
registration. A pending grant at or after its expiry must not be credited. The
grant/retry path is durable and idempotent, so a crash/retry cannot create a
second credit for the same registration.

A non-matching new registration in `canary`, or a registration while the flag
is disabled, uses the legacy 7-day trial behavior. Changing the audience or
canary does not migrate, rewrite, or re-route an existing account. The
durable-grant worker may only resolve an already-recorded grant under its
existing credit-or-expire lifecycle; it does not make an account newly eligible
for this promotion.

## Commerce and Fulfillment Boundary

An account created by this promotion resolves through the ordinary legacy
commercial path because it has no persistent commercial-model marker. Its
Marketplace visibility, Coins settlement, normal Commerce order/fulfillment
flow, and existing payment boundaries are reused without alteration. The 10
welcome Coins are a balance grant, not a service entitlement, order, payment,
or immediate resource issuance.

This promotion must not create a parallel order system, replace ordinary
fulfillment, or reinterpret Coins settlement. It also must not introduce a
shared node, per-order-to-shared-node migration, deferred reservation,
Authority binding, protected setup material, escrow, or payment-provider
change.

## Schema and Runtime Boundary

The durable welcome-grant store has its own schema contract. An independent
Risk A gate is required before applying or migrating that schema in production.
The source composition may process existing durable welcome grants only when
Wallet, ordinary Commerce, and the exact welcome-grant schema are all ready.
The worker has no registration-canary or new-account-admission dependency; its
enclosing ordinary Commerce composition retains its existing prerequisites.
The source does not apply a schema automatically, and schema absence while
admission is disabled leaves the normal legacy registration path available.

The schema successor accepts only the exact, checksummed prior welcome-grant
contract. It removes the obsolete commercial-model column while preserving a
valid predecessor row's immutable grant identity, including `sourceDigest`,
solely for retry and idempotency continuity. It does not reinterpret that
historical digest as an account commercial model; a drifted predecessor fails
closed instead of being rewritten. Before a rebuild it also refuses unknown
explicit indexes or triggers attached to the grant table, and any SQLite view
whose SQL references that table; SQLite autoindexes remain allowed. This avoids
silently discarding or leaving behind dependent schema objects.

The view guard is intentionally conservative text matching, not a SQL parser.
An unrelated view that merely contains the table identifier in its SQL text can
therefore block a migration. That is a safe, explicit stop: the future Risk A
schema dry-run must inventory and resolve it before any production apply. This
source release never drops, rewrites, or bypasses such a view automatically.

Production application is owned by a separately frozen one-shot transaction
wrapper, not by a standalone schema command. Its outer root orchestrator
validates and durably consumes the exact Risk A execution envelope, acts as the
approved operator that establishes the exact start guard and stops the service,
and binds an aggregate external-holder count of zero to the database identity.
It then starts one closed child as the verified non-root service principal that
owns the database. The production-facing entry is a fixed no-argument static-PIE
outer wrapper invoked by its reviewed absolute candidate path, never by first
starting `node`, `npm`, `/usr/bin/env`, a shell, or a `PATH` search. It selects
exact `/usr/bin/node`, synthesizes the allowed environment, establishes the
non-dumpable root Node image, and completes its pre-import runtime/artifact gate
before package or candidate-library imports. The outer transaction launches
`scripts/control-plane-welcome-coins-activation-transaction-custody-cli.mjs`,
which imports the exported `runWelcomeCoinsSchemaCustodyChildCli` from
`scripts/control-plane-db-snapshot-gate-lib.mjs`. That library co-locates the
  private closed-child core, schema core, and exclusive-custody primitive; inside
  the child, the same SQLite connection remains under exclusive custody for
  snapshot, dry-run, apply, final validation, and the post-commit activation
  handoff. Immediately after schema commit it opens a second read-only
  `BEGIN EXCLUSIVE` hold on that same connection. The separate
`scripts/control-plane-welcome-coins-schema-custody-gate-lib.mjs` is only a
fail-closed inspection/apply/CLI facade and is not the child implementation.
Before custody, the child exactly revalidates all real/effective/saved/fs
UID/GID slots, its sole supplementary service group, all five capability sets
at zero, `NoNewPrivs=1`, `TracerPid=0`, parent PID/start-time, and fixed
FD3/FD4/FD5 identities and directions. Root ownership of the followed
`/proc/self` directory is only fail-closed evidence for non-dumpability in the
reviewed host-procfs boundary. The candidate now adds a fixed no-argument native
root broker and post-exec bootstrap that establishes `PR_SET_DUMPABLE=0` before
descriptor delivery, plus independent host-root `/proc/<child>` readback.
Absent or namespace-ambiguous proof remains NO-GO. The required CI supplies
exact-source-ref, same-repository privileged protocol evidence against an
isolated temporary candidate tree. That Source/Merge evidence does not validate
the production host, `current` pointer, systemd state, protected environment,
or database, and it does not grant production authorization.
The wrapper's private artifact binding covers the exact transaction CLI,
activation/snapshot libraries, holder observer, both migration modules, custody
CLI, static outer wrapper, native broker, both post-exec bootstraps, native build
receipt, complete materialized `node_modules` tree, and `/usr/bin/node`. Files
are bound by content hash and opened-file identity; the tree also binds entry
count, total bytes, ownership/mode/link rules, and internal symlinks. A child
name or raw symlink target containing the legacy record delimiter fails closed.
The wrapper revalidates the complete binding before launch, after binding both
live custody executables via `/proc/<pid>/exe`, before releasing commit
authority, and on both sides of the private activation callback.
The snapshot gate itself only reads and verifies the outer wrapper's guard; it
does not create or delete it. The facade's dedicated custody-gate CLI launcher
fails closed with `execution_envelope_required`; the standalone schema CLI launcher rejects
`--mode apply` with `custody_gate_required`. This boundary prevents another
database consumer from writing between an accepted snapshot and the schema
commit. The
child pauses before schema mutation after reporting only `exclusive_acquired`.
While its exclusive connection remains held, root performs a second aggregate
holder check bound to the same database identity and requires zero external
holders other than that exact child. The child claim must match the approved
service principal and process/channel identity hashes, while the second
observation must report exactly one approved child database holder with those
aggregate identities; only then does it release the one-time
commit authorization. Any missing, malformed, changed-identity, or nonzero
second observation closes the child without authorizing commit. After commit
and final schema validation, the child emits one exact aggregate-only
`schema_ready_custody_held` frame while the second EXCLUSIVE transaction stays
open. The parent performs private activation and verification with the service
inactive, the guard unchanged, and artifacts revalidated. The broker binds the
unique custody child with `pidfd_open`, stops it through that pidfd after the
complete held frame, confirms the same hardened identity and stopped state,
and only then forwards held to root. Root must complete the fixed
challenge-bound sequence `pre_activation`, `post_activation`, `post_verify`,
and `post_terminal_guard`; the broker echoes each canonical payload only while
that same pidfd is live and stopped. It repeats the readback before accepting
exactly one `release_after_activation_verified` frame bound to the held-frame
SHA-256, then writes FD5 and resumes the child through the pidfd. Any missing,
reordered, mismatched, or unverifiable heartbeat, or any other failure,
attempts the bound `release_after_attention` path and stays
`attention_required`. Only a verified release may publish the matching
terminal schema result.

A valid `activation_verified_guarded` Receipt is post-hoc evidence that the
holder survived through verified release under the reviewed Linux
process/kernel model; it is not an absolute OS-lock or cross-resource atomicity
guarantee. `SIGKILL`, OOM, root/broker/child death, kernel or host failure, and
power loss can remove the SQLite lock without a parent release. If the wrapper
can still report, that outcome is `attention_required`; otherwise there is no
acceptable success Receipt. Because schema commit and `.env` publication are
separate durable mutations, an execution without a valid success Receipt must
not automatically start or retry, restore the database, rewrite configuration,
or remove the start guard before a fresh read-only identity inventory.
After commit transmission begins, any controller or terminal uncertainty stays
`attention_required`. The held phase has no 120-second child execution
deadline: the child is stopped while the broker waits on the controller socket
and pidfd, and each heartbeat/native frame exchange has a 30-second I/O
deadline. The 120-second child bound begins only after the broker accepts
release, writes FD5, and resumes the child. The 155-second controller terminal
bound covers that wait, up to 30 seconds of broker cleanup, and a fixed
5-second grace before an identity-rebound containment kill; it must not be used
as an external watchdog for a legitimate held phase. Only an allowlisted
aggregate `custodyCondition` may survive into the outer Receipt; raw stderr,
PID, path, timestamps, sizes, and database identifiers remain prohibited.
On Linux, the dry-run input is the retained snapshot descriptor path rather
than the public artifact path, so a swap-and-restore race cannot redirect the
dry-run to a different database object. After the mutation connection closes,
the gate performs its final full logical readback inside a fresh exclusive
transaction and only after the final guard/artifact cleanup. That v2 logical
identity includes the exact schema cookie, normalized journal mode, and
accessible hidden `rowid` values; it distinguishes `WITHOUT ROWID` and fails
closed when all hidden rowid aliases are shadowed. The terminal
connection reconciles rollback, bounded close retry, and Linux FD closure before
returning; loss of snapshot/directory evidence takes
priority over an operation failure.

The schema custody facade deliberately exposes no production mutation
capability: its dedicated CLI and direct programmatic mutation call return
`execution_envelope_required` before guard/path access. The snapshot library
exports the single-purpose closed-child CLI runner, but neither the generic
custody mutator, its schema core, its exclusive primitive, nor a test-only
mutation seam. Local tests derive an in-memory harness from the exact source
without adding a generic production capability. The dedicated `*-cli.mjs` launchers dispatch unconditionally,
while `*-lib.mjs` imports have no CLI side effects; no launcher relies on a
release/current or file symlink remaining unchanged during main-module path
comparison. Historical non-`-lib` entry names are explicit compatibility
launchers, so an old direct command returns a structured nonzero result rather
than silent success; they are not import targets.
The candidate one-shot wrapper permits only its single verified
service-principal child to reach the internal custody implementation after the
outer root orchestrator durably consumes the exact FD3 approval envelope. The
minimal wrapper must terminate as
`activation_verified_guarded`, with the service inactive and the exact guard
retained. Service start, post-start health, a new operator canary, and guard
cleanup are later independent Risk A actions. The wrapper and closed-child
capability now exist as locally tested candidate source, but are not an
executable production activation path merely because the isolated privileged
synthetic gate passes. Final freeze/review, fresh live inventory, and a new
exact Risk A approval remain mandatory.

No production enablement is authorized by this document. Any future production
change needs fresh inventory, an exact approval boundary, backup and rollback
evidence, and post-change validation appropriate to its Risk A scope.

## Admission-configuration Tool Boundary

The repository-owned Welcome Coins activation gate is intentionally narrower
than a generic runtime-configuration editor. It derives the current release's
protected `.env` from the approved `current` pointer and permits a one-time
atomic insertion of only the admission flag and a single normalized-email
digest. It does not set the audience key or activate `all_new_registrations`;
that production configuration change requires a separate, freshly inventoried
Risk A gate. The digest is stdin-only and is not returned in a receipt. Its
bounded deactivation mode accepts only the exact active environment identity
plus the retained preflight identity, removes only the canonical two-key
suffix, and must reproduce the preflight bytes and SHA-256 exactly.

The module-private activation/deactivation mutators require the service to be
inactive under the pinned runtime guard. The closed activation transaction owns
that guard and the approved welcome schema custody sequence. The separately
approved deactivation transaction reuses the same hardened physical wrapper but
has an independent exact envelope and durable consumption record; it establishes
the guard while the fixed service is active, stops it, revalidates the artifact
and environment boundary, performs bounded deactivation plus disabled
verification, and leaves the service inactive and guarded. Deactivation does
not enter database custody, run schema/snapshot work, restart the service, or
remove the guard. Neither transaction modifies ordinary Commerce or any
wallet-first/deferred/Authority setting. If the target
keys conflict or any non-target safety prerequisite is unexpected, it fails
closed rather than reconciling or overwriting the configuration. The sole
retry exception is an exact identity-bound already-active state with the same
stdin digest; it is a no-op confirmation, never a rewrite. Deactivation and
disabled verification retain the same inactive start-guard requirement. A new
deactivation approval may accept an already-disabled no-op only when both
envelope environment identities equal the retained preflight identity; the
consumed envelope itself is never reusable and drift fails closed.

## Explicit Non-goals

- wallet-first account selection or persistent commercial-model assignment;
- deferred runtime, shared-node, per-order migration, or resource effects;
- Account Resource Authority, setup delivery, protected material, or escrow;
- payment, recharge, checkout, normal Commerce, or fulfillment changes;
- existing-account migration or trial rewriting; and
- production schema application, activation, deployment, or runtime mutation.

## Source Validation

Validate the registration route, welcome-grant migration/store/coordinator,
runtime-state composition, Portal client contract, and focused compatibility
tests together with the normal full source suite. A passing source test suite
does not establish production schema readiness or activation.
