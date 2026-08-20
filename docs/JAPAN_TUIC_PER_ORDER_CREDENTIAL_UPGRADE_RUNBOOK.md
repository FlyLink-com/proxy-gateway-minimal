# Japan TUIC Per-Order Credential Upgrade Implementation Plan

Last updated: 2026-08-16.

```yaml
document_metadata:
  doc_type: operational
  lifecycle: active
  authority_scope: japan_tuic_per_order_credential_upgrade
  superseded_by: null
  last_verified_at: 2026-08-16
  production_authority: false
```


> **For agentic workers:** REQUIRED SUB-SKILL: Use
> superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade the Japan TUIC production data-plane node so each portal
order can receive, expire, disable, and rotate its own TUIC credential.

**Architecture:** Keep Aliyun as the subscription control plane and keep the
Japan host as replaceable data-plane capacity. The control plane already knows
subscription expiry and node policy metadata; this plan adds a safe node-side
credential lifecycle surface before marking `channel-lab-b-tuic` as
`per-order`.

**Tech Stack:** Node.js `gccgw`, Mihomo TUIC v5 runtime, systemd, protected
host files, SQLite control ledger, repo CLI policy gates.

---

## Status

Risk: A for any production host, systemd, runtime config, credential, node
registry, or subscription-output mutation.

Process: repo-only implementation and dry-run first; then exact read-only
inventory; then exact operator approval; then production mutation with backup,
validation, and rollback.

Expected PR count: one B-tier repository PR for the node-side lifecycle
primitive and tests, followed by one separate A-tier execution record when
production is approved.

Validation:

- Repository implementation: targeted node lifecycle tests, CLI tests,
  subscription policy tests, `npm test`, and `git diff --check`.
- Production preflight: read-only live inventory only.
- Production mutation: backup, config test, service health, no-session portal
  API rejection, node policy gate, one controlled non-secret lifecycle smoke,
  rollback readiness.

Production/AWS impact: none until a later exact A-tier approval phrase is
provided. This document does not authorize AWS mutation, firewall/security
group mutation, DNS, Nginx, public Admin, payment, account generation,
subscription URL output, token output, password output, SQLite row dump, live
order creation, or production node mutation.

## Why Latest Code Is Necessary But Not Sufficient

The latest repository code can already model the desired policy boundary:

- `server/routes/subscription.mjs` and
  `server/services/clash-subscription.mjs` can attach safe lifecycle metadata
  such as expiry and valid-until facts to subscription responses.
- `server/services/subscriptions/node-registry.mjs` recognizes
  `credentialMode=per-order`.
- `server/services/subscriptions/channel-policy.mjs` fails closed unless a
  stable eligible node has add, disable, rotate, and a modeled activation
  surface: reload, API-managed, or explicit service restart.
- `gccgw node data-plane-lifecycle-policy --json` gives a redacted gate result.

That is only the control-plane and policy side. The Japan host still needs a
safe data-plane primitive that can apply the desired per-order credential state
to the Mihomo TUIC runtime without printing credentials or exposing a public
management surface.

## Current Known Facts To Revalidate

These facts must be revalidated before any mutation because live node posture
can drift:

- Target node label: `channel-lab-b-tuic`.
- Current documented production role: Japan TUIC subscription output target.
- Current documented runtime service: `mihomo-tuic.service`.
- Last read-only capability result: service active, UDP 443 present, config
  test exit `0`, `users` section present.
- Last read-only blocker: no `external-controller`, no API secret,
  `CanReload=no`, and no `ExecReload`.

Do not treat the presence of a TUIC `users` section as proof of per-order
credential support. Per-order support requires a safe way to add, disable,
rotate, validate, and activate credential changes.

## Target Runtime Contract

The production node is ready only when a redacted node inspection can state:

```json
{
  "name": "channel-lab-b-tuic",
  "channelPool": "stable",
  "status": "online",
  "subscriptionEligible": true,
  "credentialMode": "per-order",
  "credentialLifecycle": {
    "addCredential": true,
    "disableCredential": true,
    "rotateCredential": true,
    "reload": true
  }
}
```

If the implementation uses a loopback API instead of reload, the lifecycle
contract may use:

```json
{
  "credentialLifecycle": {
    "addCredential": true,
    "disableCredential": true,
    "rotateCredential": true,
    "apiManaged": true
  }
}
```

The API-managed option is acceptable only if the API is bound to loopback or a
private management channel, protected by a non-repository secret, and never
opened to the public internet.

If the implementation uses an explicit service restart instead of hot reload,
the lifecycle contract may use:

```json
{
  "credentialLifecycle": {
    "addCredential": true,
    "disableCredential": true,
    "rotateCredential": true,
    "restart": true
  }
}
```

The restart option is acceptable only when the operator approval names the exact
service, restart scope, backup, validation, and rollback path.

## Recommended Design

Use a node-local lifecycle helper instead of letting the Aliyun portal service
write raw TUIC config directly.

Recommended repository primitive:

```text
gccgw edge tuic-credentials plan --input <desired-state.json> --json
gccgw edge tuic-credentials apply --input <desired-state.json> --execute-production-mutation --json
```

The helper must:

- read a reviewed desired-state file from protected local storage;
- keep raw credential values out of stdout, stderr, docs, PRs, and logs;
- create a protected backup of the current Mihomo TUIC config before mutation;
- write a candidate config atomically;
- run Mihomo config test before activation;
- activate through one approved runtime surface:
  - loopback external-controller reload, or
  - systemd reload if a real `ExecReload` is added, or
  - explicit restart if repository policy is updated to model restart as an
    approved activation surface;
- verify `mihomo-tuic.service` health and UDP 443 listener after activation;
- support rollback to the protected backup;
- emit only a redacted summary: counts, credential refs, action names, service
  state, config-test exit code, and policy status.

Do not make Aliyun public routes or customer portal routes responsible for raw
node credential mutation.

## Repository Implementation Tasks

### Task 1: Add Edge Lifecycle Contract Tests

Files:

- Create:
  `server/tests/edge-tuic-credential-lifecycle.test.mjs`
- Modify:
  `server/tests/cli-router.test.mjs`

Steps:

- [ ] Add tests that prove the dry-run plan accepts a desired state with
  add, disable, and rotate actions and returns only redacted refs and counts.
- [ ] Add tests that reject raw endpoint, token, password, subscription URL,
  SQLite row, and customer data fields in the desired-state input.
- [ ] Add tests that prove `apply` is blocked unless
  `--execute-production-mutation` is present.
- [ ] Add CLI router tests for:
  - `gccgw edge tuic-credentials plan --json`
  - `gccgw edge tuic-credentials apply --execute-production-mutation --json`

Run:

```powershell
node --test server\tests\edge-tuic-credential-lifecycle.test.mjs server\tests\cli-router.test.mjs
```

Expected:

```text
fail before implementation; pass after implementation
```

### Task 2: Implement Redacted Desired-State Parsing

Files:

- Create:
  `server/services/edge/tuic-credential-lifecycle.mjs`
- Modify:
  `server/services/cli/router.mjs`

The service must accept a local JSON shape like:

```json
{
  "node": "channel-lab-b-tuic",
  "runtime": "mihomo-tuic",
  "actions": [
    {
      "action": "add",
      "credentialRef": "order_ref_example",
      "expiresAt": "2026-07-05T00:00:00.000Z"
    },
    {
      "action": "disable",
      "credentialRef": "expired_order_ref_example",
      "reason": "order_expired"
    }
  ]
}
```

Rules:

- `credentialRef` is an opaque internal ref, not a raw password or user secret.
- Raw TUIC password material must come from protected runtime storage, not from
  repo docs or chat.
- The plan output must not echo raw action payloads.
- The apply path must be hidden behind the existing Risk A execution gate.

### Task 3: Implement Candidate Config Rendering

Files:

- Modify:
  `server/services/edge/tuic-credential-lifecycle.mjs`
- Create:
  `server/tests/fixtures/edge-tuic/mihomo-tuic-config.yaml`

Required behavior:

- Parse the current config with a structured YAML parser if the existing
  project dependency set provides one. If not, limit the supported write
  surface to the `users` list and fail closed on unknown layouts.
- Preserve unrelated Mihomo config fields.
- Add only credentials whose refs are present in the reviewed desired state.
- Disable credentials by removing or marking the matching user entry according
  to the selected Mihomo runtime behavior.
- Write the candidate config to a separate path first.
- Never print the candidate config.

Run:

```powershell
node --test server\tests\edge-tuic-credential-lifecycle.test.mjs
```

Expected:

```text
candidate rendering passes and redaction assertions pass
```

### Task 4: Implement Host Activation Adapter

Files:

- Modify:
  `server/services/edge/tuic-credential-lifecycle.mjs`
- Modify:
  `server/services/subscriptions/channel-policy.mjs` only if the approved
  activation surface needs a new capability flag.

Activation must be one of:

```text
external-controller loopback reload
systemd ExecReload
explicit systemd restart with a separately modeled policy capability
```

Hard stops:

- no config backup;
- config test nonzero;
- `mihomo-tuic.service` not active before mutation;
- public external-controller bind;
- missing protected API secret when using external-controller;
- stdout/stderr includes raw credentials;
- post-activation UDP 443 missing;
- post-activation health failure.

### Task 5: Update Node Registry Metadata

Files:

- Modify:
  `config/proxy-servers.json` only in a reviewed release or protected runtime
  package, never by hand on production first.
- Test:
  `server/tests/subscription-node-registry.test.mjs`
- Test:
  `server/tests/subscription-channel-policy.test.mjs`

The node metadata must satisfy:

```json
{
  "name": "channel-lab-b-tuic",
  "credentialMode": "per-order",
  "credentialLifecycle": {
    "addCredential": true,
    "disableCredential": true,
    "rotateCredential": true,
    "reload": true
  }
}
```

Run:

```powershell
node bin\gccgw.mjs node data-plane-lifecycle-policy --config config\proxy-servers.json --json
node --test server\tests\subscription-node-registry.test.mjs server\tests\subscription-channel-policy.test.mjs
```

Expected:

```text
data-plane lifecycle policy ok; tests pass
```

## Production Preflight Gate

This gate is read-only. It may be run after the repository implementation is
merged and packaged, but before any Japan-node mutation.

Approval phrase template:

```text
Approve Japan TUIC per-order credential upgrade read-only preflight:
target=channel-lab-b-tuic only;
scope=service status, config-test, reload/API surface, protected path existence, node policy dry-run only;
forbidden=DNS, Nginx, firewall/security group, public Admin, payment, account/password generation, live order creation, subscription URL/token/password output, SQLite row dump, raw config/log/env output, service restart, config mutation;
validation=redacted inventory, policy status, rollback readiness assessment.
```

Allowed checks:

```powershell
ssh -o BatchMode=yes channel-lab-b-tuic "<redacted service status check>"
ssh -o BatchMode=yes channel-lab-b-tuic "<redacted config-test check>"
ssh -o BatchMode=yes channel-lab-b-tuic "<redacted reload/API surface check>"
node bin\gccgw.mjs node data-plane-lifecycle-policy --config config\proxy-servers.json --json
```

Required preflight result:

```text
service active
config-test exit 0
backup target writable by approved operator path
activation surface selected and safe
no public management surface
repository policy gate expected to pass after approved metadata update
```

## Production Mutation Gate

Do not execute this gate from a short confirmation. Require an exact approval
message with release id, archive hash, target, backup path, validation, and
rollback instructions.

Approval phrase template:

```text
Approve Japan TUIC per-order credential upgrade execution:
release=<reviewed-release>;
archive_sha256=<reviewed-archive-sha256>;
target=channel-lab-b-tuic only;
deploy_scope=Japan TUIC node edge-runtime helper + protected Mihomo TUIC lifecycle config only;
backup=protected Mihomo config + systemd unit + edge-runtime directory before mutation;
runtime_env=no public controller; protected secret paths only if API-managed;
restart=mihomo-tuic.service only if config-test passes and activation requires restart;
forbidden=DNS, Nginx, firewall/security group, public Admin, payment, account/password generation, live order creation outside controlled smoke, subscription URL/token/password output, SQLite row dump, raw config/log/env output, Aliyun control-plane release switch unless separately approved;
validation=config-test, service active, UDP 443 present, data-plane lifecycle policy ok, no-session portal APIs reject, public Admin blocked, rollback files present;
rollback=restore protected backup and previous service/unit state.
```

Execution order:

- [ ] Create protected backup directory on the Japan host.
- [ ] Backup Mihomo TUIC config, systemd unit, and current edge-runtime helper.
- [ ] Install reviewed release into a new release directory.
- [ ] Install or update the edge lifecycle helper without changing public
  firewall or DNS.
- [ ] Generate a redacted dry-run lifecycle plan.
- [ ] Write candidate Mihomo config to a temporary path.
- [ ] Run config test against the candidate.
- [ ] Stop if config test is nonzero.
- [ ] Atomically replace config only after backup and config test pass.
- [ ] Activate through the approved reload/API/restart surface.
- [ ] Verify service active and UDP 443 present.
- [ ] Run redacted node lifecycle policy check.
- [ ] Record a production-replacement execution note without raw credentials,
  tokens, subscription URLs, raw config, raw logs, raw env, SQLite rows, or
  customer data.

## Rollback

Rollback must be possible without guessing:

- restore previous Mihomo TUIC config from the protected backup;
- restore previous systemd unit if it changed;
- restore previous edge-runtime helper symlink or directory if it changed;
- run config test;
- activate previous runtime surface;
- verify service active and UDP 443 present;
- verify the control plane fails closed instead of issuing new per-order
  credentials if the node policy gate is not ok.

Rollback validation must not print raw config, raw logs, raw credentials,
subscription URLs, tokens, passwords, SQLite rows, or customer data.

## Done Criteria

The upgrade is complete only when all are true:

- repository lifecycle primitive and tests are merged;
- Japan node read-only preflight is current;
- exact A-tier mutation approval was provided;
- production backup exists and is restorable;
- Mihomo config test passed before activation;
- service is active after activation;
- UDP 443 is present after activation;
- `gccgw node data-plane-lifecycle-policy --json` returns `ok=true` for the
  effective production node config;
- one controlled lifecycle smoke proves add, disable, and rotate without
  printing secrets;
- portal order expiry and disable flows call the lifecycle primitive or queue a
  desired-state change that the node applies;
- rollback evidence is recorded.

Until these criteria are true, subscription expiry metadata is advisory at the
client/config layer and must not be described as data-plane forced expiry.
