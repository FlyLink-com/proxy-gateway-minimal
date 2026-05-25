import assert from "node:assert/strict";
import net from "node:net";
import test from "node:test";
import {
  createEdgeTunnelChannel,
  createEdgeTunnelServer,
  encodeConnectRequest,
  parseConnectRequest
} from "../../agent/edge-tunnel.mjs";

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

test("edge tunnel connect request round-trips without credentials", () => {
  const encoded = encodeConnectRequest({
    host: "example.test",
    port: 443,
    addressType: "domain"
  });
  const serialized = encoded.toString("utf8");

  assert.match(serialized, /\n$/);
  assert.doesNotMatch(serialized, /token|credential|secret|password/i);
  assert.deepEqual(parseConnectRequest(encoded), {
    protocol: "globalcirclecat.edge-tunnel",
    version: 1,
    command: "connect",
    target: {
      host: "example.test",
      port: 443,
      addressType: "domain"
    }
  });
});

test("edge tunnel rejects unsupported or oversized requests", () => {
  assert.throws(() => parseConnectRequest(Buffer.from("{}\n")), /unsupported edge tunnel request/);
  assert.throws(() => parseConnectRequest(Buffer.alloc(5000, "a")), /edge tunnel request too large/);
});

test("edge tunnel channel forwards through injected remote openTcp", async () => {
  const echoServer = net.createServer((socket) => {
    socket.on("data", (chunk) => {
      socket.write(Buffer.concat([Buffer.from("echo:"), chunk]));
    });
  });
  const echoAddress = await listenNet(echoServer);
  const requests = [];
  const tunnelServer = createEdgeTunnelServer({
    openTcp: async (target) => {
      requests.push(target);
      return net.connect({ host: "127.0.0.1", port: echoAddress.port });
    }
  });
  const tunnelAddress = await listenNet(tunnelServer);
  const channel = createEdgeTunnelChannel({
    host: "127.0.0.1",
    port: tunnelAddress.port
  });

  try {
    const socket = await channel.openTcp({ host: "example.test", port: 443, addressType: "domain" });
    socket.write(Buffer.from("ping"));
    assert.deepEqual(await readBytes(socket, 9), Buffer.from("echo:ping"));
    socket.destroy();

    assert.deepEqual(requests, [{ host: "example.test", port: 443, addressType: "domain" }]);
    const diagnostics = channel.diagnosticsSnapshot();
    assert.equal(diagnostics.profile.type, "edge-tunnel");
    assert.equal(diagnostics.counters.connectOk, 1);
    assert.equal(diagnostics.lastFailure, null);
  } finally {
    await new Promise((resolve) => tunnelServer.close(resolve));
    await new Promise((resolve) => echoServer.close(resolve));
  }
});

test("edge tunnel fails closed and redacts target details", async () => {
  const tunnelServer = createEdgeTunnelServer({
    openTcp: async () => {
      throw new Error("cannot reach secret.example");
    }
  });
  const tunnelAddress = await listenNet(tunnelServer);
  const channel = createEdgeTunnelChannel({
    host: "127.0.0.1",
    port: tunnelAddress.port
  });

  try {
    await assert.rejects(
      () => channel.openTcp({ host: "secret.example", port: 443, addressType: "domain" }),
      /edge tunnel connect failed/
    );
    const diagnostics = channel.diagnosticsSnapshot();
    const serialized = JSON.stringify(diagnostics);
    assert.equal(diagnostics.counters.connectFailure, 1);
    assert.equal(diagnostics.lastFailure.class, "edge_tunnel_failure");
    assert.doesNotMatch(serialized, /secret\.example|cannot reach/);
  } finally {
    await new Promise((resolve) => tunnelServer.close(resolve));
  }
});

test("edge tunnel server rejects malformed handshake without opening target", async () => {
  let openCount = 0;
  const tunnelServer = createEdgeTunnelServer({
    openTcp: async () => {
      openCount += 1;
      throw new Error("should not open");
    }
  });
  const tunnelAddress = await listenNet(tunnelServer);
  const socket = net.connect({ host: "127.0.0.1", port: tunnelAddress.port });
  try {
    await onceEvent(socket, "connect");
    socket.write(Buffer.from("{}\n"));
    const reply = (await readBytes(socket, 1)).toString("utf8");
    assert.equal(reply, "{");
    socket.destroy();
    assert.equal(openCount, 0);
  } finally {
    socket.destroy();
    await new Promise((resolve) => tunnelServer.close(resolve));
  }
});
