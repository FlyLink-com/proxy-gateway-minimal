# Environment Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a minimal Git-tracked operations foundation for deployment and recovery.

**Architecture:** Keep the app as a modular monolith. Add environment templates, systemd and Nginx templates, SQLite backup/restore scripts, and tests that prove the expected files and public/private boundaries stay present.

**Tech Stack:** Node.js test runner, Bash scripts, systemd, Nginx, SQLite.

---

### Task 1: Environment Foundation Contract Test

**Files:**

- Create: `server/tests/environment-foundation.test.mjs`

- [x] **Step 1: Write failing tests**

Create tests that assert the ops files exist, `.env.example` documents production runtime variables, systemd templates use `/opt/proxy-gateway-minimal`, Nginx exposes only health and subscription routes, backup/restore scripts preserve SQLite boundaries, and `ops/README.md` documents recovery.

- [x] **Step 2: Run the test and verify failure**

Run:

```powershell
node --test server/tests/environment-foundation.test.mjs
```

Expected before implementation: failures for missing `ops/` files and incomplete `.env.example`.

### Task 2: Runtime Templates And Scripts

**Files:**

- Modify: `.env.example`
- Create: `ops/systemd/proxy-gateway-console.service`
- Create: `ops/systemd/proxy-gateway-ss.service`
- Create: `ops/nginx/proxy-gateway-public.conf`
- Create: `scripts/backup-subscriptions.sh`
- Create: `scripts/restore-subscriptions.sh`

- [x] **Step 1: Expand `.env.example`**

Add `CONSOLE_PORT`, `CONSOLE_TOKEN`, `SS_PASSWORD`, `SUBSCRIPTION_DB_PATH`, `PUBLIC_SUBSCRIPTION_BASE_URL`, `ADMIN_ALLOWED_CIDRS`, `SUB_RATE_LIMIT_WINDOW_MS`, `SUB_RATE_LIMIT_MAX`, and `SUBSCRIPTION_TEMP_LINK_TTL_MINUTES`.

- [x] **Step 2: Add systemd templates**

Add app and Shadowsocks service units with `EnvironmentFile=/opt/proxy-gateway-minimal/.env`, restart-on-failure, and `/opt/proxy-gateway-minimal` as the app working directory.

- [x] **Step 3: Add Nginx template**

Add a public gateway config that allows `/api/health` and `/sub/clash.yaml`, returns `404` for `/api/admin/*` and all other public paths, and logs `$uri` instead of `$request_uri`.

- [x] **Step 4: Add backup and restore scripts**

Use SQLite `.backup` for backups and service stop/start for restore.

### Task 3: Operations Documentation

**Files:**

- Create: `ops/README.md`
- Create: `docs/superpowers/specs/2026-05-22-environment-foundation-design.md`
- Create: `docs/superpowers/plans/2026-05-22-environment-foundation.md`
- Modify: `docs/PROJECT_CONTEXT.md`

- [x] **Step 1: Write the operations runbook**

Document deploy layout, systemd install, Nginx install, backup/restore, SSH tunnel, and verification commands.

- [x] **Step 2: Write design and implementation docs**

Record the environment foundation scope and non-goals so future work does not confuse this phase with Docker, Terraform, or CI.

- [x] **Step 3: Update project context**

Record the branch and current environment-foundation scope after verification.

### Task 4: Verification And Publish

**Files:**

- No production code changes beyond templates/scripts/docs.

- [x] **Step 1: Run focused test**

```powershell
node --test server/tests/environment-foundation.test.mjs
```

- [x] **Step 2: Run full backend tests**

```powershell
npm test
```

- [x] **Step 3: Run Admin UI tests and build**

```powershell
npm run admin:test
npm run admin:build
```

- [ ] **Step 4: Commit and open PR**

```powershell
git add .env.example ops scripts/backup-subscriptions.sh scripts/restore-subscriptions.sh docs server/tests/environment-foundation.test.mjs
git commit -m "ops: add environment foundation"
git push -u origin ops/environment-foundation
gh pr create --base master --head ops/environment-foundation --title "Add environment foundation" --body "..."
```
