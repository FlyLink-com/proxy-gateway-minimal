// server/index.mjs - Proxy Gateway Console (All-in-One)
// Includes: Console API, Shadowsocks process management, HTTP-to-SOCKS5 proxy, System proxy control

import 'dotenv/config';
import express from 'express';
import { spawn } from 'child_process';
import http from 'http';
import fs from 'fs';
import os from 'os';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { createConnection } from 'net';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { SocksClient } from 'socks';
import { SocksProxyAgent } from 'socks-proxy-agent';
import nodeFetch from 'node-fetch';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const execFileAsync = promisify(execFile);

const CONSOLE_TOKEN = process.env.CONSOLE_TOKEN || crypto.randomUUID();

const app = express();
const CONSOLE_PORT = 4077;
const SOCKS_PORT = 1080;
const HTTP_PROXY_PORT = 18180;
const HOST = '127.0.0.1';

app.use(express.json());

// ========== Auth Middleware (Fix 1) ==========
const PUBLIC_PATHS = ['/api/health', '/proxy.pac'];
app.use((req, res, next) => {
  if (PUBLIC_PATHS.some(p => req.path === p || req.path.startsWith(p + '/'))) return next();
  const auth = req.headers.authorization?.replace('Bearer ', '') || req.query.token;
  if (auth === CONSOLE_TOKEN) return next();
  res.status(401).json({ error: 'Unauthorized' });
});

app.use(express.static(join(__dirname, '../public')));

// Load proxy server config (replace ${SS_PASSWORD} from env)
let proxyConfig = { servers: [], nginx: {} };
try {
  const rawConfig = fs.readFileSync(join(__dirname, '../config/proxy-servers.json'), 'utf8');
  proxyConfig = JSON.parse(rawConfig.replace(/\$\{SS_PASSWORD\}/g, process.env.SS_PASSWORD || ''));
} catch (e) { console.error('Failed to load proxy config:', e.message); }

// Generate temporary ss-local config with password from env (Fix 4: unique temp file, cleanup tracked)
const ssTempFiles = new Set();
function generateSsLocalConfig() {
  const ssPassword = process.env.SS_PASSWORD || '';
  if (!ssPassword) {
    console.warn('[ss-local] Warning: SS_PASSWORD env variable is not set');
  }
  const template = JSON.parse(fs.readFileSync(join(__dirname, '../config/ss-local.json'), 'utf8'));
  template.password = ssPassword;
  const tmpPath = join(os.tmpdir(), `ss-local-${Date.now()}.json`);
  fs.writeFileSync(tmpPath, JSON.stringify(template));
  ssTempFiles.add(tmpPath);
  return tmpPath;
}
function cleanupSsTempFile(tmpPath) {
  try { fs.unlinkSync(tmpPath); } catch {}
  ssTempFiles.delete(tmpPath);
}
// Cleanup on process exit
process.on('exit', () => { for (const f of ssTempFiles) { try { fs.unlinkSync(f); } catch {} } });

// ========== Process Management ==========
let ssProcess = null;
let starting = false; // Fix 2: mutex flag

function killProcess(proc) {
  if (proc && !proc.killed) {
    proc.kill('SIGTERM');
    try { proc.kill('SIGKILL'); } catch {}
  }
}

function isPortListening(port, host = '127.0.0.1') {
  return new Promise(resolve => {
    const s = createConnection({ host, port, timeout: 1000 });
    s.on('connect', () => { s.destroy(); resolve(true); });
    s.on('timeout', () => { s.destroy(); resolve(false); });
    s.on('error', () => resolve(false));
  });
}

// ========== HTTP-to-SOCKS5 Proxy (embedded) ==========
const socksAgent = new SocksProxyAgent(`socks5://127.0.0.1:${SOCKS_PORT}`);

const httpProxyServer = http.createServer(async (req, res) => {
  const targetUrl = req.url;
  if (!targetUrl.startsWith('http')) { res.writeHead(400); res.end('Bad Request'); return; }
  try {
    const proxyRes = await nodeFetch(targetUrl, {
      method: req.method, headers: req.headers,
      body: req.method !== 'GET' && req.method !== 'HEAD' ? req : undefined,
      timeout: 15000, agent: socksAgent,
    });
    const h = {}; proxyRes.headers.forEach((v, k) => { h[k] = v; });
    res.writeHead(proxyRes.status, h);
    proxyRes.body.pipe(res);
  } catch (e) { if (!res.headersSent) res.writeHead(502); res.end('Proxy Error: ' + e.message); }
});

httpProxyServer.on('connect', (req, clientSocket, head) => {
  const [hostname, portStr] = (req.url || '').split(':');
  const port = parseInt(portStr) || 443;
  SocksClient.createConnection({
    proxy: { host: '127.0.0.1', port: SOCKS_PORT, type: 5 },
    destination: { host: hostname, port }, command: 'connect',
  }).then(({ socket }) => {
    clientSocket.write('HTTP/1.1 200 Connection Established\r\n\r\n');
    if (head?.length) socket.write(head);
    socket.pipe(clientSocket); clientSocket.pipe(socket);
    socket.on('error', () => clientSocket.destroy());
    clientSocket.on('error', () => socket.destroy());
  }).catch(e => { clientSocket.end('HTTP/1.1 502 Proxy Error\r\n\r\n' + e.message); });
});

// ========== API Routes ==========

// Start Shadowsocks local client
app.post('/api/ss/start', async (_req, res) => {
  if (ssProcess && !ssProcess.killed) return res.json({ ok: false, msg: 'already running' });
  if (starting) return res.json({ ok: false, msg: 'already starting' }); // Fix 2
  starting = true; // Fix 2
  // Fix 5: check port before starting
  if (await isPortListening(SOCKS_PORT)) {
    starting = false;
    return res.json({ ok: false, msg: `Port ${SOCKS_PORT} already in use by another process` });
  }
  const ssPath = join(__dirname, '../bin/sslocal.exe');
  const configPath = generateSsLocalConfig();
  ssProcess = spawn(ssPath, ['-c', configPath, '-U'], { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
  ssProcess.stdout.on('data', d => console.log('[sslocal]', d.toString().trim()));
  ssProcess.stderr.on('data', d => console.log('[sslocal]', d.toString().trim()));
  const tmpPath = configPath;
  // Fix 4: cleanup temp file after 3s and on process exit
  setTimeout(() => { cleanupSsTempFile(tmpPath); }, 3000);
  ssProcess.on('exit', (code) => { console.log(`[sslocal] exit ${code}`); cleanupSsTempFile(tmpPath); ssProcess = null; starting = false; });
  // Fix 5: verify process stays alive
  await new Promise(r => setTimeout(r, 2000));
  if (!ssProcess || ssProcess.killed) {
    starting = false;
    return res.json({ ok: false, msg: 'ss-local process exited unexpectedly' });
  }
  starting = false; // Fix 2
  res.json({ ok: true, msg: 'ss-local starting...', pid: ssProcess.pid });
});

app.post('/api/ss/stop', (_req, res) => { killProcess(ssProcess); ssProcess = null; res.json({ ok: true }); });

// HTTP Proxy standalone start/stop (for UI granular control)
app.post('/api/http-proxy/start', async (_req, res) => {
  if (starting) return res.json({ ok: false, msg: 'already starting' }); // Fix 2
  starting = true; // Fix 2: mutex for consistency
  if (!(await isPortListening(HTTP_PROXY_PORT))) {
    httpProxyServer.listen(HTTP_PROXY_PORT, HOST, () => console.log(`[http-proxy] listening :${HTTP_PROXY_PORT}`));
    starting = false;
    res.json({ ok: true, msg: 'http-proxy starting...' });
  } else {
    starting = false;
    res.json({ ok: false, msg: 'already running' });
  }
});

app.post('/api/http-proxy/stop', (_req, res) => {
  httpProxyServer.close(() => console.log('[http-proxy] stopped'));
  res.json({ ok: true });
});

app.post('/api/proxy/start', async (_req, res) => {
  if (starting) return res.json({ ok: false, msg: 'already starting' }); // Fix 2
  starting = true; // Fix 2
  // Start ss-local
  if (!ssProcess || ssProcess.killed) {
    // Fix 5: check port before starting
    if (await isPortListening(SOCKS_PORT)) {
      starting = false;
      return res.json({ ok: false, msg: `Port ${SOCKS_PORT} already in use by another process` });
    }
    const ssPath = join(__dirname, '../bin/sslocal.exe');
    const configPath = generateSsLocalConfig();
    ssProcess = spawn(ssPath, ['-c', configPath, '-U'], { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
    ssProcess.stdout.on('data', d => console.log('[sslocal]', d.toString().trim()));
    ssProcess.stderr.on('data', d => console.log('[sslocal]', d.toString().trim()));
    const tmpPath = configPath;
    // Fix 4: cleanup temp file after 3s and on process exit
    setTimeout(() => { cleanupSsTempFile(tmpPath); }, 3000);
    ssProcess.on('exit', (c) => { console.log(`[sslocal] exit ${c}`); cleanupSsTempFile(tmpPath); ssProcess = null; starting = false; });
  }
  // Start HTTP proxy if not listening
  if (!(await isPortListening(HTTP_PROXY_PORT))) {
    httpProxyServer.listen(HTTP_PROXY_PORT, HOST, () => console.log(`[http-proxy] listening :${HTTP_PROXY_PORT}`));
  }
  await new Promise(r => setTimeout(r, 2000));
  // Fix 5: verify ss process survived
  if (!ssProcess || ssProcess.killed) {
    starting = false;
    return res.json({ ok: false, msg: 'ss-local process exited unexpectedly', socks5: false, http: await isPortListening(HTTP_PROXY_PORT) });
  }
  starting = false; // Fix 2
  res.json({ socks5: await isPortListening(SOCKS_PORT), http: await isPortListening(HTTP_PROXY_PORT), ok: true });
});

app.post('/api/proxy/stop', (_req, res) => {
  killProcess(ssProcess); ssProcess = null;
  try { httpProxyServer.close(() => console.log('[http-proxy] stopped')); } catch {}
  res.json({ ok: true });
});

app.get('/api/proxy/overview', async (_req, res) => {
  res.json({
    consolePort: { port: CONSOLE_PORT, ok: true, desc: 'Console' },
    socks5: { port: SOCKS_PORT, ok: await isPortListening(SOCKS_PORT), desc: 'SOCKS5' },
    httpProxy: { port: HTTP_PROXY_PORT, ok: await isPortListening(HTTP_PROXY_PORT), desc: 'HTTP Proxy' },
    ssRunning: ssProcess ? !ssProcess.killed : false,
  });
});

app.post('/api/system-proxy/:action', async (req, res) => {
  try {
    const { stdout } = await execFileAsync('powershell', ['-ExecutionPolicy', 'Bypass', '-File', join(__dirname, '../scripts/proxy.ps1'), req.params.action], { timeout: 10000 });
    res.json({ ok: true, output: stdout.trim() });
  } catch (e) { res.json({ ok: false, error: e.message }); }
});

// ===== Environment Variable Proxy =====
app.post('/api/env-proxy/on', async (_req, res) => {
  try {
    await execFileAsync('powershell', [
      '-ExecutionPolicy', 'Bypass', '-Command',
      "[Environment]::SetEnvironmentVariable('HTTP_PROXY','http://127.0.0.1:18180','User');[Environment]::SetEnvironmentVariable('HTTPS_PROXY','http://127.0.0.1:18180','User');[Environment]::SetEnvironmentVariable('ALL_PROXY','socks5://127.0.0.1:1080','User');[Environment]::SetEnvironmentVariable('NO_PROXY','localhost,127.0.0.1,10.*,172.16.*,172.17.*,172.18.*,172.19.*,172.2*,172.3*,192.168.*,*.local','User')"
    ], { timeout: 10000 });
    res.json({ ok: true, msg: 'Environment proxy variables set' });
  } catch (e) { res.json({ ok: false, error: e.message }); }
});

app.post('/api/env-proxy/off', async (_req, res) => {
  try {
    await execFileAsync('powershell', [
      '-ExecutionPolicy', 'Bypass', '-Command',
      "[Environment]::SetEnvironmentVariable('HTTP_PROXY',$null,'User');[Environment]::SetEnvironmentVariable('HTTPS_PROXY',$null,'User');[Environment]::SetEnvironmentVariable('ALL_PROXY',$null,'User');[Environment]::SetEnvironmentVariable('NO_PROXY',$null,'User')"
    ], { timeout: 10000 });
    res.json({ ok: true, msg: 'Environment proxy variables cleared' });
  } catch (e) { res.json({ ok: false, error: e.message }); }
});

app.get('/api/env-proxy/status', (_req, res) => {
  execFile('powershell', [
    '-ExecutionPolicy', 'Bypass', '-Command',
    "$h=[Environment]::GetEnvironmentVariable('HTTP_PROXY','User');$s=[Environment]::GetEnvironmentVariable('HTTPS_PROXY','User');$a=[Environment]::GetEnvironmentVariable('ALL_PROXY','User');Write-Output \"HTTP_PROXY=$h\";Write-Output \"HTTPS_PROXY=$s\";Write-Output \"ALL_PROXY=$a\""
  ], (err, stdout) => {
    if (err) return res.json({ ok: false, error: err.message });
    const lines = (stdout || '').trim().split('\n');
    const env = {};
    lines.forEach(l => { const [k, ...v] = l.split('='); env[k.trim()] = v.join('=').trim(); });
    res.json({ ok: true, enabled: !!env.HTTP_PROXY, vars: env });
  });
});

// ===== Auto Start (Windows Scheduled Task) =====
app.post('/api/autostart/on', async (_req, res) => {
  try {
    const nodePath = process.execPath;
    const scriptPath = join(__dirname, 'index.mjs');
    await execFileAsync('schtasks', [
      '/Create', '/SC', 'ONLOGON', '/TN', 'ProxyGatewayConsole',
      '/TR', `"${nodePath}" "${scriptPath}"`,
      '/RL', 'LIMITED', '/F'
    ], { timeout: 10000 });
    res.json({ ok: true, msg: 'Auto-start task created' });
  } catch (e) { res.json({ ok: false, error: e.message }); }
});

app.post('/api/autostart/off', async (_req, res) => {
  try {
    await execFileAsync('schtasks', ['/Delete', '/TN', 'ProxyGatewayConsole', '/F'], { timeout: 10000 });
    res.json({ ok: true, msg: 'Auto-start task removed' });
  } catch (e) { res.json({ ok: false, error: e.message }); }
});

app.get('/api/autostart/status', async (_req, res) => {
  try {
    await execFileAsync('schtasks', ['/Query', '/TN', 'ProxyGatewayConsole'], { timeout: 5000 });
    res.json({ ok: true, enabled: true });
  } catch {
    res.json({ ok: true, enabled: false });
  }
});

// Network diagnostics
app.get('/api/health', (_req, res) => res.json({ ok: true, ts: Date.now(), authRequired: true }));
app.get('/api/proxy/servers', (_req, res) => {
  res.json({ servers: proxyConfig.servers.map(s => ({ name: s.name, host: s.host, port: s.port, method: s.method, type: s.type, note: s.note })), pingHosts: proxyConfig.pingHosts || [] });
});

function checkTcpNode(host, port, timeoutMs = 5000) {
  return new Promise(resolve => {
    let done = false;
    const finish = (ok, info) => { if (done) return; done = true; try { s.destroy(); } catch {} resolve({ ok, host, port, info, ts: Date.now() }); };
    const s = createConnection({ host, port, timeout: timeoutMs });
    s.on('connect', () => finish(true, 'connected'));
    s.on('timeout', () => finish(false, 'timeout'));
    s.on('error', e => finish(false, e.message));
  });
}

app.get('/api/proxy/status', async (_req, res) => {
  const results = await Promise.all(proxyConfig.servers.map(async s => ({ name: s.name, host: s.host, port: s.port, type: s.type, ...await checkTcpNode(s.host, s.port) })));
  res.json({ results, ts: Date.now() });
});

app.get('/api/nginx/status', async (_req, res) => {
  const host = proxyConfig.nginx?.host || '47.251.178.125';
  const results = await Promise.all((proxyConfig.nginx?.ports || [80, 443, 8888, 5202, 8099]).map(async p => ({ port: p, ...await checkTcpNode(host, p) })));
  res.json({ host, results, ts: Date.now() });
});

app.get('/api/ping/:host', async (req, res) => {
  // Fix 3: SSRF whitelist (servers + nginx host + pingHosts)
  const allowedHosts = [...new Set([
    ...proxyConfig.servers.map(s => s.host),
    proxyConfig.nginx?.host,
    ...(proxyConfig.pingHosts || [])
  ])].filter(Boolean);
  if (!allowedHosts.includes(req.params.host)) {
    return res.status(403).json({ error: 'Host not allowed' });
  }
  const r = await new Promise(resolve => {
    execFile('ping', ['-n', '3', req.params.host], { timeout: 15000 }, (err, stdout) => {
      const o = stdout || '';
      resolve({ host: req.params.host, reachable: !err && o.includes('Received ='), avgMs: (o.match(/Average = (\d+)ms/i) || [])[1] ? parseInt(o.match(/Average = (\d+)ms/i)[1]) : null });
    });
  });
  res.json(r);
});

app.get('/api/proxy/test', async (_req, res) => {
  try {
    const testAgent = new SocksProxyAgent(`socks5://127.0.0.1:${SOCKS_PORT}`);
    const resp = await nodeFetch('https://httpbin.org/ip', { agent: testAgent, timeout: 10000 });
    const data = await resp.json();
    res.json({ ok: true, origin: data.origin });
  } catch (e) { res.json({ ok: false, error: e.message }); }
});

// Start console
app.listen(CONSOLE_PORT, HOST, () => {
  // Auto-start HTTP proxy so VSCode/CLI tools can use it immediately
  httpProxyServer.listen(HTTP_PROXY_PORT, HOST, () => {
    console.log(`Proxy Gateway Console`);
    console.log(`  Console:   http://${HOST}:${CONSOLE_PORT}/`);
    console.log(`  SOCKS5:    127.0.0.1:${SOCKS_PORT} (when ss-local running)`);
    console.log(`  HTTP Proxy: 127.0.0.1:${HTTP_PROXY_PORT} ✓ auto-started`);
    console.log(`  Console Token: ${CONSOLE_TOKEN}`);
  });
});
