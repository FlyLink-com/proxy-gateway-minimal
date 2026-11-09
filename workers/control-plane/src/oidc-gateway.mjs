// Synthetic-first Auth0 JWT Access Token verifier for the isolated C1 proof routes.
// This module never converts a JWT into an internal account/operator authorization.
const MAX_JWT_BYTES = 8192;
const MAX_JWKS_BYTES = 65536;
const MAX_JWKS_KEYS = 20;
const CACHE_MS = 300000;
const CLOCK_SKEW_S = 60;
const DEFAULT_MAX_LIFETIME_S = 7200;
const caches = new Map();
const inflight = new Map();
const textDecoder = new TextDecoder('utf-8', { fatal: true });
const textEncoder = new TextEncoder();
const configs = {
  portal: { issuer: 'AUTH0_PORTAL_ISSUER', audience: 'AUTH0_PORTAL_AUDIENCE', clients: 'AUTH0_PORTAL_ALLOWED_CLIENT_IDS', scope: 'read:portal_identity' },
  admin: { issuer: 'AUTH0_ADMIN_ISSUER', audience: 'AUTH0_ADMIN_AUDIENCE', clients: 'AUTH0_ADMIN_ALLOWED_CLIENT_IDS', mfa: 'AUTH0_ADMIN_MFA_CLAIM', scope: 'read:admin_identity' },
};

export class Auth0GatewayError extends Error {
  constructor() { super('unauthorized'); this.name = 'Auth0GatewayError'; }
}
function deny() { throw new Auth0GatewayError(); }
function nonblank(v, max = 256) { return typeof v === 'string' && v.length > 0 && v.length <= max && v.trim() === v; }

function safeJson(bytes) {
  // Reject duplicate object member names rather than allowing JSON.parse last-key-wins.
  // The scanner tracks nesting and strings; JSON.parse still validates full JSON grammar.
  const s = textDecoder.decode(bytes);
  let i = 0;
  function ws() { while (/\s/.test(s[i] ?? '')) i++; }
  function str() {
    const start = i++;
    while (i < s.length) {
      if (s[i] === '\\') { i += 2; continue; }
      if (s[i++] === '"') return JSON.parse(s.slice(start, i));
    }
    deny();
  }
  function value() {
    ws();
    if (s[i] === '{') {
      i++; const keys = new Set(); ws();
      if (s[i] === '}') { i++; return; }
      while (i < s.length) {
        ws(); if (s[i] !== '"') deny();
        const key = str(); if (keys.has(key)) deny(); keys.add(key);
        ws(); if (s[i++] !== ':') deny();
        value(); ws();
        const delim = s[i++]; if (delim === '}') return;
        if (delim !== ',') deny();
      }
      deny();
    }
    if (s[i] === '[') {
      i++; ws(); if (s[i] === ']') { i++; return; }
      while (i < s.length) {
        value(); ws(); const delim = s[i++]; if (delim === ']') return;
        if (delim !== ',') deny();
      }
      deny();
    }
    if (s[i] === '"') { str(); return; }
    while (i < s.length && !/[\s,\]}]/.test(s[i])) i++;
  }
  try {
    value(); ws(); if (i !== s.length) deny();
    const parsed = JSON.parse(s);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) deny();
    return parsed;
  } catch { deny(); }
}
function b64url(s, max = MAX_JWT_BYTES) {
  if (typeof s !== 'string' || s.length < 1 || s.length > max || !/^[A-Za-z0-9_-]+$/.test(s)) deny();
  try {
    const b64 = s.replace(/-/g, '+').replace(/_/g, '/');
    const binary = atob(b64);
    const canonical = btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
    if (canonical !== s) deny();
    return Uint8Array.from(binary, c => c.charCodeAt(0));
  } catch { deny(); }
}
function readConfiguration(env, surface) {
  const names = configs[surface]; if (!names || !env) deny();
  const issuer = env[names.issuer];
  const audience = env[names.audience];
  const clientsRaw = env[names.clients];
  if (!nonblank(issuer, 1024) || !nonblank(audience, 512) || !nonblank(clientsRaw, 2048)) deny();
  let url;
  try { url = new URL(issuer); } catch { deny(); }
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || url.pathname !== '/' || url.href !== issuer) deny();
  const clients = clientsRaw.split(',').map(x => x.trim());
  if (!clients.length || clients.some(x => !/^[A-Za-z0-9_-]{3,256}$/.test(x)) || new Set(clients).size !== clients.length) deny();
  // A shared surface identity would make a cross-surface mistake difficult to see.
  const other = surface === 'portal' ? 'admin' : 'portal';
  if (env[configs[other].issuer] === issuer || env[configs[other].audience] === audience) deny();
  const claim = names.mfa ? env[names.mfa] : undefined;
  if (names.mfa && (!nonblank(claim, 512) || !/^https:\/\/[^\s/#?]+\/[^\s]+$/.test(claim))) deny();
  const maxRaw = env.AUTH0_MAX_TOKEN_LIFETIME_SECONDS;
  const maxLifetime = maxRaw === undefined ? DEFAULT_MAX_LIFETIME_S : Number(maxRaw);
  if (!Number.isSafeInteger(maxLifetime) || maxLifetime < 60 || maxLifetime > 86400) deny();
  return { issuer, audience, clients: new Set(clients), scope: names.scope, claim, maxLifetime };
}
function validJwk(jwk) {
  if (!jwk || typeof jwk !== 'object' || Array.isArray(jwk)) deny();
  if (!nonblank(jwk.kid, 128) || !/^[A-Za-z0-9_-]+$/.test(jwk.kid) || jwk.kty !== 'RSA' || jwk.alg !== 'RS256' || jwk.use !== 'sig') deny();
  if (['d','p','q','dp','dq','qi','oth','k'].some(x => x in jwk)) deny();
  if (jwk.key_ops !== undefined && (!Array.isArray(jwk.key_ops) || jwk.key_ops.length !== 1 || jwk.key_ops[0] !== 'verify')) deny();
  const n = b64url(jwk.n, 1500);
  const e = b64url(jwk.e, 12);
  const exponent = e.reduce((number, byte) => number * 256 + byte, 0);
  if (n.length < 256 || n.length > 1024 || e.length < 1 || e.length > 4 || exponent < 3 || (exponent & 1) === 0) deny();
}
async function fetchJwks(issuer, fetcher) {
  const response = await fetcher(`${issuer}.well-known/jwks.json`, { method: 'GET', redirect: 'error', headers: { accept: 'application/json' } });
  if (!response.ok) deny();
  if (Number(response.headers.get('content-length')) > MAX_JWKS_BYTES) deny();
  let bytes;
  if (response.body) {
    const reader = response.body.getReader(); const chunks = []; let count = 0;
    try {
      while (true) {
        const { value, done } = await reader.read(); if (done) break;
        count += value.length; if (count > MAX_JWKS_BYTES) deny(); chunks.push(value);
      }
      bytes = new Uint8Array(count); let p = 0;
      for (const chunk of chunks) { bytes.set(chunk, p); p += chunk.length; }
    } finally { reader.releaseLock(); }
  } else {
    const s = await response.text(); bytes = textEncoder.encode(s);
    if (bytes.length > MAX_JWKS_BYTES) deny();
  }
  const data = safeJson(bytes);
  if (!Array.isArray(data.keys) || !data.keys.length || data.keys.length > MAX_JWKS_KEYS) deny();
  const keys = new Map();
  for (const jwk of data.keys) {
    validJwk(jwk);
    if (keys.has(jwk.kid)) deny();
    keys.set(jwk.kid, { kty:'RSA', n:jwk.n, e:jwk.e, alg:'RS256', ext:true });
  }
  return keys;
}
async function getKeys(issuer, fetcher, force = false) {
  const cached = caches.get(issuer);
  if (!force && cached && cached.expires > Date.now()) return cached.keys;
  if (!inflight.has(issuer)) {
    const refresh = (async () => {
      const keys = await fetchJwks(issuer, fetcher);
      caches.set(issuer, { keys, expires: Date.now() + CACHE_MS });
      return keys;
    })();
    inflight.set(issuer, refresh);
    refresh.finally(() => { if (inflight.get(issuer) === refresh) inflight.delete(issuer); }).catch(() => {});
  }
  return inflight.get(issuer);
}
function jwtFromRequest(request) {
  const header = request.headers.get('authorization');
  if (!header || header.length > MAX_JWT_BYTES + 7) deny();
  const match = /^Bearer ([A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)$/.exec(header);
  if (!match || match[1].length > MAX_JWT_BYTES) deny();
  const [h, p, s] = match[1].split('.');
  const parsedHeader = safeJson(b64url(h));
  if (Object.keys(parsedHeader).some(k => !['alg','kid','typ'].includes(k))) deny();
  if (parsedHeader.alg !== 'RS256' || !nonblank(parsedHeader.kid, 128) || !/^[A-Za-z0-9_-]+$/.test(parsedHeader.kid) || (parsedHeader.typ !== undefined && parsedHeader.typ !== 'JWT')) deny();
  return { header: parsedHeader, claims: safeJson(b64url(p)), signature: b64url(s), signed: textEncoder.encode(`${h}.${p}`) };
}
function verifiedClaims(claims, config, surface, nowSeconds) {
  if (claims.iss !== config.issuer || !nonblank(claims.sub, 512) || !config.clients.has(claims.azp)) deny();
  if (!(claims.aud === config.audience || (Array.isArray(claims.aud) && claims.aud.includes(config.audience)))) deny();
  if (!Number.isSafeInteger(claims.iat) || !Number.isSafeInteger(claims.exp) || (claims.nbf !== undefined && !Number.isSafeInteger(claims.nbf))) deny();
  if (claims.exp <= claims.iat || claims.exp - claims.iat > config.maxLifetime || claims.exp <= nowSeconds - CLOCK_SKEW_S || claims.iat > nowSeconds + CLOCK_SKEW_S || (claims.nbf !== undefined && claims.nbf > nowSeconds + CLOCK_SKEW_S)) deny();
  if (!nonblank(claims.scope, 4096) || !/^[A-Za-z0-9:_-]+(?: [A-Za-z0-9:_-]+)*$/.test(claims.scope)) deny();
  const scopes = [...new Set(claims.scope.split(' '))];
  if (!scopes.includes(config.scope)) deny();
  let factors = [];
  if (surface === 'admin') {
    factors = claims[config.claim];
    if (!Array.isArray(factors) || factors.length > 16 || factors.some(x => typeof x !== 'string') || !factors.includes('mfa')) deny();
  }
  return { surface, issuer: config.issuer, subject: claims.sub, clientId: claims.azp, scopes, authenticationMethods: factors, issuedAt: claims.iat, expiresAt: claims.exp };
}
/** Verify exactly one surface; the caller must select surface from a fixed route. */
export async function verifyAuth0AccessToken(request, env, surface, { fetcher = fetch, nowSeconds = Math.floor(Date.now()/1000) } = {}) {
  try {
    const config = readConfiguration(env, surface);
    const token = jwtFromRequest(request);
    // Cheap claim checks are intentionally preliminary; nothing is trusted until verify succeeds.
    const result = verifiedClaims(token.claims, config, surface, nowSeconds);
    let keys = await getKeys(config.issuer, fetcher);
    let jwk = keys.get(token.header.kid);
    if (!jwk) {
      keys = await getKeys(config.issuer, fetcher, true);
      jwk = keys.get(token.header.kid);
    }
    if (!jwk) deny();
    const key = await crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
    const valid = await crypto.subtle.verify({ name: 'RSASSA-PKCS1-v1_5' }, key, token.signature, token.signed);
    if (!valid) deny();
    return result;
  } catch { deny(); }
}
// A separate, non-D1 proof route. Never grants business-domain permissions.
export async function handleAuth0IdentityProof(request, env, surface, options) {
  if (request.method !== 'GET') {
    return new Response(JSON.stringify({error:{code:'method_not_allowed',message:'method not allowed'}}), {
      status:405, headers:{'content-type':'application/json; charset=utf-8'},
    });
  }
  try {
    const actor = await verifyAuth0AccessToken(request, env, surface, options);
    return new Response(JSON.stringify({actor}), {
      status:200, headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'},
    });
  } catch {
    return new Response(JSON.stringify({error:{code:'unauthorized',message:'a valid access token is required'}}), {
      status:401, headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'},
    });
  }
}

// Testing-only reset to keep isolated fixtures deterministic.
export function resetOidcJwksCacheForTests() { caches.clear(); inflight.clear(); }
