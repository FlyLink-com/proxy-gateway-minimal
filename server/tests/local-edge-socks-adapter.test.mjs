import assert from "node:assert/strict";
import net from "node:net";
import test from "node:test";
import {
  normalizeSocksAdapterConfig,
  startLocalSocksAdapter
} from "../../agent/socks5-adapter.mjs";

function onceEvent(emitter, event) {
  return new Promise((resolve, reject) => {
    emitter.once(event, resolve);
    emitter.once("error", reject);
  });
}

function listenNet(server) {
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve(server.address()));
  });
}

function readBytes(socket, length) {
  return new Promise((resolve, reject) => {
    let chunks = [];
    let total = 0;

    function cleanup() {
      socket.off("data", onData);
      socket.off("error", reject);
      socket.off("end", onEnd);
    }

    function onEnd() {
      cleanup();
      reject(new Error("socket ended before expected bytes"));
    }

    function onData(chunk) {
      chunks.push(chunk);
      total += chunk.length;
      if (total < length) {
        return;
      }

      cleanup();
      const buffer = Buffer.concat(chunks, total);
      const result = buffer.subarray(0, length);
      const rest = buffer.subarray(length);
      if (rest.length > 0) {
        socket.unshift(rest);
      }
      resolve(result);
    }

    socket.on("data", onData);
    socket.once("error", reject);
    socket.once("end", onEnd);
  });
}

function domainConnectRequest(host, port) {
  const hostBuffer = Buffer.from(host, "utf8");
  return Buffer.concat([
    Buffer.from([0x05, 0x01, 0x00, 0x03, hostBuffer.length]),
    hostBuffer,
    Buffer.from([(port >> 8) & 0xff, port & 0xff])
  ]);
}

async function connectSocksClient(port) {
  const socket = net.connect({ host: "127.0.0.1", port });
  await onceEvent(socket, "connect");
  return socket;
}

test("normalizeSocksAdapterConfig accepts loopback-only listeners", () => {
  const config = normalizeSocksAdapterConfig({ bindHost: "127.0.0.1", port: "19080" });

  assert.equal(config.bindHost, "127.0.0.1");
  assert.equal(config.port, 19080);
});

test("normalizeSocksAdapterConfig rejects public listeners", () => {
  assert.throws(() => normalizeSocksAdapterConfig({ bindHost: "0.0.0.0", port: 19080 }), /loopback-only/);
  assert.throws(() => normalizeSocksAdapterConfig({ bindHost: "10.0.0.5", port: 19080 }), /loopback-only/);
});

test("SOCKS5 adapter CONNECT delegates to an injected channel", async () => {
  const echoServer = net.createServer((socket) => {
    socket.on("data", (chunk) => {
      socket.write(Buffer.concat([Buffer.from("echo:"), chunk]));
    });
  });
  const echoAddress = await listenNet(echoServer);
  const requests = [];
  const channel = {
    openTcp: async (target) => {
      requests.push(target);
      return net.connect({ host: "127.0.0.1", port: echoAddress.port });
    }
  };
  const adapter = await startLocalSocksAdapter({ bindHost: "127.0.0.1", port: 0, channel });
  const client = await connectSocksClient(adapter.address.port);
  try {
    client.write(Buffer.from([0x05, 0x01, 0x00]));
    assert.deepEqual(await readBytes(client, 2), Buffer.from([0x05, 0x00]));

    client.write(domainConnectRequest("example.test", 443));
    assert.deepEqual(await readBytes(client, 10), Buffer.from([0x05, 0x00, 0x00, 0x01, 0, 0, 0, 0, 0, 0]));

    client.write(Buffer.from("ping"));
    assert.deepEqual(await readBytes(client, 9), Buffer.from("echo:ping"));
    assert.deepEqual(requests, [{ host: "example.test", port: 443, addressType: "domain" }]);

    const diagnostics = adapter.adapter.diagnosticsSnapshot();
    assert.equal(diagnostics.counters.connectOk, 1);
    assert.equal(diagnostics.lastFailure, null);
  } finally {
    client.destroy();
    await adapter.close();
    await new Promise((resolve) => echoServer.close(resolve));
  }
});

test("SOCKS5 adapter fails closed and redacts failed targets", async () => {
  const adapter = await startLocalSocksAdapter({
    bindHost: "127.0.0.1",
    port: 0,
    channel: {
      openTcp: async () => {
        throw new Error("remote channel unavailable for secret.example");
      }
    }
  });
  const client = await connectSocksClient(adapter.address.port);
  try {
    client.write(Buffer.from([0x05, 0x01, 0x00]));
    assert.deepEqual(await readBytes(client, 2), Buffer.from([0x05, 0x00]));

    client.write(domainConnectRequest("secret.example", 443));
    const reply = await readBytes(client, 10);
    assert.equal(reply[1], 0x05);

    const diagnostics = adapter.adapter.diagnosticsSnapshot();
    const serialized = JSON.stringify(diagnostics);
    assert.equal(diagnostics.counters.connectFailure, 1);
    assert.equal(diagnostics.lastFailure.class, "channel_failure");
    assert.doesNotMatch(serialized, /secret\.example|remote channel unavailable/);
  } finally {
    client.destroy();
    await adapter.close();
  }
});

test("SOCKS5 adapter rejects unsupported commands without opening a channel", async () => {
  let openCount = 0;
  const adapter = await startLocalSocksAdapter({
    bindHost: "127.0.0.1",
    port: 0,
    channel: {
      openTcp: async () => {
        openCount += 1;
        throw new Error("should not open");
      }
    }
  });
  const client = await connectSocksClient(adapter.address.port);
  try {
    client.write(Buffer.from([0x05, 0x01, 0x00]));
    assert.deepEqual(await readBytes(client, 2), Buffer.from([0x05, 0x00]));

    const request = domainConnectRequest("example.test", 443);
    request[1] = 0x03;
    client.write(request);
    const reply = await readBytes(client, 10);
    assert.equal(reply[1], 0x07);
    assert.equal(openCount, 0);
  } finally {
    client.destroy();
    await adapter.close();
  }
});
