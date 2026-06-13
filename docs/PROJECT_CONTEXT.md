# Project Context

Last updated: 2026-06-13, Asia/Shanghai.

This file is the compact handoff note for continuing
`proxy-gateway-minimal`. Read it first, then inspect the live repo state before
making claims or changes. It intentionally summarizes current facts and links
to detailed records instead of repeating historical execution logs.

## How To Use This File

Use this file for:

- Current repo/source-of-truth orientation.
- Current product direction and risk boundaries.
- Current documented production snapshot.
- Active blockers and next work lanes.
- Latest validation baseline and quick commands.

Do not use this file as:

- A production inventory source.
- A deployment approval.
- A replacement for live DNS, AWS, Nginx, systemd, SQLite, tenant, or endpoint
  verification.
- A place to store secrets, tokens, subscription URLs, credentials, SQLite data,
  or customer data.

## Current Architecture View

Use this four-layer view as the current mental model before reading historical
records:

1. **Adapters:** User Portal, protected Admin/Operator, and CLI surfaces are
   thin adapters over shared domain services. Public Admin is not a product
   surface.
2. **Control Plane:** Vultr Japan owns accounts, orders, subscription artifacts,
   credential refs, desired-state notifications, render gating, and usage
   ledger state.
3. **Interconnect:** Private authenticated data-plane agent routes move only
   redacted desired-state, node-scoped material batches, leases, and redacted
   receipts between the control plane and data-plane agents.
4. **Data Plane:** Vultr Japan and Vultr Singapore provide VLESS Reality,
   Hysteria2, and TUIC runtime capacity. Singapore channels stay out of
   rendered subscriptions until matching applied receipts prove the data plane
   has applied the current desired-state.

Do not derive current architecture from stale historical Aliyun/AWS records, old
checkout paths, archive directories, runtime-only residue, or `master` alone.
As of the latest GitHub/mainline closeout, `master` is the follow-on
development baseline at `dddd828` (`Add edge node registration ingestion`),
with open PR count 0; PR #299, PR #302, PR #303, PR #304, PR #305, PR #306,
PR #307, PR #308, and PR #309 are merged, and PR #300 was closed without
merge. Run `git status` and `gh pr list` before
making any new branch or production claim.

The AWS staging node-image readiness validation is recorded in
`docs/production-replacement-records/2026-06-13-aws-staging-node-image-readiness-validation.md`.
It validates the no-secret image readiness and first-boot packet helper path
with synthetic safe input only. It did not register a production node, mutate
DNS/Nginx/firewall, activate traffic, inject protected runtime material, or
create live orders. The AWS staging control/data-plane integration validation is
recorded in
`docs/production-replacement-records/2026-06-13-aws-staging-control-data-plane-integration-validation.md`.
It validates the synthetic control-plane registration, desired-state,
edge-agent, redacted receipt, receipt-gated rendering, usage/lifecycle, and
node-image helper path on AWS staging only. It did not promote AWS, touch
production, create live orders, output subscription material, or mutate DNS,
Nginx, provider firewall/security groups, Vultr, or Aliyun.
The next stage remains control-plane closeout. Repo-only source now includes
first-boot packet registration ingestion, a durable safe-node registration
table, and a redacted protected-material handoff preflight that checks current
desired-state material readiness by registered node and digest; protected
production material handoff, production desired-state generation,
receipt-gated subscription rendering, operator approval, validation, and
rollback framing remain separately gated for the production lane.
That closeout plan is recorded in
`docs/CONTROL_PLANE_NODE_REGISTRATION_CLOSEOUT.md`; it keeps order issuance as
a control-plane action and edge-agent pull/apply as a lifecycle reconciliation
path for apply receipts, expiry, disable, rotate, usage, and rollback.
The next approval template is
`docs/production-replacement-records/2026-06-13-control-plane-node-registration-closeout-approval-packet.md`;
it must be filled with exact release, artifact, SHA-256, current release, and
target-node details before any production execution.
The earlier AWS staging control/data-plane approval packet remains at
`docs/production-replacement-records/2026-06-13-aws-staging-control-data-plane-integration-approval-packet.md`
for auditability; its matching execution record above is the current evidence.

Detailed navigation lives in `docs/README.md`. Structured project state lives in
`project-state/*.json`; it is a coordination aid, not a runtime control plane.
The `master`/archive boundary lives in `docs/MASTER_ARCHIVE_BOUNDARY.md`: keep
`master` focused on current source, active runbooks, compact current state, and
safe indexes; move or mirror stale drafts, old workspace notes, and superseded
execution packages outside the active reading path only after they are indexed.
The lightweight operating/development environment boundary lives in
`docs/LIGHTWEIGHT_OPERATING_DEV_ENVIRONMENT.md`: default to local checkout,
local Node/Admin dev processes, safe CLI previews, optional HP/local Linux
manual validation, and read-only production observation; do not promote Aliyun,
HP, archive folders, or production runtime state into the routine dev workspace.
The multi-environment adapter runtime model lives in
`docs/MULTI_ENV_ADAPTER_RUNTIME_MODEL.md`: keep one modular monolith, push shared
business rules into domain services, and make CLI, User Portal, Operator/Admin,
Public Site, HP, and Aliyun runtime wiring thin adapters instead of forks.
The control/data-plane interconnect contract lives in
`docs/CONTROL_DATA_PLANE_INTERCONNECT_CONTRACT.md`: subscription control and
multi-node data-plane capacity are separate sub-systems connected by DNS
pointers, safe node facts, health/measurement facts, node pools, and
subscription-output rendering; neither side should own the other's authority.
The single-control-plane / multi-data-plane plan lives in
`docs/SINGLE_CONTROL_PLANE_MULTI_DATA_PLANE_PLAN.md`: one control-plane store
owns accounts, orders, subscription artifacts, credential lifecycle, and usage
ledger; Vultr, Aliyun, Singapore, and future hosts are data-plane nodes that
receive per-order runtime credentials and feed usage facts back by
`edgeCredentialRef`; user-visible node switching belongs in rendered
subscription proxy groups, not in a separate per-node user panel.
The branch and service operating model lives in
`docs/BRANCH_AND_SERVICE_OPERATING_MODEL.md`: use it to distinguish `planned`,
`coded`, `tested`, `deployed`, `runtime-validated`, `merged`, and `archived`
states, map current branches to service lanes, and prevent production runtime
state from being confused with `master` or local worktree state.
The service-lane integration closeout record lives in
`docs/CURRENT_WORKTREE_SERVICE_LANE_CLOSEOUT.md`. It is now historical closeout
context for the merged PR #299 / PR #302 integration lane rather than an active
branch plan. As of the latest GitHub/mainline closeout, `master` is at
`dddd828`, open PR count is 0, and PR #299, PR #302, PR #303, PR #304, PR #305,
PR #306, PR #307, PR #308, and PR #309 are merged; PR #300 was closed without merge. Follow-up
work should branch from clean `master` unless a task explicitly states
otherwise. Always verify the exact local branch and worktree state with
`git status`; this document does not assert that a worktree is clean.
The latest Vultr Japan + Singapore multichannel runtime closeout is recorded in
`docs/production-replacement-records/2026-06-09-vultr-sgp-multichannel-runtime-closeout.md`.
It documents the SGP handoff/runtime apply fix, Hysteria2 config schema
correction, controlled-domain fake-IP protection, and protected config ownership
fix without recording raw credentials, subscription URLs, SQLite rows, raw
config, or raw environment values.
The latest GitHub/Japan/Singapore runtime drift reconciliation is recorded in
`docs/production-replacement-records/2026-06-09-github-japan-sgp-runtime-drift-reconciliation.md`.
It distinguishes source drift, protected runtime config drift, runtime-only
material, and production-package blockers. Use it before the next Vultr
production deployment so Singapore runtime residue is not treated as source and
Japan control-plane config drift is reviewed separately from Git drift.
The SGP final production closeout gate is recorded in
`docs/production-replacement-records/2026-06-09-sgp-final-production-closeout-gate.md`.
It defines the remaining exact Risk A sequence before Singapore can be marked
fully closed: read-only inventory, clean Japan control-plane upgrade, protected
Singapore data-plane apply, and a separately approved new-order smoke.
The first SGP final closeout read-only inventory is recorded in
`docs/production-replacement-records/2026-06-09-sgp-final-closeout-gate1-readonly-inventory.md`.
It found public portal/sub boundaries healthy and SGP runtime services active,
but it also found Japan-to-SGP SSH failed, so the protected remote data-plane
apply path remains blocked before Gate 3.
The Japan-to-SGP apply identity fix is recorded in
`docs/production-replacement-records/2026-06-09-sgp-japan-to-sgp-apply-identity-fix.md`.
It configured Japan's SSH client to use the existing SGP apply identity for
`45.76.158.201`/`gccgw-sgp-data-plane`; Japan-to-SGP SSH now validates, but Gate
2 and Gate 3 remain separate production approvals.
The SGP Gate 2 Japan control-plane clean artifact upgrade is recorded in
`docs/production-replacement-records/2026-06-09-sgp-gate2-japan-control-plane-clean-artifact-upgrade.md`.
It promoted commit `505eed929e7fb7a3aa72b62ff2da92725891d9c5` with rebuilt
Admin/Portal static assets to the Japan control-plane runtime while preserving
protected production config; Gate 3 SGP data-plane apply is still separate.
The SGP Gate 3 data-plane apply preflight blocker is recorded in
`docs/production-replacement-records/2026-06-09-sgp-gate3-data-plane-apply-preflight-blocked.md`.
It found Japan-to-SGP SSH and SGP services healthy, but no pending handoff items
and missing SGP credential placeholder bindings in Japan's protected environment;
do not mark Gate 3 complete until SGP material is registered through a protected
handoff path and redacted render proof passes.
The SGP Gate 3A material registration approval packet is recorded in
`docs/production-replacement-records/2026-06-09-sgp-gate3a-material-registration-approval-packet.md`.
It separates static channel material needed for subscription rendering from
per-order `edgeCredentialRef` material, and defines the exact Risk A approval
needed to add only missing SGP protected env keys on Japan.
The SGP Gate 3A material registration execution is recorded in
`docs/production-replacement-records/2026-06-10-sgp-gate3a-material-registration-execution.md`.
It registered only the missing SGP static channel material keys in Japan's
protected current environment, restarted only the Japan control-plane service,
and validated a redacted six-channel render proof with `yamlReturned=false`.
It did not consume handoff items, mutate Singapore runtime, create live orders,
or complete Gate 3 data-plane apply.
The SGP Gate 3 data-plane apply execution is recorded in
`docs/production-replacement-records/2026-06-10-sgp-gate3-data-plane-apply-execution.md`.
It consumed the reviewed SGP handoff queue through the protected Japan-to-SGP
apply path, reconciled Singapore VLESS Reality, Hysteria2, and TUIC runtime
credentials, restarted only the approved Singapore data-plane services after
validation, archived the pending handoff files, and validated a redacted
six-channel render proof with `yamlReturned=false`. It did not create live
orders, mutate DNS/Nginx/provider firewall, expose public Admin, or output
credential material.
The edge-agent private tunnel production activation is recorded in
`docs/production-replacement-records/2026-06-11-edge-agent-private-tunnel-production-activation.md`.
It deployed the `005` edge-agent runtime, created the private SGP loopback
tunnel to Japan's internal agent route, seeded existing delivered SGP channel
desired-state, enabled the SGP edge-agent service, and validated fresh applied
receipts for SGP VLESS Reality, Hysteria2, and TUIC. It did not create live
orders, mutate DNS/Nginx/provider firewall, expose public Admin, or output
credential material. A follow-up gate is still required to publish
desired-state automatically for future orders.
Current source now adds repo-level remote data-plane coordination for future
orders: user order delivery records a safe pending desired-state notification
for `remote-data-plane-handoff` channels, and the subscription renderer withholds
those channels until the current desired-state has a matching applied receipt
from the data plane. The notification table stores safe refs only; applying it
through the edge agent and validating it in production remains a separate Risk A
runtime gate.
The SGP receipt-required production config hardening is recorded in
`docs/production-replacement-records/2026-06-11-sgp-receipt-required-config-hardening.md`.
It updated only Japan's protected proxy config so all three SGP
`remote-data-plane-handoff` channels explicitly carry `requiresAppliedReceipt:
true`; Japan and SGP read-only validation passed, and no SGP runtime, DNS,
Nginx, provider firewall, payment, account, credential, or subscription
material was mutated.
The next production read-only preflight approval packet is recorded in
`docs/production-replacement-records/2026-06-11-edge-agent-future-order-readonly-preflight-approval-packet.md`.
It authorizes only redacted inventory after exact approval: no artifact upload,
schema migration, service restart, runtime apply, or live order creation.
The approved read-only preflight execution is recorded in
`docs/production-replacement-records/2026-06-11-edge-agent-future-order-readonly-preflight.md`.
It found Japan and SGP runtime boundaries healthy, SGP data-plane listeners
present, and the expected blocker: production control DB does not yet have
`platform_edge_desired_state_notifications`, so the next gate must be a
runtime upgrade plus schema migration before any live-order smoke.
The follow-up runtime/schema upgrade approval packet is recorded in
`docs/production-replacement-records/2026-06-11-edge-agent-future-order-runtime-upgrade-approval-packet.md`.
It names source package `edge-agent-future-order-runtime-20260611-001` from
commit `ff6c35a95b2c72a537c9c995204c88566709fd88`, current production rollback
release `edge-agent-production-activation-20260610-005-worktree`, and a
Japan-only runtime upgrade plus idempotent
`platform_edge_desired_state_notifications` schema migration. It explicitly
does not authorize live order creation, SGP runtime mutation, DNS/Nginx/provider
firewall changes, or sensitive output.
The approved runtime/schema upgrade attempt and rollback is recorded in
`docs/production-replacement-records/2026-06-11-edge-agent-future-order-runtime-upgrade-rollback.md`.
It uploaded, verified, unpacked, and installed dependencies for
`edge-agent-future-order-runtime-20260611-001`, but the Japan service restart
failed and was rolled back to
`edge-agent-production-activation-20260610-005-worktree`.
The protected env normalization gate is recorded in
`docs/production-replacement-records/2026-06-11-edge-agent-protected-env-normalization.md`.
It corrected the earlier shell-source diagnostic: under a systemd-style parser,
the protected `EDGE_DATA_PLANE_AGENT_NODES_JSON` material already resolves to a
JSON array, so no env rewrite was needed. It also proved that
`edge-agent-future-order-runtime-20260611-001` can start on an alternate
loopback port with temporary DB copies and create
`platform_edge_desired_state_notifications` in the temporary control DB. The
real production control DB is still not migrated, and promoting the candidate
still requires a separate exact Risk A retry gate.
The runtime/schema retry environment-file blocker is recorded in
`docs/production-replacement-records/2026-06-11-edge-agent-future-order-runtime-retry-envfile-blocker.md`.
It proved the restart failure is now a packaging/systemd boundary, not the
agent-node JSON shape: one service `EnvironmentFile` is bound through the
`current` release symlink, and the candidate release lacks the corresponding
release-local env file. Japan was rolled back and remains on
`edge-agent-production-activation-20260610-005-worktree`; the real production
control DB is still not migrated.
The approved envfile-boundary fix retry is recorded in
`docs/production-replacement-records/2026-06-11-edge-agent-candidate-envfile-fix-runtime-retry-rollback.md`.
It materialized exactly one missing candidate release-local env file from
protected server material and verified the candidate no longer missed that file,
but the candidate still did not remain active under the real systemd service
path. The gate rolled back to
`edge-agent-production-activation-20260610-005-worktree`, removed the created
candidate env file, and left the real production control DB unmigrated. The
next gate is a redacted candidate startup diagnostic after the envfile boundary,
not another blind production restart.
The redacted startup diagnostic is recorded in
`docs/production-replacement-records/2026-06-11-edge-agent-future-order-startup-diagnostic.md`.
It found the candidate failure is proxy config placeholder resolution for SGP
static channel material: the candidate expects `SGP_*` keys for Singapore
VLESS/Hy2/TUIC, but the active protected service environment does not provide
those names. Production remains on
`edge-agent-production-activation-20260610-005-worktree`; the real control DB is
still not migrated. The next gate must register those protected keys or rebuild
the candidate template to use the approved existing key names, then prove
candidate temp-start before any production symlink switch.
The follow-up repo-only SGP template key alignment is recorded in
`docs/production-replacement-records/2026-06-11-edge-agent-sgp-template-key-alignment.md`.
It confirmed Japan already has approved SGP protected material under the
deployed `005` key names and updated the repository default/Vultr multichannel
templates plus tests to use those names instead of requiring a second SGP
material namespace. It also prepared candidate package
`edge-agent-future-order-runtime-20260611-002-worktree` with recorded SHA-256
and local boundary checks. Production remains unchanged on
`edge-agent-production-activation-20260610-005-worktree`; the next Risk A gate
must use the `002` package to prove zero missing placeholders plus candidate
temp-start before any production symlink switch or real control DB migration.
The follow-up `002` read-only preflight is recorded in
`docs/production-replacement-records/2026-06-11-edge-agent-002-readonly-preflight.md`.
It validated that the `002` candidate placeholder names all exist in the current
Japan protected service environment by key presence only, with zero missing SGP
placeholders, and rechecked public portal/sub/Admin/internal-agent boundaries.
It did not upload artifacts, switch release, restart services, run schema
migration, mutate Singapore runtime, or create live orders.
The approved `002` runtime/schema production retry is recorded in
`docs/production-replacement-records/2026-06-11-edge-agent-002-runtime-schema-production-retry.md`.
It uploaded and verified the `002` artifact, proved candidate temp-start with
temporary DB copies and an alternate loopback port, switched Japan current to
`edge-agent-future-order-runtime-20260611-002-worktree`, restarted only
`proxy-gateway-candidate.service`, and verified that the real control DB now has
`platform_edge_desired_state_notifications`. Singapore validation was read-only:
edge-agent, Xray, Hy2, TUIC, listeners, and loopback stats were healthy. No live
orders were created and Singapore runtime was not mutated; live-order smoke and
future-order apply validation still require separate exact Risk A approval.
The follow-up live-order smoke approval packet is recorded in
`docs/production-replacement-records/2026-06-11-edge-agent-future-order-live-smoke-approval-packet.md`.
It authorizes, after exact approval only, one controlled 7-day quantity-1 test
order to prove the full future-order desired-state -> SGP edge-agent apply ->
fresh receipt -> subscription render gate. It does not authorize DNS, Nginx,
provider firewall, account/password generation, payment, broad order creation,
or sensitive output.
The follow-up edge-agent source absorption record is
`docs/production-replacement-records/2026-06-11-edge-agent-source-absorption.md`.
It adds the repository production data-plane agent, once-only launch wrapper,
and `gccgw-edge-agent.service` template so future SGP activation packages can
run the actual pull/apply/receipt loop instead of relying on runtime-only
placeholders. The deployment approval packet is
`docs/production-replacement-records/2026-06-11-edge-agent-source-deployment-approval-packet.md`.
The approved source deployment plus future-order live-smoke execution and
rollback is recorded in
`docs/production-replacement-records/2026-06-11-edge-agent-source-deployment-live-smoke-rollback.md`.
It deployed the source package and proved the SGP agent can pull desired state,
but receipt validation failed because SGP could not resolve the protected
per-order credential material for the desired `edgeCredentialRef` values.
Japan was rolled back to
`edge-agent-future-order-runtime-20260611-002-worktree`; SGP agent apply is
disabled and dry-run mode remains enabled. The next gate is not another blind
source deployment: it must be a protected credential-material sync design and
runtime approval.
The repo-only protected material sync implementation plan is
`docs/superpowers/plans/2026-06-11-sgp-protected-material-sync.md`. The matching
production approval packet is
`docs/production-replacement-records/2026-06-11-edge-agent-protected-material-sync-approval-packet.md`.
The repo implementation now adds the private authenticated material pull path:
desired-state and receipts stay redacted, the material route is scoped to node,
current desired-state, requested credential refs, and digest matches, and the
production agent merges material into its protected local material store before
runtime apply. The packaged production activation candidate is
`edge-agent-protected-material-sync-20260611-001-worktree` with artifact
`.codex-artifacts/edge-agent-protected-material-sync-20260611-001-worktree/proxy-gateway-edge-agent-protected-material-sync-20260611-001-worktree.zip`;
production activation remains a separate Risk A gate with the exact approval in
the packet above.
The User Portal API route hotfix is recorded in
`docs/production-replacement-records/2026-06-11-portal-api-agent-route-hotfix.md`.
It narrowed the `005` data-plane agent router authentication middleware to the
internal data-plane agent path prefix so `/api/portal/*` routes are no longer
intercepted by internal agent auth. It restored `POST /api/portal/human-challenges`
to HTTP 201 while keeping public Admin and public internal agent routes blocked.
The server project import boundary lives in
`docs/SERVER_PROJECT_IMPORT_BOUNDARY.md`: before deeper refactoring, compare the
repository with the live server through read-only, redacted inventory; never
copy `.env`, SQLite, handoff files, raw logs, subscription URLs, tokens,
credentials, or customer data into Git.
The first approved Aliyun server project import read-only inventory is recorded
in
`docs/production-replacement-records/2026-06-01-aliyun-server-project-import-readonly-inventory.md`.
It confirms the live packaged release layout and safe hash/drift facts without
copying runtime secrets or mutating production.
The redacted import manifest and drift matrix lives in
`docs/SERVER_IMPORT_MANIFEST_2026_06_01.md`; it records which live server
templates already match Git and which package/template drift needs explanation.
The detailed node registration and pool contract lives in
`docs/NODE_REGISTRATION_AND_POOL_CONTRACT.md`; it refines the safe multi-node
schema for node facts, lifecycle, pools, and health summaries.
The first approved two-region disposable Ubuntu `gccgw` package deployment-flow
validation is recorded in
`docs/production-replacement-records/2026-06-02-aws-disposable-tokyo-korea-gccgw-validation.md`.
It proves repeatable per-host package initialization and loopback/private
subscription-boundary checks on Tokyo and Korea temporary AWS hosts, followed by
full resource cleanup. It does not prove centralized multi-node registration,
DNS cutover, public business-port exposure, production traffic, or real
subscription issuance.
The approved Aliyun runtime-upgrade read-only preflight inventory is recorded
in
`docs/production-replacement-records/2026-06-02-aliyun-upgrade-preflight-inventory.md`.
It confirms current public/private boundary posture, live release metadata,
candidate `b781f3d` release posture, service/listener/SQLite/backup metadata,
and no Aliyun mutation. The next mutation gate remains blocked until exact
Risk A approval; do not package the dirty working tree, replace the
documentation management-source placeholder with the real CIDR, and explicitly
accept or handle the existing loopback `127.0.0.1:35435` listener and failed
`aegis.service` state as separate pre-existing observations.
The first exact-approved Aliyun runtime-upgrade attempt is recorded in
`docs/production-replacement-records/2026-06-02-aliyun-candidate-runtime-upgrade-blocked.md`.
It uploaded the exact `b781f3d` archive to `/tmp` but intentionally stopped
before creating the new release, running `npm ci`, switching `current`, or
restarting the service because the preserved systemd entry expects a live-only
`candidate-start.mjs` shim that is not present in the exact Git archive. At
that gate, Aliyun runtime remained on `da33de295cb0`.
The second exact-approved Aliyun runtime-upgrade attempt is recorded in
`docs/production-replacement-records/2026-06-02-aliyun-candidate-runtime-upgrade-rollback.md`.
It prepared release `3e1c9a79ec85` and ran `npm ci`, then switched `current`
and restarted only `proxy-gateway-candidate.service`. Active-service validation
failed, so the gate rolled back to `da33de295cb0` and revalidated public/private
boundaries. At that gate, Aliyun runtime remained on `da33de295cb0`. The likely next
blocker is the missing protected control DB path in Aliyun `.env`; a future
retry requires a separate Risk A gate for non-secret `.env` path addition and
control SQLite initialization under the service-owned state directory.
The approved protected control DB path patch and runtime-upgrade retry is
recorded in
`docs/production-replacement-records/2026-06-02-aliyun-control-db-path-upgrade-success.md`.
It added a non-secret `SUBSCRIPTION_CONTROL_DB_PATH` setting to the protected
host `.env` after creating an on-host `0600` backup, switched `current` to exact
release `3e1c9a79ec85`, restarted only `proxy-gateway-candidate.service`, and
validated health, public Admin blocking, no-token subscription rejection,
subscriptions/control SQLite integrity, candidate-start presence, loopback-only
18180, and rollback readiness. That execution record's post-validation runtime
was `3e1c9a79ec85`; previous release `da33de295cb0` remained present for
rollback.

## Repository

```text
D:\Projects\proxy-gateway-minimal
```

The active code source of truth is GitHub
`gaoyi1020-web/proxy-gateway-minimal` plus the local checkout above.

Do not use these as active code checkouts:

- `C:\Users\g\OneDrive\文档\订阅管理` - legacy empty Codex project shell.
- `C:\Users\g\Projects\订阅管理\proxy-gateway-minimal` - pre-D-drive
  migration checkout; do not use as the default working tree.
- `C:\Users\g\WorkBuddy\2026-05-20-18-07-31\proxy-gateway-minimal` -
  historical archaeology only.

Before any repo work:

```powershell
cd D:\Projects\proxy-gateway-minimal
git status --short --branch
git fetch origin
```

## Workflow Boundary

Default risk tiers live in `AGENTS.md`:

- C: docs-only; usually validate with `git diff --check origin/master...HEAD`.
- B: repo code, tests, Admin UI, local tooling; run focused checks plus the
  relevant project tests.
- A: AWS, production, DNS, Nginx, HTTPS, systemd, security groups, nodes, auth
  model, schema/migration, deploy, rollback, or tenant/artifact mutation. A-tier
  work requires read-only inventory, dry-run, explicit operator approval,
  validation, and rollback evidence.

Do not lower risk just because a task is easy to run locally.

Every PR must complete its approved design -> execution -> validation loop
before it is marked Ready, submitted for merge, or reported complete. A
spec-only, runbook-only, or inventory-only PR is allowed only when that is the
explicit scope and the PR body states the non-goals, skipped execution, and next
approval gate.

`docs/PROJECT_OPERATING_MODEL.md` defines stage reporting as an on-demand
handoff and risk-control tool. The former fixed "every five merged PRs" cadence
is retired. Create stage reports only after a production gate, a long-running
work lane, a major product direction change, or an operator request. Historical
fixed-cadence PR reports are archived under `docs/archive/stage-reports/` and
must not be used as current state.

## Current Product Direction

The active product spine is:

```text
stable subscription/import experience
  -> authoritative subscription control plane
  -> replaceable edge data-plane capacity
  -> loopback-only local client adapter path
  -> measured validation and operations
```

Current documented production direction as of 2026-06-09:

- Vultr Japan is the primary subscription control-plane host for the current
  production lane.
- Vultr Japan and Vultr Singapore are data-plane capacity hosts connected by
  logical channel refs, not separate user/order databases.
- The production subscription bundle should render the approved six-channel
  set: `channel-vultr-a-vless-reality-tcp`, `channel-vultr-a-hy2`,
  `channel-vultr-a-tuic`, `channel-sgp-a-vless-reality-tcp`,
  `channel-sgp-a-hy2`, and `channel-sgp-a-tuic`.
- User-visible node switching belongs in rendered subscription proxy groups;
  account, order, artifact, credential lifecycle, and usage ledger facts stay
  in the control-plane store.
- Aliyun records below are historical execution records or fallback context
  unless a fresh Risk A inventory proves otherwise.

- **Simplification & Core Focus**: The active priority is strictly converged on core subscription production delivery: **"能生产、能发放、能审计、能撤回"** (PR #258, CLI production SOP, controlled subscription issuance, canary rollout, edge rebuild, and traffic accounting/quota/abuse control). Unrelated marketing decoration (WebGL/3D transits, CSS animations), Telegram client integrations/panels, personal job-application materials, un-productized video/ad drafts, non-CLI Admin UI polishing, topological narrative bloating, multicharacter sketch frameworks, and brand-positioning narratives are explicitly deprioritized, archived, or removed from the execution path. See `docs/PROJECT_SIMPLIFICATION_MAP.md`.
- **Historical Aliyun-First Boundary (superseded)**: older records in this
  file describe an Aliyun-first subscription-control plan. That is no longer
  the current production authority statement. Treat those sections as
  historical/fallback context unless a fresh Risk A inventory and approval
  explicitly promotes Aliyun back into the active control-plane lane. Local
  machines and local checkouts remain development, validation, operator-lab,
  handoff, and archive surfaces only; they are not production authority and
  not a substitute for live inventory.

Current architecture priorities:

- Docs/status baseline: `docs/VULTR_JAPAN_CONTROL_DATA_PLANE_STATUS.md`
  captures the current Vultr Japan control-plane and Vultr Japan/Singapore
  data-plane direction plus its no-mutation boundary. It is a C-tier
  orientation document, not a replacement for the production execution records
  below and not authority for any runtime change.
- Historical Goal: `docs/goals/2026-05-26-aliyun-subscription-control-platform-mvp.md`
  remains a useful execution record for earlier Aliyun planning, but it is not
  the current production-control target. Current production design follows the
  single-control-plane / multi-data-plane model above. It still does not
  authorize public Admin, payment, broader artifact issuance outside approved
  order flows, legacy query-token retirement, or unapproved edge recovery.
- Aliyun User Management / Subscription Distribution: keep this as a historical
  runbook/fallback lane. Do not use it to override the current Vultr Japan
  control-plane and Vultr Japan/Singapore data-plane channel model without a
  fresh A-tier gate. See `docs/ALIYUN_USER_SUBSCRIPTION_DISTRIBUTION_RUNBOOK.md`.
- Public Site / Portal Split: the repository now treats the static company site
  as a public brand/cooperation surface for geek-style AI research, mainstream
  media advertising, operations growth, and frontier product research. Logged-in
  customer portal entry is a separate operator-issued dynamic entry concept and
  must not be hard-linked from the public site or public campaign landing pages.
  The public site has a dedicated static build boundary at `admin/dist-site`,
  separate from the normal Admin/Portal bundle. On 2026-05-28, that static
  bundle was deployed to the Aliyun HTTPS root at
  `https://sub.globalcirclecat.com/`; see
  `docs/production-replacement-records/2026-05-28-aliyun-public-company-site-static-deployment.md`.
  Public lead intake was activated through the Aliyun production Nginx boundary
  on 2026-05-28; `POST /api/public/leads` now proxies to the local
  proxy-gateway service and returns 202 for validated company-site submissions.
  See
  `docs/production-replacement-records/2026-05-28-aliyun-public-lead-intake-production-activation.md`.
  The flow remains operator-controlled after intake: public self-service
  account creation, payment, automatic entitlement issuance, and customer
  portal automation are not activated.
- User Portal Business Boundary: the repository user portal shell now depends
  on a dedicated `UserPortalClient` abstraction under
  `admin/src/features/user-portal/user-portal-client.ts` instead of directly
  calling Admin subscription APIs. The default portal client calls the
  same-origin guarded `/api/portal/*` adapter for operator-issued entry
  activation, TOTP authenticator login, current request lookup, and
  access-request submission. The visible local auth surface now shows one
  normal account-login form only: account ID, password, and a generated local
  anti-bot math challenge. That challenge is not an email code or TOTP dynamic
  credential. `#/portal-preview` now includes a small repository-only batch of
  issued preview accounts; unknown accounts and wrong passwords fail locally.
  Initial preview accounts that still require setup show `账户安全初始化`
  immediately after login and require both authenticator binding and passkey
  export before the dialog can be completed. Authenticator binding and passkey
  export also remain in Personal Center security settings after login. In
  `#/portal-preview`, authenticator setup now uses a local TOTP enrollment
  preview: it generates an `otpauth://` binding URI, renders a scannable QR code
  for Google Authenticator-compatible apps, shows a manual key, and marks the
  factor bound only after a valid 6-digit TOTP code. Passkey export writes a
  local preview JSON backup package and marks the account factor
  enabled/exported; it is not a WebAuthn private key export. The local preview
  client stores enabled authenticator/passkey factors per account in memory; the
  next password login returns a second-factor challenge and does not create a
  portal session until an enabled factor verifies. The passkey second-factor
  preview now requires the exported JSON package content and checks its safe
  account/passkey refs against the in-memory account record; fixed proof strings
  or click-only success are not accepted.
  Operator-issued entry Token activation remains an admin-controlled first-bind
  boundary, not a normal login-page tab. Email-code login and real mail
  issuance are no longer part of the product direction; existing local preview
  and default HTTP email-code stubs remain hidden and fail-closed only for
  compatibility while that path is retired. Durable HTTP password login,
  backend human challenges, TOTP enrollment, and TOTP second-factor completion
  now exist in the repository service layer and must use the control-plane
  store in production-like runtime. In the Admin
  Vite shell, `#/portal` remains the real same-origin HTTP route and
  `#/portal-preview` is the repository-local browser preview route.
  The local preview client remains safe by default for tests and demos:
  it can authenticate a preview session and submit a subscription request
  summary, but it returns no subscription URL unless explicitly injected with
  demo material, performs no Admin API call, writes no SQLite rows, activates no
  payment, exposes no public Admin, collects no phone/Telegram/contact profile
  fields, creates no production authenticator credential, and creates no
  production subscription. The current portal subscription surface is an order
  system: users submit package duration, quantity, and client target as
  order/request facts. In production-like runtime, automatic issuance is
  env-gated and must fail closed unless requested channel refs are present in
  the protected proxy config and the monthly limits/target channel policy are
  configured. Refresh, disable, and copy actions are order-row actions only
  after issued material exists; physical delete remains disabled. This does
  not approve public Admin, payment, or unapproved production mutation. The
  user-facing support surface is now a scoped problem
  feedback form backed by `/api/portal/support-requests`; it does not introduce
  Telegram, chatbot, or customer-service workflow design. Public
  portal exposure remains
  separate product work and must preserve user-scoped authorization. Portal is
  a user-facing adapter over domain services, not a wrapper around operator CLI
  commands. Normal customer order/status actions should be handled by
  user-scoped services and policy checks, while CLI remains an operator/ops
  adapter for provisioning, override, revoke, audit, and emergency handling.
  The target authentication boundary is operator-issued dynamic entry plus TOTP
  enrollment and short-lived portal sessions first. Google/OAuth may remain a
  later convenience login/recovery mechanism, but email-code delivery and email
  magic links are retired product paths and must not be treated as backlog. See
  `docs/USER_PORTAL_AUTH_BOUNDARY.md`. The backend human-verification design
  for replacing frontend-only anti-bot math prompts with server-issued,
  expiring, one-time challenges lives in
  `docs/USER_PORTAL_HUMAN_CHALLENGE_DESIGN.md`; it does not authorize provider
  CAPTCHA secrets, production DB migration, public portal exposure, or
  subscription issuance.
- User Portal Subscription Policy: the user portal can submit subscription
  orders/access requests for order-management handling. In runtime
  configurations that enable automatic issuance, the request route can deliver
  issued material through the control-plane order service; in repo-local
  preview, injected demo material and in-memory state remain preview-only.
  Refresh, copy, and disable remain order-row operations for already-issued
  records, and physical delete is not exposed. Requests are keyed by safe portal
  user reference, package duration, quantity, and client target rather than
  customer contact profiles.
  The
  protected Admin surface can review requests through a business-readable
  operations panel with translated status labels, status summary cards, local
  status filtering, selected-request detail, and approval preview generation.
  Backend status enums and raw preview JSON remain implementation details, not
  the primary operator surface. Production entitlement creation, artifact
  delivery, public portal exposure, payment activation, DNS, Nginx, systemd,
  firewall, and any production runtime mutation remain unapproved without
  separate gates. The local user portal panel closeout is recorded in
  `docs/production-replacement-records/2026-06-04-user-portal-local-panel-closeout.md`;
  it closes the current repository-local UI slice without authorizing
  production exposure or automatic issuance. See
  `docs/archive/superpowers/specs/2026-05-31-admin-approved-user-portal-issuance-design.md`.
- HP Portal Validation Boundary: HP may be used as an Aliyun-like private
  validation host for the user portal and subscription-control service seams,
  but only as an operator-lab surface. Copying builds, creating test SQLite,
  starting a private service, or changing Nginx/systemd/firewall on HP remains
  Risk A and requires exact approval. See
  `docs/HP_PORTAL_VALIDATION_RUNBOOK.md`. The latest approved private HP portal
  validation passed again on 2026-06-01 with test-only SQLite and a
  loopback-only service on the current `gccgw` branch, proving portal shell,
  access-request, TOTP enrollment, and session seams while runtime
  tenant/artifact counts stayed zero; rollback stopped the service and deleted
  the isolated directory;
  see
  `docs/production-replacement-records/2026-06-01-hp-portal-validation-private-execution.md`.
- User Portal Auth Service: repository-only internal service support now exists
  under `server/services/platform/user-portal-auth.mjs` for issuing dynamic
  portal entries, enrolling TOTP credentials through an injected verifier, and
  creating short-lived portal sessions against the subscription-control
  database. It is not exposed as a public route, returns no subscription URL,
  performs no subscription issuance, activates no payment, and does not deploy
  or migrate Aliyun production state.
- User Portal Entry/Session Adapter: repository-only guarded HTTP adapter
  support now exists under `server/routes/user-portal.mjs` for dynamic entry
  consumption, TOTP enrollment, short-lived portal session creation, and
  access-request submission. The Admin/Portal frontend now uses an HTTP portal
  client for this seam instead of a fake email/password registration flow; the
  email-code client contract is hidden and fail-closed as a retired
  compatibility stub, and the password-login tab is a local contract that
  remains HTTP fail-closed.
  Browser-only preview login is isolated to `#/portal-preview` and does not
  call `/api/portal/*`.
  `createApp()` mounts the routes only when `state.platform.userPortalAuth`,
  `state.platform.portalAccessRequests`, or portal support services are injected and
  `state.platform.userPortalRoutesEnabled === true`; default app state exposes
  no portal route. The portal request route creates order/access-request facts
  only and does not return visible-once subscription material.
- Operator Portal Entry CLI: repository-only operator CLI support now exists at
  `scripts/platform-issue-portal-entry.mjs` / `npm run
  platform:issue-portal-entry` to create dynamic portal entry rows from an
  existing account and entitlement, while writing raw entry tokens only to a
  `0600` handoff file. Running it against production control data remains
  Risk A and still does not issue subscriptions, expose a public portal route,
  activate payment, mutate runtime tenants/artifacts, or migrate Aliyun state.
  It is not a user-facing workflow and must not be called by the user portal;
  both CLI and portal adapters should share domain services instead.
- Operator CLI Platform Boundary: the platform product direction is
  CLI-first for operators. Public routes stay small and explicit, while
  administrative workflows are handled through operator CLI tools,
  local/private console review surfaces, visible-once out-of-band handoff
  files, and execution records. Public Admin is not a product surface, and any
  production mutation remains Risk A even when wrapped by a CLI. See
  `docs/OPERATOR_CLI_PLATFORM_BOUNDARY.md`.
- Operator Provisioning Form Contract: repository-only form-adapter tooling
  turns reviewed operator form facts into a safe issuance input preview through
  `server/services/platform/provisioning-form.mjs` and
  `scripts/platform-provisioning-form.mjs`. The protected local Admin
  Provisioning page and `/api/admin/platform/provisioning-form/preview` route
  can review the same contract from flat operator form fields. The Admin page
  does not construct downstream issuance policy; the service layer owns
  quantity, artifact creation, handoff posture, blocker generation, and safe
  CLI input construction. It does not expose
  raw customer data, subscription URLs, handoff material, SQLite rows, public
  Admin, approval submission, Aliyun deployment, DNS, production storage,
  payment activation, user traffic, edge traffic, or production authority. See
  `docs/OPERATOR_PROVISIONING_FORM_CONTRACT.md`.
- Subscription Control Database: repository-only SQLite business-control
  service now exists under
  `server/services/platform/subscription-control-db.mjs`. It records safe
  account refs, entitlements, issuance requests, safe tenant/artifact refs,
  quota counters, device refs, revocation events, and audit events. It rejects
  raw customer fields, URLs, tokens, secrets, credentials, raw payloads, and
  YAML-like inputs. This is the required business ledger for future issuance,
  portal, quota, abuse-control, revoke, and audit workflows, but this repo
  change does not migrate Aliyun production SQLite, mutate tenants/artifacts,
  expose public Admin, activate payment, enforce quota/devices, or retire the
  legacy query-token route. The real issuance CLI now requires an explicit
  `--control-db-path` during execution and records safe control rows while
  keeping raw handoff material outside stdout and repository files. See
  `docs/SUBSCRIPTION_CONTROL_DATABASE.md`.
- Legacy Admin UI Archive: the existing `admin/` application is archived as a
  local protected reference/testing surface only. It is no longer the future
  product UI, user portal, or operator-console design baseline. Future UI work
  should be rebuilt around the provider-neutral CLI-first, public-site/portal
  split, operator provisioning form contract, resource-package handoff, and
  role/permission boundaries instead of polishing the old Overview-heavy Admin
  information architecture. No Admin code was moved or deleted by the archive
  decision. See `docs/ADMIN_UI_LEGACY_ARCHIVE.md`.
- Platform Domain Contract: repository-only platform lead, account,
  entitlement, and subscription-access grant shapes live under
  `server/services/platform/control-plane-contract.mjs`. They provide
  validation and operator-safe summaries only; no SQLite schema, production
  storage, billing provider, Aliyun runtime, DNS, or user traffic is activated.
- Platform Lead Review Queue: repository-only public lead intake can now feed an
  in-memory platform review queue under
  `server/services/platform/lead-review-queue.mjs`, with protected operator
  routes in `server/routes/admin-platform.mjs`. This is not CRM, Webhook,
  email automation, Aliyun deployment, production storage, or customer portal
  activation.
- Platform Account / Entitlement Shell: repository-only protected Admin routes
  can convert reviewed leads into in-memory account summaries and create/list
  account entitlement summaries through
  `server/services/platform/account-entitlement-shell.mjs`. Entitlement
  usability is fail-closed from status and validity windows. This is not
  billing, payment collection, CRM, SQLite persistence, Aliyun deployment,
  production storage, customer portal activation, DNS, or user traffic.
- Platform Dynamic Entry / Access Grant Shell: repository-only protected Admin
  routes can issue and list in-memory subscription access grant summaries
  through `server/services/platform/subscription-access-shell.mjs`. The
  summary exposes only operator-safe metadata such as issued status, delivery
  type, visible-once posture, and whether dynamic entry or artifact references
  exist. It does not expose raw customer portal URLs, artifact references,
  subscription URLs, SQLite persistence, Aliyun deployment, production storage,
  public portal resolution, DNS, or user traffic.
- Platform Resource Package CLI: repository-only local tooling can combine
  account, entitlement, subscription access grant, and optional channel
  activation package summaries into an operator-safe resource package through
  `server/services/platform/resource-package.mjs` and
  `scripts/platform-resource-package.mjs`. Repository-only controlled-open
  tooling can also run the in-memory lead -> account -> entitlement -> access
  grant -> resource package sequence through
  `server/services/platform/controlled-open-flow.mjs` and
  `scripts/platform-controlled-open.mjs`. These commands return only safe
  delivery metadata, hashed customer/operator references, flow booleans,
  blockers, next action, and safety flags. They do not expose organization
  names, customer emails, raw
  portal URLs, artifact references, subscription URLs, tokens, credentials,
  node hosts, raw ports, YAML, approval phrases, public routes, approval
  submission, execution controls, SQLite persistence, Aliyun deployment, DNS,
  production storage, payment activation, user traffic, edge traffic, or
  production authority.
- Platform Clean-Start Package: repository-only clean-start readiness support
  lives in `server/services/platform/clean-start-control-plane.mjs` and the
  protected Admin route `/api/admin/platform/clean-start`. It summarizes
  account, entitlement, access-grant, and private rendering dry-run readiness
  without exposing raw portal URLs, artifact references, subscription URLs,
  node hosts, node credentials, source-state paths, tokens, customer emails, or
  organization names. It is not Aliyun deployment, runtime initialization,
  public listener exposure, DNS, provider-firewall hardening, SQLite
  persistence, state copy, user traffic, or production authority.
- Platform Aliyun Gate Decision Packet: repository-only gate-decision support
  lives in `server/services/platform/aliyun-gate-decision-packet.mjs` and the
  protected Admin route `/api/admin/platform/aliyun-gates`. It summarizes the
  clean-start private validation, provider-firewall hardening,
  public-boundary dry run, DNS promotion, broader opaque artifact issuance,
  and legacy query-token retirement gates with explicit approval phrases for
  the next executable A-tier gates, blockers, source docs, and not-authorized
  actions. It does not expose firewall raw rules, management source labels, raw
  portal URLs, artifact references, subscription URLs, node hosts, node
  credentials, tokens, customer emails, or organization names. It is not Aliyun
  deployment, firewall mutation, public listener exposure, DNS, state copy, AWS
  mutation, artifact issuance, legacy query-token retirement, legacy route
  removal, user traffic, edge traffic, or production authority.
- Platform Aliyun Gate Evidence Shell: repository-only operator evidence
  support lives in `server/services/platform/aliyun-gate-evidence-shell.mjs`
  with protected Admin routes `/api/admin/platform/aliyun-gate-evidence` and
  `/api/admin/platform/aliyun-gate-evidence/provider-firewall` plus
  `/api/admin/platform/aliyun-gate-evidence/access-migration`. It records
  in-memory provider-firewall and access-migration gate evidence for decision
  support and exposes only status/boolean summaries. It lets the gate decision
  packet consume boolean internal evidence without retaining or echoing
  firewall raw rules, management-source labels, wg-home decision text, private
  notes, raw portal URLs, artifact references, subscription URLs, raw tokens,
  node hosts, node credentials, customer emails, or organization names. It is
  not Aliyun deployment, firewall
  mutation, UFW change, public listener exposure, DNS, SQLite persistence,
  state copy, AWS mutation, artifact issuance, legacy query-token retirement,
  user traffic, edge traffic, or production authority.
- Platform Access Model Inventory Summary: repository-only local tooling can
  normalize operator-provided subscription-access inventory facts into a
  redacted preflight summary through
  `server/services/platform/access-model-inventory-summary.mjs` and
  `scripts/access-model-inventory-summary.mjs`. It accepts only safe counts,
  booleans, and note labels; rejects raw subscription URLs, raw artifact URLs,
  tokens, artifact secrets, customer emails, SQLite rows, credentials, and
  other unsupported fields without echoing submitted values; and produces
  blocker evidence for broader opaque artifact issuance preflight. It is not
  Aliyun runtime inspection, SQLite access, artifact issuance, legacy
  query-token retirement, legacy route removal, DNS, Nginx, firewall, AWS,
  edge traffic, or production authority.
- Platform Aliyun Gate Review UI: repository-only Admin Overview support can
  show the protected Aliyun gate decision packet and gate-evidence summary for
  operator review. It displays exact-phrase fail-closed approval policy
  metadata for the executable gates without showing approval phrase text. It
  can record provider-firewall and access-migration evidence only as booleans
  and does not submit approval phrases or expose A-tier execution buttons. It
  does not display or submit raw firewall rules, management-source labels,
  wg-home decision text, notes, raw portal URLs, artifact references,
  subscription URLs, raw tokens, node hosts, node credentials, customer emails,
  or organization names. It is not Aliyun deployment, firewall mutation, UFW
  change, public listener exposure, DNS, SQLite persistence, state copy, AWS
  mutation, artifact issuance, legacy query-token retirement, user traffic,
  edge traffic, or production authority.
- Aliyun Promotion Runbook / Package 5: the repository-only promotion gate
  model is documented in `docs/ALIYUN_USER_SUBSCRIPTION_DISTRIBUTION_RUNBOOK.md`
  and recorded in
  `docs/production-replacement-records/2026-05-27-aliyun-promotion-runbook-readiness.md`.
  It separates repo-only design, live read-only inventory, source-state
  decision, private state-copy validation, public-boundary dry run, DNS
  promotion, observation, rollback, and cleanup. It does not authorize Aliyun
  deployment, DNS changes, state copy, public listener exposure, edge traffic,
  or production authority transfer.
- Historical Aliyun Clean-Start Control Plane: the former Gate B clean-start
  recommendation is captured in
  `docs/production-replacement-records/2026-05-27-aliyun-clean-start-control-plane-plan.md`.
  Clean-start meant Aliyun was planned as a new subscription-control authority
  without copying historical AWS SQLite, artifact, legacy query-token, or
  subscription-output state. The clean-start repo package now exists as
  protected operator-safe readiness and private rendering dry-run metadata. The
  next execution gates are separate A-tier approvals for clean-start private
  validation and provider-firewall hardening, documented in
  `docs/production-replacement-records/2026-05-27-aliyun-clean-start-private-validation-runbook.md`
  and
  `docs/production-replacement-records/2026-05-27-aliyun-provider-firewall-hardening-runbook.md`.
  The next-gate handoff packet lives in
  `docs/production-replacement-records/2026-05-27-aliyun-next-a-tier-execution-packet.md`;
  it copies the exact approval phrases and evidence targets for the two gates
  and explicitly says that short confirmations such as `同意`, `继续`, or
  `开始` do not authorize execution. It is repo-only documentation and does
  not perform Aliyun, firewall, DNS, runtime, state, or traffic mutation.
  Execution-record templates for the two next gates live under
  `docs/production-replacement-records/templates/` and must only be copied into
  dated execution records after the matching exact approval phrase is received.
  The repository also has a tested Aliyun gate approval-phrase policy in
  `server/services/platform/aliyun-gate-decision-packet.mjs`; it accepts only
  the exact phrase for the named gate and rejects short confirmations without
  echoing submitted text. The gate packet exposes the same fail-closed
  policy as operator-facing metadata for the clean-start private validation and
  provider-firewall hardening gates, while still exposing no approval
  submission route and no execution control.
  The protected `/api/admin/platform/aliyun-gates` packet can now show which
  next gates are ready for operator approval and which remain blocked, and the
  protected gate-evidence shell can record operator-provided provider-firewall
  evidence for that packet. Runtime initialization, public-boundary dry run,
  and production subscription-distribution promotion have execution records;
  edge rebuild and rollback-start remain separate A-tier gates.
  The repo-only B/C MVP closeout audit lives in
  `docs/production-replacement-records/2026-05-27-aliyun-repo-mvp-closeout.md`
  and records that repository contracts, protected Admin review surfaces, gate
  policy metadata, and validation boundaries are ready for the next exact-phrase
  A-tier decision gate. The exact-phrase clean-start private validation
  attempt is recorded in
  `docs/production-replacement-records/2026-05-27-aliyun-clean-start-private-validation-execution.md`;
  it refreshed the loopback-only Aliyun candidate runtime to current `master`,
  initialized candidate-only in-memory validation state, and passed private
  clean-start rendering metadata checks. No DNS, public listener, public Admin,
  provider firewall, AWS, historical state-copy, edge traffic, user traffic, or
  production authority transfer was performed. The provider-firewall hardening
  execution record is
  `docs/production-replacement-records/2026-05-27-aliyun-provider-firewall-hardening-execution.md`;
  it removed broad provider inbound rules and left only current operator
  management `/32` access for SSH and the existing wg-home UDP lab path. Public
  80/443/3456/18080 remain closed, AliDNS is unchanged, and no public-boundary
  dry run, DNS promotion, user traffic, edge traffic, AWS mutation, or
  production authority transfer was performed. The HP management-source
  follow-up is recorded in
  `docs/production-replacement-records/2026-05-27-aliyun-hp-management-source-firewall-execution.md`;
  it added HP public `/32` as a separate provider-firewall management source
  for SSH and existing wg-home UDP, corrected a temporary broad-rule creation
  issue in the same execution, verified HP TCP/22 reachability and UDP/51820
  arrival at Aliyun, and still performed no DNS, public listener, public Admin,
  state-copy, user traffic, edge traffic, AWS mutation, or production authority
  transfer. The HP wg-home logical handshake remained stale and is a separate
  operator-lab follow-up if needed. The public-boundary dry run is recorded in
  `docs/production-replacement-records/2026-05-27-aliyun-public-boundary-dry-run-execution.md`;
  it temporarily opened HP-scoped 80/443, validated that Nginx can expose
  `/api/health` while keeping Admin and root paths blocked and 3456/18080
  private, then removed the temporary provider rules, UFW rules, Nginx config,
  and temporary self-signed certificate. Final public 80/443/3456/18080 are
  closed again, AliDNS is unchanged, and no user traffic, state-copy, AWS
  mutation, or production authority transfer was performed. The exact-phrase
  production subscription-distribution promotion is recorded in
  `docs/production-replacement-records/2026-05-27-aliyun-production-subscription-distribution-promotion.md`;
  it promoted `sub.globalcirclecat.com` to the Aliyun public subscription
  boundary with durable 80/443 and HTTPS, validated public health/Admin
  blocking/no-token behavior plus a single authorized smoke refresh, and kept
  `ss-sg.globalcirclecat.com`, edge traffic, AWS, historical state copy,
  public Admin, 3456, and 18080 out of scope. The smoke tenant is disabled and
  the Aliyun `aegis.service` side effect is recorded for follow-up. The
  post-promotion observation and Aegis read-only follow-up is recorded in
  `docs/production-replacement-records/2026-05-27-aliyun-promotion-observation-aegis-readonly.md`;
  it observed five stable public samples, confirmed DNS remained in the
  intended split state, confirmed DB aggregate safety, and diagnosed Aegis as a
  failed systemd unit with Aegis processes still present. No Aegis repair or
  other host mutation was performed. The optional Aegis repair gate is defined
  in
  `docs/production-replacement-records/2026-05-27-aliyun-aegis-service-repair-runbook.md`,
  with a matching execution template in
  `docs/production-replacement-records/templates/aliyun-aegis-service-repair-execution-template.md`.
  It requires an exact approval phrase and is limited to Aegis-only process
  cleanup and service restart with proxy-gateway health guards. A fresh
  read-only preflight is recorded in
  `docs/production-replacement-records/2026-05-27-aliyun-aegis-service-repair-preflight.md`;
  it confirms the subscription boundary remains healthy, public Admin remains
  blocked, 3456/18080 remain externally closed from HP, SQLite integrity and
  safe aggregates are ok, and `aegis.service` is still failed due to leftover
  Aegis process state. The exact-phrase Aegis repair execution is recorded in
  `docs/production-replacement-records/2026-05-27-aliyun-aegis-service-repair-execution.md`;
  it attempted `reset-failed`, `start`, and Aegis-only process cleanup, but
  the stuck Aegis/AliYunDun processes could not be terminated within the gate
  and `aegis.service` remains failed. The repair stopped safely: subscription
  health remained 200, public Admin remained 404, no-token refresh remained
  401, DNS stayed unchanged, Nginx/ufw/proxy-gateway/certbot stayed active,
  SQLite integrity stayed ok, 3456/18080 stayed externally closed from HP, and
  no reinstall, disablement, reboot, DNS, firewall, Nginx, proxy-gateway,
  AWS, tenant, artifact, or edge mutation was performed.
- Clean Edge Node Rebuild Gate: the next clean edge data-plane rebuild gate is
  defined in
  `docs/production-replacement-records/2026-05-27-clean-edge-node-rebuild-runbook.md`,
  with a matching execution template in
  `docs/production-replacement-records/templates/clean-edge-node-rebuild-execution-template.md`.
  It treats the rebuilt edge host as replaceable data-plane capacity, not as
  the Aliyun control-plane host described by that historical runbook, HP, or a
  restart of the retired AWS nodes. It requires an exact approval phrase before
  clean host provisioning/bootstrap/private validation and explicitly keeps DNS,
  subscription output, user traffic, public Admin, AWS lifecycle recovery,
  node termination, and security-group deletion out of scope. A fresh
  read-only preflight is recorded in
  `docs/production-replacement-records/2026-05-27-clean-edge-node-rebuild-preflight.md`;
  it confirms the Aliyun subscription boundary is healthy from a remote
  vantage, public Admin is blocked, no-token refresh returns 401, Aliyun
  3456/18080/18388 are not externally reachable from that vantage, and no
  clean edge target has been selected or provisioned. This preflight predates
  the later Singapore termination record, so use it only as historical
  pre-termination evidence. The
  execution handoff packet is recorded in
  `docs/production-replacement-records/2026-05-27-clean-edge-rebuild-execution-handoff.md`;
  it recommends `prod-edge-c` as the first clean rebuild logical identity and
  consolidates the approval phrase, start checklist, stop conditions, execution
  envelope, execution-record target, and not-performed boundaries for a future
  Production Operations Agent. A post-PR #226 read-only live check is recorded
  in
  `docs/production-replacement-records/2026-05-27-post-226-clean-edge-live-check.md`;
  it reconfirms from the Aliyun host vantage that `sub` resolves to Aliyun,
  `ss-sg` remains on the old AWS address, public health/Admin/root/no-token
  behavior remains safe, proxy-gateway-candidate/nginx/certbot.timer are
  active, `aegis.service` remains failed as a separate follow-up, and exact
  approval is still required before any clean edge execution.
- Subscription Control / Edge Split: keep subscription state, Admin actions,
  opaque artifacts, and rendering authoritative in the Vultr Japan control
  plane. Treat the former Aliyun subscription-distribution boundary as
  historical execution evidence; it does not override the current Vultr
  Japan/Singapore lane without a fresh Risk A inventory and explicit approval.
- Edge Data Plane: AWS Singapore `prod-edge-a/b` were stopped under an
  accepted-outage cleanup decision and later permanently terminated with their
  security groups deleted. New edge capacity now needs clean rebuild planning;
  do not describe the current state as serving production traffic.
- Validation / CI: move manual CI toward a local Linux validation host so the
  future production subscription control plane does not also run repository
  validation workloads.
- Channel Upgrade MVP: prioritize Clash/Mihomo-native subscription rendering
  for multi-protocol channel candidates. Shadowsocks is now legacy-only and must
  not be restored as the default production channel; VLESS Reality/TCP,
  Hysteria2, and TUIC are renderer-supported candidate families, with
  VLESS/XUDP still canary-scoped until measured. QUIC/MPTCP stay research items
  until measured in controlled canaries. The repository channel
  support for the Vultr production-node completion lane now persists Hysteria2
  loopback `trafficStats`, `sniff` rewrite policy, and IPv4-only direct
  outbound mode through the explicit-restart adapter and multichannel template.
  This is repo-only support; production still requires a separate A-tier
  deployment gate before any host config, env, service, or firewall mutation.
  The repository channel
  strategy engine now separates default `stable` output from `private`,
  `canary`, and `recovery` capacity while preserving explicit operator canary
  assignment as single-node output. Repository measurement scoring can now turn
  local benchmark summaries into advisory quality tiers and recommended pools;
  candidate reports can join dry-run config metadata with scores into
  stable/canary/private/hold/missing-measurement groups for operator review,
  and decision packs can turn those inputs into safe baseline/canary/blocker
  artifacts. Channel runtime inventory summary support can now normalize
  operator-provided runtime gate facts into safe summary artifacts without raw
  hosts, ports, URLs, credentials, raw logs, tokens, subscription URLs, or
  customer data. Channel runtime registry integration can join dry-run config,
  measurement score, and those safe runtime inventory summaries into
  canary-ready, runtime-blocked, and missing-inventory groups without contacting
  edge nodes or mutating runtime state. Channel runtime gate packets can turn
  the registry into an operator-safe approval-readiness packet for the next
  separate Risk A runtime canary gate without submitting approval phrases,
  deploying runtimes, moving traffic, or changing subscription output. Channel
  system decision flows can now build the runtime inventory summary, runtime
  registry, runtime gate packet, and top-level readiness status from the three
  safe local inputs in one repository artifact without contacting edge nodes or
  authorizing runtime changes. A protected Admin platform route can now expose
  the same channel system decision flow for operator review surfaces without
  adding approval submission, runtime, DNS, firewall, traffic, or
  subscription-output controls. The protected Admin Overview can now consume
  that route from a read-only channel system review panel, so operators can
  paste a safe evidence packet and inspect flow status, required next action,
  canary readiness, and runtime blockers without execution controls. The
  channel runtime evidence bridge can now convert safe runtime evidence packets
  into runtime inventory input and the full system decision readiness artifact
  without edge-node contact, runtime mutation, approval submission, traffic
  movement, or production activation. The protected Admin platform route and
  Admin Overview review panel can now run that bridge from safe operator
  runtime evidence packets without requiring CLI composition and without
  exposing runtime deployment, approval submission, DNS, firewall, traffic, or
  subscription-output controls. A protected channel runtime gate workbench can
  now turn the same safe runtime bridge packets into gate-facing advisory
  status, counts, approval-readiness metadata, and candidate groupings without
  adding approval submission, approval-phrase echo, runtime execution,
  edge-node contact, traffic movement, or production activation. A protected
  channel runtime execution handoff can now convert those safe bridge packets
  into operator-safe A-tier handoff material with execution authority marked
  `not_granted`, source runbook reference, candidate counts, grouped
  candidates, and preflight/validation/rollback checklist keys without
  approval submission, approval text, runtime execution, edge-node contact,
  traffic movement, or production activation. A protected channel subscription
  output draft layer can now convert safe runtime bridge packets into
  summary-only baseline/canary/private/blocked pools for subscription-output
  planning while explicitly keeping YAML generation disabled, real
  subscription output unchanged, activation not approved, no approval
  submission route, no execution route, no edge-node contact, no runtime
  mutation, and no traffic movement. A protected channel lab target
  decision layer can now accept safe target inventory packets after a blocked
  runtime inventory and return whether to request a fresh `channel-lab-b`
  selection gate, a separate `channel-lab-a` access/port/cleanup gate, or the
  normal Risk A runtime canary approval gate. It does not contact edge nodes,
  create servers, submit approval phrases, expose approval text, deploy
  runtimes, mutate DNS/firewall/systemd state, move traffic, or change
  subscription output. Extended measurement assessments can classify
  already-collected local benchmark summaries as ready, needing more samples,
  or hold for investigation before an operator decides on the next canary gate. Measurement
  investigation reports can consume safe bundle reports and classify hold
  patterns such as sustained tail latency or isolated tail spikes into
  advisory next actions. Candidate comparison plans can combine those
  investigation reports with dry-run config summaries to identify TUIC or
  VLESS/XUDP as the next measured candidate family after a held Hysteria2
  result. These repository tools do not mutate runtime config or activate
  nodes. Runtime
  canaries are gated by
  `docs/CHANNEL_CANARY_SERVER_SELECTION.md` and
  `docs/CHANNEL_RUNTIME_CANARY_RUNBOOK.md`; repository renderer/config support
  does not authorize server creation or remote protocol deployment by itself.
  The Technical MVP baseline wording is now aligned with the current Vultr
  Japan control-plane and Vultr Japan/Singapore data-plane direction: SS
  remains a legacy compatibility reference only, not a current default
  production channel. The historical TUIC
  Stage 0 read-only inventory handoff is
  `docs/production-replacement-records/2026-05-27-tuic-runtime-inventory-gate.md`;
  it requires the exact inventory approval phrase before any live inventory and
  still does not authorize TUIC runtime deployment, port exposure, subscription
  output changes, operator-device traffic, or cleanup mutation.
  The approved Stage 0 read-only inventory execution is recorded in
  `docs/production-replacement-records/2026-05-27-tuic-runtime-inventory-execution.md`.
  It verified `channel-lab-a` AWS identity, running state, SG posture, ENI, and
  TUIC upstream release metadata, but host-internal inventory was blocked by
  SSH banner timeout and SSM was unavailable. TUIC deployment remains blocked;
  the recommended next path is a clean `channel-lab-b` comparison gate, or a
  separate `channel-lab-a` access/port/cleanup plan before reuse.
- Local Edge Agent: keep as a parked future node/agent adaptation asset, not
  the current mainline for the next channel-upgrade slice.
- Server Edge Mesh: plan private edge-to-edge health, management, validation,
  and recovery paths. It is not a user VPN and does not authorize WireGuard
  execution by itself.
- Operator Lab / HP Relay: useful for local path and upstream behavior
  research, but not production, staging, CI, `prod-edge-c`, Server Edge Mesh, or
  the official Local Edge Agent runtime.

Use these docs for detail:

- `docs/VULTR_JAPAN_CONTROL_DATA_PLANE_STATUS.md`
- `docs/PROJECT_TOPOLOGY.md`
- `docs/goals/2026-05-26-aliyun-subscription-control-platform-mvp.md`
- `docs/ALIYUN_USER_SUBSCRIPTION_DISTRIBUTION_RUNBOOK.md`
- `docs/ALIYUN_CONTROL_LOCAL_CI_REBUILD_PLAN.md`
- `docs/SUBSCRIPTION_CONTROL_EDGE_ARCHITECTURE.md`
- `docs/SUBSCRIPTION_CONTROL_PLANE_NEW_SERVER_RUNBOOK.md`
- `docs/LOCAL_EDGE_AGENT_DESIGN.md`
- `docs/LOCAL_EDGE_CHANNEL_TECHNICAL_MVP.md`
- `docs/CHANNEL_STRATEGY_ENGINE.md`
- `docs/CHANNEL_CANARY_SERVER_SELECTION.md`
- `docs/CHANNEL_RUNTIME_CANARY_RUNBOOK.md`
- `docs/SERVER_EDGE_MESH_DESIGN.md`
- `docs/PROJECT_SIMPLIFICATION_MAP.md`
- `docs/MULTI_AGENT_OPERATING_MODEL.md`

## Current Production Snapshot

This snapshot includes the latest documented Vultr/SGP closeout from
2026-06-09, but remains a documentation handoff only. Refresh live DNS, Nginx,
service, endpoint, firewall, runtime, and SQLite state before any new A-tier
work.

- Vultr Japan is the documented current control-plane authority for the
  `globalcirclecat.cloud` production lane after the June Vultr migration work.
  Japan owns user portal orders, subscription rendering, credential lifecycle
  orchestration, and remote data-plane handoff for the current Vultr/SGP lane.
- Vultr Singapore is documented as a data-plane node connected through Japan
  control-plane handoff. The current documented production channel bundle
  includes Vultr and SGP VLESS Reality, Hysteria2, and TUIC logical channels.
- The 2026-06-09 SGP runtime closeout validated SGP Xray, Hysteria2, and
  Mihomo/TUIC services active; TCP 8443, UDP 10443, and UDP 443 listeners
  present; Hysteria2 stats loopback-only; and no public Admin exposure.
- Subscription rendering must keep controlled GlobalCircle node domains out of
  fake-IP/TUN self-routing paths for desktop Clash/Mihomo clients.
- Hysteria2 runtime config must render `outbounds` as named list entries and
  preserve service-user-readable config ownership when applying credentials.

- Historical Aliyun subscription-distribution status: promotion executed for
  `sub.globalcirclecat.com`; this does not describe the current Vultr lane.
- Historical DNS records from that execution period:
  `sub.globalcirclecat.com -> 47.251.178.125` and
  `ss-sg.globalcirclecat.com -> 13.215.156.159`.
- During that historical period, `sub.globalcirclecat.com` served the Aliyun
  public subscription boundary over
  HTTP/HTTPS with `/api/health` returning 200, public Admin/root returning 404,
  and no-token subscription refresh returning 401. Public Admin is not exposed.
- During that historical period, `ss-sg.globalcirclecat.com` remained on the
  old AWS address by design;
  edge traffic activation was not approved in the promotion gate.
- AWS Singapore `prod-edge-a` and `prod-edge-b` are permanently terminated
  under the 2026-05-29 cleanup record; their associated security groups were
  deleted, and rollback by starting those instances is waived.
- Legacy blue remains stopped for controlled review and was not terminated.
- HTTPS and public subscription endpoints on the retired AWS nodes were not the
  subscription-distribution authority after Aliyun promotion.
- The active opaque artifact canary exists for controlled operator validation.
  The full import URL is stored only in a local `C:\tmp\...` file and must not
  be pasted, committed, logged, or written into docs.
- Legacy `/sub/clash.yaml?token=...` support still exists until a separate
  A-tier retirement plan is approved.
- Subscription V2 tracked config still references `prod-edge-a` and
  `prod-edge-b`, but those carrying instances are terminated; subscription
  output/config must be rebuilt before edge delivery can be considered
  healthy.
- The latest non-Aliyun node cleanup preflight is recorded in
  `docs/production-replacement-records/2026-05-26-non-aliyun-node-cleanup-preflight.md`.
  It refreshed AWS, AliDNS, public endpoint, and repository-reference evidence
  and did not perform any stop, terminate, DNS, security-group, runtime, tenant,
  SQLite, or artifact mutation.
- The approved stop-only cleanup is recorded in
  `docs/production-replacement-records/2026-05-26-singapore-prod-edge-stop.md`.
  It stopped `prod-edge-a` and `prod-edge-b`, retained security groups, left
  DNS unchanged, did not terminate instances, and did not mutate Aliyun.
- The approved Singapore termination cleanup is recorded in
  `docs/production-replacement-records/2026-05-29-singapore-prod-edge-termination.md`.
  It permanently terminated `prod-edge-a` and `prod-edge-b`, deleted their
  associated security groups, preserved legacy blue, left DNS unchanged, and
  waived rollback by starting those instances.
- The approved Aliyun subscription-distribution promotion is recorded in
  `docs/production-replacement-records/2026-05-27-aliyun-production-subscription-distribution-promotion.md`.
  It changed only `sub.globalcirclecat.com`, opened durable Aliyun 80/443,
  issued HTTPS for the subscription boundary, verified public health/Admin
  blocking/no-token and authorized-smoke behavior, left `ss-sg` unchanged, did
  not activate edge traffic, and recorded an Aliyun `aegis.service` follow-up.
- The post-promotion observation and Aegis read-only follow-up is recorded in
  `docs/production-replacement-records/2026-05-27-aliyun-promotion-observation-aegis-readonly.md`.
  It observed five stable public samples, preserved the intended DNS split,
  confirmed DB integrity and disabled-smoke state, and found `aegis.service`
  failed while Aegis updater/client/monitor processes remain present. It did
  not mutate DNS, firewall, Nginx, proxy-gateway, Aegis, AWS, tenants,
  artifacts, or edge traffic.
- The optional Aegis repair runbook is recorded in
  `docs/production-replacement-records/2026-05-27-aliyun-aegis-service-repair-runbook.md`.
  It defines the exact approval phrase, Aegis-only repair scope, hard stops,
  post-repair validation, and sensitive-output boundaries. It does not execute
  Aegis process cleanup, service restart, reinstall, disablement, reboot, or
  any DNS / Nginx / proxy-gateway / firewall / AWS / tenant / edge mutation.
- The fresh Aegis repair preflight is recorded in
  `docs/production-replacement-records/2026-05-27-aliyun-aegis-service-repair-preflight.md`.
  It confirms the Aliyun subscription boundary is still healthy, Admin/no-token
  behavior remains safe, private ports remain externally closed from HP,
  SQLite integrity and safe aggregate counts are ok, and `aegis.service`
  remains failed with leftover Aegis process evidence. It does not execute
  repair mutation and still requires the exact Aegis repair approval phrase.
- The Aegis repair execution is recorded in
  `docs/production-replacement-records/2026-05-27-aliyun-aegis-service-repair-execution.md`.
  Exact approval was received, `reset-failed` and `start` were attempted, and
  Aegis-only process cleanup was attempted. The repair failed and stopped
  safely because the stuck Aegis/AliYunDun processes could not be terminated
  within this gate. `aegis.service` remains failed, but the subscription
  boundary, DNS, Nginx, UFW, proxy-gateway, SQLite integrity, and private-port
  posture remained safe and unchanged. Broader vendor-agent repair, package
  reinstall, Aegis disablement, or host reboot remains unapproved.
- The clean edge node rebuild runbook is recorded in
  `docs/production-replacement-records/2026-05-27-clean-edge-node-rebuild-runbook.md`.
  It defines the exact approval phrase, clean edge host/bootstrap/private
  validation scope, rollback/stop posture, hard stops, and next gates. It does
  not execute cloud provisioning, DNS changes, subscription-output changes,
  user traffic, public Admin exposure, AWS lifecycle recovery, node
  termination, or security-group deletion. It also keeps the Aliyun
  subscription-control host described by that historical runbook and HP out of
  the edge-node role. The matching read-only preflight is recorded in
  `docs/production-replacement-records/2026-05-27-clean-edge-node-rebuild-preflight.md`.
  It excludes proxy-contaminated local Windows DNS/TCP checks, uses AliDNS and
  Aliyun remote-vantage evidence, confirms `sub` on Aliyun, `ss-sg` on the old
  stopped AWS address, private Aliyun app ports closed externally, stopped AWS
  nodes without public IP association, and no selected clean edge target. The
  execution handoff packet is recorded in
  `docs/production-replacement-records/2026-05-27-clean-edge-rebuild-execution-handoff.md`;
  it remains docs-only and does not provision, assign, bootstrap, inject
  secrets, start services, change DNS, or change subscription output. The
  post-PR #226 read-only live check is recorded in
  `docs/production-replacement-records/2026-05-27-post-226-clean-edge-live-check.md`;
  it reconfirms the Aliyun public subscription boundary, unchanged `ss-sg`,
  safe public Admin/no-token behavior, active proxy-gateway-candidate/nginx,
  and failed `aegis.service` without executing any mutation. The repository
  helper documented in `docs/CLEAN_EDGE_READINESS_SUMMARY.md` can normalize
  safe operator-provided clean edge gate facts into a redacted readiness
  summary via `npm run platform:clean-edge-readiness-summary -- <safe.json>`.
  The same safe packet shape is also available through protected Admin review
  route `POST /api/admin/platform/clean-edge-readiness-summary` and the Admin
  Overview `Clean edge readiness` panel. These surfaces are not live inventory,
  not approval authority, not public routes, and not execution.
- The opaque artifact issuance and legacy query-token retirement runbook is
  recorded in
  `docs/production-replacement-records/2026-05-27-opaque-artifact-issuance-and-legacy-token-retirement-runbook.md`.
  It splits broader artifact issuance from later legacy query-token retirement,
  defines exact approval phrases and execution templates for both gates, and
  keeps future route removal as a separate compatibility gate. It does not
  issue artifacts, rotate or drain legacy tokens, change DNS, change Nginx,
  expose public Admin, activate edge traffic, mutate AWS, copy historical
  state, or record raw subscription URLs, tokens, or artifact secrets.
- The access-model inventory summary helper is documented in
  `docs/ACCESS_MODEL_INVENTORY_SUMMARY.md`. It is repo-only B-tier support for
  those gates: it can produce redacted preflight summaries from safe operator
  JSON, but it does not gather live inventory or execute either A-tier gate.
- The latest channel canary server selection inventory is recorded in
  `docs/production-replacement-records/2026-05-26-channel-canary-server-selection-inventory.md`.
  It recommends a clean provider-neutral `channel-lab-a` target and Hysteria2
  as the first protocol family, but it did not create a server, choose a
  provider, deploy runtime, open ports, or change traffic.
- The approved `channel-lab-a` creation is recorded in
  `docs/production-replacement-records/2026-05-26-channel-lab-a-creation.md`.
  It created an AWS ap-southeast-1 clean canary instance
  `i-0f2cf745a1bb5ba51` with security group `sg-0cad3c8a7380528f9`, SSH
  restricted to the operator `/32`, and UDP/443 reserved for a future Hysteria2
  canary. No Hysteria2 runtime, DNS, Nginx, production config, subscription
  output, or traffic canary was performed.
- The approved Hysteria2 runtime deployment is recorded in
  `docs/production-replacement-records/2026-05-26-channel-lab-a-hysteria2-runtime.md`.
  Hysteria2 v2.9.2 is active on `channel-lab-a`, UDP/443 is listening, and a
  host-only client smoke test returned HTTP 200 through the local Hysteria
  path. No operator-device canary, DNS, production config, subscription output,
  or production traffic was performed.
- The approved controlled operator-device Hysteria2 canary is recorded in
  `docs/production-replacement-records/2026-05-26-channel-lab-a-hysteria2-operator-device-canary.md`.
  A local Hysteria2 client on the operator device completed 20/20 short HTTP
  proxy samples through `channel-lab-a` with no client log errors. Local canary
  config was generated outside the repository and is sensitive. No all-user
  rollout, subscription output change, DNS, Nginx, production config, runtime
  reconfiguration, security-group mutation, or production traffic was
  performed.
- The approved controlled Mihomo import validation is recorded in
  `docs/production-replacement-records/2026-05-26-channel-lab-a-hysteria2-mihomo-import-validation.md`.
  A temporary standalone Mihomo v1.19.25 core on the operator device parsed the
  local Hysteria2 canary config, listened on `127.0.0.1:28280`, and completed
  20/20 short HTTP proxy samples through `channel-lab-a` with no Mihomo log
  errors. No all-user rollout, subscription output change, DNS, Nginx,
  production config, system proxy, TUN, runtime reconfiguration,
  security-group mutation, or production traffic was performed.
- The approved Hysteria2 extended measurement is recorded in
  `docs/production-replacement-records/2026-05-26-channel-lab-a-hysteria2-extended-measurement.md`.
  Direct Hysteria2 and standalone Mihomo paths each completed 3 windows of 60
  operator-device samples with 180/180 successes and no timeouts. The
  repository bundle report classified both probes as `hold_for_investigation`:
  the direct path exceeded p95/p99 latency thresholds, and the Mihomo path had
  one p99 latency spike. No all-user rollout, subscription output change, DNS,
  Nginx, production config, runtime reconfiguration, service restart,
  security-group mutation, system proxy change, TUN, or production traffic was
  performed.
- Legacy blue `i-004ab1c6c71d06bca` is stopped and retained for controlled
  retirement review. Do not terminate it or delete its security group without
  separate A-tier approval.
- Current prod-edge-a production subscription DB path is documented as
  `/opt/proxy-gateway-minimal/.proxy-gateway/subscriptions.sqlite`. Historical
  records may mention `/opt/proxy-gateway-minimal/data/subscriptions.sqlite`;
  verify the active runtime `.env` before backup, restore, or SQLite inspection.
- The live production deployment directory is not a Git checkout. Verify
  production by file presence, `systemctl`, `journalctl`, endpoint behavior, and
  SQLite/tooling checks rather than `git rev-parse` on the host.

## Active Blockers And Gated Work

The following remain blocked unless a specific runbook, read-only inventory,
operator approval, validation, and rollback path exist:

- Broader opaque artifact issuance, now gated by
  `docs/production-replacement-records/2026-05-27-opaque-artifact-issuance-and-legacy-token-retirement-runbook.md`.
- Legacy query-token retirement, now gated by
  `docs/production-replacement-records/2026-05-27-opaque-artifact-issuance-and-legacy-token-retirement-runbook.md`
  after broader artifact issuance and observation. Future route removal remains
  a separate compatibility gate.
- Traffic accounting, quota enforcement, and device-abuse enforcement.
- Channel runtime canary execution for VLESS/XUDP, Hysteria2, TUIC, or any
  other protocol candidate. Repository renderer/config support is merged, but
  server selection, server creation, runtime deployment, node config activation,
  security-group/firewall changes, operator-device canaries, or broader rollout
  remain A-tier and must follow `docs/CHANNEL_CANARY_SERVER_SELECTION.md` and
  `docs/CHANNEL_RUNTIME_CANARY_RUNBOOK.md`.
  The current `channel-lab-a` records prove server runtime health, short
  controlled canaries, and one extended operator-device Hysteria2 measurement.
  Extended measurement volume is sufficient, but the latest result is
  `hold_for_investigation` because latency thresholds were exceeded. GUI import
  evidence, TUIC/VLESS-XUDP comparison, subscription output changes, broader
  rollout, and cleanup/termination each still require separate approval and
  evidence.
- The TUIC comparison canary plan is documented in
  `docs/CHANNEL_TUIC_COMPARISON_CANARY_PLAN.md`. It defines TUIC as the next
  measured channel candidate after the held Hysteria2 extended measurement,
  with VLESS/XUDP as the secondary comparison candidate. It does not authorize
  TUIC runtime deployment, server creation, port exposure, subscription output
  changes, DNS, Nginx, systemd, firewall/security-group changes, operator-device
  traffic, or production traffic.
- The TUIC runtime inventory gate handoff is documented in
  `docs/production-replacement-records/2026-05-27-tuic-runtime-inventory-gate.md`.
  It defines the next exact Stage 0 read-only inventory approval phrase, the
  allowed evidence, stop conditions, and later deployment/canary gates. It did
  not execute TUIC inventory, deploy TUIC, create a server, open ports, change
  firewall/security groups, change subscription output, run operator-device
  traffic, or clean up `channel-lab-a`.
- The approved TUIC Stage 0 read-only inventory execution is recorded in
  `docs/production-replacement-records/2026-05-27-tuic-runtime-inventory-execution.md`.
  It verified that `channel-lab-a` is still running in AWS ap-southeast-1 with
  the expected security group and UDP/443 Hysteria2 exposure, but SSH reached
  TCP connect and timed out before banner/auth, while SSM is not registered.
  Host-internal runtime state was not reverified, so TUIC runtime deployment is
  blocked. The record recommends a fresh `channel-lab-b` TUIC comparison gate
  unless the operator separately approves `channel-lab-a` access remediation,
  second-port planning, or Hysteria2 cleanup planning.
- The approved `channel-lab-b` creation is recorded in
  `docs/production-replacement-records/2026-05-28-channel-lab-b-creation.md`.
  It created an AWS ap-northeast-1 clean TUIC canary instance
  `i-068f3cebec06ad0c0` with security group `sg-0a70e5f1bbd42576b`, SSH
  restricted to the operator `/32`, and UDP/443 reserved for a future TUIC
  controlled subscription batch canary. The instance is running, AWS status
  checks are ok, and SSH base OS validation succeeded.
- The approved `channel-lab-b` TUIC runtime deployment is recorded in
  `docs/production-replacement-records/2026-05-28-channel-lab-b-tuic-runtime.md`.
  Mihomo Meta v1.19.25 is installed as `mihomo-tuic.service`, the TUIC v5
  listener is active on UDP/443, config test passed, service status is active,
  and `NRestarts` was 0 during validation. TUIC UUID/password material was
  generated and retained only on the remote host. No DNS, Nginx, production
  config, subscription output, controlled subscription batch, operator-device
  traffic, production authority transfer, or all-user rollout was performed.
- The approved controlled TUIC subscription batch and operator-device canary is
  recorded in
  `docs/production-replacement-records/2026-05-28-channel-lab-b-tuic-operator-device-canary.md`.
  Local sensitive TUIC YAML was generated outside the repository, standalone
  Mihomo listened only on `127.0.0.1:29380`, and the short canary completed
  20/20 HTTP 204 samples through `channel-lab-b` with failed samples 0, p50
  0.8287s, p95 0.8371s, max 2.1476s, and Mihomo log error count 0. The
  temporary Mihomo process was stopped after validation. No production
  subscription-output change, public subscription URL generation, DNS, Nginx,
  production config, system proxy, TUN, all-user rollout, or production
  authority transfer was performed.
- The approved `channel-lab-b` TUIC extended measurement is recorded in
  `docs/production-replacement-records/2026-05-28-channel-lab-b-tuic-extended-measurement.md`.
  The standalone Mihomo -> TUIC path completed three 60-sample windows with
  180/180 successful samples, no timeouts, and no error-like local Mihomo log
  lines. The repository-safe bundle and investigation reports classify the
  candidate as ready for operator decision / prepare Risk A canary gate. No
  subscription-output change, DNS, Nginx, production config, all-user rollout,
  system proxy, TUN, runtime reconfiguration, or production authority transfer
  was performed.
- The read-only Aliyun / TUIC subscription-output integration inventory is
  recorded in
  `docs/production-replacement-records/2026-05-28-aliyun-tuic-subscription-output-integration-inventory.md`.
  It confirmed the Aliyun public subscription boundary still returns
  health=200, public Admin=404, no-token subscription=401, and root=404 when
  addressed directly as the Aliyun subscription boundary. It also found that
  host-internal Aliyun inventory is currently blocked by SSH session closure
  and that public 3456/18080 posture is inconclusive because TCP connects but
  HTTP `/api/health` times out. No subscription-output activation, DNS, Nginx,
  runtime, firewall, config, traffic, or authority mutation was performed.
- The approved Aliyun host/provider follow-up inventory is recorded in
  `docs/production-replacement-records/2026-05-28-aliyun-tuic-host-provider-inventory.md`.
  It confirmed SWAS provider identity and firewall posture read-only: 80/443
  are the public subscription-boundary ports, 22 and 51820 are scoped to
  management/lab sources, and 3456/18080 have no provider allow rule and are
  closed_or_timeout from the HP external vantage. Host-internal inventory still
  cannot run over SSH because the session times out during banner exchange.
  Cloud Assistant is available but was not invoked in this gate. No runtime,
  firewall, DNS, Nginx, config, subscription-output, traffic, or authority
  mutation was performed.
- The approved Aliyun Cloud Assistant read-only host inventory is recorded in
  `docs/production-replacement-records/2026-05-28-aliyun-cloud-assistant-tuic-host-inventory.md`.
  It resolved the Aliyun host-internal evidence gap for TUIC
  subscription-output planning without SSH: `proxy-gateway-candidate` and
  Nginx are active, loopback app and loopback Nginx health return HTTP 200,
  candidate SQLite integrity is ok, `nginx -t` passes, `$request_uri` count is
  0, and host-internal listeners/resources were summarized. No runtime,
  firewall, DNS, Nginx reload, systemd restart, config, subscription-output,
  SQLite row, traffic, or authority mutation was performed.
- The approved canary-only TUIC subscription-output activation planning record
  is
  `docs/production-replacement-records/2026-05-28-tuic-subscription-output-canary-planning.md`.
  It records that `channel-lab-b` TUIC has enough operator-device evidence to
  plan a one-controlled-access canary gate, but activation authority is still
  not granted. The host-internal evidence gap is now resolved through Cloud
  Assistant read-only inventory; the next safe path is a real controlled-access
  config/activation mechanism, rollback evidence, then a separate exact
  activation approval. No subscription-output mutation, DNS,
  Nginx, runtime, firewall, config, traffic, all-user rollout, or authority
  mutation was performed.
- The approved canary-only TUIC subscription-output dry-run package is recorded
  in
  `docs/production-replacement-records/2026-05-28-tuic-subscription-output-dry-run-package.md`.
  The dry-run bundle lives under
  `docs/channel-activation-dry-runs/2026-05-28-channel-lab-b-tuic-subscription-output/`.
  The activation-flow fixture was ready for an A-tier request, but the
  activation package against current repository config was blocked with
  `missing_subscription_output_config`, and the production-module package was
  blocked with `activation_package_not_ready` and
  `candidate_missing_from_activation_package`. This means TUIC measurement is
  sufficient for planning, but the current repository subscription-output
  config does not yet contain the `channel-lab-b` TUIC canary candidate. No
  subscription-output mutation, production YAML generation, DNS, Nginx,
  runtime, firewall, config, traffic, all-user rollout, or authority mutation
  was performed.
- The approved canary-only TUIC subscription-output config review is recorded
  in
  `docs/production-replacement-records/2026-05-28-tuic-subscription-output-config-review.md`.
  It adds a synthetic, non-deployable review-only proxy config fixture under
  `docs/channel-activation-dry-runs/2026-05-28-channel-lab-b-tuic-subscription-output/`.
  The same activation package and production-module tooling becomes
  review-ready against that fixture, proving the TUIC canary config shape is
  compatible with repository tooling. The current runtime config remains
  unchanged and blocked. No `config/proxy-servers.json` change, production
  deployment, subscription-output mutation, production YAML generation, DNS,
  Nginx, runtime, firewall, traffic, all-user rollout, or authority mutation
  was performed.
- The TUIC controlled-access activation mechanism review is recorded in
  `docs/production-replacement-records/2026-05-28-tuic-controlled-access-activation-mechanism.md`.
  It adds a summary-only mechanism artifact under
  `docs/channel-activation-dry-runs/2026-05-28-channel-lab-b-tuic-subscription-output/controlled-access-mechanism.json`
  and fixes the next executable shape: one controlled operator access only,
  default stable output unchanged, rollback evidence required, and execution
  authority still `not_granted`. It does not choose or execute the real
  production mechanism, does not change `config/proxy-servers.json`, and does
  not mutate subscription output, Aliyun, DNS, Nginx, systemd, channel-lab-b,
  traffic, or rollout scope.
- The TUIC controlled-access activation request packet is recorded in
  `docs/production-replacement-records/2026-05-28-tuic-controlled-access-activation-request.md`.
  It adds a summary-only request artifact under
  `docs/channel-activation-dry-runs/2026-05-28-channel-lab-b-tuic-subscription-output/activation-request-packet.json`
  and consolidates the ready evidence, activation-time fresh checks, hard
  stops, and exact approval phrase required before any one-controlled-access
  TUIC canary activation. Execution authority is still `not_granted`; short
  confirmations such as `同意` only authorize repo-only planning or review,
  not subscription-output mutation. It does not mutate config, subscription
  output, Aliyun, DNS, Nginx, systemd, channel-lab-b, traffic, or rollout
  scope.
- The exact-approved TUIC controlled-access activation attempt is recorded in
  `docs/production-replacement-records/2026-05-28-tuic-controlled-access-activation-stopped.md`.
  It refreshed the public subscription boundary, Aliyun host-internal summary,
  and channel-lab-b runtime health, then stopped before mutation because Aliyun
  had no active controlled operator access, active artifact, or unexpired
  unused temporary link to bind. No runtime config, subscription-output,
  systemd, Nginx, DNS, firewall, SQLite row, channel-lab-b, traffic, all-user
  rollout, or authority mutation was performed. The next retry must explicitly
  cover creating/issuing or identifying one controlled operator access before
  activation can continue.
- The exact-approved controlled operator access creation is recorded in
  `docs/production-replacement-records/2026-05-28-tuic-controlled-operator-access-creation.md`.
  It created one active controlled operator access and one active opaque
  artifact on Aliyun, stored the visible-once handoff material outside the
  repository, and validated that the artifact refresh still returns the stable
  SS output only. The previous output state is `prod-edge-a`; TUIC binding was
  not performed, channel-lab-b TUIC is not in the Aliyun runtime config, and no
  DNS, Nginx, firewall, systemd, channel-lab-b, all-user rollout, or authority
  mutation was performed. The next retry may use the exact canary-only TUIC
  subscription-output activation phrase again, with fresh checks and rollback
  evidence.
- The exact-approved canary-only TUIC subscription-output activation is
  recorded in
  `docs/production-replacement-records/2026-05-28-tuic-controlled-access-activation.md`.
  It added `channel-lab-b-tuic` as one Aliyun runtime canary candidate, stored
  TUIC material only in the protected Aliyun environment file, restarted only
  `proxy-gateway-candidate.service`, and rebound exactly one active controlled
  operator access from stable `prod-edge-a` output to `channel-lab-b-tuic`.
  The controlled opaque artifact refresh now returns 200 with TUIC output only.
  Default/stable output for broader users remains unchanged. No all-user
  rollout, DNS, Nginx config/reload, firewall change, public Admin exposure,
  channel-lab-b cleanup, legacy query-token retirement, broader artifact
  issuance, or production authority transfer was performed. The next gate is
  operator-device import/refresh validation and observation, then a separate
  retain / rollback / broader rollout decision.
- The exact-approved CLI preproduction subscription issuance is recorded in
  `docs/production-replacement-records/2026-05-28-cli-preproduction-subscription-issuance.md`.
  It created 3 active preproduction tenants and 3 active opaque artifacts bound
  to `channel-lab-b-tuic`, wrote raw handoff material only to a remote 0600
  operator handoff file outside the repository, validated 3/3 artifact
  refreshes with TUIC output, confirmed public health/Admin/no-token behavior
  stayed safe, and found no raw artifact hits in known Nginx/app logs or the
  proxy-gateway candidate journal. No all-user rollout, DNS, Nginx, firewall,
  public Admin, payment activation, legacy query-token retirement, AWS
  mutation, edge traffic, or raw subscription material recording in
  repo/docs/PR/chat was performed. The next gate is operator-side import/use
  validation and 1h/24h/72h observation before increasing quantity.
- Physical control-plane / edge data-plane split.
- Local Linux manual CI is now bootstrapped and validated as an archive-based
  repository validation host. See
  `docs/production-replacement-records/2026-05-26-local-linux-ci-readonly-inventory.md`
  and
  `docs/production-replacement-records/2026-05-26-local-linux-ci-bootstrap-validation.md`.
  It is not staging, not production, and not deploy approval.
- Historical Aliyun state-preserving source copy remains blocked unless the operator
  rejects clean-start and approves a separate source-rescue path. The
  Aliyun candidate-preparation record is
  `docs/production-replacement-records/2026-05-26-aliyun-sub-control-candidate-preparation.md`.
  The latest private state-copy preflight record is
  `docs/production-replacement-records/2026-05-26-aliyun-state-copy-preflight.md`.
  The latest source internal inspection attempt is
  `docs/production-replacement-records/2026-05-26-prod-edge-a-source-internal-state-copy-inspection.md`.
  The Package 5 promotion runbook readiness record is
  `docs/production-replacement-records/2026-05-27-aliyun-promotion-runbook-readiness.md`.
  The latest Gate A live inventory is
  `docs/production-replacement-records/2026-05-27-aliyun-gate-a-live-inventory.md`.
  The latest Gate B source-state and provider-firewall planning record is
  `docs/production-replacement-records/2026-05-27-aliyun-gate-b-source-firewall-plan.md`.
  The latest clean-start control-plane planning record is
  `docs/production-replacement-records/2026-05-27-aliyun-clean-start-control-plane-plan.md`.
  The clean-start private validation and provider-firewall hardening gate
  runbooks are
  `docs/production-replacement-records/2026-05-27-aliyun-clean-start-private-validation-runbook.md`
  and
  `docs/production-replacement-records/2026-05-27-aliyun-provider-firewall-hardening-runbook.md`.
  The latest clean-start private validation execution attempt is
  `docs/production-replacement-records/2026-05-27-aliyun-clean-start-private-validation-execution.md`;
  it passed after candidate runtime refresh and private metadata-only
  validation. The latest provider-firewall hardening execution record is
  `docs/production-replacement-records/2026-05-27-aliyun-provider-firewall-hardening-execution.md`;
  provider-level public 80/443/3456/18080 were closed before promotion. The HP
  management-source follow-up is
  `docs/production-replacement-records/2026-05-27-aliyun-hp-management-source-firewall-execution.md`;
  HP now has scoped provider-firewall access for SSH and the existing wg-home
  UDP lab path, but the wg-home logical handshake did not refresh. A
  public-boundary dry run passed and was cleaned up in
  `docs/production-replacement-records/2026-05-27-aliyun-public-boundary-dry-run-execution.md`.
  The exact-phrase production subscription-distribution promotion is now
  recorded in
  `docs/production-replacement-records/2026-05-27-aliyun-production-subscription-distribution-promotion.md`;
  durable Aliyun 80/443 and `sub.globalcirclecat.com` are active for the
  subscription boundary, public Admin remains blocked, `ss-sg` remains
  unchanged, edge traffic is not activated, and the Aliyun `aegis.service`
  follow-up remains open.
- Clean fallback `sub-control-a` candidate provisioning remains a
  provider-neutral replacement or recovery pattern; state-preserving copy,
  public-boundary work, or promotion still needs separate A-tier approval.
- A2 host-internal read-only inventory is currently incomplete because SSH to
  `prod-edge-a` / `prod-edge-b` closes during key exchange from the current
  operator environment. See
  `docs/production-replacement-records/2026-05-26-sub-control-a-candidate-readonly-preflight.md`.
- `prod-edge-b` carrying-instance replacement, restart, or lifecycle mutation.
- `prod-edge-c` creation or durable third-node recovery work.
- AWS node restart, termination, or security-group cleanup after the accepted
  stop-only cleanup. Restart/rollback, termination, and security-group cleanup
  each require separate A-tier approvals and evidence.
- Legacy blue final termination or security-group cleanup.
- WireGuard install, mesh key generation, UDP security-group changes,
  `wg-quick` start, or live mesh validation.
- DNS, Nginx, HTTPS redirect behavior, systemd, production runtime config,
  tenant state, or SQLite authority changes.

GitHub-hosted Actions must be checked per PR instead of treated as globally
blocked. As of the latest GitHub/mainline closeout, `master` is at `dddd828`,
open PR count is 0, PR #299, PR #302, PR #303, PR #304, PR #305, PR #306, PR
#307, PR #308, and PR #309 are merged, and PR #300 was closed without merge. Use local validation and
`docs/CI_MANUAL_VALIDATION.md` when a clean fallback is actually needed. Manual
CI is not staging, production, or deployment approval.

## Current Work Queue

Use `project-state/tasks.json` as the compact backlog source. The current C/B
simplification queue is closed:

- `C1-doc-context-slimming` - completed in PR #112.
- `C3-validation-baseline-entrypoint` - completed in PR #113.
- `C2-architecture-non-goal-hardening` - completed in PR #114.
- `B1-code-module-inventory` - completed in PR #115.
- `B2-admin-ui-surface-simplification` - completed in PR #115.
- `B5-channel-strategy-engine-mvp` - completed in the Channel Strategy Engine work; default
  subscription rendering now uses the `stable` pool, while explicit operator
  assignment can still emit a single private/canary/recovery node.
- `B6-channel-measurement-scoring` - completed in the Channel Measurement
  Scoring work; local benchmark summaries can be scored into quality tiers,
  channel scores, reason codes, and advisory pools without production mutation.
- `B7-channel-candidate-report` - completed in the Channel Candidate Report
  work; dry-run config summaries and measurement scores can be joined into
  safe grouped operator recommendations without exposing hosts, ports, tokens,
  credentials, or raw errors.
- `B8-channel-decision-pack` - completed in the Channel Decision Pack work;
  dry-run summaries and measurement scores can be packaged into advisory
  baseline/canary/blocker decision artifacts without production mutation.
- `B9-channel-extended-measurement-assessment` - completed in the Channel
  Extended Measurement Assessment work; already-collected local benchmark
  summaries can be classified into ready, needs-more-samples, or hold states
  without running probes, touching edge nodes, or mutating production.
- `B10-channel-measurement-investigation` - completed in the Channel
  Measurement Investigation work; safe measurement bundle reports can be
  classified into sustained latency, isolated spike, reliability, or
  evidence-gap follow-up patterns without running probes, touching edge nodes,
  or mutating production.
- `B11-channel-candidate-comparison` - completed in the Channel Candidate
  Comparison work; safe investigation reports and dry-run config summaries can
  produce advisory next-candidate comparison plans for TUIC or VLESS/XUDP after
  a held Hysteria2 result without running probes, touching edge nodes, or
  mutating production.
- `B18-channel-runtime-registry` - completed in the Channel Runtime Registry
  work; dry-run summaries, measurement scores, and safe runtime inventory
  summaries can now be joined into canary-ready, runtime-blocked, and
  missing-inventory groups without running probes, touching edge nodes,
  deploying runtimes, opening ports, or changing subscription output.
- `B19-channel-runtime-inventory-summary` - completed in the Channel Runtime
  Inventory Summary work; operator-provided runtime gate facts can now be
  normalized into safe registry input artifacts without raw hosts, ports, URLs,
  credentials, raw logs, tokens, subscription URLs, customer data, runtime
  mutation, or production activation.
- `B20-channel-runtime-gate-packet` - completed in the Channel Runtime Gate
  Packet work; runtime registry output can now be turned into an operator-safe
  approval-readiness packet that distinguishes approval-ready, blocked, and
  missing-inventory states without submitting approval phrases, deploying
  runtimes, moving traffic, or changing subscription output.
- `B21-channel-system-decision-flow` - completed in the Channel System Decision
  Flow work; dry-run summary, measurement score, and safe runtime inventory
  input can now be composed into a single advisory system readiness artifact
  without running probes, contacting edge nodes, submitting approval phrases,
  deploying runtimes, moving traffic, or changing subscription output.
- `B22-channel-system-review-api` - completed in the Channel System Review API
  work; the protected Admin platform surface can now accept the same safe
  channel decision inputs and return the redacted system readiness artifact
  without exposing a public route or adding any execution controls.
- `B23-channel-system-review-ui` - completed in the Channel System Review UI
  work; the protected Admin Overview can now submit safe channel decision inputs
  to the protected review API and render flow status, required next action,
  canary readiness, and runtime blockers without exposing approval submission,
  runtime execution, DNS, firewall, traffic, or subscription-output controls.
- `B24-channel-runtime-evidence-bridge` - completed in the Channel Runtime
  Evidence Bridge work; safe runtime evidence packets can now be converted
  into runtime inventory input and full channel system readiness artifacts
  without edge-node contact, runtime mutation, approval submission, traffic
  movement, subscription-output change, or production activation.
- `B25-channel-runtime-evidence-review` - completed in the Channel Runtime
  Evidence Review work; the protected Admin platform route and Admin Overview
  can now accept safe runtime evidence bridge packets and return the normalized
  runtime inventory input plus channel system readiness artifact without public
  routes, execution controls, edge-node contact, runtime mutation, approval
  submission, DNS, firewall, traffic, subscription-output change, or production
  activation.
- `B26-channel-runtime-gate-workbench` - completed in the Channel Runtime Gate
  Workbench work; the protected Admin platform route and Admin Overview can now
  convert safe runtime bridge packets into gate-facing advisory status,
  approval-readiness metadata, candidate counts, and grouped candidates without
  public routes, approval submission, approval-phrase echo, runtime execution,
  edge-node contact, DNS, firewall, traffic movement, subscription-output
  change, or production activation.
- `B27-channel-runtime-execution-handoff` - completed in the Channel Runtime
  Execution Handoff work; the protected Admin platform route and Admin Overview
  can now convert safe runtime bridge packets into an operator-safe handoff
  packet for a future A-tier runtime canary approval request. The packet marks
  execution authority as `not_granted`, records the source runbook, candidate
  counts, grouped candidates, and preflight/validation/rollback checklist keys,
  and does not expose public routes, approval submission, approval text,
  runtime execution, edge-node contact, DNS, firewall, traffic movement,
  subscription-output change, or production activation.
- `B31-channel-subscription-output-draft` - completed in the Channel
  Subscription Output Draft work; the protected Admin platform route and Admin
  Overview can now convert safe runtime bridge packets into summary-only
  baseline/canary/private/blocked pools for subscription-output planning. The
  packet keeps YAML generation disabled, real subscription output unchanged,
  activation not approved, no approval submission route, no execution route,
  no edge-node contact, no runtime mutation, no traffic movement, and no
  production activation.
- `B32-channel-subscription-activation-readiness` - completed in the Channel
  Subscription Activation Readiness work; the protected Admin platform route
  and Admin Overview can now convert safe runtime bridge packets into an
  advisory subscription-output activation readiness gate. The packet marks
  execution authority as `not_granted`, references the A-tier runtime canary
  runbook, keeps approval text out of the output, exposes no approval
  submission or execution route, generates no YAML, mutates no real
  subscription output, contacts no edge nodes, deploys no runtime, moves no
  traffic, and performs no production activation.
- `B33-channel-subscription-activation-handoff` - completed in the Channel
  Subscription Activation Handoff work; the protected Admin platform route and
  Admin Overview can now convert safe runtime bridge packets into an
  operator-safe A-tier handoff packet for a future subscription-output
  activation request. The packet marks execution authority as `not_granted`,
  carries preflight/validation/rollback checklist keys, keeps approval text out
  of the output, exposes no approval submission or subscription-output
  execution route, generates no YAML, mutates no real subscription output,
  contacts no edge nodes, deploys no runtime, moves no traffic, and performs
  no production activation.
- `B34-channel-subscription-activation-flow` - completed in the Channel
  Subscription Activation Flow work; the protected Admin platform route and
  Admin Overview can now link subscription-output draft, activation readiness,
  and activation handoff into one end-to-end review packet. The flow marks
  execution authority as `not_granted`, keeps approval text out of the output,
  exposes no approval submission or subscription-output execution route,
  generates no YAML, mutates no real subscription output, contacts no edge
  nodes, deploys no runtime, moves no traffic, and performs no production
  activation.
- `B35-channel-subscription-activation-flow-fixture` - completed in the
  Channel Subscription Activation Flow Fixture work; repository-local helpers
  and CLI scripts can now save and replay safe activation-flow packets for
  evidence handoff. The fixture rejects raw hosts, ports, URLs, credentials,
  raw logs, tokens, subscription URLs, YAML, approval phrases, and unsupported
  metadata; replay remains advisory and does not generate YAML, submit
  approvals, expose execution routes, change subscription output, contact edge
  nodes, deploy runtime, move traffic, or activate production.
- `B36-channel-subscription-activation-record-template` - completed in the
  Channel Subscription Activation Record Template work; repository-local
  helpers and CLI scripts can now turn a safe activation-flow fixture into a
  Markdown execution-record skeleton for later exact-approved A-tier work. The
  template contains TODO sections for approval reference, preflight,
  activation, validation, rollback, and not-performed evidence; it does not
  store approval text, generate YAML, submit approvals, expose execution
  routes, change subscription output, contact edge nodes, deploy runtime, move
  traffic, or activate production.
- `B37-channel-subscription-activation-record-template-api` - completed in the
  Channel Subscription Activation Record Template API work; the protected Admin
  platform route can now turn a safe activation-flow fixture into the same
  Markdown execution-record skeleton for operator review. The route accepts
  safe fixture input only, returns safety metadata, and does not expose approval
  submission, execution controls, YAML generation, subscription-output
  mutation, edge-node contact, runtime deployment, traffic movement, or
  production activation.
- `B38-channel-subscription-activation-record-template-ui` - completed in the
  Channel Subscription Activation Record Template UI work; Admin Overview can
  now submit a safe activation-flow fixture to the protected record-template
  route and render the suggested execution-record path, skeleton title,
  Markdown preview, readiness state, and no-mutation safety flags. The panel is
  review-only and does not expose approval submission, execution controls, YAML
  generation, subscription-output mutation, edge-node contact, runtime
  deployment, traffic movement, or production activation.
- `B39-channel-subscription-render-proof` - completed in the Channel
  Subscription Render Proof work; repository-local helpers and CLI scripts can
  now match a safe activation-flow fixture against a local proxy config,
  internally render the selected Clash/Mihomo output, and return only a safe
  proof summary. This closes a repo-side integration check between activation
  evidence and the subscription renderer without returning YAML, exposing
  hosts/ports/credentials/tokens, changing subscription output, contacting
  edge nodes, deploying runtime, moving traffic, or activating production.
- `B40-channel-subscription-activation-package` - completed in the Channel
  Subscription Activation Package work; repository-local helpers and CLI
  scripts can now combine a safe activation-flow fixture, render proof against
  local proxy config, and execution-record template readiness into one safe
  subscription-output activation request package. The package does not return
  YAML or record Markdown and does not submit approval, expose execution
  controls, change subscription output, contact edge nodes, deploy runtime,
  move traffic, or activate production.
- `B41-channel-subscription-activation-package-api` - completed in the Channel
  Subscription Activation Package API work; the protected Admin platform route
  can now build the same safe activation package from a submitted
  activation-flow fixture and the current runtime `proxyConfig`. The route is
  review-only and does not expose public access, return YAML or record
  Markdown, submit approval, expose execution controls, change subscription
  output, contact edge nodes, deploy runtime, move traffic, or activate
  production.
- `B42-channel-subscription-activation-package-ui` - completed in the Channel
  Subscription Activation Package UI work; Admin Overview can now submit safe
  activation-flow fixtures to the protected package route and render package
  status, render-proof readiness, record-template readiness, approval-request
  readiness, protocol counts, and no-mutation safety flags. The panel is
  review-only and does not display YAML, record Markdown, raw hosts, raw ports,
  raw URLs, credentials, approval phrases, execution controls, subscription
  output mutation, edge-node contact, runtime deployment, traffic movement, or
  production activation.
- `B44-channel-production-module` - completed in the Channel Production Module
  work; repository-local helpers and CLI scripts can now combine a safe
  subscription activation package with a redacted operator-device canary summary
  into production-module branch review metadata. The module can mark a clean
  TUIC short canary as ready for production-module branch review, but it still
  sets production activation authority to not granted and does not return YAML,
  expose hosts/ports/URLs/credentials/tokens, submit approvals, change
  subscription output, contact edge nodes, deploy runtime, move traffic, or
  activate production.
- `B28-channel-lab-target-decision` - completed in the Channel Lab Target
  Decision work; the protected Admin platform route and Admin Overview can now
  convert safe target inventory packets into an advisory next target gate after
  a blocked runtime inventory. The packet chooses between a fresh
  `channel-lab-b` selection gate, a separate `channel-lab-a`
  access/port/cleanup gate, or the normal Risk A runtime canary approval gate
  without public routes, edge-node contact, server creation, runtime mutation,
  approval submission, approval text, DNS, firewall, traffic movement,
  subscription-output change, or production activation.
- `C4-tuic-comparison-canary-plan` - completed in the TUIC Comparison Canary
  Plan work; TUIC is now the documented next measured channel candidate after
  the held Hysteria2 extended measurement, while VLESS/XUDP remains the
  secondary comparison candidate. Runtime inventory, deployment, measurement,
  and cleanup remain A-tier.

The remaining queued items are A-tier and remain blocked:

- `A1-legacy-query-token-retirement`
- `A2-physical-control-edge-split`

For A2, use `docs/VULTR_JAPAN_CONTROL_DATA_PLANE_STATUS.md` and the current
single-control-plane / multi-data-plane records before selecting a new gate.
Do not start either A-tier item without a specific runbook, read-only
inventory, operator approval, validation plan, and rollback evidence.

Latest local Linux CI candidate inventory:

- `docs/production-replacement-records/2026-05-26-local-linux-ci-readonly-inventory.md`
- `docs/production-replacement-records/2026-05-26-local-linux-ci-bootstrap-validation.md`
- `hp-server` is reachable through the approved local SSH key.
- Node.js `v22.22.3` and npm `10.9.8` are available through a user-local
  toolchain under `~/.local/ci-node/`.
- Archive-based manual CI passed for commit
  `4dacd1edf0b179cea38654de4cda2fd845c6d922`: `npm ci`,
  `npm ci --prefix admin`, `npm test` 180/180, `npm run admin:test` 25/25,
  and `npm run admin:build`.
- Per-run workspace, archive, npm cache, GitHub config, and git credentials
  were cleaned after validation.
- Aliyun CI cleanup has been completed; HP is now the manual CI lane.
- HP manual CI is split into `ci-smoke`, `ci-full`, and `ci-visual`; not every
  PR should trigger every lane.

Latest Aliyun CI cleanup / subscription-control candidate inventory:

- `docs/production-replacement-records/2026-05-26-aliyun-ci-cleanup-inventory.md`
- `docs/production-replacement-records/2026-05-26-aliyun-ci-cleanup.md`
- `docs/production-replacement-records/2026-05-26-aliyun-sub-control-candidate-preparation.md`
- `docs/production-replacement-records/2026-05-26-aliyun-state-copy-preflight.md`
- `docs/production-replacement-records/2026-05-26-prod-edge-a-source-internal-state-copy-inspection.md`
- `docs/production-replacement-records/2026-05-26-singapore-prod-edge-stop.md`
- `docs/production-replacement-records/2026-05-27-aliyun-promotion-runbook-readiness.md`
- `docs/production-replacement-records/2026-05-27-aliyun-gate-a-live-inventory.md`
- `docs/production-replacement-records/2026-05-27-aliyun-gate-b-source-firewall-plan.md`
- `docs/production-replacement-records/2026-05-27-aliyun-clean-start-control-plane-plan.md`
- `docs/production-replacement-records/2026-05-27-aliyun-clean-start-private-validation-runbook.md`
- `docs/production-replacement-records/2026-05-27-aliyun-provider-firewall-hardening-runbook.md`
- The 2026-05-26 Aliyun SWAS inventory recorded SSH access through alias
  `miyao`.
- It is running Ubuntu 24.04.2 with Node.js `v22.22.2`, npm `10.9.7`, git
  `2.43.0`, 2 CPU, about 2 GiB memory, and 40 GiB disk.
- No active manual-CI workspace, repository archive, GitHub CLI config, or git
  credential file was found in the read-only scan.
- The cleanup removed only `/root/.npm`, `/root/.cache`, and any matching
  `/tmp/proxy-gateway-ci-*.tar` archives; the post-cleanup recheck found CI
  workspace, GitHub CLI config, git credentials, npm/cache residue, and CI
  archives absent.
- The Aliyun proxy-gateway runtime remains private on app port 3456, while
  Nginx now exposes only the approved public subscription boundary on 80/443
  for `sub.globalcirclecat.com`.
- WireGuard `wg-home` is active on UDP 51820 and must be explicitly accepted,
  scoped, or removed during any future production hardening.
- UFW is active with default deny incoming / allow outgoing; OpenSSH, existing
  `wg-home` UDP 51820, and approved public 80/443 are allowed inbound.
- The candidate app listens on `127.0.0.1:3456`; private Nginx still has a
  loopback path, and public Nginx now serves the approved subscription boundary
  on 80/443. No edge proxy listener was opened.
- Post-promotion validation found public 80/443 serving only the approved
  subscription boundary, while public 3456 and 18080 remain closed or timed
  out.
- The promotion mutated only the approved Aliyun public subscription boundary
  and `sub.globalcirclecat.com` DNS record. No `ss-sg` change, edge traffic,
  AWS, public Admin, WireGuard, historical state copy, customer data copy, or
  unrelated node mutation was performed.
- Aliyun private state-copy preflight confirms candidate app health, loopback
  Nginx health, UFW deny-incoming posture, and candidate SQLite
  `integrity_check: ok`.
- The same preflight historically confirmed AliDNS still pointed
  `sub.globalcirclecat.com` and `ss-sg.globalcirclecat.com` to
  `13.215.156.159`, and HP-side public checks did not observe Aliyun candidate
  public exposure on 80/443/3456/18080 before promotion.
- Private state-copy validation is still blocked because prod-edge-a source
  internal SSH inspection timed out during banner exchange; source SQLite
  integrity and fresh source backup are not yet verified.
- Follow-up source internal inspection confirmed prod-edge-a EC2 health and
  production public endpoint health, but SSM inventory is empty and SSH TCP/22
  closes before banner/auth. Source command execution remains blocked.
- Aliyun Gate A live inventory on 2026-05-27 found the candidate app and
  loopback Nginx healthy, candidate SQLite `integrity_check: ok`, HP-side
  public checks still not observing Aliyun 80/443/3456/18080 exposure, and
  AliDNS still pointing subscription domains to the stopped AWS address. It
  also found Aliyun provider firewall rules remain too broad, including public
  allow rules for 80/443 and broad TCP/UDP ranges, while host UFW currently
  blocks most public paths except SSH and the existing wg-home lab UDP path.
  This is now historical pre-promotion evidence.
- Aliyun Gate B source-state planning now recommends a clean-start Aliyun
  control plane unless the operator explicitly requires historical subscription
  state preservation. If historical state is required, prefer a separate
  source-state rescue planning path before relying on SSH-first remediation; if
  temporary service restoration is required, use a separately approved recovery
  path because the former prod-edge-a/prod-edge-b carrying instances were
  terminated. Provider-firewall hardening remains a separate prerequisite before
  any public-boundary dry run.
- Aliyun clean-start control-plane planning now makes clean-start the active
  default for the next repo-only package. New accounts, entitlements,
  subscription-access grants, opaque artifacts, and Subscription V2 outputs
  should be issued from Aliyun clean-start authority after private validation.
  Historical AWS state copy is no longer the default dependency for the MVP,
  but remains available only through a separate state-preserving source rescue
  path if the operator later requires continuity.
- Clean-start private validation, provider-firewall hardening, HP
  management-source follow-up, public-boundary dry run, and production
  subscription-distribution promotion now each have execution records. The
  latest promotion record proves `sub.globalcirclecat.com` on Aliyun, public
  Admin blocked, no-token subscription rejection, one authorized smoke refresh,
  disabled smoke state, and unchanged edge DNS. A read-only observation/Aegis
  follow-up then confirmed stable public samples and narrowed Aegis to a failed
  systemd unit with Aegis processes still present. The optional Aegis repair
  gate was later approved and attempted, but it failed safely and left broader
  vendor-agent repair unapproved. The remaining work is clean edge rebuild
  execution approval, rollback-start decisions, broader artifact issuance, and
  legacy query-token retirement. The clean edge rebuild runbook, execution
  template, read-only preflight, and execution handoff now exist, but no clean
  edge host has been provisioned, bootstrapped, or activated. The opaque
  artifact issuance and legacy
  query-token retirement runbook now exists and deliberately separates artifact
  issuance from legacy-token retirement; neither gate has been executed.

Historical Aliyun user-management / subscription-distribution decision:

- `docs/ALIYUN_USER_SUBSCRIPTION_DISTRIBUTION_RUNBOOK.md`
- Superseded target: Aliyun was formerly planned as the user-management and
  subscription-distribution platform. The current production direction is
  Vultr Japan control plane plus Vultr Japan/Singapore data-plane capacity.
- The separate technical MVP branch is PR #129,
  `codex/local-edge-channel-probe-harness`; it owns local edge channel probe,
  benchmark, and manager work and must not be coupled to Aliyun production
  authority without a later integration gate.
- On 2026-05-26, the operator approved stopping AWS Singapore `prod-edge-a` and
  `prod-edge-b` with accepted service outage. On 2026-05-29, both instances
  were permanently terminated and their security groups were deleted under a
  separate exact approval.
- Authoritative AliDNS now points `sub.globalcirclecat.com` to the Aliyun
  subscription boundary and leaves `ss-sg.globalcirclecat.com` on the old AWS
  stopped address because edge traffic activation was not approved.
- Latest cleanup preflight:
  `docs/production-replacement-records/2026-05-26-non-aliyun-node-cleanup-preflight.md`.
- The tracked static node config still references `prod-edge-a` and
  `prod-edge-b`, so subscription output/config must be rebuilt before edge
  delivery can be considered healthy again.
- The next executable gates are separate A-tier approvals for Aliyun
  `aegis.service` repair if desired, clean edge node rebuild execution,
  a new recovery path if temporary edge restore is needed, broader artifact
  issuance, or legacy query-token retirement. Aegis repair
  must use the exact approval phrase from
  `docs/production-replacement-records/2026-05-27-aliyun-aegis-service-repair-runbook.md`;
  clean edge rebuild must use the exact approval phrase from
  `docs/production-replacement-records/2026-05-27-clean-edge-node-rebuild-runbook.md`;
  the latest read-only live check before execution is
  `docs/production-replacement-records/2026-05-27-post-226-clean-edge-live-check.md`;
  safe readiness facts can be normalized with
  `npm run platform:clean-edge-readiness-summary -- <safe.json>` but that
  helper is not live inventory or execution authority;
  opaque artifact issuance and legacy query-token retirement must use their
  separate exact approval phrases from
  `docs/production-replacement-records/2026-05-27-opaque-artifact-issuance-and-legacy-token-retirement-runbook.md`.
  Short confirmations such as `同意` do not authorize any of those gates.

Latest A2 preflight:

- `docs/production-replacement-records/2026-05-26-sub-control-a-candidate-readonly-preflight.md`
- External AWS, DNS, public-boundary, and edge-port checks were healthy.
- Host-internal service / SQLite / backup / journal checks are blocked until
  an approved internal inspection path exists. The latest source inspection
  attempt confirmed the path is still blocked before SSH banner/auth and SSM is
  unavailable.
- Clean `sub-control-a` candidate provisioning is not approved. The clean
  new-server control-plane path is now a fallback if the Aliyun candidate path
  is rejected by inventory or cleanup gates.

## Current Validation Baseline

Use `docs/VALIDATION_BASELINE.md` as the active validation command matrix.

Short version:

- C docs-only: `git diff --check origin/master...HEAD`
- Project-state JSON: `npm run project-state:check` plus diff check
- Server/shared code: `npm test` plus diff check
- Admin UI: `npm run admin:test`, `npm run admin:build`, `npm test`, and diff
  check
- Manual CI lanes: `ci-smoke`, `ci-full`, and `ci-visual` are selected per
  `docs/CI_MANUAL_VALIDATION.md`; the Codex skill maps to `ci-full`
- A-tier work: runbook-specific validation only; there is no generic shortcut

Latest PR #111 validation before merge:

- `npm run project-state:check` passed.
- `npm test` passed with 175/175 tests.
- `git diff --check origin/master...HEAD` passed.

## Local Run And Admin Access

Local server:

```powershell
npm run server
```

Admin UI:

```powershell
npm run admin:dev
```

Use local dev against a local backend unless an A-tier runbook explicitly
approves private production observation. The former prod-edge-a SSH tunnel is
not a current access path because the Singapore prod-edge-a/prod-edge-b
carrying instances were terminated.

For local Vite dev proxy, use:

```text
API base URL: leave blank in Vite dev mode so same-origin /api requests use the dev proxy
Console token: local or explicitly approved target CONSOLE_TOKEN from the target .env location
```

Do not set the browser UI API base URL directly to `http://127.0.0.1:3456`
unless the target backend sends CORS headers. The production backend does not
currently expose browser CORS, so Vite dev proxy is the intended local testing
path.

## Connectivity Notes

If AWS, Aliyun, GitHub, or other CLI commands fail because local proxy
environment variables point to a dead local listener, clear proxy variables for
the current process first:

```powershell
Remove-Item Env:HTTP_PROXY,Env:HTTPS_PROXY,Env:ALL_PROXY,Env:http_proxy,Env:https_proxy,Env:all_proxy -ErrorAction SilentlyContinue
```

Safe AWS refresh pattern:

```powershell
$env:HTTP_PROXY=$null; $env:HTTPS_PROXY=$null; $env:ALL_PROXY=$null
$env:http_proxy=$null; $env:https_proxy=$null; $env:all_proxy=$null
aws ec2 describe-instances --region ap-southeast-1 --filters Name=ip-address,Values=13.215.156.159 --query "Reservations[].Instances[].{InstanceId:InstanceId,State:State.Name,PublicIp:PublicIpAddress,Type:InstanceType,LaunchTime:LaunchTime,Name:Tags[?Key=='Name']|[0].Value,Purpose:Tags[?Key=='Purpose']|[0].Value,Project:Tags[?Key=='Project']|[0].Value,SecurityGroups:SecurityGroups[*].GroupId}" --output table
```

The `13.215.156.159` query is now historical AWS verification only; do not
treat that address as an active backend.

Safe AliDNS refresh pattern:

```powershell
$env:HTTP_PROXY=$null; $env:HTTPS_PROXY=$null; $env:ALL_PROXY=$null
$env:http_proxy=$null; $env:https_proxy=$null; $env:all_proxy=$null
aliyun alidns DescribeDomainRecords --DomainName globalcirclecat.com --RRKeyWord sub --PageSize 10
```

## Documentation Navigation

Use `docs/README.md` as the full docs index. It classifies current state docs,
active runbooks, production safety records, execution records, paused docs, and
historical specs/plans.

High-value entrypoints:

- `AGENTS.md` - workflow rules and A/B/C risk gates.
- `docs/PROJECT_OPERATING_MODEL.md` - source-of-truth layers and work lanes.
- `docs/PROJECT_SIMPLIFICATION_MAP.md` - cleanup map and complexity hotspots.
- `docs/MASTER_ARCHIVE_BOUNDARY.md` - `master` versus archive boundary for
  current source, historical evidence, runtime state, and release manifests.
- `docs/LIGHTWEIGHT_OPERATING_DEV_ENVIRONMENT.md` - minimal local
  operator/developer environment, safe CLI preview, validation, production
  observation, and release-mode boundary.
- `docs/SERVER_PROJECT_IMPORT_BOUNDARY.md` - redacted live-server project import
  boundary before deeper code/function refactoring.
- `docs/PROJECT_CONTROL_PLANE.md` - structured project-state model.
- `docs/VALIDATION_BASELINE.md` - current validation command matrix.
- `project-state/current.json` - compact current-state snapshot.
- `project-state/lanes.json` - active lane index and risk boundaries.
- `project-state/tasks.json` - active backlog.
- `docs/NETWORK_FORWARDING.md` - local/proxy/Admin/runtime forwarding model.
- `docs/ENVIRONMENT_TOPOLOGY.md` - repo, GitHub, branch, and AWS role map.
- `docs/DEPLOYMENT_FLOW.md` - deployment, staging, promotion, rollback flow.
- `docs/CI_MANUAL_VALIDATION.md` - manual validation host workflow.
- `docs/ALIYUN_CONTROL_LOCAL_CI_REBUILD_PLAN.md` - historical Aliyun/local-CI
  split and node-retirement plan.
- `docs/SUBSCRIPTION_CONTROL_PLANE_NEW_SERVER_RUNBOOK.md` - clean
  `sub-control-a` candidate fallback gates for the future physical split.

Detailed production and incident history remains in:

- `docs/production-replacement-records/*.md`
- `docs/production-incident-records/*.md`
- `docs/domain-implementation-records/*.md`
- `docs/server-edge-mesh-records/*.md`

Do not copy full historical execution details back into this handoff unless
they change current state, blockers, or required next actions.

## Historical Baseline

Historical feature and operations context is still useful but should not bloat
the current handoff:

- `v0.1.0-mvp` introduced SQLite-backed subscription tenants, hashed tokens,
  Admin subscription APIs, and tenant-token subscription fetch.
- Subscription hardening introduced temporary links, token rotation, `/sub`
  rate limiting, Admin public blocking, public console UI blocking, and token
  redaction guidance.
- Admin UI work connected the frontend to real `/api/admin/*` endpoints through
  Bearer auth and same-origin Vite dev proxy use.
- Subscription architecture refactor introduced `SubscriptionCore`, store
  contracts, compatibility exports, serializer/validation separation, and
  platform integration boundaries.
- Environment foundation added systemd templates, Nginx gateway template,
  SQLite backup/restore scripts, `.env.example` expansion, and ops docs.

For detailed historical specs/plans, use `docs/archive/superpowers/README.md`
and the corresponding files under `docs/archive/superpowers/`.

## Guardrails

- Do not commit secrets, subscription URLs with real tokens, `.proxy-gateway/`,
  AWS/SS credential material, SQLite data, or customer data.
- Do not rely on ignored `.proxy-gateway/aws-singapore/` status files without
  live verification.
- Do not change domain DNS, HTTPS redirect behavior, production base URL,
  opaque artifact exposure, legacy subscription access, production nodes,
  Nginx, systemd, security groups, or tenants unless the user explicitly asks
  and the work follows the relevant A-tier gate.
- Do not expose the Admin UI through the public gateway.
- Do not remove Nginx from the gateway path while hardening public access.
- When changing auth, rate limits, logs, subscription output, tenant behavior,
  or route boundaries, add focused tests and run the relevant validation.
