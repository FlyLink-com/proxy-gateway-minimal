export function createHttpProxyService({
  server,
  port = 18180,
  host = "127.0.0.1",
  isPortListeningFn,
  logger = console
}) {
  let starting = false;
  let running = false;

  async function start() {
    if (starting) {
      return { ok: false, msg: "already starting" };
    }
    if (running || await isPortListeningFn(port, host)) {
      running = true;
      return { ok: false, msg: "already running" };
    }

    starting = true;
    try {
      await new Promise((resolve, reject) => {
        server.once?.("error", reject);
        server.listen(port, host, () => {
          logger.log(`[http-proxy] listening :${port}`);
          resolve();
        });
      });
      running = true;
      return { ok: true, msg: "http-proxy starting..." };
    } finally {
      starting = false;
    }
  }

  async function stop() {
    if (!running) {
      return { ok: true };
    }

    await new Promise((resolve) => {
      server.close(() => {
        logger.log("[http-proxy] stopped");
        resolve();
      });
    });
    running = false;
    return { ok: true };
  }

  function status() {
    return { running, starting, port, host };
  }

  return { start, stop, status };
}
