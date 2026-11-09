import test from 'node:test';
import assert from 'node:assert/strict';
import { createSign, generateKeyPairSync, webcrypto } from 'node:crypto';
import { verifyAuth0AccessToken, resetOidcJwksCacheForTests, handleAuth0IdentityProof } from './oidc-gateway.mjs';
globalThis.crypto ??= webcrypto;

const now = 1794200000;
const P = { iss:'https://portal.example.test/', aud:'https://api.portal.example.test/', azp:'portalClient123', sub:'auth0|portal1', scope:'read:portal_identity', iat:now-60, exp:now+3600 };
const A = { iss:'https://admin.example.test/', aud:'https://api.admin.example.test/', azp:'adminClient123', sub:'auth0|admin1', scope:'read:admin_identity', iat:now-60, exp:now+3600, 'https://flylink.example.test/amr':['pwd','mfa','otp'] };
const env = {AUTH0_PORTAL_ISSUER:P.iss,AUTH0_PORTAL_AUDIENCE:P.aud,AUTH0_PORTAL_ALLOWED_CLIENT_IDS:'portalClient123', AUTH0_ADMIN_ISSUER:A.iss,AUTH0_ADMIN_AUDIENCE:A.aud,AUTH0_ADMIN_ALLOWED_CLIENT_IDS:'adminClient123',AUTH0_ADMIN_MFA_CLAIM:'https://flylink.example.test/amr'};
const b64 = x => Buffer.from(typeof x==='string'?x:JSON.stringify(x)).toString('base64url');
function makeKeys(kid='k1') { const {privateKey,publicKey}=generateKeyPairSync('rsa',{modulusLength:2048}); return {kid, privateKey, jwk:{...publicKey.export({format:'jwk'}),kid,kty:'RSA',use:'sig',alg:'RS256'}}; }
const portal = makeKeys('portal-key');
const admin = makeKeys('admin-key');
function token(key, claims, hdr={}) {const h=b64({alg:'RS256',kid:key.kid,typ:'JWT',...hdr});const p=b64(claims);const sign=createSign('RSA-SHA256');sign.update(`${h}.${p}`);return `${h}.${p}.${sign.sign(key.privateKey).toString('base64url')}`;}
function request(jwt){return new Request('https://worker.test/v1/auth/portal/identity',{headers:jwt?{authorization:`Bearer ${jwt}`}:{}})}
function fixtureFetch(jwksPortal=[portal.jwk],jwksAdmin=[admin.jwk],metrics){return async (url) => { metrics?.push(url);const keys=url.startsWith(P.iss)?jwksPortal:jwksAdmin;return new Response(JSON.stringify({keys}),{headers:{'content-type':'application/json'}})}}
async function verify(surface, jwt, {config=env,fetcher=fixtureFetch(),clock=now}={}) {return verifyAuth0AccessToken(request(jwt), config, surface, {fetcher,nowSeconds:clock});}
async function rejected(p, label){await assert.rejects(p,e=>{assert.equal(e.message,'unauthorized',label);assert.ok(!JSON.stringify(e).includes('auth0|'));return true},label);}

test('accepts scoped Portal/Admin signed access tokens and isolates surfaces',async()=>{
  resetOidcJwksCacheForTests();const fp=fixtureFetch();
  const pc=await verify('portal',token(portal,P),{fetcher:fp});
  assert.equal(pc.subject,'auth0|portal1');assert.equal(pc.surface,'portal');assert.deepEqual(pc.authenticationMethods,[]);
  const ac=await verify('admin',token(admin,A),{fetcher:fp});
  assert.deepEqual(ac.authenticationMethods,['pwd','mfa','otp']);
  await rejected(verify('admin',token(portal,P),{fetcher:fp}));
  await rejected(verify('portal',token(admin,A),{fetcher:fp}));
  await rejected(verify('admin',token(portal,{...A,iss:P.iss}),{fetcher:fp}));
});

test('denies ID token, opaque, wrong issuer, audience, azp, scope, malformed header and claim',async()=>{
  resetOidcJwksCacheForTests(); const f=fixtureFetch();
  const cases=[
    token(portal,{...P,aud:P.azp}),token(portal,{...P,iss:A.iss}),token(portal,{...P,aud:A.aud}),
    token(portal,{...P,azp:'unapproved'}), token(portal,{...P,scope:'read:accounts'}),
    token(portal,{...P,exp:now-500}),token(portal,{...P,iat:now+500}),token(portal,{...P,nbf:now+500}),
    token(portal,{...P,iat:'abc'}),token(portal,{...P,exp:now+999999}),
    token(portal,P,{alg:'HS256'}),token(portal,P,{alg:'none'}),token(portal,P,{kid:''}),
    token(portal,P,{jku:'https://evil.example.test/keys'}),token(portal,P,{crit:['x']}),token(portal,P,{typ:'at+jwt'}),
    token({...portal,kid:'unknown'},P),
    'opaque', 'a.b.c', 'x'.repeat(9000),
  ];
  for(const [i,x] of cases.entries())await rejected(verify('portal',x,{fetcher:f}),`case ${i}`);
  await rejected(verify('portal',null,{fetcher:f}));
  const good=token(portal,P);await rejected(verify('portal',good.slice(0,-2)+'aa',{fetcher:f}));
});

test('denies Admin without completed MFA claim; Portal has no MFA requirement',async()=>{
  resetOidcJwksCacheForTests();const f=fixtureFetch();
  const {['https://flylink.example.test/amr']:removed,...noMfa}=A;
  await rejected(verify('admin',token(admin,noMfa),{fetcher:f}));
  for(const bad of ['mfa',['pwd'],{},[],['MFA']])await rejected(verify('admin',token(admin,{...A,'https://flylink.example.test/amr':bad}),{fetcher:f}));
  assert.equal((await verify('portal',token(portal,P),{fetcher:f})).surface,'portal');
});

test('refuses missing/malformed config and identical surface configuration',async()=>{
  resetOidcJwksCacheForTests();
  const t=token(portal,P);for(const config of [
    {...env,AUTH0_PORTAL_ISSUER:'http://portal.example.test/'},
    {...env,AUTH0_PORTAL_ISSUER:P.iss+'bad'},
    {...env,AUTH0_PORTAL_AUDIENCE:''},
    {...env,AUTH0_PORTAL_ALLOWED_CLIENT_IDS:''},
    {...env,AUTH0_ADMIN_ISSUER:P.iss},
    {...env,AUTH0_ADMIN_AUDIENCE:P.aud},
  ])await rejected(verify('portal',t,{config,fetcher:fixtureFetch()}));
});

test('JWKS refresh on unknown kid, single-flight concurrent load and fail-closed errors',async()=>{
  resetOidcJwksCacheForTests();const calls=[];const fetcher=fixtureFetch(undefined,undefined,calls);
  const jwt=token(portal,P);
  const actors=await Promise.all(Array.from({length:8},()=>verify('portal',jwt,{fetcher})));
  assert.equal(actors.length,8);assert.equal(calls.length,1);
  const rotated=makeKeys('rotated');let stage=0;
  const rotating=async()=>new Response(JSON.stringify({keys: stage++ === 0 ? [portal.jwk] : [rotated.jwk]}));
  resetOidcJwksCacheForTests();
  await verify('portal',jwt,{fetcher:rotating});
  assert.equal((await verify('portal',token(rotated,P),{fetcher:rotating})).subject,P.sub);assert.equal(stage,2);
  resetOidcJwksCacheForTests();await rejected(verify('portal',jwt,{fetcher:async()=>{throw Error('unavailable')}}));
  for(const keys of [[{...portal.jwk,d:'secret'}],[{...portal.jwk,kty:'EC'}],[{...portal.jwk,use:'enc'}],[{...portal.jwk,alg:'HS256'}],[{...portal.jwk,key_ops:['sign']}],[portal.jwk,portal.jwk]]){
    resetOidcJwksCacheForTests();await rejected(verify('portal',jwt,{fetcher:fixtureFetch(keys)}));
  }
});

test('denies duplicate JWT header and duplicate claim keys',async()=>{
  resetOidcJwksCacheForTests();
  const dupHeader=b64('{"alg":"RS256","kid":"portal-key","kid":"portal-key","typ":"JWT"}');
  const payload=b64(P);const sig=createSign('RSA-SHA256');sig.update(`${dupHeader}.${payload}`);
  await rejected(verify('portal',`${dupHeader}.${payload}.${sig.sign(portal.privateKey).toString('base64url')}`));
  const header=b64({alg:'RS256',kid:'portal-key',typ:'JWT'});
  const duplicate=b64(JSON.stringify(P).replace('"azp":','"sub":"oops","azp":'));
  const s=createSign('RSA-SHA256');s.update(`${header}.${duplicate}`);
  await rejected(verify('portal',`${header}.${duplicate}.${s.sign(portal.privateKey).toString('base64url')}`));
});

test('identity proof HTTP route returns non-PII context and generic unauthorized response',async()=>{
  resetOidcJwksCacheForTests();const jwt=token(portal,P);
  const res=await handleAuth0IdentityProof(request(jwt),env,'portal',{fetcher:fixtureFetch(),nowSeconds:now});
  assert.equal(res.status,200);
  assert.deepEqual(Object.keys(await res.json()),['actor']);
  assert.equal(res.headers.get('cache-control'),'no-store');
  const wrong=await handleAuth0IdentityProof(request(token(admin,A)),env,'portal',{fetcher:fixtureFetch(),nowSeconds:now});
  assert.equal(wrong.status,401);assert.equal((await wrong.json()).error.code,'unauthorized');
  const wrongMethod=await handleAuth0IdentityProof(new Request('https://worker.test/',{method:'POST'}),env,'portal');
  assert.equal(wrongMethod.status,405);
});
