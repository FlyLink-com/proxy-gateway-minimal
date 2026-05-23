import http from "node:http";
import { SocksClient } from "socks";
import { SocksProxyAgent } from "socks-proxy-agent";
import nodeFetch from "node-fetch";

function isValidProxyTarget(targetUrl) {
  try {
    const parsed = new URL(targetUrl);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

export function createBridgeServer({
  socksPort,
  fetchFn = nodeFetch,
  SocksProxyAgentClass = SocksProxyAgent,
  socksClient = SocksClient,
  timeoutMs = 15000
}) {
  const socksAgent = new SocksProxyAgentClass(`socks5://127.0.0.1:${socksPort}`);
  const server = http.createServer(async (req, res) => {
    const targetUrl = req.url || "";
    if (!isValidProxyTarget(targetUrl)) {
      res.writeHead(400);
      res.end("Bad Request");
      return;
    }

    try {
      const proxyRes = await fetchFn(targetUrl, {
        method: req.method,
        headers: req.headers,
        body: req.method !== "GET" && req.method !== "HEAD" ? req : undefined,
        timeout: timeoutMs,
        agent: socksAgent
      });
      const headers = {};
      proxyRes.headers.forEach((value, key) => {
        headers[key] = value;
      });
      res.writeHead(proxyRes.status, headers);
      if (!proxyRes.body) {
        res.end();
        return;
      }
      const upstreamBody = proxyRes.body;
      res.on("close", () => {
        if (!res.writableEnded) {
          upstreamBody.destroy?.();
        }
      });
      upstreamBody.on("error", (error) => {
        if (!res.headersSent) {
          res.writeHead(502);
          res.end(`Proxy Error: ${error.message}`);
          return;
        }
        res.destroy(error);
      });
      upstreamBody.pipe(res);
    } catch (error) {
      if (!res.headersSent) {
        res.writeHead(502);
      }
      res.end(`Proxy Error: ${error.message}`);
    }
  });

  server.on("connect", (req, clientSocket, head) => {
    const [hostname, portText] = (req.url || "").split(":");
    const port = Number.parseInt(portText, 10) || 443;
    socksClient.createConnection({
      proxy: { host: "127.0.0.1", port: socksPort, type: 5 },
      destination: { host: hostname, port },
      command: "connect"
    }).then(({ socket }) => {
      clientSocket.write("HTTP/1.1 200 Connection Established\r\n\r\n");
      if (head?.length) {
        socket.write(head);
      }
      socket.pipe(clientSocket);
      clientSocket.pipe(socket);
      socket.on("error", () => {
        socket.destroy();
        clientSocket.destroy();
      });
      clientSocket.on("error", () => {
        clientSocket.destroy();
        socket.destroy();
      });
    }).catch((error) => {
      clientSocket.end(`HTTP/1.1 502 Proxy Error\r\n\r\n${error.message}`);
    });
  });

  return server;
}
