import assert from "node:assert/strict";
import http from "node:http";
import net from "node:net";
import { PassThrough } from "node:stream";
import test from "node:test";
import { createBridgeServer } from "../services/http-bridge.mjs";
import { createHttpProxyService } from "../services/http-proxy.mjs";

class FakeSocksProxyAgent {
  constructor(url) {
    this.url = url;
  }
}

function headersFrom(values = {}) {
  return {
    forEach(callback) {
      for (const [key, value] of Object.entries(values)) {
        callback(value, key);
      }
    }
  };
}

function listenBridge(server) {
  return new Promise((resolve, reject) => {
    function onError(error) {
      reject(error);
    }

    server.once("error", onError);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", onError);
      resolve(server.address().port);
    });
  });
}

function closeServer(server) {
  return new Promise((resolve, reject) => {
    if (!server.listening) {
      resolve();
      return;
    }

    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
}

function requestThroughBridge(port, { method = "GET", path }) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const req = http.request({
      host: "127.0.0.1",
      port,
      method,
      path,
      timeout: 1000
    }, (res) => {
      let body = "";
      res.setEncoding("utf8");
      res.on("data", (chunk) => {
        body += chunk;
      });
      res.on("end", () => {
        if (!settled) {
          settled = true;
          resolve({ statusCode: res.statusCode, body });
        }
      });
    });

    req.on("timeout", () => {
      req.destroy(new Error("request timed out"));
    });
    req.on("error", (error) => {
      if (!settled) {
        settled = true;
        reject(error);
      }
    });
    req.end();
  });
}

function rawRequestUntilClose(port, payload, timeoutMs = 1000) {
  return new Promise((resolve, reject) => {
    let data = "";
    const socketErrors = [];
    const socket = net.createConnection({ host: "127.0.0.1", port }, () => {
      socket.write(payload);
    });
    const timer = setTimeout(() => {
      socket.destroy();
      reject(new Error("socket did not close"));
    }, timeoutMs);

    socket.setEncoding("utf8");
    socket.on("data", (chunk) => {
      data += chunk;
    });
    socket.on("error", (error) => {
      socketErrors.push(error);
    });
    socket.on("close", () => {
      clearTimeout(timer);
      resolve({ data, socketErrors });
    });
  });
}

function openConnectTunnel(port) {
  return new Promise((resolve, reject) => {
    let data = "";
    let settled = false;
    const socket = net.createConnection({ host: "127.0.0.1", port }, () => {
      socket.write("CONNECT example.com:443 HTTP/1.1\r\nHost: example.com:443\r\n\r\n");
    });
    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        socket.destroy();
        reject(new Error("CONNECT tunnel was not established"));
      }
    }, 1000);

    socket.setEncoding("utf8");
    socket.on("data", (chunk) => {
      data += chunk;
      if (!settled && data.includes("200 Connection Established")) {
        settled = true;
        clearTimeout(timer);
        resolve({ socket, data });
      }
    });
    socket.on("error", (error) => {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        reject(error);
      }
    });
  });
}

function waitForSocketClose(socket, timeoutMs = 1000) {
  return new Promise((resolve, reject) => {
    if (socket.destroyed) {
      resolve();
      return;
    }

    const timer = setTimeout(() => {
      reject(new Error("socket did not close"));
    }, timeoutMs);
    socket.once("close", () => {
      clearTimeout(timer);
      resolve();
    });
  });
}

async function withProcessErrorCapture(callback) {
  const errors = [];
  function onUncaughtException(error) {
    errors.push({ type: "uncaughtException", error });
  }
  function onUnhandledRejection(error) {
    errors.push({ type: "unhandledRejection", error });
  }

  process.on("uncaughtException", onUncaughtException);
  process.on("unhandledRejection", onUnhandledRejection);
  try {
    await callback(errors);
    await new Promise((resolve) => setTimeout(resolve, 20));
    assert.deepEqual(errors, []);
  } finally {
    process.off("uncaughtException", onUncaughtException);
    process.off("unhandledRejection", onUnhandledRejection);
  }
}

async function assertPortCanBeReused(port) {
  const server = net.createServer();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", resolve);
  });
  await closeServer(server);
}

test("HTTP bridge rejects relative request targets with 400", async () => {
  let fetchCalled = false;
  const server = createBridgeServer({
    socksPort: 1080,
    SocksProxyAgentClass: FakeSocksProxyAgent,
    fetchFn: async () => {
      fetchCalled = true;
      throw new Error("fetch should not run");
    }
  });
  const port = await listenBridge(server);

  try {
    const response = await requestThroughBridge(port, { path: "/relative-path" });

    assert.equal(response.statusCode, 400);
    assert.match(response.body, /Bad Request/);
    assert.equal(fetchCalled, false);
  } finally {
    await closeServer(server);
  }
});

test("HTTP bridge rejects invalid absolute-looking request targets with 400", async () => {
  let fetchCalled = false;
  const server = createBridgeServer({
    socksPort: 1080,
    SocksProxyAgentClass: FakeSocksProxyAgent,
    fetchFn: async () => {
      fetchCalled = true;
      throw new Error("fetch should not run");
    }
  });
  const port = await listenBridge(server);

  try {
    const response = await requestThroughBridge(port, { path: "http://" });

    assert.equal(response.statusCode, 400);
    assert.match(response.body, /Bad Request/);
    assert.equal(fetchCalled, false);
  } finally {
    await closeServer(server);
  }
});

test("HTTP bridge returns 502 when the injected fetch path fails", async () => {
  const server = createBridgeServer({
    socksPort: 1080,
    SocksProxyAgentClass: FakeSocksProxyAgent,
    fetchFn: async () => {
      throw new Error("SOCKS unavailable");
    }
  });
  const port = await listenBridge(server);

  try {
    const response = await requestThroughBridge(port, { path: "http://example.test/" });

    assert.equal(response.statusCode, 502);
    assert.match(response.body, /SOCKS unavailable/);
  } finally {
    await closeServer(server);
  }
});

test("HTTP bridge ends upstream responses with a null body stream", async () => {
  const server = createBridgeServer({
    socksPort: 1080,
    SocksProxyAgentClass: FakeSocksProxyAgent,
    fetchFn: async () => ({
      status: 200,
      headers: headersFrom({ "x-upstream": "null-body" }),
      body: null
    })
  });
  const port = await listenBridge(server);

  try {
    const response = await requestThroughBridge(port, { path: "http://example.test/null-body" });

    assert.equal(response.statusCode, 200);
    assert.equal(response.body, "");
  } finally {
    await closeServer(server);
  }
});

test("HTTP bridge handles 204 upstream responses without a body stream", async () => {
  const server = createBridgeServer({
    socksPort: 1080,
    SocksProxyAgentClass: FakeSocksProxyAgent,
    fetchFn: async () => ({
      status: 204,
      headers: headersFrom({}),
      body: null
    })
  });
  const port = await listenBridge(server);

  try {
    const response = await requestThroughBridge(port, { path: "http://example.test/no-content" });

    assert.equal(response.statusCode, 204);
    assert.equal(response.body, "");
  } finally {
    await closeServer(server);
  }
});

test("HTTP bridge handles HEAD upstream responses without a body stream", async () => {
  const server = createBridgeServer({
    socksPort: 1080,
    SocksProxyAgentClass: FakeSocksProxyAgent,
    fetchFn: async () => ({
      status: 200,
      headers: headersFrom({}),
      body: null
    })
  });
  const port = await listenBridge(server);

  try {
    const response = await requestThroughBridge(port, {
      method: "HEAD",
      path: "http://example.test/head"
    });

    assert.equal(response.statusCode, 200);
    assert.equal(response.body, "");
  } finally {
    await closeServer(server);
  }
});

test("HTTP bridge CONNECT failure sends 502 and closes the client socket", async () => {
  const server = createBridgeServer({
    socksPort: 1080,
    SocksProxyAgentClass: FakeSocksProxyAgent,
    socksClient: {
      async createConnection() {
        throw new Error("SOCKS connect failed");
      }
    }
  });
  const port = await listenBridge(server);

  try {
    const result = await rawRequestUntilClose(
      port,
      "CONNECT example.com:443 HTTP/1.1\r\nHost: example.com:443\r\n\r\n"
    );

    assert.match(result.data, /502 Proxy Error/);
  } finally {
    await closeServer(server);
  }
});

test("HTTP bridge service starts on loopback and stop releases the listener port", async () => {
  const server = createBridgeServer({
    socksPort: 1080,
    SocksProxyAgentClass: FakeSocksProxyAgent
  });
  const service = createHttpProxyService({
    server,
    port: 0,
    host: "127.0.0.1",
    isPortListeningFn: async () => false,
    logger: { log() {} }
  });

  assert.deepEqual(await service.start(), { ok: true, msg: "http-proxy starting..." });
  const address = server.address();
  assert.equal(address.address, "127.0.0.1");
  assert.equal(service.status().running, true);

  await service.stop();
  assert.equal(service.status().running, false);
  await assertPortCanBeReused(address.port);
});

test("HTTP bridge handles response body stream errors without process-level failures", async () => {
  await withProcessErrorCapture(async () => {
    const body = new PassThrough();
    const server = createBridgeServer({
      socksPort: 1080,
      SocksProxyAgentClass: FakeSocksProxyAgent,
      fetchFn: async () => {
        setImmediate(() => body.emit("error", new Error("upstream body failed")));
        return {
          status: 200,
          headers: headersFrom({ "content-type": "text/plain" }),
          body
        };
      }
    });
    const port = await listenBridge(server);

    try {
      await rawRequestUntilClose(
        port,
        "GET http://example.test/ HTTP/1.1\r\nHost: example.test\r\nConnection: close\r\n\r\n"
      );
    } finally {
      await closeServer(server);
    }
  });
});

test("HTTP bridge handles peer socket errors after CONNECT without process-level failures", async () => {
  await withProcessErrorCapture(async () => {
    const peerSocket = new PassThrough();
    const server = createBridgeServer({
      socksPort: 1080,
      SocksProxyAgentClass: FakeSocksProxyAgent,
      socksClient: {
        async createConnection() {
          return { socket: peerSocket };
        }
      }
    });
    const port = await listenBridge(server);

    try {
      const tunnel = await openConnectTunnel(port);
      peerSocket.emit("error", new Error("peer socket failed"));
      await waitForSocketClose(tunnel.socket);

      assert.equal(peerSocket.destroyed, true);
    } finally {
      tunnelCleanup(peerSocket);
      await closeServer(server);
    }
  });
});

function tunnelCleanup(peerSocket) {
  if (!peerSocket.destroyed) {
    peerSocket.destroy();
  }
}
