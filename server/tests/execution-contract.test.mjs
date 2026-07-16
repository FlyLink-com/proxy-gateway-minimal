import assert from "node:assert/strict";
import { chmodSync, mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import test from "node:test";

const contractPromise = import("../services/execution-contract.mjs");

function intentInput(overrides = {}) {
  return {
    schemaVersion: "1",
    executionId: "execution-contract-test-001",
    commandId: "node-safe-smoke",
    executable: process.execPath,
    args: ["-e", "process.exit(0)"],
    cwd: process.cwd(),
    timeoutMs: 2_000,
    maxOutputBytes: 4_096,
    environment: {},
    ...overrides
  };
}

function bindingFor(intent, overrides = {}) {
  return {
    proposalId: "execution-contract-proposal-001",
    approvalId: "execution-contract-approval-001",
    intentDigest: intent.intentDigest,
    ...overrides
  };
}

test("execution contract v1 creates a strict frozen intent", async () => {
  const contract = await contractPromise.catch(() => ({}));

  assert.equal(typeof contract.createExecutionIntent, "function");

  const intent = contract.createExecutionIntent({
    schemaVersion: "1",
    executionId: "execution-contract-test-001",
    commandId: "node-safe-smoke",
    executable: process.execPath,
    args: ["-e", "process.exit(0)"],
    cwd: process.cwd(),
    timeoutMs: 2_000,
    maxOutputBytes: 4_096,
    environment: {}
  });

  assert.equal(intent.schemaVersion, "1");
  assert.equal(intent.type, "change_execution_intent");
  assert.equal(intent.executionId, "execution-contract-test-001");
  assert.equal(intent.command.id, "node-safe-smoke");
  assert.deepEqual(intent.command.args, ["-e", "process.exit(0)"]);
  assert.match(intent.intentDigest, /^[a-f0-9]{64}$/);
  assert.equal(Object.isFrozen(intent), true);

  assert.throws(
    () => contract.createExecutionIntent({
      schemaVersion: "1",
      executionId: "execution-contract-test-002",
      commandId: "node-safe-smoke",
      executable: process.execPath,
      args: [],
      cwd: process.cwd(),
      timeoutMs: 2_000,
      maxOutputBytes: 4_096,
      environment: {},
      unsupported: true
    }),
    /execution_contract_spec_invalid/
  );
});

test("executable resolution returns an exact absolute identity", async () => {
  const contract = await contractPromise;
  assert.equal(typeof contract.resolveExecutable, "function");

  const resolution = await contract.resolveExecutable(process.execPath, {
    environment: process.env,
    platform: process.platform
  });

  assert.equal(resolution.source, "absolute");
  assert.equal(resolution.matchCount, 1);
  assert.equal(resolution.resolvedPath, realpathSync(process.execPath));
  assert.match(resolution.contentSha256, /^[a-f0-9]{64}$/);
});

test("executable resolution rejects PATH shadowing", async () => {
  const contract = await contractPromise;
  assert.equal(typeof contract.resolveExecutable, "function");

  const root = mkdtempSync(join(tmpdir(), "execution-contract-shadow-"));
  const first = join(root, "first");
  const second = join(root, "second");
  mkdirSync(first);
  mkdirSync(second);
  const fileName = process.platform === "win32" ? "contract-tool.cmd" : "contract-tool";
  for (const directory of [first, second]) {
    const path = join(directory, fileName);
    writeFileSync(path, process.platform === "win32" ? "@exit /b 0\r\n" : "#!/bin/sh\nexit 0\n");
    if (process.platform !== "win32") chmodSync(path, 0o755);
  }

  try {
    await assert.rejects(
      () => contract.resolveExecutable("contract-tool", {
        environment: {
          PATH: [first, second].join(delimiter),
          PATHEXT: ".CMD"
        },
        platform: process.platform
      }),
      (error) => error?.code === "execution_path_shadowed"
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("execution intent rejects secret-bearing environment names without echoing values", async () => {
  const contract = await contractPromise;
  const protectedValue = "sensitive-environment-value";

  assert.throws(
    () => contract.createExecutionIntent(intentInput({
      environment: { GH_TOKEN: protectedValue }
    })),
    (error) => {
      assert.equal(error?.code, "execution_environment_forbidden");
      assert.doesNotMatch(String(error?.message), new RegExp(protectedValue));
      return true;
    }
  );

  assert.throws(
    () => contract.createExecutionIntent(intentInput({
      environment: { accessToken: protectedValue }
    })),
    (error) => {
      assert.equal(error?.code, "execution_environment_forbidden");
      assert.doesNotMatch(String(error?.message), new RegExp(protectedValue));
      return true;
    }
  );
});

test("execution blocks environment entries outside the caller allowlist", async () => {
  const contract = await contractPromise;
  assert.equal(typeof contract.executeExecutionContract, "function");
  const intent = contract.createExecutionIntent(intentInput({ environment: { LANG: "C" } }));

  const receipt = await contract.executeExecutionContract({
    intent,
    binding: bindingFor(intent),
    allowedEnvironmentNames: []
  });

  assert.equal(receipt.result, "blocked");
  assert.equal(receipt.condition, "environment_not_allowed");
  assert.equal(receipt.process, null);
});

test("stale binding blocks before readback or process execution", async () => {
  const contract = await contractPromise;
  assert.equal(typeof contract.createReadbackInterface, "function");
  assert.equal(typeof contract.executeExecutionContract, "function");
  const calls = [];
  const readback = contract.createReadbackInterface({
    before: async () => {
      calls.push("before");
      return { status: "ready" };
    },
    after: async () => {
      calls.push("after");
      return { status: "healthy" };
    }
  });
  const intent = contract.createExecutionIntent(intentInput());

  const receipt = await contract.executeExecutionContract({
    intent,
    binding: bindingFor(intent, { intentDigest: "0".repeat(64) }),
    allowedEnvironmentNames: [],
    readback
  });

  assert.equal(receipt.result, "blocked");
  assert.equal(receipt.condition, "stale_binding");
  assert.equal(receipt.process, null);
  assert.deepEqual(calls, []);
});

test("before and after readback are retained as safe aggregate evidence", async () => {
  const contract = await contractPromise;
  const readback = contract.createReadbackInterface({
    before: async () => ({
      status: "ready",
      identityDigest: "a".repeat(64),
      counts: { missing: 0 }
    }),
    after: async () => ({
      status: "healthy",
      identityDigest: "b".repeat(64),
      counts: { missing: 0 }
    })
  });
  const intent = contract.createExecutionIntent(intentInput());

  const receipt = await contract.executeExecutionContract({
    intent,
    binding: bindingFor(intent),
    allowedEnvironmentNames: [],
    readback
  });

  assert.equal(receipt.result, "completed");
  assert.equal(receipt.condition, "ok");
  assert.equal(receipt.readback.before.status, "ready");
  assert.equal(receipt.readback.after.status, "healthy");
  assert.equal(receipt.readback.before.counts.missing, 0);
});

test("sensitive camelCase readback fields fail closed without echoing values", async () => {
  const contract = await contractPromise;
  const protectedValue = "protected-readback-material";
  const readback = contract.createReadbackInterface({
    before: async () => ({ rawOutput: protectedValue }),
    after: async () => ({ status: "healthy" })
  });
  const intent = contract.createExecutionIntent(intentInput());

  const receipt = await contract.executeExecutionContract({
    intent,
    binding: bindingFor(intent),
    allowedEnvironmentNames: [],
    readback
  });

  assert.equal(receipt.result, "blocked");
  assert.equal(receipt.condition, "execution_readback_unsafe");
  assert.equal(receipt.process, null);
  assert.doesNotMatch(JSON.stringify(receipt), new RegExp(protectedValue));
});

test("process timeout returns a redacted timed-out envelope", async () => {
  const contract = await contractPromise;
  const intent = contract.createExecutionIntent(intentInput({
    args: ["-e", "setTimeout(() => {}, 10000)"],
    timeoutMs: 100
  }));

  const receipt = await contract.executeExecutionContract({
    intent,
    binding: bindingFor(intent),
    allowedEnvironmentNames: []
  });

  assert.equal(receipt.result, "failed");
  assert.equal(receipt.condition, "process_timed_out");
  assert.equal(receipt.process.state, "timed_out");
  assert.equal(receipt.process.timedOut, true);
  assert.equal("raw" in receipt.process.stdout, false);
  assert.equal("raw" in receipt.process.stderr, false);
});

test("output overflow stops execution without returning raw output", async () => {
  const contract = await contractPromise;
  const intent = contract.createExecutionIntent(intentInput({
    args: ["-e", "process.stdout.write('x'.repeat(8192)); setTimeout(() => {}, 1000)"],
    maxOutputBytes: 128
  }));

  const receipt = await contract.executeExecutionContract({
    intent,
    binding: bindingFor(intent),
    allowedEnvironmentNames: []
  });

  assert.equal(receipt.result, "failed");
  assert.equal(receipt.condition, "process_output_limit_exceeded");
  assert.equal(receipt.process.state, "output_limit_exceeded");
  assert.equal(receipt.process.outputLimitExceeded, true);
  assert.equal(JSON.stringify(receipt).includes("x".repeat(32)), false);
});

test("sensitive stdout and stderr are represented only by byte counts and digests", async () => {
  const contract = await contractPromise;
  const protectedValue = "protected-process-material";
  const intent = contract.createExecutionIntent(intentInput({
    args: [
      "-e",
      `process.stdout.write(${JSON.stringify(protectedValue)}); process.stderr.write(${JSON.stringify(protectedValue)});`
    ]
  }));

  const receipt = await contract.executeExecutionContract({
    intent,
    binding: bindingFor(intent),
    allowedEnvironmentNames: []
  });

  const serialized = JSON.stringify(receipt);
  assert.equal(receipt.result, "completed");
  assert.doesNotMatch(serialized, new RegExp(protectedValue));
  assert.equal(receipt.process.stdout.bytes, Buffer.byteLength(protectedValue));
  assert.equal(receipt.process.stderr.bytes, Buffer.byteLength(protectedValue));
  assert.match(receipt.process.stdout.sha256, /^[a-f0-9]{64}$/);
  assert.match(receipt.process.stderr.sha256, /^[a-f0-9]{64}$/);
});

test("receipt builder rejects raw process output fields", async () => {
  const contract = await contractPromise;
  assert.equal(typeof contract.buildExecutionReceipt, "function");
  const protectedValue = "raw-receipt-material";
  const intent = contract.createExecutionIntent(intentInput());

  assert.throws(
    () => contract.buildExecutionReceipt({
      intent,
      binding: bindingFor(intent),
      resolution: {
        source: "absolute",
        basename: "node",
        pathSha256: "a".repeat(64),
        contentSha256: "b".repeat(64),
        matchCount: 1
      },
      process: {
        state: "succeeded",
        stdout: protectedValue,
        stderr: ""
      },
      readback: { before: null, after: null },
      startedAt: "2026-07-15T00:00:00.000Z",
      finishedAt: "2026-07-15T00:00:01.000Z"
    }),
    (error) => {
      assert.equal(error?.code, "execution_contract_receipt_invalid");
      assert.doesNotMatch(String(error?.message), new RegExp(protectedValue));
      return true;
    }
  );
});

test("receipt builder rejects stale binding for a non-blocked result", async () => {
  const contract = await contractPromise;
  const intent = contract.createExecutionIntent(intentInput());
  const emptySha256 = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";

  assert.throws(
    () => contract.buildExecutionReceipt({
      intent,
      binding: bindingFor(intent, { intentDigest: "0".repeat(64) }),
      process: {
        state: "succeeded",
        exitCode: 0,
        signal: null,
        timedOut: false,
        outputLimitExceeded: false,
        durationMs: 1,
        stdout: { bytes: 0, sha256: emptySha256 },
        stderr: { bytes: 0, sha256: emptySha256 }
      },
      readback: { before: null, after: null },
      result: "completed",
      condition: "ok",
      startedAt: "2026-07-15T00:00:00.000Z",
      finishedAt: "2026-07-15T00:00:01.000Z"
    }),
    /execution_contract_receipt_invalid/
  );
});

test("receipt builder rejects non-ISO timestamps without echoing values", async () => {
  const contract = await contractPromise;
  const protectedValue = "unsafe-receipt-timestamp";
  const intent = contract.createExecutionIntent(intentInput());

  assert.throws(
    () => contract.buildExecutionReceipt({
      intent,
      binding: bindingFor(intent),
      process: null,
      readback: { before: null, after: null },
      result: "blocked",
      condition: "operator_stop",
      startedAt: protectedValue,
      finishedAt: null
    }),
    (error) => {
      assert.equal(error?.code, "execution_contract_receipt_invalid");
      assert.doesNotMatch(String(error?.message), new RegExp(protectedValue));
      return true;
    }
  );
});
