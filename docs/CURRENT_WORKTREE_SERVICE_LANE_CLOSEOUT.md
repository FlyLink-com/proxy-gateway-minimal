# Current Worktree Service-Lane Closeout

Last updated: 2026-06-09, America/Los_Angeles.

> Status:
> - Type: Active closeout plan
> - Risk: C for this document; B/A for the future code, runtime, or production
>   actions it references
> - Execution authority: Does not authorize code changes, Git staging/commit,
>   production deploy, DNS, Nginx, systemd, firewall, runtime config, schema
>   migration, account/password generation, subscription issuance, secrets,
>   tokens, subscription URL output, SQLite row dumps, or customer-data actions
> - Source of truth for: How to finish the current `feat/install-config-wizard`
>   closeout branch and split remaining service-lane work into reviewable units

## Current Snapshot

Point-in-time GitHub/mainline closeout snapshot after PR #312:

```text
branch: master
upstream: origin/master
working tree: clean at closeout
current PR: none
PR state: open PR count 0; PR #299, #302, #303, #304, #305, #306, #307, #308,
  #309, #310, #311, and #312 merged
```

This closeout record is now historical. The latest GitHub/mainline closeout
has advanced `master` to `2517673`, open PR count 0, with PR #299, PR #302,
PR #303, PR #304, PR #305, PR #306, PR #307, PR #308, PR #309, PR #310,
PR #311, and PR #312 merged. Follow-up work should start from a clean `master`
worktree and use new focused branches for docs repair, usage accounting, quota
gates, channel quality tuning, or production-gate preparation.

## Split Units

### Unit 0: Generated Noise And Source Boundary

Purpose:
- Keep generated or local-only artifacts out of merge candidates.
- Preserve real source edits without reverting user work.

Current execution note:
- 2026-06-09: `.tmp-node/` and `test-results/` were confirmed untracked and
  moved to
  `D:\Projects\proxy-gateway-minimal-local-artifacts\worktree-cleanup-20260609-121442`.
  `.gitignore` and `docs/CURRENT_SOURCE_AND_ARCHIVE_BOUNDARY.md` now list both
  generated paths.

Files / areas:
- `.tmp-node/`
- `test-results/`
- `.gitignore`
- `docs/CURRENT_SOURCE_AND_ARCHIVE_BOUNDARY.md`
- archive README updates

Validation:
- `git status --short`
- `git diff --check -- .gitignore docs/CURRENT_SOURCE_AND_ARCHIVE_BOUNDARY.md`

Expected outcome:
- Generated folders ignored, moved, or deliberately left untracked.
- No source edits reverted.

### Unit 1: Docs And Project-State Closeout

Purpose:
- Make the current architecture readable before merging code.
- Keep master/archive boundaries and branch/service status explicit.

Current execution note:
- 2026-06-09: Unit 1 started by aligning root README current-channel wording,
  generated-artifact lists, `project-state` source docs, lane docs, and the
  machine-readable C9 closeout task with this plan.
- 2026-06-09: Unit 1 validation passed:
  `npm run project-state:check`; `git diff --check -- README.md README_EN.md
  docs project-state` passed with CRLF warnings only; untracked active docs
  passed a separate trailing-whitespace scan.

Files / areas:
- `README.md`
- `README_EN.md`
- `docs/README.md`
- `docs/PROJECT_CONTEXT.md`
- `docs/BRANCH_AND_SERVICE_OPERATING_MODEL.md`
- `docs/SINGLE_CONTROL_PLANE_MULTI_DATA_PLANE_PLAN.md`
- `docs/CHANNEL_PROTOCOL_TUNING_PLAN.md`
- `docs/production-replacement-records/*`
- `docs/superpowers/plans/*`
- `project-state/*.json`

Validation:
- `git diff --check -- README.md README_EN.md docs project-state`
- `npm run project-state:check`

Expected outcome:
- A C-tier docs/state PR can land before or alongside code, provided it does
  not claim unvalidated runtime facts.

### Unit 2: Admin And Operator UI

Purpose:
- Merge the local Admin shell, navigation, dashboard, order-management, and
  usage-monitor UI as one reviewable surface.

Files / areas:
- `admin/src/App.tsx`
- `admin/src/app/navigation.ts`
- `admin/src/components/layout/*`
- `admin/src/pages/admin-setup-page.tsx`
- `admin/src/pages/dashboard-page.tsx`
- `admin/src/pages/portal-requests-page.tsx`
- `admin/src/pages/subscription-usage-monitor-page.tsx`
- `admin/src/styles.css`
- `admin/src/test/admin-dashboard.test.tsx`
- `admin/src/test/navigation.test.ts`
- `admin/src/test/portal-requests-page.test.tsx`
- `admin/src/test/subscription-usage-monitor.test.tsx`

Validation:
- `npm run admin:test`
- `npm run admin:build`
- `npm test`

Expected outcome:
- Admin local/SSH-only operator panel remains protected.
- Usage monitor UI must distinguish platform/channel usage from per-order
  account ownership.

Current execution note:
- Confirmed this unit is scoped to the local Admin shell, navigation,
  operations dashboard, product order management, and subscription usage
  monitor UI. It does not include public Admin exposure or production routing.
- Focused validation passed:
  `npm run test --prefix admin -- admin-dashboard.test.tsx navigation.test.ts portal-requests-page.test.tsx subscription-usage-monitor.test.tsx`
  with 15 passing tests.
- Full UI validation in this closeout pass also passed: `npm run admin:test`
  with 139 passing tests and `npm run admin:build`.
- Server contract validation in this closeout pass also passed: `npm test` with
  711 passing tests.
- 2026-06-09: The usage monitor UI now renders every issued channel for an
  order as redacted channel chips instead of collapsing ownership to a single
  `nodeId`. The corresponding Admin fixture remains fail-soft for older
  payloads and does not expose edge credential refs or subscription material.

### Unit 3: User Portal Order Lifecycle UI

Purpose:
- Keep customer order creation, refresh, status, and portal auth surfaces tied
  to the control-plane order model.

Files / areas:
- `admin/src/features/user-portal/user-portal-client.ts`
- `admin/src/features/user-portal/user-portal-page.tsx`
- `admin/src/features/subscriptions/api-client.ts`
- `admin/src/features/subscriptions/types.ts`
- `admin/src/test/subscriptions.test.ts`
- `admin/src/test/user-portal.test.tsx`

Validation:
- `npm run admin:test`
- `npm run admin:build`
- `npm test`

Expected outcome:
- Portal preview/local behavior remains clearly separated from production HTTP
  behavior.
- Order creation must not depend on node-local maps.

Current execution note:
- Confirmed this unit is scoped to the customer-facing portal client/page and
  subscription API type surface, including order creation, refresh, disable,
  login, authenticator setup, passkey preview handling, and HTTP session
  headers.
- Focused validation passed:
  `npm run test --prefix admin -- user-portal.test.tsx subscriptions.test.ts`
  with 100 passing tests.
- Full UI validation passed: `npm run admin:test` with 139 passing tests and
  `npm run admin:build`.
- Server contract validation passed after UI checks: `npm test` with 711 passing
  tests.

### Unit 4: Control Plane Order, Credential, And Usage Ledger

Purpose:
- Merge durable order, credential lifecycle, usage ledger, quota gate, and Admin
  monitor API behavior as one backend unit.

Current execution note:
- 2026-06-09: Unit 4 targeted backend validation passed:
  `node --test server/tests/platform-portal-access-requests.test.mjs
  server/tests/platform-subscription-control-db.test.mjs
  server/tests/platform-traffic-accounting.test.mjs
  server/tests/platform-usage-quota-lifecycle-gate.test.mjs
  server/tests/platform-subscription-usage-monitor.test.mjs
  server/tests/platform-issue-subscription-cli.test.mjs
  server/tests/user-portal-routes.test.mjs` completed with 61 passing tests.
  Full `npm test` completed with 711 passing server tests.
- 2026-06-09: Unit 4 repo-only debt closure added order/channel ownership to
  the Admin usage-monitor contract. Multi-channel orders now report
  `issuedChannels` even before live runtime usage has been collected, aggregate
  channel counts include every issued channel, and filtering can match any
  issued channel without returning raw edge credential refs or secret material.
  Focused validation passed:
  `node --test server\tests\platform-subscription-usage-monitor.test.mjs` with
  4 passing tests. Full `npm test` completed with 711 passing server tests.

Files / areas:
- `server/app.mjs`
- `server/routes/admin-platform.mjs`
- `server/services/platform/portal-access-requests.mjs`
- `server/services/platform/subscription-control-db.mjs`
- `server/services/platform/order-usage-quota-lifecycle-gate.mjs`
- `server/services/platform/runtime-usage-accounting.mjs`
- `server/services/platform/subscription-usage-monitor.mjs`
- `server/tests/platform-*.test.mjs`
- `server/tests/user-portal-routes.test.mjs`

Validation:
- targeted platform tests
- `npm test`

Expected outcome:
- Accounts, sessions, orders, credentials, subscription artifacts, and usage
  rollups remain owned by the control-plane store.
- Unknown or aggregate-only usage is not shown as per-order customer usage.

### Unit 5: Edge Runtime Adapters And Subscription Rendering

Purpose:
- Merge data-plane runtime adapter support and subscription render policy
  separately from UI and business-ledger work.

Files / areas:
- `config/proxy-servers.json`
- `config/proxy-servers.vultr-multichannel.template.json`
- `server/services/config.mjs`
- `server/services/clash-subscription.mjs`
- `server/services/subscriptions/core.mjs`
- `server/services/subscriptions/channel-policy.mjs`
- `server/services/subscriptions/node-registry.mjs`
- `server/services/edge/*`
- `server/state.mjs`
- `server/tests/*edge*.test.mjs`
- `server/tests/subscription-*.test.mjs`
- `server/tests/config.test.mjs`
- `server/tests/vultr-tuic-template.test.mjs`

Validation:
- targeted edge/subscription/config tests
- `npm test`

Expected outcome:
- Runtime adapters are data-plane tools only.
- Subscription rendering comes from the order/credential ledger, not ad hoc
  maps.
- Any runtime deploy, service restart, firewall, Nginx, or DNS change remains a
  separate Risk A gate.

Current execution note:
- Confirmed this unit is scoped to the multichannel Vultr/SGP subscription
  bundle, config/template loading, runtime adapters, remote data-plane handoff,
  and subscription render tests.
- Targeted validation passed:
  `node --test server/tests/config.test.mjs server/tests/clash-subscription.test.mjs server/tests/subscription-service.test.mjs server/tests/subscription-channel-policy.test.mjs server/tests/subscription-node-registry.test.mjs server/tests/state.test.mjs server/tests/edge-credential-reconciliation-gateway.test.mjs server/tests/edge-order-credential-lifecycle.test.mjs server/tests/edge-order-credential-issuer.test.mjs server/tests/edge-vless-hy2-runtime-adapters.test.mjs server/tests/edge-sing-box-ss-runtime-adapter.test.mjs server/tests/edge-mihomo-tuic-host-runtime-adapter.test.mjs server/tests/vultr-tuic-template.test.mjs`
  with 139 passing tests.
- This unit remains repo-only. Production runtime apply, provider firewall,
  Nginx, DNS, and service restart work stays outside this closeout unit.
- 2026-06-09: Unit 5 repo-only debt closure added a protected remote
  data-plane handoff queue service and Admin API. The queue lists pending
  handoff files as safe summaries, refuses unsafe/mutating payload shapes, and
  archives only explicitly selected reviewed handoffs. It does not apply
  runtime config or expose raw credentials, subscription URLs, tokens, raw
  config, raw logs, environment values, or SQLite rows. Focused validation
  passed: `node --test server\tests\data-plane-handoff-queue.test.mjs` with
  3 passing tests.

### Unit 6: CLI And Project Handoff Helpers

Purpose:
- Keep CLI/router and handoff summary helper changes reviewable after the
  backend model is stable.

Files / areas:
- `server/services/cli/router.mjs`
- `scripts/project-handoff-brief.mjs`
- `server/tests/cli-router.test.mjs`
- `server/tests/project-handoff-brief.test.mjs`
- `package.json`
- `package-lock.json`

Validation:
- targeted CLI/helper tests
- `npm test`

Expected outcome:
- CLI behavior reflects the same control-plane/data-plane boundaries.
- Handoff output stays redacted and does not output secrets, tokens,
  subscription URLs, account credentials, raw logs, or SQLite rows.

Current execution note:
- Scope was verified against the CLI router, the project handoff helper, package
  script metadata, and their focused tests.
- Targeted validation passed:
  `node --test server/tests/cli-router.test.mjs server/tests/project-handoff-brief.test.mjs`
  with 59 passing tests.
- Full server validation passed with `npm test`: 711 passing tests.
- The helper path remains dry-run/redacted by design and does not output
  secrets, tokens, subscription URLs, account credentials, raw logs, raw config,
  raw environment values, or SQLite rows.

## Recommended Merge Order

1. Unit 0: Generated noise/source boundary.
2. Unit 1: Docs and project-state closeout.
3. Unit 4: Control plane order, credential, and usage ledger.
4. Unit 5: Edge runtime adapters and subscription rendering.
5. Unit 3: User Portal order lifecycle UI.
6. Unit 2: Admin and operator UI.
7. Unit 6: CLI and project handoff helpers.

Rationale:
- Docs/state should define the boundary first.
- Backend authority must land before UI that depends on it.
- Runtime adapters should be reviewed separately from customer-facing UI.
- CLI helpers should follow the final backend contract.

## Open PR Disposition

| PR / branch | Proposed action |
| --- | --- |
| GitHub/mainline closeout | Done: `master` is at `2517673`, open PR count 0, and PR #299, #302, #303, #304, #305, #306, #307, #308, #309, #310, #311, and #312 are merged. |
| Local `codex/portal-order-ledger` | Inspect before reuse; likely superseded by current order-lifecycle work unless it contains unique tests. |
| Local `codex/multi-channel-node-guard` | Compare against current node policy and multichannel runtime implementation; merge only unique guard behavior. |
| Local `codex/user-portal-aliyun-rc` | Treat as historical Aliyun/user-portal lane unless current portal UI work explicitly imports it. |

## Validation Rule

No unit should be marked complete until its declared validation command has
fresh output for that unit. Partial validation may support investigation, but
does not close the unit.
