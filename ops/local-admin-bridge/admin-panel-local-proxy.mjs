import crypto from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";

const port = Number(process.env.ADMIN_PANEL_PROXY_PORT || "5177");
const targetBase = new URL(process.env.ADMIN_API_TARGET || "http://127.0.0.1:5176");
const distDir = process.env.ADMIN_PANEL_DIST || path.resolve("admin", "dist");
const consoleToken = (process.env.CONSOLE_TOKEN || "").trim();
const bootstrapToken = process.env.LOCAL_ADMIN_PROXY_BOOTSTRAP_TOKEN || "";
const sessionSecret = process.env.LOCAL_ADMIN_PROXY_SESSION_SECRET || "";
const sessionKey = "proxy-gateway-admin-session";
const placeholderToken = "local-loopback-proxy";
const localCookieName = "gcc_local_admin_session";
const localSessionTtlMs = 8 * 60 * 60 * 1000;
let bootstrapUsed = false;

if (!consoleToken.trim()) {
  console.error("CONSOLE_TOKEN is required in this process environment.");
  process.exit(1);
}
if (!bootstrapToken.trim() || !sessionSecret.trim()) {
  console.error("LOCAL_ADMIN_PROXY_BOOTSTRAP_TOKEN and LOCAL_ADMIN_PROXY_SESSION_SECRET are required.");
  process.exit(1);
}

const mimeTypes = new Map([
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".css", "text/css; charset=utf-8"],
  [".svg", "image/svg+xml"],
  [".png", "image/png"],
  [".ico", "image/x-icon"],
  [".json", "application/json; charset=utf-8"]
]);

function send(res, status, body, contentType = "text/plain; charset=utf-8", extraHeaders = {}) {
  res.writeHead(status, {
    "content-type": contentType,
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
    "referrer-policy": "no-referrer",
    ...extraHeaders
  });
  res.end(body);
}

function timingSafeEqualString(left, right) {
  const leftBuffer = Buffer.from(String(left));
  const rightBuffer = Buffer.from(String(right));
  return leftBuffer.length === rightBuffer.length && crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function signSession(expiresAt) {
  return crypto.createHmac("sha256", sessionSecret).update(String(expiresAt)).digest("hex");
}

function createSessionCookie() {
  const expiresAt = Date.now() + localSessionTtlMs;
  const value = `${expiresAt}.${signSession(expiresAt)}`;
  return `${localCookieName}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${Math.floor(
    localSessionTtlMs / 1000
  )}`;
}

function clearSessionCookie() {
  return `${localCookieName}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0`;
}

function parseCookies(req) {
  const raw = req.headers.cookie || "";
  const cookies = new Map();
  for (const item of raw.split(";")) {
    const [name, ...rest] = item.trim().split("=");
    if (!name) continue;
    cookies.set(name, decodeURIComponent(rest.join("=") || ""));
  }
  return cookies;
}

function hasLocalSession(req) {
  const value = parseCookies(req).get(localCookieName);
  if (!value) return false;
  const [expiresRaw, signature] = value.split(".");
  const expiresAt = Number(expiresRaw);
  if (!Number.isSafeInteger(expiresAt) || expiresAt < Date.now() || !signature) {
    return false;
  }
  return timingSafeEqualString(signature, signSession(expiresAt));
}

function serveLocked(res) {
  const html = `<!doctype html>
<html lang="zh-CN">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Admin Locked</title>
<style>body{font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;margin:0;min-height:100vh;display:grid;place-items:center;background:#f7f8fb;color:#111827}.box{width:min(520px,calc(100vw - 48px));border:1px solid #d8dee8;border-radius:12px;background:white;padding:32px;box-shadow:0 24px 80px rgba(15,23,42,.12)}h1{font-size:28px;margin:0 0 12px}p{color:#667085;line-height:1.6}.code{font-family:ui-monospace,SFMono-Regular,Consolas,monospace;color:#111827}</style></head>
<body><main class="box"><h1>管理面板已锁定</h1><p>请通过 <span class="code">start-admin-panel-local-proxy.ps1</span> 启动本地管理面板。启动脚本会创建一次性本地会话，不会把云端 Console Token 暴露给浏览器。</p></main></body>
</html>`;
  send(res, 401, html, "text/html; charset=utf-8");
}

function safeStaticPath(urlPath) {
  const normalizedPath = decodeURIComponent(urlPath.split("?")[0] || "/");
  const relative = normalizedPath === "/" ? "index.html" : normalizedPath.replace(/^\/+/, "");
  const fullPath = path.resolve(distDir, relative);
  const root = path.resolve(distDir);
  if (fullPath !== root && !fullPath.startsWith(root + path.sep)) {
    return null;
  }
  return fullPath;
}

function indexHtml() {
  const htmlPath = path.resolve(distDir, "index.html");
  let html = fs.readFileSync(htmlPath, "utf8");
  const bootstrap = `<script>
try {
  sessionStorage.setItem(${JSON.stringify(sessionKey)}, JSON.stringify({
    baseUrl: "",
    consoleToken: ${JSON.stringify(placeholderToken)}
  }));
} catch (_) {}
</script>`;
  return html.replace("</head>", `${bootstrap}</head>`);
}

function serveStatic(req, res) {
  if (!hasLocalSession(req)) {
    serveLocked(res);
    return;
  }
  const fullPath = safeStaticPath(req.url || "/");
  if (!fullPath) {
    send(res, 400, "Bad request");
    return;
  }

  if (path.basename(fullPath) === "index.html" || !fs.existsSync(fullPath)) {
    send(res, 200, indexHtml(), "text/html; charset=utf-8");
    return;
  }

  const stat = fs.statSync(fullPath);
  if (!stat.isFile()) {
    send(res, 404, "Not found");
    return;
  }
  const ext = path.extname(fullPath).toLowerCase();
  res.writeHead(200, {
    "content-type": mimeTypes.get(ext) || "application/octet-stream",
    "cache-control": "no-store"
  });
  fs.createReadStream(fullPath).pipe(res);
}

function proxyApi(req, res) {
  if (!hasLocalSession(req)) {
    send(res, 401, JSON.stringify({ error: "local_admin_session_required" }), "application/json; charset=utf-8");
    req.resume();
    return;
  }
  const upstreamUrl = new URL(req.url || "/", targetBase);
  const headers = { ...req.headers, host: targetBase.host, authorization: `Bearer ${consoleToken}` };

  const upstream = http.request(upstreamUrl, { method: req.method, headers }, (upstreamRes) => {
    const responseHeaders = { ...upstreamRes.headers };
    delete responseHeaders["set-cookie"];
    res.writeHead(upstreamRes.statusCode || 502, responseHeaders);
    upstreamRes.pipe(res);
  });

  upstream.on("error", (error) => {
    send(res, 502, `Local admin proxy failed: ${error.message}`);
  });

  req.pipe(upstream);
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url || "/", `http://127.0.0.1:${port}`);
  if (url.pathname === "/__local-admin/bootstrap") {
    const token = url.searchParams.get("token") || "";
    if (bootstrapUsed || !timingSafeEqualString(token, bootstrapToken)) {
      send(res, 401, "Unauthorized");
      return;
    }
    bootstrapUsed = true;
    send(res, 302, "Found", "text/plain; charset=utf-8", {
      "set-cookie": createSessionCookie(),
      location: "/"
    });
    return;
  }
  if (url.pathname === "/__local-admin/logout") {
    send(res, 302, "Found", "text/plain; charset=utf-8", {
      "set-cookie": clearSessionCookie(),
      location: "/"
    });
    return;
  }
  if (url.pathname === "/__local-admin/status") {
    const authenticated = hasLocalSession(req);
    send(res, authenticated ? 200 : 401, JSON.stringify({ authenticated }), "application/json; charset=utf-8");
    return;
  }
  if ((req.url || "").startsWith("/api/")) {
    proxyApi(req, res);
    return;
  }
  serveStatic(req, res);
});

server.listen(port, "127.0.0.1", () => {
  console.log(`Admin panel local proxy: http://127.0.0.1:${port}/`);
  console.log(`Admin API target: ${targetBase.origin}`);
  console.log("Console token source: process environment only");
  console.log("Local admin auth: bootstrap session required");
});
