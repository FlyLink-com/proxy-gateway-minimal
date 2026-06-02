import assert from "node:assert/strict";
import test from "node:test";
import {
  bearerToken,
  createSubscriptionRouteResolver,
  publicBaseUrl
} from "../services/subscriptions/subscription-route-resolver.mjs";

function stateWithCore(core) {
  return {
    subscriptions: {
      core,
      publicSubscriptionBaseUrl: "https://sub.example.test/"
    }
  };
}

test("subscription route resolver normalizes artifact secrets and passes safe request context", async () => {
  let received;
  const resolver = createSubscriptionRouteResolver(stateWithCore({
    resolveSubscriptionArtifact: async (artifact, context) => {
      received = { artifact, context };
      return {
        ok: true,
        proxyConfig: { servers: [{ name: "stable", host: "127.0.0.1", port: 8388 }] }
      };
    }
  }));

  const result = await resolver.resolveArtifact({
    artifact: "pgart_abc.yaml",
    ip: "203.0.113.10",
    userAgent: "Mihomo/1.0"
  });

  assert.equal(result.ok, true);
  assert.equal(result.rawArtifact, "pgart_abc");
  assert.deepEqual(received, {
    artifact: "pgart_abc",
    context: {
      ip: "203.0.113.10",
      userAgent: "Mihomo/1.0"
    }
  });
});

test("subscription route resolver maps missing or failing artifact resolution without leaking details", async () => {
  const missingCore = createSubscriptionRouteResolver({ subscriptions: {} });
  assert.deepEqual(await missingCore.resolveArtifact({ artifact: "pgart_missing" }), {
    ok: false,
    status: 404,
    error: "Not found"
  });

  const emptyArtifact = createSubscriptionRouteResolver(stateWithCore({
    resolveSubscriptionArtifact: async () => {
      throw new Error("should not be called");
    }
  }));
  assert.deepEqual(await emptyArtifact.resolveArtifact({ artifact: "   " }), {
    ok: false,
    status: 404,
    error: "Not found"
  });

  const failingCore = createSubscriptionRouteResolver(stateWithCore({
    resolveSubscriptionArtifact: async () => {
      throw new Error("database path C:\\secret\\subscriptions.sqlite failed");
    }
  }));
  assert.deepEqual(await failingCore.resolveArtifact({ artifact: "pgart_broken" }), {
    ok: false,
    status: 500,
    error: "internal_error"
  });
});

test("subscription route resolver maps legacy token resolution without leaking failures", async () => {
  const unauthorized = createSubscriptionRouteResolver({ subscriptions: {} });
  assert.deepEqual(await unauthorized.resolveToken("pgsub_missing"), {
    ok: false,
    status: 401,
    error: "Unauthorized"
  });

  const failingCore = createSubscriptionRouteResolver(stateWithCore({
    resolveSubscriptionToken: async () => {
      throw new Error("token lookup failed for raw secret");
    }
  }));
  assert.deepEqual(await failingCore.resolveToken("pgsub_broken"), {
    ok: false,
    status: 500,
    error: "internal_error"
  });
});

test("subscription route helpers parse bearer tokens and configured public base URLs", () => {
  assert.equal(bearerToken("Bearer secret-token"), "secret-token");
  assert.equal(bearerToken("bearer spaced token"), "spaced token");
  assert.equal(bearerToken("Basic abc"), "");
  assert.equal(
    publicBaseUrl({
      configuredBaseUrl: "https://sub.example.test/",
      protocol: "http",
      host: "127.0.0.1:3456"
    }),
    "https://sub.example.test"
  );
  assert.equal(
    publicBaseUrl({
      configuredBaseUrl: "",
      protocol: "http",
      host: "127.0.0.1:3456"
    }),
    "http://127.0.0.1:3456"
  );
});
