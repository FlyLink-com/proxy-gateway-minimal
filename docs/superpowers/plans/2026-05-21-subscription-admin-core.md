# Subscription Admin Core Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the backend core for operator-managed subscription tenants with SQLite persistence, secure tenant tokens, admin APIs, and tenant-token Clash subscription fetches.

**Architecture:** Add a focused subscription domain under `server/services/subscriptions/`, wire it into `createRuntimeState()`, expose admin APIs through a new route module, and update the existing subscription route so tenant tokens work while console-token subscription compatibility remains intact. The existing proxy config loader and Clash YAML generator stay in place.

**Tech Stack:** Node.js ESM, Express 5, `node:test`, `better-sqlite3`, Node `crypto`, existing Clash subscription generator.

---

## Branch Context

Implement after `plan/subscription-admin-core` is merged or approved.

Start from clean mainline:

```powershell
cd C:\Users\g\WorkBuddy\2026-05-20-18-07-31\proxy-gateway-minimal
git switch master
git pull --ff-only origin master
git switch -c feat/subscription-admin-core
```

Expected:

```text
Switched to a new branch 'feat/subscription-admin-core'
```

If `feat/subscription-admin-core` already exists locally, use:

```powershell
git switch feat/subscription-admin-core
git status -sb
```

Continue only when `git status -sb` has no modified or untracked files.

## File Structure

Create:

- `server/services/subscriptions/tokens.mjs`: raw tenant token generation, SHA-256 hashing, timing-safe verification, token prefix extraction.
- `server/services/subscriptions/status.mjs`: stored status validation and computed display status.
- `server/services/subscriptions/repository.mjs`: SQLite schema bootstrap and tenant persistence methods.
- `server/services/subscriptions/service.mjs`: subscription business workflow over repository and proxy config.
- `server/routes/admin-subscriptions.mjs`: console-authenticated admin API routes.
- `server/tests/subscription-token.test.mjs`: token and status utility tests.
- `server/tests/subscription-repository.test.mjs`: SQLite repository tests.
- `server/tests/subscription-service.test.mjs`: service workflow tests.
- `server/tests/admin-subscriptions.test.mjs`: HTTP route tests for admin APIs and tenant-token subscription fetch.

Modify:

- `package.json` and `package-lock.json`: add `better-sqlite3`.
- `server/app.mjs`: add `/sub/clash.yaml` to public paths and mount admin subscription routes.
- `server/state.mjs`: initialize subscription repository/service.
- `server/routes/subscription.mjs`: validate tenant tokens and preserve console-token compatibility.
- `server/tests/clash-subscription.test.mjs`: keep compatibility assertions explicit after `/sub/clash.yaml` moves out of global auth.
- `server/tests/state.test.mjs`: verify subscription runtime wiring with a temp database.
- `README.md`: document subscription admin core commands and environment variables.
- `qa-report.md`: update test count and backend-core status after implementation.

Do not modify:

- `public/index.html`.
- `admin/` frontend files.
- AWS deployment scripts.
- `config/proxy-servers.json` unless a test fixture requires its own local data.

---

### Task 1: Add SQLite Dependency

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`

- [ ] **Step 1: Install `better-sqlite3`**

Run:

```powershell
$env:HTTP_PROXY='http://127.0.0.1:7897'
$env:HTTPS_PROXY='http://127.0.0.1:7897'
$env:ALL_PROXY='socks5://127.0.0.1:7897'
npm install better-sqlite3
```

Expected: command exits with code `0` and `package.json` contains `"better-sqlite3"`.

- [ ] **Step 2: Verify native SQLite load**

Run:

```powershell
node -e "import Database from 'better-sqlite3'; const db = new Database(':memory:'); db.exec('create table t(x integer); insert into t values (1);'); console.log(db.prepare('select x from t').get().x); db.close();"
```

Expected:

```text
1
```

If this fails, stop and report the native install error. Do not replace the dependency with a different SQLite package without revising the design.

- [ ] **Step 3: Run existing tests**

Run:

```powershell
npm test
```

Expected:

```text
fail 0
```

- [ ] **Step 4: Commit dependency**

Run:

```powershell
git add package.json package-lock.json
git commit -m "chore: add sqlite dependency"
```

Expected: commit succeeds.

---

### Task 2: Add Token And Status Utilities

**Files:**
- Create: `server/services/subscriptions/tokens.mjs`
- Create: `server/services/subscriptions/status.mjs`
- Create: `server/tests/subscription-token.test.mjs`

- [ ] **Step 1: Create failing utility tests**

Create `server/tests/subscription-token.test.mjs`:

```js
import assert from "node:assert/strict";
import test from "node:test";
import {
  createSubscriptionToken,
  hashSubscriptionToken,
  tokenPrefix,
  verifySubscriptionToken
} from "../services/subscriptions/tokens.mjs";
import { computeSubscriptionStatus, normalizeStoredStatus } from "../services/subscriptions/status.mjs";

test("subscription tokens are visible once and stored as hashes", () => {
  const bytes = Buffer.alloc(32, 1);
  const created = createSubscriptionToken({ randomBytesFn: () => bytes });
  const expectedRaw = `pgsub_${bytes.toString("base64url")}`;

  assert.equal(created.rawToken, expectedRaw);
  assert.equal(created.tokenPrefix, expectedRaw.slice(0, 14));
  assert.equal(created.tokenHash, hashSubscriptionToken(expectedRaw));
  assert.notEqual(created.tokenHash, expectedRaw);
  assert.equal(verifySubscriptionToken(expectedRaw, created.tokenHash), true);
  assert.equal(verifySubscriptionToken("pgsub_wrong", created.tokenHash), false);
});

test("tokenPrefix returns a short operator-safe prefix", () => {
  assert.equal(tokenPrefix("pgsub_abcdefghijklmnopqrstuvwxyz"), "pgsub_abcdefgh");
});

test("stored status validation accepts only active and disabled", () => {
  assert.equal(normalizeStoredStatus("active"), "active");
  assert.equal(normalizeStoredStatus("disabled"), "disabled");
  assert.throws(() => normalizeStoredStatus("expired"), /Invalid stored status/);
});

test("computed status distinguishes active, expiring, expired, and disabled", () => {
  const now = new Date("2026-05-21T00:00:00.000Z");

  assert.equal(computeSubscriptionStatus({
    storedStatus: "active",
    expiresAt: "2026-06-21T00:00:00.000Z",
    now
  }), "active");

  assert.equal(computeSubscriptionStatus({
    storedStatus: "active",
    expiresAt: "2026-05-25T00:00:00.000Z",
    now,
    expiringDays: 7
  }), "expiring");

  assert.equal(computeSubscriptionStatus({
    storedStatus: "active",
    expiresAt: "2026-05-20T23:59:59.000Z",
    now
  }), "expired");

  assert.equal(computeSubscriptionStatus({
    storedStatus: "disabled",
    expiresAt: "2026-06-21T00:00:00.000Z",
    now
  }), "disabled");
});
```

- [ ] **Step 2: Run utility tests to verify failure**

Run:

```powershell
node --test server/tests/subscription-token.test.mjs
```

Expected: fails with module-not-found errors for `tokens.mjs` and `status.mjs`.

- [ ] **Step 3: Implement token utility**

Create `server/services/subscriptions/tokens.mjs`:

```js
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

const TOKEN_PREFIX = "pgsub_";
const TOKEN_PREFIX_LENGTH = 14;

export function hashSubscriptionToken(rawToken) {
  return createHash("sha256").update(String(rawToken), "utf8").digest("hex");
}

export function tokenPrefix(rawToken) {
  return String(rawToken).slice(0, TOKEN_PREFIX_LENGTH);
}

export function createSubscriptionToken({ randomBytesFn = randomBytes } = {}) {
  const rawToken = `${TOKEN_PREFIX}${randomBytesFn(32).toString("base64url")}`;
  return {
    rawToken,
    tokenHash: hashSubscriptionToken(rawToken),
    tokenPrefix: tokenPrefix(rawToken)
  };
}

export function verifySubscriptionToken(rawToken, storedHash) {
  const candidate = Buffer.from(hashSubscriptionToken(rawToken), "hex");
  const expected = Buffer.from(String(storedHash || ""), "hex");

  if (candidate.length !== expected.length) {
    return false;
  }

  return timingSafeEqual(candidate, expected);
}
```

- [ ] **Step 4: Implement status utility**

Create `server/services/subscriptions/status.mjs`:

```js
const STORED_STATUSES = new Set(["active", "disabled"]);

export function normalizeStoredStatus(status) {
  if (STORED_STATUSES.has(status)) {
    return status;
  }
  throw new Error(`Invalid stored status: ${status}`);
}

export function computeSubscriptionStatus({
  storedStatus,
  expiresAt,
  now = new Date(),
  expiringDays = 7
}) {
  const normalized = normalizeStoredStatus(storedStatus);
  if (normalized === "disabled") {
    return "disabled";
  }

  const expiry = new Date(expiresAt);
  if (Number.isNaN(expiry.getTime())) {
    throw new Error(`Invalid expiry date: ${expiresAt}`);
  }

  if (expiry.getTime() <= now.getTime()) {
    return "expired";
  }

  const warningAt = new Date(now.getTime() + expiringDays * 24 * 60 * 60 * 1000);
  return expiry.getTime() <= warningAt.getTime() ? "expiring" : "active";
}
```

- [ ] **Step 5: Run utility tests**

Run:

```powershell
node --test server/tests/subscription-token.test.mjs
```

Expected:

```text
pass 4
fail 0
```

- [ ] **Step 6: Run full test suite**

Run:

```powershell
npm test
```

Expected: `fail 0`.

- [ ] **Step 7: Commit utilities**

Run:

```powershell
git add server/services/subscriptions/tokens.mjs server/services/subscriptions/status.mjs server/tests/subscription-token.test.mjs
git commit -m "feat: add subscription token utilities"
```

Expected: commit succeeds.

---

### Task 3: Add SQLite Repository

**Files:**
- Create: `server/services/subscriptions/repository.mjs`
- Create: `server/tests/subscription-repository.test.mjs`

- [ ] **Step 1: Create failing repository tests**

Create `server/tests/subscription-repository.test.mjs`:

```js
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createSubscriptionRepository } from "../services/subscriptions/repository.mjs";

function withRepository(fn) {
  const dir = mkdtempSync(join(tmpdir(), "subscription-repo-"));
  const repository = createSubscriptionRepository({ dbPath: join(dir, "subscriptions.sqlite") });
  return Promise.resolve()
    .then(() => fn(repository))
    .finally(() => {
      repository.close();
      rmSync(dir, { recursive: true, force: true });
    });
}

test("repository creates and lists tenants without raw tokens", async () => {
  await withRepository((repository) => {
    repository.createTenant({
      id: "tenant_1",
      displayName: "customer-a",
      status: "active",
      expiresAt: "2026-06-21T00:00:00.000Z",
      note: "manual",
      nodeId: "aws-singapore",
      credentialMode: "shared-node",
      tokenHash: "hash_1",
      tokenPrefix: "pgsub_hash1",
      now: "2026-05-21T00:00:00.000Z"
    });

    const items = repository.listTenants();
    assert.equal(items.length, 1);
    assert.equal(items[0].id, "tenant_1");
    assert.equal(items[0].displayName, "customer-a");
    assert.equal(items[0].tokenHash, "hash_1");
    assert.equal(items[0].tokenPrefix, "pgsub_hash1");
    assert.equal(Object.hasOwn(items[0], "rawToken"), false);
  });
});

test("repository renews, disables, enables, resets token, and marks last use", async () => {
  await withRepository((repository) => {
    repository.createTenant({
      id: "tenant_1",
      displayName: "customer-a",
      status: "active",
      expiresAt: "2026-06-21T00:00:00.000Z",
      note: "",
      nodeId: "aws-singapore",
      credentialMode: "shared-node",
      tokenHash: "hash_1",
      tokenPrefix: "pgsub_hash1",
      now: "2026-05-21T00:00:00.000Z"
    });

    repository.renewTenant("tenant_1", {
      expiresAt: "2026-08-01T00:00:00.000Z",
      now: "2026-05-22T00:00:00.000Z"
    });
    assert.equal(repository.getTenant("tenant_1").expiresAt, "2026-08-01T00:00:00.000Z");

    repository.setTenantStatus("tenant_1", { status: "disabled", now: "2026-05-23T00:00:00.000Z" });
    assert.equal(repository.getTenant("tenant_1").status, "disabled");

    repository.setTenantStatus("tenant_1", { status: "active", now: "2026-05-24T00:00:00.000Z" });
    assert.equal(repository.getTenant("tenant_1").status, "active");

    repository.resetTenantToken("tenant_1", {
      tokenHash: "hash_2",
      tokenPrefix: "pgsub_hash2",
      now: "2026-05-25T00:00:00.000Z"
    });
    assert.equal(repository.findTenantByTokenHash("hash_1"), null);
    assert.equal(repository.findTenantByTokenHash("hash_2").id, "tenant_1");

    repository.markLastUsed("tenant_1", { now: "2026-05-26T00:00:00.000Z" });
    assert.equal(repository.getTenant("tenant_1").lastUsedAt, "2026-05-26T00:00:00.000Z");
  });
});
```

- [ ] **Step 2: Run repository tests to verify failure**

Run:

```powershell
node --test server/tests/subscription-repository.test.mjs
```

Expected: fails with module-not-found error for `repository.mjs`.

- [ ] **Step 3: Implement repository**

Create `server/services/subscriptions/repository.mjs`:

```js
import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

function ensureParentDirectory(dbPath) {
  if (dbPath && dbPath !== ":memory:") {
    mkdirSync(dirname(dbPath), { recursive: true });
  }
}

function mapTenant(row) {
  if (!row) return null;
  return {
    id: row.id,
    displayName: row.display_name,
    status: row.status,
    expiresAt: row.expires_at,
    note: row.note,
    nodeId: row.node_id,
    credentialMode: row.credential_mode,
    tokenHash: row.token_hash,
    tokenPrefix: row.token_prefix,
    lastUsedAt: row.last_used_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export function createSubscriptionRepository({ dbPath, database } = {}) {
  if (!database && !dbPath) {
    throw new Error("dbPath or database is required");
  }

  ensureParentDirectory(dbPath);
  const db = database ?? new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.exec(`
    create table if not exists subscription_tenants (
      id text primary key,
      display_name text not null,
      status text not null,
      expires_at text not null,
      note text not null default '',
      node_id text not null,
      credential_mode text not null,
      token_hash text not null,
      token_prefix text not null,
      last_used_at text,
      created_at text not null,
      updated_at text not null
    );

    create unique index if not exists subscription_tenants_token_hash_idx
      on subscription_tenants(token_hash);
    create index if not exists subscription_tenants_status_idx
      on subscription_tenants(status);
    create index if not exists subscription_tenants_expires_at_idx
      on subscription_tenants(expires_at);

    create table if not exists subscription_audit_events (
      id text primary key,
      action text not null,
      tenant_id text,
      actor text not null,
      created_at text not null,
      metadata_json text not null default '{}'
    );
  `);

  function listTenants() {
    return db.prepare(`
      select * from subscription_tenants
      order by created_at desc, display_name asc
    `).all().map(mapTenant);
  }

  function getTenant(id) {
    return mapTenant(db.prepare("select * from subscription_tenants where id = ?").get(id));
  }

  function findTenantByTokenHash(tokenHash) {
    return mapTenant(db.prepare("select * from subscription_tenants where token_hash = ?").get(tokenHash));
  }

  function createTenant(input) {
    db.prepare(`
      insert into subscription_tenants (
        id, display_name, status, expires_at, note, node_id, credential_mode,
        token_hash, token_prefix, last_used_at, created_at, updated_at
      ) values (
        @id, @displayName, @status, @expiresAt, @note, @nodeId, @credentialMode,
        @tokenHash, @tokenPrefix, null, @now, @now
      )
    `).run(input);
    return getTenant(input.id);
  }

  function renewTenant(id, { expiresAt, now }) {
    const result = db.prepare(`
      update subscription_tenants
      set expires_at = ?, status = 'active', updated_at = ?
      where id = ?
    `).run(expiresAt, now, id);
    return result.changes === 1 ? getTenant(id) : null;
  }

  function setTenantStatus(id, { status, now }) {
    const result = db.prepare(`
      update subscription_tenants
      set status = ?, updated_at = ?
      where id = ?
    `).run(status, now, id);
    return result.changes === 1 ? getTenant(id) : null;
  }

  function resetTenantToken(id, { tokenHash, tokenPrefix, now }) {
    const result = db.prepare(`
      update subscription_tenants
      set token_hash = ?, token_prefix = ?, updated_at = ?
      where id = ?
    `).run(tokenHash, tokenPrefix, now, id);
    return result.changes === 1 ? getTenant(id) : null;
  }

  function markLastUsed(id, { now }) {
    const result = db.prepare(`
      update subscription_tenants
      set last_used_at = ?, updated_at = ?
      where id = ?
    `).run(now, now, id);
    return result.changes === 1 ? getTenant(id) : null;
  }

  function close() {
    db.close();
  }

  return {
    listTenants,
    getTenant,
    findTenantByTokenHash,
    createTenant,
    renewTenant,
    setTenantStatus,
    resetTenantToken,
    markLastUsed,
    close
  };
}
```

- [ ] **Step 4: Run repository tests**

Run:

```powershell
node --test server/tests/subscription-repository.test.mjs
```

Expected:

```text
pass 2
fail 0
```

- [ ] **Step 5: Run full test suite**

Run:

```powershell
npm test
```

Expected: `fail 0`.

- [ ] **Step 6: Commit repository**

Run:

```powershell
git add server/services/subscriptions/repository.mjs server/tests/subscription-repository.test.mjs
git commit -m "feat: add subscription repository"
```

Expected: commit succeeds.

---

### Task 4: Add Subscription Service

**Files:**
- Create: `server/services/subscriptions/service.mjs`
- Create: `server/tests/subscription-service.test.mjs`

- [ ] **Step 1: Create failing service tests**

Create `server/tests/subscription-service.test.mjs`:

```js
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { hashSubscriptionToken } from "../services/subscriptions/tokens.mjs";
import { createSubscriptionRepository } from "../services/subscriptions/repository.mjs";
import { createSubscriptionService } from "../services/subscriptions/service.mjs";

const proxyConfig = {
  servers: [
    {
      name: "aws-singapore",
      host: "52.221.198.76.sslip.io",
      port: 18388,
      method: "chacha20-ietf-poly1305",
      password: "node-secret"
    }
  ],
  pingHosts: [],
  nginx: {}
};

function tokenFactory(rawToken) {
  return () => ({
    rawToken,
    tokenHash: hashSubscriptionToken(rawToken),
    tokenPrefix: rawToken.slice(0, 14)
  });
}

function withService(fn) {
  const dir = mkdtempSync(join(tmpdir(), "subscription-service-"));
  const repository = createSubscriptionRepository({ dbPath: join(dir, "subscriptions.sqlite") });
  const service = createSubscriptionService({
    repository,
    proxyConfig,
    publicSubscriptionBaseUrl: "https://proxy.example.com",
    nowFn: () => new Date("2026-05-21T00:00:00.000Z"),
    tokenFactory: tokenFactory("pgsub_visible_once_token"),
    idFactory: () => "tenant_1",
    expiringDays: 7
  });

  return Promise.resolve()
    .then(() => fn({ repository, service }))
    .finally(() => {
      repository.close();
      rmSync(dir, { recursive: true, force: true });
    });
}

test("service creates tenants with visible-once URL and no raw token in tenant", async () => {
  await withService(({ repository, service }) => {
    const result = service.createTenant({
      displayName: "customer-a",
      expiresAt: "2026-06-21T00:00:00.000Z",
      note: "manual"
    });

    assert.equal(result.tenant.id, "tenant_1");
    assert.equal(result.tenant.displayName, "customer-a");
    assert.equal(result.tenant.status, "active");
    assert.equal(result.tenant.nodeName, "aws-singapore");
    assert.equal(result.subscriptionUrl, "https://proxy.example.com/sub/clash.yaml?token=pgsub_visible_once_token");
    assert.equal(Object.hasOwn(result.tenant, "rawToken"), false);

    const stored = repository.getTenant("tenant_1");
    assert.equal(stored.tokenHash, hashSubscriptionToken("pgsub_visible_once_token"));
    assert.equal(Object.hasOwn(stored, "rawToken"), false);
  });
});

test("service validates token, scopes proxy config, and marks last used", async () => {
  await withService(({ repository, service }) => {
    service.createTenant({
      displayName: "customer-a",
      expiresAt: "2026-06-21T00:00:00.000Z",
      note: ""
    });

    const resolved = service.resolveSubscriptionToken("pgsub_visible_once_token");

    assert.equal(resolved.ok, true);
    assert.equal(resolved.tenant.id, "tenant_1");
    assert.equal(resolved.proxyConfig.servers.length, 1);
    assert.equal(resolved.proxyConfig.servers[0].name, "aws-singapore");
    assert.equal(repository.getTenant("tenant_1").lastUsedAt, "2026-05-21T00:00:00.000Z");
  });
});

test("service rejects unknown, disabled, and expired tokens", async () => {
  await withService(({ service }) => {
    service.createTenant({
      displayName: "customer-a",
      expiresAt: "2026-06-21T00:00:00.000Z",
      note: ""
    });

    assert.deepEqual(service.resolveSubscriptionToken("pgsub_unknown"), {
      ok: false,
      status: 401,
      error: "Unauthorized"
    });

    service.disableTenant("tenant_1");
    assert.deepEqual(service.resolveSubscriptionToken("pgsub_visible_once_token"), {
      ok: false,
      status: 403,
      error: "Subscription disabled"
    });

    service.enableTenant("tenant_1");
    service.renewTenant("tenant_1", { expiresAt: "2026-05-20T00:00:00.000Z" });
    assert.deepEqual(service.resolveSubscriptionToken("pgsub_visible_once_token"), {
      ok: false,
      status: 403,
      error: "Subscription expired"
    });
  });
});
```

- [ ] **Step 2: Run service tests to verify failure**

Run:

```powershell
node --test server/tests/subscription-service.test.mjs
```

Expected: fails with module-not-found error for `service.mjs`.

- [ ] **Step 3: Implement service**

Create `server/services/subscriptions/service.mjs`:

```js
import { randomUUID } from "node:crypto";
import { computeSubscriptionStatus, normalizeStoredStatus } from "./status.mjs";
import { createSubscriptionToken, hashSubscriptionToken, verifySubscriptionToken } from "./tokens.mjs";

function nowIso(nowFn) {
  return nowFn().toISOString();
}

function validationError(message) {
  const error = new Error(message);
  error.code = "validation_error";
  return error;
}

function notFoundError(message) {
  const error = new Error(message);
  error.code = "not_found";
  return error;
}

function validateDisplayName(displayName) {
  const value = String(displayName ?? "").trim();
  if (!value) throw validationError("displayName is required");
  if (value.length > 80) throw validationError("displayName must be 80 characters or fewer");
  return value;
}

function validateExpiresAt(expiresAt) {
  const value = String(expiresAt ?? "").trim();
  const parsed = new Date(value);
  if (!value || Number.isNaN(parsed.getTime())) {
    throw validationError("expiresAt must be a valid ISO date");
  }
  return parsed.toISOString();
}

function validateNote(note) {
  const value = String(note ?? "").trim();
  if (value.length > 500) throw validationError("note must be 500 characters or fewer");
  return value;
}

function defaultNode(proxyConfig) {
  const node = (proxyConfig.servers || [])[0];
  if (!node?.name) {
    throw new Error("At least one named proxy server is required for subscriptions");
  }
  return node;
}

function publicBaseUrl(value) {
  return String(value || "").replace(/\/+$/, "");
}

export function createSubscriptionService({
  repository,
  proxyConfig,
  publicSubscriptionBaseUrl,
  nowFn = () => new Date(),
  tokenFactory = createSubscriptionToken,
  idFactory = () => `tenant_${randomUUID()}`,
  expiringDays = 7
}) {
  const baseUrl = publicBaseUrl(publicSubscriptionBaseUrl);

  function subscriptionUrl(rawToken) {
    return `${baseUrl}/sub/clash.yaml?token=${encodeURIComponent(rawToken)}`;
  }

  function serializeTenant(row) {
    if (!row) return null;
    return {
      id: row.id,
      displayName: row.displayName,
      status: computeSubscriptionStatus({
        storedStatus: row.status,
        expiresAt: row.expiresAt,
        now: nowFn(),
        expiringDays
      }),
      expiresAt: row.expiresAt,
      note: row.note,
      nodeName: row.nodeId,
      tokenPrefix: row.tokenPrefix,
      lastUsedAt: row.lastUsedAt,
      credentialMode: row.credentialMode
    };
  }

  function tenantProxyConfig(row) {
    return {
      ...proxyConfig,
      servers: (proxyConfig.servers || []).filter((server) => server.name === row.nodeId)
    };
  }

  function createTenant(input) {
    const token = tokenFactory();
    const node = defaultNode(proxyConfig);
    const now = nowIso(nowFn);
    const tenant = repository.createTenant({
      id: idFactory(),
      displayName: validateDisplayName(input.displayName),
      status: "active",
      expiresAt: validateExpiresAt(input.expiresAt),
      note: validateNote(input.note),
      nodeId: node.name,
      credentialMode: "shared-node",
      tokenHash: token.tokenHash,
      tokenPrefix: token.tokenPrefix,
      now
    });
    return {
      tenant: serializeTenant(tenant),
      subscriptionUrl: subscriptionUrl(token.rawToken)
    };
  }

  function listTenants() {
    return repository.listTenants().map(serializeTenant);
  }

  function getTenant(id) {
    const tenant = repository.getTenant(id);
    if (!tenant) throw notFoundError("Subscription tenant not found");
    return serializeTenant(tenant);
  }

  function renewTenant(id, input) {
    const tenant = repository.renewTenant(id, {
      expiresAt: validateExpiresAt(input.expiresAt),
      now: nowIso(nowFn)
    });
    if (!tenant) throw notFoundError("Subscription tenant not found");
    return serializeTenant(tenant);
  }

  function setStatus(id, status) {
    const tenant = repository.setTenantStatus(id, {
      status: normalizeStoredStatus(status),
      now: nowIso(nowFn)
    });
    if (!tenant) throw notFoundError("Subscription tenant not found");
    return serializeTenant(tenant);
  }

  function disableTenant(id) {
    return setStatus(id, "disabled");
  }

  function enableTenant(id) {
    return setStatus(id, "active");
  }

  function resetToken(id) {
    const token = tokenFactory();
    const tenant = repository.resetTenantToken(id, {
      tokenHash: token.tokenHash,
      tokenPrefix: token.tokenPrefix,
      now: nowIso(nowFn)
    });
    if (!tenant) throw notFoundError("Subscription tenant not found");
    return {
      tenant: serializeTenant(tenant),
      subscriptionUrl: subscriptionUrl(token.rawToken)
    };
  }

  function resolveSubscriptionToken(rawToken) {
    const tokenHash = hashSubscriptionToken(rawToken);
    const tenant = repository.findTenantByTokenHash(tokenHash);
    if (!tenant || !verifySubscriptionToken(rawToken, tenant.tokenHash)) {
      return { ok: false, status: 401, error: "Unauthorized" };
    }

    const status = computeSubscriptionStatus({
      storedStatus: tenant.status,
      expiresAt: tenant.expiresAt,
      now: nowFn(),
      expiringDays
    });

    if (status === "disabled") {
      return { ok: false, status: 403, error: "Subscription disabled" };
    }
    if (status === "expired") {
      return { ok: false, status: 403, error: "Subscription expired" };
    }

    const updated = repository.markLastUsed(tenant.id, { now: nowIso(nowFn) }) ?? tenant;
    return {
      ok: true,
      tenant: serializeTenant(updated),
      proxyConfig: tenantProxyConfig(updated)
    };
  }

  function nodes() {
    return (proxyConfig.servers || []).map((server) => ({
      id: server.name,
      name: server.name,
      region: server.region || "",
      host: server.host,
      port: server.port,
      method: server.method,
      credentialMode: "shared-node",
      status: "online"
    }));
  }

  function overview() {
    const tenants = listTenants();
    return {
      ok: true,
      counts: {
        total: tenants.length,
        active: tenants.filter((tenant) => tenant.status === "active").length,
        expiring: tenants.filter((tenant) => tenant.status === "expiring").length,
        disabledOrExpired: tenants.filter((tenant) => tenant.status === "disabled" || tenant.status === "expired").length
      },
      nodes: nodes()
    };
  }

  return {
    createTenant,
    listTenants,
    getTenant,
    renewTenant,
    disableTenant,
    enableTenant,
    resetToken,
    resolveSubscriptionToken,
    nodes,
    overview
  };
}
```

- [ ] **Step 4: Run service tests**

Run:

```powershell
node --test server/tests/subscription-service.test.mjs
```

Expected:

```text
pass 3
fail 0
```

- [ ] **Step 5: Run full test suite**

Run:

```powershell
npm test
```

Expected: `fail 0`.

- [ ] **Step 6: Commit service**

Run:

```powershell
git add server/services/subscriptions/service.mjs server/tests/subscription-service.test.mjs
git commit -m "feat: add subscription service"
```

Expected: commit succeeds.

---

### Task 5: Add Admin Subscription Routes

**Files:**
- Create: `server/routes/admin-subscriptions.mjs`
- Create: `server/tests/admin-subscriptions.test.mjs`
- Modify: `server/app.mjs`

- [ ] **Step 1: Create failing admin route tests**

Create `server/tests/admin-subscriptions.test.mjs`:

```js
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { createApp } from "../app.mjs";
import { createSubscriptionRepository } from "../services/subscriptions/repository.mjs";
import { createSubscriptionService } from "../services/subscriptions/service.mjs";
import { hashSubscriptionToken } from "../services/subscriptions/tokens.mjs";
import { listen } from "./helpers/listen.mjs";

const proxyConfig = {
  servers: [
    {
      name: "aws-singapore",
      host: "52.221.198.76.sslip.io",
      port: 18388,
      method: "chacha20-ietf-poly1305",
      password: "node-secret"
    }
  ],
  pingHosts: [],
  nginx: {}
};

function tokenFactory(rawToken) {
  return () => ({
    rawToken,
    tokenHash: hashSubscriptionToken(rawToken),
    tokenPrefix: rawToken.slice(0, 14)
  });
}

async function withServer(fn) {
  const dir = mkdtempSync(join(tmpdir(), "admin-subscriptions-"));
  const repository = createSubscriptionRepository({ dbPath: join(dir, "subscriptions.sqlite") });
  const service = createSubscriptionService({
    repository,
    proxyConfig,
    publicSubscriptionBaseUrl: "https://proxy.example.com",
    nowFn: () => new Date("2026-05-21T00:00:00.000Z"),
    tokenFactory: tokenFactory("pgsub_visible_once_token"),
    idFactory: () => "tenant_1",
    expiringDays: 7
  });
  const state = {
    rootDir: resolve(fileURLToPath(new URL("../../", import.meta.url))),
    host: "127.0.0.1",
    ports: { console: 3456, socks: 1080, httpProxy: 18180 },
    consoleToken: "secret",
    proxyConfig,
    subscriptions: { service, repository, publicSubscriptionBaseUrl: "https://proxy.example.com" },
    services: {
      ssLocal: { status: () => ({ running: false }), start: async () => ({ ok: true }), stop: async () => ({ ok: true }) },
      httpProxy: { status: () => ({ running: false }), start: async () => ({ ok: true }), stop: async () => ({ ok: true }) }
    },
    isPortListening: async () => false,
    runCommand: async () => ({ ok: true, stdout: "", stderr: "", code: 0, timedOut: false })
  };

  const { server, baseUrl } = await listen(createApp(state));
  try {
    await fn({ baseUrl, repository });
  } finally {
    server.close();
    repository.close();
    rmSync(dir, { recursive: true, force: true });
  }
}

test("admin subscription routes require console auth", async () => {
  await withServer(async ({ baseUrl }) => {
    const response = await fetch(`${baseUrl}/api/admin/subscriptions`);
    assert.equal(response.status, 401);
  });
});

test("admin subscription routes create, list, renew, disable, enable, and reset", async () => {
  await withServer(async ({ baseUrl }) => {
    const createResponse = await fetch(`${baseUrl}/api/admin/subscriptions?token=secret`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        displayName: "customer-a",
        expiresAt: "2026-06-21T00:00:00.000Z",
        note: "manual"
      })
    });
    assert.equal(createResponse.status, 201);
    const created = await createResponse.json();
    assert.equal(created.tenant.id, "tenant_1");
    assert.equal(created.subscriptionUrl, "https://proxy.example.com/sub/clash.yaml?token=pgsub_visible_once_token");
    assert.doesNotMatch(JSON.stringify(created), /tokenHash/);

    const listResponse = await fetch(`${baseUrl}/api/admin/subscriptions?token=secret`);
    assert.equal(listResponse.status, 200);
    const listed = await listResponse.json();
    assert.equal(listed.items.length, 1);
    assert.equal(listed.items[0].displayName, "customer-a");
    assert.doesNotMatch(JSON.stringify(listed), /pgsub_visible_once_token|tokenHash/);

    const renewResponse = await fetch(`${baseUrl}/api/admin/subscriptions/tenant_1/renew?token=secret`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ expiresAt: "2026-08-01T00:00:00.000Z" })
    });
    assert.equal(renewResponse.status, 200);
    assert.equal((await renewResponse.json()).tenant.expiresAt, "2026-08-01T00:00:00.000Z");

    const disableResponse = await fetch(`${baseUrl}/api/admin/subscriptions/tenant_1/disable?token=secret`, { method: "POST" });
    assert.equal(disableResponse.status, 200);
    assert.equal((await disableResponse.json()).tenant.status, "disabled");

    const enableResponse = await fetch(`${baseUrl}/api/admin/subscriptions/tenant_1/enable?token=secret`, { method: "POST" });
    assert.equal(enableResponse.status, 200);
    assert.equal((await enableResponse.json()).tenant.status, "active");

    const resetResponse = await fetch(`${baseUrl}/api/admin/subscriptions/tenant_1/reset-token?token=secret`, { method: "POST" });
    assert.equal(resetResponse.status, 200);
    const reset = await resetResponse.json();
    assert.equal(reset.subscriptionUrl, "https://proxy.example.com/sub/clash.yaml?token=pgsub_visible_once_token");
  });
});

test("admin overview and nodes routes return subscription summaries", async () => {
  await withServer(async ({ baseUrl }) => {
    const nodes = await fetch(`${baseUrl}/api/admin/nodes?token=secret`);
    assert.equal(nodes.status, 200);
    assert.equal((await nodes.json()).items[0].name, "aws-singapore");

    const overview = await fetch(`${baseUrl}/api/admin/overview?token=secret`);
    assert.equal(overview.status, 200);
    const body = await overview.json();
    assert.equal(body.ok, true);
    assert.equal(body.counts.total, 0);
  });
});
```

- [ ] **Step 2: Run admin route tests to verify failure**

Run:

```powershell
node --test server/tests/admin-subscriptions.test.mjs
```

Expected: fails because `/api/admin/subscriptions` routes do not exist.

- [ ] **Step 3: Implement admin subscription routes**

Create `server/routes/admin-subscriptions.mjs`:

```js
import { Router } from "express";

function sendError(res, error) {
  if (error.code === "validation_error") {
    res.status(400).json({ error: "validation_error", message: error.message });
    return;
  }
  if (error.code === "not_found") {
    res.status(404).json({ error: "not_found", message: error.message });
    return;
  }
  res.status(500).json({ error: "internal_error", message: error.message });
}

export function adminSubscriptionRoutes(state) {
  const router = Router();
  const service = state.subscriptions?.service;

  router.get("/api/admin/subscriptions", (_req, res) => {
    res.json({ items: service.listTenants() });
  });

  router.post("/api/admin/subscriptions", (req, res) => {
    try {
      res.status(201).json(service.createTenant(req.body || {}));
    } catch (error) {
      sendError(res, error);
    }
  });

  router.get("/api/admin/subscriptions/:id", (req, res) => {
    try {
      res.json({ tenant: service.getTenant(req.params.id) });
    } catch (error) {
      sendError(res, error);
    }
  });

  router.patch("/api/admin/subscriptions/:id", (req, res) => {
    try {
      res.json({ tenant: service.renewTenant(req.params.id, req.body || {}) });
    } catch (error) {
      sendError(res, error);
    }
  });

  router.post("/api/admin/subscriptions/:id/renew", (req, res) => {
    try {
      res.json({ tenant: service.renewTenant(req.params.id, req.body || {}) });
    } catch (error) {
      sendError(res, error);
    }
  });

  router.post("/api/admin/subscriptions/:id/disable", (req, res) => {
    try {
      res.json({ tenant: service.disableTenant(req.params.id) });
    } catch (error) {
      sendError(res, error);
    }
  });

  router.post("/api/admin/subscriptions/:id/enable", (req, res) => {
    try {
      res.json({ tenant: service.enableTenant(req.params.id) });
    } catch (error) {
      sendError(res, error);
    }
  });

  router.post("/api/admin/subscriptions/:id/reset-token", (req, res) => {
    try {
      res.json(service.resetToken(req.params.id));
    } catch (error) {
      sendError(res, error);
    }
  });

  router.get("/api/admin/nodes", (_req, res) => {
    res.json({ items: service.nodes() });
  });

  router.get("/api/admin/overview", (_req, res) => {
    res.json(service.overview());
  });

  return router;
}
```

- [ ] **Step 4: Mount admin routes**

Update `server/app.mjs`:

```js
import express from "express";
import { join } from "node:path";
import { createAuthMiddleware } from "./middleware/auth.mjs";
import { adminSubscriptionRoutes } from "./routes/admin-subscriptions.mjs";
import { legacyProxyRoutes } from "./routes/legacy-proxy.mjs";
import { statusRoutes } from "./routes/status.mjs";
import { diagnosticsRoutes } from "./routes/diagnostics.mjs";
import { systemProxyRoutes } from "./routes/system-proxy.mjs";
import { networkRoutes } from "./routes/network.mjs";
import { subscriptionRoutes } from "./routes/subscription.mjs";

const PUBLIC_PATHS = ["/api/health", "/proxy.pac", "/sub/clash.yaml"];

export function createApp(state) {
  const app = express();
  app.use(express.json());

  app.get("/api/health", (_req, res) => {
    res.json({ ok: true, ts: Date.now(), authRequired: true });
  });
  app.use(express.static(join(state.rootDir, "public")));
  app.use(createAuthMiddleware({ token: state.consoleToken, publicPaths: PUBLIC_PATHS }));
  app.get("/api/status", statusRoutes(state));
  app.use(legacyProxyRoutes(state));
  app.use(systemProxyRoutes(state));
  app.use(networkRoutes(state));
  if (state.subscriptions?.service) {
    app.use(adminSubscriptionRoutes(state));
  }
  app.use(subscriptionRoutes(state));
  app.use(diagnosticsRoutes(state));

  return app;
}
```

- [ ] **Step 5: Run admin route tests**

Run:

```powershell
node --test server/tests/admin-subscriptions.test.mjs
```

Expected:

```text
pass 3
fail 0
```

- [ ] **Step 6: Run full test suite**

Run:

```powershell
npm test
```

Expected: existing subscription tests may fail because `/sub/clash.yaml` is now public to the auth middleware but not yet handling missing tokens in the route. Continue to Task 6 before committing if this occurs. If `npm test` still passes, commit now.

- [ ] **Step 7: Commit admin routes if full suite passes**

Run only if `npm test` passed in Step 6:

```powershell
git add server/app.mjs server/routes/admin-subscriptions.mjs server/tests/admin-subscriptions.test.mjs
git commit -m "feat: add subscription admin routes"
```

Expected: commit succeeds.

If `npm test` failed only because `/sub/clash.yaml` route handling is incomplete, leave these files staged or unstaged and proceed to Task 6, then commit Task 5 and Task 6 together as `feat: add subscription admin routes`.

---

### Task 6: Update Subscription Fetch Route For Tenant Tokens

**Files:**
- Modify: `server/routes/subscription.mjs`
- Modify: `server/tests/clash-subscription.test.mjs`
- Modify: `server/tests/admin-subscriptions.test.mjs`

- [ ] **Step 1: Add route tests for tenant-token subscription fetch**

Append this test to `server/tests/admin-subscriptions.test.mjs`:

```js
test("tenant token fetch returns YAML and disabled tenant token returns 403", async () => {
  await withServer(async ({ baseUrl }) => {
    await fetch(`${baseUrl}/api/admin/subscriptions?token=secret`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        displayName: "customer-a",
        expiresAt: "2026-06-21T00:00:00.000Z",
        note: ""
      })
    });

    const yamlResponse = await fetch(`${baseUrl}/sub/clash.yaml?token=pgsub_visible_once_token`);
    assert.equal(yamlResponse.status, 200);
    assert.match(yamlResponse.headers.get("content-type"), /application\/x-yaml/);
    const yaml = await yamlResponse.text();
    assert.match(yaml, /name: "aws-singapore"/);
    assert.match(yaml, /password: "node-secret"/);

    await fetch(`${baseUrl}/api/admin/subscriptions/tenant_1/disable?token=secret`, { method: "POST" });
    const disabled = await fetch(`${baseUrl}/sub/clash.yaml?token=pgsub_visible_once_token`);
    assert.equal(disabled.status, 403);
    assert.deepEqual(await disabled.json(), { error: "Subscription disabled" });
  });
});
```

- [ ] **Step 2: Update existing Clash route test expectations**

In `server/tests/clash-subscription.test.mjs`, keep the existing test name and add explicit missing-token body assertion:

```js
const blocked = await fetch(`${baseUrl}/sub/clash.yaml`);
assert.equal(blocked.status, 401);
assert.deepEqual(await blocked.json(), { error: "Unauthorized" });
```

The rest of the console-token compatibility assertions remain:

```js
const response = await fetch(`${baseUrl}/sub/clash.yaml?token=secret`);
assert.equal(response.status, 200);
assert.match(response.headers.get("content-type"), /application\/x-yaml/);
const yaml = await response.text();
assert.match(yaml, /password: "pw:with#chars"/);
```

- [ ] **Step 3: Run subscription route tests to verify failure**

Run:

```powershell
node --test server/tests/admin-subscriptions.test.mjs server/tests/clash-subscription.test.mjs
```

Expected: tenant-token fetch fails until `server/routes/subscription.mjs` is updated.

- [ ] **Step 4: Implement tenant-token subscription fetch**

Replace `server/routes/subscription.mjs` with:

```js
import { Router } from "express";
import { generateClashSubscription, subscriptionSummary } from "../services/clash-subscription.mjs";

function requestToken(req) {
  return typeof req.query.token === "string" ? req.query.token : "";
}

export function subscriptionRoutes(state) {
  const router = Router();

  router.get("/sub/clash.yaml", (req, res) => {
    const token = requestToken(req);
    if (!token) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    if (token === state.consoleToken) {
      res
        .type("application/x-yaml; charset=utf-8")
        .send(generateClashSubscription(state.proxyConfig));
      return;
    }

    const service = state.subscriptions?.service;
    if (!service) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const result = service.resolveSubscriptionToken(token);
    if (!result.ok) {
      res.status(result.status).json({ error: result.error });
      return;
    }

    res
      .type("application/x-yaml; charset=utf-8")
      .send(generateClashSubscription(result.proxyConfig));
  });

  router.get("/api/subscription/status", (_req, res) => {
    res.json(subscriptionSummary({
      proxyConfig: state.proxyConfig,
      host: state.host,
      consolePort: state.ports.console,
      consoleToken: state.consoleToken
    }));
  });

  return router;
}
```

- [ ] **Step 5: Run subscription route tests**

Run:

```powershell
node --test server/tests/admin-subscriptions.test.mjs server/tests/clash-subscription.test.mjs
```

Expected:

```text
fail 0
```

- [ ] **Step 6: Run full test suite**

Run:

```powershell
npm test
```

Expected: `fail 0`.

- [ ] **Step 7: Commit routes**

If Task 5 was not committed, include its files in this commit:

```powershell
git add server/app.mjs server/routes/admin-subscriptions.mjs server/routes/subscription.mjs server/tests/admin-subscriptions.test.mjs server/tests/clash-subscription.test.mjs
git commit -m "feat: add tenant subscription routes"
```

If Task 5 was already committed:

```powershell
git add server/routes/subscription.mjs server/tests/admin-subscriptions.test.mjs server/tests/clash-subscription.test.mjs
git commit -m "feat: add tenant subscription fetch"
```

Expected: commit succeeds.

---

### Task 7: Wire Subscription Service Into Runtime State

**Files:**
- Modify: `server/state.mjs`
- Modify: `server/tests/state.test.mjs`

- [ ] **Step 1: Add failing state test**

Modify `server/tests/state.test.mjs` so the imports include `rmSync`:

```js
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
```

Then append:

```js
test("createRuntimeState wires subscription service with a temp database", () => {
  const dir = mkdtempSync(join(tmpdir(), "proxy-gateway-subscriptions-"));
  const dbPath = join(dir, "subscriptions.sqlite");

  try {
    const state = createRuntimeState({
      rootDir: new URL("../../", import.meta.url),
      env: { CONSOLE_TOKEN: "secret", SS_PASSWORD: "pw" },
      autoStartHttpProxy: false,
      subscriptionDbPath: dbPath
    });

    assert.equal(state.subscriptions.publicSubscriptionBaseUrl, "http://127.0.0.1:3456");
    assert.equal(typeof state.subscriptions.service.createTenant, "function");
    state.subscriptions.repository.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
```

- [ ] **Step 2: Run state test to verify failure**

Run:

```powershell
node --test server/tests/state.test.mjs
```

Expected: fails because `state.subscriptions` is undefined.

- [ ] **Step 3: Update runtime state imports**

In `server/state.mjs`, add imports:

```js
import { createSubscriptionRepository } from "./services/subscriptions/repository.mjs";
import { createSubscriptionService } from "./services/subscriptions/service.mjs";
```

- [ ] **Step 4: Initialize subscription repository and service**

In `createRuntimeState()`, after `proxyConfig` is created, add:

```js
  const subscriptionDbPath = options.subscriptionDbPath || env.SUBSCRIPTION_DB_PATH || join(rootDir, ".proxy-gateway", "subscriptions.sqlite");
  const publicSubscriptionBaseUrl = (env.PUBLIC_SUBSCRIPTION_BASE_URL || `http://${host}:${consolePort}`).replace(/\/+$/, "");
  const subscriptionRepository = options.subscriptionRepository || createSubscriptionRepository({ dbPath: subscriptionDbPath });
  const subscriptionService = options.subscriptionService || createSubscriptionService({
    repository: subscriptionRepository,
    proxyConfig,
    publicSubscriptionBaseUrl,
    expiringDays: Number.parseInt(env.SUBSCRIPTION_EXPIRING_DAYS, 10) || 7
  });
```

In the returned object, add:

```js
    subscriptions: {
      repository: subscriptionRepository,
      service: subscriptionService,
      publicSubscriptionBaseUrl
    },
```

Place it after `services: { ssLocal, httpProxy },` so runtime dependencies stay grouped.

- [ ] **Step 5: Run state test**

Run:

```powershell
node --test server/tests/state.test.mjs
```

Expected:

```text
fail 0
```

- [ ] **Step 6: Run full test suite**

Run:

```powershell
npm test
```

Expected: `fail 0`.

- [ ] **Step 7: Commit runtime wiring**

Run:

```powershell
git add server/state.mjs server/tests/state.test.mjs
git commit -m "feat: wire subscription runtime state"
```

Expected: commit succeeds.

---

### Task 8: Document Backend Core

**Files:**
- Modify: `README.md`
- Modify: `qa-report.md`

- [ ] **Step 1: Update README**

Add this section after `## Admin Console Shell`:

```markdown
## Subscription Admin Core

The backend subscription-admin core stores operator-managed subscription users in SQLite and serves tenant-specific Clash/Mihomo subscription URLs.

Default database path:

```text
.proxy-gateway/subscriptions.sqlite
```

Optional environment variables:

| Variable | Purpose |
|----------|---------|
| `SUBSCRIPTION_DB_PATH` | Override the SQLite database path |
| `PUBLIC_SUBSCRIPTION_BASE_URL` | Public HTTPS base URL used in visible-once subscription links |
| `SUBSCRIPTION_EXPIRING_DAYS` | Number of days before expiry that returns `expiring` status |

Admin routes use the existing console token. Tenant subscription URLs use tenant tokens generated by create/reset operations.
```

- [ ] **Step 2: Update QA report**

In `qa-report.md`, update the test count to the new total shown by `npm test`, and add a backend-core note:

```markdown
## Subscription Admin Core

- SQLite repository tests: passing
- Token hash and validation tests: passing
- Admin subscription route tests: passing
- Tenant-token subscription fetch tests: passing
- Console-token subscription compatibility: preserved
```

Use the exact test count from the latest `npm test` output.

- [ ] **Step 3: Run full verification**

Run:

```powershell
npm test
```

Expected: `fail 0`.

- [ ] **Step 4: Commit documentation**

Run:

```powershell
git add README.md qa-report.md
git commit -m "docs: document subscription admin core"
```

Expected: commit succeeds.

---

### Task 9: Final Verification And PR

**Files:**
- No code files unless verification reveals a defect.

- [ ] **Step 1: Confirm branch state**

Run:

```powershell
git status -sb
git log --oneline -8
```

Expected: branch is `feat/subscription-admin-core` and no uncommitted files are present.

- [ ] **Step 2: Run full server tests**

Run:

```powershell
npm test
```

Expected:

```text
fail 0
```

- [ ] **Step 3: Run dry package check**

Run:

```powershell
npm run pack:dry-run
```

Expected: command exits with code `0`. Inspect output and confirm no `.proxy-gateway/subscriptions.sqlite` file is included.

- [ ] **Step 4: Push branch**

Run:

```powershell
$env:HTTP_PROXY='http://127.0.0.1:7897'
$env:HTTPS_PROXY='http://127.0.0.1:7897'
$env:ALL_PROXY='socks5://127.0.0.1:7897'
git push -u origin feat/subscription-admin-core
```

Expected: branch pushes successfully.

- [ ] **Step 5: Create draft PR**

Run:

```powershell
$body = @'
## Summary
- adds SQLite-backed subscription tenants
- adds secure tenant token create/reset/validation flow
- adds console-authenticated admin subscription APIs
- preserves console-token subscription compatibility during migration

## Verification
- npm test
- npm run pack:dry-run
'@
gh pr create --draft --base master --head feat/subscription-admin-core --title "Add subscription admin core" --body $body
```

Expected: GitHub returns a PR URL.

---

## Self-Review Checklist

- The backend core does not modify `admin/` frontend files.
- Existing console-token subscription fetch still works.
- Tenant-token fetch uses `state.subscriptions.service.resolveSubscriptionToken()`.
- Raw tenant tokens are only returned in create/reset responses.
- List/get responses never return raw token or token hash.
- SQLite database path defaults to `.proxy-gateway/subscriptions.sqlite`.
- Tests cover unknown, disabled, expired, and valid tenant token behavior.
- `npm test` remains the final required verification.
