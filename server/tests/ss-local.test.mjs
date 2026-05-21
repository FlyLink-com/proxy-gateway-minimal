import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createSsLocalService } from "../services/ss-local.mjs";

class FakeChild extends EventEmitter {
  constructor(pid = 1234) {
    super();
    this.pid = pid;
    this.killed = false;
    this.stdout = new EventEmitter();
    this.stderr = new EventEmitter();
  }

  kill() {
    this.killed = true;
    this.emit("exit", 0);
  }
}

function makeService(overrides = {}) {
  const dir = mkdtempSync(join(tmpdir(), "ss-local-test-"));
  const templatePath = join(dir, "ss-local.json");
  writeFileSync(templatePath, JSON.stringify({ password: "${SS_PASSWORD}", local_port: 1080 }));

  const child = new FakeChild();
  const calls = { spawn: 0 };
  const service = createSsLocalService({
    ssPath: join(dir, "sslocal.exe"),
    templatePath,
    tempDir: dir,
    env: { SS_PASSWORD: "secret" },
    startupDelayMs: 1,
    spawnFn: () => {
      calls.spawn += 1;
      return child;
    },
    isPortListeningFn: async () => false,
    logger: { log() {}, warn() {}, error() {} },
    ...overrides
  });

  return { service, child, calls, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

test("ss-local start spawns one child and reports running", async () => {
  const { service, calls, cleanup } = makeService();
  try {
    const result = await service.start();
    assert.equal(result.ok, true);
    assert.equal(result.pid, 1234);
    assert.equal(calls.spawn, 1);
    assert.equal(service.status().running, true);
  } finally {
    cleanup();
  }
});

test("ss-local concurrent start is protected by mutex", async () => {
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  const { service, calls, cleanup } = makeService({ startupDelayMs: 1 });

  const originalStart = service.start;
  service.start = async () => {
    const result = originalStart();
    await gate;
    return result;
  };

  try {
    const first = originalStart();
    const second = originalStart();
    release();
    const results = await Promise.all([first, second]);
    assert.equal(results.filter((result) => result.ok).length, 1);
    assert.equal(results.some((result) => result.msg === "already starting"), true);
    assert.equal(calls.spawn, 1);
  } finally {
    cleanup();
  }
});

test("ss-local start rejects occupied SOCKS port", async () => {
  const { service, calls, cleanup } = makeService({ isPortListeningFn: async () => true });
  try {
    const result = await service.start();
    assert.equal(result.ok, false);
    assert.equal(result.msg, "Port 1080 already in use by another process");
    assert.equal(calls.spawn, 0);
  } finally {
    cleanup();
  }
});

test("ss-local stop is idempotent", async () => {
  const { service, cleanup } = makeService();
  try {
    assert.deepEqual(await service.stop(), { ok: true });
    assert.deepEqual(await service.stop(), { ok: true });
  } finally {
    cleanup();
  }
});
