import test from 'node:test';
import assert from 'node:assert/strict';
import { createPortalBrowserSessionTransport } from '../services/platform/portal-browser-session-transport.mjs';

const credential = Buffer.from('a'.repeat(32)).toString('base64url');
const context = `portalctx_${'b'.repeat(64)}`;
const privateId = `portalbrowser_${'c'.repeat(64)}`;
function harness(options = {}) {
  let reads = 0;
  let mutations = 0;
  const conversions = [];
  const session = { sessionRef: context, transport: 'cookie', expiresAt: '2030-01-01T00:30:00.000Z' };
  const auth = {
    requireBrowserSession({cookieValue, sessionContext}) {
      reads++;
      if (cookieValue !== credential || sessionContext !== context) throw Object.assign(new Error(), {code:'invalid_session'});
      return {sessionRef: privateId, accountId:'account_test'};
    },
    getBrowserSession({cookieValue}) {
      if (cookieValue !== credential) throw Object.assign(new Error(), {code:'invalid_session'});
      return session;
    },
    createBrowserSession(input) { mutations++; conversions.push(input); return {cookieValue:credential, session}; },
    revokeBrowserSession(input) { this.requireBrowserSession(input); mutations++; return {loggedOut:true}; }
  };
  const transport = createPortalBrowserSessionTransport({ auth, origin: 'https://portal.test', ...options });
  return {transport, session, reads:()=>reads, mutations:()=>mutations, conversions};
}
function request(headers = {}, method = 'GET', path = '/api/portal/coins/wallet') {
  const all = {host:'portal.test', 'x-portal-request':'browser-v1', origin:'https://portal.test',
    'sec-fetch-site':'same-origin', cookie:`__Host-PortalSession=${credential}`,
    'x-portal-session-context':context, ...headers};
  return {method, originalUrl:path, url:path, headers:all,
    rawHeaders:Object.entries(all).filter(([,v])=>v!==undefined).flat(),
    socket:{remoteAddress:'127.0.0.1'}, body:undefined};
}
function response() {
  return {headers:{}, statusCode:200, set(k,v){this.headers[k.toLowerCase()]=v;return this;},
    status(s){this.statusCode=s;return this;}, json(value){this.body=value;return this;}};
}
function guard(transport, req) {
  const res = response(); let next = false;
  transport.middleware(req,res,()=>{next=true;});
  return {res,next};
}
test('Cookie transport binds public context, does not mutate raw headers, never renews on reads', () => {
  const h = harness(); const req = request(); const before = [...req.rawHeaders];
  const {res,next} = guard(h.transport,req);
  assert.equal(next,true);
  assert.deepEqual(h.transport.session(req), {sessionRef:privateId,accountId:'account_test'});
  assert.deepEqual(req.rawHeaders,before);
  assert.equal(h.mutations(),0);
  assert.equal(res.headers['cache-control'],'no-store');
  assert.equal(res.headers['set-cookie'],undefined);
});
for (const [name,headers] of Object.entries({
  cross_origin:{origin:'https://evil.test'}, same_site:{'sec-fetch-site':'same-site'},
  null_origin:{origin:'null'}, missing_marker:{'x-portal-request':undefined},
  missing_context:{'x-portal-session-context':undefined}, wrong_context:{'x-portal-session-context':`portalctx_${'d'.repeat(64)}`},
  mixed_header:{'x-portal-session':'legacy_session'}, duplicate_cookie:{cookie:`__Host-PortalSession=${credential}; __Host-PortalSession=${credential}`},
  malformed_cookie:{cookie:'__Host-PortalSession=invalid'}, wrong_host:{host:'evil.test'},
})) test(`rejects ${name} before business and never clears a Cookie`, () => {
  const h = harness(); const {res,next}=guard(h.transport,request(headers));
  assert.equal(next,false); assert.ok([400,401,403].includes(res.statusCode));
  assert.equal(res.headers['set-cookie'],undefined); assert.equal(h.mutations(),0);
});
test('missing Origin is accepted only for same-origin Fetch Metadata reads, never writes', () => {
  const h=harness();
  assert.equal(guard(h.transport,request({origin:undefined})).next,true);
  assert.equal(guard(h.transport,request({origin:undefined},'POST')).next,false);
  assert.equal(guard(h.transport,request({origin:undefined,'sec-fetch-site':undefined})).next,false);
});
test('duplicates and legacy browser lookup/context credentials fail closed', () => {
  const h=harness(); const dup=request(); dup.rawHeaders.push('Origin','https://portal.test');
  assert.equal(guard(h.transport,dup).next,false);
  for (const value of [privateId,context]) {
    const req=request({cookie:undefined,'x-portal-request':undefined,'x-portal-session-context':undefined,'x-portal-session':value});
    assert.equal(guard(h.transport,req).next,false);
  }
});
test('late parsed body or query mixed credentials are rejected', () => {
  const h=harness(); const req=request(); req.body={sessionRef:'legacy_session'};
  assert.equal(guard(h.transport,req).next,false);
  assert.equal(guard(h.transport,request({},'GET','/api/portal/security/current?sessionRef=legacy_session')).next,false);
});
test('private lookup cannot use whitespace or array coercion through legacy security routes', () => {
  const h=harness();
  for (const value of [privateId, ` ${privateId} `, [privateId]]) {
    const req=request({cookie:undefined,'x-portal-request':undefined,'x-portal-session-context':undefined});
    req.body={sessionRef:value};
    assert.equal(guard(h.transport,req).next,false);
  }
  const req=request({cookie:undefined,'x-portal-request':undefined,'x-portal-session-context':undefined},'GET',
    `/api/portal/security/current?sessionRef=%20${privateId}`);
  assert.equal(guard(h.transport,req).next,false);
});
test('bootstrap has no context requirement, returns public projection without Set-Cookie', () => {
  const h=harness(); const req=request({'x-portal-session-context':undefined},'GET','/api/portal/browser-session');
  assert.equal(guard(h.transport,req).next,true);
  const res=response(); h.transport.bootstrap(req,res);
  assert.deepEqual(res.body,{session:h.session}); assert.equal(res.headers['set-cookie'],undefined);
  const anonymous=request({cookie:undefined,'x-portal-session-context':undefined},'GET','/api/portal/browser-session');
  const r=response(); h.transport.bootstrap(anonymous,r); assert.deepEqual(r.body,{session:null});
});

const freshAuthPaths = [
  '/api/portal/human-challenges', '/api/portal/password/session',
  '/api/portal/password/second-factor', '/api/portal/session',
  '/api/portal/registration', '/api/portal/registration/email-verification',
  '/api/portal/entry/enroll',
];
for (const malformed of ['invalid', '', 'a'.repeat(43)]) {
  test(`one malformed Cookie (${malformed.length} characters) can recover only through same-origin fresh authentication`, () => {
    const h = harness();
    const headers = {cookie:`__Host-PortalSession=${malformed}`, 'x-portal-session-context':undefined};
    const bootstrap = request(headers, 'GET', '/api/portal/browser-session');
    assert.equal(guard(h.transport, bootstrap).next, true);
    const bootResponse = response(); h.transport.bootstrap(bootstrap, bootResponse);
    assert.deepEqual(bootResponse.body, {session:null});
    assert.equal(bootResponse.headers['set-cookie'], undefined);
    assert.equal(h.reads(), 0); assert.equal(h.mutations(), 0);
    for (const path of freshAuthPaths) {
      const result = guard(h.transport, request(headers, 'POST', path));
      assert.equal(result.next, true, path);
      assert.equal(result.res.headers['set-cookie'], undefined, path);
    }
    const login = request(headers, 'POST', '/api/portal/password/session');
    const loginResponse = response();
    assert.deepEqual(h.transport.completeLogin(login, loginResponse, {sessionRef:'fresh'}), h.session);
    assert.equal(h.conversions.length, 1);
    assert.equal(h.conversions[0].previousCookieValue, undefined);
    assert.match(loginResponse.headers['set-cookie'], /^__Host-PortalSession=/);
    assert.match(loginResponse.headers['set-cookie'], /; HttpOnly; Secure; SameSite=Lax/);
    assert.equal(h.mutations(), 1);
    for (const [method, path] of [
      ['GET', '/api/portal/coins/wallet'], ['POST', '/api/portal/coins/recharge/orders'],
      ['POST', '/api/portal/browser-session/logout'], ['GET', '/api/portal/password/session'],
    ]) {
      const result = guard(h.transport, request({...headers, 'x-portal-session-context':context}, method, path));
      assert.equal(result.next, false, path); assert.equal(result.res.statusCode, 401, path);
      assert.equal(result.res.headers['set-cookie'], undefined, path);
    }
    assert.equal(h.mutations(), 1);
  });
}

test('malformed Cookie recovery never relaxes origin, duplicate, mixed credential or deployment checks', () => {
  for (const [method, path] of [['GET', '/api/portal/browser-session'], ...freshAuthPaths.map(path => ['POST', path])]) {
    for (const extra of [
      {origin:'https://evil.test'}, {origin:'null'}, {'sec-fetch-site':'cross-site'},
      {'x-portal-request':undefined}, {host:'evil.test'},
      {cookie:'__Host-PortalSession=invalid; __Host-PortalSession=invalid'},
      {cookie:'__Host-PortalSession=invalid; PortalLocalSession=invalid'},
      {'x-portal-session':'legacy_session'},
    ]) {
      const h = harness();
      const result = guard(h.transport, request({cookie:'__Host-PortalSession=invalid', ...extra}, method, path));
      assert.equal(result.next, false, `${method} ${path}`);
      assert.equal(result.res.headers['set-cookie'], undefined);
      assert.equal(h.reads(), 0); assert.equal(h.mutations(), 0);
    }
    for (const location of ['query', 'body', 'duplicate-header']) {
      const h = harness();
      const req = request({cookie:'__Host-PortalSession=invalid'}, method, path + (location === 'query' ? '?sessionRef=legacy_session' : ''));
      if (location === 'body') req.body = {sessionRef:'legacy_session'};
      if (location === 'duplicate-header') req.rawHeaders.push('Cookie', '__Host-PortalSession=invalid');
      assert.equal(guard(h.transport, req).next, false, location);
      assert.equal(h.mutations(), 0);
    }
    assert.equal(guard(harness({origin:undefined}).transport,
      request({cookie:'__Host-PortalSession=invalid'}, method, path)).res.statusCode, 503);
  }
});
test('login success publishes HttpOnly host Cookie; remember uses server deadline, JSON has no credential', () => {
  const h=harness();
  const req=request({'x-portal-session-context':undefined},'POST','/api/portal/password/session');
  assert.equal(guard(h.transport,req).next,true);
  const res=response(); const session=h.transport.completeLogin(req,res,{sessionRef:'fresh'},false);
  assert.deepEqual(session,h.session);
  assert.match(res.headers['set-cookie'],/^__Host-PortalSession=/);
  assert.match(res.headers['set-cookie'],/; Path=\/; HttpOnly; Secure; SameSite=Lax/);
  assert.doesNotMatch(res.headers['set-cookie'],/Domain=|Expires=|Max-Age=/);
  const remembered=response(); h.transport.completeLogin(req,remembered,{sessionRef:'fresh'},true);
  assert.match(remembered.headers['set-cookie'],/Expires=Tue, 01 Jan 2030 00:30:00 GMT/);
  assert.equal(JSON.stringify(session).includes(credential),false);
});
test('logout binds context and only explicit successful revoke clears Cookie', () => {
  const h=harness(); const req=request({},'POST','/api/portal/browser-session/logout');
  const res=response(); h.transport.logout(req,res);
  assert.deepEqual(res.body,{loggedOut:true}); assert.match(res.headers['set-cookie'],/Max-Age=0/);
  assert.throws(()=>h.transport.logout(request({'x-portal-session-context':`portalctx_${'d'.repeat(64)}`},'POST','/api/portal/browser-session/logout'),response()));
});
test('unconfigured origin is unavailable and HTTP requires explicit loopback-only option', () => {
  const h=harness({origin:undefined}); assert.equal(guard(h.transport,request()).res.statusCode,503);
  assert.throws(()=>harness({origin:'http://portal.test',allowInsecureLoopback:true}));
  assert.throws(()=>harness({origin:'http://127.0.0.1:5175'}));
  const local=harness({origin:'http://127.0.0.1:5175',allowInsecureLoopback:true});
  const req=request({host:'127.0.0.1:5175',origin:'http://127.0.0.1:5175',cookie:`PortalLocalSession=${credential}`});
  assert.equal(guard(local.transport,req).next,true);
  req.socket.remoteAddress='192.0.2.1'; assert.equal(guard(local.transport,req).next,false);
});
test('provider callbacks and non-Portal requests are left unchanged', () => {
  const h=harness(); const req=request({origin:'https://evil.test'},'POST','/api/platform/payments/chaojipay/callback');
  assert.equal(guard(h.transport,req).next,true); assert.equal(h.reads(),0);
});
