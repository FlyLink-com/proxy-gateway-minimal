# Independent data packs: release preparation, 2026-10-15

```yaml
document_metadata:
  doc_type: operational
  lifecycle: active
  authority_scope: data_pack_release_readiness_2026_10_15
  superseded_by: null
  last_verified_at: 2026-10-15
  production_authority: false
```

Risk: A release envelope; local source/test and backend-release preparation only
in this record.
Release units remain `control-plane-app` and `portal-static` (desktop/mobile);
`frontend_surface: portal`, `identity_impact: true` for the pack runtime.
Reuse backend #753 and mobile #13. Neither product publication nor production
execution is recorded here. Admin defects are a separate workstream.

## Confirmed product scope

- 100 GB / 30 Coins, 200 GB / 50 Coins, 500 GB / 100 Coins.
- Each purchase has its own subscription and quota. A timed plan or another
  pack never shares its quota or third-party subscription eligibility.
- No commercial expiry; the approved technical cutoff remains year 9999.
- Exhaustion disables only that pack. Refresh/reset never restores usage.
- A successful purchase displays subscription delivery directly; closing it
  does not lose the owner's ability to retrieve it.
- Latest UI request: marketplace has an owned-pack list with View; order facts
  stay in order details. Delivery is a read-only link field with Copy and Reset
  toolbar actions, a copy/import acknowledgement and explicit reset confirmation.
- No historical usage backcharge. These already-approved product choices do
  not require another pricing or expiry decision.

## Source and evidence identity

- Fresh backend PR head at inventory: `0ff37ff8dc9ecee5a2d44fa83332195a4647a6fe`.
- Master integrated: `742459d11aa15d9061e7dafe4ab584a5c72dbaf1`.
- Local normal merge: `ea84a15f8c435bda50c2e5f54cd4558d6f839c2c` (no conflict).
- Fresh mobile PR head at inventory: `5273843c9d0ad7c2311cd3b69c738020ca65cf9b`.
- Implementation following those heads is local until an explicit commit / PR
  update records otherwise. This document does not assert a remote head changed.

Current-turn validation before the latest owned-list UI iteration:

- Windows Node v24.16.0 / npm 11.13.0; locked dependencies installed by `npm ci`.
- Backend full source runner: **6,389 total / 6,321 passed / 0 failed / 68 skipped**.
  TAP: `output/data-pack-release-20261015/server-tests.tap` in the dedicated
  backend integration worktree. Skips are not physical or Linux acceptance.
- 33 related backend test files passed before the additional shared-account
  regression. That regression suite then passed **35/35**: real candidate pack
  offer refs and a legacy monthly tenant coexist under the same SQLite account;
  the monthly tenant remains eligible, all three pack tenants do not inherit it.
- Earlier desktop slice: 120 focused tests and 1,810 full Admin tests passed;
  portal web build, artifact verify and frontend boundaries passed. Initial TDD
  reproduced three immediate-delivery gaps, then the extra status-button test
  reproduced the operator's request to hide it after delivery.
- Earlier mobile slice: 194 tests and build passed. Its SSR/source tests alone
  do not execute browser effects.
- Independent fallback reviews found no confirmed new issue in the first mobile
  six-file diff and the desktop seven-file diff. Dedicated vendor Security Review
  tooling was unavailable. Those bounded reviews are **not** whole-PR review and
  do not cover the subsequent owned-list/toolbar UI until separately verified.

Latest mobile owned-list/toolbar diff received a separate independent fallback
security review. No concrete new implementation defect was reported. The reviewer
did identify an evidence gap: the test called "real paged order reads" injected
a resource loader and used a cursor shape different from the real read client.
It does not establish actual client pagination. A real-client, synthetic-fetch
regression was proposed for approval; it is not recorded as completed here.
Browser effects (copy outcome, pending-reset close/reopen, and recovery retention)
must be reported from their own observed checks, not inferred from SSR tests.

The real mobile browser then exposed a backend composition defect: the reset
route passed its three-field mutation input into the delivery resolver, whose
strict ownership contract accepts exactly `accountId` and `orderRef`. This
returned 404 before the real reset service could create its durable intent.
The route now projects only those two fields for ownership verification and
still passes all three fields to the reset service. It does not loosen either
service's input validation or authentication.

A new real-HTTP/SQLite/store/resolver/reset test first failed with 404 instead
of the expected fail-closed pending response. After the minimal fix, 139 related
tests passed. The regression verifies unauthenticated, other-owner, incomplete
order and extra account-field rejection; the owner's reset creates exactly one
durable intent, survives store/server restart with the same operation reference,
and does not duplicate debit, resource or subscription. Without actual edge and
collector receipts it remains 503/pending, **not completed**. A separate
independent fallback security review of exactly these three changed backend
files reported no new finding; it inspected code and diff whitespace without
claiming to rerun the 139 tests. The updated full backend source run passed:
**6,390 total / 6,322 passed / 0 failed / 68 skipped**, recorded in
`output/data-pack-release-20261015/server-tests-final.tap`.

The latest mobile implementation passed **198/198** full tests and its build.
An isolated loopback browser at 390 x 844 exercised real Cookie authentication,
orders, delivery, encrypted material and rendering with synthetic accounts and
data. Both purchased packs were recoverable after reload and fresh login; the
latest delivery card, copy acknowledgement and reset cancellation were observed.
Screenshots were masked before saving. The fixture used simulated edge apply
receipts and no protocol or collector; its reset attempt is retained as the
pre-fix 404 evidence, not relabelled as a successful post-fix browser reset.
The subsequent HTTP regression above separately proves entry into durable
pending reset. Closing/reopening the mobile uncertain reset did not send another
POST. The owned browser and loopback fixture exited; no production was contacted.
Detailed evidence is in the mobile worktree's
`output/playwright/data-pack-commerce-20261015/browser-acceptance.md`.

The latest desktop owned-list/toolbar implementation passed **156 focused
tests**, then the full Admin test suite passed **1,817/1,817** in 100 files.
Desktop Portal TypeScript/build and 10-file artifact verification passed;
frontend source boundaries, environment preflight, document metadata and both
branch/working-diff whitespace checks passed. Its independent fallback security
review reported no concrete new issue within the listed UI changes. These
component tests use the Commerce client boundary; desktop browser visual and
keyboard verification have not been performed for this new slice.

Desktop pending-reset references live only in the current authenticated Portal
memory scope (including switching Marketplace/Orders), not browser persistence.
Closing/reopening a dialog keeps the same operation reference; a full page reload
is not covered by that memory-only guarantee. Mobile retains only non-secret
reset references in session storage. Neither surface persists subscription URLs.

GitHub Actions run `38547708917` reports a budget startup blocker. Run
`38547712867` contains skipped jobs and no artifacts. Neither is a green check.
The prior PR-body Linux Node 20 validation record remains author-provided source
evidence, not a newly verified fixed-Node-22 native artifact or physical run.

## Physical validation preparation, not execution

Pinned public inputs have been downloaded and hashed, without extraction or
execution, under `output/data-pack-release-20261015/public-inputs`:

| Input | SHA-256 |
| --- | --- |
| Node 22.23.1 Linux x64 archive | `9749e988f437343b7fa832c69ded82a312e41a03116d766797ac14f6f9eee578` |
| Hysteria2 2.9.3 Linux amd64 | `66dbdb0608f25f3057b433afe975a9fc1af2ca8e512479e294988b3ef363d6c1` |
| Hysteria vendor hash manifest | `7df8b471145b20bb98fde254da29b61557093dd82f9ada0a01d47670f94633ee` |

Node's vendor manifest also matched the pinned archive digest. A fresh read-only
WSL check found Ubuntu-24.04, Linux x86_64, non-root uid 1000, required compiler,
archive, hashing and namespace tools present, and ample space/inodes. This does
not create or attest a new isolation namespace. No protocol or collector was
started and no old one-use execution record was replayed.

Still missing: a final-source Linux native dependency archive/manifest, real
S02 custody/runtime verification, and continuous S04-S08 evidence. Existing
physical scenario covers one Hy2 source and four explicitly synthetic sources;
it is not all-three-protocol or authenticated browser purchase acceptance.
Follow `DATA_PACK_WSL_ACCEPTANCE.md`: individually observable steps, same
resource/database/journal lineage, and final evidence indexing last. Do not
invoke its all-in-one entry as the next diagnostic or invent `--stage` flags.

## First application startup is a database mutation boundary

`server/state.mjs` opens the control store with default schema initialization.
`COINS_COMMERCE_DATA_PACK_RUNTIME_ENABLED=false` therefore does not prove that
installing/starting the new application is schema-neutral. The initializer can
create these **eight named objects** (plus SQLite's implicit constraint indexes):

| Table | Named index |
| --- | --- |
| `platform_data_pack_resources` | `platform_data_pack_resources_account_idx` |
| `platform_data_pack_artifact_rotations` | `platform_data_pack_rotation_pending_idx` |
| `platform_data_pack_edge_credentials` | `platform_data_pack_edge_active_request_idx` |
| `platform_data_pack_credential_resets` | `platform_data_pack_credential_reset_pending_idx` |

The inventory recorded later in this document found all eight objects absent.
That dated readback is not permission to apply them. Before **first** new application startup, bind current deployed app /
collector identity, exact database and journal paths, additive schema, backup
completeness, compatible rollback target, and service/synchronization boundaries.
Production data and credentials must not be copied to the developer workstation.

The production runtime additionally requires a configured pack node, edge
lifecycle/agent routes, and a distinct protected escrow path/key. Check existence
and separation without exposing values. The three offers remain candidate-only
until executable fulfillment, meter attribution and enforcement are accepted.

Rollback must distinguish zero new business writes from post-write state:

- Before new writes: validate restore from the just-created backup against the
  exact prior application/collector and all required protected material.
- After new Coins/orders/usage: preserve those facts and journals; never overwrite
  them with a pre-release snapshot. Closing new sales is not erasing paid packs.
- A synthetic snapshot restoration test is not proof of BWH's current database
  or old binary compatibility. No live migration, restore or catalog write has
  been executed by this preparation.

## Remaining release sequence

### Backend first: installation with pack runtime disabled

The operator's latest request prioritizes the backend, not another frontend
release. The first proposed production scope is therefore **only
`control-plane-app`**, with `COINS_COMMERCE_DATA_PACK_RUNTIME_ENABLED=false`,
the three pack offers unpublished and Portal/Admin/mobile static pointers
unchanged. This is backend installation, **not a claim that packs are available
to buy or use**. It does not authorize changing the independent collector,
readers, protocol configuration, checkpoints, identity maps or historical usage.

The default-off source review at `d74f5687a1a9064e595aa4e742e71df12bc8eaef`
found no automatic pack activation or catalog-publication path. The production
entry retains its authoritative plan catalog, and does not compose pack escrow,
delivery, reset or rotation workers while the flag is off. This was an
independent bounded fallback review of the disabled deployment path, not a
vendor Security Review or a complete security certification of all enabled
pack functionality. Existing Commerce workers still run and can create normal
business writes.

Closing the flag does not isolate every shared change: control-store schema,
credential attribution, desired state and material persistence are shared with
existing plans. In particular the new readonly material reader queries pack
tables directly; do not replace it ahead of schema initialization or quietly
bundle it into the independently installed collector.

The fixed `d74f5687` source was then tested in local WSL Ubuntu-24.04 with
Node 22.23.1 / npm 10.9.8 / ABI 127 / glibc 2.39. Locked production dependencies
were installed with scripts disabled, then `better-sqlite3` 12.10.0 was compiled
from source against the verified Node headers. **260/260 tests in 12 files
passed, zero skips**, covering production startup, catalog, schema and shared
legacy plan, accounting, material and edge paths. Test processes ran in a new
unprivileged user/network namespace with loopback only. No protocol process or
production connection ran. Temporary processes/directories were checked and
cleaned after export.

The reusable **candidate-only**, not production-ready, dependency archive is
`output/data-pack-release-20261015/linux-candidate/node-modules-linux-x64-node22.tar`
(43,407,360 bytes, SHA-256
`c43fefd24141890e111df6e06387eb42f18c507451c8f1cfa7de058f82531a82`).
Its manifest, TAP and `LINUX_VALIDATION.md` are beside it. The lock SHA-256 is
`f887e3fbc36fd2b7c61434ec4441a8b6dada6f53486f8cead76de5d03c7ace10`.
All 1,779 archive entries are within `node_modules`; the prohibited environment,
credential/key and database filename checks found zero matches, and dependency
symlinks did not escape the directory. A controller-side archive rehash matched.
Reuse still requires matching target libc/ABI, dependency lock and the reviewed
mixed-app composition. This result neither covers later uncommitted tests nor
replaces the BWH old-binary compatibility test.

A subsequent controller-run Windows acceptance passed **5/5** (four phase
subtests plus the parent):
`DATA_PACK_CROSS_VERSION_ACCEPTANCE=1 node --test server/tests/data-pack-cross-version-off-acceptance.test.mjs`.
This archives the real old master `742459d11aa15d9061e7dafe4ab584a5c72dbaf1`,
creates the synthetic database using that old runtime, starts the current real
production composition with pack runtime disabled, then reopens the same
database with the old runtime. Old schema/data hashes remain unchanged on
upgrade; the eight added named objects remain, all four pack tables stay empty,
and old-runtime rollback preserves the additional normal Coins and usage writes.
Old material store -> new ordinary put/transaction -> old material store also
preserves the three synthetic materials. No pack rotation is staged.

The evidence is `output/data-pack-release-20261015/cross-version-off.tap`, Node
24.16.0 / ABI 137, old and candidate package/lock contents verified identical.
The two runtime versions start sequentially in the **same Node process**, not
separate old/new deployed binaries. Default execution explicitly skips this
manual acceptance (0 passed / 1 skipped) so archive/shallow runners need no Git
history; explicit activation fails if the fixed old object or dependency
agreement is missing. This strengthens source compatibility evidence only,
not mixed BWH runtime compatibility, physical traffic or enabled-pack rollback.
Only the new test and this record changed after `d74f5687`; the business-source
and dependency boundaries of the reused full suite and Linux run are unchanged.

[The native #786 Deploy Note](https://github.com/FlyLink-com/proxy-gateway-minimal/pull/786#issuecomment-6168424121)
read during this preparation identifies the last
recorded BWH application as
`control-plane-pr786-c7b094592662-mixed`, overlay source
`c7b094592662ab764f2ad8d0086decb9925a569f`, layered on #785. It is **not**
the whole `master` commit. This is recorded deployment evidence, not a fresh
host read. Its code-only `old-app.tar` backups are not database backups for
this release. Do not overwrite this composition with whole-master source
without reconciling the existing fixes and runtime links.
[The #785 Deploy Note](https://github.com/FlyLink-com/proxy-gateway-minimal/pull/785#issuecomment-6166805459)
records the preceding three-module overlay. Both local overlay archives were
rehashed against those receipts; neither is a complete current-app artifact.

The #786 installer recorded the full-tree inventory at
`/opt/proxy-gateway-minimal-candidate/backups/legacy-zero-quota-pr786-c7b094592662/installed.json`.
Its location is established from the local installer source; the file has not
been remotely read in this preparation. The corresponding old inventory
reports 658 files and three runtime links, whereas the local synthetic proof
explicitly disclaims equivalence to the complete production release. Use an
approved server-side comparison and return only hashes/counts/classifications;
do not fetch production runtime contents to the workstation.

The independent collector's recorded directory remains
`/opt/gccwebos-runtime/collector-plan-e834185cca07`; its recorded scope is
`local-three-v1`. No current service health is inferred from those historical
records. Updating that collector or its readonly reader is outside this first
backend-only installation stage.

Proceed with individually observable steps, not a new opaque execution bundle:

1. Verify final source and Linux dependencies; reconcile the actual installed
   app composition and its rollback target. Keep the frontend artifacts out of
   the deployment scope.
2. Exercise old-source creation, new disabled startup and old-source reopening
   against the same synthetic databases. Preserve added schema and all new
   normal-business writes during code rollback. A master-source fixture is
   source compatibility evidence, not proof of the mixed BWH binary.
3. Bind a narrow approved BWH readback: current app/dependency and collector
   identities; service entry and runtime-link targets; database/material/journal
   path identities and sizes; pack flag and catalog counts; exact added schema
   presence/definitions and pending-operation counts. Do not return customer
   rows, credentials, subscription URLs or raw configuration.
4. Bind the immutable candidate, complete online backups, retained compatible
   old app and schema delta before exact production approval. Install first;
   switch only after the dependency, backup and rollback checks pass.
5. After approved startup, verify app health, unchanged frontend and collector,
   pack-disabled/unpublished state, preserved existing subscription and plan
   behavior, aggregate identity and continuous natural metering. Record actual
   execution in #753's Deploy Note. Do not call retained stale identities healthy.

First-start schema mutation and post-write rollback rules above still apply.
The source-preparation stage above performed no production access. The later
approved read-only inventory is recorded below; no upload, startup, schema apply
or switch has occurred. Physical exhaustion/reset acceptance and frontend work
remain prerequisites for **activation/publication**, not reasons to repeat
unrelated checks during this disabled-backend preparation.

### Approved BWH read-only inventory, 2026-10-15

The operator approved bounded, individually observed SSH reads through the
existing `bwh-us` alias. Strict known-host checking, batch mode and disabled
agent forwarding were retained. The observations span 10:22:20-10:31:26 UTC.
No old one-use executor was replayed, no remote files were installed, and no
service, configuration, business record or release pointer was changed.
Native SQLite readonly/fileMustExist connections used query_only and a read
transaction; WAL/SHM coordination metadata may have been touched as disclosed.

The local redacted receipt is
`output/data-pack-release-20261015/bwh-readonly-inventory-20261015.json`.
It establishes these bounded facts, not deployment or accounting acceptance:

- Current app and process CWD still match
  `control-plane-pr786-c7b094592662-mixed`. The complete directory-entry walk
  rejected unlisted paths/types, did not follow runtime links, and required exact
  key-set equality before hashing: **658 files, 3 links, 0 mismatched entries**.
  The installed receipt SHA-256 is
  `2e83021a623c797524b5a130b891006d3f1e89118dfd3b732370da5bf5e80f65`.
- Backend, Nginx and all three protocol services were active with zero automatic
  restarts. Their process/invocation identities did not change between the two
  service observations. The collector timer was active/waiting; the latest
  natural collection at each observation ended successfully (10:22:14 and
  10:28:17 UTC). This does not prove positive usage, global identity health or
  every intervening collection; no checkpoint or identity-map audit was run.
- Node **22.23.1 / ABI 127 / glibc 2.39** and the Node binary hash match the
  candidate Linux manifest above. The installed lock is instead
  `a3422b6286c375e4fe5ebafc41baf27dc127ed182e63eee6c1f91dc183d92418`,
  byte-identical to the historical `2dea45fcbac1` lock. Root dependencies include
  ip-address 10.4.0, proxy-addr 2.0.7 and better-sqlite3 12.10.0; YAML 2.9.1 is
  separately present under `server/services/platform/node_modules/yaml`.
  The candidate dependency archive would also upgrade ip-address/proxy-addr;
  do not silently install it. These dependencies remain outside this change.
- Pack runtime is unconfigured/effectively false. Existing Commerce, plan-switch
  and Portal link-reset flags are enabled. Control, subscription and third-party
  databases are separate files; protected material exists, but pack escrow is
  not configured. No private path or credential value was exported.
- All **8 pack schema objects are absent**; pack row counts are missing/null,
  not measured zero. The existing commerce offer table contains **0 pack offers**.
  First startup still requires approval for additive schema creation.
- Within the queried Coins tables: 14 orders are captured and 14 fulfillment
  commands delivered; held/capture-pending/reconciliation-required and
  pending/processing/failed fulfillment counts are zero. Both recorded Portal
  link resets are completed. Scheduled plan switches contain **2 scheduled,
  0 applying and 1 superseded**; preserve these facts during upgrade/rollback.
  This is not a full payment reconciliation or a check of protected-file pending
  journals. No customer rows, identifiers or subscription material were returned.
- Control DB main file is 448,335,872 bytes; runtime/third-party databases and
  WAL/SHM sizes are recorded separately. The backup filesystem has 29,149,978,624
  available bytes and 2,470,410 free inodes. The prior #785 release exists, but
  no new backup or production restore test has been performed.

The scoped source comparison found **16 existing runtime files exactly matching
the candidate base, plus 10 new pack modules**. No affected file requires a
mixed-source merge. The preparation-only index is
`output/data-pack-release-20261015/bwh-backend-overlay-index-70a6c8ac.json`.
Its after-hashes identify Git blob content, not a built or approved production
archive. Preserve all other #786 files, root dependencies, nested YAML and the
three runtime links. Do not replace the independent collector or frontend.

Next preparation is the exact 26-file mixed-app candidate and narrow validation
with retained production dependency versions. Reuse unchanged source results;
the earlier 260-test candidate-dependency run is not proof of this retained-lock
combination. Review/merge and immutable artifact gates remain open. Then bind
new online database/material backups and post-write-safe code rollback before
asking for the exact installation/startup approval. Never restore an old data
snapshot over new normal Coins, usage or either scheduled plan switch.

### Retained-dependency source candidate, 2026-10-15

This stage is local-only preparation. It did not repeat the completed BWH
inventory, upload files, change services, create production backups, initialize
production schema, merge #753, or publish products. The application source is
fixed to `70a6c8ac908f9a0e18e890452ff5471cdace8433`, with base
`742459d11aa15d9061e7dafe4ab584a5c72dbaf1`.

The source-only candidate archive is
`output/data-pack-release-20261015/backend-overlay-70a6c8ac/backend-overlay.tar`:
**1,004,544 bytes**, SHA-256
`d6f665022b1e7e27eb7694a7e43982672f74c4027d607fa487ada1e131c4e97c`.
The accompanying manifest binds exactly 16 replacements and 10 additions to
their before/after hashes. Git blob bytes, rather than checked-out CRLF content,
were used. All 26 modules passed syntax checks; the controller separately
rehashed the archive/staging files and verified exact archive path-set equality.
There are no frontend, dependency, configuration, database or runtime-link
entries. This is a branch-source candidate, **not a master release artifact or
production execution package**.

An independent, read-only security fallback review of the 26-file off-only
boundary found no confirmed blocking defect. It checked the 16 shared paths,
default-off composition, unpublished catalog, additive schema and import
closure; 108 direct relative imports had no missing or unexpectedly changed
dependencies. Its four focused Windows suites passed **38/38**, zero skips.
The dedicated Security Review product tool was unavailable; this is an
independent-agent fallback, not that product's certification or a whole-PR
enabled-runtime review. In particular, the readonly material reader requires
the new tables and must not be promoted to the independent collector here.

A second local source index traces 209 runtime source files plus the retained
package/lock inputs. All 209 candidate source blobs are available, but 160
closure files have only historical synthetic-fixture provenance, not individual
current production hashes. The prior full-tree match proves consistency with
the server-private installed receipt; it does not export that receipt's full
mapping. Neither the historical 2,012-file synthetic index nor a whole-master
checkout is labelled the 658-file production tree. The closure index is
`output/data-pack-release-20261015/mixed-reconstruction/source-closure-index.json`,
SHA-256 `574b34d9afff8d7f9d13243acd0b09754a39bcf310ddcee1c30f40aad00996b3`.
The smallest remaining live composition check is a server-side comparison of
the expected unchanged source hashes; no database or configuration download is
needed. A mismatch stops candidate promotion rather than replacing unknown
production files with master.
The prepared, non-executing comparison list is
`output/data-pack-release-20261015/backend-baseline-source-index-70a6c8ac.json`,
SHA-256 `1868b61dd879e626ac8101a470e663190136867578004040e6c496c46b021823`:
201 expected regular source/package files and 10 expected absent new modules.
It uses pre-change hashes for replacements and does not treat new-module
after-hashes as current-production expectations. It is not a fresh host result
or authorization to access the host.

The retained-dependency local archive is
`output/data-pack-release-20261015/retained-dependencies/node-modules-retained-linux-x64-node22.tar`:
**43,335,680 bytes**, SHA-256
`927fcac60d46451123401ad3421e0fd2384dffa6272af35a6a384fc25a9e9c32`.
It reconstructs the production-matching old lock, preserves root proxy-addr
2.0.7 and nested YAML 2.9.1, and passes an isolated dependency smoke on Node
22.23.1 / ABI 127 / glibc 2.39 / SQLite 3.53.1. The locally rebuilt native binary
is not byte-identical to the installed production binary. This archive is a
**local validation input only**; production keeps its current dependencies.
An initial archive line-ending mismatch stopped before npm installation; raw
Git blob extraction then supplied the exact verified package/lock bytes. The
failed attempt remains separately recorded and is not passing evidence.

The retained-lock combination then passed **260/260 tests in 12 files**, with
zero failures/skips/cancellations. This is a new, explicit validation boundary,
not a relabelling of the earlier candidate-dependency run. It used raw Git
source blobs from `70a6c8ac`, the verified old package/lock, the retained native
archive and a fresh non-root WSL user/network namespace with loopback only.
No npm reinstall, protocol process, production input or SSH was involved.
The source archive SHA-256 is
`5b8fb53a1f11ae9f523229029150fbf3f5f876f8227d3ff13d9c3970cd5c2572`;
the test-list/file-digest manifest is
`da531f46e4f11650543a50290798e2b34806f6aa94df7d4094fbfdf2f7e8449f`.
Evidence is `retained-dependencies/focused-old-dependencies.tap` and
`focused-old-dependencies-manifest.json` under the output root above; the latter
has SHA-256 `1605e43d037adfdbadce2a6d0ddc8bfeea3be13b82cc1179da6cd1596292f5cd`.
After the run, zero owned working-directory processes remained, and the exact
temporary test directory was removed and independently read back as absent.
Retained D: archives remain available. The unchanged full backend source result
of 6,390 total / 6,322 pass / 68 skip is reused, not rerun or counted as physical
acceptance. Hosted run `38718860475` at `70a6c8ac` did not start because the
Actions budget prevented execution; it is neither a test failure nor a pass.

A separate local Linux rehearsal then passed all **three independent process
phases**: old-source seed -> new-source pack-off startup/normal writes ->
old-source reopening. Unlike the earlier same-process Windows check, each phase
used a distinct Node 22.23.1 process with the same retained dependency layout and
the same synthetic database/material lineage. The old source was the fixed
`742459d1` fixture, not a copy of BWH's mixed application. New startup preserved
all old schema/row digests, added exactly the eight named objects and kept the
four pack tables empty. The old runtime reopened the upgraded database and
retained both normal usage samples, 250 synthetic Coins units and all three
protected synthetic material records. No snapshot was restored over new writes.
SQLite backup API creation/integrity checks also passed **after the old runtime
had stopped**; this does not exercise concurrent production writers.

The receipt is
`output/data-pack-release-20261015/mixed-reconstruction/independent-process-result.json`,
SHA-256 `bda0e7d91d3d3f495ab32d604d7cc093dc3b8646758103a243069ea42a2f0c2a`.
It binds both source archives, harness inputs, dependency/archive digests and
phase outcomes. All three child processes exited; the runner removed its exact
temporary directory and confirmed it absent. This rehearsal does not cover a
scheduled-plan-switch fixture, the actual installed native binary, physical
protocol/collector behavior or production backups. Those limits are not counted
as passing tests.

### Proposed individually observed production steps (not executed)

The local preparation above does not authorize the following operations. Exact
master source/artifact and operator approval are still required. Keep each step
and its receipt visible; do not run a consumed executor or an opaque retry loop.

1. **Rebind only the candidate boundary.** Verify the installed receipt, current
   pointer and affected before-hashes; compare the remaining source closure on
   the server. Retain root dependencies, nested YAML, all runtime links and all
   other #786 files. Re-read pack-disabled/catalog state and the allowlisted
   runtime path identities. Changed source, unknown writer or changed scope
   stops this step; no configuration, secret or customer record is exported.
2. **Install an inactive candidate.** After the Merge/Artifact Gates, clone the
   verified current source directory into a new private release directory,
   without following runtime links, and apply only the frozen 26-file overlay.
   Verify the complete resulting directory against the old installed manifest
   plus that exact delta. Run bounded syntax/import and native in-memory checks
   using retained production dependencies; never launch `server/index.mjs`
   against production data as a supposedly read-only check.
3. **Back up before first new startup.** Resolve and confirm the actual paths
   inside the host, not from historical defaults. Bind an approved short backend
   stop/quiescence, including its existing Commerce and plan-switch workers;
   verify other writers before copying protected material. Create new private
   online SQLite backups of the control, subscription and third-party stores;
   validate each backup's integrity/foreign keys, standalone state, size and
   hash. Preserve protected material, runtime-link/config identities and the
   current source pointer/manifest. No raw live main-file/WAL copy is substituted
   for SQLite online backup. Keep all backup content on the host.
4. **Switch only the application.** Change the app pointer and start only the
   existing backend service after the preceding receipts pass. Pack runtime
   stays false and no pack offers are inserted or published. The four tables/four named indexes
   are the explicitly approved first-start mutation. Nginx, frontend pointers,
   protocol services, independent collector, its journals/checkpoints and
   identity maps are not replaced or restarted by this stage.
5. **Check and, if necessary, code-roll back.** Check application/process/endpoint
   health, eight-object schema and empty pack tables, preserved old Commerce,
   plan-switch/reset/third-party behavior, aggregate identity before/after and
   consecutive natural metering. Do not call old stale identities healthy.
   On application failure, stop the candidate and restore only the verified
   old application pointer; reopen the **current** databases and retain additive
   objects plus every new Coins/order/usage/scheduled-plan fact. The collector
   remains a writer, so a stopped backend does not prove a zero-write window.
   Never automatically restore old snapshots, drop tables, rebaseline metering
   or replay historical usage. If code rollback is not safe, stop and retain
   evidence instead of performing an unapproved database restore.

Sequential online backups are per-database consistent snapshots, not a globally
atomic three-database checkpoint. Backup timestamps and writer boundaries must
be recorded explicitly; a backup file alone is not a tested restore plan. The
new production backup/readback, exact final release paths, source/merge gates,
candidate installation and production acceptance are **not yet completed**.

### Later activation and user-facing publication

1. Finish and independently verify the latest owned-pack/toolbar UI in both
   repositories; record real authenticated synthetic purchase, close/retrieve,
   refresh/relogin and reset-pending behavior separately from physical results.
2. Freeze exact source/dependencies and complete the selected isolated protocol /
   collector exhaustion, credential rotation and crash recovery acceptance.
3. Bind a narrow fresh BWH inventory and production-like additive upgrade /
   rollback validation. Retain existing self-operated metering, third-party
   rendering and approved plan-switch behavior.
4. Approve exact artifact, schema/backup/rollback and publication operations;
   perform them step by step, then record aggregate identity, natural metering,
   owner delivery and service readback in a Deploy Note.

Missing evidence remains pending, not zero, not a simulated success. No production
declaration is made merely because source tests or a frontend build succeeded.
