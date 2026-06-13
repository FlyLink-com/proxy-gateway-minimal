# Subscription Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Harden subscription delivery by adding temporary subscription links, token-rotation guarantees, `/sub` rate limiting, admin source-IP blocking, and token-safe logging/docs.

**Architecture:** Keep the current Express route boundaries and SQLite subscription domain. Add a temp-link table under the existing repository, extend the subscription service with temp-token resolution, and wrap inbound routes with focused security middleware for client IP resolution, admin allowlisting, and `/sub` rate limiting.

**Tech Stack:** Node.js ESM, Express 5, `node:test`, `better-sqlite3`, Node `crypto`, existing Clash subscription generator, PowerShell verification commands.

---

## Branch Context

Work on the existing branch:

```powershell
cd C:\Users\g\WorkBuddy\2026-05-20-18-07-31\proxy-gateway-minimal
git switch feat/subscription-hardening
git status -sb
```

Expected:

```text
## feat/subscription-hardening...origin/feat/subscription-hardening
```

Continue only when there are no modified or untracked files unless the user has intentionally left changes in the worktree. Do not re-enable the paused domain subscription plan in this branch.

## File Structure

Create:

- `server/services/ip-address.mjs`: normalize IP addresses, decide when `X-Forwarded-For` is trusted, and match IPv4 CIDR ranges.
- `server/middleware/admin-allowlist.mjs`: block `/api/admin/*` requests from sources outside the allowed CIDRs.
- `server/middleware/rate-limit.mjs`: in-memory fixed-window limiter for `/sub`.
- `server/services/redaction.mjs`: redact subscription tokens in request targets, URLs, and bearer auth strings.
- `server/tests/ip-address.test.mjs`: focused tests for IP normalization, proxy trust, and CIDR matching.
- `server/tests/admin-allowlist.test.mjs`: HTTP route tests proving public admin requests are blocked before service handlers.
- `server/tests/rate-limit.test.mjs`: HTTP route tests for `/sub` limit and `Retry-After`.
- `server/tests/redaction.test.mjs`: token redaction helper tests.

Modify:

- `server/services/subscriptions/tokens.mjs`: support primary and temporary token prefixes.
- `server/tests/subscription-token.test.mjs`: prove `pgtmp_` token creation and stored prefix shape.
- `server/services/subscriptions/repository.mjs`: add `subscription_temp_links` schema and temp-link persistence methods.
- `server/tests/subscription-repository.test.mjs`: cover temp-link create/find/mark-used storage.
- `server/services/subscriptions/service.mjs`: create temporary links, resolve temp tokens, preserve tenant status checks, and assert old primary tokens fail after reset.
- `server/tests/subscription-service.test.mjs`: cover temp-link create/resolve/expiry/disabled behavior and reset-token invalidation.
- `server/routes/admin-subscriptions.mjs`: add `POST /api/admin/subscriptions/:id/temp-link`.
- `server/tests/admin-subscriptions.test.mjs`: cover admin temp-link route.
- `server/routes/subscription.mjs`: keep tenant-token fetch behavior while accepting temp-link service results.
- `server/app.mjs`: mount admin allowlist and `/sub` rate limiter at the route boundary.
- `server/state.mjs`: parse hardening environment variables and pass temp-link TTL to the subscription service.
- `server/tests/state.test.mjs`: verify hardening env parsing.
- `README.md`: document the hardening env vars and operational behavior.
- `docs/DOMAIN_HTTPS.md`: document Nginx admin blocking, `$uri` logging, and forwarded IP headers.
- `docs/PROJECT_CONTEXT.md`: update current branch status and next operational step after implementation.
- `qa-report.md`: update test count and verification notes after final test run.

Do not modify:

- `admin/` frontend files.
- `public/index.html`.
- `config/proxy-servers.json`.
- AWS resources or Nginx on the live server during this branch. Deployment is a later operational step.

---

### Task 1: Add Temporary Token Prefix Support

**Files:**
- Modify: `server/services/subscriptions/tokens.mjs`
- Modify: `server/tests/subscription-token.test.mjs`

- [ ] **Step 1: Write the failing token test**

Append this test to `server/tests/subscription-token.test.mjs`:

```js
test("temporary subscription tokens use pgtmp prefix and hash storage shape", () => {
  const bytes = Buffer.alloc(32, 2);
  const created = createSubscriptionToken({
    randomBytesFn: () => bytes,
    prefix: "pgtmp_"
  });
  const expectedRaw = `pgtmp_${bytes.toString("base64url")}`;

  assert.equal(created.rawToken, expectedRaw);
  assert.equal(created.tokenPrefix, expectedRaw.slice(0, 14));
  assert.equal(created.tokenHash, hashSubscriptionToken(expectedRaw));
  assert.equal(verifySubscriptionToken(expectedRaw, created.tokenHash), true);
});
```

- [ ] **Step 2: Run token tests to verify failure**

Run:

```powershell
node --test server/tests/subscription-token.test.mjs
```

Expected: the new test fails because `createSubscriptionToken()` ignores the `prefix` option and still returns a `pgsub_` token.

- [ ] **Step 3: Implement configurable token prefixes**

In `server/services/subscriptions/tokens.mjs`, replace the fixed prefix constant and `createSubscriptionToken()` with:

```js
export const PRIMARY_SUBSCRIPTION_TOKEN_PREFIX = "pgsub_";
export const TEMP_SUBSCRIPTION_TOKEN_PREFIX = "pgtmp_";
const TOKEN_PREFIX_LENGTH = 14;
const SHA256_HEX_PATTERN = /^[a-f0-9]{64}$/i;

export function createSubscriptionToken({
  randomBytesFn = randomBytes,
  prefix = PRIMARY_SUBSCRIPTION_TOKEN_PREFIX
} = {}) {
  const normalizedPrefix = String(prefix || PRIMARY_SUBSCRIPTION_TOKEN_PREFIX);
  const rawToken = `${normalizedPrefix}${randomBytesFn(32).toString("base64url")}`;
  return {
    rawToken,
    tokenHash: hashSubscriptionToken(rawToken),
    tokenPrefix: tokenPrefix(rawToken)
  };
}
```

Keep the existing `hashSubscriptionToken()`, `tokenPrefix()`, and `verifySubscriptionToken()` implementations unchanged except for using the exported constants above.

- [ ] **Step 4: Run token tests**

Run:

```powershell
node --test server/tests/subscription-token.test.mjs
```

Expected:

```text
fail 0
```

- [ ] **Step 5: Run full test suite**

Run:

```powershell
npm test
```

Expected: `fail 0`.

- [ ] **Step 6: Commit token prefix support**

Run:

```powershell
git add server/services/subscriptions/tokens.mjs server/tests/subscription-token.test.mjs
git commit -m "feat: add temporary subscription token prefix"
```

Expected: commit succeeds.

---

### Task 2: Add Temporary Link Storage

**Files:**
- Modify: `server/services/subscriptions/repository.mjs`
- Modify: `server/tests/subscription-repository.test.mjs`

- [ ] **Step 1: Write the failing repository tests**

Append these tests to `server/tests/subscription-repository.test.mjs`. Reuse the existing repository test helper already present in that file.

```js
test("repository creates and finds temporary subscription links by token hash", async () => {
  await withRepository((repository) => {
    repository.createTenant({
      id: "tenant_1",
      displayName: "customer-a",
      status: "active",
      expiresAt: "2026-06-21T00:00:00.000Z",
      note: "",
      nodeId: "aws-singapore",
      credentialMode: "shared-node",
      tokenHash: "primary_hash",
      tokenPrefix: "pgsub_primary",
      now: "2026-05-22T00:00:00.000Z"
    });

    const link = repository.createTempLink({
      id: "temp_1",
      tenantId: "tenant_1",
      tokenHash: "temp_hash",
      tokenPrefix: "pgtmp_temp_1",
      expiresAt: "2026-05-23T00:00:00.000Z",
      now: "2026-05-22T00:00:00.000Z"
    });

    assert.equal(link.id, "temp_1");
    assert.equal(link.tenantId, "tenant_1");
    assert.equal(link.usedAt, null);

    const found = repository.findTempLinkByTokenHash("temp_hash");
    assert.equal(found.id, "temp_1");
    assert.equal(found.tenant.id, "tenant_1");
    assert.equal(found.tenant.tokenHash, "primary_hash");
  });
});

test("repository marks temporary links as used", async () => {
  await withRepository((repository) => {
    repository.createTenant({
      id: "tenant_1",
      displayName: "customer-a",
      status: "active",
      expiresAt: "2026-06-21T00:00:00.000Z",
      note: "",
      nodeId: "aws-singapore",
      credentialMode: "shared-node",
      tokenHash: "primary_hash",
      tokenPrefix: "pgsub_primary",
      now: "2026-05-22T00:00:00.000Z"
    });
    repository.createTempLink({
      id: "temp_1",
      tenantId: "tenant_1",
      tokenHash: "temp_hash",
      tokenPrefix: "pgtmp_temp_1",
      expiresAt: "2026-05-23T00:00:00.000Z",
      now: "2026-05-22T00:00:00.000Z"
    });

    const marked = repository.markTempLinkUsed("temp_1", {
      now: "2026-05-22T01:00:00.000Z"
    });

    assert.equal(marked.usedAt, "2026-05-22T01:00:00.000Z");
    assert.equal(repository.findTempLinkByTokenHash("missing"), null);
  });
});
```

- [ ] **Step 2: Run repository tests to verify failure**

Run:

```powershell
node --test server/tests/subscription-repository.test.mjs
```

Expected: the new tests fail because `createTempLink`, `findTempLinkByTokenHash`, and `markTempLinkUsed` are not defined.

- [ ] **Step 3: Add temp-link mapping helpers**

In `server/services/subscriptions/repository.mjs`, add these helpers after `mapTenantAuth()`:

```js
function mapTempLink(row) {
  if (!row) return null;
  return {
    id: row.id,
    tenantId: row.tenant_id,
    tokenPrefix: row.token_prefix,
    expiresAt: row.expires_at,
    usedAt: row.used_at,
    createdAt: row.created_at
  };
}

function mapTempLinkAuth(row) {
  if (!row) return null;
  return {
    id: row.temp_id,
    tenantId: row.temp_tenant_id,
    tokenHash: row.temp_token_hash,
    tokenPrefix: row.temp_token_prefix,
    expiresAt: row.temp_expires_at,
    usedAt: row.temp_used_at,
    createdAt: row.temp_created_at,
    tenant: mapTenantAuth({
      id: row.tenant_id,
      display_name: row.display_name,
      status: row.status,
      expires_at: row.tenant_expires_at,
      note: row.note,
      node_id: row.node_id,
      credential_mode: row.credential_mode,
      token_hash: row.tenant_token_hash,
      token_prefix: row.tenant_token_prefix,
      last_used_at: row.last_used_at,
      created_at: row.tenant_created_at,
      updated_at: row.updated_at
    })
  };
}
```

- [ ] **Step 4: Add the temp-link table**

Inside the existing `db.exec()` schema block in `server/services/subscriptions/repository.mjs`, after the `subscription_audit_events` table, add:

```sql
    create table if not exists subscription_temp_links (
      id text primary key,
      tenant_id text not null references subscription_tenants(id) on delete cascade,
      token_hash text not null,
      token_prefix text not null,
      expires_at text not null,
      used_at text,
      created_at text not null
    );

    create unique index if not exists subscription_temp_links_token_hash_idx
      on subscription_temp_links(token_hash);
    create index if not exists subscription_temp_links_tenant_id_idx
      on subscription_temp_links(tenant_id);
    create index if not exists subscription_temp_links_expires_at_idx
      on subscription_temp_links(expires_at);
```

- [ ] **Step 5: Implement temp-link repository methods**

In `server/services/subscriptions/repository.mjs`, add these functions after `markLastUsed()`:

```js
  function createTempLink(input) {
    db.prepare(`
      insert into subscription_temp_links (
        id, tenant_id, token_hash, token_prefix, expires_at, used_at, created_at
      ) values (
        @id, @tenantId, @tokenHash, @tokenPrefix, @expiresAt, null, @now
      )
    `).run(input);
    return mapTempLink(db.prepare("select * from subscription_temp_links where id = ?").get(input.id));
  }

  function findTempLinkByTokenHash(tokenHash) {
    return mapTempLinkAuth(db.prepare(`
      select
        l.id as temp_id,
        l.tenant_id as temp_tenant_id,
        l.token_hash as temp_token_hash,
        l.token_prefix as temp_token_prefix,
        l.expires_at as temp_expires_at,
        l.used_at as temp_used_at,
        l.created_at as temp_created_at,
        t.id as tenant_id,
        t.display_name,
        t.status,
        t.expires_at as tenant_expires_at,
        t.note,
        t.node_id,
        t.credential_mode,
        t.token_hash as tenant_token_hash,
        t.token_prefix as tenant_token_prefix,
        t.last_used_at,
        t.created_at as tenant_created_at,
        t.updated_at
      from subscription_temp_links l
      join subscription_tenants t on t.id = l.tenant_id
      where l.token_hash = ?
    `).get(tokenHash));
  }

  function markTempLinkUsed(id, { now }) {
    const result = db.prepare(`
      update subscription_temp_links
      set used_at = ?
      where id = ?
    `).run(now, id);

    if (result.changes !== 1) {
      return null;
    }

    return mapTempLink(db.prepare("select * from subscription_temp_links where id = ?").get(id));
  }
```

Add the three new methods to the returned object:

```js
    createTempLink,
    findTempLinkByTokenHash,
    markTempLinkUsed,
```

- [ ] **Step 6: Run repository tests**

Run:

```powershell
node --test server/tests/subscription-repository.test.mjs
```

Expected:

```text
fail 0
```

- [ ] **Step 7: Run full test suite**

Run:

```powershell
npm test
```

Expected: `fail 0`.

- [ ] **Step 8: Commit temp-link storage**

Run:

```powershell
git add server/services/subscriptions/repository.mjs server/tests/subscription-repository.test.mjs
git commit -m "feat: store temporary subscription links"
```

Expected: commit succeeds.

---

### Task 3: Add Temp-Link Service Workflow And Rotation Tests

**Files:**
- Modify: `server/services/subscriptions/service.mjs`
- Modify: `server/tests/subscription-service.test.mjs`

- [ ] **Step 1: Write service tests for temp links**

In `server/tests/subscription-service.test.mjs`, import `TEMP_SUBSCRIPTION_TOKEN_PREFIX` from `tokens.mjs`:

```js
import {
  TEMP_SUBSCRIPTION_TOKEN_PREFIX,
  hashSubscriptionToken
} from "../services/subscriptions/tokens.mjs";
```

Append these tests. Reuse the existing service helper in the file; if the helper accepts only one token factory today, extend it in Step 3.

```js
test("service creates temporary subscription links and resolves them until expiry", async () => {
  await withService(({ service }) => {
    const created = service.createTenant({
      displayName: "Customer A",
      expiresAt: "2026-06-21T00:00:00.000Z"
    });
    assert.match(created.subscriptionUrl, /token=pgsub_/);

    const temp = service.createTempLink("tenant_1");
    assert.equal(
      temp.subscriptionUrl,
      "https://gateway.example.com/sub/clash.yaml?token=pgtmp_visible_once_token"
    );
    assert.equal(temp.tenant.id, "tenant_1");
    assert.equal(temp.expiresAt, "2026-05-23T00:00:00.000Z");

    const resolved = service.resolveSubscriptionToken("pgtmp_visible_once_token");
    assert.equal(resolved.ok, true);
    assert.equal(resolved.tenant.id, "tenant_1");
    assert.equal(resolved.proxyConfig.servers.length, 1);
    assert.equal(resolved.proxyConfig.servers[0].name, "aws-singapore");
  }, {
    tempRawToken: "pgtmp_visible_once_token",
    tempLinkTtlMinutes: 24 * 60
  });
});

test("service rejects expired temporary subscription links", async () => {
  let current = new Date("2026-05-22T00:00:00.000Z");
  await withService(({ service }) => {
    service.createTenant({
      displayName: "Customer A",
      expiresAt: "2026-06-21T00:00:00.000Z"
    });
    service.createTempLink("tenant_1");

    current = new Date("2026-05-23T00:00:01.000Z");
    assert.deepEqual(service.resolveSubscriptionToken("pgtmp_visible_once_token"), {
      ok: false,
      status: 403,
      error: "Subscription link expired"
    });
  }, {
    nowFn: () => current,
    tempRawToken: "pgtmp_visible_once_token",
    tempLinkTtlMinutes: 24 * 60
  });
});

test("disabled tenants block temporary subscription links", async () => {
  await withService(({ service }) => {
    service.createTenant({
      displayName: "Customer A",
      expiresAt: "2026-06-21T00:00:00.000Z"
    });
    service.createTempLink("tenant_1");
    service.disableTenant("tenant_1");

    assert.deepEqual(service.resolveSubscriptionToken("pgtmp_visible_once_token"), {
      ok: false,
      status: 403,
      error: "Subscription disabled"
    });
  }, {
    tempRawToken: "pgtmp_visible_once_token"
  });
});

test("resetting primary token invalidates the previous primary token without deleting temp links", async () => {
  await withService(({ service }) => {
    service.createTenant({
      displayName: "Customer A",
      expiresAt: "2026-06-21T00:00:00.000Z"
    });
    service.createTempLink("tenant_1");

    service.resetToken("tenant_1");

    assert.deepEqual(service.resolveSubscriptionToken("pgsub_visible_once_token"), {
      ok: false,
      status: 401,
      error: "Unauthorized"
    });
    assert.equal(service.resolveSubscriptionToken("pgsub_rotated_token").ok, true);
    assert.equal(service.resolveSubscriptionToken("pgtmp_visible_once_token").ok, true);
  }, {
    rawTokenSequence: ["pgsub_visible_once_token", "pgsub_rotated_token"],
    tempRawToken: "pgtmp_visible_once_token"
  });
});
```

- [ ] **Step 2: Run service tests to verify failure**

Run:

```powershell
node --test server/tests/subscription-service.test.mjs
```

Expected: the new tests fail because `createTempLink()` and temp-token resolution are missing.

- [ ] **Step 3: Extend the service test helper**

In `server/tests/subscription-service.test.mjs`, make the helper support separate primary and temp tokens:

```js
function tokenFromRaw(rawToken) {
  return {
    rawToken,
    tokenHash: hashSubscriptionToken(rawToken),
    tokenPrefix: rawToken.slice(0, 14)
  };
}

function sequenceTokenFactory(rawTokens) {
  const queue = [...rawTokens];
  return () => tokenFromRaw(queue.shift() || rawTokens.at(-1));
}

function withService(fn, options = {}) {
  const dir = mkdtempSync(join(tmpdir(), "subscription-service-"));
  const repository = createSubscriptionRepository({ dbPath: join(dir, "subscriptions.sqlite") });
  const primaryTokens = options.rawTokenSequence || [options.rawToken || "pgsub_visible_once_token"];
  const currentNowFn = options.nowFn || (() => new Date("2026-05-22T00:00:00.000Z"));
  const service = createSubscriptionService({
    repository,
    proxyConfig,
    publicSubscriptionBaseUrl: "https://gateway.example.com",
    nowFn: currentNowFn,
    tokenFactory: sequenceTokenFactory(primaryTokens),
    tempTokenFactory: () => tokenFromRaw(options.tempRawToken || `${TEMP_SUBSCRIPTION_TOKEN_PREFIX}visible_once_token`),
    idFactory: () => "tenant_1",
    tempLinkIdFactory: () => "temp_1",
    tempLinkTtlMinutes: options.tempLinkTtlMinutes || 24 * 60
  });

  return Promise.resolve()
    .then(() => fn({ service, repository }))
    .finally(() => {
      repository.close();
      rmSync(dir, { recursive: true, force: true });
    });
}
```

Keep any existing helper behavior that other tests depend on by mapping old option names into the `primaryTokens` variable above.

- [ ] **Step 4: Implement temp-link service options**

In `server/services/subscriptions/service.mjs`, import the temp prefix:

```js
import {
  TEMP_SUBSCRIPTION_TOKEN_PREFIX,
  createSubscriptionToken,
  hashSubscriptionToken,
  verifySubscriptionToken
} from "./tokens.mjs";
```

Update `createSubscriptionService()` parameters:

```js
export function createSubscriptionService({
  repository,
  proxyConfig,
  publicSubscriptionBaseUrl,
  nowFn = () => new Date(),
  tokenFactory = () => createSubscriptionToken(),
  tempTokenFactory = () => createSubscriptionToken({ prefix: TEMP_SUBSCRIPTION_TOKEN_PREFIX }),
  idFactory = () => `tenant_${randomUUID()}`,
  tempLinkIdFactory = () => `temp_${randomUUID()}`,
  tempLinkTtlMinutes = 24 * 60,
  expiringDays = DEFAULT_EXPIRING_DAYS
}) {
```

- [ ] **Step 5: Add temp-link serializers and expiry helper**

Inside `createSubscriptionService()`, after `serializeTenant()`, add:

```js
  function serializeTempLink(link, tenant) {
    return {
      id: link.id,
      tenant: serializeTenant(tenant),
      tokenPrefix: link.tokenPrefix,
      expiresAt: link.expiresAt,
      usedAt: link.usedAt,
      createdAt: link.createdAt
    };
  }

  function expiresAtFromNow() {
    const ttlMs = Number(tempLinkTtlMinutes) * 60 * 1000;
    return new Date(nowFn().getTime() + ttlMs).toISOString();
  }

  function resolveTenantAccess(tenantAuth) {
    const status = computeStatus(tenantAuth);
    if (status === "disabled") {
      return { ok: false, status: 403, error: "Subscription disabled" };
    }
    if (status === "expired") {
      return { ok: false, status: 403, error: "Subscription expired" };
    }

    const scopedProxyConfig = cloneProxyConfigForNode(proxyConfig, tenantAuth.nodeId);
    if (scopedProxyConfig.servers.length === 0) {
      return { ok: false, status: 403, error: "Subscription node unavailable" };
    }

    const tenant = repository.markLastUsed(tenantAuth.id, { now: isoNow(nowFn) });
    return {
      ok: true,
      tenant: serializeTenant(tenant),
      proxyConfig: scopedProxyConfig
    };
  }
```

- [ ] **Step 6: Implement `createTempLink()`**

Inside `createSubscriptionService()`, after `resetToken()`, add:

```js
  function createTempLink(id) {
    const tenant = repository.getTenant(id);
    if (!tenant) {
      throw notFoundError(id);
    }

    const token = tempTokenFactory();
    const link = repository.createTempLink({
      id: tempLinkIdFactory(),
      tenantId: id,
      tokenHash: token.tokenHash,
      tokenPrefix: token.tokenPrefix,
      expiresAt: expiresAtFromNow(),
      now: isoNow(nowFn)
    });

    return {
      ...serializeTempLink(link, tenant),
      subscriptionUrl: makeSubscriptionUrl(normalizedPublicSubscriptionBaseUrl, token.rawToken)
    };
  }
```

- [ ] **Step 7: Replace token resolution with primary-plus-temp lookup**

Replace the body of `resolveSubscriptionToken(rawToken)` in `server/services/subscriptions/service.mjs` with:

```js
  function resolveSubscriptionToken(rawToken) {
    const tokenHash = hashSubscriptionToken(rawToken);
    const tenantAuth = repository.findTenantByTokenHash(tokenHash);
    if (tenantAuth && verifySubscriptionToken(rawToken, tenantAuth.tokenHash)) {
      return resolveTenantAccess(tenantAuth);
    }

    const tempLink = repository.findTempLinkByTokenHash(tokenHash);
    if (!tempLink || !verifySubscriptionToken(rawToken, tempLink.tokenHash)) {
      return { ok: false, status: 401, error: "Unauthorized" };
    }

    if (new Date(tempLink.expiresAt).getTime() <= nowFn().getTime()) {
      return { ok: false, status: 403, error: "Subscription link expired" };
    }

    repository.markTempLinkUsed(tempLink.id, { now: isoNow(nowFn) });
    return resolveTenantAccess(tempLink.tenant);
  }
```

Add `createTempLink` to the returned service object:

```js
    createTempLink,
```

- [ ] **Step 8: Run service tests**

Run:

```powershell
node --test server/tests/subscription-service.test.mjs
```

Expected:

```text
fail 0
```

- [ ] **Step 9: Run full test suite**

Run:

```powershell
npm test
```

Expected: `fail 0`.

- [ ] **Step 10: Commit service workflow**

Run:

```powershell
git add server/services/subscriptions/service.mjs server/tests/subscription-service.test.mjs
git commit -m "feat: add temporary subscription links"
```

Expected: commit succeeds.

---

### Task 4: Add Admin Temp-Link Endpoint

**Files:**
- Modify: `server/routes/admin-subscriptions.mjs`
- Modify: `server/tests/admin-subscriptions.test.mjs`

- [ ] **Step 1: Add fake service support**

In `server/tests/admin-subscriptions.test.mjs`, add this method to `fakeService()`:

```js
    createTempLink: (id) => ({
      id: "temp_1",
      tenant: { ...tenant, id },
      tokenPrefix: "pgtmp_route_",
      expiresAt: "2026-05-23T00:00:00.000Z",
      usedAt: null,
      createdAt: "2026-05-22T00:00:00.000Z",
      subscriptionUrl: "https://gateway.example.com/sub/clash.yaml?token=pgtmp_route_token"
    }),
```

- [ ] **Step 2: Write the failing route test**

Append this test to `server/tests/admin-subscriptions.test.mjs`:

```js
test("admin route creates temporary subscription links", async () => {
  const { server, baseUrl } = await listen(createApp(fakeState()));
  try {
    const created = await requestJson(baseUrl, "/api/admin/subscriptions/tenant_1/temp-link", {
      method: "POST"
    });

    assert.equal(created.response.status, 201);
    assert.equal(created.body.id, "temp_1");
    assert.equal(created.body.tenant.id, "tenant_1");
    assert.equal(
      created.body.subscriptionUrl,
      "https://gateway.example.com/sub/clash.yaml?token=pgtmp_route_token"
    );
    assert.doesNotMatch(JSON.stringify(created.body), /tokenHash/);
  } finally {
    server.close();
  }
});
```

- [ ] **Step 3: Run admin route tests to verify failure**

Run:

```powershell
node --test server/tests/admin-subscriptions.test.mjs
```

Expected: the new test fails with `404` because the route is not mounted.

- [ ] **Step 4: Implement the route**

In `server/routes/admin-subscriptions.mjs`, add this handler immediately after the existing reset-token route:

```js
  router.post("/api/admin/subscriptions/:id/temp-link", (req, res) => {
    try {
      res.status(201).json(service.createTempLink(req.params.id));
    } catch (error) {
      sendError(res, error);
    }
  });
```

- [ ] **Step 5: Run admin route tests**

Run:

```powershell
node --test server/tests/admin-subscriptions.test.mjs
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

- [ ] **Step 7: Commit admin route**

Run:

```powershell
git add server/routes/admin-subscriptions.mjs server/tests/admin-subscriptions.test.mjs
git commit -m "feat: expose temporary subscription link API"
```

Expected: commit succeeds.

---

### Task 5: Add Client IP Helper And Admin Allowlist

**Files:**
- Create: `server/services/ip-address.mjs`
- Create: `server/middleware/admin-allowlist.mjs`
- Create: `server/tests/ip-address.test.mjs`
- Create: `server/tests/admin-allowlist.test.mjs`
- Modify: `server/app.mjs`
- Modify: `server/state.mjs`
- Modify: `server/tests/state.test.mjs`

- [ ] **Step 1: Write IP helper tests**

Create `server/tests/ip-address.test.mjs`:

```js
import assert from "node:assert/strict";
import test from "node:test";
import {
  createIpAllowlist,
  isPrivateOrLoopbackIp,
  normalizeIpAddress,
  resolveClientIp
} from "../services/ip-address.mjs";

function request({ remoteAddress, forwardedFor }) {
  return {
    socket: { remoteAddress },
    headers: forwardedFor ? { "x-forwarded-for": forwardedFor } : {}
  };
}

test("normalizeIpAddress handles IPv6 mapped IPv4 and loopback aliases", () => {
  assert.equal(normalizeIpAddress("::ffff:203.0.113.10"), "203.0.113.10");
  assert.equal(normalizeIpAddress("::1"), "::1");
  assert.equal(normalizeIpAddress(" 127.0.0.1 "), "127.0.0.1");
});

test("private and loopback detection covers default admin ranges", () => {
  assert.equal(isPrivateOrLoopbackIp("127.0.0.1"), true);
  assert.equal(isPrivateOrLoopbackIp("10.1.2.3"), true);
  assert.equal(isPrivateOrLoopbackIp("172.16.0.1"), true);
  assert.equal(isPrivateOrLoopbackIp("172.31.255.255"), true);
  assert.equal(isPrivateOrLoopbackIp("192.168.1.5"), true);
  assert.equal(isPrivateOrLoopbackIp("203.0.113.10"), false);
});

test("resolveClientIp trusts X-Forwarded-For only from private or loopback peers", () => {
  assert.equal(resolveClientIp(request({
    remoteAddress: "::ffff:127.0.0.1",
    forwardedFor: "198.51.100.10, 10.0.0.5"
  })), "198.51.100.10");

  assert.equal(resolveClientIp(request({
    remoteAddress: "203.0.113.20",
    forwardedFor: "198.51.100.10"
  })), "203.0.113.20");
});

test("createIpAllowlist matches exact IPv4, IPv4 CIDR, and IPv6 loopback", () => {
  const allowlist = createIpAllowlist(["127.0.0.1", "::1", "10.0.0.0/8", "203.0.113.5/32"]);

  assert.equal(allowlist("127.0.0.1"), true);
  assert.equal(allowlist("::1"), true);
  assert.equal(allowlist("10.9.8.7"), true);
  assert.equal(allowlist("203.0.113.5"), true);
  assert.equal(allowlist("203.0.113.6"), false);
});
```

- [ ] **Step 2: Run IP helper tests to verify failure**

Run:

```powershell
node --test server/tests/ip-address.test.mjs
```

Expected: fails with module-not-found error for `server/services/ip-address.mjs`.

- [ ] **Step 3: Implement IP helper**

Create `server/services/ip-address.mjs`:

```js
import { isIP } from "node:net";

export const DEFAULT_ADMIN_ALLOWED_CIDRS = [
  "127.0.0.1",
  "::1",
  "10.0.0.0/8",
  "172.16.0.0/12",
  "192.168.0.0/16"
];

export function normalizeIpAddress(value) {
  const ip = String(value || "").trim();
  if (ip.startsWith("::ffff:")) {
    return ip.slice("::ffff:".length);
  }
  return ip;
}

function ipv4ToInt(ip) {
  const parts = ip.split(".").map((part) => Number.parseInt(part, 10));
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
    return null;
  }
  return parts.reduce((acc, part) => ((acc << 8) | part) >>> 0, 0);
}

function ipv4InCidr(ip, cidr) {
  const [base, prefixText] = cidr.split("/");
  const prefix = Number.parseInt(prefixText, 10);
  const ipInt = ipv4ToInt(ip);
  const baseInt = ipv4ToInt(base);
  if (ipInt === null || baseInt === null || !Number.isInteger(prefix) || prefix < 0 || prefix > 32) {
    return false;
  }
  const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
  return (ipInt & mask) === (baseInt & mask);
}

export function isPrivateOrLoopbackIp(value) {
  const ip = normalizeIpAddress(value);
  if (ip === "::1") return true;
  const ipInt = ipv4ToInt(ip);
  if (ipInt === null) return false;
  return (
    ipv4InCidr(ip, "127.0.0.0/8") ||
    ipv4InCidr(ip, "10.0.0.0/8") ||
    ipv4InCidr(ip, "172.16.0.0/12") ||
    ipv4InCidr(ip, "192.168.0.0/16")
  );
}

export function resolveClientIp(req) {
  const directIp = normalizeIpAddress(req.socket?.remoteAddress || "");
  const forwarded = req.headers?.["x-forwarded-for"];
  const firstForwarded = Array.isArray(forwarded)
    ? forwarded[0]
    : String(forwarded || "").split(",")[0];
  const forwardedIp = normalizeIpAddress(firstForwarded);

  if (forwardedIp && isPrivateOrLoopbackIp(directIp)) {
    return forwardedIp;
  }

  return directIp;
}

export function createIpAllowlist(entries = DEFAULT_ADMIN_ALLOWED_CIDRS) {
  const rules = entries.map((entry) => String(entry).trim()).filter(Boolean);
  return (value) => {
    const ip = normalizeIpAddress(value);
    if (!isIP(ip)) return false;
    return rules.some((rule) => {
      if (rule.includes("/") && isIP(rule.split("/")[0]) === 4) {
        return ipv4InCidr(ip, rule);
      }
      return normalizeIpAddress(rule) === ip;
    });
  };
}
```

- [ ] **Step 4: Run IP helper tests**

Run:

```powershell
node --test server/tests/ip-address.test.mjs
```

Expected:

```text
fail 0
```

- [ ] **Step 5: Write admin allowlist route tests**

Create `server/tests/admin-allowlist.test.mjs`:

```js
import assert from "node:assert/strict";
import test from "node:test";
import { createApp } from "../app.mjs";
import { listen } from "./helpers/listen.mjs";

function state() {
  return {
    rootDir: new URL("../../", import.meta.url).pathname,
    host: "127.0.0.1",
    ports: { console: 3456, socks: 1080, httpProxy: 18180 },
    consoleToken: "secret",
    proxyConfig: { servers: [], pingHosts: [], nginx: {} },
    services: {
      ssLocal: { status: () => ({ running: false }) },
      httpProxy: { status: () => ({ running: false }) }
    },
    subscriptions: {
      service: {
        listTenants: () => [{ id: "tenant_1" }]
      }
    },
    security: {
      adminAllowedCidrs: ["127.0.0.1/32", "10.0.0.0/8"],
      subRateLimit: { windowMs: 60000, max: 30 }
    },
    isPortListening: async () => false,
    runCommand: async () => ({ ok: true, stdout: "", stderr: "", code: 0, timedOut: false })
  };
}

test("admin allowlist blocks public source IP before service handlers run", async () => {
  const app = createApp(state(), { clientIpResolver: () => "203.0.113.10" });
  const { server, baseUrl } = await listen(app);
  try {
    const response = await fetch(`${baseUrl}/api/admin/subscriptions?token=secret`);
    assert.equal(response.status, 403);
    assert.deepEqual(await response.json(), { error: "Forbidden" });
  } finally {
    server.close();
  }
});

test("admin allowlist permits configured private source IP and console auth still applies", async () => {
  const app = createApp(state(), { clientIpResolver: () => "10.0.0.8" });
  const { server, baseUrl } = await listen(app);
  try {
    const unauthorized = await fetch(`${baseUrl}/api/admin/subscriptions`);
    assert.equal(unauthorized.status, 401);

    const response = await fetch(`${baseUrl}/api/admin/subscriptions?token=secret`);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { items: [{ id: "tenant_1" }] });
  } finally {
    server.close();
  }
});
```

- [ ] **Step 6: Run admin allowlist tests to verify failure**

Run:

```powershell
node --test server/tests/admin-allowlist.test.mjs
```

Expected: fails because `createApp()` does not accept `clientIpResolver` and no allowlist middleware exists.

- [ ] **Step 7: Implement admin allowlist middleware**

Create `server/middleware/admin-allowlist.mjs`:

```js
import { DEFAULT_ADMIN_ALLOWED_CIDRS, createIpAllowlist, resolveClientIp } from "../services/ip-address.mjs";

export function createAdminAllowlistMiddleware({
  allowedCidrs = DEFAULT_ADMIN_ALLOWED_CIDRS,
  resolveClientIpFn = resolveClientIp
} = {}) {
  const isAllowed = createIpAllowlist(allowedCidrs);

  return (req, res, next) => {
    const clientIp = resolveClientIpFn(req);
    if (!isAllowed(clientIp)) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
    next();
  };
}
```

- [ ] **Step 8: Wire admin allowlist into the app**

In `server/app.mjs`, add imports:

```js
import { createAdminAllowlistMiddleware } from "./middleware/admin-allowlist.mjs";
import { resolveClientIp } from "./services/ip-address.mjs";
```

Change the function signature:

```js
export function createApp(state, options = {}) {
```

After `app.use(express.static(join(state.rootDir, "public")));`, add:

```js
  const clientIpResolver = options.clientIpResolver || resolveClientIp;
  const security = state.security || {};
  app.use("/api/admin", createAdminAllowlistMiddleware({
    allowedCidrs: security.adminAllowedCidrs,
    resolveClientIpFn: clientIpResolver
  }));
```

Leave the existing `createAuthMiddleware()` call after this block so disallowed public admin requests return `403` before console token validation.

- [ ] **Step 9: Parse admin CIDR env in runtime state**

In `server/state.mjs`, import `DEFAULT_ADMIN_ALLOWED_CIDRS`:

```js
import { DEFAULT_ADMIN_ALLOWED_CIDRS } from "./services/ip-address.mjs";
```

Add this helper near the other top-level helpers:

```js
function parseCsv(value, fallback) {
  const items = String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  return items.length > 0 ? items : fallback;
}
```

In `createRuntimeState()`, after `publicSubscriptionBaseUrl`, add:

```js
  const adminAllowedCidrs = parseCsv(env.ADMIN_ALLOWED_CIDRS, DEFAULT_ADMIN_ALLOWED_CIDRS);
```

Add `security` to the returned state object:

```js
    security: {
      adminAllowedCidrs,
      subRateLimit: {
        windowMs: Number.parseInt(env.SUB_RATE_LIMIT_WINDOW_MS, 10) || 60000,
        max: Number.parseInt(env.SUB_RATE_LIMIT_MAX, 10) || 30
      }
    },
```

Place it near `subscriptions` in the returned object.

- [ ] **Step 10: Add state env assertions**

Append this test to `server/tests/state.test.mjs`:

```js
test("createRuntimeState parses hardening security environment", () => {
  const state = createRuntimeState({
    rootDir: new URL("../../", import.meta.url),
    env: {
      CONSOLE_TOKEN: "secret",
      SS_PASSWORD: "pw",
      ADMIN_ALLOWED_CIDRS: "127.0.0.1/32,10.0.0.0/8",
      SUB_RATE_LIMIT_WINDOW_MS: "1000",
      SUB_RATE_LIMIT_MAX: "2"
    },
    autoStartHttpProxy: false,
    subscriptionDbPath: ":memory:"
  });

  try {
    assert.deepEqual(state.security.adminAllowedCidrs, ["127.0.0.1/32", "10.0.0.0/8"]);
    assert.deepEqual(state.security.subRateLimit, { windowMs: 1000, max: 2 });
  } finally {
    state.close();
  }
});
```

- [ ] **Step 11: Run admin allowlist and state tests**

Run:

```powershell
node --test server/tests/ip-address.test.mjs server/tests/admin-allowlist.test.mjs server/tests/state.test.mjs
```

Expected:

```text
fail 0
```

- [ ] **Step 12: Run full test suite**

Run:

```powershell
npm test
```

Expected: `fail 0`.

- [ ] **Step 13: Commit admin allowlist**

Run:

```powershell
git add server/services/ip-address.mjs server/middleware/admin-allowlist.mjs server/tests/ip-address.test.mjs server/tests/admin-allowlist.test.mjs server/app.mjs server/state.mjs server/tests/state.test.mjs
git commit -m "feat: block public admin requests"
```

Expected: commit succeeds.

---

### Task 6: Add `/sub` Rate Limiting

**Files:**
- Create: `server/middleware/rate-limit.mjs`
- Create: `server/tests/rate-limit.test.mjs`
- Modify: `server/app.mjs`

- [ ] **Step 1: Write rate limit route tests**

Create `server/tests/rate-limit.test.mjs`:

```js
import assert from "node:assert/strict";
import test from "node:test";
import { createApp } from "../app.mjs";
import { listen } from "./helpers/listen.mjs";

function state() {
  return {
    rootDir: new URL("../../", import.meta.url).pathname,
    host: "127.0.0.1",
    ports: { console: 3456, socks: 1080, httpProxy: 18180 },
    consoleToken: "secret",
    proxyConfig: {
      servers: [
        {
          name: "aws-singapore",
          host: "203.0.113.10",
          port: 18388,
          method: "aes-256-gcm",
          password: "shared-secret"
        }
      ],
      pingHosts: [],
      nginx: {}
    },
    services: {
      ssLocal: { status: () => ({ running: false }) },
      httpProxy: { status: () => ({ running: false }) }
    },
    subscriptions: {
      service: {
        resolveSubscriptionToken: () => ({ ok: false, status: 401, error: "Unauthorized" })
      }
    },
    security: {
      adminAllowedCidrs: ["127.0.0.1/32"],
      subRateLimit: { windowMs: 1000, max: 2 }
    },
    isPortListening: async () => false,
    runCommand: async () => ({ ok: true, stdout: "", stderr: "", code: 0, timedOut: false })
  };
}

test("/sub rate limit returns 429 with Retry-After", async () => {
  let now = 1000;
  const app = createApp(state(), {
    clientIpResolver: () => "198.51.100.10",
    rateLimitNowFn: () => now
  });
  const { server, baseUrl } = await listen(app);
  try {
    const first = await fetch(`${baseUrl}/sub/clash.yaml?token=bad`);
    assert.equal(first.status, 401);
    const second = await fetch(`${baseUrl}/sub/clash.yaml?token=bad`);
    assert.equal(second.status, 401);

    const limited = await fetch(`${baseUrl}/sub/clash.yaml?token=bad`);
    assert.equal(limited.status, 429);
    assert.equal(limited.headers.get("retry-after"), "1");
    assert.deepEqual(await limited.json(), { error: "Too Many Requests" });

    now = 2101;
    const afterWindow = await fetch(`${baseUrl}/sub/clash.yaml?token=bad`);
    assert.equal(afterWindow.status, 401);
  } finally {
    server.close();
  }
});

test("/sub rate limit keys by resolved client IP", async () => {
  let ip = "198.51.100.10";
  const app = createApp(state(), {
    clientIpResolver: () => ip,
    rateLimitNowFn: () => 1000
  });
  const { server, baseUrl } = await listen(app);
  try {
    assert.equal((await fetch(`${baseUrl}/sub/clash.yaml?token=bad`)).status, 401);
    assert.equal((await fetch(`${baseUrl}/sub/clash.yaml?token=bad`)).status, 401);
    assert.equal((await fetch(`${baseUrl}/sub/clash.yaml?token=bad`)).status, 429);

    ip = "198.51.100.11";
    assert.equal((await fetch(`${baseUrl}/sub/clash.yaml?token=bad`)).status, 401);
  } finally {
    server.close();
  }
});
```

- [ ] **Step 2: Run rate limit tests to verify failure**

Run:

```powershell
node --test server/tests/rate-limit.test.mjs
```

Expected: fails because the limiter middleware is not mounted.

- [ ] **Step 3: Implement rate limiter middleware**

Create `server/middleware/rate-limit.mjs`:

```js
import { resolveClientIp } from "../services/ip-address.mjs";

export function createRateLimitMiddleware({
  windowMs = 60000,
  max = 30,
  nowFn = () => Date.now(),
  keyFn = resolveClientIp
} = {}) {
  const buckets = new Map();

  function prune(now) {
    for (const [key, bucket] of buckets) {
      if (bucket.resetAt <= now) {
        buckets.delete(key);
      }
    }
  }

  return (req, res, next) => {
    const now = nowFn();
    prune(now);

    const key = keyFn(req) || "unknown";
    const existing = buckets.get(key);
    const bucket = existing && existing.resetAt > now
      ? existing
      : { count: 0, resetAt: now + windowMs };

    bucket.count += 1;
    buckets.set(key, bucket);

    if (bucket.count > max) {
      const retryAfter = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
      res.set("Retry-After", String(retryAfter));
      res.status(429).json({ error: "Too Many Requests" });
      return;
    }

    next();
  };
}
```

- [ ] **Step 4: Mount rate limiter before subscription routes**

In `server/app.mjs`, add import:

```js
import { createRateLimitMiddleware } from "./middleware/rate-limit.mjs";
```

After the existing network routes and before `app.use(subscriptionRoutes(state));`, add:

```js
  app.use("/sub", createRateLimitMiddleware({
    windowMs: security.subRateLimit?.windowMs,
    max: security.subRateLimit?.max,
    nowFn: options.rateLimitNowFn,
    keyFn: clientIpResolver
  }));
```

Keep this before `subscriptionRoutes(state)` so invalid-token scans are limited. Keep it after global auth because `/sub/clash.yaml` is already a public path in `PUBLIC_PATHS`.

- [ ] **Step 5: Run rate limit tests**

Run:

```powershell
node --test server/tests/rate-limit.test.mjs
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

- [ ] **Step 7: Commit rate limiting**

Run:

```powershell
git add server/middleware/rate-limit.mjs server/tests/rate-limit.test.mjs server/app.mjs
git commit -m "feat: rate limit subscription fetches"
```

Expected: commit succeeds.

---

### Task 7: Add Redaction Helper And Nginx Runbook Updates

**Files:**
- Create: `server/services/redaction.mjs`
- Create: `server/tests/redaction.test.mjs`
- Modify: `docs/DOMAIN_HTTPS.md`
- Modify: `README.md`

- [ ] **Step 1: Write redaction tests**

Create `server/tests/redaction.test.mjs`:

```js
import assert from "node:assert/strict";
import test from "node:test";
import {
  redactAuthorizationHeader,
  redactRequestTarget
} from "../services/redaction.mjs";

test("redactRequestTarget redacts token query values and preserves diagnostics", () => {
  assert.equal(
    redactRequestTarget("/sub/clash.yaml?token=pgsub_secret&client=clash"),
    "/sub/clash.yaml?token=[redacted]&client=clash"
  );
  assert.equal(
    redactRequestTarget("https://gateway.example.com/sub/clash.yaml?token=pgtmp_secret"),
    "https://gateway.example.com/sub/clash.yaml?token=[redacted]"
  );
});

test("redactRequestTarget leaves non-token URLs readable", () => {
  assert.equal(redactRequestTarget("/api/health?probe=1"), "/api/health?probe=1");
});

test("redactAuthorizationHeader redacts bearer tokens", () => {
  assert.equal(redactAuthorizationHeader("Bearer pgsub_secret"), "Bearer [redacted]");
  assert.equal(redactAuthorizationHeader("Basic abc"), "Basic abc");
  assert.equal(redactAuthorizationHeader(""), "");
});
```

- [ ] **Step 2: Run redaction tests to verify failure**

Run:

```powershell
node --test server/tests/redaction.test.mjs
```

Expected: fails with module-not-found error for `server/services/redaction.mjs`.

- [ ] **Step 3: Implement redaction helper**

Create `server/services/redaction.mjs`:

```js
const REDACTED = "[redacted]";

export function redactRequestTarget(value) {
  const raw = String(value || "");
  if (!raw) return raw;

  try {
    const url = raw.startsWith("http://") || raw.startsWith("https://")
      ? new URL(raw)
      : new URL(raw, "http://local.invalid");

    if (url.searchParams.has("token")) {
      url.searchParams.set("token", REDACTED);
    }

    const output = raw.startsWith("http://") || raw.startsWith("https://")
      ? url.toString()
      : `${url.pathname}${url.search}${url.hash}`;

    return output.replace(/token=%5Bredacted%5D/gi, "token=[redacted]");
  } catch {
    return raw.replace(/([?&]token=)[^&\s]+/gi, `$1${REDACTED}`);
  }
}
```

Then add the authorization helper:

```js
export function redactAuthorizationHeader(value) {
  const raw = String(value || "");
  return raw.replace(/^Bearer\s+.+$/i, "Bearer [redacted]");
}
```

- [ ] **Step 4: Run redaction tests**

Run:

```powershell
node --test server/tests/redaction.test.mjs
```

Expected:

```text
fail 0
```

- [ ] **Step 5: Update Nginx runbook**

In `docs/DOMAIN_HTTPS.md`, add this operations checklist under the Nginx configuration section:

````markdown
### Subscription Hardening Checklist

Keep `/api/admin` private at Nginx unless a specific operator source IP is configured:

```nginx
location /api/admin/ {
    deny all;
}
```

When proxying subscription fetches, forward the original client address:

```nginx
location = /sub/clash.yaml {
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_pass http://127.0.0.1:3456;
}
```

Use `$uri` instead of `$request_uri` in access logs so query strings and `token=` values are not written:

```nginx
log_format proxy_gateway '$remote_addr - $remote_user [$time_local] "$request_method $uri $server_protocol" '
                         '$status $body_bytes_sent "$http_referer" "$http_user_agent"';
```
````

- [ ] **Step 6: Update README hardening env section**

In `README.md`, extend the subscription admin/core environment table with these rows:

```markdown
| `SUBSCRIPTION_TEMP_LINK_TTL_MINUTES` | Temporary subscription link lifetime in minutes, defaults to `1440` |
| `SUB_RATE_LIMIT_WINDOW_MS` | `/sub` rate-limit window in milliseconds, defaults to `60000` |
| `SUB_RATE_LIMIT_MAX` | `/sub` requests allowed per client IP per window, defaults to `30` |
| `ADMIN_ALLOWED_CIDRS` | Comma-separated admin source allowlist, defaults to loopback and RFC1918 private ranges |
```

Add this paragraph after the table:

```markdown
Temporary links use `pgtmp_` tokens and resolve through the same `/sub/clash.yaml` endpoint as primary `pgsub_` tokens. Admin APIs remain console-token protected and are additionally source-IP allowlisted in the app.
```

- [ ] **Step 7: Run redaction and full tests**

Run:

```powershell
node --test server/tests/redaction.test.mjs
npm test
```

Expected: both commands exit with `fail 0`.

- [ ] **Step 8: Commit redaction and docs**

Run:

```powershell
git add server/services/redaction.mjs server/tests/redaction.test.mjs docs/DOMAIN_HTTPS.md README.md
git commit -m "docs: document subscription hardening operations"
```

Expected: commit succeeds.

---

### Task 8: Wire Temp-Link TTL Env And Final Documentation

**Files:**
- Modify: `server/state.mjs`
- Modify: `server/tests/state.test.mjs`
- Modify: `docs/PROJECT_CONTEXT.md`
- Modify: `qa-report.md`

- [ ] **Step 1: Add state test for temp-link TTL**

In the hardening state test added in Task 5, add `SUBSCRIPTION_TEMP_LINK_TTL_MINUTES` to the env:

```js
      SUBSCRIPTION_TEMP_LINK_TTL_MINUTES: "30",
```

Then add this assertion before `state.close()`:

```js
    assert.equal(state.subscriptions.tempLinkTtlMinutes, 30);
```

- [ ] **Step 2: Run state test to verify failure**

Run:

```powershell
node --test server/tests/state.test.mjs
```

Expected: fails because `state.subscriptions.tempLinkTtlMinutes` is not returned.

- [ ] **Step 3: Parse temp-link TTL in runtime state**

In `server/state.mjs`, after `adminAllowedCidrs`, add:

```js
  const tempLinkTtlMinutes = Number.parseInt(env.SUBSCRIPTION_TEMP_LINK_TTL_MINUTES, 10) || 24 * 60;
```

Pass the value into `createSubscriptionService()`:

```js
    tempLinkTtlMinutes,
```

Add it to returned `subscriptions`:

```js
      tempLinkTtlMinutes,
```

- [ ] **Step 4: Run state test**

Run:

```powershell
node --test server/tests/state.test.mjs
```

Expected:

```text
fail 0
```

- [ ] **Step 5: Update project context**

In `docs/PROJECT_CONTEXT.md`, update the active stage section to this content:

```markdown
## Current Stage

- Active branch: `feat/subscription-hardening`
- Domain-based subscription exposure remains paused.
- Nginx stays in front of the app as the gateway protection layer.
- This branch adds temporary `pgtmp_` subscription links, explicit primary-token rotation tests, `/sub` rate limiting, app-level `/api/admin` source-IP allowlisting, and token redaction guidance.
- Deployment to AWS Singapore `47.129.247.102` is a separate operations step after merge.
```

- [ ] **Step 6: Update QA report**

After running `npm test`, update `qa-report.md` with the exact total test count from the latest output and add:

```markdown
## Subscription Hardening

- Temporary subscription token prefix tests: passing
- Temporary link repository and service tests: passing
- Primary token reset invalidation test: passing
- Admin temporary-link route test: passing
- Admin source-IP allowlist tests: passing
- `/sub` rate-limit tests: passing
- Redaction helper tests: passing
```

- [ ] **Step 7: Run final local verification**

Run:

```powershell
npm test
npm run pack:dry-run
git status -sb
```

Expected:

```text
fail 0
```

`npm run pack:dry-run` exits with code `0`, and `git status -sb` shows only the intentional documentation changes if Step 6 was just edited.

- [ ] **Step 8: Commit final docs and state wiring**

Run:

```powershell
git add server/state.mjs server/tests/state.test.mjs docs/PROJECT_CONTEXT.md qa-report.md
git commit -m "chore: finish subscription hardening verification"
```

Expected: commit succeeds.

---

### Task 9: Branch Verification And Push

**Files:**
- No source edits unless verification reveals a defect.

- [ ] **Step 1: Confirm branch and recent commits**

Run:

```powershell
git status -sb
git log --oneline -10
```

Expected: branch is `feat/subscription-hardening` and the worktree is clean.

- [ ] **Step 2: Run full test suite**

Run:

```powershell
npm test
```

Expected:

```text
fail 0
```

- [ ] **Step 3: Run package dry run**

Run:

```powershell
npm run pack:dry-run
```

Expected: command exits with code `0`. Confirm the package includes `server/middleware`, `server/services`, docs listed in `package.json`, and no `.proxy-gateway/subscriptions.sqlite` runtime database.

- [ ] **Step 4: Push branch**

Run:

```powershell
$env:HTTP_PROXY='http://127.0.0.1:7897'
$env:HTTPS_PROXY='http://127.0.0.1:7897'
$env:ALL_PROXY='socks5://127.0.0.1:7897'
git push
```

Expected: `origin/feat/subscription-hardening` updates successfully.

- [ ] **Step 5: Prepare handoff summary**

Use this summary in the final branch handoff:

```markdown
## Summary
- Added short-lived `pgtmp_` temporary subscription links and admin creation API.
- Proved reset-token invalidates the previous primary `pgsub_` token.
- Added `/sub` rate limiting keyed by resolved client IP.
- Added app-level `/api/admin` source-IP allowlist.
- Added token redaction helpers and Nginx runbook guidance to avoid logging subscription tokens.

## Verification
- `npm test`
- `npm run pack:dry-run`
```

---

## Self-Review Checklist

- Every requirement from `docs/superpowers/specs/2026-05-22-subscription-hardening-design.md` maps to a task above.
- Temporary links use `pgtmp_` and do not reveal or rotate the tenant primary token.
- Expired temporary links return status `403` and body `{ "error": "Subscription link expired" }`.
- Unknown primary and temporary tokens return `401`.
- Disabled and expired tenants block primary and temporary tokens.
- Resetting the primary token invalidates the old primary token immediately.
- `/sub` rate limiting returns `429`, JSON `{ "error": "Too Many Requests" }`, and `Retry-After`.
- Admin public access is blocked by app middleware before admin route handlers run.
- `X-Forwarded-For` is trusted only when the direct peer is loopback or private.
- Redaction helper removes `token` query values and bearer secrets.
- Nginx docs use `$uri`, not `$request_uri`, for token-safe access logs.
- `npm test` and `npm run pack:dry-run` are final required verification commands.
