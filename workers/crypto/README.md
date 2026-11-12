# FlyLink Crypto Worker — C2 local-only source slice

This Worker is the narrow cryptographic boundary approved by the C2 owner decision. It is source-only and not deployed.

## Boundaries

- The Worker exposes one internal POST contract at /internal/v1/digests.
- It is intended to be called only through a private Worker Service Binding. The caller must authenticate and authorize the original user/domain request before invoking it.
- The Worker additionally authenticates the calling Worker using a per-caller bearer secret and caller ID. Service Bindings do not propagate Cloudflare Access context.
- The Wrangler configuration disables workers.dev and preview URLs and declares no public routes.
- Three separate key-ring secret bindings are required: idempotency HMAC, provider-event HMAC and PII HMAC. All three are loaded and checked for cross-family key-material reuse on each request.
- Runtime bindings are named IDEMPOTENCY_HMAC_KEYRING_JSON, PROVIDER_EVENT_HMAC_KEYRING_JSON, PII_HMAC_KEYRING_JSON, and CRYPTO_CONTROL_PLANE_CALLER_TOKEN; CRYPTO_CONTROL_PLANE_CALLER_TOKEN_PREVIOUS is optional only during rotation overlap. These are binding names, not provisioned secrets.
- No raw key material is returned. Key rings are destroyed after each request on a best-effort basis.
- PII operations accept only the already-computed legacy SHA-256 digest. Raw email, IP and request-context values must never enter this Worker request body.
- No D1, KV, R2, Durable Object, queue, external fetch, logging or persistence is used.
- No Portal/Admin TOTP AES key or TOTP operation is exposed under the T1/Auth0-managed MFA direction.

## Local validation

From the repository root, run:

    node --test server/tests/d1-t2-crypto-worker.test.mjs

The test uses synthetic-only key material and caller tokens. It does not create Cloudflare resources or use production data.

The control-plane Service Binding and caller-side authorization wrapper are deliberately a separate next step. This first slice does not add a binding to the existing control-plane Worker.


## Service Binding proof

The Miniflare integration fixture is in workers/control-plane/test/crypto-service-binding.test.mjs and uses the synthetic-only caller at workers/crypto/test/fixtures/authorized-caller.mjs. It proves private binding mechanics and separate user/service credentials; it is not the actual control-plane integration. The existing G3 control-plane has no end-user/domain authorization context yet, so no binding or crypto relay route is added to its Wrangler config.
