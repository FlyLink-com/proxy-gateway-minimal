import net from "node:net";

const SUPPORTED_TYPES = new Set(["disabled", "direct-tcp"]);

export function normalizeChannelProfile(input = {}) {
  const type = String(input.type ?? "disabled").trim();
  if (!SUPPORTED_TYPES.has(type)) {
    throw new Error(`unsupported channel profile type: ${type}`);
  }

  if (type === "disabled") {
    return { type };
  }

  return {
    type,
    allowDirectTcp: Boolean(input.allowDirectTcp)
  };
}

function createCounters() {
  return {
    connectOk: 0,
    connectFailure: 0
  };
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

export function createChannelFromProfile(input = {}) {
  const profile = normalizeChannelProfile(input);
  const counters = createCounters();
  let lastFailure = null;

  if (profile.type === "disabled") {
    return {
      async openTcp() {
        counters.connectFailure += 1;
        lastFailure = { class: "channel_disabled" };
        throw new Error("channel disabled");
      },
      diagnosticsSnapshot() {
        return {
          ok: true,
          profile,
          counters: { ...counters },
          lastFailure
        };
      }
    };
  }

  if (!profile.allowDirectTcp) {
    throw new Error("direct-tcp requires allowDirectTcp for local development");
  }

  return {
    async openTcp(target) {
      const socket = net.connect({ host: target.host, port: target.port });
      try {
        await waitForConnect(socket);
        counters.connectOk += 1;
        lastFailure = null;
        return socket;
      } catch {
        socket.destroy();
        counters.connectFailure += 1;
        lastFailure = { class: "connect_failed" };
        throw new Error("direct-tcp connect failed");
      }
    },
    diagnosticsSnapshot() {
      return {
        ok: true,
        profile: {
          type: "direct-tcp",
          developmentOnly: true
        },
        counters: { ...counters },
        lastFailure
      };
    }
  };
}
