import net from "node:net";

const PROTOCOL = "globalcirclecat.edge-tunnel";
const VERSION = 1;
const COMMAND_CONNECT = "connect";
const MAX_REQUEST_BYTES = 4096;
const DEFAULT_HANDSHAKE_TIMEOUT_MS = 5000;
const REPLY_ERROR_CONNECT_FAILED = "connect_failed";

export const EDGE_TUNNEL_CONTRACT = Object.freeze({
  protocol: PROTOCOL,
  version: VERSION,
  command: COMMAND_CONNECT,
  maxRequestBytes: MAX_REQUEST_BYTES,
  defaultHandshakeTimeoutMs: DEFAULT_HANDSHAKE_TIMEOUT_MS,
  replyErrors: Object.freeze([REPLY_ERROR_CONNECT_FAILED])
});

function normalizeHandshakeTimeoutMs(input) {
  const timeoutMs = input === undefined ? DEFAULT_HANDSHAKE_TIMEOUT_MS : Number(input);
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1) {
    throw new Error("edge tunnel handshake timeout must be a positive integer");
  }
  return timeoutMs;
}

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
      command: COMMAND_CONNECT,
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

  if (!hasExactKeys(payload, ["protocol", "version", "command", "target"])) {
    throw new Error("unsupported edge tunnel request");
  }
  if (payload.protocol !== PROTOCOL || payload.version !== VERSION || payload.command !== COMMAND_CONNECT) {
    throw new Error("unsupported edge tunnel request");
  }
  if (!hasExactKeys(payload.target, ["host", "port", "addressType"])) {
    throw new Error("unsupported edge tunnel request");
  }

  return {
    protocol: PROTOCOL,
    version: VERSION,
    command: COMMAND_CONNECT,
    target: normalizeTarget(payload.target)
  };
}

function hasExactKeys(value, keys) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

export function encodeConnectReply(reply = {}) {
  if (reply.ok === true) {
    return Buffer.from(`${JSON.stringify({ ok: true })}\n`, "utf8");
  }
  if (reply.ok === false && reply.error === REPLY_ERROR_CONNECT_FAILED) {
    return Buffer.from(`${JSON.stringify({ ok: false, error: REPLY_ERROR_CONNECT_FAILED })}\n`, "utf8");
  }
  throw new Error("unsupported edge tunnel reply");
}

export function parseConnectReply(buffer) {
  if (buffer.length > MAX_REQUEST_BYTES) {
    throw new Error("edge tunnel reply too large");
  }

  let reply;
  try {
    reply = JSON.parse(buffer.toString("utf8").trimEnd());
  } catch {
    throw new Error("unsupported edge tunnel reply");
  }

  if (hasExactKeys(reply, ["ok"]) && reply.ok === true) {
    return { ok: true };
  }
  if (hasExactKeys(reply, ["ok", "error"]) && reply.ok === false && reply.error === REPLY_ERROR_CONNECT_FAILED) {
    return { ok: false, error: REPLY_ERROR_CONNECT_FAILED };
  }
  throw new Error("unsupported edge tunnel reply");
}

function readLine(socket, { timeoutMs = DEFAULT_HANDSHAKE_TIMEOUT_MS } = {}) {
  return new Promise((resolve, reject) => {
    let buffer = Buffer.alloc(0);
    const timer = setTimeout(onTimeout, timeoutMs);

    function cleanup() {
      clearTimeout(timer);
      socket.off("data", onData);
      socket.off("error", onError);
      socket.off("end", onEnd);
    }

    function onError(error) {
      cleanup();
      reject(error);
    }

    function onTimeout() {
      cleanup();
      reject(new Error("edge tunnel handshake timed out"));
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
    socket.once("error", onError);
    socket.once("end", onEnd);
  });
}

function writeReply(socket, ok) {
  socket.write(encodeConnectReply(ok ? { ok: true } : { ok: false, error: REPLY_ERROR_CONNECT_FAILED }));
}

function readReply(socket, { timeoutMs = DEFAULT_HANDSHAKE_TIMEOUT_MS } = {}) {
  return readLine(socket, { timeoutMs }).then((line) => {
    try {
      const reply = parseConnectReply(line);
      if (reply.ok !== true) {
        throw new Error("edge tunnel connect failed");
      }
      return reply;
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

export function createEdgeTunnelServer({ openTcp, handshakeTimeoutMs } = {}) {
  if (typeof openTcp !== "function") {
    throw new Error("openTcp is required");
  }
  const normalizedHandshakeTimeoutMs = normalizeHandshakeTimeoutMs(handshakeTimeoutMs);

  return net.createServer(async (socket) => {
    try {
      const request = parseConnectRequest(await readLine(socket, { timeoutMs: normalizedHandshakeTimeoutMs }));
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

export function createEdgeTunnelChannel({ host, port, handshakeTimeoutMs } = {}) {
  const edgeHost = String(host ?? "").trim();
  const edgePort = Number(port);
  const normalizedHandshakeTimeoutMs = normalizeHandshakeTimeoutMs(handshakeTimeoutMs);
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
        await readReply(socket, { timeoutMs: normalizedHandshakeTimeoutMs });

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
