# Japan Control-Plane Deployment Foundation and Linux Feasibility Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the strict canonical-byte, durable-filesystem, and Linux-native capability foundation, and stop the program unless the target-matched Linux environment can prove every kernel, SQLite-handle, descriptor-custody, and systemd primitive required by the approved deployment design.

**Architecture:** Pure Node.js modules own canonical contracts and dependency-injected durable state, while every state-changing durable operation is one native fixed-logical-ID transaction rather than a JavaScript read-then-write sequence. A small Node-API C addon exposes only the four closed logical read/publish-no-replace/CAS/verified-unlink operations under OFD locks, sealed anonymous memory, exact descriptor inheritance, directory-FD durability, authenticated `SCM_RIGHTS`, and actual SQLite main-handle proof. One digest-bound build-time registry owns logical records, spawn profiles, the frozen standalone compiler profile, and reviewed standalone targets; later Bootstrap sources may add one reviewed extension fragment and manifest entry without a runtime registration path, caller-selected compile input, or public native ABI change. A GitHub-hosted `ubuntu-24.04` virtual machine, started only by the one source Draft PR, is the authoritative disposable Linux stop/go harness; it is not WSL, a self-hosted runner, or production infrastructure. No later plan may replace a failed native proof with path, process, or service-name inference.

**Tech Stack:** Node.js 22 ESM, `node:test`, Node-API C, `node-gyp@11.4.2`, GitHub-hosted `ubuntu-24.04`, Linux `memfd_create`, `openat2`, OFD locks, Unix-domain sockets, SQLite, systemd, and PowerShell for local orchestration only.

## Global Constraints

- This is the first serial slice of the one approved source-only Draft PR; it creates no GitHub Environment, credential, Release asset, host installation, systemd activation, production connection, deployment, schema change, or rollback.
- Production deployment remains `workflow_dispatch` only. Merge, push, pull request, schedule, repository dispatch, and reusable workflow calls never promote `control-plane-app`.
- Release unit is exactly `control-plane-app`; source PR state remains `production_state: not_deployed` and `identity_impact: false`.
- Root Node engine support remains `>=20.10.0 <21 || 22.x || 23.x || 24.x || 25.x || 26.x`; repository CI for this capability uses Node 22.
- No Redis, queue, cluster, daemon, interactive shell, SCP, rsync, PTY, forwarding, self-hosted Actions runner, operator key, or runtime-config repair identity is introduced.
- The authoritative Foundation execution environment is a `pull_request`-only, no-secret, `contents: read` GitHub-hosted `ubuntu-24.04` VM. It uses exact-SHA action references, checks out the pull-request head SHA with persisted credentials disabled, installs dependencies with `npm ci --ignore-scripts`, and runs only the Foundation test and receipt commands. It has no `push`, `workflow_dispatch`, schedule, environment, artifact upload, SSH, provider, Release, host, or deployment operation. Local Windows or WSL observations may aid development but never substitute for this receipt.
- A separate `pull_request`-only Foundation toolchain inventory job is approved solely to generate candidate review evidence. It has the same no-secret, `contents: read`, exact-head, GitHub-hosted `ubuntu-24.04` boundary; invokes no compiler, linker, make, Python, node-gyp, lifecycle script, or project build; uploads no artifact/cache; and writes no Release, package, container, Environment, host, provider, or production state. It emits one canonical safe manifest and aggregate digests only. The inventory result is not a build input and never satisfies Foundation eligibility. Publishing the reviewed immutable toolchain asset remains a distinct future Gate requiring a new explicit approval.
- No production `.env`, SQLite file, protected config, credential, endpoint, raw log, or customer data enters a source fixture or artifact.
- Native APIs accept closed logical IDs, directory FDs, and authenticated capabilities; they never accept an external absolute path, executable path, arbitrary FD slot, unit name, UID, or shell fragment. Durable state publish, CAS, and verified unlink resolve only a reviewed logical-record registry and hold one inter-process OFD lock from current-byte reread through digest comparison, atomic rename-or-unlink, parent `fsync`, and exact readback.
- `createSealedMemfd` must apply mode `0600` and verify regular-file type, effective-UID ownership, and exact permission bits before writing the first protected byte. A permission or ownership failure closes the descriptor and is a program stop; no named-file or unverified-descriptor fallback exists.
- Failure of atomic fixed-logical-ID state transitions, `memfd` owner/mode plus full seals, exact FD inheritance, `openat2` no-follow traversal, OFD locks, `SCM_RIGHTS`, `SO_PEERCRED`, actual SQLite main-handle proof, cgroup containment, or boot-persistent systemd ordering is a program stop. No fallback to path equality or JavaScript read-then-write is permitted.
- The five downstream plans consume the exact interfaces in this file and remain ineligible until the final Linux feasibility receipt reports every required capability as `true`.

---

## File Structure

**Create:**

- `server/services/deployment/strict-json-scan.mjs` — rejects duplicate object keys and malformed JSON token structure before `JSON.parse`.
- `server/services/deployment/canonical-json.mjs` — exact UTF-8 decoding, field-order serialization, validation, and SHA-256.
- `server/services/deployment/durable-store.mjs` — logical-record-only immutable publish, CAS, readback, and durable unlink.
- `ops/control-plane-deploy/native/binding.gyp` — one pinned Node-API addon target.
- `ops/control-plane-deploy/native/index.mjs` — closed JavaScript wrapper and platform refusal.
- `ops/control-plane-deploy/native/src/control-plane-native.c` — module registration and argument validation.
- `ops/control-plane-deploy/native/src/secure-memory.c` — sealed `memfd` and exact child descriptor inheritance.
- `ops/control-plane-deploy/native/src/durable-fs.c` — directory-FD `openat2`, write/fsync/rename/unlink/parent-fsync/readback operations.
- `ops/control-plane-deploy/native/src/database-capability.c` — OFD lease, peer credential, `SCM_RIGHTS`, and SQLite main-handle proof primitives.
- `server/services/deployment/foundation-contract.mjs` — single frozen source for the four atomic logical-record exports, complete native-wrapper export set, exact standalone compiler flags, and 14-feature feasibility vector.
- `ops/control-plane-deploy/native/registry/reviewed-native-registry-manifest.json` — ordered build-time allowlist and exact digests for every reviewed registry fragment; no fragment may exist outside this directory.
- `ops/control-plane-deploy/native/registry/foundation-profiles.json` — Foundation-owned fixed executable/environment IDs and descriptor-slot contracts.
- `ops/control-plane-deploy/native/registry/foundation-logical-records.json` — Foundation-owned fixed logical-record path/lock/mode/size contracts.
- `ops/control-plane-deploy/native/registry/foundation-compile-profiles.json` — the frozen `hardened-c17-pie-v1` compiler identity and exact flag vector.
- `ops/control-plane-deploy/native/registry/foundation-standalone-targets.json` — reviewed first-party C source digests, compile-profile bindings, and fixed standalone output names.
- `ops/control-plane-deploy/native/src/foundation-profile-probe.c` — one reviewed standalone C probe selected only through compiled executable profiles.
- `ops/control-plane-deploy/native/src/native-contract-test.c` — syscall-level negative and crash-boundary tests.
- `scripts/build-control-plane-native.mjs` — pinned local build controller for only the first-party addon and manifest-reviewed standalone C targets, with no download or dependency-addon build behavior.
- `scripts/control-plane-native-registry.mjs` — resolves manifest-listed fragments only under `native/registry/`, resolves standalone `src/*.c` only under the native root, and emits a build-temporary C registry plus closed build plan; it is not a runtime API.
- `scripts/control-plane-node-headers-contract.mjs` — verifies the canonical Node headers tree, version, ABI, and expected digest without downloading.
- `scripts/control-plane-linux-capability-probe.mjs` — aggregate-only target feasibility receipt.
- `scripts/control-plane-native-toolchain-contract.mjs` — verifies the canonical toolchain tree and the compile-profile-pinned compiler digest before any compiler starts.
- `integration/control-plane-deploy/foundation-linux.test.mjs` — target-matched Linux/systemd integration harness.
- `server/tests/control-plane-canonical-json.test.mjs`
- `server/tests/control-plane-durable-store.test.mjs`
- `server/tests/control-plane-native-contract.test.mjs`
- `server/tests/control-plane-native-registry.test.mjs`
- `server/tests/control-plane-node-headers-contract.test.mjs`
- `server/tests/control-plane-native-toolchain-contract.test.mjs`
- `server/tests/control-plane-linux-capability-probe.test.mjs`
- `server/tests/control-plane-foundation-linux-workflow.test.mjs` — locks the PR-only GitHub-hosted Linux harness to its source-only boundary.
- `.github/workflows/control-plane-foundation-linux.yml` — exact-SHA, PR-only `ubuntu-24.04` Foundation receipt gate.
- `.github/workflows/control-plane-foundation-toolchain-inventory.yml` — exact-SHA, PR-only, no-secret inventory evidence; no build or artifact publication.
- `scripts/control-plane-foundation-toolchain-inventory.mjs` — fixed-role read-only inventory controller that emits only canonical review-safe evidence.
- `server/tests/control-plane-foundation-toolchain-inventory.test.mjs` — locks the inventory schema, command prohibition, and non-authoritative boundary.
- `server/tests/control-plane-foundation-toolchain-inventory-workflow.test.mjs` — locks the inventory workflow to the approved source-only GitHub boundary.

**Modify:**

- `package.json` — add pinned development build tooling and focused validation scripts.
- `package-lock.json` — lock `node-gyp@11.4.2` and its integrity graph.
- `.gitignore` — ignore only the native build output under `ops/control-plane-deploy/native/build/`.

## Shared Interfaces

```js
// server/services/deployment/foundation-contract.mjs
export const ATOMIC_LOGICAL_RECORD_EXPORTS = Object.freeze([
  "durableReadLogical",
  "durablePublishNoReplace",
  "durableCompareAndSwap",
  "durableUnlinkVerified"
]);

export const FOUNDATION_NATIVE_EXPORTS = Object.freeze([
  "createBoundedCapture",
  "createDatabaseIdentityLease",
  "createSealedMemfd",
  "durableCompareAndSwap",
  "durablePublishNoReplace",
  "durableReadLogical",
  "durableSwapSymlink",
  "durableUnlink",
  "durableUnlinkVerified",
  "durableWriteFile",
  "inspectSqliteMainHandle",
  "probeLinuxCapabilities",
  "receiveDatabaseCapability",
  "sendDatabaseCapability",
  "spawnWithExactFileDescriptors"
]);

export const HARDENED_C17_PIE_V1_FLAGS = Object.freeze([
  "-std=c17",
  "-O2",
  "-fPIE",
  "-pie",
  "-fstack-protector-strong",
  "-Wl,-z,relro,-z,now",
  "-Wall",
  "-Wextra",
  "-Werror"
]);

export const REQUIRED_LINUX_FEATURES = Object.freeze([
  "memfdOwnerMode0600",
  "memfdFullSeals",
  "sealedOpenSshDescriptorHandoff",
  "exactDescriptorInheritance",
  "atomicLogicalStateTransitions",
  "openat2BeneathNoFollow",
  "ofdIdentityLease",
  "reviewedSpawnProfileRegistry",
  "scmRightsPeerBound",
  "sqliteActualMainHandle",
  "directoryFsyncDurability",
  "systemdTemplateIsolation",
  "systemdPersistentTimer",
  "cgroupKillReadback"
]);
```

The four arrays above are the only normative lists. Tests import and compare
them rather than maintaining shortened copies: the atomic list has exactly four
entries, the wrapper list has every one of the 15 JavaScript exports below, the
compile profile has exactly nine ordered flags, and the feasibility vector has
exactly 14 ordered booleans. The Node-API module
exports the same 15 callable operations but does not export a registry mutator,
compiler control, or runtime extension function.

```js
// server/services/deployment/canonical-json.mjs
export function parseCanonicalJsonBytes(bytes, contract) {}
export function serializeCanonicalJsonBytes(value, contract) {}
export function sha256Hex(bytes) {}

// contract shape
export const EXAMPLE_CONTRACT = Object.freeze({
  schemaId: "control-plane-example-v1",
  maxBytes: 16_384,
  fieldOrder: ["schemaVersion", "logicalId", "sha256"],
  nested: Object.freeze({}),
  arrays: Object.freeze({}),
  validate(value) {
    if (value.schemaVersion !== "1") throw new Error("canonical_schema_version_invalid");
    if (!/^[a-z0-9-]{1,64}$/.test(value.logicalId)) throw new Error("canonical_logical_id_invalid");
    if (!/^[0-9a-f]{64}$/.test(value.sha256)) throw new Error("canonical_sha256_invalid");
  }
});
```

`fieldOrder`, `nested`, and `arrays` are executable parts of every canonical
contract, not documentation hints. `nested[fieldName]` names the contract for a
direct child object; a string `arrays[fieldName]` selects an object-element
contract from the same `nested` registry. A primitive-array descriptor is a
frozen `{ elementType }` record, where `elementType` is exactly `string`,
`boolean`, `safeInteger`, or `null`; domain restrictions remain in that
contract's `validate`. Every object level must have exactly its `fieldOrder`,
and every object or array value must have an explicit `nested`/`arrays`
declaration. Undeclared structured values, missing or unknown fields, sparse
arrays, invalid element types, and a missing/unknown child contract are closed
failures.

```js
// server/services/deployment/durable-store.mjs
export function createDurableStore({ contracts, fsOps, native }) {
  return {
    publishImmutable(logicalId, bytes) {},
    casCanonical(logicalId, expectedSha256, nextBytes) {},
    unlinkVerified(logicalId, expectedSha256) {},
    readbackExact(logicalId, expectedSha256) {}
  };
}
```

```js
// ops/control-plane-deploy/native/index.mjs
export function probeLinuxCapabilities() {}
export function createSealedMemfd({ label, bytes, inheritableFd }) {}
export function createBoundedCapture({ label, maxBytes, inheritableFd }) {}
export function spawnWithExactFileDescriptors({ executableId, descriptors, environmentId, timeoutMs }) {}
export function durableReadLogical({ directoryFd, logicalId, expectedSha256 }) {}
export function durablePublishNoReplace({ directoryFd, logicalId, bytes }) {}
export function durableCompareAndSwap({ directoryFd, logicalId, expectedSha256, nextBytes }) {}
export function durableUnlinkVerified({ directoryFd, logicalId, expectedSha256 }) {}
export function createDatabaseIdentityLease({ lockFd, mode, ownerToken }) {}
export function sendDatabaseCapability({ socketFd, databaseFd, identityLeaseFd, expectedPeer, invocationSha256 }) {}
export function receiveDatabaseCapability({ socketFd, expectedPeer, expectedInvocationSha256 }) {}
export function inspectSqliteMainHandle({ databaseToken, expectedDatabaseIdentityHmacSha256, hmacKeyFd }) {}
export function durableWriteFile({ directoryFd, name, bytes, mode }) {}
export function durableSwapSymlink({ directoryFd, name, targetName }) {}
export function durableUnlink({ directoryFd, name }) {}
```

`durableReadLogical`, `durablePublishNoReplace`, `durableCompareAndSwap`, and
`durableUnlinkVerified` accept only logical IDs present in the compiled reviewed
record registry; they never accept a relative or absolute path. The three
mutation primitives return a closed outcome plus the verified resulting digest
or absence state. Publish accepts an existing record only when its bytes are
exactly equal. CAS accepts either the exact expected predecessor or an exact-byte
already-applied successor; every other predecessor is a mismatch. Verified
unlink returns `already_absent` only when a registered durable unlink replay
marker binds the same logical ID and expected predecessor digest; an absent
record without that exact marker is a mismatch, not idempotent success.

The only extension surface for logical records, `executableId`, `environmentId`,
compile profiles, and standalone targets is the tracked build-time
`reviewed-native-registry-manifest.json`. Every fragment is a direct child of
`ops/control-plane-deploy/native/registry/`; nested, absolute, traversing,
symlinked, environment-selected, or out-of-directory fragments are rejected.
Each ordered manifest entry binds the fragment basename, kind, and exact SHA-256.
An unlisted fragment in that directory and a listed fragment with digest drift
both stop the build. Bootstrap may add its reviewed C source, one canonical
registry fragment, and that fragment's manifest entry. It must reuse the frozen
compile profile and build adapter; it cannot edit Foundation fragments, add a
second fragment directory, add flags or output paths, or grow the N-API/JavaScript
ABI. `spawnWithExactFileDescriptors` remains the sole public spawn export.

### Task 1: Strict Canonical JSON Bytes

**Files:**

- Create: `server/services/deployment/strict-json-scan.mjs`
- Create: `server/services/deployment/canonical-json.mjs`
- Test: `server/tests/control-plane-canonical-json.test.mjs`

**Interfaces:**

- Consumes: only `Buffer`, `TextDecoder`, `node:crypto`, and frozen in-process contracts.
- Produces: `parseCanonicalJsonBytes(bytes, contract)`, `serializeCanonicalJsonBytes(value, contract)`, and `sha256Hex(bytes)` for every later plan.

- [ ] **Step 1: Write duplicate-key and byte-canonicality tests**

```js
import assert from "node:assert/strict";
import test from "node:test";
import {
  parseCanonicalJsonBytes,
  serializeCanonicalJsonBytes,
  sha256Hex
} from "../services/deployment/canonical-json.mjs";

const METADATA_CONTRACT = Object.freeze({
  schemaId: "foundation-fixture-metadata-v1",
  maxBytes: 128,
  fieldOrder: ["owner", "enabled"],
  nested: Object.freeze({}),
  arrays: Object.freeze({}),
  validate(value) {
    assert.match(value.owner, /^[a-z]{1,16}$/);
    assert.equal(typeof value.enabled, "boolean");
  }
});

const CHECK_CONTRACT = Object.freeze({
  schemaId: "foundation-fixture-check-v1",
  maxBytes: 256,
  fieldOrder: ["checkId", "metadata", "tags"],
  nested: Object.freeze({ metadata: METADATA_CONTRACT }),
  arrays: Object.freeze({
    tags: Object.freeze({ elementType: "string" })
  }),
  validate(value) {
    assert.match(value.checkId, /^[a-z0-9-]{1,16}$/);
    if (Array.isArray(value.tags) && value.tags.every((tag) => typeof tag === "string")) {
      assert.equal(value.tags.every((tag) => /^[a-z]{1,12}$/.test(tag)), true);
    }
  }
});

const PROFILE_CONTRACT = Object.freeze({
  schemaId: "foundation-fixture-profile-v1",
  maxBytes: 128,
  fieldOrder: ["name", "generation"],
  nested: Object.freeze({}),
  arrays: Object.freeze({}),
  validate(value) {
    assert.match(value.name, /^[a-z]{1,16}$/);
    assert.ok(Number.isSafeInteger(value.generation) && value.generation >= 0);
  }
});

const CONTRACT = Object.freeze({
  schemaId: "foundation-fixture-v1",
  maxBytes: 2048,
  fieldOrder: ["schemaVersion", "logicalId", "count", "profile", "checks", "labels"],
  nested: Object.freeze({
    profile: PROFILE_CONTRACT,
    "check-v1": CHECK_CONTRACT
  }),
  arrays: Object.freeze({
    checks: "check-v1",
    labels: Object.freeze({ elementType: "string" })
  }),
  validate(value) {
    assert.equal(value.schemaVersion, "1");
    assert.match(value.logicalId, /^[a-z0-9-]{1,16}$/);
    assert.ok(Number.isSafeInteger(value.count) && value.count >= 0);
    if (Array.isArray(value.labels) && value.labels.every((label) => typeof label === "string")) {
      assert.equal(value.labels.every((label) => /^[a-z]{1,12}$/.test(label)), true);
    }
  }
});

test("rejects duplicate keys before JSON.parse", () => {
  assert.throws(
    () => parseCanonicalJsonBytes(
      Buffer.from('{"schemaVersion":"1","logicalId":"a","logicalId":"b","count":1,"profile":{},"checks":[],"labels":[]}'),
      CONTRACT
    ),
    /canonical_json_duplicate_key/
  );
});

test("serializes the frozen field order without newline", () => {
  const bytes = serializeCanonicalJsonBytes(
    {
      labels: ["stable"],
      checks: [{ tags: ["native"], metadata: { enabled: true, owner: "ops" }, checkId: "build" }],
      profile: { generation: 7, name: "linux" },
      count: 1,
      logicalId: "alpha",
      schemaVersion: "1"
    },
    CONTRACT
  );
  assert.equal(bytes.toString("utf8"), '{"schemaVersion":"1","logicalId":"alpha","count":1,"profile":{"name":"linux","generation":7},"checks":[{"checkId":"build","metadata":{"owner":"ops","enabled":true},"tags":["native"]}],"labels":["stable"]}');
  assert.equal(sha256Hex(bytes).length, 64);
});

test("deep object key permutations produce the same exact bytes", () => {
  const first = serializeCanonicalJsonBytes({
    schemaVersion: "1",
    logicalId: "alpha",
    count: 1,
    profile: { name: "linux", generation: 7 },
    checks: [{ checkId: "build", metadata: { owner: "ops", enabled: true }, tags: ["native"] }],
    labels: ["stable"]
  }, CONTRACT);
  const permuted = serializeCanonicalJsonBytes({
    labels: ["stable"],
    checks: [{ tags: ["native"], metadata: { enabled: true, owner: "ops" }, checkId: "build" }],
    profile: { generation: 7, name: "linux" },
    count: 1,
    logicalId: "alpha",
    schemaVersion: "1"
  }, CONTRACT);
  assert.deepEqual(first, permuted);

  const semanticallyDifferent = serializeCanonicalJsonBytes({
    schemaVersion: "1",
    logicalId: "alpha",
    count: 1,
    profile: { name: "linux", generation: 7 },
    checks: [{ checkId: "build", metadata: { owner: "release", enabled: true }, tags: ["native"] }],
    labels: ["stable"]
  }, CONTRACT);
  assert.notDeepEqual(first, semanticallyDifferent);
});

test("rejects deep missing, deep unknown, and invalid array elements", () => {
  const valid = {
    schemaVersion: "1",
    logicalId: "alpha",
    count: 1,
    profile: { name: "linux", generation: 7 },
    checks: [{ checkId: "build", metadata: { owner: "ops", enabled: true }, tags: ["native"] }],
    labels: ["stable"]
  };
  assert.throws(
    () => serializeCanonicalJsonBytes({ ...valid, profile: { name: "linux" } }, CONTRACT),
    /foundation-fixture-profile-v1_fields_invalid/
  );
  assert.throws(
    () => serializeCanonicalJsonBytes({
      ...valid,
      checks: [{ checkId: "build", metadata: { owner: "ops", enabled: true, extra: false }, tags: ["native"] }]
    }, CONTRACT),
    /foundation-fixture-metadata-v1_fields_invalid/
  );
  assert.throws(
    () => serializeCanonicalJsonBytes({ ...valid, checks: [null] }, CONTRACT),
    /foundation-fixture-check-v1_object_invalid/
  );
  assert.throws(
    () => serializeCanonicalJsonBytes({ ...valid, labels: [1] }, CONTRACT),
    /foundation-fixture-v1_labels_array_element_invalid/
  );
  assert.throws(
    () => serializeCanonicalJsonBytes({
      ...valid,
      checks: [{ checkId: "build", metadata: { owner: "ops", enabled: true }, tags: [1] }]
    }, CONTRACT),
    /foundation-fixture-check-v1_tags_array_element_invalid/
  );
  assert.throws(
    () => serializeCanonicalJsonBytes({ ...valid, rootExtra: true }, CONTRACT),
    /foundation-fixture-v1_fields_invalid/
  );
  const sparseChecks = new Array(1);
  assert.throws(
    () => serializeCanonicalJsonBytes({ ...valid, checks: sparseChecks }, CONTRACT),
    /foundation-fixture-v1_checks_array_sparse/
  );
  const missingChildContract = Object.freeze({
    ...CONTRACT,
    nested: Object.freeze({ profile: PROFILE_CONTRACT })
  });
  assert.throws(
    () => serializeCanonicalJsonBytes(valid, missingChildContract),
    /foundation-fixture-v1_checks_array_contract_invalid/
  );
  const undeclaredChecks = Object.freeze({
    ...CONTRACT,
    arrays: Object.freeze({
      labels: Object.freeze({ elementType: "string" })
    })
  });
  assert.throws(
    () => serializeCanonicalJsonBytes(valid, undeclaredChecks),
    /foundation-fixture-v1_checks_structured_contract_missing/
  );
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```powershell
node --test server/tests/control-plane-canonical-json.test.mjs
```

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `canonical-json.mjs`.

- [ ] **Step 3: Implement the strict scanner and canonical wrapper**

```js
// strict-json-scan.mjs
export function assertNoDuplicateObjectKeys(text) {
  const stack = [];
  let index = 0;
  let pendingKey = false;

  function skipWhitespace() {
    while (index < text.length && /[\u0009\u000a\u000d\u0020]/.test(text[index])) index += 1;
  }

  function readString() {
    const start = index;
    index += 1;
    while (index < text.length) {
      if (text[index] === "\\") { index += 2; continue; }
      if (text[index] === '"') {
        index += 1;
        return JSON.parse(text.slice(start, index));
      }
      if (text.charCodeAt(index) < 0x20) throw new Error("canonical_json_control_character");
      index += 1;
    }
    throw new Error("canonical_json_unterminated_string");
  }

  while (index < text.length) {
    skipWhitespace();
    const token = text[index];
    if (token === "{") { stack.push({ type: "object", keys: new Set(), expectingKey: true }); index += 1; continue; }
    if (token === "[") { stack.push({ type: "array" }); index += 1; continue; }
    if (token === "}" || token === "]") { stack.pop(); index += 1; continue; }
    if (token === ",") {
      const top = stack.at(-1);
      if (top?.type === "object") top.expectingKey = true;
      index += 1;
      continue;
    }
    if (token === ":") { pendingKey = false; index += 1; continue; }
    if (token === '"') {
      const value = readString();
      const top = stack.at(-1);
      if (top?.type === "object" && top.expectingKey) {
        if (top.keys.has(value)) throw new Error("canonical_json_duplicate_key");
        top.keys.add(value);
        top.expectingKey = false;
        pendingKey = true;
      }
      continue;
    }
    const delimiter = text.slice(index).search(/[\s,}\]]/);
    index = delimiter < 0 ? text.length : index + delimiter;
  }
  if (stack.length !== 0 || pendingKey) throw new Error("canonical_json_structure_invalid");
}
```

```js
// canonical-json.mjs
import { createHash } from "node:crypto";
import { assertNoDuplicateObjectKeys } from "./strict-json-scan.mjs";

const DECODER = new TextDecoder("utf-8", { fatal: true, ignoreBOM: false });

export function sha256Hex(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function isPlainRecord(value) {
  return value !== null
    && typeof value === "object"
    && !Array.isArray(value)
    && Object.getPrototypeOf(value) === Object.prototype;
}

function assertExactFields(value, contract) {
  if (!isPlainRecord(value)) throw new Error(`${contract.schemaId}_object_invalid`);
  const keys = Object.keys(value);
  if (keys.length !== contract.fieldOrder.length
      || contract.fieldOrder.some((key) => !Object.hasOwn(value, key))
      || keys.some((key) => !contract.fieldOrder.includes(key))) {
    throw new Error(`${contract.schemaId}_fields_invalid`);
  }
}

function assertCanonicalScalar(value, schemaId, field) {
  if (value === null || typeof value === "string" || typeof value === "boolean") return;
  if (typeof value === "number" && Number.isSafeInteger(value)) return;
  throw new Error(`${schemaId}_${field}_scalar_invalid`);
}

function assertDenseArray(value, contract, field) {
  for (let index = 0; index < value.length; index += 1) {
    if (!Object.hasOwn(value, index)) {
      throw new Error(`${contract.schemaId}_${field}_array_sparse`);
    }
  }
}

function canonicalizePrimitiveArray(value, descriptor, contract, field) {
  if (!isPlainRecord(descriptor)
      || !Object.isFrozen(descriptor)
      || Object.keys(descriptor).length !== 1
      || !Object.hasOwn(descriptor, "elementType")
      || !["string", "boolean", "safeInteger", "null"].includes(descriptor.elementType)) {
    throw new Error(`${contract.schemaId}_${field}_array_contract_invalid`);
  }
  assertDenseArray(value, contract, field);
  return value.map((element) => {
    const valid = descriptor.elementType === "null"
      ? element === null
      : descriptor.elementType === "safeInteger"
        ? Number.isSafeInteger(element)
        : typeof element === descriptor.elementType;
    if (!valid) throw new Error(`${contract.schemaId}_${field}_array_element_invalid`);
    return element;
  });
}

function canonicalizeObject(value, contract) {
  assertExactFields(value, contract);
  contract.validate(value);
  const ordered = {};
  for (const field of contract.fieldOrder) {
    const fieldValue = value[field];
    if (Object.hasOwn(contract.arrays, field)) {
      if (!Array.isArray(fieldValue)) throw new Error(`${contract.schemaId}_${field}_array_invalid`);
      assertDenseArray(fieldValue, contract, field);
      const descriptor = contract.arrays[field];
      if (typeof descriptor === "string") {
        const elementContract = contract.nested[descriptor];
        if (!elementContract) throw new Error(`${contract.schemaId}_${field}_array_contract_invalid`);
        ordered[field] = fieldValue.map((element) => canonicalizeObject(element, elementContract));
      } else {
        ordered[field] = canonicalizePrimitiveArray(fieldValue, descriptor, contract, field);
      }
      continue;
    }
    if (Object.hasOwn(contract.nested, field)) {
      ordered[field] = canonicalizeObject(fieldValue, contract.nested[field]);
      continue;
    }
    if (Array.isArray(fieldValue) || isPlainRecord(fieldValue)) {
      throw new Error(`${contract.schemaId}_${field}_structured_contract_missing`);
    }
    assertCanonicalScalar(fieldValue, contract.schemaId, field);
    ordered[field] = fieldValue;
  }
  const nestedBytes = Buffer.from(JSON.stringify(ordered), "utf8");
  if (nestedBytes.length > contract.maxBytes) throw new Error(`${contract.schemaId}_too_large`);
  return ordered;
}

export function serializeCanonicalJsonBytes(value, contract) {
  const ordered = canonicalizeObject(value, contract);
  const bytes = Buffer.from(JSON.stringify(ordered), "utf8");
  return bytes;
}

export function parseCanonicalJsonBytes(bytes, contract) {
  if (!Buffer.isBuffer(bytes) || bytes.length === 0 || bytes.length > contract.maxBytes) {
    throw new Error(`${contract.schemaId}_bytes_invalid`);
  }
  const text = DECODER.decode(bytes);
  if (text.charCodeAt(0) === 0xfeff) throw new Error("canonical_json_bom_forbidden");
  assertNoDuplicateObjectKeys(text);
  const value = JSON.parse(text);
  const canonical = serializeCanonicalJsonBytes(value, contract);
  if (!bytes.equals(canonical)) throw new Error("canonical_json_bytes_mismatch");
  return value;
}
```

- [ ] **Step 4: Run the focused test and verify GREEN**

Run: `node --test server/tests/control-plane-canonical-json.test.mjs`

Expected: PASS, including duplicate key, BOM, invalid UTF-8, whitespace,
root/deep field-order, root/deep missing and unknown fields, undeclared structured
values, sparse/invalid array elements, primitive-array descriptors, unsafe
integer, recursive max-byte, semantic-equality permutation, semantic-difference,
and root max-byte cases.

- [ ] **Step 5: Commit the canonical foundation**

```powershell
git add server/services/deployment/strict-json-scan.mjs server/services/deployment/canonical-json.mjs server/tests/control-plane-canonical-json.test.mjs
git commit -m "feat: add canonical deployment byte contracts"
```

### Task 2: Logical Durable Store

**Files:**

- Create: `server/services/deployment/foundation-contract.mjs`
- Create: `server/services/deployment/durable-store.mjs`
- Test: `server/tests/control-plane-durable-store.test.mjs`

**Interfaces:**

- Consumes: Task 1 `sha256Hex` plus the Foundation native fixed-logical-ID
  `durableReadLogical`, `durablePublishNoReplace`,
  `durableCompareAndSwap`, and `durableUnlinkVerified` operations implemented
  in Task 4.
- Produces: immutable publish, exact CAS, exact readback, and exact durable
  unlink without exposing a caller-selected path or performing a mutation as a
  JavaScript read followed by a second native write.
- Produces the frozen Foundation contract arrays shown in Shared Interfaces so
  this task and every later task consume the same four atomic exports, 15 native
  exports, nine compiler flags, and 14 feasibility features.
- The `contracts` map is a closed allowlist keyed by the same reviewed logical
  IDs compiled into the native record registry. It supplies only schema and
  byte-limit validation; it contains no relative path, mode override, lock
  name, or rename target.
- The only constructor signature is
  `createDurableStore({ contracts, fsOps, native })`. There is no positional,
  single-adapter, inferred-default, or overload form; every test harness must
  destructure those exact three dependencies and pass the named object.

- [ ] **Step 1: Write failing atomic-delegation and idempotency tests**

```js
import { ATOMIC_LOGICAL_RECORD_EXPORTS } from "../services/deployment/foundation-contract.mjs";

test("publishes only through the fixed logical record map", async () => {
  const calls = [];
  const store = createDurableStore({
    contracts: new Map([["foundation-test-rotation-journal-v1", { maxBytes: 4096 }]]),
    fsOps: createMemoryFs(),
    native: createRecordingNative(calls)
  });
  const result = await store.publishImmutable("foundation-test-rotation-journal-v1", Buffer.from("{}"));
  assert.equal(result.sha256.length, 64);
  assert.equal(result.outcome, "created");
  assert.deepEqual(calls.map(({ operation }) => operation), ["durablePublishNoReplace"]);
  await assert.rejects(() => store.publishImmutable("../../escape", Buffer.from("{}")), /durable_logical_id_unknown/);
});

test("accepts only the named dependency object with all four atomic exports", () => {
  const harness = createAtomicHarness();
  assert.throws(
    () => createDurableStore({ contracts: harness.contracts, native: harness.native }),
    /durable_store_dependencies_invalid/
  );
  assert.throws(() => createDurableStore({
    contracts: harness.contracts,
    fsOps: harness.fsOps,
    native: harness.native,
    rootPath: "forbidden"
  }), /durable_store_dependencies_invalid/);
  for (const operation of ATOMIC_LOGICAL_RECORD_EXPORTS) {
    const native = { ...harness.native, [operation]: undefined };
    assert.throws(() => createDurableStore({
      contracts: harness.contracts,
      fsOps: harness.fsOps,
      native
    }), /durable_store_dependencies_invalid/);
  }
});

test("CAS is one native transaction and never read-then-write", async () => {
  const calls = [];
  const { contracts, fsOps, native } = createAtomicHarness({ calls });
  const store = createDurableStore({ contracts, fsOps, native });
  const result = await store.casCanonical(
    "foundation-test-rotation-journal-v1",
    "a".repeat(64),
    Buffer.from('{"state":"armed"}\n')
  );
  assert.equal(result.outcome, "replaced");
  assert.deepEqual(calls.map(({ operation }) => operation), ["durableCompareAndSwap"]);
  assert.equal(calls.some(({ operation }) => operation === "durableReadLogical"), false);
  assert.equal(calls.some(({ operation }) => operation === "durablePublishNoReplace"), false);
});

test("lost-response replay succeeds only for exact successor bytes", async () => {
  const { contracts, fsOps, native } = createAtomicHarness({ casAlreadyApplied: true });
  const store = createDurableStore({ contracts, fsOps, native });
  const next = Buffer.from('{"state":"in_progress"}\n');
  assert.equal((await store.casCanonical(
    "foundation-test-rotation-journal-v1",
    "a".repeat(64),
    next
  )).outcome, "already_equal");
  await assert.rejects(() => store.casCanonical(
    "foundation-test-rotation-journal-v1",
    "a".repeat(64),
    Buffer.from('{"state":"different"}\n')
  ), /durable_cas_digest_mismatch/);
});

test("verified unlink never treats unexplained absence as replay success", async () => {
  const absentHarness = createAtomicHarness({ recordAbsent: true, unlinkMarker: null });
  const store = createDurableStore({
    contracts: absentHarness.contracts,
    fsOps: absentHarness.fsOps,
    native: absentHarness.native
  });
  await assert.rejects(() => store.unlinkVerified(
    "foundation-test-rotation-journal-v1",
    "a".repeat(64)
  ), /durable_unlink_evidence_missing/);
  const replayHarness = createAtomicHarness({
    recordAbsent: true,
    unlinkMarker: { logicalId: "foundation-test-rotation-journal-v1", expectedSha256: "a".repeat(64) }
  });
  const replay = createDurableStore({
    contracts: replayHarness.contracts,
    fsOps: replayHarness.fsOps,
    native: replayHarness.native
  });
  assert.equal((await replay.unlinkVerified(
    "foundation-test-rotation-journal-v1",
    "a".repeat(64)
  )).outcome, "already_absent");
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `node --test server/tests/control-plane-durable-store.test.mjs`

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `foundation-contract.mjs`; after
that frozen contract exists, `durable-store.mjs` remains missing. After both
modules first exist, the CAS test remains RED if it calls readback plus publish
instead of the one native atomic primitive.

- [ ] **Step 3: Implement the closed logical record map over atomic native operations**

Create `foundation-contract.mjs` first with the four exact frozen arrays in
Shared Interfaces, then implement the store against its
`ATOMIC_LOGICAL_RECORD_EXPORTS`. Do not duplicate or reorder those constants in
`durable-store.mjs`.

```js
import { sha256Hex } from "./canonical-json.mjs";
import { ATOMIC_LOGICAL_RECORD_EXPORTS } from "./foundation-contract.mjs";

export function createDurableStore({ contracts, fsOps, native }) {
  const dependencyKeys = Object.keys(arguments[0]).sort();
  if (dependencyKeys.length !== 3
      || dependencyKeys[0] !== "contracts"
      || dependencyKeys[1] !== "fsOps"
      || dependencyKeys[2] !== "native"
      || !(contracts instanceof Map)
      || !Number.isSafeInteger(fsOps?.rootFd)
      || fsOps.rootFd < 0
      || !native
      || ATOMIC_LOGICAL_RECORD_EXPORTS.some((name) => typeof native[name] !== "function")) {
    throw new Error("durable_store_dependencies_invalid");
  }
  function contractFor(logicalId) {
    const contract = contracts.get(logicalId);
    if (!contract) throw new Error("durable_logical_id_unknown");
    return contract;
  }
  function validateBytes(contract, bytes) {
    if (!Buffer.isBuffer(bytes) || bytes.length > contract.maxBytes) {
      throw new Error("durable_record_too_large");
    }
  }
  async function readbackExact(logicalId, expectedSha256) {
    contractFor(logicalId);
    const result = await native.durableReadLogical({
      directoryFd: fsOps.rootFd,
      logicalId,
      expectedSha256
    });
    if (result.sha256 !== expectedSha256 || sha256Hex(result.bytes) !== expectedSha256) {
      throw new Error("durable_readback_digest_mismatch");
    }
    return result.bytes;
  }
  return Object.freeze({
    async publishImmutable(logicalId, bytes) {
      const contract = contractFor(logicalId);
      validateBytes(contract, bytes);
      const sha256 = sha256Hex(bytes);
      const result = await native.durablePublishNoReplace({
        directoryFd: fsOps.rootFd,
        logicalId,
        bytes
      });
      if (!["created", "already_equal"].includes(result.outcome) || result.sha256 !== sha256) {
        throw new Error("durable_publish_result_invalid");
      }
      return Object.freeze({ outcome: result.outcome, sha256 });
    },
    async casCanonical(logicalId, expectedSha256, nextBytes) {
      const contract = contractFor(logicalId);
      validateBytes(contract, nextBytes);
      const nextSha256 = sha256Hex(nextBytes);
      const result = await native.durableCompareAndSwap({
        directoryFd: fsOps.rootFd,
        logicalId,
        expectedSha256,
        nextBytes
      });
      if (!["replaced", "already_equal"].includes(result.outcome) || result.sha256 !== nextSha256) {
        throw new Error("durable_cas_result_invalid");
      }
      return Object.freeze({ outcome: result.outcome, sha256: nextSha256 });
    },
    async unlinkVerified(logicalId, expectedSha256) {
      contractFor(logicalId);
      const result = await native.durableUnlinkVerified({
        directoryFd: fsOps.rootFd,
        logicalId,
        expectedSha256
      });
      if (!["removed", "already_absent"].includes(result.outcome) || result.present !== false) {
        throw new Error("durable_unlink_result_invalid");
      }
      return Object.freeze(result);
    },
    readbackExact
  });
}
```

- [ ] **Step 4: Run injected atomic-outcome tests and verify GREEN**

Run: `node --test server/tests/control-plane-durable-store.test.mjs`

Expected: PASS for publish created/exact-byte replay/conflict, CAS
replaced/already-equal/predecessor mismatch, verified unlink removed/eligible
already-absent/mismatch, readback, logical-ID rejection, and size cap. The call
trace for each mutation contains exactly one native atomic mutation and no
preceding `durableReadLogical`. Task 4 owns the real forked multi-process,
OFD-lock, rename/unlink, parent-fsync, and crash-boundary proof for those injected
outcomes.

- [ ] **Step 5: Commit the durable store**

```powershell
git add server/services/deployment/foundation-contract.mjs server/services/deployment/durable-store.mjs server/tests/control-plane-durable-store.test.mjs
git commit -m "feat: add durable deployment state store"
```

### Task 3: Pinned Native Build Surface

**Files:**

- Create: `ops/control-plane-deploy/native/binding.gyp`
- Create: `ops/control-plane-deploy/native/index.mjs`
- Create: `ops/control-plane-deploy/native/src/control-plane-native.c`
- Create: `ops/control-plane-deploy/native/registry/reviewed-native-registry-manifest.json`
- Create: `ops/control-plane-deploy/native/registry/foundation-profiles.json`
- Create: `ops/control-plane-deploy/native/registry/foundation-logical-records.json`
- Create: `ops/control-plane-deploy/native/registry/foundation-compile-profiles.json`
- Create: `ops/control-plane-deploy/native/registry/foundation-standalone-targets.json`
- Create: `ops/control-plane-deploy/native/src/foundation-profile-probe.c`
- Create: `ops/control-plane-deploy/native/src/native-contract-test.c`
- Create: `scripts/build-control-plane-native.mjs`
- Create: `scripts/control-plane-native-registry.mjs`
- Create: `scripts/control-plane-node-headers-contract.mjs`
- Create: `scripts/control-plane-native-toolchain-contract.mjs`
- Create: `server/tests/control-plane-native-contract.test.mjs`
- Create: `server/tests/control-plane-native-registry.test.mjs`
- Create: `server/tests/control-plane-node-headers-contract.test.mjs`
- Create: `server/tests/control-plane-native-toolchain-contract.test.mjs`
- Create: `integration/control-plane-deploy/foundation-linux.test.mjs`
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `.gitignore`

**Interfaces:**

- Consumes: `node-gyp@11.4.2` from the exact lockfile; a reviewed,
  digest-pinned Node headers tree; and a reviewed, digest-pinned Linux C
  toolchain tree. The offline builder supplies exactly the six custody inputs
  `CONTROL_PLANE_NODE_HEADERS_DIR`,
  `CONTROL_PLANE_NODE_HEADERS_MANIFEST`,
  `CONTROL_PLANE_EXPECTED_NODE_HEADERS_SHA256`,
  `CONTROL_PLANE_NATIVE_TOOLCHAIN_DIR`,
  `CONTROL_PLANE_NATIVE_TOOLCHAIN_MANIFEST`, and
  `CONTROL_PLANE_EXPECTED_TOOLCHAIN_SHA256`: the two canonical manifests, their
  expected tree digests, and the two custody roots. Executable selection,
  compiler-relative path, executable content digests, flags, sources, target
  IDs, and output names come only from the compiled registry and verified
  toolchain manifest.
- Produces: a Linux-only Node-API addon whose callable exports exactly equal
  `FOUNDATION_NATIVE_EXPORTS`; reviewed standalone C binaries under the fixed
  `ops/control-plane-deploy/native/build/standalone/` output root; and one
  canonical build receipt binding registry, profile, every actually executed
  build-tool digest, source, and output digests. The toolchain verifier also
  produces a branded frozen verified-toolchain result, and
  `createVerifiedNativeToolEnvironment(verifiedToolchain)` derives the only
  permitted narrow `PATH` plus fixed `CC`, `CXX`, `AR`, `LD`, `PYTHON`, and
  `MAKE` values from it. No CLI option, environment variable, fixture,
  downstream caller, or registry fragment can select an arbitrary executable
  path, source path, flag, or output path.
- The only standalone compile profile is `hardened-c17-pie-v1`, with this exact
  ordered flag vector and no implicit or caller-appended flag:

  `-std=c17 -O2 -fPIE -pie -fstack-protector-strong -Wl,-z,relro,-z,now -Wall -Wextra -Werror`

  `-o`, the fixed temporary output operand, and the reviewed source operands are
  structural compiler operands added by the adapter; they are not extension
  flags. The adapter passes `shell:false`, never evaluates a response file, and
  rejects a source, output, or argument beginning with `-` unless it is one of
  the nine frozen flags above.
- `scripts/build-control-plane-native.mjs` owns only this repository's first-party
  Node-API addon and manifest-reviewed standalone C targets. It never invokes an
  install script and never discovers or builds `better-sqlite3`, another
  dependency addon, or an unregistered binary. Artifact's later direct
  `better-sqlite3` adapter is a separate owner and contract. That adapter must
  import the same `verifyNodeHeadersTree`, `verifyNativeToolchainTree`, and
  `createVerifiedNativeToolEnvironment` functions, consume all six custody
  inputs unchanged, use the same narrow tool environment, and bind every tool
  it actually executes into its own build receipt; Foundation does not build or
  attest `better-sqlite3` for it.
- Foundation owns the base fragments and ordered manifest. Bootstrap extends the
  registry only by adding its reviewed C source, one direct-child canonical
  fragment, and the fragment's digest entry to the same manifest. It reuses
  `hardened-c17-pie-v1` and the existing adapter; there is no runtime registration
  function, plugin search path, second registry root, environment-selected
  fragment, or additional public spawn ABI.

#### Approved 2026-08-09 Toolchain Inventory Bootstrap

Before Step 1, implement the separately named Foundation toolchain inventory
workflow and controller. The controller has no CLI selector and observes only
the fixed Node headers root plus the six fixed tool roles `CC`, `CXX`, `AR`,
`LD`, `PYTHON`, and `MAKE` resolved from the reviewed inventory contract. It
must not execute any observed file. It recursively rejects symlinks, nonregular
entries, duplicate realpaths, unknown fields, and path escape; hashes bytes in
stable POSIX-relative order; and emits one canonical JSON line containing only
schema/type, source commit, fixed workflow identity, Node version/ABI/N-API,
the ordered role-to-content-digest table, headers tree digest, candidate
toolchain tree digest, and candidate bundle digest. No absolute path, runner
name, hostname, UID, PID, device/inode, environment value, or raw command output
may appear.

The workflow is `pull_request` to `master` only, runs on `ubuntu-24.04`, uses
the reviewed exact-SHA checkout/setup-node actions, checks out
`${{ github.event.pull_request.head.sha }}` with persisted credentials disabled,
and runs only the inventory-focused tests and controller. It has no dependency
install, compiler, node-gyp, project build, environment, secret expression,
cache, artifact upload, GitHub write permission, SSH, provider, Release,
package, container, host, or production operation. The controller's stdout is
review evidence only. The workflow and controller must label the result
`eligible:false` and `authority:"inventory_only"`; no downstream code accepts
that schema as a toolchain, build, Artifact Gate, or production receipt.

After the inventory run, stop. Human review verifies the exact run/head and
candidate digests. Creating or publishing the immutable Foundation toolchain
asset is a separate, later Gate and is not authorized by this plan update. Only
after that Gate has its own explicit approval may the compile profile record the
real compiler digest, the six custody inputs refer to the published immutable
asset, and Task 3 continue to the actual build.

#### Approved 2026-08-09 v2 Complete-Closure Correction

The v1 candidate digest is retained as historical review evidence but is not a
publishable toolchain identity: it binds six role files and Node headers, while
the build contract requires every compiler-internal executable/helper to be
immutable as well. Version 2 therefore uses one complete OCI platform manifest
as the closure boundary. The only allowed image is
`docker.io/library/node:22.23.1-bookworm@sha256:175215a1f306ed5df592434b99cc2019f70624373fe49cb659240a618a846aed`
for `linux/amd64`. The platform-manifest digest binds the full root filesystem;
the inventory additionally hashes the fixed Node headers tree and ordered six
role files from inside that exact image. A different tag, digest, platform,
runtime identity, role path/digest, or headers tree is a new candidate requiring
another inventory and review.

Modify the existing inventory workflow/controller rather than creating a
parallel authority. It remains `pull_request` to `master`, `contents: read`,
GitHub-hosted `ubuntu-24.04`, no secret/environment/write permission, no setup
Node, no dependency install, no compiler/tool execution, no cache/artifact, and
no publication. Its job-level `container` is the exact image reference above.
The canonical v2 line contains `schemaVersion:"2"`, `closureKind:
"oci_platform_manifest"`, exact image/tag/manifest/platform fields, Node
identity, the ordered role table, headers digest, and a domain-separated
`candidateClosureSha256`; it remains `authority:"inventory_only"` and
`eligible:false`.

Add one separate `.github/workflows/control-plane-foundation-toolchain-publish.yml`.
It is `workflow_dispatch` only, runs only from `refs/heads/master`, and accepts
exactly `source_commit`, decimal `inventory_run_id`, lowercase 64-hex
`candidate_closure_sha256`, and confirmation
`publish Foundation toolchain lock`. Its read-only preflight checks out the
trusted master workflow source, retrieves the exact successful inventory run,
extracts exactly one canonical v2 receipt, verifies run/head/workflow/receipt and
input equality, and produces one canonical lock body. The publisher is a
distinct job bound to `artifact-publication` with only `actions:read`,
`contents:write`, `id-token:write`, and `attestations:write`; it has no checkout
or setup-node and cannot execute repository/candidate/build code.

The fixed release tag is
`control-plane-foundation-toolchain-v2-{candidateClosureSha256}` and the sole
asset is
`foundation-toolchain-lock-v2-{candidateClosureSha256}.json`. The publisher
requires the repository immutable-release API to return `enabled:true`, creates
a draft, uploads and attests that exact asset, publishes the draft, then reads
back `immutable:true`, the exact target commit, exactly one asset, and GitHub's
`sha256:` digest matching the local bytes. It never enables/disables immutable
releases and never replaces/deletes/clobbers an existing object. Any partial or
conflicting state fails closed for manual investigation. This source change and
the v2 inventory run are approved now; after the new digest is emitted, stop for
human review. No publication workflow dispatch is authorized by this step.

The exact release target commit is the inventory receipt's independently
revalidated `sourceCommit`; it is passed from the read-only preflight as an
opaque output. The write-capability job must not substitute its later workflow
dispatch SHA or resolve a mutable branch/tag for that target.

- [ ] **Step 1: Write failing closed-export, registry, compiler, and standalone-target tests**

```js
import {
  ATOMIC_LOGICAL_RECORD_EXPORTS,
  FOUNDATION_NATIVE_EXPORTS,
  HARDENED_C17_PIE_V1_FLAGS,
  REQUIRED_LINUX_FEATURES
} from "../services/deployment/foundation-contract.mjs";
import { sha256Hex } from "../services/deployment/canonical-json.mjs";

test("native wrapper exports the closed operation set", async () => {
  const native = await import("../../ops/control-plane-deploy/native/index.mjs");
  assert.deepEqual(FOUNDATION_NATIVE_EXPORTS, [
    "createBoundedCapture",
    "createDatabaseIdentityLease",
    "createSealedMemfd",
    "durableCompareAndSwap",
    "durablePublishNoReplace",
    "durableReadLogical",
    "durableSwapSymlink",
    "durableUnlink",
    "durableUnlinkVerified",
    "durableWriteFile",
    "inspectSqliteMainHandle",
    "probeLinuxCapabilities",
    "receiveDatabaseCapability",
    "sendDatabaseCapability",
    "spawnWithExactFileDescriptors"
  ]);
  assert.deepEqual(Object.keys(native).sort(), FOUNDATION_NATIVE_EXPORTS);
  assert.deepEqual(ATOMIC_LOGICAL_RECORD_EXPORTS, [
    "durableReadLogical",
    "durablePublishNoReplace",
    "durableCompareAndSwap",
    "durableUnlinkVerified"
  ]);
  assert.equal(ATOMIC_LOGICAL_RECORD_EXPORTS.every((name) => typeof native[name] === "function"), true);
  assert.deepEqual(HARDENED_C17_PIE_V1_FLAGS, [
    "-std=c17", "-O2", "-fPIE", "-pie", "-fstack-protector-strong",
    "-Wl,-z,relro,-z,now", "-Wall", "-Wextra", "-Werror"
  ]);
  assert.equal(REQUIRED_LINUX_FEATURES.length, 14);
});

test("reviewed fragment extends fixed IDs and targets without extending ABI or flags", async () => {
  const fixture = registryFixture({
    extraFragment: bootstrapProfileFragmentFixture()
  });
  const compiled = compileReviewedNativeRegistryFixture(fixture);
  assert.equal(compiled.sourceRoot, "ops/control-plane-deploy/native");
  assert.equal(
    compiled.manifestPath,
    "ops/control-plane-deploy/native/registry/reviewed-native-registry-manifest.json"
  );
  assert.deepEqual(compiled.executableIds, [
    "foundation-fd-probe",
    "foundation-openssh-handoff-probe",
    "foundation-response-probe",
    "control-plane-ssh-deploy-status-v1"
  ]);
  assert.deepEqual(compiled.environmentIds, [
    "empty",
    "control-plane-ssh-clean-v1"
  ]);
  assert.deepEqual(compiled.compileProfiles.map(({ compileProfileId, flags }) => ({
    compileProfileId,
    flags
  })), [{
    compileProfileId: "hardened-c17-pie-v1",
    flags: HARDENED_C17_PIE_V1_FLAGS
  }]);
  assert.deepEqual(compiled.standaloneTargetIds, [
    "foundation-native-contract-test",
    "foundation-profile-probe",
    "control-plane-ssh-command-v1"
  ]);
  assert.equal(compiled.publicNativeExports.includes("registerExecutable"), false);
  assert.equal(compiled.manifestSha256, sha256Hex(fixture.manifestBytes));
  assert.match(compiled.registrySha256, /^[0-9a-f]{64}$/);
  assert.equal(compiled.generatedHeaderPath.endsWith("compiled-native-registry.h"), true);
  assert.equal(compiled.buildPlanPath.endsWith("reviewed-standalone-build-plan.json"), true);
});

test("resolves standalone source from native root and never registry/src", () => {
  const fixture = registryFixture();
  const compiled = compileReviewedNativeRegistryFixture(fixture);
  const target = compiled.standaloneTargets.find(
    ({ targetId }) => targetId === "foundation-profile-probe"
  );
  assert.equal(target.source, "src/foundation-profile-probe.c");
  assert.equal(target.resolvedSourcePath, fixture.nativeSourcePath);

  assert.throws(
    () => compileReviewedNativeRegistryFixture(
      registryFixture({ registryShadowSource: true })
    ),
    /native_registry_entry_unregistered/
  );
  assert.throws(
    () => compileReviewedNativeRegistryFixture(
      registryFixture({ omitNativeSource: true })
    ),
    /native_standalone_source_missing/
  );
});

test("standalone output manifest binds reviewed input and produced bytes", async () => {
  const result = await runSyntheticReviewedBuild();
  assert.deepEqual(result.outputs.map(({ targetId }) => targetId), [
    "foundation-native-contract-test",
    "foundation-profile-probe"
  ]);
  for (const output of result.outputs) {
    assert.match(output.sourceSha256, /^[0-9a-f]{64}$/);
    assert.match(output.compilerSha256, /^[0-9a-f]{64}$/);
    assert.match(output.outputSha256, /^[0-9a-f]{64}$/);
    assert.equal(output.compileProfileId, "hardened-c17-pie-v1");
    assert.equal(output.path.startsWith("ops/control-plane-deploy/native/build/standalone/"), true);
  }
});
```

Add table-driven RED rows for all of the following, with one exact fixed error
code per row:

- an unregistered direct-child fragment, registered fragment digest drift,
  duplicate ID, unknown field, wrong fragment kind, nested/absolute/traversing
  fragment name, fragment symlink, second registry root, a production
  `sourceRoot` other than `ops/control-plane-deploy/native`, a production
  `manifestPath` other than
  `ops/control-plane-deploy/native/registry/reviewed-native-registry-manifest.json`,
  or a runtime registration export;
- an unknown or duplicate compile profile, any of the nine flags missing,
  reordered, duplicated, or changed, an extra flag, compiler relative-path
  drift, compiler content-digest drift, toolchain-ID drift, and a compiler tree
  whose canonical manifest or recomputed root digest does not match;
- a missing, extra, symlinked, duplicated-realpath, out-of-tree, non-executable,
  or digest-drifted `cc`, `c++`, `ar`, `ld`, `python3`, or `make`; an unlisted or
  changed transitive executable; a forged verified-toolchain object; an ambient
  `PATH` component; any `CC`/`CXX`/`AR`/`LD`/`PYTHON`/`MAKE` override; any one of
  the six custody variables missing; and a receipt that omits or reorders one
  verified executable digest or accepts a Node/node-gyp/tool executable changed
  between pre-build verification and final receipt publication;
- an unregistered source, absolute source, source not matching `src/*.c`, source
  traversal/symlink/content-digest drift, any unregistered `registry/src/`
  directory or shadow source, unregistered standalone target,
  unknown profile binding, caller-selected
  executable path or descriptor slot, output-name drift, output traversal,
  output-root/component symlink, duplicate output, response-file operand,
  environment interpolation, and a
  standalone binary whose final digest does not match its build receipt;
- any Node-API ABI or wrapper-export growth or shrinkage after adding a reviewed
  standalone target. The expected value remains N-API 9 and the exact 15-entry
  `FOUNDATION_NATIVE_EXPORTS` list.

The Bootstrap fixture is synthetic and recreates the same temporary native-root
layout: its manifest-listed fragment is a direct child of `registry/`, while its
standalone C source is a direct child of `src/`. Bootstrap owns the later tracked
source, fragment, and manifest entry.

- [ ] **Step 2: Run the contract test and verify RED**

Run:

```powershell
node --test server/tests/control-plane-native-contract.test.mjs server/tests/control-plane-native-registry.test.mjs server/tests/control-plane-native-toolchain-contract.test.mjs
```

Expected: FAIL because `ops/control-plane-deploy/native/index.mjs` and the
reviewed registry/toolchain compilers do not exist.

- [ ] **Step 3: Implement the canonical registry schemas and closed compiler output**

`reviewed-native-registry-manifest.json` has exactly
`schemaVersion`, `registryId`, and ordered `fragments`. Each fragment entry has
exactly `kind`, `name`, and `sha256`; `name` is a basename for a regular,
non-symlink direct child of `ops/control-plane-deploy/native/registry/`.
Fragment resolution always uses the manifest's fixed registry directory; it
never uses the native source root. The compiler enumerates that directory and
permits only the manifest itself plus the regular direct-child fragments listed
by it. Any other file, symlink, or subdirectory—including `registry/src/`—is
`native_registry_entry_unregistered`. It also rejects duplicate manifest
entries and requires exactly one Foundation fragment of each base kind:

- `logical_records`: fixed logical ID, record/lock/replay-marker relative names,
  byte cap, and mode;
- `spawn_profiles`: fixed executable/environment IDs, standalone target ID,
  fixed arguments, descriptor-role table, timeout cap, and fixed environment;
- `compile_profiles`: compile profile ID, toolchain ID, fixed compiler-relative
  path, exact compiler SHA-256, and ordered flags;
- `standalone_targets`: target ID, compile profile ID, fixed output basename,
  one `source`, and its exact `sourceSha256`.

Target IDs and output basenames match `^[a-z0-9][a-z0-9-]{0,63}$`; an output
has no suffix, separator, leading dot, or second destination field. Reviewed
standalone `source` values match exactly
`^src/[a-z0-9][a-z0-9-]{0,63}\.c$`, for example
`source: "src/foundation-profile-probe.c"`. They are resolved relative to
`ops/control-plane-deploy/native`, never relative to its `registry` directory or
the repository root. The resolved file must be a regular non-symlink direct
child of `ops/control-plane-deploy/native/src/`, and its bytes must match
`sourceSha256`. The one Foundation compiler relative path is exactly `bin/cc`;
neither extensions nor callers may override it.

A downstream manifest entry may have kind `native_extension`. That one fragment
has exactly `schemaVersion`, `fragmentType`, `ownerId`, `logicalRecords`,
`spawnProfiles`, and `standaloneTargets`; it cannot declare a compile profile.
Thus Bootstrap's registry change is exactly one `native_extension` fragment plus
one manifest entry even when its fixed profiles refer to several reviewed C
targets. The same global duplicate-ID, source-digest, target, output, descriptor,
and environment checks are applied after folding the extension into the four
base tables.

`foundation-compile-profiles.json` contains exactly one profile,
`hardened-c17-pie-v1`. During implementation, measure the compiler from the
reviewed toolchain tree and record its real lowercase 64-hex digest in that
fragment; never insert a sentinel digest. Its flags must byte-equal
`HARDENED_C17_PIE_V1_FLAGS`. The compiler-relative path is a fixed POSIX path in
the fragment, and resolving it beneath the already verified toolchain root must
remain beneath that root without symlinks.

`foundation-standalone-targets.json` initially declares exactly
`foundation-profile-probe` and `foundation-native-contract-test`. Each spawn
profile points to one of those target IDs rather than a path. Output basenames
are fixed registry values and are materialized only beneath
`ops/control-plane-deploy/native/build/standalone/`. After creating each tracked
C source at `src/foundation-profile-probe.c` and `src/native-contract-test.c`,
compute and record the actual `sourceSha256`, then compute and record the actual
fragment digest in the reviewed manifest.

The production registry entrypoint is
`compileReviewedNativeRegistry({ sourceRoot, manifestPath, outputDirectory })`.
The first two arguments must byte-equal these repository-relative constants:

```js
const NATIVE_SOURCE_ROOT = "ops/control-plane-deploy/native";
const NATIVE_REGISTRY_MANIFEST =
  "ops/control-plane-deploy/native/registry/reviewed-native-registry-manifest.json";
```

The compiler derives the repository root from `import.meta.url`, rejects any
different source or manifest argument, requires `outputDirectory` to be the
adapter-created fresh build directory, and resolves the two namespaces
independently:

- fragment `name` -> `dirname(NATIVE_REGISTRY_MANIFEST)/name`, requiring a
  manifest-listed direct child of `registry/` with the bound fragment digest;
- standalone `source` -> `NATIVE_SOURCE_ROOT/source`, requiring a regular
  no-symlink `src/*.c` file with the bound `sourceSha256`.

Joining standalone `source` to the manifest directory (and therefore resolving
it as `registry/src/*.c`) is an explicit contract failure. The entrypoint
accepts no caller-selected compiler, flag, source, or output-name parameter. It
returns this frozen shape:

```js
Object.freeze({
  sourceRoot,
  manifestPath,
  manifestSha256,
  registrySha256,
  generatedHeaderPath, // <owned build temp>/compiled-native-registry.h
  buildPlanPath,       // <owned build temp>/reviewed-standalone-build-plan.json
  executableIds,
  environmentIds,
  logicalRecordIds,
  compileProfiles,
  standaloneTargets, // each binds source, sourceSha256, resolvedSourcePath
  publicNativeExports: FOUNDATION_NATIVE_EXPORTS
});
```

The canonical build plan contains only the compiled values described above; its
profile flags and target source/output values are byte-for-byte projections of
the digest-bound fragments. `manifestSha256` is the digest of the exact canonical
manifest bytes; `registrySha256` binds that digest plus the ordered verified
fragment digests and compiled table bytes. The generated C header binds `registrySha256` and
the same fixed logical/spawn tables. Fixture compilation uses a test-only helper
that creates the identical `ops/control-plane-deploy/native/{registry,src}`
layout under a temporary repository root and then applies the same two fixed
repository-relative constants. That helper is not exported by the build CLI or
runtime wrapper.

- [ ] **Step 4: Add the pinned Node-API build and toolchain contracts**

```json
{
  "targets": [
    {
      "target_name": "control_plane_native",
      "sources": [
        "src/control-plane-native.c"
      ],
      "defines": ["NAPI_VERSION=9", "_GNU_SOURCE"],
      "cflags": ["-std=c17", "-Wall", "-Wextra", "-Werror", "-fstack-protector-strong"]
    }
  ]
}
```

The binding remains one `control_plane_native` target with N-API 9. Adding the
standalone adapter changes neither `binding.gyp` target count nor the Node-API C
registration/export table. `server/tests/control-plane-native-contract.test.mjs`
loads the addon after every build and compares ABI and all 15 exports with the
frozen contract.

`verifyNodeHeadersTree` and `verifyNativeToolchainTree` parse their canonical
manifests with the shared codec, reject symlinks and unlisted or missing entries,
and recompute stable POSIX-relative path/mode/size/content tree digests. The
headers verifier additionally binds `nodeVersion` and `nodeModuleAbi`. The
toolchain verifier additionally requires the registry's fixed toolchain ID,
requires exact regular non-symlink executable entries for `bin/cc`, `bin/c++`,
`bin/ar`, `bin/ld`, `bin/python3`, and `bin/make`, resolves each beneath the
verified tree, and rehashes each executable before any subprocess starts. The
`bin/cc` digest must also equal the profile's `compilerSha256`. The returned
branded object exposes the verified tree digest, narrow `binDirectory`, and
fixed path/digest pairs `compiler`, `cxx`, `archiver`, `linker`, `python`, and
`make`; it never accepts an executable override. The canonical toolchain
manifest also lists the complete executable closure those drivers may start
(for example assembler/compiler-internal helpers), in fixed POSIX-relative path
order with a digest for each. `executableDigests` is that ordered closed table,
and `assertExecutableClosureUnchanged()` rehashes the table before every direct
spawn. A helper absent from the verified tree/manifest or reachable only from
an ambient path is a build failure.

`createVerifiedNativeToolEnvironment(verifiedToolchain)` accepts only that
module-branded result and returns exactly `PATH`, `CC`, `CXX`, `AR`, `LD`,
`PYTHON`, and `MAKE`. `PATH` is the one verified toolchain `bin/` directory;
every other value is the corresponding verified absolute path. It rejects an
extra executable, a missing role, duplicate realpath, digest drift between
verification and spawn, an ambient path component, or a forged/caller-created
object. Tests also prove that `node-gyp` receives the same fixed compiler,
C++ compiler, archiver, linker, Python, and make identities as the standalone
adapter. No command may fall back to an ambient `cc`, `c++`, `ar`, `ld`,
`python`, `make`, or shell.

- [ ] **Step 5: Implement the first-party addon and standalone build adapter**

```js
// scripts/build-control-plane-native.mjs
import { spawnSync } from "node:child_process";
import {
  chmodSync, existsSync, lstatSync, mkdirSync, mkdtempSync, realpathSync,
  readFileSync, renameSync, rmSync, statSync
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  compileReviewedNativeRegistry,
  writeRepositoryStandaloneBuildReceipt
} from "./control-plane-native-registry.mjs";
import { verifyNodeHeadersTree } from "./control-plane-node-headers-contract.mjs";
import {
  createVerifiedNativeToolEnvironment,
  verifyNativeToolchainTree
} from "./control-plane-native-toolchain-contract.mjs";
import { sha256Hex } from "../server/services/deployment/canonical-json.mjs";

const forbidden = [
  "HTTP_PROXY", "HTTPS_PROXY", "ALL_PROXY",
  "http_proxy", "https_proxy", "all_proxy",
  "npm_config_proxy", "npm_config_https_proxy"
];
for (const name of forbidden) {
  if (process.env[name]) throw new Error("native_build_proxy_forbidden");
}
if (process.platform !== "linux") throw new Error("native_build_linux_required");
const NATIVE_SOURCE_ROOT = "ops/control-plane-deploy/native";
const NATIVE_REGISTRY_MANIFEST =
  "ops/control-plane-deploy/native/registry/reviewed-native-registry-manifest.json";
const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const nativeRoot = join(repositoryRoot, NATIVE_SOURCE_ROOT);
const standaloneOutputRoot = join(nativeRoot, "build/standalone");
const headersInput = process.env.CONTROL_PLANE_NODE_HEADERS_DIR;
const headersManifest = process.env.CONTROL_PLANE_NODE_HEADERS_MANIFEST;
const expectedHeadersSha256 = process.env.CONTROL_PLANE_EXPECTED_NODE_HEADERS_SHA256;
const toolchainInput = process.env.CONTROL_PLANE_NATIVE_TOOLCHAIN_DIR;
const toolchainManifest = process.env.CONTROL_PLANE_NATIVE_TOOLCHAIN_MANIFEST;
const expectedToolchainSha256 = process.env.CONTROL_PLANE_EXPECTED_TOOLCHAIN_SHA256;
if (!headersInput || !headersManifest || !expectedHeadersSha256
    || !toolchainInput || !toolchainManifest || !expectedToolchainSha256) {
  throw new Error("native_build_offline_inputs_required");
}
const headersDirectory = realpathSync(headersInput);
if (!statSync(headersDirectory).isDirectory()) throw new Error("native_build_headers_invalid");
const verifiedHeaders = verifyNodeHeadersTree({
  directory: headersDirectory,
  manifestPath: realpathSync(headersManifest),
  expectedSha256: expectedHeadersSha256,
  nodeVersion: process.version,
  nodeModuleAbi: process.versions.modules
});
const buildTemp = mkdtempSync(join(tmpdir(), "control-plane-native-build-"));
try {
  const nativeRegistry = compileReviewedNativeRegistry({
    sourceRoot: NATIVE_SOURCE_ROOT,
    manifestPath: NATIVE_REGISTRY_MANIFEST,
    outputDirectory: buildTemp
  });
  const toolchain = verifyNativeToolchainTree({
    directory: realpathSync(toolchainInput),
    manifestPath: realpathSync(toolchainManifest),
    expectedSha256: expectedToolchainSha256,
    compileProfiles: nativeRegistry.compileProfiles
  });
  const toolEnvironment = createVerifiedNativeToolEnvironment(toolchain);
  const nodeExecutable = realpathSync(process.execPath);
  const nodeGypEntrypoint = realpathSync(join(
    repositoryRoot,
    "node_modules/node-gyp/bin/node-gyp.js"
  ));
  const buildToolEvidence = Object.freeze({
    nodeSha256: sha256Hex(readFileSync(nodeExecutable)),
    nodeGypEntrypointSha256: sha256Hex(readFileSync(nodeGypEntrypoint)),
    toolchainExecutableDigests: toolchain.executableDigests
  });

  function runChecked(executable, args, code) {
    toolchain.assertExecutableClosureUnchanged();
    const result = spawnSync(executable, args, {
      shell: false,
      stdio: "inherit",
      env: Object.freeze({
        LANG: "C",
        LC_ALL: "C",
        ...toolEnvironment,
        TMPDIR: buildTemp,
        npm_config_devdir: buildTemp,
        npm_config_nodedir: headersDirectory,
        npm_config_python: toolEnvironment.PYTHON,
        CONTROL_PLANE_NATIVE_REGISTRY_HEADER: nativeRegistry.generatedHeaderPath,
        CONTROL_PLANE_NATIVE_REGISTRY_SHA256: nativeRegistry.registrySha256
      })
    });
    if (result.status !== 0) throw new Error(code);
  }

  runChecked(nodeExecutable, [
    nodeGypEntrypoint,
    "rebuild",
    "--directory",
    nativeRoot,
    "--nodedir",
    headersDirectory
  ], "native_addon_build_failed");

  if (!existsSync(standaloneOutputRoot)) {
    mkdirSync(standaloneOutputRoot, { recursive: false, mode: 0o755 });
  }
  const outputMetadata = lstatSync(standaloneOutputRoot);
  if (outputMetadata.isSymbolicLink()
      || !outputMetadata.isDirectory()
      || realpathSync(standaloneOutputRoot) !== standaloneOutputRoot) {
    throw new Error("native_standalone_output_root_invalid");
  }
  for (const target of nativeRegistry.standaloneTargets) {
    const profile = nativeRegistry.compileProfiles.find(
      ({ compileProfileId }) => compileProfileId === target.compileProfileId
    );
    if (!profile) throw new Error("native_standalone_profile_unknown");
    const temporaryOutput = join(buildTemp, `standalone-${target.outputName}`);
    runChecked(toolEnvironment.CC, [
      ...profile.flags,
      "-o",
      temporaryOutput,
      target.resolvedSourcePath
    ], "native_standalone_build_failed");
    const temporaryMetadata = lstatSync(temporaryOutput);
    if (temporaryMetadata.isSymbolicLink() || !temporaryMetadata.isFile()) {
      throw new Error("native_standalone_output_invalid");
    }
    chmodSync(temporaryOutput, 0o555);
    const finalOutput = join(standaloneOutputRoot, target.outputName);
    if (existsSync(finalOutput) && lstatSync(finalOutput).isSymbolicLink()) {
      throw new Error("native_standalone_output_symlink_forbidden");
    }
    renameSync(temporaryOutput, finalOutput);
  }
  toolchain.assertExecutableClosureUnchanged();
  if (sha256Hex(readFileSync(nodeExecutable)) !== buildToolEvidence.nodeSha256
      || sha256Hex(readFileSync(nodeGypEntrypoint))
        !== buildToolEvidence.nodeGypEntrypointSha256) {
    throw new Error("native_build_tool_changed_during_build");
  }
  writeRepositoryStandaloneBuildReceipt({
    buildToolEvidence,
    nativeRegistry,
    toolchain,
    verifiedHeaders
  });
} finally {
  rmSync(buildTemp, { recursive: true, force: true });
}
```

The code sketch names `writeRepositoryStandaloneBuildReceipt`; implement and
import it from `scripts/control-plane-native-registry.mjs`. It derives the same
repository and fixed standalone output root from `import.meta.url`, accepts no
path parameter, hashes each final
regular non-symlink mode-`0555` output after rename, rejects a missing/extra
output or any output-root/file symlink, and
writes one canonical `standalone-build-receipt.json` beneath the fixed build
root. The receipt binds `manifestSha256`, `registrySha256`, the verified Node
headers tree/version/ABI identity, Node executable digest, locked node-gyp
entrypoint digest, toolchain tree digest, the ordered complete executable-closure
digest table (including fixed `CC`, `CXX`, `AR`, `LD`, `PYTHON`, and `MAKE`),
target ID, compile-profile ID, exact flag-vector digest, fixed `source`,
`sourceSha256`, output basename, and output digest. It contains no absolute path.
Every tool the adapter can execute is therefore digest-bound; there is no
receipt field that can be supplied by an unverified environment value.

The adapter always builds every registered standalone target in manifest order;
there is no target selector. Registry validation has already proved that all
resolved sources are direct regular children of the fixed native `src/` root
and no source was resolved beneath `registry/src/`,
all fixed outputs remain beneath the fixed output root, and every source digest
matches. Before each `spawnSync`, assert again that the compiler path, exact nine
flags, generated `-o` operand, output, and source operands equal the compiled
plan. `runChecked` uses only the exact environment shown: locale, the verified
seven-field native tool environment, owned temporary/header locations, and the
two registry bindings. It never spreads `process.env`. Before each direct spawn
it rehashes the complete manifest-listed executable closure. The Node binary,
node-gyp entrypoint, six external custody inputs, verified headers result, and
complete toolchain evidence are carried into the receipt writer; no adapter may
reconstruct or shorten them. Immediately before receipt publication, rehash the
complete tool closure, Node binary, and node-gyp entrypoint again and require
byte equality with the pre-build evidence.

- [ ] **Step 6: Pin the development tool and scripts**

Add exact `node-gyp: "11.4.2"` to `devDependencies`, regenerate `package-lock.json`, and add:

```json
{
  "control-plane:native:build": "node scripts/build-control-plane-native.mjs",
  "control-plane:native:test": "node --test --test-concurrency=1 server/tests/control-plane-native-contract.test.mjs server/tests/control-plane-native-registry.test.mjs server/tests/control-plane-native-toolchain-contract.test.mjs",
  "control-plane:foundation:linux": "node --test --test-concurrency=1 integration/control-plane-deploy/foundation-linux.test.mjs"
}
```

Unit verifier tests create temporary synthetic header/toolchain trees and
temporary registry profiles whose expected digests match those fixtures. The
authoritative Linux integration instead consumes the pre-provisioned,
target-matched offline Node headers and toolchain named by the reviewed builder
contract; its expected tree digests are supplied by that contract and the
compiler bytes must match the tracked `hardened-c17-pie-v1` compiler digest. It
does not derive an authorization digest from whatever tree happens to be
present. The harness injects only the six closed custody variables, records every
attempted network syscall as a failure, rejects any executed build tool outside
the verified manifest closure, verifies the fixed `CC`/`CXX`/`AR`/`LD`/`PYTHON`/
`MAKE` paths, narrow `PATH`, every executable digest in the canonical build
receipt, both standalone outputs, and then loads the addon and rechecks N-API 9
plus the exact 15 exports. The Artifact-owned dependency-addon adapter must pass
the same six-input and tool-environment conformance fixture before it may build
`better-sqlite3`.

- [ ] **Step 7: Build in the disposable Linux environment and verify GREEN**

Run:

```bash
npm ci --ignore-scripts
node --test server/tests/control-plane-node-headers-contract.test.mjs
node --test server/tests/control-plane-native-toolchain-contract.test.mjs
node --test server/tests/control-plane-native-registry.test.mjs server/tests/control-plane-native-contract.test.mjs
npm run control-plane:foundation:linux
```

Expected: all commands exit 0 without a network request. Wrong Node
version/ABI/header digest, registry manifest/fragment/source digest, compile
profile/flag/compiler digest, any fixed build-tool path/digest, executable-closure
entry, narrow environment, toolchain tree, standalone output, output receipt, or
native ABI/export set fails before acceptance. An unregistered fragment,
profile, source, target, flag, build tool, compiler, or output never reaches its
compiler.

- [ ] **Step 8: Commit the native build surface**

```powershell
git add package.json package-lock.json .gitignore ops/control-plane-deploy/native/binding.gyp ops/control-plane-deploy/native/index.mjs ops/control-plane-deploy/native/src/control-plane-native.c ops/control-plane-deploy/native/registry/reviewed-native-registry-manifest.json ops/control-plane-deploy/native/registry/foundation-profiles.json ops/control-plane-deploy/native/registry/foundation-logical-records.json ops/control-plane-deploy/native/registry/foundation-compile-profiles.json ops/control-plane-deploy/native/registry/foundation-standalone-targets.json ops/control-plane-deploy/native/src/foundation-profile-probe.c ops/control-plane-deploy/native/src/native-contract-test.c scripts/build-control-plane-native.mjs scripts/control-plane-native-registry.mjs scripts/control-plane-node-headers-contract.mjs scripts/control-plane-native-toolchain-contract.mjs server/tests/control-plane-native-contract.test.mjs server/tests/control-plane-native-registry.test.mjs server/tests/control-plane-node-headers-contract.test.mjs server/tests/control-plane-native-toolchain-contract.test.mjs integration/control-plane-deploy/foundation-linux.test.mjs
git commit -m "build: add pinned control-plane native addon"
```

### Task 4: Sealed Memory, Exact Spawn, and Durable Directory-FD Operations

**Files:**

- Create: `ops/control-plane-deploy/native/src/secure-memory.c`
- Create: `ops/control-plane-deploy/native/src/durable-fs.c`
- Modify: `ops/control-plane-deploy/native/src/native-contract-test.c`
- Modify: `ops/control-plane-deploy/native/registry/foundation-standalone-targets.json`
- Modify: `ops/control-plane-deploy/native/registry/reviewed-native-registry-manifest.json`
- Modify: `ops/control-plane-deploy/native/binding.gyp`
- Modify: `ops/control-plane-deploy/native/src/control-plane-native.c`
- Test: `server/tests/control-plane-native-contract.test.mjs`
- Test: `server/tests/control-plane-native-registry.test.mjs`
- Modify: `integration/control-plane-deploy/foundation-linux.test.mjs`

**Interfaces:**

- Produces: sealed anonymous input bytes whose owner and mode are verified before
  the first byte write; bounded anonymous output capture; closed reviewed
  executable/environment IDs; exact inherited FD slots; fixed-logical-ID atomic
  read/publish-no-replace/CAS/verified-unlink; `openat2` beneath/no-symlink
  enforcement; and parent-fsync durability.
- Every compiled spawn profile declares each child slot's expected descriptor
  kind. Immediately before `posix_spawn`, secret slots are re-`fstat`ed and must
  still be Foundation-created, effective-UID-owned, mode `0600`, regular sealed
  memfds with the complete seal set. This is the mandatory handoff check reused
  by Bootstrap's fixed OpenSSH status/bootstrap/execute profiles; those profiles
  may extend the reviewed build registry but not the spawn ABI.

- [ ] **Step 1: Add failing pre-write protection, atomic-race, and inheritance tests**

Because `native-contract-test.c` is a manifest-reviewed standalone source, every
intentional edit in this task must be followed by recomputing its source digest
in `foundation-standalone-targets.json` and that fragment's digest in
`reviewed-native-registry-manifest.json` before invoking the build. The negative
digest-drift cases use isolated fixtures; weakening or bypassing the tracked
digest contract to obtain RED is forbidden.

```js
test("sealed memfd carries every required seal and only the reviewed child slot", async () => {
  const secret = Buffer.from("synthetic-key-material");
  const handle = native.createSealedMemfd({ label: "ssh-key", bytes: secret, inheritableFd: 7 });
  assert.equal(handle.ownerModeVerified, true);
  assert.equal(handle.mode, 0o600);
  assert.match(handle.sealsSha256, /^[0-9a-f]{64}$/);
  const result = native.spawnWithExactFileDescriptors({
    executableId: "foundation-fd-probe",
    descriptors: [{ sourceFd: handle.fd, childFd: 7 }],
    environmentId: "empty",
    timeoutMs: 5_000
  });
  assert.equal(result.exitCode, 0);
  handle.close();
});

test("memfd permission failure closes before the first protected byte", async () => {
  for (const fault of ["fchmod", "fstat", "wrong_uid", "wrong_mode", "not_regular"]) {
    const result = await runNativeMemfdFault({ fault, sentinel: "must-not-be-written" });
    assert.equal(result.accepted, false);
    assert.equal(result.bytesWritten, 0);
    assert.equal(result.descriptorClosed, true);
  }
});

test("one predecessor has one winner across forked native CAS callers", async () => {
  const race = await runForkedLogicalCasRace({
    logicalId: "foundation-test-rotation-journal-v1",
    expectedSha256: "a".repeat(64),
    successors: [Buffer.from('{"winner":1}\n'), Buffer.from('{"winner":2}\n')]
  });
  assert.equal(race.filter(({ outcome }) => outcome === "replaced").length, 1);
  assert.equal(race.filter(({ code }) => code === "durable_cas_digest_mismatch").length, 1);
  assert.equal(race.finalBytes.equals(race.winnerBytes), true);
});

test("reviewed OpenSSH descriptor roles accept sealed and reject unprotected handoff", async () => {
  const accepted = await runReviewedSecretHandoffProbe({
    executableId: "foundation-openssh-handoff-probe"
  });
  assert.equal(accepted.spawned, true);
  assert.equal(accepted.ownerModeRechecked, true);
  assert.equal(accepted.fullSealsRechecked, true);

  const result = await runReviewedSecretHandoffProbe({
    executableId: "foundation-openssh-handoff-probe",
    fault: "mode_0644"
  });
  assert.equal(result.spawned, false);
  assert.equal(result.secretBytesRead, 0);
  assert.equal(result.code, "native_secret_descriptor_contract_invalid");
});

test("bounded capture returns an anonymous response and fails closed at its byte limit", async () => {
  const capture = native.createBoundedCapture({ label: "ssh-response", maxBytes: 2_048, inheritableFd: 8 });
  const result = native.spawnWithExactFileDescriptors({
    executableId: "foundation-response-probe",
    descriptors: [{ sourceFd: capture.writeFd, childFd: 8 }],
    environmentId: "empty",
    timeoutMs: 5_000
  });
  assert.equal(result.exitCode, 0);
  assert.deepEqual(capture.readAll(), Buffer.from('{"result":"synthetic_ok"}'));
  capture.close();
  assert.throws(
    () => native.createBoundedCapture({ label: "oversize", maxBytes: 2_049, inheritableFd: 8 }),
    /native_capture_contract_invalid/
  );
});
```

- [ ] **Step 2: Run the native test and verify RED**

Run: `npm run control-plane:native:test`

Expected: FAIL with `native_operation_not_implemented`; the new pre-write test
must initially show that mode/owner validation is absent, and the fork test must
show that a read-then-write implementation can admit two successors.

- [ ] **Step 3: Implement the syscall contract**

First add exactly `src/secure-memory.c` and `src/durable-fs.c` to the
`binding.gyp` source list; the later database source remains absent until Task 5.
Update the reviewed `native-contract-test.c` digest and its enclosing fragment
digest, but do not add a compile profile, flag, standalone output, build-script
branch, or public export.

```c
int fd = memfd_create(label, MFD_CLOEXEC | MFD_ALLOW_SEALING);
if (fd < 0) return throw_errno(env, "native_memfd_create_failed");
if (fchmod(fd, S_IRUSR | S_IWUSR) != 0) {
  close(fd);
  return throw_errno(env, "native_memfd_mode_failed");
}
struct stat metadata;
if (fstat(fd, &metadata) != 0
    || !S_ISREG(metadata.st_mode)
    || metadata.st_uid != geteuid()
    || (metadata.st_mode & 0777) != 0600) {
  close(fd);
  return throw_code(env, "native_memfd_owner_mode_invalid");
}
if (write_all(fd, bytes, length) != 0 || fsync(fd) != 0) {
  close(fd);
  return throw_errno(env, "native_memfd_write_failed");
}
const int seals = F_SEAL_SEAL | F_SEAL_SHRINK | F_SEAL_GROW | F_SEAL_WRITE;
if (fcntl(fd, F_ADD_SEALS, seals) != 0 || fcntl(fd, F_GET_SEALS) != seals) {
  close(fd);
  return throw_code(env, "native_memfd_seal_failed");
}
```

The `fchmod` and `fstat` block is before `write_all` on every path. Tests inject
each syscall/type/uid/mode failure and require descriptor close with zero bytes
written. `probeLinuxCapabilities` performs the same check with a dummy byte and
reports `memfdOwnerMode0600` separately from `memfdFullSeals`; protected-value
materializers may run only after both are true.

Use `posix_spawn_file_actions_addclosefrom_np` when available, otherwise
enumerate `/proc/self/fd` and add explicit closes before spawn. Map
`executableId` and `environmentId` through the compiled reviewed registry;
reject every unknown ID and every child FD outside its fixed descriptor-role
table. Recheck secret-source provenance, effective UID, exact mode, regular-file
type, and full seals immediately before `dup2`/spawn. The Linux harness exercises
the Foundation OpenSSH-handoff probe without network access; Bootstrap must run
the same assertion over each real fixed OpenSSH profile after adding its reviewed
registry fragment.

Implement `createBoundedCapture` with an anonymous `pipe2(O_CLOEXEC)` pair. The native handle exposes only the reviewed child `writeFd`, a parent-only `readAll()` that rejects overflow before returning bytes, and an idempotent `close()`. It must never create a named file, inherit the parent read end, accept an unreviewed FD slot, or return partial bytes after overflow.

For non-state filesystem operations use a previously opened directory FD plus
`openat2` with:

```c
struct open_how how = {
  .flags = O_WRONLY | O_CREAT | O_EXCL | O_CLOEXEC | O_NOFOLLOW,
  .mode = requested_mode,
  .resolve = RESOLVE_BENEATH | RESOLVE_NO_MAGICLINKS | RESOLVE_NO_SYMLINKS
};
```

Write, `fsync` the file, `renameat2`, `fsync` the parent FD, reopen with no-follow
flags, and byte-compare before success. `durableUnlink` and
`durableSwapSymlink` also parent-fsync and read back absence/identity. These
generic helpers are not valid state-machine mutation APIs and reject logical
state registry IDs.

Implement all four `ATOMIC_LOGICAL_RECORD_EXPORTS` over the compiled fixed
logical-record registry: `durableReadLogical`, `durablePublishNoReplace`,
`durableCompareAndSwap`, and `durableUnlinkVerified`. Each entry fixes its
relative record path, lock path, replay-marker path, byte cap, and mode.
`durableReadLogical` takes a shared OFD lock, opens only the registered record,
reads bounded exact bytes, compares both its computed and returned digest with
`expectedSha256`, and releases the lock only after successful readback; it never
accepts or returns a path. Each of the three mutation calls:

1. opens the registered lock beneath the supplied root directory FD and acquires
   one exclusive `F_OFD_SETLKW` lock using a separately opened file description;
2. while still holding that lock, reopens the registered record with
   `openat2(RESOLVE_BENEATH | RESOLVE_NO_MAGICLINKS | RESOLVE_NO_SYMLINKS)`, reads
   bounded exact bytes, and compares the current SHA-256 with the expected
   predecessor where applicable;
3. publishes a same-parent temporary file and atomically renames it, or performs
   the verified unlink. Before unlink, it durably publishes the registered
   replay marker binding logical ID and expected predecessor digest. Initial publish uses `RENAME_NOREPLACE`; an existing
   record is idempotent only when byte-equal. CAS with an unexpected predecessor
   is idempotent only when the current bytes equal `nextBytes`; otherwise it
   fails without mutation;
4. `fsync`s the affected parent, reopens and byte-compares the resulting record
   or proves absence, then releases the OFD lock last.

There is no unlocked interval between reread and rename/unlink, and no native
primitive accepts a caller path, lock name, mode, or temporary name. A crash
after rename/unlink but before parent `fsync` is reconciled by the next same-byte
call under the same lock, which repeats the durability barrier and readback. A
different successor never becomes an idempotent replay. An already absent
record is replay-safe only when its exact unlink marker is durable and matches
the supplied predecessor digest; missing or mismatched marker evidence fails
closed. A later publish of that logical record clears the prior marker only
under the same lock after the new record and parent durability readback succeed.

- [ ] **Step 4: Run syscall, forked-concurrency, crash, and handoff fault injection and verify GREEN**

Run:

```bash
npm run control-plane:native:build
npm run control-plane:native:test
```

Expected: PASS for pre-write `fchmod`/`fstat`/uid/mode/type failure; missing
seal; protected-value materializer blocked by either false probe bit; inherited
extra FD; caller-selected FD; Bootstrap/OpenSSH descriptor-role mismatch;
capture overflow; inherited capture read end; partial capture; symlink ancestor;
magic link; name traversal; all four atomic exports present; `durableReadLogical`
shared-lock/digest/unknown-ID rejection; and fixed-logical-ID rejection. Fork at least two
independent processes against the same predecessor and prove one CAS winner.
Inject process death before/after lock, current reread, temp-file `fsync`, atomic
rename or unlink, parent `fsync`, and result readback; exact replay converges,
different bytes fail, no lock remains held after process death, and no partial
record is accepted.

- [ ] **Step 5: Commit secure memory and durable FS**

```powershell
git add ops/control-plane-deploy/native/binding.gyp ops/control-plane-deploy/native/src/secure-memory.c ops/control-plane-deploy/native/src/durable-fs.c ops/control-plane-deploy/native/src/control-plane-native.c ops/control-plane-deploy/native/src/native-contract-test.c ops/control-plane-deploy/native/registry/foundation-standalone-targets.json ops/control-plane-deploy/native/registry/reviewed-native-registry-manifest.json server/tests/control-plane-native-contract.test.mjs server/tests/control-plane-native-registry.test.mjs integration/control-plane-deploy/foundation-linux.test.mjs
git commit -m "feat: add sealed transport and durable fs primitives"
```

### Task 5: Database Identity Lease, Capability Custody, and Actual SQLite Handle Proof

**Files:**

- Create: `ops/control-plane-deploy/native/src/database-capability.c`
- Modify: `ops/control-plane-deploy/native/binding.gyp`
- Modify: `ops/control-plane-deploy/native/src/control-plane-native.c`
- Test: `server/tests/control-plane-native-contract.test.mjs`
- Test: `integration/control-plane-deploy/foundation-linux.test.mjs`

**Interfaces:**

- Produces: the exact four database-native methods consumed by the host/database plan.
- Stop condition: if the addon cannot bind the SQLite connection actually used to the received capability and expose `actualHandleProofSha256`, mark the program `ineligible_native_sqlite_handle` and execute no later plan.

- [ ] **Step 1: Write the failing peer, lease, and actual-handle tests**

```js
test("received capability proves the exact SQLite main handle", async () => {
  const lease = native.createDatabaseIdentityLease({ lockFd: fixtures.lockFd, mode: "exclusive", ownerToken: "tx-1" });
  native.sendDatabaseCapability({
    socketFd: fixtures.parentSocketFd,
    databaseFd: fixtures.databaseFd,
    identityLeaseFd: lease.leaseFd,
    expectedPeer: { uid: process.getuid(), pid: fixtures.childPid },
    invocationSha256: "a".repeat(64)
  });
  const received = native.receiveDatabaseCapability({
    socketFd: fixtures.childSocketFd,
    expectedPeer: { uid: process.getuid(), cgroupSha256: "b".repeat(64) },
    expectedInvocationSha256: "a".repeat(64)
  });
  const proof = native.inspectSqliteMainHandle({
    databaseToken: fixtures.openSqliteFromReceivedFd(received.databaseFd),
    expectedDatabaseIdentityHmacSha256: fixtures.identityHmac,
    hmacKeyFd: fixtures.hmacKeyFd
  });
  assert.match(proof.actualHandleProofSha256, /^[0-9a-f]{64}$/);
  lease.close();
});
```

- [ ] **Step 2: Run the target Linux test and verify RED**

Run: `npm run control-plane:foundation:linux`

Expected: FAIL with `ineligible_native_sqlite_handle` until the actual connection-handle proof exists.

- [ ] **Step 3: Implement the custody contract**

Add exactly `src/database-capability.c` to the existing `binding.gyp` source
list before implementing the custody exports.

Use `F_OFD_SETLK` for the single global database-identity lease, `sendmsg`/`recvmsg` with exactly two `SCM_RIGHTS` FDs, and `SO_PEERCRED` plus a fixed cgroup identity readback. The receive side rejects extra ancillary data, wrong FD count, wrong UID/PID/cgroup, stale invocation digest, unlocked lease, or a database FD whose `fstat` identity differs.

The actual SQLite proof must be calculated inside the exact connection wrapper used for operations. It binds the received database FD identity, the SQLite main database handle identity, logical database ID, invocation digest, lease proof, and root-keyed HMAC. A proof obtained by reopening a caller path or inspecting a different process FD is invalid.

- [ ] **Step 4: Exercise WAL and replacement races**

Run: `npm run control-plane:foundation:linux`

Expected: PASS for WAL/SHM creation through the validated parent capability and FAIL for path replacement, symlink swap, inode swap, logical-role swap, duplicated lease FD after guardian death, wrong peer, extra FD, handle mismatch, and lease gap.

- [ ] **Step 5: Commit database capability custody**

```powershell
git add ops/control-plane-deploy/native/binding.gyp ops/control-plane-deploy/native/src/database-capability.c ops/control-plane-deploy/native/src/control-plane-native.c server/tests/control-plane-native-contract.test.mjs integration/control-plane-deploy/foundation-linux.test.mjs
git commit -m "feat: prove database capability custody"
```

### Task 6: Aggregate Linux Feasibility Receipt and Program Gate

**Files:**

- Create: `scripts/control-plane-linux-capability-probe.mjs`
- Create: `server/tests/control-plane-linux-capability-probe.test.mjs`
- Create: `server/tests/control-plane-foundation-linux-workflow.test.mjs`
- Create: `.github/workflows/control-plane-foundation-linux.yml`
- Modify: `integration/control-plane-deploy/foundation-linux.test.mjs`
- Modify: `package.json`

**Interfaces:**

- Consumes: all preceding native and durable-store tests.
- Produces: one aggregate-only synthetic receipt with no path, kernel release, hostname, UID, process ID, device/inode, config, or credential value, plus one PR-only GitHub-hosted Linux check that never persists or publishes that receipt.

- [ ] **Step 1: Write the closed capability receipt test**

```js
import {
  REQUIRED_LINUX_FEATURES
} from "../services/deployment/foundation-contract.mjs";

const EXPECTED_LINUX_FEATURES = Object.freeze([
  "memfdOwnerMode0600",
  "memfdFullSeals",
  "sealedOpenSshDescriptorHandoff",
  "exactDescriptorInheritance",
  "atomicLogicalStateTransitions",
  "openat2BeneathNoFollow",
  "ofdIdentityLease",
  "reviewedSpawnProfileRegistry",
  "scmRightsPeerBound",
  "sqliteActualMainHandle",
  "directoryFsyncDurability",
  "systemdTemplateIsolation",
  "systemdPersistentTimer",
  "cgroupKillReadback"
]);

test("reports only the closed aggregate feature map", () => {
  const receipt = buildCapabilityReceipt(createAllPassProbe());
  assert.deepEqual(REQUIRED_LINUX_FEATURES, EXPECTED_LINUX_FEATURES);
  assert.equal(REQUIRED_LINUX_FEATURES.length, 14);
  assert.deepEqual(Object.keys(receipt.features), REQUIRED_LINUX_FEATURES);
  assert.equal(Object.values(receipt.features).every(Boolean), true);
  assert.equal(JSON.stringify(receipt).includes("/"), false);
});
```

- [ ] **Step 2: Run the probe test and verify RED**

Run: `node --test server/tests/control-plane-linux-capability-probe.test.mjs`

Expected: FAIL because the probe controller does not exist.

- [ ] **Step 3: Implement the fail-closed aggregate probe**

```js
import { REQUIRED_LINUX_FEATURES } from "../server/services/deployment/foundation-contract.mjs";

export function buildCapabilityReceipt(aggregateProbe) {
  const observed = aggregateProbe();
  const features = Object.fromEntries(
    REQUIRED_LINUX_FEATURES.map((name) => [name, observed[name] === true])
  );
  return Object.freeze({
    schemaVersion: "1",
    receiptType: "control_plane_linux_feasibility",
    eligible: Object.values(features).every(Boolean),
    features
  });
}
```

The CLI writes exactly one canonical JSON line to stdout. Failure writes one fixed code to stderr and exits 1; it never prints raw syscall errors, paths, IDs, or host details.
Append `server/tests/control-plane-linux-capability-probe.test.mjs` to the existing
`control-plane:native:test` command in `package.json`; do not change the pinned
registry, toolchain, or native-contract test entries.

- [ ] **Step 4: Run the full Foundation gate**

Run:

```bash
npm run control-plane:native:test
npm run control-plane:foundation:linux
```

Expected: all commands exit 0 and the receipt reports `eligible:true`. Any false
feature stops execution before every later Master DAG stage. An eligible receipt
permits only the next checkpoint, Host/DB Tasks 0-1; it does not permit a direct
jump to Artifact, Bootstrap, later Host/DB, Receipt, or rollout work.

- [ ] **Step 5: Write the PR-only Linux-harness test, then implement and verify GREEN**

The test reads `.github/workflows/control-plane-foundation-linux.yml` as text and
must reject a mutable action reference, a runner other than `ubuntu-24.04`, any
event other than `pull_request` to `master`, `push`, `workflow_dispatch`,
schedule, `pull_request_target`, an Environment, secret expression, write
permission, self-hosted runner, artifact upload, SSH/provider/deploy command, or
a checkout that is not `${{ github.event.pull_request.head.sha }}` with
`persist-credentials: false`. It must require Node 22, `npm ci --ignore-scripts`,
and `npm run control-plane:foundation:linux`.

Implement the matching workflow with `permissions: { contents: read }`, the
repository's reviewed exact-SHA `actions/checkout` and `actions/setup-node`
references, a bounded job timeout, and no other job. It exists only to prove the
Foundation receipt in a disposable GitHub-hosted VM; it never uploads or exposes
the receipt and never makes a GitHub, host, provider, or production mutation.

Run: `node --test server/tests/control-plane-foundation-linux-workflow.test.mjs`

Expected: GREEN locally. The actual `ubuntu-24.04` receipt is evaluated only when
the one Draft source PR is opened, and a failed or unavailable run remains an
ineligible Foundation gate rather than a local-WSL fallback.

`memfdOwnerMode0600` is true only when `fchmod(0600)` plus regular-file,
effective-UID, and exact-mode `fstat` checks completed before the dummy byte was
written. `sealedOpenSshDescriptorHandoff` is true only after both an accepted
sealed descriptor and each rejected owner/mode/type/seal fault prove the
reviewed secret descriptor role was rechecked immediately before exact-FD
spawn. The probe enumerates every compiled profile that owns a secret role, so
after Bootstrap adds its reviewed fixed OpenSSH profiles the registry digest and
this feature cannot pass until every new profile completes the same handoff
matrix without a network connection.
`atomicLogicalStateTransitions` is true only after the real forked
single-predecessor race and every crash boundary pass. The receipt must not
collapse these into generic `memfdFullSeals`, `ofdIdentityLease`, or
`directoryFsyncDurability` booleans.

- [ ] **Step 6: Run repository regression validation**

Run:

```powershell
node --test server/tests/control-plane-canonical-json.test.mjs server/tests/control-plane-durable-store.test.mjs server/tests/control-plane-node-headers-contract.test.mjs server/tests/control-plane-native-toolchain-contract.test.mjs server/tests/control-plane-native-registry.test.mjs server/tests/control-plane-native-contract.test.mjs server/tests/control-plane-linux-capability-probe.test.mjs
npm test
git diff --check origin/master...HEAD
```

Expected: all commands exit 0.

- [ ] **Step 7: Commit the Foundation gate**

```powershell
git add .github/workflows/control-plane-foundation-linux.yml scripts/control-plane-linux-capability-probe.mjs server/tests/control-plane-foundation-linux-workflow.test.mjs server/tests/control-plane-linux-capability-probe.test.mjs integration/control-plane-deploy/foundation-linux.test.mjs package.json
git commit -m "test: gate control-plane linux feasibility"
```

## Self-Review

- Spec coverage: canonical bytes, native fixed-logical-ID atomic durable records,
  pre-write memfd owner/mode verification plus full seals, reviewed OpenSSH
  descriptor handoff, bounded anonymous output capture, exact descriptors,
  manifest-only registry extension, frozen digest-pinned compiler/profile/source/
  standalone-output contracts without public-ABI growth, no-follow
  directory capabilities, actual SQLite handle identity, single global OFD
  lease, authenticated capability custody, and systemd/cgroup feasibility each
  have an owning task and negative tests.
- Deferred-marker scan: every source file, interface, command, expected failure, and stop condition is explicit.
- Type consistency: downstream plans consume the exact canonical, durable-store, and native export names declared in Shared Interfaces.
- Safety boundary: the Foundation uses only synthetic fixtures in disposable Linux and performs no GitHub or production operation.

## Execution Handoff

Continue only when this plan's final aggregate receipt is `eligible:true`. Follow
the Master DAG exactly: execute Host/DB Tasks 0-1, then Source Integration Task 2,
then Artifact Tasks 1-2. Do not jump directly from Foundation to the Artifact
plan or execute an entire child plan early. A false or unavailable native feature
ends the implementation attempt without activating any production capability.
