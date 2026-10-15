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

The current production presence/absence of those objects has not been read in
this turn. Before **first** new application startup, bind current deployed app /
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
No production read, upload, startup, schema apply or switch is recorded by this
preparation. Physical exhaustion/reset acceptance and the frontend work below
remain prerequisites for **activation/publication**, not reasons to repeat
unrelated checks during this disabled-backend preparation.

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
