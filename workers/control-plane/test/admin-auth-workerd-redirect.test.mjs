import test from "node:test";
import assert from "node:assert/strict";
import { createHash, createSign, generateKeyPairSync, randomBytes, webcrypto } from "node:crypto";
import { fileURLToPath } from "node:url";
import { Miniflare } from "miniflare";

const workerEntrypoint = fileURLToPath(new URL("../src/index.mjs", import.meta.url));
const issuer = "https://admin.example.test/";
const appOrigin = "https://admin.example.test";
const clientId = "adminClient123";
const audience = "https://api.admin.example.test/";
const claimUri = "https://flylink.example.test/mfa";
const portalIssuer = "https://portal.example.test/";
const portalAudience = "https://api.portal.example.test/";
const portalClientId = "portalClient123";
const portalKeys = generateKeyPairSync("rsa", { modulusLength: 2048 });
const portalJwk = {
  ...portalKeys.publicKey.export({ format: "jwk" }),
  kid: "workerd-portal-test-key",
  kty: "RSA",
  use: "sig",
  alg: "RS256",
  key_ops: ["verify"],
};

const idpWorkerScript = String.raw`
let state = {
  mode: "success",
  calls: { token: 0, jwks: 0, revoke: 0, followedRedirect: 0 },
};
function json(value, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/__test/config" && request.method === "POST") {
      const update = await request.json();
      state = {
        mode: update.mode || "success",
        calls: { token: 0, jwks: 0, revoke: 0, followedRedirect: 0 },
      };
      return json({ ok: true });
    }
    if (url.pathname === "/__test/state") return json(state);
    if (url.pathname === "/oauth/token") {
      state.calls.token += 1;
      if (state.mode === "token-redirect") {
        return new Response(null, { status: 302, headers: { location: "/oauth/token-target" } });
      }
      if (state.mode === "refresh-token") return json({ refresh_token: "synthetic-unexpected-refresh-token" });
      return json({});
    }
    if (url.pathname === "/.well-known/jwks.json") {
      state.calls.jwks += 1;
      if (state.mode === "jwks-redirect") {
        return new Response(null, { status: 302, headers: { location: "/.well-known/jwks-target" } });
      }
      return json({ keys: [] });
    }
    if (url.pathname === "/oauth/revoke") {
      state.calls.revoke += 1;
      return new Response(null, { status: 302, headers: { location: "/oauth/revoke-target" } });
    }
    if (url.pathname === "/oauth/token-target"
      || url.pathname === "/.well-known/jwks-target"
      || url.pathname === "/oauth/revoke-target") {
      state.calls.followedRedirect += 1;
      return json({ followed: true });
    }
    return json({ error: "not_found" }, 404);
  },
};
`;

function base64url(value) {
  return Buffer.from(value).toString("base64url");
}
function signedPortalToken() {
  const now = Math.floor(Date.now() / 1000);
  const header = base64url(JSON.stringify({ alg: "RS256", kid: "workerd-portal-test-key", typ: "JWT" }));
  const payload = base64url(JSON.stringify({
    iss: portalIssuer,
    sub: "auth0|synthetic-workerd-portal",
    aud: portalAudience,
    azp: portalClientId,
    scope: "read:portal_identity",
    iat: now - 1,
    exp: now + 600,
  }));
  const input = header + "." + payload;
  const signer = createSign("RSA-SHA256");
  signer.update(input);
  return input + "." + signer.sign(portalKeys.privateKey).toString("base64url");
}

async function createRuntime() {
  const txKey = base64url(randomBytes(32));
  const mf = new Miniflare({
    workers: [
      {
        name: "control-plane",
        modules: true,
        scriptPath: workerEntrypoint,
        compatibilityDate: "2025-06-01",
        durableObjects: { ADMIN_AUTH_STATE: "AdminAuthState" },
        outboundService: "idp",
        bindings: {
          AUTH0_ADMIN_ISSUER: issuer,
          AUTH0_ADMIN_CLIENT_ID: clientId,
          AUTH0_ADMIN_CLIENT_SECRET: "synthetic-workerd-client-secret",
          AUTH0_ADMIN_AUDIENCE: audience,
          AUTH0_ADMIN_REDIRECT_URI: appOrigin + "/v1/auth/admin/callback",
          ADMIN_APP_ORIGIN: appOrigin,
          AUTH0_ADMIN_ALLOWED_CLIENT_IDS: clientId,
          AUTH0_ADMIN_MFA_CLAIM: claimUri,
          AUTH0_ADMIN_TX_ENCRYPTION_KEY: txKey,
          AUTH0_PORTAL_ISSUER: portalIssuer,
          AUTH0_PORTAL_AUDIENCE: portalAudience,
          AUTH0_PORTAL_ALLOWED_CLIENT_IDS: portalClientId,
        },
      },
      {
        name: "idp",
        modules: true,
        script: idpWorkerScript,
        compatibilityDate: "2025-06-01",
      },
    ],
  });
  return { mf, control: await mf.getWorker("control-plane"), idp: await mf.getWorker("idp"), txKey };
}

async function setIdpMode(idp, mode) {
  const response = await idp.fetch("http://idp/__test/config", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ mode }),
  });
  assert.equal(response.status, 200);
}

// Seed a valid encrypted PKCE transaction in the test Durable Object, then
// dispatch the real callback route. This isolates callback transport behavior
// from browser-only Origin / Fetch-Metadata header generation.
async function dispatchAdminCallback(mf, control, idp, mode, txKey) {
  const state = base64url(randomBytes(32));
  const stateHash = createHash("sha256").update(state).digest("hex");
  const nonce = base64url(randomBytes(32));
  const verifier = base64url(randomBytes(32));
  const key = await webcrypto.subtle.importKey(
    "raw",
    Buffer.from(txKey, "base64url"),
    "AES-GCM",
    false,
    ["encrypt"],
  );
  const iv = randomBytes(12);
  const ciphertext = await webcrypto.subtle.encrypt(
    {
      name: "AES-GCM",
      iv,
      additionalData: new TextEncoder().encode("admin-auth-tx:" + stateHash),
      tagLength: 128,
    },
    key,
    new TextEncoder().encode(verifier),
  );
  const encryptedVerifier = base64url(iv) + "." + base64url(new Uint8Array(ciphertext));
  const namespace = await mf.getDurableObjectNamespace("ADMIN_AUTH_STATE", "control-plane");
  const stub = namespace.get(namespace.idFromName("tx:" + stateHash));
  const createdAt = Date.now();
  const seeded = await stub.fetch("https://admin-auth-state.internal/transaction/create", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      stateHash,
      nonce,
      encryptedVerifier,
      redirectUri: appOrigin + "/v1/auth/admin/callback",
      createdAt,
      expiresAt: createdAt + 5 * 60 * 1000,
    }),
  });
  assert.equal(seeded.status, 201, await seeded.text());
  await setIdpMode(idp, mode);
  const callbackUrl = appOrigin + "/v1/auth/admin/callback?code=synthetic-auth-code"
    + "&state=" + encodeURIComponent(state)
    + "&iss=" + encodeURIComponent(issuer);
  return control.fetch(callbackUrl, {
    redirect: "manual",
    headers: { cookie: "__Host-flylink_admin_oauth_state=" + state },
  });
}

function assertAdminSessionNotIssued(response) {
  const values = response.headers.getSetCookie?.() ?? [response.headers.get("set-cookie") ?? ""];
  const raw = values.join(", ");
  assert.match(raw, /__Host-flylink_admin_session=;\\s*Path=\\/;\\s*Max-Age=0\\b/);
  assert.doesNotMatch(raw, /__Host-flylink_admin_session=[^;,\\s]+;/);
}

async function idpState(idp) {
  const response = await idp.fetch("http://idp/__test/state");
  assert.equal(response.status, 200);
  return response.json();
}

test("workerd authorization-code exchange receives 3xx and existing !ok handling fails closed", async () => {
  const { mf, control, idp, txKey } = await createRuntime();
  try {
    const callback = await dispatchAdminCallback(mf, control, idp, "token-redirect", txKey);
    assert.equal(callback.status, 302);
    assert.equal(callback.headers.get("location"), appOrigin);
    const state = await idpState(idp);
    assert.equal(state.calls.token, 1);
    assert.equal(state.calls.followedRedirect, 0);
    assertAdminSessionNotIssued(callback);
  } finally {
    await mf.dispose();
  }
});

test("workerd JWKS fetch receives 3xx and existing !ok handling denies the token", async () => {
  const { mf, control, idp } = await createRuntime();
  try {
    await setIdpMode(idp, "jwks-redirect");
    const response = await control.fetch("https://portal.example.test/v1/auth/portal/identity", {
      redirect: "manual",
      headers: { authorization: "Bearer " + signedPortalToken() },
    });
    assert.equal(response.status, 401);
    assert.equal((await response.json()).error.code, "unauthorized");
    const state = await idpState(idp);
    assert.equal(state.calls.jwks, 1);
    assert.equal(state.calls.followedRedirect, 0);
  } finally {
    await mf.dispose();
  }
});

test("workerd unexpected Refresh Token revocation receives 3xx and fails closed", async () => {
  const { mf, control, idp, txKey } = await createRuntime();
  try {
    const callback = await dispatchAdminCallback(mf, control, idp, "refresh-token", txKey);
    assert.equal(callback.status, 302);
    assert.equal(callback.headers.get("location"), appOrigin);
    const state = await idpState(idp);
    assert.equal(state.calls.token, 1);
    assert.equal(state.calls.revoke, 1);
    assert.equal(state.calls.followedRedirect, 0);
    assertAdminSessionNotIssued(callback);
  } finally {
    await mf.dispose();
  }
});
