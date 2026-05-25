import assert from "node:assert/strict";
import net from "node:net";
import test from "node:test";
import {
  createChannelFromProfile,
  normalizeChannelProfile
} from "../../agent/channel-profile.mjs";
import { createEdgeTunnelServer } from "../../agent/edge-tunnel.mjs";
import { startLocalEdgeAgent } from "../../agent/local-edge-agent.mjs";

function listenNet(server) {
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve(server.address()));
  });
}

function onceEvent(emitter, event) {
  return new Promise((resolve, reject) => {
    emitter.once(event, resolve);
    emitter.once("error", reject);
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

test("normalizeChannelProfile defaults to disabled", () => {
  assert.deepEqual(normalizeChannelProfile(), {
    type: "disabled"
  });
});

test("createChannelFromProfile disabled profile fails closed with redacted diagnostics", async () => {
  const channel = createChannelFromProfile({ type: "disabled" });

  await assert.rejects(
    () => channel.openTcp({ host: "secret.example", port: 443 }),
    /channel disabled/
  );
  const diagnostics = channel.diagnosticsSnapshot();
  const serialized = JSON.stringify(diagnostics);
  assert.equal(diagnostics.profile.type, "disabled");
  assert.equal(diagnostics.counters.connectFailure, 1);
  assert.equal(diagnostics.lastFailure.class, "channel_disabled");
  assert.doesNotMatch(serialized, /secret\.example/);
});

test("direct-tcp profile requires explicit local-development opt-in", () => {
  assert.throws(
    () => createChannelFromProfile({ type: "direct-tcp" }),
    /direct-tcp requires allowDirectTcp/
  );
});

test("edge-tunnel profile requires explicit local-development opt-in", () => {
  assert.throws(
    () => createChannelFromProfile({ type: "edge-tunnel", host: "127.0.0.1", port: 19000 }),
    /edge-tunnel requires allowEdgeTunnel/
  );
});

test("direct-tcp profile opens a TCP channel only when explicitly enabled", async () => {
  const echoServer = net.createServer((socket) => {
    socket.on("data", (chunk) => {
      socket.write(Buffer.concat([Buffer.from("echo:"), chunk]));
    });
  });
  const address = await listenNet(echoServer);
  const channel = createChannelFromProfile({ type: "direct-tcp", allowDirectTcp: true });
  try {
    const socket = await channel.openTcp({ host: "127.0.0.1", port: address.port });
    socket.write(Buffer.from("ping"));
    assert.deepEqual(await readBytes(socket, 9), Buffer.from("echo:ping"));
    socket.destroy();

    const diagnostics = channel.diagnosticsSnapshot();
    assert.equal(diagnostics.profile.type, "direct-tcp");
    assert.equal(diagnostics.profile.developmentOnly, true);
    assert.equal(diagnostics.counters.connectOk, 1);
    assert.equal(diagnostics.lastFailure, null);
  } finally {
    await new Promise((resolve) => echoServer.close(resolve));
  }
});

test("edge-tunnel profile opens an edge channel only when explicitly enabled", async () => {
  const echoServer = net.createServer((socket) => {
    socket.on("data", (chunk) => {
      socket.write(Buffer.concat([Buffer.from("echo:"), chunk]));
    });
  });
  const echoAddress = await listenNet(echoServer);
  const tunnelServer = createEdgeTunnelServer({
    openTcp: async () => net.connect({ host: "127.0.0.1", port: echoAddress.port })
  });
  const tunnelAddress = await listenNet(tunnelServer);
  const channel = createChannelFromProfile({
    type: "edge-tunnel",
    allowEdgeTunnel: true,
    host: "127.0.0.1",
    port: tunnelAddress.port
  });

  try {
    const socket = await channel.openTcp({ host: "example.test", port: 443, addressType: "domain" });
    socket.write(Buffer.from("ping"));
    assert.deepEqual(await readBytes(socket, 9), Buffer.from("echo:ping"));
    socket.destroy();

    const diagnostics = channel.diagnosticsSnapshot();
    assert.equal(diagnostics.profile.type, "edge-tunnel");
    assert.equal(diagnostics.profile.host, "[redacted]");
    assert.equal(diagnostics.counters.connectOk, 1);
    assert.equal(diagnostics.lastFailure, null);
  } finally {
    await new Promise((resolve) => tunnelServer.close(resolve));
    await new Promise((resolve) => echoServer.close(resolve));
  }
});

test("edge-tunnel profile passes handshake timeout to the edge channel", async () => {
  const serverSockets = new Set();
  const tunnelServer = net.createServer((socket) => {
    serverSockets.add(socket);
    socket.once("close", () => serverSockets.delete(socket));
  });
  const tunnelAddress = await listenNet(tunnelServer);
  const channel = createChannelFromProfile({
    type: "edge-tunnel",
    allowEdgeTunnel: true,
    host: "127.0.0.1",
    port: tunnelAddress.port,
    handshakeTimeoutMs: 20
  });

  try {
    const startedAt = Date.now();
    await assert.rejects(
      () => channel.openTcp({ host: "example.test", port: 443, addressType: "domain" }),
      /edge tunnel connect failed/
    );
    assert.ok(Date.now() - startedAt < 1000);
    const diagnostics = channel.diagnosticsSnapshot();
    assert.equal(diagnostics.counters.connectFailure, 1);
  } finally {
    for (const socket of serverSockets) {
      socket.destroy();
    }
    await new Promise((resolve) => tunnelServer.close(resolve));
  }
});

test("startLocalEdgeAgent can wire a development direct-tcp channel profile", async () => {
  const echoServer = net.createServer((socket) => {
    socket.on("data", (chunk) => {
      socket.write(Buffer.concat([Buffer.from("echo:"), chunk]));
    });
  });
  const echoAddress = await listenNet(echoServer);
  const agent = await startLocalEdgeAgent({
    config: { subscriptionPort: 0, proxyPort: 0 },
    startProxyAdapter: true,
    channelProfile: { type: "direct-tcp", allowDirectTcp: true }
  });
  try {
    const client = await connectSocksClient(agent.config.proxyPort);
    try {
      client.write(Buffer.from([0x05, 0x01, 0x00]));
      assert.deepEqual(await readBytes(client, 2), Buffer.from([0x05, 0x00]));

      client.write(domainConnectRequest("127.0.0.1", echoAddress.port));
      assert.deepEqual(await readBytes(client, 10), Buffer.from([0x05, 0x00, 0x00, 0x01, 0, 0, 0, 0, 0, 0]));
      client.write(Buffer.from("ping"));
      assert.deepEqual(await readBytes(client, 9), Buffer.from("echo:ping"));
    } finally {
      client.destroy();
    }

    const diagnostics = agent.channel.diagnosticsSnapshot();
    assert.equal(diagnostics.profile.type, "direct-tcp");
    assert.equal(diagnostics.counters.connectOk, 1);
  } finally {
    await agent.close();
    await new Promise((resolve) => echoServer.close(resolve));
  }
});
