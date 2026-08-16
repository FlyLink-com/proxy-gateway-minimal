# Stable Pool Protocol Implementation Plan

Last updated: 2026-08-16.

```yaml
document_metadata:
  doc_type: canonical
  lifecycle: active
  authority_scope: stable_pool_protocol_implementation_plan
  superseded_by: null
  last_verified_at: 2026-08-16
  production_authority: false
```


> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore the default user subscription path to approved stable TCP capacity, now anchored on VLESS Reality/TCP or another explicitly approved TCP runtime. Keep TUIC, Hysteria2, HTTP/3, and VLESS/XUDP behind explicit canary, weak-network, or private assignment gates until they pass their runtime gates. Shadowsocks is legacy-only and must not be restored as the default production channel.

**Architecture:** Keep the existing subscription node registry and renderer as the source of node-pool behavior. Add a repo-only stable-pool protocol policy check, then execute production changes only through A-tier read-only inventory, dry-run, explicit approval, validation, and rollback records.

**Tech Stack:** Node.js ESM, `node:test`, existing `gccgw` CLI router, Subscription V2 node registry, Clash/Mihomo renderer, active channel runbooks.

---

## File Structure

- Create: `server/services/subscriptions/channel-policy.mjs`
  - Responsibility: build a redacted policy report that flags UDP/QUIC-style nodes in `stable` output, blocks legacy Shadowsocks from default stable output, and keeps VLESS/XUDP promotion advisory until measured.
- Create: `server/tests/subscription-channel-policy.test.mjs`
  - Responsibility: prove policy output is redacted, approved VLESS Reality/TCP can pass, legacy Shadowsocks and unapproved TUIC/Hysteria2/HTTP3 stable nodes block, and VLESS/XUDP remains canary-scoped.
- Modify: `server/services/cli/router.mjs`
  - Responsibility: expose `gccgw node policy-check --json` as a read-only C-tier command.
- Modify: `server/tests/cli-router.test.mjs`
  - Responsibility: prove the CLI command does not run scripts, does not mutate config, and does not print endpoints or credentials.
- Modify: `docs/CHANNEL_STRATEGY_ENGINE.md`
  - Responsibility: link the policy check to the stable-pool protocol posture.
- Modify after live approval only: protected Aliyun runtime env and runtime node config
  - Responsibility: point portal auto issuance at conservative stable TCP capacity after the stable nodes pass validation.
- Create after live approval only: `docs/production-replacement-records/YYYY-MM-DD-stable-pool-restoration-*.md`
  - Responsibility: record A-tier inventory, mutation, validation, and rollback evidence without secrets.

## Task 1: Repo-Only Stable Protocol Policy Service

**Files:**
- Create: `server/services/subscriptions/channel-policy.mjs`
- Create: `server/tests/subscription-channel-policy.test.mjs`

- [ ] **Step 1: Write the failing policy tests**

Create `server/tests/subscription-channel-policy.test.mjs`:

```js
import assert from "node:assert/strict";
import test from "node:test";
import { buildStablePoolProtocolPolicy } from "../services/subscriptions/channel-policy.mjs";

function proxyConfig() {
  return {
    servers: [
      {
        id: "node_stable_vless_reality_tcp",
        name: "stable-vless-reality-tcp",
        protocol: "vless",
        channelPool: "stable",
        host: "198.51.100.10",
        port: 443,
        network: "tcp",
        uuid: "11111111-1111-4111-8111-111111111111",
        stableProtocolApproved: true,
        stableProtocolApprovalRef: "vless-reality-tcp-explicit-approval"
      },
      {
        id: "node_stable_tuic",
        name: "stable-tuic",
        protocol: "tuic",
        channelPool: "stable",
        host: "198.51.100.11",
        port: 443,
        uuid: "11111111-1111-4111-8111-111111111111",
        password: "tuic-secret"
      },
      {
        id: "node_canary_xudp",
        name: "canary-xudp",
        protocol: "vless",
        channelPool: "canary",
        network: "tcp",
        packetEncoding: "xudp",
        host: "198.51.100.12",
        port: 443,
        uuid: "22222222-2222-4222-8222-222222222222"
      }
    ]
  };
}

test("stable pool protocol policy blocks UDP QUIC style stable nodes without leaking runtime values", () => {
  const report = buildStablePoolProtocolPolicy({ proxyConfig: proxyConfig() });

  assert.equal(report.type, "gccgw_stable_pool_protocol_policy");
  assert.equal(report.ok, false);
  assert.equal(report.mutation, false);
  assert.equal(report.productionAuthority, false);
  assert.equal(report.blockers[0].code, "udp_quic_protocol_in_stable_pool");
  assert.equal(report.blockers[0].node, "stable-tuic");
  assert.equal(report.blockers[0].protocol, "tuic");
  assert.equal(report.nextAction, "restore_conservative_tcp_stable_capacity_or_move_candidate_to_canary");
  assert.doesNotMatch(JSON.stringify(report), /198\.51\.100|tuic-secret|11111111|22222222/);
});

test("stable pool protocol policy allows approved VLESS Reality TCP and keeps XUDP canary scoped", () => {
  const report = buildStablePoolProtocolPolicy({
    proxyConfig: {
      servers: [
        {
          id: "node_stable_vless_reality_tcp",
          name: "stable-vless-reality-tcp",
          protocol: "vless",
          channelPool: "stable",
          host: "198.51.100.10",
          port: 443,
          network: "tcp",
          uuid: "11111111-1111-4111-8111-111111111111",
          stableProtocolApproved: true,
          stableProtocolApprovalRef: "vless-reality-tcp-explicit-approval"
        },
        {
          id: "node_canary_xudp",
          name: "canary-xudp",
          protocol: "vless",
          channelPool: "canary",
          network: "tcp",
          packetEncoding: "xudp",
          host: "198.51.100.12",
          port: 443,
          uuid: "22222222-2222-4222-8222-222222222222"
        }
      ]
    }
  });

  assert.equal(report.ok, true);
  assert.deepEqual(report.blockers, []);
  assert.equal(report.warnings[0].code, "xudp_kept_out_of_default_stable_output");
  assert.equal(report.nextAction, "stable_pool_policy_ok");
  assert.doesNotMatch(JSON.stringify(report), /198\.51\.100|11111111|22222222/);
});
```

- [ ] **Step 2: Run the test and confirm it fails**

Run:

```powershell
node --test server/tests/subscription-channel-policy.test.mjs
```

Expected: FAIL with an import error for `channel-policy.mjs`.

- [ ] **Step 3: Implement the minimal policy service**

Create `server/services/subscriptions/channel-policy.mjs`:

```js
import { normalizeNode } from "./node-registry.mjs";

function text(value) {
  return String(value ?? "").trim();
}

function token(value) {
  return text(value).toLowerCase().replace(/[\s_]+/g, "-");
}

function protocolFor(server) {
  const raw = token(server.protocol || server.clashType || server.type || "ss");
  if (raw === "shadowsocks" || raw === "shadowsocks-libev" || raw === "shadowsocks-rust") return "ss";
  if (raw === "hy2") return "hysteria2";
  if (raw === "http3") return "http3";
  return raw || "unknown";
}

const CONSERVATIVE_STABLE_PROTOCOLS = new Set(["ss"]);
const UDP_QUIC_STYLE_PROTOCOLS = new Set(["tuic", "hysteria2", "h3", "http3", "quic"]);

function safeNodePolicy(server, index) {
  const node = normalizeNode(server, index);
  return {
    id: node.id,
    name: node.name,
    channelPool: node.channelPool,
    subscriptionEligible: node.subscriptionEligible,
    protocol: protocolFor(server),
    network: token(server.network || server.transport || ""),
    packetEncoding: token(server.packetEncoding || server["packet-encoding"] || "")
  };
}

function blocker(code, detail) {
  return { code, ...detail };
}

function warning(code, detail) {
  return { code, ...detail };
}

export function buildStablePoolProtocolPolicy({ proxyConfig = {} } = {}) {
  const nodes = (proxyConfig.servers || [])
    .filter((server) => text(server.name || server.id))
    .map(safeNodePolicy);
  const blockers = [];
  const warnings = [];

  for (const node of nodes) {
    if (node.channelPool !== "stable" || node.subscriptionEligible !== true) {
      if (node.protocol === "vless" && node.packetEncoding === "xudp") {
        warnings.push(warning("xudp_kept_out_of_default_stable_output", {
          node: node.name,
          protocol: node.protocol,
          channelPool: node.channelPool
        }));
      }
      continue;
    }

    if (UDP_QUIC_STYLE_PROTOCOLS.has(node.protocol)) {
      blockers.push(blocker("udp_quic_protocol_in_stable_pool", {
        node: node.name,
        protocol: node.protocol,
        channelPool: node.channelPool
      }));
      continue;
    }

    if (!CONSERVATIVE_STABLE_PROTOCOLS.has(node.protocol)) {
      warnings.push(warning("stable_protocol_requires_operator_review", {
        node: node.name,
        protocol: node.protocol,
        channelPool: node.channelPool
      }));
    }

    if (node.protocol === "vless" && node.packetEncoding === "xudp") {
      warnings.push(warning("xudp_behavior_requires_canary_measurement", {
        node: node.name,
        protocol: node.protocol,
        channelPool: node.channelPool
      }));
    }
  }

  return {
    type: "gccgw_stable_pool_protocol_policy",
    generatedBy: "gccgw node policy-check",
    ok: blockers.length === 0,
    nodeCount: nodes.length,
    blockers,
    warnings,
    nextAction: blockers.length > 0
      ? "restore_conservative_tcp_stable_capacity_or_move_candidate_to_canary"
      : "stable_pool_policy_ok",
    mutation: false,
    productionAuthority: false,
    redacted: true
  };
}
```

- [ ] **Step 4: Run the focused test**

Run:

```powershell
node --test server/tests/subscription-channel-policy.test.mjs
```

Expected: PASS.

- [ ] **Step 5: Run the server test suite**

Run:

```powershell
npm test
```

Expected: PASS.

## Task 2: Add Read-Only CLI Policy Check

**Files:**
- Modify: `server/services/cli/router.mjs`
- Modify: `server/tests/cli-router.test.mjs`

- [ ] **Step 1: Write the failing CLI test**

Add this test near the existing `gccgw node inspect` and `gccgw node validate` tests in `server/tests/cli-router.test.mjs`:

```js
test("gccgw node policy-check reports stable protocol blockers without leaking endpoints", async () => {
  const stdout = [];
  const exitCode = await runProxyGatewayCli(["node", "policy-check", "--config", "config/proxy-servers.json", "--json"], {
    runNodeScript: async () => {
      throw new Error("node script must not run for node policy-check");
    },
    runPackageScript: async () => {
      throw new Error("npm package script must not run for node policy-check");
    },
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
    confirmRiskAExecution: async () => false,
    readJsonFile: (path) => {
      assert.equal(path, "config/proxy-servers.json");
      return {
        servers: [
          { id: "stable-a", name: "stable-a", protocol: "ss", channelPool: "stable", host: "198.51.100.10", port: 18388, password: "ss-secret" },
          { id: "tuic-a", name: "tuic-a", protocol: "tuic", channelPool: "stable", host: "198.51.100.11", port: 443, password: "tuic-secret" }
        ]
      };
    },
    writeStdout: (text) => stdout.push(text),
    writeStderr: () => {}
  });

  assert.equal(exitCode, 1);
  const report = JSON.parse(stdout.join(""));
  assert.equal(report.type, "gccgw_stable_pool_protocol_policy");
  assert.equal(report.ok, false);
  assert.equal(report.blockers[0].code, "udp_quic_protocol_in_stable_pool");
  assert.doesNotMatch(JSON.stringify(report), /198\.51\.100|18388|ss-secret|tuic-secret/);
});
```

- [ ] **Step 2: Run the CLI test and confirm it fails**

Run:

```powershell
node --test server/tests/cli-router.test.mjs
```

Expected: FAIL because `gccgw node policy-check` is not registered.

- [ ] **Step 3: Add the command to the router**

In `server/services/cli/router.mjs`:

1. Add the import:

```js
import { buildStablePoolProtocolPolicy } from "../subscriptions/channel-policy.mjs";
```

2. Add this entry to `SPECIAL_COMMAND_ENTRIES` near the node commands:

```js
["node policy-check", null, "node", "C", "read-only", "Check stable-pool protocol posture without printing endpoints or credentials"],
```

3. In the existing special-command dispatcher branch that handles `node inspect` and `node validate`, add:

```js
if (command === "node policy-check") {
  const configPath = optionValue(args, "--config") || "config/proxy-servers.json";
  const proxyConfig = deps.readJsonFile(configPath);
  const report = buildStablePoolProtocolPolicy({ proxyConfig });
  return writeJsonOrText(report.ok ? 0 : 1, report, args, deps);
}
```

Use the existing helper names in `router.mjs` for option parsing and JSON/text output. If the local helper names differ, update the snippet to match those existing helpers only; do not add a second output path.

- [ ] **Step 4: Run focused tests**

Run:

```powershell
node --test server/tests/subscription-channel-policy.test.mjs server/tests/cli-router.test.mjs
```

Expected: PASS.

- [ ] **Step 5: Run B-tier server validation**

Run:

```powershell
git diff --check origin/master...HEAD
npm test
```

Expected: both PASS.

## Task 3: Repo Documentation And Decision Alignment

**Files:**
- Modify: `docs/CHANNEL_STRATEGY_ENGINE.md`
- Modify: `docs/CHANNEL_TUIC_COMPARISON_CANARY_PLAN.md`
- Modify if needed: `docs/VALIDATION_BASELINE.md`

- [ ] **Step 1: Update the stable-pool section**

In `docs/CHANNEL_STRATEGY_ENGINE.md`, keep this decision explicit:

```text
default stable pool:
  SS / TCP first
  VLESS over TCP/TLS/H2 only after validation

canary / high-speed:
  TUIC
  Hysteria2
  HTTP/3 / QUIC-style UDP
  VLESS / XUDP before promotion
```

- [ ] **Step 2: Link the CLI check**

Add this command under the stable-pool protocol posture section:

```powershell
gccgw node policy-check --config config/proxy-servers.json --json
```

Expected meaning:

```text
ok=true:
  stable pool has no UDP/QUIC-style default-output blocker

ok=false:
  do not broaden default output; restore conservative TCP stable capacity or
  move the candidate to canary/private/recovery before promotion
```

- [ ] **Step 3: Run docs validation**

Run:

```powershell
git diff --check origin/master...HEAD
```

Expected: PASS.

## Task 4: A-Tier Stable TCP Capacity Read-Only Inventory

**Files:**
- Create after approval: `docs/production-replacement-records/YYYY-MM-DD-stable-tcp-capacity-readonly-inventory.md`
- No repo code changes during inventory.

- [ ] **Step 1: Request exact A-tier inventory approval**

Approval must name:

```text
scope:
  read-only Aliyun candidate runtime and node registry inventory

allowed:
  service status
  safe node inspect
  stable protocol policy-check
  no-session portal API rejection
  public Admin blocking
  health check

forbidden:
  DNS
  Nginx config mutation
  firewall/provider security-group mutation
  systemd restart
  runtime env mutation
  account/password generation
  subscription/order creation
  token/password/subscription URL output
  SQLite row dump
```

- [ ] **Step 2: Run safe inventory commands on the approved target**

Run only after approval:

```bash
gccgw node inspect --json
gccgw node policy-check --json
```

Expected:

```text
node inspect:
  no endpoints or credentials printed

policy-check:
  ok=false is acceptable during inventory
  blockers identify only safe node labels and protocol names
```

- [ ] **Step 3: Record the decision**

The record must answer:

```text
How many stable TCP nodes are eligible?
Is portal auto issuance currently pointed at a conservative stable node?
Which candidate labels are maintenance, canary, or recovery?
Is TUIC only temporary continuity or scoped canary?
What rollback state exists before mutation?
```

## Task 5: A-Tier Stable TCP Node Restoration

**Files:**
- Create after approval: `docs/production-replacement-records/YYYY-MM-DD-stable-tcp-node-restoration.md`
- Runtime-only after approval: protected node config and protected environment files.

- [ ] **Step 1: Select the restoration shape**

Use one of these shapes:

```text
preferred:
  two conservative stable TCP nodes
  pool=stable
  protocol=ss
  subscriptionEligible=true
  strategyPriority=10 and 20

minimum temporary:
  one conservative stable TCP node
  pool=stable
  protocol=ss
  subscriptionEligible=true
  TUIC remains canary or temporary continuity only
```

- [ ] **Step 2: Prepare rollback**

Rollback must include:

```text
pre-mutation protected config backup
pre-mutation protected env backup
previous USER_PORTAL_AUTO_ISSUANCE_NODE_ID value recorded by safe label only
service restart rollback command
validation checklist for restored previous state
```

- [ ] **Step 3: Apply only after exact production approval**

Allowed mutation after approval:

```text
add or restore conservative stable TCP node facts
mark expired/maintenance nodes non-eligible
keep TUIC out of broad stable default unless explicitly approved
set USER_PORTAL_AUTO_ISSUANCE_NODE_ID to a subscription-eligible stable TCP node
restart proxy-gateway-candidate.service only if the approved runtime requires it
```

Forbidden mutation:

```text
DNS
public Admin
payment
firewall/provider security group unless separately named
Nginx config unless separately named
account/password generation
live test order creation during deployment validation
subscription URL, token, password, credential, or SQLite row output
```

- [ ] **Step 4: Validate without creating live orders**

Required checks:

```text
health returns ok
public Admin stays blocked
no-session portal order APIs reject
gccgw node inspect shows at least one stable subscription-eligible TCP node
gccgw node policy-check returns ok=true
portal static entry loads
sub.globalcirclecat.com behavior unchanged if not in scope
```

## Task 6: VLESS/XUDP Canary Track

**Files:**
- Modify if missing: `server/tests/clash-subscription.test.mjs`
- Modify if missing: `server/tests/channel-config-dry-run.test.mjs`
- Modify if missing: `docs/CHANNEL_RUNTIME_CANARY_RUNBOOK.md`
- Create after approval: `docs/production-replacement-records/YYYY-MM-DD-vless-xudp-canary-*.md`

- [ ] **Step 1: Confirm renderer support**

Run:

```powershell
node --test server/tests/clash-subscription.test.mjs server/tests/channel-config-dry-run.test.mjs
```

Expected:

```text
VLESS renders through Clash/Mihomo YAML tests
dry-run redacts UUIDs and credential-like fields
XUDP fields are not printed in customer-facing docs with raw sensitive values
```

- [ ] **Step 2: Keep VLESS/XUDP out of default stable output**

The test condition must remain:

```text
default assignment:
  emits stable pool only

explicit VLESS/XUDP canary assignment:
  emits that one assigned canary node only
```

- [ ] **Step 3: Use the runtime canary runbook**

The canary gate must name:

```text
one protocol family:
  VLESS / XUDP

one target:
  channel-lab-* or canary-edge-*

one operator-device validation path:
  no all-user rollout
```

- [ ] **Step 4: Promote only after evidence**

Promotion requires:

```text
operator-device import success
multiple sample windows
success count and timeout count summaries
p50/p95/p99 summaries
client error summary
safe rollback evidence
explicit A-tier promotion approval
```

## Task 7: Production Auto-Issuance Switch

**Files:**
- Create after approval: `docs/production-replacement-records/YYYY-MM-DD-portal-auto-issuance-stable-switch.md`
- Runtime-only after approval: protected Aliyun `.env`.

- [ ] **Step 1: Preflight**

Confirm before mutation:

```text
stable TCP node exists and is subscriptionEligible=true
stable protocol policy ok=true
portal routes enabled state is known
auto issuance enabled state is known
current auto issuance node id is recorded by safe label only
rollback env value is available
```

- [ ] **Step 2: Switch auto issuance node**

After exact approval only:

```text
USER_PORTAL_AUTO_ISSUANCE_NODE_ID=<approved-stable-tcp-node-label>
```

Do not print the full protected env file.

- [ ] **Step 3: Restart and validate**

Allowed:

```text
restart proxy-gateway-candidate.service only
nginx -t only
no Nginx reload unless rollback requires it
```

Validate:

```text
health ok
public Admin blocked
portal no-session APIs reject
node inspect safe summary
policy-check ok=true
no live order creation during deployment validation
```

## Promotion Criteria

Do not consider the stable-pool restoration complete until all of these are true:

```text
repo policy-check exists and passes tests
stable default output has at least one conservative TCP node
TUIC/Hysteria2/HTTP3 are not silently emitted as broad default output
VLESS/XUDP remains canary scoped until measured
portal auto issuance points at stable TCP capacity
rollback evidence is recorded
validation record contains no secrets, tokens, subscription URLs, account credentials, or SQLite rows
```

## Suggested Execution Order

```text
1. Task 1: repo-only policy service
2. Task 2: repo-only CLI policy-check
3. Task 3: docs alignment
4. Task 4: A-tier read-only production inventory
5. Task 5: A-tier stable TCP node restoration
6. Task 7: A-tier portal auto-issuance switch
7. Task 6: VLESS/XUDP canary track as a separate follow-up
```

## Self-Review

Spec coverage:

```text
stable pool default choice:
  covered by Tasks 1, 3, 5, and 7

H2/H3 comparison:
  covered by Tasks 1, 3, and 6

VLESS/XUDP next path:
  covered by Tasks 1 and 6

production safety:
  covered by Tasks 4, 5, and 7
```

Placeholder scan:

```text
No TBD, TODO, secret placeholders, raw endpoints, credentials, subscription URLs, or SQLite rows are required by this plan.
```

Type consistency:

```text
The policy report type is consistently `gccgw_stable_pool_protocol_policy`.
The CLI command is consistently `gccgw node policy-check`.
The stable-pool promotion gate remains separate from canary runtime validation.
```
