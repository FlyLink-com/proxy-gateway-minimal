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

## Current acceptance approach: verify steps, package last

The operator selected stepwise acceptance on 2026-09-30 after the failed
one-use physical run. Do not start another all-in-one physical run as the next
diagnostic action. Verify prerequisites and individual functions first, retain
an outcome for each step, and check the complete functional/dependency index
when assembling the final package. Packaging proves input/evidence coverage;
it does not itself prove any business behavior or authorize execution.

The stepwise sequence is a **runbook contract**, not an independent-stage CLI.
The current shell/Node entry still executes the complete scenario. The source
correction below adds bounded failure stages/categories to its receipt, not
individually executable stages or complete per-step acceptance records. Do not
invent stage flags or bypass existing safeguards.
Stepwise acceptance may use scoped manual commands or existing function calls
when they enforce the approved isolation, evidence and cleanup boundaries.
Correct the prerequisites blocking the next physical step first; a general
stage CLI or framework is not required.

### Step sequence and required evidence

| Step | Narrow responsibility | Completion evidence / stop condition |
| --- | --- | --- |
| S00 Input identity | Source, public binary, dependency archive/manifest, complete source-tree and root-file digests. | Exact versions and hashes match. Drift, expiry, missing inputs or an already-consumed execution stop the affected action. |
| S01 Isolation | Verify namespace identities, private directory ownership/modes, loopback-only interfaces/routes and fixed ports. | Independent isolation receipt; no protocol starts here. Earlier `namespaceVerified:true` is historical evidence, not authority for a new fixture. |
| S02 Dependency preparation | Verify ancestor modes and **nonrecursive** ancestor ACL/capability checks; recursively inspect only the private dependency tree; extract and verify tree, custody and runtime tuple. | Separate dependency receipt before transport construction. Keep the production verifier strict; no writable-ancestor exception or broad filesystem walk. The scoped source conflict is corrected below; real extraction/custody/runtime acceptance is still pending. |
| S03 Synthetic control state | Establish the owned temporary database, resources, escrow, migrations and accounting/reset composition. | Exactly the intended resources, shared database identity and zero extra issuance/debit. No production database, schema or credentials. |
| S04 Protocol startup | Generate private material/TLS, validate loaded config, launch only the owned Hy2 process and verify its identity/listeners. | Startup and initial authentication evidence; no quota exhaustion/reset yet. A failed start preserves a classified stage outcome and cleanup evidence. |
| S05 Natural metering | Warm-up, zero-debit baseline, bounded transfer, non-clearing observation, real reader/driver/journal/writer attribution. | Observed bytes and source generation match; seed bytes are separate. One physical Hy2 plus four synthetic sources must stay explicitly labeled. Missing observations are unknown, not zero. |
| S06 Single-pack exhaustion | Cross pack A's quota through an observed delta and apply its credential removal. | New A connections fail; pack B and the timed plan still work. Desired-state removal alone is insufficient. |
| S07 Refresh and reset | Verify order refresh, the same durable pending reset, exact apply, authorized journal continuation and artifact rotation. | Used bytes/lineage unchanged; zero-charge new baseline; old credentials fail and new credentials work; no duplicate purchase or refreshed allowance. |
| S08 Failure recovery | Interrupt only owned test processes and resume the same synthetic resource/journal lineage. | Usage, resource count and issuance are preserved; no old database snapshot overwrites later writes. |
| S09 Customer/browser acceptance | Use real authenticated synthetic-account Commerce/control delivery, close/reopen order, refresh and reset from desktop/mobile UI. | Purchase/Coins and owner/no-store boundaries plus UI actions accepted. Simulated edge evidence and a narrow desktop viewport are labeled; physical iPhone/Safari is separate. |
| S10 Teardown | Stop tracked owned processes, verify listener/process absence, retain each aggregate receipt outside the disposable directory, then remove only that exact directory. | Process/listener cleanup and directory cleanup are separate results. Failed or unknown cleanup cannot be overwritten by successful directory removal. |
| S11 Final index and packaging | Reconcile every function, caller, test, stage result, dependency and retained evidence against the final source/artifacts. | Every required feature has an explicit passed/failed/pending/not-covered status. Missing or incompatible evidence blocks readiness; do not silently fall back to another full physical run. |

S00-S03 can be isolated from protocol behavior. S04-S08 must preserve the
same frozen source/runtime tuple and explicitly recorded fixture, resource,
database and journal lineage. Do not stitch results from freshly reseeded
databases or incompatible credentials into a supposed continuous reset or
recovery pass. An independent stage must own its start/cleanup boundary or
explicitly retain an approved bounded session; no unattended listener/session
is left behind between operator turns.

Source/unit evidence may be reused only when its touched boundary and inputs
are unchanged; rerun affected or uncovered checks, not the whole project.
Target metadata, fixture identity, expiry and approval remain fresh checks.
Splitting steps does not authorize a physical process, relaxed isolation,
production mutation, or replay of a consumed one-use record. Each Risk A
execution still needs its exact approved scope and rollback/cleanup boundary.

The stage result must include a fixed step ID, exact source/input identities,
start/end time, passed/failed/pending/not-covered outcome, bounded error
category, prerequisite evidence, mutation scope and separate cleanup status.
These are requirements for each future step record, whether produced by a
controlled manual procedure or a scoped helper. The entry now preserves a
bounded stage, primary failure and separate cleanup failure, but it does not
already produce all the per-step fields above. Preserve diagnostic category/stage
before cleanup; do not retain raw errors, logs, config, environment, identities,
subscription URLs or customer records. Classifier failure is unknown, not pass.

### Final functional index requirements

The final package index must bind each stable feature ID to its implementation
function/module, **actual caller/composition**, focused tests, stage evidence,
coverage limitations and package/dependency membership. A filename, exported
function, green CI or `PACKAGE_FILES` membership alone is not a functional pass.
Cross-repository mobile evidence must bind its own source/artifact and the
accepted backend contract; a backend SHA alone cannot attest the mobile UI.

Check both the explicit package roots and the complete exported source tree,
including statically and dynamically loaded modules and the Linux native
dependency/runtime tuple. Recheck the final source/artifact digests, retained
evidence retrievability, schema/rollback boundaries and all required statuses.
Historical seed/usage is never converted into a new user's charge. Missing
commercial, browser, device or additional-protocol coverage stays pending.
Final indexing is read-only and is not deployment, catalog publication,
cleanup authority or a substitute for production backup/approval gates.

### Verified functional source index (2026-09-30)

The following is navigation verified against runtime source at
`cfec9995a13ddf83ffa4e8f6e2748fb475d26ad6`. It records existing functions,
callers and test files, **not tests rerun by this documentation change**.
All paths are relative to the repository root. Source/synthetic validation
recorded in #753 may be reused within its unchanged boundary; actual protocol
and device acceptance remain pending after the failed run.

| ID / function | Implementation and caller/composition | Focused test index | Actual acceptance boundary |
| --- | --- | --- | --- |
| F01 Purchase and replay-safe Coins capture (three offers) | `coin-commerce-store.mjs`: `createCheckoutQuote`, `confirmOrder`, `captureClaimedOrder`, `recoverNonTerminalOrders`; `coin-commerce-data-pack-fulfillment.mjs`: handler `execute`. Both are under `server/services/platform/`; `server/routes/portal-coin-commerce.mjs` calls checkout/confirm, and `server/state.mjs` wires production fulfillment. | `server/tests/platform-coin-commerce-data-pack-http-acceptance.test.mjs`; `server/tests/platform-coin-commerce-data-pack-cross-db-recovery.test.mjs` | Synthetic funds/temporary databases; HTTP composition tests use simulated edge application. Real browser purchase and independent physical enforcement are separate. |
| F02 Independent subscription issuance and owner-order retrieval | `server/services/platform/coin-commerce-data-pack-runtime-issuer.mjs`: issuer `issue`; `coin-commerce-data-pack-order-delivery.mjs` in the same directory: delivery `get`; composed by `server/state.mjs`, owner-scoped retrieval in `server/routes/portal-coin-commerce.mjs`. | `server/tests/platform-coin-commerce-data-pack-runtime-issuer.test.mjs`; `server/tests/platform-coin-commerce-data-pack-order-delivery.test.mjs` | Core/control/escrow validation is not client import/connection acceptance. Reject cross-account and incomplete delivery without exposing subscription material. |
| F03 No commercial expiry and no monthly allowance reset | `server/services/platform/usage-billing-cycle.mjs`: `DATA_PACK_TECHNICAL_VALID_UNTIL`, `isLifetimeDataPackBinding`, `usageCycleForBinding`; `coin-commerce-data-pack-runtime-issuer.mjs` sets/validates the technical deadline; billing/writer uses the lifetime cycle. | `server/tests/platform-usage-billing-cycle.test.mjs`; `server/tests/platform-coin-commerce-data-pack-runtime-issuer.test.mjs` | Commercial expiry is absent; the internal technical deadline remains year 9999. Do not claim the runtime/database has no expiry field. |
| F04 Independent metering attribution and durable usage | `scripts/lib/full-metering-data-pack-bindings.mjs`: `readFullMeteringDataPackBindings`; `full-metering-sample-writer.mjs`: `fullMeteringBindingIdentity`, `makeFullMeteringSample`, `createFullMeteringSampleWriter`; binding reader is called by `traffic-vless-recovery-baseline.mjs`, and the acceptance session composes reader/source driver/collection/writer. | `server/tests/full-metering-data-pack-bindings.test.mjs`; `server/tests/full-metering-data-pack-pipeline.test.mjs` | SQLite/reader/writer tests use synthetic counters. The real Hy2 observation and one-physical/four-synthetic journal path still need S05. |
| F05 Exhaust only the selected pack | `server/services/edge/data-pack-desired-state-rows.mjs`: `readDataPackDesiredStateRows`; `server/services/platform/subscription-control-db.mjs`: `getLatestEdgeDesiredStateForChannel`; `scripts/lib/full-metering-data-pack-bindings.mjs` preserves verified exhausted bindings as retained. | `server/tests/platform-coin-commerce-data-pack-agent-convergence.test.mjs`; `server/tests/full-metering-data-pack-pipeline.test.mjs` | Desired-state/Agent synthetic evidence does not prove actual denial. S06 requires rejected fresh A connections and usable B/timed-plan connections. |
| F06 Refresh/retrieve and reset credentials without restoring quota | `server/services/platform/coin-commerce-data-pack-artifact-rotation.mjs`: artifact `rotate`; `coin-commerce-data-pack-credential-reset.mjs`: credential `rotate`; `server/state.mjs` wires the reset/coordinator and `server/routes/portal-coin-commerce.mjs` exposes the owner-scoped rotate operation. | `server/tests/platform-coin-commerce-data-pack-artifact-rotation.test.mjs`; `server/tests/platform-coin-commerce-data-pack-metering-reset.test.mjs` | Control/Core/material state-machine evidence does not prove real old/new node authentication. Refresh retrieves delivery; reset waits for exact apply and metering proof before artifact rotation. |
| F07 Reset journal continuation and crash repair | `scripts/lib/full-metering-data-pack-reset-continuation.mjs`: `admitFullMeteringDataPackResets`; `full-metering-collection.mjs`: `runFullMeteringCollection` in `collect-pack-resets` mode; control store reads/provides/records metering-reset proofs/receipts; `createDataPackFullMeteringSession().continueReset` composes this acceptance boundary. | `server/tests/full-metering-data-pack-reset-pipeline.test.mjs`; `server/tests/data-pack-full-metering-session.test.mjs` | Real journal/control stores with synthetic snapshots are source integration, not five physical sources. Same durable operation, retained used bytes and zero-charge transition require S07-S08 evidence. |
| F08 Desktop order delivery controls and mobile companion | `admin/src/features/user-portal/commerce/components/portal-data-pack-subscription.tsx`: `PortalDataPackSubscription`; `commerce-client.ts` in the parent commerce directory: `getDataPackDelivery`, `rotateDataPackDelivery`; `orders/portal-orders-panel.tsx` in the user-portal directory renders the component. Mobile counterpart remains separate PR #13. | `admin/src/test/portal-data-pack-subscription.test.tsx`; `server/tests/platform-coin-commerce-data-pack-http-acceptance.test.mjs` | Component/HTTP tests do not attest a browser purchase or physical iPhone/Safari. Bind the mobile source/artifact independently; S09 stays pending. |

Final indexing must also include safety functions, not only product features:
input/source-tree guards, dependency custody/runtime checks, namespace checks,
owned process/listener identity, no-store/owner HTTP boundaries, diagnostic
classification and separate teardown/retention functions. These remain S00-S02
and S10 obligations even when F01-F08 have source-test evidence. Verify the
existing exported roots and complete source tree again when packaging; this
navigation table is not an executable manifest or proof that independent stage
selectors have already been implemented.

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

This earlier source slice had unit/injected-transport tests and an empty
namespace envelope rehearsal. Those did not start Hysteria or prove physical
stop. The complete physical command had **not been executed at that earlier
cutoff**; the failed 2026-09-30 run below is the later execution result.
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
bound. All earlier gates are obsolete for these changed files. At the source
cutoff this closed the test-entry source gap, **not** physical acceptance. The
later failed execution does not supply a passing physical result. Mobile/
browser login, three-protocol enforcement, production backup/rollback and
publication remain separate acceptance boundaries.

## Failed one-use execution and identified source conflict (2026-09-30)

Exact source `cfec9995a13ddf83ffa4e8f6e2748fb475d26ad6`, one-use gate digest
`cd35de098c755025735282439a6e2daf605839c5503190e0c55db7d786bcf857`, finished
`2026-09-30T15:50:26Z`: one approved execution, exit 1, no replay. Driver
stage was `physical`; the inner receipt recorded namespace verification true,
`physicalResult:null`, internal transport cleanup false and only the generic
`acceptance_stopped` category. No business/physical scenario is accepted.

Aggregate receipts were retained outside WSL `/tmp` and independently matched
2/2 recorded digests. Outer preparation-directory deletion passed; a readonly
scan found zero readable executable references under that exact directory.
This does not manufacture a passing internal process/listener cleanup receipt.
Generated private runtime material/raw logs were not retained. The consumed
record is evidence only, never a reusable execution approval. Source stayed
unchanged/clean during that execution; no production access or catalog change
occurred. Current native PR records remain the status authority.

Readonly source reproduction confirmed a dependency-parent contract conflict:
the namespace mounts `/tmp` with mode 1777, while the extractor rejects writable
ancestors. Even a nonwritable `/tmp` is rejected by the supplied callback's
run-directory-only path policy. The callback also always walks recursively,
so widening its path policy would risk walking ancestor trees. Fix the isolated
entry's mode and nonrecursive-parent versus private-tree ACL contract without
relaxing the production dependency verifier. The generic actual receipt does
not identify the first exception; earlier archive checks remain unverified.

The following source correction addresses S02 and observable stage/category
boundaries. Individual runtime validation remains next. This record does not
authorize a new package/run, merge, production switch or product publication.

## Scoped source correction and validation (2026-09-30)

Risk: B source correction within the Risk A release envelope; reuse #753.
The final commit is bound in the native PR record. No new physical execution,
namespace, archive extraction, protocol process or production action occurred
in this source slice.

- Change only the private namespace's `/tmp` tmpfs from 1777 to 0755; no host
  directory is changed. The shared production dependency verifier is unchanged
  (SHA-256 `2c38121240cda6dfaacef547a5feca164209f97f613997155d8a4451b8abca72`).
- The isolated ACL helper admits only `/`, `/tmp` and the exact owned run
  directory for nonrecursive checks, and only the exact extracted
  `dependencies/node_modules` tree for recursive checks. It rejects ACLs,
  capabilities, inspection errors, unavailable Python, path drift and excessive
  tree size. It does not traverse symlink targets or relax ancestor mode rules.
- Entry failures retain eight closed stage names and bounded categories;
  primary failure and cleanup failure stay separate. Unknown errors remain
  unknown without message, stack, path or raw output. A rejected arbitrary
  scenario result is never serialized as accepted physical evidence.
- These are entry diagnostics, not a new stage CLI or a passing physical
  result. Admission failure does not write to an unadmitted directory; absence
  of a started transport does not fabricate successful process/listener cleanup.
  The shared preparation library's internal cleanup-error precedence was not
  changed; this slice does not claim to recover an already-overwritten error.

Source validation performed in this slice (overlapping sets, not additive):

- TDD RED: 11 ACL boundary tests failed before implementation; diagnostic guard
  additions reached 24 pass / 7 fail, and entry control-flow tests reached
  1 pass / 9 fail before their fixes. A separate cleanup-category RED failed
  before its mapping was added.
- Final focused tests: **63 total / 63 pass / 0 fail / 0 skip**. Entry execution
  is fully injected, not a protocol run. Eight Python fixtures execute the
  exact inspector with synthetic `os` operations, not filesystem inspection;
  a Windows CRLF expectation was corrected in the test, not in the Linux helper.
- Final affected regression: **167 total / 157 pass / 0 fail / 10 skip**.
  Platform-specific and explicit-WSL cleanup cases were skipped in this Windows
  invocation; this is not new WSL cleanup or Linux native custody evidence.
- Full Windows run on the same runtime/test slice, before recording these
  validation notes: **5,607 total / 5,529 pass / 11 fail / 67 skip**; exit 1.
  It is not green. Five unchanged workflow/source assertions assume LF, two
  unchanged project-contract fixtures convert already-CRLF input again, and
  two assertions assume POSIX path separators. The remaining two unchanged
  welcome-Coins wrapper fixtures expire at `2026-09-30T18:00:00.000Z` and now
  fail the real freshness check before their intended marker assertions.
  These inputs/implementations are outside this scoped diff; they were not
  fixed or silently skipped. Direct focused Python fixtures pass, while the
  sanitized full-suite child has no Python on its path and explicitly skips
  those eight cases. Prior counts of nine failures are not reused for this run.
- Source environment preflight is ready; three changed JavaScript modules
  pass syntax checks. Staged whitespace and `origin/master...HEAD` whitespace
  checks pass; both document-authority checks validate 413 metadata blocks.
  A future exact-commit Linux CI is still required and cannot be substituted
  by the previous source's successful run.
- One independent read-only Security Review fallback found no confirmed
  finding within the scoped source correction and unchanged shared verifier;
  9/9 reviewed file digests were stable and its overlapping 55 tests passed.
  Dedicated vendor tooling was unavailable. The subsequent eight Python
  test-only fixtures were implementer-verified, not represented as a second
  independent review; runtime code did not change after that review.

S02 real extraction/custody/runtime verification remains pending. Then verify
S04-S08 on the same frozen fixture and journal lineage, and complete S09 browser/
mobile acceptance. Build the final safety/function/dependency index only after
those individually observable results exist. The consumed failed execution
remains failed evidence and cannot be replayed. #753 stays Draft; three offers
remain unpublished and no production/customer accounting was changed.
