// The only browser credential boundary. Never forward Cookie credentials or private
// lookup IDs to JSON, request headers, query parameters, or browser storage.
const PUBLIC = new Set([
  'POST /api/portal/human-challenges', 'POST /api/portal/password/session',
  'POST /api/portal/password/second-factor', 'POST /api/portal/session',
  'POST /api/portal/registration', 'POST /api/portal/registration/email-verification',
  'POST /api/portal/entry/enroll', 'GET /api/portal/browser-session',
  'POST /api/portal/browser-session/logout',
  'GET /api/portal/public/catalog',
]);
// These paths can start fresh authentication without an existing session.
// Logout is intentionally excluded: it must never treat a malformed credential
// as proof that the server session was revoked.
const COOKIE_RECOVERY = new Set([
  'GET /api/portal/browser-session', 'POST /api/portal/human-challenges',
  'POST /api/portal/password/session', 'POST /api/portal/password/second-factor',
  'POST /api/portal/session', 'POST /api/portal/registration',
  'POST /api/portal/registration/email-verification', 'POST /api/portal/entry/enroll',
]);
const CONTEXT = /^portalctx_[a-f0-9]{64}$/;
const CREDENTIAL = /^[A-Za-z0-9_-]{43}$/;
const PRIVATE = /^(?:portalbrowser_|portalctx_)/;
const LOOPBACK = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);
const COOKIE_NAMES = ['__Host-PortalSession', 'PortalLocalSession'];

function failure(code = 'portal_browser_request_invalid', status = 403) {
  return Object.assign(new Error('Portal browser request rejected'), {code, status});
}
function header(req, key) {
  if (!Array.isArray(req.rawHeaders) || req.rawHeaders.length % 2) throw failure();
  let result;
  for (let i = 0; i < req.rawHeaders.length; i += 2) {
    const [name, value] = req.rawHeaders.slice(i, i + 2);
    if (typeof name !== 'string' || typeof value !== 'string') throw failure();
    if (name.toLowerCase() !== key) continue;
    if (result !== undefined) throw failure();
    result = value;
  }
  return result;
}
function target(req) {
  const raw = String(req.originalUrl || req.url || '');
  // Match Express' case/trailing slash aliases too, but never make an auth
  // exception for an encoded/extra path segment.
  const pathname = raw.split('?', 1)[0].toLowerCase().replace(/\/$/, '');
  return {raw, pathname};
}
function cookies(req) {
  const raw = header(req, 'cookie');
  const result = new Map();
  if (raw === undefined) return result;
  for (const part of raw.split(';')) {
    const index = part.indexOf('=');
    const name = (index < 0 ? part : part.slice(0, index)).trim();
    if (!COOKIE_NAMES.includes(name)) continue;
    if (index < 0 || result.has(name)) throw failure();
    result.set(name, part.slice(index + 1).trim());
  }
  return result;
}
function legacyValues(req) {
  const values = [];
  let legacy;
  try { legacy = header(req, 'x-portal-session'); }
  catch { throw failure('invalid_session', 401); }
  if (legacy !== undefined) values.push(legacy);
  if (req.body && Object.hasOwn(req.body, 'sessionRef')) values.push(req.body.sessionRef);
  const query = target(req).raw.split('?').slice(1).join('?');
  for (const value of new URLSearchParams(query).getAll('sessionRef')) values.push(value);
  return values;
}

export function createPortalBrowserSessionTransport({auth, origin, allowInsecureLoopback = false} = {}) {
  let trusted;
  if (origin) {
    try {
      trusted = new URL(origin);
      if (trusted.origin !== origin || trusted.username || trusted.password
        || (trusted.protocol !== 'https:' && !(allowInsecureLoopback === true
          && trusted.protocol === 'http:' && ['127.0.0.1', '[::1]'].includes(trusted.hostname)))) throw failure();
    } catch { throw new TypeError('Explicit Portal origin must be HTTPS or opted-in loopback HTTP'); }
  }
  const local = trusted?.protocol === 'http:';
  const cookieName = local ? 'PortalLocalSession' : '__Host-PortalSession';
  const suffix = `; Path=/; HttpOnly${local ? '' : '; Secure'}; SameSite=Lax`;
  const requests = new WeakMap();

  function inspect(req) {
    const found = cookies(req);
    const marker = header(req, 'x-portal-request');
    const context = header(req, 'x-portal-session-context');
    const legacy = legacyValues(req);
    if (legacy.some(value => typeof value !== 'string' || PRIVATE.test(value.trim()))) throw failure('invalid_session', 401);
    const browser = marker !== undefined || context !== undefined || found.size > 0;
    if (!browser) return null;
    if (!trusted) throw failure('portal_browser_unavailable', 503);
    if (marker !== 'browser-v1' || legacy.length || found.size > 1
      || (found.size && !found.has(cookieName))) throw failure();
    if (header(req, 'host') !== trusted.host) throw failure();
    if (local && !LOOPBACK.has(req.socket?.remoteAddress)) throw failure();
    const suppliedOrigin = header(req, 'origin');
    const fetchSite = header(req, 'sec-fetch-site');
    if (fetchSite !== undefined && fetchSite !== 'same-origin') throw failure();
    if (suppliedOrigin !== undefined && suppliedOrigin !== trusted.origin) throw failure();
    if (suppliedOrigin === undefined && (!['GET', 'HEAD'].includes(req.method) || fetchSite !== 'same-origin')) throw failure();
    let cookieValue = found.get(cookieName);
    if (cookieValue !== undefined && (!CREDENTIAL.test(cookieValue)
      || Buffer.from(cookieValue, 'base64url').toString('base64url') !== cookieValue)) {
      // All origin/marker/duplicate/conflict checks above still apply. Ignore
      // only this single malformed value; do not clear it on a read or forward
      // it as the previous credential when fresh authentication succeeds.
      if (!COOKIE_RECOVERY.has(`${req.method} ${target(req).pathname}`)) throw failure('invalid_session', 401);
      cookieValue = undefined;
    }
    return {cookieValue, sessionContext:context};
  }
  function requireBrowser(req) {
    const value = inspect(req);
    if (!value) throw failure();
    return value;
  }
  function requireContext(value) {
    if (!CONTEXT.test(value.sessionContext || '')) throw failure('invalid_session', 401);
  }
  function session(req) {
    const input = inspect(req);
    if (!input) return null;
    requireContext(input);
    // Cache only within one request, never by caller-controlled context alone.
    if (!requests.has(req)) requests.set(req, auth.requireBrowserSession(input));
    return requests.get(req);
  }
  function middleware(req, res, next) {
    const {pathname} = target(req);
    if (pathname !== '/api/portal' && !pathname.startsWith('/api/portal/')) return next();
    try {
      const input = inspect(req);
      if (input) {
        res.set('Cache-Control', 'no-store');
        res.set('Referrer-Policy', 'no-referrer');
        if (!PUBLIC.has(`${req.method} ${pathname}`)) session(req);
      }
      next();
    } catch (error) {
      res.set('Cache-Control', 'no-store');
      const status = error.status || (error.code === 'invalid_session' ? 401 : 503);
      const namespace = pathname.startsWith('/api/portal/coins/wallet') ? 'wallet'
        : pathname.startsWith('/api/portal/coins/recharge') ? 'payment_recharge'
        : pathname.startsWith('/api/portal/commerce') || pathname.startsWith('/api/portal/catalog') ? 'commerce' : null;
      if (namespace && status === 401) {
        res.status(status).json({error:{code:`${namespace}_session_invalid`, retryable:false}});
        return;
      }
      res.status(status).json({error:error.status || error.code === 'invalid_session' ? error.code : 'portal_browser_unavailable'});
    }
  }
  function completeLogin(req, res, fresh, rememberMe = false) {
    const input = inspect(req);
    if (!input) return fresh;
    const result = auth.createBrowserSession({sessionRef:fresh.sessionRef, rememberMe,
      previousCookieValue:input.cookieValue});
    const expiry = rememberMe ? `; Expires=${new Date(result.session.expiresAt).toUTCString()}` : '';
    res.set('Cache-Control', 'no-store');
    res.set('Set-Cookie', `${cookieName}=${result.cookieValue}${suffix}${expiry}`);
    return result.session;
  }
  function bootstrap(req, res) {
    const input = requireBrowser(req);
    if (target(req).raw.includes('?')) throw failure();
    let restored = null;
    if (input.cookieValue) {
      try { restored = auth.getBrowserSession(input); }
      catch (error) { if (error.code !== 'invalid_session') throw error; }
    }
    res.set('Cache-Control', 'no-store');
    res.json({session:restored});
  }
  function logout(req, res) {
    const input = requireBrowser(req);
    if (target(req).raw.includes('?') || (req.body && Object.keys(req.body).length)) throw failure();
    requireContext(input);
    // A request without a Cookie needs no Set-Cookie response: a delayed
    // anonymous logout response must not clear a newer authenticated Cookie.
    if (input.cookieValue) {
      auth.revokeBrowserSession(input);
      res.set('Set-Cookie', `${cookieName}=${suffix}; Max-Age=0`);
    }
    res.set('Cache-Control', 'no-store');
    res.json({loggedOut:true});
  }
  return Object.freeze({middleware, session, completeLogin, bootstrap, logout});
}
