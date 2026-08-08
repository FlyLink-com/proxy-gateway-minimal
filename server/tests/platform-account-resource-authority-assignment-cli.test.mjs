import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs, {
  chmodSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import Database from "better-sqlite3";

import {
  runAccountResourceAuthorityAssignmentCli
} from "../../scripts/platform-account-resource-authority-assignment.mjs";
import {
  applyAuthorityOperatorRequest,
  digestAuthorityOperatorRequest,
  normalizeAuthorityOperatorRequest,
  planAuthorityOperatorRequest
} from "../services/platform/account-resource-authority-operator.mjs";
import {
  ACCOUNT_RESOURCE_AUTHORITY_MIGRATIONS,
  REQUIRED_ACCOUNT_RESOURCE_AUTHORITY_MIGRATION_ID,
  applyAccountResourceAuthorityMigrations
} from "../services/platform/account-resource-authority-migrations.mjs";
import {
  COIN_COMMERCE_MIGRATIONS,
  REQUIRED_COIN_COMMERCE_MIGRATION_ID,
  applyCoinCommerceMigrations
} from "../services/platform/coin-commerce-migrations.mjs";
import {
  COIN_WALLET_MIGRATIONS,
  REQUIRED_COIN_WALLET_MIGRATION_ID,
  applyCoinWalletMigrations
} from "../services/platform/coin-wallet-migrations.mjs";

const NOW = "2026-08-08T12:00:00.000Z";
const OUTPUT_KEYS = [
  "schemaVersion",
  "type",
  "mode",
  "operation",
  "requestDigest",
  "classification",
  "receiptState",
  "databaseChanged",
  "automaticRetry",
  "reasonCode"
];
const DB_PATH = resolve("synthetic-authority.sqlite");
const SCRIPT_PATH = resolve(
  "scripts/platform-account-resource-authority-assignment.mjs"
);

async function withTempDirectory(action) {
  const directory = mkdtempSync(join(tmpdir(), "authority-assignment-cli-"));
  try {
    return await action(directory);
  } finally {
    rmSync(directory, { recursive: true, force: true, maxRetries: 3 });
  }
}

async function withPlatform(platform, action) {
  const descriptor = Object.getOwnPropertyDescriptor(process, "platform");
  Object.defineProperty(process, "platform", {
    configurable: true,
    value: platform
  });
  try {
    return await action();
  } finally {
    Object.defineProperty(process, "platform", descriptor);
  }
}

function assignRequest(overrides = {}) {
  return {
    schemaVersion: "1",
    operation: "assign",
    newAuthorityRef: "authority_synthetic_next",
    accountId: "account_synthetic",
    resourceRequestId: "request_synthetic_a",
    entitlementId: "entitlement_synthetic_a",
    issuedLinkId: "link_synthetic_a",
    createdBy: "operator_synthetic",
    reason: "explicit_assignment",
    ...overrides
  };
}

function reassignRequest(overrides = {}) {
  return {
    schemaVersion: "1",
    operation: "reassign",
    newAuthorityRef: "authority_synthetic_reassigned",
    expectedPreviousAuthorityRef: "authority_synthetic_next",
    expectedVersion: 1,
    accountId: "account_synthetic",
    resourceRequestId: "request_synthetic_b",
    entitlementId: "entitlement_synthetic_b",
    issuedLinkId: "link_synthetic_b",
    createdBy: "operator_synthetic",
    reason: "explicit_reassignment",
    revokedBy: "operator_synthetic",
    revocationReason: "superseded_synthetic",
    ...overrides
  };
}

function writePrivateRequest(directory, request = assignRequest(), name = "request.json") {
  const filePath = join(directory, name);
  writeFileSync(filePath, JSON.stringify(request), { mode: 0o600 });
  chmodSync(filePath, 0o600);
  return filePath;
}

function safeResult(request, overrides = {}) {
  return {
    operation: request.operation,
    requestDigest: digestAuthorityOperatorRequest(request),
    classification: "not_applied",
    receiptState: "not_applicable",
    databaseChanged: false,
    automaticRetry: false,
    ...overrides
  };
}

function operations(overrides = {}) {
  return {
    normalizeAuthorityOperatorRequest,
    digestAuthorityOperatorRequest,
    planAuthorityOperatorRequest: ({ request }) => safeResult(request),
    applyAuthorityOperatorRequest: ({ request }) => safeResult(request, {
      classification: "applied_exact",
      receiptState: "applied",
      databaseChanged: true
    }),
    ...overrides
  };
}

function argv(mode, requestFile, extra = []) {
  return [
    "--mode", mode,
    "--db-path", DB_PATH,
    "--request-file", requestFile,
    ...extra
  ];
}

function assertClosed(output) {
  assert.deepEqual(Object.keys(output), OUTPUT_KEYS);
  assert.equal(output.schemaVersion, "1");
  assert.equal(output.type, "account_resource_authority_assignment_operator");
  assert.equal(output.automaticRetry, false);
}

function combinedSerialization(outcome, stderr = "") {
  return `${JSON.stringify(outcome.output)}\n${stderr}`;
}

function assertNoPrivateData(serialized, values = []) {
  const forbidden = [
    DB_PATH,
    "account_synthetic",
    "authority_synthetic_next",
    "authority_synthetic_reassigned",
    "request_synthetic_a",
    "request_synthetic_b",
    "entitlement_synthetic_a",
    "entitlement_synthetic_b",
    "link_synthetic_a",
    "link_synthetic_b",
    "operator_synthetic",
    "explicit_assignment",
    "explicit_reassignment",
    "superseded_synthetic",
    "select * from private_table",
    "SYNTHETIC_ENV_SENTINEL_91f2",
    ...values
  ];
  for (const value of forbidden) {
    assert.equal(serialized.includes(value), false, `leaked ${value}`);
  }
}

test("import is quiet and direct contract rejection emits one closed line", () => {
  const imported = spawnSync(process.execPath, [
    "--input-type=module",
    "--eval",
    `await import(${JSON.stringify(SCRIPT_PATH)})`
  ], { cwd: resolve("."), encoding: "utf8" });
  assert.equal(imported.status, 0, imported.stderr);
  assert.equal(imported.stdout, "");
  assert.equal(imported.stderr, "");

  const direct = spawnSync(process.execPath, [SCRIPT_PATH], {
    cwd: resolve("."),
    encoding: "utf8",
    env: { ...process.env, PRIVATE_SENTINEL: "SYNTHETIC_ENV_SENTINEL_91f2" }
  });
  assert.equal(direct.status, 2);
  assert.equal(direct.stderr, "");
  assert.equal(direct.stdout.split("\n").length, 2);
  const output = JSON.parse(direct.stdout.trimEnd());
  assertClosed(output);
  assert.equal(output.receiptState, "contract_rejected");
  assertNoPrivateData(direct.stdout + direct.stderr);
});

test("flag and mode matrix rejects before operation access", async () => {
  await withTempDirectory(async (directory) => {
    const requestFile = writePrivateRequest(directory);
    const rejected = [
      [],
      ["--mode", "invalid", "--db-path", DB_PATH, "--request-file", requestFile],
      ["--mode", "plan", "--mode", "plan", "--db-path", DB_PATH, "--request-file", requestFile],
      ["--mode", "plan", "--db-path", DB_PATH, "--request-file", requestFile, "--unknown", "x"],
      ["--mode", "plan", "--db-path", "relative.sqlite", "--request-file", requestFile],
      ["--mode", "plan", "--db-path", DB_PATH, "--request-file", "relative.json"],
      ["--mode", "plan", "--db-path", DB_PATH, "--request-file", requestFile, "--confirm-request-digest", "sha256:" + "a".repeat(64)],
      ["--mode", "assign", "--db-path", DB_PATH, "--request-file", requestFile],
      ["--mode", "assign", "--db-path", DB_PATH, "--request-file", requestFile, "--confirm-request-digest", "SHA256:" + "a".repeat(64)],
      ["--mode", "plan", "--db-path", DB_PATH, "--request-file", requestFile, "--account-id", "private"],
      ["--mode", "plan", "--db-path", DB_PATH, "--request-file", requestFile, "--request-json", "{}"],
      ["--mode", "plan", "--db-path", DB_PATH, "--request-file", requestFile, "--retry", "1"],
      ["--mode", "plan", "--db-path", DB_PATH, "--request-file"]
    ];
    for (const input of rejected) {
      let accesses = 0;
      const outcome = await runAccountResourceAuthorityAssignmentCli({
        argv: input,
        operations: operations({
          planAuthorityOperatorRequest() { accesses += 1; },
          applyAuthorityOperatorRequest() { accesses += 1; }
        })
      });
      assert.equal(outcome.exitCode, 2, JSON.stringify(input));
      assert.equal(accesses, 0);
      assertClosed(outcome.output);
      assert.equal(outcome.output.databaseChanged, false);
      assert.equal(outcome.output.receiptState, "contract_rejected");
      assertNoPrivateData(combinedSerialization(outcome), [requestFile]);
    }
  });
});

test("Windows db and request paths enforce Task 3 ordinary-path semantics", async () => {
  await withTempDirectory(async (directory) => {
    const backingFile = writePrivateRequest(directory);
    const validDb = "C:\\data\\authority.sqlite";
    const validRequest = "C:\\private\\request.json";
    const invalid = [
      ["drive-empty-remainder", "C:\\"],
      ["drive-dot", "C:\\data\\.\\authority.sqlite"],
      ["drive-parent", "C:\\data\\..\\authority.sqlite"],
      ["drive-reserved", "C:\\data\\CON.sqlite"],
      ["drive-ads", "C:\\data\\authority.sqlite:stream"],
      ["unc-empty-remainder", "\\\\server\\share"],
      ["unc-parent", "\\\\server\\share\\..\\authority.sqlite"],
      ["unc-reserved-share", "\\\\server\\PIPE\\authority.sqlite"],
      ["device-question", "\\\\?\\C:\\authority.sqlite"],
      ["device-dot", "\\\\.\\C:\\authority.sqlite"]
    ];
    await withPlatform("win32", async () => {
      const outcomes = [];
      for (const side of ["db", "request"]) {
        for (const [name, candidate] of invalid) {
          let fileAccesses = 0;
          let serviceAccesses = 0;
          const fileSystem = Object.assign(Object.create(fs), {
            lstatSync() { fileAccesses += 1; return fs.lstatSync(backingFile); },
            openSync(_path, flags) { fileAccesses += 1; return fs.openSync(backingFile, flags); }
          });
          const outcome = await runAccountResourceAuthorityAssignmentCli({
            argv: [
              "--mode", "plan",
              "--db-path", side === "db" ? candidate : validDb,
              "--request-file", side === "request" ? candidate : validRequest
            ],
            operations: operations({
              fileSystem,
              planAuthorityOperatorRequest() { serviceAccesses += 1; }
            })
          });
          outcomes.push([
            side,
            name,
            outcome.exitCode,
            fileAccesses,
            serviceAccesses,
            outcome.output.receiptState
          ]);
          assertNoPrivateData(combinedSerialization(outcome), [candidate]);
        }
      }
      assert.deepEqual(outcomes, ["db", "request"].flatMap((side) => (
        invalid.map(([name]) => [side, name, 2, 0, 0, "contract_rejected"])
      )));
    });
  });
});

test("valid Windows drive and UNC paths reach plan through controlled file access", async () => {
  await withTempDirectory(async (directory) => {
    const backingFile = writePrivateRequest(directory);
    const valid = [
      ["drive", "C:\\data\\authority.sqlite", "C:\\private\\request.json"],
      ["unc", "\\\\server\\share\\authority.sqlite", "\\\\server\\private\\request.json"]
    ];
    await withPlatform("win32", async () => {
      for (const [name, dbPath, requestFile] of valid) {
        let reads = 0;
        let planCalls = 0;
        const fileSystem = Object.assign(Object.create(fs), {
          lstatSync: () => fs.lstatSync(backingFile),
          openSync: (_path, flags) => fs.openSync(backingFile, flags),
          readSync(...args) { reads += 1; return fs.readSync(...args); }
        });
        const outcome = await runAccountResourceAuthorityAssignmentCli({
          argv: [
            "--mode", "plan",
            "--db-path", dbPath,
            "--request-file", requestFile
          ],
          operations: operations({
            fileSystem,
            planAuthorityOperatorRequest({ request }) {
              planCalls += 1;
              return safeResult(request);
            }
          })
        });
        assert.equal(outcome.exitCode, 0, name);
        assert.equal(reads, 1, name);
        assert.equal(planCalls, 1, name);
        assertNoPrivateData(combinedSerialization(outcome), [dbPath, requestFile]);
      }
    });
  });
});

test("private loader rejects unsafe files and accepts one descriptor read", async () => {
  await withTempDirectory(async (directory) => {
    const good = writePrivateRequest(directory);
    const empty = join(directory, "empty.json");
    writeFileSync(empty, "", { mode: 0o600 });
    const oversized = join(directory, "oversized.json");
    writeFileSync(oversized, "x".repeat(16 * 1024 + 1), { mode: 0o600 });
    const invalidUtf8 = join(directory, "invalid-utf8.json");
    writeFileSync(invalidUtf8, Buffer.from([0xc3, 0x28]), { mode: 0o600 });
    const invalidJson = join(directory, "invalid-json.json");
    writeFileSync(invalidJson, "{private-fragment", { mode: 0o600 });
    const unsafeMode = join(directory, "unsafe-mode.json");
    writeFileSync(unsafeMode, JSON.stringify(assignRequest()), { mode: 0o644 });
    chmodSync(unsafeMode, 0o644);
    const specialMode = join(directory, "special-mode.json");
    writeFileSync(specialMode, JSON.stringify(assignRequest()), { mode: 0o600 });
    if (process.platform !== "win32") chmodSync(specialMode, 0o4600);
    const link = join(directory, "link.json");
    symlinkSync(good, link);

    for (const filePath of [directory, empty, oversized, invalidUtf8, invalidJson, link, ...(process.platform === "win32" ? [] : [unsafeMode, specialMode])]) {
      let accesses = 0;
      const outcome = await runAccountResourceAuthorityAssignmentCli({
        argv: argv("plan", filePath),
        operations: operations({
          planAuthorityOperatorRequest() { accesses += 1; }
        })
      });
      assert.equal(outcome.exitCode, 2);
      assert.equal(accesses, 0);
      assert.equal(outcome.output.receiptState, "contract_rejected");
      assertNoPrivateData(combinedSerialization(outcome), [filePath, "private-fragment"]);
    }

    let reads = 0;
    let opens = 0;
    let closes = 0;
    const fileSystem = Object.create(fs);
    fileSystem.openSync = (...args) => { opens += 1; return fs.openSync(...args); };
    fileSystem.readSync = (...args) => { reads += 1; return fs.readSync(...args); };
    fileSystem.closeSync = (...args) => { closes += 1; return fs.closeSync(...args); };
    const accepted = await runAccountResourceAuthorityAssignmentCli({
      argv: argv("plan", good),
      operations: operations({ fileSystem })
    });
    assert.equal(accepted.exitCode, 0);
    assert.equal(opens, 1);
    assert.equal(reads, 1);
    assert.equal(closes, 1);
  });
});

test("private loader rejects owner and inode/size mismatches generically", async (t) => {
  if (process.platform === "win32") {
    t.skip("POSIX owner/inode simulation");
    return;
  }
  await withTempDirectory(async (directory) => {
    const requestFile = writePrivateRequest(directory);
    const cases = [
      ["owner", {
        lstatSync(path) {
          const stat = fs.lstatSync(path);
          return new Proxy(stat, { get(target, key) {
            return key === "uid" ? target.uid + 1 : Reflect.get(target, key);
          } });
        }
      }],
      ["inode", {
        fstatSync(fd) {
          const stat = fs.fstatSync(fd);
          return new Proxy(stat, { get(target, key) {
            return key === "ino" ? target.ino + 1 : Reflect.get(target, key);
          } });
        }
      }],
      ["fstat-owner", {
        fstatSync(fd) {
          const stat = fs.fstatSync(fd);
          return new Proxy(stat, { get(target, key) {
            return key === "uid" ? target.uid + 1 : Reflect.get(target, key);
          } });
        }
      }],
      ["fstat-mode", {
        fstatSync(fd) {
          const stat = fs.fstatSync(fd);
          return new Proxy(stat, { get(target, key) {
            return key === "mode" ? target.mode | 0o040 : Reflect.get(target, key);
          } });
        }
      }],
      ["size", {
        readSync(fd, buffer, offset, length, position) {
          const bytes = fs.readSync(fd, buffer, offset, length, position);
          writeFileSync(requestFile, `${readFileSync(requestFile, "utf8")} `, { mode: 0o600 });
          return bytes;
        }
      }]
    ];
    for (const [name, overrides] of cases) {
      writeFileSync(requestFile, JSON.stringify(assignRequest()), { mode: 0o600 });
      const fileSystem = Object.assign(Object.create(fs), overrides);
      let accesses = 0;
      const outcome = await runAccountResourceAuthorityAssignmentCli({
        argv: argv("plan", requestFile),
        operations: operations({
          fileSystem,
          planAuthorityOperatorRequest() { accesses += 1; }
        })
      });
      assert.equal(outcome.exitCode, 2, name);
      assert.equal(accesses, 0, name);
      assert.equal(outcome.output.databaseChanged, false);
      assertNoPrivateData(combinedSerialization(outcome), [requestFile]);
    }
  });
});

test("private loader rejects post-read fstat owner and mode changes", async (t) => {
  if (process.platform === "win32") {
    t.skip("POSIX post-read owner/mode simulation");
    return;
  }
  await withTempDirectory(async (directory) => {
    const requestFile = writePrivateRequest(directory);
    const cases = [
      ["owner", (stat) => new Proxy(stat, { get(target, key) {
        return key === "uid" ? target.uid + 1 : Reflect.get(target, key);
      } })],
      ["mode", (stat) => new Proxy(stat, { get(target, key) {
        return key === "mode" ? target.mode | 0o040 : Reflect.get(target, key);
      } })]
    ];
    for (const [name, changedStat] of cases) {
      let fstatCalls = 0;
      let serviceCalls = 0;
      const fileSystem = Object.assign(Object.create(fs), {
        fstatSync(fd) {
          fstatCalls += 1;
          const stat = fs.fstatSync(fd);
          return fstatCalls === 2 ? changedStat(stat) : stat;
        }
      });
      const outcome = await runAccountResourceAuthorityAssignmentCli({
        argv: argv("plan", requestFile),
        operations: operations({
          fileSystem,
          planAuthorityOperatorRequest() { serviceCalls += 1; }
        })
      });
      assert.equal(outcome.exitCode, 2, name);
      assert.equal(fstatCalls, 2, name);
      assert.equal(serviceCalls, 0, name);
      assert.equal(outcome.output.receiptState, "contract_rejected", name);
      assert.equal(outcome.output.databaseChanged, false, name);
      assertNoPrivateData(combinedSerialization(outcome), [requestFile]);
    }
  });
});

test("normalization failures collapse without private values", async () => {
  await withTempDirectory(async (directory) => {
    const privateValue = "synthetic_private_rejected_4cf1";
    const requestFile = writePrivateRequest(directory, assignRequest({
      accountId: privateValue,
      unexpected: "select * from private_table"
    }));
    let accesses = 0;
    const outcome = await runAccountResourceAuthorityAssignmentCli({
      argv: argv("plan", requestFile),
      operations: operations({
        planAuthorityOperatorRequest() { accesses += 1; }
      })
    });
    assert.equal(outcome.exitCode, 2);
    assert.equal(accesses, 0);
    assert.equal(outcome.output.requestDigest, null);
    assertNoPrivateData(combinedSerialization(outcome), [requestFile, privateValue]);

    const maliciousOperation = "synthetic_private_operation";
    const injected = await runAccountResourceAuthorityAssignmentCli({
      argv: argv("plan", writePrivateRequest(directory, assignRequest(), "injected.json")),
      operations: operations({
        normalizeAuthorityOperatorRequest: () => ({ operation: maliciousOperation }),
        digestAuthorityOperatorRequest: () => `sha256:${"0".repeat(64)}`,
        planAuthorityOperatorRequest: () => ({
          operation: maliciousOperation,
          requestDigest: `sha256:${"0".repeat(64)}`,
          classification: "not_applied",
          receiptState: "not_applicable",
          databaseChanged: false,
          automaticRetry: false
        })
      })
    });
    assert.equal(injected.exitCode, 2);
    assert.equal(injected.output.operation, null);
    assertNoPrivateData(combinedSerialization(injected), [maliciousOperation]);
  });
});

test("validated operation descriptor cannot be replaced by a proxy get trap", async () => {
  await withTempDirectory(async (directory) => {
    const sentinel = "synthetic_private_proxy_operation";
    const requestFile = writePrivateRequest(directory, assignRequest(), "proxy.json");
    const digest = `sha256:${"1".repeat(64)}`;
    const normalized = new Proxy({ operation: "assign" }, {
      get(target, key, receiver) {
        return key === "operation"
          ? sentinel
          : Reflect.get(target, key, receiver);
      }
    });
    let planCalls = 0;
    let applyCalls = 0;
    const outcome = await runAccountResourceAuthorityAssignmentCli({
      argv: argv("plan", requestFile),
      operations: operations({
        normalizeAuthorityOperatorRequest: () => normalized,
        digestAuthorityOperatorRequest: () => digest,
        planAuthorityOperatorRequest: ({ request }) => {
          planCalls += 1;
          return {
            operation: request.operation,
            requestDigest: digest,
            classification: "not_applied",
            receiptState: "not_applicable",
            databaseChanged: false,
            automaticRetry: false
          };
        },
        applyAuthorityOperatorRequest() { applyCalls += 1; }
      })
    });
    assert.equal(outcome.exitCode, 4);
    assert.equal(outcome.output.operation, "assign");
    assert.equal(outcome.output.receiptState, "result_rejected");
    assert.equal(outcome.output.databaseChanged, false);
    assert.equal(planCalls, 1);
    assert.equal(applyCalls, 0);
    assertNoPrivateData(combinedSerialization(outcome), [requestFile, sentinel]);
  });
});

test("digest objects and proxies cannot coerce into closed output", async (t) => {
  await withTempDirectory(async (directory) => {
    const requestFile = writePrivateRequest(directory, assignRequest(), "digest.json");
    const safeText = `sha256:${"2".repeat(64)}`;
    const cases = [
      ["object", {
        toString: () => safeText,
        toJSON: () => "synthetic_private_digest_object"
      }, "synthetic_private_digest_object"],
      ["proxy", new Proxy({}, {
        get(target, key, receiver) {
          if (key === Symbol.toPrimitive) return () => safeText;
          if (key === "toJSON") return () => "synthetic_private_digest_proxy";
          return Reflect.get(target, key, receiver);
        }
      }), "synthetic_private_digest_proxy"]
    ];
    for (const [name, digest, sentinel] of cases) {
      await t.test(name, async () => {
        let serviceCalls = 0;
        const outcome = await runAccountResourceAuthorityAssignmentCli({
          argv: argv("plan", requestFile),
          operations: operations({
            digestAuthorityOperatorRequest: () => digest,
            planAuthorityOperatorRequest: ({ request }) => {
              serviceCalls += 1;
              return {
                operation: request.operation,
                requestDigest: digest,
                classification: "not_applied",
                receiptState: "not_applicable",
                databaseChanged: false,
                automaticRetry: false
              };
            }
          })
        });
        assert.equal(outcome.exitCode, 2);
        assert.equal(serviceCalls, 0);
        assert.equal(outcome.output.requestDigest, null);
        assert.equal(outcome.output.receiptState, "contract_rejected");
        assertNoPrivateData(combinedSerialization(outcome), [requestFile, sentinel]);
      });
    }
  });
});

test("plan dispatches only plan and projects all coherent classifications", async () => {
  await withTempDirectory(async (directory) => {
    for (const request of [assignRequest(), reassignRequest()]) {
      const requestFile = writePrivateRequest(directory, request, `${request.operation}.json`);
      const cases = [
        ["not_applied", "not_applicable", 0],
        ["applied_exact", "recovered_after_unknown", 0],
        ["drift", "not_applicable", 3],
        ["unknown", "unknown", 4]
      ];
      for (const [classification, receiptState, exitCode] of cases) {
        let planCalls = 0;
        let applyCalls = 0;
        const outcome = await runAccountResourceAuthorityAssignmentCli({
          argv: argv("plan", requestFile),
          operations: operations({
            planAuthorityOperatorRequest({ request: normalized }) {
              planCalls += 1;
              return safeResult(normalized, { classification, receiptState });
            },
            applyAuthorityOperatorRequest() { applyCalls += 1; }
          })
        });
        assert.equal(outcome.exitCode, exitCode);
        assert.equal(planCalls, 1);
        assert.equal(applyCalls, 0);
        assert.equal(outcome.output.operation, request.operation);
        assert.equal(outcome.output.classification, classification);
        assert.equal(outcome.output.databaseChanged, false);
        assertClosed(outcome.output);
        assertNoPrivateData(combinedSerialization(outcome), [requestFile]);
      }
    }
  });
});

test("mutation validates mode operation and digest before apply access", async () => {
  await withTempDirectory(async (directory) => {
    for (const [mode, request] of [["assign", reassignRequest()], ["reassign", assignRequest()]]) {
      const requestFile = writePrivateRequest(directory, request, `${mode}.json`);
      const digest = digestAuthorityOperatorRequest(request);
      for (const confirmation of [digest.replace(/.$/, "0"), digest]) {
        let calls = 0;
        const outcome = await runAccountResourceAuthorityAssignmentCli({
          argv: argv(mode, requestFile, ["--confirm-request-digest", confirmation]),
          operations: operations({ applyAuthorityOperatorRequest() { calls += 1; } })
        });
        assert.equal(outcome.exitCode, 2);
        assert.equal(calls, 0);
        assert.equal(outcome.output.databaseChanged, false);
      }
    }

    const request = assignRequest();
    const requestFile = writePrivateRequest(directory, request, "right.json");
    const digest = digestAuthorityOperatorRequest(request);
    let calls = 0;
    const mismatch = await runAccountResourceAuthorityAssignmentCli({
      argv: argv("assign", requestFile, ["--confirm-request-digest", digest.replace(/.$/, digest.endsWith("0") ? "1" : "0")]),
      operations: operations({ applyAuthorityOperatorRequest() { calls += 1; } })
    });
    assert.equal(mismatch.exitCode, 2);
    assert.equal(calls, 0);
  });
});

test("mutation projects apply replay drift and unknown without retries", async () => {
  await withTempDirectory(async (directory) => {
    for (const [mode, request] of [["assign", assignRequest()], ["reassign", reassignRequest()]]) {
      const requestFile = writePrivateRequest(directory, request, `${mode}.json`);
      const digest = digestAuthorityOperatorRequest(request);
      const cases = [
        ["applied_exact", "applied", true, 0],
        ["applied_exact", "apply_refused_already_applied", false, 3],
        ["drift", "apply_refused_drift", false, 3],
        ["unknown", "unknown", null, 4]
      ];
      for (const [classification, receiptState, databaseChanged, exitCode] of cases) {
        let applyCalls = 0;
        let planCalls = 0;
        const outcome = await runAccountResourceAuthorityAssignmentCli({
          argv: argv(mode, requestFile, ["--confirm-request-digest", digest]),
          operations: operations({
            planAuthorityOperatorRequest() { planCalls += 1; },
            applyAuthorityOperatorRequest({ request: normalized }) {
              applyCalls += 1;
              return safeResult(normalized, { classification, receiptState, databaseChanged });
            }
          })
        });
        assert.equal(outcome.exitCode, exitCode);
        assert.equal(applyCalls, 1);
        assert.equal(planCalls, 0);
        assert.equal(outcome.output.databaseChanged, databaseChanged);
        assert.equal(outcome.output.automaticRetry, false);
      }
    }
  });
});

test("malformed injected six-key results are infrastructure unknown", async () => {
  await withTempDirectory(async (directory) => {
    const request = assignRequest();
    const requestFile = writePrivateRequest(directory, request);
    const valid = safeResult(request);
    const malformed = [
      { ...valid, privateValue: "synthetic_private_result_77" },
      Object.fromEntries(Object.entries(valid).filter(([key]) => key !== "operation")),
      { ...valid, operation: "reassign" },
      { ...valid, requestDigest: "sha256:" + "0".repeat(64) },
      { ...valid, receiptState: "arbitrary_private_receipt" },
      { ...valid, databaseChanged: true },
      { ...valid, automaticRetry: true },
      { ...valid, classification: "unknown", receiptState: "unknown", databaseChanged: null },
      null
    ];
    for (const result of malformed) {
      const outcome = await runAccountResourceAuthorityAssignmentCli({
        argv: argv("plan", requestFile),
        operations: operations({ planAuthorityOperatorRequest: () => result })
      });
      assert.equal(outcome.exitCode, 4);
      assertClosed(outcome.output);
      assert.equal(outcome.output.classification, "unknown");
      assert.equal(outcome.output.receiptState, "result_rejected");
      assert.equal(outcome.output.databaseChanged, false);
      assertNoPrivateData(combinedSerialization(outcome), [requestFile, "synthetic_private_result_77", "arbitrary_private_receipt"]);
    }

    const digest = digestAuthorityOperatorRequest(request);
    const mutationValid = safeResult(request, {
      classification: "applied_exact",
      receiptState: "applied",
      databaseChanged: true
    });
    const malformedMutation = [
      { ...mutationValid, privateValue: "synthetic_private_mutation_result" },
      Object.fromEntries(Object.entries(mutationValid).filter(([key]) => key !== "receiptState")),
      { ...mutationValid, receiptState: "arbitrary_private_receipt" },
      { ...mutationValid, databaseChanged: false }
    ];
    for (const result of malformedMutation) {
      let applyCalls = 0;
      let planCalls = 0;
      const outcome = await runAccountResourceAuthorityAssignmentCli({
        argv: argv("assign", requestFile, ["--confirm-request-digest", digest]),
        operations: operations({
          planAuthorityOperatorRequest() { planCalls += 1; },
          applyAuthorityOperatorRequest() {
            applyCalls += 1;
            return result;
          }
        })
      });
      assert.equal(outcome.exitCode, 4);
      assert.equal(outcome.output.classification, "unknown");
      assert.equal(outcome.output.receiptState, "result_rejected");
      assert.equal(outcome.output.databaseChanged, null);
      assert.equal(outcome.output.automaticRetry, false);
      assert.equal(applyCalls, 1);
      assert.equal(planCalls, 0);
      assertNoPrivateData(combinedSerialization(outcome), [
        requestFile,
        "synthetic_private_mutation_result",
        "arbitrary_private_receipt"
      ]);
    }
  });
});

function createFoundation(dbPath) {
  const database = new Database(dbPath);
  database.pragma("foreign_keys = ON");
  database.exec(`
    create table platform_accounts (id text primary key, owner_ref text not null, status text not null, created_at text not null, updated_at text not null, metadata_json text not null default '{}');
    create table platform_entitlements (id text primary key, account_id text not null references platform_accounts(id), plan text not null, status text not null, valid_from text not null, valid_until text not null, max_artifacts integer not null default 1, max_devices integer not null default 1, traffic_limit_bytes integer not null default 0, created_at text not null, updated_at text not null);
    create table platform_issuance_requests (id text primary key, account_id text not null references platform_accounts(id), entitlement_id text not null references platform_entitlements(id), approval_ref text not null, status text not null, quantity integer not null, node_id text not null, purpose text not null, requested_by_ref text not null, created_at text not null, updated_at text not null, metadata_json text not null default '{}');
    create table platform_issued_subscription_links (id text primary key, request_id text not null references platform_issuance_requests(id), tenant_ref text not null, artifact_ref text not null, status text not null, created_at text not null, updated_at text not null);
    create table platform_portal_access_requests (id text primary key, portal_user_ref text not null, entitlement_ref text, status text not null, tenant_id text, artifact_id text, expires_at text, valid_until text);
  `);
  applyCoinWalletMigrations({ database, expectedMigrationId: REQUIRED_COIN_WALLET_MIGRATION_ID, expectedDdlChecksum: COIN_WALLET_MIGRATIONS[0].ddlChecksum, nowFn: () => new Date(NOW) });
  applyCoinCommerceMigrations({ database, expectedMigrationId: REQUIRED_COIN_COMMERCE_MIGRATION_ID, expectedDdlChecksum: COIN_COMMERCE_MIGRATIONS[0].ddlChecksum, nowFn: () => new Date(NOW) });
  applyAccountResourceAuthorityMigrations({ database, expectedMigrationId: REQUIRED_ACCOUNT_RESOURCE_AUTHORITY_MIGRATION_ID, expectedDdlChecksum: ACCOUNT_RESOURCE_AUTHORITY_MIGRATIONS[0].ddlChecksum, nowFn: () => new Date(NOW) });
  return database;
}

function seedTarget(database, suffix) {
  const accountId = "account_synthetic";
  const entitlementId = `entitlement_synthetic_${suffix}`;
  const resourceRequestId = `request_synthetic_${suffix}`;
  const issuedLinkId = `link_synthetic_${suffix}`;
  database.prepare("insert or ignore into platform_accounts values (?, 'owner_synthetic', 'active', ?, ?, '{}')").run(accountId, NOW, NOW);
  database.prepare("insert into platform_entitlements values (?, ?, 'monthly', 'active', ?, '2027-08-08T00:00:00.000Z', 1, 1, 0, ?, ?)").run(entitlementId, accountId, NOW, NOW, NOW);
  database.prepare("insert into platform_issuance_requests values (?, ?, ?, 'approval_synthetic', 'issued', 1, 'node_synthetic', 'commerce', 'operator_synthetic', ?, ?, '{}')").run(resourceRequestId, accountId, entitlementId, NOW, NOW);
  const tenantRef = `tenantref_${createHash("sha256").update("tenant_synthetic").digest("hex").slice(0, 16)}`;
  const artifactRef = `artifactref_${createHash("sha256").update("artifact_synthetic").digest("hex").slice(0, 16)}`;
  database.prepare("insert into platform_issued_subscription_links values (?, ?, ?, ?, 'active', ?, ?)").run(issuedLinkId, resourceRequestId, tenantRef, artifactRef, NOW, NOW);
  database.prepare("insert into platform_portal_access_requests values (?, ?, ?, 'delivered', 'tenant_synthetic', 'artifact_synthetic', '2027-08-08T00:00:00.000Z', '2027-08-08T00:00:00.000Z')").run(resourceRequestId, accountId, entitlementId);
  return { accountId, entitlementId, resourceRequestId, issuedLinkId };
}

function tableNames(dbPath) {
  const database = new Database(dbPath, { readonly: true });
  try {
    return database.prepare("select name from sqlite_master where type = 'table' order by name").pluck().all();
  } finally {
    database.close();
  }
}

function nonAuthoritySnapshot(database) {
  const names = database.prepare(`
    select name from sqlite_master
    where type = 'table'
      and name not like 'sqlite_%'
      and name <> 'platform_account_resource_authorities'
    order by name
  `).pluck().all();
  return names.map((name) => ({
    name,
    rows: database.prepare(`select * from "${name.replaceAll('"', '""')}"`).all()
  }));
}

test("real assign and reassign commit once, refuse replay, and recover only by plan", async () => {
  await withTempDirectory(async (directory) => {
    const dbPath = join(directory, "authority.sqlite");
    const database = createFoundation(dbPath);
    const firstTarget = seedTarget(database, "a");
    const secondTarget = seedTarget(database, "b");
    const tablesBefore = database.prepare("select name from sqlite_master where type = 'table' order by name").pluck().all();
    const nonAuthorityBefore = nonAuthoritySnapshot(database);
    database.close();

    const first = assignRequest(firstTarget);
    const second = reassignRequest({
      accountId: secondTarget.accountId,
      resourceRequestId: secondTarget.resourceRequestId,
      entitlementId: secondTarget.entitlementId,
      issuedLinkId: secondTarget.issuedLinkId
    });
    const realOperations = operations({
      planAuthorityOperatorRequest: (input) => planAuthorityOperatorRequest({ ...input, nowFn: () => new Date(NOW) }),
      applyAuthorityOperatorRequest: (input) => applyAuthorityOperatorRequest({ ...input, nowFn: () => new Date(NOW) })
    });

    for (const [mode, request] of [["assign", first], ["reassign", second]]) {
      const requestFile = writePrivateRequest(directory, request, `${mode}-real.json`);
      const digest = digestAuthorityOperatorRequest(request);
      const command = argv(mode, requestFile, ["--confirm-request-digest", digest]);
      command[3] = dbPath;
      const applied = await runAccountResourceAuthorityAssignmentCli({ argv: command, operations: realOperations });
      assert.equal(applied.exitCode, 0, `${mode}: ${JSON.stringify(applied.output)}`);
      assert.equal(applied.output.databaseChanged, true);
      const replay = await runAccountResourceAuthorityAssignmentCli({ argv: command, operations: realOperations });
      assert.equal(replay.exitCode, 3);
      assert.equal(replay.output.receiptState, "apply_refused_already_applied");
      assert.equal(replay.output.databaseChanged, false);
      const plannedCommand = argv("plan", requestFile);
      plannedCommand[3] = dbPath;
      const recovered = await runAccountResourceAuthorityAssignmentCli({ argv: plannedCommand, operations: realOperations });
      assert.equal(recovered.exitCode, 0);
      assert.equal(recovered.output.receiptState, "recovered_after_unknown");
      assert.equal(recovered.output.databaseChanged, false);
    }

    assert.deepEqual(tableNames(dbPath), tablesBefore);
    const check = new Database(dbPath, { readonly: true });
    assert.equal(check.prepare("select count(*) from platform_account_resource_authorities").pluck().get(), 2);
    assert.deepEqual(nonAuthoritySnapshot(check), nonAuthorityBefore);
    check.close();
  });
});

test("real drift and unreadable database stop without becoming not applied", async () => {
  await withTempDirectory(async (directory) => {
    const missingDb = join(directory, "missing.sqlite");
    const request = assignRequest();
    const requestFile = writePrivateRequest(directory, request);
    const digest = digestAuthorityOperatorRequest(request);
    const realOperations = operations({
      planAuthorityOperatorRequest: (input) => planAuthorityOperatorRequest({
        ...input,
        nowFn: () => new Date(NOW)
      }),
      applyAuthorityOperatorRequest: (input) => applyAuthorityOperatorRequest({
        ...input,
        nowFn: () => new Date(NOW)
      })
    });
    const plannedArgs = argv("plan", requestFile);
    plannedArgs[3] = missingDb;
    const planned = await runAccountResourceAuthorityAssignmentCli({ argv: plannedArgs, operations: realOperations });
    assert.equal(planned.exitCode, 4);
    assert.equal(planned.output.classification, "unknown");
    assert.equal(planned.output.databaseChanged, false);
    const applyArgs = argv("assign", requestFile, ["--confirm-request-digest", digest]);
    applyArgs[3] = missingDb;
    const applied = await runAccountResourceAuthorityAssignmentCli({ argv: applyArgs, operations: realOperations });
    assert.equal(applied.exitCode, 4);
    assert.equal(applied.output.classification, "unknown");
    assert.equal(applied.output.databaseChanged, null);

    const dbPath = join(directory, "drift.sqlite");
    const database = createFoundation(dbPath);
    const target = seedTarget(database, "a");
    database.close();
    const first = assignRequest(target);
    applyAuthorityOperatorRequest({ dbPath, request: first, nowFn: () => new Date(NOW) });
    const drift = assignRequest({ ...target, newAuthorityRef: "authority_synthetic_drift" });
    const driftFile = writePrivateRequest(directory, drift, "drift.json");
    const driftArgs = argv("plan", driftFile);
    driftArgs[3] = dbPath;
    const driftOutcome = await runAccountResourceAuthorityAssignmentCli({ argv: driftArgs, operations: realOperations });
    assert.equal(driftOutcome.exitCode, 3);
    assert.equal(driftOutcome.output.classification, "drift");
    assert.equal(driftOutcome.output.databaseChanged, false);
  });
});

test("package assignment alias is exact while schema aliases are unchanged", () => {
  const packageJson = JSON.parse(readFileSync(resolve("package.json"), "utf8"));
  assert.equal(packageJson.scripts["platform:account-resource-authority:assignment"], "node scripts/platform-account-resource-authority-assignment.mjs");
  assert.equal(packageJson.scripts["platform:account-resource-authority:schema"], "node scripts/platform-account-resource-authority-schema.mjs");
  assert.equal(packageJson.scripts["platform:account-resource-authority-commerce:schema"], "node scripts/platform-account-resource-authority-commerce-schema.mjs");
});
