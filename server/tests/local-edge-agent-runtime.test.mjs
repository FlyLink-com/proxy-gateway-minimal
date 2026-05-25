import assert from "node:assert/strict";
import net from "node:net";
import test from "node:test";
import { startLocalEdgeAgent } from "../../agent/local-edge-agent.mjs";

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

test("startLocalEdgeAgent does not start a SOCKS adapter by default", async () => {
  const agent = await startLocalEdgeAgent({
    config: {
      subscriptionPort: 0,
      proxyPort: 19080
    }
  });

  try {
    const health = await fetch(agent.subscriptionUrl.replace("/clash.yaml", "/health"));
    assert.equal(health.status, 200);
    const body = await health.json();
    assert.equal(body.proxyImplemented, false);
    assert.equal(agent.proxy, null);
  } finally {
    await agent.close();
  }
});

test("startLocalEdgeAgent wires the SOCKS adapter when explicitly enabled", async () => {
  const echoServer = net.createServer((socket) => {
    socket.on("data", (chunk) => {
      socket.write(Buffer.concat([Buffer.from("echo:"), chunk]));
    });
  });
  const echoAddress = await listenNet(echoServer);
  const targets = [];
  const channel = {
    openTcp: async (target) => {
      targets.push(target);
      return net.connect({ host: "127.0.0.1", port: echoAddress.port });
    }
  };

  let agent = null;
  try {
    agent = await startLocalEdgeAgent({
      config: {
        subscriptionPort: 0,
        proxyPort: 0,
        localNodeName: "Local Edge Adapter"
      },
      startProxyAdapter: true,
      channel
    });

    assert.ok(agent.proxy);
    assert.notEqual(agent.config.proxyPort, 0);

    const health = await fetch(agent.subscriptionUrl.replace("/clash.yaml", "/health"));
    assert.equal(health.status, 200);
    const body = await health.json();
    assert.equal(body.proxyImplemented, true);
    assert.equal(body.proxyPort, agent.config.proxyPort);

    const subscription = await fetch(agent.subscriptionUrl);
    assert.equal(subscription.status, 200);
    const yaml = await subscription.text();
    assert.match(yaml, new RegExp(`port: ${agent.config.proxyPort}`));
    assert.doesNotMatch(yaml, /example\.test|prod-edge|globalcirclecat/);

    const client = await connectSocksClient(agent.config.proxyPort);
    try {
      client.write(Buffer.from([0x05, 0x01, 0x00]));
      assert.deepEqual(await readBytes(client, 2), Buffer.from([0x05, 0x00]));

      client.write(domainConnectRequest("example.test", 443));
      assert.deepEqual(await readBytes(client, 10), Buffer.from([0x05, 0x00, 0x00, 0x01, 0, 0, 0, 0, 0, 0]));
      client.write(Buffer.from("ping"));
      assert.deepEqual(await readBytes(client, 9), Buffer.from("echo:ping"));
    } finally {
      client.destroy();
    }

    assert.deepEqual(targets, [{ host: "example.test", port: 443, addressType: "domain" }]);
  } finally {
    if (agent) {
      await agent.close();
    }
    await new Promise((resolve) => echoServer.close(resolve));
  }
});

test("startLocalEdgeAgent requires a channel when SOCKS adapter is enabled", async () => {
  await assert.rejects(
    () =>
      startLocalEdgeAgent({
        config: { subscriptionPort: 0, proxyPort: 0 },
        startProxyAdapter: true
      }),
    /channel.openTcp is required/
  );
});
