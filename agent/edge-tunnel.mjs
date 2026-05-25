import net from "node:net";

const PROTOCOL = "globalcirclecat.edge-tunnel";
const VERSION = 1;
const MAX_REQUEST_BYTES = 4096;

function normalizeTarget(input = {}) {
  const host = String(input.host ?? "").trim();
  const port = Number(input.port);
  const addressType = String(input.addressType ?? "domain");

  if (!host) {
    throw new Error("target host is required");
  }
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("target port must be an integer TCP port");
  }
  if (!["domain", "ipv4", "ipv6"].includes(addressType)) {
    throw new Error("unsupported target address type");
  }

  return { host, port, addressType };
}

export function encodeConnectRequest(targetInput = {}) {
  const target = normalizeTarget(targetInput);
  return Buffer.from(
    `${JSON.stringify({
      protocol: PROTOCOL,
      version: VERSION,
      command: "connect",
      target
    })}\n`,
    "utf8"
  );
}

export function parseConnectRequest(buffer) {
  if (buffer.length > MAX_REQUEST_BYTES) {
    throw new Error("edge tunnel request too large");
  }

  let payload;
  try {
    payload = JSON.parse(buffer.toString("utf8").trimEnd());
  } catch {
    throw new Error("unsupported edge tunnel request");
  }

  if (payload.protocol !== PROTOCOL || payload.version !== VERSION || payload.command !== "connect") {
    throw new Error("unsupported edge tunnel request");
  }

  return {
    protocol: PROTOCOL,
    version: VERSION,
    command: "connect",
    target: normalizeTarget(payload.target)
  };
}

function readLine(socket) {
  return new Promise((resolve, reject) => {
    let buffer = Buffer.alloc(0);

    function cleanup() {
      socket.off("data", onData);
      socket.off("error", reject);
      socket.off("end", onEnd);
    }

    function onEnd() {
      cleanup();
      reject(new Error("edge tunnel ended before handshake"));
    }

    function onData(chunk) {
      buffer = Buffer.concat([buffer, chunk]);
      if (buffer.length > MAX_REQUEST_BYTES) {
        cleanup();
        reject(new Error("edge tunnel request too large"));
        return;
      }

      const newlineIndex = buffer.indexOf(0x0a);
      if (newlineIndex === -1) {
        return;
      }

      cleanup();
      const line = buffer.subarray(0, newlineIndex + 1);
      const rest = buffer.subarray(newlineIndex + 1);
      if (rest.length > 0) {
        socket.unshift(rest);
      }
      resolve(line);
    }

    socket.on("data", onData);
    socket.once("error", reject);
    socket.once("end", onEnd);
  });
}

function writeReply(socket, ok) {
  socket.write(Buffer.from(`${JSON.stringify(ok ? { ok: true } : { ok: false, error: "connect_failed" })}\n`));
}

function readReply(socket) {
  return readLine(socket).then((line) => {
    try {
      return JSON.parse(line.toString("utf8"));
    } catch {
      throw new Error("edge tunnel connect failed");
    }
  });
}

function waitForConnect(socket) {
  if (!socket.connecting) {
    return Promise.resolve(socket);
  }

  return new Promise((resolve, reject) => {
    socket.once("connect", () => resolve(socket));
    socket.once("error", reject);
  });
}

export function createEdgeTunnelServer({ openTcp } = {}) {
  if (typeof openTcp !== "function") {
    throw new Error("openTcp is required");
  }

  return net.createServer(async (socket) => {
    try {
      const request = parseConnectRequest(await readLine(socket));
      const remote = await openTcp(request.target);
      await waitForConnect(remote);
      writeReply(socket, true);
      socket.pipe(remote);
      remote.pipe(socket);
      socket.once("close", () => remote.destroy());
      remote.once("close", () => socket.destroy());
      remote.once("error", () => socket.destroy());
    } catch {
      writeReply(socket, false);
      socket.end();
    }
  });
}

export function createEdgeTunnelChannel({ host, port } = {}) {
  const edgeHost = String(host ?? "").trim();
  const edgePort = Number(port);
  if (!edgeHost) {
    throw new Error("edge tunnel host is required");
  }
  if (!Number.isInteger(edgePort) || edgePort < 1 || edgePort > 65535) {
    throw new Error("edge tunnel port must be an integer TCP port");
  }

  const counters = {
    connectOk: 0,
    connectFailure: 0
  };
  let lastFailure = null;

  return {
    async openTcp(targetInput) {
      const socket = net.connect({ host: edgeHost, port: edgePort });
      try {
        const target = normalizeTarget(targetInput);
        await waitForConnect(socket);
        socket.write(encodeConnectRequest(target));
        const reply = await readReply(socket);
        if (!reply.ok) {
          throw new Error("edge tunnel connect failed");
        }

        counters.connectOk += 1;
        lastFailure = null;
        return socket;
      } catch {
        socket.destroy();
        counters.connectFailure += 1;
        lastFailure = { class: "edge_tunnel_failure" };
        throw new Error("edge tunnel connect failed");
      }
    },
    diagnosticsSnapshot() {
      return {
        ok: true,
        profile: {
          type: "edge-tunnel",
          host: "[redacted]",
          port: edgePort
        },
        counters: { ...counters },
        lastFailure
      };
    }
  };
}
