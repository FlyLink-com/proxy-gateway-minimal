# Data-pack WSL physical acceptance

```yaml
document_metadata:
  doc_type: operational
  lifecycle: active
  authority_scope: data_pack_wsl_physical_acceptance
  superseded_by: null
  last_verified_at: 2026-09-30
  production_authority: false
```

Risk: A (isolated runtime validation, not production). Reuse #753 and mobile
#13. This package is not a merge, migration, deployment, or catalog approval.

## What the package proves, if executed successfully

The real Hysteria2 process, repository runtime adapter, collector, control
SQLite, accounting service and credential-reset coordinator must establish:

1. Two independently metered synthetic packs and a timed plan authenticate.
2. Small bounded loopback transfers produce correctly attributed collector
   deltas. The receipt separates a seeded baseline from observed protocol bytes.
3. A real delta crosses pack A's quota. After apply/restart, a fresh connection
   for A fails while pack B and the timed plan still work.
4. Resetting B waits for its exact apply and durable journal continuation
   receipts before artifact rotation. Old imported node material
   fails; replacement material works. Metering identity and consumed allowance
   are preserved. The old subscription artifact is revoked, the new artifact
   is available through the order resolver.
5. Interrupting only the run-owned server and recovering does not duplicate
   measured usage, resource lineage or subscription tenants.
6. Run-owned processes terminate and all six test listeners disappear.

The scenario seeds synthetic control-resource/delivery claims. It explicitly
reports `authenticatedPurchaseToDelivery: false`: it is **not** authenticated
purchase/Coins capture-to-delivery E2E, mobile/Safari acceptance, a 100 GB
physical transfer, three-protocol coverage, or production acceptance.

## Frozen inputs and admission

- Exact `codex/data-pack-commerce` source commit in its dedicated checkout.
- Node 22.23.1 Linux x64 and Hysteria2 2.9.3, using the existing preparation
  script's pinned vendor digests and manifests.
- `node-modules.tar` and `dependency-artifact.json` from the existing
  `control-plane-dependency-artifact.yml` workflow on **that same commit**.
  A PR check alone does not upload these inputs; a non-PR workflow dispatch
  must produce the exact verified artifact. Do not substitute an older master
  artifact, Windows `node_modules`, or local unreviewed npm installation.
- A private gate JSON binding `sourceCommit`, the complete `source.tar` and
  `source-tree.json` digests, `PACKAGE_FILES` hash map, Node/Hysteria hashes,
  dependency archive/manifest hashes, fixed
  ports, synthetic-only/loopback-only scope, creation/expiry, and single use.
  The outer command also binds the SHA-256 of that JSON. Expiry is at most six
  hours after creation; source, input or file drift stops the run.
  Both entry admissions require at least 195 seconds remaining so the full
  180-second envelope and its termination grace stay inside the authorization.
  The copied child gate is also checked against the approved JSON digest.
- Run directory: one direct, owned, nonlinked 0700
  `/tmp/gccgw-data-pack-wsl.XXXXXXXX`, created by preparation.
- Gate: direct owned 0600 `/tmp/gccgw-data-pack-wsl-gate.XXXXXXXX.json`.
- Empty receipt directory: owned 0700
  `/tmp/gccgw-data-pack-wsl-receipt.XXXXXXXX`.

Gate construction and artifact staging are local preparation, not operator
approval. Bind the actual hashes and obtain exact one-use execution approval
before invoking the physical command. Do not reuse the consumed earlier
preparation attempt or a failed/expired physical gate.

## Execution and containment

Invocation contract (placeholders are not an approved command):

```text
bash scripts/data-pack-wsl-artifact-prep.sh SOURCE_COMMIT
# Stage the same-source CI archive/manifest into the returned private run_dir.
bash scripts/data-pack-wsl-acceptance.sh RUN_DIR GATE_FILE GATE_SHA256 SOURCE_COMMIT RECEIPT_DIR
```

The gate is atomically consumed before runtime admission. Node extraction and
private self-signed IP certificate generation remain within the validated run
directory. No npm lifecycle or Linux addon executes on the WSL host: archive
extraction, tree/native custody/runtime verification and native SQLite use
occur inside fresh user/mount/network/PID namespaces. The dependency verifier
uses direct kernel xattr inspection for POSIX ACLs and file capabilities when
WSL lacks `getfacl`; inspection failure blocks, it does not skip the check.

The child masks `/mnt`, `/home`, `/root` and other host `/tmp` entries, then
binds back only its private run directory. It verifies different parent/child
namespace identities, only `lo`, no default route and the mask mounts. No
production files, `.env`, database, material map, SSH credential or customer
record is copied. It uses an empty inherited environment and no provider API.
The fd bind uses `--no-canonicalize` and verifies the original directory's
device/inode identity. Empty-namespace probes exposed that the ordinary bind
resolved into the masked `/tmp` instead; the corrected command preserves the
original directory and sentinel, leaves the parent namespaces unchanged, and
cleans up the probe. No protocol process was started by those probes.

Fixed private listeners are UDP 25443, Traffic Stats HTTP 26080, echo target
26081, and fresh client TCP inbounds 26101/26102/26103. Credentials/passwords
are created inside the private run and never placed on the command line or
printed. Per probe: at most five seconds and 255 KiB payload (below the 256 KiB
transport bound), at most 48 requests. The physical envelope is limited to
180 seconds, plus a 15-second termination grace. It does not call sudo, apt,
systemd, enable an old collector, or open a public listener.

Hysteria's candidate launch validates parsing/TLS and owned UDP/stats listeners
before active replacement. No unsupported `--check` flag or skipped test is
used. Cleanup signals only tracked child handles with matching PID/start-time
and executable identities; identity uncertainty fails instead of killing an
unrelated process. Namespace-init exit terminates remaining descendants.

## Failure, receipt, and cleanup

- Admission, dependency, TLS, apply, collector, accounting, reset, recovery,
  timeout, scope or cleanup failures stop. No automatic rerun or retry.
- The existing reset coordinator's durable pending receipt is intentionally
  completed with the **same** reset reference after exact apply; this is the
  scenario's recovery boundary, not a second one-use execution.
- Retain only aggregate `physical-receipt.json` and `driver-receipt.json` in
  the approved receipt directory. They distinguish protocol observations,
  seeded bytes, receipt stages, scope, outcome, namespace and cleanup results.
- No raw config, stats payload, material, subscription URL, SQLite row or
  foreign error text is included. Physical-result keys and scalar types are
  explicitly whitelisted before receipt serialization.
- After receipt retention, remove only the resolved, unchanged named run
  directory. Keep the consumed gate marker and receipt. Removal is cleanup of
  this disposable synthetic fixture, not a production cleanup authorization.
- If receipt copy/write fails, retain the 0700 private fixture instead of
  deleting the only evidence, report failed retention/cleanup, and stop. It
  requires a separately scoped evidence recovery, not a replay of the run.
- Timeout or missing physical receipt must remain failed/unknown, never
  inferred as a physical pass because the namespace exited.

## Earlier envelope evidence

This source slice has unit/injected-transport tests and an empty namespace
envelope rehearsal. Those do not start Hysteria or prove physical stop. The
complete physical command has **not been executed**. #753 and #13 remain
Draft; the three offers remain unpublished, and production is unchanged.
Exact-head CI, independent safety review, frozen dependency artifact and the
one-use physical receipt must be bound separately before promotion work.

The focused source/transport/tree/gate suites and explicit Windows-to-WSL
cleanup fixture suite passed 51 tests, 0 failures, 0 skips in this slice.
For ordinary Windows validation the three shell fixture cases are explicitly
skipped unless `GCCGW_WSL_SOURCE_VALIDATION=true`; Linux runs them directly.
The full Windows source suite was run but remains non-green on workflow/
POSIX source-fixture assertions outside this slice. Source environment preflight
also reports its npm executable detection blocker. Neither is a Linux or
physical acceptance pass; exact new-head Linux CI remains required.

## Earlier reset-to-collector prerequisite (2026-09-30, superseded below)

The product reset now waits at `edge_applied` for an exact durable full-metering
receipt before rotating its delivery artifact. The single-channel clear-mode
scenario requires a caller-owned `meteringResetContinuation` provider;
physical-process mode rejects `synthetic_provider`. The current physical entry
has not wired a real provider and will stop at `metering_resume_required`.
Do not reuse its older frozen execution gate or treat injected provider tests
as proof of the five-source journal collector. Its truthful aggregate scope
retains `fullMeteringMaterialContinuation: false` and separately reports whether
the control receipt was validated. The updated receipt whitelist preserves
these fields without accepting arbitrary nested data. This paragraph records
the earlier source state; the new opt-in composition below replaces that gap.

The source bridge itself is tested through the real five-source reader, journal
and sample writer with synthetic daemon snapshots, including reset recovery and
exhausted retained identity handling. This closes a source integration gap only.
Before physical execution, rebind the updated source/dependencies and complete
the isolated non-clearing protocol/collector composition. Production, mobile
device and all-three-protocol enforcement acceptance remain separate.

## Non-clearing Hy2 to journal composition (2026-09-30, source only)

The current WSL entry selects `full_metering_journal` rather than the earlier
single-channel clearing collector. One owned Hy2 server supplies actual
non-clearing `/traffic` observations. Its loaded config is parsed with the
existing strict runtime projection; file identity/digest, process identity and
loopback listeners are checked before and after the bounded HTTP read. A
restart changes source generation independently of the config digest. Invalid
JSON, unknown users, invalid counters, missing observations or config drift
are not silently replaced with zeros.

The acceptance composition uses the real binding reader, source driver,
journal and sample writer, with one shared synthetic control database and
exactly three selected Hy2 resources. Four additional quiet **synthetic** timed
bindings explicitly satisfy the existing five-source contract. The complete
request/channel/credential scope is frozen; an extra or moved resource stops
collection. A transport warm-up precedes the first zero-debit baseline and
each actual restart, without manufacturing an observation.

The same journal lives through exhaustion, reset and server recovery. Normal
collection must reject the unapproved reset material transition. Only the
exact durable product reset proof allows `collect-pack-resets`; the resulting
control receipt gates final artifact rotation. Synthetic quota seeding remains
separate from observed protocol bytes. No commercial purchase is generated by
this fixture.

Aggregate receipts distinguish `physicalSourceCount: 1` and
`syntheticSourceCount: 4` for an actual transport (0 and 5 for injected unit
transports), and require `allFiveSourcesPhysicallyObserved: false`. The actual
WSL entry independently requires a physical transport, full journal
continuation, unchanged reset usage, old credential rejection, new credential
acceptance, one-pack blocking and successful recovery. Legacy receipt parsing
is retained for historical/source tests, not accepted as the new physical run.

The new session and loaded-config projection are explicit `PACKAGE_FILES`
roots; the entire exact source tree and dependencies remain independently
bound. All earlier gates are obsolete for these changed files. This closes the
test-entry source gap, **not** physical execution. The new entry has not been
executed; it still needs a reviewed final commit, same-source Linux dependency
artifact and a fresh approved one-use isolated run. Mobile/browser login,
three-protocol enforcement, production backup/rollback and publication remain
separate acceptance boundaries.
