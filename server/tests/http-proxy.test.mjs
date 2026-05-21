import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import test from "node:test";
import { createHttpProxyService } from "../services/http-proxy.mjs";

class FakeServer extends EventEmitter {
  constructor() {
    super();
    this.listening = false;
    this.listenCalls = 0;
    this.closeCalls = 0;
  }

  listen(_port, _host, callback) {
    this.listenCalls += 1;
    this.listening = true;
    callback?.();
  }

  close(callback) {
    this.closeCalls += 1;
    this.listening = false;
    callback?.();
  }
}

test("http proxy start listens once", async () => {
  const server = new FakeServer();
  const service = createHttpProxyService({
    server,
    port: 18180,
    host: "127.0.0.1",
    isPortListeningFn: async () => false,
    logger: { log() {} }
  });

  assert.deepEqual(await service.start(), { ok: true, msg: "http-proxy starting..." });
  assert.equal(server.listenCalls, 1);
  assert.equal(service.status().running, true);
});

test("http proxy start rejects port already owned by another process", async () => {
  const server = new FakeServer();
  const service = createHttpProxyService({
    server,
    port: 18180,
    host: "127.0.0.1",
    isPortListeningFn: async () => true,
    logger: { log() {} }
  });

  assert.deepEqual(await service.start(), { ok: false, msg: "Port 18180 already in use by another process" });
  assert.equal(server.listenCalls, 0);
  assert.equal(service.status().running, false);
});

test("http proxy stop is idempotent", async () => {
  const server = new FakeServer();
  const service = createHttpProxyService({
    server,
    port: 18180,
    host: "127.0.0.1",
    isPortListeningFn: async () => false,
    logger: { log() {} }
  });

  assert.deepEqual(await service.stop(), { ok: true });
  assert.deepEqual(await service.stop(), { ok: true });
});
