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

Risk: A release envelope; local UI/test preparation only in this record.
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
