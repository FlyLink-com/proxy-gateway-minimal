import net from "node:net";
import { redactedLastFailure, sanitizeDiagnosticsCounters } from "./diagnostics.mjs";

const LOOPBACK_HOSTS = new Set(["127.0.0.1", "::1", "localhost"]);

function normalizePort(value, fieldName = "port") {
  const port = Number(value);
  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    throw new Error(`${fieldName} must be an integer TCP port`);
  }
  return port;
}

export function normalizeSocksAdapterConfig(input = {}) {
  const bindHost = String(input.bindHost ?? "127.0.0.1").trim();
  if (!LOOPBACK_HOSTS.has(bindHost)) {
    throw new Error("bindHost must be loopback-only");
  }

  return {
    bindHost,
    port: normalizePort(input.port ?? 19080)
  };
}

class SocketReader {
  constructor(socket) {
    this.socket = socket;
    this.buffer = Buffer.alloc(0);
    this.waiter = null;

    socket.on("data", (chunk) => {
      this.buffer = Buffer.concat([this.buffer, chunk]);
      this.flush();
    });
    socket.once("end", () => this.fail(new Error("socket ended")));
    socket.once("error", (error) => this.fail(error));
  }

  read(length) {
    if (this.buffer.length >= length) {
      const result = this.buffer.subarray(0, length);
      this.buffer = this.buffer.subarray(length);
      return Promise.resolve(result);
    }

    return new Promise((resolve, reject) => {
      this.waiter = { length, resolve, reject };
    });
  }

  flush() {
    if (!this.waiter || this.buffer.length < this.waiter.length) {
      return;
    }

    const waiter = this.waiter;
    this.waiter = null;
    const result = this.buffer.subarray(0, waiter.length);
    this.buffer = this.buffer.subarray(waiter.length);
    waiter.resolve(result);
  }

  fail(error) {
    if (!this.waiter) {
      return;
    }

    const waiter = this.waiter;
    this.waiter = null;
    waiter.reject(error);
  }

  releaseBuffered() {
    if (this.buffer.length > 0) {
      this.socket.unshift(this.buffer);
      this.buffer = Buffer.alloc(0);
    }
  }
}

function socksReply(code) {
  return Buffer.from([0x05, code, 0x00, 0x01, 0, 0, 0, 0, 0, 0]);
}

function ipv6String(buffer) {
  const groups = [];
  for (let index = 0; index < 16; index += 2) {
    groups.push(buffer.readUInt16BE(index).toString(16));
  }
  return groups.join(":");
}

async function parseTarget(reader, addressType) {
  if (addressType === 0x01) {
    const address = await reader.read(4);
    const port = (await reader.read(2)).readUInt16BE(0);
    return {
      host: [...address].join("."),
      port,
      addressType: "ipv4"
    };
  }

  if (addressType === 0x03) {
    const length = (await reader.read(1))[0];
    const host = (await reader.read(length)).toString("utf8");
    const port = (await reader.read(2)).readUInt16BE(0);
    return { host, port, addressType: "domain" };
  }

  if (addressType === 0x04) {
    const address = await reader.read(16);
    const port = (await reader.read(2)).readUInt16BE(0);
    return {
      host: ipv6String(address),
      port,
      addressType: "ipv6"
    };
  }

  throw new Error("unsupported address type");
}

function waitForConnect(socket) {
  if (!socket.connecting) {
    return Promise.resolve();
  }

  return new Promise((resolve, reject) => {
    socket.once("connect", resolve);
    socket.once("error", reject);
  });
}

export function createSocks5Adapter({ channel } = {}) {
  if (!channel || typeof channel.openTcp !== "function") {
    throw new Error("channel.openTcp is required");
  }

  const counters = {
    connectOk: 0,
    connectFailure: 0,
    unsupportedCommand: 0,
    protocolError: 0
  };
  let lastFailure = null;

  function recordFailure(kind) {
    lastFailure = { class: kind };
  }

  async function handleConnection(socket) {
    const reader = new SocketReader(socket);
    try {
      const header = await reader.read(2);
      const version = header[0];
      const methodCount = header[1];
      const methods = await reader.read(methodCount);

      if (version !== 0x05 || !methods.includes(0x00)) {
        counters.protocolError += 1;
        recordFailure("protocol_error");
        socket.end(Buffer.from([0x05, 0xff]));
        return;
      }

      socket.write(Buffer.from([0x05, 0x00]));

      const requestHeader = await reader.read(4);
      const requestVersion = requestHeader[0];
      const command = requestHeader[1];
      const addressType = requestHeader[3];

      if (requestVersion !== 0x05) {
        counters.protocolError += 1;
        recordFailure("protocol_error");
        socket.end(socksReply(0x01));
        return;
      }

      if (command !== 0x01) {
        counters.unsupportedCommand += 1;
        recordFailure("unsupported_command");
        socket.end(socksReply(0x07));
        return;
      }

      let target;
      try {
        target = await parseTarget(reader, addressType);
      } catch {
        counters.protocolError += 1;
        recordFailure("protocol_error");
        socket.end(socksReply(0x08));
        return;
      }

      try {
        const remote = await channel.openTcp(target);
        await waitForConnect(remote);
        counters.connectOk += 1;
        lastFailure = null;
        socket.write(socksReply(0x00));
        reader.releaseBuffered();
        socket.pipe(remote);
        remote.pipe(socket);
        socket.once("close", () => remote.destroy());
        remote.once("close", () => socket.destroy());
        remote.once("error", () => socket.destroy());
      } catch {
        counters.connectFailure += 1;
        recordFailure("channel_failure");
        socket.end(socksReply(0x05));
      }
    } catch {
      counters.protocolError += 1;
      recordFailure("protocol_error");
      socket.destroy();
    }
  }

  return {
    handleConnection,
    diagnosticsSnapshot() {
      return {
        ok: true,
        adapter: "socks5",
        counters: sanitizeDiagnosticsCounters(counters),
        lastFailure: redactedLastFailure(lastFailure)
      };
    }
  };
}

export function startLocalSocksAdapter({ bindHost, port, channel } = {}) {
  const config = normalizeSocksAdapterConfig({ bindHost, port });
  const adapter = createSocks5Adapter({ channel });
  const server = net.createServer((socket) => {
    void adapter.handleConnection(socket);
  });

  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(config.port, config.bindHost, () => {
      server.off("error", reject);
      resolve({
        server,
        adapter,
        address: server.address(),
        close: () => new Promise((closeResolve) => server.close(closeResolve))
      });
    });
  });
}
