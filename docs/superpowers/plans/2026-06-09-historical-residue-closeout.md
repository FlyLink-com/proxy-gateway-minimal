# Historical Residue Closeout Implementation Plan

Last verified: 2026-08-29, America/Los_Angeles.

```yaml
document_metadata:
  doc_type: evidence
  lifecycle: historical
  authority_scope: historical_implementation_plan
  superseded_by: null
  last_verified_at: 2026-08-29
  production_authority: false
```

> Status:
> - Type: Historical implementation plan
> - Risk: C record; original tasks included separately gated B/A work
> - Execution authority: None; do not execute its checkbox order or reuse its
>   project-state queue claims
> - Production impact: None
> - Source of truth for: The 2026-06-09 planning record only

This plan is retained for archaeology. Its “current,” queue, status, and task
instructions are historical observations, not present-day work selection.
Resolve all current work from fresh native Issue/PR records and use Project #1
only for navigation.

> **Historical note:** The original plan required an execution skill and used
> checkbox order for tracking. That instruction is superseded; do not execute
> this plan or treat its checkboxes as a current queue.

**Goal:** Close stale Aliyun/AWS/channel-lab project residue, productize the current Vultr Japan + Singapore multi-data-plane lane, and make order, credential, usage, and subscription rendering evidence consistent.

**Architecture:** Keep one subscription control plane for accounts, orders, artifacts, credential lifecycle, and usage ledger. Treat Vultr Japan and Singapore as data-plane channel capacity behind one rendered subscription bundle. Separate repo-only validation from production runtime gates.

**Tech Stack:** Node.js ESM, SQLite control/subscription stores, React/Vite Admin UI, PowerShell/SSH operator tooling, Vultr data-plane runtimes, docs/project-state JSON.

---

## Risk Classification

- **C:** docs, README, project-state, archive indexes, execution records.
- **B:** repository code, tests, Admin usage monitor, local CLI/runbook tooling, template validation.
- **A:** production deploy, Vultr runtime config, Nginx, DNS, provider firewall, systemd, live order smoke, credential lifecycle activation.

Production/AWS impact for Tasks 1-4: none. Task 5 requires a separate exact A-tier approval before any live mutation.

Expected PR count:

1. PR 1: docs/project-state residue cleanup.
2. PR 2: repo-only code/test hardening and Admin usage ownership closure.
3. PR 3: data-plane handoff apply command productization.
4. PR 4 or production record: exact approved production release and smoke validation.

## Historical Evidence At The 2026-06-09 Cutoff

- `docs/PROJECT_CONTEXT.md` now documents Vultr Japan as the current control plane and Japan + Singapore as data-plane capacity.
- `project-state/current.json` still contains Aliyun-era active goal and next queue entries.
- `docs/production-replacement-records/2026-06-09-vultr-sgp-multichannel-runtime-closeout.md` records four follow-ups: formal runtime release, new-order desktop/phone smoke, repeatable SGP handoff apply command, and order-owned usage monitor closure.
- `config/proxy-servers.json` and `config/proxy-servers.vultr-multichannel.template.json` should remain aligned on the six production channels.

---

### Task 1: Project State And Archive Alignment

**Risk:** C

**Files:**
- Modify: `D:/Projects/proxy-gateway-minimal/project-state/current.json`
- Modify: `D:/Projects/proxy-gateway-minimal/project-state/tasks.json`
- Modify: `D:/Projects/proxy-gateway-minimal/project-state/lanes.json`
- Modify: `D:/Projects/proxy-gateway-minimal/docs/README.md`
- Modify: `D:/Projects/proxy-gateway-minimal/docs/PROJECT_CONTEXT.md`

- [x] **Step 1: Classify stale Aliyun-era fields**

Read:

```powershell
rg -n "Aliyun is the current|activeGoal|activeBlockers|nextRecommendedQueue|channel-lab|legacy-query-token" project-state docs/PROJECT_CONTEXT.md docs/README.md
```

Expected: every stale line is either current fallback context or a real active blocker.

- [x] **Step 2: Update project-state current direction**

Change `project-state/current.json` so `activeDirections`, `activeGoal`, and `nextRecommendedQueue` match:

```text
current control plane: Vultr Japan
data planes: Vultr Japan and Vultr Singapore
subscription bundle: channel-vultr-a-vless-reality-tcp, channel-vultr-a-hy2, channel-vultr-a-tuic, channel-sgp-a-vless-reality-tcp, channel-sgp-a-hy2, channel-sgp-a-tuic
Aliyun: historical/fallback unless re-promoted by a fresh A-tier gate
```

Keep old Aliyun execution records linked as historical evidence. Do not delete production records.

- [x] **Step 3: Split active blockers from historical blockers**

Keep active:

```text
sgp-handoff-apply-productization
new-order-six-channel-smoke
order-owned-usage-monitor-closure
legacy-query-token-retirement
```

Demote to historical/fallback:

```text
aliyun-subscription-control-platform-mvp
channel-lab-b-tuic-canary
aws-singapore-prod-edge-retirement
aliyun-aegis-service-repair
```

- [x] **Step 4: Validate docs/project-state**

Run:

```powershell
npm run project-state:check
git diff --check
```

Expected: both commands exit 0.

**Acceptance Criteria:**
- `project-state/current.json` no longer states Aliyun is the current business workspace.
- `docs/PROJECT_CONTEXT.md` and project-state agree on the current Vultr Japan + Singapore model.
- Historical Aliyun/AWS/channel-lab tasks remain discoverable but are not active execution advice.

---

### Task 2: Repository Guardrails For Six-Channel Consistency

**Risk:** B

**Files:**
- Modify: `D:/Projects/proxy-gateway-minimal/server/state.mjs`
- Modify: `D:/Projects/proxy-gateway-minimal/server/tests/state.test.mjs`
- Modify: `D:/Projects/proxy-gateway-minimal/server/tests/config.test.mjs`
- Modify: `D:/Projects/proxy-gateway-minimal/server/tests/vultr-tuic-template.test.mjs`
- Modify: `D:/Projects/proxy-gateway-minimal/server/tests/user-portal-routes.test.mjs`
- Modify: `D:/Projects/proxy-gateway-minimal/server/tests/platform-issue-subscription-cli.test.mjs`
- Modify: `D:/Projects/proxy-gateway-minimal/config/proxy-servers.json`
- Modify: `D:/Projects/proxy-gateway-minimal/config/proxy-servers.vultr-multichannel.template.json`

- [ ] **Step 1: Keep fail-closed channel reference validation**

`createRuntimeState` must reject production auto issuance or edge lifecycle refs that are absent from the loaded proxy config.

Expected behavior:

```text
USER_PORTAL_AUTO_ISSUANCE_CHANNEL_REFS contains refs not present in proxy config: <missing refs>
```

- [ ] **Step 2: Keep six-channel template assertions**

Tests must assert the six channel names and one shared `subscriptionBundleRef`:

```text
channel-vultr-a-vless-reality-tcp
channel-vultr-a-hy2
channel-vultr-a-tuic
channel-sgp-a-vless-reality-tcp
channel-sgp-a-hy2
channel-sgp-a-tuic
```

- [ ] **Step 3: Run targeted server tests**

Run:

```powershell
node --test server\tests\config.test.mjs server\tests\vultr-tuic-template.test.mjs
node --test server\tests\state.test.mjs --test-name-pattern "auto-issued|channel refs|fanout|handoff|rejects production"
node --test server\tests\platform-subscription-usage-monitor.test.mjs server\tests\user-portal-routes.test.mjs --test-name-pattern "usage|password|TOTP|second-factor|subscription usage"
node --test server\tests\platform-issue-subscription-cli.test.mjs --test-name-pattern "executes mutation"
```

Expected: every command exits 0.

- [ ] **Step 4: Run full server test**

Run:

```powershell
npm test
```

Expected: all server tests pass.

**Acceptance Criteria:**
- Missing configured channel refs cannot be silently filtered.
- Default local config and Vultr template both render the six-channel bundle.
- Test fixtures include synthetic, non-secret placeholders for all six channels.

---

### Task 3: Admin Usage Monitor Ownership Closure

**Risk:** B

**Files:**
- Modify: `D:/Projects/proxy-gateway-minimal/server/services/platform/subscription-usage-monitor.mjs`
- Modify: `D:/Projects/proxy-gateway-minimal/server/routes/admin-platform.mjs`
- Modify: `D:/Projects/proxy-gateway-minimal/admin/src/pages/subscription-usage-monitor-page.tsx`
- Modify: `D:/Projects/proxy-gateway-minimal/admin/src/features/subscriptions/types.ts`
- Test: `D:/Projects/proxy-gateway-minimal/server/tests/platform-subscription-usage-monitor.test.mjs`
- Test: `D:/Projects/proxy-gateway-minimal/admin/src/test/subscription-usage-monitor.test.tsx`

- [ ] **Step 1: Verify API returns JSON and order ownership**

Run:

```powershell
node --test server\tests\platform-subscription-usage-monitor.test.mjs
```

Expected: tests prove every delivered order can be listed with account/order/package/channel ownership.

- [ ] **Step 2: Keep platform and order usage separate**

Admin UI should show:

```text
platform/channel aggregate cards: node/channel health and total activity
order/account rows: account ID, order ref, package, channel, mapped usage, warning state
unmapped samples: shown as unmapped, not counted as per-order usage
```

- [ ] **Step 3: Verify Admin UI**

Run:

```powershell
npm run admin:test
npm run admin:build
```

Expected: both commands exit 0.

**Acceptance Criteria:**
- The page does not show `Backend returned invalid JSON`.
- Rows identify which account and which order owns usage.
- Unknown aggregate-only usage is not presented as per-order usage.

---

### Task 4: Repeatable Remote Data-Plane Apply Command

**Risk:** B for repo-only command and tests; A for production use.

**Files:**
- Modify or create: `D:/Projects/proxy-gateway-minimal/server/services/edge/data-plane-handoff-runtime-adapter.mjs`
- Modify or create: `D:/Projects/proxy-gateway-minimal/scripts/data-plane-handoff-apply.mjs`
- Test: `D:/Projects/proxy-gateway-minimal/server/tests/edge-data-plane-handoff-runtime-adapter.test.mjs`
- Test: `D:/Projects/proxy-gateway-minimal/server/tests/cli-router.test.mjs`
- Docs: `D:/Projects/proxy-gateway-minimal/ops/edge-node/README.md`

- [ ] **Step 1: Define dry-run command contract**

The command must accept only protected paths and default to no mutation:

```powershell
node scripts\data-plane-handoff-apply.mjs --handoff-dir <path> --channel-ref channel-sgp-a-hy2 --dry-run
```

Expected dry-run output:

```json
{
  "ok": true,
  "mode": "dry-run",
  "channelRef": "channel-sgp-a-hy2",
  "pendingCount": 1,
  "rawMaterialPrinted": false
}
```

- [ ] **Step 2: Add tests for redaction and ownership preservation**

Tests must prove:

```text
raw UUID/password/private key is never printed
active config ownership is preserved
unsupported channel refs fail closed
execute mode requires explicit approval ref
```

- [ ] **Step 3: Validate repo-only command**

Run:

```powershell
node --test server\tests\edge-data-plane-handoff-runtime-adapter.test.mjs
node --test server\tests\cli-router.test.mjs --test-name-pattern "handoff|edge"
npm test
```

Expected: all commands exit 0.

**Acceptance Criteria:**
- Operators have a repeatable command instead of ad hoc handoff apply.
- Command is dry-run by default.
- Production execution remains A-tier and cannot happen from tests.

---

### Task 5: Production Release And End-To-End Smoke

**Risk:** A

**Files:**
- Create: `D:/Projects/proxy-gateway-minimal/docs/production-replacement-records/YYYY-MM-DD-vultr-six-channel-release.md`
- Use exact artifact path generated from the reviewed repo state.

- [ ] **Step 1: Prepare release artifact locally**

Run:

```powershell
npm test
npm run admin:test
npm run admin:build
npm run project-state:check
git diff --check
```

Expected: all exit 0.

- [ ] **Step 2: Request exact production approval**

Approval must name:

```text
release
artifact
archive_sha256
target host
current release
scope
validation
rollback
forbidden actions
```

- [ ] **Step 3: Deploy only after approval**

Allowed under approval:

```text
backup protected env, subscription DB, control DB, proxy config
upload verified artifact
npm ci
switch current
restart proxy-gateway-candidate.service only
```

Runtime config changes for Xray/Hy2/TUIC require their own named approval if included.

- [ ] **Step 4: Smoke test without exposing secrets**

Validate:

```text
health 200
portal 200
sub public 200 or expected boundary
Admin blocked
no-session portal APIs reject
new order creates and reaches delivered state
render proof shows six channel names
desktop import works
phone import works
Vultr and SGP channel groups can be selected
usage monitor returns JSON
```

Do not print subscription URL, token, passwords, SQLite rows, raw env, raw runtime config, or raw logs.

**Acceptance Criteria:**
- Production release record exists with exact validation evidence.
- A newly created order can render all six approved channels.
- At least one desktop and one phone smoke are recorded.
- Rollback plan is present and tested by metadata/readiness, or rollback is executed if validation fails.

---

## Final Closeout Checklist

- [x] `project-state/current.json` matches `docs/PROJECT_CONTEXT.md`.
- [x] Historical Aliyun/AWS/channel-lab work is indexed but not active advice.
- [ ] Six-channel config is tested in default config and Vultr template.
- [ ] Admin usage monitor shows account/order ownership.
- [ ] Handoff apply has a repeatable dry-run command.
- [ ] Production release has exact artifact, sha256, validation, and rollback record.
- [ ] No secrets, tokens, subscription URLs, passwords, SQLite rows, raw env, raw config, or customer data are written to docs or chat.
