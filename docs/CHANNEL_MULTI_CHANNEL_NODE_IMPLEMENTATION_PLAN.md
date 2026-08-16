# Multi-Channel Node Guard Implementation Plan

Last updated: 2026-08-16.

```yaml
document_metadata:
  doc_type: canonical
  lifecycle: active
  authority_scope: multi_channel_node_implementation_plan
  superseded_by: null
  last_verified_at: 2026-08-16
  production_authority: false
```


> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add repository-level guards so one physical edge node can own multiple logical subscription channels while retired or deprecated node labels cannot re-enter automatic portal issuance.

**Architecture:** Keep the existing renderer model where each logical channel is one `proxyConfig.servers[]` record. Extend node normalization with safe lifecycle and `physicalNodeRef` metadata, expand the stable-pool policy check, and add a small portal auto-issuance target resolver that fails closed before any subscription is issued.

**Tech Stack:** Node.js ESM, `node:test`, existing `gccgw` CLI router, Subscription V2 node registry, portal access-request services, Clash/Mihomo renderer contracts.

---

## Risk And Scope

Risk: B for repository code and tests in Tasks 1-5.

Risk: A for Task 6 production stopgap execution. Task 6 is not authorized by this plan and requires a separate exact operator approval.

Production/AWS impact: none for Tasks 1-5. No DNS, Nginx, firewall, systemd, runtime env, protected config, account, password, token, subscription URL, payment, or live order mutation is allowed during repository implementation.

Expected PR count: one repository PR for Tasks 1-5. Task 6 must be a separate A-tier execution record after approval.

Validation: `git diff --check`, targeted `node --test ...`, then `npm test`. Admin tests are not required unless implementation touches `admin/`.

---

## File Structure

- Modify: `server/services/subscriptions/node-registry.mjs`
  - Responsibility: normalize safe lifecycle, `physicalNodeRef`, `generation`, and channel metadata; exclude blocked lifecycle states from assignment eligibility.
- Create: `server/tests/subscription-node-registry.test.mjs`
  - Responsibility: prove one physical node can have multiple logical channels and lifecycle gates override `status=online`.
- Modify: `server/services/subscriptions/channel-policy.mjs`
  - Responsibility: add redacted blockers for retired/deprecated stable records, active production channels missing `physicalNodeRef`, and UDP/QUIC default-stable violations.
- Modify: `server/tests/subscription-channel-policy.test.mjs`
  - Responsibility: cover lifecycle and `physicalNodeRef` blockers without leaking runtime values.
- Create: `server/services/platform/portal-auto-issuance-node-policy.mjs`
  - Responsibility: resolve an automatic portal issuance target channel without fallback to stale labels.
- Create: `server/tests/platform-portal-auto-issuance-node-policy.test.mjs`
  - Responsibility: prove missing, retired, deprecated, canary-without-approval, generation-mismatch, and missing-physical-ref targets fail closed.
- Modify: `server/services/cli/router.mjs`
  - Responsibility: keep `gccgw node policy-check --json` output redacted and include lifecycle blockers through the existing command path.
- Modify: `server/tests/cli-router.test.mjs`
  - Responsibility: assert the policy-check command reports lifecycle blockers and does not print endpoint or credential material.
- Modify: `docs/CHANNEL_STRATEGY_ENGINE.md`
  - Responsibility: link the current strategy contract to the new multi-channel node guard.
- Modify: `docs/NODE_REGISTRATION_AND_POOL_CONTRACT.md`
  - Responsibility: add `deprecated` lifecycle and `physicalNodeRef` guidance consistent with the new design.

---

## Task 1: Node Registry Lifecycle And Physical-Node Metadata

**Files:**
- Modify: `server/services/subscriptions/node-registry.mjs`
- Create: `server/tests/subscription-node-registry.test.mjs`

- [ ] **Step 1: Write failing node-registry tests**

Create `server/tests/subscription-node-registry.test.mjs`:

```js
import assert from "node:assert/strict";
import test from "node:test";
import { createNodeRegistry, normalizeNode } from "../services/subscriptions/node-registry.mjs";

function multiChannelConfig() {
  return {
    servers: [
      {
        id: "channel_current_tuic",
        name: "channel-current-tuic",
        protocol: "tuic",
        host: "tuic.example.test",
        port: 443,
        uuid: "11111111-1111-4111-8111-111111111111",
        password: "tuic-test-secret",
        lifecycle: "active",
        channelPool: "canary",
        channelRole: "base",
        physicalNodeRef: "edge-current-01",
        generation: "current-20260605"
      },
      {
        id: "channel_current_h2",
        name: "channel-current-h2",
        protocol: "vless",
        network: "h2",
        host: "h2.example.test",
        port: 443,
        uuid: "22222222-2222-4222-8222-222222222222",
        lifecycle: "active",
        channelPool: "stable",
        channelRole: "stable-candidate",
        physicalNodeRef: "edge-current-01",
        generation: "current-20260605",
        strategyPriority: 10
      },
      {
        id: "old_prod_edge_a",
        name: "prod-edge-a",
        protocol: "ss",
        host: "old-a.example.test",
        port: 18388,
        method: "aes-256-gcm",
        password: "old-a-test-secret",
        lifecycle: "retired",
        channelPool: "stable",
        physicalNodeRef: "edge-old-01",
        generation: "retired-202605"
      },
      {
        id: "old_prod_edge_b",
        name: "prod-edge-b",
        protocol: "ss",
        host: "old-b.example.test",
        port: 18389,
        method: "aes-256-gcm",
        password: "old-b-test-secret",
        lifecycle: "deprecated",
        channelPool: "stable",
        physicalNodeRef: "edge-old-02",
        generation: "deprecated-202605"
      }
    ]
  };
}

test("normalizeNode exposes safe multi-channel metadata and blocks retired lifecycle", () => {
  const current = normalizeNode(multiChannelConfig().servers[0], 0);
  assert.equal(current.id, "channel_current_tuic");
  assert.equal(current.name, "channel-current-tuic");
  assert.equal(current.lifecycle, "active");
  assert.equal(current.physicalNodeRef, "edge-current-01");
  assert.equal(current.generation, "current-20260605");
  assert.equal(current.channelRole, "base");
  assert.equal(current.subscriptionEligible, true);

  const retired = normalizeNode(multiChannelConfig().servers[2], 2);
  assert.equal(retired.status, "online");
  assert.equal(retired.lifecycle, "retired");
  assert.equal(retired.subscriptionEligible, false);
  assert.equal(retired.reason, "");
});

test("node registry keeps same physical node channels separate and excludes deprecated labels from assignment", () => {
  const registry = createNodeRegistry({ proxyConfig: multiChannelConfig() });

  assert.deepEqual(
    registry.defaultSubscriptionServers().map((server) => server.name),
    ["channel-current-h2"]
  );
  assert.equal(registry.resolveAssignableNode("channel-current-tuic")?.name, "channel-current-tuic");
  assert.equal(registry.resolveAssignableNode("channel-current-h2")?.name, "channel-current-h2");
  assert.equal(registry.resolveAssignableNode("prod-edge-a"), null);
  assert.equal(registry.resolveAssignableNode("prod-edge-b"), null);

  const safeNodes = registry.listSafeNodes();
  const samePhysical = safeNodes.filter((node) => node.physicalNodeRef === "edge-current-01");
  assert.deepEqual(samePhysical.map((node) => node.name), ["channel-current-tuic", "channel-current-h2"]);
  assert.doesNotMatch(JSON.stringify(safeNodes), /tuic-test-secret|old-a-test-secret|old-b-test-secret|tuic\.example\.test|old-a\.example\.test/);
});
```

- [ ] **Step 2: Run the test and confirm it fails**

Run:

```powershell
node --test server/tests/subscription-node-registry.test.mjs
```

Expected: FAIL because `normalizeNode` does not yet expose `lifecycle`, `physicalNodeRef`, `generation`, or `channelRole`, and retired/deprecated nodes are still treated as assignment-eligible.

- [ ] **Step 3: Implement lifecycle and metadata normalization**

Modify `server/services/subscriptions/node-registry.mjs`:

```js
const DEFAULT_STATUS = "online";
const DEFAULT_CHANNEL_POOL = "stable";
const DEFAULT_LIFECYCLE = "active";
const CHANNEL_POOLS = new Set(["stable", "private", "canary", "recovery"]);
const LIFECYCLES = new Set([
  "planned",
  "private-validation",
  "canary",
  "active",
  "maintenance",
  "deprecated",
  "retired"
]);
const BLOCKED_LIFECYCLES = new Set([
  "planned",
  "private-validation",
  "maintenance",
  "deprecated",
  "retired"
]);
```

Add these helpers below `metadataToken`:

```js
function normalizedLifecycle(server) {
  const explicit = metadataToken(server.lifecycle || server.lifecycleStatus || server.nodeLifecycle);
  if (LIFECYCLES.has(explicit)) return explicit;
  const status = metadataToken(server.status);
  if (status === "maintenance") return "maintenance";
  if (status === "retired") return "retired";
  if (status === "deprecated") return "deprecated";
  if (status === "canary") return "canary";
  return DEFAULT_LIFECYCLE;
}

function lifecycleEligible(lifecycle) {
  return !BLOCKED_LIFECYCLES.has(lifecycle);
}
```

Update `normalizeNode`:

```js
export function normalizeNode(server, index = 0, { includeRuntime = false } = {}) {
  const status = normalizedStatus(server);
  const lifecycle = normalizedLifecycle(server);
  const maintenance = status === "maintenance" || lifecycle === "maintenance";
  const subscriptionEligible = status === DEFAULT_STATUS && !maintenance && lifecycleEligible(lifecycle);
  const channelPool = channelPoolFor(server);
  const node = {
    id: server.id || server.name,
    name: server.name,
    role: text(server.role),
    region: text(server.region),
    channelPool,
    channelRole: metadataToken(server.channelRole || server.role),
    lifecycle,
    physicalNodeRef: text(server.physicalNodeRef || server.physicalNode || server.nodeRef),
    generation: text(server.generation || server.nodeGeneration),
    strategyPriority: strategyPriorityFor(server, index),
    canaryWeight: canaryWeightFor(server),
    credentialMode: SHARED_NODE_MODE,
    status,
    maintenance,
    subscriptionEligible,
    reason: reasonFor(server, status)
  };

  if (!includeRuntime) {
    return node;
  }

  return {
    ...node,
    host: server.host,
    port: server.port,
    method: server.method
  };
}
```

- [ ] **Step 4: Run the node-registry test and confirm it passes**

Run:

```powershell
node --test server/tests/subscription-node-registry.test.mjs
```

Expected: PASS.

- [ ] **Step 5: Commit Task 1**

Run:

```powershell
git add server/services/subscriptions/node-registry.mjs server/tests/subscription-node-registry.test.mjs
git commit -m "feat: add multi-channel node lifecycle metadata"
```

Expected: commit succeeds in an isolated implementation branch or worktree. If the shared worktree is dirty with unrelated changes, skip the commit and record the blocker in the final implementation report.

---

## Task 2: Stable-Pool Policy Blocks Deprecated Labels And Missing Physical References

**Files:**
- Modify: `server/services/subscriptions/channel-policy.mjs`
- Modify: `server/tests/subscription-channel-policy.test.mjs`

- [ ] **Step 1: Add failing policy tests for lifecycle and physical-node guards**

Append to `server/tests/subscription-channel-policy.test.mjs`:

```js
test("stable pool policy blocks retired and deprecated labels even when they look online", () => {
  const report = buildStablePoolProtocolPolicy({
    proxyConfig: {
      servers: [
        {
          id: "old_prod_edge_a",
          name: "prod-edge-a",
          protocol: "ss",
          channelPool: "stable",
          lifecycle: "retired",
          status: "online",
          host: "old-a.example.test",
          port: 18388,
          method: "aes-256-gcm",
          password: "old-a-test-secret",
          physicalNodeRef: "edge-old-01"
        },
        {
          id: "old_prod_edge_b",
          name: "prod-edge-b",
          protocol: "ss",
          channelPool: "stable",
          lifecycle: "deprecated",
          status: "online",
          host: "old-b.example.test",
          port: 18389,
          method: "aes-256-gcm",
          password: "old-b-test-secret",
          physicalNodeRef: "edge-old-02"
        }
      ]
    }
  });

  assert.equal(report.ok, false);
  assert.deepEqual(report.blockers.map((blocker) => blocker.code), [
    "blocked_lifecycle_in_stable_pool",
    "blocked_lifecycle_in_stable_pool"
  ]);
  assert.deepEqual(report.blockers.map((blocker) => blocker.node), ["prod-edge-a", "prod-edge-b"]);
  assert.deepEqual(report.blockers.map((blocker) => blocker.lifecycle), ["retired", "deprecated"]);
  assert.doesNotMatch(JSON.stringify(report), /old-a\.example\.test|old-b\.example\.test|old-a-test-secret|old-b-test-secret/);
});

test("stable pool policy blocks active production channels without physicalNodeRef", () => {
  const report = buildStablePoolProtocolPolicy({
    proxyConfig: {
      servers: [
        {
          id: "active_stable_missing_ref",
          name: "active-stable-missing-ref",
          protocol: "ss",
          channelPool: "stable",
          lifecycle: "active",
          host: "active.example.test",
          port: 18388,
          method: "aes-256-gcm",
          password: "active-test-secret"
        }
      ]
    }
  });

  assert.equal(report.ok, false);
  assert.equal(report.blockers[0].code, "production_channel_missing_physical_node_ref");
  assert.equal(report.blockers[0].node, "active-stable-missing-ref");
  assert.doesNotMatch(JSON.stringify(report), /active\.example\.test|active-test-secret/);
});
```

- [ ] **Step 2: Run the tests and confirm they fail**

Run:

```powershell
node --test server/tests/subscription-channel-policy.test.mjs
```

Expected: FAIL because the policy report does not yet include lifecycle or `physicalNodeRef` blockers.

- [ ] **Step 3: Extend the safe node policy shape**

Modify `safeNodePolicy` in `server/services/subscriptions/channel-policy.mjs`:

```js
function safeNodePolicy(server, index) {
  const node = normalizeNode(server, index);
  return {
    id: node.id,
    name: node.name,
    channelPool: node.channelPool,
    subscriptionEligible: node.subscriptionEligible,
    protocol: protocolFor(server),
    network: token(server.network || server.transport || ""),
    packetEncoding: token(server.packetEncoding || server["packet-encoding"] || ""),
    lifecycle: node.lifecycle,
    physicalNodeRef: node.physicalNodeRef,
    generation: node.generation
  };
}
```

Add lifecycle constants near the protocol constants:

```js
const BLOCKED_OUTPUT_LIFECYCLES = new Set(["planned", "private-validation", "maintenance", "deprecated", "retired"]);
```

- [ ] **Step 4: Add lifecycle and physical-ref blockers before protocol blockers**

Inside the `for (const node of nodes)` loop in `buildStablePoolProtocolPolicy`, place this block before the existing `if (node.channelPool !== "stable" || node.subscriptionEligible !== true)` check:

```js
    if (node.channelPool === "stable" && BLOCKED_OUTPUT_LIFECYCLES.has(node.lifecycle)) {
      blockers.push(policyFinding("blocked_lifecycle_in_stable_pool", {
        node: node.name,
        lifecycle: node.lifecycle,
        channelPool: node.channelPool
      }));
      continue;
    }

    if (node.channelPool === "stable" && node.lifecycle === "active" && !node.physicalNodeRef) {
      blockers.push(policyFinding("production_channel_missing_physical_node_ref", {
        node: node.name,
        lifecycle: node.lifecycle,
        channelPool: node.channelPool
      }));
      continue;
    }
```

Keep the returned report redacted by not including `host`, `port`, `password`, `uuid`, endpoint URLs, or subscription material.

- [ ] **Step 5: Run the channel-policy tests**

Run:

```powershell
node --test server/tests/subscription-channel-policy.test.mjs
```

Expected: PASS.

- [ ] **Step 6: Commit Task 2**

Run:

```powershell
git add server/services/subscriptions/channel-policy.mjs server/tests/subscription-channel-policy.test.mjs
git commit -m "fix: block deprecated channels in stable policy"
```

Expected: commit succeeds in an isolated implementation branch or worktree. If the shared worktree is dirty with unrelated changes, skip the commit and record the blocker in the final implementation report.

---

## Task 3: Portal Auto-Issuance Target Resolver

**Files:**
- Create: `server/services/platform/portal-auto-issuance-node-policy.mjs`
- Create: `server/tests/platform-portal-auto-issuance-node-policy.test.mjs`

- [ ] **Step 1: Write failing auto-issuance resolver tests**

Create `server/tests/platform-portal-auto-issuance-node-policy.test.mjs`:

```js
import assert from "node:assert/strict";
import test from "node:test";
import { resolvePortalAutoIssuanceChannel } from "../services/platform/portal-auto-issuance-node-policy.mjs";

function proxyConfig() {
  return {
    servers: [
      {
        id: "channel_current_tuic",
        name: "channel-current-tuic",
        protocol: "tuic",
        channelPool: "canary",
        lifecycle: "active",
        physicalNodeRef: "edge-current-01",
        generation: "current-20260605",
        host: "tuic.example.test",
        port: 443,
        uuid: "11111111-1111-4111-8111-111111111111",
        password: "tuic-test-secret"
      },
      {
        id: "channel_current_h2",
        name: "channel-current-h2",
        protocol: "vless",
        network: "h2",
        channelPool: "stable",
        lifecycle: "active",
        physicalNodeRef: "edge-current-01",
        generation: "current-20260605",
        host: "h2.example.test",
        port: 443,
        uuid: "22222222-2222-4222-8222-222222222222"
      },
      {
        id: "old_prod_edge_a",
        name: "prod-edge-a",
        protocol: "ss",
        channelPool: "stable",
        lifecycle: "retired",
        physicalNodeRef: "edge-old-01",
        generation: "retired-202605",
        host: "old-a.example.test",
        port: 18388,
        method: "aes-256-gcm",
        password: "old-a-test-secret"
      }
    ]
  };
}

test("portal auto issuance resolves an active stable channel without leaking runtime material", () => {
  const result = resolvePortalAutoIssuanceChannel({
    proxyConfig: proxyConfig(),
    targetNodeId: "channel-current-h2",
    approvedGeneration: "current-20260605"
  });

  assert.equal(result.ok, true);
  assert.equal(result.channel.name, "channel-current-h2");
  assert.equal(result.channel.physicalNodeRef, "edge-current-01");
  assert.equal(result.channel.channelPool, "stable");
  assert.equal(result.errorCode, "");
  assert.doesNotMatch(JSON.stringify(result), /h2\.example\.test|22222222|tuic-test-secret|old-a-test-secret/);
});

test("portal auto issuance fails closed for missing, retired, canary, generation mismatch, and missing physical ref", () => {
  assert.deepEqual(resolvePortalAutoIssuanceChannel({
    proxyConfig: proxyConfig(),
    targetNodeId: "missing-node",
    approvedGeneration: "current-20260605"
  }), {
    ok: false,
    errorCode: "node_unavailable",
    channel: null,
    redacted: true,
    mutation: false
  });

  assert.equal(resolvePortalAutoIssuanceChannel({
    proxyConfig: proxyConfig(),
    targetNodeId: "prod-edge-a",
    approvedGeneration: "current-20260605"
  }).errorCode, "node_lifecycle_blocked");

  assert.equal(resolvePortalAutoIssuanceChannel({
    proxyConfig: proxyConfig(),
    targetNodeId: "channel-current-tuic",
    approvedGeneration: "current-20260605"
  }).errorCode, "node_pool_requires_explicit_assignment");

  assert.equal(resolvePortalAutoIssuanceChannel({
    proxyConfig: proxyConfig(),
    targetNodeId: "channel-current-h2",
    approvedGeneration: "future-generation"
  }).errorCode, "node_generation_mismatch");

  assert.equal(resolvePortalAutoIssuanceChannel({
    proxyConfig: {
      servers: [
        {
          id: "stable_missing_ref",
          name: "stable-missing-ref",
          protocol: "ss",
          channelPool: "stable",
          lifecycle: "active",
          host: "stable.example.test",
          port: 18388,
          method: "aes-256-gcm",
          password: "stable-test-secret"
        }
      ]
    },
    targetNodeId: "stable-missing-ref"
  }).errorCode, "node_physical_ref_missing");
});

test("portal auto issuance allows current canary channel only with explicit canary approval", () => {
  const result = resolvePortalAutoIssuanceChannel({
    proxyConfig: proxyConfig(),
    targetNodeId: "channel-current-tuic",
    approvedGeneration: "current-20260605",
    allowCanary: true
  });

  assert.equal(result.ok, true);
  assert.equal(result.channel.name, "channel-current-tuic");
  assert.equal(result.channel.channelPool, "canary");
  assert.doesNotMatch(JSON.stringify(result), /tuic\.example\.test|11111111|tuic-test-secret/);
});
```

- [ ] **Step 2: Run the tests and confirm they fail**

Run:

```powershell
node --test server/tests/platform-portal-auto-issuance-node-policy.test.mjs
```

Expected: FAIL with an import error for `portal-auto-issuance-node-policy.mjs`.

- [ ] **Step 3: Implement the resolver service**

Create `server/services/platform/portal-auto-issuance-node-policy.mjs`:

```js
import { createNodeRegistry, normalizeNode } from "../subscriptions/node-registry.mjs";

const BLOCKED_LIFECYCLES = new Set(["planned", "private-validation", "maintenance", "deprecated", "retired"]);

function text(value) {
  return String(value ?? "").trim();
}

function result(errorCode, channel = null) {
  return {
    ok: !errorCode,
    errorCode: errorCode || "",
    channel,
    redacted: true,
    mutation: false
  };
}

function safeChannel(node) {
  return {
    id: node.id,
    name: node.name,
    lifecycle: node.lifecycle,
    channelPool: node.channelPool,
    physicalNodeRef: node.physicalNodeRef,
    generation: node.generation,
    status: node.status,
    subscriptionEligible: node.subscriptionEligible
  };
}

export function resolvePortalAutoIssuanceChannel({
  proxyConfig = {},
  targetNodeId = "",
  approvedGeneration = "",
  allowCanary = false
} = {}) {
  const target = text(targetNodeId);
  if (!target) return result("node_unavailable");

  const registry = createNodeRegistry({ proxyConfig });
  const server = registry.resolveNode(target);
  if (!server) return result("node_unavailable");

  const node = normalizeNode(server);
  const safe = safeChannel(node);
  if (BLOCKED_LIFECYCLES.has(node.lifecycle) || node.subscriptionEligible !== true) {
    return result("node_lifecycle_blocked", safe);
  }
  if (!node.physicalNodeRef) {
    return result("node_physical_ref_missing", safe);
  }
  if (approvedGeneration && node.generation && node.generation !== approvedGeneration) {
    return result("node_generation_mismatch", safe);
  }
  if (node.channelPool !== "stable" && !(allowCanary && node.channelPool === "canary")) {
    return result("node_pool_requires_explicit_assignment", safe);
  }
  return result("", safe);
}
```

- [ ] **Step 4: Run the auto-issuance resolver tests**

Run:

```powershell
node --test server/tests/platform-portal-auto-issuance-node-policy.test.mjs
```

Expected: PASS.

- [ ] **Step 5: Commit Task 3**

Run:

```powershell
git add server/services/platform/portal-auto-issuance-node-policy.mjs server/tests/platform-portal-auto-issuance-node-policy.test.mjs
git commit -m "feat: fail closed portal issuance node targets"
```

Expected: commit succeeds in an isolated implementation branch or worktree. If the shared worktree is dirty with unrelated changes, skip the commit and record the blocker in the final implementation report.

---

## Task 4: CLI Policy-Check Regression Coverage

**Files:**
- Modify: `server/tests/cli-router.test.mjs`
- Modify only if needed: `server/services/cli/router.mjs`

- [ ] **Step 1: Add a failing CLI policy-check test**

Append this test to `server/tests/cli-router.test.mjs`:

```js
test("gccgw node policy-check reports lifecycle blockers without leaking runtime fields", async () => {
  let stdout = "";
  const exitCode = await runProxyGatewayCli(["node", "policy-check", "--config", "config/proxy-servers.json", "--json"], {
    readJsonFile() {
      return {
        servers: [
          {
            id: "old_prod_edge_a",
            name: "prod-edge-a",
            protocol: "ss",
            channelPool: "stable",
            lifecycle: "retired",
            host: "old-a.example.test",
            port: 18388,
            method: "aes-256-gcm",
            password: "old-a-test-secret",
            physicalNodeRef: "edge-old-01"
          }
        ]
      };
    },
    writeStdout(text) {
      stdout += text;
    },
    writeStderr() {},
    runNodeScript: async () => 0,
    runPackageScript: async () => 0,
    runGitDiffCheck: async () => 0,
    runEnvCheck: async () => 0,
    runSelfCheck: async () => 0,
    runInstallPreflight: async () => 0,
    runBackupPreflight: async () => 0,
    runReleaseStatus: async () => 0,
    runServiceStatus: async () => 0,
    runNetworkStatus: async () => 0,
    runPackageImportDryRun: async () => 0,
    runPackageApply: async () => 0,
    runPackageInspect: async () => 0,
    runInstallConfigure: async () => 0,
    startServer: async () => 0,
    confirmRiskAExecution: async () => false
  });

  assert.equal(exitCode, 1);
  const report = JSON.parse(stdout);
  assert.equal(report.ok, false);
  assert.equal(report.blockers[0].code, "blocked_lifecycle_in_stable_pool");
  assert.equal(report.blockers[0].node, "prod-edge-a");
  assert.doesNotMatch(stdout, /old-a\.example\.test|18388|old-a-test-secret/);
});
```

- [ ] **Step 2: Run the CLI router test and confirm it passes through the existing command path**

Run:

```powershell
node --test server/tests/cli-router.test.mjs --test-name-pattern "policy-check reports lifecycle blockers"
```

Expected after Task 2: PASS. If it fails because `runProxyGatewayCli` requires additional injected functions, provide inert async functions for the missing names in the test object and rerun.

- [ ] **Step 3: Commit Task 4**

Run:

```powershell
git add server/tests/cli-router.test.mjs server/services/cli/router.mjs
git commit -m "test: cover node policy-check lifecycle blockers"
```

Expected: commit succeeds in an isolated implementation branch or worktree. If `server/services/cli/router.mjs` was not modified, do not include it in `git add`.

---

## Task 5: Documentation And Repository Validation

**Files:**
- Modify: `docs/CHANNEL_STRATEGY_ENGINE.md`
- Modify: `docs/NODE_REGISTRATION_AND_POOL_CONTRACT.md`

- [ ] **Step 1: Update channel strategy documentation**

In `docs/CHANNEL_STRATEGY_ENGINE.md`, add this section after `## Node Pools`:

```markdown
## Multi-Channel Physical Nodes

One physical edge host may expose multiple logical subscription channels. Each
logical channel remains a separate `proxyConfig.servers[]` record, and related
records are grouped by the safe non-secret `physicalNodeRef` field.

The renderer emits logical channels, not physical hosts. Policy checks use
`physicalNodeRef`, `lifecycle`, `channelPool`, and `generation` to prevent a
retired historical label from re-entering default output or automatic portal
issuance.

See `docs/CHANNEL_MULTI_CHANNEL_NODE_DESIGN.md` for the active design
contract.
```

- [ ] **Step 2: Update node registration contract**

In `docs/NODE_REGISTRATION_AND_POOL_CONTRACT.md`, add a row to the node schema table after `displayName`:

```markdown
| `physicalNodeRef` | Yes for production channels | Safe physical host grouping key | Non-secret slug shared by channels on the same physical edge host |
```

Replace the lifecycle table with:

```markdown
| Lifecycle | Meaning | Default output eligibility |
| --- | --- | --- |
| `planned` | Design or inventory placeholder exists; no runtime authority is implied | No |
| `private-validation` | Runtime is being checked by operators or lab-only clients | No |
| `canary` | Candidate may be exposed only through explicit controlled-access assignment | No |
| `active` | Node may be eligible for normal subscription output if its pool and entitlement allow it | Yes, only when `pool` is `stable` |
| `maintenance` | Node is temporarily withheld from output or under investigation | No |
| `deprecated` | Node label or channel is retained for transition/audit but cannot receive new automatic issuance | No |
| `retired` | Node is no longer eligible; retained only for audit or historical context | No |
```

- [ ] **Step 3: Run targeted tests**

Run:

```powershell
node --test server/tests/subscription-node-registry.test.mjs
node --test server/tests/subscription-channel-policy.test.mjs
node --test server/tests/platform-portal-auto-issuance-node-policy.test.mjs
node --test server/tests/cli-router.test.mjs --test-name-pattern "policy-check reports lifecycle blockers"
```

Expected: all commands PASS.

- [ ] **Step 4: Run repository validation**

Run:

```powershell
git diff --check
npm test
```

Expected: both commands PASS. If `git diff --check` reports pre-existing whitespace outside files touched by this plan, record the exact paths and rerun a scoped check for files touched by this plan:

```powershell
git diff --check -- server/services/subscriptions/node-registry.mjs server/services/subscriptions/channel-policy.mjs server/services/platform/portal-auto-issuance-node-policy.mjs server/tests/subscription-node-registry.test.mjs server/tests/subscription-channel-policy.test.mjs server/tests/platform-portal-auto-issuance-node-policy.test.mjs server/tests/cli-router.test.mjs docs/CHANNEL_STRATEGY_ENGINE.md docs/NODE_REGISTRATION_AND_POOL_CONTRACT.md
```

- [ ] **Step 5: Commit Task 5**

Run:

```powershell
git add docs/CHANNEL_STRATEGY_ENGINE.md docs/NODE_REGISTRATION_AND_POOL_CONTRACT.md
git commit -m "docs: document multi-channel node guard"
```

Expected: commit succeeds in an isolated implementation branch or worktree. If the shared worktree is dirty with unrelated changes, skip the commit and record the blocker in the final implementation report.

---

## Task 6: Production Stopgap Gate Packet

**Files:**
- Create after exact operator approval only: `docs/production-replacement-records/YYYY-MM-DD-multi-channel-node-stopgap.md`

- [ ] **Step 1: Prepare read-only inventory commands for operator approval**

Use this non-mutating command set as the approval packet. Do not run mutating commands from this plan.

```powershell
gccgw node inspect --json
gccgw node policy-check --json
curl -fsS https://portal.globalcirclecat.com/ -o NUL
curl -fsS https://portal.globalcirclecat.com/api/health
```

Expected: the approval request names exact release, target runtime directory, protected config path, restart scope, rollback target, and forbidden actions. It must explicitly forbid DNS, Nginx config mutation, firewall/provider security group changes, public Admin, payment, account/password generation, passkey enablement, secrets/tokens/passwords/subscription URL output, SQLite row dump, and live order creation during validation.

- [ ] **Step 2: Prepare exact stopgap intent for later approval**

The later A-tier approval should choose exactly one stopgap:

```text
Option A:
  disable automatic portal issuance until a current channel is approved

Option B:
  set automatic portal issuance target to the current logical TUIC channel
  allow canary assignment explicitly for that target only
  mark stale prod-edge-a/prod-edge-b labels retired or maintenance
```

Expected: no production mutation occurs until the operator gives exact approval text with backup, validation, and rollback instructions.

- [ ] **Step 3: Record stopgap execution after approval**

Create `docs/production-replacement-records/YYYY-MM-DD-multi-channel-node-stopgap.md` with:

```markdown
# Multi-Channel Node Stopgap Execution

Date: YYYY-MM-DD, Asia/Shanghai.

## Scope

- Risk: A
- Target: protected candidate runtime node config and runtime env only
- Restart: proxy-gateway-candidate.service only if approved
- Public boundary: unchanged
- Subscription material: not printed
- SQLite rows: not dumped

## Approval

Recorded separately in the operator conversation. This record contains no
secrets, tokens, passwords, subscription URLs, or raw runtime rows.

## Preflight

- Health: recorded as safe status only
- Node inspect: recorded as safe labels only
- Policy check: recorded as blocker codes and safe node labels only

## Mutation

- Historical stale labels moved out of automatic issuance eligibility
- Automatic issuance target set or disabled according to the approval

## Validation

- Health OK
- Portal static entry OK
- Public Admin blocked
- No-session portal APIs reject
- Policy check has no deprecated eligible nodes
- No live order creation during validation

## Rollback

- Protected backup path recorded on host only
- Rollback target recorded by release/hash label only
```

Expected: the record contains safe labels and evidence summaries only.

---

## Self-Review Checklist

- Spec coverage:
  - one physical node with multiple logical channels: Task 1
  - lifecycle overrides `online`: Tasks 1 and 2
  - deprecated/retired labels blocked from auto issuance: Tasks 2 and 3
  - no silent fallback: Task 3
  - CLI policy check: Task 4
  - docs alignment: Task 5
  - production stopgap remains A-tier gated: Task 6
- Placeholder scan: no unresolved placeholder markers or open implementation
  blanks are used.
- Secret scan: all endpoints and credentials in snippets are synthetic test fixtures; no real tokens, passwords, subscription URLs, SQLite rows, or customer data are included.
- Type consistency:
  - `physicalNodeRef`, `generation`, `lifecycle`, `channelPool`, and `subscriptionEligible` are introduced in Task 1 and reused in Tasks 2-4.
  - `resolvePortalAutoIssuanceChannel(...)` is introduced in Task 3 and not referenced earlier.
