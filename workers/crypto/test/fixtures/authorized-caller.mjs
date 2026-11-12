// Synthetic caller Worker used only by the Miniflare Service Binding proof.
// This is not a production control-plane route and is not referenced by Wrangler.
const PATH = "/__test/crypto";

function json(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" }
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname !== PATH || url.search) return json(404, { error: "not_found" });
    if (request.method !== "POST") return json(405, { error: "method_not_allowed" });

    const expectedUserToken = env?.SYNTHETIC_USER_TOKEN;
    if (typeof expectedUserToken !== "string" || expectedUserToken.length < 24) {
      return json(401, { error: "unauthorized" });
    }
    if (request.headers.get("authorization") !== "Bearer " + expectedUserToken) {
      return json(401, { error: "unauthorized" });
    }
    if (!env?.CRYPTO_SERVICE || typeof env.CRYPTO_SERVICE.fetch !== "function") {
      return json(503, { error: "crypto_service_unavailable" });
    }

    const internalRequest = new Request("https://crypto.internal/internal/v1/digests", {
      method: "POST",
      headers: {
        authorization: "Bearer " + (env.CONTROL_PLANE_CRYPTO_CALLER_TOKEN || ""),
        "x-flylink-internal-caller": "control-plane",
        "content-type": request.headers.get("content-type") || ""
      },
      body: await request.text()
    });
    return env.CRYPTO_SERVICE.fetch(internalRequest);
  }
};
